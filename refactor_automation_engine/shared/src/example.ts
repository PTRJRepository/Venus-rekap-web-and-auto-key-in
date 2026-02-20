/**
 * Example: How to use the Venus Automation Engine
 * 
 * This example demonstrates:
 * 1. Creating a flow
 * 2. Using the AgentEngine
 * 3. Registering custom actions
 * 4. Running automation
 */

import {
  // Core
  AgentEngine,
  Flow,
  FlowNode,
  Connection,
  
  // Adapters
  PuppeteerAdapter,
  
  // Providers
  MillwareProvider,
  ProviderFactory,
  
  // Actions
  ActionRegistry,
  navigationActions,
  
  // Utils
  Logger,
  EventBus,
} from './index';

// Example 1: Creating a simple flow
function createSimpleFlow(): Flow {
  const flow: Flow = {
    id: 'simple-automation-flow',
    name: 'Simple Automation Flow',
    description: 'Example flow demonstrating basic automation',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: 'node-1',
        type: 'trigger',
        name: 'Start',
        position: { x: 100, y: 100 },
        parameters: {},
        outputs: [
          { id: 'output-1', label: 'Next', type: 'success' }
        ],
      },
      {
        id: 'node-2',
        type: 'navigate',
        name: 'Navigate to Website',
        position: { x: 100, y: 200 },
        parameters: {
          url: 'https://example.com',
          waitUntil: 'load',
        },
        inputs: [
          { id: 'input-1', sourceNodeId: 'node-1', sourceOutputId: 'output-1' }
        ],
        outputs: [
          { id: 'output-2', label: 'Next', type: 'success' }
        ],
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        timeout: 30000,
      },
      {
        id: 'node-3',
        type: 'extract',
        name: 'Extract Title',
        position: { x: 100, y: 300 },
        parameters: {
          selector: 'h1',
          attribute: 'text',
          output: 'pageTitle',
        },
        inputs: [
          { id: 'input-2', sourceNodeId: 'node-2', sourceOutputId: 'output-2' }
        ],
        outputs: [
          { id: 'output-3', label: 'Next', type: 'success' }
        ],
      },
      {
        id: 'node-4',
        type: 'log',
        name: 'Log Result',
        position: { x: 100, y: 400 },
        parameters: {
          message: 'Page title: ${outputs.node-3.pageTitle}',
          level: 'info',
        },
        inputs: [
          { id: 'input-3', sourceNodeId: 'node-3', sourceOutputId: 'output-3' }
        ],
      },
    ],
    connections: [
      {
        id: 'conn-1',
        sourceNodeId: 'node-1',
        sourceOutputId: 'output-1',
        targetNodeId: 'node-2',
        targetInputId: 'input-1',
      },
      {
        id: 'conn-2',
        sourceNodeId: 'node-2',
        sourceOutputId: 'output-2',
        targetNodeId: 'node-3',
        targetInputId: 'input-2',
      },
      {
        id: 'conn-3',
        sourceNodeId: 'node-3',
        sourceOutputId: 'output-3',
        targetNodeId: 'node-4',
        targetInputId: 'input-3',
      },
    ],
    variables: {
      MAX_RETRIES: 3,
      TIMEOUT: 30000,
    },
  };

  return flow;
}

// Example 2: Millware attendance input flow
function createMillwareAttendanceFlow(): Flow {
  return {
    id: 'millware-attendance-flow',
    name: 'Millware Attendance Input',
    description: 'Automated attendance data input to Millware HR system',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      // Login flow would go here
      // ... login nodes ...
      
      {
        id: 'navigate-task-register',
        type: 'navigate',
        name: 'Navigate to Task Register',
        position: { x: 100, y: 100 },
        parameters: {
          url: 'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterDet.aspx',
          waitUntil: 'domcontentloaded',
        },
      },
      {
        id: 'wait-autocomplete',
        type: 'waitForElement',
        name: 'Wait for Autocomplete',
        position: { x: 100, y: 200 },
        parameters: {
          selector: '.ui-autocomplete-input.CBOBox',
          timeout: 15000,
        },
      },
      {
        id: 'input-employee',
        type: 'type',
        name: 'Input Employee',
        position: { x: 100, y: 300 },
        parameters: {
          selector: '#MainContent_CboEmployeeID_autocomplete',
          value: '${input.employeeId}',
        },
      },
      {
        id: 'input-date',
        type: 'type',
        name: 'Input Date',
        position: { x: 100, y: 400 },
        parameters: {
          selector: '#MainContent_TxtDate',
          value: '${input.date}',
        },
      },
      {
        id: 'input-hours',
        type: 'type',
        name: 'Input Hours',
        position: { x: 100, y: 500 },
        parameters: {
          selector: '#MainContent_TxtHours',
          value: '${input.hours}',
        },
      },
      {
        id: 'click-save',
        type: 'click',
        name: 'Save Record',
        position: { x: 100, y: 600 },
        parameters: {
          selector: '#btnSave',
          waitForSelector: '.success-message',
        },
      },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'navigate-task-register', sourceOutputId: 'success', targetNodeId: 'wait-autocomplete', targetInputId: 'input' },
      { id: 'c2', sourceNodeId: 'wait-autocomplete', sourceOutputId: 'success', targetNodeId: 'input-employee', targetInputId: 'input' },
      { id: 'c3', sourceNodeId: 'input-employee', sourceOutputId: 'success', targetNodeId: 'input-date', targetInputId: 'input' },
      { id: 'c4', sourceNodeId: 'input-date', sourceOutputId: 'success', targetNodeId: 'input-hours', targetInputId: 'input' },
      { id: 'c5', sourceNodeId: 'input-hours', sourceOutputId: 'success', targetNodeId: 'click-save', targetInputId: 'input' },
    ],
    variables: {
      BASE_URL: 'http://millwarep3.rebinmas.com:8003',
    },
  };
}

