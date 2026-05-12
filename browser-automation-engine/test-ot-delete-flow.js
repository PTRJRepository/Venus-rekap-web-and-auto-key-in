/**
 * Non-destructive test runner for the OT delete flow.
 *
 * This runner exists to validate the real Millware navigation:
 * TaskRegisterList.aspx -> click DocID -> detail grid with Normal/OT rows.
 *
 * Usage:
 *   node test-ot-delete-flow.js --list [month] [year]
 *   node test-ot-delete-flow.js --inspect-search
 *   node test-ot-delete-flow.js --click <docId-or-doc-number> [month] [year]
 *   node test-ot-delete-flow.js --current [limit]
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const {
    login,
    navigateToListPage,
    collectDocTargetsFromList,
    processDocId,
    runFromDataFile,
    normalizeTarget
} = require('./delete-ot-runner');

const DATA_FILE = path.join(__dirname, 'testing_data', 'current_delete_data.json');

const createBrowser = async () => {
    const headless = process.env.HEADLESS === 'true';
    const browser = await puppeteer.launch({
        headless,
        userDataDir: path.join(__dirname, 'chrome_data', 'engine_1'),
        args: [
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--ignore-certificate-errors'
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    return { browser, page };
};

const readCurrentDeleteData = () => {
    if (!fs.existsSync(DATA_FILE)) return null;
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

const getLimitArg = (args) => {
    const limitArgIndex = args.findIndex((arg) => arg === '--limit');
    return limitArgIndex >= 0 ? parseInt(args[limitArgIndex + 1] || '0', 10) : 0;
};

const printUsage = () => {
    console.log(`
Usage:
  node test-ot-delete-flow.js --list [month] [year]
      Login, open Task Register list, print DocID links. No deletion.
      Add --limit N to stop after N DocIDs.

  node test-ot-delete-flow.js --inspect-search
      Print visible search inputs/buttons from Task Register list. No deletion.

  node test-ot-delete-flow.js --click <docId-or-doc-number> [month] [year]
      Login, open list, click matching DocID, print target OT rows. No deletion.

  node test-ot-delete-flow.js --current [limit]
      Load testing_data/current_delete_data.json and run dry-run flow.
      Use --limit N for all-list discovery.
`);
};

const main = async () => {
    const args = process.argv.slice(2);
    const mode = args[0];

    if (!mode || mode === '--help') {
        printUsage();
        return;
    }

    if (mode === '--current') {
        const positionalLimit = args[1] && !args[1].startsWith('--') ? parseInt(args[1], 10) : 0;
        const flagLimit = getLimitArg(args);
        await runFromDataFile({ dryRun: true, limit: flagLimit || positionalLimit || 0 });
        return;
    }

    const { browser, page } = await createBrowser();
    try {
        await login(page);

        if (mode === '--inspect-search') {
            await navigateToListPage(page);
            const controls = await page.evaluate(() => {
                const isVisible = (el) => {
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };
                const labelFor = (el) => {
                    const id = el.id || '';
                    const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
                    const previousText = el.closest('td')?.previousElementSibling?.textContent || '';
                    return (explicit?.textContent || previousText || '').trim().replace(/\s+/g, ' ');
                };
                const inputs = Array.from(document.querySelectorAll('input, select, textarea'))
                    .filter(isVisible)
                    .filter((el) => /doc|search|filter|month|year|date|no|id/i.test(`${el.id} ${el.getAttribute('name') || ''} ${el.getAttribute('placeholder') || ''} ${labelFor(el)}`))
                    .map((el) => ({
                        tag: el.tagName.toLowerCase(),
                        id: el.id || '',
                        name: el.getAttribute('name') || '',
                        type: el.getAttribute('type') || '',
                        value: el.value || '',
                        placeholder: el.getAttribute('placeholder') || '',
                        label: labelFor(el)
                    }));
                const buttons = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button, a'))
                    .filter(isVisible)
                    .map((el) => ({
                        tag: el.tagName.toLowerCase(),
                        id: el.id || '',
                        name: el.getAttribute('name') || '',
                        type: el.getAttribute('type') || '',
                        value: el.value || '',
                        text: (el.textContent || '').trim().replace(/\s+/g, ' '),
                        href: el.getAttribute('href') || ''
                    }))
                    .filter((el) => /search|filter|find|go|cari|doc|show|view|new/i.test(`${el.id} ${el.name} ${el.value} ${el.text}`));
                return { url: location.href, inputs, buttons };
            });
            console.log(JSON.stringify(controls, null, 2));
            return;
        }

        if (mode === '--list') {
            const month = args[1] ? parseInt(args[1], 10) : null;
            const year = args[2] ? parseInt(args[2], 10) : null;
            const limit = getLimitArg(args);
            const targets = await collectDocTargetsFromList(page, { month, year, limit });
            console.log(`Found ${targets.length} DocID target(s)`);
            targets.slice(0, 50).forEach((target, index) => {
                console.log(`${index + 1}. text=${target.docNumber || '-'} hrefId=${target.internalId || '-'} listPage=${target.listPage || '-'}`);
            });
            if (targets.length > 50) console.log(`... ${targets.length - 50} more`);
            return;
        }

        if (mode === '--click') {
            const targetValue = args[1];
            if (!targetValue) {
                throw new Error('Missing DocID. Usage: node test-ot-delete-flow.js --click <docId-or-doc-number> [month] [year]');
            }

            const month = args[2] ? parseInt(args[2], 10) : null;
            const year = args[3] ? parseInt(args[3], 10) : null;
            const currentData = readCurrentDeleteData();
            const metadata = currentData?.metadata || {};
            const category = metadata.category || 'ot';
            const employees = currentData?.employees || [];

            const result = await processDocId(page, normalizeTarget(targetValue), {
                month,
                year,
                category,
                employeeFilter: employees,
                dryRun: true
            });

            console.log(JSON.stringify(result, null, 2));
            return;
        }

        throw new Error(`Unknown mode: ${mode}`);
    } finally {
        await browser.close();
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
