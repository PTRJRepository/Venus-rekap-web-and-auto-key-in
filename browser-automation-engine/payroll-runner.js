const path = require('path');
const fs = require('fs');
const AutomationEngine = require('./engine');
const { runPayrollDryRun } = require('./payroll-dry-runner');

const DEFAULT_TEMPLATE = 'payroll-ad-input';
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_payroll_data.json');

const parseArgs = (argv = process.argv.slice(2)) => {
    const args = {
        templateName: DEFAULT_TEMPLATE,
        dataFile: DEFAULT_DATA_FILE,
        dryRunOnly: false,
        smokeBrowserOnly: false,
        rowLimit: 0,
        componentType: '',
        componentKey: '',
        engineId: 'payroll',
        headless: process.env.HEADLESS === 'true',
        autoClose: process.env.AUTO_CLOSE !== 'false'
    };

    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--dry-run' || arg === '--dryRun') {
            args.dryRunOnly = true;
        } else if (arg === '--smoke-browser') {
            args.smokeBrowserOnly = true;
        } else if (arg === '--row-limit') {
            args.rowLimit = Math.max(0, parseInt(argv[++i] || '0', 10) || 0);
        } else if (arg.startsWith('--row-limit=')) {
            args.rowLimit = Math.max(0, parseInt(arg.split('=')[1] || '0', 10) || 0);
        } else if (arg === '--component-type') {
            args.componentType = argv[++i] || '';
        } else if (arg.startsWith('--component-type=')) {
            args.componentType = arg.split('=')[1] || '';
        } else if (arg === '--component-key') {
            args.componentKey = argv[++i] || '';
        } else if (arg.startsWith('--component-key=')) {
            args.componentKey = arg.split('=')[1] || '';
        } else if (arg === '--engine-id') {
            args.engineId = argv[++i] || 'payroll';
        } else if (arg.startsWith('--engine-id=')) {
            args.engineId = arg.split('=')[1] || 'payroll';
        } else if (arg === '--headless') {
            args.headless = true;
        } else if (arg === '--no-headless') {
            args.headless = false;
        } else if (arg === '--keep-open') {
            args.autoClose = false;
        } else if (arg === '--auto-close') {
            args.autoClose = true;
        } else {
            positional.push(arg);
        }
    }

    if (positional[0]) {
        if (positional[0].endsWith('.json') || positional[0].includes('\\') || positional[0].includes('/')) {
            args.dataFile = positional[0];
        } else {
            args.templateName = positional[0];
            if (positional[1]) args.dataFile = positional[1];
        }
    }

    return args;
};

const loadPayrollPayload = (dataFile) => {
    return JSON.parse(fs.readFileSync(path.resolve(dataFile), 'utf8'));
};

const filterPayrollPayload = (payload, options = {}) => {
    const rowLimit = Math.max(0, parseInt(options.rowLimit || 0, 10) || 0);
    const componentType = String(options.componentType || '').trim().toLowerCase();
    const componentKey = String(options.componentKey || '').trim().toLowerCase();
    let remaining = rowLimit || Infinity;

    const employees = [];
    for (const employee of payload.employees || []) {
        const components = [];
        for (const component of employee.components || []) {
            if (componentType && String(component.type || '').toLowerCase() !== componentType) continue;
            if (componentKey && String(component.componentKey || '').toLowerCase() !== componentKey) continue;
            if (remaining <= 0) break;
            components.push(component);
            remaining -= 1;
        }

        if (components.length > 0) {
            employees.push({ ...employee, components });
        }

        if (remaining <= 0) break;
    }

    const totalComponents = employees.reduce((sum, employee) => sum + employee.components.length, 0);
    return {
        ...payload,
        metadata: {
            ...(payload.metadata || {}),
            totalEmployees: employees.length,
            totalComponents,
            filtered: Boolean(rowLimit || componentType || componentKey),
            filter: {
                rowLimit,
                componentType,
                componentKey
            }
        },
        employees
    };
};

