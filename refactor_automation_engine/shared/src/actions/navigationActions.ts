/**
 * Built-in Navigation Actions
 */

import { AbstractAction } from './baseAction';
import { BrowserAdapter, NavigationOptions } from '../adapters/browserAdapter';
import { ExecutionContext, ActionParams, ActionResult } from '../actions/baseAction';

/**
 * Navigate Action - Navigate to a URL
 */
export class NavigateAction extends AbstractAction {
  constructor() {
    super('navigate');
  }

  getSchema() {
    return {
      type: 'navigate',
      version: '1.0.0',
      name: 'Navigate',
      description: 'Navigate to a URL',
      category: 'navigation',
      parameters: [
        {
          name: 'url',
          type: 'string',
          label: 'URL',
          description: 'The URL to navigate to',
          required: true,
          placeholder: 'https://example.com',
        },
        {
          name: 'waitUntil',
          type: 'select',
          label: 'Wait Until',
          description: 'When to consider navigation complete',
          required: false,
          default: 'load',
          options: [
            { label: 'Load', value: 'load' },
            { label: 'DOM Content Loaded', value: 'domcontentloaded' },
            { label: 'Network Idle 0', value: 'networkidle0' },
            { label: 'Network Idle 2', value: 'networkidle2' },
          ],
        },
        {
          name: 'timeout',
          type: 'number',
          label: 'Timeout',
          description: 'Navigation timeout in milliseconds',
          required: false,
          default: 30000,
        },
      ],
      timeout: 60000,
      retryable: true,
    };
  }

  async execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { url, waitUntil, timeout } = params as {
      url: string;
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
      timeout?: number;
    };

    const options: NavigationOptions = {
      waitUntil: waitUntil || 'load',
      timeout: timeout || 30000,
    };

    await adapter.navigate(url, options);

    return {
      success: true,
      data: { url: adapter.getUrl() },
    };
  }
}

/**
 * Click Action - Click on an element
 */
export class ClickAction extends AbstractAction {
  constructor() {
    super('click');
  }

  getSchema() {
    return {
      type: 'click',
      version: '1.0.0',
      name: 'Click',
      description: 'Click on an element',
      category: 'interaction',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          label: 'Selector',
          description: 'CSS selector for the element',
          required: true,
          placeholder: '#button-id',
        },
        {
          name: 'delay',
          type: 'number',
          label: 'Delay (ms)',
          description: 'Delay before clicking',
          required: false,
          default: 0,
        },
        {
          name: 'button',
          type: 'select',
          label: 'Button',
          description: 'Mouse button to use',
          required: false,
          default: 'left',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Right', value: 'right' },
            { label: 'Middle', value: 'middle' },
          ],
        },
        {
          name: 'clickCount',
          type: 'number',
          label: 'Click Count',
          description: 'Number of clicks',
          required: false,
          default: 1,
        },
        {
          name: 'waitForSelector',
          type: 'string',
          label: 'Wait For',
          description: 'Selector to wait for after click',
          required: false,
        },
      ],
      timeout: 30000,
      retryable: true,
    };
  }

  async execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { selector, delay, button, clickCount, waitForSelector } = params as {
      selector: string;
      delay?: number;
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
      waitForSelector?: string;
    };

    const options = { delay, button, clickCount };
    await adapter.click(selector, options);

    // Wait for selector if specified
    if (waitForSelector) {
      await adapter.waitForSelector(waitForSelector, { timeout: 10000 });
    }

    return {
      success: true,
      data: { selector },
    };
  }
}

/**
 * Type Action - Type text into an element
 */
export class TypeAction extends AbstractAction {
  constructor() {
    super('type');
  }

  getSchema() {
    return {
      type: 'type',
      version: '1.0.0',
      name: 'Type',
      description: 'Type text into an input element',
      category: 'interaction',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          label: 'Selector',
          description: 'CSS selector for the input element',
          required: true,
          placeholder: '#input-id',
        },
        {
          name: 'value',
          type: 'string',
          label: 'Value',
          description: 'Text to type',
          required: true,
        },
        {
          name: 'delay',
          type: 'number',
          label: 'Delay (ms)',
          description: 'Delay between keystrokes',
          required: false,
          default: 10,
        },
        {
          name: 'clear',
          type: 'boolean',
          label: 'Clear First',
          description: 'Clear the input before typing',
          required: false,
          default: true,
        },
      ],
      timeout: 30000,
      retryable: true,
    };
  }

  async execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { selector, value, delay, clear } = params as {
      selector: string;
      value: string;
      delay?: number;
      clear?: boolean;
    };

    if (clear) {
      // Clear the field first
      await adapter.click(selector, { clickCount: 3 });
      await adapter.press('Backspace');
    }

    await adapter.type(selector, value, { delay });

    return {
      success: true,
      data: { selector, value },
    };
  }
}

