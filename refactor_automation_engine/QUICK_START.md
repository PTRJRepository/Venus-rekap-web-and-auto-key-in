# Quick Start - Browser Agent Engine

## Project Location
```
refactor_automation_engine/
```

## What Has Been Created

### Documentation (`docs/`)
- `README.md` - Project overview
- `DESIGN_SUMMARY.md` - Complete design summary
- `design/architecture.md` - Architecture details
- `design/provider-system.md` - Provider pattern (MUST READ!)
- `design/action-system.md` - Action/Plugin system
- `design/template-format.md` - Template JSON specification

### Configuration Files
- `package.json` - Main project dependencies
- `web-ui/package.json` - React UI dependencies

## Key Design Decisions

### 1. Modular & Platform-Agnostic
The engine uses **Provider Pattern** to separate platform-specific logic from core automation logic.

```javascript
// Millware automation
const engine = new AgentEngine({
  provider: ProviderFactory.create('millware', { /* config */ })
});

// Generic web automation
const engine = new AgentEngine({
  provider: ProviderFactory.create('generic', { /* config */ })
});

// Custom platform (e.g., Shopify)
const engine = new AgentEngine({
  provider: ProviderFactory.create('shopify', { /* config */ })
});
```

### 2. Hybrid Plugin System
Actions can be classes OR functions:

```javascript
// Class-based
class ClickAction extends BaseAction {
  async execute(page, params, context) { /* ... */ }
}

// Function-based
const logAction = {
  async execute(page, params, context) { /* ... */ }
};
```

### 3. Chain Validation
Multiple validators with AND/OR logic:

```json
{
  "type": "chainValidate",
  "data": {
    "mode": "sequential",
    "chain": [
      { "validator": "element-exists", "params": { "selector": "#a" } },
      { "validator": "element-visible", "params": { "selector": "#b" } }
    ]
  }
}
```

### 4. Visual Editor
React Flow-based drag-and-drop template builder.

## Directory Structure (To Be Implemented)

```
refactor_automation_engine/
├── core/                   # Core engine (platform-independent)
├── providers/              # Platform providers (KEY!)
│   ├── BaseProvider.js     # Provider interface
│   ├── ProviderFactory.js  # Provider factory
│   ├── millware/           # Millware provider
│   ├── generic/            # Generic provider
│   └── [custom]/           # Your custom providers
├── actions/                # Action system
├── validators/             # Validation system
├── database/               # SQLite persistence
├── web-ui/                 # React Flow visual editor
└── docs/                   # Documentation (✓ Created)
```

## Next Steps

1. **Read the documentation**: Start with `DESIGN_SUMMARY.md`
2. **Review architecture**: `docs/design/architecture.md`
3. **Understand providers**: `docs/design/provider-system.md`
4. **Begin implementation**: Follow phases in DESIGN_SUMMARY.md

## Important: Provider Pattern

The **Provider Pattern** is the key to making this engine work with ANY platform, not just Millware.

- Read `docs/design/provider-system.md` for details
- See `MillwareProvider` and `GenericWebProvider` as examples
- Create custom providers by extending `BaseProvider`

## File References

| File | Purpose |
|------|---------|
| `DESIGN_SUMMARY.md` | Complete overview - START HERE |
| `docs/design/provider-system.md` | How to add new platforms |
| `docs/design/action-system.md` | How to add custom actions |
| `docs/design/template-format.md` | Template JSON reference |
| `docs/design/architecture.md` | Complete architecture |
