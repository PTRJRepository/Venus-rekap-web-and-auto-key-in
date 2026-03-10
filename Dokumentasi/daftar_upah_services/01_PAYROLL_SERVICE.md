# PayrollService - Layanan Kalkulasi Payroll Inti

## Gambaran Umum

**PayrollService** adalah service inti yang bertanggung jawab untuk semua kalkulasi payroll dalam sistem Daftar Upah. Service ini menyediakan fungsi-fungsi matematika untuk menghitung gaji pokok, tunjangan, premi, potongan BPJS, dan upah bersih.

**File Lokasi**: `backend/src/services/payrollService.ts`

## Tanggung Jawab Utama

1. **Kalkulasi Gaji Pokok** - Perhitungan berdasarkan HK dan payrate
2. **Kalkulasi Tunjangan** - Total dari berbagai komponen tunjangan
3. **Kalkulasi Premi** - Premi brondol dan premi dinamis
4. **Kalkulasi BPJS** - Komponen BPJS Kesehatan dan Pensiun (pekerja & majikan)
5. **Kalkulasi Potongan** - Total potongan dari berbagai sumber
6. **Kalkulasi Upah Bersih** - Final calculation dari kotor dikurangi potongan

## Struktur Data

### Interface: PayrollRow

```typescript
export interface PayrollRow {
    // Identitas Karyawan
    no: number;
    nik: string;
    nama: string;
    jenis_kelamin: string;
    gang_code: string;
    phone: string;
    
    // Data Dasar
    upah_dasar: number;        // Payrate per HK
    hari_kerja: number;        // HK aktual
    
    // Komponen Pendapatan
    upah_pokok: number;        // HK × Payrate
    gaji_pokok: number;        // Sama dengan upah_pokok
    
    // Cuti
    cuti_tahunan_hari: number;
    cuti_sakit_haid_hari: number;
    cuti_minggu_hari: number;
    cuti_nasional_hari: number;
    jumlah_hk: number;         // HK total
    
    // Tunjangan
    beras_rate: number;        // Rate beras per HK
    beras_jumlah: number;      // HK × beras_rate
    jabatan_rate: number;      // Rate jabatan
    jabatan_jumlah: number;    // Fixed amount jabatan
    masa_kerja_tahun: number;  // Lama kerja dalam tahun
    masa_kerja_jumlah: number; // Amount masa kerja
    lembur_jam: number;
    lembur_jumlah: number;
    total_tunjangan: number;
    
    // Premi
    premi_brondol: number;
    premi: Record<string, number>;  // Premi dinamis
    total_premi: number;
    
    // Kotor & Potongan
    jumlah_upah_kotor: number;
    pot_spsi: number;
    pot_pph21: number;
    pot_koreksi: number;
    pot_bpjs_kesehatan_pekerja: number;
    pot_bpjs_pensiun_pekerja: number;
    pot_bpjs_pekerja_total: number;
    total_potongan: number;
    
    // Final
    upah_bersih: number;
}
```

### Interface: BPJSComponents

```typescript
export interface BPJSComponents {
    kesehatan_pekerja: number;    // 1% dari base
    kesehatan_majikan: number;    // 4% dari base
    kesehatan_total: number;      // Pekerja + Majikan
    
    pensiun_pekerja: number;      // 1% dari base
    pensiun_majikan: number;      // 2% dari base
    pensiun_total: number;        // Pekerja + Majikan
    
    jumlah: number;               // Total semua (pekerja + majikan)
    pekerja_total: number;        // Total bagian pekerja
    majikan_total: number;        // Total bagian majikan
    base_amount: number;          // Base perhitungan
}
```

## Metode Publik

### 1. calculateHariKerja()

Menghitung hari kerja aktual setelah dikurangi cuti.

```typescript
public calculateHariKerja(
    hkCount: number,        // Total HK
    cutiTahunan: number,    // Hari cuti tahunan
    cutiSakit: number,      // Hari cuti sakit
    hkMinggu: number,       // Hari minggu/libur
    hkNasional: number      // Hari libur nasional
): number
```

**Formula**:
```
Hari Kerja = max(0, HK - (CutiTahunan + CutiSakit + HKMinggu + HKNasional))
```

