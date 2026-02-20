import puppeteer, { Browser, Page } from 'puppeteer';
import { ActionHandler, ActionContext, ExecutionLogEntry, ExecutionReport } from './actions/types';
import * as actions from './actions/implementations';
import * as millwareActions from './actions/millware';
import { RECORDER_SCRIPT } from './recorder';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import fs from 'fs';

// Main Engine Class
export class AutomationEngine {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private isRunning = false;
    private shouldStop = false;
    private variables: Record<string, any> = {};

    // Handlers
    private actionRegistry = new Map<string, ActionHandler>();

    // Callbacks
    private onLog = (msg: string, level: string, nodeId?: string) => { };
    private onStep = (nodeId: string, status: string) => { };
    private onComplete = (status: string) => { };
    private onRecordEvent = (event: any) => { };

    // Execution Reporting
    private executionLogs: ExecutionLogEntry[] = [];
    private currentFlowName: string = '';
    private startTime: number = 0;

    constructor() {
        // Register core actions
        Object.values(actions).forEach(action => {
            this.actionRegistry.set(action.type, action);
        });
        // Register Millware-specific actions
        Object.values(millwareActions).forEach(action => {
            this.actionRegistry.set(action.type, action);
        });
    }

    setCallbacks(
        onLog: typeof this.onLog,
        onStep: typeof this.onStep,
        onComplete: typeof this.onComplete,
        onRecordEvent: typeof this.onRecordEvent
    ) {
        this.onLog = onLog;
        this.onStep = onStep;
        this.onComplete = onComplete;
        this.onRecordEvent = onRecordEvent;
    }

    getRegisteredActions() {
        return Array.from(this.actionRegistry.keys());
    }

    getExecutionReport(): ExecutionReport {
        const endTime = Date.now();
        const totalSteps = this.executionLogs.length;
        const stepsFailed = this.executionLogs.filter(l => l.status === 'failed').length;
        const stepsPassed = this.executionLogs.filter(l => l.status === 'success').length;

        return {
            flowName: this.currentFlowName,
            startTime: this.startTime,
            endTime,
            status: this.shouldStop ? 'stopped' : (stepsFailed > 0 ? 'failed' : 'completed'),
            totalSteps,
            stepsPassed,
            stepsFailed,
            logs: this.executionLogs
        };
    }

    // --- BROWSER MANAGEMENT ---

    async startBrowser(headless = false) {
        console.log(`[Engine] startBrowser called (headless: ${headless})`);
        
        // FIX: Force restart for clean state to avoid about:blank issues
        if (this.browser && this.browser.isConnected()) {
            console.log('[Engine] Closing existing browser for clean state...');
            try { 
                await this.browser.close(); 
            } catch (e) { 
                console.warn('[Engine] Error closing browser:', e);
            }
            this.browser = null;
            this.page = null;
        }

        this.onLog('🚀 Launching browser...', 'info');
        console.log('[Engine] Launching Puppeteer...');
        try {
            this.browser = await puppeteer.launch({
                headless,
                defaultViewport: null,
                args: [
                    '--start-maximized',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--ignore-certificate-errors'
                ],
                ignoreDefaultArgs: ['--enable-automation']
            });
            console.log('[Engine] Puppeteer launched successfully');

            // FIX: Create a new page and ensure it's valid
            this.page = await this.browser.newPage();
            
            // Set default timeout
            this.page.setDefaultTimeout(30000);
            
            // FIX: Close any about:blank pages that might exist
            const pages = await this.browser.pages();
            for (const p of pages) {
                if (p !== this.page && p.url() === 'about:blank') {
                    try { await p.close(); } catch(e) {}
                }
            }

            console.log(`[Engine] Page ready`);
            await this.page.bringToFront();
            this.onLog('✅ Browser ready', 'success');
        } catch (error: any) {
            console.error('[Engine] Browser launch failed:', error);
            this.onLog(`❌ Browser launch failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async stopBrowser() {
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) { }
            this.browser = null;
            this.page = null;
            this.onLog('🛑 Browser closed', 'info');
        }
    }

    private async takeScreenshot(name: string): Promise<string> {
        if (!this.page) return '';
        const filename = `error_${name}_${Date.now()}.png`;
        const filepath = path.resolve(process.cwd(), 'screenshots', filename); // Ensure screenshots dir exists
        try {
            await this.page.screenshot({ path: filepath });
            return filepath;
        } catch (e) {
            return '';
        }
    }

    // --- RECORDING ---

    // Helper: Try HTTPS first, fall back to HTTP for SSL errors - with retry logic
    private async tryNavigate(url: string, maxRetries = 3): Promise<void> {
        if (!this.page) throw new Error('Page not initialized');

        const isHttps = url.startsWith('https://');
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[Engine] Navigation attempt ${attempt}/${maxRetries} to ${url}`);
                await this.page.goto(url, {
                    waitUntil: 'networkidle0',
                    timeout: 60000
                });
                console.log(`[Engine] Navigation successful to ${url}`);
                return;
            } catch (error: any) {
                lastError = error;
                console.warn(`[Engine] Navigation attempt ${attempt} failed:`, error.message);
                
                // If we tried HTTPS and got SSL error, retry with HTTP
                if (isHttps && error.message?.includes('ERR_SSL_PROTOCOL_ERROR')) {
                    this.onLog(`⚠️ SSL error, retrying with HTTP...`, 'warn');
                    const httpUrl = url.replace('https://', 'http://');
                    try {
                        await this.page.goto(httpUrl, {
                            waitUntil: 'networkidle0',
                            timeout: 60000
                        });
                        console.log(`[Engine] Navigation successful via HTTP: ${httpUrl}`);
                        return;
                    } catch (httpError: any) {
                        lastError = httpError;
                    }
                }
                
                // Handle specific network errors
                if (error.message?.includes('net::ERR_NAME_NOT_RESOLVED')) {
                    throw new Error(`DNS Error: Cannot resolve ${url}`);
                }
                if (error.message?.includes('net::ERR_CONNECTION_REFUSED')) {
                    throw new Error(`Connection refused: ${url}`);
                }
                if (error.message?.includes('net::ERR_CONNECTION_TIMED_OUT')) {
                    this.onLog(`⚠️ Connection timed out, attempt ${attempt}/${maxRetries}...`, 'warn');
                }
                
                // Wait before retry (exponential backoff)
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
        }
        
        throw new Error(`Navigation failed after ${maxRetries} attempts: ${lastError?.message}`);
    }

