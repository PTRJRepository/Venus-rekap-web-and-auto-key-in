# Action System Design

## Overview

Action System menggunakan **Hybrid Plugin Pattern** yang memungkinkan actions didefinisikan sebagai class atau function. Ini memberikan fleksibilitas maksimal untuk berbagai use case.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ActionRegistry                       │
│  - register(action)                                     │
│  - get(actionType)                                      │
│  - execute(actionType, page, params, context)           │
└────────────┬────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼────┐      ┌────▼───┐
│ Class  │      │Function│
│ Action │      │ Action │
└────────┘      └────────┘
```

## BaseAction (Class-based)

```javascript
// actions/BaseAction.js
class BaseAction {
  static schema = {
    type: '',           // Action type identifier
    version: '1.0.0',   // Action version
    params: {},         // Parameter schema
    middleware: []      // Middleware to apply
  };

  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Validate parameters before execution
   */
  validateParams(params) {
    const schema = this.constructor.schema.params || {};
    const errors = [];

    for (const [key, config] of Object.entries(schema)) {
      if (config.required && params[key] === undefined) {
        errors.push(`Required parameter missing: ${key}`);
      }
      if (config.type && typeof params[key] !== config.type) {
        errors.push(`Parameter ${key} must be ${config.type}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }

    return params;
  }

  /**
   * Main execution method - must be implemented
   */
  async execute(page, params, context) {
    throw new Error('execute() must be implemented');
  }

  /**
   * Error handling
   */
  handleError(error, { page, params, context }) {
    return {
      success: false,
      error: error.message,
      action: this.constructor.schema.type
    };
  }

  /**
   * Pre-execution hook
   */
  async beforeExecute(page, params, context) {
    return params;
  }

  /**
   * Post-execution hook
   */
  async afterExecute(result, page, params, context) {
    return result;
  }
}

module.exports = BaseAction;
```

## Action Examples

### NavigateAction (Class-based)

```javascript
// actions/builtin/navigation/NavigateAction.js
const BaseAction = require('../../BaseAction');

class NavigateAction extends BaseAction {
  static schema = {
    type: 'navigate',
    version: '1.0.0',
    params: {
      url: { type: 'string', required: true },
      waitFor: {
        type: 'string',
        required: false,
        default: 'load',
        enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2']
      },
      timeout: { type: 'number', required: false, default: 30000 },
      referer: { type: 'string', required: false }
    }
  };

  async execute(page, params, context) {
    const validated = this.validateParams(params);

    await this.beforeExecute(page, validated, context);

    try {
      const navigationOptions = {
        waitUntil: validated.waitFor,
        timeout: validated.timeout
      };

      if (validated.referer) {
        navigationOptions.referer = validated.referer;
      }

      await page.goto(validated.url, navigationOptions);

      const result = {
        success: true,
        url: validated.url,
        finalUrl: page.url()
      };

      return await this.afterExecute(result, page, validated, context);
    } catch (error) {
      return this.handleError(error, { page, params: validated, context });
    }
  }
}

module.exports = NavigateAction;
```

### ClickAction (Class-based)

```javascript
// actions/builtin/interaction/ClickAction.js
const BaseAction = require('../../BaseAction');

class ClickAction extends BaseAction {
  static schema = {
    type: 'click',
    version: '1.0.0',
    params: {
      selector: { type: 'string', required: true },
      waitFor: { type: 'object', required: false },
      timeout: { type: 'number', required: false, default: 30000 },
      clickCount: { type: 'number', required: false, default: 1 },
      button: { type: 'string', required: false, default: 'left' }
    }
  };

  async execute(page, params, context) {
    const validated = this.validateParams(params);

    await this.beforeExecute(page, validated, context);

    try {
      // Wait for element if specified
      if (validated.waitFor?.selector) {
        await page.waitForSelector(validated.waitFor.selector, {
          timeout: validated.waitFor.timeout || validated.timeout
        });
      }

      // Wait for selector
      await page.waitForSelector(validated.selector, { timeout: validated.timeout });

      // Click
      await page.click(validated.selector, {
        clickCount: validated.clickCount,
        button: validated.button
      });

      // Wait for navigation if specified
      if (validated.waitFor?.event === 'navigation') {
        await page.waitForNavigation({ timeout: validated.waitFor.timeout || 10000 });
      }

      const result = {
        success: true,
        selector: validated.selector
      };

      return await this.afterExecute(result, page, validated, context);
    } catch (error) {
      return this.handleError(error, { page, params: validated, context });
    }
  }
}

module.exports = ClickAction;
```

### ForEachAction (Class-based with child nodes)

```javascript
// actions/builtin/flow-control/ForEachAction.js
const BaseAction = require('../../BaseAction');

class ForEachAction extends BaseAction {
  static schema = {
    type: 'forEach',
    version: '1.0.0',
    params: {
      items: { type: 'string', required: true },  // Path to items in context
      itemName: { type: 'string', required: true, default: 'item' },
      parallel: { type: 'boolean', required: false, default: false },
      maxConcurrency: { type: 'number', required: false, default: 5 },
      filter: { type: 'string', required: false },  // Filter expression
      children: { type: 'array', required: true }   // Child nodes
    }
  };

  async execute(page, params, context) {
    const validated = this.validateParams(params);

    await this.beforeExecute(page, validated, context);

    try {
      // Get items from context
      const items = this.getValueFromContext(validated.items, context);

      if (!Array.isArray(items)) {
        throw new Error(`${validated.items} is not an array`);
      }

      // Apply filter if specified
      let filteredItems = items;
      if (validated.filter) {
        filteredItems = items.filter(item =>
          this.evaluateExpression(validated.filter, { item, context })
        );
      }

      console.log(`[ForEach] Processing ${filteredItems.length} items`);

      const results = [];

      if (validated.parallel) {
        // Parallel execution
        const chunks = this.chunkArray(filteredItems, validated.maxConcurrency);

        for (const chunk of chunks) {
          const chunkResults = await Promise.all(
            chunk.map(item => this.processItem(item, validated, page, context))
          );
          results.push(...chunkResults);
        }
      } else {
        // Sequential execution
        for (const item of filteredItems) {
          const result = await this.processItem(item, validated, page, context);
          results.push(result);
        }
      }

      return {
        success: true,
        processed: results.length,
        results
      };
    } catch (error) {
      return this.handleError(error, { page, params: validated, context });
    }
  }

  async processItem(item, params, page, context) {
    const itemContext = {
      ...context,
      [params.itemName]: item
    };

    const results = [];
    for (const child of params.children) {
      const ActionClass = this.engine.actionRegistry.get(child.action);
      const action = new ActionClass(this.engine);
      const result = await action.execute(page, child.params, itemContext);
      results.push(result);

      if (!result.success && child.stopOnError) {
        break;
      }
    }

    return { item, results };
  }

  getValueFromContext(path, context) {
    const keys = path.split('.');
    let value = context;
    for (const key of keys) {
      value = value?.[key];
    }
    return value;
  }

  evaluateExpression(expression, context) {
    // Safe expression evaluation
    // In production, use a proper expression parser
    return eval(expression); // Simplified - use proper parser in production
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = ForEachAction;
```

## Function-based Actions

### Example: LogAction

```javascript
// actions/builtin/utility/logAction.js
const logAction = {
  type: 'log',
  version: '1.0.0',

  schema: {
    message: { type: 'string', required: true },
    level: { type: 'string', default: 'info' }
  },

  validate(params) {
    if (!params.message) {
      throw new Error('message is required');
    }
    return params;
  },

  async execute(page, params, context) {
    const validated = this.validate(params);

    const message = this.substituteVariables(validated.message, context);

    console.log(`[${validated.level.toUpperCase()}] ${message}`);

    return { success: true, message };
  },

  substituteVariables(text, context) {
    return text.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const keys = path.split('.');
      let value = context;
      for (const key of keys) {
        value = value?.[key];
      }
      return value !== undefined ? value : match;
    });
  }
};

module.exports = logAction;
```

## ActionRegistry

```javascript
// actions/ActionRegistry.js
class ActionRegistry {
  constructor() {
    this.actions = new Map();
    this.aliases = new Map();
  }

  /**
   * Register an action (class or function)
   */
  register(action) {
    let type, ActionClass;

    // Handle class-based actions
    if (typeof action === 'function' && action.prototype instanceof BaseAction) {
      ActionClass = action;
      type = action.schema?.type;
      if (!type) {
        throw new Error('Action class must have schema.type defined');
      }
      this.actions.set(type, ActionClass);
    }
    // Handle function-based actions
    else if (typeof action === 'object' && action.type) {
      type = action.type;
      this.actions.set(type, action);
    }
    // Handle registration with type
    else if (arguments.length === 2) {
      type = arguments[0];
      action = arguments[1];
      this.actions.set(type, action);
    }
    else {
      throw new Error('Invalid action registration');
    }

    return this;
  }

  /**
   * Register an alias for an action
   */
  registerAlias(alias, actionType) {
    this.aliases.set(alias, actionType);
    return this;
  }

  /**
   * Get an action by type
   */
  get(actionType) {
    // Check aliases
    const resolvedType = this.aliases.get(actionType) || actionType;
    const action = this.actions.get(resolvedType);

    if (!action) {
      throw new Error(`Action not found: ${actionType}`);
    }

    return action;
  }

  /**
   * Check if action exists
   */
  has(actionType) {
    const resolvedType = this.aliases.get(actionType) || actionType;
    return this.actions.has(resolvedType);
  }

  /**
   * List all registered actions
   */
  list() {
    return Array.from(this.actions.keys());
  }

  /**
   * Execute an action
   */
  async execute(actionType, page, params, context, engine) {
    const action = this.get(actionType);

    // Class-based action
    if (typeof action === 'function') {
      const actionInstance = new action(engine);
      return await actionInstance.execute(page, params, context);
    }
    // Function-based action
    else if (typeof action.execute === 'function') {
      return await action.execute(page, params, context);
    }

    throw new Error(`Invalid action: ${actionType}`);
  }
}

module.exports = ActionRegistry;
```

## Middleware System

```javascript
// actions/MiddlewareManager.js
class MiddlewareManager {
  constructor() {
    this.before = [];
    this.after = [];
  }

  /**
   * Register pre-execution middleware
   */
  registerBefore(middleware) {
    this.before.push(middleware);
    return this;
  }

  /**
   * Register post-execution middleware
   */
  registerAfter(middleware) {
    this.after.push(middleware);
    return this;
  }

  /**
   * Execute pre-middleware chain
   */
  async executeBefore(context, next) {
    let index = 0;

    const dispatch = async (i) => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i === this.before.length) {
        return await next();
      }

      const middleware = this.before[i];
      return await middleware(context, () => dispatch(i + 1));
    };

    return await dispatch(0);
  }

  /**
   * Execute post-middleware chain
   */
  async executeAfter(context, next) {
    let index = 0;

    const dispatch = async (i) => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i === this.after.length) {
        return await next();
      }

      const middleware = this.after[i];
      return await middleware(context, () => dispatch(i + 1));
    };

    return await dispatch(0);
  }
}

// Built-in middleware examples
const validateSelector = async (context, next) => {
  if (context.params.selector) {
    // Validate CSS selector syntax
    const selectorRegex = /^[#.\[\]:a-zA-Z0-9_\-\s,+*>~|="()]+$/;
    if (!selectorRegex.test(context.params.selector)) {
      throw new Error(`Invalid selector: ${context.params.selector}`);
    }
  }
  return await next();
};

const captureScreenshot = async (context, next) => {
  const result = await next();
  if (context.page && !result.success) {
    const timestamp = Date.now();
    const path = `logs/screenshots/error_${timestamp}.png`;
    await context.page.screenshot({ path });
    result.screenshot = path;
  }
  return result;
};

module.exports = MiddlewareManager;
```

## Built-in Actions Reference

| Action Type | Description | Params |
|-------------|-------------|--------|
| `navigate` | Navigate to URL | url, waitFor, timeout |
| `click` | Click element | selector, waitFor, timeout |
| `typeInput` | Type text into input | selector, value, clear |
| `select` | Select dropdown option | selector, value |
| `hover` | Hover over element | selector |
| `waitForElement` | Wait for element to appear | selector, timeout |
| `waitForCondition` | Wait for custom condition | condition, timeout |
| `wait` | Wait for duration | duration |
| `forEach` | Loop over array | items, itemName, children |
| `if` | Conditional execution | condition, thenSteps, elseSteps |
| `switch` | Multiple cases | value, cases, default |
| `parallel` | Parallel execution | children, maxConcurrency |
| `try` | Error handling | attempt, onError |
| `extract` | Extract data from page | selector, columns |
| `transform` | Transform data | script |
| `httpRequest` | Make HTTP request | url, method, body |
| `validate` | Validate condition | validator, params |
| `log` | Log message | message, level |
| `include` | Include sub-template | template |

## Creating Custom Actions

```javascript
// actions/custom/MyCustomAction.js
const BaseAction = require('../BaseAction');

class MyCustomAction extends BaseAction {
  static schema = {
    type: 'myCustom',
    version: '1.0.0',
    params: {
      myParam: { type: 'string', required: true }
    }
  };

  async execute(page, params, context) {
    const validated = this.validateParams(params);

    // Your custom logic here

    return {
      success: true,
      data: {}
    };
  }
}

// Register
const ActionRegistry = require('../ActionRegistry');
ActionRegistry.register(new MyCustomAction());

module.exports = MyCustomAction;
```
