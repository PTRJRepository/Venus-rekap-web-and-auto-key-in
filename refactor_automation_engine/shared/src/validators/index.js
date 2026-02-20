"use strict";
/**
 * Validator System - Base Validator and Built-in Validators
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validators = exports.ValidatorRegistry = exports.ChainValidator = exports.NetworkValidator = exports.ConditionValidator = exports.ValueValidator = exports.ElementValidator = exports.BaseValidator = void 0;
const logger_1 = require("../utils/logger");
/**
 * Base Validator class
 */
class BaseValidator {
    constructor(name) {
        this.name = name;
        this.logger = new logger_1.Logger(`Validator:${name}`);
    }
    valid(details) {
        return { valid: true, details };
    }
    invalid(reason, details) {
        return { valid: false, reason, details };
    }
}
exports.BaseValidator = BaseValidator;
/**
 * Element Validator - Check element existence and properties
 */
class ElementValidator extends BaseValidator {
    constructor() {
        super('element');
    }
    async validate(adapter, params, _context) {
        const { selector, check = 'exists', timeout = 5000 } = params;
        try {
            // Wait for element
            await adapter.waitForSelector(selector, { timeout });
            // Check based on check type
            switch (check) {
                case 'exists':
                    return this.valid({ selector, check: 'exists' });
                case 'visible':
                    const isVisible = await adapter.isVisible(selector);
                    if (!isVisible) {
                        return this.invalid('Element not visible', { selector });
                    }
                    return this.valid({ selector, check: 'visible' });
                case 'enabled':
                    const info = await adapter.getElementInfo(selector);
                    if (!info?.isEnabled) {
                        return this.invalid('Element not enabled', { selector });
                    }
                    return this.valid({ selector, check: 'enabled' });
                case 'hidden':
                    const isHidden = !(await adapter.isVisible(selector));
                    if (!isHidden) {
                        return this.invalid('Element not hidden', { selector });
                    }
                    return this.valid({ selector, check: 'hidden' });
                default:
                    return this.valid({ selector, check: 'exists' });
            }
        }
        catch (error) {
            return this.invalid('Element check failed', {
                selector,
                check,
                error: error.message,
            });
        }
    }
}
exports.ElementValidator = ElementValidator;
/**
 * Value Validator - Check element value
 */
