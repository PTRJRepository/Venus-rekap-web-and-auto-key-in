# OtherIncomesService - Layanan Pendapatan Lain (THR & Bonus)

## Gambaran Umum

**OtherIncomesService** adalah service yang mengelola pendapatan lain di luar payroll reguler, seperti THR (Tunjangan Hari Raya), Bonus, dan income custom lainnya. Service ini menangani perhitungan, penyimpanan, dan pengelolaan data pendapatan khusus ini.

**File Lokasi**: `backend/src/services/otherIncomesService.ts`

## Jenis Pendapatan Lain

### 1. **THR (Tunjangan Hari Raya)**
- Diberikan menjelang hari raya keagamaan
- Perhitungan berdasarkan upah dasar dan masa kerja
- Formula: `(UPAH_DASAR × 30) + (BERAS_RATE × 30) + MASA_KERJA_JUMLAH`

### 2. **Bonus**
- Bonus kinerja atau bonus tahunan
- Amount dapat bervariasi
- Dapat diformula-based atau fixed amount

### 3. **Custom Income**
- Pendapatan lain yang didefinisikan user
- Flexible formula dan amount

## Struktur Data

### Interface: OtherIncome

```typescript
export interface OtherIncome {
    id?: number;
    nik: string;                    // Nomor Induk Karyawan
    emp_name: string;               // Nama karyawan
    division_code?: string;         // Kode divisi
    gang_code?: string;             // Kode gang
    period_year: number;            // Tahun periode
    period_month: number;           // Bulan periode
    income_type: string;            // THR, Bonus, Custom
    income_name: string;            // Detail nama (e.g., "THR 2026")
    amount: number;                 // Nominal rupiah
    is_paid_in_thp: boolean;        // Apakah dibayar di THP
    is_taxable: boolean;            // Apakah kena pajak
    created_at?: string;            // Timestamp creation
    updated_at?: string;            // Timestamp update
    details?: any;                  // Detail formula variables
    religion?: string;              // Agama (untuk THR)
    original_religion?: string;     // Agama sebelum enrichment
    join_date?: string;             // Tanggal bergabung
    emp_code?: string;              // Employee code
    bank_acc_no?: string;           // Nomor rekening bank
    bank_code?: string;             // Kode bank
}
```

## Database Tables

### 1. Table: `employee_other_incomes`

```sql
CREATE TABLE employee_other_incomes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nik VARCHAR(50) NOT NULL,
    emp_name VARCHAR(150),
    division_code VARCHAR(50),
    gang_code VARCHAR(50),
    period_year INT NOT NULL,
    period_month INT NOT NULL,
    income_type VARCHAR(50) NOT NULL,     -- 'THR', 'Bonus', 'Custom'
    income_name VARCHAR(150),             -- Detail name
    amount DECIMAL(18, 2) DEFAULT 0,
    is_paid_in_thp BIT DEFAULT 0,         -- 0 = No, 1 = Yes
    is_taxable BIT DEFAULT 0,             -- 0 = No, 1 = Yes
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- Add details_json column for storing formula variables
ALTER TABLE employee_other_incomes 
ADD details_json NVARCHAR(MAX) NULL;
```

### 2. Table: `employee_other_incomes_formulas`

```sql
CREATE TABLE employee_other_incomes_formulas (
    income_type VARCHAR(50) PRIMARY KEY,
    formula_string VARCHAR(500) NOT NULL,
    updated_at DATETIME DEFAULT GETDATE()
);

-- Default formula for THR
INSERT INTO employee_other_incomes_formulas (income_type, formula_string)
VALUES ('THR', '(UPAH_DASAR * 30) + (BERAS_RATE * 30) + MASA_KERJA_JUMLAH');
```

### 3. Table: `employee_other_incomes_blacklist`

```sql
CREATE TABLE employee_other_incomes_blacklist (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nik VARCHAR(50) NOT NULL,
    emp_name VARCHAR(150),
    period_year INT NOT NULL,
    period_month INT NOT NULL,
    income_type VARCHAR(50) NOT NULL,
    reason VARCHAR(255),                -- Alasan blacklist
    created_at DATETIME DEFAULT GETDATE()
);

CREATE INDEX IX_blacklist_nik_period 
ON employee_other_incomes_blacklist(nik, period_year, period_month);
```

