/**
 * browser-session.js
 *
 * Session management for Venus Millware automation.
 * Based on "Auto Key In Refactor" session pattern:
 * - Saves/restores cookies to JSON file (cookie-file mode)
 * - Or relies on userDataDir profile (userDataDir mode)
 * - 240-minute expiry validation
 * - Multiple auth marker validation
 * - Fresh login fallback when session is invalid
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SESSION_MAX_AGE_MS = 240 * 60 * 1000; // 240 minutes

const MILLWARE_CONFIG = {
    baseUrl: process.env.MILLWARE_BASE_URL || 'http://millwarep3.rebinmas.com:8003',
    username: process.env.MILLWARE_USERNAME || 'adm075',
    password: process.env.MILLWARE_PASSWORD || 'adm075',
    loginUrl: process.env.MILLWARE_LOGIN_URL || 'http://millwarep3.rebinmas.com:8003/',
    taskRegisterPage: '/en/PR/trx/frmPrTrxTaskRegisterDet.aspx'
};

function resolveSessionDir() {
    return path.join(__dirname, 'chrome_data', 'sessions');
}

function sessionFilePath(sessionId) {
    return path.join(resolveSessionDir(), `${sessionId}.json`);
}

/**
 * Detect if the page shows a Millware authenticated page.
 * Returns true if any auth marker is visible.
 */
async function detectAuthMarkers(page) {
    const url = page.url();
    if (/login|SessionExpire|sessionexpire/i.test(url)) return false;

    try {
        const loginFormVisible = await page.locator('#txtUsername, #txtPassword, #btnLogin').first().isVisible({ timeout: 2000 }).catch(() => false);
        if (loginFormVisible) return false;
    } catch { /* ignore */ }

    try {
        const bodyText = await page.locator('body').textContent({ timeout: 3000 }).catch(() => '');
        if (/session expired/i.test(bodyText || '')) return false;
    } catch { /* ignore */ }

    const markers = [
        '#MainContent_btnNew', 'input[id*="btnNew"]',
        'a[href*="frmPrTrxTaskRegister"]', 'a[href*="frmPrTrxTaskRegisterDet"]',
        '#MainContent_btnSave', 'input[id*="btnSave"]',
        '#MainContent_cboOTType', '#MainContent_cboEmployee',
        '#MainContent_cboChargeJob', '#MainContent_cboRegHours', '#MainContent_txtOTHours'
    ];

    for (const selector of markers) {
        try {
            if (await page.locator(selector).first().isVisible({ timeout: 1500 })) return true;
        } catch { /* next marker */ }
    }

    try {
        const navUrl = page.url();
        if (navUrl.includes('frmPrTrxTaskRegister') && !/login/i.test(navUrl)) return true;
    } catch { /* ignore */ }

    return false;
}

const SHARED_LAUNCH_ARGS = [
    '--start-maximized', '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer',
    '--no-first-run', '--no-zygote', '--disable-extensions',
    '--no-proxy-server', '--proxy-server=direct://',
    '--disable-background-networking', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-breakpad',
    '--disable-component-extensions-with-background-pages',
    '--disable-features=TranslateUI,BlinkGenPropertyTrees,SitePerProcess,VizDisplayCompositor',
    '--disable-ipc-flooding-protection', '--disable-renderer-backgrounding',
    '--disable-features=IsolateOrigins,site-per-process',
    '--process-per-site', '--max_old_space_size=512', '--memory-pressure-off',
    '--aggressive-cache-discard', '--disable-accelerated-video-decode',
    '--disable-sync', '--disable-default-apps', '--disable-popup-blocking',
    '--disable-prompt-on-repost', '--disable-hang-monitor',
    '--disable-client-side-phishing-detection', '--disable-component-update',
    '--disable-domain-reliability', '--disable-features=AudioServiceOutOfProcess,MediaRecorder',
    '--ignore-certificate-errors', '--ignore-ssl-errors', '--allow-running-insecure-content'
];

