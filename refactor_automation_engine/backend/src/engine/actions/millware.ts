import { ActionHandler, ActionContext, waitForSelector } from './types';

/**
 * Millware-specific action handlers.
 * These actions are domain-specific to the Millware Task Register system.
 */

// ── retryInputWithValidation ──
// Types into an autocomplete field (by index), waits, presses ArrowDown/Enter,
// then checks a validation element. Retries if validation fails.
export const retryInputWithValidationAction: ActionHandler = {
    type: 'retryInputWithValidation',
    async execute(ctx) {
        const { selector, index, value, validationSelector, maxRetries = 3 } = ctx.params;
        const idx = index ?? 0;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            ctx.logger(`🔄 Attempt ${attempt}/${maxRetries}: input "${value}" → ${selector}[${idx}]`);

            // Find the element by index
            const elements = await ctx.page.$$(selector);
            if (!elements[idx]) throw new Error(`Element ${selector}[${idx}] not found`);

            // Clear and type
            await elements[idx].click({ clickCount: 3 });
            await elements[idx].type(String(value));
            await new Promise(r => setTimeout(r, 800));
            await ctx.page.keyboard.press('ArrowDown');
            await new Promise(r => setTimeout(r, 300));
            await ctx.page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 2000));

            // Check validation
            if (validationSelector) {
                const errorVisible = await ctx.page.evaluate((sel) => {
                    const el = document.querySelector(sel) as HTMLElement;
                    return el && el.style.display !== 'none' && el.offsetParent !== null;
                }, validationSelector);

                if (!errorVisible) {
                    ctx.logger(`✅ Input validated on attempt ${attempt}`, 'success');
                    return;
                }
                ctx.logger(`⚠️ Validation error detected, retrying...`, 'warn');
            } else {
                ctx.logger(`✅ Input done (no validation)`, 'success');
                return;
            }
        }
        ctx.logger(`❌ Max retries reached for ${selector}[${idx}]`, 'error');
    }
};

// ── parseChargeJob ──
// Splits a ChargeJob string like "TASK-001 / ACCT-01 / SUB-01" into parts
export const parseChargeJobAction: ActionHandler = {
    type: 'parseChargeJob',
    async execute(ctx) {
        const chargeJob = ctx.params.chargeJob || '';
        const parts = chargeJob.split('/').map((s: string) => s.trim());

        ctx.variables['chargeJobPart1Clean'] = (parts[0] || '').replace(/^0+/, '') || parts[0];
        ctx.variables['chargeJobPart2'] = parts[1] || '';
        ctx.variables['chargeJobPart3'] = parts[2] || '';
        ctx.variables['expectedFieldCount'] = parts.length;

        ctx.logger(`📋 ChargeJob parsed: [${parts.join(' | ')}]`);
    }
};

// ── formatDate ──
// Converts date strings to DD/MM/YYYY format for Millware input
export const formatDateAction: ActionHandler = {
    type: 'formatDate',
    async execute(ctx) {
        const { date, saveTo = 'formattedDate' } = ctx.params;
        let d: Date;

        if (typeof date === 'string' && date.includes('-')) {
            d = new Date(date);
        } else {
            d = new Date(date);
        }

        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const formatted = `${dd}/${mm}/${yyyy}`;

        ctx.variables[saveTo] = formatted;
        ctx.logger(`📅 Date formatted: ${date} → ${formatted}`);
    }
};

// ── checkPageAndNavigate ──
// Recovery action: checks if page is on List/Detail view and navigates back to input form
export const checkPageAndNavigateAction: ActionHandler = {
    type: 'checkPageAndNavigate',
    async execute(ctx) {
        const url = ctx.page.url();
        if (url.includes('List') || url.includes('Det')) {
            ctx.logger(`⚠️ Page recovery: navigating back to input form`, 'warn');
            await ctx.page.goto(
                'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterDet.aspx',
                { waitUntil: 'domcontentloaded', timeout: 30000 }
            );
            await new Promise(r => setTimeout(r, 2000));
        }
    }
};

// ── checkEmployeeInputSuccess ──
// Checks if employee input succeeded by looking at validation error visibility
export const checkEmployeeInputSuccessAction: ActionHandler = {
    type: 'checkEmployeeInputSuccess',
    async execute(ctx) {
        const { validationErrorSelector, timeout = 2000 } = ctx.params;
        await new Promise(r => setTimeout(r, timeout));

        const hasError = await ctx.page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            return el && el.style.display !== 'none' && el.offsetParent !== null;
        }, validationErrorSelector);

        if (hasError) {
            ctx.variables['metadata'] = ctx.variables['metadata'] || {};
            ctx.variables['metadata']['employeeInputFailed'] = true;
            ctx.logger(`❌ Employee input failed (validation error visible)`, 'error');
        } else {
            ctx.logger(`✅ Employee input succeeded`);
        }
    }
};

// ── validateText ──
// Validates that an element contains text of a minimum length
export const validateTextAction: ActionHandler = {
    type: 'validateText',
    async execute(ctx) {
        const { selector, minLength = 1, throwOnFail = false } = ctx.params;
        const text = await ctx.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el ? (el as HTMLElement).innerText || el.textContent || '' : '';
        }, selector);

        if (text.trim().length >= minLength) {
            ctx.logger(`✅ Validation passed: "${text.trim().substring(0, 30)}"`, 'success');
        } else {
            ctx.logger(`⚠️ Validation: text too short (${text.length} < ${minLength})`, 'warn');
            if (throwOnFail) throw new Error(`Validation failed on ${selector}`);
        }
    }
};

// ── logValidation ──
// Logs a validation result (for reporting/auditing)
export const logValidationAction: ActionHandler = {
    type: 'logValidation',
    async execute(ctx) {
        const { inputType, status } = ctx.params;
        ctx.logger(`📊 [${inputType}] → ${status}`, status === 'SUCCESS' ? 'success' : 'error');
    }
};

// ── log ──
// Simple log action
export const logAction: ActionHandler = {
    type: 'log',
    async execute(ctx) {
        ctx.logger(`💬 ${ctx.params.message || ''}`);
    }
};
