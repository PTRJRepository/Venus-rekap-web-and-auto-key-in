# Database Schema - Tabel & Query untuk Daftar Upah

## Gambaran Umum

Dokumentasi ini menjelaskan struktur database, tabel, dan query yang digunakan dalam sistem Daftar Upah. Database yang digunakan adalah Microsoft SQL Server (MSSQL).

## Database Profiles

### 1. **Database Utama** (Config.DB_PROFILE)

Database untuk data karyawan, payroll, dan wages.

**Connection**: `extend_db_ptrj` (atau sesuai config)

**Tabel Utama**:
- `HR_EMPLOYEE` - Data master karyawan
- `HR_PAYROLL` - Payrate dan rice ration
- `HR_GANGLN` - Assignment karyawan ke gang
- `HR_HISTORY` - History karir karyawan
- `PR_WAGES` / `PR_EMPWAGES` - Data wages
- `PR_EMPWAGES_ARC` - Archive wages

### 2. **Database Transaksi** (Config.DB_EXTEND_PROFILE)

Database untuk transaksi harian.

**Connection**: `extend_db_ptrj_transaksi`

**Tabel Transaksi**:
- `PR_TASKREG` - Transaksi lembur
- `PR_ADTRANS` - Transaksi premi/tunjangan
- `PR_LOOSEFRUIT_ARC` - Transaksi brondol (loose fruit)
- `history_taskreg` - History lembur
- `history_adtrans` - History premi

### 3. **Database History** (extend_db_ptrj)

Database untuk history payroll yang sudah di-aggregate.

**Tabel History**:
- `payroll_history_header` - Header history payroll per gang
- `payroll_history_detail` - Detail history payroll per employee
- `daftar_upah_aggregation_history` - Agregasi payroll untuk reporting

### 4. **Database Extended** (extend_db_ptrj)

Database untuk data custom dan konfigurasi.

**Tabel Custom**:
- `tunjangan_rate` - Rate tunjangan jabatan
- `employee_other_incomes` - THR/Bonus
- `employee_other_incomes_formulas` - Formula untuk income calculation
- `employee_other_incomes_blacklist` - Blacklist untuk other incomes

---

## Tabel Utama

### 1. HR_EMPLOYEE

Data master karyawan.

```sql
CREATE TABLE HR_EMPLOYEE (
    EmpCode VARCHAR(50) PRIMARY KEY,      -- Employee code (NIK)
    EmpName VARCHAR(150),                  -- Nama karyawan
    ICNo VARCHAR(50),                      -- Nomor KTP/IC
    Sex VARCHAR(10),                       -- Jenis kelamin
    DeptCode VARCHAR(50),                  -- Department code
    LocCode VARCHAR(50),                   -- Location/Division code
    JoinDate DATETIME,                     -- Tanggal bergabung
    TerminateDate DATETIME,                -- Tanggal terminate (jika ada)
    Religion VARCHAR(50),                  -- Agama
    BankAccNo VARCHAR(50),                 -- Nomor rekening bank
    BankCode VARCHAR(50)                   -- Kode bank
);
```

**Query Example**:
```sql
-- Get active employees by division
SELECT EmpCode, EmpName, ICNo, LocCode, JoinDate, Religion
FROM HR_EMPLOYEE
WHERE LocCode = 'P1A'
  AND TerminateDate IS NULL
ORDER BY EmpName;
```

---

### 2. HR_PAYROLL

Payrate dan benefit rate karyawan.

```sql
CREATE TABLE HR_PAYROLL (
    EmpCode VARCHAR(50) PRIMARY KEY,      -- Employee code
    PayRate DECIMAL(18, 2),                -- Upah dasar per HK
    RiceRation DECIMAL(18, 2),             -- Rate beras per HK
    -- Other fields...
    updated_at DATETIME
);
```

**Query Example**:
```sql
-- Get payrate for employees
SELECT p.EmpCode, p.PayRate, p.RiceRation
FROM HR_PAYROLL p
WHERE p.EmpCode IN ('E0001', 'E0002', 'E0003');
```

**Note**: 
- `PayRate` = Upah dasar per hari kerja
- `RiceRation` = Tunjangan beras per hari kerja (untuk perhitungan Tunjangan Beras)