class ValueValidator extends BaseValidator {
    constructor() {
        super('value');
    }
    async validate(adapter, params, _context) {
        const { selector, expected, operator = '==', type = 'text' } = params;
        try {
            let actual;
            if (type === 'value') {
                actual = await adapter.evaluate((sel) => document.querySelector(sel)?.value || '', selector);
            }
            else if (type === 'attribute' && params.attribute) {
                actual = await adapter.evaluate((sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '', selector, params.attribute);
            }
            else {
                actual = await adapter.extract(selector);
            }
            let isValid = false;
            switch (operator) {
                case '==':
                    isValid = actual == expected;
                    break;
                case '===':
                    isValid = actual === expected;
                    break;
                case '!=':
                    isValid = actual != expected;
                    break;
                case '!==':
                    isValid = actual !== expected;
                    break;
                case 'contains':
                    isValid = actual.includes(expected);
                    break;
                case 'matches':
                    isValid = new RegExp(expected).test(actual);
                    break;
            }
            if (!isValid) {
                return this.invalid('Value mismatch', {
                    selector,
                    expected,
                    actual,
                    operator,
                });
            }
            return this.valid({ selector, expected, actual, operator });
        }
        catch (error) {
            return this.invalid('Value check failed', {
                selector,
                error: error.message,
            });
        }
    }
}
exports.ValueValidator = ValueValidator;
/**
 * Condition Validator - Evaluate JavaScript condition
 */
class ConditionValidator extends BaseValidator {
    constructor() {
        super('condition');
    }
    async validate(_adapter, params, context) {
        const { condition } = params;
        try {
            const ctx = { ...context };
            const keys = Object.keys(ctx);
            const values = Object.values(ctx);
            const fn = new Function(...keys, `return (${condition});`);
            const result = fn(...values);
            if (!result) {
                return this.invalid('Condition false', { condition });
            }
            return this.valid({ condition, result: true });
        }
        catch (error) {
            return this.invalid('Condition evaluation error', {
                condition,
                error: error.message,
            });
        }
    }
}
exports.ConditionValidator = ConditionValidator;
/**
 * Network Validator - Check network status
 */
class NetworkValidator extends BaseValidator {
    constructor() {
        super('network');
    }
    async validate(adapter, params, _context) {
        const { check, url } = params;
        try {
            const currentUrl = url || adapter.getUrl();
            switch (check) {
                case 'statusEquals': {
                    const status = await adapter.evaluate(async (targetUrl) => {
                        const response = await fetch(targetUrl, { method: 'HEAD' });
                        return response.status;
                    }, currentUrl);
                    const expectedStatus = params.status;
                    if (status !== expectedStatus) {
                        return this.invalid('Status mismatch', { url: currentUrl, expected: expectedStatus, actual: status });
                    }
                    return this.valid({ url: currentUrl, status });
                }
                case 'responseContains': {
                    const html = await adapter.extract('body');
                    const text = params.text;
                    if (!html.includes(text)) {
                        return this.invalid('Response does not contain text', { url: currentUrl, text });
                    }
                    return this.valid({ url: currentUrl, text });
                }
                case 'no404': {
                    // Simple check - just verify page loads
                    const title = await adapter.getTitle();
                    if (title.includes('404') || title.includes('Not Found')) {
                        return this.invalid('404 page detected', { url: currentUrl });
                    }
                    return this.valid({ url: currentUrl, no404: true });
                }
                default:
                    return this.invalid('Unknown check type', { check });
            }
        }
        catch (error) {
            return this.invalid('Network check failed', {
                check,
                error: error.message,
            });
        }
    }
}
exports.NetworkValidator = NetworkValidator;
/**
 * Chain Validator - Chain multiple validators
 */
class ChainValidator extends BaseValidator {
    constructor() {
        super('chain');
    }
    async validate(adapter, params, context) {
        const { chain, mode = 'sequential', stopOnFirstInvalid = true } = params;
        const results = [];
        if (mode === 'sequential') {
            for (const step of chain) {
                const validator = this.getValidator(step.validator);
                if (!validator) {
                    results.push({
                        validator: step.validator,
                        result: { valid: false, reason: 'Validator not found' },
                    });
                    if (stopOnFirstInvalid)
                        break;
                    continue;
                }
                const result = await validator.validate(adapter, step.params, context);
                results.push({ validator: step.validator, result });
                if (!result.valid && stopOnFirstInvalid) {
                    return this.invalid('Chain validation failed', {
                        failedAt: step.validator,
                        results,
                    });
                }
            }
        }
        else {
            // Parallel execution
            const promises = chain.map(async (step) => {
                const validator = this.getValidator(step.validator);
                if (!validator) {
                    return {
                        validator: step.validator,
                        result: { valid: false, reason: 'Validator not found' },
                    };
                }
                const result = await validator.validate(adapter, step.params, context);
                return { validator: step.validator, result };
            });
            const parallelResults = await Promise.all(promises);
            results.push(...parallelResults);
            const hasInvalid = results.some(r => !r.result.valid);
            if (hasInvalid) {
                return this.invalid('Chain validation failed', { results });
            }
        }
        const allValid = results.every(r => r.result.valid);
        if (!allValid) {
            return this.invalid('Some validators failed', { results });
        }
        return this.valid({ results });
    }
    getValidator(name) {
        const validators = {
            element: () => new ElementValidator(),
            value: () => new ValueValidator(),
            condition: () => new ConditionValidator(),
            network: () => new NetworkValidator(),
        };
        const factory = validators[name];
        return factory ? factory() : null;
    }
}
exports.ChainValidator = ChainValidator;
/**
 * Validator Registry
 */
class ValidatorRegistry {
    constructor() {
        this.validators = new Map();
        this.logger = new logger_1.Logger('ValidatorRegistry');
        this.registerDefaults();
    }
    registerDefaults() {
        this.register('element', () => new ElementValidator());
        this.register('value', () => new ValueValidator());
        this.register('condition', () => new ConditionValidator());
        this.register('network', () => new NetworkValidator());
        this.register('chain', () => new ChainValidator());
    }
    register(name, factory) {
        this.validators.set(name, factory);
        this.logger.debug(`Registered validator: ${name}`);
    }
    get(name) {
        const factory = this.validators.get(name);
        return factory ? factory() : null;
    }
    has(name) {
        return this.validators.has(name);
    }
    list() {
        return Array.from(this.validators.keys());
    }
    async validate(validatorName, adapter, params, context) {
        const validator = this.get(validatorName);
        if (!validator) {
            return { valid: false, reason: `Validator not found: ${validatorName}` };
        }
        return await validator.validate(adapter, params, context);
    }
}
exports.ValidatorRegistry = ValidatorRegistry;
// Export all validators
exports.validators = {
    ElementValidator,
    ValueValidator,
    ConditionValidator,
    NetworkValidator,
    ChainValidator,
    ValidatorRegistry,
};
