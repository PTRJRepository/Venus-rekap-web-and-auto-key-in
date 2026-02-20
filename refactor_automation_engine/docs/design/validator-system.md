# Validator System Design

## Overview

Validator System provides a flexible way to validate page states, data, and conditions during automation execution. Supports chain validation with AND/OR logic.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  ValidatorRegistry                      │
│  - register(validator)                                  │
│  - get(validatorType)                                   │
│  - createChain(validators, mode)                        │
└────────────┬────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼────┐      ┌────▼───┐
│ Built-in│      │ Custom │
│Validators     │Validators│
└────────┘      └────────┘
```

## BaseValidator

```javascript
// validators/BaseValidator.js
class BaseValidator {
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'base';
  }

  /**
   * Main validation method - must be implemented
   */
  async validate(page, params, context) {
    throw new Error('validate() must be implemented');
  }

  /**
   * Build error result
   */
  invalid(reason, details = {}) {
    return {
      valid: false,
      reason,
      validator: this.name,
      ...details
    };
  }

  /**
   * Build success result
   */
  valid(data = {}) {
    return {
      valid: true,
      validator: this.name,
      ...data
    };
  }
}

module.exports = BaseValidator;
```

## Built-in Validators

### ElementValidator

```javascript
// validators/builtin/ElementValidator.js
class ElementValidator extends BaseValidator {
  constructor(config = {}) {
    super({ name: 'element', ...config });
  }

  async validate(page, params, context) {
    const { selector, check = 'exists', value, timeout = 5000 } = params;

    try {
      await page.waitForSelector(selector, { timeout });
    } catch (error) {
      return this.invalid('element_not_found', { selector });
    }

    const result = await page.evaluate(({ sel, chk, val }) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };

      switch (chk) {
        case 'exists':
          return { found: true };
        case 'visible':
          return { found: true, visible: el.offsetParent !== null };
        case 'enabled':
          return { found: true, enabled: !el.disabled };
        case 'contains':
          return { found: true, contains: el.textContent.includes(val) };
        case 'hasValue':
          return { found: true, hasValue: el.value === val };
        default:
          return { found: true };
      }
    }, { sel: selector, chk: check, val: value });

    if (!result.found) {
      return this.invalid('element_not_found', { selector });
    }

    if (check === 'visible' && !result.visible) {
      return this.invalid('element_not_visible', { selector });
    }

    if (check === 'enabled' && !result.enabled) {
      return this.invalid('element_not_enabled', { selector });
    }

    if (check === 'contains' && !result.contains) {
      return this.invalid('element_does_not_contain', { selector, value });
    }

    if (check === 'hasValue' && !result.hasValue) {
      return this.invalid('element_value_mismatch', {
        selector,
        expected: value,
        actual: page.$eval(selector, el => el.value)
      });
    }

    return this.valid({ selector, check, result });
  }
}

module.exports = ElementValidator;
```

### ValueValidator

```javascript
// validators/builtin/ValueValidator.js
class ValueValidator extends BaseValidator {
  constructor(config = {}) {
    super({ name: 'value', ...config });
  }

  async validate(page, params, context) {
    const { selector, expected, operator = '==', type = 'text' } = params;

    let actual;
    try {
      switch (type) {
        case 'text':
          actual = await page.$eval(selector, el => el.textContent);
          break;
        case 'value':
          actual = await page.$eval(selector, el => el.value);
          break;
        case 'attribute':
          actual = await page.$eval(selector, (el, attr) => el.getAttribute(attr), params.attribute);
          break;
        default:
          actual = await page.$eval(selector, el => el.textContent);
      }
    } catch (error) {
      return this.invalid('element_not_found', { selector });
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
      case '>':
        isValid = actual > expected;
        break;
      case '<':
        isValid = actual < expected;
        break;
      case '>=':
        isValid = actual >= expected;
        break;
      case '<=':
        isValid = actual <= expected;
        break;
      case 'contains':
        isValid = String(actual).includes(expected);
        break;
      case 'matches':
        isValid = new RegExp(expected).test(actual);
        break;
      default:
        return this.invalid('invalid_operator', { operator });
    }

    if (!isValid) {
      return this.invalid('value_mismatch', {
        selector,
        expected,
        actual,
        operator
      });
    }

    return this.valid({ selector, expected, actual });
  }
}

