# Browser Automation Engine - Dokumentasi Arsitektur

## 1. Gambaran Umum

Browser Automation Engine adalah sistem otomasi berbasis Puppeteer yang dirancang untuk mengotomatisasi interaksi dengan aplikasi web Millware. Engine ini menggunakan pendekatan **template-based** yang memungkinkan definisi alur otomasi dalam format JSON tanpa perlu mengubah kode program.

### 1.1 Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| **Template-Based Execution** | Alur otomasi didefinisikan dalam file JSON yang dapat dimodifikasi tanpa perubahan kode |
| **Parallel Execution** | Mendukung menjalankan N instance browser secara paralel dengan load balancing otomatis |
| **Recovery System** | Sistem pemulihan otomatis saat browser disconnect atau terjadi error |
| **Input Blocking** | Mencegah interaksi user selama otomasi berjalan (Gatekeeper Mode) |
| **Heartbeat Monitoring** | Monitoring kesehatan proses dengan heartbeat file |
| **Distributed Locking** | File-based locking untuk mencegah race condition pada operasi paralel |

---

## 2. Struktur Folder

```
browser-automation-engine/
├── engine.js              # Core engine class (AutomationEngine)
├── index.js               # CLI entry point untuk single execution
├── parallel-runner.js     # Parallel execution manager
├── worker.js              # Worker process untuk parallel execution
├── package.json           # Dependencies definition
│
├── actions/               # Modul aksi yang dapat digunakan dalam template
│   ├── index.js           # Daftar semua aksi tersedia
│   └── recovery-actions.js # Aksi khusus untuk recovery
│
├── utils/                 # Helper functions
│   ├── selectors.js       # Fungsi utilitas untuk seleksi elemen DOM
│   └── recovery.js        # RecoveryManager class
│
├── templates/             # Template JSON untuk alur otomasi
│   ├── _attendance_logic.json    # Template utama input absensi
│   ├── attendance-input-loop.json # Template dengan loop support
│   └── ...                       # Template lainnya
│
├── testing_data/          # Data testing untuk otomasi
│   └── current_data.json  # Data karyawan dan absensi
│
├── chrome_data/           # Chrome user profiles untuk parallel execution
│   ├── engine_1/          # Profile untuk Engine 1
│   ├── engine_2/          # Profile untuk Engine 2
│   └── ...
│
├── logs/                  # Log files dan heartbeat
│   └── heartbeat_engine_*.json
│
├── locks/                 # Distributed lock files
│   └── *.lock
│
└── state/                 # State files untuk recovery
    └── engine_*.json
```

---

## 3. Komponen Utama

### 3.1 AutomationEngine Class (`engine.js`)

Class utama yang mengelola lifecycle browser dan eksekusi template.

```javascript
class AutomationEngine {
    constructor(options = {}) {
        this.browser = null;           // Puppeteer browser instance
        this.page = null;              // Active page instance
        this.headless = false;         // Headless mode flag
        this.slowMo = 0;               // Slow motion delay
        this.screenshot = true;        // Screenshot on error
        this.inputBlocking = false;    // Input blocking flag
        this.engineId = 'default';     // Engine identifier
        this.userDataDir = null;       // Chrome profile directory
        this.recoveryManager = null;   // Recovery manager instance
    }
}
```

#### Key Methods:

| Method | Deskripsi |
|--------|-----------|
| `launch()` | Meluncurkan browser Chrome dengan konfigurasi optimasi resource |
| `runTemplate(templateName, context)` | Menjalankan template dengan context tertentu |
| `executeSteps(steps, context)` | Mengeksekusi array langkah-langkah template |
| `loadTemplate(templateName)` | Memuat dan memvalidasi template JSON |
| `substituteVariables(text, context)` | Substitusi variabel `${path}` dengan nilai dari context |
| `closeBrowser()` | Menutup browser secara manual |

### 3.2 Parallel Runner (`parallel-runner.js`)

Mengelola eksekusi paralel dengan N engine instance.

