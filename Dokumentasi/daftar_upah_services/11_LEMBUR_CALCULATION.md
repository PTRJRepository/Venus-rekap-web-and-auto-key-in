# Dokumentasi Perhitungan Lembur (Overtime)

## Gambaran Umum

Dokumentasi ini menjelaskan secara lengkap sistem perhitungan lembur (overtime) di Plantware Auto Report. Lembur dihitung berdasarkan jenis hari, durasi, dan UPJ (Upah per Jam) karyawan dengan sistem tier (tingkatan) multiplier.

**File Lokasi**: `backend/src/services/lemburCalculator.ts`

---

## Konsep Dasar

### 1. **UPJ (Upah per Jam)**

UPJ adalah dasar perhitungan rate lembur per jam.

**Formula**:
```
UPJ = (PayRate × 30) / 173
```

**Variabel**:
- `PayRate`: Upah dasar per hari kerja dari `HR_PAYROLL.PayRate`
- `30`: Hari standar per bulan
- `173`: Jam kerja standar per bulan (menurut peraturan ketenagakerjaan)

**Contoh**:
```
Input:
  PayRate = Rp 75,000/hari

Calculation:
  UPJ = (75,000 × 30) / 173
      = 2,250,000 / 173
      = Rp 13,005.78 per jam
```

**Default Value**: Jika PayRate tidak tersedia, digunakan UPJ default = **Rp 17,257** (dari environment variable `LEMBUR_UPJ`).

---

### 2. **Jenis Hari (Day Type)**

Setiap hari diklasifikasikan untuk menentukan multiplier lembur:

| Day Type | Kondisi | Multiplier |
|----------|---------|------------|
| **WORKDAY_LONG** | Senin, Kamis, Sabtu | 1.5x, 2x |
| **WORKDAY_SHORT** | Jumat | 1.5x, 2x |
| **SUNDAY** | Minggu | 2x, 3x, 4x |
| **HOLIDAY_REGULAR** | Libur umum non-agama | 2x, 3x, 4x |
| **HOLIDAY_RELIGIOUS** | Libur keagamaan | 3x, 4x |

**Klasifikasi Hari**:
```typescript
enum DayType {
    WORKDAY_LONG = "WORKDAY_LONG",       // Mon, Tue, Wed, Thu, Sat
    WORKDAY_SHORT = "WORKDAY_SHORT",     // Friday
    SUNDAY = "SUNDAY",                   // Sunday
    HOLIDAY_REGULAR = "HOLIDAY_REGULAR", // Non-religious public holiday
    HOLIDAY_RELIGIOUS = "HOLIDAY_RELIGIOUS"  // Religious public holiday
}
```

**Display Names**:
```typescript
{
    WORKDAY_LONG: "Hari Kerja",
    WORKDAY_SHORT: "Jumat",
    SUNDAY: "Minggu",
    HOLIDAY_REGULAR: "Libur Umum",
    HOLIDAY_RELIGIOUS: "Libur Keagamaan"
}
```

---

## Sistem Tier Lembur

### 1. **Hari Kerja (WORKDAY_LONG & WORKDAY_SHORT)**

**2-Tier System**:

| Tier | Durasi | Multiplier | Keterangan |
|------|--------|------------|------------|
| Tier 1 | Jam pertama (1 jam) | 1.5× UPJ | Lembur jam pertama |
| Tier 2 | Jam berikutnya | 2.0× UPJ | Sisa jam lembur |

**Boundary**:
- `tier_1_boundary = 1` (jam pertama)

**Contoh Perhitungan**:
```
Input:
  UPJ = Rp 13,006
  Durasi = 3 jam
  Hari = Senin (WORKDAY_LONG)

Calculation:
  Tier 1: 1 jam × 13,006 × 1.5 = Rp 19,509
  Tier 2: 2 jam × 13,006 × 2.0 = Rp 52,024
  
  Total = 19,509 + 52,024 = Rp 71,533
```

