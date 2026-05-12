/**
 * Task Register Service - Fetch DocIds from Millware Task Register List
 *
 * Uses Puppeteer to scrape DocIds from frmPrTrxTaskRegisterList.aspx
 * Reuses Chrome profile from automation engine (engine_1) for session persistence.
 */

const puppeteer = require('../../browser-automation-engine/node_modules/puppeteer');
const path = require('path');

const MILLWARE_BASE = 'http://millwarep3.rebinmas.com:8003';
const MILLWARE_URL = `${MILLWARE_BASE}/en/PR/trx`;
const USERNAME = process.env.MILLWARE_USER || 'adm075';
const PASSWORD = process.env.MILLWARE_PASS || 'adm075';
const PROFILE_DIR = path.join(__dirname, '../../browser-automation-engine/chrome_data/engine_1');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Login to Millware
 */
const login = async (page) => {
    // Check if already on login page
    const onLoginPage = await page.$('#txtUsername');
    if (!onLoginPage) {
        console.log('[TaskRegister] Not on login page, navigating to base URL...');
        await page.goto(MILLWARE_BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2000);
        const usernameField = await page.$('#txtUsername');
        if (!usernameField) {
            console.log('[TaskRegister] Session may still be valid (no login form)');
            return;  // Already logged in
        }
    }

    await page.type('#txtUsername', USERNAME, { delay: 100 });
    await page.type('#txtPassword', PASSWORD, { delay: 100 });
    await page.click('#btnLogin');
    await sleep(2000);

    // Handle popup if present
    try {
        const popupBtn = await page.$('#MainContent_btnOkay');
        if (popupBtn) {
            await popupBtn.click();
            await sleep(1500);
        }
    } catch (e) {
        // No popup
    }
    console.log('[TaskRegister] Login complete');
};

/**
 * Fetch DocIds from Task Register List page
 *
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @returns {Promise<string[]>} - Array of DocIds
 */
const fetchDocIds = async (month, year) => {
    console.log(`[TaskRegister] Fetching DocIds for ${month}/${year}...`);

    // Fallback: return empty array if Millware is unreachable
    // This allows the dialog to open even if network is down
    try {
        // Quick connectivity check with short timeout
        const testBrowser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage']
        });
        const testPage = await testBrowser.newPage();

        try {
            await testPage.goto(MILLWARE_BASE + '/', {
                waitUntil: 'domcontentloaded',
                timeout: 5000  // Short timeout for quick fail
            });
            await testBrowser.close();
        } catch (e) {
            await testBrowser.close();
            console.warn(`[TaskRegister] Millware unreachable: ${e.message}`);
            console.warn(`[TaskRegister] Returning empty DocIds list (user can still use manual mode)`);
            return [];  // Return empty, don't crash
        }
    } catch (e) {
        console.warn(`[TaskRegister] Browser launch failed: ${e.message}`);
        return [];
    }

    // Use same profile as delete-ot-runner.js
    const headless = process.env.HEADLESS === 'true';

    const browser = await puppeteer.launch({
        headless,
        userDataDir: PROFILE_DIR,
        args: [
            '--disable-popup-blocking',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--ignore-certificate-errors'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });

        // Set extra headers to mimic real browser
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });

        // Login (reuses session from profile if still valid)
        await login(page);

        // Navigate to Task Register List with redirect handling
        console.log('[TaskRegister] Navigating to Task Register List...');
        try {
            await page.goto(`${MILLWARE_URL}/frmPrTrxTaskRegisterList.aspx`, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
        } catch (navErr) {
            console.log(`[TaskRegister] Navigation issue: ${navErr.message}`);
            // Check if redirected to login page
            const currentUrl = page.url();
            console.log(`[TaskRegister] Current URL: ${currentUrl}`);
            if (currentUrl.includes('login') || currentUrl === MILLWARE_BASE + '/') {
                console.log('[TaskRegister] Session expired, re-logging in...');
                await login(page);
                await page.goto(`${MILLWARE_URL}/frmPrTrxTaskRegisterList.aspx`, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
            }
        }

        await sleep(2000);

        // Check final URL - if still on login, session is broken
        const finalUrl = page.url();
        if (finalUrl.includes('login') || !finalUrl.includes('TaskRegister')) {
            console.error(`[TaskRegister] Still on login page or unexpected URL: ${finalUrl}`);
            // Try one more fresh login
            await login(page);
            await page.goto(`${MILLWARE_URL}/frmPrTrxTaskRegisterList.aspx`, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await sleep(2000);
        }

        // Try to apply month/year filter (optional - may not exist on all pages)
        if (month && year) {
            try {
                const filterMonth = await page.$('#MainContent_ddlMonth, #MainContent_txtMonth, select[id*="Month"]');
                const filterYear = await page.$('#MainContent_ddlYear, #MainContent_txtYear, select[id*="Year"]');
                if (filterMonth) {
                    await filterMonth.type(String(month), { delay: 100 });
                    console.log(`[TaskRegister] Applied month filter: ${month}`);
                }
                if (filterYear) {
                    await filterYear.type(String(year), { delay: 100 });
                    console.log(`[TaskRegister] Applied year filter: ${year}`);
                }

                const searchBtn = await page.$('input[type="submit"][value*="Search"], input[type="submit"][value*="Filter"], input[id*="btnSearch"], input[id*="btnFilter"]');
                if (searchBtn) {
                    await searchBtn.click();
                    await sleep(2000);
                    console.log(`[TaskRegister] Search/Filter applied`);
                }
            } catch (e) {
                console.log(`[TaskRegister] Filter not available or failed: ${e.message}`);
            }
        }

        // Parse grid rows to extract DocIds
        const docIds = await page.evaluate(() => {
            const results = [];
            const rows = Array.from(document.querySelectorAll('#MainContent_gvList tr.mr-l, #MainContent_gvList tr.mr-r'));
            rows.forEach((row) => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length === 0) return;
                const docIdCell = cells[0];
                const link = docIdCell.querySelector('a[href*="frmPrTrxTaskRegisterDet"]');
                const docId = link ? link.textContent.trim() : docIdCell.textContent.trim();
                if (docId) results.push(docId);
            });
            return results;
        });

        console.log(`[TaskRegister] Found ${docIds.length} DocIds`);
        if (docIds.length > 0) {
            console.log(`[TaskRegister] Sample DocIds: ${docIds.slice(0, 5).join(', ')}${docIds.length > 5 ? '...' : ''}`);
        }

        return docIds;

    } catch (e) {
        console.error(`[TaskRegister] Error fetching DocIds: ${e.message}`);
        throw e;
    } finally {
        await browser.close();
    }
};

module.exports = {
    fetchDocIds
};
