# Browser Automation Engine - Panduan Automasi

## 1. Quick Start

### 1.1 Instalasi

```bash
# Masuk ke direktori engine
cd browser-automation-engine

# Install dependencies
npm install
```

### 1.2 Menjalankan Template

```bash
# Single execution
node index.js template-flow

# Parallel execution (3 instances default)
node parallel-runner.js

# Parallel execution dengan data file kustom
node parallel-runner.js testing_data/overtime_data.json
```

---

## 2. Membuat Template Baru

### 2.1 Template Sederhana

Buat file `templates/my-template.json`:

```json
{
  "name": "My First Template",
  "description": "Template sederhana untuk demonstrasi",
  "steps": [
    {
      "action": "navigate",
      "params": {
        "url": "http://millwarep3.rebinmas.com:8003/"
      }
    },
    {
      "action": "waitForElement",
      "params": {
        "selector": "#txtUsername",
        "timeout": 10000
      }
    },
    {
      "action": "typeInput",
      "params": {
        "selector": "#txtUsername",
        "value": "adm075"
      }
    },
    {
      "action": "typeInput",
      "params": {
        "selector": "#txtPassword",
        "value": "adm075"
      }
    },
    {
      "action": "click",
      "params": {
        "selector": "#MainContent_btnOkay"
      }
    }
  ]
}
```

### 2.2 Template dengan Data File

Buat file data `testing_data/my-data.json`:

```json
{
  "metadata": {
    "period_start": "2024-01-01",
    "period_end": "2024-01-31"
  },
  "employees": [
    {
      "EmployeeID": "EMP001",
      "EmployeeName": "John Doe",
      "PTRJEmployeeID": "PTRJ001",
      "Attendance": {
        "2024-01-01": { "status": "HADIR", "regularHours": 8 },
        "2024-01-02": { "status": "HADIR", "regularHours": 8, "overtimeHours": 2 }
      }
    }
  ]
}
```

Buat template yang menggunakan data:

```json
{
  "name": "Process Employees",
  "description": "Process employee attendance data",
  "dataFile": "testing_data/my-data.json",
  "steps": [
    {
      "action": "loop",
      "params": {
        "array": "${data.employees}",
        "variable": "employee",
        "steps": [
          {
            "action": "log",
            "params": {
              "message": "Processing: ${employee.EmployeeName}"
            }
          },
          {
            "action": "typeInput",
            "params": {
              "selector": "#employeeId",
              "value": "${employee.PTRJEmployeeID}"
            }
          }
        ]
      }
    }
  ]
}
```

---

## 3. Template untuk Input Absensi

### 3.1 Template Utama

Template utama untuk input absensi adalah [`_attendance_logic.json`](../templates/_attendance_logic.json). Template ini berisi:

1. **Login Flow** - Login ke sistem Millware
2. **Navigation** - Navigasi ke halaman Task Register
3. **Employee Loop** - Loop untuk setiap karyawan
4. **Attendance Input** - Input data absensi per tanggal
5. **Verification** - Verifikasi sinkronisasi dengan database

### 3.2 Struktur Data Absensi

```json
{
  "metadata": {
    "period_start": "2024-01-01",
    "period_end": "2024-01-31",
    "onlyOvertime": false
  },
  "employees": [
    {
      "EmployeeID": "EMP001",
      "EmployeeName": "John Doe",
      "PTRJEmployeeID": "PTRJ001",
      "Attendance": {
        "2024-01-01": {
          "status": "HADIR",
          "regularHours": 8,
          "overtimeHours": 0,
          "chargeJob": "PROJ001"
        },
        "2024-01-02": {
          "status": "HADIR",
          "regularHours": 8,
          "overtimeHours": 2,
          "chargeJob": "PROJ001",
          "otChargeJob": "PROJ002"
        }
      }
    }
  ]
}
```

### 3.3 Status Absensi yang Didukung

| Status | Deskripsi | Input Fields |
|--------|-----------|--------------|
| `HADIR` | Hadir penuh | Regular Hours, Charge Job |
| `HADIR+OT` | Hadir dengan lembur | Regular Hours, OT Hours, Charge Job, OT Charge Job |
| `SAKIT` | Sakit | - |
| `IZIN` | Izin | - |
| `CUTI` | Cuti | - |
| `ALFA` | Tanpa keterangan | - |
| `LIBUR` | Hari libur | - |