---

### 2. **Minggu & Libur Umum (SUNDAY & HOLIDAY_REGULAR)**

**3-Tier System**:

| Tier | Durasi | Multiplier | Keterangan |
|------|--------|------------|------------|
| Tier 1 | 5/7 jam pertama | 2.0× UPJ | Kerja reguler di hari libur |
| Tier 2 | 1 jam berikutnya | 3.0× UPJ | Jam ke-6/8 |
| Tier 3 | Jam setelahnya | 4.0× UPJ | Lembur tambahan |

**Boundary**:
- `tier_1_boundary_short = 5` (untuk Jumat/hari pendek)
- `tier_1_boundary_long = 7` (untuk hari panjang)

**Contoh Perhitungan (Minggu)**:
```
Input:
  UPJ = Rp 13,006
  Durasi = 8 jam
  Hari = Minggu (SUNDAY)

Calculation:
  Tier 1: 7 jam × 13,006 × 2.0 = Rp 182,084
  Tier 2: 1 jam × 13,006 × 3.0 = Rp 39,018
  Tier 3: 0 jam × 13,006 × 4.0 = Rp 0
  
  Total = 182,084 + 39,018 + 0 = Rp 221,102
```

---

### 3. **Libur Keagamaan (HOLIDAY_RELIGIOUS)**

**3-Tier System** (lebih tinggi dari libur biasa):

| Tier | Durasi | Multiplier | Keterangan |
|------|--------|------------|------------|
| Tier 1 | 5/7 jam pertama | 3.0× UPJ | Kerja reguler |
| Tier 2 | 1 jam berikutnya | 4.0× UPJ | Jam ke-6/8 |
| Tier 3 | Jam setelahnya | 4.0× UPJ | Lembur tambahan |

**Contoh Perhitungan**:
```
Input:
  UPJ = Rp 13,006
  Durasi = 6 jam
  Hari = Idul Fitri (HOLIDAY_RELIGIOUS)

Calculation:
  Tier 1: 5 jam × 13,006 × 3.0 = Rp 195,090
  Tier 2: 1 jam × 13,006 × 4.0 = Rp 52,024
  Tier 3: 0 jam × 13,006 × 4.0 = Rp 0
  
  Total = 195,090 + 52,024 + 0 = Rp 247,114
```

---

## Struktur Data

### Interface: OvertimeRecord

```typescript
export interface OvertimeRecord {
    id: number;                    // ID transaksi
    emp_code: string;              // Kode karyawan
    emp_name: string;              // Nama karyawan
    trx_date: Date;                // Tanggal transaksi
    hours: number;                 // Jumlah jam lembur
    day_type?: DayType;            // Jenis hari
    breakdown?: OvertimeBreakdown; // Rincian tier
    task_code?: string;            // Kode task
    task_desc?: string;            // Deskripsi task
    shift_code?: string;           // Kode shift
    raw_amount?: number;           // Amount dari database (jika ada)
    raw_rate?: number;             // Rate dari database (jika ada)
    meta?: PayrollComponentMetadata;
}
```

### Interface: OvertimeBreakdown

```typescript
export interface OvertimeBreakdown {
    tier_1_rate: number;      // Multiplier tier 1 (e.g., 1.5, 2.0, 3.0)
    tier_1_hours: number;     // Jam di tier 1
    tier_1_amount: number;    // Amount tier 1
    
    tier_2_rate: number;      // Multiplier tier 2
    tier_2_hours: number;     // Jam di tier 2
    tier_2_amount: number;    // Amount tier 2
    
    tier_3_rate: number;      // Multiplier tier 3
    tier_3_hours: number;     // Jam di tier 3
    tier_3_amount: number;    // Amount tier 3
    
    tier_1_boundary: number;  // Boundary tier 1
    
    total_rate: number;       // Effective rate (calculated)
    total_amount: number;     // Total payment
}
```

