# UpahBersihDetailService - Layanan Detail Aktivitas Upah Bersih

## Gambaran Umum

**UpahBersihDetailService** adalah service yang menyediakan detail aktivitas per karyawan yang berkontribusi pada upah bersih, termasuk detail lembur dan premi. Service ini memungkinkan drill-down ke level transaksi untuk audit dan analisis mendalam.

**File Lokasi**: `backend/src/services/upahBersihDetailService.ts`

## Fitur Utama

### 1. **Detail Lembur**
- List semua transaksi lembur per karyawan
- Tanggal, task code, deskripsi, jam, amount
- Total lembur per karyawan

### 2. **Detail Premi**
- List semua transaksi premi per karyawan
- DocDesc, DocNo, category, amount
- Breakdown premi dinamis

### 3. **Filter Mode**
- `all`: Tampilkan semua karyawan
- `lembur`: Hanya karyawan dengan lembur
- `premi`: Hanya karyawan dengan premi
- `upah_bersih`: Filter berdasarkan threshold upah bersih

### 4. **Grouping**
- Group by gang_code
- Employee list dalam setiap gang
- Summary totals per gang

## Struktur Data

### Interface: ActivityRecord

```typescript
export interface ActivityRecord {
    date: string;           // Tanggal transaksi (YYYY-MM-DD)
    task_code: string;      // Kode task/activity
    task_desc: string;      // Deskripsi task
    hours: number;          // Jam (untuk lembur) atau quantity
    amount: number;         // Nominal rupiah
    category: string;       // Kategori: 'LEMBUR' atau header premi
    doc_desc?: string;      // DocDesc dari transaksi
    doc_no?: string;        // DocNo referensi
    is_overtime: boolean;   // true untuk lembur, false untuk premi
}
```

### Interface: EmployeeDetail

```typescript
export interface EmployeeDetail {
    emp_code: string;           // Employee code
    emp_name: string;           // Nama karyawan
    gang_code: string;          // Kode gang
    division_code: string;      // Kode divisi
    task_code: string;          // Task code utama
    task_desc: string;          // Task description
    hari_kerja: number;         // Hari kerja
    jumlah_hk: number;          // Total HK
    gaji_pokok: number;         // Gaji pokok
    lembur_jam: number;         // Total jam lembur
    lembur_jumlah: number;      // Total amount lembur
    total_premi: number;        // Total premi
    premi_brondol: number;      // Premi brondol
    total_tunjangan: number;    // Total tunjangan
    total_potongan: number;     // Total potongan
    upah_kotor: number;         // Upah kotor
    upah_bersih: number;        // Upah bersih
    pph21: number;              // PPh 21
    activities: ActivityRecord[];  // Detail aktivitas
}
```

### Interface: GangGroup

```typescript
export interface GangGroup {
    gang_code: string;              // Kode gang
    gang_description: string;       // Deskripsi gang
    division_code: string;          // Kode divisi
    employee_count: number;         // Jumlah karyawan
    total_lembur: number;           // Total lembur gang
    total_premi: number;            // Total premi gang
    total_upah_bersih: number;      // Total upah bersih gang
    employees: EmployeeDetail[];    // List karyawan
}
```

### Interface: UpahBersihDetailResult

```typescript
export interface UpahBersihDetailResult {
    success: boolean;
    period_month: number;
    period_year: number;
    filter: FilterMode;             // 'all' | 'lembur' | 'premi' | 'upah_bersih'
    summary: {
        total_employees: number;
        total_gangs: number;
        grand_total_lembur: number;
        grand_total_premi: number;
        grand_total_upah_bersih: number;
        grand_total_upah_kotor: number;
        grand_total_potongan: number;
    };
    gangs: GangGroup[];             // Grouped data
    execution_time_ms: number;      // Performance metric
}
```

## Metode Publik

### 1. getDetail() ⭐

Main entry point untuk mengambil detail upah bersih.

```typescript
public async getDetail(
    periodMonth: number,
    periodYear: number,
    filterMode: FilterMode = 'all',
    divisionCode?: string,
    gangCode?: string
): Promise<UpahBersihDetailResult>
```

**Parameter**:
- `periodMonth`: Bulan periode (1-12)
- `periodYear`: Tahun periode
- `filterMode`: Mode filter (`all`, `lembur`, `premi`, `upah_bersih`)
- `divisionCode`: Filter divisi (optional, 'ALL' untuk semua)
- `gangCode`: Filter gang (optional, 'ALL' untuk semua)

