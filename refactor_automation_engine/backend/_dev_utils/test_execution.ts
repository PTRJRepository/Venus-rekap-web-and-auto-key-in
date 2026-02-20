
import { AutomationEngine } from '../src/engine/Engine';
import * as path from 'path';

async function main() {
    const engine = new AutomationEngine();

    // Mock flow definition
    const flow = {
        name: 'Test Flow',
        nodes: [
            {
                id: 'start-1',
                data: { actionType: 'start' }
            },
            {
                id: 'log-1',
                data: {
                    actionType: 'log',
                    params: { message: '🚀 Starting test flow...' }
                }
            },
            {
                id: 'nav-1',
                data: {
                    actionType: 'navigate',
                    params: { url: 'https://example.com' }
                }
            },
            {
                id: 'extract-1',
                data: {
                    actionType: 'extract',
                    params: { selector: 'h1', saveTo: 'pageTitle' }
                }
            },
            {
                id: 'log-2',
                data: {
                    actionType: 'log',
                    params: { message: 'Page title is: ${pageTitle}' }
                }
            }
        ],
        edges: [
            { source: 'start-1', target: 'log-1' },
            { source: 'log-1', target: 'nav-1' },
            { source: 'nav-1', target: 'extract-1' },
            { source: 'extract-1', target: 'log-2' }
        ]
    };

    console.log('--- Starting Engine Test ---');

    engine.setCallbacks(
        (msg, level, nodeId) => console.log(`[LOG][${level}] ${msg}`),
        (nodeId, status) => console.log(`[STEP][${status}] Node: ${nodeId}`),
        (status) => {
            console.log(`[COMPLETE] Status: ${status}`);
            const report = engine.getExecutionReport();
            const fs = require('fs');
            fs.writeFileSync(path.resolve(__dirname, '../test_report.json'), JSON.stringify(report, null, 2), 'utf-8');
            console.log('\n--- Execution Report saved to test_report.json ---');
            process.exit(0);
        },
        (event) => { }
    );

    try {
        await engine.runFlow(flow);
    } catch (error) {
        console.error('Run failed:', error);
        process.exit(1);
    }
}

main();
