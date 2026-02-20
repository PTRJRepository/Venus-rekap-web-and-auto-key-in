const fs = require('fs');
const path = 'browser-automation-engine/templates/_attendance_logic.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

// Find the forEach step
const forEachStep = data.steps.find(s => s.action === 'forEach');
// Find the forEachProperty step inside it
const logicStep = forEachStep.params.steps.find(s => s.action === 'forEachProperty');

const newTemplate = {
    name: "Attendance Logic Sub-Routine",
    description: "Extracted logic for attendance input loop",
    steps: [logicStep]
};

fs.writeFileSync(path, JSON.stringify(newTemplate, null, 4));
console.log("✅ Extracted logic to " + path);
