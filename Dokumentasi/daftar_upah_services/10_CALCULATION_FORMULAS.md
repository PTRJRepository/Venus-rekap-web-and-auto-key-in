# Formula Perhitungan Daftar Upah - Referensi Lengkap

## Gambaran Umum

Dokumentasi ini adalah referensi lengkap untuk semua formula perhitungan yang digunakan dalam sistem Daftar Upah. Setiap formula dilengkapi dengan contoh perhitungan manual dan implementasi kode.

## Ringkasan Formula

| No | Komponen | Formula | Sumber Data |
|----|----------|---------|-------------|
| 1 | Hari Kerja | `HK - Total Cuti` | Attendance |
| 2 | Gaji Pokok | `Hari Kerja × Payrate` | HR_PAYROLL |
| 3 | Tunjangan Beras | `HK × RiceRation` | HR_PAYROLL |
| 4 | Tunjangan Jabatan | `Fixed Amount` | tunjangan_rate |
| 5 | Tunjangan Masa Kerja | `Fixed Amount` | PR_ADTRANS |
| 6 | Lembur | `Σ(Jam × Rate)` | PR_TASKREG |
| 7 | Premi Brondol | `SUM(Amount)` | PR_LOOSEFRUIT |
| 8 | Premi Dinamis | `SUM(Amount)` | PR_ADTRANS |
| 9 | BPJS Pekerja | `4% × Base` | CarumanDefinitions |
| 10 | BPJS Majikan | `6% × Base` | CarumanDefinitions |
| 11 | PPh 21 | `Tarif × (Bruto - PTKP)` | TaxCalculation |
| 12 | THR | `(Upah × 30) + (Beras × 30) + Masa Kerja` | OtherIncomes |

---

## 1. Hari Kerja

### Formula

```
Total Cuti = CutiTahunan + CutiSakit + HKMinggu + HKNasional
Hari Kerja = max(0, HK - Total Cuti)
```

### Variabel

| Variabel | Deskripsi | Sumber |
|----------|-----------|--------|
| `HK` | Total Hari Kerja dalam periode | Attendance system |
| `CutiTahunan` | Hari cuti tahunan yang diambil | Leave records |
| `CutiSakit` | Hari cuti sakit yang diambil | Leave records |
| `HKMinggu` | Hari minggu/libur mingguan | Calendar |
| `HKNasional` | Hari libur nasional | Calendar |

### Contoh Perhitungan

```
Input:
  HK = 26 hari
  CutiTahunan = 1 hari
  CutiSakit = 2 hari
  HKMinggu = 4 hari
  HKNasional = 1 hari

Calculation:
  Total Cuti = 1 + 2 + 4 + 1 = 8 hari
  Hari Kerja = max(0, 26 - 8) = 18 hari
```

### Implementasi Kode

```typescript
// payrollService.ts
public calculateHariKerja(
    hkCount: number,
    cutiTahunan: number,
    cutiSakit: number,
    hkMinggu: number,
    hkNasional: number
): number {
    const totalCuti = cutiTahunan + cutiSakit + hkMinggu + hkNasional;
    return Math.max(0, hkCount - totalCuti);
}
```

---

## 2. Gaji Pokok

### Formula

```
Gaji Pokok = Hari Kerja × Payrate
```

### Variabel

| Variabel | Deskripsi | Sumber |
|----------|-----------|--------|
| `Hari Kerja` | Hari kerja aktual (dari formula 1) | Calculated |
| `Payrate` | Upah dasar per HK | `HR_PAYROLL.PayRate` |

### Contoh Perhitungan

```
Input:
  Hari Kerja = 18 hari
  Payrate = Rp 75,000/hari

Calculation:
  Gaji Pokok = 18 × 75,000 = Rp 1,350,000
```

### Implementasi Kode

```typescript
// payrollService.ts
public calculateGajiPokok(
    hkCount: number,
    payrate: number,
    cutiTahunan: number = 0,
    cutiSakit: number = 0,
    hkMinggu: number = 0,
    hkNasional: number = 0
): number {
    const totalCuti = cutiTahunan + cutiSakit + hkMinggu + hkNasional;
    const hariKerja = Math.max(0, hkCount - totalCuti);
    return payrate ? hariKerja * payrate : 0;
}
```

