# WagesService - Layanan Perbandingan Payroll dengan Wages

## Gambaran Umum

**WagesService** adalah service yang bertanggung jawab untuk membandingkan data daftar upah (payroll calculation) dengan data wages (penggajian aktual yang dibayarkan). Service ini membantu memverifikasi bahwa perhitungan payroll sesuai dengan pembayaran yang sebenarnya dilakukan.

**File Lokasi**: `backend/src/services/wagesService.ts`

## Perbedaan Payroll vs Wages

### Payroll (Daftar Upah)
- **Sumber**: Perhitungan berdasarkan HK, payrate, tunjangan, premi, potongan
- **Tabel**: `payroll_history_header`, `payroll_history_detail`
- **Detail**: Breakdown lengkap (gaji pokok, tunjangan, premi, potongan)
- **Timing**: Perhitungan untuk periode tertentu

### Wages (Penggajian)
- **Sumber**: Data pembayaran aktual dari sistem penggajian
- **Tabel**: `PR_EMPWAGES`, `PR_EMPWAGES_ARC`
- **Detail**: Hanya net amount (upah bersih yang dibayarkan)
- **Timing**: Periode accounting (bisa berbeda dari kalender)

## Struktur Data

### Interface: WagesDetail

```typescript
export interface WagesDetail {
    id?: number;
    wages_no: string;           // ID sebagai string
    emp_code: string;           // Kode karyawan
    emp_name?: string;          // Nama karyawan
    nik?: string;               // ICNo (Nomor Induk Karyawan)
    gang_code: string;          // Dari HR_GANGLN join
    division_code: string;      // LocCode atau DeptCode
    
    // Field yang TIDAK tersedia di PR_EMPWAGES (selalu 0)
    jumlah_hk: number;          // Not available
    upah_dasar?: number;        // Not available
    upah_pokok?: number;        // Not available
    gaji_pokok?: number;        // Not available
    total_tunjangan?: number;   // Not available
    total_premi?: number;       // Not available
    total_potongan?: number;    // Not available
    
    // Field yang tersedia
    upah_bersih: number;        // Amount column (net salary)
    payment_status?: string;    // Status column
    payment_date?: Date;        // CreditDate atau CreateDate
    period_month?: number;      // AccMonth
    period_year?: number;       // AccYear
}
```

### Interface: WagesComparison

```typescript
export interface WagesComparison {
    emp_code: string;
    nik?: string;
    nama?: string;
    gang_code: string;
    division_code: string;
    
    // Data dari daftar upah (calculated) - Detailed breakdown
    daftar_upah: {
        jumlah_hk: number;
        upah_dasar: number;
        gaji_pokok: number;
        
        // Tunjangan detail
        beras_jumlah: number;
        jabatan_jumlah: number;
        masa_kerja_jumlah: number;
        total_tunjangan: number;
        
        // Lembur
        lembur_jam: number;
        lembur_jumlah: number;
        
        // Premi detail
        premi_brondol: number;
        premi_pph: number;
        total_premi: number;
        
        // Potongan detail
        pot_spsi: number;
        pot_pph21: number;
        pot_astek_pekerja: number;
        pot_bpjs_kesehatan_pekerja: number;
        pot_bpjs_pensiun_pekerja: number;
        pot_koreksi: number;
        total_potongan: number;
        
        // Summary
        jumlah_upah_kotor: number;
        upah_bersih: number;
        
        // Pajak info
        status_ptkp?: string;
        kategori_ter?: string;
        tarif_pajak_ter?: number;
        pph21_ter?: number;
    };
    
    // Data dari wages (paid)
    wages: {
        wages_no: string;
        wages_date?: Date;
        jumlah_hk: number;
        upah_dasar?: number;
        gaji_pokok?: number;
        total_tunjangan?: number;
        total_premi?: number;
        total_potongan?: number;
        upah_bersih: number;
        payment_status?: string;
    } | null;
    
    // Comparison result
    comparison: {
        hk_match: boolean;
        amount_match: boolean;
        hk_difference: number;
        amount_difference: number;
        status: 'MATCH' | 'MINOR_DIFF' | 'MAJOR_DIFF' | 'NO_WAGES';
    };
}
```