### Interface: OvertimeCalculationResult

```typescript
export interface OvertimeCalculationResult {
    emp_code: string;              // Employee code
    emp_name: string;              // Employee name
    month: number;                 // Bulan periode
    year: number;                  // Tahun periode
    upj: number;                   // UPJ yang digunakan
    records: OvertimeRecord[];     // Detail transaksi
    total_hours: number;           // Total jam lembur
    total_payment: number;         // Total pembayaran lembur
    record_count: number;          // Jumlah transaksi
}
```

---

## Metode Publik

### 1. calculate() ⭐

Menghitung lembur untuk satu karyawan dalam satu periode.

```typescript
public async calculate(
    empCode: string,
    month: number,
    year: number,
    upj?: number,
    serverProfile?: string
): Promise<OvertimeCalculationResult>
```

**Proses**:
```
┌─────────────────────────────────────────────────────────────┐
│          ALUR LemburCalculator.calculate()                  │
└─────────────────────────────────────────────────────────────┘

1. Setup Periode
   ├─ startDate = YYYY-MM-01
   └─ endDate = YYYY-MM-last_day

2. Get UPJ
   ├─ If upj provided: use it
   ├─ Else: fetch payrate from HR_PAYROLL
   │  └─ UPJ = (payrate × 30) / 173
   └─ Fallback: use default UPJ (17257)

3. Fetch Overtime Records
   ├─ Query PR_TASKREGLN & PR_TASKREGLN_ARC
   ├─ WHERE EmpCode = ? AND TrxDate BETWEEN start AND end
   ├─ AND OT = 1 (overtime flag)
   └─ JOIN with HR_EMPLOYEE, PR_TASKCODE

4. Process Each Record
   ├─ Parse trx_date
   ├─ classifyDay() → DayType
   ├─ calculateOvertimePayment(hours, dayType, upj)
   │  ├─ Determine tier boundaries
   │  ├─ Calculate hours per tier
   │  └─ Calculate amount per tier
   └─ Build OvertimeRecord

5. Aggregate Results
   ├─ total_hours = Σ records.hours
   ├─ total_payment = Σ records.breakdown.total_amount
   └─ record_count = records.length

6. Return Result
```

**Query Database**:
```sql
SELECT
    trl.ID,
    trl.EmpCode,
    e.EmpName,
    trl.TrxDate,
    trl.Hours,
    trl.TaskCode,
    tc.TaskDesc,
    trl.ShiftCode,
    trl.Amount,
    trl.Rate
FROM (
    -- Active Table
    SELECT l.ID, l.EmpCode, l.TrxDate, l.Hours, l.TaskCode, l.ShiftCode, l.Amount, l.Rate
    FROM PR_TASKREGLN l
    JOIN PR_TASKREG m ON l.MasterID = m.ID
    WHERE l.EmpCode = ? AND l.TrxDate >= ? AND l.TrxDate <= ? AND l.OT = 1

    UNION ALL

    -- Archive Table
    SELECT l.ID, l.EmpCode, l.TrxDate, l.Hours, l.TaskCode, l.ShiftCode, l.Amount, l.Rate
    FROM PR_TASKREGLN_ARC l
    JOIN PR_TASKREG_ARC m ON l.ID = l.MasterID
    WHERE l.EmpCode = ? AND l.TrxDate >= ? AND l.TrxDate <= ? AND l.OT = 1
) trl
LEFT JOIN HR_EMPLOYEE e ON e.EmpCode = trl.EmpCode
LEFT JOIN PR_TASKCODE tc ON tc.TaskCode = trl.TaskCode
ORDER BY trl.TrxDate
```

