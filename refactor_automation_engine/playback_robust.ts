
import { AutomationEngine } from './backend/src/engine/Engine';
import fs from 'fs';
import path from 'path';

async function playback() {
    console.log('🎬 Venus Playback Starting (Robust Mode)...');
    
    // Load recorded flow
    const flowPath = path.resolve(__dirname, 'Template', 'Raw_Flow_Import_Data.json');
    if (!fs.existsSync(flowPath)) {
        console.error('❌ Recorded flow not found at:', flowPath);
        return;
    }
    
    const flowData = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    console.log(`📂 Loaded flow: ${flowData.name || 'Untitled'}`);

    const engine = new AutomationEngine();
    
    // Setup logging to console
    engine.setCallbacks(
        (msg, level) => console.log(`[${level.toUpperCase()}] ${msg}`),
        (nodeId, status) => {
            if (status === 'running') console.log(`▶️ Node ${nodeId} is running...`);
            if (status === 'success') console.log(`✅ Node ${nodeId} success!`);
            if (status === 'failed') console.log(`❌ Node ${nodeId} failed!`);
        },
        (status) => console.log(`
🏁 EXECUTION ${status.toUpperCase()}
`),
        (event) => {}
    );
    
    // MODIFIKASI: Tambahkan Smart Wait & Retry agar flow recording bisa jalan
    const originalExecuteNode = (engine as any).executeNode.bind(engine);
    (engine as any).executeNode = async (node: any, allNodes: any[], adj: any) => {
        const { actionType, params } = node.data;
        
        // Jika aksi butuh selector, tunggu dulu sampai muncul
        if (params && params.selector && ['click', 'type', 'waitForElement'].includes(actionType)) {
            console.log(`👁️ Smart Wait: Waiting for ${params.selector}...`);
            try {
                // Gunakan timeout 15 detik untuk navigasi antar halaman yang lambat
                await (engine as any).page.waitForSelector(params.selector, { visible: true, timeout: 15000 });
            } catch (e) {
                console.warn(`⚠️ Smart Wait timeout for ${params.selector}. Trying to continue anyway...`);
            }
        }

        // Jalankan aksi asli
        return originalExecuteNode(node, allNodes, adj);
    };

    try {
        await engine.runFlow(flowData);
    } catch (err: any) {
        console.error('💥 Execution failed:', err.message);
    }
}

playback().catch(err => {
    console.error('❌ Critical Error:', err);
});
