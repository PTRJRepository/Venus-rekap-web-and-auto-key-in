/**
 * multi-tab-runner.js
 *
 * Parallel tab automation runner with staggered tab activation.
 *
 * Architectural improvements from "Auto Key In Refactor":
 * - Session management (cookies saved/restored, 240-min expiry, auth marker validation)
 * - NDJSON event streaming to stdout for frontend consumption
 * - Preflight validation (duplicate keys, cross-tab employee splits) before browser opens
 *
 * Flow:
 *   1. Load data + template
 *   2. Preflight validation (duplicates + splits)
 *   3. Session start (restore or fresh login)
 *   4. Open all tabs in parallel
 *   5. Staggered parallel execution (all tabs active, staggered by TAB_STAGGER_DELAY)
 *   6. Submit tabs
 *   7. Report results
 */

const fs = require('fs');
const path = require('path');
const { emit } = require('./ndjson-emitter');
const AutomationEngine = require('./engine');
const { MillwareSession, MILLWARE_CONFIG } = require('./browser-session');
const {
    assignEmployeesToTabs,
    calculateActualTabCount,
    findCrossTabEmployeeSplits,
    duplicateInputRowKeys
} = require('./multi-tab-assignment');

const DEFAULT_TEMPLATE_NAME = 'attendance-input-loop';
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');
const DEFAULT_MAX_TABS = 8;
const TAB_STAGGER_DELAY = 1000; // 1 detik jeda antar tab saat activate

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
        throw new Error(`File tidak ditemukan: ${fullPath}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

/**
 * Extract template sections:
 *   setupSteps    — steps before the forEach loop (login, navigation)
 *   loopStep      — the forEach action wrapping the automation steps
 *   loopSteps     — steps inside the forEach loop
 *   cleanupSteps  — steps after the forEach loop
 */
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
    const lastSetupNavigate = [...setupSteps].reverse().find(
        (step) => step.action === 'navigate' && step.params?.url
    );

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
        engineId
    };
}

/**
 * Activate a tab by bringing it to front.
 * Chrome membutuhkan tab di-foreground untuk dapat menerima event/input secara reliable.
 */
async function activateTab(page, tabIndex) {
    try {
        await page.bringToFront();
        await new Promise((r) => setTimeout(r, 200));
        emit('tab.activated', { tab_index: tabIndex });
    } catch (e) {
        console.warn(`⚠️  [Tab ${tabIndex + 1}] Gagal bringToFront: ${e.message}`);
        emit('tab.activate.failed', { tab_index: tabIndex, message: e.message });
    }
}

/**
 * Open all required tabs in parallel.
 * The first tab is the one already open from setup.
 */
async function openTabPages(session, tabCount, targetUrl) {
    // First tab: reuse the page already logged in (session.page)
    // Subsequent tabs: create new pages in the same browser
    const pages = [session.page];

    const additionalTabPromises = [];
    for (let i = 1; i < tabCount; i++) {
        additionalTabPromises.push(
            (async () => {
                const page = await session.newPage();
                console.log(`🧭 [Tab ${i + 1}] Membuka: ${targetUrl}`);
                emit('tab.open.started', { tab_index: i });

                try {
                    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    console.log(`✅ [Tab ${i + 1}] Halaman dimuat`);
                    emit('tab.open.done', { tab_index: i });
                } catch (e) {
                    console.warn(`⚠️  [Tab ${i + 1}] Gagal muat: ${e.message}`);
                    emit('tab.open.failed', { tab_index: i, message: e.message });
                }

                return page;
            })()
        );
    }

    const newPages = await Promise.all(additionalTabPromises);
    return [...pages, ...newPages];
}

/**
 * Execute automation for a single tab.
 * Staggered activation: tab 0 = 0ms delay, tab 1 = 1000ms, tab 2 = 2000ms.
 * All tabs run in parallel after their individual stagger delay.
 */
async function runTab(tabIndex, employees, page, data, split, session, templateName) {
    if (employees.length === 0) {
        emit('tab.completed', { tab_index: tabIndex, status: 'skipped', done: 0, failed: 0, skipped: employees.length, total: 0 });
        return { tabIndex, employees: 0, status: 'skipped' };
    }

    const engine = new AutomationEngine(engineOptions(`tab_${tabIndex + 1}`));
    engine.browser = session.browser;
    engine.page = page;
    engine.disableBrowserRecycle = true;
    engine.recoveryManager.clearState();

    const tabData = {
        ...data,
        metadata: data.metadata || {},
        data: employees
    };
    const tabContext = {
        data: tabData,
        metadata: tabData.metadata
    };

    // === STAGGERED ACTIVATION ===
    const staggerDelay = tabIndex * TAB_STAGGER_DELAY;
    if (tabIndex > 0) {
        console.log(`⏳ [Tab ${tabIndex + 1}] Menunggu ${staggerDelay}ms sebelum activate...`);
        emit('tab.waiting', { tab_index: tabIndex, stagger_ms: staggerDelay });
        await new Promise((r) => setTimeout(r, staggerDelay));
    }

    await activateTab(page, tabIndex);

    // === PARALLEL EXECUTION ===
    console.log(`▶️  [Tab ${tabIndex + 1}] Mulai proses ${employees.length} employee(s)`);
    emit('tab.started', { tab_index: tabIndex, employee_count: employees.length });

    const tabStats = { done: 0, failed: 0, skipped: 0, total: employees.length };

    try {
        await engine.executeSteps([split.loopStep], tabContext);
        tabStats.done = employees.length;
        console.log(`✅ [Tab ${tabIndex + 1}] ✅ Selesai (${employees.length} employee(s))`);
        emit('tab.completed', { tab_index: tabIndex, status: 'completed', ...tabStats });
        return { tabIndex, employees: employees.length, status: 'completed' };
    } catch (err) {
        tabStats.failed = employees.length;
        console.error(`❌ [Tab ${tabIndex + 1}] ❌ Gagal: ${err.message}`);
        emit('tab.completed', { tab_index: tabIndex, status: 'failed', error: err.message, ...tabStats });
        return { tabIndex, employees: employees.length, status: 'failed', error: err.message };
    }
}

async function runMultiTab({ templateName, dataFilePath, requestedTabs, rowLimit }) {
    const data = loadJson(dataFilePath || DEFAULT_DATA_FILE);
    const maxTabs = DEFAULT_MAX_TABS;
    const plan = buildMultiTabRunPlan({ data, requestedTabs, maxTabs, rowLimit });

    if (plan.employees.length === 0) {
        throw new Error('Data tidak memiliki employee untuk diproses.');
    }

    emit('run.started', {
        template: templateName,
        data_file: dataFilePath,
        requested_tabs: requestedTabs,
        max_tabs: maxTabs,
        employee_count: plan.employees.length,
        actual_tabs: plan.actualTabs,
        stagger_delay_ms: TAB_STAGGER_DELAY
    });

    // ══════════════════════════════════════════════════════
    // 1. PREFLIGHT VALIDATION
    // ══════════════════════════════════════════════════════
    console.log('\n🔍 [PREFLIGHT] Memvalidasi data sebelum browser dibuka...');
    emit('preflight.started', { employee_count: plan.employees.length });

    // Check 1: duplicate input rows
    const duplicateKeys = duplicateInputRowKeys(plan.employees);
    if (duplicateKeys.length > 0) {
        const msg = `Duplicate input rows detected: ${duplicateKeys.slice(0, 5).join(', ')}${duplicateKeys.length > 5 ? ' ...' : ''}`;
        console.error(`❌ [PREFLIGHT] ${msg}`);
        emit('preflight.duplicate', { keys: duplicateKeys.slice(0, 10), total: duplicateKeys.length });
        throw new Error(msg);
    }
    emit('preflight.duplicate.ok', { duplicate_count: 0 });

    // Check 2: cross-tab employee splits
    if (plan.splitKeys.length > 0) {
        const msg = `Employee terpecah antar tab: ${plan.splitKeys.join(', ')}`;
        console.error(`❌ [PREFLIGHT] ${msg}`);
        emit('preflight.split', { keys: plan.splitKeys.slice(0, 10), total: plan.splitKeys.length });
        throw new Error(msg);
    }
    emit('preflight.split.ok', { split_count: 0 });
    emit('preflight.ok', { employee_count: plan.employees.length });

    console.log('✅ [PREFLIGHT] Semua validasi passed\n');

    // ══════════════════════════════════════════════════════
    // 2. SESSION MANAGEMENT
    // ══════════════════════════════════════════════════════
    const freshLogin = process.env.FRESH_LOGIN === 'true';
    const sessionId = `millware-${templateName}-${dataFilePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-20)}`;

    console.log('\n' + '═'.repeat(70));
    console.log('  🚀 MULTI-TAB AUTOMATION RUNNER (SESSION + PARALLEL + STAGGERED)');
    console.log('═'.repeat(70));
    console.log(`📂 Template  : ${templateName}`);
    console.log(`📂 Data     : ${dataFilePath}`);
    console.log(`⚙️  Tabs     : ${plan.actualTabs} (max: ${maxTabs})`);
    console.log(`⚙️  Stagger  : ${TAB_STAGGER_DELAY}ms antar tab`);
    console.log(`📋 Employees: ${plan.employees.length}`);
    console.log(`🔐 Session  : ${sessionId} (fresh=${freshLogin})`);
    console.log('═'.repeat(70) + '\n');

    emit('session.starting', { session_id: sessionId, fresh_login: freshLogin });

    // Load template to get login steps
    const template = loadJson(path.join(__dirname, 'templates', `${templateName}.json`));
    const split = splitTemplateForMultiTab(template);

    const session = new MillwareSession({
        sessionId,
        freshLoginFirst: freshLogin,
        loginFallback: true,
        headless: process.env.HEADLESS === 'true',
        slowMo: parseInt(process.env.SLOW_MO || '0', 10)
    });

    try {
        await session.start();

        if (session.sessionReused) {
            console.log('♻️  [SESSION] Session restored from disk (cookies valid, not expired)');
            emit('session.reused', { session_id: sessionId, session_path: session.getSessionPath() });
        } else {
            console.log('✅ [SESSION] Fresh login completed, session saved');
            emit('session.login.done', { session_id: sessionId, session_path: session.getSessionPath() });
        }

        // ══════════════════════════════════════════════════════
        // 3. OPEN ALL TABS IN PARALLEL
        // ══════════════════════════════════════════════════════
        const targetUrl = split.lastSetupNavigateUrl ||
            (MILLWARE_CONFIG.baseUrl.replace(/\/$/, '') + MILLWARE_CONFIG.taskRegisterPage);

        console.log(`🧭 [SETUP] Membuka ${plan.actualTabs - 1} tab tambahan...`);

        // First tab is already open (session.page after login)
        // Open remaining tabs in the same browser
        let pages = [session.page];
        for (let i = 1; i < plan.actualTabs; i++) {
            pages.push(await session.newPage());
        }

        // Log assignment
        plan.assignedTabs.forEach((employees, index) => {
            const first = employees[0]?.PTRJEmployeeID || '-';
            const last = employees[employees.length - 1]?.PTRJEmployeeID || '-';
            const stagger = index > 0 ? ` (start @ +${index * TAB_STAGGER_DELAY}ms)` : ' (start @ 0ms)';
            console.log(`📌 [Tab ${index + 1}] ${employees.length} employee(s): ${first} → ${last}${stagger}`);
            emit('tab.assigned', {
                tab_index: index,
                employee_count: employees.length,
                first_emp_id: first,
                last_emp_id: last,
                stagger_ms: index * TAB_STAGGER_DELAY
            });
        });
        console.log('');

        // ══════════════════════════════════════════════════════
        // 4. RUN ALL TABS IN PARALLEL (STAGGERED ACTIVATION)
        // ══════════════════════════════════════════════════════
        console.log('▶️  [RUN] Semua tab dimulai secara PARALEL...\n');

        const tabResults = await Promise.all(
            plan.assignedTabs.map((employees, tabIndex) =>
                runTab(tabIndex, employees, pages[tabIndex], data, split, session, templateName)
            )
        );

        // ══════════════════════════════════════════════════════
        // 5. SUBMIT ALL TABS
        // ══════════════════════════════════════════════════════
        if (split.cleanupSteps.length > 0) {
            console.log('\n🧹 [CLEANUP] Menjalankan langkah cleanup...');
            emit('cleanup.started', { step_count: split.cleanupSteps.length });

            // Create a temporary engine for cleanup using the first page
            const cleanupEngine = new AutomationEngine(engineOptions('cleanup'));
            cleanupEngine.browser = session.browser;
            cleanupEngine.page = pages[0];
            cleanupEngine.disableBrowserRecycle = true;

            const rootContext = {
                data: { ...data, data: plan.employees },
                metadata: data.metadata || {}
            };

            try {
                await cleanupEngine.executeSteps(split.cleanupSteps, rootContext);
                emit('cleanup.done', {});
            } catch (e) {
                console.warn(`⚠️  [CLEANUP] Gagal: ${e.message}`);
                emit('cleanup.failed', { message: e.message });
            }
        }

        // ══════════════════════════════════════════════════════
        // 6. REPORT RESULTS
        // ══════════════════════════════════════════════════════
        const completed = tabResults.filter((r) => r.status === 'completed');
        const failed = tabResults.filter((r) => r.status === 'failed');
        const skipped = tabResults.filter((r) => r.status === 'skipped');

        const totalProcessed = tabResults.reduce((sum, r) => sum + (r.employees || 0), 0);

        console.log('\n' + '═'.repeat(70));
        console.log('  📊 HASIL MULTI-TAB RUNNER');
        console.log('═'.repeat(70));
        console.log(`✅ Completed: ${completed.length} tab(s)`);
        if (failed.length > 0) {
            console.log(`❌ Failed:   ${failed.length} tab(s)`);
            failed.forEach(({ tabIndex, error }) => {
                console.error(`   Tab ${tabIndex + 1}: ${error}`);
            });
        }
        console.log(`⏭️  Skipped:  ${skipped.length} tab(s)`);
        console.log(`📋 Total employees diproses: ${totalProcessed}`);
        console.log('═'.repeat(70));

        if (failed.length > 0) {
            const errorSummary = failed.map(f => `Tab ${f.tabIndex + 1}: ${f.error}`).join('; ');
            emit('run.failed', { failed_tabs: failed.length, error_summary: errorSummary });
            throw new Error(`${failed.length} tab gagal.`);
        }

        emit('run.completed', {
            success: true,
            tabs: plan.actualTabs,
            employees: plan.employees.length,
            total_processed: totalProcessed
        });

        return { success: true, tabs: plan.actualTabs, employees: plan.employees.length, results: tabResults };
    } finally {
        await session.close().catch(() => {});
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
    DEFAULT_TEMPLATE_NAME,
    TAB_STAGGER_DELAY,
    buildMultiTabRunPlan,
    runFromCli,
    runMultiTab,
    splitTemplateForMultiTab,
    runTab,
    activateTab
};
