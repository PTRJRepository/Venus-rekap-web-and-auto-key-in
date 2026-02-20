import { AutomationEngine } from './backend/src/engine/Engine';
import fs from 'fs';
import path from 'path';

async function playback() {
    console.log('🎬 Venus Playback Starting (Direct Engine Mode)...');
    
    // Load recorded flow
    const flowPath = path.resolve(__dirname, 'Template', 'Raw_Flow_Import_Data.json');
    if (!fs.existsSync(flowPath)) {
        console.error('❌ Recorded flow not found at:', flowPath);
        return;
    }
    
    const flowData = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    console.log(`📂 Loaded flow: ${flowData.name || 'Untitled'}`);
    console.log(`📊 Nodes: ${flowData.nodes.length}, Edges: ${flowData.edges.length}`);

    const engine = new AutomationEngine();
    
    // Setup logging to console
    engine.setCallbacks(
        (msg, level) => console.log(`[${level.toUpperCase()}] ${msg}`),
        (nodeId, status) => {
            if (status === 'running') console.log(`▶️ Node ${nodeId} is running...`);
            if (status === 'success') console.log(`✅ Node ${nodeId} success!`);
            if (status === 'failed') console.log(`❌ Node ${nodeId} failed!`);
        },
        (status) => console.log(`\n🏁 EXECUTION ${status.toUpperCase()}\n`),
        (event) => {}
    );
    
    // Delay each node execution to make it "semirip mungkin" (as closely as possible)
    // and wait for page transitions
    const originalExecuteNode = (engine as any).executeNode.bind(engine);
    (engine as any).executeNode = async (node: any, allNodes: any[], adj: any) => {
        console.log(`⏱️ Waiting 3s before node ${node.id}...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        return originalExecuteNode(node, allNodes, adj);
    };

    try {
        await engine.runFlow(flowData);
        console.log('✅ Playback finished successfully.');
    } catch (err: any) {
        console.error('💥 Execution failed:', err.message);
    }
}

playback().catch(err => {
    console.error('❌ Critical Error:', err);
});
