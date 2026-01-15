const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const actions = require('./actions');
const { captureErrorScreenshot } = require('./utils/selectors');

class AutomationEngine {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.headless = options.headless !== undefined ? options.headless : false;
        this.slowMo = options.slowMo || 0;
        this.screenshot = options.screenshot !== undefined ? options.screenshot : true;
    }

    /**
     * Memulai browser
     */
    async launch() {
        console.log('🚀 Meluncurkan Browser Chrome...');
        this.browser = await puppeteer.launch({
            headless: this.headless,
            slowMo: this.slowMo,
            defaultViewport: null,
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });
        this.page = await this.browser.newPage();

        // Set user agent agar tidak terdeteksi sebagai bot
        await this.page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
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
                    console.log(`⚠️  Variable not found: ${path} (failed at key: ${key})`);
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
            console.log(`${prefix}[Step ${i + 1}/${steps.length}] Action: ${step.action}`);

            // Substitute variables di params
            const substitutedParams = this.substituteParams(step.params, context);

            // Cek apakah aksi ada di modul actions
            if (actions[step.action]) {
                await actions[step.action](this.page, substitutedParams, context, this);
            } else {
                throw new Error(`Aksi "${step.action}" tidak dikenali.`);
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
