const { chromium } = require('playwright');

(async () => {
    console.log('Starting Playwright test...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const errors = [];
    const logs = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
        else logs.push(msg.text());
    });

    try {
        console.log('1. Navigating to http://localhost:5173...');
        await page.goto('http://localhost:5173', { timeout: 30000, waitUntil: 'domcontentloaded' });
        console.log('Page loaded');

        // Wait and check what's on page
        await page.waitForTimeout(2000);
        const bodyHTML = await page.content();
        console.log('Page has <table>:', bodyHTML.includes('<table'));
        console.log('Page has "Login":', bodyHTML.includes('Login') || bodyHTML.includes('Masuk'));
        console.log('Page has "KARYAWAN":', bodyHTML.includes('KARYAWAN'));

        // Check all elements
        const allText = await page.innerText('body');
        console.log('\nBody preview (first 500 chars):');
        console.log(allText.substring(0, 500));

        // Check for any buttons
        const buttons = await page.$$('button');
        console.log('\nButtons found:', buttons.length);
        for (const btn of buttons) {
            const text = await btn.innerText();
            console.log('  Button:', text.substring(0, 50));
        }

        if (errors.length > 0) {
            console.log('\n❌ Console errors:');
            errors.forEach(e => console.log('  -', e.substring(0, 200)));
        } else {
            console.log('\n✅ No console errors');
        }

        await page.screenshot({ path: 'test-result.png', fullPage: true });
        console.log('\nScreenshot saved to test-result.png');

    } catch (error) {
        console.error('Test error:', error.message);
        await page.screenshot({ path: 'test-error.png', fullPage: true });
    } finally {
        await browser.close();
    }
})();
