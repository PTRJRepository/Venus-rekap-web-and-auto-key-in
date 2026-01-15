# Debugging Guide - Loop Not Executing

## Problem
Browser automation reaches the detail page (`frmPrTrxTaskRegisterDet.aspx`) but no data is input.

## Diagnosis
Console output shows:
```
Steps: undefined actions
```

This means the `steps` array inside `forEach.params` is not being read correctly.

## Root Cause Analysis

**Test command:**
```bash
node -e "const fs = require('fs'); const data = JSON.parse(fs.readFileSync('templates/attendance-input-loop.json', 'utf8')); const forEach = data.steps.find(s => s.action === 'forEach'); console.log('steps:', forEach.params.steps);"
```

**Result:** `steps: undefined`

## Possible Causes
1. JSON syntax error (missing bracket, comma)
2. Steps array not properly defined
3. File encoding issue

## Solution Attempts
1. ✅ Validated JSON structure visually
2. ✅ Fixed selector (#MainContent_btnNew)  
3. ⏳ Running jsonlint to find syntax errors
4. ⏳ May need to recreate template from scratch

## Temporary Workaround
Create simplified template with inline steps to test if loop mechanism works.