### Interface: WagesComparisonSummary

```typescript
export interface WagesComparisonSummary {
    period_month: number;
    period_year: number;
    period_label: string;           // e.g., "Januari 2026"
    total_employees: number;
    matched: number;                // Status: MATCH
    minor_differences: number;      // Status: MINOR_DIFF
    major_differences: number;      // Status: MAJOR_DIFF
    no_wages_data: number;          // Status: NO_WAGES
    total_variance: number;         // Sum of absolute differences
    tolerance: number;              // AMOUNT_TOLERANCE (1000)
}
```

## Konstanta

### Tolerance Values

```typescript
const AMOUNT_TOLERANCE = 1000;  // Rp 1,000
const HK_TOLERANCE = 0.5;       // 0.5 HK
```

**Status Determination**:
- **MATCH**: `amountDiff <= 1000`
- **MINOR_DIFF**: `1000 < amountDiff <= 10000`
- **MAJOR_DIFF**: `amountDiff > 10000`
- **NO_WAGES**: Tidak ada data wages

## Metode Publik

### 1. getWagesByPeriod()

Mengambil data wages untuk periode tertentu.

```typescript
async getWagesByPeriod(
    month: number, 
    year: number, 
    divisionCode?: string
): Promise<WagesDetail[]>
```

**Parameter**:
- `month`: Bulan kalender (1-12)
- `year`: Tahun (e.g., 2026)
- `divisionCode`: Filter divisi (optional, 'ALL' untuk semua)

**Proses**:
1. **Convert calendar month ke accounting month**:
   ```typescript
   // Accounting period mapping:
   // Calendar month 1 (Jan) → Acc month 4
   // Calendar month 2 (Feb) → Acc month 5
   // ...
   // Calendar month 9 (Sep) → Acc month 12
   // Calendar month 10 (Oct) → Acc month 1 (next year)
   // Calendar month 11 (Nov) → Acc month 2 (next year)
   // Calendar month 12 (Dec) → Acc month 3 (next year)
   
   const { accMonth, accYear } = this.calendarToAccounting(month, year);
   ```

2. **Query PR_EMPWAGES**:
   ```sql
   SELECT
       ew.ID as id,
       CAST(ew.ID AS VARCHAR) as wages_no,
       ew.EmpCode as emp_code,
       ew.EmpName as emp_name,
       ew.ICNo as nik,
       '' as gang_code,
       ISNULL(ew.LocCode, ew.DeptCode) as division_code,
       ew.Amount as upah_bersih,
       ew.Status as payment_status,
       ew.CreditDate as payment_date,
       CAST(ew.AccMonth AS INT) as period_month,
       CAST(ew.AccYear AS INT) as period_year
   FROM PR_EMPWAGES ew
   WHERE CAST(ew.AccMonth AS INT) = ?
     AND CAST(ew.AccYear AS INT) = ?
   ```

3. **Fallback ke archive**: Jika query gagal, coba `PR_EMPWAGES_ARC`

**Contoh Penggunaan**:
```typescript
const wages = await wagesService.getWagesByPeriod(1, 2026, 'P1A');
// Return: Array of WagesDetail
```

---

### 2. getWagesByEmployee()

Mengambil wages untuk karyawan tertentu di periode tertentu.

```typescript
async getWagesByEmployee(
    empCode: string, 
    month: number, 
    year: number
): Promise<WagesDetail | null>
```

**Proses**:
1. Query `PR_EMPWAGES` dengan filter `EmpCode`
2. Jika tidak ada, coba `PR_EMPWAGES_ARC`
3. Return `null` jika tidak ditemukan

**Contoh**:
```typescript
const wages = await wagesService.getWagesByEmployee('E0001', 1, 2026);
if (wages) {
    console.log(`Wages for E0001: ${wages.upah_bersih}`);
}
```

---

### 3. getEmployeeWagesHistory()

Mengambil history wages untuk karyawan tertentu (multiple periods).

```typescript
async getEmployeeWagesHistory(
    empCode: string, 
    months: number = 12
): Promise<WagesDetail[]>
```

