/**
 * Action System - Base Action and Registry
 */

import { BrowserAdapter } from '../adapters/browserAdapter';
import { Logger } from '../utils/logger';
import { ExecutionContext } from '../types/execution';

export interface ActionParams {
  [key: string]: unknown;
}

export interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionSchema {
  type: string;
  version: string;
  name: string;
  description?: string;
  category: ActionCategory;
  parameters: ActionParameter[];
  timeout?: number;
  retryable?: boolean;
}

export type ActionCategory =
  | 'navigation'
  | 'interaction'
  | 'flow-control'
  | 'data'
  | 'validation'
  | 'utility';

export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'select';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<{ label: string; value: unknown }>;
  placeholder?: string;
}

/**
 * Base Action Interface
 */
export interface BaseAction {
  /**
   * Get the action schema
   */
  getSchema(): ActionSchema;

  /**
   * Execute the action
   */
  execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    context: ExecutionContext
  ): Promise<ActionResult>;

  /**
   * Validate parameters before execution
   */
  validateParams?(params: ActionParams): { valid: boolean; errors: string[] };

  /**
   * Hook: Before execution
   */
  beforeExecute?(
    adapter: BrowserAdapter,
    params: ActionParams,
    context: ExecutionContext
  ): Promise<ActionParams>;

  /**
   * Hook: After execution
   */
  afterExecute?(
    result: ActionResult,
    adapter: BrowserAdapter,
    params: ActionParams,
    context: ExecutionContext
  ): Promise<ActionResult>;

  /**
   * Handle errors
   */
  handleError?(
    error: Error,
    adapter: BrowserAdapter,
    params: ActionParams,
    context: ExecutionContext
  ): Promise<ActionResult>;
}

/**
 * Abstract base class for actions
 */
export abstract class AbstractAction implements BaseAction {
  protected logger: Logger;
  protected name: string;

  constructor(name: string) {
    this.name = name;
    this.logger = new Logger(`Action:${name}`);
  }

  abstract getSchema(): ActionSchema;
  abstract execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    context: ExecutionContext
  ): Promise<ActionResult>;

  /**
   * Default parameter validation
   */
  validateParams(params: ActionParams): { valid: boolean; errors: string[] } {
    const schema = this.getSchema();
    const errors: string[] = [];

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
  async beforeExecute(
    _adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionParams> {
    return params;
  }

  /**
   * Default afterExecute hook
   */
  async afterExecute(
    result: ActionResult,
    _adapter: BrowserAdapter,
    _params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    return result;
  }

  /**
   * Default error handler
   */
  async handleError(
    error: Error,
    _adapter: BrowserAdapter,
    _params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    this.logger.error(`Action failed: ${this.name}`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Function-based action interface
 */
export interface FunctionAction {
  type: string;
  version?: string;
  execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    context: ExecutionContext
  ): Promise<ActionResult>;
}

/**
 * Action Registry for managing actions
 */
export class ActionRegistry {
  private actions: Map<string, BaseAction | FunctionAction> = new Map();
  private aliases: Map<string, string> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ActionRegistry');
  }

  /**
   * Register a class-based action
   */
  register(action: new (...args: unknown[]) => BaseAction): void;
  register(name: string, action: BaseAction | FunctionAction): void;
  register(actionOrName: unknown, action?: unknown): void {
    if (typeof actionOrName === 'function') {
      // Class-based registration
      const ActionClass = actionOrName as new (...args: unknown[]) => BaseAction;
      const instance = new ActionClass();
      const schema = instance.getSchema();
      if (!schema.type) {
        throw new Error('Action schema must have a type');
      }
      this.actions.set(schema.type, instance);
      this.logger.debug(`Registered action class: ${schema.type}`);
    } else if (typeof actionOrName === 'string' && action) {
      // Named registration
      const name = actionOrName as string;
      const actionInstance = action as BaseAction | FunctionAction;
      const schema = 'getSchema' in actionInstance
        ? actionInstance.getSchema()
        : { type: name };
      this.actions.set(schema.type, actionInstance);
      this.logger.debug(`Registered action: ${name}`);
    } else {
      throw new Error('Invalid action registration');
    }
  }

  /**
   * Register an alias for an action
   */
  registerAlias(alias: string, actionType: string): void {
    this.aliases.set(alias, actionType);
    this.logger.debug(`Registered alias: ${alias} -> ${actionType}`);
  }

  /**
   * Get an action by type
   */
  get(actionType: string): BaseAction | FunctionAction {
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
  has(actionType: string): boolean {
    const resolvedType = this.aliases.get(actionType) || actionType;
    return this.actions.has(resolvedType);
  }

  /**
   * List all registered actions
   */
  list(): Array<{ type: string; name: string; category?: string }> {
    const result: Array<{ type: string; name: string; category?: string }> = [];

    for (const [type, action] of this.actions) {
      if ('getSchema' in action) {
        const schema = action.getSchema();
        result.push({
          type,
          name: schema.name,
          category: schema.category,
        });
      } else {
        result.push({ type, name: type });
      }
    }

    return result;
  }

  /**
   * List actions by category
   */
  listByCategory(category: ActionCategory): Array<{ type: string; name: string }> {
    return this.list()
      .filter(a => a.category === category)
      .map(a => ({ type: a.type, name: a.name }));
  }

  /**
   * Execute an action
   */
  async execute(
    actionType: string,
    adapter: BrowserAdapter,
    params: ActionParams,
    context: ExecutionContext
  ): Promise<ActionResult> {
    const action = this.get(actionType);

    try {
      // Run beforeExecute hook if available
      let finalParams = params;
      if ('beforeExecute' in action) {
        finalParams = await action.beforeExecute!(adapter, params, context);
      }

      // Execute the action
      const result = await action.execute(adapter, finalParams, context);

      // Run afterExecute hook if available
      if ('afterExecute' in action) {
        return await action.afterExecute!(result, adapter, finalParams, context);
      }

      return result;
    } catch (error) {
      // Run error handler if available
      if ('handleError' in action) {
        return await action.handleError!(
          error as Error,
          adapter,
          params,
          context
        );
      }

      // Default error handling
      this.logger.error(`Action execution failed: ${actionType}`, error as Error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Unregister an action
   */
  unregister(actionType: string): boolean {
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
  clear(): void {
    this.actions.clear();
    this.aliases.clear();
    this.logger.debug('Cleared all actions');
  }
}

// Predefined action types
export const ActionTypes = {
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
} as const;

export default ActionRegistry;