**Contoh**:
```typescript
const hk = 26;
const cutiTahunan = 1;
const cutiSakit = 2;
const hkMinggu = 4;
const hkNasional = 1;

const hariKerja = payrollService.calculateHariKerja(26, 1, 2, 4, 1);
// Hasil: 18 hari
```

---

### 2. calculateGajiPokok()

Menghitung gaji pokok berdasarkan hari kerja dan payrate.

```typescript
public calculateGajiPokok(
    hkCount: number,        // Total HK
    payrate: number,        // Upah dasar per HK
    cutiTahunan: number = 0,
    cutiSakit: number = 0,
    hkMinggu: number = 0,
    hkNasional: number = 0
): number
```

**Formula**:
```
Hari Kerja = max(0, HK - TotalCuti)
Gaji Pokok = Hari Kerja × Payrate
```

**Contoh**:
```typescript
const gajiPokok = payrollService.calculateGajiPokok(26, 75000, 1, 2, 4, 1);
// Hari Kerja = 26 - (1+2+4+1) = 18
// Gaji Pokok = 18 × 75000 = 1,350,000
```

---

### 3. calculateGajiPokokJmlHk()

Menghitung gaji pokok untuk gross calculation (tanpa potongan cuti).

```typescript
public calculateGajiPokokJmlHk(
    hkCount: number,
    payrate: number
): number
```

**Formula**:
```
Gaji Pokok Jml HK = HK × Payrate
```

**Use Case**: Digunakan untuk perhitungan jumlah upah kotor (gross salary).

---

### 4. calculateTotalTunjangan()

Menghitung total tunjangan dari semua komponen.

```typescript
public calculateTotalTunjangan(
    hkCount: number,
    berasPayrate: number,
    jabatanAmount: number,
    masaKerjaAmount: number,
    lemburAmount: number
): number
```

**Formula**:
```
Beras Jumlah = HK × Beras Payrate
Total Tunjangan = Beras Jumlah + Jabatan Amount + Masa Kerja Amount + Lembur Amount
```

**Contoh**:
```typescript
const totalTunjangan = payrollService.calculateTotalTunjangan(
    26,      // HK
    3000,    // Beras rate
    50000,   // Jabatan
    100000,  // Masa kerja
    250000   // Lembur
);
// Beras = 26 × 3000 = 78,000
// Total = 78,000 + 50,000 + 100,000 + 250,000 = 478,000
```

---

### 5. calculateTotalPremi()

Menghitung total premi dari brondol dan premi dinamis.

```typescript
public calculateTotalPremi(
    brondolAmount: number,
    dynamicPremiAmounts: number[]
): number
```

**Formula**:
```
Total Premi = Brondol + Σ(Dynamic Premi)
```

**Catatan Penting**: **Koreksi TIDAK termasuk dalam total_premi**

**Contoh**:
```typescript
const totalPremi = payrollService.calculateTotalPremi(
    150000,           // Brondol
    [50000, 75000]    // Premi dinamis: [Insentif, Kinerja]
);
// Total = 150,000 + 50,000 + 75,000 = 275,000
```

---

### 6. calculateBpjsComponents() ⭐

Menghitung semua komponen BPJS (Kesehatan & Pensiun).

```typescript
public calculateBpjsComponents(
    masaKerjaJumlah: number,
    upahDasar: number = 0
): BPJSComponents
```

**Formula Base**:
```
Base = (Upah Dasar × 30) + Masa Kerja Amount
```

**Persentase** (dari `CarumanDefinitions`):
```
BPJS Kesehatan:
  - Pekerja: 1% dari Base
  - Majikan: 4% dari Base

BPJS Pensiun:
  - Pekerja: 1% dari Base
  - Majikan: 2% dari Base
```

**Contoh**:
```typescript
const bpjs = payrollService.calculateBpjsComponents(
    100000,  // Masa kerja amount
    75000    // Upah dasar
);

// Base = (75000 × 30) + 100000 = 2,350,000
// Kesehatan Pekerja = 1% × 2,350,000 = 23,500
// Kesehatan Majikan = 4% × 2,350,000 = 94,000
// Pensiun Pekerja = 1% × 2,350,000 = 23,500
// Pensiun Majikan = 2% × 2,350,000 = 47,000

// Pekerja Total = 23,500 + 23,500 = 47,000
// Majikan Total = 94,000 + 47,000 = 141,000
// Jumlah Total = 47,000 + 141,000 = 188,000
```

