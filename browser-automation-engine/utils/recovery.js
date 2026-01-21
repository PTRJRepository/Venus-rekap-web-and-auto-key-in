const fs = require('fs');
const path = require('path');

class RecoveryManager {
    constructor(engineId) {
        this.engineId = engineId;
        this.stateFile = path.join(__dirname, '..', 'logs', `state_engine_${engineId}.json`);
        this.ensureLogsDir();
    }

    ensureLogsDir() {
        const logsDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    /**
     * Inspects the DOM to find the first empty input field among the steps.
     * This corresponds to the user's request: "Identify the top empty form element"
     * @param {object} page - Puppeteer page instance
     * @param {Array} steps - List of steps to check (must have 'selector' property)
     * @returns {Promise<number>} - Index of the first empty step, or -1 if all filled
     */
    async findFirstEmptyStepIndex(page, steps) {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            
            // Only check steps that are input/type actions and have a selector
            if (['type', 'select', 'click'].includes(step.action) && step.params && step.params.selector) {
                try {
                    const selector = step.params.selector;
                    
                    // Check if element exists
                    const exists = await page.$(selector);
                    if (!exists) continue; // Skip check if element not found (maybe dynamic)

                    // Get value
                    const value = await page.$eval(selector, el => {
                        if (el.tagName === 'SELECT') return el.value;
                        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                            if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
                            return el.value;
                        }
                        return el.innerText;
                    });

                    // Check if empty (falsy or empty string)
                    if (value === '' || value === null || value === undefined) {
                        console.log(`[Recovery] Found first empty field at step ${i + 1}: ${selector}`);
                        return i;
                    }
                } catch (e) {
                    // Ignore errors during check (e.g. selector invalid for this check)
                }
            }
        }
        return -1; // All checked steps appear filled
    }

    /**
     * Checks if a specific "Task Code" field is filled.
     * User request: "If taskcode form element already has content, it can be skipped"
     * @param {object} page 
     * @param {string} taskCodeSelector 
     * @returns {Promise<boolean>}
     */
    async isTaskCodeFilled(page, taskCodeSelector) {
        try {
            const val = await page.$eval(taskCodeSelector, el => el.value);
            const isFilled = val && val.trim().length > 0;
            if (isFilled) {
                console.log(`[Recovery] Task Code field (${taskCodeSelector}) is already filled: "${val}". Skipping...`);
            }
            return isFilled;
        } catch (e) {
            return false;
        }
    }

    /**
     * Smart Validation: Validates a single step against the current DOM state.
     * Returns whether the step should be executed or skipped.
     * 
     * @param {object} page - Puppeteer page
     * @param {object} step - The step object
     * @param {object} params - The substituted params for the step
     * @returns {Promise<object>} { shouldSkip: boolean, reason: string, currentValue: any }
     */
    async validateStep(page, step, params) {
        // We only validate 'type' (input) and 'select' (dropdown) actions.
        // Clicks, waits, and other actions must generally be executed to ensure flow.
        if (!['type', 'select'].includes(step.action)) {
            return { shouldSkip: false, reason: 'Action type requires execution' };
        }

        if (!params || !params.selector) {
            return { shouldSkip: false, reason: 'No selector provided' };
        }

        try {
            // Check if element exists
            const element = await page.$(params.selector);
            if (!element) {
                return { shouldSkip: false, reason: 'Element not found in DOM' };
            }

            // Get current value from DOM
            const currentVal = await page.$eval(params.selector, el => {
                if (el.tagName === 'SELECT') return el.value;
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
                    return el.value;
                }
                return el.innerText;
            });

            // Clean values for comparison
            const valStr = String(currentVal || '').trim();
            const expectedStr = String(params.value || '').trim();

            // Logic 1: Exact Match (if expected value is provided)
            if (expectedStr && valStr === expectedStr) {
                return { 
                    shouldSkip: true, 
                    reason: '✅ Already Filled (Exact Match)', 
                    currentValue: valStr 
                };
            }

            // Logic 2: Fuzzy Match for Selects (sometimes value vs text differs, simplified here)
            // If the field is NOT empty, and we are in a recovery mode context, 
            // we might assume it's correct to avoid overwriting.
            // BUT, strictly speaking, if it differs, we should update it.
            // User requirement: "see what element was last filled... if taskcode filled, skip"
            
            // Special handling for Task Code or fields that should not be overwritten if present
            const isTaskCode = params.selector.toLowerCase().includes('taskcode') || 
                               params.selector.toLowerCase().includes('kodetugas');

            if (isTaskCode && valStr.length > 0) {
                 return { 
                    shouldSkip: true, 
                    reason: `✅ Task Code present (${valStr})`, 
                    currentValue: valStr 
                };
            }

            if (valStr.length > 0) {
                 // It has a value, but it doesn't match expected. 
                 // Usually we should overwrite to correct it.
                 return { 
                     shouldSkip: false, 
                     reason: `⚠️ Value Mismatch (Current: "${valStr}" vs Expected: "${expectedStr}")`,
                     currentValue: valStr
                 };
            }

            // If empty, obviously don't skip
            return { shouldSkip: false, reason: 'Field is empty', currentValue: valStr };

        } catch (error) {
            return { shouldSkip: false, reason: `Validation error: ${error.message}` };
        }
    }

    /**
     * Save current execution state
     */
    saveState(data) {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify({
                timestamp: new Date().toISOString(),
                ...data
            }, null, 2));
        } catch (e) {
            console.error('[Recovery] Failed to save state:', e.message);
        }
    }

    /**
     * Load last execution state
     */
    loadState() {
        if (fs.existsSync(this.stateFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    clearState() {
        if (fs.existsSync(this.stateFile)) {
            fs.unlinkSync(this.stateFile);
        }
    }
}

module.exports = RecoveryManager;
