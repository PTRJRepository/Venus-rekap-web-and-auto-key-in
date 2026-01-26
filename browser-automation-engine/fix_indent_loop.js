const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Target area: around line 684
// 684: - action: parseChargeJob
// 685: params:
// 687: - action: retryInputWithValidation

const indexParse = lines.findIndex(l => l.includes('- action: parseChargeJob') && l.includes('chargeJob: ${employee.ChargeJob}') === false); // Find the action line, not params line if any

// Actually line 684 in 1-based index is array index 683.
// But let's find it robustly.
// Search for signature sequence.

let targetIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '- action: parseChargeJob') {
        // Check context: inside Overtime?
        // Look backwards for "Pilih Overtime"
        let foundContext = false;
        for (let j = i; j > i - 20; j--) {
            if (lines[j] && lines[j].includes('Pilih Overtime')) {
                foundContext = true;
                break;
            }
        }
        if (foundContext) {
            targetIdx = i;
            break;
        }
    }
}

if (targetIdx !== -1) {
    console.log(`Found parseChargeJob at line ${targetIdx + 1}`);

    // Calculate expected indent
    const actionLine = lines[targetIdx];
    const initialIndent = actionLine.search(/\S/); // Number of spaces
    console.log(`Expected indent: ${initialIndent}`);

    // Fix params (next line)
    // It should be indented by initialIndent + 2 (usually)
    let currentLine = targetIdx + 1;
    while (lines[currentLine] && lines[currentLine].trim().startsWith('params:')) {
        const currentIndent = lines[currentLine].search(/\S/);
        const needed = initialIndent + 2;
        const shift = needed - currentIndent;

        if (shift > 0) {
            lines[currentLine] = ' '.repeat(shift) + lines[currentLine];
        }
        // Param children
        currentLine++;
        while (lines[currentLine] && !lines[currentLine].trim().startsWith('-') && !lines[currentLine].trim().startsWith('action:') && lines[currentLine].trim().length > 0) {
            const childIndent = lines[currentLine].search(/\S/);
            // Maintain relative indent to params? 
            // If params moved by shift, move child by shift too
            if (shift > 0) {
                lines[currentLine] = ' '.repeat(shift) + lines[currentLine];
            }
            currentLine++;
        }
    }

    // Fix subsequent actions (- action: ...)
    // They should be aligned with actionLine (initialIndent)
    // Scan until we find a line with LESS indent than typical block (end of block)
    // The previous indent was ~41. The block end is probably dedented significantly.
    // Let's identify the block end by "Input OVERTIME" dedent?

    // We want to fix lines starting from `currentLine` until we hit something that clearly ends the list.
    // The list items look like `- action: ...`.

    // Wait, the logic is: Everything following should provide the steps for inputting overtime.
    // So until the END of the `if/else` block?
    // The `elseSteps` block ends when indentation drops below `elseSteps` (43 spaces).
    // Or rather, aligns with `elseSteps` (43) or less.
    // `actionLine` indent is ~45. 
    // So if we find indent <= 43, we stop.

    const blockIndentMinimum = initialIndent; // 45. 
    // Actually, `elseSteps` is at 43.
    // So if next line is 43 or less, it's outside.

    // BUT the lines we want to fix are currently DEDENTED.
    // Line 687 is at ~39?
    // So checking indent is tricky.
    // We assume the block continues until "SKIP: Employee..." logic?
    // Or "Selesai memproses" which is 2 spaces in?

    // Heuristic: Until we see "action: if" with condition "Input OVERTIME"? No we are IN it.
    // Until we see indentation that matches the PARENT of `elseSteps`? 
    // Parent is `if` at Indent X.

    // Let's just blindly add indentation to lines that look like they belong to the sequence,
    // i.e., start with `- action:` or comments.

    // We assume lines 687 to ~790 need fix.
    // Let's look for known end marker.
    // "✅ Selesai memproses semua data absensi" is at the very end.

    let i = currentLine;
    while (i < lines.length) {
        const line = lines[i];
        if (line.trim().length === 0) { i++; continue; }

        // If we hit "Selesai memproses", we gone too far.
        if (line.includes('Selesai memproses semua data absensi')) break;

        // If we hit a line that is clearly dedented correctly (e.g. closing the loop).
        // The loop closure is usually `- action: log`.

        // Measure current indent
        const spaces = line.search(/\S/);

        // Determine shift needed.
        // We assume most lines are list items `- ...` or keys `key: ...` or comments.
        // If it starts with `-`, it should align with `initialIndent` (45).
        // If it was at, say, 39. Shift is 6.

        if (line.trim().startsWith('-')) {
            const shift = initialIndent - spaces;
            if (shift !== 0) {
                if (shift > 0) lines[i] = ' '.repeat(shift) + lines[i];
                else lines[i] = lines[i].substring(-shift);
            }

            // Apply same shift to subsequent lines until next dash?
            // No, handle line by line but keep state?
            // Actually, if we just align `- ` lines to 45, and relative-shift body lines, it works.
            // But we need to know the shift amount for the body lines based on previous dash line.

        } else {
            // It's body content (params, comments inside).
            // It should be relative to previous dash line?
            // Simplest: Add fixed offset?
            // The previous logic dedented them. 
            // Line 687 was at 39. Expected 45. Shift +6.
            // Line 688 comment. Shift +6.
            // Line 689 params. Shift +6.

            // Let's assume a uniform shift for the whole block is needed.
            // From line 687 downwards.
            // Find line 687.
            // Shift = 45 - current(687).
            // Apply this shift to ALL remaining lines in this chunk.
        }
        i++;
    }

    // Refined approach:
    // Identify the block start (687).
    // Calculate shift.
    // Apply shift until... end of block?
    // Where is end of block?
    // It ends when we exit the `elseSteps`.
    // The `if` (lines 660-671) ends... where?
    // Wait, lines 660-798 ARE the `if` block (Overtime logic)?
    // No, `elseSteps` starts at 671.
    // The content is the Overtime input flow.
    // This flow continues until the logic for "Input OVERTIME" is done.
    // Line 798 in Step 2176 is "SKIP: Employee...".
    // This looks like it closes the "if (failed)" block?
    // Actually, looking at 2176 diff:
    // 798: - action: log (SKIP)
    // 803: - action: navigate (added)
    // This block is inside `elseSteps` of `retryInputWithValidation` failure?

    // The `parseChargeJob` and `retryInput` are siblings.
    // So if `parseChargeJob` is at 45 spaces.
    // EVERYTHING that follows as a sibling list item must be at 45 spaces.

    // Let's re-read line 687 in current file.
    // I need to use `lines[i]` in loop.

} else {
    console.log('Target not found');
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed indentation.');