---

## 4. Parallel Execution

### 4.1 Konfigurasi Environment

Buat file `.env` di folder `backend/`:

```env
# Browser Configuration
HEADLESS=true
SLOW_MO=0
SCREENSHOT=true
INPUT_BLOCKING=false

# Parallel Execution
AUTOMATION_INSTANCES=5
ENGINE_START_DELAY=500
HEARTBEAT_TIMEOUT=120000
MAX_ENGINE_RESTARTS=10

# Resource Management
BROWSER_KEEPALIVE_INTERVAL=2000
CHROME_MEMORY_LIMIT=512
```

### 4.2 Menjalankan Parallel Execution

```bash
# Dengan konfigurasi default (3 instances)
node parallel-runner.js

# Dengan data file kustom
node parallel-runner.js testing_data/overtime_data.json

# Dengan environment variable
AUTOMATION_INSTANCES=5 HEADLESS=true node parallel-runner.js
```

### 4.3 Monitoring Parallel Execution

**Heartbeat Files:**
```
logs/heartbeat_engine_1.json
logs/heartbeat_engine_2.json
logs/heartbeat_engine_3.json
```

**Worker Config Files:**
```
logs/worker_config_1.json
logs/worker_config_2.json
logs/worker_config_3.json
```

### 4.4 Resource Considerations

| Instances | Headless | RAM Required | CPU Impact |
|-----------|----------|--------------|------------|
| 1-3 | false | 2-4 GB | Low |
| 1-3 | true | 1-2 GB | Low |
| 5-10 | false | 8-16 GB | High |
| 5-10 | true | 4-8 GB | Medium |
| 10+ | true | 8+ GB | High |

**Rekomendasi:**
- Untuk 5+ instances, gunakan `HEADLESS=true`
- Untuk 10+ instances, pastikan RAM 16GB+
- Set `CHROME_MEMORY_LIMIT=512` untuk membatasi memory per instance

---

## 5. Error Handling & Recovery

### 5.1 Automatic Recovery

Engine memiliki sistem recovery otomatis:

1. **Browser Disconnect** - Mencoba reconnect otomatis
2. **Session Expired** - Mendeteksi dan me-restart dari login
3. **Element Not Found** - Retry dengan timeout
4. **Page Crash** - Restart engine

### 5.2 Manual Recovery

```javascript
// Load state dari file
const state = recoveryManager.loadState();

// Lanjutkan dari step tertentu
if (state.lastSuccessStepIndex) {
    // Skip steps yang sudah berhasil
}
```

### 5.3 Failed Employee Tracking

Engine mencatat karyawan yang gagal dalam file CSV:

```
logs/emp_failed/failed_employees_20240115_143022.csv
```

Format CSV:
```csv
Timestamp,EmployeeID,Name,PTRJ_ID,Date,Venus_Status,Venus_Regular_Hours,Venus_OT_Hours,Sync_Status,Reason,Millware_Records_Count,Millware_Total_Hours
2024-01-15 14:30:22,EMP001,John Doe,PTRJ001,2024-01-05,HADIR,8,2,MISS,Transfer gagal - Regular: true, OT: false,0,0
```

---

## 6. Debugging

### 6.1 Mode Debug

Jalankan dengan `HEADLESS=false` dan `SLOW_MO=100`:

```bash
HEADLESS=false SLOW_MO=100 node index.js my-template
```

### 6.2 Screenshot on Error

Screenshot otomatis disimpan saat terjadi error:

```
logs/errors/error_1705315822123.png
```

### 6.3 Console Logging

Tambahkan aksi `log` dalam template:

```json
{
  "action": "log",
  "params": {
    "message": "Current employee: ${employee.EmployeeName}, Date: ${currentDate}"
  }
}
```

### 6.4 Step-by-Step Execution

Gunakan `SLOW_MO` untuk delay antar aksi:

```bash
SLOW_MO=500 node index.js my-template
```

---

