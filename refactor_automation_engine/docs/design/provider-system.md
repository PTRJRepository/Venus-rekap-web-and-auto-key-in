# Provider System Design

## Overview

Provider System adalah **key abstraction** yang membuat engine ini modular dan platform-agnostic. Dengan provider pattern, kita dapat mengotomatisasi berbagai jenis web application tanpa mengubah core engine.

## Why Provider Pattern?

### Problem (Old Engine)
```javascript
// Hardcoded Millware logic in engine
class AutomationEngine {
  async handleLogin() {
    await this.page.goto('http://millwarep3.rebinmas.com:8003');  // Hardcoded!
    await this.page.type('#txtUsername', 'adm075');
    // ... Millware-specific logic
  }
}
```

### Solution (Provider Pattern)
```javascript
// Generic engine
class AgentEngine {
  constructor(provider) {
    this.provider = provider;  // Inject any provider
  }

  async handleLogin() {
    const workflow = this.provider.getLoginWorkflow();
    await this.executeWorkflow(workflow);
  }
}

// Millware-specific provider
class MillwareProvider extends BaseProvider {
  getLoginWorkflow() {
    return {
      url: 'http://millwarep3.rebinmas.com:8003',
      steps: [/* Millware login steps */]
    };
  }
}
```

## Provider Interface

### BaseProvider

```javascript
// providers/BaseProvider.js
class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'generic';
    this.baseUrl = config.baseUrl || '';
  }

  // Required methods - must be implemented
  getBaseUrl() {
    throw new Error(`${this.name}.getBaseUrl() not implemented`);
  }

  getLoginWorkflow() {
    throw new Error(`${this.name}.getLoginWorkflow() not implemented`);
  }

  getSelectors() {
    throw new Error(`${this.name}.getSelectors() not implemented`);
  }

  async validateSession(page) {
    throw new Error(`${this.name}.validateSession() not implemented`);
  }

  async handleSessionExpiry(page, context) {
    throw new Error(`${this.name}.handleSessionExpiry() not implemented`);
  }

  // Optional hooks - override as needed
  async beforeExecution(context) {
    return context;
  }

  async afterExecution(result) {
    return result;
  }

  async beforeAction(action, params, context) {
    return params;
  }

  async afterAction(action, result, context) {
    return result;
  }
}

module.exports = BaseProvider;
```

## ProviderFactory

```javascript
// providers/ProviderFactory.js
class ProviderFactory {
  static providers = new Map();

  /**
   * Register a provider class
   * @param {string} name - Provider name
   * @param {class} ProviderClass - Provider class
   */
  static register(name, ProviderClass) {
    if (typeof ProviderClass !== 'function') {
      throw new Error('Provider must be a class');
    }
    this.providers.set(name, ProviderClass);
  }

  /**
   * Create a provider instance
   * @param {string} name - Provider name
   * @param {object} config - Provider configuration
   * @returns {BaseProvider}
   */
  static create(name, config = {}) {
    const ProviderClass = this.providers.get(name);
    if (!ProviderClass) {
      throw new Error(`Provider not found: ${name}. Available: ${this.list().join(', ')}`);
    }
    return new ProviderClass(config);
  }

  /**
   * List all registered providers
   * @returns {string[]}
   */
  static list() {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if provider exists
   * @param {string} name
   * @returns {boolean}
   */
  static has(name) {
    return this.providers.has(name);
  }
}

// Register built-in providers
const MillwareProvider = require('./millware/MillwareProvider');
const GenericWebProvider = require('./generic/GenericWebProvider');

ProviderFactory.register('millware', MillwareProvider);
ProviderFactory.register('generic', GenericWebProvider);

module.exports = ProviderFactory;
```

## Built-in Providers

### MillwareProvider

