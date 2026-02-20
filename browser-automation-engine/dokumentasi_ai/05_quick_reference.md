# Browser Automation Engine - Quick Reference

## 1. Command Line Interface

### Single Execution
```bash
node index.js <template-name>
```

### Parallel Execution
```bash
node parallel-runner.js [data-file]
```

### Environment Variables
```bash
HEADLESS=true AUTOMATION_INSTANCES=5 node parallel-runner.js
```

---

## 2. Template Structure

```json
{
  "name": "Template Name",
  "description": "Description",
  "dataFile": "path/to/data.json",
  "steps": [
    { "action": "actionName", "params": { ... } }
  ]
}
```

---

## 3. Available Actions

### Navigation
| Action | Description | Key Params |
|--------|-------------|------------|
| `navigate` | Go to URL | `url`, `waitUntil` |
| `reloadPage` | Reload current page | - |

### Input
| Action | Description | Key Params |
|--------|-------------|------------|
| `typeInput` | Type text | `selector`, `value`, `clear`, `delay` |
| `select` | Select option | `selector`, `value` |
| `click` | Click element | `selector`, `waitForNavigation` |

### Wait
| Action | Description | Key Params |
|--------|-------------|------------|
| `waitForElement` | Wait for element | `selector`, `timeout`, `visible` |
| `waitForElementHidden` | Wait for element to hide | `selector`, `timeout` |
| `waitForPageStable` | Wait for page stability | `timeout`, `interval` |
| `wait` | Simple delay | `duration` |

### Control Flow
| Action | Description | Key Params |
|--------|-------------|------------|
| `loop` | Iterate array | `array`, `variable`, `steps` |
| `condition` | Conditional execution | `condition`, `thenSteps`, `elseSteps` |
| `include` | Include sub-template | `template`, `params` |

### Data
| Action | Description | Key Params |
|--------|-------------|------------|
| `setVariable` | Set context variable | `variable`, `value` |
| `log` | Log message | `message` |

### Verification
| Action | Description | Key Params |
|--------|-------------|------------|
| `verifyEmployeeSync` | Verify sync status | - |
| `checkElement` | Check element state | `selector`, `exists`, `saveTo` |

---

## 4. Variable Substitution

```json
{
  "value": "${employee.name}"        // Simple
  "value": "${employee.Attendance.2024-01-01.status}"  // Nested
  "value": "ID: ${employee.id}"      // Mixed
}
```

---

## 5. Context Object

```javascript
{
  data: { ... },           // From dataFile
  metadata: { ... },       // From dataFile.metadata
  employee: { ... },       // Current loop item
  loopIndex: 0,            // Current loop index
  retryNeeded: false,      // Retry flag
  employeeFailed: false,   // Failure flag
  failedDates: [],         // Failed dates array
  failedRecords: []        // Failed records for CSV
}
```

---

## 6. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEADLESS` | false | Headless browser mode |
| `SLOW_MO` | 0 | Action delay (ms) |
| `SCREENSHOT` | true | Screenshot on error |
| `INPUT_BLOCKING` | false | Block user input |
| `AUTOMATION_INSTANCES` | 3 | Parallel instances |
| `ENGINE_START_DELAY` | 500 | Start delay (ms) |
| `HEARTBEAT_TIMEOUT` | 120000 | Watchdog timeout (ms) |
| `MAX_ENGINE_RESTARTS` | 10 | Max restart attempts |
| `BROWSER_KEEPALIVE_INTERVAL` | 2000 | Keepalive interval (ms) |
| `CHROME_MEMORY_LIMIT` | 0 | Memory limit (MB) |

---

## 7. File Locations

| File/Dir | Purpose |
|----------|---------|
| `templates/*.json` | Template definitions |
| `testing_data/*.json` | Test data files |
| `logs/` | Log files |
| `logs/emp_failed/*.csv` | Failed employee records |
| `state/engine_*.json` | Recovery state files |
| `locks/*.lock` | Distributed lock files |
| `chrome_data/engine_*/` | Chrome profiles |

---

## 8. Common Patterns

