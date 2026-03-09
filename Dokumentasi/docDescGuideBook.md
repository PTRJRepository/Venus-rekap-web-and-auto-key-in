# 📊 DOCDESC MAPPING GUIDE
## Panduan Lengkap Mapping DocDesc ke Tunjangan dan Potongan

**Document Version:** 1.0  
**Created:** 2026-03-08  
**Last Updated:** 2026-03-08  

---

## 🎯 OVERVIEW

Sistem payroll menggunakan tabel **`PR_ADTRANS_ARC`** dan **`PR_ADTRANSLN_ARC`** untuk menyimpan data tunjangan dan potongan dinamis per karyawan. Setiap transaksi memiliki **`DocDesc`** (Document Description) yang menentukan jenis komponen payroll.

### Tabel Sumber

```sql
-- Tabel Master (Header)
PR_ADTRANS_ARC
├── ID              -- Primary Key
├── EmpCode         -- Kode Karyawan
├── DocDesc         -- Deskripsi Dokumen (KEY MAPPING)
├── DocDate         -- Tanggal Dokumen
├── ...

-- Tabel Detail (Line)
PR_ADTRANSLN_ARC
├── MasterID        -- Foreign Key ke PR_ADTRANS_ARC.ID
├── EmpCode         -- Kode Karyawan
├── TaskCode        -- Kode Tugas (opsional)
├── Amount          -- Jumlah Nominal
├── ...
```

---

## 📋 KATEGORI KOMPONEN PAYROLL

### 1. **TUNJANGAN (Allowances)**

| Kategori | DocDesc Pattern | Contoh | Query Filter |
|----------|-----------------|--------|--------------|
| **Tunjangan Jabatan** | `'%JABATAN%'` | `TUNJANGAN JABATAN` | `UPPER(DocDesc) LIKE '%JABATAN%'` |
| **Tunjangan Beras** | `'%BERAS%'` | `TUNJANGAN BERAS` | `UPPER(DocDesc) LIKE '%BERAS%'` |
| **Tunjangan Masa Kerja** | `'%MASA%KERJA%'` | `TUNJANGAN MASA KERJA` | `UPPER(DocDesc) LIKE '%MASA%KERJA%'` |
| **Tunjangan Lembur** | `'%LEMBUR%'` | `TUNJANGAN LEMBUR` | `UPPER(DocDesc) LIKE '%LEMBUR%'` |
| **Premi (Dynamic)** | `'%PREMI%'` AND NOT `'%PPH%'` | `PREMI PANEN`, `PREMI KINERJA` | `UPPER(DocDesc) LIKE '%PREMI%' AND NOT LIKE '%PPH%'` |

### 2. **POTONGAN (Deductions)**

| Kategori | DocDesc Pattern | Contoh | Query Filter |
|----------|-----------------|--------|--------------|
| **PPh21** | `'%PPH%'` AND NOT `'%PREMI%'` | `PPH21`, `POTONGAN PPH21` | `UPPER(DocDesc) LIKE '%PPH%' AND NOT LIKE '%PREMI%'` |
| **Potongan Umum** | `'%POT%'` | `POTONGAN LAIN-LAIN` | `UPPER(DocDesc) LIKE '%POT%'` |
| **BPJS** | `'%BPJS%'` | `BPJS KESEHATAN` | `UPPER(DocDesc) LIKE '%BPJS%'` |
| **Pinjaman** | `'%PINJAM%'` | `PINJAMAN KOPERASI` | `UPPER(DocDesc) LIKE '%PINJAM%'` |
| **Koreksi** | `'%KOREKSI%'` | `KOREKSI HK` | `UPPER(DocDesc) LIKE '%KOREKSI%'` |
| **SPSI** | `'%SPSI%'` | `IURAN SPSI` | `UPPER(DocDesc) LIKE '%SPSI%'` |

### 3. **PREMI PPH (Special Case)**

| Kategori | Source | TaskDesc | Treatment |
|----------|--------|----------|-----------|
| **Premi PPH** | `PR_ADTRANS_ARC` | `ACCRUALS-CHECKROLL` | Ditambah ke Upah Bersih (bukan premi biasa) |

---

## 🔍 QUERY MAPPING PER KARYAWAN

### Query 1: Melihat Semua Tunjangan & Potongan Per Karyawan

