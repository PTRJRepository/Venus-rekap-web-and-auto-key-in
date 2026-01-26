const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

let indentRegular = -1;
let idxRegular = -1;
let indentOvertime = -1;
let idxOvertime = -1;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find Regular block start (comment)
    if (line.includes('comment:') && line.includes('Input REGULAR jika hadir')) {
        // The action: if follows
        if (lines[i + 1].includes('action: if')) {
            idxRegular = i + 1;
            indentRegular = lines[i + 1].search(/\S/);
        }
    }

    // Find Overtime block start (comment)
    // Note: Use text matching allowing for variations if needed, but 'Input OVERTIME jika ada' is key
    if (line.includes('comment:') && line.includes('Input OVERTIME jika ada')) {
        // The action: if follows
        if (lines[i + 1].includes('action: if')) {
            idxOvertime = i + 1;
            indentOvertime = lines[i + 1].search(/\S/);
        }
    }
}

if (indentRegular !== -1 && indentOvertime !== -1) {
    const diff = indentRegular - indentOvertime;
    console.log(`Regular indent: ${indentRegular}, Overtime indent: ${indentOvertime}, Diff: ${diff}`);

    if (diff !== 0) {
        // Adjust indentation for Overtime block (idxOvertime-1 to end of file/loop)
        // Start from the comment (idxOvertime - 1)
        const startFix = idxOvertime - 1;

        // Find end of loop - "Selesai memproses"
        let endFix = lines.length - 1;
        for (let i = startFix; i < lines.length; i++) {
            if (lines[i].includes('Selesai memproses')) {
                endFix = i - 1;
                break;
            }
        }

        const newLines = [...lines];

        for (let i = startFix; i <= endFix; i++) {
            if (newLines[i].trim().length > 0) {
                if (diff > 0) {
                    newLines[i] = ' '.repeat(diff) + newLines[i];
                } else {
                    // Dedent - match pattern? Or substring?
                    // Safe to substring if starts with enough spaces
                    const spacesToRemove = -diff;
                    if (newLines[i].search(/\S/) >= spacesToRemove) {
                        newLines[i] = newLines[i].substring(spacesToRemove);
                    }
                }
            }
        }

        fs.writeFileSync(filePath, newLines.join('\n'));
        console.log('✅ Aligned Overtime block');
    } else {
        console.log('✅ Blocks already aligned');
    }
} else {
    console.error('❌ Could not find blocks', { indentRegular, indentOvertime });
}