```javascript
// providers/millware/MillwareProvider.js
const BaseProvider = require('../BaseProvider');

class MillwareProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: 'millware',
      baseUrl: config.baseUrl || 'http://millwarep3.rebinmas.com:8003',
      credentials: config.credentials || {},
      ...config
    });
  }

  getBaseUrl() {
    return this.config.baseUrl;
  }

  getLoginWorkflow() {
    return {
      template: 'millware-login',
      description: 'Login to Millware system',
      steps: [
        {
          action: 'navigate',
          params: { url: this.getBaseUrl() }
        },
        {
          action: 'typeInput',
          params: {
            selector: this.getSelectors().login.username,
            value: '${credentials.username}'
          }
        },
        {
          action: 'typeInput',
          params: {
            selector: this.getSelectors().login.password,
            value: '${credentials.password}'
          }
        },
        {
          action: 'click',
          params: {
            selector: this.getSelectors().login.submitButton
          }
        },
        {
          action: 'waitForElement',
          params: {
            selector: '.PopupBoxLogin',
            timeout: 15000
          }
        },
        {
          action: 'click',
          params: {
            selector: '#MainContent_btnOkay'
          }
        }
      ]
    };
  }

  getSelectors() {
    return {
      login: {
        username: '#txtUsername',
        password: '#txtPassword',
        submitButton: '#btnLogin',
        popupOk: '#MainContent_btnOkay'
      },
      taskRegister: {
        autocomplete: '.ui-autocomplete-input.CBOBox',
        employeeInput: '#MainContent_CboEmployeeID_autocomplete',
        dateInput: '#MainContent_TxtDate',
        chargeJobInput: '#MainContent_CboChargeJob_autocomplete',
        overtimeType: 'input[name="ctl00$MainContent$RbOvtType"]',
        saveButton: '#btnSave',
        table: '#taskTable'
      },
      errorPages: [
        'ACCESS_CONTROLLER_ERR',
        'frmErrorMessage.aspx'
      ]
    };
  }

  async validateSession(page) {
    const url = page.url();
    const errorIndicators = this.getSelectors().errorPages;

    // Check for error pages
    for (const indicator of errorIndicators) {
      if (url.includes(indicator)) {
        return {
          valid: false,
          reason: 'SESSION_EXPIRED',
          indicator,
          needsRelogin: true
        };
      }
    }

    // Check if we can access main content
    try {
      await page.waitForSelector('body', { timeout: 5000 });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: 'PAGE_UNREACHABLE',
        error: error.message
      };
    }
  }

  async handleSessionExpiry(page, context) {
    console.log(`[${this.name}] Session expired, attempting re-login...`);

    const loginWorkflow = this.getLoginWorkflow();

    // Execute login workflow
    for (const step of loginWorkflow.steps) {
      const actionRegistry = require('../../actions/ActionRegistry');
      const action = actionRegistry.get(step.action);
      await action.execute(page, step.params, context);
    }

    return { success: true };
  }

  // Millware-specific hook
  async beforeAction(action, params, context) {
    // Auto-fill autocomplete values for Millware
    if (action === 'select' && params.selector?.includes('autocomplete')) {
      params.autocomplete = true; // Enable autocomplete handling
    }
    return params;
  }
}

module.exports = MillwareProvider;
```

### GenericWebProvider

```javascript
// providers/generic/GenericWebProvider.js
const BaseProvider = require('../BaseProvider');

class GenericWebProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: config.name || 'generic',
      baseUrl: config.baseUrl,
      ...config
    });
  }

  getBaseUrl() {
    return this.config.baseUrl;
  }

  getLoginWorkflow() {
    // Return null if no login required
    if (!this.config.loginWorkflow) {
      return null;
    }

    return this.config.loginWorkflow;
  }

  getSelectors() {
    return this.config.selectors || {};
  }

  async validateSession(page) {
    // Generic validation - check if page is accessible
    try {
      const status = await page.evaluate(() => {
        return {
          readyState: document.readyState,
          hasBody: document.body !== null,
          url: window.location.href
        };
      });

      const valid = status.readyState === 'complete' && status.hasBody;

      return {
        valid,
        status
      };
    } catch (error) {
      return {
        valid: false,
        reason: 'VALIDATION_ERROR',
        error: error.message
      };
    }
  }

  async handleSessionExpiry(page, context) {
    // For generic provider, just navigate back to base URL
    console.log(`[${this.name}] Session expiry detected, navigating to base URL...`);
    await page.goto(this.getBaseUrl());

    // If there's a login workflow, execute it
    const loginWorkflow = this.getLoginWorkflow();
    if (loginWorkflow) {
      for (const step of loginWorkflow.steps) {
        const actionRegistry = require('../../actions/ActionRegistry');
        const action = actionRegistry.get(step.action);
        await action.execute(page, step.params, context);
      }
    }

    return { success: true };
  }
}

module.exports = GenericWebProvider;
```

## Creating Custom Providers

### Example: ShopifyProvider

