# Browser Automation Engine - Design Summary

## Project: Refactor Browser Automation Engine

**Date**: 2025-02-17
**Status**: Design Complete - Ready for Implementation
**Location**: `refactor_automation_engine/`

---

## Executive Summary

This document summarizes the complete design for refactoring the Browser Automation Engine from a Millware-specific tool into a **universal, modular browser agent platform**.

### Key Goals Achieved

| Goal | Solution |
|------|----------|
| **Modular Architecture** | Layered architecture with clear separation of concerns |
| **Platform Agnostic** | Provider pattern for easy platform switching |
| **Visual Editor** | React Flow-based drag-and-drop template builder |
| **Extensibility** | Hybrid plugin system for actions and validators |
| **Robust Error Handling** | Fallback chains with retry logic and state snapshots |
| **Professional Quality** | Database persistence, versioning, and complete documentation |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Visual Editor (React Flow)                │
│  - Template Builder dengan drag-drop nodes                   │
│  - Live validation dan syntax highlighting                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│                    Agent Core Layer                          │
│  TemplateEngine, ActionRegistry, ValidatorRegistry, etc.     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Provider Layer (KEY!)                     │
│  MillwareProvider, GenericWebProvider, [CustomProvider]     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Browser Adapter Layer                     │
│  PuppeteerAdapter (extensible to Playwright, Selenium)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Data Persistence Layer                    │
│  SQLite - Templates, Executions, Logs, Snapshots            │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Provider System (The Modular Core)

**Why**: Enables platform-agnostic automation by encapsulating platform-specific logic.

**Interface**:
```javascript
class BaseProvider {
  getBaseUrl() { }
  getLoginWorkflow() { }
  getSelectors() { }
  async validateSession(page) { }
  async handleSessionExpiry(page, context) { }
}
```

**Built-in Providers**:
- `MillwareProvider` - Millware HR System automation
- `GenericWebProvider` - Generic web scraping/automation

**Easy to Extend**:
```javascript
class ShopifyProvider extends BaseProvider {
  // Implement platform-specific logic
}
```

### 2. Action System (Hybrid Plugin)

**Why**: Maximum flexibility - actions can be classes OR functions.

**Supports**:
- Class-based actions (with lifecycle hooks)
- Function-based actions (simple, functional)
- Middleware (pre/post execution hooks)
- Action aliases

**Built-in Actions**: 30+ actions including navigate, click, type, forEach, if, switch, parallel, try/catch, extract, transform, validate, etc.

### 3. Validator System (Chain Support)

**Why**: Complex validation scenarios with AND/OR logic.

**Features**:
- Chain validators (sequential/parallel)
- AND/OR composition
- Custom validators per platform
- Built-in validators (element, value, condition, network)

### 4. Template Format (Node-Based)

**Why**: Visualizable as flow diagrams, supports complex nesting.

**Structure**:
```json
{
  "id": "template-id",
  "name": "Template Name",
  "version": "2.0.0",
  "provider": "millware",
  "variables": {},
  "nodes": [],
  "edges": []
}
```

### 5. Visual Editor (React Flow)

**Why**: No-code/low-code template creation.

**Components**:
- FlowEditor - Main canvas with React Flow
- Custom Node Components - Action, FlowControl, Validation nodes
- Toolbar - Node palette with drag-drop
- Properties Panel - Node configuration
- MiniMap & Controls - Navigation and zoom

### 6. Database Persistence

**Why**: Template versioning, execution history, recovery.

**Tables**:
- `templates` - Template storage with versioning
- `executions` - Execution logs
- `execution_steps` - Detailed step logs
- `state_snapshots` - Recovery state
- `template_tags` - Tagging system

---

## File Structure

```
refactor_automation_engine/
├── core/                   # Platform-independent core engine
├── adapters/               # Browser adapters (Puppeteer, etc.)
├── actions/                # Action system (hybrid plugin)
├── validators/             # Validation system
├── middleware/             # Pre/post hooks
├── providers/              # Platform providers (MILLWARE KEY!)
│   ├── BaseProvider.js
│   ├── ProviderFactory.js
│   ├── millware/
│   ├── generic/
│   └── [custom]/
├── database/               # SQLite persistence
├── web-ui/                 # React Flow visual editor
├── templates/              # Template storage
├── utils/                  # Utilities
└── docs/                   # Complete documentation
```

---

## Comparison: Old vs New

