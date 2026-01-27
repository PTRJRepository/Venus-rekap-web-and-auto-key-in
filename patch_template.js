const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'browser-automation-engine', 'templates', 'attendance-input-loop.json');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Find the log action for Skipping Hour Input
    // We search for a unique string inside it
    const searchString = '"message": "  Skipping Hour Input for Regular as requested."';
    const index = content.indexOf(searchString);

    if (index === -1) {
        console.error('❌ Could not find target insertion point');
        process.exit(1);
    }

    // Find the start of this action block (searching backwards for "action": "log")
    // The structure is: { "action": "log", "params": { "message": "..." } }
    // We want to insert BEFORE the starting '{' of this object.

    // Simple heuristic: Search backwards for the opening bracket of this action object
    // It should be the `{` before `"action": "log"` which is before our search string

    const actionLogIndex = content.lastIndexOf('"action": "log"', index);
    const blockStartIndex = content.lastIndexOf('{', actionLogIndex);

    if (blockStartIndex === -1) {
        console.error('❌ Could not find block start');
        process.exit(1);
    }

    console.log(`📍 Found insertion point at index ${blockStartIndex}`);

    // The new content to insert
    // We need to strictly match indentation or just use standard indentation
    // Since it's JSON, whitespace doesn't typically break parsing, but we want it readable.
    // We'll mimic the indentation of the found block.

    // Check indentation
    const lastNewLine = content.lastIndexOf('\n', blockStartIndex);
    const indentation = content.substring(lastNewLine + 1, blockStartIndex);

    const newBlocks = `
${indentation}    "action": "if",
${indentation}    "params": {
${indentation}        "condition": "hasChargeJobPart4",
${indentation}        "thenSteps": [
${indentation}            {
${indentation}                "action": "retryInputWithValidation",
${indentation}                "params": {
${indentation}                    "selector": ".ui-autocomplete-input.CBOBox",
${indentation}                    "index": 4,
${indentation}                    "value": "\${chargeJobPart4}",
${indentation}                    "validationSelector": "#MainContent_ddlTaskCode4_RFV",
${indentation}                    "maxRetries": 5,
${indentation}                    "expectedFieldCount": "\${expectedFieldCount}",
${indentation}                    "checkIfAlreadyFilled": true,
${indentation}                    "formReentryFields": [
${indentation}                        {
${indentation}                            "selector": ".ui-autocomplete-input.CBOBox",
${indentation}                            "index": 0,
${indentation}                            "value": "\${employee.PTRJEmployeeID}"
${indentation}                        },
${indentation}                        {
${indentation}                            "selector": ".ui-autocomplete-input.CBOBox",
${indentation}                            "index": 1,
${indentation}                            "value": "\${chargeJobPart1Clean}"
${indentation}                        }
${indentation}                    ]
${indentation}                }
${indentation}            }
${indentation}        ]
${indentation}    }
${indentation}},
${indentation}{
${indentation}    "action": "if",
${indentation}    "params": {
${indentation}        "condition": "hasChargeJobPart5",
${indentation}        "thenSteps": [
${indentation}            {
${indentation}                "action": "retryInputWithValidation",
${indentation}                "params": {
${indentation}                    "selector": ".ui-autocomplete-input.CBOBox",
${indentation}                    "index": 5,
${indentation}                    "value": "\${chargeJobPart5}",
${indentation}                    "validationSelector": "#MainContent_ddlTaskCode5_RFV",
${indentation}                    "maxRetries": 5,
${indentation}                    "expectedFieldCount": "\${expectedFieldCount}",
${indentation}                    "checkIfAlreadyFilled": true,
${indentation}                    "formReentryFields": [
${indentation}                        {
${indentation}                            "selector": ".ui-autocomplete-input.CBOBox",
${indentation}                            "index": 0,
${indentation}                            "value": "\${employee.PTRJEmployeeID}"
${indentation}                        },
${indentation}                        {
${indentation}                            "selector": ".ui-autocomplete-input.CBOBox",
${indentation}                            "index": 1,
${indentation}                            "value": "\${chargeJobPart1Clean}"
${indentation}                        }
${indentation}                    ]
${indentation}                }
${indentation}            }
${indentation}        ]
${indentation}    }
${indentation}},
${indentation}`;

    // Insert
    const newContent = content.substring(0, blockStartIndex) + newBlocks + content.substring(blockStartIndex);

    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('✅ Successfully patched template file');

} catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
}
