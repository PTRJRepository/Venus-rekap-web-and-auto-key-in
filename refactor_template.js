const fs = require('fs');
const path = 'browser-automation-engine/templates/attendance-input-loop.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

// Find the forEach step index
const forEachIndex = data.steps.findIndex(s => s.action === 'forEach');
const forEachStep = data.steps[forEachIndex];

// Define the NEW steps for the employee loop
const newEmployeeSteps = [
    {
        "action": "log",
        "params": {
            "message": "Processing Employee: ${employee.EmployeeName} (${employee.PTRJEmployeeID})"
        }
    },
    {
        "comment": "═══ PASS 1: Input Data ═══",
        "action": "include",
        "params": {
            "template": "_attendance_logic"
        }
    },
    {
        "comment": "═══ VALIDATION: Check DB for Mismatches ═══",
        "action": "verifyEmployeeSync",
        "params": {}
    },
    {
        "comment": "═══ RETRY LOOP: If mismatches found ═══",
        "action": "if",
        "params": {
            "condition": "context.retryNeeded === true",
            "thenSteps": [
                {
                    "action": "log",
                    "params": {
                        "message": "🔄 RETRY TRIGGERED: Mismatches detected. Reloading and re-processing..."
                    }
                },
                {
                    "action": "reloadPage",
                    "params": {}
                },
                {
                    "action": "wait",
                    "params": { "duration": 2000 }
                },
                {
                    "action": "waitForElement",
                    "params": { "selector": ".ui-autocomplete-input.CBOBox", "timeout": 15000 }
                },
                {
                    "comment": "═══ PASS 2: Retry Input ═══",
                    "action": "include",
                    "params": {
                        "template": "_attendance_logic"
                    }
                },
                {
                    "action": "verifyEmployeeSync",
                    "params": {}
                },
                {
                    "action": "if",
                    "params": {
                        "condition": "context.retryNeeded === true",
                        "thenSteps": [
                             {
                                 "action": "log",
                                 "params": { "message": "❌ Still mismatched after retry. Moving to next employee." }
                             }
                        ],
                        "elseSteps": [
                             {
                                 "action": "log",
                                 "params": { "message": "✅ Fixed after retry!" }
                             }
                        ]
                    }
                }
            ]
        }
    }
];

// Update the steps
data.steps[forEachIndex].params.steps = newEmployeeSteps;

// Ensure dataFile is correct
data.dataFile = "testing_data/current_data.json";

fs.writeFileSync(path, JSON.stringify(data, null, 4));
console.log("✅ Refactored " + path);