**Output**:
```typescript
{
    kesehatan_pekerja: 23500,
    kesehatan_majikan: 94000,
    kesehatan_total: 117500,
    pensiun_pekerja: 23500,
    pensiun_majikan: 47000,
    pensiun_total: 70500,
    jumlah: 188000,
    pekerja_total: 47000,
    majikan_total: 141000,
    base_amount: 2350000
}
```

---

### 7. calculateJumlahUpahKotor()

Menghitung jumlah upah kotor (gross salary).

```typescript
public calculateJumlahUpahKotor(
    hkCount: number,
    payrate: number,
    totalTunjangan: number,
    totalPremi: number
): number
```

**Formula**:
```
Gaji Pokok = HK × Payrate
Jumlah Upah Kotor = Gaji Pokok + Total Tunjangan + Total Premi
```

**Contoh**:
```typescript
const upahKotor = payrollService.calculateJumlahUpahKotor(
    26,         // HK
    75000,      // Payrate
    478000,     // Total tunjangan
    275000      // Total premi
);
// Gaji Pokok = 26 × 75000 = 1,950,000
// Upah Kotor = 1,950,000 + 478,000 + 275,000 = 2,703,000
```

---

### 8. calculateTotalPotongan()

Menghitung total potongan.

```typescript
public calculateTotalPotongan(
    bpjsPekerjaTotal: number,
    spsiAmount: number,
    pph21Amount: number
): number
```

**Formula**:
```
Total Potongan = BPJS Pekerja + SPSI + PPh21
```

**Contoh**:
```typescript
const totalPotongan = payrollService.calculateTotalPotongan(
    47000,   // BPJS Pekerja
    5000,    // SPSI
    25000    // PPh21
);
// Total = 47,000 + 5,000 + 25,000 = 77,000
```

---

### 9. calculateUpahBersih()

Menghitung upah bersih (net salary).

```typescript
public calculateUpahBersih(
    jumlahUpahKotor: number,
    totalPotongan: number
): number
```

**Formula**:
```
Upah Bersih = Jumlah Upah Kotor - Total Potongan
```

**Contoh**:
```typescript
const upahBersih = payrollService.calculateUpahBersih(
    2703000,  // Upah kotor
    77000     // Total potongan
);
// Upah Bersih = 2,703,000 - 77,000 = 2,626,000
```

---

## Metode Data Fetching

### 1. getPayratesMap()

Mengambil map payrate untuk multiple employees.

```typescript
public async getPayratesMap(
    empCodes: string[],
    serverProfile?: string
): Promise<Record<string, number>>
```

**Query Database**:
```sql
SELECT EmpCode, PayRate 
FROM HR_PAYROLL 
WHERE EmpCode IN (?, ?, ...)
```

**Cache**: Hasil di-cache selama 300 detik (5 menit).

**Contoh**:
```typescript
const payrates = await payrollService.getPayratesMap(
    ['E0001', 'E0002', 'E0003']
);
// Hasil: { 'E0001': 75000, 'E0002': 80000, 'E0003': 75000 }
```

---

### 2. getLoosefruitMap()

Mengambil total brondol (loose fruit) untuk multiple employees.

```typescript
public async getLoosefruitMap(
    empCodes: string[],
    startDate: string,
    endDate: string
): Promise<Record<string, number>>
```

**Query Database**:
```sql
SELECT LFLN.EmpCode, SUM(LFLN.Amount) as Total
FROM PR_LOOSEFRUIT_ARC LF
JOIN PR_LOOSEFRUITLN_ARC LFLN ON LF.ID = LFLN.MasterID
WHERE LFLN.EmpCode IN (?, ?, ...)
  AND LF.DocDate >= @startDate
  AND LF.DocDate < @endDate
GROUP BY LFLN.EmpCode
```

**Cache**: Hasil di-cache selama 300 detik.

---

### 3. getPremiMap()