**Query**:
```sql
SELECT TOP @months *
FROM (
    SELECT ... FROM PR_EMPWAGES WHERE EmpCode = ?
    UNION ALL
    SELECT ... FROM PR_EMPWAGES_ARC WHERE EmpCode = ?
) combined
ORDER BY period_year DESC, period_month DESC
```

**Contoh**:
```typescript
const history = await wagesService.getEmployeeWagesHistory('E0001', 12);
// Return: 12 months of wages data (newest first)
```

---

### 4. comparePayrollWithWages() ⭐

Metode utama untuk membandingkan payroll dengan wages.

```typescript
async comparePayrollWithWages(
    payrollData: any[],
    month: number,
    year: number,
    divisionCode?: string
): Promise<{ 
    summary: WagesComparisonSummary; 
    data: WagesComparison[] 
}>
```

**Proses**:

```
┌─────────────────────────────────────────────────────────────┐
│         ALUR PERBANDINGAN PAYROLL vs WAGES                  │
└─────────────────────────────────────────────────────────────┘

1. Ambil Wages Data
   └─ wagesService.getWagesByPeriod(month, year, divisionCode)

2. Build Wages Map (untuk lookup cepat)
   └─ Map<emp_code, WagesDetail>

3. Loop Payroll Data
   ├─ Untuk setiap employee di payroll:
   │  ├─ Lookup wages di map
   │  ├─ Build daftar_upah object (detailed)
   │  ├─ Build wages object (simplified)
   │  └─ Hitung perbedaan
   │
   └─ Tentukan status:
      ├─ NO_WAGES: Tidak ada data wages
      ├─ MATCH: amountDiff <= 1000
      ├─ MINOR_DIFF: 1000 < amountDiff <= 10000
      └─ MAJOR_DIFF: amountDiff > 10000

4. Calculate Summary
   ├─ Count by status
   ├─ Total variance
   └─ Verification rate

5. Return { summary, data }
```

**Status Logic**:
```typescript
if (!wages) {
    status = 'NO_WAGES';
} else if (hkDiff <= 0.5 && amountDiff <= 1000) {
    status = 'MATCH';
} else if (amountDiff <= 10000) {
    status = 'MINOR_DIFF';
} else {
    status = 'MAJOR_DIFF';
}
```

**Contoh Penggunaan**:
```typescript
// 1. Ambil payroll data
const payrollResult = await dataExtractorService.extractPayrollData(
    1, 2026, 'ALL', 'P1A'
);
const payrollData = payrollResult.data_rows;

// 2. Compare dengan wages
const comparison = await wagesService.comparePayrollWithWages(
    payrollData,
    1, 2026,
    'P1A'
);

// 3. Access results
console.log(`Matched: ${comparison.summary.matched}`);
console.log(`Minor Diff: ${comparison.summary.minor_differences}`);
console.log(`Major Diff: ${comparison.summary.major_differences}`);
console.log(`No Wages: ${comparison.summary.no_wages_data}`);

// 4. Get detailed comparisons
comparison.data.forEach(comp => {
    console.log(`${comp.emp_code}: ${comp.comparison.status}`);
    console.log(`  Amount Diff: ${comp.comparison.amount_difference}`);
});
```

---

### 5. getAvailableWagesPeriods()

Mengambil periode yang tersedia di tabel wages.

```typescript
async getAvailableWagesPeriods(): Promise<
    Array<{ 
        month: number; 
        year: number; 
        label: string; 
        employee_count: number 
    }>
>
```

**Query**:
```sql
SELECT
    period_month as month,
    period_year as year,
    COUNT(DISTINCT emp_code) as employee_count
FROM (
    SELECT AccMonth as period_month, AccYear as period_year, EmpCode as emp_code
    FROM PR_EMPWAGES
    UNION ALL
    SELECT AccMonth as period_month, AccYear as period_year, EmpCode as emp_code
    FROM PR_EMPWAGES_ARC
) combined
GROUP BY period_month, period_year
ORDER BY period_year DESC, period_month DESC
```

