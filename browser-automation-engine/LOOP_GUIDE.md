# Loop dan Data-Driven Automation - Panduan Lengkap

## 📚 Overview

Browser Automation Engine sekarang mendukung **data-driven automation** dengan kemampuan:
- ✅ Load data dari file JSON eksternal
- ✅ Variable substitution (`${variable.path}`)
- ✅ Looping (forEach, forEachProperty)
- ✅ Conditional logic (if/else)

---

## 🔄 Action Baru untuk Looping

### 1. `forEach` - Loop Array

Loop through array data (contoh: list karyawan).

**Template:**
```json
{
  "action": "forEach",
  "params": {
    "items": "data.data",
    "itemName": "employee",
    "steps": [
      {
        "action": "log",
        "params": {
          "message": "Employee: ${employee.EmployeeName}"
        }
      }
    ]
  }
}
```

**Parameters:**
- `items`: Path ke array dalam context (contoh: `"data.data"`)
- `itemName`: Nama variable untuk setiap item (contoh: `"employee"`)
- `steps`: Array actions yang dijalankan per item

**Context yang tersedia di dalam loop:**
- `${employee}` - current item
- `${index}` - index (0, 1, 2, ...)
- `${isFirst}` - boolean, true jika item pertama
- `${isLast}` - boolean, true jika item terakhir

---

### 2. `forEachProperty` - Loop Object Properties

Loop through properties dari sebuah object (contoh: tanggal dalam Attendance).

**Template:**
```json
{
  "action": "forEachProperty",
  "params": {
    "object": "employee.Attendance",
    "keyName": "date",
    "valueName": "attendance",
    "steps": [
      {
        "action": "log",
        "params": {
          "message": "Date: ${date}, Hours: ${attendance.regularHours}"
        }
      }
    ]
  }
}
```

**Parameters:**
- `object`: Path ke object dalam context
- `keyName`: Nama variable untuk key (default: `"key"`)
- `valueName`: Nama variable untuk value (default: `"value"`)
- `steps`: Array actions yang dijalankan per property

---

### 3. `if` - Conditional Logic

Execute steps berdasarkan kondisi.

**Template:**
```json
{
  "action": "if",
  "params": {
    "condition": "attendance.regularHours",
    "thenSteps": [
      {
        "action": "log",
        "params": { "message": "Regular hours ada" }
      }
    ],
    "elseSteps": [
      {
        "action": "log",
        "params": { "message": "Regular hours kosong" }
      }
    ]
  }
}
```

**Parameters:**
- `condition`: Expression untuk dievaluasi (simple truthiness check)
- `thenSteps`: Steps jika condition = true
- `elseSteps`: Steps jika condition = false (optional)

---

### 4. `log` - Debug Logging

Print message ke console untuk debugging.

**Template:**
```json
{
  "action": "log",
  "params": {
    "message": "Processing: ${employee.name}",
    "value": "${employee.id}"
  }
}
```

---

## 📊 Variable Substitution

Gunakan syntax `${path.to.variable}` untuk mengakses data dari context.

**Contoh:**
```json
{
  "action": "typeInput",
  "params": {
    "selector": "#employeeId",
    "value": "${employee.PTRJEmployeeID}"
  }
}
```

**Nested path:**
- `${data.metadata.export_date}` ✅
- `${employee.Attendance.2025-12-01.regularHours}` ❌ (gunakan forEachProperty)

---

## 📁 Load Data dari File JSON

Di template, tambahkan property `dataFile`:

```json
{
  "name": "Template dengan Data",
  "dataFile": "testing_data/export_attendance.json",
  "steps": [
    {
      "action": "forEach",
      "params": {
        "items": "data.data",
        "itemName": "employee",
        "steps": [ ... ]
      }
    }
  ]
}
```

Data akan di-load otomatis ke `context.data`.

---

## 🎯 Contoh Kasus: Attendance Input

### Struktur Data
```json
{
  "data": [
    {
      "EmployeeID": "PTRJ.241000004",
      "EmployeeName": "Adyka",
      "PTRJEmployeeID": "POM00213",
      "ChargeJob": "(GA9010) VEHICLE RUNNING / BE001 ...",
      "Attendance": {
        "2025-12-01": {
          "date": "2025-12-01",
          "regularHours": null,
          "overtimeHours": 2
        },
        "2025-12-02": {
          "date": "2025-12-02",
          "regularHours": 7,
          "overtimeHours": 0
        }
      }
    }
  ]
}
```

### Template Looping

```json
{
  "action": "forEach",
  "params": {
    "items": "data.data",
    "itemName": "employee",
    "steps": [
      {
        "comment": "Loop per Employee",
        "action": "forEachProperty",
        "params": {
          "object": "employee.Attendance",
          "keyName": "date",
          "valueName": "attendance",
          "steps": [
            {
              "comment": "Input Regular jika ada",
              "action": "if",
              "params": {
                "condition": "attendance.regularHours",
                "thenSteps": [
                  {
                    "action": "typeInput",
                    "params": {
                      "selector": "#date",
                      "value": "${attendance.date}"
                    }
                  },
                  {
                    "action": "click",
                    "params": {
                      "selector": "#normalRadio"
                    }
                  },
                  {
                    "action": "typeInput",
                    "params": {
                      "selector": "#hours",
                      "value": "7.0"
                    }
                  }
                ]
              }
            },
            {
              "comment": "Input Overtime jika ada",
              "action": "if",
              "params": {
                "condition": "attendance.overtimeHours",
                "thenSteps": [
                  {
                    "action": "click",
                    "params": {
                      "selector": "#overtimeRadio"
                    }
                  },
                  {
                    "action": "typeInput",
                    "params": {
                      "selector": "#hours",
                      "value": "${attendance.overtimeHours}"
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    ]
  }
}
```

---

## 🏃 Cara Menjalankan

```bash
node index.js attendance-input-loop
```

---

## 📝 Penanda di Template untuk Looping

### Komen untuk Dokumentasi
```json
{
  "comment": "═══════════════════════════════════════════",
  "comment2": "BAGIAN LOOPING DIMULAI DI SINI",
  "comment3": "═══════════════════════════════════════════",
  "action": "forEach",
  "params": { ... }
}
```

Field `comment`, `comment2`, `comment3` akan diabaikan oleh engine (documentation purposes).

---

## ⚠️ Limitasi Saat Ini

1. **Conditional evaluation**: Hanya simple truthiness check (ada/tidak ada, true/false)
2. **No arithmetic**: Tidak bisa operasi matematika dalam condition
3. **No string comparison**: Tidak bisa `if value === "something"`

Untuk logic kompleks, pertimbangkan JavaScript preprocessing atau enhancement engine lebih lanjut.

---

## 🚀 Tips & Best Practices

1. **Gunakan `log` action** untuk debugging selama development
2. **Nested loops**: Maksimal 2-3 level untuk readability
3. **Variable naming**: Gunakan nama yang descriptive (`employee`, `attendance`, bukan `item`, `obj`)
4. **Error handling**: Tambahkan `wait` action setelah click/type untuk stabilitas
5. **Test data**: Mulai dengan 1-2 records saja sebelum full dataset

---

## 📚 Referensi Template Lengkap

Lihat: `templates/attendance-input-loop.json` untuk implementasi lengkap dengan:
- Nested loops (employee → dates)
- Conditional input (regular vs overtime)
- Variable substitution
- Error handling dengan wait actions
