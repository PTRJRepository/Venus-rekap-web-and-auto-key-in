# Template Format Specification

## Overview

Template menggunakan format JSON-based dengan struktur **node-based** yang dapat divisualisasikan sebagai flow diagram.

## Template Structure

```json
{
  "id": "template-id",
  "name": "Template Name",
  "version": "1.0.0",
  "description": "Template description",
  "provider": "provider-name",
  "providerConfig": {},
  "metadata": {},
  "variables": {},
  "nodes": [],
  "edges": []
}
```

## Root Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique template identifier (UUID) |
| `name` | string | Yes | Human-readable template name |
| `version` | string | Yes | Semantic version (x.y.z) |
| `description` | string | No | Template description |
| `provider` | string | No | Provider name (millware, generic, etc.) |
| `providerConfig` | object | No | Provider-specific configuration |
| `metadata` | object | No | Tags, author, createdAt, etc. |
| `variables` | object | No | Global variables for substitution |
| `nodes` | array | Yes | Array of node definitions |
| `edges` | array | Yes | Array of connections between nodes |

## Node Structure

```json
{
  "id": "node-id",
  "type": "action|flowControl|validation|data",
  "actionType": "navigate|click|typeInput|...",
  "position": { "x": 100, "y": 100 },
  "data": {},
  "onError": {}
}
```

### Node Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique node identifier |
| `type` | string | Yes | Node category |
| `actionType` | string | Yes | Specific action to execute |
| `position` | object | No | Position for visual editor |
| `data` | object | Yes | Action parameters |
| `onError` | object | No | Error handling configuration |

## Edge Structure

```json
{
  "from": "node-id-1",
  "to": "node-id-2",
  "condition": null,
  "label": "optional label"
}
```

### Edge Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `from` | string | Yes | Source node ID |
| `to` | string | Yes | Target node ID |
| `condition` | string | No | Conditional expression |
| `label` | string | No | Label for visual display |

## Complete Example

```json
{
  "id": "millware-attendance-input",
  "name": "Millware Attendance Input",
  "version": "2.0.0",
  "description": "Automated attendance data input to Millware system",
  "provider": "millware",
  "providerConfig": {
    "baseUrl": "http://millwarep3.rebinmas.com:8003"
  },
  "metadata": {
    "author": "System",
    "createdAt": "2025-01-01T00:00:00Z",
    "tags": ["millware", "attendance", "production"],
    "estimatedDuration": "5m"
  },
  "variables": {
    "BASE_URL": "${provider.baseUrl}",
    "TIMEOUT": 30000,
    "MAX_RETRIES": 3
  },
  "nodes": [
    {
      "id": "node-navigate",
      "type": "action",
      "actionType": "navigate",
      "position": { "x": 100, "y": 100 },
      "data": {
        "url": "${BASE_URL}",
        "waitFor": "domcontentloaded",
        "timeout": "${TIMEOUT}",
        "onError": {
          "action": "retry",
          "maxRetries": 3
        }
      }
    },
    {
      "id": "node-validate-session",
      "type": "validation",
      "actionType": "chainValidate",
      "position": { "x": 100, "y": 200 },
      "data": {
        "chain": [
          {
            "validator": "element-exists",
            "params": { "selector": "#txtUsername" }
          },
          {
            "validator": "element-visible",
            "params": { "selector": "#btnLogin" }
          }
        ]
      }
    },
    {
      "id": "node-employee-loop",
      "type": "flowControl",
      "actionType": "forEach",
      "position": { "x": 100, "y": 400 },
      "data": {
        "items": "data.employees",
        "itemName": "employee",
        "parallel": true,
        "maxConcurrency": 5,
        "filter": "${employee.status === 'Active'}"
      },
      "children": [
        {
          "id": "node-log-employee",
          "type": "action",
          "actionType": "log",
          "data": {
            "message": "Processing: ${employee.EmployeeName}",
            "level": "info"
          }
        },
        {
          "id": "node-input-attendance",
          "type": "action",
          "actionType": "include",
          "data": {
            "template": "sub-attendance-input",
            "context": {
              "employee": "${employee}"
            }
          }
        },
        {
          "id": "node-validate-sync",
          "type": "validation",
          "actionType": "validate",
          "data": {
            "validator": "millware-sync",
            "params": {
              "employeeId": "${employee.PTRJEmployeeID}",
              "date": "${record.date}",
              "hours": "${record.hours}"
            },
            "onInvalid": {
              "action": "retry",
              "maxRetries": 2,
              "fallbackTo": "node-manual-intervention"
            }
          }
        }
      ]
    }
  ],
  "edges": [
    { "from": "node-navigate", "to": "node-validate-session" },
    { "from": "node-validate-session", "to": "node-employee-loop" }
  ]
}
```

## Node Types Reference

### Action Nodes

#### Navigate
```json
{
  "id": "nav-1",
  "type": "action",
  "actionType": "navigate",
  "data": {
    "url": "https://example.com",
    "waitFor": "load",
    "timeout": 30000
  }
}
```

#### Click
```json
{
  "id": "click-1",
  "type": "action",
  "actionType": "click",
  "data": {
    "selector": "#button-id",
    "waitFor": { "event": "navigation", "timeout": 10000 },
    "timeout": 30000
  }
}
```

#### TypeInput
```json
{
  "id": "type-1",
  "type": "action",
  "actionType": "typeInput",
  "data": {
    "selector": "#input-id",
    "value": "${variable}",
    "clear": true,
    "delay": 50
  }
}
```