/**
 * MillwareSession — session management class.
 *
 * @param {object} options
 * @param {string}  [options.sessionId]         - Session identifier (used in filename + userDataDir)
 * @param {string}  [options.userDataDir]       - Chrome profile directory (null = cookie-file mode)
 * @param {boolean} [options.freshLoginFirst]   - Always login fresh (default: true)
 * @param {boolean} [options.loginFallback]     - Fall back to login if session invalid (default: true)
 * @param {boolean} [options.headless=false]
 * @param {number}  [options.slowMo=0]
 *
 * Two modes:
 *   userDataDir mode:   cookies live in the Chrome profile. Auth validated by navigating to target page.
 *   cookie-file mode:   cookies extracted via page.cookies() and saved to JSON. Restored via setCookies().
 */
class MillwareSession {
    constructor(options = {}) {
        this.sessionId = options.sessionId || 'millware-default';
        this.userDataDir = options.userDataDir || null;
        this.freshLoginFirst = options.freshLoginFirst !== undefined ? options.freshLoginFirst : true;
        this.loginFallback = options.loginFallback !== undefined ? options.loginFallback : true;
        this.headless = options.headless !== undefined ? options.headless : false;
        this.slowMo = options.slowMo || 0;
        this._sessionDir = resolveSessionDir();

        this.browser = null;
        this.page = null;    // primary page (used for login + first tab)
        this.sessionReused = false;
    }

    _launchOptions() {
        const opts = {
            headless: this.headless,
            slowMo: this.slowMo,
            defaultViewport: null,
            args: [...SHARED_LAUNCH_ARGS]
        };
        if (this.userDataDir) {
            opts.userDataDir = this.userDataDir;
        }
        return opts;
    }

    _ensureSessionDir() {
        fs.mkdirSync(this._sessionDir, { recursive: true });
    }

    _cookieFilePath() {
        return sessionFilePath(this.sessionId);
    }

    async start() {
        this._ensureSessionDir();
        this.browser = await puppeteer.launch(this._launchOptions());

        if (this.freshLoginFirst) {
            await this.loginAndSave();
            return;
        }

        const loaded = await this.tryLoadSession();
        if (!loaded) {
            if (!this.loginFallback) {
                throw new Error(
                    `Saved session "${this.sessionId}" is required. Set FRESH_LOGIN=true or run a successful login first.`
                );
            }
            console.log(`  🔐 [Session] Saved session invalid/expired — performing fresh login`);
            await this.loginAndSave();
        }
    }

    async _injectVisibilityOverride(page) {
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(document, 'hidden', { get: () => false });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
            let lastTime = 0;
            window.requestAnimationFrame = function (callback) {
                const currTime = new Date().getTime();
                const timeToCall = Math.max(0, 16 - (currTime - lastTime));
                const id = window.setTimeout(() => callback(currTime + timeToCall), timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
            window.cancelAnimationFrame = (id) => clearTimeout(id);
        });
    }

