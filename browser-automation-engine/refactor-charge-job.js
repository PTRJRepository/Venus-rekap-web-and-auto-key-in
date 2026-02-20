/**
 * Script untuk refactoring charge job section di _attendance_logic_v2.json
 * Mengganti charge job steps dengan include ke _charge_job_full.json
 */

const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, 'templates', '_attendance_logic_v2.json');
const outputPath = path.join(__dirname, 'templates', '_attendance_logic_v2.json');

console.log('═══════════════════════════════════════════════════');
console.log('  REFACTOR CHARGE JOB SECTION');
console.log('═══════════════════════════════════════════════════\n');

// Read template
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

// Function to replace charge job steps with include
function replaceChargeJobSteps(steps) {
    let replacedCount = 0;

    function processStep(step) {
        // Check if this is a parseChargeJob action
        if (step.action === 'parseChargeJob') {
            // Found the start of charge job section
            return { action: 'include_marker', replace: true };
        }

        // Check if this is one of the charge job input steps
        if (step.comment && step.comment.includes('PART 1: Task Code')) {
            return { action: 'include_marker', replace: true };
        }
        if (step.comment && step.comment.includes('PART 2: Station Code')) {
            return { action: 'include_marker', replace: true };
        }
        if (step.comment && step.comment.includes('PART 3: Machine Code')) {
            return { action: 'include_marker', replace: true };
        }
        if (step.comment && step.comment.includes('PART 4: Expense Code')) {
            return { action: 'include_marker', replace: true };
        }
        if (step.comment && step.comment.includes('PART 5: Additional Code')) {
            return { action: 'include_marker', replace: true };
        }

        // Process nested steps
        if (step.thenSteps) {
            step.thenSteps = processSteps(step.thenSteps);
        }
        if (step.elseSteps) {
            step.elseSteps = processSteps(step.elseSteps);
        }
        if (step.params && step.params.steps) {
            step.params.steps = processSteps(step.params.steps);
        }

        return step;
    }

    function processSteps(steps) {
        const newSteps = [];
        let i = 0;

        while (i < steps.length) {
            const step = steps[i];

            // Check if this step is parseChargeJob or has charge job comment
            if (step.action === 'parseChargeJob' ||
                (step.comment && step.comment.includes('PART ') && step.comment.includes('Code'))) {

                // Found charge job section - replace with include
                newSteps.push({
                    "action": "include",
                    "params": {
                        "template": "_charge_job_full"
                    },
                    "comment": "═══ CHARGE JOB INPUT (extracted to _charge_job_full.json) ═══"
                });

                // Skip all charge job related steps
                let skipped = 0;
                while (i + skipped < steps.length) {
                    const nextStep = steps[i + skipped];
                    if (!nextStep) break;

                    // Stop skipping when we hit a non-charge-job step
                    const isChargeJobStep =
                        nextStep.action === 'parseChargeJob' ||
                        nextStep.action === 'retryInputWithValidation' ||
                        nextStep.action === 'if' && nextStep.comment?.includes('PART') ||
                        nextStep.action === 'wait' && nextStep.comment?.includes('PART') ||
                        (nextStep.comment && (
                            nextStep.comment.includes('PART 1:') ||
                            nextStep.comment.includes('PART 2:') ||
                            nextStep.comment.includes('PART 3:') ||
                            nextStep.comment.includes('PART 4:') ||
                            nextStep.comment.includes('PART 5:')
                        )) ||
                        (nextStep.action === 'wait' && i + skipped + 1 < steps.length &&
                         steps[i + skipped + 1].comment?.includes('PART'));

                    if (!isChargeJobStep) break;

                    skipped++;
                }

                i += skipped;
                replacedCount++;
            } else {
                // Process nested steps
                const processedStep = processStep(step);
                newSteps.push(processedStep);
                i++;
            }
        }

        return newSteps;
    }

    return { steps: processSteps(steps), replacedCount };
}

// Process the template
console.log('Processing template...');
const result = replaceChargeJobSteps(template.steps);
template.steps = result.steps;

console.log(`✅ Replaced ${result.replacedCount} charge job sections`);

// Write back
fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
console.log(`✅ Saved to: ${path.basename(outputPath)}`);

console.log('\n═══════════════════════════════════════════════════');
console.log('  NEXT: Check _attendance_logic_v2.json');
console.log('  Run: node index.js attendance-input-loop-v2');
console.log('═══════════════════════════════════════════════════\n');