```sql
-- ============================================
-- QUERY: Semua Komponen Payroll Per Karyawan
-- ============================================
DECLARE @EmpCode VARCHAR(50) = 'H0033';
DECLARE @StartDate DATE = '2025-05-01';
DECLARE @EndDate DATE = '2025-06-01';

SELECT 
    RTRIM(t.EmpCode) AS emp_code,
    t.DocDesc AS doc_desc,
    ln.TaskCode AS task_code,
    mt.TaskDesc AS task_desc,
    SUM(ln.Amount) AS amount,
    CASE 
        WHEN UPPER(t.DocDesc) LIKE '%JABATAN%' THEN 'TUNJANGAN_JABATAN'
        WHEN UPPER(t.DocDesc) LIKE '%BERAS%' THEN 'TUNJANGAN_BERAS'
        WHEN UPPER(t.DocDesc) LIKE '%MASA%KERJA%' THEN 'TUNJANGAN_MASA_KERJA'
        WHEN UPPER(t.DocDesc) LIKE '%LEMBUR%' THEN 'TUNJANGAN_LEMBUR'
        WHEN UPPER(t.DocDesc) LIKE '%PREMI%' AND UPPER(t.DocDesc) NOT LIKE '%PPH%' THEN 'PREMI_DYNAMIC'
        WHEN UPPER(t.DocDesc) LIKE '%PPH%' AND UPPER(t.DocDesc) NOT LIKE '%PREMI%' THEN 'POTONGAN_PPH21'
        WHEN UPPER(t.DocDesc) LIKE '%POT%' THEN 'POTONGAN_LAIN'
        WHEN UPPER(t.DocDesc) LIKE '%BPJS%' THEN 'POTONGAN_BPJS'
        WHEN UPPER(t.DocDesc) LIKE '%PINJAM%' THEN 'POTONGAN_PINJAMAN'
        WHEN UPPER(t.DocDesc) LIKE '%KOREKSI%' THEN 'POTONGAN_KOREKSI'
        WHEN UPPER(t.DocDesc) LIKE '%SPSI%' THEN 'POTONGAN_SPSI'
        ELSE 'LAINNYA'
    END AS component_category
FROM (
    SELECT EmpCode, ID, DocDesc, DocDate
    FROM PR_ADTRANS
    WHERE RTRIM(EmpCode) = @EmpCode
      AND DocDate >= @StartDate 
      AND DocDate < @EndDate

    UNION ALL

    SELECT EmpCode, ID, DocDesc, DocDate
    FROM PR_ADTRANS_ARC
    WHERE RTRIM(EmpCode) = @EmpCode
      AND DocDate >= @StartDate 
      AND DocDate < @EndDate
) t
JOIN (
    SELECT MasterID, TaskCode, Amount
    FROM PR_ADTRANSLN
    UNION ALL
    SELECT MasterID, TaskCode, Amount
    FROM PR_ADTRANSLN_ARC
) ln ON t.ID = ln.MasterID
LEFT JOIN PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
WHERE ln.Amount > 0
GROUP BY RTRIM(t.EmpCode), t.DocDesc, ln.TaskCode, mt.TaskDesc
ORDER BY component_category, t.DocDesc;
```

**Contoh Output:**

| emp_code | doc_desc | task_code | task_desc | amount | component_category |
|----------|----------|-----------|-----------|--------|-------------------|
| H0033 | TUNJANGAN JABATAN | DJB | TUNJANGAN JABATAN | 500000 | TUNJANGAN_JABATAN |
| H0033 | TUNJANGAN BERAS | DBR | TUNJANGAN BERAS | 390000 | TUNJANGAN_BERAS |
| H0033 | PREMI PANEN (AL) | AL01 | TUNJANGAN PANEN (AL) | 150000 | PREMI_DYNAMIC |
| H0033 | PREMI KINERJA | KIN | PREMI KINERJA | 100000 | PREMI_DYNAMIC |
| H0033 | PPH21 | DEPH21AB1 | POTONGAN PPH21 | 75000 | POTONGAN_PPH21 |
| H0033 | IURAN SPSI | SPS | IURAN SPSI | 25000 | POTONGAN_SPSI |

---

### Query 2: Pivot Table - Tunjangan Per Karyawan (Multiple Employees)

