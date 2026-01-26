const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const startIndex = 680;
const endIndex = 800; // Constrain to the damaged area

for (let i = startIndex; i < endIndex && i < lines.length; i++) {
    const line = lines[i];
    const trim = line.trim();

    if (trim === 'thenSteps:' || trim === 'elseSteps:') {
        const parentIndent = line.search(/\S/);
        const desiredIndent = parentIndent + 2;

        // Scan subsequent lines until... what?
        // Until indentation matches parent?
        // Or until we see something that clearly terminates the block?
        // YAML is tricky. 
        // But in this file, nested blocks are usually list items `- action:`.
        // My previous script forced them to L0 (44).
        // So checking "indent < desired" is good. 44 < 50.
        // We stop if we hit something that is clearly NOT part of the block?
        // E.g. another `- action` at L0?
        // But we rely on the fact that these WERE supposed to be nested.

        let j = i + 1;
        while (j < lines.length) {
            const childLine = lines[j];
            if (childLine.trim().length === 0) { j++; continue; }

            // Heuristic: If we hit a line that is indented LESS than 44 (L0), we definitely stop.
            // But everything is at 44 now.
            // So we need to look for SEMANTICS.
            // The logic: 
            // `if` block (L0).
            // `params` (L1).
            // `thenSteps` (L2).
            // Children (L3).
            // The block ends when we return to L0?
            // BUT the children are currently AT L0 (due to bug).
            // So indentation doesn't help.

            // We assume that immediately following `thenSteps:` is the block content.
            // The content is a list of actions.
            // How many?
            // Usually 1 or 2.
            // Until we see an action that makes sense to be OUTSIDE?
            // In this file:
            // 720: retryInput. (Inside).
            // 736: wait (Sibling of retryInput inside `thenSteps`?).
            // 739: pressKey (Sibling).
            // 742: - comment (Sibling? No, `if` starts here).
            // Wait, 742 is `- comment: ... Input Part 3 ...`.
            // This is the NEXT action at L0.
            // So lines 720-741 are inside `thenSteps` of Part 2.

            // So we shift lines UNTIL we hit the next `- comment`.

            if (childLine.trim().startsWith('- comment:')) {
                // This seems to mark the next major block at L0.
                break;
            }

            // Also if we hit 'elseSteps:' or 'thenSteps:'? (Nested? No, usually not deep nested here).

            // Shift!
            const currentIndent = childLine.search(/\S/);
            // We want to force it to desiredIndent (or relative).
            // Top level items (- action) go to desiredIndent.
            // Children go relative.

            // Current state:
            // - action: (44)
            // params: (46)
            // selector: (48) (My script enforced L2=48).

            // Desired state:
            // - action: (50) (parent 48 + 2)
            // params: (52)
            // selector: (54)

            // It's a uniform shift of +6 ?
            // 50 - 44 = 6.

            const shift = 6;
            const newIndent = currentIndent + shift;
            lines[j] = ' '.repeat(newIndent) + childLine.trim();

            j++;
        }
        i = j - 1; // Resume loop
    }
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed nested actions.');
