const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'browser-automation-engine', 'templates', 'attendance-input-loop.json');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Find double brace pattern
    // Indentation + { + Newline + Indentation + { + Newline + Indentation + "action": "if"

    // Regex logic:
    // Match { followed by optional whitespace/newlines followed by { followed by optional whitespace/newlines followed by "action":

    const regex = /(\{\s*)\{\s*("action": "if")/g;

    if (regex.test(content)) {
        console.log("Found double brace pattern.");
        // Replace with single brace
        content = content.replace(regex, '$1$2');

        fs.writeFileSync(filePath, content, 'utf8');
        console.log("✅ Fixed double brace.");
    } else {
        console.log("Double brace pattern not found via regex.");

        // Manual search if regex fails (due to strict spacing)
        const lines = content.split('\n');
        for (let i = 0; i < lines.length - 2; i++) {
            if (lines[i].trim() === '{' && lines[i + 1].trim() === '{' && lines[i + 2].includes('"action": "if"')) {
                console.log(`Found double brace at line ${i + 1}. Removing line ${i + 1}.`);
                lines.splice(i + 1, 1);
                fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
                console.log("✅ Fixed double brace via line scan.");
                break;
            }
        }
    }

} catch (e) {
    console.error(e);
}