```sql
-- ============================================
-- QUERY: Pivot Tunjangan Per Karyawan
-- ============================================
DECLARE @EmpList VARCHAR(MAX) = '''H0033'',''H0034'',''H0035''';
DECLARE @StartDate DATE = '2025-05-01';
DECLARE @EndDate DATE = '2025-06-01';

SELECT 
    emp_code,
    MAX(CASE WHEN component_key = 'JABATAN' THEN amount ELSE 0 END) AS tunjangan_jabatan,
    MAX(CASE WHEN component_key = 'BERAS' THEN amount ELSE 0 END) AS tunjangan_beras,
    MAX(CASE WHEN component_key = 'MASA_KERJA' THEN amount ELSE 0 END) AS tunjangan_masa_kerja,
    MAX(CASE WHEN component_key = 'LEMBUR' THEN amount ELSE 0 END) AS tunjangan_lembur,
    MAX(CASE WHEN component_key = 'PREMI_PANEN' THEN amount ELSE 0 END) AS premi_panen,
    MAX(CASE WHEN component_key = 'PREMI_KINERJA' THEN amount ELSE 0 END) AS premi_kinerja,
    MAX(CASE WHEN component_key = 'PREMI_BRONDOL' THEN amount ELSE 0 END) AS premi_brondol
FROM (
    SELECT 
        RTRIM(t.EmpCode) AS emp_code,
        -- Normalisasi DocDesc menjadi key
        CASE 
            WHEN UPPER(t.DocDesc) LIKE '%JABATAN%' THEN 'JABATAN'
            WHEN UPPER(t.DocDesc) LIKE '%BERAS%' THEN 'BERAS'
            WHEN UPPER(t.DocDesc) LIKE '%MASA%KERJA%' THEN 'MASA_KERJA'
            WHEN UPPER(t.DocDesc) LIKE '%LEMBUR%' THEN 'LEMBUR'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%PANEN%' OR UPPER(t.DocDesc) LIKE '%PREMI%AL%' THEN 'PREMI_PANEN'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%KINERJA%' THEN 'PREMI_KINERJA'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%BRONDOL%' THEN 'PREMI_BRONDOL'
            ELSE 'LAINNYA'
        END AS component_key,
        SUM(ln.Amount) AS amount
    FROM (
        SELECT EmpCode, ID, DocDesc, DocDate
        FROM PR_ADTRANS
        WHERE RTRIM(EmpCode) IN (@EmpList)
          AND DocDate >= @StartDate AND DocDate < @EndDate

        UNION ALL

        SELECT EmpCode, ID, DocDesc, DocDate
        FROM PR_ADTRANS_ARC
        WHERE RTRIM(EmpCode) IN (@EmpList)
          AND DocDate >= @StartDate AND DocDate < @EndDate
    ) t
    JOIN (
        SELECT MasterID, TaskCode, Amount
        FROM PR_ADTRANSLN
        UNION ALL
        SELECT MasterID, TaskCode, Amount
        FROM PR_ADTRANSLN_ARC
    ) ln ON t.ID = ln.MasterID
    GROUP BY RTRIM(t.EmpCode), t.DocDesc
) AS SourceTable
GROUP BY emp_code;
```

---

### Query 3: Pivot Table - Potongan Per Karyawan

