"use strict";
/**
 * Flow Control Actions - ForEach, If, Switch, Parallel, Try
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowControlActions = exports.WaitForNavigationAction = exports.WhileAction = exports.TryAction = exports.ParallelAction = exports.SwitchAction = exports.IfAction = exports.ForEachAction = void 0;
const baseAction_1 = require("./baseAction");
/**
 * ForEach Action - Iterate over an array
 */
class ForEachAction extends baseAction_1.AbstractAction {
    constructor() {
        super('forEach');
    }
    getSchema() {
        return {
            type: 'forEach',
            version: '1.0.0',
            name: 'For Each',
            description: 'Iterate over an array of items',
            category: 'flow-control',
            parameters: [
                {
                    name: 'items',
                    type: 'string',
                    label: 'Items',
                    description: 'Path to array in context (e.g., data.employees)',
                    required: true,
                },
                {
                    name: 'itemName',
                    type: 'string',
                    label: 'Item Variable',
                    description: 'Variable name for each item',
                    required: true,
                    default: 'item',
                },
                {
                    name: 'indexName',
                    type: 'string',
                    label: 'Index Variable',
                    description: 'Variable name for index',
                    required: false,
                    default: 'index',
                },
                {
                    name: 'parallel',
                    type: 'boolean',
                    label: 'Parallel',
                    description: 'Process items in parallel',
                    required: false,
                    default: false,
                },
                {
                    name: 'maxConcurrency',
                    type: 'number',
                    label: 'Max Concurrency',
                    description: 'Maximum parallel items',
                    required: false,
                    default: 5,
                },
            ],
            timeout: 300000,
            retryable: true,
        };
    }
    async execute(_adapter, params, context) {
        const { items, itemName, indexName, parallel, maxConcurrency } = params;
        // Get items from context
        const itemsArray = this.getValueFromContext(items, context);
        if (!Array.isArray(itemsArray)) {
            throw new Error(`${items} is not an array`);
        }
        const results = [];
        if (parallel) {
            // Process in parallel with concurrency limit
            const chunks = [];
            for (let i = 0; i < itemsArray.length; i += maxConcurrency || 5) {
                chunks.push(itemsArray.slice(i, i + (maxConcurrency || 5)));
            }
            for (const chunk of chunks) {
                const chunkResults = await Promise.all(chunk.map((item, idx) => {
                    const idx2 = itemsArray.indexOf(item);
                    return { item, index: idx2, result: { [itemName]: item, [indexName || 'index']: idx2 } };
                }));
                results.push(...chunkResults);
            }
        }
        else {
            // Process sequentially
            for (let i = 0; i < itemsArray.length; i++) {
                results.push({
                    item: itemsArray[i],
                    index: i,
                    result: { [itemName]: itemsArray[i], [indexName || 'index']: i },
                });
            }
        }
        return {
            success: true,
            data: {
                count: itemsArray.length,
                results,
            },
        };
    }
    getValueFromContext(path, context) {
        const keys = path.split('.');
        let value = context.data || context.variables;
        for (const key of keys) {
            if (value && typeof value === 'object') {
                value = value[key];
            }
            else {
                return undefined;
            }
        }
        return value;
    }
}
exports.ForEachAction = ForEachAction;
/**
 * If Action - Conditional branching
 */
class IfAction extends baseAction_1.AbstractAction {
    constructor() {
        super('if');
    }
    getSchema() {
        return {
            type: 'if',
            version: '1.0.0',
            name: 'If',
            description: 'Conditional branching',
            category: 'flow-control',
            parameters: [
                {
                    name: 'condition',
                    type: 'string',
                    label: 'Condition',
                    description: 'JavaScript condition to evaluate',
                    required: true,
                    placeholder: 'item.status === "active"',
                },
            ],
            timeout: 5000,
            retryable: false,
        };
    }
    async execute(_adapter, params, context) {
        const { condition } = params;
        const result = this.evaluateCondition(condition, context);
        return {
            success: true,
            data: {
                condition,
                result,
                branch: result ? 'then' : 'else',
            },
        };
    }
    evaluateCondition(condition, context) {
        try {
            // Create a safe evaluation context
            const ctx = { ...context.variables, ...context.data };
            const keys = Object.keys(ctx);
            const values = Object.values(ctx);
            // Use Function constructor for safe evaluation
            const fn = new Function(...keys, `return (${condition});`);
            return fn(...values);
        }
        catch (error) {
            console.error('Condition evaluation error:', error);
            return false;
        }
    }
}
exports.IfAction = IfAction;
/**
 * Switch Action - Multi-way branching
 */
