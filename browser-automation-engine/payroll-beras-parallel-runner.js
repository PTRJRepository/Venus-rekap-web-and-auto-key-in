/**
 * Payroll Beras Parallel Runner
 * Uses payroll-beras-input.json template and current_payroll_beras_data.json
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { applyBrowserWindow, getChromeWindowArgs, getDefaultViewport } = require('./browser-window');

const ENGINE_DIR = __dirname;
const DATA_FILE = path.join(ENGINE_DIR, 'testing_data', 'current_payroll_beras_data.json');
const TEMPLATE_FILE = path.join(ENGINE_DIR, 'templates', 'payroll-beras-input.json');

const MILLWARE_BASE = 'http://millwarep3.rebinmas.com:8003';
const USERNAME = process.env.MILLWARE_USER || 'adm075';
const PASSWORD = process.env.MILLWARE_PASS || 'adm075';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const log = (...args) => {
    const ts = new Date().toISOString().substring(11, 19);
    console.log(`[${ts}] ${args.join(' ')}`);
};

const loadData = () => {
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`Data file not found: ${DATA_FILE}`);
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

const loadBerasTemplate = () => {
    if (!fs.existsSync(TEMPLATE_FILE)) {
        throw new Error(`Template file not found: ${TEMPLATE_FILE}`);
    }
    return JSON.parse(fs.readFileSync(TEMPLATE_FILE, 'utf8'));
};

const parseArgs = (argv = process.argv.slice(2)) => {
    const args = {
        workers: 1,
        headless: process.env.HEADLESS === 'true',
        dryRun: false,
        positional: []
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--workers' || arg === '-w') args.workers = Math.max(1, parseInt(argv[++i] || '1', 10) || 1);
        else if (arg === '--headless' || arg === '-h') args.headless = true;
        else if (arg === '--dry-run' || arg === '--dry') args.dryRun = true;
        else if (arg === '--all') { /* ignore */ }
        else args.positional.push(arg);
    }

    return args;
};

const launchBrowser = async (workerIndex) => {
    const userDataDir = path.join(ENGINE_DIR, 'chrome_data', `beras_${Date.now()}_${workerIndex}`);
    const browser = await puppeteer.launch({
        headless: args.headless,
        userDataDir,
        defaultViewport: getDefaultViewport({ headless: args.headless }),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            ...getChromeWindowArgs(workerIndex)
        ]
    });
    const page = await browser.newPage();
    await applyBrowserWindow(page, { headless: args.headless });
    return { browser, page };
};

