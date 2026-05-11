const { chromium } = require('playwright');

async function testAttendanceMatrix() {
    console.log('Starting Playwright test for Attendance Matrix...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    try {
        console.log('1. Navigating to frontend...');
        await page.goto('http://localhost:5173', { timeout: 30000, waitUntil: 'networkidle' });

        console.log('2. Checking for login...');
        const loginBtn = await page.button;
        if (loginBtn) {
            await page.fill('input[type="text"], input[name="username"]', 'admin');
            await page.fill('input[type="password"]', 'password');
            await page.click('button');
            await page.waitForTimeout(3000);
        }

        console.log('3. Waiting for data...');
        await page.waitForTimeout(5000);

        console.log('4. Checking table...');
        const table = await page.table;
        const rows = await page.('tbody tr');
        const cells = await page.('tbody td');

        console.log('Table exists:', !!table);
        console.log('Rows:', rows.length);
        console.log('Cells:', cells.length);

        if (errors.length > 0) {
            console.log('Console errors:', errors);
        }

        await page.screenshot({ path: 'test-result.png', fullPage: true });

        if (rows.length > 5) {
            console.log('TEST PASSED: Matrix has data');
        } else {
            console.log('TEST FAILED: No data');
        }
    } catch (error) {
        console.error('Error:', error.message);
        await page.screenshot({ path: 'test-error.png' });
    } finally {
        await browser.close();
    }
}

testAttendanceMatrix().catch(console.error);