**Contoh Penggunaan**:
```typescript
const lemburResult = await lemburCalculator.calculate('E0001', 1, 2026);

console.log(`Total Hours: ${lemburResult.total_hours}`);
console.log(`Total Payment: ${lemburResult.total_payment}`);
console.log(`Records: ${lemburResult.record_count}`);

// Detail per transaksi
lemburResult.records.forEach(record => {
    console.log(`${record.trx_date}: ${record.hours} jam - Rp ${record.breakdown?.total_amount}`);
});
```

---

### 2. quickCalculate()

Quick calculate tanpa database (untuk testing/simulasi).

```typescript
public quickCalculate(
    hours: number,
    dayTypeStr: string = "WORKDAY_LONG",
    isShortDay: boolean = false
): OvertimeBreakdown
```

**Contoh**:
```typescript
// Simulasi lembur 3 jam di hari Senin
const breakdown = lemburCalculator.quickCalculate(3, "WORKDAY_LONG", false);
console.log(breakdown.total_amount);

// Simulasi lembur 8 jam di hari Minggu
const sundayBreakdown = lemburCalculator.quickCalculate(8, "SUNDAY", false);
console.log(sundayBreakdown);
```

---

### 3. calculateBatchData()

Menghitung lembur untuk banyak karyawan sekaligus (optimized).

```typescript
public async calculateBatchData(
    empCodes: string[],
    month: number,
    year: number,
    serverProfile?: string
): Promise<Record<string, {
    total_hours: number,
    total_payment: number
}>>
```

**Optimization**:
- Single query untuk semua karyawan
- Batch fetch payrates
- Client-side day classification
- No per-employee API calls

**Return**:
```typescript
{
    'E0001': { total_hours: 10, total_payment: 150000 },
    'E0002': { total_hours: 5, total_payment: 75000 },
    'E0003': { total_hours: 0, total_payment: 0 }
}
```

---

### 4. calculateBatchDataWithTaskBreakdown() ⭐

Menghitung lembur dengan breakdown per task code.

```typescript
public async calculateBatchDataWithTaskBreakdown(
    empCodes: string[],
    month: number,
    year: number,
    serverProfile?: string
): Promise<Record<string, {
    total_hours: number;
    total_payment: number;
    task_breakdown: Array<{
        task_code: string;
        task_desc: string;
        hours: number;
        amount: number;
        record_count: number;
    }>;
    records?: Array<{
        date: string;
        day_name: string;
        day_type: string;
        task_code: string;
        task_desc: string;
        hours: number;
        rate: number;
        amount: number;
        meta?: PayrollComponentMetadata;
    }>;
    meta?: PayrollComponentMetadata;
}>>
```

**Fitur**:
- **task_breakdown**: Summary per jenis task
- **records**: Detail per transaksi (individual records)
- **meta**: Metadata untuk audit trail

**Contoh Output**:
```typescript
{
    'E0001': {
        total_hours: 15,
        total_payment: 225000,
        task_breakdown: [
            {
                task_code: 'OVT001',
                task_desc: 'Overtime - Panen',
                hours: 10,
                amount: 150000,
                record_count: 5
            },
            {
                task_code: 'OVT002',
                task_desc: 'Overtime - Rawat',
                hours: 5,
                amount: 75000,
                record_count: 3
            }
        ],
        records: [
            {
                date: '2026-01-05',
                day_name: 'Senin',
                day_type: 'Hari Kerja',
                task_code: 'OVT001',
                task_desc: 'Overtime - Panen',
                hours: 2,
                rate: 1.5,
                amount: 39018,
                meta: {
                    source: 'DATABASE_PLANTWARE',
                    description: 'Overtime on 2026-01-05 (Overtime - Panen)',
                    calculation_basis: 'Day Type: Hari Kerja, UPJ: 13006',
                    taxable: true
                }
            }
        ]
    }
}
```

---

## Klasifikasi Hari

### Method: classifyDay()

```typescript
private async classifyDay(date: Date, year: number): Promise<DayType>
```