    async loginAndSave() {
        this.page = await this.browser.newPage();
        await this._injectVisibilityOverride(this.page);

        try {
            try {
                await this.page.goto(MILLWARE_CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            } catch {
                await this.page.goto(MILLWARE_CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
            }

            await this.page.waitForSelector('#txtUsername', { timeout: 10000 });
            await this.page.type('#txtUsername', MILLWARE_CONFIG.username, { delay: 50 });
            await this.page.type('#txtPassword', MILLWARE_CONFIG.password, { delay: 50 });
            await this.page.click('#btnLogin');
            await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

            const targetUrl = MILLWARE_CONFIG.baseUrl.replace(/\/$/, '') + MILLWARE_CONFIG.taskRegisterPage;
            try {
                await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch { /* form may still be accessible */ }

            const authenticated = await detectAuthMarkers(this.page);
            if (authenticated) {
                console.log(`  ✅ [Session] Login successful — auth markers confirmed`);
            } else {
                console.warn(`  ⚠️  [Session] Login may have failed — auth markers not detected`);
            }

            await this.saveSession();
            this.sessionReused = false;
        } finally {
            // Keep page open — caller reuses it as the first tab
        }
    }

    /**
     * Validate existing session. Works with userDataDir profile or cookie-file.
     * Returns true if session is valid and ready to use.
     */
    async tryLoadSession() {
        const cookiePath = this._cookieFilePath();

        if (this.userDataDir) {
            // userDataDir mode: validate by navigating to target page
            console.log(`  🔍 [Session] Validating userDataDir session...`);
            const testPage = await this.browser.newPage();
            await this._injectVisibilityOverride(testPage);

            const targetUrl = MILLWARE_CONFIG.baseUrl.replace(/\/$/, '') + MILLWARE_CONFIG.taskRegisterPage;
            try {
                await testPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch { /* ignore */ }

            const authenticated = await detectAuthMarkers(testPage);
            await testPage.close().catch(() => {});

            if (authenticated) {
                this.sessionReused = true;
                console.log(`  ♻️  [Session] userDataDir session is valid`);
                return true;
            }
            console.log(`  ❌ [Session] userDataDir session is not authenticated`);
            return false;
        }

        // cookie-file mode: validate saved JSON cookies
        if (!fs.existsSync(cookiePath)) {
            console.log(`  📂 [Session] No saved cookie file found`);
            return false;
        }

        try {
            const sessionData = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));

            if (sessionData.savedAt) {
                const ageMs = Date.now() - new Date(sessionData.savedAt).getTime();
                if (ageMs > SESSION_MAX_AGE_MS) {
                    console.log(`  ⏰ [Session] Cookie file expired`);
                    return false;
                }
                console.log(`  ⏰ [Session] Cookie file age: ${Math.round(ageMs / 60000)} min`);
            }

            if (!sessionData.cookies?.length) {
                console.log(`  ⚠️  [Session] Cookie file has no cookies`);
                return false;
            }

            // Test cookies by creating a temp page and setting cookies
            const testPage = await this.browser.newPage();
            await this._injectVisibilityOverride(testPage);
            await testPage.setCookie(...sessionData.cookies);

            const targetUrl = MILLWARE_CONFIG.baseUrl.replace(/\/$/, '') + MILLWARE_CONFIG.taskRegisterPage;
            try {
                await testPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch { /* ignore */ }

            const authenticated = await detectAuthMarkers(testPage);
            await testPage.close().catch(() => {});

            if (!authenticated) {
                console.log(`  ❌ [Session] Cookie file session not authenticated`);
                return false;
            }

            this.sessionReused = true;
            console.log(`  ♻️  [Session] Cookie file session restored`);
            return true;
        } catch (error) {
            console.warn(`  ⚠️  [Session] Cookie file validation failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Save session state:
     *   userDataDir mode:   writes a timestamp marker (cookies live in profile).
     *   cookie-file mode:  extracts cookies from this.page and saves to JSON.
     */
    async saveSession() {
        this._ensureSessionDir();
        const cookiePath = this._cookieFilePath();

        if (this.userDataDir) {
            // Cookies are already in the userDataDir — write marker
            const marker = {
                sessionId: this.sessionId,
                userDataDir: this.userDataDir,
                savedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString()
            };
            fs.writeFileSync(cookiePath, JSON.stringify(marker, null, 2));
            console.log(`  💾 [Session] Saved (userDataDir): ${cookiePath}`);
        } else {
            // cookie-file mode: extract and serialize cookies
            const cookies = await this.page.cookies();
            const sessionData = {
                sessionId: this.sessionId,
                savedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
                cookies
            };
            fs.writeFileSync(cookiePath, JSON.stringify(sessionData, null, 2));
            console.log(`  💾 [Session] Saved (cookie file): ${cookiePath}`);
        }
    }

    /**
     * Create a new page in the session's browser.
     */
    async newPage() {
        if (!this.browser) throw new Error('Browser not started — call start() first');
        const page = await this.browser.newPage();
        await this._injectVisibilityOverride(page);

        // cookie-file mode: restore cookies to new page
        if (!this.userDataDir && this.sessionReused) {
            const cookiePath = this._cookieFilePath();
            if (fs.existsSync(cookiePath)) {
                try {
                    const sessionData = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
                    if (sessionData.cookies?.length) {
                        await page.setCookie(...sessionData.cookies);
                    }
                } catch { /* ignore */ }
            }
        }

        return page;
    }

    getSessionPath() {
        return this._cookieFilePath();
    }

    async close() {
        await this.page?.close().catch(() => {});
        await this.browser?.close().catch(() => {});
        this.browser = null;
        this.page = null;
    }
}

module.exports = {
    MillwareSession,
    detectAuthMarkers,
    MILLWARE_CONFIG,
    SESSION_MAX_AGE_MS,
    resolveSessionDir,
    sessionFilePath,
    SHARED_LAUNCH_ARGS
};
