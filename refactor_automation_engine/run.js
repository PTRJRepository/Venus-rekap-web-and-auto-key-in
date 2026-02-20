/**
 * Venus Automation Engine - Generic Browser Automation Runner
 * 
 * Run: node run.js
 * 
 * KEUNGGULAN:
 * - Generic: Tidak tergantung pada Millware atau platform tertentu
 * - Template-based: Millware hanya salah satu template
 * - Extensible: Buat automation baru dengan editor visual
 * - Modular: Tambah provider baru dengan mudah
 */

const puppeteer = require('puppeteer');

// ==================== CORE ENGINE ====================

class Logger {
  constructor(context) {
    this.context = context;
  }
  
  debug(msg, ...args) { console.log(`[DEBUG][${this.context}]`, msg, ...args); }
  info(msg, ...args) { console.log(`[INFO][${this.context}]`, msg, ...args); }
  warn(msg, ...args) { console.log(`[WARN][${this.context}]`, msg, ...args); }
  error(msg, ...args) { console.error(`[ERROR][${this.context}]`, msg, ...args); }
}

class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }
  
  emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(h => h({ type: event, data, timestamp: Date.now() }));
  }
}

const Events = {
  START: 'flow:start',
  COMPLETE: 'flow:complete',
  ERROR: 'flow:error',
  NODE_START: 'node:start',
  NODE_COMPLETE: 'node:complete',
};

// ==================== CONTEXT MANAGER ====================

class ContextManager {
  constructor() {
    this.scopes = [{}];
  }
  
  createScope() {
    this.scopes.push({});
    return this;
  }
  
  popScope() {
    if (this.scopes.length > 1) this.scopes.pop();
    return this;
  }
  
  set(key, value) {
    const keys = key.split('.');
    let obj = this.scopes[this.scopes.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }
  
  get(path) {
    const keys = path.split('.');
    let value = this.scopes[this.scopes.length - 1];
    for (const key of keys) {
      if (value && typeof value === 'object') value = value[key];
      else return undefined;
    }
    return value;
  }
  
  has(path) {
    return this.get(path) !== undefined;
  }
  
  // Resolve ${variable.path} syntax
  resolve(template) {
    if (typeof template !== 'string') return template;
    return template.replace(/\$\{([^}]+)\}/g, (m, path) => {
      const val = this.get(path);
      return val !== undefined ? val : m;
    });
  }
  
