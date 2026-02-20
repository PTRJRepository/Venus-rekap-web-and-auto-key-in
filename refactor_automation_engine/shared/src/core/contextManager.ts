/**
 * Context Manager for variable and state management
 */

import { Logger } from '../utils/logger';

export interface ContextScope {
  id: string;
  parentId?: string;
  variables: Record<string, unknown>;
  timestamp: number;
}

export interface ContextSnapshot {
  id: string;
  scopes: ContextScope[];
  currentScopeId: string;
  timestamp: number;
}

/**
 * Context Manager for managing variable scopes
 */
export class ContextManager {
  private scopes: Map<string, ContextScope>;
  private currentScopeId: string;
  private logger: Logger;
  private scopeIdCounter: number;

  constructor() {
    this.scopes = new Map();
    this.currentScopeId = '';
    this.logger = new Logger('ContextManager');
    this.scopeIdCounter = 0;

    // Create root scope
    this.createScope();
  }

  /**
   * Create a new scope
   */
  createScope(parentScopeId?: string): ContextScope {
    const id = `scope_${++this.scopeIdCounter}`;
    const scope: ContextScope = {
      id,
      parentId: parentScopeId || this.currentScopeId || undefined,
      variables: {},
      timestamp: Date.now(),
    };

    this.scopes.set(id, scope);

    if (!parentScopeId) {
      // If no parent specified, set as child of current scope
      if (this.currentScopeId) {
        const currentScope = this.scopes.get(this.currentScopeId);
        if (currentScope) {
          scope.parentId = currentScope.id;
        }
      }
    }

    this.currentScopeId = id;
    this.logger.debug(`Created scope: ${id}`, { parentId: scope.parentId });

    return scope;
  }

  /**
   * Push a new scope onto the stack
   */
  pushScope(scope?: ContextScope): ContextScope {
    if (scope) {
      this.scopes.set(scope.id, scope);
      this.currentScopeId = scope.id;
      return scope;
    }
    return this.createScope();
  }

  /**
   * Pop the current scope
   */
  popScope(): ContextScope | null {
    if (this.scopes.size <= 1) {
      this.logger.warn('Cannot pop root scope');
      return null;
    }

    const currentScope = this.scopes.get(this.currentScopeId);
    if (!currentScope) {
      return null;
    }

    // Move to parent scope
    if (currentScope.parentId) {
      this.currentScopeId = currentScope.parentId;
    }

    this.logger.debug(`Popped scope: ${currentScope.id}`);
    return currentScope;
  }

  /**
   * Get the current scope
   */
  getCurrentScope(): ContextScope | null {
    return this.scopes.get(this.currentScopeId) || null;
  }

  /**
   * Get a scope by ID
   */
  getScope(scopeId: string): ContextScope | null {
    return this.scopes.get(scopeId) || null;
  }

  /**
   * Set a variable in the current scope
   */
  set(key: string, value: unknown, scopeId?: string): void {
    const targetScopeId = scopeId || this.currentScopeId;
    const scope = this.scopes.get(targetScopeId);

    if (!scope) {
      this.logger.warn(`Scope not found: ${targetScopeId}`);
      return;
    }

    scope.variables[key] = value;
    this.logger.debug(`Set variable: ${key}`, { scopeId: targetScopeId });
  }

  /**
   * Get a variable from the current scope or parent scopes
   */
  get(path: string, defaultValue?: unknown): unknown {
    const keys = path.split('.');
    let value: unknown = this.getCurrentScope()?.variables;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[key];
      } else {
        return defaultValue !== undefined ? defaultValue : undefined;
      }
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Check if a variable exists
   */
  has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  /**
   * Delete a variable
   */
  delete(key: string, scopeId?: string): boolean {
    const targetScopeId = scopeId || this.currentScopeId;
    const scope = this.scopes.get(targetScopeId);

    if (!scope) {
      return false;
    }

    if (key in scope.variables) {
      delete scope.variables[key];
      this.logger.debug(`Deleted variable: ${key}`, { scopeId: targetScopeId });
      return true;
    }

    return false;
  }