### Gaji Pokok untuk Gross Calculation

```typescript
// Untuk perhitungan upah kotor (tanpa potongan cuti)
public calculateGajiPokokJmlHk(hkCount: number, payrate: number): number {
    return payrate ? hkCount * payrate : 0;
}
```

---

## 3. Tunjangan Beras

### Formula

```
Tunjangan Beras = HK × RiceRation
```

### Variabel

| Variabel | Deskripsi | Sumber |
|----------|-----------|--------|
| `HK` | Total Hari Kerja | Attendance |
| `RiceRation` | Rate beras per HK | `HR_PAYROLL.RiceRation` |

### Contoh Perhitungan

```
Input:
  HK = 26 hari
  RiceRation = Rp 3,000/hari

Calculation:
  Tunjangan Beras = 26 × 3,000 = Rp 78,000
```

### Implementasi Kode

```typescript
// payrollService.ts - part of calculateTotalTunjangan
const berasJumlah = hkCount * berasPayrate;
```

---

## 4. Tunjangan Jabatan

### Formula

```
Tunjangan Jabatan = Fixed Amount (berdasarkan jabatan)
```

### Rate Jabatan (dari tunjangan_rate)

| Jabatan | Amount (Rp) |
|---------|-------------|
| Mandor | 3,000 |
| Kerani | 3,000 |
| Helper | 3,000 |
| Operator | 3,000 |
| Supir | 3,000 |
| Security | 3,000 |
| Krani Buah | 3,000 |
| Pemuat | 3,000 |
| Karyawan | 0 |

### Contoh Perhitungan

```
Input:
  Jabatan = "Mandor"
  Rate = Rp 3,000

Calculation:
  Tunjangan Jabatan = Rp 3,000 (fixed per bulan)
```

### Implementasi Kode

```typescript
// tunjanganService.ts
const rates = await TunjanganService.getRates('JABATAN');
const jabatanRate = rates[jobTitle] || rates['Karyawan'] || 0;
const jabatanJumlah = jabatanRate;  // Fixed amount
```

---

## 5. Tunjangan Masa Kerja

### Formula

```
Tunjangan Masa Kerja = Fixed Amount (berdasarkan lama kerja)
```

### Sumber Data

- `PR_ADTRANS` dengan DocDesc containing "MASA KERJA"
- `HR_HISTORY` untuk tracking lama kerja

### Contoh Perhitungan

```
Input:
  Masa Kerja = 5 tahun
  Rate: 0-5 tahun = Rp 50,000

Calculation:
  Tunjangan Masa Kerja = Rp 50,000
```

### Implementasi Kode

```typescript
// Query from PR_ADTRANS
const masaKerjaQuery = `
    SELECT EmpCode, SUM(Amount) as MasaKerjaJumlah
    FROM PR_ADTRANS
    WHERE UPPER(DocDesc) LIKE '%MASA KERJA%'
    GROUP BY EmpCode
`;
```

---

## 6. Lembur

### Formula

```
Total Lembur = Σ(Jam × Rate)
```

### Variabel

| Variabel | Deskripsi | Sumber |
|----------|-----------|--------|
| `Jam` | Jam lembur per transaksi | `PR_TASKREG.Hours` |
| `Rate` | Rate lembur per jam | `PR_TASKREG.Rate` |

### Contoh Perhitungan

```
Transaksi Lembur:
  2026-01-05: 2 jam × Rp 15,000 = Rp 30,000
  2026-01-10: 3 jam × Rp 15,000 = Rp 45,000
  2026-01-15: 2 jam × Rp 15,000 = Rp 30,000

Calculation:
  Total Lembur = 30,000 + 45,000 + 30,000 = Rp 105,000
  Total Jam = 2 + 3 + 2 = 7 jam
```

### Implementasi Kode

```typescript
// payrollService.ts - part of calculateTotalTunjangan
const lemburJumlah = lemburRecords.reduce((sum, record) => {
    return sum + (record.hours * record.rate);
}, 0);
```

---

## 7. Total Tunjangan

### Formula

