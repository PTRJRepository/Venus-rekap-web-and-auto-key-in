"use strict";
/**
 * Puppeteer Adapter - Implementation of BrowserAdapter using Puppeteer
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppeteerAdapter = void 0;
const puppeteer_1 = __importDefault(require("puppeteer"));
const logger_1 = require("../utils/logger");
/**
 * Puppeteer Adapter implementation
 */
class PuppeteerAdapter {
    constructor(config = {}) {
        this.browser = null;
        this.page = null;
        this.logger = new logger_1.Logger('PuppeteerAdapter');
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
    async launch() {
        if (this.browser && this.browser.isConnected()) {
            this.logger.warn('Browser already running');
            return;
        }
        this.logger.info('Launching browser...');
        const launchOptions = {
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
        this.browser = await puppeteer_1.default.launch(launchOptions);
        this.page = await this.browser.newPage();
        // Set default timeout
        this.page.setDefaultTimeout(this.config.defaultTimeout);
        // Set user agent
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        // Handle page errors
        this.page.on('error', (error) => {
            this.logger.error('Page error', error);
        });
        this.logger.info('Browser launched successfully');
    }
    /**
     * Close the browser
     */
    async close() {
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
    async reconnect() {
        // For puppeteer, reconnect is not straightforward
        // This would require using the Chrome DevTools Protocol
        this.logger.warn('Reconnect not fully implemented for Puppeteer');
        return false;
    }
    /**
     * Navigate to URL
     */
    async navigate(url, options) {
        if (!this.page)
            throw new Error('Page not initialized');
        const navOptions = {
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
    async goBack() {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.goBack({ waitUntil: 'domcontentloaded' });
    }
    /**
     * Go forward
     */
    async goForward() {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.goForward({ waitUntil: 'domcontentloaded' });
    }
    /**
     * Reload page
     */
    async reload(options) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.reload({
            waitUntil: options?.waitUntil || 'domcontentloaded',
            timeout: options?.timeout || this.config.defaultTimeout,
        });
    }
    /**
     * Click on element
     */
    async click(selector, options) {
        if (!this.page)
            throw new Error('Page not initialized');
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
    async type(selector, value, options) {
        if (!this.page)
            throw new Error('Page not initialized');
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
    async select(selector, value) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.waitForSelector(selector, { timeout: this.config.defaultTimeout });
        await this.page.select(selector, value);
        this.logger.debug(`Selected in: ${selector}`);
    }
    /**
     * Evaluate function in page context
     */
    async evaluate(fn, ...args) {
        if (!this.page)
            throw new Error('Page not initialized');
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
    async waitForSelector(selector, options) {
        if (!this.page)
            throw new Error('Page not initialized');
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
    async waitForFunction(fn, options) {
        if (!this.page)
            throw new Error('Page not initialized');
        if (typeof fn === 'string') {
            await this.page.waitForFunction(fn, {
                timeout: options?.timeout || this.config.defaultTimeout,
            });
        }
        else {
            await this.page.waitForFunction(fn, {
                timeout: options?.timeout || this.config.defaultTimeout,
            });
        }
        this.logger.debug('Wait function completed');
    }
    /**
     * Wait for navigation
     */
    async waitForNavigation(options) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.waitForNavigation({
            waitUntil: options?.waitUntil || 'domcontentloaded',
            timeout: options?.timeout || this.config.defaultTimeout,
        });
        this.logger.debug('Navigation completed');
    }
    /**
     * Extract text content
     */
    async extract(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        const text = await this.page.$eval(selector, (el) => el.textContent || '');
        return text.trim();
    }
    /**
     * Extract all matching elements
     */
    async extractAll(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        const texts = await this.page.$$eval(selector, (elements) => elements.map((el) => el.textContent?.trim() || ''));
        return texts;
    }
    /**
     * Extract HTML
     */
    async extractHtml(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        const html = await this.page.$eval(selector, (el) => el.innerHTML);
        return html;
    }
    /**
     * Get element info
     */
    async getElementInfo(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        try {
            const info = await this.page.$eval(selector, (el) => {
                const style = window.getComputedStyle(el);
                return {
                    tagName: el.tagName.toLowerCase(),
                    textContent: el.textContent || '',
                    value: el.value || '',
                    attributes: Array.from(el.attributes).reduce((acc, attr) => {
                        acc[attr.name] = attr.value;
                        return acc;
                    }, {}),
                    isVisible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
                    isEnabled: !el.disabled,
                };
            });
            return info;
        }
        catch {
            return null;
        }
    }
    /**
     * Take screenshot
     */
    async screenshot(options) {
        if (!this.page)
            throw new Error('Page not initialized');
        const screenshotOptions = {
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
    isConnected() {
        return !!this.browser?.isConnected();
    }
    /**
     * Get current URL
     */
    getUrl() {
        return this.page?.url() || '';
    }
    /**
     * Get page title
     */
    getTitle() {
        return this.page?.title() || '';
    }
    /**
     * Set viewport
     */
    async setViewport(width, height) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.setViewport({ width, height });
    }
    /**
     * Add script tag
     */
    async addScriptTag(url) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.addScriptTag({ url });
    }
    /**
     * Add style tag
     */
    async addStyleTag(content) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.addStyleTag({ content });
    }
    /**
     * Set user agent
     */
    async setUserAgent(userAgent) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.setUserAgent(userAgent);
    }
    /**
     * Get cookies
     */
    async getCookies() {
        if (!this.page)
            throw new Error('Page not initialized');
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
    async setCookies(cookies) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.setCookie(...cookies);
    }
    /**
     * Clear cookies
     */
    async clearCookies() {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.deleteCookie(...(await this.page.cookies()));
    }
    /**
     * Upload file
     */
    async uploadFile(selector, filePath) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.uploadFile(selector, filePath);
    }
    /**
     * Scroll to element
     */
    async scrollTo(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.$eval(selector, (el) => el.scrollIntoView());
    }
    /**
     * Scroll by amount
     */
    async scrollBy(x, y) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.evaluate((dx, dy) => window.scrollBy(dx, dy), x, y);
    }
    /**
     * Get scroll position
     */
    async getScrollPosition() {
        if (!this.page)
            throw new Error('Page not initialized');
        return await this.page.evaluate(() => ({
            x: window.scrollX,
            y: window.scrollY,
        }));
    }
    /**
     * Hover over element
     */
    async hover(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.hover(selector);
    }
    /**
     * Focus on element
     */
    async focus(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.focus(selector);
    }
    /**
     * Press keyboard key
     */
    async press(key) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.keyboard.press(key);
    }
    /**
     * Check if element exists
     */
    async exists(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        const element = await this.page.$(selector);
        return element !== null;
    }
    /**
     * Check if element is visible
     */
    async isVisible(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        const visible = await this.page.isVisible(selector);
        return visible;
    }
}
exports.PuppeteerAdapter = PuppeteerAdapter;
exports.default = PuppeteerAdapter;