**Proses**:
```
┌─────────────────────────────────────────────────────────────┐
│          ALUR UpahBersihDetailService.getDetail()           │
└─────────────────────────────────────────────────────────────┘

1. Get Master Headers
   └─ payroll_history_header
      WHERE period_month = ? AND period_year = ?
      Filter by division_code, gang_code

2. Get Payroll Details
   └─ payroll_history_detail
      WHERE master_id IN (header_ids)
      Apply filter:
        - lembur: WHERE lembur_jumlah > 0
        - premi: WHERE total_premi > 0
        - all/upah_bersih: No filter

3. Fetch Activity Records
   ├─ If filter == 'lembur' or 'all':
   │  └─ fetchLemburActivities()
   │     └─ history_taskreg WHERE is_lembur = 1
   │
   └─ If filter == 'premi' or 'all':
      └─ fetchPremiActivities()
         └─ history_adtrans WHERE is_premi = 1

4. Build Gang Groups
   ├─ Group employees by gang_code
   ├─ Calculate gang totals
   └─ Sort by gang_code

5. Calculate Summary
   ├─ Count employees & gangs
   ├─ Sum totals (lembur, premi, upah_bersih)
   └─ Return result

6. Performance Tracking
   └─ execution_time_ms = Date.now() - startTime
```

**Contoh Penggunaan**:
```typescript
const detailService = upahBersihDetailService.getInstance();

// Get all employees with full details
const allData = await detailService.getDetail(1, 2026, 'all', 'P1A');

// Get only employees with overtime
const lemburOnly = await detailService.getDetail(1, 2026, 'lembur', 'P1A');

// Get only employees with premi
const premiOnly = await detailService.getDetail(1, 2026, 'premi', 'P1A');

console.log(`Total employees: ${allData.summary.total_employees}`);
console.log(`Total gangs: ${allData.summary.total_gangs}`);
console.log(`Grand total lembur: ${allData.summary.grand_total_lembur}`);
```

---

### 2. fetchLemburActivities()

Mengambil detail aktivitas lembur dari transaction table.

```typescript
private async fetchLemburActivities(
    transDb: Database,
    historyIds: string[],
    periodMonth: number,
    periodYear: number,
    empActivities: Map<string, ActivityRecord[]>,
    gangCode?: string
): Promise<void>
```

**Query**:
```sql
SELECT
    emp_code, gang_code,
    CONVERT(varchar, trx_date, 23) as trx_date_str,
    task_code, task_desc,
    hours, amount, rate
FROM dbo.history_taskreg
WHERE period_month = ? AND period_year = ?
  AND is_lembur = 1
  AND gang_code = ?  -- Optional filter
ORDER BY emp_code, trx_date
```

**Output**: Map<emp_code, ActivityRecord[]>

**Contoh Output**:
```typescript
{
    'E0001': [
        {
            date: '2026-01-05',
            task_code: 'OVT001',
            task_desc: 'Overtime - Panen',
            hours: 2,
            amount: 30000,
            category: 'LEMBUR',
            is_overtime: true
        },
        {
            date: '2026-01-10',
            task_code: 'OVT001',
            task_desc: 'Overtime - Panen',
            hours: 3,
            amount: 45000,
            category: 'LEMBUR',
            is_overtime: true
        }
    ]
}
```

---

### 3. fetchPremiActivities()

Mengambil detail aktivitas premi dari transaction table.

```typescript
private async fetchPremiActivities(
    transDb: Database,
    historyIds: string[],
    periodMonth: number,
    periodYear: number,
    empActivities: Map<string, ActivityRecord[]>,
    gangCode?: string
): Promise<void>
```

**Query**:
```sql
SELECT
    emp_code, gang_code,
    CONVERT(varchar, doc_date, 23) as doc_date_str,
    task_code, task_desc,
    amount, quantity,
    category, sub_category,
    doc_desc, doc_no,
    dynamic_header_name
FROM dbo.history_adtrans
WHERE period_month = ? AND period_year = ?
  AND is_premi = 1
  AND gang_code = ?  -- Optional filter
ORDER BY emp_code, doc_date
```

