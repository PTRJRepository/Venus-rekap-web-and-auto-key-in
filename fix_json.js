const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'browser-automation-engine', 'templates', 'attendance-input-loop.json');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix: Part 4 Block
    // Current state:
    // ... },
    //     "action": "if",
    //     "params": { ... "hasChargeJobPart4" ...

    // We need to change:
    // "action": "if",
    // "params": {
    //     "condition": "hasChargeJobPart4",

    // To:
    // {
    //     "action": "if",
    //     "params": {
    //         "condition": "hasChargeJobPart4",

    // And ensure comma from previous block.

    // 1. Find the malformed Part 4 block
    const part4Condition = '"condition": "hasChargeJobPart4"';
    const indexPart4 = content.indexOf(part4Condition);

    if (indexPart4 === -1) {
        console.log("Could not find Part 4 block");
    } else {
        // Find the "action": "if" preceding this
        const actionIf = '"action": "if",';
        const indexAction = content.lastIndexOf(actionIf, indexPart4);

        if (indexAction !== -1) {
            // Check if it already has a brace
            const braceCheck = content.substring(indexAction - 50, indexAction);
            if (!braceCheck.trim().endsWith('{')) {
                console.log("Fixing Part 4 block...");
                // Insert '{' before "action": "if"
                // And ensure previous non-whitespace char is ',' or we add one.

                // Go backwards from indexAction to find non-whitespace
                let ptr = indexAction - 1;
                while (ptr > 0 && /\s/.test(content[ptr])) ptr--;

                const prevChar = content[ptr];
                let prefix = "";
                if (prevChar === '}') {
                    prefix = ",";
                }

                // Construct replacement
                // We just insert the prefix + brace at indexAction
                // We need to match indentation?
                // The current indentation of "action" is likely correct for the Property, but we need the Brace to be indented less.
                // "action" is at `indexAction`.
                // We want:
                // ... },
                // {
                //    "action": ...

                // We will simply insert `, {` before the "action" string, letting JSON parser handle whitespace (we can prettify later or rely on loose parsing).
                // Actually to keep it valid JSON, we just need `{`

                content = content.substring(0, indexAction) + "{" + content.substring(indexAction);

                // Now we need to add comma to previous block if missing
                // The `ptr` calculation above was based on OLD content.
                // If we inserted `{`, the previous char is now further back relative to the NEW `action` index, but equivalent absolute position in valid string.

                if (prevChar === '}') {
                    // Insert comma after the }
                    content = content.substring(0, ptr + 1) + "," + content.substring(ptr + 1);
                }
            }
        }
    }

    // Fix: Part 5 Block
    const part5Condition = '"condition": "hasChargeJobPart5"';
    const indexPart5 = content.indexOf(part5Condition);

    if (indexPart5 !== -1) {
        // Find the "action": "if" preceding this
        const actionIf = '"action": "if",';
        const indexAction = content.lastIndexOf(actionIf, indexPart5);

        // This "action": "if" is distinct from the Part 4 one because search starts from Part 5 condition and goes back

        if (indexAction !== -1) {
            const braceCheck = content.substring(indexAction - 50, indexAction);
            // Verify it's not the Part 4 one (check distance)
            if (indexPart5 - indexAction < 500) {
                if (!braceCheck.trim().endsWith('{')) {
                    console.log("Fixing Part 5 block...");
                    // Similar logic
                    let ptr = indexAction - 1;
                    while (ptr > 0 && /\s/.test(content[ptr])) ptr--;

                    const prevChar = content[ptr];
                    if (prevChar === '}') {
                        // Insert comma
                        content = content.substring(0, ptr + 1) + "," + content.substring(ptr + 1);
                        // Adjust indexAction because we added a char
                        // indexAction++ 
                    }

                    // Insert '{'
                    // Re-calculate indexAction because content changed?
                    // Yes.

                    // Let's reload content indices to be safe or do replacements in one pass or separate passes?
                    // Easier to just re-find.
                }
            }
        }
    }

    // Actually, simpler approach:
    // Replace `\n\s+"action": "if",\n\s+"params": {\n\s+"condition": "hasChargeJobPart4"`
    // With `\n\s+{\n\s+"action": "if",\n\s+"params": {\n\s+"condition": "hasChargeJobPart4"`
    // And ensure comma before it.

    // Let's just use string replace with regex?
    // Regex might be tricky with multiline.

    // Let's use the manual splice approach but do Part 5 first (later in file) then Part 4 to avoid index shifts affecting subsequent operations.

} catch (err) {
    console.error(err);
}