---

### 3. HR_GANGLN

Assignment karyawan ke gang kerja.

```sql
CREATE TABLE HR_GANGLN (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    GangCode VARCHAR(50),                  -- Kode gang
    EmpCode VARCHAR(50),                   -- Employee code
    LocCode VARCHAR(50),                   -- Division code
    TaskCode VARCHAR(50),                  -- Task code
    TaskDesc VARCHAR(150),                 -- Task description
    JoinDate DATETIME,                     -- Tanggal join gang
    LeaveDate DATETIME,                    -- Tanggal leave gang
    -- Other fields...
);
```

**Query Example**:
```sql
-- Get current gang assignment for employees
SELECT g.GangCode, g.EmpCode, g.LocCode, g.TaskCode, g.TaskDesc
FROM HR_GANGLN g
WHERE g.LocCode = 'P1A'
  AND g.LeaveDate IS NULL
ORDER BY g.GangCode, g.EmpCode;
```

---

### 4. HR_HISTORY

History karir dan masa kerja karyawan.

```sql
CREATE TABLE HR_HISTORY (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    EmpCode VARCHAR(50),
    HistoryType VARCHAR(50),               -- Type of history
    OldValue VARCHAR(150),
    NewValue VARCHAR(150),
    ChangeDate DATETIME,
    -- Other fields...
);
```

**Query Example**:
```sql
-- Get masa kerja amount from PR_ADTRANS
SELECT t.EmpCode, SUM(t.Amount) as MasaKerjaJumlah
FROM PR_ADTRANS t
WHERE UPPER(t.DocDesc) LIKE '%MASA KERJA%'
  AND t.EmpCode = 'E0001'
GROUP BY t.EmpCode;
```

---

### 5. PR_EMPWAGES & PR_EMPWAGES_ARC

Data wages (penggajian aktual).

```sql
CREATE TABLE PR_EMPWAGES (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    AccMonth INT,                          -- Accounting month
    AccYear INT,                           -- Accounting year
    CompCode VARCHAR(50),
    LocCode VARCHAR(50),
    EmpCode VARCHAR(50),
    EmpName VARCHAR(150),
    ICNo VARCHAR(50),
    DeptCode VARCHAR(50),
    Amount DECIMAL(18, 2),                 -- Net wages (upah bersih)
    Status VARCHAR(50),                    -- Payment status
    CreditDate DATETIME,                   -- Payment date
    CreateDate DATETIME,
    UpdateDate DATETIME
    -- Many other fields...
);

-- PR_EMPWAGES_ARC has same structure + OriginalAmt column
```

**Query Example**:
```sql
-- Get wages for period
SELECT 
    ew.ID,
    ew.EmpCode,
    ew.EmpName,
    ew.Amount as UpahBersih,
    ew.Status,
    ew.CreditDate,
    ew.AccMonth,
    ew.AccYear
FROM PR_EMPWAGES ew
WHERE ew.AccMonth = 4 AND ew.AccYear = 2026
ORDER BY ew.EmpName;
```

**Note**: 
- `AccMonth/AccYear` = Accounting period (bukan calendar month)
- `Amount` = Net salary (upah bersih yang dibayarkan)
- Table ini TIDAK memiliki breakdown (gaji pokok, tunjangan, premi, potongan)

---

### 6. PR_TASKREG & history_taskreg

Transaksi lembur.

```sql
CREATE TABLE PR_TASKREG (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DocNo VARCHAR(50),
    DocDate DATETIME,
    GangCode VARCHAR(50),
    EmpCode VARCHAR(50),
    TaskCode VARCHAR(50),
    TaskDesc VARCHAR(150),
    Hours DECIMAL(18, 2),                  -- Jam lembur
    Amount DECIMAL(18, 2),                 -- Amount lembur
    Rate DECIMAL(18, 2),                   -- Rate per jam
    -- Other fields...
);

-- history_taskreg has same structure + period_month, period_year, is_lembur flag
```

