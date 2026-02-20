import { ActionHandler, ActionContext, waitForSelector } from './types';

// --- BROWSER ACTIONS ---

export const navigateAction: ActionHandler = {
    type: 'navigate',
    async execute(ctx) {
        let url = ctx.params.url;
        if (!url) throw new Error('URL is required');

        ctx.logger(`🌐 Navigating to ${url}`);
        console.log(`[Action:Navigate] URL: ${url}`);

        const isHttps = url.startsWith('https://');
        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[Action:Navigate] Attempt ${attempt}/${maxRetries}`);
                await ctx.page.goto(url, {
                    waitUntil: 'networkidle0',
                    timeout: 60000
                });
                ctx.logger(`✅ Loaded ${url}`, 'success');
                console.log(`[Action:Navigate] Success: ${url}`);
                return;
            } catch (gotoError: any) {
                lastError = gotoError;
                console.warn(`[Action:Navigate] Attempt ${attempt} failed:`, gotoError.message);
                
                // If we tried HTTPS and got SSL error, retry with HTTP
                if (isHttps && gotoError.message?.includes('ERR_SSL_PROTOCOL_ERROR')) {
                    ctx.logger(`⚠️ SSL error, retrying with HTTP...`, 'warn');
                    console.log(`[Action:Navigate] SSL error, falling back to HTTP`);
                    const httpUrl = url.replace('https://', 'http://');
                    try {
                        await ctx.page.goto(httpUrl, {
                            waitUntil: 'networkidle0',
                            timeout: 60000
                        });
                        ctx.logger(`✅ Loaded ${httpUrl}`, 'success');
                        console.log(`[Action:Navigate] Success via HTTP: ${httpUrl}`);
                        return;
                    } catch (httpError: any) {
                        lastError = httpError;
                    }
                }
                
                // Handle specific network errors
                if (gotoError.message?.includes('net::ERR_NAME_NOT_RESOLVED')) {
                    throw new Error(`DNS Error: Cannot resolve ${url}`);
                }
                if (gotoError.message?.includes('net::ERR_CONNECTION_REFUSED')) {
                    throw new Error(`Connection refused: ${url}`);
                }
                if (gotoError.message?.includes('net::ERR_CONNECTION_TIMED_OUT')) {
                    ctx.logger(`⚠️ Connection timed out, attempt ${attempt}/${maxRetries}...`, 'warn');
                }
                
                // Wait before retry (exponential backoff)
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
        }
        
        console.error(`[Action:Navigate] Failed after ${maxRetries} attempts: ${lastError?.message}`);
        throw new Error(`Navigation failed after ${maxRetries} attempts: ${lastError?.message}`);
    }
};

export const clickAction: ActionHandler = {
    type: 'click',
    async validate(ctx) {
        const { selector } = ctx.params;
        if (!selector) return false;
        try {
            await ctx.page.waitForSelector(selector, { visible: true, timeout: 5000 });
            return true;
        } catch {
            ctx.logger(`❌ Validation failed: ${selector} not visible/found`, 'error');
            return false;
        }
    },
    async execute(ctx) {
        const { selector, timeout } = ctx.params;
        // if (!selector) throw new Error('Selector is required'); // Already checked in validate if we use strict mode, but strict mode isn't default yet.
        ctx.logger(`🖱️ Clicking ${selector}`);
        await waitForSelector(ctx.page, selector, timeout);
        try {
            await ctx.page.click(selector);
        } catch {
            ctx.logger(`⚠️ Standard click failed, using JS click`, 'warn');
            await ctx.page.evaluate((s) => {
                (document.querySelector(s) as HTMLElement)?.click();
            }, selector);
        }
        ctx.logger(`✅ Clicked ${selector}`, 'success');
    }
};

export const typeAction: ActionHandler = {
    type: 'type',
    async validate(ctx) {
        const { selector } = ctx.params;
        if (!selector) return false;
        try {
            await ctx.page.waitForSelector(selector, { visible: true, timeout: 5000 });
            return true;
        } catch {
            ctx.logger(`❌ Validation failed: ${selector} not visible/found`, 'error');
            return false;
        }
    },
    async execute(ctx) {
        const { selector, value, smartSelect } = ctx.params;
        // if (!selector) throw new Error('Selector is required');
        ctx.logger(`⌨️ Typing "${value}" into ${selector}`);
        await waitForSelector(ctx.page, selector);

        if (smartSelect) {
            // Simple autocomplete simulation
            await ctx.page.type(selector, value);
            await new Promise(r => setTimeout(r, 500));
            await ctx.page.keyboard.press('ArrowDown');
            await ctx.page.keyboard.press('Enter');
        } else {
            await ctx.page.type(selector, String(value));
        }
        ctx.logger(`✅ Typed "${value}"`, 'success');
    }
};

// ── select (for dropdown selects) ──
export const selectAction: ActionHandler = {
    type: 'select',
    async validate(ctx) {
        const { selector } = ctx.params;
        if (!selector) return false;
        try {
            await ctx.page.waitForSelector(selector, { visible: true, timeout: 5000 });
            return true;
        } catch {
            ctx.logger(`❌ Validation failed: ${selector} not visible/found`, 'error');
            return false;
        }
    },
    async execute(ctx) {
        const { selector, value } = ctx.params;
        ctx.logger(`🎯 Selecting "${value}" in ${selector}`);
        await waitForSelector(ctx.page, selector);
        await ctx.page.select(selector, String(value));
        ctx.logger(`✅ Selected "${value}"`, 'success');
    }
};

export const pressKeyAction: ActionHandler = {
    type: 'pressKey',
    async execute(ctx) {
        const key = ctx.params.key || 'Enter';
        ctx.logger(`⌨️ Pressing ${key}`);
        await ctx.page.keyboard.press(key);
    }
};

// --- FLOW/UTILITY ---

export const waitAction: ActionHandler = {
    type: 'wait',
    async execute(ctx) {
        const duration = ctx.params.duration || 1000;
        ctx.logger(`💤 Waiting ${duration}ms`);
        await new Promise(r => setTimeout(r, duration));
    }
};

export const waitForElementAction: ActionHandler = {
    type: 'waitForElement',
    async execute(ctx) {
        const { selector, timeout } = ctx.params;
        ctx.logger(`👁️ Waiting for ${selector}`);
        await waitForSelector(ctx.page, selector, timeout);
        ctx.logger(`✅ Found ${selector}`, 'success');
    }
};

export const screenshotAction: ActionHandler = {
    type: 'screenshot',
    async execute(ctx) {
        const filename = ctx.params.filename || `shot_${Date.now()}.png`;
        ctx.logger(`📸 Screenshot: ${filename}`);
        await ctx.page.screenshot({ path: filename });
    }
};

export const javascriptAction: ActionHandler = {
    type: 'javascript',
    async execute(ctx) {
        const { script, saveTo } = ctx.params;
        ctx.logger(`🖥️ Running JS`);
        const res = await ctx.page.evaluate((s) => new Function(s)(), script);
        if (saveTo) ctx.variables[saveTo] = res;
        ctx.logger(`✅ JS Executed`, 'success');
    }
};

// ... other actions (scroll, extract) can be added similarly
export const scrollAction: ActionHandler = {
    type: 'scroll',
    async execute(ctx) {
        const { selector, y } = ctx.params;
        if (selector) {
            await ctx.page.evaluate((s) => document.querySelector(s)?.scrollIntoView(), selector);
        } else if (y) {
            await ctx.page.evaluate((y) => window.scrollTo(0, y), y);
        }
    }
};

export const extractAction: ActionHandler = {
    type: 'extract',
    async execute(ctx) {
        const { selector, attribute, saveTo } = ctx.params;
        const val = await ctx.page.evaluate((s, a) => {
            const el = document.querySelector(s);
            return a === 'innerText' ? (el as HTMLElement).innerText : el?.getAttribute(a);
        }, selector, attribute || 'innerText');
        if (saveTo) ctx.variables[saveTo] = val;
        ctx.logger(`📋 Extracted: ${val}`, 'success');
    }
};

// ── setVariable ──
// Sets a runtime variable (supports deep paths like "metadata.employeeInputFailed")
export const setVariableAction: ActionHandler = {
    type: 'setVariable',
    async execute(ctx) {
        const { variable, value } = ctx.params;
        if (!variable) return;

        // Support dot-notation paths
        const parts = variable.split('.');
        if (parts.length === 1) {
            ctx.variables[variable] = value;
        } else {
            let target = ctx.variables;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
                    target[parts[i]] = {};
                }
                target = target[parts[i]];
            }
            target[parts[parts.length - 1]] = value;
        }
        ctx.logger(`📝 Set ${variable} = ${JSON.stringify(value)}`);
    }
};

// ── typeInput (legacy alias for type) ──
export const typeInputAction: ActionHandler = {
    type: 'typeInput',
    async execute(ctx) {
        return typeAction.execute(ctx);
    }
};

export const noteAction: ActionHandler = {
    type: 'note',
    async execute(ctx) {
        ctx.logger(`📝 Note reached: ${ctx.params.text?.substring(0, 30) || 'Image'}`);
        // Do nothing else, it's just documentation
    }
};