```sql
-- ============================================
-- QUERY: Pivot Potongan Per Karyawan
-- ============================================
DECLARE @EmpList VARCHAR(MAX) = '''H0033'',''H0034'',''H0035''';
DECLARE @StartDate DATE = '2025-05-01';
DECLARE @EndDate DATE = '2025-06-01';

SELECT 
    emp_code,
    MAX(CASE WHEN component_key = 'PPH21' THEN amount ELSE 0 END) AS potongan_pph21,
    MAX(CASE WHEN component_key = 'BPJS_KESEHATAN' THEN amount ELSE 0 END) AS potongan_bpjs_kesehatan,
    MAX(CASE WHEN component_key = 'BPJS_PENSIUN' THEN amount ELSE 0 END) AS potongan_bpjs_pensiun,
    MAX(CASE WHEN component_key = 'SPSI' THEN amount ELSE 0 END) AS potongan_spsi,
    MAX(CASE WHEN component_key = 'KOREKSI' THEN amount ELSE 0 END) AS potongan_koreksi,
    MAX(CASE WHEN component_key = 'PINJAMAN' THEN amount ELSE 0 END) AS potongan_pinjaman
FROM (
    SELECT 
        RTRIM(t.EmpCode) AS emp_code,
        -- Normalisasi DocDesc menjadi key
        CASE 
            WHEN UPPER(t.DocDesc) LIKE '%PPH%' AND UPPER(t.DocDesc) NOT LIKE '%PREMI%' THEN 'PPH21'
            WHEN UPPER(t.DocDesc) LIKE '%BPJS%KESEHATAN%' THEN 'BPJS_KESEHATAN'
            WHEN UPPER(t.DocDesc) LIKE '%BPJS%PENSIUN%' THEN 'BPJS_PENSIUN'
            WHEN UPPER(t.DocDesc) LIKE '%SPSI%' THEN 'SPSI'
            WHEN UPPER(t.DocDesc) LIKE '%KOREKSI%' THEN 'KOREKSI'
            WHEN UPPER(t.DocDesc) LIKE '%PINJAM%' THEN 'PINJAMAN'
            ELSE 'LAINNYA'
        END AS component_key,
        SUM(ln.Amount) AS amount
    FROM (
        SELECT EmpCode, ID, DocDesc, DocDate
        FROM PR_ADTRANS
        WHERE RTRIM(EmpCode) IN (@EmpList)
          AND DocDate >= @StartDate AND DocDate < @EndDate

        UNION ALL

        SELECT EmpCode, ID, DocDesc, DocDate
        FROM PR_ADTRANS_ARC
        WHERE RTRIM(EmpCode) IN (@EmpList)
          AND DocDate >= @StartDate AND DocDate < @EndDate
    ) t
    JOIN (
        SELECT MasterID, TaskCode, Amount
        FROM PR_ADTRANSLN
        UNION ALL
        SELECT MasterID, TaskCode, Amount
        FROM PR_ADTRANSLN_ARC
    ) ln ON t.ID = ln.MasterID
    GROUP BY RTRIM(t.EmpCode), t.DocDesc
) AS SourceTable
GROUP BY emp_code;
```

---

### Query 4: Dynamic Premi Headers (Untuk AG Grid)

```sql
-- ============================================
-- QUERY: Mendapatkan Semua DocDesc Premi Dinamis
-- ============================================
DECLARE @StartDate DATE = '2025-05-01';
DECLARE @EndDate DATE = '2025-06-01';

SELECT DISTINCT
    RTRIM(t.DocDesc) AS doc_desc,
    ln.TaskCode AS task_code,
    mt.TaskDesc AS task_desc,
    -- Normalisasi untuk column key
    LOWER(
        REPLACE(
            REPLACE(
                REPLACE(
                    CASE 
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%PANEN%' THEN 'PREMI_PANEN'
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%KINERJA%' THEN 'PREMI_KINERJA'
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%BRONDOL%' THEN 'PREMI_BRONDOL'
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%INSENTIF%' THEN 'PREMI_INSENTIF'
                        ELSE REPLACE(REPLACE(REPLACE(UPPER(t.DocDesc), 'TUNJANGAN ', ''), 'PREMI ', ''), ' ', '_')
                    END,
                ' ', '_'),
            '(', ''),
        ')', '')
    ) AS column_key
FROM (
    SELECT ID, DocDesc, DocDate
    FROM PR_ADTRANS
    WHERE DocDate >= @StartDate AND DocDate < @EndDate
      AND (UPPER(DocDesc) LIKE '%PREMI%' AND UPPER(DocDesc) NOT LIKE '%PPH%')

    UNION ALL

    SELECT ID, DocDesc, DocDate
    FROM PR_ADTRANS_ARC
    WHERE DocDate >= @StartDate AND DocDate < @EndDate
      AND (UPPER(DocDesc) LIKE '%PREMI%' AND UPPER(DocDesc) NOT LIKE '%PPH%')
) t
JOIN (
    SELECT MasterID, TaskCode FROM PR_ADTRANSLN UNION ALL SELECT MasterID, TaskCode FROM PR_ADTRANSLN_ARC
) ln ON t.ID = ln.MasterID
LEFT JOIN PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
WHERE ln.Amount > 0
ORDER BY doc_desc;
```

**Contoh Output:**

| doc_desc | task_code | task_desc | column_key |
|----------|-----------|-----------|------------|
| PREMI PANEN (AL) | AL01 | TUNJANGAN PANEN (AL) | premi_panen |
| PREMI KINERJA | KIN | PREMI KINERJA | premi_kinerja |
| PREMI BRONDOL | BRD | PREMI BRONDOL | premi_brondol |
| PREMI INSENTIF PANEN | INS01 | TUNJANGAN INSENTIF | premi_insentif |