**Query Example**:
```sql
-- Get overtime for employee in period
SELECT 
    tr.EmpCode,
    tr.DocDate,
    tr.TaskCode,
    tr.TaskDesc,
    tr.Hours,
    tr.Amount
FROM PR_TASKREG tr
WHERE tr.EmpCode = 'E0001'
  AND tr.DocDate >= '2026-01-01'
  AND tr.DocDate < '2026-02-01'
ORDER BY tr.DocDate;
```

---

### 7. PR_ADTRANS & history_adtrans

Transaksi premi dan tunjangan dinamis.

```sql
CREATE TABLE PR_ADTRANS (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DocNo VARCHAR(50),
    DocDate DATETIME,
    DocDesc VARCHAR(150),                  -- Description (e.g., "TUNJANGAN PREMI INSENTIF")
    GangCode VARCHAR(50),
    EmpCode VARCHAR(50),
    TaskCode VARCHAR(50),
    TaskDesc VARCHAR(150),
    Amount DECIMAL(18, 2),                 -- Amount
    Quantity DECIMAL(18, 2),               -- Quantity
    Category VARCHAR(50),
    SubCategory VARCHAR(50),
    -- Other fields...
);

-- history_adtrans has same structure + period_month, period_year, is_premi flag, dynamic_header_name
```

**Query Example**:
```sql
-- Get premi for employee in period
SELECT 
    t.EmpCode,
    t.DocDate,
    t.DocDesc,
    t.Amount,
    t.Category
FROM PR_ADTRANS t
WHERE t.EmpCode = 'E0001'
  AND t.DocDate >= '2026-01-01'
  AND t.DocDate < '2026-02-01'
  AND UPPER(t.DocDesc) LIKE '%PREMI%'
ORDER BY t.DocDate;
```

---

### 8. PR_LOOSEFRUIT_ARC

Transaksi brondol (loose fruit).

```sql
CREATE TABLE PR_LOOSEFRUIT_ARC (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DocDate DATETIME,
    GangCode VARCHAR(50),
    -- Other fields...
);

CREATE TABLE PR_LOOSEFRUITLN_ARC (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    MasterID INT,                          -- FK to PR_LOOSEFRUIT_ARC.ID
    EmpCode VARCHAR(50),
    Amount DECIMAL(18, 2),                 -- Amount brondol
    -- Other fields...
);
```

**Query Example**:
```sql
-- Get brondol total for employees
SELECT 
    lfln.EmpCode,
    SUM(lfln.Amount) as TotalBrondol
FROM PR_LOOSEFRUIT_ARC lf
JOIN PR_LOOSEFRUITLN_ARC lfln ON lf.ID = lfln.MasterID
WHERE lf.DocDate >= '2026-01-01'
  AND lf.DocDate < '2026-02-01'
GROUP BY lfln.EmpCode;
```

---

### 9. payroll_history_header & payroll_history_detail

History payroll yang sudah di-aggregate.

```sql
CREATE TABLE payroll_history_header (
    id UNIQUEIDENTIFIER PRIMARY KEY,
    history_id VARCHAR(50),
    gang_code VARCHAR(50),
    gang_description VARCHAR(150),
    division_code VARCHAR(50),
    period_month INT,
    period_year INT,
    total_employees INT,
    total_hk DECIMAL(18, 2),
    total_gaji_pokok DECIMAL(18, 2),
    total_tunjangan DECIMAL(18, 2),
    total_premi DECIMAL(18, 2),
    total_potongan DECIMAL(18, 2),
    total_upah_bersih DECIMAL(18, 2),
    created_at DATETIME DEFAULT GETDATE()
);

CREATE TABLE payroll_history_detail (
    id INT IDENTITY(1,1) PRIMARY KEY,
    master_id UNIQUEIDENTIFIER,            -- FK to payroll_history_header.id
    emp_code VARCHAR(50),
    emp_name VARCHAR(150),
    gang_code VARCHAR(50),
    division_code VARCHAR(50),
    task_code VARCHAR(50),
    task_desc VARCHAR(150),
    hari_kerja DECIMAL(18, 2),
    jumlah_hk DECIMAL(18, 2),
    gaji_pokok DECIMAL(18, 2),
    lembur_jam DECIMAL(18, 2),
    lembur_jumlah DECIMAL(18, 2),
    premi_brondol DECIMAL(18, 2),
    total_premi DECIMAL(18, 2),
    total_tunjangan DECIMAL(18, 2),
    total_potongan DECIMAL(18, 2),
    total_potongan_bersih DECIMAL(18, 2),
    jumlah_upah_kotor DECIMAL(18, 2),
    upah_bersih DECIMAL(18, 2),
    pot_pph21 DECIMAL(18, 2),
    pph21_ter DECIMAL(18, 2),
    premi_detail NVARCHAR(MAX),            -- JSON premi breakdown
    lembur_records NVARCHAR(MAX),          -- JSON lembur breakdown
    created_at DATETIME DEFAULT GETDATE()
);
```

