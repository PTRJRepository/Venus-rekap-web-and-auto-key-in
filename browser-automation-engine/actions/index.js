const { waitForElement, safeType, safeTypeAtIndex } = require('../utils/selectors');

// Helper: Wait for page to be stable (internal usage)
const _waitForPageStable = async (page, timeoutMs = 3000) => {
    try {
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: timeoutMs });
        await new Promise(r => setTimeout(r, 500)); // Extra stabilization
    } catch (e) {
        // Timeout is ok
    }
};

// Helper: Safe evaluate that handles navigation errors
const safeEvaluate = async (page, fn, ...args) => {
    for (let retry = 0; retry < 3; retry++) {
        try {
            return await page.evaluate(fn, ...args);
        } catch (e) {
            if (e.message.includes('context was destroyed') || e.message.includes('navigation')) {
                console.log(`  ⚠️ Page navigated, waiting for stability...`);
                await _waitForPageStable(page);
            } else {
                throw e;
            }
        }
    }
    return null;
};

const actions = {
    /**
     * Navigasi ke URL
     */
    navigate: async (page, params) => {
        console.log(`🔄 Navigasi ke: ${params.url}`);
        await page.goto(params.url, { waitUntil: 'networkidle2', timeout: 60000 });
    },

    /**
     * Wait for page to be stable (no pending network requests, animations, etc.)
     * Useful for ensuring page is fully loaded before interacting
     */
    waitForPageStable: async (page, params) => {
        const timeout = params.timeout || 5000;
        const checkInterval = params.interval || 500;

        console.log(`⏳ Waiting for page to stabilize (timeout: ${timeout}ms)...`);

        const startTime = Date.now();
        let lastHtml = '';
        let stableCount = 0;
        const requiredStableChecks = 2;

        while (Date.now() - startTime < timeout) {
            // Wait for network idle
            try {
                await page.waitForNetworkIdle({ timeout: checkInterval, idleTime: 250 });
            } catch (e) {
                // Network still busy, continue
            }

            // Check if DOM is stable
            const currentHtml = await page.evaluate(() => document.body?.innerHTML?.length || 0);

            if (currentHtml === lastHtml && currentHtml > 0) {
                stableCount++;
                if (stableCount >= requiredStableChecks) {
                    console.log(`  ✅ Page stable after ${Date.now() - startTime}ms`);
                    return;
                }
            } else {
                stableCount = 0;
            }

            lastHtml = currentHtml;
            await new Promise(r => setTimeout(r, checkInterval));
        }

        console.log(`  ⚠️ Page stability timeout reached`);
    },

    /**
     * Assert that a specific element has focus before typing
     * Prevents typing into wrong elements in parallel execution
     */
    assertFocus: async (page, params) => {
        const { selector, index, retries = 3, delay = 500 } = params;

        console.log(`🎯 Asserting focus on: ${selector}${index !== undefined ? ` (index: ${index})` : ''}`);

        for (let attempt = 1; attempt <= retries; attempt++) {
            let targetElement;

            if (index !== undefined) {
                const elements = await page.$$(selector);
                const visibleElements = [];
                for (const el of elements) {
                    const isVisible = await el.evaluate(node => node.offsetParent !== null);
                    if (isVisible) visibleElements.push(el);
                }
                targetElement = visibleElements[index];
            } else {
                targetElement = await page.$(selector);
            }

            if (!targetElement) {
                console.log(`  ⚠️ Element not found, retrying (${attempt}/${retries})...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            // Click to ensure focus
            await targetElement.click();
            await new Promise(r => setTimeout(r, 100));

            // Verify focus
            const hasFocus = await targetElement.evaluate(el => document.activeElement === el);

            if (hasFocus) {
                console.log(`  ✅ Focus confirmed`);
                return true;
            }

            console.log(`  ⚠️ Focus not on target, retrying (${attempt}/${retries})...`);
            await new Promise(r => setTimeout(r, delay));
        }

        throw new Error(`Failed to assert focus on ${selector} after ${retries} attempts`);
    },

    /**
     * Mengetik input text
     */
    typeInput: async (page, params) => {
        // Detect if this is an autocomplete field (CBOBox) that needs smart selection
        const isAutocomplete = (params.selector && (
            params.selector.includes('ui-autocomplete-input') ||
            params.selector.includes('CBOBox')
        )) || params.smartSelect === true;

        if (isAutocomplete) {
            console.log(`⌨️  Smart Typing "${params.value}" ke elemen: ${params.selector} (Index: ${params.index || 0})`);

            const selector = params.selector;
            const index = params.index;
            const value = params.value;

            // 1. Get Element Handle (similar to safeTypeAtIndex)
            let elementHandle;
            if (index !== undefined) {
                try {
                    await page.waitForFunction(
                        (sel, idx) => {
                            const els = document.querySelectorAll(sel);
                            let count = 0;
                            for (const el of els) if (el.offsetParent !== null) count++;
                            return count >= idx + 1;
                        },
                        { timeout: 5000 }, selector, index
                    );
                } catch (e) { /* ignore timeout */ }

                const elements = await page.$$(selector);
                const visibleElements = [];
                for (const el of elements) {
                    const isVisible = await el.evaluate(node => node.offsetParent !== null);
                    if (isVisible) visibleElements.push(el);
                }

                if (visibleElements.length <= index) {
                    throw new Error(`Element at index ${index} not found. Found ${visibleElements.length} visible.`);
                }
                elementHandle = visibleElements[index];
            } else {
                await waitForElement(page, selector);
                elementHandle = await page.$(selector);
            }

            // 2. Clear Input
            // Click 3 times to select all, then backspace
            await elementHandle.click({ clickCount: 3 });
            await elementHandle.press('Backspace');
            await new Promise(r => setTimeout(r, 200));

            // 3. Type character by character and check dropdown
            let foundSingleOption = false;

            for (let i = 0; i < value.length; i++) {
                await elementHandle.type(value[i]);

                // Start checking immediately (even after 1st char if possible) but usually need 2+
                // Lowered threshold to i >= 0 to be more aggressive if needed, but sticking to i >= 1 safe
                if (i >= 0) {
                    await new Promise(r => setTimeout(r, 250)); // Reduced wait for UI update

                    // Check dropdown count - Robust Version
                    const { optionCount, debugMsg } = await page.evaluate(() => {
                        const lists = document.querySelectorAll('ul.ui-autocomplete');
                        let activeList = null;

                        // Find the visible list
                        for (const list of lists) {
                            if (list.style.display !== 'none' && list.offsetParent !== null) {
                                activeList = list;
                                break;
                            }
                        }

                        if (!activeList) {
                            return { optionCount: -1, debugMsg: `Found ${lists.length} lists, none visible` };
                        }

                        // Count items
                        const items = activeList.querySelectorAll('li.ui-menu-item'); // Standard jQuery UI
                        // Fallback selector if needed? usually li is enough

                        return {
                            optionCount: items.length,
                            debugMsg: `Visible list found. Items: ${items.length}`
                        };
                    });

                    // console.log(`     [${value.substring(0, i+1)}] -> ${debugMsg}`);

                    if (optionCount === 1) {
                        console.log(`  ✨ Single option found after typing "${value.substring(0, i + 1)}". Clicking it!`);
                        foundSingleOption = true;
                        break;
                    }
                }
            }

            // 4. Select Option
            await new Promise(r => setTimeout(r, 500)); // Stabilize UI before selection

            // Ensure focus is still on the input
            if (elementHandle) await elementHandle.focus();

            if (foundSingleOption) {
                console.log("  ⌨️  Selecting single option with ArrowDown + Enter...");
                await page.keyboard.press('ArrowDown');
                await new Promise(r => setTimeout(r, 300)); // Increased delay for stability
                await page.keyboard.press('Enter');
            } else {
                // Fallback: If we finished typing and never found a single option (or 0 options),
                // we try to select the first one anyway if available.
                console.log(`  ⚠️  Finished typing without isolating single option. Selecting first available.`);
                await page.keyboard.press('ArrowDown');
                await new Promise(r => setTimeout(r, 300)); // Increased delay for stability
                await page.keyboard.press('Enter');
            }

            // Additional wait to ensure UI settles
            await new Promise(r => setTimeout(r, 500));

        } else {
            // Standard behavior for non-autocomplete fields
            if (params.index !== undefined) {
                console.log(`⌨️  Mengetik "${params.value}" ke elemen: ${params.selector} (Index: ${params.index})`);
                await safeTypeAtIndex(page, params.selector, params.index, params.value);
            } else {
                console.log(`⌨️  Mengetik "${params.value}" ke elemen: ${params.selector}`);
                await safeType(page, params.selector, params.value);
            }
        }
    },

    /**
     * Alias for pressKey
     */
    press: async (page, params) => {
        const key = params.key || 'Enter';
        console.log(`⌨️  Menekan tombol: ${key}`);
        await page.keyboard.press(key);
    },

    /**
     * Mengklik elemen
     */
    click: async (page, params) => {
        console.log(`🖱️  Mengklik elemen: ${params.selector}`);
        await waitForElement(page, params.selector, params.timeout || 10000);

        // Try standard click first
        try {
            await page.click(params.selector);
        } catch (e) {
            console.log(`  ⚠️ Standard click failed, trying JS click...`);
        }

        // Always enforce JS click for robustness (especially for ASP.NET buttons)
        await safeEvaluate(page, (sel) => {
            const el = document.querySelector(sel);
            if (el) {
                el.click();
                // Also dispatch mousedown/mouseup just in case
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                return true;
            }
            return false;
        }, params.selector);
    },

    /**
     * Menunggu elemen spesifik muncul (misal: popup)
     */
    waitForElement: async (page, params) => {
        console.log(`⏳ Menunggu elemen: ${params.selector}`);
        await waitForElement(page, params.selector, params.timeout || 10000);
    },

    /**
     * Menunggu jeda waktu (sleep)
     */
    wait: async (page, params) => {
        const duration = params.duration || 1000;
        console.log(`💤 Menunggu selama ${duration}ms`);
        await new Promise(resolve => setTimeout(resolve, duration));
    },

    /**
     * Submit form (optional action)
     */
    submit: async (page, params) => {
        console.log(`📤 Submit form: ${params.selector}`);
        await waitForElement(page, params.selector);
        await page.evaluate((selector) => {
            document.querySelector(selector).submit();
        }, params.selector);
    },

    /**
     * Screenshot untuk dokumentasi
     */
    screenshot: async (page, params) => {
        const filename = params.filename || `screenshot_${Date.now()}.png`;
        console.log(`📸 Mengambil screenshot: ${filename}`);
        await page.screenshot({
            path: filename,
            fullPage: params.fullPage !== false
        });
    },

    /**
     * Tekan tombol keyboard (Enter, Tab, Escape, dll)
     */
    pressKey: async (page, params) => {
        const key = params.key || 'Enter';
        console.log(`⌨️  Menekan tombol: ${key}`);
        await page.keyboard.press(key);
    },

    /**
     * Format date string to dd/mm/yyyy
     * Useful for converting yyyy-mm-dd to Millware's expected format
     */
    formatDate: async (page, params, context, engine) => {
        const dateStr = params.date || params.value;
        const variableName = params.saveTo || 'formattedDate';

        // Parse yyyy-mm-dd format
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            const formatted = `${day}/${month}/${year}`;

            console.log(`📅 Format tanggal: ${dateStr} → ${formatted}`);

            // Store DIRECTLY in context (top-level) for easy access
            context[variableName] = formatted;

            return formatted;
        }

        console.log(`⚠️  Format tanggal tidak valid: ${dateStr}`);
        return dateStr;
    },

    /**
     * Parse ChargeJob string to extract parts separated by '/'
     * Example: "(GA9010) VEHICLE RUNNING / BE001 (...) / 11 (...)"
     * Results: part1="VEHICLE RUNNING", part2="BE001 (...)", part3="11 (...)"
     * Also stores: chargeJobPartsCount, hasChargeJobPart2, hasChargeJobPart3
     */
    parseChargeJob: async (page, params, context, engine) => {
        const chargeJob = params.chargeJob || params.value || '';
        console.log(`🔍 Parsing ChargeJob: "${chargeJob}"`);

        // Split by '/' and filter out empty/whitespace parts
        // A valid part must have at least 2 meaningful characters
        const parts = chargeJob.split('/').map(p => p.trim()).filter(p => p.length >= 2);

        // Store parts count for conditional logic (excluding Employee field)
        context.chargeJobPartsCount = parts.length;
        // Expected field count = parts.length + 1 (for Employee field at index 0)
        // This is used by retryInputWithValidation to skip waiting for non-existent fields
        context.expectedFieldCount = parts.length + 1;
        console.log(`  📊 Total VALID parts found: ${parts.length}, Expected fields: ${context.expectedFieldCount}`);
        console.log(`  📋 Parts: ${JSON.stringify(parts)}`);

        // Store DIRECTLY in context (top-level) for easy access
        // Part 1: Task Code
        if (parts.length > 0 && parts[0] && parts[0].length >= 2) {
            const rawPart1 = parts[0];
            context.chargeJobPart1 = rawPart1;

            // Clean version: Remove (...) prefix
            context.chargeJobPart1Clean = rawPart1.replace(/^\([^)]+\)\s*/, '').trim();
            console.log(`  Part 1 (Full) : "${rawPart1}"`);
            console.log(`  Part 1 (Clean): "${context.chargeJobPart1Clean}"`);
        } else {
            context.chargeJobPart1 = "";
            context.chargeJobPart1Clean = "";
        }

        // Part 2: Resource/Equipment
        if (parts.length > 1 && parts[1] && parts[1].length >= 2) {
            context.chargeJobPart2 = parts[1].trim();
            context.hasChargeJobPart2 = true;
            console.log(`  Part 2: "${context.chargeJobPart2}"`);
        } else {
            context.chargeJobPart2 = "";
            context.hasChargeJobPart2 = false;
        }

        // Part 3: Cost Center - ONLY if it actually exists and has valid content
        if (parts.length > 2 && parts[2] && parts[2].length >= 2) {
            context.chargeJobPart3 = parts[2].trim();
            context.hasChargeJobPart3 = true;
            console.log(`  Part 3: "${context.chargeJobPart3}"`);
        } else {
            context.chargeJobPart3 = "";
            context.hasChargeJobPart3 = false;
        }

        console.log(`  ✅ ChargeJob parsed - ${parts.length} parts (hasP2: ${context.hasChargeJobPart2}, hasP3: ${context.hasChargeJobPart3})`);
    },

    /**
     * Validasi apakah element memiliki text (untuk memastikan data berhasil diinput)
     */
    validateText: async (page, params) => {
        const selector = params.selector;
        const expectedMinLength = params.minLength || 1;

        console.log(`✓ Validasi: Mengecek text di ${selector}`);

        try {
            await waitForElement(page, selector, params.timeout || 5000);

            const text = await page.$eval(selector, el => el.textContent.trim());

            if (text && text.length >= expectedMinLength && text !== '0' && text !== '0.00') {
                console.log(`  ✅ Validasi berhasil: "${text}"`);
                return true;
            } else {
                console.log(`  ⚠️  Validasi gagal: text kosong atau 0`);
                if (params.throwOnFail) {
                    throw new Error(`Validation failed: ${selector} has no valid text`);
                }
                return false;
            }
        } catch (error) {
            console.log(`  ❌ Validasi error: ${error.message}`);
            if (params.throwOnFail) {
                throw error;
            }
            return false;
        }
    },

    /**
     * forEach - Loop through array data
     * params.items: path ke array dalam context (contoh: "data.data")
     * params.itemName: nama variable untuk setiap item (contoh: "employee")
     * params.steps: array of steps yang akan dijalankan untuk setiap item
     */
    forEach: async (page, params, context, engine) => {
        // Ambil array dari context menggunakan path
        const itemsPath = params.items || params.array;
        const keys = itemsPath.split('.');
        let items = context;

        for (const key of keys) {
            items = items ? items[key] : undefined;
        }

        if (!Array.isArray(items)) {
            throw new Error(`forEach: "${itemsPath}" bukan array atau tidak ditemukan di context`);
        }

        const itemName = params.itemName || 'item';
        const steps = params.steps || [];

        console.log(`\n🔁 Loop forEach: ${items.length} items dari "${itemsPath}"`);
        console.log(`   Variable name: "${itemName}"`);
        console.log(`   Steps: ${steps.length} actions\n`);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            console.log(`\n  ┌─ Iteration ${i + 1}/${items.length} ─────`);

            // Buat context baru dengan item saat ini
            const loopContext = {
                ...context,
                [itemName]: item,
                index: i,
                isFirst: i === 0,
                isLast: i === items.length - 1
            };

            // Execute steps dengan context baru
            await engine.executeSteps(steps, loopContext, 2);
            console.log(`  └─────────────────────────\n`);
        }
    },

    /**
     * forEachProperty - Loop through object properties
     * Berguna untuk loop tanggal dalam Attendance object
     */
    forEachProperty: async (page, params, context, engine) => {
        const objectPath = params.object;
        const keys = objectPath.split('.');
        let obj = context;

        for (const key of keys) {
            obj = obj ? obj[key] : undefined;
        }

        if (!obj || typeof obj !== 'object') {
            throw new Error(`forEachProperty: "${objectPath}" bukan object atau tidak ditemukan`);
        }

        const keyName = params.keyName || 'key';
        const valueName = params.valueName || 'value';
        const steps = params.steps || [];

        const entries = Object.entries(obj);
        console.log(`\n🔁 Loop forEachProperty: ${entries.length} properties dari "${objectPath}"`);
        console.log(`   Steps: ${steps.length} actions\n`);

        for (let i = 0; i < entries.length; i++) {
            const [key, value] = entries[i];
            console.log(`\n  ┌─ Property ${i + 1}/${entries.length}: ${key} ─────`);

            const loopContext = {
                ...context,
                [keyName]: key,
                [valueName]: value,
                index: i,
                isFirst: i === 0,
                isLast: i === entries.length - 1
            };

            await engine.executeSteps(steps, loopContext, 2);
            console.log(`  └─────────────────────────\n`);
        }
    },

    /**
     * if - Conditional execution
     * params.condition: expression to evaluate (simple comparison)
     * params.thenSteps: steps to execute if true
     * params.elseSteps: steps to execute if false (optional)
     */
    if: async (page, params, context, engine) => {
        const { condition, thenSteps, elseSteps } = params;

        if (thenSteps) console.log(`   Running IF (thenSteps count: ${thenSteps.length})`);
        if (elseSteps) console.log(`   Running IF (elseSteps count: ${elseSteps.length})`);

        // Evaluate simple condition
        let result = false;

        // Simple evaluation: check if value exists and is truthy
        if (typeof condition === 'string') {
            const value = engine.substituteVariables(`\${${condition}}`, context);
            // Treat specific status strings as falsy to prevent "Regular Input"
            result = !!value &&
                value !== 'null' &&
                value !== 'undefined' &&
                value !== '0' &&
                value !== 'ALFA' &&
                value !== 'ALPHA' &&
                value !== 'OFF' &&
                value !== 'LIBUR';
        } else if (typeof condition === 'boolean') {
            result = condition;
        }

        console.log(`\n🔀 Conditional: ${condition} = ${result}`);

        if (result && thenSteps) {
            console.log(`  ✓ Executing THEN branch (${thenSteps.length} steps)`);
            await engine.executeSteps(thenSteps, context, 1);
        } else if (!result && elseSteps) {
            console.log(`  ✗ Executing ELSE branch (${elseSteps.length} steps)`);
            await engine.executeSteps(elseSteps, context, 1);
        } else {
            console.log(`  ○ No branch to execute`);
        }
    },

    /**
     * log - Debug logging
     */
    log: async (page, params, context) => {
        const message = params.message || params.text || '';
        console.log(`📝 LOG: ${message}`);
        if (params.value) {
            console.log(`   Value:`, params.value);
        }
    },
    /**
     * Retry input logic if validation element appears
     * Useful for Millware's fragile autocomplete
     * params.selector: input selector
     * params.value: value to type
     * params.index: input index (optional)
     * params.confirmKey: key to press after type (default: Enter)
     * params.validationSelector: selector for error message (e.g. "Please select Task Code")
     * params.maxRetries: max attempts (default 5)
     * params.formReentryFields: array of previous fields to re-input when validation error detected
     *   Each field: { selector, value, index?, isDropdown? }
     */
    retryInputWithValidation: async (page, params, context, engine) => {
        const { selector, value, index, validationSelector, maxRetries = 5, formReentryFields = [], stopConditionSelector, expectedFieldCount } = params;

        // CRITICAL: If expectedFieldCount is provided and target index is >= expectedFieldCount, skip immediately
        // This prevents waiting 20s for fields that don't exist (e.g., index 3 when only 2 jobs in charge job)
        if (expectedFieldCount !== undefined && index !== undefined && index >= expectedFieldCount) {
            console.log(`⏭️  Skipping input for index ${index}: expectedFieldCount is ${expectedFieldCount}`);
            return;
        }

        console.log(`🔁 Retry Input: "${value}" into ${selector} (Max Retries: ${maxRetries}, ExpectedFields: ${expectedFieldCount || 'N/A'})`);

        // Helper: Check for any visible validation error containing "Please"
        const checkForValidationErrors = async () => {
            try {
                const errorSpans = await page.$$('span[style*="color:Red"], span[style*="color: red"], span.RedText');
                for (const span of errorSpans) {
                    const isVisible = await span.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
                    });
                    if (isVisible) {
                        const text = await span.evaluate(el => el.textContent.trim());
                        if (text.toLowerCase().includes('please')) {
                            return { hasError: true, message: text };
                        }
                    }
                }
            } catch (e) { }
            return { hasError: false, message: '' };
        };

        // Helper: Re-input a single field
        const reInputField = async (field) => {
            console.log(`    🔄 Re-entering: ${field.selector}[${field.index}] = "${field.value}"`);
            let elementHandle;

            try {
                // CRITICAL: Wait for page to be stable before trying to find elements
                // ASP.NET postbacks can temporarily remove all elements from DOM
                await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 }).catch(() => { });

                // Wait for the form table to be present (indicates page has loaded)
                await page.waitForFunction(
                    () => document.querySelector('#MainContent_tblSelection') !== null,
                    { timeout: 10000 }
                ).catch(() => {
                    console.log(`    ⚠️ Form table not found, waiting...`);
                });

                // Extra stabilization wait
                await new Promise(r => setTimeout(r, 500));

                if (field.index !== undefined) {
                    // Retry loop to find element (it may not be visible immediately after postback)
                    const findStartTime = Date.now();
                    while (Date.now() - findStartTime < 15000) {
                        const elements = await page.$$(field.selector);
                        const visibleElements = [];
                        for (const el of elements) {
                            try {
                                const isVisible = await el.evaluate(node => node.offsetParent !== null);
                                if (isVisible) visibleElements.push(el);
                            } catch (e) {
                                // Element became stale, skip
                            }
                        }
                        if (visibleElements.length > field.index) {
                            elementHandle = visibleElements[field.index];
                            break;
                        }
                        await new Promise(r => setTimeout(r, 500));
                    }
                } else {
                    elementHandle = await page.$(field.selector);
                }

                if (!elementHandle) {
                    console.log(`    ⚠️ Element not found for re-entry`);
                    return;
                }

                // Focus first
                await elementHandle.click();
                await new Promise(r => setTimeout(r, 300));

                // Clear with Ctrl+A + Delete
                await page.keyboard.down('Control');
                await page.keyboard.press('a');
                await page.keyboard.up('Control');
                await page.keyboard.press('Delete');
                await new Promise(r => setTimeout(r, 200));

                // Try JavaScript-based autocomplete trigger first
                const triggerResult = await safeEvaluate((sel, idx, val) => {
                    const elements = document.querySelectorAll(sel);
                    const visibleElements = [];
                    for (const el of elements) {
                        if (el.offsetParent !== null) visibleElements.push(el);
                    }
                    if (visibleElements.length <= idx) return { success: false };

                    const el = visibleElements[idx];
                    el.value = val;

                    // Try jQuery autocomplete
                    if (window.jQuery && window.jQuery(el).autocomplete) {
                        try {
                            window.jQuery(el).autocomplete('search', val);
                            return { success: true, method: 'jquery' };
                        } catch (e) { }
                    }

                    // Fallback: dispatch events
                    ['focus', 'input', 'keydown', 'keyup', 'change'].forEach(evt => {
                        el.dispatchEvent(new Event(evt, { bubbles: true }));
                    });
                    return { success: true, method: 'events' };
                }, field.selector, field.index, field.value) || { success: false, method: 'failed' };

                console.log(`    📋 Autocomplete trigger: ${triggerResult.method}`);

                // Wait for dropdown to appear
                await new Promise(r => setTimeout(r, 800));

                // Select from dropdown
                await page.keyboard.press('ArrowDown');
                await new Promise(r => setTimeout(r, 300));
                await page.keyboard.press('Enter');
                await new Promise(r => setTimeout(r, 1500)); // Wait longer for page update

                // Verify field was filled
                const verifyResult = await elementHandle.evaluate(el => el.value || '');
                console.log(`    📋 Field value after re-entry: "${verifyResult}"`);

            } catch (e) {
                console.log(`    ⚠️ Failed to re-enter field: ${e.message}`);
            }
        };

        // Helper: Verify if input field has a value (not empty)
        // Includes retry logic for elements that may be temporarily unavailable during postbacks
        const verifyInputValue = async (sel, idx) => {
            // Retry a few times in case page is still loading
            for (let verifyRetry = 0; verifyRetry < 3; verifyRetry++) {
                try {
                    let elementHandle;
                    if (idx !== undefined) {
                        const elements = await page.$$(sel);
                        const visibleElements = [];
                        for (const el of elements) {
                            try {
                                const isVisible = await el.evaluate(node => node.offsetParent !== null);
                                if (isVisible) visibleElements.push(el);
                            } catch (e) {
                                // Element became stale, skip
                            }
                        }
                        if (visibleElements.length > idx) {
                            elementHandle = visibleElements[idx];
                        }
                    } else {
                        elementHandle = await page.$(sel);
                    }

                    if (!elementHandle) {
                        // Element not found, wait and retry
                        await new Promise(r => setTimeout(r, 500));
                        continue;
                    }

                    const inputValue = await elementHandle.evaluate(el => el.value || '');
                    return { hasValue: inputValue.trim().length > 0, value: inputValue.trim() };
                } catch (e) {
                    // Wait and retry
                    await new Promise(r => setTimeout(r, 500));
                }
            }
            return { hasValue: false, value: '' };
        };

        // Helper: Check if previous fields need to be re-entered
        const checkPreviousFieldsNeedReentry = async () => {
            for (const field of formReentryFields) {
                const result = await verifyInputValue(field.selector, field.index);
                if (!result.hasValue) {
                    console.log(`  ⚠️ Previous field ${field.selector}[${field.index}] is empty, need re-entry`);
                    return true;
                }
            }
            return false;
        };

        // Helper: Capture form state and log HTML structure for debugging
        const captureFormState = async () => {
            try {
                const formState = await page.evaluate(() => {
                    // Get all CBOBox inputs (autocomplete fields)
                    const cboBoxes = document.querySelectorAll('.ui-autocomplete-input.CBOBox');
                    const fieldValues = [];
                    cboBoxes.forEach((el, idx) => {
                        fieldValues.push({
                            index: idx,
                            value: el.value || '(empty)',
                            visible: el.offsetParent !== null
                        });
                    });

                    // Get all visible validation errors
                    const errors = [];
                    const errorSpans = document.querySelectorAll('span');
                    errorSpans.forEach(span => {
                        const style = window.getComputedStyle(span);
                        if (style.display !== 'none' && span.offsetHeight > 0) {
                            const text = span.textContent.trim();
                            if (text.toLowerCase().includes('please')) {
                                errors.push(text);
                            }
                        }
                    });

                    // Get key form elements HTML
                    const formTable = document.querySelector('#MainContent_tblSelection');
                    const formHTML = formTable ? formTable.outerHTML.substring(0, 2000) : 'Form not found';

                    return { fieldValues, errors, formHTML };
                });

                console.log('\n  ═══════════════════════════════════════════════');
                console.log('  📊 FORM STATE CAPTURE');
                console.log('  ═══════════════════════════════════════════════');
                console.log('  Field Values:');
                formState.fieldValues.forEach(f => {
                    const status = f.value === '(empty)' ? '❌' : '✅';
                    console.log(`    ${status} [${f.index}]: "${f.value}" ${f.visible ? '' : '(hidden)'}`);
                });

                if (formState.errors.length > 0) {
                    console.log('  \n  ⚠️ Validation Errors:');
                    formState.errors.forEach(e => console.log(`    - ${e}`));
                }

                console.log('  \n  📄 Form HTML (truncated):');
                console.log('  ' + formState.formHTML.substring(0, 500) + '...');
                console.log('  ═══════════════════════════════════════════════\n');

                return formState;
            } catch (e) {
                console.log(`  ⚠️ Failed to capture form state: ${e.message}`);
                return { fieldValues: [], errors: [], formHTML: '' };
            }
        };

        // Helper: Wait for element to be fully ready (visible, enabled, and stable)
        const waitForElementReady = async (sel, idx, timeoutMs = 5000) => {
            const startTime = Date.now();
            let lastValue = null;
            let stableCount = 0;

            while (Date.now() - startTime < timeoutMs) {
                try {
                    const elements = await page.$$(sel);
                    const visibleElements = [];
                    for (const el of elements) {
                        const isVisible = await el.evaluate(node => node.offsetParent !== null);
                        if (isVisible) visibleElements.push(el);
                    }

                    // Check stop condition if target not found yet
                    if ((idx === undefined || visibleElements.length <= idx) && stopConditionSelector) {
                        const stopEl = await page.$(stopConditionSelector);
                        if (stopEl) {
                            const isStopVisible = await stopEl.evaluate(node => node.offsetParent !== null && node.offsetHeight > 0);
                            if (isStopVisible) {
                                console.log(`  🛑 Stop condition met: ${stopConditionSelector} is visible. Skipping target.`);
                                return 'skipped';
                            }
                        }
                    }

                    if (idx !== undefined && visibleElements.length > idx) {
                        const el = visibleElements[idx];
                        const state = await el.evaluate(node => ({
                            enabled: !node.disabled,
                            visible: node.offsetParent !== null,
                            value: node.value || ''
                        }));

                        if (state.visible && state.enabled) {
                            // Check if value is stable (not loading)
                            if (lastValue === state.value) {
                                stableCount++;
                                if (stableCount >= 2) {
                                    console.log(`  ✅ Element [${idx}] ready: visible=${state.visible}, enabled=${state.enabled}`);
                                    return true;
                                }
                            } else {
                                lastValue = state.value;
                                stableCount = 0;
                            }
                        }
                    }
                } catch (e) { }

                await new Promise(r => setTimeout(r, 200));
            }

            console.log(`  ⚠️ Element [${idx}] not ready after ${timeoutMs}ms`);
            return false;
        };

        // Helper: Get a fresh element reference (prevents stale handle errors)
        const getFreshElement = async (sel, idx) => {
            const elements = await page.$$(sel);
            const visibleElements = [];
            for (const el of elements) {
                try {
                    const isVisible = await el.evaluate(node => node.offsetParent !== null);
                    if (isVisible) visibleElements.push(el);
                } catch (e) {
                    // Element became stale, skip it
                }
            }
            if (idx !== undefined && visibleElements.length > idx) {
                return visibleElements[idx];
            }
            return visibleElements[0] || null;
        };

        // Helper: Wait for page to be stable (no ongoing navigation)
        const waitForPageStable = async (timeoutMs = 3000) => {
            try {
                await page.waitForFunction(() => document.readyState === 'complete', { timeout: timeoutMs });
                await new Promise(r => setTimeout(r, 500)); // Extra stabilization
            } catch (e) {
                // Timeout is ok, continue
            }
        };

        // Helper: Safe evaluate that handles navigation errors
        const safeEvaluate = async (fn, ...args) => {
            for (let retry = 0; retry < 3; retry++) {
                try {
                    return await page.evaluate(fn, ...args);
                } catch (e) {
                    if (e.message.includes('context was destroyed') || e.message.includes('navigation')) {
                        console.log(`  ⚠️ Page navigated, waiting for stability...`);
                        await waitForPageStable();
                    } else {
                        throw e;
                    }
                }
            }
            return null;
        };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`  ┌─ Attempt ${attempt}/${maxRetries} ─────`);

            // STRICT ENFORCEMENT: ALWAYS check and fill previous fields BEFORE attempting current input
            // This prevents skipping to next field when prior fields are empty
            if (formReentryFields.length > 0) {
                let previousFieldsValid = false;
                let reentryAttempt = 0;
                const maxReentryAttempts = 3;

                while (!previousFieldsValid && reentryAttempt < maxReentryAttempts) {
                    reentryAttempt++;

                    // CRITICAL: Wait for page stability BEFORE checking fields
                    // ASP.NET postbacks can temporarily remove elements
                    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 }).catch(() => { });
                    await page.waitForFunction(
                        () => document.querySelector('#MainContent_tblSelection') !== null,
                        { timeout: 5000 }
                    ).catch(() => { });
                    await new Promise(r => setTimeout(r, 500));

                    // Check each previous field
                    let allFieldsFilled = true;
                    for (const field of formReentryFields) {
                        const result = await verifyInputValue(field.selector, field.index);
                        if (!result.hasValue) {
                            console.log(`  ❌ Required field [${field.index}] is EMPTY - must fill before proceeding`);
                            allFieldsFilled = false;
                        } else {
                            console.log(`  ✅ Field [${field.index}] has value: "${result.value}"`);
                        }
                    }

                    if (!allFieldsFilled) {
                        console.log(`  🔄 Re-entry attempt ${reentryAttempt}/${maxReentryAttempts}: Filling all previous fields...`);

                        // Capture form state for debugging
                        await captureFormState();

                        // Re-enter all previous fields
                        for (const field of formReentryFields) {
                            await reInputField(field);

                            // Verify this field was filled after input
                            const verifyResult = await verifyInputValue(field.selector, field.index);
                            if (!verifyResult.hasValue) {
                                console.log(`  ⚠️ Field [${field.index}] still empty after input, retrying...`);
                                await reInputField(field);
                            }
                        }
                        await new Promise(r => setTimeout(r, 1500));
                    } else {
                        previousFieldsValid = true;
                        console.log(`  ✅ All previous fields verified as filled`);
                    }
                }

                if (!previousFieldsValid) {
                    console.log(`  ❌ Could not fill previous fields after ${maxReentryAttempts} attempts`);
                    await captureFormState();
                    throw new Error(`Prerequisites not met: previous fields could not be filled`);
                }
            }

            // Also check for validation errors
            const preCheck = await checkForValidationErrors();
            if (preCheck.hasError) {
                console.log(`  ⚠️ Validation error still present: "${preCheck.message}"`);
            }

            // 0. Wait for element to be ready before proceeding
            console.log(`  ⏳ Waiting for element [${index}] to be ready...`);
            const readyState = await waitForElementReady(selector, index, 20000);
            if (readyState === 'skipped') {
                console.log(`  ⏭️  Skipping input: Stop condition met.`);
                return;
            }

            // optimization: Check if field already has a value (User requested to skip if filled)
            try {
                const currentStatus = await verifyInputValue(selector, index);
                if (currentStatus.hasValue && currentStatus.value && currentStatus.value.trim().length > 0) {
                    console.log(`  ⏭️  Field already filled with: "${currentStatus.value}". Skipping input.`);
                    return true;
                }
            } catch (e) {
                console.log(`  ⚠️ Failed to check existing value: ${e.message}. Proceeding with input.`);
            }

            // 1. Find Element (Manual logic to support incremental typing)
            let elementHandle;
            if (index !== undefined) {
                // Reuse logic from safeTypeAtIndex to find correct visible element
                // Wait for presence
                try {
                    await page.waitForFunction(
                        (sel, idx) => document.querySelectorAll(sel).length >= idx + 1,
                        { timeout: 15000 }, selector, index
                    );
                } catch (e) { } // ignore timeout, proceed to find

                // 1. Find Element (Manual logic to support incremental typing)
                // Wait loop for finding element visibility
                const findStartTime = Date.now();
                while (true) {
                    const elements = await page.$$(selector);
                    const visibleElements = [];
                    for (const el of elements) {
                        try {
                            const isVisible = await el.evaluate(node => node.offsetParent !== null);
                            if (isVisible) visibleElements.push(el);
                        } catch (e) { }
                    }

                    if (visibleElements.length > index) {
                        elementHandle = visibleElements[index];
                        break;
                    }
                    // Timeout after 20 seconds (increased for ASP.NET postbacks)
                    if (Date.now() - findStartTime > 20000) {
                        console.log(`  ❌ Element at index ${index} not found. Found ${visibleElements.length} visible.`);
                        await captureFormState();
                        // One last attempt to fetch to ensure error accuracy
                        const freshElements = await page.$$(selector);
                        throw new Error(`Element at index ${index} not found. Found ${freshElements.length} found (some might be hidden).`);
                    }
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                await waitForElement(page, selector);
                elementHandle = await page.$(selector);
            }

            // 2. Ensure proper focus and clear input using JavaScript (more reliable)
            console.log(`  🔍 Focusing and clearing element...`);

            try {
                // Click to focus (may fail if stale, that's ok)
                await elementHandle.click();
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                // Element stale, get fresh one
                elementHandle = await getFreshElement(selector, index);
                if (elementHandle) await elementHandle.click();
                await new Promise(r => setTimeout(r, 200));
            }

            // Use page.keyboard and JavaScript for clearing (more reliable)
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await page.keyboard.press('Delete');
            await new Promise(r => setTimeout(r, 200));

            // 3. Smart Incremental Typing with Autocomplete Triggering
            console.log("  ⌨️ Smart Typing...");
            let foundSingleOption = false;

            // OPTIMIZATION: Truncate value by 3 characters ONLY for Charge Job fields (index > 0)
            // Employee/PTRJ ID (index 0) must be typed in FULL
            let truncatedValue;
            if (index === 0) {
                // Employee field - type FULL value
                truncatedValue = value;
                console.log(`  📝 Typing FULL value (Employee): "${truncatedValue}"`);
            } else {
                // Charge Job fields - truncate last 3 characters
                truncatedValue = value.length > 3 ? value.slice(0, -3) : value;
                console.log(`  📝 Typing truncated value (Charge Job): "${truncatedValue}" (original: "${value}")`);
            }

            // First, try to trigger autocomplete using JavaScript (more reliable)
            const triggerAutocomplete = await safeEvaluate((sel, idx, val) => {
                const elements = document.querySelectorAll(sel);
                const visibleElements = [];
                for (const el of elements) {
                    if (el.offsetParent !== null) visibleElements.push(el);
                }
                if (visibleElements.length <= idx) return { success: false, error: 'Element not found' };

                const el = visibleElements[idx];

                // Set value (truncated)
                el.value = val;

                // Trigger all the events that jQuery UI autocomplete listens for
                const events = ['focus', 'input', 'keydown', 'keyup', 'change'];
                events.forEach(eventType => {
                    const event = new Event(eventType, { bubbles: true, cancelable: true });
                    el.dispatchEvent(event);
                });

                // Also try jQuery trigger if jQuery is available
                if (window.jQuery && window.jQuery(el).autocomplete) {
                    try {
                        window.jQuery(el).autocomplete('search', val);
                        return { success: true, method: 'jquery-autocomplete' };
                    } catch (e) {
                        // Fall through to keyboard approach
                    }
                }

                return { success: true, method: 'events' };
            }, selector, index, truncatedValue) || { success: false, method: 'failed' };

            console.log(`  📋 Autocomplete trigger: ${JSON.stringify(triggerAutocomplete)}`);

            // Wait for dropdown to appear (and page to stabilize)
            await new Promise(r => setTimeout(r, 800));
            await waitForPageStable(2000);

            // Check if dropdown appeared (using safe evaluate for navigation handling)
            const dropdownAfterTrigger = await safeEvaluate(() => {
                const lists = document.querySelectorAll('ul.ui-autocomplete');
                for (const list of lists) {
                    if (list.style.display !== 'none' && list.offsetParent !== null) {
                        const items = list.querySelectorAll('li.ui-menu-item');
                        return { visible: true, itemCount: items.length };
                    }
                }
                return { visible: false, itemCount: 0 };
            }) || { visible: false, itemCount: 0 };

            if (!dropdownAfterTrigger.visible) {
                console.log(`  ⚠️ Dropdown not visible after JavaScript trigger. Trying keyboard approach...`);

                // Fallback: Re-focus and type character by character
                try {
                    elementHandle = await getFreshElement(selector, index);
                    if (elementHandle) await elementHandle.click();
                } catch (e) { }
                await new Promise(r => setTimeout(r, 200));

                // Clear first
                await page.keyboard.down('Control');
                await page.keyboard.press('a');
                await page.keyboard.up('Control');
                await page.keyboard.press('Delete');
                await new Promise(r => setTimeout(r, 200));

                // Type each character using page.keyboard (more reliable)
                for (let i = 0; i < value.length; i++) {
                    await page.keyboard.type(value[i]);

                    // Dispatch input event after each character
                    await page.evaluate((sel, idx) => {
                        const elements = document.querySelectorAll(sel);
                        const visibleElements = [];
                        for (const el of elements) {
                            if (el.offsetParent !== null) visibleElements.push(el);
                        }
                        if (visibleElements.length > idx) {
                            const el = visibleElements[idx];
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                        }
                    }, selector, index);

                    await new Promise(r => setTimeout(r, 150));

                    // Check for dropdown
                    const dropdown = await page.evaluate(() => {
                        const lists = document.querySelectorAll('ul.ui-autocomplete');
                        for (const list of lists) {
                            if (list.style.display !== 'none' && list.offsetParent !== null) {
                                const items = list.querySelectorAll('li.ui-menu-item');
                                return items.length;
                            }
                        }
                        return 0;
                    });

                    if (dropdown === 1) {
                        console.log(`  ✨ Single option found after typing \"${value.substring(0, i + 1)}\"`);
                        foundSingleOption = true;
                        break;
                    } else if (dropdown > 0) {
                        console.log(`  📋 Dropdown visible with ${dropdown} options after "${value.substring(0, i + 1)}"`);
                    }
                }
            } else {
                console.log(`  📋 Dropdown appeared with ${dropdownAfterTrigger.itemCount} items`);
                if (dropdownAfterTrigger.itemCount === 1) foundSingleOption = true;
            }

            // 4. Confirm Selection
            await new Promise(r => setTimeout(r, 500)); // Stabilize

            // Check if dropdown is visible before selecting
            const dropdownCheck = await page.evaluate(() => {
                const lists = document.querySelectorAll('ul.ui-autocomplete');
                for (const list of lists) {
                    if (list.style.display !== 'none' && list.offsetParent !== null) {
                        const items = list.querySelectorAll('li.ui-menu-item');
                        return { visible: true, itemCount: items.length };
                    }
                }
                return { visible: false, itemCount: 0 };
            });

            if (!dropdownCheck.visible) {
                console.log(`  ⚠️ No dropdown visible after typing. Will try ArrowDown anyway.`);
            } else {
                console.log(`  📋 Dropdown visible with ${dropdownCheck.itemCount} items.`);
            }

            // Ensure focus before selecting (with stale handle protection)
            try {
                elementHandle = await getFreshElement(selector, index);
                if (elementHandle) await elementHandle.click();
            } catch (e) { }
            await new Promise(r => setTimeout(r, 200));

            let selectionSuccess = false;
            if (dropdownCheck.visible) {
                console.log("  🖱️ Attempting to click dropdown option directly...");
                // Try clicking the first item directly via JS
                selectionSuccess = await safeEvaluate(() => {
                    const lists = document.querySelectorAll('ul.ui-autocomplete');
                    for (const list of lists) {
                        if (list.style.display !== 'none' && list.offsetParent !== null) {
                            const item = list.querySelector('li.ui-menu-item');
                            if (item) {
                                // jQuery UI often puts the click listener on the inner DIV or A tag
                                const target = item.querySelector('div, a') || item;

                                // Simulate full mouse event sequence including mouseover
                                target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
                                target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                                target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                                target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                return true;
                            }
                        }
                    }
                    return false;
                });
            }

            if (selectionSuccess) {
                console.log("  ✅ Clicked dropdown option successfully");
            } else {
                console.log("  ⌨️  Click failed/unavailable. Using ArrowDown + Enter...");
                await page.keyboard.press('ArrowDown');
                await new Promise(r => setTimeout(r, 300));
                await page.keyboard.press('Enter');
            }

            // 5. Wait for potential error or success
            await new Promise(r => setTimeout(r, 2000));

            // 6. Check validation - now using comprehensive check
            const postCheck = await checkForValidationErrors();

            // Also check specific validation selector if provided
            let hasSpecificError = false;
            if (validationSelector) {
                try {
                    const errorEl = await page.$(validationSelector);
                    if (errorEl) {
                        const isVisible = await errorEl.evaluate(el => {
                            const style = window.getComputedStyle(el);
                            return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
                        });
                        if (isVisible) {
                            const errorText = await errorEl.evaluate(el => el.textContent.trim());
                            console.log(`  ⚠️ Error detected: "${errorText}"`);
                            hasSpecificError = true;
                        }
                    }
                } catch (e) { }
            }

            // 7. Verify the current field actually has a value
            const fieldValue = await verifyInputValue(selector, index);
            if (!fieldValue.hasValue) {
                console.log(`  ⚠️ Field is empty after input attempt`);
                hasSpecificError = true;
            } else {
                console.log(`  📋 Field value: "${fieldValue.value}"`);
            }

            if (!postCheck.hasError && !hasSpecificError) {
                console.log(`  ✅ Input Success`);
                console.log(`  └─────────────────────────\n`);
                return; // Success!
            }

            console.log(`  ❌ Attempt ${attempt} failed.`);
            // Capture form state for debugging when attempt fails
            if (attempt === maxRetries) {
                console.log(`  🔍 Capturing final form state for debugging...`);
                await captureFormState();
            }
            console.log(`  └─────────────────────────\n`);

            await new Promise(r => setTimeout(r, 1000));
        }

        throw new Error(`Failed to input "${value}" after ${maxRetries} attempts.`);
    },

    /**
     * Verify that Add button click was successful by checking for page reload
     * params.timeout: max time to wait for reload (default 10000ms)
     * params.successSelector: element that should be empty/reset after successful add (e.g., employee field)
     */
    verifyAddButtonClicked: async (page, params, context, engine) => {
        const timeout = params.timeout || 10000;
        const successSelector = params.successSelector || '.ui-autocomplete-input.CBOBox';
        const successIndex = params.successIndex !== undefined ? params.successIndex : 0;

        console.log(`🔍 Verifying Add button was clicked (timeout: ${timeout}ms)...`);

        const startTime = Date.now();
        let previousValue = null;
        let reloadDetected = false;

        // Get initial value of the first field
        try {
            const elements = await page.$$(successSelector);
            const visibleElements = [];
            for (const el of elements) {
                const isVisible = await el.evaluate(node => node.offsetParent !== null);
                if (isVisible) visibleElements.push(el);
            }
            if (visibleElements.length > successIndex) {
                previousValue = await visibleElements[successIndex].evaluate(el => el.value || '');
            }
        } catch (e) {
            console.log(`  ⚠️ Could not get initial field value`);
        }

        // Wait for page readyState to change (indicates reload started)
        while (Date.now() - startTime < timeout) {
            try {
                // Check if document is reloading
                const readyState = await page.evaluate(() => document.readyState);
                if (readyState === 'loading' || readyState === 'interactive') {
                    console.log(`  📄 Page is reloading (readyState: ${readyState})`);
                    reloadDetected = true;
                }

                // Also check if the employee field was cleared (indicates successful add)
                const elements = await page.$$(successSelector);
                const visibleElements = [];
                for (const el of elements) {
                    try {
                        const isVisible = await el.evaluate(node => node.offsetParent !== null);
                        if (isVisible) visibleElements.push(el);
                    } catch (e) { }
                }

                if (visibleElements.length > successIndex) {
                    const currentValue = await visibleElements[successIndex].evaluate(el => el.value || '');
                    // If previous value was set and now it's empty, reload happened
                    if (previousValue && previousValue.length > 0 && currentValue.length === 0) {
                        console.log(`  ✅ Add successful: Field was cleared (previous: "${previousValue}" → current: empty)`);
                        reloadDetected = true;
                        break;
                    }
                    // If form table disappeared and reappeared, that's also a reload
                    if (reloadDetected && readyState === 'complete') {
                        console.log(`  ✅ Page reload completed`);
                        break;
                    }
                }
            } catch (e) {
                // During reload, page might be unstable - that's expected
                if (e.message.includes('context was destroyed') || e.message.includes('navigation')) {
                    console.log(`  📄 Page navigation detected`);
                    reloadDetected = true;
                }
            }

            await new Promise(r => setTimeout(r, 500));
        }

        if (reloadDetected) {
            console.log(`  ✅ Add button click verified - page reloaded`);
            // Wait for page to fully stabilize
            try {
                await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) { }
            return true;
        } else {
            console.log(`  ⚠️ Add button verification timeout - page may not have reloaded`);
            return false;
        }
    },
};

module.exports = actions;
