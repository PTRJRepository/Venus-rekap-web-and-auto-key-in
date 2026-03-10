# CarumanDefinitions - Single Source of Truth untuk BPJS & ASTEK

## Gambaran Umum

**CarumanDefinitions** adalah file definisi yang menjadi **Single Source of Truth (SSOT)** untuk semua persentase dan perhitungan BPJS (Kesehatan & Pensiun) serta ASTEK (Jamsostek). Semua service yang membutuhkan perhitungan caruman WAJIB menggunakan fungsi dari file ini.

**File Lokasi**: `backend/src/services/carumanDefinitions.ts`

## Filosofi Design

### Why Single Source of Truth?

Sebelum adanya file ini, persentase BPJS/ASTEK tersebar di berbagai service dengan implementasi yang berbeda-beda, menyebabkan:
- ❌ Inkonsistensi perhitungan
- ❌ Sulit maintenance saat ada perubahan rate
- ❌ Bug akibat hardcode persentase di multiple places
- ❌ Tidak ada dokumentasi terpusat

**Solusi**: Centralize semua definisi dan fungsi perhitungan di satu file.

## Persentase Caruman

### Ringkasan Rate

| Program | Pekerja | Majikan | Total | Base |
|---------|---------|---------|-------|------|
| **ASTEK (Jamsostek)** | | | | |
| ├─ JHT (Jaminan Hari Tua) | 2% | 3.7% | 5.7% | Base |
| ├─ JKK (Jaminan Kecelakaan Kerja) | - | 0.24%* | - | Base |
| └─ JKM (Jaminan Kematian) | - | 0.6%* | - | Base |
| **BPJS Kesehatan** | 1% | 4% | 5% | Base |
| **BPJS Pensiun** | 1% | 2% | 3% | Base |

\* JKK rate bervariasi berdasarkan risiko industri (0.24% untuk perkebunan)
\*\* JKK + JKM = 0.84% (combined rate)

### Rate Constants

```typescript
export const CARUMAN_RATES = {
    // ASTEK / Jamsostek
    ASTEK_PEKERJA_JHT: 0.02,          // JHT Pekerja: 2%
    ASTEK_MAJIKAN_JKK_JKM: 0.0084,    // JKK/JKM Majikan: 0.84%
    ASTEK_MAJIKAN_JHT: 0.037,         // JHT Majikan: 3.7%
    ASTEK_MAJIKAN_TOTAL: 0.0454,      // Total Majikan: 4.54%
    
    // BPJS Kesehatan
    BPJS_KES_PEKERJA: 0.01,           // Kesehatan Pekerja: 1%
    BPJS_KES_MAJIKAN: 0.04,           // Kesehatan Majikan: 4%
    
    // BPJS Pensiun
    BPJS_PENSIUN_PEKERJA: 0.01,       // Pensiun Pekerja: 1%
    BPJS_PENSIUN_MAJIKAN: 0.02,       // Pensiun Majikan: 2%
} as const;
```

## Base Perhitungan

### Formula Base

```
BASE = (Upah Dasar × 30) + Tunjangan Masa Kerja
```

**Komponen**:
- **Gaji Standar**: `Upah Dasar × 30` (asumsi 30 hari per bulan)
- **Tunjangan Masa Kerja**: Fixed amount berdasarkan lama kerja

**Contoh**:
```
Upah Dasar: Rp 75,000
Masa Kerja: Rp 100,000

Gaji Standar = 75,000 × 30 = 2,250,000
Base = 2,250,000 + 100,000 = 2,350,000
```

### Mengapa 30 Hari?

Base BPJS menggunakan 30 hari tetap, bukan HK aktual, karena:
1. **Standar BPJS**: Peraturan BPJS menggunakan 30 hari sebagai standar bulanan
2. **Konsistensi**: Tidak bergantung pada variasi hari kerja per bulan
3. **Fairness**: Semua karyawan dihitung dengan standar yang sama

## Interface & Types

### CarumanResult

```typescript
export interface CarumanResult {
    // Base amounts
    base: number;              // Base perhitungan: (Upah × 30) + Masa Kerja
    gajiStandar: number;       // Gaji Standar: Upah × 30
    
    // ASTEK (Pekerja)
    astek_pekerja_jht: number;         // 2% dari base
    
    // ASTEK (Majikan)
    astek_majikan_jkk_jkm: number;     // 0.84% dari base
    astek_majikan_jht: number;         // 3.7% dari base
    astek_majikan_total: number;       // 4.54% dari base
    
    // BPJS Kesehatan
    bpjs_kes_pekerja: number;          // 1% dari base
    bpjs_kes_majikan: number;          // 4% dari base
    
    // BPJS Pensiun
    bpjs_pensiun_pekerja: number;      // 1% dari base
    bpjs_pensiun_majikan: number;      // 2% dari base
    
    // Aggregated totals
    total_pekerja: number;             // Total semua porsi pekerja
    total_majikan: number;             // Total semua porsi majikan
    grand_total: number;               // Grand total (pekerja + majikan)
}
```