---

### Query 5: Complete Payroll Components Per Employee

```sql
-- ============================================
-- QUERY: Semua Komponen Payroll Lengkap
-- ============================================
DECLARE @EmpList VARCHAR(MAX) = '''H0033'',''H0034''';
DECLARE @StartDate DATE = '2025-05-01';
DECLARE @EndDate DATE = '2025-06-01';

WITH PayrollComponents AS (
    SELECT 
        RTRIM(t.EmpCode) AS emp_code,
        t.DocDesc AS doc_desc,
        ln.TaskCode AS task_code,
        mt.TaskDesc AS task_desc,
        SUM(ln.Amount) AS amount,
        CASE 
            -- TUNJANGAN
            WHEN UPPER(t.DocDesc) LIKE '%JABATAN%' THEN 'tunjangan_jabatan'
            WHEN UPPER(t.DocDesc) LIKE '%BERAS%' THEN 'tunjangan_beras'
            WHEN UPPER(t.DocDesc) LIKE '%MASA%KERJA%' THEN 'tunjangan_masa_kerja'
            WHEN UPPER(t.DocDesc) LIKE '%LEMBUR%' THEN 'tunjangan_lembur'
            -- PREMI (Dynamic)
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%PANEN%' OR UPPER(t.DocDesc) LIKE '%PREMI%AL%' THEN 'premi_panen'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%KINERJA%' THEN 'premi_kinerja'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%BRONDOL%' THEN 'premi_brondol'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%INSENTIF%' THEN 'premi_insentif'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%' AND UPPER(t.DocDesc) NOT LIKE '%PPH%' THEN 'premi_lain'
            -- POTONGAN
            WHEN UPPER(t.DocDesc) LIKE '%PPH%' AND UPPER(t.DocDesc) NOT LIKE '%PREMI%' THEN 'potongan_pph21'
            WHEN UPPER(t.DocDesc) LIKE '%BPJS%KESEHATAN%' THEN 'potongan_bpjs_kesehatan'
            WHEN UPPER(t.DocDesc) LIKE '%BPJS%PENSIUN%' THEN 'potongan_bpjs_pensiun'
            WHEN UPPER(t.DocDesc) LIKE '%SPSI%' THEN 'potongan_spsi'
            WHEN UPPER(t.DocDesc) LIKE '%KOREKSI%' THEN 'potongan_koreksi'
            WHEN UPPER(t.DocDesc) LIKE '%PINJAM%' THEN 'potongan_pinjaman'
            WHEN UPPER(t.DocDesc) LIKE '%POT%' THEN 'potongan_lain'
            ELSE 'lainnya'
        END AS component_type
    FROM (
        SELECT EmpCode, ID, DocDesc, DocDate
        FROM PR_ADTRANS
        WHERE RTRIM(EmpCode) IN (@EmpList)
          AND DocDate >= @StartDate AND DocDate < @EndDate

        UNION ALL

        SELECT EmpCode, ID, DocDesc, DocDate
        FROM PR_ADTRANS_ARC
        WHERE RTRIM(EmpCode) IN (@EmpList)
          AND DocDate >= @StartDate AND DocDate < @EndDate
    ) t
    JOIN (
        SELECT MasterID, TaskCode, Amount
        FROM PR_ADTRANSLN
        UNION ALL
        SELECT MasterID, TaskCode, Amount
        FROM PR_ADTRANSLN_ARC
    ) ln ON t.ID = ln.MasterID
    LEFT JOIN PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
    WHERE ln.Amount > 0
    GROUP BY RTRIM(t.EmpCode), t.DocDesc, ln.TaskCode, mt.TaskDesc
)
SELECT 
    emp_code,
    MAX(CASE WHEN component_type = 'tunjangan_jabatan' THEN amount ELSE 0 END) AS tunjangan_jabatan,
    MAX(CASE WHEN component_type = 'tunjangan_beras' THEN amount ELSE 0 END) AS tunjangan_beras,
    MAX(CASE WHEN component_type = 'tunjangan_masa_kerja' THEN amount ELSE 0 END) AS tunjangan_masa_kerja,
    MAX(CASE WHEN component_type = 'tunjangan_lembur' THEN amount ELSE 0 END) AS tunjangan_lembur,
    MAX(CASE WHEN component_type = 'premi_panen' THEN amount ELSE 0 END) AS premi_panen,
    MAX(CASE WHEN component_type = 'premi_kinerja' THEN amount ELSE 0 END) AS premi_kinerja,
    MAX(CASE WHEN component_type = 'premi_brondol' THEN amount ELSE 0 END) AS premi_brondol,
    MAX(CASE WHEN component_type = 'premi_insentif' THEN amount ELSE 0 END) AS premi_insentif,
    MAX(CASE WHEN component_type = 'potongan_pph21' THEN amount ELSE 0 END) AS potongan_pph21,
    MAX(CASE WHEN component_type = 'potongan_bpjs_kesehatan' THEN amount ELSE 0 END) AS potongan_bpjs_kesehatan,
    MAX(CASE WHEN component_type = 'potongan_bpjs_pensiun' THEN amount ELSE 0 END) AS potongan_bpjs_pensiun,
    MAX(CASE WHEN component_type = 'potongan_spsi' THEN amount ELSE 0 END) AS potongan_spsi,
    MAX(CASE WHEN component_type = 'potongan_koreksi' THEN amount ELSE 0 END) AS potongan_koreksi
FROM PayrollComponents
GROUP BY emp_code
ORDER BY emp_code;
```