**Logic**:
```
1. Check day of week:
   ├─ Sunday (0) → SUNDAY
   ├─ Friday (5) → WORKDAY_SHORT
   └─ Others → WORKDAY_LONG

2. Check holidays:
   ├─ If holiday in HR_GPH:
   │  ├─ Religious holiday → HOLIDAY_RELIGIOUS
   │  └─ Non-religious → HOLIDAY_REGULAR
   └─ If no holiday, use day of week result
```

### Method: getHolidays()

```typescript
private async getHolidays(year: number): Promise<
    Record<string, { is_religious: boolean }>
>
```

**Query**:
```sql
SELECT HolidayDate, Description 
FROM HR_GPH 
WHERE YEAR(HolidayDate) = ?
```

**Religious Holiday Detection**:
```typescript
const isReligious = desc.includes("IDUL") || 
                    desc.includes("NATAL") ||
                    desc.includes("IMLEK") || 
                    desc.includes("WAISAK") ||
                    desc.includes("NYEPI") || 
                    desc.includes("ISRA") ||
                    desc.includes("MAULID");
```

**Cached**: Hasil di-cache selama 1 jam (3600 seconds).

**Contoh Holidays**:
```typescript
{
    '2026-01-01': { is_religious: false },  // Tahun Baru
    '2026-01-29': { is_religious: true },   // Idul Fitri
    '2026-02-14': { is_religious: true },   // Imlek
    '2026-03-29': { is_religious: true },   // Waisak
    '2026-12-25': { is_religious: true }    // Natal
}
```

---

## Detail Perhitungan per Tier

### Function: calculateOvertimePayment()

```typescript
private calculateOvertimePayment(
    hours: number,
    dayType: DayType,
    upj: number,
    isShortDay: boolean
): OvertimeBreakdown
```

**Algorithm**:
```
┌─────────────────────────────────────────────────────────────┐
│    ALUR calculateOvertimePayment()                          │
└─────────────────────────────────────────────────────────────┘

Input: hours, dayType, upj, isShortDay

1. Get Rate Configuration
   └─ rates = OVERTIME_RATES[dayType]

2. Calculate Tier 1 Hours
   ├─ tier1Limit = isShortDay ? rates.tier_1_boundary_short 
   │                          : rates.tier_1_boundary_long
   ├─ tier1Hours = min(remainingHours, tier1Limit)
   └─ remainingHours -= tier1Hours

3. Calculate Tier 2 Hours
   ├─ If SUNDAY/HOLIDAY: tier2Limit = 1 (8th hour)
   │  Else: tier2Limit = 999 (unlimited)
   ├─ tier2Hours = min(remainingHours, tier2Limit)
   └─ remainingHours -= tier2Hours

4. Calculate Tier 3 Hours
   └─ tier3Hours = remainingHours

5. Calculate Amounts
   ├─ t1Amount = tier1Hours × upj × rates.tier_1_rate
   ├─ t2Amount = tier2Hours × upj × rates.tier_2_rate
   └─ t3Amount = tier3Hours × upj × rates.tier_3_rate

6. Return Breakdown
   └─ { tier_1_*, tier_2_*, tier_3_*, total_amount }
```

---

## Rate Configuration

### OVERTIME_RATES Constant

