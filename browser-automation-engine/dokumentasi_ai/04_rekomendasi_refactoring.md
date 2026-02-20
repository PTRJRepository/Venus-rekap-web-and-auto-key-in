# Browser Automation Engine - Rekomendasi Refactoring

## 1. Analisis Kode Saat Ini

### 1.1 Kekuatan

| Aspek | Deskripsi |
|-------|-----------|
| **Modular Design** | Actions terpisah dari engine, memudahkan penambahan fitur |
| **Template-Based** | Alur otomasi didefinisikan dalam JSON, tidak perlu coding |
| **Parallel Support** | Mendukung eksekusi paralel dengan load balancing |
| **Recovery System** | Sistem pemulihan otomatis saat terjadi error |
| **Heartbeat Monitoring** | Monitoring kesehatan proses |

### 1.2 Area yang Perlu Diperbaiki

| Area | Issue | Prioritas |
|------|-------|-----------|
| **Type Safety** | JavaScript tanpa type checking | High |
| **Error Handling** | Beberapa error tidak tertangani dengan baik | High |
| **Code Duplication** | Duplikasi logika di beberapa tempat | Medium |
| **Testing** | Tidak ada unit test | High |
| **Documentation** | Dokumentasi tidak lengkap | Medium |
| **Configuration** | Konfigurasi tersebar di beberapa file | Low |

---

## 2. Rekomendasi Refactoring

### 2.1 Migrasi ke TypeScript

**Alasan:**
- Type safety mencegah bug runtime
- IDE support lebih baik (autocompletion, refactoring)
- Lebih mudah di-maintain untuk tim besar

**Struktur File Baru:**

```
browser-automation-engine/
src/
  types/
    engine.ts          # Type definitions
    actions.ts         # Action types
    template.ts        # Template types
  core/
    AutomationEngine.ts
    RecoveryManager.ts
    DistributedLock.ts
  actions/
    index.ts
    navigation.ts
    input.ts
    control.ts
  utils/
    selectors.ts
    logger.ts
  templates/
    ...
```

**Contoh Type Definitions:**

```typescript
// types/engine.ts
interface EngineOptions {
  headless?: boolean;
  slowMo?: number;
  screenshot?: boolean;
  inputBlocking?: boolean;
  engineId?: string;
  userDataDir?: string | null;
}

interface Template {
  name: string;
  description?: string;
  dataFile?: string;
  steps: Step[];
}

interface Step {
  action: string;
  params: Record<string, any>;
}

interface Context {
  data?: any;
  metadata?: Record<string, any>;
  employee?: Employee;
  loopIndex?: number;
  retryNeeded?: boolean;
  employeeFailed?: boolean;
  failedDates?: string[];
  failedRecords?: FailedRecord[];
  [key: string]: any;
}

type ActionHandler = (
  page: Page,
  params: Record<string, any>,
  context: Context,
  engine: AutomationEngine
) => Promise<void>;
```

**Migration Steps:**

1. Install TypeScript dan dependencies:
```bash
npm install --save-dev typescript @types/node @types/puppeteer
npm install --save-dev ts-node tsx
```

2. Buat `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

3. Migrasi file satu per satu, mulai dari types

---

### 2.2 Implementasi Unit Testing

**Framework:** Jest atau Vitest

**Struktur Test:**

```
tests/
  unit/
    engine.test.ts
    recovery.test.ts
    selectors.test.ts
    actions/
      navigation.test.ts
      input.test.ts
  integration/
    template-execution.test.ts
    parallel-runner.test.ts
```

**Contoh Test:**

```typescript
// tests/unit/engine.test.ts
import { AutomationEngine } from '../../src/core/AutomationEngine';

