// Debug script to check flow structure
const fs = require('fs');

// Read flow file from command line argument
const flowFile = process.argv[2];
if (!flowFile) {
    console.log('Usage: node debug_flow.js <flow-file.json>');
    process.exit(1);
}

const flow = JSON.parse(fs.readFileSync(flowFile, 'utf-8'));

console.log('=== FLOW DEBUG INFO ===\n');
console.log('Flow Name:', flow.name);
console.log('Total Nodes:', flow.nodes?.length || 0);
console.log('Total Edges:', flow.edges?.length || 0);

console.log('\n=== NODES ===');
flow.nodes?.forEach((node, i) => {
    console.log(`\n[${i}] Node ID: ${node.id}`);
    console.log(`    Type: ${node.type}`);
    console.log(`    Action Type: ${node.data?.actionType}`);
    console.log(`    Label: ${node.data?.label}`);
    console.log(`    Params:`, JSON.stringify(node.data?.params, null, 2));
});

console.log('\n=== EDGES (Connections) ===');
flow.edges?.forEach((edge, i) => {
    const sourceNode = flow.nodes.find(n => n.id === edge.source);
    const targetNode = flow.nodes.find(n => n.id === edge.target);
    console.log(`[${i}] ${edge.source} (${sourceNode?.data?.actionType || '?'}) -> ${edge.target} (${targetNode?.data?.actionType || '?'})`);
});

console.log('\n=== EXECUTION CHAIN ===');
// Find start node
const startNode = flow.nodes.find(n => n.data?.actionType === 'start') || flow.nodes[0];
console.log('Start Node:', startNode?.id, `(${startNode?.data?.actionType})`);

// Build adjacency list
const adj = new Map();
flow.edges?.forEach(e => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
});

// Trace execution
let curr = startNode;
let steps = 0;
console.log('\nExecution Path:');
while (curr && steps < 50) {
    steps++;
    const url = curr.data?.params?.url ? ` [URL: ${curr.data.params.url}]` : '';
    console.log(`  Step ${steps}: ${curr.id} (${curr.data?.actionType})${url}`);
    
    const nextIds = adj.get(curr.id);
    if (nextIds && nextIds.length > 0) {
        curr = flow.nodes.find(n => n.id === nextIds[0]);
    } else {
        console.log('  (End of chain)');
        break;
    }
}

// Check for navigate issues
console.log('\n=== NAVIGATE CHECK ===');
const navigateNodes = flow.nodes.filter(n => n.data?.actionType === 'navigate');
if (navigateNodes.length === 0) {
    console.log('❌ WARNING: No navigate node found! Browser will stay on about:blank');
} else {
    navigateNodes.forEach(n => {
        const hasUrl = n.data?.params?.url;
        if (hasUrl) {
            console.log(`✅ Navigate node ${n.id} has URL: ${n.data.params.url}`);
        } else {
            console.log(`❌ Navigate node ${n.id} MISSING URL!`);
        }
        
        // Check if connected from start
        const isConnected = flow.edges.some(e => e.target === n.id);
        if (isConnected) {
            console.log(`   Connected: YES`);
        } else {
            console.log(`   Connected: NO - This node is NOT connected to the flow!`);
        }
    });
}
