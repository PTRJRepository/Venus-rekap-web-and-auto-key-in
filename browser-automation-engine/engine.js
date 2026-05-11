const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const actions = require('./actions');
const { captureErrorScreenshot } = require('./utils/selectors');
const RecoveryManager = require('./utils/recovery');
const { MILLWARE_CONFIG } = require('./browser-session');

class AutomationEngine {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.headless = options.headless !== undefined ? options.headless : false;
        this.slowMo = options.slowMo || 0;
        this.screenshot = options.screenshot !== undefined ? options.screenshot : true;
        this.inputBlocking = options.inputBlocking !== undefined ? options.inputBlocking : false;
        this.engineId = options.engineId || 'default';
        this.userDataDir = options.userDataDir || null; // Separate Chrome profile for parallel execution
        this.recoveryManager = new RecoveryManager(this.engineId);
        this.heartbeatInterval = null;
        this.browserDisconnected = false; // Track disconnect state
        this.lastDisconnectReason = null; // Track why disconnect occurred
        this.session = options.session || null;
    }

    /**
     * Update heartbeat file to indicate process is alive
     */
    heartbeat() {
        try {
            const heartbeatFile = path.join(__dirname, 'logs', `heartbeat_engine_${this.engineId}.json`);
            fs.writeFileSync(heartbeatFile, JSON.stringify({
                timestamp: Date.now(),
                pid: process.pid,
                engineId: this.engineId
            }));
        } catch (e) {
            // Ignore heartbeat errors
        }
    }

    /**
     * Start sending heartbeats
     */
    startHeartbeat() {
        this.heartbeat(); // Initial beat
        this.heartbeatInterval = setInterval(() => this.heartbeat(), 5000); // Every 5s
    }

    /**
     * Stop sending heartbeats
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Start browser keepalive mechanism dengan interval yang bisa dikonfigurasi
     * Mencegah browser disconnection selama operasi panjang dengan periodically evaluating page state
     * @param {number} intervalMs - Interval dalam ms (default: 2000)
     */
    startBrowserKeepalive(intervalMs = 2000) {
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
        }

        this.keepaliveInterval = setInterval(async () => {
            if (this.page && !this.browserDisconnected) {
                try {
                    // More aggressive keepalive - juga cek apakah page focused
                    await this.page.evaluate(() => {
                        // Keep page alive even when not focused
                        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
                        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
                        Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
                        if (typeof Document !== 'undefined' && Document.prototype) {
                            Object.defineProperty(Document.prototype, 'hasFocus', { value: () => true, configurable: true });
                        }
                        Date.now();
                    });
                } catch (e) {
                    // Connection may be lost, mark as disconnected
                    if (!this.browserDisconnected) {
                        console.log(`⚠️ [${this.engineId}] Keepalive failed: ${e.message}`);
                    }
                }
            }
        }, intervalMs); // Configurable interval

        console.log(`💓 [${this.engineId}] Browser keepalive started (${intervalMs}ms interval)`);
    }

    /**
     * Stop browser keepalive
     */
    stopBrowserKeepalive() {
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
            console.log(`💔 [${this.engineId}] Browser keepalive stopped`);
        }
    }

    /**
     * Attempt to reconnect browser after disconnection
     * @returns {boolean} true if reconnection succeeded
     */
    async reconnectBrowser() {
        if (!this.browserDisconnected) return true;

        console.log(`🔌 [${this.engineId}] Attempting to reconnect browser...`);

        try {
            // Close existing browser if still exists
            if (this.browser) {
                await this.browser.close().catch(() => { });
            }

            // Re-launch browser
            await this.launch();

            // Navigate back to the form detail page
            await this.page.goto(
                'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterDet.aspx',
                { waitUntil: 'domcontentloaded', timeout: 30000 }
            );

            // Wait for form to be ready
            await this.page.waitForSelector('.ui-autocomplete-input.CBOBox', { timeout: 15000 });

            this.browserDisconnected = false;
            console.log(`✅ [${this.engineId}] Browser reconnected successfully`);
            return true;
        } catch (error) {
            console.log(`❌ [${this.engineId}] Reconnection failed: ${error.message}`);
            return false;
        }
    }

    async recoverMillwareSession(reason = 'unknown') {
        if (!this.session || !this.page) {
            return false;
        }

        const targetUrl = MILLWARE_CONFIG.baseUrl.replace(/\/$/, '') + MILLWARE_CONFIG.taskRegisterPage;
        console.log(`🔐 [${this.engineId}] Recovering Millware session (${reason})...`);

        try {
            await this.session.recoverPageSession(this.page, targetUrl);
            await this.page.waitForSelector('.ui-autocomplete-input.CBOBox', { visible: true, timeout: 20000 });
            this.browserDisconnected = false;
            this.lastDisconnectReason = null;
            console.log(`✅ [${this.engineId}] Millware session recovered`);
            return true;
        } catch (error) {
            console.error(`❌ [${this.engineId}] Millware session recovery failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Script to show visual overlay and block input with Gatekeeper logic
     */
    static INPUT_BLOCKING_SCRIPT = `
        (function() {
            if (document.getElementById('__automation_overlay')) return;
            
            // 1. Create Visual Overlay (Pass-through)
            const overlay = document.createElement('div');
            overlay.id = '__automation_overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.1);z-index:999999;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;padding-bottom: 20px;';
            overlay.innerHTML = '<div style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:50px;font-family:Segoe UI, sans-serif;font-weight:600;box-shadow:0 4px 15px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">⛔</span><span>USER INPUT DISABLED - AUTOMATION RUNNING</span></div>';
            document.body.appendChild(overlay);

            // 2. Initialize Gatekeeper Flag
            window.__PUPPETEER_ACTING = false;

            // 3. Block Events
            const blockEvents = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'keypress', 'touchstart', 'touchmove', 'touchend', 'wheel'];
            
            window.__automationHandlers = [];
            
            const handler = (e) => {
                // GATEKEEPER: If Puppeteer is acting, let the event pass
                if (window.__PUPPETEER_ACTING) return;

                // Otherwise, BLOCK IT
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            };

            blockEvents.forEach(evt => {
                window.addEventListener(evt, handler, { capture: true, passive: false });
                window.__automationHandlers.push({ evt, handler });
            });
        })();
    `;

    /**
     * Script to remove visual overlay and unblock
     */
    static INPUT_UNBLOCKING_SCRIPT = `
        (function() {
            const overlay = document.getElementById('__automation_overlay');
            if (overlay) overlay.remove();
            
            if (window.__automationHandlers) {
                window.__automationHandlers.forEach(({ evt, handler }) => {
                    window.removeEventListener(evt, handler, { capture: true });
                });
                window.__automationHandlers = [];
            }
        })();
    `;

    /**
     * Enable input blocking on the current page
     */
    async enableInputBlocking() {
        if (!this.page || !this.inputBlocking) return;
        try {
            await this.page.evaluate(AutomationEngine.INPUT_BLOCKING_SCRIPT);
            console.log('🔒 Input blocking enabled (Gatekeeper Mode)');
        } catch (error) {
            console.error('⚠️ Failed to enable input blocking:', error.message);
        }
    }

    /**
     * Disable input blocking on the current page
     */
    async disableInputBlocking() {
        if (!this.page) return;
        try {
            await this.page.evaluate(AutomationEngine.INPUT_UNBLOCKING_SCRIPT);
            console.log('🔓 Input blocking disabled');
        } catch (error) {
            // Ignore errors
        }
    }

    /**
     * Open the gate for Puppeteer actions
     */
    async startPuppeteerAction() {
        if (!this.page || !this.inputBlocking) return;
        try {
            await this.page.evaluate(() => window.__PUPPETEER_ACTING = true);
        } catch (e) { }
    }

    /**
     * Close the gate after Puppeteer actions
     */
    async endPuppeteerAction() {
        if (!this.page || !this.inputBlocking) return;
        try {
            await this.page.evaluate(() => window.__PUPPETEER_ACTING = false);
        } catch (e) { }
    }

    /**
     * Memulai browser dengan optimasi resource untuk 5+ instances
     */
    async launch() {
        console.log(`🚀 [Engine ${this.engineId}] Meluncurkan Browser Chrome...`);

        // Baca konfigurasi dari environment untuk multi-instance
        const keepaliveInterval = parseInt(process.env.BROWSER_KEEPALIVE_INTERVAL || '2000');
        const maxMemoryMB = parseInt(process.env.CHROME_MEMORY_LIMIT || '0');

        const launchOptions = {
            headless: this.headless,
            slowMo: this.slowMo,
            defaultViewport: null,
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                // ==================== OPTIMASI RESOURCE UNTUK N+ INSTANCES ====================
                '--disable-dev-shm-usage', // Mencegah crash memori di container/low-ram
                '--disable-gpu', // Hemat resource GPU (penting untuk multi-instance)
                '--disable-software-rasterizer', // Matikan rasterisasi software
                '--no-first-run',
                '--no-zygote',
                '--disable-extensions', // Matikan ekstensi yang memakan RAM
                // ==================== NETWORK/FIREWALL OPTIMIZATION ====================
                '--no-proxy-server', // Jangan gunakan proxy (penting untuk server internal)
                '--proxy-server=direct://', // Direct connection bypass proxy
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-component-extensions-with-background-pages',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees,SitePerProcess,VizDisplayCompositor',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--disable-features=IsolateOrigins,site-per-process', // Kurangi isolation untuk hemat memory
                '--process-per-site', // Satu process per site (hemat memory)
                '--max_old_space_size=512', // Batasi V8 heap size
                '--memory-pressure-off', // Matikan deteksi memory pressure (hemat CPU)
                '--aggressive-cache-discard', // Buang cache lebih agresif untuk hemat memory
                '--disable-accelerated-video-decode', // Matikan hardware acceleration untuk video
                '--disable-sync', // Matikan Chrome sync
                '--disable-default-apps', // Jangan load default apps
                '--disable-popup-blocking', // Matikan popup blocking
                '--disable-prompt-on-repost',
                '--disable-hang-monitor',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-domain-reliability',
                '--disable-features=AudioServiceOutOfProcess,MediaRecorder',
                // ==================== SSL/TLS SETTINGS ====================
                '--ignore-certificate-errors', // Abaikan error sertifikat SSL
                '--ignore-ssl-errors', // Abaikan error SSL
                '--allow-running-insecure-content', // Allow HTTP content
            ]
        };

        // Add memory limit if specified
        if (maxMemoryMB > 0) {
            launchOptions.args.push(`--js-flags=--max-old-space-size=${maxMemoryMB}`);
            console.log(`  💾 Memory limit per instance: ${maxMemoryMB}MB`);
        }

        // Use separate user data directory for parallel execution
        if (this.userDataDir) {
            launchOptions.userDataDir = this.userDataDir;
            console.log(`  📂 Using Chrome profile: ${this.userDataDir}`);
        }

        this.browser = await puppeteer.launch(launchOptions);
        this.page = await this.browser.newPage();

        // ═══ PREVENT FOCUS/VISIBILITY THROTTLING ═══
        // Inject script to override visibility state so the page always thinks it is active
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
            if (typeof Document !== 'undefined' && Document.prototype) {
                Object.defineProperty(Document.prototype, 'hasFocus', { value: () => true, configurable: true });
            }
            window.focus = () => true;

            // Override RequestAnimationFrame to use standard setTimeout if throttled
            let lastTime = 0;
            window.requestAnimationFrame = function (callback) {
                const currTime = new Date().getTime();
                const timeToCall = Math.max(0, 16 - (currTime - lastTime));
                const id = window.setTimeout(function () { callback(currTime + timeToCall); }, timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
            window.cancelAnimationFrame = function (id) { clearTimeout(id); };
        });

        // ═══ CONNECTION MONITORING ═══
        this.browser.on('disconnected', () => {
            console.error(`❌ [E${this.engineId}] Browser disconnected!`);
            this.handleDisconnect('browser_disconnected');
        });

        this.page.on('error', (error) => {
            console.error(`❌ [E${this.engineId}] Page crashed:`, error.message);
            this.handleDisconnect('page_crash');
        });

        this.page.on('close', () => {
            console.warn(`⚠️ [E${this.engineId}] Page closed unexpectedly`);
            this.handleDisconnect('page_closed');
        });

        // Increase default timeouts for better stability
        this.page.setDefaultTimeout(60000); // 60s instead of 30s
        this.page.setDefaultNavigationTimeout(60000);
        console.log(`  ⏱️  Default timeout set to 60s`);
        // ═══ END CONNECTION MONITORING ═══

        // Set user agent agar tidak terdeteksi sebagai bot
        await this.page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Enable input blocking on page load/navigation
        if (this.inputBlocking) {
            this.page.on('domcontentloaded', async () => {
                await this.enableInputBlocking();
            });
        }

        // Start browser keepalive dengan interval dari environment variable
        this.startBrowserKeepalive(keepaliveInterval);

        // Start heartbeat
        this.startHeartbeat();

        console.log(`  ✅ Engine ${this.engineId} launched successfully`);
    }

    /**
     * Memuat dan memvalidasi template JSON
     */
    loadTemplate(templateName) {
        const templatePath = path.join(__dirname, 'templates', `${templateName}.json`);

        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template "${templateName}" tidak ditemukan di folder templates.`);
        }

        const rawTemplate = fs.readFileSync(templatePath, 'utf8');
        console.log(`📂 Loading template from: ${templatePath}`);
        const template = JSON.parse(rawTemplate);

        // Validasi struktur template
        if (!template.name || !template.steps || !Array.isArray(template.steps)) {
            throw new Error('Template tidak valid. Harus memiliki properti "name" dan "steps" (array).');
        }

        return template;
    }

    /**
     * Load data dari file JSON eksternal
     */
    loadData(dataPath) {
        const fullPath = path.isAbsolute(dataPath)
            ? dataPath
            : path.join(__dirname, dataPath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`Data file "${dataPath}" tidak ditemukan.`);
        }

        const rawData = fs.readFileSync(fullPath, 'utf8');
        return JSON.parse(rawData);
    }

    /**
     * Substitute variables dalam string dengan nilai dari context
     * Contoh: "${employee.name}" -> "John Doe"
     */
    substituteVariables(text, context) {
        if (typeof text !== 'string') return text;

        return text.replace(/\$\{([^}]+)\}/g, (match, path) => {
            const keys = path.split('.');
            let value = context;

            for (const key of keys) {
                if (value && typeof value === 'object') {
                    value = value[key];
                } else {
                    console.warn(`⚠️  [substituteVariables] Variable not found: \${${path}} (failed at key: "${key}")`);
                    console.warn(`   Available context keys: ${Object.keys(context).join(', ') || '(none)'}`);
                    return match; // Tidak ditemukan, kembalikan original
                }
            }

            const result = value !== undefined ? value : match;

            // Warning jika value undefined/null
            if (value === undefined || value === null) {
                console.warn(`⚠️  [substituteVariables] Variable \${${path}} resolved to ${value}`);
            }

            // console.log(`🔄 Substituted: \${${path}} -> "${result}"`);
            return result;
        });
    }

    /**
     * Substitute variables dalam params object
     */
    substituteParams(params, context) {
        if (!params) return params;

        // Handle arrays specially
        if (Array.isArray(params)) {
            return params.map(item => this.substituteParams(item, context));
        }

        // Handle objects
        if (typeof params === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(params)) {
                if (typeof value === 'string') {
                    result[key] = this.substituteVariables(value, context);
                } else if (value !== null && (typeof value === 'object' || Array.isArray(value))) {
                    result[key] = this.substituteParams(value, context);
                } else {
                    // For non-string values (numbers, booleans), check if they need substitution
                    // This handles cases where context value is directly assigned
                    result[key] = value;
                }
            }
            return result;
        }

        // Return primitives as-is
        return params;
    }

    /**
     * Menjalankan langkah-langkah dari template
     */
    async runTemplate(templateName, initialContext = {}) {
        try {
            this.startHeartbeat(); // START HEARTBEAT
            await this.launch();
            const template = this.loadTemplate(templateName);

            // Load data file jika dispesifikasi di template
            if (template.dataFile) {
                const loadedData = this.loadData(template.dataFile);
                initialContext = { ...initialContext, ...loadedData, data: loadedData };

                // Expose metadata to root context for easier access
                if (loadedData.metadata) {
                    initialContext.metadata = loadedData.metadata;
                }
            }

            console.log('================================================');
            console.log(`📝 Menjalankan Template: ${template.name}`);
            console.log(`📖 Deskripsi: ${template.description || 'Tidak ada deskripsi'}`);
            console.log('================================================\n');

            // Execute steps dengan context
            await this.executeSteps(template.steps, initialContext);

            console.log('\n================================================');
            console.log('✅ Semua langkah selesai dijalankan.');
            console.log('================================================\n');

        } catch (error) {
            console.error('\n❌ Terjadi kesalahan:', error.message);
            console.error('Stack:', error.stack);

            // Enterprise Feature: Ambil screenshot saat error
            if (this.screenshot && this.page) {
                await captureErrorScreenshot(this.page, error.message);
            }

            // Save state on crash
            this.recoveryManager.saveState({ status: 'CRASHED', error: error.message });

            throw error;
        } finally {
            this.stopHeartbeat(); // STOP HEARTBEAT
            // Uncomment jika ingin browser otomatis tertutup
            // if (this.browser) {
            //     await this.browser.close();
            //     console.log('🔒 Browser ditutup.');
            // }
        }
    }

    /**
     * Execute steps dengan support untuk looping dan context
     */
    async executeSteps(steps, context = {}, indent = 0) {
        const prefix = '  '.repeat(indent);

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];

            // ═══ CHECK CONNECTION HEALTH BEFORE CRITICAL ACTIONS ═══
            const criticalActions = ['typeInput', 'click', 'select', 'waitForElement', 'retryInputWithValidation'];
            if (this.page && criticalActions.includes(step.action)) {
                const isAlive = await this.isConnectionAlive();
                if (!isAlive) {
                    const recovered = await this.recoverMillwareSession(`before ${step.action}`);
                    if (recovered) {
                        console.log(`${prefix}✅ Session recovered before step ${i + 1} (${step.action}), continuing.`);
                    } else {
                    const errorMsg = `Browser connection lost before step ${i + 1} (${step.action})`;
                    console.error(`${prefix}❌ ${errorMsg}`);
                    console.error(`${prefix}   Last disconnect reason: ${this.lastDisconnectReason || 'unknown'}`);
                    throw new Error(errorMsg);
                }
                }
            }
            // ═══ END CONNECTION CHECK ═══

            // ═══ GLOBAL ERROR PAGE DETECTION (Session Timeout) ═══
            // User Request: If "ACCESS_CONTROLLER_ERR" appears, restart from Login.
            if (this.page) {
                const currentUrl = this.page.url();
                if (currentUrl.includes('ACCESS_CONTROLLER_ERR') ||
                    currentUrl.includes('frmErrorMessage.aspx') ||
                    currentUrl.includes('chrome-error://chromewebdata')) {

                    const errorMsg = '🛑 SESSION EXPIRED / REDIRECT ERROR detected! Triggering re-login recovery.';
                    console.error(`${prefix}${errorMsg}`);

                    const recovered = await this.recoverMillwareSession('error page detected');
                    if (!recovered) {
                        throw new Error('SESSION_EXPIRED_AUTO_RESTART');
                    }
                }
            }
            // ═══ END ERROR CHECK ═══

            // Substitute variables di params
            const substitutedParams = this.substituteParams(step.params, context);

            // DEBUG: Log value substitution for typeInput actions
            if (step.action === 'typeInput' && substitutedParams.value) {
                const originalValue = step.params?.value;
                console.log(`🔍 [Step ${i + 1}] typeInput value substitution:`);
                console.log(`   Original: "${originalValue}"`);
                console.log(`   Substituted: "${substitutedParams.value}"`);
                if (originalValue === substitutedParams.value) {
                    console.log(`   ⚠️  Value unchanged - may not be a variable or variable not found`);
                } else {
                    console.log(`   ✅ Variable substitution successful`);
                }
            }

            // --- SMART VALIDATION ---
            // Before executing, check if we can/should skip this step
            if (this.page && ['type', 'select'].includes(step.action)) {
                const validation = await this.recoveryManager.validateStep(this.page, step, substitutedParams);

                if (validation.shouldSkip) {
                    console.log(`${prefix}[Step ${i + 1}/${steps.length}] ${validation.reason}. Skipping action.`);
                    continue; // SKIP EXECUTION
                } else {
                    // Log why we are executing (e.g. "Field is empty")
                    console.log(`${prefix}[Step ${i + 1}/${steps.length}] Action: ${step.action} (${validation.reason})`);
                }
            } else {
                console.log(`${prefix}[Step ${i + 1}/${steps.length}] Action: ${step.action}`);
            }

            try {
                // Cek apakah aksi ada di modul actions
                if (actions[step.action]) {
                    // GATEKEEPER: Open the gate for Puppeteer
                    await this.startPuppeteerAction();

                    try {
                        await actions[step.action](this.page, substitutedParams, context, this);
                    } finally {
                        // GATEKEEPER: Close the gate immediately
                        await this.endPuppeteerAction();
                    }

                    // Save state after successful critical actions (optional optimization to avoid too many writes)
                    if (['type', 'click', 'select'].includes(step.action)) {
                        this.recoveryManager.saveState({ lastSuccessStepIndex: i, lastAction: step.action });
                    }

                } else {
                    throw new Error(`Aksi "${step.action}" tidak dikenali.`);
                }
            } catch (err) {
                console.error(`${prefix}⚠️ Error at step ${i + 1}: ${err.message}. Trying to recover/save state...`);
                this.recoveryManager.saveState({ failedStepIndex: i, error: err.message });
                throw err; // Re-throw to be caught by runTemplate
            }

            // No delay between steps for faster execution
            // Only wait for specific actions that need it (defined in template)
        }
    }

    /**
     * Handle browser disconnect event
     */
    handleDisconnect(reason) {
        console.error(`🔴 [E${this.engineId}] DISCONNECT: ${reason}`);
        this.browserDisconnected = true;
        this.lastDisconnectReason = reason;

        // Stop heartbeat to indicate problem
        this.stopHeartbeat();

        // Save state for potential recovery
        this.recoveryManager.saveState({
            status: 'DISCONNECTED',
            reason,
            timestamp: Date.now()
        });
    }

    /**
     * Check if browser connection is still alive
     */
    async isConnectionAlive() {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
            if (!this.browser || !this.browser.isConnected()) {
                console.log(`⚠️ [E${this.engineId}] Browser not connected`);
                return false;
            }

            if (!this.page) {
                console.log(`⚠️ [E${this.engineId}] Page not available`);
                return false;
            }

                const currentUrl = this.page.url();
                if (currentUrl.includes('chrome-error://chromewebdata')) {
                    console.log(`⚠️ [E${this.engineId}] Page is Chrome error page`);
                    return false;
                }

            // Quick health check: simple evaluate
            await this.page.evaluate(() => true);
            return true;
        } catch (error) {
                if (attempt < 2 && /Execution context was destroyed|navigation|Cannot find context/i.test(error.message)) {
                    console.log(`⚠️ [E${this.engineId}] Page is navigating, retrying health check...`);
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    continue;
                }
            console.log(`⚠️ [E${this.engineId}] Connection check failed:`, error.message);
            return false;
        }
        }

        return false;
    }

    /**
     * Menutup browser secara manual
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser ditutup.');
        }
    }
}

module.exports = AutomationEngine;
