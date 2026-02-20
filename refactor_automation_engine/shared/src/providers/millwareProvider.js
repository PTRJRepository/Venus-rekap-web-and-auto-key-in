"use strict";
/**
 * Millware Provider - Provider implementation for Millware HR System
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MillwareProvider = void 0;
/**
 * Millware Provider for HR System automation
 */
class MillwareProvider extends baseProvider_2.BaseProvider {
    constructor(config) {
        super({
            name: 'millware',
            baseUrl: config.baseUrl || 'http://millwarep3.rebinmas.com:8003',
            credentials: config.credentials,
            selectors: config.selectors || {},
        });
        this.config = config;
    }
    getName() {
        return 'millware';
    }
    getBaseUrl() {
        return this.config.baseUrl;
    }
    getLoginWorkflow() {
        return {
            url: this.config.baseUrl,
            steps: [
                {
                    action: 'type',
                    params: {
                        selector: this.getSelectors().login.username,
                        value: this.config.credentials.username,
                    },
                },
                {
                    action: 'type',
                    params: {
                        selector: this.getSelectors().login.password,
                        value: this.config.credentials.password,
                    },
                },
                {
                    action: 'click',
                    params: {
                        selector: this.getSelectors().login.submitButton,
                    },
                },
                {
                    action: 'wait',
                    params: {
                        selector: this.getSelectors().login.popupOk,
                        options: { timeout: 15000 },
                    },
                },
                {
                    action: 'click',
                    params: {
                        selector: this.getSelectors().login.popupOk,
                    },
                },
            ],
        };
    }
    getSelectors() {
        return {
            login: {
                username: '#txtUsername',
                password: '#txtPassword',
                submitButton: '#btnLogin',
                popupOk: '#MainContent_btnOkay',
            },
            taskRegister: {
                autocomplete: '.ui-autocomplete-input.CBOBox',
                employeeInput: '#MainContent_CboEmployeeID_autocomplete',
                dateInput: '#MainContent_TxtDate',
                chargeJobInput: '#MainContent_CboChargeJob_autocomplete',
                overtimeType: 'input[name="ctl00$MainContent$RbOvtType"]',
                saveButton: '#btnSave',
                table: '#taskTable',
            },
            attendance: {
                menu: '#MainContent_menuAttendance',
                dateFrom: '#MainContent_txtDateFrom',
                dateTo: '#MainContent_txtDateTo',
                searchButton: '#btnSearch',
                exportButton: '#btnExport',
            },
            errorPages: ['ACCESS_CONTROLLER_ERR', 'frmErrorMessage.aspx'],
        };
    }
    async validateSession(adapter) {
        const url = adapter.getUrl();
        const errorIndicators = this.getSelectors().errorPages;
        // Check for error pages
        for (const indicator of errorIndicators) {
            if (url.includes(indicator)) {
                return {
                    valid: false,
                    reason: 'ERROR_PAGE_DETECTED',
                    needsRelogin: true,
                    metadata: { indicator },
                };
            }
        }
        // Check if we're still on login page
        try {
            const isLoggedIn = await adapter.evaluate(() => {
                const loginForm = document.querySelector('#btnLogin');
                return !loginForm;
            });
            if (!isLoggedIn) {
                return {
                    valid: false,
                    reason: 'NOT_LOGGED_IN',
                    needsRelogin: true,
                };
            }
            return { valid: true };
        }
        catch (error) {
            return {
                valid: false,
                reason: 'VALIDATION_ERROR',
                metadata: { error: error.message },
            };
        }
    }
    async handleSessionExpiry(adapter, _context) {
        try {
            console.log('[MillwareProvider] Session expired, attempting re-login...');
            // Navigate to base URL
            await adapter.navigate(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
            // Type username
            await adapter.type(this.getSelectors().login.username, this.config.credentials.username, { delay: 50 });
            // Type password
            await adapter.type(this.getSelectors().login.password, this.config.credentials.password, { delay: 50 });
            // Click login button
            await adapter.click(this.getSelectors().login.submitButton);
            // Wait for popup
            await adapter.waitForSelector(this.getSelectors().login.popupOk, { timeout: 15000 });
            // Click OK on popup
            await adapter.click(this.getSelectors().login.popupOk);
            // Wait for page to stabilize
            await adapter.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
            console.log('[MillwareProvider] Re-login successful');
            return { success: true };
        }
        catch (error) {
            const errorMessage = error.message;
            console.error('[MillwareProvider] Re-login failed:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }
    getErrorIndicators() {
        return ['ACCESS_CONTROLLER_ERR', 'frmErrorMessage.aspx', 'SessionExpired'];
    }
    /**
     * Get task register URL
     */
    getTaskRegisterUrl() {
        return `${this.config.baseUrl}/en/PR/trx/frmPrTrxTaskRegisterDet.aspx`;
    }
    /**
     * Get attendance URL
     */
    getAttendanceUrl() {
        return `${this.config.baseUrl}/en/PR/trx/frmPrTrxAttendance.aspx`;
    }
    /**
     * Before action hook - handles autocomplete for Millware
     */
    async beforeAction(action, params, _context) {
        // Auto-fill autocomplete values for Millware
        if (action === 'select' && params.selector && String(params.selector).includes('autocomplete')) {
            return { ...params, autocomplete: true };
        }
        return params;
    }
}
exports.MillwareProvider = MillwareProvider;
// Register the provider
const baseProvider_1 = require("./baseProvider");
baseProvider_1.ProviderFactory.register('millware', MillwareProvider);
exports.default = MillwareProvider;
