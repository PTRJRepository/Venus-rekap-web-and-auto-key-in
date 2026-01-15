/**
 * Helper untuk menunggu elemen muncul dan terlihat (visible)
 */
async function waitForElement(page, selector, timeout = 5000) {
    try {
        await page.waitForSelector(selector, { visible: true, timeout });
        return true;
    } catch (error) {
        throw new Error(`Elemen ${selector} tidak ditemukan dalam ${timeout}ms`);
    }
}

/**
 * Helper untuk mengetik dengan aman (membersihkan field terlebih dahulu)
 * PENTING: Klik elemen dulu untuk trigger focus dan JavaScript events
 */
async function safeType(page, selector, text) {
    await waitForElement(page, selector);

    // Klik elemen dulu untuk focus (penting untuk Millware!)
    await page.click(selector);
    await new Promise(r => setTimeout(r, 200)); // Tunggu focus event

    // Clear existing value dengan select all
    await page.click(selector, { clickCount: 3 }); // Triple click untuk select all
    await new Promise(r => setTimeout(r, 100));

    // Type text dengan delay meniru ketikan manusia
    await page.type(selector, text, { delay: 50 });
}

/**
 * Helper untuk mengetik ke elemen berdasarkan index (jika selector match banyak elemen)
 */
async function safeTypeAtIndex(page, selector, index, text, timeout = 10000) {
    console.log(`  Targeting element index ${index} for selector "${selector}"`);
    
    // Wait until enough elements exist
    try {
        await page.waitForFunction(
            (selector, expectedCount) => {
                const elements = document.querySelectorAll(selector);
                // Pastikan element visible
                let visibleCount = 0;
                for(const el of elements) {
                    if (el.offsetParent !== null) visibleCount++;
                }
                return visibleCount >= expectedCount;
            },
            { timeout },
            selector,
            index + 1
        );
    } catch (e) {
        throw new Error(`Timeout waiting for element at index ${index} (selector: ${selector})`);
    }

    // Get all matching elements
    const elements = await page.$$(selector);
    
    // Filter visible ones just to be safe (though waitForFunction did it)
    const visibleElements = [];
    for (const el of elements) {
        const isVisible = await el.evaluate(node => node.offsetParent !== null);
        if (isVisible) visibleElements.push(el);
    }

    if (visibleElements.length <= index) {
        throw new Error(`Element at index ${index} not found. Found ${visibleElements.length} visible elements.`);
    }

    const element = visibleElements[index];

    // Click and Type logic on the ElementHandle
    await element.click();
    await new Promise(r => setTimeout(r, 200));
    
    await element.click({ clickCount: 3 });
    await new Promise(r => setTimeout(r, 100));
    
    await element.type(text, { delay: 50 });
}

/**
 * Helper untuk screenshot saat error (Enterprise feature)
 */
async function captureErrorScreenshot(page, errorMessage) {
    try {
        const timestamp = new Date().getTime();
        const filename = `logs/errors/error_${timestamp}.png`;

        // Buat direktori jika belum ada
        const fs = require('fs');
        const path = require('path');
        const dir = path.dirname(filename);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        await page.screenshot({
            path: filename,
            fullPage: true
        });

        console.log(`📸 Screenshot error disimpan: ${filename}`);
        return filename;
    } catch (err) {
        console.error('Gagal mengambil screenshot:', err.message);
    }
}

module.exports = {
    waitForElement,
    safeType,
    safeTypeAtIndex,
    captureErrorScreenshot
};