/**
 * Select Action - Select an option from dropdown
 */
export class SelectAction extends AbstractAction {
  constructor() {
    super('select');
  }

  getSchema() {
    return {
      type: 'select',
      version: '1.0.0',
      name: 'Select',
      description: 'Select an option from a dropdown',
      category: 'interaction',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          label: 'Selector',
          description: 'CSS selector for the select element',
          required: true,
          placeholder: '#select-id',
        },
        {
          name: 'value',
          type: 'string',
          label: 'Value',
          description: 'Value to select',
          required: true,
        },
      ],
      timeout: 30000,
      retryable: true,
    };
  }

  async execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { selector, value } = params as {
      selector: string;
      value: string;
    };

    await adapter.select(selector, value);

    return {
      success: true,
      data: { selector, value },
    };
  }
}

/**
 * Wait Action - Wait for a specified duration
 */
export class WaitAction extends AbstractAction {
  constructor() {
    super('wait');
  }

  getSchema() {
    return {
      type: 'wait',
      version: '1.0.0',
      name: 'Wait',
      description: 'Wait for a specified duration',
      category: 'flow-control',
      parameters: [
        {
          name: 'duration',
          type: 'number',
          label: 'Duration (ms)',
          description: 'How long to wait in milliseconds',
          required: true,
          default: 1000,
        },
      ],
      timeout: 120000,
      retryable: false,
    };
  }

  async execute(
    _adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { duration } = params as { duration: number };

    await new Promise((resolve) => setTimeout(resolve, duration));

    return {
      success: true,
      data: { duration },
    };
  }
}

/**
 * WaitForElement Action - Wait for an element to appear
 */
export class WaitForElementAction extends AbstractAction {
  constructor() {
    super('waitForElement');
  }

  getSchema() {
    return {
      type: 'waitForElement',
      version: '1.0.0',
      name: 'Wait For Element',
      description: 'Wait for an element to appear',
      category: 'flow-control',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          label: 'Selector',
          description: 'CSS selector to wait for',
          required: true,
        },
        {
          name: 'timeout',
          type: 'number',
          label: 'Timeout (ms)',
          description: 'Maximum time to wait',
          required: false,
          default: 30000,
        },
        {
          name: 'visible',
          type: 'boolean',
          label: 'Visible',
          description: 'Wait for element to be visible',
          required: false,
          default: true,
        },
      ],
      timeout: 60000,
      retryable: true,
    };
  }

  async execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { selector, timeout, visible } = params as {
      selector: string;
      timeout?: number;
      visible?: boolean;
    };

    await adapter.waitForSelector(selector, { timeout, visible });

    return {
      success: true,
      data: { selector },
    };
  }
}

/**
 * Extract Action - Extract data from page
 */
export class ExtractAction extends AbstractAction {
  constructor() {
    super('extract');
  }

  getSchema() {
    return {
      type: 'extract',
      version: '1.0.0',
      name: 'Extract',
      description: 'Extract data from page elements',
      category: 'data',
      parameters: [
        {
          name: 'selector',
          type: 'string',
          label: 'Selector',
          description: 'CSS selector for elements to extract',
          required: true,
        },
        {
          name: 'attribute',
          type: 'string',
          label: 'Attribute',
          description: 'Attribute to extract (text, html, or attribute name)',
          required: false,
          default: 'text',
        },
        {
          name: 'multiple',
          type: 'boolean',
          label: 'Multiple',
          description: 'Extract from multiple elements',
          required: false,
          default: false,
        },
        {
          name: 'output',
          type: 'string',
          label: 'Output Variable',
          description: 'Variable name to store extracted data',
          required: false,
          default: 'extractedData',
        },
      ],
      timeout: 30000,
      retryable: true,
    };
  }

