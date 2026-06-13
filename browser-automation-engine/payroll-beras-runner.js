const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { applyBrowserWindow, getChromeWindowArgs, getDefaultViewport } = require('./browser-window');

const DATA_FILE = path.join(__dirname, 'testing_data', 'current_payroll_beras_data.json');
const MILLWARE_BASE = 'http://millwarep3.rebinmas.com:8003';
const AD_LIST_URL = `${MILLWARE_BASE}/en/PR/trx/frmPrTrxADLists.aspx`;
const AD_DETAIL_URL = `${MILLWARE_BASE}/en/PR/trx/frmPrTrxADDets.aspx`;
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
    const dir = path.join(__dirname, 'logs', 'screenshots', 'payroll-beras');
    ensureDir(dir);
    const safe = String(label).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
    await page.screenshot({ path: path.join(dir, `${safe}_${Date.now()}.png`), fullPage: false }).catch(() => null);
};

const isRedirectLoopError = (error) => /ERR_TOO_MANY_REDIRECTS/i.test(error?.message || '');

const clearBrowserSession = async (page) => {
    let client = null;
    try {
        client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
    } catch (_) {
        // Best effort session cleanup.
    } finally {
        if (client) await client.detach().catch(() => null);
    }
};

const handleLoginPopup = async (page) => {
    const ok = await page.$('#MainContent_btnOkay').catch(() => null);
    if (!ok) return;
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
        ok.click()
    ]);
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
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
        page.click('#btnLogin')
    ]);
    await sleep(1000);
    await handleLoginPopup(page);
};