describe('AutomationEngine', () => {
  describe('loadTemplate', () => {
    it('should load valid template', () => {
      const engine = new AutomationEngine();
      const template = engine.loadTemplate('test-template');
      expect(template.name).toBe('Test Template');
      expect(template.steps).toBeInstanceOf(Array);
    });

    it('should throw error for invalid template', () => {
      const engine = new AutomationEngine();
      expect(() => engine.loadTemplate('nonexistent'))
        .toThrow('Template "nonexistent" tidak ditemukan');
    });
  });

  describe('substituteVariables', () => {
    it('should substitute simple variable', () => {
      const engine = new AutomationEngine();
      const result = engine.substituteVariables(
        'Hello ${name}',
        { name: 'John' }
      );
      expect(result).toBe('Hello John');
    });

    it('should substitute nested variable', () => {
      const engine = new AutomationEngine();
      const result = engine.substituteVariables(
        '${user.name} - ${user.id}',
        { user: { name: 'John', id: '001' } }
      );
      expect(result).toBe('John - 001');
    });
  });
});
```

**Setup Jest:**

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/']
};
```

---

### 2.3 Pemisahan Actions ke File Terpisah

**Struktur Baru:**

```
actions/
  index.ts            # Export semua actions
  types.ts            # Action types
  navigation.ts       # navigate, reloadPage
  input.ts            # typeInput, select, click
  wait.ts             # waitForElement, wait, waitForPageStable
  control.ts          # loop, condition, include
  data.ts             # setVariable, log
  verification.ts     # verifyEmployeeSync, checkElement
  special.ts          # retryInputWithValidation, selectAutocomplete
```

**Contoh Implementasi:**

```typescript
// actions/navigation.ts
import { Page } from 'puppeteer';
import { ActionHandler } from './types';

export const navigate: ActionHandler = async (page, params) => {
  const { url, waitUntil = 'networkidle2' } = params;
  console.log(`Navigating to: ${url}`);
  await page.goto(url, { waitUntil, timeout: 60000 });
};

export const reloadPage: ActionHandler = async (page) => {
  console.log('Reloading page...');
  await page.reload({ waitUntil: 'domcontentloaded' });
};

// actions/index.ts
export * from './navigation';
export * from './input';
export * from './wait';
export * from './control';
export * from './data';
export * from './verification';
export * from './special';

import * as navigation from './navigation';
import * as input from './input';
import * as wait from './wait';
import * as control from './control';
import * as data from './data';
import * as verification from './verification';
import * as special from './special';

export const actions = {
  ...navigation,
  ...input,
  ...wait,
  ...control,
  ...data,
  ...verification,
  ...special
};
```

---

### 2.4 Improved Error Handling

**Custom Error Classes:**

```typescript
// errors/index.ts
export class AutomationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AutomationError';
  }
}

export class TemplateNotFoundError extends AutomationError {
  constructor(templateName: string) {
    super(
      `Template "${templateName}" tidak ditemukan`,
      'TEMPLATE_NOT_FOUND',
      { templateName }
    );
  }
}

export class ActionNotFoundError extends AutomationError {
  constructor(actionName: string) {
    super(
      `Aksi "${actionName}" tidak dikenali`,
      'ACTION_NOT_FOUND',
      { actionName }
    );
  }
}

export class ElementNotFoundError extends AutomationError {
  constructor(selector: string, timeout: number) {
    super(
      `Elemen "${selector}" tidak ditemukan dalam ${timeout}ms`,
      'ELEMENT_NOT_FOUND',
      { selector, timeout }
    );
  }
}

export class BrowserDisconnectedError extends AutomationError {
  constructor(reason: string) {
    super(
      `Browser terputus: ${reason}`,
      'BROWSER_DISCONNECTED',
      { reason }
    );
  }
}

export class SessionExpiredError extends AutomationError {
  constructor() {
    super(
      'Session expired, perlu re-login',
      'SESSION_EXPIRED'
    );
  }
}
```

**Error Handler Middleware:**

```typescript
// core/ErrorHandler.ts
import { AutomationError } from '../errors';

export class ErrorHandler {
  static async handle(
    error: Error,
    context: {
      page?: Page;
      engine: AutomationEngine;
      step?: Step;
    }
  ): Promise<void> {
    // Log error
    console.error(`[ERROR] ${error.message}`);

    // Take screenshot if page available
    if (context.page && context.engine.screenshot) {
      await captureErrorScreenshot(context.page, error.message);
    }

    // Save state for recovery
    context.engine.recoveryManager.saveState({
      status: 'ERROR',
      error: error.message,
      code: error instanceof AutomationError ? error.code : 'UNKNOWN',
      step: context.step
    });

    // Determine if retry is possible
    if (error instanceof BrowserDisconnectedError) {
      await context.engine.reconnectBrowser();
    }
  }
}
```