---

## 🔧 NORMALISASI DOCDESC (TypeScript Implementation)

### Normalisasi Premi Name

```typescript
// backend/src/services/dataExtractorService.ts

private normalizePremiName(docDesc: string): string {
    let name = docDesc.trim().toUpperCase();
    
    // Remove common prefixes
    const prefixes = ['TUNJANGAN PREMI', 'TUNJANGAN', 'PREMI'];
    for (const prefix of prefixes) {
        if (name.startsWith(prefix)) {
            name = name.slice(prefix.length).trim();
            break;
        }
    }
    
    // Convert to snake_case
    name = name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');
    
    return `premi_${name}`;
}
```

**Contoh:**
- `TUNJANGAN PREMI PANEN (AL)` → `premi_panen_al`
- `PREMI KINERJA` → `premi_kinerja`
- `PREMI BRONDOL` → `premi_brondol`

---

### Normalisasi Potongan Name

```typescript
// backend/src/services/dataExtractorService.ts

private normalizePotonganName(
    docDesc: string,
    taskDesc: string | null,
    taskCode: string | null
): { key: string; title: string } {
    const desc = docDesc.trim().toUpperCase();
    
    // Determine key based on pattern
    let key: string;
    if (desc.includes('PPH') && !desc.includes('PREMI')) {
        key = 'POTONGAN_PPH21';
    } else if (desc.includes('BPJS') && desc.includes('KESEHATAN')) {
        key = 'POTONGAN_BPJS_KESEHATAN';
    } else if (desc.includes('BPJS') && desc.includes('PENSIUN')) {
        key = 'POTONGAN_BPJS_PENSIUN';
    } else if (desc.includes('SPSI')) {
        key = 'POTONGAN_SPSI';
    } else if (desc.includes('KOREKSI')) {
        key = 'POTONGAN_KOREKSI';
    } else if (desc.includes('PINJAM')) {
        key = 'POTONGAN_PINJAMAN';
    } else {
        key = 'POTONGAN_LAIN';
    }
    
    // Title for display
    const title = taskDesc || docDesc;
    
    return { key, title };
}
```

---

## 📊 FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                    PR_ADTRANS_ARC                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ID | EmpCode | DocDesc          | DocDate            │   │
│  │----|---------|------------------|--------------------│   │
│  │ 1  | H0033   | PREMI PANEN (AL) | 2025-05-15         │   │
│  │ 2  | H0033   | PPH21            | 2025-05-31         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ JOIN ON ID = MasterID
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   PR_ADTRANSLN_ARC                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ MasterID | TaskCode | Amount                         │   │
│  │----------|----------|--------------------------------│   │
│  │ 1        | AL01     | 150000                         │   │
│  │ 2        | DEPH21   | 75000                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ LEFT JOIN TaskCode
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      PR_TASKCODE                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ TaskCode | TaskDesc                                  │   │
│  │----------|-------------------------------------------│   │
│  │ AL01     | TUNJANGAN PANEN (AL)                      │   │
│  │ DEPH21   | POTONGAN PPH21                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ CLASSIFICATION LOGIC
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  CLASSIFICATION RESULT                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ EmpCode | Component Type      | Amount | Category    │   │
│  │---------|-------------------|--------|-------------│   │
│  │ H0033   | premi_panen       | 150000 | TUNJANGAN   │   │
│  │ H0033   | potongan_pph21    | 75000  | POTONGAN    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚠️ SPECIAL CASES

