# YAML Template Migration Guide

## ✅ What Has Been Done

### 1. **Engine Support for YAML**
Updated `engine.js` to automatically detect and load YAML templates:
- Priority: `.yaml` → `.yml` → `.json`
- Uses `js-yaml` library for parsing
- Transparent to the user - just works!

### 2. **Parallel Runner Support**
Updated `parallel-runner.js` to load YAML templates:
- Same priority system as engine
- Backwards compatible with existing JSON templates

### 3. **All Templates Converted**
Converted all templates to YAML format:
- ✅ `attendance-input-loop.yaml` (47KB vs 120KB JSON - 60% smaller!)
- ✅ `partitioned-template-1.yaml`
- ✅ `partitioned-template-2.yaml`
- ✅ `template-flow.yaml`

### 4. **Dependency Installed**
- Installed `js-yaml` in `browser-automation-engine/node_modules`

---

## 📝 How to Use YAML Templates

### Editing Templates
Simply edit the `.yaml` files in `browser-automation-engine/templates/`:

```yaml
# Much easier to read than JSON!
steps:
  - action: log
    params:
      message: 'Processing Employee: ${employee.EmployeeName}'
  
  - action: forEach
    params:
      items: data.data
      itemName: employee
      steps:
        - action: log
          params:
            message: 'Employee: ${employee.PTRJEmployeeID}'
```

### Benefits
✅ **No bracket/brace confusion** - uses indentation  
✅ **60% smaller files** - easier to scroll through  
✅ **Comments supported** - use `#` for comments  
✅ **Multi-line strings** - use `>-` for long text  
✅ **Clearer structure** - indentation shows hierarchy  

### YAML Syntax Tips

**Lists:**
```yaml
steps:
  - action: log
  - action: wait
  - action: click
```

**Objects:**
```yaml
params:
  selector: '#MainContent_txtDate'
  timeout: 10000
  comment: 'Wait for element'
```

**Variables:**
```yaml
message: 'Employee: ${employee.EmployeeName}'
value: ${formattedDate}
```

**Multi-line:**
```yaml
comment: >-
  This is a long comment
  that spans multiple lines
```

**Conditions:**
```yaml
condition: attendance.status && !metadata.onlyOvertime
```

---

## 🔧 Making Changes

### Adding a Step
Just add to the list with proper indentation:

```yaml
steps:
  - action: log
    params:
      message: 'Step 1'
  
  # NEW STEP - Just add here!
  - action: wait
    params:
      duration: 1000
  
  - action: click
    params:
      selector: '#btnSave'
```

### Modifying Conditions
Easy to see and edit:

```yaml
- action: if
  params:
    condition: attendance.status === 'Hadir'
    thenSteps:
      - action: log
        params:
          message: 'Employee is present'
```

### Nested Loops
Clear visual hierarchy:

```yaml
- action: forEach
  params:
    items: employees
    itemName: employee
    steps:
      - action: forEachProperty
        params:
          object: employee.Attendance
          keyName: date
          valueName: attendance
          steps:
            - action: log
              params:
                message: 'Date: ${date}'
```

---

## 🚀 Testing

To test the YAML templates:

```bash
# Restart backend
cd backend
bun start

# Run automation - it will automatically use YAML templates
```

The engine will:
1. Look for `.yaml` file first
2. Fall back to `.json` if YAML doesn't exist
3. Work exactly the same way!

---

## 📚 Future Additions

To create a new template:

### Option 1: Write YAML directly
Create `templates/my-template.yaml`:

```yaml
name: My Custom Template
description: What this template does
steps:
  - action: navigate
    params:
      url: https://example.com
  
  - action: log
    params:
      message: 'Started automation'
```

### Option 2: Convert from JSON
If you have JSON:

```bash
cd browser-automation-engine
node convert_all_templates.js
```

---

## ⚠️ Important Notes

1. **Indentation Matters**: YAML uses spaces (2 spaces per level)
2. **No Tabs**: Use spaces only, not tabs
3. **Quotes**: Use quotes for strings with special characters
4. **Arrays**: Start with `-` (dash + space)
5. **Validation**: YAML parser will show errors if syntax is wrong

---

## 🎯 Summary

**You can now edit templates in YAML format!**

- ✅ All templates converted
- ✅ Engine auto-detects format  
- ✅ Much easier to read/edit
- ✅ No more bracket confusion
- ✅ Backwards compatible

**Just edit the `.yaml` files and restart the backend!**
