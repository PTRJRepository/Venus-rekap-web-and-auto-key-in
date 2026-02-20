/**
 * Puppeteer Adapter - Implementation of BrowserAdapter using Puppeteer
 */

import puppeteer, { Browser, Page, LaunchOptions } from 'puppeteer';
import {
  BrowserAdapter,
  NavigationOptions,
  ClickOptions,
  TypeOptions,
  WaitOptions,
  ScreenshotOptions,
  ElementInfo,
} from './browserAdapter';
import { Logger } from '../utils/logger';

export interface PuppeteerAdapterConfig {
  headless?: boolean;
  slowMo?: number;
  userDataDir?: string;
  args?: string[];
  defaultTimeout?: number;
}

/**
 * Puppeteer Adapter implementation
 */
export class PuppeteerAdapter implements BrowserAdapter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private logger: Logger;
  private config: PuppeteerAdapterConfig;

  constructor(config: PuppeteerAdapterConfig = {}) {
    this.logger = new Logger('PuppeteerAdapter');
    this.config = {
      headless: false,
      slowMo: 0,
      defaultTimeout: 30000,
      ...config,
    };
  }

  /**
   * Launch the browser
   */
  async launch(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      this.logger.warn('Browser already running');
      return;
    }

    this.logger.info('Launching browser...');

    const launchOptions: LaunchOptions = {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      userDataDir: this.config.userDataDir,
      args: this.config.args || [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--process-per-site',
      ],
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Set default timeout
    this.page.setDefaultTimeout(this.config.defaultTimeout!);

    // Set user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Handle page errors
    this.page.on('error', (error) => {
      this.logger.error('Page error', error);
    });

    this.logger.info('Browser launched successfully');
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.logger.info('Browser closed');
    }
  }

  /**
   * Reconnect to existing browser
   */
  async reconnect(): Promise<boolean> {
    // For puppeteer, reconnect is not straightforward
    // This would require using the Chrome DevTools Protocol
    this.logger.warn('Reconnect not fully implemented for Puppeteer');
    return false;
  }

  /**
   * Navigate to URL
   */
  async navigate(url: string, options?: NavigationOptions): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    const navOptions: Parameters<typeof this.page.goto>[1] = {
      waitUntil: options?.waitUntil || 'domcontentloaded',
      timeout: options?.timeout || this.config.defaultTimeout,
    };

    if (options?.referer) {
      navOptions.referer = options.referer;
    }

    await this.page.goto(url, navOptions);
    this.logger.debug(`Navigated to: ${url}`);
  }

  /**
   * Go back
   */
  async goBack(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.goBack({ waitUntil: 'domcontentloaded' });
  }

  /**
   * Go forward
   */
  async goForward(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.goForward({ waitUntil: 'domcontentloaded' });
  }

  /**
   * Reload page
   */
  async reload(options?: NavigationOptions): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.reload({
      waitUntil: options?.waitUntil || 'domcontentloaded',
      timeout: options?.timeout || this.config.defaultTimeout,
    });
  }

  /**
   * Click on element
   */
  async click(selector: string, options?: ClickOptions): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector(selector, { timeout: this.config.defaultTimeout });
    await this.page.click(selector, {
      delay: options?.delay,
      button: options?.button || 'left',
      clickCount: options?.clickCount || 1,
    });

    this.logger.debug(`Clicked: ${selector}`);
  }

  /**
   * Type into element
   */
  async type(selector: string, value: string, options?: TypeOptions): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector(selector, { timeout: this.config.defaultTimeout });

    // Clear the field first
    await this.page.click(selector, { clickCount: 3 });
    await this.page.keyboard.press('Backspace');

    // Type the value
    await this.page.type(selector, value, { delay: options?.delay || 10 });

    this.logger.debug(`Typed into: ${selector}`);
  }

  /**
   * Select option
   */
  async select(selector: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector(selector, { timeout: this.config.defaultTimeout });
    await this.page.select(selector, value);

    this.logger.debug(`Selected in: ${selector}`);
  }

  /**
   * Evaluate function in page context
   */
  async evaluate<T = unknown>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
    if (!this.page) throw new Error('Page not initialized');

    if (typeof fn === 'string') {
      // It's a string, evaluate it
      return await this.page.evaluate(fn, ...args);
    }

    // It's a function
    return await this.page.evaluate(fn, ...args);
  }

  /**
   * Wait for selector
   */
  async waitForSelector(selector: string, options?: WaitOptions): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector(selector, {
      timeout: options?.timeout || this.config.defaultTimeout,
      visible: options?.visible,
      hidden: options?.hidden,
    });

    this.logger.debug(`Found selector: ${selector}`);
  }

  /**
   * Wait for function
   */
  async waitForFunction(fn: string | (() => boolean), options?: WaitOptions): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    if (typeof fn === 'string') {
      await this.page.waitForFunction(fn, {
        timeout: options?.timeout || this.config.defaultTimeout,
      });
    } else {
      await this.page.waitForFunction(fn, {
        timeout: options?.timeout || this.config.defaultTimeout,
      });
    }

    this.logger.debug('Wait function completed');
  }

  /**
   * Wait for navigation
   */
  async waitForNavigation(options?: NavigationOptions): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForNavigation({
      waitUntil: options?.waitUntil || 'domcontentloaded',
      timeout: options?.timeout || this.config.defaultTimeout,
    });

    this.logger.debug('Navigation completed');
  }

  /**
   * Extract text content
   */
  async extract(selector: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');

    const text = await this.page.$eval(selector, (el) => el.textContent || '');
    return text.trim();
  }

  /**
   * Extract all matching elements
   */
  async extractAll(selector: string): Promise<string[]> {
    if (!this.page) throw new Error('Page not initialized');

    const texts = await this.page.$$eval(selector, (elements) =>
      elements.map((el) => el.textContent?.trim() || '')
    );
    return texts;
  }

  /**
   * Extract HTML
   */
  async extractHtml(selector: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');

    const html = await this.page.$eval(selector, (el) => el.innerHTML);
    return html;
  }

  /**
   * Get element info
   */
  async getElementInfo(selector: string): Promise<ElementInfo | null> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      const info = await this.page.$eval(selector, (el) => {
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName.toLowerCase(),
          textContent: el.textContent || '',
          value: (el as HTMLInputElement).value || '',
          attributes: Array.from(el.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {} as Record<string, string>),
          isVisible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
          isEnabled: !(el as HTMLInputElement).disabled,
        };
      });
      return info;
    } catch {
      return null;
    }
  }

  /**
   * Take screenshot
   */
  async screenshot(options?: ScreenshotOptions): Promise<Buffer | string> {
    if (!this.page) throw new Error('Page not initialized');

    const screenshotOptions: Parameters<typeof this.page.screenshot>[0] = {
      type: options?.type || 'png',
      encoding: options?.encoding || 'binary',
      fullPage: options?.fullPage || false,
    };

    if (options?.quality) {
      screenshotOptions.quality = options.quality;
    }

    const buffer = await this.page.screenshot(screenshotOptions);
    return buffer;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return !!this.browser?.isConnected();
  }

  /**
   * Get current URL
   */
  getUrl(): string {
    return this.page?.url() || '';
  }

  /**
   * Get page title
   */
  getTitle(): string {
    return this.page?.title() || '';
  }

  /**
   * Set viewport
   */
  async setViewport(width: number, height: number): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.setViewport({ width, height });
  }

  /**
   * Add script tag
   */
  async addScriptTag(url: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.addScriptTag({ url });
  }

  /**
   * Add style tag
   */
  async addStyleTag(content: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.addStyleTag({ content });
  }

  /**
   * Set user agent
   */
  async setUserAgent(userAgent: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.setUserAgent(userAgent);
  }

  /**
   * Get cookies
   */
  async getCookies(): Promise<Array<{ name: string; value: string; domain: string; path: string }>> {
    if (!this.page) throw new Error('Page not initialized');
    const cookies = await this.page.cookies();
    return cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
    }));
  }

  /**
   * Set cookies
   */
  async setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.setCookie(...cookies);
  }

  /**
   * Clear cookies
   */
  async clearCookies(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.deleteCookie(...(await this.page.cookies()));
  }

  /**
   * Upload file
   */
  async uploadFile(selector: string, filePath: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.uploadFile(selector, filePath);
  }

  /**
   * Scroll to element
   */
  async scrollTo(selector: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.$eval(selector, (el) => el.scrollIntoView());
  }

  /**
   * Scroll by amount
   */
  async scrollBy(x: number, y: number): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.evaluate((dx, dy) => window.scrollBy(dx, dy), x, y);
  }

  /**
   * Get scroll position
   */
  async getScrollPosition(): Promise<{ x: number; y: number }> {
    if (!this.page) throw new Error('Page not initialized');
    return await this.page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }));
  }

  /**
   * Hover over element
   */
  async hover(selector: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.hover(selector);
  }

  /**
   * Focus on element
   */
  async focus(selector: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.focus(selector);
  }

  /**
   * Press keyboard key
   */
  async press(key: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.keyboard.press(key);
  }

  /**
   * Check if element exists
   */
  async exists(selector: string): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    const element = await this.page.$(selector);
    return element !== null;
  }

  /**
   * Check if element is visible
   */
  async isVisible(selector: string): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    const visible = await this.page.isVisible(selector);
    return visible;
  }
}

export default PuppeteerAdapter;