  /**
   * Get all variables from current scope and parent scopes
   */
  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const visited = new Set<string>();

    let scopeId: string | undefined = this.currentScopeId;

    while (scopeId && !visited.has(scopeId)) {
      const scope = this.scopes.get(scopeId);
      if (!scope) break;

      visited.add(scopeId);
      Object.assign(result, scope.variables);

      scopeId = scope.parentId;
    }

    return result;
  }

  /**
   * Get only variables from current scope
   */
  getCurrentVariables(): Record<string, unknown> {
    const scope = this.scopes.get(this.currentScopeId);
    return scope ? { ...scope.variables } : {};
  }

  /**
   * Merge data into current scope
   */
  merge(data: Record<string, unknown>, scopeId?: string): void {
    const targetScopeId = scopeId || this.currentScopeId;
    const scope = this.scopes.get(targetScopeId);

    if (!scope) {
      this.logger.warn(`Scope not found: ${targetScopeId}`);
      return;
    }

    Object.assign(scope.variables, data);
    this.logger.debug('Merged data into scope', { scopeId: targetScopeId, keys: Object.keys(data) });
  }

  /**
   * Clear the current scope
   */
  clear(scopeId?: string): void {
    const targetScopeId = scopeId || this.currentScopeId;
    const scope = this.scopes.get(targetScopeId);

    if (scope) {
      scope.variables = {};
      this.logger.debug(`Cleared scope: ${targetScopeId}`);
    }
  }

  /**
   * Create a snapshot of the current context
   */
  snapshot(): ContextSnapshot {
    // Deep copy all scopes
    const scopesCopy: ContextScope[] = Array.from(this.scopes.values()).map(scope => ({
      ...scope,
      variables: { ...scope.variables },
    }));

    const snapshot: ContextSnapshot = {
      id: `snapshot_${Date.now()}`,
      scopes: scopesCopy,
      currentScopeId: this.currentScopeId,
      timestamp: Date.now(),
    };

    this.logger.debug('Created context snapshot', { snapshotId: snapshot.id });
    return snapshot;
  }

  /**
   * Restore context from a snapshot
   */
  restore(snapshot: ContextSnapshot): void {
    // Clear existing scopes
    this.scopes.clear();

    // Restore scopes from snapshot
    for (const scope of snapshot.scopes) {
      this.scopes.set(scope.id, {
        ...scope,
        variables: { ...scope.variables },
      });
    }

    this.currentScopeId = snapshot.currentScopeId;
    this.logger.debug('Restored context from snapshot', { snapshotId: snapshot.id });
  }

  /**
   * Clone the current context data (without scope structure)
   */
  clone(): Record<string, unknown> {
    return this.getAll();
  }

  /**
   * Get the scope ID chain from current to root
   */
  getScopeChain(): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    let scopeId: string | undefined = this.currentScopeId;

    while (scopeId && !visited.has(scopeId)) {
      chain.push(scopeId);
      visited.add(scopeId);

      const scope = this.scopes.get(scopeId);
      scopeId = scope?.parentId;
    }

    return chain;
  }

  /**
   * Resolve variable paths with ${...} syntax
   */
  static resolveTemplate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const keys = path.split('.');
      let value: unknown = context;

      for (const key of keys) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[key];
        } else {
          return match; // Return original if not found
        }
      }

      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Resolve all variables in an object
   */
  static resolveObject<T>(obj: T, context: Record<string, unknown>): T {
    if (typeof obj === 'string') {
      return ContextManager.resolveTemplate(obj, context) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => ContextManager.resolveObject(item, context)) as T;
    }

    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        result[key] = ContextManager.resolveObject(value, context);
      }
      return result as T;
    }

    return obj;
  }
}

export default ContextManager;