```
Total Tunjangan = Beras + Jabatan + Masa Kerja + Lembur
```

### Contoh Perhitungan

```
Input:
  Beras = Rp 78,000
  Jabatan = Rp 3,000
  Masa Kerja = Rp 100,000
  Lembur = Rp 105,000

Calculation:
  Total Tunjangan = 78,000 + 3,000 + 100,000 + 105,000 = Rp 286,000
```

### Implementasi Kode

```typescript
// payrollService.ts
public calculateTotalTunjangan(
    hkCount: number,
    berasPayrate: number,
    jabatanAmount: number,
    masaKerjaAmount: number,
    lemburAmount: number
): number {
    const berasJumlah = hkCount * berasPayrate;
    return berasJumlah + jabatanAmount + masaKerjaAmount + lemburAmount;
}
```

---

## 8. Premi Brondol

### Formula

```
Premi Brondol = SUM(Amount dari PR_LOOSEFRUITLN_ARC)
```

### Query

```sql
SELECT LFLN.EmpCode, SUM(LFLN.Amount) as TotalBrondol
FROM PR_LOOSEFRUIT_ARC LF
JOIN PR_LOOSEFRUITLN_ARC LFLN ON LF.ID = LFLN.MasterID
WHERE LFLN.EmpCode = ?
  AND LF.DocDate >= @startDate
  AND LF.DocDate < @endDate
GROUP BY LFLN.EmpCode
```

### Contoh Perhitungan

```
Transaksi Brondol:
  2026-01-10: Rp 50,000
  2026-01-20: Rp 75,000
  2026-01-25: Rp 25,000

Calculation:
  Premi Brondol = 50,000 + 75,000 + 25,000 = Rp 150,000
```

---

## 9. Premi Dinamis

### Formula

```
Premi Dinamis = SUM(Amount dari PR_ADTRANS dengan DocDesc pattern)
```

### Pattern DocDesc

| Pattern | Kategori |
|---------|----------|
| `%INSENTIF%` | Premi Insentif |
| `%KINERJA%` | Premi Kinerja |
| `%PRODUKSI%` | Premi Produksi |
| `%RAJIN%` | Premi Rajin |

### Query

```sql
SELECT t.EmpCode, SUM(ln.Amount) as Total
FROM PR_ADTRANS_ARC t
JOIN PR_ADTRANSLN_ARC ln ON t.ID = ln.MasterID
WHERE t.EmpCode = ?
  AND t.DocDate >= @startDate
  AND t.DocDate < @endDate
  AND UPPER(t.DocDesc) LIKE '%INSENTIF%'
GROUP BY t.EmpCode
```

### Contoh Perhitungan

```
Transaksi Premi:
  INSENTIF: Rp 50,000
  KINERJA: Rp 75,000
  PRODUKSI: Rp 40,000

Calculation:
  Total Premi Dinamis = 50,000 + 75,000 + 40,000 = Rp 165,000
```

---

## 10. Total Premi

### Formula

```
Total Premi = Brondol + Premi Dinamis
```

**Note**: Koreksi TIDAK termasuk dalam total_premi

### Contoh Perhitungan

```
Input:
  Brondol = Rp 150,000
  Premi Dinamis = [50,000, 75,000, 40,000]

Calculation:
  Total Premi = 150,000 + 50,000 + 75,000 + 40,000 = Rp 315,000
```

### Implementasi Kode

```typescript
// payrollService.ts
public calculateTotalPremi(
    brondolAmount: number,
    dynamicPremiAmounts: number[]
): number {
    const totalDynamic = dynamicPremiAmounts.reduce((sum, val) => sum + val, 0);
    return brondolAmount + totalDynamic;
}
```

---

## 11. Jumlah Upah Kotor

### Formula

```
Jumlah Upah Kotor = Gaji Pokok + Total Tunjangan + Total Premi
```

### Contoh Perhitungan

```
Input:
  Gaji Pokok = Rp 1,950,000
  Total Tunjangan = Rp 286,000
  Total Premi = Rp 315,000

Calculation:
  Jumlah Upah Kotor = 1,950,000 + 286,000 + 315,000 = Rp 2,551,000
```

### Implementasi Kode

