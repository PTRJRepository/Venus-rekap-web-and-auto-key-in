const { waitForElement, safeType, safeTypeAtIndex } = require('../utils/selectors');

const actions = {
    /**
     * Navigasi ke URL
     */
    navigate: async (page, params) => {
        console.log(`🔄 Navigasi ke: ${params.url}`);
        await page.goto(params.url, { waitUntil: 'networkidle2', timeout: 60000 });
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
                             for(const el of els) if(el.offsetParent !== null) count++;
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
            await new Promise(r => setTimeout(r, 100)); // Stabilize

            if (foundSingleOption) {
                 console.log("  ⌨️  Selecting single option with ArrowDown + Enter...");
                 await page.keyboard.press('ArrowDown');
                 await new Promise(r => setTimeout(r, 50));
                 await page.keyboard.press('Enter');
            } else {
                // Fallback: If we finished typing and never found a single option (or 0 options),
                // we try to select the first one anyway if available.
                console.log(`  ⚠️  Finished typing without isolating single option. Selecting first available.`);
                await page.keyboard.press('ArrowDown');
                await new Promise(r => setTimeout(r, 100));
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
     * Mengklik elemen
     */
    click: async (page, params) => {
        console.log(`🖱️  Mengklik elemen: ${params.selector}`);
        await waitForElement(page, params.selector, params.timeout || 10000);
        await page.click(params.selector);
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
     */
    parseChargeJob: async (page, params, context, engine) => {
        const chargeJob = params.chargeJob || params.value || '';
        console.log(`🔍 Parsing ChargeJob: "${chargeJob}"`);

        // Split by '/'
        const parts = chargeJob.split('/').map(p => p.trim());

        // Store DIRECTLY in context (top-level) for easy access
        // Part 1: Task Code
        if (parts.length > 0 && parts[0]) {
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

        // Part 2: Resource
        if (parts.length > 1 && parts[1]) {
            context.chargeJobPart2 = parts[1].trim();
            console.log(`  Part 2: "${context.chargeJobPart2}"`);
        } else {
            context.chargeJobPart2 = "";
        }

        // Part 3: Cost Center
        if (parts.length > 2 && parts[2]) {
            context.chargeJobPart3 = parts[2].trim();
            console.log(`  Part 3: "${context.chargeJobPart3}"`);
        } else {
            context.chargeJobPart3 = "";
        }

        console.log(`  ✅ ChargeJob parsed successfully - variables stored in context`);
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
     * params.maxRetries: max attempts (default 3)
     */
    retryInputWithValidation: async (page, params, context, engine) => {
        const { selector, value, index, validationSelector, maxRetries = 5 } = params;

        console.log(`🔁 Retry Input: "${value}" into ${selector} (Max Retries: ${maxRetries})`);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`  ┌─ Attempt ${attempt}/${maxRetries} ─────`);

            // 1. Find Element (Manual logic to support incremental typing)
            let elementHandle;
            if (index !== undefined) {
                // Reuse logic from safeTypeAtIndex to find correct visible element
                // Wait for presence
                try {
                    await page.waitForFunction(
                        (sel, idx) => document.querySelectorAll(sel).length >= idx + 1,
                        { timeout: 5000 }, selector, index
                    );
                } catch (e) { } // ignore timeout, proceed to find

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
            await elementHandle.click({ clickCount: 3 });
            await elementHandle.press('Backspace');
            await new Promise(r => setTimeout(r, 200));

            // 3. Smart Incremental Typing
            // "Ketik sampai sisa 1 opsi"
            console.log("  ⌨️  Smart Typing...");
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

            // 4. Confirm Selection
            await new Promise(r => setTimeout(r, 100)); // Stabilize

            if (foundSingleOption) {
                // Select the single option with keyboard
                console.log("  ⌨️  Selecting single option with ArrowDown + Enter...");
                await page.keyboard.press('ArrowDown');
                await new Promise(r => setTimeout(r, 50));
                await page.keyboard.press('Enter');
            } else {
                // Standard fallback
                await page.keyboard.press('ArrowDown');
                await new Promise(r => setTimeout(r, 100));
                await page.keyboard.press('Enter');
            }

            // 5. Wait for potential error or success
            await new Promise(r => setTimeout(r, 2000));

            // 6. Check validation
            let hasError = false;
            try {
                const errorEl = await page.$(validationSelector);
                if (errorEl) {
                    const isVisible = await errorEl.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
                    });
                    if (isVisible) {
                        const errorText = await errorEl.evaluate(el => el.textContent.trim());
                        console.log(`  ⚠️  Error detected: "${errorText}"`);
                        hasError = true;
                    }
                }
            } catch (e) { }

            if (!hasError) {
                console.log(`  ✅ Input Success`);
                console.log(`  └─────────────────────────\n`);
                return; // Success!
            }

            console.log(`  ❌ Attempt ${attempt} failed.`);
            console.log(`  └─────────────────────────\n`);

            await new Promise(r => setTimeout(r, 1000));
        }

        throw new Error(`Failed to input "${value}" after ${maxRetries} attempts.`);
    },
};

module.exports = actions;