```javascript
// Konfigurasi Environment Variables
AUTOMATION_INSTANCES = 3;      // Jumlah instance paralel
ENGINE_START_DELAY = 500;      // Delay antar start engine (ms)
HEARTBEAT_TIMEOUT = 120000;    // Timeout untuk watchdog (ms)
MAX_ENGINE_RESTARTS = 10;      // Maximum restart attempts
HEADLESS = false;              // Headless mode
```

#### Fitur Parallel Runner:

1. **Employee Partitioning** - Membagi data karyawan secara merata ke setiap engine
2. **Staggered Start** - Memulai engine dengan delay untuk menghindari resource spike
3. **Watchdog Process** - Monitoring heartbeat dan restart engine yang stuck/crash
4. **Dynamic Load Balancing** - Menyesuaikan jumlah instance berdasarkan resource tersedia

### 3.3 Actions Module (`actions/index.js`)

Berisi definisi semua aksi yang dapat digunakan dalam template.

```javascript
const actions = {
    navigate: async (page, params) => { ... },
    typeInput: async (page, params) => { ... },
    click: async (page, params) => { ... },
    waitForElement: async (page, params) => { ... },
    // ... dan lainnya
};
```

### 3.4 Recovery Manager (`utils/recovery.js`)

Mengelola state recovery dan validasi step.

```javascript
class RecoveryManager {
    constructor(engineId) {
        this.engineId = engineId;
        this.stateFile = `state/engine_${engineId}.json`;
    }
    
    saveState(state) { ... }
    loadState() { ... }
    validateStep(page, step, params) { ... }
}
```

---

## 4. Alur Eksekusi

### 4.1 Single Execution Flow

```
┌─────────────────┐
│   index.js      │
│   (CLI Entry)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AutomationEngine│
│  runTemplate()  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    launch()     │
│  Start Browser  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  loadTemplate() │
│  Parse JSON     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ executeSteps()  │
│  Loop Steps     │◄─────────────┐
└────────┬────────┘              │
         │                       │
         ▼                       │
┌─────────────────┐              │
│  actions[name]  │              │
│  Execute Action │──────────────┘
└─────────────────┘
```

### 4.2 Parallel Execution Flow

```
┌─────────────────────┐
│  parallel-runner.js │
│     (Manager)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ partitionEmployees()│
│   Split Data        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│    Engine 1         │     │    Engine N         │
│   (worker.js)       │ ... │   (worker.js)       │
│                     │     │                     │
│  ┌───────────────┐  │     │  ┌───────────────┐  │
│  │ Automation    │  │     │  │ Automation    │  │
│  │ Engine        │  │     │  │ Engine        │  │
│  └───────────────┘  │     │  └───────────────┘  │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           ▼                           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Heartbeat File     │     │  Heartbeat File     │
│  heartbeat_e1.json  │     │  heartbeat_eN.json  │
└─────────────────────┘     └─────────────────────┘
           │                           │
           └───────────┬───────────────┘
                       ▼
           ┌─────────────────────┐
           │   Watchdog Process  │
           │   Monitor & Restart │
           └─────────────────────┘
```

---

## 5. Template System

### 5.1 Struktur Template

```json
{
  "name": "Nama Template",
  "description": "Deskripsi proses",
  "dataFile": "testing_data/current_data.json",
  "steps": [
    {
      "action": "nama_aksi",
      "params": {
        "selector": "css_selector",
        "value": "${variable.path}"
      }
    }
  ]
}
```

### 5.2 Variable Substitution

Engine mendukung substitusi variabel menggunakan syntax `${path}`:

```javascript
// Context
{
  employee: {
    name: "John Doe",
    id: "EMP001"
  }
}

// Template
{
  "action": "typeInput",
  "params": {
    "value": "${employee.name}"  // Akan menjadi "John Doe"
  }
}
```

### 5.3 Loop Support

Template mendukung loop untuk memproses array data:

```json
{
  "action": "loop",
  "params": {
    "array": "${data.employees}",
    "variable": "employee",
    "steps": [
      { "action": "typeInput", "params": { "value": "${employee.name}" } }
    ]
  }
}
```

---

## 6. Connection Management

### 6.1 Browser Keepalive

Engine menggunakan keepalive mechanism untuk mencegah browser disconnect:

