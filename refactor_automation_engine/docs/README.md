# Browser Automation Engine - Refactor Documentation

## Overview

Universal Browser Agent Engine yang modular, extensible, dan platform-agnostic. Engine ini dirancang untuk dapat mengotomatisasi berbagai jenis web application, bukan hanya Millware.

### Key Features

- **Platform Agnostic**: Provider pattern untuk switch antar platform dengan mudah
- **Modular Architecture**: Action system, validators, dan middleware dapat dikembangkan secara terpisah
- **Visual Template Editor**: React Flow-based UI untuk drag-and-drop template creation
- **Hybrid Plugin System**: Class-based atau function-based actions dengan middleware hooks
- **Chain Validation**: Multiple validators dengan AND/OR logic
- **Robust Error Handling**: Fallback chains, retry logic, dan state snapshots
- **Database Persistence**: SQLite untuk template storage, execution logs, dan versioning

### Architecture

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
│                    Provider Layer (Platform Specific)        │
│  MillwareProvider, GenericWebProvider, [CustomProvider]     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Browser Adapter Layer                     │
│  PuppeteerAdapter, [PlaywrightAdapter], [SeleniumAdapter]   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Data Persistence Layer                    │
│  SQLite - Templates, Executions, Logs, Snapshots            │
└─────────────────────────────────────────────────────────────┘
```

## Documentation Structure

```
docs/
├── README.md                    # This file
├── design/                      # Design documents
│   ├── architecture.md          # Overall architecture
│   ├── provider-system.md       # Provider pattern design
│   ├── action-system.md         # Action/Plugin system design
│   ├── validator-system.md      # Validator chain design
│   └── template-format.md       # Template JSON format
├── api/                         # API documentation
│   ├── core-api.md              # Core Engine API
│   ├── provider-api.md          # Provider Interface API
│   └── action-api.md            # Action Registry API
└── guides/                      # User guides
    ├── getting-started.md       # Quick start guide
    ├── creating-templates.md    # Template creation guide
    ├── adding-providers.md      # Custom provider guide
    └── visual-editor-guide.md   # Visual editor usage
```

## Quick Start

### Installation

```bash
cd refactor_automation_engine
npm install
```

### Basic Usage

```javascript
const AgentEngine = require('./core/AgentEngine');
const ProviderFactory = require('./core/ProviderFactory');

// Create engine with provider
const engine = new AgentEngine({
  provider: ProviderFactory.create('millware', {
    baseUrl: 'http://millwarep3.rebinmas.com:8003',
    credentials: { username: 'user', password: 'pass' }
  })
});

// Run template
await engine.runTemplate('my-automation', { data: myData });
```

## Project Status

**Phase**: Design Complete
**Status**: Ready for Implementation

See [design/architecture.md](design/architecture.md) for complete design details.

## License

ISC
