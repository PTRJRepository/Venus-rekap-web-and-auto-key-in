# Architecture Design

## Overview

Browser Automation Engine Refactor dirancang dengan arsitektur **layered** yang memisahkan concerns antara platform-specific logic dan core automation logic.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Visual Editor (React Flow)                  │  │
│  │  - Flow-based template builder                                │  │
│  │  - Drag-drop node palette                                      │  │
│  │  - Properties panel                                            │  │
│  │  - Live validation                                             │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
└──────────────────────────────┼─────────────────────────────────────┘
                               │ REST API
┌──────────────────────────────▼─────────────────────────────────────┐
│                          APPLICATION LAYER                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      TemplateEngine                           │  │
│  │  - Template parsing & compilation                             │  │
│  │  - Variable substitution                                      │  │
│  │  - Context management                                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    ActionRegistry                             │  │
│  │  - Dynamic action loading                                     │  │
│  │  - Middleware support                                         │  │
│  │  - Plugin registration                                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  ValidatorRegistry                            │  │
│  │  - Chain validators                                           │  │
│  │  - AND/OR composition                                         │  │
│  │  - Custom validator registration                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   FallbackManager                             │  │
│  │  - Retry logic                                                │  │
│  │  - Fallback chains                                            │  │
│  │  - State snapshots                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────────┐
│                         DOMAIN LAYER                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   ProviderFactory                             │  │
│  │  - Provider registration                                      │  │
│  │  - Provider instantiation                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              BaseProvider (Interface)                         │  │
│  │  - getBaseUrl()                                               │  │
│  │  - getLoginWorkflow()                                         │  │
│  │  - validateSession()                                          │  │
│  │  - handleSessionExpiry()                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  Millware    │  │   Generic    │  │   Custom     │            │
│  │  Provider    │  │   Provider   │  │   Provider   │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────────┐
│                       INFRASTRUCTURE LAYER                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  BrowserAdapter Interface                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  Puppeteer   │  │  Playwright  │  │   Selenium   │            │
│  │   Adapter    │  │   Adapter    │  │   Adapter    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     DatabaseService                           │  │
│  │  - TemplateRepository                                         │  │
│  │  - ExecutionRepository                                        │  │
│  │  - SnapshotRepository                                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
refactor_automation_engine/
│
├── index.js                        # Main entry point
├── config.js                       # Configuration loader
├── .env                            # Environment variables
├── package.json
├── README.md
│
├── core/                           # Core Engine (Platform Independent)
│   ├── AgentEngine.js              # Main orchestrator
│   ├── TemplateEngine.js           # Template processing
│   ├── ContextManager.js           # Variable & state management
│   ├── LifecycleManager.js         # Execution lifecycle
│   ├── ProviderFactory.js          # Provider factory
│   └── EventBus.js                 # Event pub/sub
│
├── adapters/                       # Browser Adapters (Pluggable)
│   ├── BrowserAdapter.js           # Base adapter interface
│   ├── puppeteer/
│   │   ├── PuppeteerAdapter.js     # Puppeteer implementation
│   │   └── PuppeteerPage.js        # Page wrapper
│   ├── playwright/                 # Future: Playwright adapter
│   │   └── PlaywrightAdapter.js
│   └── selenium/                   # Future: Selenium adapter
│       └── SeleniumAdapter.js
│
├── actions/                        # Action System (Hybrid Plugin)
│   ├── BaseAction.js               # Abstract base class
│   ├── ActionRegistry.js           # Central registry
│   ├── MiddlewareManager.js        # Pre/post hooks
│   ├── builtin/                    # Built-in actions
│   │   ├── navigation/
│   │   │   ├── NavigateAction.js
│   │   │   ├── RefreshAction.js
│   │   │   └── GoBackAction.js
│   │   ├── interaction/
│   │   │   ├── ClickAction.js
│   │   │   ├── TypeAction.js
│   │   │   ├── SelectAction.js
│   │   │   └── HoverAction.js
│   │   ├── flow-control/
│   │   │   ├── ForEachAction.js
│   │   │   ├── IfAction.js
│   │   │   ├── SwitchAction.js
│   │   │   ├── ParallelAction.js
│   │   │   └── TryAction.js
│   │   ├── data/
│   │   │   ├── ExtractAction.js
│   │   │   ├── TransformAction.js
│   │   │   ├── FilterAction.js
│   │   │   ├── MapAction.js
│   │   │   └── HttpRequestAction.js
│   │   └── wait-validate/
│   │       ├── WaitAction.js
│   │       ├── WaitForElementAction.js
│   │       └── WaitForConditionAction.js
│   └── custom/                     # User actions per-project
│       └── [project-name]/
│           └── CustomAction.js
│
├── validators/                     # Validation System
│   ├── BaseValidator.js            # Abstract base
│   ├── ValidatorRegistry.js        # Central registry
│   ├── builtin/
│   │   ├── ElementValidator.js
│   │   ├── ValueValidator.js
│   │   ├── ConditionValidator.js
│   │   ├── NetworkValidator.js
│   │   └── ChainValidator.js       # Chain composition
│   └── custom/
│       └── [project-name]/
│           └── CustomValidator.js
│
├── middleware/                     # Middleware Hooks
│   ├── pre-execution/
│   │   ├── SessionValidator.js
│   │   ├── BrowserHealthCheck.js
│   │   └── RequestLogger.js
│   └── post-execution/
│       ├── ScreenshotCapture.js
│       ├── StateSnapshot.js
│       └── ResponseLogger.js
│
├── providers/                      # Platform-Specific Providers
│   ├── BaseProvider.js             # Provider interface
│   ├── ProviderFactory.js          # Provider factory
│   ├── millware/
│   │   ├── MillwareProvider.js     # Millware implementation
│   │   ├── selectors.json          # CSS selectors
│   │   └── workflows/              # Millware-specific templates
│   ├── generic/
│   │   └── GenericWebProvider.js   # Generic web automation
│   └── [future-platforms]/         # Easy to add new platforms
│
├── database/                       # Persistence Layer
│   ├── DatabaseService.js          # Main DB service
│   ├── schema.sql                  # Database schema
│   ├── migrations/                 # Migration files
│   └── repositories/
│       ├── TemplateRepository.js
│       ├── ExecutionRepository.js
│       └── SnapshotRepository.js
│
├── api/                            # REST API (optional)
│   ├── server.js                   # Express server
│   ├── routes/
│   │   ├── templates.js
│   │   ├── executions.js
│   │   └── providers.js
│   └── middleware/
│
├── web-ui/                         # Visual Editor
│   ├── src/
│   │   ├── components/
│   │   │   ├── Editor/
│   │   │   ├── Nodes/
│   │   │   └── Shared/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── templates/                      # Template Storage
│   ├── generic/                    # Generic templates
│   │   ├── basic-flow.json
│   │   └── data-extraction.json
│   └── providers/                  # Provider-specific
│       └── millware/
│           ├── login.json
│           └── attendance-input.json
│
├── logs/                           # Execution logs
│   ├── executions/                 # Execution logs
│   ├── screenshots/                # Error screenshots
│   └── state/                      # State snapshots
│
├── utils/                          # Utilities
│   ├── logger.js                   # Logging utility
│   ├── helpers.js                  # Helper functions
│   ├── constants.js                # Constants
│   └── uuid.js                     # UUID generator
│
└── docs/                           # Documentation
    ├── README.md
    ├── design/
    ├── api/
    └── guides/