const runPayrollAutomation = async (options = {}) => {
    const templateName = options.templateName || DEFAULT_TEMPLATE;
    const dataFile = path.resolve(options.dataFile || DEFAULT_DATA_FILE);
    const dryRunOnly = Boolean(options.dryRunOnly);
    const smokeBrowserOnly = Boolean(options.smokeBrowserOnly);
    const rowLimit = Math.max(0, parseInt(options.rowLimit || 0, 10) || 0);
    const componentType = String(options.componentType || '').trim();
    const componentKey = String(options.componentKey || '').trim();
    const engineId = String(options.engineId || 'payroll').trim() || 'payroll';
    const headless = options.headless !== undefined ? options.headless : process.env.HEADLESS === 'true';
    const autoClose = options.autoClose !== undefined ? options.autoClose : process.env.AUTO_CLOSE !== 'false';

    console.log('='.repeat(70));
    console.log('PAYROLL MONTHLY ALLOWANCE/DEDUCTION RUNNER');
    console.log('='.repeat(70));
    console.log(`Template: ${templateName}`);
    console.log(`Data file: ${dataFile}`);
    console.log(`Headless: ${headless ? 'true' : 'false'}`);
    console.log(`Auto close: ${autoClose ? 'true' : 'false'}`);

    const rawPayload = loadPayrollPayload(dataFile);
    const payload = filterPayrollPayload(rawPayload, { rowLimit, componentType, componentKey });
    const dryRun = runPayrollDryRun(dataFile, { quiet: true, payload });
    if (!dryRun.success) {
        console.log(`Dry-run validation failed (${dryRun.errors.length} error(s))`);
        dryRun.errors.forEach(error => console.log(`ERROR ${error}`));
        return {
            success: false,
            phase: 'dry-run',
            ...dryRun
        };
    }

    console.log(`Dry-run OK: ${dryRun.employeeCount} employees, ${dryRun.rowCount} AD row(s)`);
    if (dryRunOnly) {
        return {
            success: true,
            phase: 'dry-run',
            ...dryRun
        };
    }

    const engine = new AutomationEngine({
        engineId,
        headless,
        screenshot: true,
        userDataDir: path.join(__dirname, 'chrome_data', engineId)
    });

    // Payroll AD Lists must not use attendance loop recycling semantics.
    engine.disableBrowserRecycle = true;

    try {
        if (smokeBrowserOnly) {
            await engine.launch();
            const page = engine.page;
            console.log('Smoke browser: login and navigate to AD Lists only.');
            await page.goto('http://millwarep3.rebinmas.com:8003/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForSelector('#txtUsername', { visible: true, timeout: 15000 });
            await page.type('#txtUsername', 'adm075');
            await page.type('#txtPassword', 'adm075');
            await Promise.all([
                page.click('#btnLogin'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
            ]);
            await page.waitForSelector('#MainContent_btnOkay', { visible: true, timeout: 15000 });
            await Promise.all([
                page.click('#MainContent_btnOkay'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
            ]);
            await page.goto('http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxADLists.aspx', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForSelector('#MainContent_btnNew', { visible: true, timeout: 20000 });
            console.log('Smoke browser OK: AD Lists page ready, no data input performed.');
            return {
                success: true,
                phase: 'smoke-browser',
                employeeCount: dryRun.employeeCount,
                rowCount: dryRun.rowCount
            };
        }

        await engine.runTemplate(templateName, {
            ...payload,
            data: payload,
            metadata: payload.metadata
        });
        return {
            success: true,
            phase: 'automation',
            employeeCount: dryRun.employeeCount,
            rowCount: dryRun.rowCount
        };
    } finally {
        if (autoClose && engine.browser) {
            await engine.closeBrowser().catch(() => {});
            console.log('Browser closed.');
        } else {
            console.log('Browser left open by configuration.');
        }
    }
};

if (require.main === module) {
    runPayrollAutomation(parseArgs())
        .then(result => {
            console.log(result.success ? 'PAYROLL RUNNER COMPLETED' : 'PAYROLL RUNNER FAILED');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error(`PAYROLL RUNNER ERROR: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = {
    DEFAULT_TEMPLATE,
    DEFAULT_DATA_FILE,
    parseArgs,
    runPayrollAutomation
};