```javascript
startBrowserKeepalive(intervalMs = 2000) {
    setInterval(async () => {
        await this.page.evaluate(() => {
            document.hasFocus();
            Date.now();
        });
    }, intervalMs);
}
```

### 6.2 Disconnect Handling

```javascript
handleDisconnect(reason) {
    this.browserDisconnected = true;
    this.lastDisconnectReason = reason;
    this.stopHeartbeat();
    this.recoveryManager.saveState({
        status: 'DISCONNECTED',
        reason,
        timestamp: Date.now()
    });
}
```

### 6.3 Session Expiry Detection

Engine mendeteksi session expiry secara otomatis:

```javascript
if (currentUrl.includes('ACCESS_CONTROLLER_ERR') ||
    currentUrl.includes('frmErrorMessage.aspx')) {
    throw new Error('SESSION_EXPIRED_AUTO_RESTART');
}
```

---

## 7. Resource Optimization

### 7.1 Chrome Launch Options

```javascript
const launchOptions = {
    headless: this.headless,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--process-per-site',
        '--max_old_space_size=512',
        // ... dan lainnya
    ]
};
```

### 7.2 Memory Management

```javascript
// Auto-adjust instance count based on available memory
const calculateOptimalInstances = (requestedInstances, employeeCount) => {
    const memPerInstance = HEADLESS ? 300 : 800; // MB
    const maxByMemory = Math.floor(freeMemMB * 0.7 / memPerInstance);
    return Math.min(requestedInstances, maxByMemory);
};
```

---

## 8. Error Handling

### 8.1 Screenshot on Error

```javascript
if (this.screenshot && this.page) {
    await captureErrorScreenshot(this.page, error.message);
}
```

### 8.2 State Persistence

```javascript
// Save state on crash
this.recoveryManager.saveState({
    status: 'CRASHED',
    error: error.message
});
```

### 8.3 Failed Employee Tracking

```javascript
// Real-time CSV update for failed employees
await updateFailedEmployeeCSV(failedRecords, context);
```

---

## 9. Security Considerations

### 9.1 Input Blocking (Gatekeeper Mode)

Mencegah user mengganggu otomasi yang sedang berjalan:

```javascript
// Enable blocking
await page.evaluate(AutomationEngine.INPUT_BLOCKING_SCRIPT);

// Disable blocking
await page.evaluate(AutomationEngine.INPUT_UNBLOCKING_SCRIPT);

// Allow Puppeteer actions
await page.evaluate(() => window.__PUPPETEER_ACTING = true);
```

### 9.2 Credential Management

Disarankan menggunakan environment variables:

```javascript
// .env file
MILLWARE_USER=adm075
MILLWARE_PASS=${MILLWARE_PASSWORD}

// Template
{
  "action": "typeInput",
  "params": {
    "value": "${env.MILLWARE_USER}"
  }
}
```

---

## 10. Monitoring & Observability

### 10.1 Heartbeat System

```javascript
heartbeat() {
    fs.writeFileSync(heartbeatFile, JSON.stringify({
        timestamp: Date.now(),
        pid: process.pid,
        engineId: this.engineId
    }));
}
```

### 10.2 Log Files

- `logs/heartbeat_engine_*.json` - Heartbeat status
- `logs/worker_config_*.json` - Worker configuration
- `logs/emp_failed/*.csv` - Failed employee records

---

## 11. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| puppeteer | ^21.0.0 | Browser automation |
| dotenv | latest | Environment variables |

---

## 12. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEADLESS` | false | Run browser in headless mode |
| `SLOW_MO` | 0 | Delay between actions (ms) |
| `SCREENSHOT` | true | Take screenshot on error |
| `INPUT_BLOCKING` | false | Enable input blocking |
| `AUTOMATION_INSTANCES` | 3 | Number of parallel instances |
| `ENGINE_START_DELAY` | 500 | Delay between engine starts (ms) |
| `HEARTBEAT_TIMEOUT` | 120000 | Watchdog timeout (ms) |
| `MAX_ENGINE_RESTARTS` | 10 | Maximum restart attempts |
| `BROWSER_KEEPALIVE_INTERVAL` | 2000 | Keepalive interval (ms) |
| `CHROME_MEMORY_LIMIT` | 0 | Memory limit per instance (MB) |
