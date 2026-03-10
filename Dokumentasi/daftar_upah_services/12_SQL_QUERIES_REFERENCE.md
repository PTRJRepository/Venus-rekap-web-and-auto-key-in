# Kumpulan Query SQL - Daftar Upah Services

## Gambaran Umum

Dokumentasi ini berisi **semua query SQL** yang digunakan dalam sistem Daftar Upah, diorganisir berdasarkan fungsi dan tabel yang digunakan. Query-query ini dapat digunakan untuk debugging, reporting manual, atau pemahaman sistem.

---

## Table of Contents

1. [Employee & Payroll Data](#1-employee--payroll-data)
2. [Attendance & Leave](#2-attendance--leave)
3. [Overtime (Lembur)](#3-overtime-lembur)
4. [Premi & Tunjangan](#4-premi--tunjangan)
5. [BPJS & Caruman](#5-bpjs--caruman)
6. [Wages Comparison](#6-wages-comparison)
7. [THR & Other Incomes](#7-thr--other-incomes)
8. [History & Aggregation](#8-history--aggregation)
9. [Master Data](#9-master-data)

---

## 1. Employee & Payroll Data

### 1.1 Get Employee Basic Info

```sql
-- Get employee data by division
SELECT 
    e.EmpCode,
    e.EmpName,
    e.ICNo as NIK,
    e.Sex as JenisKelamin,
    e.DeptCode,
    e.LocCode as DivisionCode,
    e.JoinDate,
    e.TerminateDate,
    e.Religion,
    e.BankAccNo,
    e.BankCode
FROM HR_EMPLOYEE e
WHERE e.LocCode = 'P1A'
  AND e.TerminateDate IS NULL
ORDER BY e.EmpName;
```

### 1.2 Get Employee Payrate

```sql
-- Get payrate and rice ration for employees
SELECT 
    p.EmpCode,
    p.PayRate as UpahDasar,
    p.RiceRation as BerasRate,
    e.EmpName,
    e.LocCode as DivisionCode
FROM HR_PAYROLL p
JOIN HR_EMPLOYEE e ON e.EmpCode = p.EmpCode
WHERE p.EmpCode IN ('E0001', 'E0002', 'E0003')
ORDER BY p.EmpCode;
```

### 1.3 Get Employee Gang Assignment

```sql
-- Get current gang assignment for employees
SELECT 
    g.GangCode,
    g.EmpCode,
    e.EmpName,
    g.LocCode as DivisionCode,
    g.TaskCode,
    tc.TaskDesc,
    g.JoinDate as GangJoinDate
FROM HR_GANGLN g
JOIN HR_EMPLOYEE e ON e.EmpCode = g.EmpCode
LEFT JOIN PR_TASKCODE tc ON tc.TaskCode = g.TaskCode
WHERE g.LocCode = 'P1A'
  AND g.LeaveDate IS NULL
ORDER BY g.GangCode, g.EmpName;
```

### 1.4 Get Employee by Gang Code

```sql
-- Get all employees in specific gang
SELECT 
    g.EmpCode,
    e.EmpName,
    e.ICNo as NIK,
    g.GangCode,
    g.LocCode as DivisionCode,
    g.TaskCode,
    tc.TaskDesc
FROM HR_GANGLN g
JOIN HR_EMPLOYEE e ON e.EmpCode = g.EmpCode
LEFT JOIN PR_TASKCODE tc ON tc.TaskCode = g.TaskCode
WHERE g.GangCode = 'A01'
  AND g.LeaveDate IS NULL
ORDER BY e.EmpName;
```

### 1.5 Get Employees for Payroll Period

```sql
-- Get all active employees for payroll calculation
SELECT 
    e.EmpCode,
    e.EmpName,
    e.LocCode as DivisionCode,
    g.GangCode,
    p.PayRate,
    p.RiceRation,
    e.JoinDate,
    e.Religion
FROM HR_EMPLOYEE e
LEFT JOIN HR_GANGLN g ON g.EmpCode = e.EmpCode AND g.LeaveDate IS NULL
LEFT JOIN HR_PAYROLL p ON p.EmpCode = e.EmpCode
WHERE e.LocCode = 'P1A'
  AND e.TerminateDate IS NULL
  AND e.EmpCode IN (
      SELECT DISTINCT EmpCode 
      FROM PR_TASKREGLN 
      WHERE TrxDate >= '2026-01-01' AND TrxDate <= '2026-01-31'
  )
ORDER BY g.GangCode, e.EmpName;
```

---

## 2. Attendance & Leave

### 2.1 Get Total HK per Employee

```sql
-- Get total working days (HK) for employee in period
SELECT 
    trl.EmpCode,
    COUNT(DISTINCT CONVERT(date, trl.TrxDate)) as TotalHK
FROM PR_TASKREGLN trl
JOIN PR_TASKREG tr ON tr.ID = trl.MasterID
WHERE trl.EmpCode = 'E0001'
  AND trl.TrxDate >= '2026-01-01'
  AND trl.TrxDate <= '2026-01-31'
  AND trl.Hours > 0
GROUP BY trl.EmpCode;
```

### 2.2 Get Leave Summary

```sql
-- Get leave summary for employee
SELECT 
    EmpCode,
    SUM(CASE WHEN LeaveType = 'TAHUNAN' THEN 1 ELSE 0 END) as CutiTahunan,
    SUM(CASE WHEN LeaveType = 'SAKIT' THEN 1 ELSE 0 END) as CutiSakit,
    SUM(CASE WHEN LeaveType = 'MINGGU' THEN 1 ELSE 0 END) as CutiMinggu,
    SUM(CASE WHEN LeaveType = 'NASIONAL' THEN 1 ELSE 0 END) as CutiNasional
FROM HR_LEAVE
WHERE EmpCode = 'E0001'
  AND LeaveDate >= '2026-01-01'
  AND LeaveDate <= '2026-01-31'
GROUP BY EmpCode;
```

### 2.3 Get National Holidays

```sql
-- Get national holidays in period
SELECT 
    HolidayDate,
    Description,
    CASE 
        WHEN Description LIKE '%IDUL%' 
          OR Description LIKE '%NATAL%' 
          OR Description LIKE '%IMLEK%' 
          OR Description LIKE '%WAISAK%' 
          OR Description LIKE '%NYEPI%' 
          OR Description LIKE '%ISRA%' 
          OR Description LIKE '%MAULID%' 
        THEN 1 ELSE 0 
    END as IsReligious
FROM HR_GPH
WHERE HolidayDate >= '2026-01-01'
  AND HolidayDate <= '2026-01-31'
ORDER BY HolidayDate;
```

---

## 3. Overtime (Lembur)

### 3.1 Get Overtime Transactions

```sql
-- Get overtime for employee in period
SELECT 
    trl.ID,
    trl.EmpCode,
    e.EmpName,
    trl.TrxDate,
    trl.Hours,
    trl.TaskCode,
    tc.TaskDesc,
    trl.Amount,
    trl.Rate,
    trl.OT
FROM PR_TASKREGLN trl
JOIN PR_TASKREG tr ON tr.ID = trl.MasterID
LEFT JOIN HR_EMPLOYEE e ON e.EmpCode = trl.EmpCode
LEFT JOIN PR_TASKCODE tc ON tc.TaskCode = trl.TaskCode
WHERE trl.EmpCode = 'E0001'
  AND trl.TrxDate >= '2026-01-01'
  AND trl.TrxDate <= '2026-01-31'
  AND trl.OT = 1
ORDER BY trl.TrxDate;
```

### 3.2 Get Overtime Total per Employee

```sql
-- Get overtime total for multiple employees
SELECT 
    trl.EmpCode,
    SUM(trl.Hours) as TotalJamLembur,
    SUM(trl.Amount) as TotalAmountLembur,
    COUNT(*) as JumlahTransaksi
FROM PR_TASKREGLN trl
JOIN PR_TASKREG tr ON tr.ID = trl.MasterID
WHERE trl.EmpCode IN ('E0001', 'E0002', 'E0003')
  AND trl.TrxDate >= '2026-01-01'
  AND trl.TrxDate <= '2026-01-31'
  AND trl.OT = 1
GROUP BY trl.EmpCode;
```

### 3.3 Get Overtime with Task Breakdown

```sql
-- Get overtime breakdown by task code
SELECT 
    trl.EmpCode,
    trl.TaskCode,
    tc.TaskDesc,
    SUM(trl.Hours) as TotalJam,
    SUM(trl.Amount) as TotalAmount,
    COUNT(*) as JumlahTransaksi
FROM PR_TASKREGLN trl
JOIN PR_TASKREG tr ON tr.ID = trl.MasterID
LEFT JOIN PR_TASKCODE tc ON tc.TaskCode = trl.TaskCode
WHERE trl.EmpCode = 'E0001'
  AND trl.TrxDate >= '2026-01-01'
  AND trl.TrxDate <= '2026-01-31'
  AND trl.OT = 1
GROUP BY trl.EmpCode, trl.TaskCode, tc.TaskDesc
ORDER BY trl.TaskCode;
```

### 3.4 Get Overtime from Archive

```sql
-- Get overtime from archive table
SELECT 
    trl.ID,
    trl.EmpCode,
    e.EmpName,
    trl.TrxDate,
    trl.Hours,
    trl.TaskCode,
    tc.TaskDesc,
    trl.Amount,
    trl.Rate
FROM PR_TASKREGLN_ARC trl
JOIN PR_TASKREG_ARC tr ON tr.ID = trl.MasterID
LEFT JOIN HR_EMPLOYEE e ON e.EmpCode = trl.EmpCode
LEFT JOIN PR_TASKCODE tc ON tc.TaskCode = trl.TaskCode
WHERE trl.EmpCode = 'E0001'
  AND trl.TrxDate >= '2026-01-01'
  AND trl.TrxDate <= '2026-01-31'
  AND trl.OT = 1
ORDER BY trl.TrxDate;
```

### 3.5 Get Overtime Union Active & Archive

```sql
-- Get overtime from both active and archive tables
SELECT 
    trl.ID,
    trl.EmpCode,
    e.EmpName,
    trl.TrxDate,
    trl.Hours,
    trl.TaskCode,
    tc.TaskDesc,
    trl.Amount,
    trl.Rate
FROM (
    -- Active table
    SELECT l.ID, l.EmpCode, l.TrxDate, l.Hours, l.TaskCode, l.Amount, l.Rate
    FROM PR_TASKREGLN l
    JOIN PR_TASKREG m ON l.MasterID = m.ID
    WHERE l.OT = 1
    
    UNION ALL
    
    -- Archive table
    SELECT l.ID, l.EmpCode, l.TrxDate, l.Hours, l.TaskCode, l.Amount, l.Rate
    FROM PR_TASKREGLN_ARC l
    JOIN PR_TASKREG_ARC m ON l.ID = l.MasterID
    WHERE l.OT = 1
) trl
LEFT JOIN HR_EMPLOYEE e ON e.EmpCode = trl.EmpCode
LEFT JOIN PR_TASKCODE tc ON tc.TaskCode = trl.TaskCode
WHERE trl.EmpCode = 'E0001'
  AND trl.TrxDate >= '2026-01-01'
  AND trl.TrxDate <= '2026-01-31'
ORDER BY trl.TrxDate;
```

---

## 4. Premi & Tunjangan

### 4.1 Get Premi Transactions

```sql
-- Get premi transactions for employee
SELECT 
    t.ID,
    t.DocNo,
    t.DocDate,
    t.DocDesc,
    t.EmpCode,
    e.EmpName,
    t.GangCode,
    t.Amount,
    t.Quantity,
    t.Category,
    t.SubCategory
FROM PR_ADTRANS t
LEFT JOIN HR_EMPLOYEE e ON e.EmpCode = t.EmpCode
WHERE t.EmpCode = 'E0001'
  AND t.DocDate >= '2026-01-01'
  AND t.DocDate < '2026-02-01'
  AND UPPER(t.DocDesc) LIKE '%PREMI%'
ORDER BY t.DocDate;
```

### 4.2 Get Premi by Type

```sql
-- Get premi breakdown by type
SELECT 
    t.EmpCode,
    CASE 
        WHEN UPPER(t.DocDesc) LIKE '%INSENTIF%' THEN 'INSENTIF'
        WHEN UPPER(t.DocDesc) LIKE '%KINERJA%' THEN 'KINERJA'
        WHEN UPPER(t.DocDesc) LIKE '%PRODUKSI%' THEN 'PRODUKSI'
        WHEN UPPER(t.DocDesc) LIKE '%RAJIN%' THEN 'RAJIN'
        ELSE 'OTHER'
    END as PremiType,
    SUM(t.Amount) as TotalAmount,
    COUNT(*) as TransactionCount
FROM PR_ADTRANS t
WHERE t.EmpCode = 'E0001'
  AND t.DocDate >= '2026-01-01'
  AND t.DocDate < '2026-02-01'
  AND UPPER(t.DocDesc) LIKE '%PREMI%'
GROUP BY t.EmpCode, 
    CASE 
        WHEN UPPER(t.DocDesc) LIKE '%INSENTIF%' THEN 'INSENTIF'
        WHEN UPPER(t.DocDesc) LIKE '%KINERJA%' THEN 'KINERJA'
        WHEN UPPER(t.DocDesc) LIKE '%PRODUKSI%' THEN 'PRODUKSI'
        WHEN UPPER(t.DocDesc) LIKE '%RAJIN%' THEN 'RAJIN'
        ELSE 'OTHER'
    END;
```

### 4.3 Get Brondol (Loose Fruit)

```sql
-- Get brondol total for employee
SELECT 
    lfln.EmpCode,
    SUM(lfln.Amount) as TotalBrondol,
    COUNT(*) as TransactionCount
FROM PR_LOOSEFRUIT_ARC lf
JOIN PR_LOOSEFRUITLN_ARC lfln ON lf.ID = lfln.MasterID
WHERE lfln.EmpCode = 'E0001'
  AND lf.DocDate >= '2026-01-01'
  AND lf.DocDate < '2026-02-01'
GROUP BY lfln.EmpCode;
```

### 4.4 Get Tunjangan Jabatan

```sql
-- Get all jabatan rates
SELECT 
    category,
    item_key as Jabatan,
    rate as Amount,
    updated_at
FROM tunjangan_rate
WHERE category = 'JABATAN'
ORDER BY rate DESC;
```

### 4.5 Get Tunjangan Masa Kerja

```sql
-- Get masa kerja amount from PR_ADTRANS
SELECT 
    t.EmpCode,
    SUM(t.Amount) as MasaKerjaJumlah,
    COUNT(*) as TransactionCount
FROM PR_ADTRANS t
WHERE UPPER(t.DocDesc) LIKE '%MASA KERJA%'
  AND t.EmpCode = 'E0001'
GROUP BY t.EmpCode;
```

### 4.6 Get Dynamic Premi Headers

```sql
-- Get distinct premi headers for dynamic columns
SELECT DISTINCT
    CASE 
        WHEN UPPER(DocDesc) LIKE '%INSENTIF%' THEN 'INSENTIF'
        WHEN UPPER(DocDesc) LIKE '%KINERJA%' THEN 'KINERJA'
        WHEN UPPER(DocDesc) LIKE '%BRONDOL%' THEN 'BRONDOL'
        WHEN UPPER(DocDesc) LIKE '%PRODUKSI%' THEN 'PRODUKSI'
        WHEN UPPER(DocDesc) LIKE '%RAJIN%' THEN 'RAJIN'
        ELSE UPPER(DocDesc)
    END as PremiHeader
FROM PR_ADTRANS
WHERE DocDate >= '2026-01-01'
  AND DocDate < '2026-02-01'
  AND UPPER(DocDesc) LIKE '%PREMI%'
ORDER BY PremiHeader;
```

---

## 5. BPJS & Caruman

### 5.1 Get BPJS Base Calculation

```sql
-- Calculate BPJS base for employee
SELECT 
    e.EmpCode,
    e.EmpName,
    p.PayRate,
    (p.PayRate * 30) as GajiStandar,
    ISNULL(mk.MasaKerjaJumlah, 0) as MasaKerjaJumlah,
    (p.PayRate * 30) + ISNULL(mk.MasaKerjaJumlah, 0) as BPJSBase
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

### 5.2 Get BPJS Components

```sql
-- Calculate BPJS components
SELECT 
    e.EmpCode,
    e.EmpName,
    base.BPJSBase,
    -- BPJS Kesehatan
    ROUND(base.BPJSBase * 0.01, 0) as BPJS_Kes_Pekerja,
    ROUND(base.BPJSBase * 0.04, 0) as BPJS_Kes_Majikan,
    -- BPJS Pensiun
    ROUND(base.BPJSBase * 0.01, 0) as BPJS_Pensiun_Pekerja,
    ROUND(base.BPJSBase * 0.02, 0) as BPJS_Pensiun_Majikan,
    -- ASTEK JHT
    ROUND(base.BPJSBase * 0.02, 0) as ASTEK_JHT_Pekerja,
    ROUND(base.BPJSBase * 0.037, 0) as ASTEK_JHT_Majikan,
    -- ASTEK JKK/JKM
    ROUND(base.BPJSBase * 0.0084, 0) as ASTEK_JKK_JKM_Majikan,
    -- Totals
    ROUND(base.BPJSBase * 0.04, 0) as Total_Pekerja,
    ROUND(base.BPJSBase * 0.0984, 0) as Total_Majikan
FROM HR_EMPLOYEE e
JOIN HR_PAYROLL p ON e.EmpCode = p.EmpCode
CROSS APPLY (
    SELECT (p.PayRate * 30) as BPJSBase
) base
WHERE e.EmpCode = 'E0001';
```

---

## 6. Wages Comparison

### 6.1 Get Wages by Period

```sql
-- Get wages data for period (accounting period)
SELECT 
    ew.ID,
    CAST(ew.ID AS VARCHAR) as wages_no,
    ew.EmpCode,
    ew.EmpName,
    ew.ICNo as NIK,
    ISNULL(ew.LocCode, ew.DeptCode) as DivisionCode,
    ew.Amount as UpahBersih,
    ew.Status as PaymentStatus,
    ew.CreditDate as PaymentDate,
    CAST(ew.AccMonth AS INT) as AccMonth,
    CAST(ew.AccYear AS INT) as AccYear
FROM PR_EMPWAGES ew
WHERE CAST(ew.AccMonth AS INT) = 4
  AND CAST(ew.AccYear AS INT) = 2026
ORDER BY ew.EmpName;
```

### 6.2 Get Wages from Archive

```sql
-- Get wages from archive table
SELECT 
    ew.ID,
    ew.EmpCode,
    ew.EmpName,
    ew.Amount as UpahBersih,
    ew.Status,
    ew.CreditDate,
    ew.AccMonth,
    ew.AccYear
FROM PR_EMPWAGES_ARC ew
WHERE ew.EmpCode = 'E0001'
  AND ew.AccMonth = 4
  AND ew.AccYear = 2026;
```

### 6.3 Compare Payroll vs Wages

```sql
-- Compare payroll calculation with wages payment
SELECT 
    p.emp_code,
    p.emp_name,
    p.upah_bersih as PayrollUpahBersih,
    w.Amount as WagesUpahBersih,
    p.upah_bersih - w.Amount as Difference,
    CASE 
        WHEN ABS(p.upah_bersih - w.Amount) <= 1000 THEN 'MATCH'
        WHEN ABS(p.upah_bersih - w.Amount) <= 10000 THEN 'MINOR_DIFF'
        ELSE 'MAJOR_DIFF'
    END as Status
FROM payroll_history_detail p
LEFT JOIN PR_EMPWAGES w ON p.emp_code = w.EmpCode 
    AND w.AccMonth = p.period_month + 3
    AND w.AccYear = p.period_year
WHERE p.master_id = 'YOUR_MASTER_ID'
ORDER BY ABS(p.upah_bersih - w.Amount) DESC;
```

### 6.4 Get Available Wages Periods

```sql
-- Get all available wages periods
SELECT 
    period_month as Month,
    period_year as Year,
    COUNT(DISTINCT emp_code) as EmployeeCount
FROM (
    SELECT 
        CAST(AccMonth AS INT) as period_month,
        CAST(AccYear AS INT) as period_year,
        EmpCode as emp_code
    FROM PR_EMPWAGES
    
    UNION ALL
    
    SELECT 
        CAST(AccMonth AS INT) as period_month,
        CAST(AccYear AS INT) as period_year,
        EmpCode as emp_code
    FROM PR_EMPWAGES_ARC
) combined
GROUP BY period_month, period_year
ORDER BY period_year DESC, period_month DESC;
```

---

## 7. THR & Other Incomes

### 7.1 Get THR Records

```sql
-- Get THR for period
SELECT 
    nik,
    emp_name,
    division_code,
    gang_code,
    period_year,
    period_month,
    income_type,
    income_name,
    amount,
    is_paid_in_thp,
    is_taxable,
    details_json,
    created_at
FROM employee_other_incomes
WHERE period_year = 2026
  AND period_month = 4
  AND income_type = 'THR'
ORDER BY emp_name;
```

### 7.2 Get THR Formula

```sql
-- Get THR calculation formula
SELECT 
    income_type,
    formula_string,
    updated_at
FROM employee_other_incomes_formulas
WHERE income_type = 'THR';
```

### 7.3 Get Other Incomes by Type

```sql
-- Get all other incomes by type
SELECT 
    income_type,
    COUNT(*) as RecordCount,
    SUM(amount) as TotalAmount,
    AVG(amount) as AvgAmount
FROM employee_other_incomes
WHERE period_year = 2026
  AND period_month = 4
GROUP BY income_type
ORDER BY income_type;
```

### 7.4 Get Blacklist

```sql
-- Get blacklist for period
SELECT 
    nik,
    emp_name,
    period_year,
    period_month,
    income_type,
    reason,
    created_at
FROM employee_other_incomes_blacklist
WHERE period_year = 2026
  AND period_month = 4
  AND income_type = 'THR'
ORDER BY nik;
```

---

## 8. History & Aggregation

### 8.1 Get Payroll History Header

```sql
-- Get payroll history headers for period
SELECT 
    h.id,
    h.history_id,
    h.gang_code,
    h.gang_description,
    h.division_code,
    h.period_month,
    h.period_year,
    h.total_employees,
    h.total_hk,
    h.total_gaji_pokok,
    h.total_tunjangan,
    h.total_premi,
    h.total_potongan,
    h.total_upah_bersih,
    h.created_at
FROM payroll_history_header h
WHERE h.period_month = 1
  AND h.period_year = 2026
ORDER BY h.division_code, h.gang_code;
```

### 8.2 Get Payroll History Detail

```sql
-- Get payroll detail for specific gang
SELECT 
    d.id,
    d.emp_code,
    d.emp_name,
    d.gang_code,
    d.division_code,
    d.task_code,
    d.task_desc,
    d.hari_kerja,
    d.jumlah_hk,
    d.gaji_pokok,
    d.lembur_jam,
    d.lembur_jumlah,
    d.premi_brondol,
    d.total_premi,
    d.total_tunjangan,
    d.total_potongan,
    d.jumlah_upah_kotor,
    d.upah_bersih,
    d.pot_pph21,
    d.pph21_ter,
    d.premi_detail,
    d.lembur_records
FROM payroll_history_detail d
JOIN payroll_history_header h ON d.master_id = h.id
WHERE h.gang_code = 'A01'
  AND h.period_month = 1
  AND h.period_year = 2026
ORDER BY d.emp_name;
```

### 8.3 Get Aggregation by Division

```sql
-- Get aggregated data by division
SELECT 
    division_code,
    COUNT(DISTINCT gang_code) as TotalGangs,
    SUM(total_employees) as TotalEmployees,
    SUM(total_hk) as TotalHK,
    SUM(total_gaji_pokok) as TotalGajiPokok,
    SUM(total_tunjangan) as TotalTunjangan,
    SUM(total_premi) as TotalPremi,
    SUM(total_potongan) as TotalPotongan,
    SUM(total_upah_bersih) as TotalUpahBersih
FROM daftar_upah_aggregation_history
WHERE period_month = 1
  AND period_year = 2026
GROUP BY division_code
ORDER BY division_code;
```

### 8.4 Get Aggregation with Gang Detail

```sql
-- Get full aggregation with gang breakdown
SELECT 
    h.division_code,
    h.gang_code,
    h.gang_description,
    h.total_employees,
    h.total_hk,
    h.total_gaji_pokok,
    h.total_beras,
    h.total_jabatan,
    h.total_masa_kerja,
    h.total_lembur,
    h.total_tunjangan,
    h.total_premi_brondol,
    h.total_premi,
    h.total_potongan,
    h.total_pph21,
    h.total_bpjs_pekerja,
    h.total_upah_bersih,
    h.dynamic_premi_data,
    h.informasi_tambahan
FROM daftar_upah_aggregation_history h
WHERE h.period_month = 1
  AND h.period_year = 2026
  AND h.division_code = 'P1A'
ORDER BY h.gang_code;
```

---

## 9. Master Data

### 9.1 Get Gang List by Division

```sql
-- Get all gangs for division
SELECT 
    GangCode,
    GangDesc,
    LocCode as DivisionCode
FROM HR_GANG
WHERE LocCode = 'P1A'
ORDER BY GangCode;
```

### 9.2 Get Task Codes

```sql
-- Get all task codes
SELECT 
    TaskCode,
    TaskDesc,
    Category
FROM PR_TASKCODE
ORDER BY TaskCode;
```

### 9.3 Get Division List

```sql
-- Get all divisions from extend_db_ptrj
SELECT DISTINCT
    DivisiCode,
    DivisiDesc
FROM extend_db_ptrj.dbo.Divisi_Description
ORDER BY DivisiCode;
```

### 9.4 Get Gang to Division Mapping

```sql
-- Get gang to division mapping
SELECT 
    g.GangCode,
    g.GangDesc,
    g.LocCode as DivisionCode,
    d.DivisiDesc as DivisionName
FROM HR_GANG g
LEFT JOIN extend_db_ptrj.dbo.Divisi_Description d ON d.DivisiCode = g.LocCode
ORDER BY g.LocCode, g.GangCode;
```

---

## 10. Complex Queries

### 10.1 Complete Payroll Data for Employee

```sql
-- Get complete payroll data for single employee
SELECT 
    e.EmpCode,
    e.EmpName,
    e.LocCode as DivisionCode,
    g.GangCode,
    p.PayRate as UpahDasar,
    p.RiceRation as BerasRate,
    
    -- Attendance
    ISNULL(att.TotalHK, 0) as TotalHK,
    ISNULL(lv.CutiTahunan, 0) as CutiTahunan,
    ISNULL(lv.CutiSakit, 0) as CutiSakit,
    
    -- Overtime
    ISNULL(ot.TotalJamLembur, 0) as TotalJamLembur,
    ISNULL(ot.TotalAmountLembur, 0) as TotalAmountLembur,
    
    -- Premi
    ISNULL(premi.TotalBrondol, 0) as TotalBrondol,
    ISNULL(premi.TotalPremiDinamis, 0) as TotalPremiDinamis,
    
    -- Tunjangan
    ISNULL(jabatan.rate, 0) as TunjanganJabatan,
    ISNULL(mk.MasaKerjaJumlah, 0) as MasaKerjaJumlah,
    
    -- BPJS Base
    (p.PayRate * 30) as GajiStandar,
    (p.PayRate * 30) + ISNULL(mk.MasaKerjaJumlah, 0) as BPJSBase

FROM HR_EMPLOYEE e
LEFT JOIN HR_GANGLN g ON g.EmpCode = e.EmpCode AND g.LeaveDate IS NULL
LEFT JOIN HR_PAYROLL p ON p.EmpCode = e.EmpCode
LEFT JOIN (
    SELECT EmpCode, COUNT(DISTINCT CONVERT(date, TrxDate)) as TotalHK
    FROM PR_TASKREGLN
    WHERE TrxDate >= '2026-01-01' AND TrxDate <= '2026-01-31'
    GROUP BY EmpCode
) att ON att.EmpCode = e.EmpCode
LEFT JOIN (
    SELECT EmpCode,
        SUM(CASE WHEN LeaveType = 'TAHUNAN' THEN 1 ELSE 0 END) as CutiTahunan,
        SUM(CASE WHEN LeaveType = 'SAKIT' THEN 1 ELSE 0 END) as CutiSakit
    FROM HR_LEAVE
    WHERE LeaveDate >= '2026-01-01' AND LeaveDate <= '2026-01-31'
    GROUP BY EmpCode
) lv ON lv.EmpCode = e.EmpCode
LEFT JOIN (
    SELECT EmpCode,
        SUM(Hours) as TotalJamLembur,
        SUM(Amount) as TotalAmountLembur
    FROM PR_TASKREGLN
    WHERE TrxDate >= '2026-01-01' AND TrxDate <= '2026-01-31'
      AND OT = 1
    GROUP BY EmpCode
) ot ON ot.EmpCode = e.EmpCode
LEFT JOIN (
    SELECT lfln.EmpCode,
        SUM(lfln.Amount) as TotalBrondol
    FROM PR_LOOSEFRUIT_ARC lf
    JOIN PR_LOOSEFRUITLN_ARC lfln ON lf.ID = lfln.MasterID
    WHERE lf.DocDate >= '2026-01-01' AND lf.DocDate < '2026-02-01'
    GROUP BY lfln.EmpCode
) premi ON premi.EmpCode = e.EmpCode
LEFT JOIN tunjangan_rate jabatan ON jabatan.item_key = e.JobTitle
LEFT JOIN (
    SELECT EmpCode, SUM(Amount) as MasaKerjaJumlah
    FROM PR_ADTRANS
    WHERE UPPER(DocDesc) LIKE '%MASA KERJA%'
    GROUP BY EmpCode
) mk ON mk.EmpCode = e.EmpCode

WHERE e.EmpCode = 'E0001'
  AND e.TerminateDate IS NULL;
```

### 10.2 Payroll Summary by Gang

```sql
-- Get payroll summary by gang for period
SELECT 
    g.GangCode,
    g.GangDesc,
    COUNT(DISTINCT e.EmpCode) as TotalEmployees,
    SUM(DATEDIFF(day, '2026-01-01', '2026-01-31')) as TotalHK,
    SUM(p.PayRate * 26) as TotalGajiPokok,
    SUM(p.RiceRation * 26) as TotalTunjanganBeras,
    ISNULL(SUM(ot.Amount), 0) as TotalLembur,
    ISNULL(SUM(premi.TotalBrondol), 0) as TotalBrondol
FROM HR_GANG g
LEFT JOIN HR_GANGLN gl ON gl.GangCode = g.GangCode AND gl.LeaveDate IS NULL
LEFT JOIN HR_EMPLOYEE e ON e.EmpCode = gl.EmpCode AND e.TerminateDate IS NULL
LEFT JOIN HR_PAYROLL p ON p.EmpCode = e.EmpCode
LEFT JOIN (
    SELECT EmpCode, SUM(Amount) as Amount
    FROM PR_TASKREGLN
    WHERE TrxDate >= '2026-01-01' AND TrxDate <= '2026-01-31'
      AND OT = 1
    GROUP BY EmpCode
) ot ON ot.EmpCode = e.EmpCode
LEFT JOIN (
    SELECT lfln.EmpCode, SUM(lfln.Amount) as TotalBrondol
    FROM PR_LOOSEFRUIT_ARC lf
    JOIN PR_LOOSEFRUITLN_ARC lfln ON lf.ID = lfln.MasterID
    WHERE lf.DocDate >= '2026-01-01' AND lf.DocDate < '2026-02-01'
    GROUP BY lfln.EmpCode
) premi ON premi.EmpCode = e.EmpCode
WHERE g.LocCode = 'P1A'
GROUP BY g.GangCode, g.GangDesc
ORDER BY g.GangCode;
```

---

## Referensi Terkait

- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Database schema detail
- 📄 [`11_LEMBUR_CALCULATION.md`](./11_LEMBUR_CALCULATION.md) - Lembur calculation detail
- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - PayrollService implementation
- 📄 [`00_README_MAIN.md`](./00_README_MAIN.md) - Gambaran umum

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**Database**: Microsoft SQL Server  
**Profiles**: `extend_db_ptrj`, `extend_db_ptrj_transaksi`