```typescript
// payrollService.ts
public calculateJumlahUpahKotor(
    hkCount: number,
    payrate: number,
    totalTunjangan: number,
    totalPremi: number
): number {
    const gajiPokok = this.calculateGajiPokokJmlHk(hkCount, payrate);
    return gajiPokok + totalTunjangan + totalPremi;
}
```

---

## 12. BPJS Base

### Formula

```
Gaji Standar = Upah Dasar × 30
BPJS Base = Gaji Standar + Tunjangan Masa Kerja
```

**Note**: Base menggunakan 30 hari tetap (bukan HK aktual)

### Contoh Perhitungan

```
Input:
  Upah Dasar = Rp 75,000
  Masa Kerja = Rp 100,000

Calculation:
  Gaji Standar = 75,000 × 30 = Rp 2,250,000
  BPJS Base = 2,250,000 + 100,000 = Rp 2,350,000
```

### Implementasi Kode

```typescript
// carumanDefinitions.ts
export function getCarumanBase(upahDasar: number, masaKerjaJumlah: number): number {
    return (upahDasar * 30) + masaKerjaJumlah;
}
```

---

## 13. BPJS Kesehatan & Pensiun

### Persentase

| Program | Pekerja | Majikan | Total |
|---------|---------|---------|-------|
| Kesehatan | 1% | 4% | 5% |
| Pensiun | 1% | 2% | 3% |
| **Subtotal** | **2%** | **6%** | **8%** |

### Formula

```
BPJS Kesehatan Pekerja = 1% × Base
BPJS Kesehatan Majikan = 4% × Base
BPJS Pensiun Pekerja = 1% × Base
BPJS Pensiun Majikan = 2% × Base

Total Pekerja = 2% × Base
Total Majikan = 6% × Base
```

### Contoh Perhitungan

```
Input:
  Base = Rp 2,350,000

Calculation:
  BPJS Kes Pekerja = 1% × 2,350,000 = Rp 23,500
  BPJS Kes Majikan = 4% × 2,350,000 = Rp 94,000
  BPJS Pensiun Pekerja = 1% × 2,350,000 = Rp 23,500
  BPJS Pensiun Majikan = 2% × 2,350,000 = Rp 47,000
  
  Total Pekerja = 23,500 + 23,500 = Rp 47,000
  Total Majikan = 94,000 + 47,000 = Rp 141,000
```

### Implementasi Kode

```typescript
// carumanDefinitions.ts
export function calculateAllCaruman(upahDasar: number, masaKerjaJumlah: number): CarumanResult {
    const base = (upahDasar * 30) + masaKerjaJumlah;
    
    return {
        bpjs_kes_pekerja: Math.round(base * 0.01),
        bpjs_kes_majikan: Math.round(base * 0.04),
        bpjs_pensiun_pekerja: Math.round(base * 0.01),
        bpjs_pensiun_majikan: Math.round(base * 0.02),
        total_pekerja: Math.round(base * 0.02),
        total_majikan: Math.round(base * 0.06),
        // ... other fields
    };
}
```

---

## 14. ASTEK (Jamsostek)

### Persentase

| Program | Pekerja | Majikan | Total |
|---------|---------|---------|-------|
| JHT | 2% | 3.7% | 5.7% |
| JKK/JKM | - | 0.84% | 0.84% |
| **Total** | **2%** | **4.54%** | **6.54%** |

### Formula

```
ASTEK JHT Pekerja = 2% × Base
ASTEK JHT Majikan = 3.7% × Base
ASTEK JKK/JKM Majikan = 0.84% × Base

Total Pekerja = 2% × Base
Total Majikan = 4.54% × Base
```

### Contoh Perhitungan

```
Input:
  Base = Rp 2,350,000

Calculation:
  ASTEK JHT Pekerja = 2% × 2,350,000 = Rp 47,000
  ASTEK JHT Majikan = 3.7% × 2,350,000 = Rp 86,950
  ASTEK JKK/JKM Majikan = 0.84% × 2,350,000 = Rp 19,740
  
  Total Pekerja = Rp 47,000
  Total Majikan = 86,950 + 19,740 = Rp 106,690
```

---

## 15. Total Potongan