## Fungsi Publik

### 1. getCarumanBase()

Menghitung base untuk perhitungan caruman.

```typescript
export function getCarumanBase(
    upahDasar: number, 
    masaKerjaJumlah: number
): number
```

**Formula**:
```
Base = (Upah Dasar × 30) + Tunjangan Masa Kerja
```

**Contoh**:
```typescript
const base = getCarumanBase(75000, 100000);
// Base = (75000 × 30) + 100000 = 2,350,000
```

---

### 2. getGajiStandar()

Menghitung gaji standar (Upah Dasar × 30).

```typescript
export function getGajiStandar(upahDasar: number): number
```

**Formula**:
```
Gaji Standar = Upah Dasar × 30
```

**Contoh**:
```typescript
const gajiStandar = getGajiStandar(75000);
// Gaji Standar = 75000 × 30 = 2,250,000
```

---

### 3. calculateAllCaruman() ⭐

Fungsi utama untuk menghitung SEMUA komponen caruman.

```typescript
export function calculateAllCaruman(
    upahDasar: number, 
    masaKerjaJumlah: number
): CarumanResult
```

**Proses**:
```
┌─────────────────────────────────────────────────────────────┐
│         ALUR PERHITUNGAN calculateAllCaruman                │
└─────────────────────────────────────────────────────────────┘

Input: upahDasar, masaKerjaJumlah
│
├─ 1. Hitung Gaji Standar
│  └─ gajiStandar = upahDasar × 30
│
├─ 2. Hitung Base
│  └─ base = gajiStandar + masaKerjaJumlah
│
├─ 3. Hitung ASTEK (Pekerja)
│  └─ astek_pekerja_jht = base × 2%
│
├─ 4. Hitung ASTEK (Majikan)
│  ├─ astek_majikan_jkk_jkm = base × 0.84%
│  ├─ astek_majikan_jht = base × 3.7%
│  └─ astek_majikan_total = base × 4.54%
│
├─ 5. Hitung BPJS Kesehatan
│  ├─ bpjs_kes_pekerja = base × 1%
│  └─ bpjs_kes_majikan = base × 4%
│
├─ 6. Hitung BPJS Pensiun
│  ├─ bpjs_pensiun_pekerja = base × 1%
│  └─ bpjs_pensiun_majikan = base × 2%
│
├─ 7. Aggregate Totals
│  ├─ total_pekerja = astek_pekerja_jht + bpjs_kes_pekerja + bpjs_pensiun_pekerja
│  ├─ total_majikan = astek_majikan_total + bpjs_kes_majikan + bpjs_pensiun_majikan
│  └─ grand_total = total_pekerja + total_majikan
│
└─ Return: CarumanResult object
```

**Contoh Lengkap**:
```typescript
const result = calculateAllCaruman(75000, 100000);

// Step-by-step calculation:
// Gaji Standar = 75000 × 30 = 2,250,000
// Base = 2,250,000 + 100,000 = 2,350,000

// ASTEK Pekerja (2%)
// astek_pekerja_jht = 2,350,000 × 0.02 = 47,000

// ASTEK Majikan
// astek_majikan_jkk_jkm = 2,350,000 × 0.0084 = 19,740
// astek_majikan_jht = 2,350,000 × 0.037 = 86,950
// astek_majikan_total = 2,350,000 × 0.0454 = 106,690

// BPJS Kesehatan
// bpjs_kes_pekerja = 2,350,000 × 0.01 = 23,500
// bpjs_kes_majikan = 2,350,000 × 0.04 = 94,000

// BPJS Pensiun
// bpjs_pensiun_pekerja = 2,350,000 × 0.01 = 23,500
// bpjs_pensiun_majikan = 2,350,000 × 0.02 = 47,000

// Totals
// total_pekerja = 47,000 + 23,500 + 23,500 = 94,000
// total_majikan = 106,690 + 94,000 + 47,000 = 247,690
// grand_total = 94,000 + 247,690 = 341,690

console.log(result);
// Output:
{
    base: 2350000,
    gajiStandar: 2250000,
    astek_pekerja_jht: 47000,
    astek_majikan_jkk_jkm: 19740,
    astek_majikan_jht: 86950,
    astek_majikan_total: 106690,
    bpjs_kes_pekerja: 23500,
    bpjs_kes_majikan: 94000,
    bpjs_pensiun_pekerja: 23500,
    bpjs_pensiun_majikan: 47000,
    total_pekerja: 94000,
    total_majikan: 247690,
    grand_total: 341690
}
```