const navigateToListPage = async (page) => {
    try {
        await page.goto(AD_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (error) {
        if (!isRedirectLoopError(error)) throw error;
        log('Redirect loop while opening AD List; clearing browser session and retrying login');
        await clearBrowserSession(page);
        await sleep(1000);
        await login(page);
        await page.goto(AD_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await sleep(1000);
    if (await page.$('#txtUsername')) {
        await login(page);
        try {
            await page.goto(AD_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (error) {
            if (!isRedirectLoopError(error)) throw error;
            log('Redirect loop after login; clearing session and retrying AD List once');
            await clearBrowserSession(page);
            await sleep(1000);
            await login(page);
            await page.goto(AD_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        await sleep(1000);
    }
};

const setPayrollDocDate = async (page, docDate, expectedMonth) => {
    const candidates = ['#MainContent_txtDocDate', 'input[id*=txtDocDate]', 'input[id*=DocDate]'];
    const fields = candidates.flatMap(selector => Array.from(document.querySelectorAll(selector)))
        .filter((el, index, arr) => el && arr.indexOf(el) === index);

    if (!fields.length) {
        throw new Error('Payroll DocDate field not found; refusing to continue');
    }

    if (!docDate || !/^\d{2}\/\d{2}\/\d{4}$/.test(docDate)) {
        throw new Error('Payroll DocDate metadata invalid: ' + docDate);
    }

    const docMonth = docDate.slice(3, 5);
    if (docMonth !== expectedMonth) {
        throw new Error('Payroll DocDate month mismatch: ' + docDate + ' expected month ' + expectedMonth);
    }

    for (const el of fields) {
        el.value = docDate;
        el.setAttribute('value', docDate);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    const bad = fields.find(el => String(el.value || '').slice(3, 5) !== expectedMonth);
    if (bad) {
        throw new Error('Payroll DocDate field month mismatch after set: ' + bad.value + ' expected month ' + expectedMonth);
    }

    console.log('Payroll DocDate set to selected period month:', docDate);
};

const verifyPayrollDocDate = async (page, docDate, expectedMonth) => {
    const candidates = ['#MainContent_txtDocDate', 'input[id*=txtDocDate]', 'input[id*=DocDate]'];
    const fields = candidates.flatMap(selector => Array.from(document.querySelectorAll(selector)))
        .filter((el, index, arr) => el && arr.indexOf(el) === index);

    if (!fields.length) {
        throw new Error('Payroll DocDate field not found');
    }

    for (const el of fields) {
        if (String(el.value || '').slice(3, 5) !== expectedMonth) {
            el.value = docDate;
            el.setAttribute('value', docDate);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    }

    const bad = fields.find(el => String(el.value || '').slice(3, 5) !== expectedMonth);
    if (bad) {
        throw new Error('Payroll DocDate month mismatch: ' + bad.value + ' expected month ' + expectedMonth);
    }
};

const setAutocomplete = async (page, selector, value, options = {}) => {
    const { confirmKey = 'Enter', slowUntilSingle = true, slowValue = null } = options;

    await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    if (slowUntilSingle) {
        // Type slowly for autocomplete to work
        const chars = String(value).split('');
        for (const char of chars) {
            await page.keyboard.type(char, { delay: 50 });
            await sleep(30);
        }
    } else {
        await page.type(selector, String(value), { delay: 30 });
    }

    await sleep(500);

    // Press Enter or Tab to confirm
    await page.keyboard.press(confirmKey);
    await sleep(800);

    // Check if only one option remains and auto-select
    const singleOption = await page.evaluate((sel) => {
        const input = document.querySelector(sel);
        if (!input) return false;
        const wrapper = input.closest('.ui-autocomplete') || input.parentElement;
        if (!wrapper) return false;
        const menu = wrapper.querySelector('.ui-menu');
        if (!menu) return false;
        const items = menu.querySelectorAll('.ui-menu-item');
        return items.length === 1;
    }, selector);

    if (singleOption) {
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(500);
    }
};

const waitForNavigationOrReload = async (page, action, timeout = 20000) => {
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }).catch(() => null),
        action()
    ]);
};

const processBerasInput = async (page, employee, docDate, month) => {
    const ptrjId = employee.ptrjId;
    const empName = employee.employeeName;
    const component = employee.components?.[0] || {};

    // The shortfall amount to input (calculated from Venus - Millware)
    const shortfallAmount = component.inputAmount || component.venusAmount;
    const adCode = component.adCode || 'AL0011';
    const adSearchKeyword = component.adSearchKeyword || 'BERAS';

    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`  👤 Employee: ${empName} (${ptrjId})`);
    log(`  📋 Component: TUNJANGAN BERAS → ${adSearchKeyword} (${adCode})`);
    log(`  💰 Input Amount: Rp ${shortfallAmount.toLocaleString('id-ID')}`);
    if (component.venusAmount !== undefined && component.millwareAmount !== undefined) {
        log(`  📊 Venus: Rp ${component.venusAmount.toLocaleString('id-ID')}, Millware: Rp ${component.millwareAmount.toLocaleString('id-ID')}`);
    }
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Navigate to AD Lists
    await navigateToListPage(page);

    // Set accounting period
    await page.waitForSelector('#MainContent_txtAccMonth', { visible: true, timeout: 5000 }).catch(() => null);
    const monthField = await page.$('#MainContent_txtAccMonth');
    if (monthField) {
        await monthField.click({ clickCount: 3 });
        await monthField.type(String(month), { delay: 30 });
    }
    const yearField = await page.$('#MainContent_txtAccYear');
    if (yearField) {
        await yearField.click({ clickCount: 3 });
        await yearField.type(String(employee.year || '2026'), { delay: 30 });
    }

    // Click New
    await page.click('#MainContent_btnNew');
    await sleep(1500);

    // Verify we're on ADDET page
    await page.waitForSelector('#MainContent_ddlEmployee + input.ui-autocomplete-input', { visible: true, timeout: 10000 });

    // Set DocDate
    await setPayrollDocDate(page, docDate, String(month).padStart(2, '0'));

    // Input Employee
    await setAutocomplete(page, '#MainContent_ddlEmployee + input.ui-autocomplete-input', ptrjId);

    // Set DocDesc
    await page.evaluate(() => {
        const descSelectors = ['#MainContent_txtDocDesc', '#MainContent_txtDescription', '#MainContent_txtDesc'];
        const descField = descSelectors.map(s => document.querySelector(s)).find(Boolean);
        if (descField) {
            descField.value = 'TUNJANGAN BERAS';
            descField.dispatchEvent(new Event('input', { bubbles: true }));
            descField.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await sleep(300);

    // Input TaskCode (BERAS/AL0011)
    await setAutocomplete(page, '#MainContent_ddlTaskCode + input.ui-autocomplete-input', adSearchKeyword);
    await sleep(500);

    // Input Amount (the shortfall)
    await page.waitForSelector('#MainContent_txtAmount', { visible: true, timeout: 5000 });
    await page.click('#MainContent_txtAmount', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('#MainContent_txtAmount', String(shortfallAmount), { delay: 30 });
    await sleep(300);

    // Verify DocDate before Add
    await verifyPayrollDocDate(page, docDate, String(month).padStart(2, '0'));

    // Click Add
    await waitForNavigationOrReload(page, () => page.click('#MainContent_btnAdd'), 15000);
    await sleep(1000);

    // Verify DocDate before Save
    await verifyPayrollDocDate(page, docDate, String(month).padStart(2, '0'));

    // Click Save
    await page.click('#MainContent_btnSave');
    await sleep(2000);

    await snap(page, `beras-saved-${ptrjId}`);
    log(`  ✅ Saved: ${empName} - Rp ${shortfallAmount.toLocaleString('id-ID')}`);

    return {
        ptrjId,
        employeeName: empName,
        adCode,
        shortfallAmount,
        venusAmount: component.venusAmount,
        millwareAmount: component.millwareAmount,
        status: 'success'
    };
};

const launchBrowser = async (workerIndex) => {
    const headless = process.env.HEADLESS === 'true';
    const userDataDir = path.join(__dirname, 'chrome_data', `payroll_beras_${Date.now()}_${workerIndex}`);
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

const loadDataFile = () => {
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`Data file not found: ${DATA_FILE}`);
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

const parseArgs = (argv = process.argv.slice(2)) => {
    const args = {
        all: false,
        dryRun: false,
        workers: Math.max(1, parseInt(process.env.PAYROLL_BERAS_WORKERS || process.env.AUTOMATION_INSTANCES || '1', 10) || 1),
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

const runBerasAutomation = async (data, options = {}) => {
    const employees = data.employees || [];
    const metadata = data.metadata || {};
    const docDate = metadata.payrollDocDate || metadata.payrollDocDateFormatted || '31/05/2026';
    const month = String(metadata.month || '5').padStart(2, '0');
    const dryRun = Boolean(options.dryRun);

    if (employees.length === 0) {
        log('No beras employees to process');
        return { success: true, processed: 0, skipped: 0 };
    }

    log('═══════════════════════════════════════════════════════════════');
    log('  PAYROLL BERAS DIFFERENCE INPUT RUNNER');
    log(`  Month: ${month}/${metadata.year}`);
    log(`  Employees: ${employees.length}`);
    log(`  DryRun: ${dryRun}`);
    log('═══════════════════════════════════════════════════════════════');

    const results = [];
    let browser;

    try {
        const session = await launchBrowser(1);
        browser = session.browser;
        const page = session.page;

        await login(page);

        for (let i = 0; i < employees.length; i++) {
            const employee = employees[i];
            employee.year = metadata.year; // Add year for accounting period

            if (dryRun) {
                const component = employee.components?.[0] || {};
                log(`[DRY RUN] Would input beras for ${employee.employeeName} (${employee.ptrjId}): Rp ${(component.inputAmount || component.venusAmount || 0).toLocaleString('id-ID')}`);
                results.push({
                    ptrjId: employee.ptrjId,
                    employeeName: employee.employeeName,
                    status: 'dry-run'
                });
                continue;
            }

            try {
                const result = await processBerasInput(page, employee, docDate, month);
                results.push(result);
            } catch (error) {
                log(`  ❌ Error processing ${employee.employeeName}: ${error.message}`);
                await snap(page, `beras-error-${employee.ptrjId}`);
                results.push({
                    ptrjId: employee.ptrjId,
                    employeeName: employee.employeeName,
                    status: 'error',
                    error: error.message
                });

                // Try to recover - navigate back to AD Lists
                try {
                    await page.goto(AD_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await sleep(1000);
                } catch (_) {
                    // Recovery failed, continue to next
                }
            }
        }
    } finally {
        if (browser) await browser.close().catch(() => null);
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const dryRunCount = results.filter(r => r.status === 'dry-run').length;

    log('═══════════════════════════════════════════════════════════════');
    log('  BERAS INPUT COMPLETE');
    log(`  Success: ${successCount}`);
    log(`  Errors: ${errorCount}`);
    log(`  DryRun: ${dryRunCount}`);
    log('═══════════════════════════════════════════════════════════════');

    return {
        success: errorCount === 0,
        processed: successCount,
        errors: errorCount,
        dryRun: dryRunCount,
        results
    };
};

const main = async () => {
    const args = parseArgs();

    if (!args.all && args.positional.length === 0) {
        console.log('Usage: node payroll-beras-runner.js --all [--dry-run] [--workers 1]');
        console.log('');
        console.log('Data file: testing_data/current_payroll_beras_data.json');
        console.log('');
        console.log('Options:');
        console.log('  --all        Process all employees from data file');
        console.log('  --dry-run    Show what would be processed without actually inputting');
        console.log('  --workers N  Number of parallel browser instances (default: 1)');
        return;
    }

    try {
        const data = loadDataFile();
        const result = await runBerasAutomation(data, {
            dryRun: args.dryRun
        });

        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

if (require.main === module) {
    main();
}

module.exports = {
    runBerasAutomation,
    loadDataFile,
    parseArgs
};