### Formula

```
Total Potongan = BPJS Pekerja + SPSI + PPh 21 + Koreksi
```

### Variabel

| Variabel | Deskripsi | Sumber |
|----------|-----------|--------|
| `BPJS Pekerja` | 2% (Kes+Pensiun) + 2% (JHT) | CarumanDefinitions |
| `SPSI` | Fixed amount | Configuration |
| `PPh 21` | Pajak penghasilan | TaxCalculationService |
| `Koreksi` | Adjustment/potongan khusus | Manual adjustment |

### Contoh Perhitungan

```
Input:
  BPJS Pekerja = Rp 94,000 (2% + 2% = 4% dari base)
  SPSI = Rp 5,000
  PPh 21 = Rp 25,000
  Koreksi = Rp 0

Calculation:
  Total Potongan = 94,000 + 5,000 + 25,000 + 0 = Rp 124,000
```

### Implementasi Kode

```typescript
// payrollService.ts
public calculateTotalPotongan(
    bpjsPekerjaTotal: number,
    spsiAmount: number,
    pph21Amount: number
): number {
    return bpjsPekerjaTotal + spsiAmount + pph21Amount;
}
```

---

## 16. Upah Bersih

### Formula

```
Upah Bersih = Jumlah Upah Kotor - Total Potongan
```

### Contoh Perhitungan

```
Input:
  Jumlah Upah Kotor = Rp 2,551,000
  Total Potongan = Rp 124,000

Calculation:
  Upah Bersih = 2,551,000 - 124,000 = Rp 2,427,000
```

### Implementasi Kode

```typescript
// payrollService.ts
public calculateUpahBersih(
    jumlahUpahKotor: number,
    totalPotongan: number
): number {
    return jumlahUpahKotor - totalPotongan;
}
```

---

## 17. THR (Tunjangan Hari Raya)

### Formula

```
THR = (Upah Dasar × 30) + (Beras Rate × 30) + Masa Kerja Jumlah
```

### Variabel

| Variabel | Deskripsi | Sumber |
|----------|-----------|--------|
| `Upah Dasar` | Payrate per HK | `HR_PAYROLL.PayRate` |
| `Beras Rate` | Rate beras per HK | `HR_PAYROLL.RiceRation` |
| `Masa Kerja` | Tunjangan masa kerja | `PR_ADTRANS` |

### Contoh Perhitungan

```
Input:
  Upah Dasar = Rp 75,000
  Beras Rate = Rp 3,000
  Masa Kerja = Rp 100,000

Calculation:
  THR = (75,000 × 30) + (3,000 × 30) + 100,000
      = 2,250,000 + 90,000 + 100,000
      = Rp 2,340,000
```

### Implementasi Kode

```typescript
// otherIncomesService.ts
const thrFormula = '(UPAH_DASAR * 30) + (BERAS_RATE * 30) + MASA_KERJA_JUMLAH';

const thrAmount = (upahDasar * 30) + (berasRate * 30) + masaKerjaJumlah;
```

---

## 18. PPh 21 (TER)

### Formula

```
Penghasilan Bruto = Gaji Standar + ASTEK Majikan 0.84% + BPJS Kes Majikan 4%
PTKP = Penghasilan Tidak Kena Pajak (berdasarkan status)
PKP = Penghasilan Kena Pajak = Bruto - PTKP
PPh 21 = Tarif TER × PKP
```

### Tarif TER (2024)

| PKP per Tahun | Tarif |
|---------------|-------|
| 0 - 60 juta | 5% |
| 60 - 250 juta | 15% |
| 250 - 500 juta | 25% |
| 500 juta - 5 Milyar | 30% |
| > 5 Milyar | 35% |

### PTKP (2024)

| Status | PTKP (per tahun) |
|--------|------------------|
| TK/0 | Rp 54,000,000 |
| K/0 | Rp 58,500,000 |
| K/1 | Rp 63,000,000 |
| K/2 | Rp 67,500,000 |
| K/3 | Rp 72,000,000 |

### Contoh Perhitungan

