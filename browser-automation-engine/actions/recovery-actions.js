// Recovery Actions Module
// Contains self-healing recovery logic for automation

module.exports = {
    /**
     * checkFormReady - Check if form is ready for input
     * Verifies required form elements exist before continuing
     */
    checkFormReady: async (page, params, context, engine) => {
        const {
            requiredSelector = '#MainContent_txtTrxDate',
            timeout = 5000,
            onFailure = 'skip'
        } = params;

        try {
            await page.waitForSelector(requiredSelector, { timeout });
            console.log(`✅ Form ready - ${requiredSelector} found`);
            context.formNotReady = false;
            return true;
        } catch (error) {
            console.log(`⚠️ Form not ready - ${requiredSelector} not found within ${timeout}ms`);

            if (onFailure === 'refreshAndNavigate') {
                console.log(`🔄 Recovery: Navigate to list page and click New button...`);
                try {
                    await page.goto('http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterList.aspx');
                    await page.waitForSelector('#MainContent_btnNew', { timeout: 10000 });
                    await page.click('#MainContent_btnNew');
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
                    await new Promise(r => setTimeout(r, 2000));
                    console.log(`✅ Form refreshed and ready`);
                    context.formNotReady = false;
                    return true;
                } catch (recoveryError) {
                    console.log(`❌ Recovery failed:`, recoveryError.message);
                    context.formNotReady = true;
                    return false;
                }
            } else if (onFailure === 'skip') {
                console.log(`⏭️ Skipping current entry - form not ready`);
                context.formNotReady = true;
                return false;
            } else {
                console.log(`⚠️ Form not ready - logging and continuing`);
                context.formNotReady = true;
                return false;
            }
        }
    },

    /**
     * handleValidationErrors - Check for validation errors after form submission
     */
    handleValidationErrors: async (page, params, context, engine) => {
        const { errorSelectors = [], onError = 'log' } = params;

        const errors = [];

        for (const selector of errorSelectors) {
            const errorEl = await page.$(selector);
            if (errorEl) {
                const isVisible = await page.evaluate(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && el.offsetParent !== null;
                }, errorEl);

                if (isVisible) {
                    const text = await page.evaluate(el => el.textContent, errorEl);
                    errors.push({ selector, text });
                }
            }
        }

        if (errors.length > 0) {
            console.log(`⚠️ Validation errors found:`, errors);
            context.validationErrors = errors;

            if (onError === 'logAndSkip') {
                console.log(`⏭️ Skipping due to validation errors`);
                context.skipCurrentEntry = true;
            }

            return false;
        }

        console.log(`✅ No validation errors detected`);
        return true;
    }
};
