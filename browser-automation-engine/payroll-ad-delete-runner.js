const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { applyBrowserWindow, getChromeWindowArgs, getDefaultViewport } = require('./browser-window');

const DATA_FILE = path.join(__dirname, 'testing_data', 'current_payroll_ad_delete_data.json');
const MILLWARE_BASE = 'http://millwarep3.rebinmas.com:8003';
const AD_LIST_URL = `${MILLWARE_BASE}/en/PR/trx/frmPrTrxADLists.aspx`;
const USERNAME = process.env.MILLWARE_USER || 'adm075';
const PASSWORD = process.env.MILLWARE_PASS || 'adm075';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const log = (...args) => {
    const ts = new Date().toISOString().substring(11, 19);
    console.log(`[${ts}] ${args.join(' ')}`);
};

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const snap = async (page, label) => {
    if (process.env.SCREENSHOT === 'false') return;
    const dir = path.join(__dirname, 'logs', 'screenshots', 'payroll-ad-delete');
    ensureDir(dir);
    const safe = String(label).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
    await page.screenshot({ path: path.join(dir, `${safe}_${Date.now()}.png`), fullPage: false }).catch(() => null);
};

const normalizeKey = (value) => String(value || '').trim().toUpperCase();

const waitForNavigationSoft = async (page, action, timeout = 15000) => {
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }).catch(() => null),
        action()
    ]);
};

const handleLoginPopup = async (page) => {
    const ok = await page.$('#MainContent_btnOkay').catch(() => null);
    if (!ok) return;
    await waitForNavigationSoft(page, () => ok.click(), 15000);
    await sleep(1000);
};

const login = async (page) => {
    await page.goto(`${MILLWARE_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1000);

    const username = await page.$('#txtUsername');
    if (!username) {
        await handleLoginPopup(page);
        return;
    }

    await page.click('#txtUsername', { clickCount: 3 });
    await page.type('#txtUsername', USERNAME, { delay: 30 });
    await page.click('#txtPassword', { clickCount: 3 });
    await page.type('#txtPassword', PASSWORD, { delay: 30 });
    await waitForNavigationSoft(page, () => page.click('#btnLogin'), 15000);
    await sleep(1000);
    await handleLoginPopup(page);
};

const navigateToListPage = async (page) => {
    await page.goto(AD_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1000);
    if (await page.$('#txtUsername')) {
        await login(page);
        await page.goto(AD_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(1000);
    }
};

const setInputValue = async (page, selector, value) => {
    await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(selector, String(value), { delay: 20 });
};

const searchDocId = async (page, docNumber) => {
    await navigateToListPage(page);
    await setInputValue(page, '#MainContent_txtDocID', docNumber);
    await snap(page, `ad-list-before-search-${docNumber}`);
    await waitForNavigationSoft(page, () => page.click('#MainContent_btnSearch'), 20000);
    await sleep(1200);
    await snap(page, `ad-list-search-${docNumber}`);
};

const parseListRows = async (page) => {
    return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tr'))
            .filter(row => row.querySelector('td') && !row.querySelector('th'));

        return rows.map((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll('td')).map(cell => (cell.textContent || '').trim());
            const anchors = Array.from(row.querySelectorAll('a'));
            const anchor = anchors.find(a => /frmPrTrxADDets\.aspx|__doPostBack/i.test(a.href || a.getAttribute('href') || '')) || anchors[0] || null;
            const href = anchor ? (anchor.href || anchor.getAttribute('href') || '') : '';
            const masterMatch = href.match(/[?&]MasterID=([^&#]+)/i);

            return {
                rowIndex,
                cells,
                linkId: anchor ? (anchor.id || '') : '',
                href,
                masterId: masterMatch ? decodeURIComponent(masterMatch[1]) : ''
            };
        }).filter(row => row.linkId || row.href || row.cells.some(Boolean));
    });
};

const rowMatchesTarget = (row, target) => {
    const keys = [
        target.docNumber,
        target.internalId,
        target.label
    ].map(normalizeKey).filter(Boolean);
    const rowKeys = [
        row.href,
        row.masterId,
        ...(row.cells || [])
    ].map(normalizeKey).filter(Boolean);

    return keys.some(key => rowKeys.some(rowKey => rowKey === key || rowKey.includes(key)));
};

const clickRow = async (page, row) => {
    if (row.linkId) {
        const selector = `#${String(row.linkId).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1')}`;
        await waitForNavigationSoft(page, () => page.click(selector), 20000);
    } else if (/^https?:\/\//i.test(row.href)) {
        await page.goto(row.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
        throw new Error('Matching AD row has no clickable link');
    }
    await sleep(1200);
};

const openTargetFromList = async (page, target) => {
    const rows = await parseListRows(page);
    const match = rows.find(row => rowMatchesTarget(row, target));
    if (!match) {
        throw new Error(`Target DocID not found in AD list: ${target.docNumber || target.label || target.internalId}`);
    }
    await clickRow(page, match);
};

const clickDelete = async (page, target, dryRun) => {
    const docLabel = target.docNumber || target.label || target.internalId;
    await page.waitForSelector('#MainContent_btnDelete', { visible: true, timeout: 15000 });
    await snap(page, `ad-detail-${docLabel}`);

    if (dryRun) {
        return { docId: docLabel, empCode: target.empCode || '', status: 'dry-run' };
    }

    const dialogMessages = [];
    const onDialog = async (dialog) => {
        dialogMessages.push(dialog.message());
        await dialog.accept().catch(() => null);
    };
    page.on('dialog', onDialog);

    try {
        await waitForNavigationSoft(page, () => page.click('#MainContent_btnDelete'), 25000);
        await sleep(1500);
    } finally {
        page.off('dialog', onDialog);
    }

    const url = page.url();
    const backToList = /frmPrTrxADLists\.aspx/i.test(url);
    await snap(page, `ad-after-delete-${docLabel}`);
    return {
        docId: docLabel,
        empCode: target.empCode || '',
        status: backToList ? 'deleted' : 'delete-clicked',
        url,
        dialogs: dialogMessages
    };
};

const normalizeTarget = (target) => ({
    internalId: String(target?.internalId || target?.id || target?.ID || '').trim(),
    docNumber: String(target?.docNumber || target?.DocID || target?.docId || '').trim(),
    label: String(target?.label || target?.docNumber || target?.DocID || target?.docId || target?.internalId || '').trim(),
    empCode: String(target?.empCode || target?.EmpCode || '').trim(),
    empName: String(target?.empName || target?.EmpName || '').trim()
});

const processTarget = async (page, target, options = {}) => {
    const normalized = normalizeTarget(target);
    const docNumber = normalized.docNumber || normalized.label || normalized.internalId;
    if (!docNumber) throw new Error('Empty DocID target');

    log(`Search AD DocID ${docNumber}`);
    await searchDocId(page, docNumber);
    await openTargetFromList(page, normalized);
    const result = await clickDelete(page, normalized, Boolean(options.dryRun));
    console.log(JSON.stringify(result));
    return result;
};

const partitionTargets = (targets, workers) => {
    const partitions = Array.from({ length: Math.max(1, workers) }, () => []);
    targets.forEach((target, index) => {
        partitions[index % partitions.length].push(target);
    });
    return partitions.filter(partition => partition.length > 0);
};

const launchBrowser = async (workerIndex) => {
    const headless = process.env.HEADLESS === 'true';
    const userDataDir = path.join(__dirname, 'chrome_data', `payroll_ad_delete_${Date.now()}_${workerIndex}`);
    const browser = await puppeteer.launch({
        headless,
        userDataDir,
        defaultViewport: getDefaultViewport({ headless }),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            ...getChromeWindowArgs(workerIndex)
        ]
    });
    const page = await browser.newPage();
    await applyBrowserWindow(page, { headless });
    return { browser, page };
};