## Metode Publik

### 1. initTable()

Menginisialisasi semua tabel yang dibutuhkan.

```typescript
static async initTable(): Promise<void>
```

**Proses**:
1. Buat tabel `employee_other_incomes` jika belum ada
2. Tambah kolom `details_json` jika belum ada
3. Buat tabel `employee_other_incomes_formulas`
4. Seed default formula untuk THR
5. Buat tabel `employee_other_incomes_blacklist`

**Idempotent**: Aman dipanggil berkali-kali.

---

### 2. addToBlacklist()

Menambahkan karyawan ke blacklist untuk income type tertentu.

```typescript
static async addToBlacklist(
    nik: string,
    name: string,
    year: number,
    month: number,
    type: string,
    reason: string = 'User deleted'
): Promise<boolean>
```

**Parameter**:
- `nik`: Nomor induk karyawan
- `name`: Nama karyawan
- `year`: Tahun periode
- `month`: Bulan periode
- `type`: Jenis income ('THR', 'Bonus', dll)
- `reason`: Alasan blacklist (default: 'User deleted')

**Query**:
```sql
INSERT INTO employee_other_incomes_blacklist 
(nik, emp_name, period_year, period_month, income_type, reason, created_at)
VALUES (?, ?, ?, ?, ?, ?, GETDATE())
```

**Use Case**: Ketika user manually menghapus THR/Bonus, tambahkan ke blacklist agar tidak muncul di perhitungan berikutnya.

---

### 3. getBlacklist()

Mengambil daftar blacklist untuk periode dan type tertentu.

```typescript
static async getBlacklist(
    year: number,
    month: number,
    type: string
): Promise<Set<string>>
```

**Return**: `Set<string>` dari NIK yang di-blacklist

**Query**:
```sql
SELECT nik 
FROM employee_other_incomes_blacklist
WHERE period_year = ? AND period_month = ? AND income_type = ?
```

**Use Case**: Filter karyawan yang tidak boleh menerima income type tertentu.

---

### 4. removeFromBlacklist()

Menghapus karyawan dari blacklist.

```typescript
static async removeFromBlacklist(
    nik: string,
    year: number,
    month: number,
    type: string
): Promise<boolean>
```

**Query**:
```sql
DELETE FROM employee_other_incomes_blacklist
WHERE nik = ? AND period_year = ? AND period_month = ? AND income_type = ?
```

---

### 5. calculateTHR() ⭐

Menghitung THR untuk karyawan berdasarkan formula.

```typescript
static async calculateTHR(
    empCode: string,
    year: number,
    month: number
): Promise<{
    success: boolean;
    amount: number;
    formula: string;
    variables: Record<string, any>;
    error?: string;
}>
```

**Formula THR** (dari `employee_other_incomes_formulas`):
```
THR = (UPAH_DASAR × 30) + (BERAS_RATE × 30) + MASA_KERJA_JUMLAH
```

**Variabel yang Dibutuhkan**:
- `UPAH_DASAR`: Payrate per HK dari `HR_PAYROLL.PayRate`
- `BERAS_RATE`: Rate beras dari `HR_PAYROLL.RiceRation`
- `MASA_KERJA_JUMLAH`: Tunjangan masa kerja dari `PR_ADTRANS` atau `HR_HISTORY`

**Proses**:
```
┌─────────────────────────────────────────────────────────────┐
│            ALUR PERHITUNGAN THR                              │
└─────────────────────────────────────────────────────────────┘

1. Ambil Data Karyawan
   ├─ HR_EMPLOYEE: nama, agama, join_date
   ├─ HR_PAYROLL: PayRate, RiceRation
   └─ HR_HISTORY: masa_kerja_jumlah

2. Validasi Eligibility
   ├─ Cek blacklist
   ├─ Cek agama (harus valid untuk THR)
   └─ Cek employment status

3. Ambil Formula
   └─ employee_other_incomes_formulas 
      WHERE income_type = 'THR'

4. Evaluate Formula
   ├─ Replace variables dengan nilai aktual
   ├─ Calculate result
   └─ Handle errors

5. Return Result
   ├─ amount: Calculated THR
   ├─ formula: Formula string
   └─ variables: Variable values used
```