  // Resolve all params
  resolveParams(params) {
    const resolved = {};
    for (const [key, value] of Object.entries(params || {})) {
      if (typeof value === 'string') {
        resolved[key] = this.resolve(value);
      } else if (Array.isArray(value)) {
        resolved[key] = value.map(v => typeof v === 'string' ? this.resolve(v) : v);
      } else if (value && typeof value === 'object') {
        resolved[key] = this.resolveParams(value);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }
  
  getAll() {
    return { ...this.scopes[this.scopes.length - 1] };
  }
}

// ==================== GENERIC BROWSER ADAPTER ====================

class BrowserAdapter {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = options;
    this.logger = new Logger('Browser');
  }
  
  async launch() {
    this.logger.info('Launching browser...');
    this.browser = await puppeteer.launch({
      headless: this.options.headless !== false,
      slowMo: this.options.slowMo || 0,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    this.page = await this.browser.newPage();
    this.logger.info('Browser ready');
  }
  
  async close() {
    if (this.browser) await this.browser.close();
    this.logger.info('Browser closed');
  }
  
  isConnected() { return this.browser?.isConnected(); }
  getUrl() { return this.page?.url() || ''; }
  getTitle() { return this.page?.title() || ''; }
  
  async navigate(url, options = {}) {
    await this.page.goto(url, { 
      waitUntil: options.waitUntil || 'domcontentloaded', 
      timeout: options.timeout || 30000 
    });
  }
  
  async click(selector, options = {}) {
    await this.page.waitForSelector(selector);
    await this.page.click(selector, { delay: options.delay });
  }
  
  async type(selector, value, options = {}) {
    await this.page.waitForSelector(selector);
    await this.page.click(selector, { clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.page.type(selector, value, { delay: options.delay || 10 });
  }
  
  async select(selector, value) {
    await this.page.waitForSelector(selector);
    await this.page.select(selector, value);
  }
  
  async waitForSelector(selector, options = {}) {
    await this.page.waitForSelector(selector, { 
      timeout: options.timeout || 30000, 
      visible: options.visible !== false 
    });
  }
  
  async waitForFunction(fn, options = {}) {
    await this.page.waitForFunction(fn, { timeout: options.timeout || 30000 });
  }
  
  async waitForNavigation(options = {}) {
    await this.page.waitForNavigation({ 
      waitUntil: options.waitUntil || 'domcontentloaded', 
      timeout: options.timeout || 30000 
    });
  }
  
  async sleep(ms) {
    await new Promise(r => setTimeout(r, ms));
  }
  
  async extract(selector) {
    return await this.page.$eval(selector, el => el.textContent.trim());
  }
  
  async extractAll(selector) {
    return await this.page.$$eval(selector, els => els.map(el => el.textContent.trim()));
  }
  
  async extractHtml(selector) {
    return await this.page.$eval(selector, el => el.innerHTML);
  }
  
  async screenshot(options = {}) {
    return await this.page.screenshot({ 
      type: options.type || 'png', 
      fullPage: options.fullPage || false 
    });
  }
  
  async evaluate(fn, ...args) {
    return await this.page.evaluate(fn, ...args);
  }
  
  async isVisible(selector) {
    try { return await this.page.isVisible(selector); }
    catch { return false; }
  }
  
  async exists(selector) {
    const el = await this.page.$(selector);
    return el !== null;
  }
  
  async press(key) {
    await this.page.keyboard.press(key);
  }
  
  async scrollTo(selector) {
    await this.page.$eval(selector, el => el.scrollIntoView());
  }
  
  async hover(selector) {
    await this.page.hover(selector);
  }
  
  async uploadFile(selector, filePath) {
    await this.page.uploadFile(selector, filePath);
  }
  
  async getCookies() {
    return await this.page.cookies();
  }
  
  async setCookies(cookies) {
    await this.page.setCookie(...cookies);
  }
}

// ==================== GENERIC PROVIDER SYSTEM ====================

class ProviderFactory {
  static providers = new Map();
  
  static register(name, providerClass) {
    this.providers.set(name, providerClass);
  }
  
  static create(name, config) {
    const ProviderClass = this.providers.get(name);
    if (!ProviderClass) {
      // Default generic provider
      return new GenericProvider(config);
    }
    return new ProviderClass(config);
  }
  
  static list() {
    return Array.from(this.providers.keys());
  }
}

class GenericProvider {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('Provider:' + (config.name || 'generic'));
  }
  
  getBaseUrl() { return this.config.baseUrl || ''; }
  
  getLoginWorkflow() { return this.config.loginWorkflow || null; }
  
  getSelectors() { return this.config.selectors || {}; }
  
  async validateSession(adapter) { return { valid: true }; }
  
  async handleSessionExpiry(adapter) { 
    this.logger.warn('Session expired - implement custom re-login in provider');
  }
}

// ==================== TEMPLATE REGISTRY ====================

class TemplateRegistry {
  static templates = new Map();
  
  static register(id, template) {
    this.templates.set(id, template);
  }
  
  static get(id) {
    return this.templates.get(id);
  }
  
  static list() {
    return Array.from(this.templates.keys());
  }
  
  static loadFromFile(filePath) {
    const fs = require('fs');
    const template = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.register(template.id, template);
    return template;
  }
}

// ==================== AGENT ENGINE ====================

class AgentEngine {
  constructor(config = {}) {
    this.adapter = config.adapter || new BrowserAdapter({ 
      headless: config.headless !== undefined ? config.headless : false 
    });
    this.provider = config.provider || new GenericProvider({ name: 'generic' });
    this.context = new ContextManager();
    this.eventBus = new EventBus();
    this.logger = new Logger('AgentEngine');
  }
  
  async initialize() {
    await this.adapter.launch();
    this.logger.info('Engine initialized');
  }
  
  async run(template, input = {}) {
    this.logger.info(`Running: ${template.name}`);
    this.eventBus.emit(Events.START, { templateId: template.id });
    
    try {
      // Setup context
      if (input) this.context.set('input', input);
      if (template.variables) {
        Object.entries(template.variables).forEach(([k, v]) => 
          this.context.set(k, v)
        );
      }
      
      // Execute login if defined in template
      if (template.login) {
        await this.executeLogin(template.login);
      }
      
      // Execute nodes
      for (const node of template.nodes) {
        await this.executeNode(node);
      }
      
      this.eventBus.emit(Events.COMPLETE, { templateId: template.id });
      this.logger.info('✅ Flow completed');
      
      return { success: true, context: this.context.getAll() };
      
    } catch (error) {
      this.logger.error('❌ Flow failed:', error.message);
      this.eventBus.emit(Events.ERROR, { templateId: template.id, error: error.message });
      throw error;
    }
  }
  
  async executeLogin(login) {
    const url = this.context.resolve(login.url);
    await this.adapter.navigate(url);
    
    for (const step of login.steps || []) {
      await this.executeStep(step);
    }
  }
  
  async executeNode(node) {
    this.eventBus.emit(Events.NODE_START, { nodeId: node.id, nodeName: node.name });
    
    const params = this.context.resolveParams(node.parameters || {});
    this.logger.info(`  → ${node.name} (${node.type})`);
    
    switch (node.type) {
      case 'navigate':
        await this.adapter.navigate(params.url, { waitUntil: params.waitUntil });
        break;
        
      case 'click':
        await this.adapter.click(params.selector, { delay: params.delay });
        if (params.waitForSelector) {
          await this.adapter.waitForSelector(params.waitForSelector);
        }
        break;
        
      case 'type':
        await this.adapter.type(params.selector, params.value, { delay: params.delay });
        break;
        
      case 'select':
        await this.adapter.select(params.selector, params.value);
        break;
        
      case 'wait':
        await this.adapter.sleep(params.duration || 1000);
        break;
        
      case 'waitForElement':
        await this.adapter.waitForSelector(params.selector, { 
          timeout: params.timeout, 
          visible: params.visible 
        });
        break;
        
      case 'waitForNavigation':
        await this.adapter.waitForNavigation({ 
          waitUntil: params.waitUntil,
          timeout: params.timeout 
        });
        break;
        
      case 'extract':
        const value = await this.adapter.extract(params.selector);
        this.context.set(params.output || 'extractedData', value);
        break;
        
      case 'extractAll':
        const values = await this.adapter.extractAll(params.selector);
        this.context.set(params.output || 'extractedData', values);
        break;
        
      case 'screenshot':
        const buffer = await this.adapter.screenshot({ 
          type: params.type, 
          fullPage: params.fullPage 
        });
        const filename = params.filename || `screenshot_${Date.now()}.png`;
        require('fs').writeFileSync(filename, buffer);
        this.logger.info(`  📸 Screenshot: ${filename}`);
        break;
        
      case 'log':
        console.log(`  📝 ${params.message}`);
        break;
        
      case 'setVariable':
        this.context.set(params.name, this.context.resolve(params.value));
        break;
        
      case 'hover':
        await this.adapter.hover(params.selector);
        break;
        
      case 'scrollTo':
        await this.adapter.scrollTo(params.selector);
        break;
        
      case 'press':
        await this.adapter.press(params.key);
        break;
        
      case 'forEach':
        await this.executeForEach(node, params);
        break;
        
      case 'if':
        await this.executeIf(node, params);
        break;
        
      default:
        this.logger.warn(`    Unknown type: ${node.type}`);
    }
    
    this.eventBus.emit(Events.NODE_COMPLETE, { nodeId: node.id });
  }
  
  async executeForEach(node, params) {
    const items = this.context.get(params.items) || [];
    if (!Array.isArray(items)) {
      throw new Error(`${params.items} is not an array`);
    }
    
    this.logger.info(`    🔄 ForEach: ${items.length} items`);
    
    for (let i = 0; i < items.length; i++) {
      this.context.createScope();
      this.context.set(params.itemName || 'item', items[i]);
      this.context.set(params.indexName || 'index', i);
      
      if (node.children) {
        for (const child of node.children) {
          await this.executeNode(child);
        }
      }
      
      this.context.popScope();
    }
  }
  
  async executeIf(node, params) {
    const condition = this.context.resolve(params.condition);
    this.logger.info(`    🔀 If: ${condition}`);
    
    if (condition && node.then) {
      for (const child of node.then) {
        await this.executeNode(child);
      }
    } else if (!condition && node.else) {
      for (const child of node.else) {
        await this.executeNode(child);
      }
    }
  }
  
  async executeStep(step) {
    const params = this.context.resolveParams(step.params || {});
    
    switch (step.action) {
      case 'navigate': await this.adapter.navigate(params.url); break;
      case 'click': await this.adapter.click(params.selector); break;
      case 'type': await this.adapter.type(params.selector, params.value); break;
      case 'select': await this.adapter.select(params.selector, params.value); break;
      case 'wait': await this.adapter.sleep(params.duration || 1000); break;
      case 'waitForElement': await this.adapter.waitForSelector(params.selector); break;
    }
  }
  
  async close() {
    await this.adapter.close();
  }
}

// ==================== EXAMPLE TEMPLATES ====================

// Template 1: Generic Web Scraper
const webScraperTemplate = {
  id: 'web-scraper',
  name: 'Web Scraper',
  description: 'Generic web scraping template',
  nodes: [
    { id: '1', type: 'navigate', name: 'Open Website', parameters: { url: '${input.url}' }},
    { id: '2', type: 'waitForElement', name: 'Wait for Content', parameters: { selector: '${input.selector}' }},
    { id: '3', type: 'extract', name: 'Extract Data', parameters: { selector: '${input.selector}', output: 'data' }},
    { id: '4', type: 'log', name: 'Show Data', parameters: { message: 'Extracted: ${data}' }},
  ]
};

// Template 2: Form Automation
const formAutomationTemplate = {
  id: 'form-automation',
  name: 'Form Automation',
  description: 'Fill and submit forms',
  nodes: [
    { id: '1', type: 'navigate', name: 'Go to Form', parameters: { url: '${input.formUrl}' }},
    { id: '2', type: 'waitForElement', name: 'Wait for Form', parameters: { selector: 'form' }},
    { id: '3', type: 'forEach', name: 'Fill Fields', parameters: { items: 'input.fields', itemName: 'field' },
      children: [
        { id: '3a', type: 'type', name: 'Fill Field', parameters: { selector: '${field.selector}', value: '${field.value}' }}
      ]
    },
    { id: '4', type: 'click', name: 'Submit', parameters: { selector: '${input.submitSelector}' }},
    { id: '5', type: 'waitForNavigation', name: 'Wait for Result', parameters: {}},
  ]
};

// Template 3: E-commerce Scraper
const ecommerceTemplate = {
  id: 'ecommerce-scraper',
  name: 'E-commerce Scraper',
  nodes: [
    { id: '1', type: 'navigate', name: 'Go to Store', parameters: { url: '${input.storeUrl}' }},
    { id: '2', type: 'waitForElement', name: 'Wait for Products', parameters: { selector: '.product' }},
    { id: '3', type: 'extractAll', name: 'Get Products', parameters: { selector: '.product', output: 'products' }},
    { id: '4', type: 'screenshot', name: 'Screenshot', parameters: { filename: 'products.png' }},
  ]
};

// Register templates
TemplateRegistry.register('web-scraper', webScraperTemplate);
TemplateRegistry.register('form-automation', formAutomationTemplate);
TemplateRegistry.register('ecommerce', ecommerceTemplate);

// ==================== MAIN ====================

async function main() {
  const args = process.argv.slice(2);
  const templateId = args[0] || 'web-scraper';
  
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   Venus Automation Engine - Generic Runner       ║');
  console.log('║   Buat automation apa saja tanpa batas!           ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');
  
  const template = TemplateRegistry.get(templateId);
  if (!template) {
    console.error(`Template not found: ${templateId}`);
    console.log('\nAvailable templates:');
    TemplateRegistry.list().forEach(id => {
      const t = TemplateRegistry.get(id);
      console.log(`  - ${id}: ${t.name}`);
    });
    process.exit(1);
  }
  
  console.log(`Template: ${template.name}`);
  console.log(`Description: ${template.description || 'No description'}\n`);
  
  // Get input from args or env
  const input = {};
  if (args[1]) input.url = args[1];
  
  // Create engine
  const engine = new AgentEngine({ headless: false });
  
  try {
    await engine.initialize();
    const result = await engine.run(template, input);
    console.log('\n✅ Success! Context:', result.context);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await engine.close();
  }
}

// Run
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { 
  AgentEngine, 
  BrowserAdapter, 
  GenericProvider, 
  ProviderFactory,
  TemplateRegistry,
  ContextManager, 
  EventBus, 
  Logger 
};
