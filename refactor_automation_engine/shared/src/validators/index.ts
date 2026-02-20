/**
 * Validator System - Base Validator and Built-in Validators
 */

import { BrowserAdapter } from '../adapters/browserAdapter';
import { Logger } from '../utils/logger';

export interface ValidatorResult {
  valid: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface Validator {
  validate(
    adapter: BrowserAdapter,
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<ValidatorResult>;
}

/**
 * Base Validator class
 */
export abstract class BaseValidator implements Validator {
  protected logger: Logger;
  protected name: string;

  constructor(name: string) {
    this.name = name;
    this.logger = new Logger(`Validator:${name}`);
  }

  abstract validate(
    adapter: BrowserAdapter,
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<ValidatorResult>;

  protected valid(details?: Record<string, unknown>): ValidatorResult {
    return { valid: true, details };
  }

  protected invalid(reason: string, details?: Record<string, unknown>): ValidatorResult {
    return { valid: false, reason, details };
  }
}

/**
 * Element Validator - Check element existence and properties
 */
export class ElementValidator extends BaseValidator {
  constructor() {
    super('element');
  }

  async validate(
    adapter: BrowserAdapter,
    params: Record<string, unknown>,
    _context: Record<string, unknown>
  ): Promise<ValidatorResult> {
    const { selector, check = 'exists', timeout = 5000 } = params as {
      selector: string;
      check?: 'exists' | 'visible' | 'enabled' | 'hidden';
      timeout?: number;
    };

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
    } catch (error) {
      return this.invalid('Element check failed', {
        selector,
        check,
        error: (error as Error).message,
      });
    }
  }
}

/**
 * Value Validator - Check element value
 */
export class ValueValidator extends BaseValidator {
  constructor() {
    super('value');
  }

  async validate(
    adapter: BrowserAdapter,
    params: Record<string, unknown>,
    _context: Record<string, unknown>
  ): Promise<ValidatorResult> {
    const { selector, expected, operator = '==', type = 'text' } = params as {
      selector: string;
      expected: string;
      operator?: '==' | '!=' | '===' | '!==' | 'contains' | 'matches';
      type?: 'text' | 'value' | 'attribute';
      attribute?: string;
    };

    try {
      let actual: string;

      if (type === 'value') {
        actual = await adapter.evaluate(
          (sel: string) => (document.querySelector(sel) as HTMLInputElement)?.value || '',
          selector
        );
      } else if (type === 'attribute' && params.attribute) {
        actual = await adapter.evaluate(
          (sel: string, attr: string) => document.querySelector(sel)?.getAttribute(attr) || '',
          selector,
          params.attribute
        );
      } else {
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
    } catch (error) {
      return this.invalid('Value check failed', {
        selector,
        error: (error as Error).message,
      });
    }
  }
}

/**
 * Condition Validator - Evaluate JavaScript condition
 */
export class ConditionValidator extends BaseValidator {
  constructor() {
    super('condition');
  }

  async validate(
    _adapter: BrowserAdapter,
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<ValidatorResult> {
    const { condition } = params as { condition: string };

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
    } catch (error) {
      return this.invalid('Condition evaluation error', {
        condition,
        error: (error as Error).message,
      });
    }
  }
}

/**
 * Network Validator - Check network status
 */
export class NetworkValidator extends BaseValidator {
  constructor() {
    super('network');
  }

  async validate(
    adapter: BrowserAdapter,
    params: Record<string, unknown>,
    _context: Record<string, unknown>
  ): Promise<ValidatorResult> {
    const { check, url } = params as {
      check: 'statusEquals' | 'responseContains' | 'no404';
      url?: string;
    };

    try {
      const currentUrl = url || adapter.getUrl();

      switch (check) {
        case 'statusEquals': {
          const status = await adapter.evaluate(
            async (targetUrl: string) => {
              const response = await fetch(targetUrl, { method: 'HEAD' });
              return response.status;
            },
            currentUrl
          );
          const expectedStatus = params.status as number;
          if (status !== expectedStatus) {
            return this.invalid('Status mismatch', { url: currentUrl, expected: expectedStatus, actual: status });
          }
          return this.valid({ url: currentUrl, status });
        }

        case 'responseContains': {
          const html = await adapter.extract('body');
          const text = params.text as string;
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
    } catch (error) {
      return this.invalid('Network check failed', {
        check,
        error: (error as Error).message,
      });
    }
  }
}

/**
 * Chain Validator - Chain multiple validators
 */
export class ChainValidator extends BaseValidator {
  constructor() {
    super('chain');
  }

  async validate(
    adapter: BrowserAdapter,
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<ValidatorResult> {
    const { chain, mode = 'sequential', stopOnFirstInvalid = true } = params as {
      chain: Array<{ validator: string; params: Record<string, unknown> }>;
      mode?: 'sequential' | 'parallel';
      stopOnFirstInvalid?: boolean;
    };

    const results: Array<{ validator: string; result: ValidatorResult }> = [];

    if (mode === 'sequential') {
      for (const step of chain) {
        const validator = this.getValidator(step.validator);
        if (!validator) {
          results.push({
            validator: step.validator,
            result: { valid: false, reason: 'Validator not found' },
          });
          if (stopOnFirstInvalid) break;
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
    } else {
      // Parallel execution
      const promises = chain.map(async (step) => {
        const validator = this.getValidator(step.validator);
        if (!validator) {
          return {
            validator: step.validator,
            result: { valid: false, reason: 'Validator not found' } as ValidatorResult,
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

  private getValidator(name: string): Validator | null {
    const validators: Record<string, () => Validator> = {
      element: () => new ElementValidator(),
      value: () => new ValueValidator(),
      condition: () => new ConditionValidator(),
      network: () => new NetworkValidator(),
    };

    const factory = validators[name];
    return factory ? factory() : null;
  }
}

/**
 * Validator Registry
 */
export class ValidatorRegistry {
  private validators: Map<string, () => Validator> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ValidatorRegistry');
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register('element', () => new ElementValidator());
    this.register('value', () => new ValueValidator());
    this.register('condition', () => new ConditionValidator());
    this.register('network', () => new NetworkValidator());
    this.register('chain', () => new ChainValidator());
  }

  register(name: string, factory: () => Validator): void {
    this.validators.set(name, factory);
    this.logger.debug(`Registered validator: ${name}`);
  }

  get(name: string): Validator | null {
    const factory = this.validators.get(name);
    return factory ? factory() : null;
  }

  has(name: string): boolean {
    return this.validators.has(name);
  }

  list(): string[] {
    return Array.from(this.validators.keys());
  }

  async validate(
    validatorName: string,
    adapter: BrowserAdapter,
    params: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<ValidatorResult> {
    const validator = this.get(validatorName);
    if (!validator) {
      return { valid: false, reason: `Validator not found: ${validatorName}` };
    }

    return await validator.validate(adapter, params, context);
  }
}

// Export all validators
export const validators = {
  ElementValidator,
  ValueValidator,
  ConditionValidator,
  NetworkValidator,
  ChainValidator,
  ValidatorRegistry,
};
