
const { AutomationEngine } = require('./backend/dist/engine/Engine');
const fs = require('fs');
const path = require('path');

async function playback() {
    console.log('🎬 Venus Playback Starting...');
    
    // Load recorded flow
    const flowPath = path.join(__dirname, 'Template', 'Raw_Flow_Import_Data.json');
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
        (nodeId, status) => console.log(`Step ${nodeId}: ${status}`),
        (status) => console.log(`🏁 Execution complete with status: ${status}`),
        (event) => {}
    );
    
    try {
        await engine.runFlow(flowData);
    } catch (err) {
        console.error('💥 Execution failed:', err);
    }
}

playback();