```typescript
const OVERTIME_RATES = {
    // Workdays: 2-tier (1.5x first hour, 2x after)
    WORKDAY_LONG: { 
        tier_1_rate: 1.5, 
        tier_2_rate: 2.0, 
        tier_3_rate: 2.0, 
        tier_1_boundary: 1 
    },
    WORKDAY_SHORT: { 
        tier_1_rate: 1.5, 
        tier_2_rate: 2.0, 
        tier_3_rate: 2.0, 
        tier_1_boundary: 1 
    },

    // Sunday: 3-tier (2x, 3x, 4x)
    SUNDAY: { 
        tier_1_rate: 2.0, 
        tier_2_rate: 3.0, 
        tier_3_rate: 4.0, 
        tier_1_boundary_short: 5, 
        tier_1_boundary_long: 7 
    },

    // Regular Holiday: 3-tier (2x, 3x, 4x)
    HOLIDAY_REGULAR: { 
        tier_1_rate: 2.0, 
        tier_2_rate: 3.0, 
        tier_3_rate: 4.0, 
        tier_1_boundary_short: 5, 
        tier_1_boundary_long: 7 
    },

    // Religious Holiday: 3-tier (3x, 4x, 4x)
    HOLIDAY_RELIGIOUS: { 
        tier_1_rate: 3.0, 
        tier_2_rate: 4.0, 
        tier_3_rate: 4.0, 
        tier_1_boundary_short: 5, 
        tier_1_boundary_long: 7 
    }
};
```

---

## Contoh Perhitungan Lengkap

### Contoh 1: Lembur Hari Kerja (Senin)

```
Employee: E0001 - John Doe
Date: Senin, 5 Januari 2026
PayRate: Rp 75,000/hari
Lembur: 3 jam

Step 1: Calculate UPJ
  UPJ = (75,000 × 30) / 173 = Rp 13,005.78

Step 2: Classify Day
  Day = Monday → WORKDAY_LONG

Step 3: Calculate Tiers
  Tier 1: 1 jam × 13,005.78 × 1.5 = Rp 19,508.67
  Tier 2: 2 jam × 13,005.78 × 2.0 = Rp 52,023.12
  
Step 4: Total
  Total Payment = 19,508.67 + 52,023.12 = Rp 71,531.79
  Rounded: Rp 71,532
```

### Contoh 2: Lembur Hari Minggu

```
Employee: E0002 - Jane Smith
Date: Minggu, 11 Januari 2026
PayRate: Rp 80,000/hari
Lembur: 8 jam

Step 1: Calculate UPJ
  UPJ = (80,000 × 30) / 173 = Rp 13,872.83

Step 2: Classify Day
  Day = Sunday → SUNDAY

Step 3: Calculate Tiers
  Tier 1: 7 jam × 13,872.83 × 2.0 = Rp 194,219.62
  Tier 2: 1 jam × 13,872.83 × 3.0 = Rp 41,618.49
  Tier 3: 0 jam × 13,872.83 × 4.0 = Rp 0
  
Step 4: Total
  Total Payment = 194,219.62 + 41,618.49 = Rp 235,838.11
  Rounded: Rp 235,838
```

### Contoh 3: Lembur Libur Keagamaan (Idul Fitri)

```
Employee: E0003 - Bob Williams
Date: Idul Fitri, 29 Januari 2026
PayRate: Rp 70,000/hari
Lembur: 6 jam

Step 1: Calculate UPJ
  UPJ = (70,000 × 30) / 173 = Rp 12,138.73

Step 2: Classify Day
  Holiday = Idul Fitri → HOLIDAY_RELIGIOUS

Step 3: Calculate Tiers
  Tier 1: 5 jam × 12,138.73 × 3.0 = Rp 182,080.95
  Tier 2: 1 jam × 12,138.73 × 4.0 = Rp 48,554.92
  Tier 3: 0 jam × 12,138.73 × 4.0 = Rp 0
  
Step 4: Total
  Total Payment = 182,080.95 + 48,554.92 = Rp 230,635.87
  Rounded: Rp 230,636
```

---

## Integrasi dengan Service Lain

### 1. **PayrollService**

```typescript
// payrollService.ts - calculateTotalTunjangan
import { lemburCalculator } from './lemburCalculator';

const lemburData = await lemburCalculator.calculate(empCode, month, year);
const lemburJumlah = lemburData.total_payment;

// Add to total tunjangan
const totalTunjangan = berasJumlah + jabatanJumlah + masaKerjaJumlah + lemburJumlah;
```

### 2. **EmployeeDetailService**

