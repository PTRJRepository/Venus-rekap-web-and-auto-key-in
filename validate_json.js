const fs = require('fs');
try {
    const content = fs.readFileSync('browser-automation-engine/templates/attendance-input-loop.json', 'utf8');
    JSON.parse(content);
    console.log("✅ JSON is valid");
} catch (e) {
    console.log("❌ JSON Syntax Error:", e.message);
}