const login = async (page) => {
    await page.goto(`${MILLWARE_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1000);

    const username = await page.$('#txtUsername');
    if (!username) {
        // Already logged in or popup
        const ok = await page.$('#MainContent_btnOkay');
        if (ok) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
                ok.click()
            ]);
        }
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

    // Handle popup
    const ok = await page.$('#MainContent_btnOkay');
    if (ok) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
            ok.click()
        ]);
    }
};

const runTemplateStep = async (page, step, context) => {
    const { action, params, comment } = step;

    if (comment) {
        log(`  💬 ${comment}`);
    }

    switch (action) {
        case 'log':
            log(`     ${params.message}`);
            break;

        case 'navigate':
            await page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(500);
            break;

        case 'typeInput': {
            await page.waitForSelector(params.selector, { visible: true, timeout: 15000 });
            await page.click(params.selector, { clickCount: 3 });
            await page.keyboard.press('Backspace');

            let value = params.value || '';
            // Replace template variables
            for (const [key, val] of Object.entries(context)) {
                value = value.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(val));
            }

            // Type slowly
            const chars = value.split('');
            for (const char of chars) {
                await page.keyboard.type(char, { delay: 50 });
                await sleep(20);
            }

            await sleep(300);

            if (params.confirmKey) {
                await page.keyboard.press(params.confirmKey);
                await sleep(500);
            }
            break;
        }

        case 'click': {
            await page.waitForSelector(params.selector, { visible: true, timeout: 15000 });
            await page.click(params.selector);
            await sleep(300);
            break;
        }

        case 'wait':
            await sleep(params.duration || 1000);
            break;

        case 'waitForElement':
            await page.waitForSelector(params.selector, { visible: true, timeout: params.timeout || 10000 }).catch(() => null);
            break;

        case 'executeJavascript': {
            const script = params.script || '';
            let execScript = script;
            // Replace template variables
            for (const [key, val] of Object.entries(context)) {
                execScript = execScript.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(val).replace(/'/g, "\\'"));
            }
            await page.evaluate((script) => eval(script), execScript);
            await sleep(200);
            break;
        }

        case 'clickAndWaitForReload': {
            await page.waitForSelector(params.selector, { visible: true, timeout: 15000 });
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: params.timeout || 15000 }).catch(() => null),
                page.click(params.selector)
            ]);
            await sleep(500);
            break;
        }

        default:
            log(`     ⚠️ Unknown action: ${action}`);
    }
};

const processEmployee = async (page, employee, metadata, template, employeeIndex, totalEmployees) => {
    const isLast = employeeIndex === totalEmployees - 1;

    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`  👤 [${employeeIndex + 1}/${totalEmployees}] ${employee.employeeName} (${employee.ptrjId})`);

    const component = employee.components?.[0] || {};
    log(`  📋 TUNJANGAN BERAS`);
    log(`  💰 Input (SELISIH): Rp ${(component.venusAmount || 0).toLocaleString('id-ID')}`);
    log(`  📊 Original: Venus=Rp${(component.originalVenusAmount || 0).toLocaleString('id-ID')}, MW=Rp${(component.originalMillwareAmount || 0).toLocaleString('id-ID')}`);

    // Build context for template variables
    const context = {
        'employee.employeeName': employee.employeeName,
        'employee.ptrjId': employee.ptrjId,
        'employee.components.0.componentName': component.componentName || 'TUNJANGAN BERAS',
        'employee.components.0.venusAmount': component.venusAmount || 0,
        'employee.components.0.originalVenusAmount': component.originalVenusAmount || 0,
        'employee.components.0.originalMillwareAmount': component.originalMillwareAmount || 0,
        'employee.components.0.adCode': component.adCode || 'AL0011',
        'employee.components.0.adSearchKeyword': component.adSearchKeyword || 'BERAS',
        'employee.components.0.componentKey': component.componentKey || 'beras',
        'metadata.month': metadata.month,
        'metadata.year': metadata.year,
        'metadata.payrollDocDate': metadata.payrollDocDate,
        'isLast': isLast
    };

    // Navigate to AD Lists
    await page.goto(`${MILLWARE_BASE}/en/PR/trx/frmPrTrxADLists.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);

    // Click New
    await page.waitForSelector('#MainContent_btnNew', { visible: true, timeout: 10000 });
    await page.click('#MainContent_btnNew');
    await sleep(1500);

    // Set DocDate via JavaScript
    await page.evaluate((docDate) => {
        const candidates = ['#MainContent_txtDocDate', 'input[id*=txtDocDate]'];
        const fields = candidates.flatMap(s => Array.from(document.querySelectorAll(s))).filter((el, i, arr) => arr.indexOf(el) === i);
        for (const el of fields) {
            el.value = docDate;
            el.setAttribute('value', docDate);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, metadata.payrollDocDate);

    // Input Employee
    await page.waitForSelector('#MainContent_ddlEmployee + input.ui-autocomplete-input', { visible: true, timeout: 10000 });
    await page.click('#MainContent_ddlEmployee + input.ui-autocomplete-input', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    const ptrjId = String(employee.ptrjId || '').split('');
    for (const char of ptrjId) {
        await page.keyboard.type(char, { delay: 50 });
        await sleep(20);
    }
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(1000);

    // Set DocDesc
    await page.evaluate(() => {
        const selectors = ['#MainContent_txtDocDesc', '#MainContent_txtDescription', '#MainContent_txtDesc'];
        const el = selectors.map(s => document.querySelector(s)).find(Boolean);
        if (el) {
            el.value = 'TUNJANGAN BERAS';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await sleep(300);

    // Input TaskCode (BERAS/AL0011)
    await page.waitForSelector('#MainContent_ddlTaskCode + input.ui-autocomplete-input', { visible: true, timeout: 10000 });
    await page.click('#MainContent_ddlTaskCode + input.ui-autocomplete-input', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    const searchKeyword = 'BERAS';
    for (const char of searchKeyword) {
        await page.keyboard.type(char, { delay: 50 });
        await sleep(20);
    }
    await sleep(800);
    await page.keyboard.press('Enter');
    await sleep(800);

    // Input Amount (SELISIH)
    await page.waitForSelector('#MainContent_txtAmount', { visible: true, timeout: 10000 });
    await page.click('#MainContent_txtAmount', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    const amount = String(component.venusAmount || 0);
    for (const char of amount) {
        await page.keyboard.type(char, { delay: 30 });
    }
    await sleep(300);

    // Click Add
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
        page.click('#MainContent_btnAdd')
    ]);
    await sleep(1000);

    // Click Save
    await page.click('#MainContent_btnSave');
    await sleep(2000);

    log(`  ✅ Saved: ${employee.employeeName} - Rp ${(component.venusAmount || 0).toLocaleString('id-ID')}`);
};

let args;

const main = async () => {
    args = parseArgs();

    log('═══════════════════════════════════════════════════════════════');
    log('  PAYROLL BERAS - SELISIH INPUT RUNNER');
    log(`  Mode: ${args.dryRun ? 'DRY RUN' : 'EXECUTE'}`);
    log(`  Headless: ${args.headless}`);
    log('═══════════════════════════════════════════════════════════════');

    const data = loadData();
    const { metadata, employees } = data;

    if (!employees || employees.length === 0) {
        log('⚠️ No beras data to process');
        return;
    }

    log(`📊 Total employees: ${employees.length}`);
    log(`📅 Period: ${metadata.month}/${metadata.year}`);
    log(`📄 DocDate: ${metadata.payrollDocDate}`);
    log(`⚠️ Input type: SELISIH (Venus - Millware)`);
    log('───────────────────────────────────────────────────────────────');

    if (args.dryRun) {
        log('🔍 DRY RUN MODE - Would process:');
        employees.forEach((emp, idx) => {
            const comp = emp.components?.[0] || {};
            log(`  ${idx + 1}. ${emp.employeeName} (${emp.ptrjId}): Rp ${(comp.venusAmount || 0).toLocaleString('id-ID')} (SELISIH)`);
        });
        log('═══════════════════════════════════════════════════════════════');
        return;
    }

    const results = [];
    let browser;

    try {
        const session = await launchBrowser(1);
        browser = session.browser;
        const page = session.page;

        await login(page);

        for (let i = 0; i < employees.length; i++) {
            try {
                await processEmployee(page, employees[i], metadata, null, i, employees.length);
                results.push({ ptrjId: employees[i].ptrjId, status: 'success' });
            } catch (error) {
                log(`  ❌ Error: ${error.message}`);
                results.push({ ptrjId: employees[i].ptrjId, status: 'error', error: error.message });

                // Try to recover
                try {
                    await page.goto(`${MILLWARE_BASE}/en/PR/trx/frmPrTrxADLists.aspx`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await sleep(1000);
                } catch (_) { /* recovery failed */ }
            }
        }
    } finally {
        if (browser) await browser.close().catch(() => null);
    }

    const success = results.filter(r => r.status === 'success').length;
    const errors = results.filter(r => r.status === 'error').length;

    log('═══════════════════════════════════════════════════════════════');
    log('  BERAS INPUT COMPLETE');
    log(`  Success: ${success}`);
    log(`  Errors: ${errors}`);
    log('═══════════════════════════════════════════════════════════════');

    return { success, errors, results };
};

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { main };