**Query Example**:
```sql
-- Get payroll header for period
SELECT 
    h.id,
    h.gang_code,
    h.division_code,
    h.total_employees,
    h.total_upah_bersih
FROM payroll_history_header h
WHERE h.period_month = 1 AND h.period_year = 2026
ORDER BY h.gang_code;

-- Get payroll detail for gang
SELECT 
    d.emp_code,
    d.emp_name,
    d.gaji_pokok,
    d.total_tunjangan,
    d.total_premi,
    d.upah_bersih
FROM payroll_history_detail d
JOIN payroll_history_header h ON d.master_id = h.id
WHERE h.gang_code = 'A01'
  AND h.period_month = 1 AND h.period_year = 2026
ORDER BY d.emp_name;
```

---

### 10. tunjangan_rate

Rate tunjangan jabatan.

```sql
CREATE TABLE tunjangan_rate (
    id INT IDENTITY(1,1) PRIMARY KEY,
    category VARCHAR(50),                  -- 'JABATAN', 'MASA_KERJA', dll
    item_key VARCHAR(100),                 -- 'Mandor', 'Kerani', dll
    rate DECIMAL(18, 2),                   -- Rate/nominal
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT UQ_Tunjangan_Category_Key UNIQUE(category, item_key)
);
```

**Query Example**:
```sql
-- Get all jabatan rates
SELECT item_key, rate
FROM tunjangan_rate
WHERE category = 'JABATAN'
ORDER BY rate DESC;
```

---

### 11. employee_other_incomes

THR, Bonus, dan income lain.

```sql
CREATE TABLE employee_other_incomes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nik VARCHAR(50),
    emp_name VARCHAR(150),
    division_code VARCHAR(50),
    gang_code VARCHAR(50),
    period_year INT,
    period_month INT,
    income_type VARCHAR(50),               -- 'THR', 'Bonus', 'Custom'
    income_name VARCHAR(150),
    amount DECIMAL(18, 2),
    is_paid_in_thp BIT,
    is_taxable BIT,
    details_json NVARCHAR(MAX),            -- JSON formula variables
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
```

**Query Example**:
```sql
-- Get THR for period
SELECT nik, emp_name, amount, details_json
FROM employee_other_incomes
WHERE period_year = 2026 
  AND period_month = 4
  AND income_type = 'THR'
ORDER BY emp_name;
```

---

## Query Patterns

### 1. Get Employee Payroll Data

```sql
-- Get complete payroll data for employee
SELECT 
    e.EmpCode,
    e.EmpName,
    e.LocCode as DivisionCode,
    g.GangCode,
    p.PayRate as UpahDasar,
    p.RiceRation as BerasRate,
    -- Calculate fields
    (p.PayRate * 26) as GajiPokok,  -- Assuming 26 HK
    (p.RiceRation * 26) as BerasJumlah
FROM HR_EMPLOYEE e
JOIN HR_GANGLN g ON e.EmpCode = g.EmpCode
JOIN HR_PAYROLL p ON e.EmpCode = p.EmpCode
WHERE e.EmpCode = 'E0001'
  AND g.LeaveDate IS NULL;
```

### 2. Get Premi Breakdown

```sql
-- Get all premi for employee in period
SELECT 
    t.DocDesc,
    t.Amount,
    t.DocDate,
    CASE 
        WHEN UPPER(t.DocDesc) LIKE '%INSENTIF%' THEN 'INSENTIF'
        WHEN UPPER(t.DocDesc) LIKE '%KINERJA%' THEN 'KINERJA'
        WHEN UPPER(t.DocDesc) LIKE '%BRONDOL%' THEN 'BRONDOL'
        ELSE 'OTHER'
    END as PremiCategory
FROM PR_ADTRANS t
WHERE t.EmpCode = 'E0001'
  AND t.DocDate >= '2026-01-01'
  AND t.DocDate < '2026-02-01'
  AND UPPER(t.DocDesc) LIKE '%PREMI%'
ORDER BY t.DocDate;
```