**Contoh Penggunaan**:
```typescript
const thrResult = await OtherIncomesService.calculateTHR('E0001', 2026, 4);

if (thrResult.success) {
    console.log(`THR Amount: ${thrResult.amount}`);
    console.log(`Formula: ${thrResult.formula}`);
    console.log(`Variables:`, thrResult.variables);
    // Variables: {
    //   UPAH_DASAR: 75000,
    //   BERAS_RATE: 3000,
    //   MASA_KERJA_JUMLAH: 100000
    // }
} else {
    console.error(`THR calculation failed: ${thrResult.error}`);
}
```

**Perhitungan Manual**:
```typescript
// Employee E0001:
// - Upah Dasar: 75,000
// - Beras Rate: 3,000
// - Masa Kerja: 100,000

THR = (75000 × 30) + (3000 × 30) + 100000
     = 2,250,000 + 90,000 + 100,000
     = 2,340,000
```

---

### 6. saveOtherIncome()

Menyimpan data other income ke database.

```typescript
static async saveOtherIncome(income: OtherIncome): Promise<boolean>
```

**Query**:
```sql
INSERT INTO employee_other_incomes 
(nik, emp_name, division_code, gang_code, period_year, period_month, 
 income_type, income_name, amount, is_paid_in_thp, is_taxable, details_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**Contoh**:
```typescript
const saved = await OtherIncomesService.saveOtherIncome({
    nik: 'E0001',
    emp_name: 'John Doe',
    division_code: 'P1A',
    gang_code: 'A01',
    period_year: 2026,
    period_month: 4,
    income_type: 'THR',
    income_name: 'THR 2026',
    amount: 2340000,
    is_paid_in_thp: false,
    is_taxable: true,
    details: {
        upah_dasar: 75000,
        beras_rate: 3000,
        masa_kerja: 100000
    }
});
```

---

### 7. getOtherIncomes()

Mengambil other incomes dengan filter.

```typescript
static async getOtherIncomes(filters: {
    year?: number;
    month?: number;
    type?: string;
    divisionCode?: string;
    nik?: string;
}): Promise<OtherIncome[]>
```

**Query Dynamic**:
```sql
SELECT * FROM employee_other_incomes
WHERE 1=1
  -- Apply filters dynamically
  AND period_year = ?
  AND period_month = ?
  AND income_type = ?
  AND division_code = ?
  AND nik = ?
ORDER BY created_at DESC
```

**Contoh**:
```typescript
const thr2026 = await OtherIncomesService.getOtherIncomes({
    year: 2026,
    month: 4,
    type: 'THR'
});
```

---

### 8. deleteOtherIncome()

Menghapus other income dan tambahkan ke blacklist.

```typescript
static async deleteOtherIncome(
    id: number,
    reason: string = 'User deleted'
): Promise<boolean>
```

**Proses**:
1. Ambil data income yang akan dihapus
2. Tambahkan ke blacklist (nik, period, type)
3. Delete dari `employee_other_incomes`

**Use Case**: Ketika user manually menghapus THR/Bonus dari UI.

---

## Formula System

### Supported Variables

| Variable | Sumber | Deskripsi |
|----------|--------|-----------|
| `UPAH_DASAR` | `HR_PAYROLL.PayRate` | Upah dasar per HK |
| `BERAS_RATE` | `HR_PAYROLL.RiceRation` | Rate beras per HK |
| `MASA_KERJA_JUMLAH` | `PR_ADTRANS` / `HR_HISTORY` | Tunjangan masa kerja |
| `HK_COUNT` | Payroll calculation | Jumlah HK |
| `GAJI_POKOK` | Payroll calculation | Gaji pokok |

### Custom Formula

```typescript
// Update formula untuk THR
await db.query(`
    UPDATE employee_other_incomes_formulas
    SET formula_string = '(UPAH_DASAR * 30) + (BERAS_RATE * 30) + MASA_KERJA_JUMLAH + 500000'
    WHERE income_type = 'THR'
`);