module.exports = ValueValidator;
```

### ConditionValidator

```javascript
// validators/builtin/ConditionValidator.js
class ConditionValidator extends BaseValidator {
  constructor(config = {}) {
    super({ name: 'condition', ...config });
  }

  async validate(page, params, context) {
    const { condition } = params;

    try {
      // Safe condition evaluation
      const result = this.evaluateCondition(condition, context);

      if (!result) {
        return this.invalid('condition_false', { condition });
      }

      return this.valid({ condition, result });
    } catch (error) {
      return this.invalid('condition_error', {
        condition,
        error: error.message
      });
    }
  }

  evaluateCondition(condition, context) {
    // Create a function with context variables
    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);

    // Safe eval - in production, use a proper expression parser
    const func = new Function(...contextKeys, `return (${condition});`);
    return func(...contextValues);
  }
}

module.exports = ConditionValidator;
```

### NetworkValidator

```javascript
// validators/builtin/NetworkValidator.js
class NetworkValidator extends BaseValidator {
  constructor(config = {}) {
    super({ name: 'network', ...config });
  }

  async validate(page, params, context) {
    const { check, url, status, timeout = 30000 } = params;

    switch (check) {
      case 'statusEquals':
        return await this.checkStatus(page, { url, expectedStatus: status, timeout });

      case 'responseContains':
        return await this.checkResponseContains(page, { url, text: status, timeout });

      case 'no404':
        return await this.checkNo404(page, { timeout });

      default:
        return this.invalid('unknown_check', { check });
    }
  }

  async checkStatus(page, { url, expectedStatus, timeout }) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });

    if (response.status() !== expectedStatus) {
      return this.invalid('status_mismatch', {
        url,
        expected: expectedStatus,
        actual: response.status()
      });
    }

    return this.valid({ url, status: response.status() });
  }

  async checkResponseContains(page, { url, text, timeout }) {
    const response = await page.goto(url);
    const body = await response.text();

    if (!body.includes(text)) {
      return this.invalid('response_missing_text', { url, text });
    }

    return this.valid({ url, found: true });
  }

  async checkNo404(page, { timeout }) {
    // Check all requests for 404 errors
    const requests = [];
    page.on('response', response => {
      if (response.status() === 404) {
        requests.push({ url: response.url(), status: 404 });
      }
    });

    await new Promise(resolve => setTimeout(resolve, timeout));

    if (requests.length > 0) {
      return this.invalid('found_404_errors', { requests });
    }

    return this.valid({ no404: true });
  }
}

module.exports = NetworkValidator;
```

## ChainValidator

```javascript
// validators/builtin/ChainValidator.js
class ChainValidator extends BaseValidator {
  constructor(config = {}) {
    super({ name: 'chain', ...config });
  }

  async validate(page, params, context) {
    const { chain, mode = 'sequential', stopOnFirstInvalid = true } = params;

    const results = [];

    if (mode === 'sequential') {
      for (const step of chain) {
        const result = await this.executeValidator(step, page, context);
        results.push(result);

        if (!result.valid && stopOnFirstInvalid) {
          return {
            valid: false,
            failedAt: step.validator,
            results,
            fallback: step.onInvalid
          };
        }
      }
    } else if (mode === 'parallel') {
      const promises = chain.map(step =>
        this.executeValidator(step, page, context)
      );
      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);
    }

    const allValid = results.every(r => r.valid);

    return {
      valid: allValid,
      results
    };
  }

  async executeValidator(step, page, context) {
    const ValidatorRegistry = require('../ValidatorRegistry');
    const validator = ValidatorRegistry.get(step.validator);

    if (!validator) {
      return {
        valid: false,
        error: `Validator not found: ${step.validator}`
      };
    }

    return await validator.validate(page, step.params, context);
  }
}

module.exports = ChainValidator;
```

## Custom Validator Example

### MillwareSyncValidator

```javascript
// validators/custom/millware/MillwareSyncValidator.js
const BaseValidator = require('../../BaseValidator');

class MillwareSyncValidator extends BaseValidator {
  constructor(config = {}) {
    super({ name: 'millware-sync', ...config });
  }