### Login Flow
```json
{
  "action": "navigate",
  "params": { "url": "http://example.com/login" }
},
{
  "action": "typeInput",
  "params": { "selector": "#username", "value": "${env.USER}" }
},
{
  "action": "typeInput",
  "params": { "selector": "#password", "value": "${env.PASS}" }
},
{
  "action": "click",
  "params": { "selector": "#loginBtn" }
}
```

### Process Array
```json
{
  "action": "loop",
  "params": {
    "array": "${data.employees}",
    "variable": "employee",
    "steps": [
      { "action": "log", "params": { "message": "Processing: ${employee.name}" } },
      { "action": "typeInput", "params": { "selector": "#id", "value": "${employee.id}" } }
    ]
  }
}
```

### Conditional
```json
{
  "action": "condition",
  "params": {
    "condition": "${employee.hasOvertime}",
    "thenSteps": [
      { "action": "typeInput", "params": { "selector": "#otHours", "value": "${employee.overtimeHours}" } }
    ]
  }
}
```

### Error Handling
```json
{
  "action": "waitForElement",
  "params": { "selector": ".error", "timeout": 3000 }
},
{
  "action": "condition",
  "params": {
    "condition": "${errorVisible}",
    "thenSteps": [
      { "action": "log", "params": { "message": "Error detected" } },
      { "action": "click", "params": { "selector": ".error .close" } }
    ]
  }
}
```

---

## 9. Debugging Tips

| Issue | Solution |
|-------|----------|
| Element not found | Increase timeout, check selector |
| Browser crash | Reduce instances, enable headless |
| Session expired | Add login flow at start |
| Memory issues | Set `CHROME_MEMORY_LIMIT`, use headless |
| Slow execution | Disable `SLOW_MO`, use headless |

### Debug Mode
```bash
HEADLESS=false SLOW_MO=100 node index.js template
```

---

## 10. Error Codes

| Code | Description |
|------|-------------|
| `TEMPLATE_NOT_FOUND` | Template file not found |
| `INVALID_TEMPLATE` | Invalid template structure |
| `ACTION_NOT_FOUND` | Unknown action name |
| `ELEMENT_NOT_FOUND` | Element timeout |
| `BROWSER_DISCONNECTED` | Browser connection lost |
| `SESSION_EXPIRED` | Session expired, need re-login |
| `NAVIGATION_TIMEOUT` | Navigation timeout |

---

## 11. Performance Guidelines

| Instances | Headless | RAM Needed | Recommended For |
|-----------|----------|------------|-----------------|
| 1-3 | false | 2-4 GB | Development |
| 1-3 | true | 1-2 GB | Testing |
| 5-10 | true | 4-8 GB | Production |
| 10+ | true | 8+ GB | High volume |

---

## 12. Quick Troubleshooting

### Browser won't start
```bash
# Kill existing Chrome
taskkill /F /IM chrome.exe

# Try with no sandbox
HEADLESS=false node index.js template
```

### Parallel execution stuck
```bash
# Check heartbeat files
cat logs/heartbeat_engine_1.json

# Kill and restart
taskkill /F /IM chrome.exe
node parallel-runner.js
```

### Memory issues
```env
AUTOMATION_INSTANCES=3
HEADLESS=true
CHROME_MEMORY_LIMIT=512
```

---

## 13. Useful Commands

```bash
# Run single template
node index.js attendance-input-loop

# Run parallel with custom data
node parallel-runner.js testing_data/overtime_data.json

# Debug mode
HEADLESS=false SLOW_MO=500 node index.js template

# Production mode
HEADLESS=true AUTOMATION_INSTANCES=5 node parallel-runner.js

# Cleanup temp files
rm -f templates/_temp_engine_*.json testing_data/_temp_engine_*.json

# View logs
tail -f logs/automation.log
```

---

## 14. File Structure Quick View

```
browser-automation-engine/
engine.js              # Core engine
index.js               # CLI entry
parallel-runner.js     # Parallel manager
worker.js              # Worker process
actions/index.js       # All actions
utils/selectors.js     # Selector utilities
utils/recovery.js      # Recovery manager
templates/             # Template files
testing_data/          # Data files
logs/                  # Log files
state/                 # State files
locks/                 # Lock files
chrome_data/           # Chrome profiles