---

### 2.5 Configuration Management

**Pusatkan konfigurasi dalam satu file:**

```typescript
// config/index.ts
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

export const config = {
  browser: {
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO || '0'),
    screenshot: process.env.SCREENSHOT !== 'false',
    inputBlocking: process.env.INPUT_BLOCKING === 'true',
    keepaliveInterval: parseInt(process.env.BROWSER_KEEPALIVE_INTERVAL || '2000'),
    memoryLimit: parseInt(process.env.CHROME_MEMORY_LIMIT || '0')
  },
  parallel: {
    instances: parseInt(process.env.AUTOMATION_INSTANCES || '3'),
    startDelay: parseInt(process.env.ENGINE_START_DELAY || '500'),
    heartbeatTimeout: parseInt(process.env.HEARTBEAT_TIMEOUT || '120000'),
    maxRestarts: parseInt(process.env.MAX_ENGINE_RESTARTS || '10')
  },
  paths: {
    templates: path.join(__dirname, '../templates'),
    testingData: path.join(__dirname, '../testing_data'),
    logs: path.join(__dirname, '../logs'),
    state: path.join(__dirname, '../state'),
    locks: path.join(__dirname, '../locks'),
    chromeData: path.join(__dirname, '../chrome_data')
  }
};
```

---

### 2.6 Logging System

**Implementasi Structured Logging:**

```typescript
// utils/logger.ts
import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat)
    }),
    new winston.transports.File({
      filename: 'logs/automation.log'
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    })
  ]
});

// Usage
logger.info('Starting automation', { template: 'attendance-input' });
logger.error('Element not found', { selector: '#employeeId', timeout: 10000 });
```

---

### 2.7 Anti-Detection Measures

**Implementasi Stealth Mode:**

```typescript
// core/AutomationEngine.ts
import puppeteer from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Untuk production, gunakan puppeteer-extra
// import puppeteer from 'puppeteer-extra';
// puppeteer.use(StealthPlugin());

export class AutomationEngine {
  async launch() {
    const options = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    };

    this.browser = await puppeteer.launch(options);
    this.page = await this.browser.newPage();

    // Set user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Hide webdriver
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    // Mock plugins
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
    });

    // Mock languages
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });
  }
}
```

---

### 2.8 Performance Optimizations

**Browser Resource Management:**

```typescript
// core/ResourceManager.ts
import os from 'os';

export class ResourceManager {
  static getSystemResources() {
    return {
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      cpuCount: os.cpus().length,
      loadAvg: os.loadavg()
    };
  }

  static calculateOptimalInstances(
    requestedInstances: number,
    attendanceCount: number
  ): number {
    const { freeMemoryMB, cpuCount } = this.getSystemResources();
    const memPerInstance = config.browser.headless ? 300 : 800;
    const maxByMemory = Math.floor(freeMemoryMB * 0.7 / memPerInstance);
    const maxByCpu = config.browser.headless 
      ? Math.floor(cpuCount * 1.5) 
      : cpuCount;
    const minAttendancePerInstance = 10;
    const maxByAttendance = Math.floor(attendanceCount / minAttendancePerInstance);

    return Math.max(1, Math.min(
      requestedInstances,
      maxByMemory,
      maxByCpu,
      maxByAttendance
    ));
  }

  static async cleanupResources(engineId: string): Promise<void> {
    // Cleanup Chrome profile locks
    const profileDir = path.join(config.paths.chromeData, `engine_${engineId}`);
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    
    for (const file of lockFiles) {
      const filePath = path.join(profileDir, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }
}
```

---

## 3. Prioritas Refactoring

### Phase 1: Foundation (1-2 minggu)

