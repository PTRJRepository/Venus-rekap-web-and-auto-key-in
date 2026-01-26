const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Anchor: parseChargeJob (Line ~684)
let anchorIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('- action: parseChargeJob') && !lines[i].includes('chargeJob:')) {
        // Verify context
        let context = false;
        for (let j = i; j > i - 20; j--) {
            if (lines[j] && lines[j].includes('Pilih Overtime')) {
                context = true;
                break;
            }
        }
        if (context) {
            anchorIdx = i;
            break;
        }
    }
}

if (anchorIdx !== -1) {
    const anchorIndent = lines[anchorIdx].search(/\S/);
    console.log(`Anchor (parseChargeJob) at ${anchorIdx + 1}, indent: ${anchorIndent}`);

    // Fix params of parseChargeJob (next line)
    // It is likely dedented. It should be anchorIndent + 2.
    // We fix it individually.
    let currentIdx = anchorIdx + 1;
    while (lines[currentIdx] && lines[currentIdx].trim().startsWith('params:')) {
        const curIndent = lines[currentIdx].search(/\S/);
        const desired = anchorIndent + 2;
        const shift = desired - curIndent;
        if (shift !== 0) {
            lines[currentIdx] = ' '.repeat(desired) + lines[currentIdx].trim();
            // And its children? `chargeJob: ...` is inline usually?
            // Line 686: `chargeJob: ...`
            // If params was dedented, chargeJob (child) was likely dedented too.
            // We should apply shift to children too.

            // Check next line
            let childIdx = currentIdx + 1;
            if (lines[childIdx] && !lines[childIdx].trim().startsWith('-')) {
                // Align child relative to params
                const childIndent = lines[childIdx].search(/\S/);
                // If child indent < desired + 2?
                // Just assume relative shift.
                const childShift = shift;
                if (lines[childIdx].trim().length > 0) {
                    const newIndent = childIndent + childShift;
                    lines[childIdx] = ' '.repeat(newIndent) + lines[childIdx].trim();
                }
            }
        }
        currentIdx += 2; // params + child
    }

    // Now fix subsequent actions (retryInputWithValidation onwards)
    // The first one is at currentIdx (approx 687).
    // Identify it.
    let blockStartIdx = -1;
    for (let k = currentIdx; k < currentIdx + 5; k++) {
        if (lines[k].trim().startsWith('- action: retryInputWithValidation')) {
            blockStartIdx = k;
            break;
        }
    }

    if (blockStartIdx !== -1) {
        const currentIndent = lines[blockStartIdx].search(/\S/);
        const desired = anchorIndent; // Should match sibling
        const shift = desired - currentIndent;

        console.log(`Block start at ${blockStartIdx + 1}. Current: ${currentIndent}, Desired: ${desired}, Shift: ${shift}`);

        if (shift !== 0) {
            // Apply shift to lines until end of block.
            // Loop until "Selesai memproses" or significant dedent.

            for (let i = blockStartIdx; i < lines.length; i++) {
                if (lines[i].includes('Selesai memproses semua data absensi')) break;
                if (lines[i].trim().length === 0) continue;

                // Safety check: if indentation becomes surprisingly small?
                // Example: the closing of the `if` block?
                // `elseSteps` at 43. `if` at 43.
                // If we see line indented <= 43, we might be exiting the block.
                // BUT `retryInput` lines are CURRENTLY at 39.
                // So checking `currentIndent` is tricky before fixing.
                // We trust "Selesai memproses" is strict barrier.

                const oldIndent = lines[i].search(/\S/);
                const newIndent = oldIndent + shift;
                lines[i] = ' '.repeat(newIndent) + lines[i].trim();
            }
            console.log('Applied block shift.');
        } else {
            console.log('No shift needed?');
        }
    } else {
        console.log('Could not find retryInputWithValidation block start.');
    }

    fs.writeFileSync(filePath, lines.join('\n'));
    console.log('Success.');
} else {
    console.log('Anchor not found.');
}
