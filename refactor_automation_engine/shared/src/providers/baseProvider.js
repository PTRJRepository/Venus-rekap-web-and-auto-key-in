"use strict";
/**
 * Provider Interface and Factory
 * Platform abstraction for different web applications
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Provider = exports.ProviderFactory = exports.AbstractProvider = void 0;
const logger_1 = require("../utils/logger");
/**
 * Abstract base class for providers
 */
class AbstractProvider {
    constructor(config) {
        this.config = {
            name: 'unknown',
            baseUrl: '',
            timeout: 30000,
            ...config,
        };
        this.logger = new logger_1.Logger(`Provider:${this.config.name}`);
    }
    beforeExecution(context) {
        return Promise.resolve(context);
    }
    afterExecution(result) {
        return Promise.resolve(result);
    }
    beforeAction(action, params, context) {
        return Promise.resolve(params);
    }
    afterAction(action, result, context) {
        return Promise.resolve(result);
    }
    configure(config) {
        this.config = { ...this.config, ...config };
    }
    getConfig() {
        return { ...this.config };
    }
    /**
     * Check if URL is an error page
     */
    isErrorPage(url) {
        const indicators = this.getErrorIndicators();
        return indicators.some(indicator => url.includes(indicator));
    }
    /**
     * Execute login workflow
     */
    async executeLoginWorkflow(adapter, context) {
        const workflow = this.getLoginWorkflow();
        if (!workflow) {
            throw new Error('No login workflow defined');
        }
        this.logger.info('Executing login workflow');
        // Navigate to login URL
        await adapter.navigate(workflow.url, { waitUntil: 'domcontentloaded' });
        // Execute each step
        for (const step of workflow.steps) {
            this.logger.debug(`Executing login step: ${step.action}`, { params: step.params });
            switch (step.action) {
                case 'type':
                    await adapter.type(step.params.selector, step.params.value, step.params.options);
                    break;
                case 'click':
                    await adapter.click(step.params.selector, step.params.options);
                    break;
                case 'wait':
                    await adapter.waitForSelector(step.params.selector, step.params.options);
                    break;
                case 'waitNavigation':
                    await adapter.waitForNavigation(step.params.options);
                    break;
                default:
                    this.logger.warn(`Unknown login step action: ${step.action}`);
            }
        }
        this.logger.info('Login workflow completed');
    }
}
exports.AbstractProvider = AbstractProvider;
exports.Provider = AbstractProvider;
/**
 * Provider Factory for creating provider instances
 */
class ProviderFactory {
    /**
     * Register a provider class
     */
    static register(name, ProviderClass) {
        if (typeof ProviderClass !== 'function') {
            throw new Error('Provider must be a class constructor');
        }
        this.providers.set(name.toLowerCase(), ProviderClass);
    }
    /**
     * Create a provider instance
     */
    static create(name, config) {
        const ProviderClass = this.providers.get(name.toLowerCase());
        if (!ProviderClass) {
            const available = Array.from(this.providers.keys()).join(', ');
            throw new Error(`Provider not found: ${name}. Available: ${available}`);
        }
        return new ProviderClass(config);
    }
    /**
     * Check if a provider exists
     */
    static has(name) {
        return this.providers.has(name.toLowerCase());
    }
    /**
     * List all registered providers
     */
    static list() {
        return Array.from(this.providers.keys());
    }
    /**
     * Unregister a provider
     */
    static unregister(name) {
        return this.providers.delete(name.toLowerCase());
    }
    /**
     * Clear all providers
     */
    static clear() {
        this.providers.clear();
    }
}
exports.ProviderFactory = ProviderFactory;
ProviderFactory.providers = new Map();
