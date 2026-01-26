const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const startIndex = 680;
const endIndex = 800;

// Hierarchy levels
const L0 = 44; // - action, - comment
const L1 = 46; // params
const L2 = 48; // selector, validationSelector, formReentryFields
const L3 = 50; // - selector (inside formReentryFields)
const L4 = 52; // index (inside - selector)

let currentContext = 'unknown';

for (let i = startIndex; i < endIndex && i < lines.length; i++) {
    const line = lines[i];
    const trim = line.trim();
    if (trim.length === 0) continue;

    if (trim.includes('Selesai memproses')) break;

    // List Items
    if (trim.startsWith('- ')) {
        if (trim.startsWith('- selector:')) {
            lines[i] = ' '.repeat(L3) + trim;
            currentContext = 'nested_item';
        } else {
            // Any other list item (- action, - comment, etc)
            lines[i] = ' '.repeat(L0) + trim;
            // If it's - comment, next line might be action or params (same object).
            // Context should be L0-object?
            currentContext = 'action';
        }
    }
    // Keys
    else if (trim.startsWith('params:')) {
        lines[i] = ' '.repeat(L1) + trim;
        currentContext = 'params';
    } else if (trim.startsWith('action:')) {
        // action key inside an object started by - comment
        lines[i] = ' '.repeat(L1) + trim; // Same level as params? 
        // Actually, if `- comment:` is the start. `action:` is a sibling key.
        // `- comment: foo`
        // `  action: bar`
        // So L1 is correct.
    } else if (trim.startsWith('formReentryFields:')) {
        lines[i] = ' '.repeat(L2) + trim;
        currentContext = 'nested_list';
    }
    // Properties / Comments
    else {
        // Fallback based on context
        if (currentContext === 'params') {
            lines[i] = ' '.repeat(L2) + trim;
        } else if (currentContext === 'nested_list') {
            lines[i] = ' '.repeat(L2) + trim;
        } else if (currentContext === 'nested_item') {
            lines[i] = ' '.repeat(L4) + trim;
        } else {
            // Default L1 (sibling of action/comment keys)
            lines[i] = ' '.repeat(L1) + trim;
        }
    }
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed strict indentation v2.');