| Task | Effort | Impact |
|------|--------|--------|
| Setup TypeScript | Medium | High |
| Buat type definitions | Low | High |
| Implementasi error classes | Low | High |
| Setup unit testing | Medium | High |

### Phase 2: Core Refactoring (2-3 minggu)

| Task | Effort | Impact |
|------|--------|--------|
| Migrasi engine.js ke TypeScript | High | High |
| Migrasi actions ke file terpisah | Medium | Medium |
| Implementasi structured logging | Low | Medium |
| Pusatkan konfigurasi | Low | Medium |

### Phase 3: Enhancement (2-3 minggu)

| Task | Effort | Impact |
|------|--------|--------|
| Implementasi stealth mode | Medium | High |
| Performance optimizations | Medium | Medium |
| Integration tests | High | High |
| Documentation update | Medium | Medium |

---

## 4. Breaking Changes yang Perlu Diperhatikan

### 4.1 Perubahan Import

```javascript
// Before (JavaScript)
const AutomationEngine = require('./engine');

// After (TypeScript)
import { AutomationEngine } from './core/AutomationEngine';
```

### 4.2 Perubahan Error Handling

```javascript
// Before
try {
  await engine.runTemplate('test');
} catch (error) {
  console.log(error.message);
}

// After
try {
  await engine.runTemplate('test');
} catch (error) {
  if (error instanceof TemplateNotFoundError) {
    // Handle template not found
  } else if (error instanceof ElementNotFoundError) {
    // Handle element not found
  }
}
```

### 4.3 Perubahan Konfigurasi

```javascript
// Before
const headless = process.env.HEADLESS === 'true';

// After
import { config } from './config';
const headless = config.browser.headless;
```

---

## 5. Checklist Refactoring

### 5.1 Sebelum Memulai

- [ ] Backup kode saat ini
- [ ] Buat branch baru untuk refactoring
- [ ] Pastikan semua fitur bekerja dengan baik
- [ ] Dokumentasikan state saat ini

### 5.2 Selama Refactoring

- [ ] Migrasi file satu per satu
- [ ] Jalankan test setelah setiap perubahan
- [ ] Update dokumentasi
- [ ] Review code dengan tim

### 5.3 Setelah Refactoring

- [ ] Jalankan semua test
- [ ] Performance testing
- [ ] Integration testing dengan backend
- [ ] Update deployment scripts

---

## 6. Tools yang Direkomendasikan

| Tool | Purpose |
|------|---------|
| **TypeScript** | Type safety |
| **Jest/Vitest** | Unit testing |
| **ESLint** | Code linting |
| **Prettier** | Code formatting |
| **Winston** | Structured logging |
| **puppeteer-extra** | Anti-detection |
| **dotenv** | Environment variables |
| **nodemon/tsx** | Development hot reload |

---

## 7. Estimasi Waktu dan Resource

| Phase | Duration | Developer | Notes |
|-------|----------|-----------|-------|
| Phase 1 | 1-2 minggu | 1 developer | Foundation work |
| Phase 2 | 2-3 minggu | 1-2 developer | Core refactoring |
| Phase 3 | 2-3 minggu | 1 developer | Enhancement |
| Testing | 1 minggu | 1 developer | Comprehensive testing |
| Documentation | 1 minggu | 1 developer | Update all docs |

**Total: 7-10 minggu**

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking changes | Medium | High | Comprehensive testing |
| Performance regression | Low | Medium | Performance testing |
| Learning curve TypeScript | Medium | Low | Training/documentation |
| Integration issues | Medium | Medium | Integration testing |

---

## 9. Kesimpulan

Refactoring ini akan meningkatkan:

1. **Maintainability** - Kode lebih terstruktur dan mudah dibaca
2. **Reliability** - Type safety dan error handling yang lebih baik
3. **Testability** - Unit test untuk semua komponen
4. **Performance** - Optimasi resource management
5. **Security** - Anti-detection measures

Dengan mengikuti roadmap ini, engine akan menjadi lebih robust dan siap untuk production environment.