    async startRecording(url: string) {
        // FIX: Force specific restart for recording to ensure clean state
        if (this.browser) await this.stopBrowser();
        await this.startBrowser(false);
        
        if (!this.page) {
            throw new Error('Failed to create browser page');
        }

        this.onLog('🔴 Recording started', 'warn');

        // FIX: Wait for browser to be fully ready before any operations
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('[Engine] Browser ready, setting up recorder...');

        // Step 1: Expose the recording function BEFORE injecting script
        await this.page.exposeFunction('venice_record', (event: any) => {
            this.onLog(`🎥 Captured: ${event.type} on ${event.selector || url}`, 'info');
            this.onRecordEvent(event);
        });
        console.log('[Engine] venice_record function exposed');

        // Step 2: Inject recorder script to run on ALL documents (including existing)
        await this.page.evaluateOnNewDocument(RECORDER_SCRIPT);
        console.log('[Engine] Recorder script scheduled for new documents');

        // Step 3: Also inject for the current page (if already loaded)
        await this.page.evaluate(RECORDER_SCRIPT).catch(() => {
            // Page might not be ready yet, that's OK - script will run on new document
            console.log('[Engine] Script injection deferred (page not ready)');
        });
        console.log('[Engine] Recorder script injected');

        // Capture initial navigation
        this.onRecordEvent({
            type: 'navigate',
            params: { url: url },
            url: url,
            timestamp: Date.now(),
            label: `Navigate to ${url}`
        });

        let lastRecordedUrl = url;

        // FIX: Better framenavigated handler - ignore about:blank and initial load
        let isFirstNavigation = true;
        this.page.on('framenavigated', async (frame) => {
            if (frame === this.page!.mainFrame()) {
                const newUrl = frame.url();
                // FIX: More robust filtering of invalid URLs
                if (newUrl && 
                    newUrl !== 'about:blank' && 
                    newUrl !== 'about:srcdoc' &&
                    !newUrl.startsWith('data:') &&
                    newUrl !== lastRecordedUrl) {
                    // Skip the very first navigation event since we handle it manually
                    if (isFirstNavigation) {
                        isFirstNavigation = false;
                        return;
                    }
                    lastRecordedUrl = newUrl;
                    this.onLog(`🌐 Detected Navigation: ${newUrl}`, 'info');

                    this.onRecordEvent({
                        type: 'navigate',
                        params: { url: newUrl },
                        url: newUrl,
                        timestamp: Date.now(),
                        label: `Navigate to ${newUrl}`
                    });
                }
            }
        });

        // Step 4: Navigate to the target URL
        this.onLog(`🌐 Navigating to ${url}...`, 'info');
        await this.tryNavigate(url);
        console.log('[Engine] Navigation complete');

        // Step 5: Re-inject script after navigation to ensure it's active
        // Wait a bit for the page to settle
        await new Promise(resolve => setTimeout(resolve, 1500));
        await this.page.evaluate(RECORDER_SCRIPT);
        console.log('[Engine] Recorder script re-injected after navigation');

        // Step 6: Verify the recorder is active
        const isActive = await this.page.evaluate(() => {
            return typeof (window as any).venice_record === 'function' &&
                   (window as any).veniceRecorderActive === true;
        });
        if (!isActive) {
            this.onLog('⚠️ Recorder may not be active properly', 'warn');
            console.error('[Engine] Recorder verification failed!');
        } else {
            console.log('[Engine] Recorder verified active');
        }
    }

