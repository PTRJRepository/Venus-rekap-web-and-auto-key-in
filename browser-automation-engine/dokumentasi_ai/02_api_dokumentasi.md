# Browser Automation Engine - API Dokumentasi

## 1. Daftar Actions (Aksi Tersedia)

Actions adalah fungsi-fungsi yang dapat dipanggil dalam template untuk melakukan operasi pada browser.

### 1.1 Navigation Actions

#### `navigate`

Navigasi ke URL tertentu.

```json
{
  "action": "navigate",
  "params": {
    "url": "http://example.com",
    "waitUntil": "networkidle2"
  }
}
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `url` | string | **required** | URL target |
| `waitUntil` | string | "networkidle2" | Kondisi wait: load, domcontentloaded, networkidle0, networkidle2 |

---

#### `reloadPage`

Reload halaman saat ini.

```json
{
  "action": "reloadPage",
  "params": {}
}
```

---

### 1.2 Input Actions

#### `typeInput` / `type`

Mengetik teks ke dalam input field.

```json
{
  "action": "typeInput",
  "params": {
    "selector": "#txtUsername",
    "value": "${employee.name}",
    "clear": true,
    "delay": 50
  }
}
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `selector` | string | **required** | CSS selector elemen target |
| `value` | string | **required** | Teks yang akan diketik |
| `clear` | boolean | true | Hapus isi field sebelum mengetik |
| `delay` | number | 50 | Delay antar ketikan (ms) |

---

#### `typeAtIndex`

Mengetik ke input field berdasarkan index (untuk elemen dengan selector yang sama).

```json
{
  "action": "typeAtIndex",
  "params": {
    "selector": ".input-field",
    "index": 0,
    "value": "text value"
  }
}
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `selector` | string | **required** | CSS selector |
| `index` | number | 0 | Index elemen (0-based) |
| `value` | string | **required** | Teks yang akan diketik |

---

#### `select` / `selectOption`

Memilih opsi dari dropdown select.

```json
{
  "action": "select",
  "params": {
    "selector": "#dropdown",
    "value": "option_value"
  }
}
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `selector` | string | **required** | CSS selector elemen select |
| `value` | string | **required** | Value opsi yang akan dipilih |

---

### 1.3 Click Actions

#### `click`

Mengklik elemen.

```json
{
  "action": "click",
  "params": {
    "selector": "#btnSubmit",
    "waitForNavigation": true,
    "timeout": 30000
  }
}
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `selector` | string | **required** | CSS selector elemen |
| `waitForNavigation` | boolean | false | Tunggu navigasi setelah klik |
| `timeout` | number | 30000 | Timeout dalam ms |

---

#### `clickAndWait`

Klik dan tunggu elemen tertentu muncul.

```json
{
  "action": "clickAndWait",
  "params": {
    "clickSelector": "#btnOpen",
    "waitSelector": ".modal",
    "timeout": 10000
  }
}
```

---

#### `clickAtPosition`

Klik pada posisi tertentu di dalam elemen.

```json
{
  "action": "clickAtPosition",
  "params": {
    "selector": ".canvas",
    "x": 100,
    "y": 50
  }
}
```

---

### 1.4 Wait Actions

#### `waitForElement`

Menunggu elemen muncul di DOM.

```json
{
  "action": "waitForElement",
  "params": {
    "selector": ".popup",
    "visible": true,
    "timeout": 10000
  }
}
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `selector` | string | **required** | CSS selector |
| `visible` | boolean | true | Elemen harus terlihat |
| `timeout` | number | 10000 | Timeout dalam ms |

---

#### `waitForElementHidden`

Menunggu elemen menghilang.

```json
{
  "action": "waitForElementHidden",
  "params": {
    "selector": ".loading",
    "timeout": 30000
  }
}
```

---

#### `waitForPageStable`

Menunggu halaman stabil (tidak ada network activity).

```json
{
  "action": "waitForPageStable",
  "params": {
    "timeout": 5000,
    "interval": 500
  }
}
```

---

