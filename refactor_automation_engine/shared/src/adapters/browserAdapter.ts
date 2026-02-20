/**
 * Browser Adapter Interface
 * Abstraction layer for browser automation
 */

import { Logger } from '../utils/logger';

export interface NavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
  referer?: string;
}

export interface ClickOptions {
  delay?: number;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
}

export interface TypeOptions {
  delay?: number;
}

export interface WaitOptions {
  timeout?: number;
  visible?: boolean;
  hidden?: boolean;
}

export interface ScreenshotOptions {
  type?: 'png' | 'jpeg' | 'webp';
  encoding?: 'base64' | 'binary';
  quality?: number;
  fullPage?: boolean;
}

export interface ElementInfo {
  tagName: string;
  textContent: string;
  value: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  isEnabled: boolean;
}

/**
 * Browser Adapter Interface
 * All browser adapters must implement this interface
 */
export interface BrowserAdapter {
  /**
   * Launch the browser
   */
  launch(): Promise<void>;

  /**
   * Close the browser
   */
  close(): Promise<void>;

  /**
   * Reconnect to an existing browser
   */
  reconnect(): Promise<boolean>;

  /**
   * Navigate to a URL
   */
  navigate(url: string, options?: NavigationOptions): Promise<void>;

  /**
   * Go back in history
   */
  goBack(): Promise<void>;

  /**
   * Go forward in history
   */
  goForward(): Promise<void>;

  /**
   * Reload the current page
   */
  reload(options?: NavigationOptions): Promise<void>;

  /**
   * Click on an element
   */
  click(selector: string, options?: ClickOptions): Promise<void>;

  /**
   * Type text into an element
   */
  type(selector: string, value: string, options?: TypeOptions): Promise<void>;

  /**
   * Select an option from a dropdown
   */
  select(selector: string, value: string): Promise<void>;

  /**
   * Evaluate a function in the browser context
   */
  evaluate<T = unknown>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T>;

  /**
   * Wait for a selector to appear
   */
  waitForSelector(selector: string, options?: WaitOptions): Promise<void>;

  /**
   * Wait for a function to return true
   */
  waitForFunction(fn: string | (() => boolean), options?: WaitOptions): Promise<void>;

  /**
   * Wait for navigation to complete
   */
  waitForNavigation(options?: NavigationOptions): Promise<void>;

  /**
   * Extract text content from an element
   */
  extract(selector: string): Promise<string>;

  /**
   * Extract text content from all matching elements
   */
  extractAll(selector: string): Promise<string[]>;

  /**
   * Extract HTML from an element
   */
  extractHtml(selector: string): Promise<string>;

  /**
   * Get element information
   */
  getElementInfo(selector: string): Promise<ElementInfo | null>;

  /**
   * Take a screenshot
   */
  screenshot(options?: ScreenshotOptions): Promise<Buffer | string>;

  /**
   * Check if browser is connected
   */
  isConnected(): boolean;

  /**
   * Get current URL
   */
  getUrl(): string;

  /**
   * Get page title
   */
  getTitle(): string;

  /**
   * Set viewport size
   */
  setViewport(width: number, height: number): Promise<void>;

  /**
   * Add script to page
   */
  addScriptTag(url: string): Promise<void>;

  /**
   * Add style to page
   */
  addStyleTag(content: string): Promise<void>;

  /**
   * Set user agent
   */
  setUserAgent(userAgent: string): Promise<void>;

  /**
   * Get cookies
   */
  getCookies(): Promise<Array<{ name: string; value: string; domain: string; path: string }>>;

  /**
   * Set cookies
   */
  setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>): Promise<void>;

  /**
   * Delete all cookies
   */
  clearCookies(): Promise<void>;

  /**
   * Upload file to input element
   */
  uploadFile(selector: string, filePath: string): Promise<void>;

  /**
   * Scroll to element
   */
  scrollTo(selector: string): Promise<void>;

  /**
   * Scroll by amount
   */
  scrollBy(x: number, y: number): Promise<void>;

  /**
   * Get scroll position
   */
  getScrollPosition(): Promise<{ x: number; y: number }>;

  /**
   * Hover over element
   */
  hover(selector: string): Promise<void>;

  /**
   * Focus on element
   */
  focus(selector: string): Promise<void>;

  /**
   * Press keyboard key
   */
  press(key: string): Promise<void>;

  /**
   * Check if element exists
   */
  exists(selector: string): Promise<boolean>;

  /**
   * Check if element is visible
   */
  isVisible(selector: string): Promise<boolean>;
}

/**
 * Abstract base class for browser adapters
 */
export abstract class BaseBrowserAdapter implements BrowserAdapter {
  protected logger: Logger;
  protected isBrowserConnected: boolean = false;

  constructor(context: string = 'BrowserAdapter') {
    this.logger = new Logger(context);
  }

  abstract launch(): Promise<void>;
  abstract close(): Promise<void>;
  abstract reconnect(): Promise<boolean>;
  abstract navigate(url: string, options?: NavigationOptions): Promise<void>;
  abstract goBack(): Promise<void>;
  abstract goForward(): Promise<void>;
  abstract reload(options?: NavigationOptions): Promise<void>;
  abstract click(selector: string, options?: ClickOptions): Promise<void>;
  abstract type(selector: string, value: string, options?: TypeOptions): Promise<void>;
  abstract select(selector: string, value: string): Promise<void>;
  abstract evaluate<T = unknown>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T>;
  abstract waitForSelector(selector: string, options?: WaitOptions): Promise<void>;
  abstract waitForFunction(fn: string | (() => boolean), options?: WaitOptions): Promise<void>;
  abstract waitForNavigation(options?: NavigationOptions): Promise<void>;
  abstract extract(selector: string): Promise<string>;
  abstract extractAll(selector: string): Promise<string[]>;
  abstract extractHtml(selector: string): Promise<string>;
  abstract getElementInfo(selector: string): Promise<ElementInfo | null>;
  abstract screenshot(options?: ScreenshotOptions): Promise<Buffer | string>;
  abstract setViewport(width: number, height: number): Promise<void>;
  abstract addScriptTag(url: string): Promise<void>;
  abstract addStyleTag(content: string): Promise<void>;
  abstract setUserAgent(userAgent: string): Promise<void>;
  abstract getCookies(): Promise<Array<{ name: string; value: string; domain: string; path: string }>>;
  abstract setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>): Promise<void>;
  abstract clearCookies(): Promise<void>;
  abstract uploadFile(selector: string, filePath: string): Promise<void>;
  abstract scrollTo(selector: string): Promise<void>;
  abstract scrollBy(x: number, y: number): Promise<void>;
  abstract getScrollPosition(): Promise<{ x: number; y: number }>;
  abstract hover(selector: string): Promise<void>;
  abstract focus(selector: string): Promise<void>;
  abstract press(key: string): Promise<void>;
  abstract exists(selector: string): Promise<boolean>;
  abstract isVisible(selector: string): Promise<boolean>;

  isConnected(): boolean {
    return this.isBrowserConnected;
  }

  abstract getUrl(): string;
  abstract getTitle(): string;
}

export default BrowserAdapter;