    async stopRecording() {
        this.onLog('⏹️ Recording stopped', 'warn');
    }

    // --- EXECUTION ---

    async requestStop() {
        this.shouldStop = true;
        this.onLog('🛑 Stopping execution...', 'warn');
        await this.stopBrowser();
    }

    async runFlow(flow: any) {
        if (this.isRunning) throw new Error('Already running');
        this.isRunning = true;
        this.shouldStop = false;
        this.variables = {};
        this.executionLogs = [];
        this.currentFlowName = flow.name || 'Unnamed Flow';
        this.startTime = Date.now();

        // Ensure screenshots directory exists
        const screenshotDir = path.resolve(process.cwd(), 'screenshots');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        // If flow has a dataFile reference, load external data
        if (flow.dataFile) {
            try {
                const dataPath = path.resolve(flow.dataFile);
                const raw = fs.readFileSync(dataPath, 'utf-8');
                this.variables['data'] = JSON.parse(raw);
                this.onLog(`📂 Loaded data from ${flow.dataFile}`, 'info');
            } catch (e: any) {
                this.onLog(`⚠️ Could not load dataFile: ${e.message}`, 'warn');
            }
        }

        // If flow has inline data, store it
        if (flow.data) {
            this.variables['data'] = flow.data;
        }

        try {
            // Always try to ensure browser is ready
            await this.startBrowser(false);

            this.onLog(`▶️ Starting Flow: ${flow.name}`, 'info');
            console.log(`[Engine] Starting flow: ${flow.name} (${flow.nodes?.length} nodes, ${flow.edges?.length} edges)`);

            // Build adj list
            const adj = new Map<string, string[]>();
            if (Array.isArray(flow.edges)) {
                flow.edges.forEach((e: any) => {
                    if (!adj.has(e.source)) adj.set(e.source, []);
                    adj.get(e.source)!.push(e.target);
                });
                console.log(`[Engine] Adjacency map built with ${adj.size} source nodes`);
            } else {
                this.onLog(`⚠️ Flow has no edges array!`, 'warn');
            }

            // Find Start
            let startNode = flow.nodes.find((n: any) => n.data.actionType === 'start');
            if (!startNode) {
                console.log('[Engine] No "start" actionType found, using first node.');
                startNode = flow.nodes[0];
            } else {
                console.log(`[Engine] Found start node: ${startNode.id} (${startNode.data.label})`);
            }

            if (!startNode) {
                throw new Error('Flow has no nodes!');
            }

            // Execute the chain
            await this.executeChain(startNode, flow.nodes, adj);

            const status = this.shouldStop ? 'stopped' : 'completed';
            this.onComplete(status);
        } catch (e: any) {
            this.onLog(`❌ Global Error: ${e.message}`, 'error');
            this.onComplete('failed');
        } finally {
            this.isRunning = false;
        }
    }

    // Walk the chain from a given node following edges
    private async executeChain(startNode: any, allNodes: any[], adj: Map<string, string[]>) {
        let curr = startNode;
        let steps = 0;
        while (curr && !this.shouldStop && steps < 500) { // Safety cap
            steps++;
            console.log(`[Engine] [Step ${steps}] Executing node: ${curr.id} (${curr.data.actionType}) - ${curr.data.label}`);
            try {
                await this.executeNode(curr, allNodes, adj);
            } catch (e: any) {
                console.error(`[Engine] Node ${curr.id} failed: ${e.message}`);
                break;
            }

            const nextIds = adj.get(curr.id);
            if (nextIds && nextIds.length > 0) {
                const nextId = nextIds[0];
                console.log(`[Engine] Moving to next node: ${nextId}`);
                curr = allNodes.find((n: any) => n.id === nextId);
                if (!curr) console.error(`[Engine] Could not find node with ID: ${nextId}`);
            } else {
                console.log(`[Engine] No next node for ${curr.id}. Flow complete.`);
                curr = null;
            }
        }
    }

