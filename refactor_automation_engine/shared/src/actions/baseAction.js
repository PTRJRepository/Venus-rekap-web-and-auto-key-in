"use strict";
/**
 * Action System - Base Action and Registry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionTypes = exports.ActionRegistry = exports.AbstractAction = void 0;
const logger_1 = require("../utils/logger");
/**
 * Abstract base class for actions
 */
class AbstractAction {
    constructor(name) {
        this.name = name;
        this.logger = new logger_1.Logger(`Action:${name}`);
    }
    /**
     * Default parameter validation
     */
    validateParams(params) {
        const schema = this.getSchema();
        const errors = [];
        for (const param of schema.parameters) {
            if (param.required && !(param.name in params)) {
                errors.push(`Required parameter missing: ${param.name}`);
            }
        }
        return { valid: errors.length === 0, errors };
    }
    /**
     * Default beforeExecute hook
     */
    async beforeExecute(_adapter, params, _context) {
        return params;
    }
    /**
     * Default afterExecute hook
     */
    async afterExecute(result, _adapter, _params, _context) {
        return result;
    }
    /**
     * Default error handler
     */
    async handleError(error, _adapter, _params, _context) {
        this.logger.error(`Action failed: ${this.name}`, error);
        return {
            success: false,
            error: error.message,
        };
    }
}
exports.AbstractAction = AbstractAction;
/**
 * Action Registry for managing actions
 */
class ActionRegistry {
    constructor() {
        this.actions = new Map();
        this.aliases = new Map();
        this.logger = new logger_1.Logger('ActionRegistry');
    }
    register(actionOrName, action) {
        if (typeof actionOrName === 'function') {
            // Class-based registration
            const ActionClass = actionOrName;
            const instance = new ActionClass();
            const schema = instance.getSchema();
            if (!schema.type) {
                throw new Error('Action schema must have a type');
            }
            this.actions.set(schema.type, instance);
            this.logger.debug(`Registered action class: ${schema.type}`);
        }
        else if (typeof actionOrName === 'string' && action) {
            // Named registration
            const name = actionOrName;
            const actionInstance = action;
            const schema = 'getSchema' in actionInstance
                ? actionInstance.getSchema()
                : { type: name };
            this.actions.set(schema.type, actionInstance);
            this.logger.debug(`Registered action: ${name}`);
        }
        else {
            throw new Error('Invalid action registration');
        }
    }
    /**
     * Register an alias for an action
     */
    registerAlias(alias, actionType) {
        this.aliases.set(alias, actionType);
        this.logger.debug(`Registered alias: ${alias} -> ${actionType}`);
    }
    /**
     * Get an action by type
     */
    get(actionType) {
        const resolvedType = this.aliases.get(actionType) || actionType;
        const action = this.actions.get(resolvedType);
        if (!action) {
            throw new Error(`Action not found: ${actionType}`);
        }
        return action;
    }
    /**
     * Check if an action exists
     */
    has(actionType) {
        const resolvedType = this.aliases.get(actionType) || actionType;
        return this.actions.has(resolvedType);
    }
    /**
     * List all registered actions
     */
    list() {
        const result = [];
        for (const [type, action] of this.actions) {
            if ('getSchema' in action) {
                const schema = action.getSchema();
                result.push({
                    type,
                    name: schema.name,
                    category: schema.category,
                });
            }
            else {
                result.push({ type, name: type });
            }
        }
        return result;
    }
    /**
     * List actions by category
     */
    listByCategory(category) {
        return this.list()
            .filter(a => a.category === category)
            .map(a => ({ type: a.type, name: a.name }));
    }
    /**
     * Execute an action
     */
    async execute(actionType, adapter, params, context) {
        const action = this.get(actionType);
        try {
            // Run beforeExecute hook if available
            let finalParams = params;
            if ('beforeExecute' in action) {
                finalParams = await action.beforeExecute(adapter, params, context);
            }
            // Execute the action
            const result = await action.execute(adapter, finalParams, context);
            // Run afterExecute hook if available
            if ('afterExecute' in action) {
                return await action.afterExecute(result, adapter, finalParams, context);
            }
            return result;
        }
        catch (error) {
            // Run error handler if available
            if ('handleError' in action) {
                return await action.handleError(error, adapter, params, context);
            }
            // Default error handling
            this.logger.error(`Action execution failed: ${actionType}`, error);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Unregister an action
     */
    unregister(actionType) {
        // Also remove aliases pointing to this action
        for (const [alias, type] of this.aliases.entries()) {
            if (type === actionType) {
                this.aliases.delete(alias);
            }
        }
        return this.actions.delete(actionType);
    }
    /**
     * Clear all actions
     */
    clear() {
        this.actions.clear();
        this.aliases.clear();
        this.logger.debug('Cleared all actions');
    }
}
exports.ActionRegistry = ActionRegistry;
// Predefined action types
exports.ActionTypes = {
    // Navigation
    NAVIGATE: 'navigate',
    REFRESH: 'refresh',
    GO_BACK: 'goBack',
    GO_FORWARD: 'goForward',
    // Interaction
    CLICK: 'click',
    TYPE: 'type',
    SELECT: 'select',
    HOVER: 'hover',
    FOCUS: 'focus',
    PRESS: 'press',
    SCROLL_TO: 'scrollTo',
    // Flow Control
    FOR_EACH: 'forEach',
    IF: 'if',
    SWITCH: 'switch',
    PARALLEL: 'parallel',
    TRY: 'try',
    WHILE: 'while',
    WAIT: 'wait',
    WAIT_FOR_ELEMENT: 'waitForElement',
    WAIT_FOR_NAVIGATION: 'waitForNavigation',
    // Data
    EXTRACT: 'extract',
    TRANSFORM: 'transform',
    FILTER: 'filter',
    HTTP_REQUEST: 'httpRequest',
    SET_VARIABLE: 'setVariable',
    // Validation
    VALIDATE: 'validate',
    CHAIN_VALIDATE: 'chainValidate',
    // Utility
    LOG: 'log',
    SLEEP: 'sleep',
    SCREENSHOT: 'screenshot',
    INCLUDE: 'include',
};
exports.default = ActionRegistry;
