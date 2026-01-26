const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

let startBody = -1;
let startElse = -1;
let endElse = -1;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find 'condition: !taskCodeState.disabled'
    if (line.includes('condition:') && line.includes('!taskCodeState.disabled')) {
        // checks next line is thenSteps
        if (lines[i + 1].includes('thenSteps:')) {
            startBody = i + 2;
        }
    }

    // Find 'elseSteps' for Task Code check
    if (startBody !== -1 && startElse === -1 && line.includes('elseSteps:')) {
        // Verify this is the right elseSteps by checking next lines
        // Should contain 'SKIPPING: Transaction Type is DISABLED'
        let isTaskCodeElse = false;
        for (let j = 1; j < 5; j++) {
            if (lines[i + j] && lines[i + j].includes('Transaction Type is DISABLED')) {
                isTaskCodeElse = true;
                break;
            }
        }

        if (isTaskCodeElse) {
            startElse = i;
        }
    }

    // Find 'elseSteps' for Regular Input (end of block)
    if (startElse !== -1 && endElse === -1 && line.includes('elseSteps:')) {
        // Verify this is Regular Input else
        // Should contain 'employee input failed'
        let isRegularElse = false;
        for (let j = 1; j < 5; j++) {
            if (lines[i + j] && lines[i + j].includes('employee input failed')) {
                isRegularElse = true;
                break;
            }
        }

        if (isRegularElse) {
            endElse = i - 1; // End before this line
        }
    }
}

if (startBody !== -1 && startElse !== -1 && endElse !== -1) {
    console.log(`Found ranges: Body=[${startBody}, ${startElse - 1}], Else=[${startElse}, ${endElse}]`);

    const newLines = [...lines];

    // Indent Body by 4 spaces
    for (let i = startBody; i < startElse; i++) {
        if (newLines[i].trim().length > 0) {
            newLines[i] = '    ' + newLines[i];
        }
    }

    // Indent Else by 2 spaces
    for (let i = startElse; i <= endElse; i++) {
        if (newLines[i].trim().length > 0) {
            newLines[i] = '  ' + newLines[i];
        }
    }

    fs.writeFileSync(filePath, newLines.join('\n'));
    console.log('✅ Applied indentation fixes');
} else {
    console.error('❌ Could not find reliable ranges');
    console.log(`startBody: ${startBody}, startElse: ${startElse}, endElse: ${endElse}`);
}
