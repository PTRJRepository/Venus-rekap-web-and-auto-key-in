const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'templates', 'attendance-input-loop.yaml');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const startIndex = 680;
const endIndex = 800;

// Hierarchy levels
const L0 = 44; // - action
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

    // Detect level
    if (trim.startsWith('- action:')) {
        lines[i] = ' '.repeat(L0) + trim;
        currentContext = 'action';
    } else if (trim.startsWith('params:')) {
        lines[i] = ' '.repeat(L1) + trim;
        currentContext = 'params';
    } else if (trim.startsWith('comment:')) {
        // Comment usually at L1 (sibling of params)
        lines[i] = ' '.repeat(L1) + trim;
    } else if (trim.startsWith('formReentryFields:')) {
        lines[i] = ' '.repeat(L2) + trim;
        currentContext = 'nested_list';
    } else if (trim.startsWith('- selector:')) {
        // Nested list item
        lines[i] = ' '.repeat(L3) + trim;
        currentContext = 'nested_item';
    } else {
        // Other properties (value, index, maxRetries, etc)
        // Check context
        if (currentContext === 'params') {
            lines[i] = ' '.repeat(L2) + trim;
        } else if (currentContext === 'nested_list') {
            // Should not happen? formReentryFields: is followed by - selector
            // But if there are comments?
            lines[i] = ' '.repeat(L2) + trim;
        } else if (currentContext === 'nested_item') {
            lines[i] = ' '.repeat(L4) + trim;
        } else {
            // Default inside action (e.g. before params)?
            // Usually comment is handled. 
            // If we are in 'action' but not 'params' yet? (e.g. comment)
            if (trim.startsWith('comment:')) lines[i] = ' '.repeat(L1) + trim;
            else lines[i] = ' '.repeat(L1) + trim; // fallback
        }
    }
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed strict indentation.');
