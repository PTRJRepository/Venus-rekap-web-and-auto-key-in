const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('formReentryFields:')) {
        const parentIndent = lines[i].search(/\S/);
        const desiredChildIndent = parentIndent + 2;

        let j = i + 1;
        while (j < lines.length && (lines[j].trim().startsWith('-') || lines[j].trim().length === 0)) {
            if (lines[j].trim().length === 0) { j++; continue; }

            // Check if it's a child list item
            if (lines[j].trim().startsWith('- selector:') || lines[j].trim().startsWith('- action:')) {
                // If it starts with - action, it might be a nested action? 
                // formReentryFields usually has objects with selectors.
                // But one error log showed `- action: wait` inside?
                // The snippet showed:
                // - selector: ...
                // - selector: ...
                // - action: wait (Wait, mixed content?)

                // Let's just fix the indent.
                lines[j] = ' '.repeat(desiredChildIndent) + lines[j].trim();
            } else {
                // End of list?
                // If it's `value: ...` (part of object), it should be aligned with child item contents.
                lines[j] = ' '.repeat(desiredChildIndent + 2) + lines[j].trim();
            }
            j++;
        }
    }
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed nested lists.');
