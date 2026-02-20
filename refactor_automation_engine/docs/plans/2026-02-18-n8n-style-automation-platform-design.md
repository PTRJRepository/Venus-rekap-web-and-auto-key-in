# n8n-Style Automation Platform Design

**Project:** Venus Automation Studio
**Date:** 2026-02-18
**Status:** Approved
**Author:** Claude + User

---

## Executive Summary

Refactor the browser-automation-engine into a modern, visual, node-based automation platform similar to n8n. The new system will coexist with the legacy template-based engine, providing:

- Visual drag-and-drop flow builder (React UI)
- Modular node system with branching, loops, and error handling
- Multiple data source support (File, API, Database, Backend Services)
- Flexible execution triggers (Manual, Scheduled, Webhook, Event-driven)
- Extensible node creation (code-based + UI builder)

---

## Table of Contents

1. [Overall Architecture](#1-overall-architecture)
2. [Node System & Flow Execution](#2-node-system--flow-execution)
3. [Data Source Architecture](#3-data-source-architecture)
4. [Frontend Flow Builder UI](#4-frontend-flow-builder-ui)
5. [Backend Architecture](#5-backend-architecture)
6. [Automation Engine Refactor](#6-automation-engine-refactor)
7. [Directory Structure](#7-directory-structure)
8. [Technology Stack](#8-technology-stack)

---

## 1. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEW REFACTORED SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      FRONTEND (React/Vite)                            │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │  │
│  │  │ Flow Builder   │  │ Flow Library   │  │ Execution Monitor      │  │  │
│  │  │ (Drag & Drop)  │  │ (Templates)    │  │ (Real-time Status)     │  │  │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    ↕ API                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      BACKEND (Express)                                 │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │  │
│  │  │ Flow Engine    │  │ Node Registry  │  │ Execution Manager      │  │  │
│  │  │ (orchestration)│  │ (node types)   │  │ (scheduler/triggers)   │  │  │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘  │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │  │
│  │  │ Data Sources   │  │ State Store    │  │ WebSocket Server       │  │  │
│  │  │ (multi-source) │  │ (persistence)  │  │ (real-time updates)    │  │  │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    ↕                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                AUTOMATION ENGINE (Refactored)                         │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │  │
│  │  │ Node Executor  │  │ Browser Pool   │  │ Recovery Manager       │  │  │
│  │  │ (per-node)     │  │ (Puppeteer)    │  │ (error handling)       │  │  │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │              LEGACY SYSTEM (runs parallel)                            │  │
│  │  Template-based engine → Keep for backward compatibility              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Node System & Flow Execution

### Node Structure

```javascript
{
  "id": "node_abc123",
  "type": "puppeteer.click",
  "name": "Click Submit Button",
  "position": { "x": 100, "y": 200 },
  "parameters": {
    "selector": "#btnSubmit",
    "waitForNavigation": true
  },
  "inputs": [{ "id": "input_1", "sourceNodeId": "node_prev" }],
  "outputs": [
    { "id": "output_success", "label": "Success", "type": "success" },
    { "id": "output_error", "label": "Error", "type": "error" }
  ],
  "retryPolicy": { "maxRetries": 3, "backoffMs": 1000 },
  "timeout": 30000
}
```

### Node Categories

| Category | Node Types |
|----------|------------|
| **Triggers** | Manual, Webhook, Schedule, Event |
| **Data** | File Upload, API Request, DB Query, Backend Service |
| **Browser** | Navigate, Click, Type, Select, WaitFor, Screenshot |
| **Template** | Millware Login, Fill Attendance, Submit Form |
| **Logic** | If/Else, Switch, Merge, Loop, Delay |
| **Transform** | Map, Filter, Reduce, Format, Validate |
| **Output** | Save to File, API Call, Database, Email |
| **Utility** | Log, Comment, Custom Script |

### Execution Context

```javascript
{
  "flowId": "flow_123",
  "executionId": "exec_456",
  "timestamp": "2026-02-18T10:30:00Z",
  "data": { "employee": {...}, "attendance": [...] },
  "variables": { "baseUrl": "...", "timeout": 30000 },
  "errors": [],
  "metadata": { "currentNode": "node_abc", "loopIndex": 5 }
}
```

---

## 3. Data Source Architecture

### Unified Data Source Interface

```javascript
{
  "type": "dataSource",
  "sourceType": "api|file|database|backend|script",
  "outputMode": "stream|batch|single",
  "parameters": { ... }
}
```

### Data Source Implementations

| Source Type | Configuration |
|-------------|---------------|
| **File Upload** | `{ "type": "file", "format": "json|csv|xlsx", "path": "..." }` |
| **API Request** | `{ "type": "api", "method": "GET|POST", "url": "...", "headers": {...} }` |
| **Database Query** | `{ "type": "database", "driver": "mssql|mysql|postgres", "query": "..." }` |
| **Backend Service** | `{ "type": "backend", "service": "attendance|employee", "params": {...} }` |
| **Script Trigger** | `{ "type": "script", "language": "javascript", "code": "..." }` |

---

## 4. Frontend Flow Builder UI

### UI Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Venus Automation Studio                    [Run ▼] [Save] [Export] [Settings]   │
├──────────┬──────────────────────────────────────────────────────────────────────┤
│          │                                                                      │
│  Node    │         Canvas Area (Drag & Drop)                                   │
│  Palette │         ┌─────────────────────────────────────────────────────────┐ │
│          │         │                                                           │ │
│ ──────── │         │    ┌──────────┐      ┌──────────┐      ┌──────────┐    │ │
│ TRIGGERS │         │    │ Webhook  │─────→│  Fetch   │─────→│ Validate │    │ │
│ ──────── │         │    │  Trigger  │      │   API    │      │   Data   │    │ │
│ ◉ Manual │         │    └──────────┘      └──────────┘      └────┬─────┘    │ │
│ ◉ Webhook│         │                                       │              │ │
│ ◉ Schedule│       │                                       ↓              │ │
│          │       │                                 ┌──────────┐          │ │
│ ──────── │       │                            ┌───┤   If     │          │ │
│ DATA     │       │                            │   │  Valid?  ├───┐      │ │
│ ──────── │       │                            │   └────┬─────┘   │      │ │
│ ◉ File   │       │                 Yes ───────┘        │         └──────┘
│ ◉ API    │       │                                 No  │
│ ◉ DB     │       │                                     ↓
│          │       │                            ┌──────────┐
│ ──────── │       │                            │  Log     │
│ BROWSER  │       │                            │  Error   │
│ ──────── │       │                            └──────────┘
│ ◉ Nav    │       │                                                           │
│ ◉ Click  │       │                                                           │
│          │       │                                                           │
├──────────┴───────────────────────────────────────────────────────────────────┤
│  Properties Panel                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Execution Log                                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Frontend Directory Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── flow-builder/
│   │   │   ├── Canvas.tsx
│   │   │   ├── NodePalette.tsx
│   │   │   ├── FlowNode.tsx
│   │   │   ├── ConnectionLine.tsx
│   │   │   └── MiniMap.tsx
│   │   ├── properties/
│   │   │   ├── PropertiesPanel.tsx
│   │   │   └── ParameterFields.tsx
│   │   ├── execution/
│   │   │   ├── ExecutionPanel.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── NodeStatus.tsx
│   │   └── library/
│   │       ├── FlowLibrary.tsx
│   │       └── FlowCard.tsx
│   ├── hooks/
│   │   ├── useFlowStore.ts
│   │   ├── useNodeRegistry.ts
│   │   └── useExecution.ts
│   ├── stores/
│   │   └── flowStore.ts
│   └── types/
│       ├── flow.ts
│       ├── node.ts
│       └── execution.ts
```

---

## 5. Backend Architecture

### Backend Directory Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── flows.ts
│   │   ├── execution.ts
│   │   ├── dataSources.ts
│   │   ├── nodes.ts
│   │   └── templates.ts
│   ├── services/
│   │   ├── flowEngine/
│   │   │   ├── executor.ts
│   │   │   ├── nodeExecutor.ts
│   │   │   ├── contextManager.ts
│   │   │   └── errorHandler.ts
│   │   ├── nodeRegistry/
│   │   │   ├── registry.ts
│   │   │   ├── browserNodes.ts
│   │   │   ├── dataNodes.ts
│   │   │   ├── logicNodes.ts
│   │   │   └── templateNodes.ts
│   │   ├── dataSources/
│   │   │   ├── registry.ts
│   │   │   ├── apiSource.ts
│   │   │   ├── fileSource.ts
│   │   │   └── backendSource.ts
│   │   ├── scheduler/
│   │   │   ├── scheduler.ts
│   │   │   └── triggers.ts
│   │   └── automationEngine/
│   │       ├── browserPool.ts
│   │       └── recovery.ts
│   ├── models/
│   │   ├── Flow.ts
│   │   ├── Execution.ts
│   │   └── Node.ts
│   ├── websocket/
│   │   ├── executionHandler.ts
│   │   └── socketServer.ts
│   └── storage/
│       ├── flowStorage.ts
│       └── executionStorage.ts
```

### API Endpoints

```
POST   /api/flows                    # Create flow
GET    /api/flows                    # List flows
GET    /api/flows/:id                # Get flow
PUT    /api/flows/:id                # Update flow
DELETE /api/flows/:id                # Delete flow
POST   /api/flows/:id/execute        # Execute flow
POST   /api/flows/:id/validate       # Validate flow

GET    /api/executions/:id           # Get execution details
POST   /api/executions/:id/cancel    # Cancel execution

GET    /api/nodes                    # List node types
GET    /api/nodes/:type              # Get node schema

POST   /api/data-sources/execute     # Test data source

POST   /api/webhooks/:flowId         # Webhook trigger
GET    /api/schedules                # List schedules
```

---

## 6. Automation Engine Refactor

### Automation Engine Structure

```
automation-engine/
├── core/
│   ├── BrowserPool.ts              # Pool of Puppeteer instances
│   ├── PageManager.ts              # Page lifecycle
│   ├── NodeExecutor.ts             # Base node class
│   └── RecoveryManager.ts          # Error recovery
├── nodes/
│   ├── browser/
│   │   ├── NavigateNode.ts
│   │   ├── ClickNode.ts
│   │   ├── TypeNode.ts
│   │   ├── SelectNode.ts
│   │   └── CustomScriptNode.ts
│   └── template/
│       ├── MillwareLoginNode.ts
│       └── AttendanceInputNode.ts
└── utils/
    ├── selectors.ts
    └── variableResolver.ts
```

### Browser Pool Manager

```typescript
class BrowserPool {
  private pools: Map<string, BrowserInstance>;

  async acquire(instanceId: string): Promise<BrowserPage>;
  async release(instanceId: string, page: BrowserPage);
  async closeAll();
  getStatus(): PoolStatus;
}
```

### Node Base Class

```typescript
abstract class BrowserNode {
  abstract readonly type: string;
  abstract readonly schema: NodeSchema;

  abstract execute(
    page: Page,
    params: any,
    context: ExecutionContext
  ): Promise<NodeResult>;
}
```

---

## 7. Directory Structure

```
Refactor_web_Rekap_Absen/
├── browser-automation-engine/          # LEGACY - Keep as-is
│   ├── engine.js
│   ├── actions/
│   └── templates/
│
├── refactor_automation_engine/         # NEW - Modern system
│   ├── frontend/                       # React UI
│   ├── backend/                        # Express API
│   ├── automation-engine/              # Refactored engine
│   ├── shared/                         # Shared types
│   ├── docs/
│   │   └── plans/
│   │       └── 2026-02-18-n8n-style-automation-platform-design.md
│   └── README.md
│
└── backend/                            # Existing backend (unchanged)
```

---

## 8. Technology Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | React 19, TypeScript, Vite, React Flow, Zustand, Socket.io-client |
| **Backend** | Express, TypeScript, Socket.io, node-cron |
| **Automation** | Puppeteer, Chrome DevTools Protocol |
| **Storage** | SQLite (flows, executions), File system (logs) |
| **Communication** | WebSocket (real-time), REST API |
| **UI Components** | Material-UI (MUI), React Beautiful DnD |

---

## Success Criteria

1. ✅ Visual drag-and-drop flow builder operational
2. ✅ At least 10 node types implemented (triggers, data, browser, logic, output)
3. ✅ Flow execution with real-time status updates
4. ✅ Legacy templates can be imported and run
5. ✅ Multiple data source support operational
6. ✅ Scheduled and webhook execution working
7. ✅ Parallel execution support (5+ instances)
8. ✅ Complete API documentation
9. ✅ User guide for flow creation

---

## Notes

- The legacy `browser-automation-engine` will remain untouched for backward compatibility
- New system is built from scratch in `refactor_automation_engine`
- Phase 1-2 implementation focus: Core UI + Basic execution
- Phase 3-4 implementation focus: Data sources + Browser nodes
- Phase 5 implementation focus: Legacy integration + Polish