---

### 4. getCarumanForPph21()

Fungsi convenience untuk mendapatkan komponen yang dibutuhkan dalam perhitungan PPh21.

```typescript
export function getCarumanForPph21(
    upahDasar: number, 
    masaKerjaJumlah: number
): {
    base: number;
    gajiStandar: number;
    astek_majikan_084: number;
    bpjs_kes_majikan_4: number;
}
```

**Use Case**: Perhitungan penghasilan bruto untuk PPh21 hanya membutuhkan:
- ASTEK Majikan JKK/JKM (0.84%)
- BPJS Kes Majikan (4%)

**Contoh**:
```typescript
const forPph21 = getCarumanForPph21(75000, 100000);
// {
//     base: 2350000,
//     gajiStandar: 2250000,
//     astek_majikan_084: 19740,
//     bpjs_kes_majikan_4: 94000
// }
```

---

## Rounding Function

### Internal Helper: `r()`

```typescript
function r(value: number): number {
    return Math.round(value);
}
```

**Purpose**: Semua hasil persentase dibulatkan ke integer terdekat.

**Contoh**:
```typescript
const amount = r(2350000 * 0.01);  // Math.round(23500.0) = 23500
const amount = r(2350000 * 0.0084); // Math.round(19740.0) = 19740
```

---

## Integrasi dengan Service Lain

### 1. **PayrollService**

```typescript
// payrollService.ts
import { calculateAllCaruman } from './carumanDefinitions';

public calculateBpjsComponents(masaKerjaJumlah: number, upahDasar: number): BPJSComponents {
    const caruman = calculateAllCaruman(upahDasar, masaKerjaJumlah);
    
    return {
        kesehatan_pekerja: caruman.bpjs_kes_pekerja,
        kesehatan_majikan: caruman.bpjs_kes_majikan,
        pensiun_pekerja: caruman.bpjs_pensiun_pekerja,
        pensiun_majikan: caruman.bpjs_pensiun_majikan,
        // ... map other fields
    };
}
```

### 2. **TaxCalculationService**

```typescript
// taxCalculationService.ts
import { getCarumanForPph21 } from './carumanDefinitions';

public calculateGrossIncome(upahDasar: number, masaKerjaJumlah: number): number {
    const caruman = getCarumanForPph21(upahDasar, masaKerjaJumlah);
    
    // Penghasilan bruto = Gaji Standar + ASTEK Majikan 0.84% + BPJS Kes Majikan 4%
    const grossIncome = caruman.gajiStandar + 
                        caruman.astek_majikan_084 + 
                        caruman.bpjs_kes_majikan_4;
    
    return grossIncome;
}
```

### 3. **OtherIncomesService (THR)**

```typescript
// otherIncomesService.ts
import { getCarumanBase } from './carumanDefinitions';

// THR calculation may need caruman base for certain formulas
const base = getCarumanBase(upahDasar, masaKerjaJumlah);
```

---

## Breakdown Potongan Pekerja

Dari total caruman, yang menjadi **potongan karyawan** (dipotong dari gaji):

```typescript
// Potongan Pekerja (dari gaji karyawan)
const potonganPekerja = {
    astek_jht: 2%,        // JHT 2%
    bpjs_kes: 1%,         // Kesehatan 1%
    bpjs_pensiun: 1%      // Pensiun 1%
    // ────────────────────────
    // Total: 4% dari base
};
```

**Contoh**:
```typescript
const result = calculateAllCaruman(75000, 100000);

// Potongan dari gaji karyawan:
const potonganGaji = result.total_pekerja;
// = astek_pekerja_jht + bpjs_kes_pekerja + bpjs_pensiun_pekerja
// = 47,000 + 23,500 + 23,500 = 94,000
```

## Biaya Perusahaan (Majikan)

Selain potongan pekerja, perusahaan juga menanggung biaya sendiri:

```typescript
// Biaya Majikan (tanggungan perusahaan, tidak potong gaji)
const biayaMajikan = {
    astek_jkk_jkm: 0.84%,   // JKK/JKM
    astek_jht: 3.7%,        // JHT Majikan
    bpjs_kes: 4%,           // Kesehatan Majikan
    bpjs_pensiun: 2%        // Pensiun Majikan
    // ────────────────────────
    // Total: 9.84% dari base
};
```

**Contoh**:
```typescript
const result = calculateAllCaruman(75000, 100000);

// Biaya perusahaan:
const biayaPerusahaan = result.total_majikan;
// = 247,690
```

---

## Regulatory Compliance

### Dasar Hukum

1. **BPJS Kesehatan**: UU No. 40 Tahun 2004 tentang SJSN
   - Pekerja: 1%
   - Majikan: 4%

