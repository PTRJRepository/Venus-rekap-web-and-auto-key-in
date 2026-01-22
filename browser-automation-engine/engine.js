const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const actions = require('./actions');
const { captureErrorScreenshot } = require('./utils/selectors');
const RecoveryManager = require('./utils/recovery');

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
     * Memulai browser
     */
    async launch() {
        console.log(`🚀 [Engine ${this.engineId}] Meluncurkan Browser Chrome...`);

        const launchOptions = {
            headless: this.headless,
            slowMo: this.slowMo,
            defaultViewport: null,
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        };

        // Use separate user data directory for parallel execution
        if (this.userDataDir) {
            launchOptions.userDataDir = this.userDataDir;
            console.log(`  📂 Using Chrome profile: ${this.userDataDir}`);
        }

        this.browser = await puppeteer.launch(launchOptions);
        this.page = await this.browser.newPage();

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
                    // console.log(`⚠️  Variable not found: ${path} (failed at key: ${key})`);
                    return match; // Tidak ditemukan, kembalikan original
                }
            }

            const result = value !== undefined ? value : match;
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
            await this.launch();
            const template = this.loadTemplate(templateName);

            // Load data file jika dispesifikasi di template
            if (template.dataFile) {
                const loadedData = this.loadData(template.dataFile);
                initialContext = { ...initialContext, data: loadedData };
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

            // Substitute variables di params
            const substitutedParams = this.substituteParams(step.params, context);

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

            // Jeda kecil antar langkah agar lebih natural (opsional)
            if (i < steps.length - 1 && step.action !== 'forEach') {
                await new Promise(r => setTimeout(r, 300));
            }
        }
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