  async execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { selector, attribute, multiple, output } = params as {
      selector: string;
      attribute?: string;
      multiple?: boolean;
      output?: string;
    };

    let data: string | string[];

    if (multiple) {
      const elements = await adapter.extractAll(selector);
      data = elements;
    } else {
      if (attribute === 'html') {
        data = await adapter.extractHtml(selector);
      } else {
        data = await adapter.extract(selector);
      }
    }

    return {
      success: true,
      data: { [output || 'extractedData']: data },
    };
  }
}

/**
 * Screenshot Action - Take a screenshot
 */
export class ScreenshotAction extends AbstractAction {
  constructor() {
    super('screenshot');
  }

  getSchema() {
    return {
      type: 'screenshot',
      version: '1.0.0',
      name: 'Screenshot',
      description: 'Take a screenshot of the current page',
      category: 'utility',
      parameters: [
        {
          name: 'filename',
          type: 'string',
          label: 'Filename',
          description: 'Filename for the screenshot',
          required: false,
        },
        {
          name: 'fullPage',
          type: 'boolean',
          label: 'Full Page',
          description: 'Capture full page',
          required: false,
          default: false,
        },
        {
          name: 'type',
          type: 'select',
          label: 'Format',
          description: 'Image format',
          required: false,
          default: 'png',
          options: [
            { label: 'PNG', value: 'png' },
            { label: 'JPEG', value: 'jpeg' },
            { label: 'WebP', value: 'webp' },
          ],
        },
      ],
      timeout: 30000,
      retryable: true,
    };
  }

  async execute(
    adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { filename, fullPage, type } = params as {
      filename?: string;
      fullPage?: boolean;
      type?: 'png' | 'jpeg' | 'webp';
    };

    const buffer = await adapter.screenshot({
      type: type || 'png',
      fullPage: fullPage || false,
      encoding: 'binary',
    });

    return {
      success: true,
      data: {
        filename: filename || `screenshot_${Date.now()}.${type || 'png'}`,
        buffer: buffer.toString('base64'),
      },
    };
  }
}

/**
 * Log Action - Log a message
 */
export class LogAction extends AbstractAction {
  constructor() {
    super('log');
  }

  getSchema() {
    return {
      type: 'log',
      version: '1.0.0',
      name: 'Log',
      description: 'Log a message',
      category: 'utility',
      parameters: [
        {
          name: 'message',
          type: 'string',
          label: 'Message',
          description: 'Message to log',
          required: true,
        },
        {
          name: 'level',
          type: 'select',
          label: 'Level',
          description: 'Log level',
          required: false,
          default: 'info',
          options: [
            { label: 'Debug', value: 'debug' },
            { label: 'Info', value: 'info' },
            { label: 'Warn', value: 'warn' },
            { label: 'Error', value: 'error' },
          ],
        },
      ],
      timeout: 1000,
      retryable: false,
    };
  }

  async execute(
    _adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { message, level } = params as {
      message: string;
      level?: 'debug' | 'info' | 'warn' | 'error';
    };

    console.log(`[${level || 'info'}] ${message}`);

    return {
      success: true,
      data: { message, level },
    };
  }
}

/**
 * SetVariable Action - Set a variable in context
 */
export class SetVariableAction extends AbstractAction {
  constructor() {
    super('setVariable');
  }

  getSchema() {
    return {
      type: 'setVariable',
      version: '1.0.0',
      name: 'Set Variable',
      description: 'Set a variable in the execution context',
      category: 'data',
      parameters: [
        {
          name: 'name',
          type: 'string',
          label: 'Variable Name',
          description: 'Name of the variable',
          required: true,
        },
        {
          name: 'value',
          type: 'string',
          label: 'Value',
          description: 'Value to set',
          required: true,
        },
      ],
      timeout: 1000,
      retryable: false,
    };
  }

  async execute(
    _adapter: BrowserAdapter,
    params: ActionParams,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    const { name, value } = params as {
      name: string;
      value: unknown;
    };

    return {
      success: true,
      data: { [name]: value },
    };
  }
}

// Export all navigation actions
export const navigationActions = [
  NavigateAction,
  ClickAction,
  TypeAction,
  SelectAction,
  WaitAction,
  WaitForElementAction,
  ExtractAction,
  ScreenshotAction,
  LogAction,
  SetVariableAction,
];