### 1. **Premi PPH (ACCRUALS-CHECKROLL)**

Premi PPH adalah kasus khusus:
- **Source**: `PR_ADTRANS_ARC` dengan `TaskDesc = 'ACCRUALS-CHECKROLL'`
- **Treatment**: Ditambah ke Upah Bersih (bukan dikurangi)
- **Query Khusus**:

```sql
SELECT 
    RTRIM(t.EmpCode) AS emp_code,
    t.DocDesc AS doc_desc,
    SUM(ln.Amount) AS amount
FROM (
    SELECT EmpCode, ID, DocDesc, DocDate
    FROM PR_ADTRANS
    WHERE DocDate >= @StartDate AND DocDate < @EndDate

    UNION ALL

    SELECT EmpCode, ID, DocDesc, DocDate
    FROM PR_ADTRANS_ARC
    WHERE DocDate >= @StartDate AND DocDate < @EndDate
) t
JOIN (
    SELECT MasterID, TaskCode, Amount
    FROM PR_ADTRANSLN
    UNION ALL
    SELECT MasterID, TaskCode, Amount
    FROM PR_ADTRANSLN_ARC
) ln ON t.ID = ln.MasterID
JOIN PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
WHERE mt.TaskDesc = 'ACCRUALS-CHECKROLL'
GROUP BY RTRIM(t.EmpCode), t.DocDesc;
```

### 2. **Koreksi HK**

Koreksi HK adalah **Potongan Upah Kotor**, bukan Potongan Upah Bersih:
- **Query**: `UPPER(DocDesc) LIKE '%KOREKSI%' AND UPPER(DocDesc) NOT LIKE '%KOREKSI_HK%'`
- **Treatment**: Dikurangi dari `jumlah_upah_kotor` sebelum menghitung `upah_bersih`

### 3. **TaskDesc = 'ACCRUALS-CHECKROLL'**

Item dengan TaskDesc ini harus **DIEXCLUDE** dari premi dinamis:

```sql
WHERE (mt.TaskDesc IS NULL OR mt.TaskDesc <> 'ACCRUALS-CHECKROLL')
```

---

## 🎨 EXAMPLE: Full Employee Payroll Breakdown

