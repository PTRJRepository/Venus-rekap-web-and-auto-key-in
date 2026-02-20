import { Page } from 'puppeteer';

// Output of the execution log
export interface ExecutionLogEntry {
    id: string; // Unique ID for the log entry
    nodeId: string;
    actionType: string;
    startTime: number;
    endTime?: number;
    status: 'running' | 'success' | 'failed' | 'skipped' | 'warning';
    message?: string;
    details?: any; // Structured data (e.g. extracted value)
    error?: string;
    screenshot?: string; // Path to screenshot if failed
}

export interface ExecutionReport {
    flowName: string;
    startTime: number;
    endTime: number;
    status: 'completed' | 'failed' | 'stopped';
    totalSteps: number;
    stepsPassed: number;
    stepsFailed: number;
    logs: ExecutionLogEntry[];
}

export interface ActionContext {
    page: Page;
    params: Record<string, any>;
    variables: Record<string, any>;
    logger: (msg: string, level?: string, details?: any) => void;
}

export interface ActionHandler {
    type: string;
    // Optional validation step before execution
    validate?: (ctx: ActionContext) => Promise<boolean>;
    execute: (ctx: ActionContext) => Promise<void>;
}

export const waitForSelector = async (page: Page, selector: string, timeout = 10000) => {
    try {
        await page.waitForSelector(selector, { visible: true, timeout });
    } catch (e) {
        throw new Error(`Timeout waiting for selector: ${selector}`);
    }
};