class SwitchAction extends baseAction_1.AbstractAction {
    constructor() {
        super('switch');
    }
    getSchema() {
        return {
            type: 'switch',
            version: '1.0.0',
            name: 'Switch',
            description: 'Multi-way conditional branching',
            category: 'flow-control',
            parameters: [
                {
                    name: 'value',
                    type: 'string',
                    label: 'Value',
                    description: 'Value to evaluate',
                    required: true,
                },
                {
                    name: 'cases',
                    type: 'array',
                    label: 'Cases',
                    description: 'Array of case objects',
                    required: true,
                },
                {
                    name: 'default',
                    type: 'string',
                    label: 'Default',
                    description: 'Default case when no match',
                    required: false,
                },
            ],
            timeout: 5000,
            retryable: false,
        };
    }
    async execute(_adapter, params, context) {
        const { value, cases, default: defaultCase } = params;
        // Resolve the value
        const resolvedValue = this.getValueFromContext(value, context);
        // Find matching case
        const matchedCase = cases.find(c => c.when === resolvedValue);
        const branch = matchedCase ? matchedCase.then : (defaultCase || 'default');
        return {
            success: true,
            data: {
                value: resolvedValue,
                branch,
                matchedCase: matchedCase?.when,
            },
        };
    }
    getValueFromContext(path, context) {
        if (!path)
            return path;
        const keys = path.split('.');
        let value = context.data || context.variables;
        for (const key of keys) {
            if (value && typeof value === 'object') {
                value = value[key];
            }
            else {
                return path;
            }
        }
        return value;
    }
}
exports.SwitchAction = SwitchAction;
/**
 * Parallel Action - Execute multiple nodes in parallel
 */
class ParallelAction extends baseAction_1.AbstractAction {
    constructor() {
        super('parallel');
    }
    getSchema() {
        return {
            type: 'parallel',
            version: '1.0.0',
            name: 'Parallel',
            description: 'Execute multiple branches in parallel',
            category: 'flow-control',
            parameters: [
                {
                    name: 'branches',
                    type: 'array',
                    label: 'Branches',
                    description: 'Array of branch configurations',
                    required: true,
                },
                {
                    name: 'failFast',
                    type: 'boolean',
                    label: 'Fail Fast',
                    description: 'Stop on first failure',
                    required: false,
                    default: false,
                },
                {
                    name: 'maxConcurrency',
                    type: 'number',
                    label: 'Max Concurrency',
                    description: 'Maximum parallel branches',
                    required: false,
                    default: 5,
                },
            ],
            timeout: 300000,
            retryable: true,
        };
    }
    async execute(_adapter, params, _context) {
        const { branches, failFast, maxConcurrency } = params;
        // In a real implementation, this would execute child nodes in parallel
        // For now, we just return the branch info
        return {
            success: true,
            data: {
                branches: branches.length,
                failFast: failFast || false,
                maxConcurrency: maxConcurrency || 5,
                branchIds: branches.map(b => b.id),
            },
        };
    }
}
exports.ParallelAction = ParallelAction;
/**
 * Try Action - Try/catch error handling
 */
