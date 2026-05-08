const fs = require('fs');
const path = require('path');
const AutomationEngine = require('./engine');
const {
    assignEmployeesToTabs,
    calculateActualTabCount,
    findCrossTabEmployeeSplits
} = require('./multi-tab-assignment');

const DEFAULT_TEMPLATE_NAME = 'attendance-input-loop';
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');
const DEFAULT_MAX_TABS = 8;

function resolveTemplateAndData(argv = process.argv.slice(2)) {
    let templateName = DEFAULT_TEMPLATE_NAME;
    let dataFilePath = DEFAULT_DATA_FILE;

    const positional = argv.filter((arg) => !arg.startsWith('--'));
    const first = positional[0];
    const second = positional[1];

    if (first) {
        const templatePath = path.join(__dirname, 'templates', `${first}.json`);
        if (fs.existsSync(templatePath)) {
            templateName = first;
            dataFilePath = second || DEFAULT_DATA_FILE;
        } else {
            dataFilePath = first;
            templateName = second || DEFAULT_TEMPLATE_NAME;
        }
    }

    return { templateName, dataFilePath };
}

function loadJson(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File tidak ditemukan: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function splitTemplateForMultiTab(template) {
    const steps = Array.isArray(template?.steps) ? template.steps : [];
    const loopIndex = steps.findIndex((step) => {
        if (step?.action !== 'forEach') return false;
        const itemsPath = step.params?.items || step.params?.array;
        return itemsPath === 'data.data';
    });

    if (loopIndex < 0) {
        throw new Error('Template multi-tab harus memiliki action forEach dengan items "data.data".');
    }

    const setupSteps = steps.slice(0, loopIndex);
    const loopStep = steps[loopIndex];
    const cleanupSteps = steps.slice(loopIndex + 1);
    const lastSetupNavigate = [...setupSteps].reverse().find((step) => step.action === 'navigate' && step.params?.url);

    return {
        setupSteps,
        loopStep,
        loopSteps: loopStep.params?.steps || [],
        cleanupSteps,
        lastSetupNavigateUrl: lastSetupNavigate?.params?.url || ''
    };
}

function buildMultiTabRunPlan({ data, requestedTabs = DEFAULT_MAX_TABS, maxTabs = DEFAULT_MAX_TABS, rowLimit = null }) {
    const allEmployees = Array.isArray(data?.data) ? data.data : [];
    const limit = Number(rowLimit);
    const employees = Number.isFinite(limit) && limit > 0
        ? allEmployees.slice(0, limit)
        : allEmployees.slice();
    const actualTabs = calculateActualTabCount(requestedTabs, maxTabs, employees);
    const assignedTabs = assignEmployeesToTabs(employees, actualTabs);
    const splitKeys = findCrossTabEmployeeSplits(assignedTabs);

    return {
        actualTabs,
        assignedTabs,
        employees,
        splitKeys
    };
}

function engineOptions(engineId) {
    return {
        headless: process.env.HEADLESS === 'true',
        slowMo: parseInt(process.env.SLOW_MO || '0', 10),
        screenshot: process.env.SCREENSHOT !== 'false',
        inputBlocking: process.env.INPUT_BLOCKING === 'true',
        engineId,
        userDataDir: path.join(__dirname, 'chrome_data', 'multi_tab_shared')
    };
}

async function configureAdditionalPage(page) {
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
}

function createTabEngine(mainEngine, page, tabIndex) {
    const tabEngine = new AutomationEngine({
        ...engineOptions(`tab_${tabIndex + 1}`),
        userDataDir: null
    });
    tabEngine.browser = mainEngine.browser;
    tabEngine.page = page;
    tabEngine.disableBrowserRecycle = true;
    return tabEngine;
}

async function openTabPages(mainEngine, tabCount, targetUrl) {
    const pages = [mainEngine.page];

    for (let i = 1; i < tabCount; i++) {
        const page = await mainEngine.browser.newPage();
        await configureAdditionalPage(page);
        console.log(`🧭 [Tab ${i + 1}] Membuka halaman detail: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        pages.push(page);
    }

    return pages;
}

async function runMultiTab({ templateName, dataFilePath, requestedTabs, rowLimit }) {
    const data = loadJson(dataFilePath || DEFAULT_DATA_FILE);
    const mainEngine = new AutomationEngine(engineOptions('main'));
    const maxTabs = DEFAULT_MAX_TABS;
    const plan = buildMultiTabRunPlan({
        data,
        requestedTabs,
        maxTabs,
        rowLimit
    });

    if (plan.employees.length === 0) {
        throw new Error('Data tidak memiliki employee untuk diproses.');
    }
    if (plan.splitKeys.length > 0) {
        throw new Error(`Employee terpecah antar tab: ${plan.splitKeys.join(', ')}`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('  🚀 MULTI-TAB AUTOMATION RUNNER');
    console.log('═'.repeat(70));
    console.log(`📂 Template: ${templateName}`);
    console.log(`📂 Data: ${dataFilePath}`);
    console.log(`⚙️  Requested Tabs: ${requestedTabs}`);
    console.log(`⚙️  Actual Tabs: ${plan.actualTabs}`);
    console.log(`📋 Employees: ${plan.employees.length}`);
    console.log('═'.repeat(70) + '\n');

    try {
        await mainEngine.launch();
        const template = mainEngine.loadTemplate(templateName);
        const split = splitTemplateForMultiTab(template);
        const rootContext = {
            data: { ...data, data: plan.employees },
            metadata: data.metadata || {}
        };

        console.log('🔐 Menjalankan setup/login sekali di browser utama...');
        await mainEngine.executeSteps(split.setupSteps, rootContext);

        const targetUrl = split.lastSetupNavigateUrl || mainEngine.page.url();
        const pages = await openTabPages(mainEngine, plan.actualTabs, targetUrl);

        plan.assignedTabs.forEach((employees, index) => {
            const first = employees[0]?.PTRJEmployeeID || '-';
            const last = employees[employees.length - 1]?.PTRJEmployeeID || '-';
            console.log(`📌 [Tab ${index + 1}] Assigned ${employees.length} employee(s): ${first} → ${last}`);
        });

        const tabResults = await Promise.allSettled(plan.assignedTabs.map(async (employees, tabIndex) => {
            if (employees.length === 0) {
                return { tabIndex, employees: 0, status: 'skipped' };
            }

            const page = pages[tabIndex];
            const tabEngine = createTabEngine(mainEngine, page, tabIndex);
            tabEngine.recoveryManager.clearState();
            const tabData = {
                ...data,
                metadata: data.metadata || {},
                data: employees
            };
            const tabContext = {
                data: tabData,
                metadata: tabData.metadata
            };

            console.log(`▶️  [Tab ${tabIndex + 1}] Mulai proses ${employees.length} employee(s)`);
            await tabEngine.executeSteps([split.loopStep], tabContext);
            console.log(`✅ [Tab ${tabIndex + 1}] Selesai`);
            return { tabIndex, employees: employees.length, status: 'completed' };
        }));

        const failedTabs = tabResults
            .map((result, index) => ({ result, index }))
            .filter(({ result }) => result.status === 'rejected');

        if (split.cleanupSteps.length > 0) {
            await mainEngine.executeSteps(split.cleanupSteps, rootContext);
        }

        for (let i = 1; i < pages.length; i++) {
            await pages[i].close().catch(() => { });
        }

        if (failedTabs.length > 0) {
            failedTabs.forEach(({ result, index }) => {
                console.error(`❌ [Tab ${index + 1}] Failed: ${result.reason?.message || result.reason}`);
            });
            throw new Error(`${failedTabs.length} tab gagal.`);
        }

        return {
            success: true,
            tabs: plan.actualTabs,
            employees: plan.employees.length
        };
    } finally {
        mainEngine.stopHeartbeat();
        mainEngine.stopBrowserKeepalive();
        if (process.env.AUTO_CLOSE === 'true') {
            await mainEngine.closeBrowser().catch(() => { });
        }
    }
}

async function runFromCli() {
    require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

    const { templateName, dataFilePath } = resolveTemplateAndData();
    const requestedTabs = parseInt(
        process.env.MULTI_TAB_CONCURRENCY ||
        process.env.AUTOMATION_INSTANCES ||
        String(DEFAULT_MAX_TABS),
        10
    );
    const rowLimit = process.env.MULTI_TAB_ROW_LIMIT || process.env.ROW_LIMIT || null;

    try {
        await runMultiTab({
            templateName,
            dataFilePath,
            requestedTabs: Number.isFinite(requestedTabs) ? requestedTabs : DEFAULT_MAX_TABS,
            rowLimit
        });
        process.exit(0);
    } catch (error) {
        console.error('\n💥 Multi-tab runner failed:', error.message);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    runFromCli();
}

module.exports = {
    DEFAULT_MAX_TABS,
    buildMultiTabRunPlan,
    runFromCli,
    runMultiTab,
    splitTemplateForMultiTab
};
