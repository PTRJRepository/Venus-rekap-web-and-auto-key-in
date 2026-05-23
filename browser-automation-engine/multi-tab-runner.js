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
    countEmployeeInputRows,
    findCrossTabInputRowSplits,
    duplicateInputRowKeys
} = require('./multi-tab-assignment');

const DEFAULT_TEMPLATE_NAME = 'attendance-input-loop';
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');
const DEFAULT_MAX_TABS = 8;
const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const TAB_STAGGER_DELAY = parsePositiveInt(process.env.MULTI_TAB_STAGGER_DELAY, 250);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isNavigationTransientError(error) {
    const message = error?.message || String(error || '');
    return /execution context was destroyed|cannot find context|navigation|frame was detached/i.test(message);
}

function safePageUrl(page) {
    try {
        return typeof page.url === 'function' ? page.url() : '';
    } catch (_) {
        return '';
    }
}

function useIsolatedTabSessions() {
    return process.env.MULTI_TAB_ISOLATED_SESSIONS === 'true';
}

function shouldBringTabToFrontOnTrigger() {
    return process.env.MULTI_TAB_BRING_TO_FRONT_ON_TRIGGER === 'true';
}

function shouldSkipRedundantTabNavigation() {
    return process.env.MULTI_TAB_SKIP_REDUNDANT_NAVIGATION !== 'false';
}