    private async executeNode(node: any, allNodes: any[], adj: Map<string, string[]>) {
        const { actionType, params } = node.data;

        // Create Log Entry
        const logEntry: ExecutionLogEntry = {
            id: uuidv4(),
            nodeId: node.id,
            actionType,
            startTime: Date.now(),
            status: 'running'
        };
        this.executionLogs.push(logEntry);

        const updateLog = (status: ExecutionLogEntry['status'], message?: string, error?: string, screenshot?: string, details?: any) => {
            logEntry.status = status;
            logEntry.endTime = Date.now();
            if (message) logEntry.message = message;
            if (error) logEntry.error = error;
            if (screenshot) logEntry.screenshot = screenshot;
            if (details) logEntry.details = details;

            // Emit via onLog/onStep for UI
            this.onStep(node.id, status);
            if (message) this.onLog(message, status === 'failed' ? 'error' : (status === 'warning' ? 'warn' : 'info'), node.id);
        };

        if (actionType === 'start') {
            updateLog('success', 'Start node reached');
            return;
        }

        // ── AUTO-WAIT: Added to make recorded flows more robust ──
        // This gives the page time to breathe between recorded steps
        await new Promise(r => setTimeout(r, 1000));

        // ── FLOW CONTROL ── (Special handling required, wrapping in try/catch)
        // Note: Flow control nodes (if, forEach) are containers/routers. 
        // We log their entry, but their success depends on their internal logic.

        try {
            if (actionType === 'forEach') {
                await this.handleForEach(node, allNodes, adj);
                updateLog('success', 'ForEach loop completed');
                return;
            }
            if (actionType === 'forEachProperty') {
                await this.handleForEachProperty(node, allNodes, adj);
                updateLog('success', 'ForEachProperty loop completed');
                return;
            }
            if (actionType === 'if' || actionType === 'conditional') {
                await this.handleConditional(node, allNodes, adj);
                updateLog('success', 'Conditional check completed');
                return;
            }

            // ── STANDARD ACTION ──
            const handler = this.actionRegistry.get(actionType);
            if (!handler) {
                updateLog('failed', `Unknown action: ${actionType}`, `Action ${actionType} not registered`);
                throw new Error(`Unknown action: ${actionType}`);
            }

            const resolvedParams = this.resolveVars(params);
            console.log(`[Engine] Action ${actionType} with params:`, JSON.stringify(resolvedParams));

            const ctx: ActionContext = {
                page: this.page!,
                params: resolvedParams,
                variables: this.variables,
                logger: (m: string, l: string = 'info', d?: any) => {
                    this.onLog(m, l, node.id);
                    if (d) logEntry.details = { ...logEntry.details, ...d };
                }
            };

            // 1. Validation
            if (handler.validate) {
                const isValid = await handler.validate(ctx);
                if (!isValid) {
                    const screenshot = await this.takeScreenshot(`${node.id}_validation_fail`);
                    updateLog('failed', 'Validation failed', 'Validation check returned false', screenshot);
                    throw new Error(`Validation failed for ${actionType}`);
                }
            }

            // 2. Execution
            await handler.execute(ctx);
            updateLog('success', `Action ${actionType} executed successfully`);

        } catch (e: any) {
            const screenshot = await this.takeScreenshot(`${node.id}_error`);
            updateLog('failed', `Error: ${e.message}`, e.message, screenshot);
            throw e; // Propagate to stop chain
        }
    }

    // ── forEach handler ──
    // The node has params: { items: "data.data", itemName: "employee", subFlowNodes: [...], subFlowEdges: [...] }
    // OR the sub-flow is linked via edges to child nodes (graph-based approach)
    private async handleForEach(node: any, allNodes: any[], adj: Map<string, string[]>) {
        const resolved = this.resolveVars(node.data.params);
        const itemsPath = resolved.items || '';
        const itemName = resolved.itemName || 'item';

        // Resolve the items array from variables
        const items = this.resolveDeepVar(itemsPath);
        if (!Array.isArray(items)) {
            throw new Error(`forEach: "${itemsPath}" is not an array`);
        }

        this.onLog(`🔁 forEach: ${items.length} items from "${itemsPath}"`, 'info', node.id);

        // Sub-flow: nodes linked from this forEach node via edges
        const childIds = adj.get(node.id) || [];
        if (childIds.length === 0) {
            // Check for inline subFlowNodes
            if (node.data.params.subFlowNodes) {
                for (let i = 0; i < items.length && !this.shouldStop; i++) {
                    this.variables[itemName] = items[i];
                    this.onLog(`🔁 [${i + 1}/${items.length}]`, 'info', node.id);
                    const subAdj = new Map<string, string[]>();
                    (node.data.params.subFlowEdges || []).forEach((e: any) => {
                        if (!subAdj.has(e.source)) subAdj.set(e.source, []);
                        subAdj.get(e.source)!.push(e.target);
                    });
                    const subStart = node.data.params.subFlowNodes[0];
                    if (subStart) await this.executeChain(subStart, node.data.params.subFlowNodes, subAdj);
                }
            }
            return;
        }

        // Graph-based: first child is the sub-flow entry point, execute it for each item
        const subEntryNode = allNodes.find((n: any) => n.id === childIds[0]);
        for (let i = 0; i < items.length && !this.shouldStop; i++) {
            this.variables[itemName] = items[i];
            this.onLog(`🔁 [${i + 1}/${items.length}] ${itemName}`, 'info', node.id);
            if (subEntryNode) await this.executeChain(subEntryNode, allNodes, adj);
        }
    }