// Formula baru: THR = (Upah × 30) + Beras + Masa Kerja + Bonus Tetap 500k
```

### Formula Evaluation

```typescript
// Simple formula evaluator
function evaluateFormula(
    formula: string,
    variables: Record<string, number>
): number {
    let expression = formula;
    
    // Replace variables with values
    for (const [key, value] of Object.entries(variables)) {
        expression = expression.replace(key, String(value));
    }
    
    // Safe evaluate (avoid eval())
    // Use math expression parser library
    return math.evaluate(expression);
}
```

---

## THR Eligibility Rules

### 1. **Agama Requirement**

THR hanya diberikan kepada karyawan dengan agama valid:
- Islam
- Kristen
- Katolik
- Hindu
- Buddha
- Konghucu

**Implementation**:
```typescript
const validReligions = ['ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU'];
const isValid = validReligions.includes(employee.religion?.toUpperCase());
```

### 2. **Employment Status**

- Karyawan aktif (tidak terminate)
- Masih dalam masa kontrak (jika kontrak)

### 3. **Blacklist Check**

- Tidak ada di blacklist untuk periode tersebut
- User tidak manual delete sebelumnya

---

## Use Cases

### 1. **Generate THR untuk Semua Karyawan**

```typescript
async function generateAllTHR(year: number, month: number, divisionCode: string) {
    // 1. Get all employees in division
    const employees = await getEmployeesByDivision(divisionCode);
    
    // 2. Get blacklist
    const blacklist = await OtherIncomesService.getBlacklist(year, month, 'THR');
    
    // 3. Calculate and save for each employee
    for (const emp of employees) {
        // Skip if blacklisted
        if (blacklist.has(emp.nik)) continue;
        
        // Calculate THR
        const thrResult = await OtherIncomesService.calculateTHR(emp.code, year, month);
        
        if (thrResult.success) {
            await OtherIncomesService.saveOtherIncome({
                nik: emp.nik,
                emp_name: emp.name,
                division_code: divisionCode,
                gang_code: emp.gang,
                period_year: year,
                period_month: month,
                income_type: 'THR',
                income_name: `THR ${year}`,
                amount: thrResult.amount,
                is_paid_in_thp: false,
                is_taxable: true,
                details: thrResult.variables
            });
        }
    }
}
```

### 2. **Export THR untuk Pembayaran**

```typescript
async function exportTHRForPayment(year: number, month: number) {
    const thrData = await OtherIncomesService.getOtherIncomes({
        year,
        month,
        type: 'THR'
    });
    
    // Group by division
    const byDivision = thrData.reduce((acc, thr) => {
        const div = thr.division_code || 'UNKNOWN';
        if (!acc[div]) acc[div] = [];
        acc[div].push(thr);
        return acc;
    }, {});
    
    // Calculate totals
    const summary = Object.entries(byDivision).map(([div, employees]) => ({
        division: div,
        employee_count: employees.length,
        total_amount: employees.reduce((sum, e) => sum + e.amount, 0)
    }));
    
    return { summary, details: byDivision };
}
```

### 3. **Recalculate THR setelah Update Payrate**

```typescript
async function recalculateTHRAfterPayrateUpdate(nik: string, year: number, month: number) {
    // 1. Delete existing THR
    const existing = await OtherIncomesService.getOtherIncomes({
        year, month, type: 'THR', nik
    });
    
    for (const thr of existing) {
        await OtherIncomesService.deleteOtherIncome(thr.id);
    }
    
    // 2. Remove from blacklist
    await OtherIncomesService.removeFromBlacklist(nik, year, month, 'THR');
    
    // 3. Recalculate with new payrate
    const newTHR = await OtherIncomesService.calculateTHR(nik, year, month);
    
    if (newTHR.success) {
        await OtherIncomesService.saveOtherIncome({
            nik,
            emp_name: newTHR.emp_name,
            // ... fill other fields
            amount: newTHR.amount
        });
    }
}
```

---

## Integrasi dengan Payroll

### THR di Payroll Calculation

```typescript
// Di PayrollService atau DataExtractorService
async function calculatePayrollWithTHR(empCode: string, month: number, year: number) {
    // 1. Calculate regular payroll
    const regularPayroll = await calculateRegularPayroll(empCode, month, year);
    
    // 2. Check if THR exists for this period
    const thrData = await OtherIncomesService.getOtherIncomes({
        year,
        month,
        type: 'THR',
        nik: empCode
    });
    
    const thrAmount = thrData.length > 0 ? thrData[0].amount : 0;
    
    // 3. Add to payroll if exists
    return {
        ...regularPayroll,
        thr_amount: thrAmount,
        total_with_thr: regularPayroll.upah_bersih + thrAmount
    };
}
```

---

## Best Practices

### 1. **Always Check Blacklist**

```typescript
// ✅ GOOD: Check blacklist before calculation
const blacklist = await OtherIncomesService.getBlacklist(year, month, type);
if (blacklist.has(nik)) {
    console.log(`${nik} is blacklisted for ${type}`);
    return null;
}
```

### 2. **Store Formula Variables**

```typescript
// ✅ GOOD: Store variables in details_json
await saveOtherIncome({
    // ... other fields
    details: {
        upah_dasar: 75000,
        beras_rate: 3000,
        masa_kerja: 100000,
        formula_used: '(UPAH_DASAR * 30) + (BERAS_RATE * 30) + MASA_KERJA_JUMLAH'
    }
});
```

### 3. **Validate Before Save**

```typescript
// ✅ GOOD: Validate amount
if (amount <= 0) {
    throw new Error('Amount must be positive');
}