### Flow Control Nodes

#### ForEach
```json
{
  "id": "loop-1",
  "type": "flowControl",
  "actionType": "forEach",
  "data": {
    "items": "data.items",
    "itemName": "item",
    "parallel": false,
    "maxConcurrency": 5,
    "children": []
  }
}
```

#### If
```json
{
  "id": "if-1",
  "type": "flowControl",
  "actionType": "if",
  "data": {
    "condition": "${item.status === 'active'}",
    "thenSteps": [],
    "elseSteps": []
  }
}
```

#### Switch
```json
{
  "id": "switch-1",
  "type": "flowControl",
  "actionType": "switch",
  "data": {
    "value": "${item.type}",
    "cases": [
      { "when": "A", "then": "node-a" },
      { "when": "B", "then": "node-b" }
    ],
    "default": "node-default"
  }
}
```

#### Parallel
```json
{
  "id": "parallel-1",
  "type": "flowControl",
  "actionType": "parallel",
  "data": {
    "maxConcurrency": 5,
    "failFast": false,
    "continueOnError": true,
    "children": []
  }
}
```

#### Try
```json
{
  "id": "try-1",
  "type": "flowControl",
  "actionType": "try",
  "data": {
    "attempt": {},
    "maxRetries": 3,
    "retryDelay": 2000,
    "onError": [
      {
        "condition": "${error.message.includes('timeout')}",
        "fallbackTo": "node-retry"
      }
    ]
  }
}
```

### Validation Nodes

#### Validate
```json
{
  "id": "validate-1",
  "type": "validation",
  "actionType": "validate",
  "data": {
    "validator": "element-exists",
    "params": {
      "selector": "#element-id"
    },
    "onInvalid": {
      "action": "retry",
      "maxRetries": 3
    }
  }
}
```

#### Chain Validate
```json
{
  "id": "chain-1",
  "type": "validation",
  "actionType": "chainValidate",
  "data": {
    "mode": "sequential",
    "stopOnFirstInvalid": true,
    "chain": [
      {
        "validator": "element-exists",
        "params": { "selector": "#a" }
      },
      {
        "validator": "element-visible",
        "params": { "selector": "#b" }
      }
    ]
  }
}
```

### Data Nodes

#### Extract
```json
{
  "id": "extract-1",
  "type": "data",
  "actionType": "extract",
  "data": {
    "selector": "table tr",
    "output": "extractedData",
    "columns": [
      { "name": "col1", "selector": "td:nth-child(1)" },
      { "name": "col2", "selector": "td:nth-child(2)" }
    ]
  }
}
```

#### Transform
```json
{
  "id": "transform-1",
  "type": "data",
  "actionType": "transform",
  "data": {
    "input": "data.items",
    "output": "transformed",
    "script": "items => items.map(i => ({ ...i, processed: true }))"
  }
}
```

#### HTTP Request
```json
{
  "id": "http-1",
  "type": "data",
  "actionType": "httpRequest",
  "data": {
    "url": "https://api.example.com/data",
    "method": "POST",
    "headers": {},
    "body": "${context.data}",
    "output": "apiResponse"
  }
}
```

## Error Handling

### Error Action Types

| Action | Description |
|--------|-------------|
| `fail` | Stop execution immediately |
| `retry` | Retry with exponential backoff |
| `fallback` | Execute fallback node |
| `ignore` | Continue to next step |
| `restart` | Restart from beginning |

### Error Handling Examples

```json
{
  "onError": {
    "action": "retry",
    "maxRetries": 3,
    "retryDelay": 2000,
    "backoffMultiplier": 1.5
  }
}
```

```json
{
  "onError": {
    "action": "fallback",
    "to": "node-fallback-handler",
    "passError": true
  }
}
```

## Variable Substitution

Variables use `${variable.path}` syntax and are resolved from:

1. Template variables (`variables` object)
2. Provider context (`provider.baseUrl`, etc.)
3. Execution context (data passed to template)
4. Loop context (itemName in forEach)

### Example

```json
{
  "variables": {
    "BASE_URL": "https://example.com",
    "TIMEOUT": 30000
  },
  "nodes": [
    {
      "data": {
        "url": "${BASE_URL}/page",
        "timeout": "${TIMEOUT}",
        "employee": "${employee.name}"
      }
    }
  ]
}
```

## Sub-Templates (Include)

```json
{
  "id": "include-1",
  "type": "action",
  "actionType": "include",
  "data": {
    "template": "sub-template-name",
    "context": {
      "localVar": "${globalVar}"
    }
  }
}
```

## Template Versioning

Templates support versioning through parent-child relationships:

```json
{
  "id": "template-v2",
  "name": "My Template v2",
  "version": "2.0.0",
  "parent_id": "template-v1",
  "metadata": {
    "forkedFrom": "template-v1",
    "changelog": "Added parallel processing support"
  }
}
```

## Best Practices

1. **Use descriptive IDs**: `node-navigate-login` instead of `node-1`
2. **Organize nodes by function**: Group related nodes in the diagram
3. **Set appropriate timeouts**: Default 30s may not suit all cases
4. **Always handle errors**: Define `onError` for critical nodes
5. **Use variables for constants**: URLs, timeouts, selectors
6. **Document complex logic**: Use `comment` field on nodes
7. **Test incrementally**: Start small, add complexity gradually
8. **Version your templates**: Use semantic versioning
