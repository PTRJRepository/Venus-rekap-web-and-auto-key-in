const fs = require('fs');
const data = JSON.parse(fs.readFileSync('templates/_attendance_logic.json', 'utf8'));

function analyzeStructure(steps, path = 'root', depth = 0) {
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const currentPath = `${path}[${i}]`;
        const indent = '  '.repeat(depth);

        if (step.action === 'if') {
            const cond = step.params?.condition?.substring(0, 50) || 'unknown';
            const thenLen = step.params?.thenSteps?.length || 0;
            const elseLen = step.params?.elseSteps?.length || 0;

            console.log(`${indent}${currentPath}: IF "${cond}" (then:${thenLen}, else:${elseLen})`);

            // Specifically look for our target condition
            if (step.params?.condition === '!attendance.canProcessOvertime') {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`FOUND TARGET: !attendance.canProcessOvertime`);
                console.log(`elseSteps length: ${elseLen}`);
                if (step.params.elseSteps) {
                    step.params.elseSteps.forEach((e, j) => {
                        console.log(`  elseSteps[${j}]: ${e.action || 'unknown'}`);
                        if (e.action === 'if') {
                            console.log(`    condition: ${e.params?.condition}`);
                        }
                    });
                }
                console.log(`${'='.repeat(60)}\n`);
            }

            if (step.params?.thenSteps) {
                analyzeStructure(step.params.thenSteps, `${currentPath}.then`, depth + 1);
            }
            if (step.params?.elseSteps) {
                analyzeStructure(step.params.elseSteps, `${currentPath}.else`, depth + 1);
            }
        } else if (step.action === 'forEachProperty' || step.action === 'forEach') {
            console.log(`${indent}${currentPath}: ${step.action}`);
            if (step.params?.steps) {
                analyzeStructure(step.params.steps, `${currentPath}.steps`, depth + 1);
            }
        } else if (step.action === 'formatDate') {
            console.log(`${indent}${currentPath}: formatDate (saveTo: ${step.params?.saveTo})`);
        } else if (step.action === 'typeInput') {
            console.log(`${indent}${currentPath}: typeInput (selector: ${step.params?.selector?.substring(0, 30)})`);
        }
    }
}

analyzeStructure(data.steps);