```javascript
// providers/shopify/ShopifyProvider.js
const BaseProvider = require('../BaseProvider');

class ShopifyProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: 'shopify',
      baseUrl: config.baseUrl || 'https://admin.shopify.com',
      store: config.store,
      apiKey: config.apiKey,
      ...config
    });
  }

  getBaseUrl() {
    return `${this.config.baseUrl}/store/${this.config.store}`;
  }

  getLoginWorkflow() {
    return {
      template: 'shopify-login',
      steps: [
        {
          action: 'navigate',
          params: { url: 'https://accounts.shopify.com/login' }
        },
        {
          action: 'typeInput',
          params: {
            selector: '#account_email',
            value: '${credentials.email}'
          }
        },
        {
          action: 'click',
          params: { selector: '[type="submit"]' }
        }
      ]
    };
  }

  getSelectors() {
    return {
      login: {
        email: '#account_email',
        password: '#account_password',
        submit: '[type="submit"]'
      },
      orders: {
        table: '.index-table__row',
        orderLink: 'a:first-child'
      }
    };
  }

  async validateSession(page) {
    // Check if redirected to login
    const url = page.url();
    if (url.includes('accounts.shopify.com/login')) {
      return { valid: false, reason: 'NOT_LOGGED_IN' };
    }
    return { valid: true };
  }

  async handleSessionExpiry(page, context) {
    await page.goto('https://accounts.shopify.com/login');
    const workflow = this.getLoginWorkflow();
    // Execute login...
    return { success: true };
  }
}

// Register the provider
const ProviderFactory = require('../ProviderFactory');
ProviderFactory.register('shopify', ShopifyProvider);

module.exports = ShopifyProvider;
```

### Example: SAPProvider

```javascript
// providers/sap/SAPProvider.js
const BaseProvider = require('../BaseProvider');

class SAPProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: 'sap',
      baseUrl: config.baseUrl,
      client = config.client || '001',
      ...config
    });
  }

  getBaseUrl() {
    return `${this.config.baseUrl}/sap/bc/gui/sap/its/webgui`;
  }

  getLoginWorkflow() {
    return {
      steps: [
        {
          action: 'navigate',
          params: { url: this.getBaseUrl() }
        },
        {
          action: 'typeInput',
          params: {
            selector: '#sap-user',
            value: '${credentials.username}'
          }
        },
        {
          action: 'typeInput',
          params: {
            selector: '#sap-password',
            value: '${credentials.password}'
          }
        },
        {
          action: 'typeInput',
          params: {
            selector: '#sap-client',
            value: this.config.client
          }
        },
        {
          action: 'click',
          params: { selector: '#sap-login-button' }
        }
      ]
    };
  }

  // ... implement other methods
}

// Register
const ProviderFactory = require('../ProviderFactory');
ProviderFactory.register('sap', SAPProvider);

module.exports = SAPProvider;
```

## Using Providers

### In Templates

```json
{
  "id": "my-automation",
  "provider": "millware",
  "providerConfig": {
    "baseUrl": "http://millwarep3.rebinmas.com:8003"
  },
  "variables": {
    "BASE_URL": "${provider.baseUrl}"
  },
  "nodes": [
    {
      "type": "providerWorkflow",
      "data": { "workflow": "login" }
    }
  ]
}
```

### In Code

```javascript
const AgentEngine = require('./core/AgentEngine');
const ProviderFactory = require('./core/ProviderFactory');

// Create with Millware provider
const millwareEngine = new AgentEngine({
  provider: ProviderFactory.create('millware', {
    baseUrl: 'http://millwarep3.rebinmas.com:8003',
    credentials: { username: 'user', password: 'pass' }
  })
});

// Create with Generic provider
const genericEngine = new AgentEngine({
  provider: ProviderFactory.create('generic', {
    name: 'my-automation',
    baseUrl: 'https://example.com',
    loginWorkflow: { /* custom login */ },
    selectors: { /* custom selectors */ }
  })
});

// Create with custom provider
const shopifyEngine = new AgentEngine({
  provider: ProviderFactory.create('shopify', {
    store: 'mystore',
    apiKey: 'xxx'
  })
});
```

## Provider Selection Guide

| Use Case | Recommended Provider |
|----------|---------------------|
| Millware HR System | `millware` |
| Generic web scraping | `generic` |
| E-commerce (Shopify) | Create `shopify` provider |
| ERP Systems | Create `sap`/`oracle` provider |
| Custom internal apps | Create custom provider extending `generic` |

## Best Practices

1. **Keep providers focused**: Each provider should handle ONE platform
2. **Use selectors.json**: Store selectors separately for easy maintenance
3. **Implement session validation**: Always check for session expiry
4. **Handle platform quirks in provider**: Don't pollute core engine
5. **Document provider-specific workflows**: Use comments and docs