Mengambil premi dinamis berdasarkan pola DocDesc.

```typescript
public async getPremiMap(
    empCodes: string[],
    startDate: string,
    endDate: string,
    pattern: string,
    exactMatch: boolean = false
): Promise<Record<string, number>>
```

**Query Database**:
```sql
SELECT t.EmpCode, SUM(ln.Amount) as Total
FROM PR_ADTRANS_ARC t
JOIN PR_ADTRANSLN_ARC ln ON t.ID = ln.MasterID
WHERE t.EmpCode IN (?, ?, ...)
  AND t.DocDate >= @startDate
  AND t.DocDate < @endDate
  AND UPPER(t.DocDesc) LIKE/= UPPER(@pattern)
GROUP BY t.EmpCode
```

**Contoh Penggunaan**:
```typescript
// Ambil premi dengan pattern "INSENTIF"
const insentifPremi = await payrollService.getPremiMap(
    ['E0001', 'E0002'],
    '2024-01-01',
    '2024-01-31',
    'INSENTIF',
    false  // LIKE match (%INSENTIF%)
);
```

---

### 4. normalizePremiFieldName()

Menormalisasi nama field premi untuk konsistensi.

```typescript
public normalizePremiFieldName(docDesc: string): string
```

**Proses Normalisasi**:
1. Uppercase dan trim
2. Hapus prefix: "TUNJANGAN PREMI", "TUNJANGAN", "PREMI"
3. Lowercase dan replace spasi dengan underscore
4. Hapus karakter special
5. Normalize underscore ganda

**Contoh**:
```typescript
normalizePremiFieldName("TUNJANGAN PREMI INSENTIF")  
// Output: "premi_insentif"

normalizePremiFieldName("Premi Kinerja")  
// Output: "premi_kinerja"

normalizePremiFieldName("TUNJANGAN BRONDOL")  
// Output: "premi_brondol"
```

---

## Alur Kalkulasi Lengkap

```
┌─────────────────────────────────────────────────────────────┐
│            ALUR KALKULASI PayrollService                    │
└─────────────────────────────────────────────────────────────┘

Input: Employee Data + Periode
│
├─ 1. Ambil Payrate
│  └─ getPayratesMap() → upah_dasar, beras_rate
│
├─ 2. Hitung Hari Kerja
│  └─ calculateHariKerja(HK, cuti) → hari_kerja
│
├─ 3. Hitung Gaji Pokok
│  └─ calculateGajiPokok(hari_kerja, payrate) → gaji_pokok
│
├─ 4. Hitung Tunjangan
│  ├─ calculateTotalTunjangan()
│  │  ├─ Beras: HK × beras_rate
│  │  ├─ Jabatan: Fixed amount
│  │  ├─ Masa Kerja: Fixed amount
│  │  └─ Lembur: Σ(jam × rate)
│  └─ → total_tunjangan
│
├─ 5. Hitung Premi
│  ├─ getLoosefruitMap() → brondol
│  ├─ getPremiMap() → premi dinamis
│  └─ calculateTotalPremi() → total_premi
│
├─ 6. Hitung Upah Kotor
│  └─ calculateJumlahUpahKotor() → jumlah_upah_kotor
│
├─ 7. Hitung BPJS
│  ├─ calculateBpjsComponents()
│  │  ├─ Base = (upah_dasar × 30) + masa_kerja
│  │  ├─ Kesehatan Pekerja: 1%
│  │  ├─ Kesehatan Majikan: 4%
│  │  ├─ Pensiun Pekerja: 1%
│  │  └─ Pensiun Majikan: 2%
│  └─ → pot_bpjs_pekerja_total
│
├─ 8. Hitung Potongan Lain
│  ├─ SPSI: Fixed amount
│  ├─ PPh21: Tarif progresif (TaxCalculationService)
│  └─ Koreksi: Adjustment
│
├─ 9. Hitung Total Potongan
│  └─ calculateTotalPotongan() → total_potongan
│
└─ 10. Hitung Upah Bersih
   └─ calculateUpahBersih() → FINAL RESULT
```

## Integrasi dengan Service Lain