    // ── forEachProperty handler ──
    private async handleForEachProperty(node: any, allNodes: any[], adj: Map<string, string[]>) {
        const resolved = this.resolveVars(node.data.params);
        const objectPath = resolved.object || '';
        const keyName = resolved.keyName || 'key';
        const valueName = resolved.valueName || 'value';

        const obj = this.resolveDeepVar(objectPath);
        if (!obj || typeof obj !== 'object') {
            throw new Error(`forEachProperty: "${objectPath}" is not an object`);
        }

        const entries = Object.entries(obj);
        this.onLog(`🔁 forEachProperty: ${entries.length} entries from "${objectPath}"`, 'info', node.id);

        const childIds = adj.get(node.id) || [];
        const subEntryNode = childIds.length > 0 ? allNodes.find((n: any) => n.id === childIds[0]) : null;

        for (let i = 0; i < entries.length && !this.shouldStop; i++) {
            const [key, value] = entries[i];
            this.variables[keyName] = key;
            this.variables[valueName] = value;
            this.onLog(`🔁 [${i + 1}/${entries.length}] ${keyName}="${key}"`, 'info', node.id);
            if (subEntryNode) await this.executeChain(subEntryNode, allNodes, adj);
        }
    }

    // ── Conditional handler ──
    // The node has params: { condition: "..." }
    // Two outgoing edges: first = then, second = else
    private async handleConditional(node: any, allNodes: any[], adj: Map<string, string[]>) {
        const resolved = this.resolveVars(node.data.params);
        const condition = resolved.condition || '';

        let result = false;
        try {
            // Evaluate condition against current variables
            const evalFn = new Function(...Object.keys(this.variables), `return !!(${condition})`);
            result = evalFn(...Object.values(this.variables));
        } catch (e: any) {
            throw new Error(`Condition eval error: ${e.message}`);
        }

        this.onLog(`🔀 Condition "${condition}" → ${result}`, 'info', node.id);

        const childIds = adj.get(node.id) || [];
        // Convention: first edge = "then" branch, second edge = "else" branch
        const thenNodeId = childIds[0];
        const elseNodeId = childIds[1];

        if (result && thenNodeId) {
            const thenNode = allNodes.find((n: any) => n.id === thenNodeId);
            if (thenNode) await this.executeChain(thenNode, allNodes, adj);
        } else if (!result && elseNodeId) {
            const elseNode = allNodes.find((n: any) => n.id === elseNodeId);
            if (elseNode) await this.executeChain(elseNode, allNodes, adj);
        }
    }

    // ── Variable resolution ──

    // Resolves "data.data" or "employee.Attendance" style paths from variables
    private resolveDeepVar(path: string): any {
        const parts = path.split('.');
        let current: any = this.variables;
        for (const part of parts) {
            if (current == null) return undefined;
            current = current[part];
        }
        return current;
    }

    // Resolves ${var} placeholders in params (supports inline substitution)
    private resolveVars(params: any): any {
        if (!params) return {};

        if (Array.isArray(params)) {
            return params.map(item => this.resolveVars(item));
        }

        if (typeof params !== 'object') {
            if (typeof params === 'string') {
                return params.replace(/\$\{([^}]+)\}/g, (_, varPath: string) => {
                    const resolved = this.resolveDeepVar(varPath.trim());
                    return resolved !== undefined ? String(resolved) : `\${${varPath}}`;
                });
            }
            return params;
        }

        const res: any = {};
        for (const key in params) {
            res[key] = this.resolveVars(params[key]);
        }
        return res;
    }
}