```

## Core Components

### AgentEngine

Main orchestrator yang mengkoordinasikan semua komponen:

```javascript
class AgentEngine {
  constructor(options) {
    this.provider = options.provider;
    this.browserAdapter = options.browserAdapter;
    this.templateEngine = new TemplateEngine();
    this.actionRegistry = new ActionRegistry();
    this.validatorRegistry = new ValidatorRegistry();
    this.fallbackManager = new FallbackManager();
    this.database = new DatabaseService();
  }

  async runTemplate(templateId, context) { }
  async pause() { }
  async resume() { }
  async stop() { }
}
```

### ProviderFactory

Factory pattern untuk creating platform-specific providers:

```javascript
class ProviderFactory {
  static register(name, ProviderClass) { }
  static create(name, config) { }
  static list() { }
}
```

### ActionRegistry

Central registry untuk semua actions:

```javascript
class ActionRegistry {
  register(action) { }
  get(actionType) { }
  list() { }
  registerAlias(alias, actionType) { }
}
```

### ValidatorRegistry

Central registry untuk semua validators:

```javascript
class ValidatorRegistry {
  register(validator) { }
  get(validatorType) { }
  createChain(validators, mode) { }
}
```

## Design Principles

1. **Separation of Concerns**: Setiap layer memiliki responsibility yang jelas
2. **Open/Closed Principle**: Open for extension (new providers, actions), closed for modification
3. **Dependency Inversion**: Core bergantung pada abstractions (interfaces), bukan implementations
4. **Single Responsibility**: Setiap class memiliki satu alasan untuk berubah
5. **DRY (Don't Repeat Yourself)**: Reusable components across platforms

## Technology Stack

| Component | Technology |
|-----------|------------|
| Core Engine | Node.js |
| Browser Automation | Puppeteer (extensible to Playwright, Selenium) |
| Database | SQLite |
| Web UI | React + Vite + React Flow |
| API (optional) | Express.js |

## Migration Path

### Phase 1: Core Foundation
- [ ] Setup project structure
- [ ] Implement core engine (AgentEngine, TemplateEngine)
- [ ] Implement provider factory and base provider
- [ ] Implement action registry with basic actions

### Phase 2: Platform Support
- [ ] Implement Puppeteer adapter
- [ ] Implement MillwareProvider
- [ ] Migrate existing templates

### Phase 3: Advanced Features
- [ ] Implement validator chain system
- [ ] Implement fallback manager
- [ ] Implement database persistence

### Phase 4: Visual Editor
- [ ] Setup React + Vite project
- [ ] Implement FlowEditor with React Flow
- [ ] Implement custom node components
- [ ] Implement properties panel

### Phase 5: Testing & Documentation
- [ ] Unit tests
- [ ] Integration tests
- [ ] Complete documentation
