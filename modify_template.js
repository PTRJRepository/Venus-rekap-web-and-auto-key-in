const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, 'browser-automation-engine', 'templates', 'attendance-input-loop.json');
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

let matchCount = 0;

function traverseSteps(steps) {
    if (!steps || !Array.isArray(steps)) return;

    for (let i = 0; i < steps.length - 1; i++) {
        const step = steps[i];

        // Recursively check nested steps (e.g., in forEach, if, etc.)
        if (step.params && step.params.steps) traverseSteps(step.params.steps);
        if (step.params && step.params.thenSteps) traverseSteps(step.params.thenSteps);
        if (step.params && step.params.elseSteps) traverseSteps(step.params.elseSteps);

        // Check for Date Input followed by Enter followed by Wait
        // Looking for sequence: typeInput (date) -> ... -> pressKey(Enter) -> wait(500)

        // Heuristic: If step is pressKey Enter, check next step
        if (step.action === 'pressKey' && step.params && step.params.key === 'Enter') {
            const nextStep = steps[i + 1];
            if (nextStep && nextStep.action === 'wait' && nextStep.params && nextStep.params.duration === 500) {
                // Check if this context is related to date input?
                // We can look backwards a few steps to see if #MainContent_txtTrxDate was typed?
                // Or just blindly upgrade 500ms -> 5000ms after Enter because 500ms is generally too short for postbacks?

                // Let's check backwards for context if possible, or just apply broadly since 500ms after Enter is suspiciously short for Millware

                let foundContext = false;
                // Look back up to 5 steps
                for (let j = i; j >= Math.max(0, i - 5); j--) {
                    if (steps[j].action === 'typeInput' && steps[j].params && steps[j].params.selector === '#MainContent_txtTrxDate') {
                        foundContext = true;
                        break;
                    }
                }

                if (foundContext) {
                    console.log(`Found Date Input Wait at index ${i + 1}. Upgrading to 5000ms.`);
                    nextStep.params.duration = 5000;
                    nextStep.params.comment = "Wait for ASP.NET postback (Auto-fix)";
                    matchCount++;
                }
            }
        }
    }
}

traverseSteps(template.steps);

console.log(`Updated ${matchCount} wait steps.`);
fs.writeFileSync(templatePath, JSON.stringify(template, null, 4));