2. **BPJS Pensiun**: PP No. 45 Tahun 2015
   - Pekerja: 1%
   - Majikan: 2%

3. **JHT (Jaminan Hari Tua)**: PP No. 46 Tahun 2015
   - Pekerja: 2%
   - Majikan: 3.7%

4. **JKK (Jaminan Kecelakaan Kerja)**: PP No. 44 Tahun 2015
   - Majikan: 0.24% - 1.74% (berdasarkan risiko)
   - Untuk perkebunan: 0.24%

5. **JKM (Jaminan Kematian)**: PP No. 44 Tahun 2015
   - Majikan: 0.3%
   - Combined JKK+JKM: 0.84%

### Update Rate

Jika ada perubahan regulasi, update `CARUMAN_RATES`:

```typescript
// Example: If JHT rate changes from 2% to 2.5%
export const CARUMAN_RATES = {
    ASTEK_PEKERJA_JHT: 0.025,  // Updated from 0.02
    // ... other rates
};
```

**Important**: Setelah update rate:
1. ✅ Test semua perhitungan
2. ✅ Update dokumentasi
3. ✅ Notify semua developer
4. ✅ Version control commit message: "Update JHT rate per new regulation"

---

## Best Practices

### 1. **Always Use calculateAllCaruman()**

```typescript
// ✅ GOOD: Use the main function
const caruman = calculateAllCaruman(upahDasar, masaKerjaJumlah);
const bpjsPekerja = caruman.total_pekerja;

// ❌ BAD: Manual calculation
const bpjsPekerja = (upahDasar * 30 + masaKerjaJumlah) * 0.04;
```

### 2. **Don't Hardcode Rates**

```typescript
// ✅ GOOD: Use constants
const rate = CARUMAN_RATES.BPJS_KES_PEKERJA;

// ❌ BAD: Hardcode
const rate = 0.01;
```

### 3. **Import from Single Source**

```typescript
// ✅ GOOD: Import from carumanDefinitions
import { calculateAllCaruman, CARUMAN_RATES } from './carumanDefinitions';

// ❌ BAD: Redefine rates
const MY_RATES = {
    BPJS_KES: 0.01,  // Duplicate definition
};
```

### 4. **Use Type Safety**

```typescript
// ✅ GOOD: Use CarumanResult interface
const result: CarumanResult = calculateAllCaruman(...);

// ❌ BAD: Any type
const result: any = calculateAllCaruman(...);
```

---

## Testing

### Unit Test Example

```typescript
import { calculateAllCaruman, getCarumanBase } from './carumanDefinitions';

describe('CarumanDefinitions', () => {
    test('should calculate base correctly', () => {
        const base = getCarumanBase(75000, 100000);
        expect(base).toBe(2350000);
    });
    
    test('should calculate all caruman components', () => {
        const result = calculateAllCaruman(75000, 100000);
        
        expect(result.base).toBe(2350000);
        expect(result.gajiStandar).toBe(2250000);
        expect(result.bpjs_kes_pekerja).toBe(23500);  // 1% of 2,350,000
        expect(result.bpjs_pensiun_pekerja).toBe(23500);  // 1% of 2,350,000
        expect(result.astek_pekerja_jht).toBe(47000);  // 2% of 2,350,000
        expect(result.total_pekerja).toBe(94000);
    });
    
    test('should handle zero masa kerja', () => {
        const result = calculateAllCaruman(75000, 0);
        
        expect(result.base).toBe(2250000);  // 75000 × 30
        expect(result.bpjs_kes_pekerja).toBe(22500);  // 1% of 2,250,000
    });
});
```

---

## Troubleshooting

### Issue: Perhitungan BPJS Berbeda

**Symptom**: BPJS calculation berbeda dengan perhitungan manual.

**Solution**:
1. Verifikasi base calculation: `(upah_dasar × 30) + masa_kerja`
2. Cek rounding: Semua nilai di-round dengan `Math.round()`
3. Pastikan menggunakan rate terbaru dari `CARUMAN_RATES`

### Issue: Rate Tidak Update

**Symptom**: Perhitungan masih menggunakan rate lama.

**Solution**:
1. Clear cache jika ada caching
2. Restart server
3. Verify `CARUMAN_RATES` value di code
4. Check import statement: `import { CARUMAN_RATES } from './carumanDefinitions'`

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Integration dengan PayrollService
- 📄 [`10_CALCULATION_FORMULAS.md`](./10_CALCULATION_FORMULAS.md) - Formula lengkap perhitungan
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Database fields untuk BPJS
- 📄 [`00_README_MAIN.md`](./00_README_MAIN.md) - Gambaran umum komponen potongan

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/services/carumanDefinitions.ts`  
**Status**: Single Source of Truth (SSOT)