// Validate period
if (month < 1 || month > 12) {
    throw new Error('Invalid month');
}
```

### 4. **Audit Trail**

```typescript
// ✅ GOOD: Log changes
console.log(`[THR] Calculated ${amount} for ${nik} (${emp_name})`);
console.log(`[THR] Formula: ${formula}`);
console.log(`[THR] Variables:`, variables);
```

---

## Troubleshooting

### Issue: THR Tidak Muncul

**Symptom**: THR tidak muncul di payroll karyawan.

**Solution**:
1. Cek是否存在 di `employee_other_incomes`:
   ```sql
   SELECT * FROM employee_other_incomes 
   WHERE nik = ? AND income_type = 'THR'
   ```
2. Cek blacklist: `SELECT * FROM employee_other_incomes_blacklist WHERE nik = ?`
3. Verifikasi periode match (month/year)

### Issue: THR Amount Salah

**Symptom**: THR amount berbeda dari perhitungan manual.

**Solution**:
1. Cek formula di `employee_other_incomes_formulas`
2. Verifikasi variable values (upah_dasar, beras_rate, masa_kerja)
3. Cek `details_json` untuk nilai yang digunakan

### Issue: Duplicate THR

**Symptom**: THR muncul double untuk karyawan yang sama.

**Solution**:
1. Add unique constraint:
   ```sql
   CREATE UNIQUE INDEX UX_nik_period_type 
   ON employee_other_incomes(nik, period_year, period_month, income_type);
   ```
2. Delete duplicates:
   ```sql
   WITH CTE AS (
       SELECT *, ROW_NUMBER() OVER (
           PARTITION BY nik, period_year, period_month, income_type 
           ORDER BY id
       ) as rn
       FROM employee_other_incomes
   )
   DELETE FROM CTE WHERE rn > 1;
   ```

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Payroll calculation integration
- 📄 [`10_CALCULATION_FORMULAS.md`](./10_CALCULATION_FORMULAS.md) - THR formula detail
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Database tables
- 📄 [`00_README_MAIN.md`](./00_README_MAIN.md) - Gambaran umum komponen upah

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/services/otherIncomesService.ts`  
**Database**: `extend_db_ptrj.dbo.employee_other_incomes`