```sql
-- ============================================
-- QUERY: Full Payroll Breakdown Per Employee
-- ============================================
DECLARE @EmpCode VARCHAR(50) = 'H0033';
DECLARE @StartDate DATE = '2025-05-01';
DECLARE @EndDate DATE = '2025-06-01';

WITH PayrollData AS (
    SELECT 
        RTRIM(t.EmpCode) AS emp_code,
        t.DocDesc,
        ln.TaskCode,
        mt.TaskDesc,
        SUM(ln.Amount) AS amount,
        CASE 
            WHEN UPPER(t.DocDesc) LIKE '%JABATAN%' THEN 'Tunjangan Jabatan'
            WHEN UPPER(t.DocDesc) LIKE '%BERAS%' THEN 'Tunjangan Beras'
            WHEN UPPER(t.DocDesc) LIKE '%MASA%KERJA%' THEN 'Tunjangan Masa Kerja'
            WHEN UPPER(t.DocDesc) LIKE '%LEMBUR%' THEN 'Tunjangan Lembur'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%PANEN%' THEN 'Premi Panen'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%KINERJA%' THEN 'Premi Kinerja'
            WHEN UPPER(t.DocDesc) LIKE '%PREMI%BRONDOL%' THEN 'Premi Brondol'
            WHEN UPPER(t.DocDesc) LIKE '%PPH%' AND UPPER(t.DocDesc) NOT LIKE '%PREMI%' THEN 'PPh21'
            WHEN UPPER(t.DocDesc) LIKE '%BPJS%' THEN 'BPJS'
            WHEN UPPER(t.DocDesc) LIKE '%SPSI%' THEN 'SPSI'
            WHEN UPPER(t.DocDesc) LIKE '%KOREKSI%' THEN 'Koreksi'
            ELSE 'Lainnya'
        END AS category
    FROM (
        SELECT EmpCode, ID, DocDesc, DocDate
        FROM PR_ADTRANS
        WHERE RTRIM(EmpCode) = @EmpCode
          AND DocDate >= @StartDate AND DocDate < @EndDate

        UNION ALL

        SELECT EmpCode, ID, DocDesc, DocDate
        FROM PR_ADTRANS_ARC
        WHERE RTRIM(EmpCode) = @EmpCode
          AND DocDate >= @StartDate AND DocDate < @EndDate
    ) t
    JOIN (
        SELECT MasterID, TaskCode, Amount
        FROM PR_ADTRANSLN
        UNION ALL
        SELECT MasterID, TaskCode, Amount
        FROM PR_ADTRANSLN_ARC
    ) ln ON t.ID = ln.MasterID
    LEFT JOIN PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
    WHERE ln.Amount > 0
    GROUP BY RTRIM(t.EmpCode), t.DocDesc, ln.TaskCode, mt.TaskDesc
)
SELECT 
    emp_code,
    category,
    STRING_AGG(DocDesc + ' (' + ISNULL(TaskCode, '-') + ')', ', ') AS items,
    SUM(amount) AS total_amount
FROM PayrollData
GROUP BY emp_code, category
ORDER BY 
    CASE category
        WHEN 'Tunjangan Jabatan' THEN 1
        WHEN 'Tunjangan Beras' THEN 2
        WHEN 'Tunjangan Masa Kerja' THEN 3
        WHEN 'Tunjangan Lembur' THEN 4
        WHEN 'Premi Panen' THEN 5
        WHEN 'Premi Kinerja' THEN 6
        WHEN 'Premi Brondol' THEN 7
        WHEN 'PPh21' THEN 8
        WHEN 'BPJS' THEN 9
        WHEN 'SPSI' THEN 10
        WHEN 'Koreksi' THEN 11
        ELSE 12
    END;
```

**Output:**

| emp_code | category | items | total_amount |
|----------|----------|-------|--------------|
| H0033 | Tunjangan Jabatan | TUNJANGAN JABATAN (DJB) | 500000 |
| H0033 | Tunjangan Beras | TUNJANGAN BERAS (DBR) | 390000 |
| H0033 | Tunjangan Masa Kerja | TUNJANGAN MASA KERJA (TMK) | 300000 |
| H0033 | Tunjangan Lembur | TUNJANGAN LEMBUR (LMR) | 1000000 |
| H0033 | Premi Panen | PREMI PANEN (AL) (AL01) | 150000 |
| H0033 | Premi Kinerja | PREMI KINERJA (KIN) | 100000 |
| H0033 | Premi Brondol | PREMI BRONDOL (BRD) | 200000 |
| H0033 | PPh21 | PPH21 (DEPH21AB1) | 75000 |
| H0033 | SPSI | IURAN SPSI (SPS) | 25000 |

---

## 📚 RELATED DOCUMENTATION

- **Backend Structure:** `dokumentasi/BackendStructure.md`
- **API Documentation:** `dokumentasi/API_Documentation.md`
- **Refactoring Plan:** `dokumentasi/REFACTORING_IMPLEMENTATION_PLAN.md`

---

## 🔗 QUICK REFERENCE

### DocDesc → Component Mapping

| Pattern | Component Type | Category |
|---------|---------------|----------|
| `%JABATAN%` | `tunjangan_jabatan` | TUNJANGAN |
| `%BERAS%` | `tunjangan_beras` | TUNJANGAN |
| `%MASA%KERJA%` | `tunjangan_masa_kerja` | TUNJANGAN |
| `%LEMBUR%` | `tunjangan_lembur` | TUNJANGAN |
| `%PREMI%` + NOT `%PPH%` | `premi_*` | TUNJANGAN |
| `%PPH%` + NOT `%PREMI%` | `potongan_pph21` | POTONGAN |
| `%BPJS%` | `potongan_bpjs_*` | POTONGAN |
| `%SPSI%` | `potongan_spsi` | POTONGAN |
| `%KOREKSI%` | `potongan_koreksi` | POTONGAN |
| `%PINJAM%` | `potongan_pinjaman` | POTONGAN |

---

*Last Updated: 2026-03-08*