**Contoh Output**:
```typescript
{
    'E0001': [
        {
            date: '2026-01-15',
            task_code: 'PREM001',
            task_desc: 'Premi Insentif',
            hours: 0,
            amount: 50000,
            category: 'INSENTIF',
            doc_desc: 'TUNJANGAN PREMI INSENTIF',
            doc_no: 'ADT-2026-001',
            is_overtime: false
        },
        {
            date: '2026-01-20',
            task_code: 'PREM002',
            task_desc: 'Premi Kinerja',
            hours: 0,
            amount: 75000,
            category: 'KINERJA',
            doc_desc: 'TUNJANGAN PREMI KINERJA',
            doc_no: 'ADT-2026-002',
            is_overtime: false
        }
    ]
}
```

---

## Filter Modes

### 1. **Mode 'all'**

Tampilkan semua karyawan dengan semua aktivitas.

```typescript
const allData = await detailService.getDetail(1, 2026, 'all');
// Includes: All employees, lembur activities, premi activities
```

**Use Case**: Comprehensive report, audit lengkap.

### 2. **Mode 'lembur'**

Hanya tampilkan karyawan yang memiliki lembur.

```typescript
const lemburData = await detailService.getDetail(1, 2026, 'lembur');
// Filter: WHERE lembur_jumlah > 0
// Includes: Only employees with lembur_jumlah > 0
```

**Use Case**: Analisis lembur, audit overtime.

### 3. **Mode 'premi'**

Hanya tampilkan karyawan yang memiliki premi.

```typescript
const premiData = await detailService.getDetail(1, 2026, 'premi');
// Filter: WHERE total_premi > 0
// Includes: Only employees with total_premi > 0
```

**Use Case**: Analisis premi, breakdown insentif.

### 4. **Mode 'upah_bersih'**

Filter berdasarkan threshold upah bersih (custom implementation).

```typescript
const upahBersihData = await detailService.getDetail(1, 2026, 'upah_bersih');
// Implementation dependent: Can add threshold parameter
```

**Use Case**: Analisis distribusi upah bersih.

---

## Database Sources

### 1. **payroll_history_header**

```sql
-- Source for gang master data
SELECT 
    id, history_id, gang_code, gang_description, division_code
FROM dbo.payroll_history_header
WHERE period_month = ? AND period_year = ?
```

**Fields Used**:
- `id`: Master ID untuk join
- `history_id`: Reference ID
- `gang_code`: Grouping key
- `gang_description`: Display name
- `division_code`: Division filter

### 2. **payroll_history_detail**

```sql
-- Source for employee payroll summary
SELECT
    emp_code, emp_name, gang_code, division_code,
    task_code, task_desc,
    hari_kerja, jumlah_hk,
    gaji_pokok,
    lembur_jam, lembur_jumlah,
    premi_brondol, total_premi,
    total_tunjangan,
    total_potongan, total_potongan_bersih,
    jumlah_upah_kotor, upah_bersih,
    pot_pph21, pph21_ter,
    premi_detail, lembur_records,
    master_id
FROM dbo.payroll_history_detail
WHERE master_id IN (?)
```

**Fields Used**:
- Employee info: `emp_code`, `emp_name`, `gang_code`, `division_code`
- Work info: `hari_kerja`, `jumlah_hk`, `gaji_pokok`
- Overtime: `lembur_jam`, `lembur_jumlah`
- Premi: `premi_brondol`, `total_premi`
- Deductions: `total_potongan`, `pot_pph21`
- Net salary: `upah_bersih`, `jumlah_upah_kotor`

### 3. **history_taskreg** (Transaksi Lembur)

```sql
-- Source for overtime detail
SELECT
    emp_code, gang_code,
    trx_date, task_code, task_desc,
    hours, amount, rate
FROM dbo.history_taskreg
WHERE period_month = ? AND period_year = ?
  AND is_lembur = 1
```

**Fields Used**:
- `trx_date`: Tanggal lembur
- `task_code`, `task_desc`: Activity info
- `hours`: Jam lembur
- `amount`: Nominal lembur

### 4. **history_adtrans** (Transaksi Premi)

```sql
-- Source for premi detail
SELECT
    emp_code, gang_code,
    doc_date, task_code, task_desc,
    amount, quantity,
    category, sub_category,
    doc_desc, doc_no,
    dynamic_header_name
FROM dbo.history_adtrans
WHERE period_month = ? AND period_year = ?
  AND is_premi = 1
```

**Fields Used**:
- `doc_date`: Tanggal premi
- `task_code`, `task_desc`: Premi info
- `amount`: Nominal premi
- `doc_desc`: Description (untuk kategori)
- `dynamic_header_name`: Header name (INSENTIF, KINERJA, dll)