### 1. **CarumanDefinitions**
```typescript
import { calculateAllCaruman } from './carumanDefinitions';

// Digunakan di calculateBpjsComponents()
const caruman = calculateAllCaruman(upahDasar, masaKerjaJumlah);
```

### 2. **TaxCalculationService**
```typescript
// PPh21 calculation dilakukan di service terpisah
const pph21 = taxCalculationService.calculatePPh21(...);
```

### 3. **DataExtractorService**
```typescript
// PayrollService menyediakan kalkulasi
// DataExtractorService mengambil data mentah dari DB
const payrollData = await dataExtractorService.extractPayrollData(...);
```

## Best Practices

### 1. **Gunakan Cache untuk Data Statis**
```typescript
// ✅ GOOD: Cache payrate map
const payrates = await payrollService.getPayratesMap(empCodes);

// ❌ BAD: Query ulang setiap kali
for (const emp of empCodes) {
    const rate = await db.query('SELECT PayRate...');
}
```

### 2. **Chunking untuk Large Datasets**
```typescript
// ✅ GOOD: Process dalam chunks
const chunks = this.chunk(empCodes, 200);
for (const chunk of chunks) {
    // Process 200 employees at a time
}
```

### 3. **Gunakan Type Safety**
```typescript
// ✅ GOOD: Gunakan interface
const bpjs: BPJSComponents = payrollService.calculateBpjsComponents(...);

// ❌ BAD: Any type
const bpjs: any = payrollService.calculateBpjsComponents(...);
```

### 4. **Handle Null/Undefined**
```typescript
// ✅ GOOD: Default values
const amount = row.Amount || 0;
const empCode = (row.EmpCode || '').trim();

// ❌ BAD: No null check
const amount = row.Amount;
```

## Testing

### Unit Test Example
```typescript
describe('PayrollService', () => {
    let service: PayrollService;
    
    beforeEach(() => {
        service = PayrollService.getInstance();
    });
    
    test('should calculate gaji pokok correctly', () => {
        const result = service.calculateGajiPokok(26, 75000, 1, 2, 4, 1);
        expect(result).toBe(1350000); // 18 × 75000
    });
    
    test('should calculate BPJS components correctly', () => {
        const bpjs = service.calculateBpjsComponents(100000, 75000);
        expect(bpjs.base_amount).toBe(2350000);
        expect(bpjs.kesehatan_pekerja).toBe(23500);
        expect(bpjs.pensiun_pekerja).toBe(23500);
    });
    
    test('should calculate upah bersih correctly', () => {
        const upahBersih = service.calculateUpahBersih(2703000, 77000);
        expect(upahBersih).toBe(2626000);
    });
});
```

## Troubleshooting

### Issue: BPJS Calculation Tidak Sesuai

**Symptom**: Nilai BPJS berbeda dengan perhitungan manual.

**Solution**:
1. Cek base amount: `(upah_dasar × 30) + masa_kerja`
2. Pastikan menggunakan rate terbaru dari `CarumanDefinitions`
3. Verifikasi rounding (Math.round)

### Issue: Payrate Tidak Ditemukan

**Symptom**: Payrate = 0 untuk employee tertentu.

**Solution**:
1. Cek是否存在 di `HR_PAYROLL`
2. Verifikasi `EmpCode` match (case-sensitive, trim whitespace)
3. Clear cache: Restart service atau tunggu 5 menit

### Issue: Premi Tidak Masuk

**Symptom**: Premi dinamis tidak muncul di total.

**Solution**:
1. Cek pattern di `getPremiMap()` - gunakan wildcard `%`
2. Verifikasi periode `startDate` dan `endDate`
3. Cek `DocDesc` di `PR_ADTRANS_ARC` match dengan pattern

## Referensi Terkait

- 📄 [`05_CARUMAN_DEFINITIONS.md`](./05_CARUMAN_DEFINITIONS.md) - Rate BPJS lengkap
- 📄 [`10_CALCULATION_FORMULAS.md`](./10_CALCULATION_FORMULAS.md) - Formula detail
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Schema HR_PAYROLL, PR_ADTRANS
- 📄 [`08_API_ROUTES_WAGES.md`](./08_API_ROUTES_WAGES.md) - API endpoints

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/services/payrollService.ts`