const runParallel = async (targets, options = {}) => {
    const normalizedTargets = targets.map(normalizeTarget).filter(target => target.docNumber || target.internalId || target.label);
    const workers = Math.min(Math.max(1, parseInt(options.workers || 1, 10) || 1), normalizedTargets.length || 1);
    const partitions = partitionTargets(normalizedTargets, workers);
    const dryRun = Boolean(options.dryRun);
    const results = [];

    log(`PAYROLL AD DELETE RUNNER - targets=${normalizedTargets.length}, workers=${partitions.length}, dryRun=${dryRun}`);
    partitions.forEach((partition, index) => {
        log(`Worker ${index + 1}: ${partition.map(target => target.docNumber || target.label || target.internalId).join(', ')}`);
    });

    await Promise.all(partitions.map(async (partition, index) => {
        let browser;
        try {
            const session = await launchBrowser(index + 1);
            browser = session.browser;
            const page = session.page;
            await login(page);

            for (const target of partition) {
                try {
                    const result = await processTarget(page, target, { dryRun });
                    results.push({ ...result, worker: index + 1 });
                } catch (error) {
                    const label = target.docNumber || target.label || target.internalId;
                    const result = { docId: label, status: 'error', error: error.message, worker: index + 1 };
                    results.push(result);
                    console.error(JSON.stringify(result));
                    await snap(page, `ad-error-${label}`);
                }
            }
        } finally {
            if (browser) await browser.close().catch(() => null);
        }
    }));

    const deleted = results.filter(result => result.status === 'deleted' || result.status === 'delete-clicked').length;
    const dryRunCount = results.filter(result => result.status === 'dry-run').length;
    const errors = results.filter(result => result.status === 'error').length;
    log(`PAYROLL AD DELETE COMPLETE - deleted=${deleted}, dryRun=${dryRunCount}, errors=${errors}`);
    return results;
};

const loadDataFile = () => {
    if (!fs.existsSync(DATA_FILE)) throw new Error(`Data file not found: ${DATA_FILE}`);
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

const parseArgs = (argv = process.argv.slice(2)) => {
    const args = {
        all: false,
        dryRun: false,
        workers: Math.max(1, parseInt(process.env.PAYROLL_AD_DELETE_WORKERS || process.env.AUTOMATION_INSTANCES || '1', 10) || 1),
        positional: []
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--all') args.all = true;
        else if (arg === '--dry-run' || arg === '--dry') args.dryRun = true;
        else if (arg === '--workers' || arg === '--tabs' || arg === '--windows') args.workers = Math.max(1, parseInt(argv[++i] || '1', 10) || 1);
        else args.positional.push(arg);
    }

    return args;
};

const main = async () => {
    const args = parseArgs();
    if (args.all) {
        const data = loadDataFile();
        const metadata = data.metadata || {};
        await runParallel(data.docTargets || [], {
            dryRun: args.dryRun || Boolean(metadata.dryRun),
            workers: args.workers || metadata.windowCount || 1
        });
        return;
    }

    if (args.positional.length > 0) {
        await runParallel(args.positional.map(docId => ({ docNumber: docId, label: docId })), args);
        return;
    }

    console.log('Usage: node payroll-ad-delete-runner.js --all [--dry-run] [--workers 3]');
};

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    AD_LIST_URL,
    login,
    navigateToListPage,
    processTarget,
    runParallel,
    parseArgs
};