function normalizeUrlForCompare(url = '') {
    return String(url || '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
}

function isSamePageUrl(currentUrl, targetUrl) {
    return normalizeUrlForCompare(currentUrl) === normalizeUrlForCompare(targetUrl);
}

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
    const splitKeys = findCrossTabInputRowSplits(assignedTabs);

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
 * Activate a tab using CDP to prevent Chrome from throttling it.
 *
 * CRITICAL INSIGHT:
 * bringToFront() makes ONE tab the foreground tab and THROTTLES all others.
 * This causes tabs to run SEQUENTIALLY (Tab 1 waits while Tab 0 is throttled).
 *
 * Solution: DO NOT call bringToFront(). Instead, use CDP to force each tab
 * to appear "active" so Chrome doesn't throttle it.
 *
 * The visibility override + keep-alive loop (injected via browser-session.js)
 * already prevent Chrome's background tab throttling for JavaScript execution.
 * CDP calls here add an extra layer to prevent scheduling throttling.
 */
async function activateTab(page, tabIndex) {
    if (shouldBringTabToFrontOnTrigger()) {
        try {
            await page.bringToFront();
            await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (_) { /* not critical */ }
    }

    try {
        const cdp = await page.createCDPSession();

        // Try to disable scheduling throttling via CDP
        try {
            await cdp.send('Page.setWebKitForcePageScheduling', { pageId: 1, force: true });
        } catch (_) { /* not critical */ }

        // Make Chrome route focus-sensitive APIs for this target as if focused.
        try {
            await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        } catch (_) { /* not critical */ }

        // Patch visibility + signal active state
        try {
            await cdp.send('Runtime.evaluate', {
                expression: `
                    (function () {
                        // Keep visibility override active
                        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
                        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
                        Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
                        if (typeof Document !== 'undefined' && Document.prototype) {
                            Object.defineProperty(Document.prototype, 'hasFocus', { value: () => true, configurable: true });
                        }
                        window.focus = () => true;
                        document.__activeTab = true;
                        window.dispatchEvent(new Event('focus'));
                        document.dispatchEvent(new Event('visibilitychange'));
                        if (document.body) {
                            document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
                        }
                        // Touch DOM to signal activity
                        if (document.body) document.body.offsetHeight;
                        return true;
                    })();
                `,
                returnByValue: true
            });
        } catch (_) { /* not critical */ }

        await cdp.detach().catch(() => { });
    } catch (e) { /* ignore */ }

    emit('tab.activated', {
        tab_index: tabIndex,
        method: shouldBringTabToFrontOnTrigger() ? 'front+cdp' : 'cdp'
    });
}

async function openTabPage(session, tabIndex, targetUrl) {
    const page = tabIndex === 0 && session.page && !session.page.isClosed?.()
        ? session.page
        : await session.newPage();

    if (tabIndex === 0) {
        session.page = page;
    }

    console.log(`🧭 [Tab ${tabIndex + 1}] Membuka: ${targetUrl}`);
    emit('tab.open.started', { tab_index: tabIndex });

    try {
        if (shouldSkipRedundantTabNavigation() && isSamePageUrl(safePageUrl(page), targetUrl)) {
            console.log(`↷ [Tab ${tabIndex + 1}] Sudah di halaman target, skip reload`);
            emit('tab.open.skipped', { tab_index: tabIndex, reason: 'already_on_target' });
            return page;
        }
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`✅ [Tab ${tabIndex + 1}] Halaman dimuat`);
        emit('tab.open.done', { tab_index: tabIndex });
    } catch (e) {
        console.warn(`⚠️  [Tab ${tabIndex + 1}] Gagal muat: ${e.message}`);
        emit('tab.open.failed', { tab_index: tabIndex, message: e.message });
    }

    return page;
}

/**
 * Open all required tabs in parallel.
 * The first tab is the one already open from setup.
 */
async function openTabPages(session, tabCount, targetUrl) {
    return Promise.all(
        Array.from({ length: tabCount }, (_, tabIndex) => openTabPage(session, tabIndex, targetUrl))
    );
}

async function startTabSession(sessionId, freshLogin, tabIndex) {
    const session = new MillwareSession({
        sessionId,
        freshLoginFirst: freshLogin,
        loginFallback: true,
        headless: process.env.HEADLESS === 'true',
        slowMo: parseInt(process.env.SLOW_MO || '0', 10)
    });

    emit('session.starting', { session_id: sessionId, fresh_login: freshLogin, tab_index: tabIndex });
    await session.start();

    if (session.sessionReused) {
        console.log(`♻️  [SESSION Tab ${tabIndex + 1}] Session restored from disk`);
        emit('session.reused', { session_id: sessionId, session_path: session.getSessionPath(), tab_index: tabIndex });
    } else {
        console.log(`✅ [SESSION Tab ${tabIndex + 1}] Fresh login completed, session saved`);
        emit('session.login.done', { session_id: sessionId, session_path: session.getSessionPath(), tab_index: tabIndex });
    }

    return session;
}

async function startIsolatedTabSessions(baseSessionId, tabCount, freshLogin) {
    const sessions = [];

    for (let tabIndex = 0; tabIndex < tabCount; tabIndex++) {
        const sessionId = `${baseSessionId}-tab-${tabIndex + 1}`;
        sessions.push(await startTabSession(sessionId, freshLogin, tabIndex));
        if (tabIndex < tabCount - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    return sessions;
}

async function submitTaskRegisterTab(page, tabIndex, addedRows = 0) {
    if (!addedRows) {
        console.log(`💾 [Tab ${tabIndex + 1}] Save skipped: no new Add row recorded`);
        emit('tab.submit.skipped', { tab_index: tabIndex, reason: 'no_added_rows' });
        return { submitted: false, reason: 'no_added_rows' };
    }

    const selectors = ['#MainContent_btnSave', '#btnSave', 'input[id*="btnSave"]', 'button[id*="Save"]'];
    console.log(`💾 [Tab ${tabIndex + 1}] Saving ${addedRows} added row(s)...`);
    emit('tab.submit.started', { tab_index: tabIndex, added_rows: addedRows });

    const buttonInfo = await page.evaluate((selectors) => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && el.offsetParent !== null
                && !el.disabled;
        };
        for (const selector of selectors) {
            const el = Array.from(document.querySelectorAll(selector)).find(isVisible);
            if (el) {
                return {
                    found: true,
                    selector,
                    id: el.id || '',
                    value: el.value || '',
                    text: el.textContent || ''
                };
            }
        }
        return { found: false };
    }, selectors).catch((error) => ({
        found: false,
        error: error.message,
        transientNavigation: isNavigationTransientError(error)
    }));

    if (!buttonInfo.found) {
        const message = `Save button not found/enabled after ${addedRows} Add row(s)`;
        console.warn(`⚠️  [Tab ${tabIndex + 1}] ${message}`);
        emit('tab.submit.failed', { tab_index: tabIndex, message, button_info: buttonInfo });
        throw new Error(message);
    }

    const start = Date.now();
    const timeout = parseInt(process.env.TAB_SAVE_TIMEOUT || '30000', 10);
    const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout })
        .then(() => ({ success: true, status: 'navigation', elapsed_ms: Date.now() - start }))
        .catch(() => null);

    const clickResult = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return { success: false, reason: 'button disappeared' };
        const view = window;
        if (typeof el.focus === 'function') el.focus();
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view }));
        if (typeof el.click === 'function') el.click();
        else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view }));
        return { success: true };
    }, buttonInfo.selector).catch((error) => {
        if (isNavigationTransientError(error)) {
            return { success: true, transientNavigation: true };
        }
        return { success: false, reason: error.message };
    });

    if (!clickResult.success) {
        const message = `Save click failed: ${clickResult.reason}`;
        emit('tab.submit.failed', { tab_index: tabIndex, message });
        throw new Error(message);
    }

    const idlePromise = (async () => {
        while (Date.now() - start < timeout) {
            const state = await page.evaluate(() => {
                let asyncPostback = false;
                try {
                    const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
                    asyncPostback = Boolean(prm?.get_isInAsyncPostBack?.());
                } catch (_) { }
                const validationTexts = Array.from(document.querySelectorAll('span[id*="RFV"], span[style*="color:Red"], span[style*="color: red"], span.RedText'))
                    .filter((el) => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
                    })
                    .map((el) => el.textContent.trim())
                    .filter((text) => text && text !== '*' && /please|required|select|invalid|harus|wajib/i.test(text));
                return {
                    readyState: document.readyState,
                    asyncPostback,
                    url: window.location.href,
                    validationTexts
                };
            }).catch((error) => {
                if (isNavigationTransientError(error)) {
                    return {
                        readyState: 'loading',
                        asyncPostback: true,
                        validationTexts: [],
                        transientNavigation: true,
                        url: safePageUrl(page),
                        message: error.message
                    };
                }
                return {
                    readyState: 'error',
                    asyncPostback: false,
                    validationTexts: [error.message],
                    url: safePageUrl(page)
                };
            });

            if (state.validationTexts?.length) {
                return {
                    success: false,
                    status: 'validation',
                    message: state.validationTexts.join(' | '),
                    elapsed_ms: Date.now() - start
                };
            }
            if (state.readyState !== 'loading' && !state.asyncPostback && Date.now() - start > 1200) {
                return { success: true, status: 'idle', url: state.url, elapsed_ms: Date.now() - start };
            }
            await sleep(250);
        }
        return { success: false, status: 'timeout', message: `Save not confirmed within ${timeout}ms`, elapsed_ms: Date.now() - start };
    })();

    const result = await Promise.race([navigationPromise, idlePromise]) || await idlePromise;
    if (!result.success) {
        const message = result.message || `Save failed: ${result.status}`;
        console.warn(`⚠️  [Tab ${tabIndex + 1}] ${message}`);
        emit('tab.submit.failed', { tab_index: tabIndex, message, status: result.status });
        throw new Error(message);
    }

    console.log(`✅ [Tab ${tabIndex + 1}] Save confirmed (${result.status}, ${result.elapsed_ms || 0}ms)`);
    emit('tab.submit.completed', { tab_index: tabIndex, status: result.status, elapsed_ms: result.elapsed_ms || 0 });
    return { submitted: true, ...result };
}