## 7. Best Practices

### 7.1 Selector Strategy

**Gunakan selector yang stabil:**

```json
// Good: ID selector
"selector": "#MainContent_btnSubmit"

// Good: Name attribute
"selector": "input[name='employeeId']"

// Good: Data attribute
"selector": "[data-testid='submit-btn']"

// Avoid: Index-based (fragile)
"selector": "div:nth-child(3) > input"
```

### 7.2 Wait Strategy

**Selalu tunggu elemen sebelum berinteraksi:**

```json
{
  "action": "waitForElement",
  "params": {
    "selector": "#employeeId",
    "timeout": 10000
  }
},
{
  "action": "typeInput",
  "params": {
    "selector": "#employeeId",
    "value": "${employee.PTRJEmployeeID}"
  }
}
```

### 7.3 Error Recovery dalam Template

**Gunakan condition untuk handling error:**

```json
{
  "action": "waitForElement",
  "params": {
    "selector": ".error-popup",
    "timeout": 3000
  }
},
{
  "action": "condition",
  "params": {
    "condition": "${errorPopupVisible}",
    "thenSteps": [
      {
        "action": "log",
        "params": { "message": "Error detected, skipping employee" }
      },
      {
        "action": "click",
        "params": { "selector": ".error-popup .close-btn" }
      }
    ]
  }
}
```

### 7.4 Data Validation

**Validasi data sebelum proses:**

```json
{
  "action": "condition",
  "params": {
    "condition": "${employee.PTRJEmployeeID}",
    "thenSteps": [
      { "action": "typeInput", "params": { "value": "${employee.PTRJEmployeeID}" } }
    ],
    "elseSteps": [
      { "action": "log", "params": { "message": "Missing PTRJ ID for ${employee.EmployeeName}" } }
    ]
  }
}
```

---

## 8. Troubleshooting

### 8.1 Browser Tidak Mau Start

**Gejala:** Browser tidak terbuka atau langsung crash

**Solusi:**
1. Pastikan Chrome terinstall
2. Coba jalankan dengan `--no-sandbox`
3. Periksa log error di console

```bash
# Debug mode
HEADLESS=false node index.js my-template
```

### 8.2 Element Tidak Ditemukan

**Gejala:** Timeout menunggu elemen

**Solusi:**
1. Periksa selector di DevTools
2. Tambah timeout
3. Gunakan `waitForPageStable` sebelum interaksi

```json
{
  "action": "waitForPageStable",
  "params": { "timeout": 5000 }
},
{
  "action": "waitForElement",
  "params": {
    "selector": "#myElement",
    "timeout": 15000
  }
}
```

### 8.3 Session Expired

**Gejala:** Redirect ke halaman login atau error page

**Solusi:**
Engine akan otomatis mendeteksi dan restart. Pastikan template memiliki flow login di awal.

### 8.4 Parallel Execution Stuck

**Gejala:** Engine tidak progress, heartbeat tidak update

**Solusi:**
1. Periksa heartbeat file
2. Cek log worker
3. Kill proses yang stuck dan restart

```bash
# Kill all Chrome processes
taskkill /F /IM chrome.exe

# Restart parallel runner
node parallel-runner.js
```

### 8.5 Memory Issues

**Gejala:** Browser crash, system lambat

**Solusi:**
1. Kurangi jumlah instances
2. Aktifkan `HEADLESS=true`
3. Set `CHROME_MEMORY_LIMIT`

```env
AUTOMATION_INSTANCES=3
HEADLESS=true
CHROME_MEMORY_LIMIT=512
```

---

## 9. Contoh Template Lengkap

### 9.1 Login dan Navigasi