| Aspect | Old Engine | New Engine |
|--------|-----------|------------|
| Platform Coupling | Tightly coupled to Millware | Provider pattern = ANY platform |
| Adding New Automation | Modify core code | Add new provider only |
| Action Extensibility | Hardcoded in actions/index.js | Hybrid plugin system |
| Validation | Basic | Chain validators with AND/OR |
| Template Editing | JSON only | Visual editor (React Flow) |
| Error Recovery | Limited | Fallback chains + snapshots |
| Template Storage | JSON files only | Database + versioning |
| Parallel Execution | Basic worker partition | Built-in parallel nodes |
| Reusability | Low | High across all dimensions |

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Setup project structure
- [ ] Implement core engine (AgentEngine, TemplateEngine)
- [ ] Implement ProviderFactory and BaseProvider
- [ ] Implement ActionRegistry with basic actions
- [ ] Implement ValidatorRegistry

### Phase 2: Platform Support (Week 3)
- [ ] Implement PuppeteerAdapter
- [ ] Implement MillwareProvider
- [ ] Implement GenericWebProvider
- [ ] Migrate existing templates from old engine

### Phase 3: Advanced Features (Week 4)
- [ ] Implement chain validators
- [ ] Implement FallbackManager
- [ ] Implement DatabaseService with repositories
- [ ] Implement state snapshots

### Phase 4: Visual Editor (Week 5-6)
- [ ] Setup React + Vite + React Flow
- [ ] Implement FlowEditor
- [ ] Implement custom node components
- [ ] Implement Toolbar and PropertiesPanel
- [ ] Connect to backend API

### Phase 5: Polish & Testing (Week 7-8)
- [ ] Unit tests
- [ ] Integration tests
- [ ] End-to-end tests
- [ ] Documentation completion
- [ ] Performance optimization

---

## Usage Examples

### Basic Usage

```javascript
const AgentEngine = require('./core/AgentEngine');
const ProviderFactory = require('./providers/ProviderFactory');

// Create engine with Millware provider
const engine = new AgentEngine({
  provider: ProviderFactory.create('millware', {
    baseUrl: 'http://millwarep3.rebinmas.com:8003',
    credentials: { username: 'user', password: 'pass' }
  })
});

// Run template
await engine.runTemplate('attendance-input', { data: myData });
```

### With Generic Provider

```javascript
// Create engine for any website
const engine = new AgentEngine({
  provider: ProviderFactory.create('generic', {
    name: 'my-automation',
    baseUrl: 'https://example.com',
    loginWorkflow: { /* custom login */ },
    selectors: { /* custom selectors */ }
  })
});
```

### Creating Custom Provider

```javascript
const BaseProvider = require('./providers/BaseProvider');

class MyPlatformProvider extends BaseProvider {
  getBaseUrl() { return 'https://myplatform.com'; }
  getLoginWorkflow() { /* ... */ }
  getSelectors() { /* ... */ }
  async validateSession(page) { /* ... */ }
  async handleSessionExpiry(page, context) { /* ... */ }
}

// Register and use
const ProviderFactory = require('./providers/ProviderFactory');
ProviderFactory.register('myplatform', MyPlatformProvider);
```

---

## Documentation Structure

All documentation is located in `docs/`:

```
docs/
├── README.md                    # Project overview
├── design/
│   ├── architecture.md          # Complete architecture
│   ├── provider-system.md       # Provider pattern guide
│   ├── action-system.md         # Action system guide
│   └── template-format.md       # Template JSON spec
├── api/                         # API documentation (to be added)
└── guides/                      # User guides (to be added)
```

---

## Key Benefits

1. **Future-Proof**: Easy to add support for new platforms
2. **Maintainable**: Clear separation of concerns
3. **Extensible**: Plugin system for actions and validators
4. **User-Friendly**: Visual editor for non-technical users
5. **Reliable**: Robust error handling and recovery
6. **Professional**: Database persistence and versioning

---

## Next Steps

1. **Review Documentation**: Read all files in `docs/design/`
2. **Approve Design**: Confirm this design meets requirements
3. **Start Implementation**: Begin with Phase 1 (Foundation)
4. **Iterate**: Build incrementally with testing at each phase

---

## Questions?

Refer to:
- `docs/design/architecture.md` - Architecture details
- `docs/design/provider-system.md` - Provider pattern
- `docs/design/action-system.md` - Action system
- `docs/design/template-format.md` - Template specification

---

**End of Design Summary**