#### `wait`

Jeda waktu sederhana.

```json
{
  "action": "wait",
  "params": {
    "duration": 2000
  }
}
```

---

### 1.5 Control Flow Actions

#### `loop`

Melakukan iterasi array dan mengeksekusi steps untuk setiap item.

```json
{
  "action": "loop",
  "params": {
    "array": "${data.employees}",
    "variable": "employee",
    "steps": [
      {
        "action": "typeInput",
        "params": {
          "selector": "#name",
          "value": "${employee.name}"
        }
      }
    ]
  }
}
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `array` | string/array | **required** | Path ke array dalam context atau array langsung |
| `variable` | string | "item" | Nama variabel untuk item saat ini |
| `steps` | array | **required** | Langkah-langkah yang akan diulang |

---

#### `condition` / `if`

Eksekusi kondisional.

```json
{
  "action": "condition",
  "params": {
    "condition": "${employee.hasOvertime}",
    "thenSteps": [
      { "action": "click", "params": { "selector": "#overtimeBtn" } }
    ],
    "elseSteps": [
      { "action": "click", "params": { "selector": "#regularBtn" } }
    ]
  }
}
```

---

#### `include`

Menjalankan template lain sebagai sub-routine.

```json
{
  "action": "include",
  "params": {
    "template": "login-flow",
    "params": {
      "username": "${env.USER}",
      "password": "${env.PASS}"
    }
  }
}
```

---

### 1.6 Data Actions

#### `setVariable`

Mengatur variabel dalam context.

```json
{
  "action": "setVariable",
  "params": {
    "variable": "metadata.retryCount",
    "value": 0
  }
}
```

---

#### `log`

Mencetak log ke console.

```json
{
  "action": "log",
  "params": {
    "message": "Processing employee: ${employee.name}"
  }
}
```

---

### 1.7 Verification Actions

#### `verifyEmployeeSync`

Memverifikasi status sinkronisasi karyawan dengan database.

```json
{
  "action": "verifyEmployeeSync",
  "params": {}
}
```

**Side Effects:**
- `context.retryNeeded` - Boolean indicating if retry is needed
- `context.employeeFailed` - Boolean indicating if employee failed
- `context.failedDates` - Array of dates that failed
- `context.failedRecords` - Array of failed records for CSV export

---

#### `checkElement`

Memeriksa kondisi elemen.

```json
{
  "action": "checkElement",
  "params": {
    "selector": ".error-message",
    "exists": false,
    "saveTo": "hasError"
  }
}
```

---

### 1.8 Special Actions

#### `retryInputWithValidation`

Mengetik dengan validasi dan retry otomatis.

```json
{
  "action": "retryInputWithValidation",
  "params": {
    "selector": "#employeeId",
    "value": "${employee.ptrjId}",
    "validationSelector": ".autocomplete-item",
    "maxRetries": 3,
    "retryDelay": 500
  }
}
```

---

#### `selectAutocomplete`

Memilih item dari autocomplete dropdown.

```json
{
  "action": "selectAutocomplete",
  "params": {
    "inputSelector": "#employeeSearch",
    "value": "${employee.name}",
    "itemSelector": ".ui-autocomplete-item",
    "matchType": "contains"
  }
}
```

---

#### `handleDialog`

Menangani dialog/alert browser.

```json
{
  "action": "handleDialog",
  "params": {
    "accept": true,
    "text": ""
  }
}
```

---

#### `screenshot`

Mengambil screenshot.

```json
{
  "action": "screenshot",
  "params": {
    "path": "logs/screenshot_${timestamp}.png",
    "fullPage": true
  }
}
```

---

## 2. AutomationEngine API

### 2.1 Constructor

```javascript
const engine = new AutomationEngine(options);
```

| Option | Tipe | Default | Deskripsi |
|--------|------|---------|-----------|
| `headless` | boolean | false | Jalankan browser tanpa GUI |
| `slowMo` | number | 0 | Delay antar aksi (ms) |
| `screenshot` | boolean | true | Ambil screenshot saat error |
| `inputBlocking` | boolean | false | Blokir input user |
| `engineId` | string | 'default' | Identifier untuk engine |
| `userDataDir` | string | null | Direktori profile Chrome |

---

### 2.2 Methods

#### `runTemplate(templateName, context)`

Menjalankan template dengan context tertentu.

```javascript
await engine.runTemplate('attendance-input-loop', {
    metadata: { period_start: '2024-01-01', period_end: '2024-01-31' }
});
```

---

#### `loadTemplate(templateName)`

Memuat template dari file JSON.

```javascript
const template = engine.loadTemplate('template-flow');
// Returns: { name, description, steps, ... }
```

---

#### `executeSteps(steps, context)`

Mengeksekusi array langkah secara manual.

```javascript
await engine.executeSteps([
    { action: 'navigate', params: { url: 'http://example.com' } },
    { action: 'click', params: { selector: '#btn' } }
], { customVar: 'value' });
```

---

#### `launch()`

Meluncurkan browser Chrome.

```javascript
await engine.launch();
```

---

#### `closeBrowser()`

Menutup browser.

```javascript
await engine.closeBrowser();
```

---

#### `substituteVariables(text, context)`

Substitusi variabel dalam string.

```javascript
const result = engine.substituteVariables('Hello ${user.name}', {
    user: { name: 'John' }
});
// Returns: 'Hello John'
```

---

### 2.3 Connection Methods

#### `isConnectionAlive()`

Memeriksa apakah koneksi browser masih aktif.

```javascript
const alive = await engine.isConnectionAlive();
// Returns: boolean
```

---

#### `reconnectBrowser()`

Mencoba reconnect browser setelah disconnect.

```javascript
const success = await engine.reconnectBrowser();
// Returns: boolean
```

---

### 2.4 Input Blocking Methods

#### `enableInputBlocking()`

Mengaktifkan blokir input user.

```javascript
await engine.enableInputBlocking();
```

---

#### `disableInputBlocking()`

Menonaktifkan blokir input user.

```javascript
await engine.disableInputBlocking();
```

---

## 3. RecoveryManager API

### 3.1 Constructor

```javascript
const recovery = new RecoveryManager(engineId);
```

---

### 3.2 Methods

#### `saveState(state)`

Menyimpan state ke file.

```javascript
recovery.saveState({
    status: 'RUNNING',
    currentEmployee: 'EMP001',
    lastSuccessStepIndex: 5
});
```

---

#### `loadState()`

Memuat state dari file.

```javascript
const state = recovery.loadState();
// Returns: { status, currentEmployee, ... }
```

---

#### `validateStep(page, step, params)`

Memvalidasi apakah step perlu dijalankan.

```javascript
const validation = await recovery.validateStep(page, step, params);
// Returns: { shouldSkip: boolean, reason: string }
```

---

#### `clearState()`

Menghapus state file.

```javascript
recovery.clearState();
```

---

## 4. DistributedLock API

### 4.1 Constructor

```javascript
const lock = new DistributedLock('resource-name', '/path/to/locks');
```

---

### 4.2 Methods

#### `acquire(timeoutMs)`

Mencoba mengakuisisi lock.

```javascript
const acquired = await lock.acquire(30000);
// Returns: boolean
```

---

#### `release()`

Melepaskan lock.

```javascript
lock.release();
```

---

#### `withLock(fn, timeoutMs)`

Eksekusi fungsi dengan lock.

```javascript
const result = await lock.withLock(async () => {
    // Critical section
    return await someOperation();
}, 30000);
```

---

## 5. Utility Functions

### 5.1 Selector Utilities (`utils/selectors.js`)

#### `waitForElement(page, selector, timeout)`

```javascript
await waitForElement(page, '#myElement', 5000);
```

---

#### `safeType(page, selector, text)`

Mengetik dengan aman (clear field terlebih dahulu).

```javascript
await safeType(page, '#input', 'text value');
```

---

#### `safeTypeAtIndex(page, selector, index, text)`

Mengetik ke elemen berdasarkan index.

```javascript
await safeTypeAtIndex(page, '.input', 0, 'text value');
```

---

#### `captureErrorScreenshot(page, errorMessage)`

Mengambil screenshot saat error.

```javascript
await captureErrorScreenshot(page, 'Element not found');
```

---

## 6. Context Object

Context adalah objek yang menyimpan data dan state selama eksekusi template.

### 6.1 Struktur Context

```javascript
{
    // Data dari dataFile template
    data: {
        employees: [...],
        metadata: { period_start, period_end }
    },
    
    // Metadata dari dataFile
    metadata: {
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        onlyOvertime: false
    },
    
    // Current item dalam loop
    employee: {
        EmployeeID: 'EMP001',
        EmployeeName: 'John Doe',
        PTRJEmployeeID: 'PTRJ001',
        Attendance: {
            '2024-01-01': { status: 'HADIR', regularHours: 8 }
        }
    },
    
    // Loop index
    loopIndex: 0,
    
    // Retry state
    retryNeeded: false,
    employeeFailed: false,
    failedDates: [],
    failedRecords: [],
    
    // Custom variables
    customVar: 'value'
}
```

### 6.2 Mengakses Context dalam Template

```json
{
  "action": "typeInput",
  "params": {
    "value": "${employee.EmployeeName}"
  }
}
```

---

## 7. Template JSON Schema

### 7.1 Struktur Lengkap

```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "dataFile": "string (optional) - path relatif ke file data JSON",
  "steps": [
    {
      "action": "string (required) - nama aksi",
      "params": {
        "...": "object - parameter aksi"
      }
    }
  ]
}
```

### 7.2 Validasi Template

Engine memvalidasi:
1. Properti `name` harus ada
2. Properti `steps` harus ada dan berupa array
3. Setiap step harus memiliki properti `action`
4. Aksi harus terdaftar di `actions/index.js`

---

## 8. Error Codes

| Code | Deskripsi |
|------|-----------|
| `TEMPLATE_NOT_FOUND` | Template file tidak ditemukan |
| `INVALID_TEMPLATE` | Struktur template tidak valid |
| `ACTION_NOT_FOUND` | Aksi tidak dikenali |
| `ELEMENT_NOT_FOUND` | Elemen tidak ditemukan dalam timeout |
| `BROWSER_DISCONNECTED` | Browser terputus |
| `SESSION_EXPIRED` | Session expired, perlu re-login |
| `NAVIGATION_TIMEOUT` | Timeout saat navigasi |
| `CONNECTION_LOST` | Koneksi ke browser hilang |

---

## 9. Events

### 9.1 Browser Events

```javascript
engine.browser.on('disconnected', () => {
    console.log('Browser disconnected');
});

engine.page.on('error', (error) => {
    console.log('Page crashed:', error);
});

engine.page.on('close', () => {
    console.log('Page closed');
});
```

### 9.2 Custom Events dalam Template

```json
{
  "action": "log",
  "params": {
    "message": "Custom event: employee ${employee.EmployeeID} processed"
  }
}
```

---

## 10. Best Practices

### 10.1 Selector Strategy

```javascript
// Good: Specific selectors
"#MainContent_btnSubmit"
"input[name='employeeId']"
".ui-autocomplete-item:first-child"

// Avoid: Generic selectors that might match multiple elements
"div"
"input"
".btn"
```

### 10.2 Error Handling dalam Template

```json
{
  "action": "waitForElement",
  "params": {
    "selector": ".error-popup",
    "timeout": 5000
  }
},
{
  "action": "condition",
  "params": {
    "condition": "${errorFound}",
    "thenSteps": [
      { "action": "log", "params": { "message": "Error detected" } }
    ]
  }
}
```

### 10.3 Resource Management

```javascript
// Gunakan headless mode untuk production
const engine = new AutomationEngine({ headless: true });

// Batasi memory untuk parallel execution
// .env
CHROME_MEMORY_LIMIT=512
AUTOMATION_INSTANCES=5