```typescript
// employeeDetailService.ts
import { lemburCalculator } from './lemburCalculator';

public async getDailyOvertime(empCode: string, month: number, year: number) {
    return await lemburCalculator.calculate(empCode, month, year);
}
```

### 3. **DashboardService**

```typescript
// dashboardService.ts - getOvertimeAnalysis
import { lemburCalculator } from './lemburCalculator';

public async getOvertimeAnalysis(month: number, year: number, divisionCode?: string) {
    const employees = await getEmployeesByDivision(divisionCode);
    const empCodes = employees.map(e => e.code);
    
    const overtimeData = await lemburCalculator.calculateBatchData(
        empCodes, month, year
    );
    
    // Aggregate by division, gang, etc.
    return aggregateOvertimeData(overtimeData);
}
```

---

## API Endpoints

### 1. GET /employee/:emp_code/lembur

```typescript
// employee.ts
.get("/:emp_code/lembur", async ({ params, query }) => {
    const empCode = params.emp_code;
    const month = parseInt(query.month);
    const year = parseInt(query.year);
    
    const result = await lemburCalculator.calculate(empCode, month, year);
    
    return {
        success: true,
        ...result
    };
})
```

**Response**:
```json
{
    "success": true,
    "emp_code": "E0001",
    "emp_name": "John Doe",
    "month": 1,
    "year": 2026,
    "upj": 13005.78,
    "records": [
        {
            "id": 123,
            "emp_code": "E0001",
            "emp_name": "John Doe",
            "trx_date": "2026-01-05",
            "hours": 2,
            "day_type": "WORKDAY_LONG",
            "breakdown": {
                "tier_1_rate": 1.5,
                "tier_1_hours": 1,
                "tier_1_amount": 19509,
                "tier_2_rate": 2,
                "tier_2_hours": 1,
                "tier_2_amount": 26012,
                "total_amount": 45521
            },
            "task_code": "OVT001",
            "task_desc": "Overtime - Panen"
        }
    ],
    "total_hours": 10,
    "total_payment": 150000,
    "record_count": 5
}
```

### 2. GET /employee/:emp_code/overtime/detail

```typescript
.get("/:emp_code/overtime/detail", async ({ params, query }) => {
    const result = await employeeDetailService.getDailyOvertime(
        empCode, month, year
    );
    
    return {
        success: true,
        data: result
    };
})
```

### 3. GET /dashboard/overtime-analysis

```typescript
.get('/overtime-analysis', async ({ query }) => {
    const month = parseInt(query.month);
    const year = parseInt(query.year);
    const divisionCode = query.division;
    
    const data = await dashboardService.getOvertimeAnalysis(
        month, year, divisionCode
    );
    
    return { success: true, data };
})
```

---

## Database Schema

### Tables Used

**1. PR_TASKREG & PR_TASKREG_ARC** (Master)
```sql
CREATE TABLE PR_TASKREG (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DocDate DATETIME,
    GangCode VARCHAR(50),
    -- Other fields...
);
```

**2. PR_TASKREGLN & PR_TASKREGLN_ARC** (Detail)
```sql
CREATE TABLE PR_TASKREGLN (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    MasterID INT,                    -- FK to PR_TASKREG.ID
    EmpCode VARCHAR(50),
    TrxDate DATETIME,
    Hours DECIMAL(18, 2),
    TaskCode VARCHAR(50),
    ShiftCode VARCHAR(50),
    Amount DECIMAL(18, 2),           -- Pre-calculated amount (if available)
    Rate DECIMAL(18, 2),             -- Pre-calculated rate (if available)
    OT BIT,                          -- Overtime flag (1 = overtime)
    -- Other fields...
);
```

**3. HR_EMPLOYEE**
```sql
SELECT EmpCode, EmpName 
FROM HR_EMPLOYEE 
WHERE EmpCode = ?
```

**4. PR_TASKCODE**
```sql
SELECT TaskCode, TaskDesc 
FROM PR_TASKCODE 
WHERE TaskCode = ?
```