// Example 3: Running the engine
async function runAutomation() {
  // Create logger
  const logger = new Logger('Main');
  
  // Create event bus
  const eventBus = new EventBus();
  
  // Subscribe to events
  eventBus.on('execution:start', (event) => {
    console.log('Execution started:', event.data);
  });
  
  eventBus.on('execution:complete', (event) => {
    console.log('Execution completed:', event.data);
  });
  
  eventBus.on('node:start', (event) => {
    console.log('Node started:', event.data);
  });
  
  // Create action registry and register built-in actions
  const actionRegistry = new ActionRegistry();
  
  // Register all navigation actions
  for (const ActionClass of navigationActions) {
    actionRegistry.register(ActionClass);
  }
  
  // Register custom action
  // actionRegistry.register(CustomAction);
  
  // Create provider
  const provider = new MillwareProvider({
    baseUrl: 'http://millwarep3.rebinmas.com:8003',
    credentials: {
      username: 'adm075',
      password: 'password123',
    },
  });
  
  // Create browser adapter
  const browserAdapter = new PuppeteerAdapter({
    headless: false,
    slowMo: 0,
  });
  
  // Create agent engine
  const engine = new AgentEngine({
    provider,
    browserAdapter,
    actionRegistry,
    eventBus,
    headless: false,
    screenshotOnError: true,
    screenshotDir: './screenshots',
  });
  
  try {
    // Initialize engine
    await engine.initialize();
    
    // Create or load flow
    const flow = createSimpleFlow();
    
    // Run the flow
    const result = await engine.run(flow, {
      input: {
        employeeId: 'EMP001',
        date: '2025-01-15',
        hours: 8,
      },
      variables: {
        CUSTOM_VAR: 'custom_value',
      },
    });
    
    console.log('Execution result:', result);
    
  } catch (error) {
    console.error('Automation failed:', error);
  } finally {
    // Close the engine
    await engine.close();
  }
}

// Example 4: Creating custom provider
/*
import { AbstractProvider, ProviderConfig, SessionValidation } from './providers/baseProvider';
import { BrowserAdapter } from './adapters/browserAdapter';

class ShopifyProvider extends AbstractProvider {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      name: 'shopify',
      baseUrl: config.baseUrl || 'https://admin.shopify.com',
    });
  }

  getName(): string {
    return 'shopify';
  }

  getBaseUrl(): string {
    return this.getConfig().baseUrl;
  }

  getLoginWorkflow() {
    return {
      url: 'https://accounts.shopify.com/login',
      steps: [
        { action: 'type', params: { selector: '#account_email', value: '${credentials.email}' } },
        { action: 'click', params: { selector: '[type="submit"]' } },
        // ... more steps
      ],
    };
  }

  getSelectors() {
    return {
      login: { email: '#account_email', password: '#account_password' },
      orders: { table: '.orders-table', row: '.order-row' },
    };
  }

  async validateSession(adapter: BrowserAdapter): Promise<SessionValidation> {
    const url = adapter.getUrl();
    if (url.includes('login')) {
      return { valid: false, reason: 'NOT_LOGGED_IN', needsRelogin: true };
    }
    return { valid: true };
  }

  async handleSessionExpiry(adapter: BrowserAdapter, context: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    // Implement re-login logic
    return { success: true };
  }

  getErrorIndicators(): string[] {
    return ['error', 'exception'];
  }
}

// Register the provider
ProviderFactory.register('shopify', ShopifyProvider);
*/

// Run the example
// runAutomation();

export {
  createSimpleFlow,
  createMillwareAttendanceFlow,
  runAutomation,
};
