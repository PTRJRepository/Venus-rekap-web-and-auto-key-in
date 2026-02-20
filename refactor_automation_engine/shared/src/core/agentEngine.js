"use strict";
/**
 * Agent Engine - Main orchestrator for automation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentEngine = void 0;
const baseAction_1 = require("../actions/baseAction");
const contextManager_1 = require("./contextManager");
const eventBus_1 = require("../utils/eventBus");
const logger_1 = require("../utils/logger");
/**
 * Agent Engine - Main orchestrator for automation execution
 */
class AgentEngine {
    constructor(config) {
        this.browserAdapter = null;
        this.isRunning = false;
        this.isPaused = false;
        this.isCancelled = false;
        this.currentExecution = null;
        this.provider = config.provider;
        this.actionRegistry = config.actionRegistry || new baseAction_1.ActionRegistry();
        this.eventBus = config.eventBus || new eventBus_1.EventBus();
        this.contextManager = new contextManager_1.ContextManager();
        this.logger = new logger_1.Logger('AgentEngine');
        // Configuration with defaults
        this.headless = config.headless ?? false;
        this.slowMo = config.slowMo ?? 0;
        this.screenshotOnError = config.screenshotOnError ?? true;
        this.screenshotDir = config.screenshotDir ?? './screenshots';
        this.logger.info('AgentEngine initialized', { provider: this.provider.getName() });
    }
    /**
     * Get the provider
     */
    getProvider() {
        return this.provider;
    }
    /**
     * Get the browser adapter
     */
    getBrowserAdapter() {
        return this.browserAdapter;
    }
    /**
     * Get the action registry
     */
    getActionRegistry() {
        return this.actionRegistry;
    }
    /**
     * Get the event bus
     */
    getEventBus() {
        return this.eventBus;
    }
    /**
     * Get the context manager
     */
    getContextManager() {
        return this.contextManager;
    }
    /**
     * Initialize the engine
     */
    async initialize() {
        this.logger.info('Initializing AgentEngine...');
        // Emit initialization event
        this.eventBus.emit(eventBus_1.EngineEvents.TEMPLATE_LOADED, { provider: this.provider.getName() });
        this.logger.info('AgentEngine initialized successfully');
    }
    /**
     * Run a flow
     */
    async run(flow, options = {}) {
        if (this.isRunning) {
            throw new Error('Engine is already running');
        }
        this.isRunning = true;
        this.isCancelled = false;
        this.isPaused = false;
        const execution = {
            id: `exec_${Date.now()}`,
            flowId: flow.id,
            flowVersion: flow.version,
            status: 'running',
            startedAt: new Date().toISOString(),
            triggerType: 'manual',
            nodeExecutions: [],
        };
        this.currentExecution = execution;
        try {
            this.logger.info(`Starting execution: ${execution.id}`, { flowId: flow.id });
            this.eventBus.emit(eventBus_1.EngineEvents.EXECUTION_START, { executionId: execution.id, flowId: flow.id });
            // Initialize context with input and variables
            this.contextManager.createScope();
            if (options.input) {
                this.contextManager.merge({ input: options.input });
            }
            if (options.variables) {
                this.contextManager.merge(options.variables);
            }
            if (flow.variables) {
                this.contextManager.merge(flow.variables);
            }
            // Launch browser if needed
            await this.ensureBrowser();
            // Validate session
            await this.validateSession();
            // Execute flow
            const result = await this.executeFlow(flow, options);
            // Update execution status
            execution.status = result.success ? 'completed' : 'failed';
            execution.completedAt = new Date().toISOString();
            execution.duration = new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime();
            execution.output = result.output;
            if (!result.success) {
                execution.error = result.error;
            }
            this.logger.info(`Execution completed: ${execution.id}`, {
                status: execution.status,
                duration: execution.duration,
            });
            this.eventBus.emit(eventBus_1.EngineEvents.EXECUTION_COMPLETE, {
                executionId: execution.id,
                status: execution.status,
                duration: execution.duration,
            });
        }
        catch (error) {
            execution.status = 'failed';
            execution.error = error.message;
            execution.completedAt = new Date().toISOString();
            this.logger.error(`Execution failed: ${execution.id}`, error);
            this.eventBus.emit(eventBus_1.EngineEvents.EXECUTION_ERROR, {
                executionId: execution.id,
                error: error.message,
            });
            // Take screenshot on error if enabled
            if (this.screenshotOnError && this.browserAdapter) {
                await this.takeErrorScreenshot();
            }
        }
        finally {
            this.isRunning = false;
            this.currentExecution = null;
        }
        return execution;
    }
    /**
     * Execute the flow
     */
    async executeFlow(flow, options) {
        const nodeMap = new Map();
        for (const node of flow.nodes) {
            nodeMap.set(node.id, node);
        }
        const connectionMap = new Map();
        for (const conn of flow.connections) {
            const connections = connectionMap.get(conn.sourceNodeId) || [];
            connections.push(conn);
            connectionMap.set(conn.sourceNodeId, connections);
        }
        // Find start nodes
        const startNodes = flow.nodes.filter(n => n.type === 'trigger' || n.inputs?.length === 0);
        if (startNodes.length === 0 && flow.nodes.length > 0) {
            startNodes.push(flow.nodes[0]);
        }
        // Execute each start node
        for (const startNode of startNodes) {
            const result = await this.executeNode(startNode, nodeMap, connectionMap, 0);
            if (!result.success) {
                return { success: false, error: result.error };
            }
        }
        return { success: true, output: this.contextManager.getAll() };
    }
    /**
     * Execute a single node
     */
    async executeNode(node, nodeMap, connectionMap, depth) {
        if (this.isCancelled) {
            return { success: false, error: 'Execution cancelled' };
        }
        if (this.isPaused) {
            // Wait until resumed
            await this.waitForResume();
        }
        const nodeExecution = {
            nodeId: node.id,
            nodeName: node.name,
            status: 'running',
            startedAt: new Date().toISOString(),
        };
        this.currentExecution?.nodeExecutions.push(nodeExecution);
        try {
            this.logger.info(`Executing node: ${node.name}`, { nodeId: node.id, depth });
            this.eventBus.emit(eventBus_1.EngineEvents.NODE_START, { nodeId: node.id, nodeName: node.name });
            // Check retry policy
            let retryCount = 0;
            const maxRetries = node.retryPolicy?.maxRetries ?? 0;
            while (retryCount <= maxRetries) {
                try {
                    // Execute the node
                    const result = await this.executeNodeAction(node);
                    nodeExecution.status = 'completed';
                    nodeExecution.completedAt = new Date().toISOString();
                    nodeExecution.output = result;
                    this.eventBus.emit(eventBus_1.EngineEvents.NODE_COMPLETE, {
                        nodeId: node.id,
                        nodeName: node.name,
                        output: result,
                    });
                    // Execute connected nodes
                    const connections = connectionMap.get(node.id) || [];
                    for (const conn of connections) {
                        const nextNode = nodeMap.get(conn.targetNodeId);
                        if (nextNode) {
                            await this.executeNode(nextNode, nodeMap, connectionMap, depth + 1);
                        }
                    }
                    return { success: true, output: result };
                }
                catch (error) {
                    retryCount++;
                    if (retryCount <= maxRetries) {
                        this.logger.warn(`Retrying node: ${node.name}`, {
                            retryCount,
                            maxRetries,
                            error: error.message,
                        });
                        // Wait before retry
                        const backoffMs = node.retryPolicy?.backoffMs ?? 1000;
                        await this.sleep(backoffMs * retryCount);
                    }
                    else {
                        throw error;
                    }
                }
            }
            return { success: false, error: 'Max retries exceeded' };
        }
        catch (error) {
            nodeExecution.status = 'failed';
            nodeExecution.completedAt = new Date().toISOString();
            nodeExecution.error = error.message;
            this.eventBus.emit(eventBus_1.EngineEvents.NODE_ERROR, {
                nodeId: node.id,
                nodeName: node.name,
                error: error.message,
            });
            return { success: false, error: error.message };
        }
    }
    /**
     * Execute the action for a node
     */
    async executeNodeAction(node) {
        const actionType = node.type;
        const params = node.parameters || {};
        // Resolve variables in params
        const resolvedParams = contextManager_1.ContextManager.resolveObject(params, this.contextManager.getAll());
        // Create execution context
        const context = {
            flowId: this.currentExecution?.flowId || '',
            executionId: this.currentExecution?.id || '',
            timestamp: new Date().toISOString(),
            data: this.contextManager.getAll(),
            variables: this.contextManager.getAll(),
            errors: [],
            metadata: {
                currentNode: node.id,
            },
        };
        // Execute provider beforeAction hook
        if (this.provider.beforeAction) {
            await this.provider.beforeAction(actionType, resolvedParams, context);
        }
        // Execute the action
        const result = await this.actionRegistry.execute(actionType, this.browserAdapter, resolvedParams, context);
        // Update context with output
        if (result.success && result.data !== undefined) {
            this.contextManager.set(`outputs.${node.id}`, result.data);
        }
        // Execute provider afterAction hook
        if (this.provider.afterAction) {
            await this.provider.afterAction(actionType, result, context);
        }
        if (!result.success) {
            throw new Error(result.error || 'Action failed');
        }
        return result.data;
    }
    /**
     * Validate session
     */
    async validateSession() {
        if (!this.browserAdapter) {
            throw new Error('Browser not initialized');
        }
        const validation = await this.provider.validateSession(this.browserAdapter);
        if (!validation.valid && validation.needsRelogin) {
            this.logger.warn('Session expired, re-logging in...');
            this.eventBus.emit(eventBus_1.EngineEvents.SESSION_EXPIRED, { provider: this.provider.getName() });
            await this.provider.handleSessionExpiry(this.browserAdapter, this.contextManager.getAll());
            this.eventBus.emit(eventBus_1.EngineEvents.SESSION_REFRESHED, { provider: this.provider.getName() });
        }
    }
    /**
     * Ensure browser is launched
     */
    async ensureBrowser() {
        if (!this.browserAdapter) {
            throw new Error('Browser adapter not set');
        }
        if (!this.browserAdapter.isConnected()) {
            await this.browserAdapter.launch();
        }
    }
    /**
     * Take error screenshot
     */
    async takeErrorScreenshot() {
        if (!this.browserAdapter)
            return;
        try {
            const filename = `error_${Date.now()}.png`;
            const path = `${this.screenshotDir}/${filename}`;
            await this.browserAdapter.screenshot({ type: 'png', fullPage: false });
            this.logger.info(`Error screenshot saved: ${filename}`);
        }
        catch (error) {
            this.logger.error('Failed to take error screenshot', error);
        }
    }
    /**
     * Wait for resume
     */
    waitForResume() {
        return new Promise(resolve => {
            const checkResume = setInterval(() => {
                if (!this.isPaused || this.isCancelled) {
                    clearInterval(checkResume);
                    resolve();
                }
            }, 100);
        });
    }
    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Pause execution
     */
    pause() {
        if (!this.isRunning) {
            throw new Error('Engine is not running');
        }
        this.isPaused = true;
        this.eventBus.emit(eventBus_1.EngineEvents.EXECUTION_PAUSED, { executionId: this.currentExecution?.id });
        this.logger.info('Execution paused');
    }
    /**
     * Resume execution
     */
    resume() {
        if (!this.isRunning) {
            throw new Error('Engine is not running');
        }
        this.isPaused = false;
        this.eventBus.emit(eventBus_1.EngineEvents.EXECUTION_RESUMED, { executionId: this.currentExecution?.id });
        this.logger.info('Execution resumed');
    }
    /**
     * Cancel execution
     */
    cancel() {
        if (!this.isRunning) {
            throw new Error('Engine is not running');
        }
        this.isCancelled = true;
        this.isPaused = false;
        this.eventBus.emit(eventBus_1.EngineEvents.EXECUTION_CANCELLED, { executionId: this.currentExecution?.id });
        this.logger.info('Execution cancelled');
    }
    /**
     * Get current execution status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            execution: this.currentExecution,
        };
    }
    /**
     * Close the engine
     */
    async close() {
        if (this.browserAdapter?.isConnected()) {
            await this.browserAdapter.close();
        }
        this.logger.info('AgentEngine closed');
    }
}
exports.AgentEngine = AgentEngine;
exports.default = AgentEngine;