---

## Use Cases

### 1. **Audit Lembur per Karyawan**

```typescript
const lemburDetail = await detailService.getDetail(1, 2026, 'lembur', 'P1A');

// Get specific employee
const employee = lemburDetail.gangs
    .flatMap(g => g.employees)
    .find(e => e.emp_code === 'E0001');

console.log(`${employee.emp_name} - Lembur Details:`);
employee.activities
    .filter(a => a.is_overtime)
    .forEach(act => {
        console.log(`  ${act.date}: ${act.hours} hours = Rp ${act.amount}`);
    });

// Total: 5 hours = Rp 75,000
```

### 2. **Breakdown Premi per Kategori**

```typescript
const premiDetail = await detailService.getDetail(1, 2026, 'premi', 'P1A');

// Group premi by category
const premiByCategory = premiDetail.gangs
    .flatMap(g => g.employees)
    .flatMap(e => e.activities)
    .reduce((acc, act) => {
        const cat = act.category;
        acc[cat] = (acc[cat] || 0) + act.amount;
        return acc;
    }, {});

console.log(premiByCategory);
// {
//     'INSENTIF': 500000,
//     'KINERJA': 750000,
//     'BRONDOL': 300000
// }
```

### 3. **Compare Gang Performance**

```typescript
const detail = await detailService.getDetail(1, 2026, 'all', 'P1A');

// Compare gangs by upah_bersih
const gangComparison = detail.gangs.map(g => ({
    gang: g.gang_code,
    employees: g.employee_count,
    avg_upah_bersih: g.total_upah_bersih / g.employee_count,
    total_lembur: g.total_lembur,
    total_premi: g.total_premi
}));

console.log(gangComparison);
// [
//     { gang: 'A01', employees: 25, avg: 3500000, lembur: 500000, premi: 750000 },
//     { gang: 'A02', employees: 30, avg: 3200000, lembur: 400000, premi: 600000 }
// ]
```

### 4. **Export Detail untuk Laporan**

```typescript
async function exportLemburReport(month: number, year: number) {
    const detail = await detailService.getDetail(month, year, 'lembur');
    
    const csvRows = [['Gang', 'Employee', 'Date', 'Task', 'Hours', 'Amount']];
    
    detail.gangs.forEach(gang => {
        gang.employees.forEach(emp => {
            emp.activities
                .filter(a => a.is_overtime)
                .forEach(act => {
                    csvRows.push([
                        gang.gang_code,
                        emp.emp_name,
                        act.date,
                        act.task_desc,
                        act.hours,
                        act.amount
                    ]);
                });
        });
    });
    
    return csvRows.map(row => row.join(',')).join('\n');
}
```

---

## Performance Optimization

### 1. **Selective Fetching**

```typescript
// ✅ GOOD: Use filter to reduce data
const lemburOnly = await detailService.getDetail(1, 2026, 'lembur');
// Only fetch lembur activities, skip premi

// ❌ BAD: Fetch all then filter
const all = await detailService.getDetail(1, 2026, 'all');
const lemburOnly = all.gangs.map(g => ({
    ...g,
    employees: g.employees.filter(e => e.lembur_jam > 0)
}));
```

### 2. **Map for Activity Lookup**

```typescript
// ✅ GOOD: Use Map for O(1) lookup
const empActivities = new Map<string, ActivityRecord[]>();

// Populate map
for (const row of rows) {
    const empCode = row.emp_code;
    if (!empActivities.has(empCode)) {
        empActivities.set(empCode, []);
    }
    empActivities.get(empCode)!.push(activity);
}

// Access
const activities = empActivities.get('E0001') || [];
```

### 3. **Execution Time Tracking**

```typescript
const startTime = Date.now();

// ... processing ...

const executionTime = Date.now() - startTime;

return {
    success: true,
    execution_time_ms: executionTime,
    // ... other fields
};
```

**Target Performance**:
- < 500ms for single division
- < 2000ms for all divisions
- < 100ms for cached data

---

## Integrasi dengan API

### Endpoint: GET /payroll/detail/upah-bersih