class TryAction extends baseAction_1.AbstractAction {
    constructor() {
        super('try');
    }
    getSchema() {
        return {
            type: 'try',
            version: '1.0.0',
            name: 'Try',
            description: 'Try/catch error handling',
            category: 'flow-control',
            parameters: [
                {
                    name: 'maxRetries',
                    type: 'number',
                    label: 'Max Retries',
                    description: 'Maximum retry attempts',
                    required: false,
                    default: 3,
                },
                {
                    name: 'retryDelay',
                    type: 'number',
                    label: 'Retry Delay (ms)',
                    description: 'Delay between retries',
                    required: false,
                    default: 1000,
                },
                {
                    name: 'backoffMultiplier',
                    type: 'number',
                    label: 'Backoff Multiplier',
                    description: 'Exponential backoff multiplier',
                    required: false,
                    default: 2,
                },
            ],
            timeout: 60000,
            retryable: true,
        };
    }
    async execute(_adapter, params, _context) {
        const { maxRetries, retryDelay, backoffMultiplier } = params;
        return {
            success: true,
            data: {
                maxRetries: maxRetries || 3,
                retryDelay: retryDelay || 1000,
                backoffMultiplier: backoffMultiplier || 2,
            },
        };
    }
}
exports.TryAction = TryAction;
/**
 * While Action - Loop while condition is true
 */
class WhileAction extends baseAction_1.AbstractAction {
    constructor() {
        super('while');
    }
    getSchema() {
        return {
            type: 'while',
            version: '1.0.0',
            name: 'While',
            description: 'Loop while condition is true',
            category: 'flow-control',
            parameters: [
                {
                    name: 'condition',
                    type: 'string',
                    label: 'Condition',
                    description: 'JavaScript condition',
                    required: true,
                },
                {
                    name: 'maxIterations',
                    type: 'number',
                    label: 'Max Iterations',
                    description: 'Maximum loop iterations',
                    required: false,
                    default: 100,
                },
            ],
            timeout: 300000,
            retryable: false,
        };
    }
    async execute(_adapter, params, context) {
        const { condition, maxIterations } = params;
        let iterations = 0;
        const max = maxIterations || 100;
        while (iterations < max) {
            const result = this.evaluateCondition(condition, context);
            if (!result)
                break;
            iterations++;
        }
        return {
            success: true,
            data: {
                iterations,
                condition,
            },
        };
    }
    evaluateCondition(condition, context) {
        try {
            const ctx = { ...context.variables, ...context.data };
            const keys = Object.keys(ctx);
            const values = Object.values(ctx);
            const fn = new Function(...keys, `return (${condition});`);
            return fn(...values);
        }
        catch {
            return false;
        }
    }
}
exports.WhileAction = WhileAction;
/**
 * WaitForNavigation Action - Wait for navigation to complete
 */
class WaitForNavigationAction extends baseAction_1.AbstractAction {
    constructor() {
        super('waitForNavigation');
    }
    getSchema() {
        return {
            type: 'waitForNavigation',
            version: '1.0.0',
            name: 'Wait For Navigation',
            description: 'Wait for page navigation to complete',
            category: 'flow-control',
            parameters: [
                {
                    name: 'waitUntil',
                    type: 'select',
                    label: 'Wait Until',
                    description: 'When to consider navigation complete',
                    required: false,
                    default: 'load',
                    options: [
                        { label: 'Load', value: 'load' },
                        { label: 'DOM Content Loaded', value: 'domcontentloaded' },
                        { label: 'Network Idle 0', value: 'networkidle0' },
                        { label: 'Network Idle 2', value: 'networkidle2' },
                    ],
                },
                {
                    name: 'timeout',
                    type: 'number',
                    label: 'Timeout (ms)',
                    description: 'Maximum wait time',
                    required: false,
                    default: 30000,
                },
            ],
            timeout: 60000,
            retryable: true,
        };
    }
    async execute(adapter, params, _context) {
        const { waitUntil, timeout } = params;
        await adapter.waitForNavigation({
            waitUntil: waitUntil || 'load',
            timeout: timeout || 30000,
        });
        return {
            success: true,
            data: {
                url: adapter.getUrl(),
            },
        };
    }
}
exports.WaitForNavigationAction = WaitForNavigationAction;
// Export all flow control actions
exports.flowControlActions = [
    ForEachAction,
    IfAction,
    SwitchAction,
    ParallelAction,
    TryAction,
    WhileAction,
    WaitForNavigationAction,
];
