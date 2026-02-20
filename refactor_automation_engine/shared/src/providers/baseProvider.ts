/**
 * Provider Interface and Factory
 * Platform abstraction for different web applications
 */

import { BrowserAdapter, NavigationOptions } from '../adapters/browserAdapter';
import { Logger } from '../utils/logger';

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  credentials?: {
    username?: string;
    password?: string;
    [key: string]: unknown;
  };
  timeout?: number;
  selectors?: Record<string, Record<string, string>>;
  [key: string]: unknown;
}

export interface ProviderLoginWorkflow {
  url: string;
  steps: ProviderWorkflowStep[];
}

export interface ProviderWorkflowStep {
  action: string;
  params: Record<string, unknown>;
}

export interface SessionValidation {
  valid: boolean;
  reason?: string;
  needsRelogin?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Base Provider Interface
 * All providers must implement this interface
 */
export interface BaseProvider {
  /**
   * Get provider name
   */
  getName(): string;

  /**
   * Get base URL
   */
  getBaseUrl(): string;

  /**
   * Get login workflow
   */
  getLoginWorkflow(): ProviderLoginWorkflow | null;

  /**
   * Get selectors for this provider
   */
  getSelectors(): Record<string, Record<string, string>>;

  /**
   * Validate current session
   */
  validateSession(adapter: BrowserAdapter): Promise<SessionValidation>;

  /**
   * Handle session expiry
   */
  handleSessionExpiry(adapter: BrowserAdapter, context: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;

  /**
   * Hook: Before execution
   */
  beforeExecution?(context: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Hook: After execution
   */
  afterExecution?(result: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Hook: Before action
   */
  beforeAction?(action: string, params: Record<string, unknown>, context: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Hook: After action
   */
  afterAction?(action: string, result: Record<string, unknown>, context: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Get error page indicators
   */
  getErrorIndicators(): string[];

  /**
   * Configure the provider
   */
  configure(config: Partial<ProviderConfig>): void;

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig;
}

/**
 * Abstract base class for providers
 */
export abstract class AbstractProvider implements BaseProvider {
  protected config: ProviderConfig;
  protected logger: Logger;

  constructor(config: ProviderConfig) {
    this.config = {
      name: 'unknown',
      baseUrl: '',
      timeout: 30000,
      ...config,
    };
    this.logger = new Logger(`Provider:${this.config.name}`);
  }

  abstract getName(): string;
  abstract getBaseUrl(): string;
  abstract getLoginWorkflow(): ProviderLoginWorkflow | null;
  abstract getSelectors(): Record<string, Record<string, string>>;
  abstract validateSession(adapter: BrowserAdapter): Promise<SessionValidation>;
  abstract handleSessionExpiry(adapter: BrowserAdapter, context: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;
  abstract getErrorIndicators(): string[];

  beforeExecution?(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    return Promise.resolve(context);
  }

  afterExecution?(result: Record<string, unknown>): Promise<Record<string, unknown>> {
    return Promise.resolve(result);
  }

  beforeAction?(action: string, params: Record<string, unknown>, context: Record<string, unknown>): Promise<Record<string, unknown>> {
    return Promise.resolve(params);
  }

  afterAction?(action: string, result: Record<string, unknown>, context: Record<string, unknown>): Promise<Record<string, unknown>> {
    return Promise.resolve(result);
  }

  configure(config: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ProviderConfig {
    return { ...this.config };
  }

  /**
   * Check if URL is an error page
   */
  protected isErrorPage(url: string): boolean {
    const indicators = this.getErrorIndicators();
    return indicators.some(indicator => url.includes(indicator));
  }

  /**
   * Execute login workflow
   */
  protected async executeLoginWorkflow(
    adapter: BrowserAdapter,
    context: Record<string, unknown>
  ): Promise<void> {
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
          await adapter.type(
            step.params.selector as string,
            step.params.value as string,
            step.params.options as { delay?: number }
          );
          break;

        case 'click':
          await adapter.click(step.params.selector as string, step.params.options as { button?: 'left' | 'right' | 'middle'; clickCount?: number });
          break;

        case 'wait':
          await adapter.waitForSelector(step.params.selector as string, step.params.options as { timeout?: number });
          break;

        case 'waitNavigation':
          await adapter.waitForNavigation(step.params.options as NavigationOptions);
          break;

        default:
          this.logger.warn(`Unknown login step action: ${step.action}`);
      }
    }

    this.logger.info('Login workflow completed');
  }
}

/**
 * Provider Factory for creating provider instances
 */
export class ProviderFactory {
  private static providers: Map<string, new (config: ProviderConfig) => BaseProvider> = new Map();

  /**
   * Register a provider class
   */
  static register(name: string, ProviderClass: new (config: ProviderConfig) => BaseProvider): void {
    if (typeof ProviderClass !== 'function') {
      throw new Error('Provider must be a class constructor');
    }
    this.providers.set(name.toLowerCase(), ProviderClass);
  }

  /**
   * Create a provider instance
   */
  static create(name: string, config: ProviderConfig): BaseProvider {
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
  static has(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  /**
   * List all registered providers
   */
  static list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Unregister a provider
   */
  static unregister(name: string): boolean {
    return this.providers.delete(name.toLowerCase());
  }

  /**
   * Clear all providers
   */
  static clear(): void {
    this.providers.clear();
  }
}

// Re-export for convenience
export { AbstractProvider as Provider };

export default BaseProvider;