### 3. Get BPJS Components

```sql
-- Calculate BPJS base for employee
SELECT 
    e.EmpCode,
    e.EmpName,
    p.PayRate,
    (p.PayRate * 30) as GajiStandar,
    -- Assume masa_kerja from subquery
    ISNULL(mk.MasaKerjaJumlah, 0) as MasaKerjaJumlah,
    (p.PayRate * 30) + ISNULL(mk.MasaKerjaJumlah, 0) as BPJSBase,
    -- BPJS Pekerja (4%: 1% Kes + 1% Pensiun + 2% JHT)
    ROUND(((p.PayRate * 30) + ISNULL(mk.MasaKerjaJumlah, 0)) * 0.04, 0) as BPJS_Pekerja,
    -- BPJS Majikan (6%: 4% Kes + 2% Pensiun)
    ROUND(((p.PayRate * 30) + ISNULL(mk.MasaKerjaJumlah, 0)) * 0.06, 0) as BPJS_Majikan
FROM HR_EMPLOYEE e
JOIN HR_PAYROLL p ON e.EmpCode = p.EmpCode
LEFT JOIN (
    SELECT EmpCode, SUM(Amount) as MasaKerjaJumlah
    FROM PR_ADTRANS
    WHERE UPPER(DocDesc) LIKE '%MASA KERJA%'
    GROUP BY EmpCode
) mk ON e.EmpCode = mk.EmpCode
WHERE e.EmpCode = 'E0001';
```

### 4. Get Wages vs Payroll Comparison

```sql
-- Compare payroll with wages
SELECT 
    p.emp_code,
    p.emp_name,
    p.upah_bersih as PayrollUpahBersih,
    w.Amount as WagesUpahBersih,
    p.upah_bersih - w.Amount as Difference
FROM payroll_history_detail p
LEFT JOIN PR_EMPWAGES w ON p.emp_code = w.EmpCode 
    AND w.AccMonth = p.period_month + 3  -- Adjust for accounting period
    AND w.AccYear = p.period_year
WHERE p.master_id = '...'
ORDER BY ABS(p.upah_bersih - w.Amount) DESC;
```

---

## Indexes & Performance

### Recommended Indexes

```sql
-- HR_GANGLN
CREATE INDEX IX_HR_GANGLN_LocCode_LeaveDate 
ON HR_GANGLN(LocCode, LeaveDate);

-- PR_ADTRANS
CREATE INDEX IX_PR_ADTRANS_EmpCode_DocDate 
ON PR_ADTRANS(EmpCode, DocDate);

CREATE INDEX IX_PR_ADTRANS_DocDesc 
ON PR_ADTRANS(DocDesc);

-- PR_TASKREG
CREATE INDEX IX_PR_TASKREG_EmpCode_DocDate 
ON PR_TASKREG(EmpCode, DocDate);

-- payroll_history_detail
CREATE INDEX IX_payroll_history_detail_master_id 
ON payroll_history_detail(master_id);

CREATE INDEX IX_payroll_history_detail_emp_code 
ON payroll_history_detail(emp_code);

-- employee_other_incomes
CREATE UNIQUE INDEX UX_employee_other_incomes_nik_period_type 
ON employee_other_incomes(nik, period_year, period_month, income_type);
```

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Payroll calculation
- 📄 [`05_CARUMAN_DEFINITIONS.md`](./05_CARUMAN_DEFINITIONS.md) - BPJS calculation
- 📄 [`10_CALCULATION_FORMULAS.md`](./10_CALCULATION_FORMULAS.md) - Formula lengkap
- 📄 [`00_README_MAIN.md`](./00_README_MAIN.md) - Gambaran umum

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**Database**: Microsoft SQL Server  
**Profiles**: `extend_db_ptrj`, `extend_db_ptrj_transaksi`