  async validate(page, params, context) {
    const { employeeId, date, hours } = params;

    try {
      // Navigate to task register detail
      await page.goto('http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterDet.aspx');
      await page.waitForSelector('.ui-autocomplete-input.CBOBox', { timeout: 10000 });

      // Search for employee
      await page.type('#MainContent_CboEmployeeID_autocomplete', employeeId);
      await this.waitForAutocomplete(page);
      await page.keyboard.press('Enter');

      // Check if record exists
      const recordFound = await page.evaluate((empId, dt) => {
        const rows = document.querySelectorAll('#taskTable tbody tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells[0]?.textContent?.includes(empId) && cells[1]?.textContent === dt) {
            return {
              found: true,
              hours: parseFloat(cells[3]?.textContent || '0'),
              rowHtml: row.innerHTML
            };
          }
        }
        return { found: false };
      }, employeeId, date);

      if (!recordFound.found) {
        return this.invalid('record_not_found', {
          employeeId,
          date,
          suggestion: 'Data may not have been transferred to Millware yet'
        });
      }

      if (Math.abs(recordFound.hours - hours) > 0.01) {
        return this.invalid('hours_mismatch', {
          employeeId,
          date,
          expected: hours,
          actual: recordFound.hours
        });
      }

      return this.valid({
        employeeId,
        date,
        hours: recordFound.hours,
        synced: true
      });
    } catch (error) {
      return this.invalid('validation_error', {
        error: error.message
      });
    }
  }

  async waitForAutocomplete(page) {
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.ui-autocomplete li');
      return items.length > 0;
    }, { timeout: 5000 });
  }
}

module.exports = MillwareSyncValidator;
```

## ValidatorRegistry

```javascript
// validators/ValidatorRegistry.js
class ValidatorRegistry {
  constructor() {
    this.validators = new Map();
  }

  register(validator) {
    let name, ValidatorClass;

    // Handle class-based validators
    if (typeof validator === 'function' && validator.prototype instanceof BaseValidator) {
      ValidatorClass = validator;
      const instance = new ValidatorClass();
      name = instance.name;
      this.validators.set(name, ValidatorClass);
    }
    // Handle registration with name
    else if (arguments.length === 2) {
      name = arguments[0];
      validator = arguments[1];
      this.validators.set(name, validator);
    }
    else {
      throw new Error('Invalid validator registration');
    }

    return this;
  }

  registerAlias(alias, validatorName) {
    this.aliases = this.aliases || new Map();
    this.aliases.set(alias, validatorName);
    return this;
  }

  get(validatorType) {
    const resolvedType = this.aliases?.get(validatorType) || validatorType;
    const validator = this.validators.get(resolvedType);

    if (!validator) {
      throw new Error(`Validator not found: ${validatorType}`);
    }

    // Return a new instance for class-based validators
    if (typeof validator === 'function') {
      return new validator();
    }

    return validator;
  }

  has(validatorType) {
    return this.validators.has(validatorType);
  }

  list() {
    return Array.from(this.validators.keys());
  }

  createChain(validators, mode = 'sequential') {
    const ChainValidator = this.get('chain');
    return new ChainValidator({ mode });
  }
}

// Register built-in validators
const ElementValidator = require('./builtin/ElementValidator');
const ValueValidator = require('./builtin/ValueValidator');
const ConditionValidator = require('./builtin/ConditionValidator');
const NetworkValidator = require('./builtin/NetworkValidator');
const ChainValidator = require('./builtin/ChainValidator');

const registry = new ValidatorRegistry();
registry.register(ElementValidator);
registry.register(ValueValidator);
registry.register(ConditionValidator);
registry.register(NetworkValidator);
registry.register(ChainValidator);

// Register aliases
registry.registerAlias('element-exists', 'element');
registry.registerAlias('value-match', 'value');

module.exports = registry;
```

## Using Validators in Templates

```json
{
  "id": "node-validate",
  "type": "validation",
  "actionType": "validate",
  "data": {
    "validator": "millware-sync",
    "params": {
      "employeeId": "${employee.PTRJEmployeeID}",
      "date": "${record.date}",
      "hours": "${record.hours}"
    },
    "onInvalid": {
      "action": "retry",
      "maxRetries": 2,
      "fallbackTo": "node-manual-intervention"
    }
  }
}
```

## Validator Reference

| Validator | Parameters | Description |
|-----------|------------|-------------|
| `element` | selector, check, value | Validate element state |
| `value` | selector, expected, operator | Validate element value |
| `condition` | condition | Evaluate condition |
| `network` | check, url, status | Validate network response |
| `chain` | chain, mode | Chain multiple validators |
| `millware-sync` | employeeId, date, hours | Validate Millware sync (custom) |