**Contoh Output**:
```typescript
[
    { month: 1, year: 2026, label: 'Januari 2026', employee_count: 250 },
    { month: 12, year: 2025, label: 'Desember 2025', employee_count: 248 },
    { month: 11, year: 2025, label: 'November 2025', employee_count: 245 }
]
```

---

## Calendar to Accounting Conversion

### Fungsi: calendarToAccounting()

```typescript
private calendarToAccounting(
    calendarMonth: number, 
    calendarYear: number
): { accMonth: number; accYear: number }
```

**Mapping Table**:

| Calendar Month | Calendar Year | → | Acc Month | Acc Year |
|----------------|---------------|---|-----------|----------|
| 1 (Jan)        | 2026          | → | 4         | 2026     |
| 2 (Feb)        | 2026          | → | 5         | 2026     |
| 3 (Mar)        | 2026          | → | 6         | 2026     |
| 4 (Apr)        | 2026          | → | 7         | 2026     |
| 5 (May)        | 2026          | → | 8         | 2026     |
| 6 (Jun)        | 2026          | → | 9         | 2026     |
| 7 (Jul)        | 2026          | → | 10        | 2026     |
| 8 (Aug)        | 2026          | → | 11        | 2026     |
| 9 (Sep)        | 2026          | → | 12        | 2026     |
| 10 (Oct)       | 2026          | → | 1         | 2027     |
| 11 (Nov)       | 2026          | → | 2         | 2027     |
| 12 (Dec)       | 2026          | → | 3         | 2027     |

**Formula**:
```typescript
const accMonth = ((calendarMonth + 2) % 12) + 1;
let accYear = calendarYear;
if (accMonth < calendarMonth) {
    accYear++;  // Year wraps around for Oct, Nov, Dec
}
```

**Contoh**:
```typescript
// January 2026
const { accMonth, accYear } = calendarToAccounting(1, 2026);
// accMonth = 4, accYear = 2026

// October 2026
const { accMonth, accYear } = calendarToAccounting(10, 2026);
// accMonth = 1, accYear = 2027
```

---

## Use Cases

### 1. **Verifikasi Pembayaran Payroll**

```typescript
// Verifikasi bahwa payroll yang dihitung sesuai dengan yang dibayarkan
const comparison = await wagesService.comparePayrollWithWages(
    payrollData,
    1, 2026,
    'P1A'
);

const matchRate = (comparison.summary.matched / comparison.summary.total_employees) * 100;
console.log(`Verification Rate: ${matchRate.toFixed(2)}%`);

if (matchRate < 95) {
    console.warn('Low verification rate! Investigate discrepancies.');
}
```

### 2. **Audit Karyawan dengan Perbedaan Besar**

```typescript
// Cari karyawan dengan perbedaan > Rp 10,000
const majorDiffs = comparison.data.filter(
    c => c.comparison.status === 'MAJOR_DIFF'
);

majorDiffs.forEach(diff => {
    console.log(`${diff.emp_code} (${diff.nama}):`);
    console.log(`  Payroll: ${diff.daftar_upah.upah_bersih}`);
    console.log(`  Wages: ${diff.wages?.upah_bersih}`);
    console.log(`  Diff: ${diff.comparison.amount_difference}`);
});
```

### 3. **History Trend Analysis**

```typescript
// Analisis trend verifikasi per bulan
const history = await wagesService.getEmployeeWagesHistory('E0001', 12);

history.forEach(wages => {
    console.log(`${wages.period_month}/${wages.period_year}: ${wages.upah_bersih}`);
});
```

---

## Integrasi dengan API

### Endpoint: GET /payroll/wages/comparison/:month/:year

```typescript
// wagesRoutes.ts
.get("/comparison/:month/:year", async ({ params, query }) => {
    const month = parseInt(params.month);
    const year = parseInt(params.year);
    const divisionCode = query.division as string | undefined;
    
    // 1. Get payroll data
    const payrollResult = await dataExtractorService.extractPayrollData(
        month, year, 'ALL', divisionCode
    );
    
    // 2. Compare with wages
    const comparison = await wagesService.comparePayrollWithWages(
        payrollResult.data_rows,
        month, year, divisionCode
    );
    
    return {
        success: true,
        period: { month, year, label: `${getMonthName(month)} ${year}` },
        summary: comparison.summary,
        data: comparison.data
    };
})
```