```json
{
  "name": "Login and Navigate",
  "description": "Login ke Millware dan navigasi ke Task Register",
  "steps": [
    {
      "action": "navigate",
      "params": {
        "url": "http://millwarep3.rebinmas.com:8003/"
      }
    },
    {
      "action": "waitForElement",
      "params": {
        "selector": "#txtUsername",
        "timeout": 10000
      }
    },
    {
      "action": "typeInput",
      "params": {
        "selector": "#txtUsername",
        "value": "adm075"
      }
    },
    {
      "action": "typeInput",
      "params": {
        "selector": "#txtPassword",
        "value": "adm075"
      }
    },
    {
      "action": "waitForElement",
      "params": {
        "selector": ".PopupBoxLogin",
        "timeout": 10000
      }
    },
    {
      "action": "click",
      "params": {
        "selector": "#MainContent_btnOkay"
      }
    },
    {
      "action": "wait",
      "params": { "duration": 2000 }
    },
    {
      "action": "navigate",
      "params": {
        "url": "http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterList.aspx"
      }
    },
    {
      "action": "click",
      "params": {
        "selector": "#MainContent_btnNew"
      }
    }
  ]
}
```

### 9.2 Input dengan Loop

```json
{
  "name": "Process Attendance Data",
  "description": "Process multiple employees with attendance data",
  "dataFile": "testing_data/current_data.json",
  "steps": [
    {
      "action": "include",
      "params": {
        "template": "login-flow"
      }
    },
    {
      "action": "loop",
      "params": {
        "array": "${data.employees}",
        "variable": "employee",
        "steps": [
          {
            "action": "log",
            "params": {
              "message": "Processing employee ${loopIndex + 1}: ${employee.EmployeeName}"
            }
          },
          {
            "action": "typeInput",
            "params": {
              "selector": "#employeeId",
              "value": "${employee.PTRJEmployeeID}"
            }
          },
          {
            "action": "click",
            "params": {
              "selector": "#searchBtn"
            }
          },
          {
            "action": "waitForPageStable",
            "params": { "timeout": 3000 }
          },
          {
            "action": "loop",
            "params": {
              "array": "${employee.AttendanceDates}",
              "variable": "date",
              "steps": [
                {
                  "action": "include",
                  "params": {
                    "template": "input-attendance",
                    "params": {
                      "date": "${date}",
                      "attendance": "${employee.Attendance[date]}"
                    }
                  }
                }
              ]
            }
          },
          {
            "action": "verifyEmployeeSync",
            "params": {}
          }
        ]
      }
    }
  ]
}
```

---

## 10. Integrasi dengan Backend

### 10.1 API Endpoint

Engine dapat dijalankan melalui API backend:

```javascript
// backend/services/automationService.js
async function runAutomation(data) {
    // Write data to temp file
    const tempFile = `testing_data/temp_${Date.now()}.json`;
    fs.writeFileSync(tempFile, JSON.stringify(data));
    
    // Run parallel runner
    const { stdout, stderr } = await exec(
        `node parallel-runner.js ${tempFile}`
    );
    
    return { success: true, output: stdout };
}
```

### 10.2 Frontend Integration

Frontend dapat memanggil automation melalui API:

```javascript
// frontend/src/services/api.js
export async function runAutomation(data) {
    const response = await fetch('/api/automation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}
```

---

## 11. Maintenance

### 11.1 Cleanup Temporary Files

```bash
# Cleanup temp templates
rm -f templates/_temp_engine_*.json

# Cleanup temp data
rm -f testing_data/_temp_engine_*.json

# Cleanup logs older than 7 days
find logs/ -name "*.log" -mtime +7 -delete
```

### 11.2 Update Selectors

Jika struktur HTML berubah, update selectors di:

1. [`utils/selectors.js`](../utils/selectors.js) - Selector utilities
2. Template JSON files - Selector dalam params

### 11.3 Backup State Files

```bash
# Backup state files
cp -r state/ backup/state_$(date +%Y%m%d)/
```

---

## 12. Security Notes

### 12.1 Credential Management

**Jangan hardcode password dalam template!**

```json
// BAD
{
  "action": "typeInput",
  "params": {
    "value": "mypassword123"
  }
}

// GOOD
{
  "action": "typeInput",
  "params": {
    "value": "${env.MILLWARE_PASS}"
  }
}
```

### 12.2 Input Blocking

Aktifkan input blocking untuk mencegah user mengganggu:

```env
INPUT_BLOCKING=true
```

### 12.3 Session Management

- Logout setelah selesai (opsional)
- Clear cookies untuk session baru
- Gunakan profile terpisah untuk parallel execution