```typescript
// Example API route
.get("/detail/upah-bersih/:month/:year", async ({ params, query }) => {
    const month = parseInt(params.month);
    const year = parseInt(params.year);
    const filter = query.filter as FilterMode || 'all';
    const divisionCode = query.division as string | undefined;
    const gangCode = query.gang_code as string | undefined;
    
    const result = await upahBersihDetailService.getDetail(
        month, year, filter, divisionCode, gangCode
    );
    
    return {
        success: true,
        ...result
    };
})
```

**Response Example**:
```json
{
    "success": true,
    "period_month": 1,
    "period_year": 2026,
    "filter": "lembur",
    "summary": {
        "total_employees": 45,
        "total_gangs": 5,
        "grand_total_lembur": 2500000,
        "grand_total_premi": 0,
        "grand_total_upah_bersih": 157500000,
        "grand_total_upah_kotor": 175000000,
        "grand_total_potongan": 17500000
    },
    "gangs": [
        {
            "gang_code": "A01",
            "gang_description": "Parit Gunung 1A - Gang 1",
            "division_code": "P1A",
            "employee_count": 10,
            "total_lembur": 500000,
            "total_premi": 0,
            "total_upah_bersih": 35000000,
            "employees": [
                {
                    "emp_code": "E0001",
                    "emp_name": "John Doe",
                    "lembur_jam": 5,
                    "lembur_jumlah": 75000,
                    "upah_bersih": 3500000,
                    "activities": [
                        {
                            "date": "2026-01-05",
                            "task_code": "OVT001",
                            "task_desc": "Overtime - Panen",
                            "hours": 2,
                            "amount": 30000,
                            "category": "LEMBUR",
                            "is_overtime": true
                        }
                    ]
                }
            ]
        }
    ],
    "execution_time_ms": 245
}
```

---

## Best Practices

### 1. **Always Specify Filter Mode**

```typescript
// ✅ GOOD: Explicit filter
const data = await detailService.getDetail(1, 2026, 'lembur');

// ❌ BAD: Default to 'all' (may be slow)
const data = await detailService.getDetail(1, 2026);
```

### 2. **Handle Empty Activities**

```typescript
// ✅ GOOD: Handle empty array
const activities = emp.activities || [];
if (activities.length === 0) {
    console.log('No activities for this employee');
}

// ❌ BAD: Assume activities exist
const firstActivity = emp.activities[0];  // undefined if empty
```

### 3. **Use Division Filter for Performance**

```typescript
// ✅ GOOD: Filter by division
const p1aData = await detailService.getDetail(1, 2026, 'all', 'P1A');

// ❌ BAD: Fetch all divisions then filter
const allData = await detailService.getDetail(1, 2026, 'all');
const p1aData = allData.gangs.filter(g => g.division_code === 'P1A');
```

### 4. **Cache Frequently Accessed Data**

```typescript
// ✅ GOOD: Cache result
const cacheKey = `upah_bersih_detail:${month}:${year}:${filter}:${divisionCode}`;
let cached = cacheService.get(cacheKey);

if (!cached) {
    cached = await detailService.getDetail(month, year, filter, divisionCode);
    cacheService.set(cacheKey, cached, 300); // 5 minutes
}
```

---

## Troubleshooting

### Issue: Activities Empty

**Symptom**: `activities` array is empty meskipun `lembur_jumlah > 0`.

**Solution**:
1. Cek是否存在 di `history_taskreg`:
   ```sql
   SELECT * FROM history_taskreg 
   WHERE emp_code = ? AND is_lembur = 1
   ```
2. Verifikasi `period_month` dan `period_year` match
3. Cek `is_lembur` flag di database

### Issue: Slow Performance

**Symptom**: Query takes > 5 seconds.

**Solution**:
1. Use division filter untuk reduce data
2. Use specific filter mode (`lembur` or `premi`)
3. Add index di `history_taskreg(emp_code, period_month, period_year)`
4. Add index di `history_adtrans(emp_code, period_month, period_year)`

### Issue: Duplicate Activities

**Symptom**: Same activity appears multiple times.

**Solution**:
1. Check for duplicate records in source tables
2. Add DISTINCT to query
3. Use `GROUP BY` untuk aggregate

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Payroll calculation overview
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Database schema detail
- 📄 [`08_API_ROUTES_WAGES.md`](./08_API_ROUTES_WAGES.md) - API integration
- 📄 [`00_README_MAIN.md`](./00_README_MAIN.md) - Gambaran umum daftar upah

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/services/upahBersihDetailService.ts`  
**Database**: `extend_db_ptrj_transaksi.dbo.history_taskreg`, `history_adtrans`