**Response Example**:
```json
{
    "success": true,
    "period": {
        "month": 1,
        "year": 2026,
        "label": "Januari 2026"
    },
    "summary": {
        "period_month": 1,
        "period_year": 2026,
        "period_label": "Januari 2026",
        "total_employees": 250,
        "matched": 240,
        "minor_differences": 5,
        "major_differences": 3,
        "no_wages_data": 2,
        "total_variance": 45000,
        "tolerance": 1000
    },
    "data": [
        {
            "emp_code": "E0001",
            "nik": "E0001",
            "nama": "John Doe",
            "gang_code": "A01",
            "division_code": "P1A",
            "daftar_upah": {
                "upah_bersih": 3500000
            },
            "wages": {
                "wages_no": "12345",
                "upah_bersih": 3500000
            },
            "comparison": {
                "hk_match": true,
                "amount_match": true,
                "hk_difference": 0,
                "amount_difference": 0,
                "status": "MATCH"
            }
        }
    ]
}
```

---

## Troubleshooting

### Issue: Tidak Ada Data Wages

**Symptom**: `no_wages_data` tinggi di summary.

**Solution**:
1. Verifikasi periode accounting: Cek `calendarToAccounting()` conversion
2. Cek data di `PR_EMPWAGES`: 
   ```sql
   SELECT * FROM PR_EMPWAGES WHERE AccMonth = ? AND AccYear = ?
   ```
3. Cek archive table: `PR_EMPWAGES_ARC`

### Issue: Banyak Perbedaan Besar

**Symptom**: `major_differences` tinggi.

**Solution**:
1. Investigasi karyawan dengan perbedaan besar
2. Cek apakah ada adjustment manual di wages
3. Verifikasi periode payroll match dengan wages
4. Cek是否存在 duplicate entries

### Issue: HK Tidak Match

**Symptom**: `hk_match` false meskipun amount match.

**Note**: PR_EMPWAGES tidak memiliki field HK, jadi HK comparison selalu `true` (asumsi match).

Jika perlu HK comparison, gunakan data dari payroll sebagai source of truth.

---

## Best Practices

### 1. **Selalu Gunakan Tolerance**

```typescript
// ✅ GOOD: Gunakan tolerance untuk floating point comparison
const amountMatch = Math.abs(payroll - wages) <= AMOUNT_TOLERANCE;

// ❌ BAD: Exact comparison
const amountMatch = payroll === wages;
```

### 2. **Handle Null Wages Gracefully**

```typescript
// ✅ GOOD: Handle null wages
if (!wages) {
    status = 'NO_WAGES';
    console.warn(`No wages data for ${emp_code}`);
}

// ❌ BAD: Access property tanpa check
const amount = wages.upah_bersih;  // Error jika wages null
```

### 3. **Cache Comparison Results**

```typescript
// ✅ GOOD: Cache untuk menghindari recalculation
const cacheKey = `wages_comparison:${month}:${year}:${divisionCode}`;
let cached = cacheService.get(cacheKey);

if (!cached) {
    cached = await wagesService.comparePayrollWithWages(...);
    cacheService.set(cacheKey, cached, 300); // 5 minutes
}
```

### 4. **Log Discrepancies untuk Audit**

```typescript
// Log major discrepancies
comparison.data
    .filter(c => c.comparison.status === 'MAJOR_DIFF')
    .forEach(c => {
        console.error(`[WagesAudit] Major diff for ${c.emp_code}:`, {
            payroll: c.daftar_upah.upah_bersih,
            wages: c.wages?.upah_bersih,
            diff: c.comparison.amount_difference
        });
    });
```

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Payroll calculation
- 📄 [`08_API_ROUTES_WAGES.md`](./08_API_ROUTES_WAGES.md) - API endpoints
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Schema PR_EMPWAGES
- 📄 [`00_README_MAIN.md`](./00_README_MAIN.md) - Gambaran umum daftar upah

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/services/wagesService.ts`  
**Database**: `PR_EMPWAGES`, `PR_EMPWAGES_ARC`