// Rewriting for robustness:
// We will read, split by lines, iterate and fix.
try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    let newLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for Part 4 start
        if (line.includes('"condition": "hasChargeJobPart4"')) {
            // The previous lines should be "params": { and "action": "if"
            // We need to find the line with "action": "if"
            // It should be i-2 roughly.

            let actionLineIdx = -1;
            for (let j = i; j >= i - 5; j--) {
                if (lines[j] && lines[j].includes('"action": "if",')) {
                    actionLineIdx = j;
                    break;
                }
            }

            if (actionLineIdx !== -1) {
                // Check if line before actionLineIdx has {
                // Or if actionLineIdx line starts with {
                if (!lines[actionLineIdx].trim().startsWith('{')) {
                    console.log("Fixing Part 4 missing opening brace...");
                    // Add { to start of line, preserving indentation?
                    // "                                            "action": "if","
                    // -> "                                            {"
                    // -> "                                                "action": "if","
                    // Correct: we need to wrap.

                    // Add "{" line before actionLineIdx
                    // And check previous line for comma.

                    // Indentation: take from action line
                    const indent = lines[actionLineIdx].match(/^\s*/)[0];
                    newLines.splice(newLines.length - (i - actionLineIdx), 0, `${indent}{`); // Insert {

                    // Check checking line before the inserted {
                    let prevLineIdx = newLines.length - (i - actionLineIdx) - 1;
                    // prevLineIdx is the index in newLines of the line BEFORE the new {

                    // Scan back in newLines for non-empty line
                    while (prevLineIdx >= 0 && newLines[prevLineIdx].trim() === '') {
                        prevLineIdx--;
                    }

                    if (prevLineIdx >= 0) {
                        if (newLines[prevLineIdx].trim().endsWith('}') || newLines[prevLineIdx].trim().endsWith(']')) {
                            if (!newLines[prevLineIdx].trim().endsWith(',')) {
                                console.log("Adding missing comma before Part 4...");
                                newLines[prevLineIdx] += ",";
                            }
                        }
                    }
                }
            }
        }

        // Similar for Part 5
        if (line.includes('"condition": "hasChargeJobPart5"')) {
            let actionLineIdx = -1;
            for (let j = i; j >= i - 5; j--) {
                if (lines[j] && lines[j].includes('"action": "if",')) {
                    actionLineIdx = j;
                    break;
                }
            }

            if (actionLineIdx !== -1) {
                // But wait, since we push to newLines, we can't easily reference 'lines' indices for 'newLines' edits unless we process sequential.
                // This logic is flawed if we modifying 'newLines' out of sync with 'i'.

                // Better: Process 'lines' and push to 'newLines', modifying current line or peeking back at 'newLines'.
            }
        }
        newLines.push(line);
    }

    // Let's try a regex replace on the WHOLE content. It is safer.

    content = fs.readFileSync(filePath, 'utf8');

    // Fix Part 4
    // Find:
    // ... "action": "if",\s+"params": {\s+"condition": "hasChargeJobPart4"
    // Replace with:
    // ... { "action": ...

    // Regex: /(^\s*)"action": "if",(\s+"params":\s+\{\s+"condition": "hasChargeJobPart4")/m
    // We need to capture the indentation.

    const regex4 = /([ \t]*)"action": "if",(\r?\n[ \t]*"params":\s+\{\r?\n[ \t]*"condition": "hasChargeJobPart4")/g;

    if (regex4.test(content)) {
        console.log("Applying Regex Fix for Part 4");
        content = content.replace(regex4, (match, indent, rest) => {
            // Find preceding char to see if comma needed
            // This is hard in replace callback without index.
            // Using replace with callback gives offset.
            return `${indent}{
${indent}    "action": "if",${rest}`;
        });
    }

    // Regex for Part 5
    const regex5 = /([ \t]*)"action": "if",(\r?\n[ \t]*"params":\s+\{\r?\n[ \t]*"condition": "hasChargeJobPart5")/g;
    if (regex5.test(content)) {
        console.log("Applying Regex Fix for Part 5");
        content = content.replace(regex5, (match, indent, rest) => {
            return `${indent}{
${indent}    "action": "if",${rest}`;
        });
    }

    // Now fix missing commas.
    // Look for } followed by whitespace then {
    // Regex: /\}(\s*)\{/g
    // Replace with: },$1{

    const commaRegex = /\}([ \t\r\n]*)\{/g;
    // We need to be careful not to break legitimate json.
    // In objects: "key": { ... } NO
    // In arrays: { ... }, { ... } YES
    // Our case is array of steps.
    // So } followed by { is ALMOST ALWAYS missing comma in this file structure.

    let commasAdded = 0;
    content = content.replace(commaRegex, (match) => {
        commasAdded++;
        return `},${match.substring(1)}`;
    });
    console.log(`Added ${commasAdded} missing commas.`);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log("✅ Fix applied.");

} catch (e) {
    console.error(e);
}
