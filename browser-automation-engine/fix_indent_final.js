const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

let idx1 = -1; // thenSteps for TaskCode
let idx2 = -1; // elseSteps for TaskCode
let idx3 = -1; // elseSteps for Regular/Overtime

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('condition:') && line.includes('!taskCodeState.disabled')) {
        if (lines[i + 1].includes('thenSteps:')) {
            idx1 = i + 1;
        }
    }

    if (line.includes('elseSteps:')) {
        // Check for Transaction Type DISABLED within 5 lines
        let isTaskCode = false;
        for (let j = 1; j < 5; j++) {
            if (lines[i + j] && lines[i + j].includes('Transaction Type is DISABLED')) {
                isTaskCode = true;
                break;
            }
        }
        if (isTaskCode) idx2 = i;

        // Check for OVERTIME ONLY within 5 lines
        let isOvertime = false;
        for (let j = 1; j < 5; j++) {
            if (lines[i + j] && lines[i + j].includes('OVERTIME ONLY')) {
                isOvertime = true;
                break;
            }
        }
        if (isOvertime) idx3 = i;
    }
}

console.log(`Indices: thenSteps=${idx1}, elseSteps1=${idx2}, elseSteps2=${idx3}`);

if (idx1 !== -1 && idx2 !== -1 && idx3 !== -1) {
    const newLines = [...lines];

    // 1. Indent Body (idx1+1 to idx2-1) by +2 spaces
    for (let i = idx1 + 1; i < idx2; i++) {
        if (newLines[i].trim().length > 0) {
            newLines[i] = '  ' + newLines[i];
        }
    }

    // 2. Indent Else1 (idx2 to idx3-1) by +4 spaces
    for (let i = idx2; i < idx3; i++) {
        if (newLines[i].trim().length > 0) {
            newLines[i] = '    ' + newLines[i];
        }
    }

    // 3. Dedent Else2 (idx3 to end of Overtime block) by -2 spaces
    // Overtime block ends at line 741 approx, but safely we can go until end of file
    // as long as we don't dedent top-level items.
    // The items inside Overtime block are indented deep. Top level items are at start.
    // We should only dedent lines that have enough spaces.

    // Let's deduce scan range.
    // The Overtime block is the last part of this loop.
    // Next item is "- action: log" (Selesai).
    let endOvertime = -1;
    for (let i = idx3 + 1; i < newLines.length; i++) {
        if (newLines[i].includes('action: log') && newLines[i].includes('Selesai memproses')) {
            endOvertime = i - 1;
            break;
        }
    }
    if (endOvertime === -1) endOvertime = newLines.length - 1;

    console.log(`Dedenting from ${idx3} to ${endOvertime}`);

    for (let i = idx3; i <= endOvertime; i++) {
        if (newLines[i].length > 2) {
            // Check if it starts with spaces
            if (newLines[i].startsWith('  ')) {
                newLines[i] = newLines[i].substring(2);
            }
        }
    }

    fs.writeFileSync(filePath, newLines.join('\n'));
    console.log('✅ Applied final indentation fixes');
} else {
    console.error('❌ Could not find all indices');
}
