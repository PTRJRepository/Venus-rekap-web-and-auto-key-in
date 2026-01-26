const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
// Also process partitioning templates if they exist/are relevant, but logs say loop is used.
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const startIndex = 680; // Start checking from here
const endIndex = 800;   // Check until here

let currentItemIndent = -1;

for (let i = startIndex; i < endIndex && i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;

    const indent = line.search(/\S/);

    if (line.trim().startsWith('-')) {
        currentItemIndent = indent;

        // Ensure this list item aligns with expected (44 spaces based on previous analysis)
        // If it's the `parseChargeJob` or siblings in `elseSteps`.
        // We know `parseChargeJob` (line 684) is at 44/45.
        // Let's enforce 45 (or whatever line 684 is).

        // Find line 684 dynamic index?
        // Assume lines are roughly where they were.
        // We just ensure consistency within the block.

    } else {
        // Body (params, keys)
        if (currentItemIndent !== -1) {
            // Must be > currentItemIndent.
            // Ideally currentItemIndent + 2.
            const expected = currentItemIndent + 2;
            if (indent < expected) {
                // Fix it
                lines[i] = ' '.repeat(expected) + line.trim();
            }
        }
    }
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed body indentation.');
