/**
 * Script untuk menganalisis dan memberikan panduan refactor manual
 * Ini lebih aman daripada replace otomatis yang mungkin salah
 */

const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, 'templates', '_attendance_logic.json');

console.log('═══════════════════════════════════════════════════');
console.log('  ANALISIS STRUKTUR TEMPLATE');
console.log('═══════════════════════════════════════════════════\n');

const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

// Find all charge job sections
function findChargeJobSections(steps, depth = 0) {
    const sections = [];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // Find parseChargeJob action
        if (step.action === 'parseChargeJob') {
            // Found start of charge job section
            let end = i + 1;
            let foundEnd = false;

            // Find the end (after PART 5)
            while (end < steps.length && !foundEnd) {
                const nextStep = steps[end];
                if (nextStep.comment && nextStep.comment.includes('PART 5')) {
                    // Found PART 5, now find the end of this if block
                    if (nextStep.action === 'if') {
                        end += 2; // Skip the if and its thenSteps
                    }
                    foundEnd = true;
                } else if (
                    nextStep.action === 'log' &&
                    nextStep.params?.message?.includes('Skipping Hour Input')
                ) {
                    // Found the log after charge job section
                    foundEnd = true;
                } else if (
                    nextStep.action === 'typeInput' &&
                    nextStep.params?.selector === '#MainContent_txtHours'
                ) {
                    // Found the hour input after charge job section
                    foundEnd = true;
                } else {
                    end++;
                }
            }

            // Try to find a better end marker
            end = i;
            let braceCount = 0;
            let foundHourInput = false;

            while (end < steps.length) {
                const nextStep = steps[end];

                // Count braces to find the end of PART 5 if block
                if (nextStep.action === 'if' && nextStep.comment?.includes('PART 5')) {
                    braceCount = 1;
                    end++;
                    while (end < steps.length && braceCount > 0) {
                        if (steps[end].action === 'if') braceCount++;
                        // Count closing braces implicitly by structure
                        end++;
                    }
                }

                // Stop at hour input (this comes after charge job)
                if (nextStep.action === 'typeInput' &&
                    nextStep.params?.selector?.includes('txtHours')) {
                    foundHourInput = true;
                    break;
                }

                // Stop at log about skipping hour input
                if (nextStep.action === 'log' &&
                    nextStep.params?.message?.includes('Skipping Hour Input')) {
                    break;
                }

                // Safety limit
                if (end - i > 20) {
                    break;
                }

                end++;
            }

            sections.push({
                startIndex: i,
                endIndex: end,
                depth: depth,
                parentInfo: getParentInfo(depth)
            });
        }

        // Check nested steps
        if (step.thenSteps) {
            sections.push(...findChargeJobSections(step.thenSteps, depth + 1));
        }
        if (step.elseSteps) {
            sections.push(...findChargeJobSections(step.elseSteps, depth + 1));
        }
    }

    return sections;
}

function getParentInfo(depth) {
    const parents = ['Root', 'thenSteps', 'elseSteps'];
    return parents[depth] || `Level ${depth}`;
}

const sections = findChargeJobSections(template.steps);

console.log(`Found ${sections.length} charge job sections:\n`);

sections.forEach((section, index) => {
    console.log(`Section ${index + 1}:`);
    console.log(`  Location: ${section.parentInfo}`);
    console.log(`  Start: Step ${section.startIndex + 1}`);
    console.log(`  End: Step ${section.endIndex + 1}`);
    console.log(`  Steps to replace: ${section.endIndex - section.startIndex}`);
    console.log();
});

// Give manual replacement instructions
console.log('═══════════════════════════════════════════════════');
console.log('  INSTRUKSI REPLACEMENT MANUAL');
console.log('═══════════════════════════════════════════════════\n');
console.log('Untuk setiap section di atas:');
console.log('1. Buka _attendance_logic.json');
console.log('2. Cari step dengan action "parseChargeJob"');
console.log('3. Ganti dari parseChargeJob sampai akhir PART 5 dengan:');
console.log('');
console.log('   {');
console.log('     "action": "include",');
console.log('     "params": { "template": "_charge_job_full" }');
console.log('   }');
console.log('');
console.log('═══════════════════════════════════════════════════\n');