```
Input:
  Gaji Standar = Rp 2,250,000 × 12 = Rp 27,000,000 (per tahun)
  ASTEK Majikan 0.84% = Rp 19,740 × 12 = Rp 236,880
  BPJS Kes Majikan 4% = Rp 94,000 × 12 = Rp 1,128,000
  
  Penghasilan Bruto = 27,000,000 + 236,880 + 1,128,000 = Rp 28,364,880
  Status = TK/0 → PTKP = Rp 54,000,000
  
  PKP = 28,364,880 - 54,000,000 = 0 (negative → 0)
  PPh 21 = 5% × 0 = Rp 0
```

### Implementasi Kode

```typescript
// taxCalculationService.ts
const grossIncome = gajiStandar + astek_majikan_084 + bpjs_kes_majikan_4;
const ptkp = getPTKP(statusPtkp);  // Based on status
const pkp = Math.max(0, grossIncome - ptkp);
const taxRate = getTaxRate(pkp);  // Based on TER brackets
const pph21 = taxRate * pkp;
```

---

## Summary: Complete Calculation Flow

```
┌─────────────────────────────────────────────────────────────┐
│            COMPLETE PAYROLL CALCULATION FLOW                │
└─────────────────────────────────────────────────────────────┘

Input: Employee E0001, Period: January 2026
  - HK = 26
  - Upah Dasar = 75,000
  - Beras Rate = 3,000
  - Jabatan = Mandor (3,000)
  - Masa Kerja = 100,000
  - Cuti: Tahunan=1, Sakit=2, Minggu=4, Nasional=1

Step 1: Calculate Hari Kerja
  Total Cuti = 1 + 2 + 4 + 1 = 8
  Hari Kerja = 26 - 8 = 18

Step 2: Calculate Gaji Pokok
  Gaji Pokok = 18 × 75,000 = 1,350,000

Step 3: Calculate Tunjangan
  Beras = 26 × 3,000 = 78,000
  Jabatan = 3,000
  Masa Kerja = 100,000
  Lembur = 105,000 (from transactions)
  Total Tunjangan = 78,000 + 3,000 + 100,000 + 105,000 = 286,000

Step 4: Calculate Premi
  Brondol = 150,000
  Dinamis = 165,000 (50k+75k+40k)
  Total Premi = 150,000 + 165,000 = 315,000

Step 5: Calculate Upah Kotor
  Upah Kotor = 1,350,000 + 286,000 + 315,000 = 1,951,000

Step 6: Calculate BPJS Base
  Gaji Standar = 75,000 × 30 = 2,250,000
  Base = 2,250,000 + 100,000 = 2,350,000

Step 7: Calculate BPJS Pekerja
  BPJS Kes = 1% × 2,350,000 = 23,500
  BPJS Pensiun = 1% × 2,350,000 = 23,500
  ASTEK JHT = 2% × 2,350,000 = 47,000
  Total Pekerja = 23,500 + 23,500 + 47,000 = 94,000

Step 8: Calculate Total Potongan
  BPJS = 94,000
  SPSI = 5,000
  PPh 21 = 0 (below PTKP)
  Koreksi = 0
  Total Potongan = 94,000 + 5,000 + 0 + 0 = 99,000

Step 9: Calculate Upah Bersih
  Upah Bersih = 1,951,000 - 99,000 = 1,852,000

Final Result:
  ┌─────────────────────────────────────┐
  │  GAJI POKOK       Rp  1,350,000    │
  │  TOTAL TUNJANGAN  Rp    286,000    │
  │  TOTAL PREMI      Rp    315,000    │
  │  ───────────────────────────────    │
  │  UPAH KOTOR       Rp  1,951,000    │
  │  TOTAL POTONGAN   Rp     99,000    │
  │  ───────────────────────────────    │
  │  UPAH BERSIH      Rp  1,852,000    │
  └─────────────────────────────────────┘
```

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - PayrollService implementation
- 📄 [`05_CARUMAN_DEFINITIONS.md`](./05_CARUMAN_DEFINITIONS.md) - BPJS rates
- 📄 [`04_OTHER_INCOMES_SERVICE.md`](./04_OTHER_INCOMES_SERVICE.md) - THR calculation
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Database fields

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**Status**: Referensi lengkap formula perhitungan daftar upah