/**
 * Execute automation for a single tab.
 * Execute one tab. Trigger timing is controlled by runTabsWithInterval().
 */
async function runTab(tabIndex, employees, page, data, split, session, templateName) {
    if (employees.length === 0) {
        emit('tab.completed', { tab_index: tabIndex, status: 'skipped', done: 0, failed: 0, skipped: employees.length, total: 0 });
        return { tabIndex, employees: 0, status: 'skipped' };
    }

    const engine = new AutomationEngine(engineOptions(`tab_${tabIndex + 1}`));
    engine.browser = session.browser;
    engine.page = page;
    engine.session = session;
    engine.disableBrowserRecycle = true;
    engine.recoveryManager.clearState();

    const tabData = {
        ...data,
        metadata: { ...(data.metadata || {}) },
        data: employees
    };
    tabData.metadata.deferEmployeeSyncVerification = process.env.MULTI_TAB_DEFER_SYNC_VERIFY !== 'false';
    const tabContext = {
        data: tabData,
        metadata: tabData.metadata
    };

    await activateTab(page, tabIndex);

    // === PARALLEL EXECUTION ===
    console.log(`▶️  [Tab ${tabIndex + 1}] Mulai proses ${employees.length} employee(s)`);
    emit('tab.started', { tab_index: tabIndex, employee_count: employees.length });

    const tabStats = { done: 0, failed: 0, skipped: 0, total: employees.length };

    try {
        await engine.executeSteps([split.loopStep], tabContext);
        const addedRows = Number(tabContext.metadata?.addedRows || 0);
        await submitTaskRegisterTab(page, tabIndex, addedRows);
        if (tabContext.metadata?.deferEmployeeSyncVerification) {
            await engine.executeSteps([{ action: 'verifyDeferredEmployeeSync', params: {} }], tabContext);
        }
        tabStats.done = employees.length;
        console.log(`✅ [Tab ${tabIndex + 1}] ✅ Selesai (${employees.length} employee(s))`);
        emit('tab.completed', { tab_index: tabIndex, status: 'completed', added_rows: addedRows, ...tabStats });
        return { tabIndex, employees: employees.length, status: 'completed', addedRows };
    } catch (err) {
        tabStats.failed = employees.length;
        console.error(`❌ [Tab ${tabIndex + 1}] ❌ Gagal: ${err.message}`);
        emit('tab.completed', { tab_index: tabIndex, status: 'failed', error: err.message, ...tabStats });
        return { tabIndex, employees: employees.length, status: 'failed', error: err.message };
    }
}