**5. HR_GPH** (Holiday Calendar)
```sql
SELECT HolidayDate, Description 
FROM HR_GPH 
WHERE YEAR(HolidayDate) = ?
```

---

## Best Practices

### 1. **Always Use Batch Calculation for Multiple Employees**

```typescript
// ✅ GOOD: Batch calculation
const empCodes = ['E0001', 'E0002', 'E0003'];
const overtimeData = await lemburCalculator.calculateBatchData(
    empCodes, month, year
);

// ❌ BAD: Individual calculation in loop
for (const empCode of empCodes) {
    const data = await lemburCalculator.calculate(empCode, month, year);
}
```

### 2. **Cache Holiday Data**

```typescript
// ✅ GOOD: Holidays are cached automatically
const holidays = await lemburCalculator.getHolidays(2026);
// Cached for 1 hour

// ❌ BAD: Fetch holidays for each employee
for (const emp of employees) {
    const holidays = await getHolidays(year);  // N queries!
}
```

### 3. **Provide UPJ When Available**

```typescript
// ✅ GOOD: Calculate UPJ from payrate
const payRates = await payrollService.getPayratesMap(empCodes);
const upj = payRates['E0001'] > 0 ? (payRates['E0001'] * 30) / 173 : undefined;
const overtime = await lemburCalculator.calculate('E0001', month, year, upj);

// ❌ BAD: Always use default UPJ
const overtime = await lemburCalculator.calculate('E0001', month, year);
```

### 4. **Use Task Breakdown for Detailed Reporting**

```typescript
// ✅ GOOD: Get detailed breakdown
const overtimeData = await lemburCalculator.calculateBatchDataWithTaskBreakdown(
    empCodes, month, year
);

// Access task breakdown
overtimeData['E0001'].task_breakdown.forEach(task => {
    console.log(`${task.task_desc}: ${task.hours} hours = Rp ${task.amount}`);
});
```

---

## Troubleshooting

### Issue: Lembur Tidak Muncul

**Symptom**: `total_hours = 0` meskipun ada transaksi lembur.

**Solution**:
1. Cek是否存在 di `PR_TASKREGLN`:
   ```sql
   SELECT * FROM PR_TASKREGLN 
   WHERE EmpCode = ? AND OT = 1
   ```
2. Verifikasi periode `TrxDate` match
3. Cek `OT` flag = 1

### Issue: UPJ Salah

**Symptom**: Perhitungan lembur berbeda dari ekspektasi.

**Solution**:
1. Verifikasi PayRate di `HR_PAYROLL`:
   ```sql
   SELECT PayRate FROM HR_PAYROLL WHERE EmpCode = ?
   ```
2. Cek UPJ calculation: `UPJ = (PayRate × 30) / 173`
3. Jika PayRate null, check environment variable `LEMBUR_UPJ`

### Issue: Day Type Salah

**Symptom**: Multiplier tidak sesuai (e.g., hari Minggu dihitung sebagai hari kerja).

**Solution**:
1. Cek holiday calendar di `HR_GPH`:
   ```sql
   SELECT * FROM HR_GPH WHERE HolidayDate = '2026-01-05'
   ```
2. Verifikasi `Description` untuk religious holiday detection
3. Clear cache: `cacheService.delete('holidays_2026')`

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Integration dengan PayrollService
- 📄 [`06_UPAH_BERSIH_DETAIL_SERVICE.md`](./06_UPAH_BERSIH_DETAIL_SERVICE.md) - Detail aktivitas lembur
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Database tables
- 📄 [`10_CALCULATION_FORMULAS.md`](./10_CALCULATION_FORMULAS.md) - Formula lembur

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/services/lemburCalculator.ts`  
**Database**: `PR_TASKREG`, `PR_TASKREGLN`, `PR_TASKREGLN_ARC`