async function runTabsWithInterval({ assignedTabs, pages, data, split, sessions, templateName, intervalMs = TAB_STAGGER_DELAY }) {
    const runningTabs = [];

    for (let tabIndex = 0; tabIndex < assignedTabs.length; tabIndex++) {
        if (tabIndex > 0) {
            console.log(`⏳ [Scheduler] Menunggu ${intervalMs}ms sebelum trigger Tab ${tabIndex + 1}...`);
            emit('tab.waiting', { tab_index: tabIndex, interval_ms: intervalMs });
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }

        console.log(`🚦 [Scheduler] Trigger Tab ${tabIndex + 1}/${assignedTabs.length}`);
        emit('tab.triggered', {
            tab_index: tabIndex,
            trigger_order: tabIndex + 1,
            interval_ms: intervalMs
        });

        runningTabs.push(
            runTab(
                tabIndex,
                assignedTabs[tabIndex],
                pages[tabIndex],
                data,
                split,
                sessions[tabIndex] || sessions[0],
                templateName
            )
        );
    }

    return Promise.all(runningTabs);
}

async function runMultiTab({ templateName, dataFilePath, requestedTabs, rowLimit }) {
    const data = loadJson(dataFilePath || DEFAULT_DATA_FILE);
    const maxTabs = DEFAULT_MAX_TABS;
    const plan = buildMultiTabRunPlan({ data, requestedTabs, maxTabs, rowLimit });
    const isolatedSessions = useIsolatedTabSessions();

    if (plan.employees.length === 0) {
        throw new Error('Data tidak memiliki employee untuk diproses.');
    }

    emit('run.started', {
        template: templateName,
        data_file: dataFilePath,
        requested_tabs: requestedTabs,
        max_tabs: maxTabs,
        employee_count: plan.employees.length,
        input_row_count: countEmployeeInputRows(plan.employees),
        actual_tabs: plan.actualTabs,
        stagger_delay_ms: TAB_STAGGER_DELAY,
        isolated_sessions: isolatedSessions
    });

    // ══════════════════════════════════════════════════════
    // 1. PREFLIGHT VALIDATION
    // ══════════════════════════════════════════════════════
    console.log('\n🔍 [PREFLIGHT] Memvalidasi data sebelum browser dibuka...');
    emit('preflight.started', {
        employee_count: plan.employees.length,
        input_row_count: countEmployeeInputRows(plan.employees)
    });

    // Check 1: duplicate input rows
    const duplicateKeys = duplicateInputRowKeys(plan.employees);
    if (duplicateKeys.length > 0) {
        const msg = `Duplicate input rows detected: ${duplicateKeys.slice(0, 5).join(', ')}${duplicateKeys.length > 5 ? ' ...' : ''}`;
        console.error(`❌ [PREFLIGHT] ${msg}`);
        emit('preflight.duplicate', { keys: duplicateKeys.slice(0, 10), total: duplicateKeys.length });
        throw new Error(msg);
    }
    emit('preflight.duplicate.ok', { duplicate_count: 0 });

    // Check 2: cross-tab input row splits. Same employee may be split by date,
    // but the same employee+date must never be assigned to multiple tabs.
    if (plan.splitKeys.length > 0) {
        const msg = `Input row terpecah antar tab: ${plan.splitKeys.join(', ')}`;
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
    console.log(`⚙️  Isolated : ${isolatedSessions ? 'ON (independent browser session per tab)' : 'OFF (shared browser session)'}`);
    console.log(`⚙️  Stagger  : ${TAB_STAGGER_DELAY}ms antar tab`);
    console.log(`📋 Employees: ${plan.employees.length}`);
    console.log(`📋 Input Rows: ${countEmployeeInputRows(plan.employees)}`);
    console.log(`🔐 Session  : ${sessionId} (fresh=${freshLogin})`);
    console.log('═'.repeat(70) + '\n');

    // Load template to get login steps
    const template = loadJson(path.join(__dirname, 'templates', `${templateName}.json`));
    const split = splitTemplateForMultiTab(template);

    let sessions = [];

    try {
        let pages;

        if (isolatedSessions) {
            console.log(`🔐 [SESSION] Menyiapkan ${plan.actualTabs} session mandiri...`);
            sessions = await startIsolatedTabSessions(sessionId, plan.actualTabs, freshLogin);
        } else {
            const session = await startTabSession(sessionId, freshLogin, 0);
            sessions = [session];
        }

        // ══════════════════════════════════════════════════════
        // 3. OPEN ALL TABS IN PARALLEL
        // ══════════════════════════════════════════════════════
        const targetUrl = split.lastSetupNavigateUrl ||
            (MILLWARE_CONFIG.baseUrl.replace(/\/$/, '') + MILLWARE_CONFIG.taskRegisterPage);

        console.log(`🧭 [SETUP] Membuka dan menyiapkan ${plan.actualTabs} tab dari session login yang sama...`);
        if (isolatedSessions) {
            pages = await Promise.all(
                sessions.map((session, tabIndex) => openTabPage(session, tabIndex, targetUrl))
            );
        } else {
            pages = await openTabPages(sessions[0], plan.actualTabs, targetUrl);
        }

        // Log assignment
        plan.assignedTabs.forEach((employees, index) => {
            const first = employees[0]?.PTRJEmployeeID || '-';
            const last = employees[employees.length - 1]?.PTRJEmployeeID || '-';
            const rowCount = countEmployeeInputRows(employees);
            const stagger = index > 0 ? ` (start @ +${index * TAB_STAGGER_DELAY}ms)` : ' (start @ 0ms)';
            console.log(`📌 [Tab ${index + 1}] ${employees.length} employee(s), ${rowCount} row(s): ${first} → ${last}${stagger}`);
            emit('tab.assigned', {
                tab_index: index,
                employee_count: employees.length,
                input_row_count: rowCount,
                first_emp_id: first,
                last_emp_id: last,
                stagger_ms: index * TAB_STAGGER_DELAY
            });
        });
        console.log('');

        // ══════════════════════════════════════════════════════
        // 4. TRIGGER TABS SEQUENTIALLY, THEN LET THEM RUN IN PARALLEL
        // ══════════════════════════════════════════════════════
        console.log(`▶️  [RUN] Trigger tab bertahap: Tab 1 lalu jeda ${TAB_STAGGER_DELAY}ms antar tab...\n`);

        const tabResults = await runTabsWithInterval({
            assignedTabs: plan.assignedTabs,
            pages,
            data,
            split,
            sessions,
            templateName,
            intervalMs: TAB_STAGGER_DELAY
        });

        // ══════════════════════════════════════════════════════
        // 5. SUBMIT ALL TABS
        // ══════════════════════════════════════════════════════
        if (split.cleanupSteps.length > 0) {
            console.log('\n🧹 [CLEANUP] Menjalankan langkah cleanup...');
            emit('cleanup.started', { step_count: split.cleanupSteps.length });

            // Create a temporary engine for cleanup using the first page
            const cleanupEngine = new AutomationEngine(engineOptions('cleanup'));
            cleanupEngine.browser = sessions[0].browser;
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
            input_rows: countEmployeeInputRows(plan.employees),
            total_processed: totalProcessed
        });

        return { success: true, tabs: plan.actualTabs, employees: plan.employees.length, results: tabResults };
    } finally {
        await Promise.all(sessions.map((session) => session.close().catch(() => {})));
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
    runTabsWithInterval,
    openTabPage,
    openTabPages,
    startIsolatedTabSessions,
    submitTaskRegisterTab,
    useIsolatedTabSessions,
    shouldBringTabToFrontOnTrigger,
    shouldSkipRedundantTabNavigation,
    isSamePageUrl,
    activateTab
};
