# TunjanganService - Layanan Tunjangan Jabatan & Masa Kerja

## Gambaran Umum

**TunjanganService** adalah service yang bertanggung jawab untuk mengelola rate tunjangan, khususnya tunjangan jabatan dan masa kerja. Service ini menyediakan CRUD operations untuk rate tunjangan dan mekanisme seeding untuk data awal.

**File Lokasi**: `backend/src/services/tunjanganService.ts`

## Database Table

### Table: `tunjangan_rate`

Service ini menggunakan tabel khusus di database `extend_db_ptrj` untuk menyimpan rate tunjangan.

```sql
CREATE TABLE tunjangan_rate (
    id INT IDENTITY(1,1) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,      -- Kategori: 'JABATAN', 'MASA_KERJA', dll
    item_key VARCHAR(100) NOT NULL,     -- Key item: 'Mandor', 'Kerani', dll
    rate DECIMAL(18, 2) DEFAULT 0,      -- Rate/nominal tunjangan
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT UQ_Tunjangan_Category_Key UNIQUE(category, item_key)
);
```

**Struktur Data**:
- `category`: Kategori tunjangan (JABATAN, MASA_KERJA, dll)
- `item_key`: Identifier unik untuk item dalam kategori
- `rate`: Nominal rupiah untuk tunjangan tersebut
- `updated_at`: Timestamp terakhir update
- **Unique Constraint**: Kombinasi `category` + `item_key` harus unik

## Metode Publik

### 1. initTable()

Menginisialisasi tabel `tunjangan_rate` jika belum ada.

```typescript
static async initTable(): Promise<void>
```

**Proses**:
1. Cek apakah tabel `tunjangan_rate` sudah ada
2. Jika belum, buat tabel dengan schema di atas
3. Log konfirmasi atau error

**Contoh Penggunaan**:
```typescript
await TunjanganService.initTable();
// Output: "Verified 'tunjangan_rate' table."
```

**Idempotent**: Method ini aman dipanggil berkali-kali (tidak akan error jika tabel sudah ada).

---

### 2. seedJobTitleRates()

Mengisi data awal rate tunjangan jabatan.

```typescript
static async seedJobTitleRates(): Promise<boolean>
```

**Data yang Di-seed**:

| Jabatan | Rate (Rp) |
|---------|-----------|
| Mandor | 3,000 |
| Kerani | 3,000 |
| Helper | 3,000 |
| Operator | 3,000 |
| Supir | 3,000 |
| Security | 3,000 |
| Krani Buah | 3,000 |
| Pemuat | 3,000 |
| Karyawan | 0 |

**Proses**:
1. Panggil `initTable()` untuk memastikan tabel ada
2. Loop melalui setiap jabatan
3. Gunakan `MERGE` statement untuk upsert (update/insert)
4. Update timestamp `updated_at`

**MERGE Statement**:
```sql
MERGE INTO tunjangan_rate AS target
USING (SELECT 'JABATAN' AS category, 'Mandor' AS item_key, 3000 AS rate) AS source
ON (target.category = source.category AND target.item_key = source.item_key)
WHEN MATCHED THEN
    UPDATE SET rate = source.rate, updated_at = GETDATE()
WHEN NOT MATCHED THEN
    INSERT (category, item_key, rate, updated_at)
    VALUES (source.category, source.item_key, source.rate, GETDATE());
```

**Contoh Penggunaan**:
```typescript
const success = await TunjanganService.seedJobTitleRates();
// Output: "Seeded 'JABATAN' rates."
// Return: true
```

**Idempotent**: Aman dipanggil berkali-kali, akan update data yang sudah ada.

---

### 3. getRates()

Mengambil semua rate untuk kategori tertentu.

```typescript
static async getRates(category: string): Promise<Record<string, number>>
```

**Parameter**:
- `category`: Kategori tunjangan (e.g., 'JABATAN', 'MASA_KERJA')

**Return Type**: `Record<string, number>` - Map dari item_key ke rate

**Query Database**:
```sql
SELECT item_key, rate 
FROM tunjangan_rate 
WHERE category = ?
```

**Contoh Penggunaan**:
```typescript
const jabatanRates = await TunjanganService.getRates('JABATAN');
// Hasil:
// {
//     'Mandor': 3000,
//     'Kerani': 3000,
//     'Helper': 3000,
//     'Operator': 3000,
//     'Supir': 3000,
//     'Security': 3000,
//     'Krani Buah': 3000,
//     'Pemuat': 3000,
//     'Karyawan': 0
// }
```

**Error Handling**: Jika terjadi error, return empty object `{}` dan log error.

---

## Alur Penggunaan

### 1. **Initial Setup**

```typescript
// 1. Inisialisasi tabel
await TunjanganService.initTable();

// 2. Seed data awal
await TunjanganService.seedJobTitleRates();

// 3. Verifikasi data
const rates = await TunjanganService.getRates('JABATAN');
console.log(rates);
```

### 2. **Runtime Usage**

```typescript
// Dalam payroll calculation
const jabatanRates = await TunjanganService.getRates('JABATAN');

// Lookup rate berdasarkan jabatan karyawan
const employeeJobTitle = 'Mandor';
const jabatanAmount = jabatanRates[employeeJobTitle] || 0;

// Gunakan dalam perhitungan
const totalTunjangan = berasJumlah + jabatanAmount + masaKerjaAmount + lemburAmount;
```

---

## Integrasi dengan Payroll Calculation

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│         INTEGRASI TunjanganService → Payroll                │
└─────────────────────────────────────────────────────────────┘

Payroll Calculation
│
├─ 1. Ambil Jabatan Employee
│  └─ Dari HR_EMPLOYEE / HR_HISTORY → job_title
│
├─ 2. Lookup Rate
│  └─ TunjanganService.getRates('JABATAN')
│     └─ Rate untuk 'Mandor' = 3000
│
├─ 3. Hitung Tunjangan Jabatan
│  └─ jabatan_jumlah = jabatan_rate (fixed amount per bulan)
│
└─ 4. Masukkan ke Total Tunjangan
   └─ total_tunjangan = beras + jabatan + masa_kerja + lembur
```

### Contoh Kode Integrasi

```typescript
// Di PayrollService atau DataExtractorService
import { TunjanganService } from './tunjanganService';

async function calculateEmployeePayroll(employee: Employee, period: Period) {
    // 1. Get job title from employee data
    const jobTitle = employee.job_title || 'Karyawan';
    
    // 2. Fetch all rates
    const rates = await TunjanganService.getRates('JABATAN');
    
    // 3. Get specific rate for this job title
    const jabatanRate = rates[jobTitle] || rates['Karyawan'] || 0;
    
    // 4. Calculate tunjangan jabatan (fixed per month)
    const jabatanJumlah = jabatanRate;
    
    // 5. Add to total tunjangan
    const totalTunjangan = 
        (hkCount * berasRate) +  // Beras
        jabatanJumlah +           // Jabatan
        masaKerjaJumlah +         // Masa kerja
        lemburJumlah;             // Lembur
    
    return {
        ...employee,
        jabatan_rate: jabatanRate,
        jabatan_jumlah: jabatanJumlah,
        total_tunjangan: totalTunjangan
    };
}
```

---

## Menambah Kategori Baru

### Contoh: Menambah Tunjangan Masa Kerja

```typescript
// 1. Inisialisasi tabel (jika belum)
await TunjanganService.initTable();

// 2. Seed data masa kerja
const db = Database.getExtendedInstance();

const masaKerjaRates = [
    { years: '0-5', rate: 50000 },
    { years: '5-10', rate: 100000 },
    { years: '10-15', rate: 150000 },
    { years: '15-20', rate: 200000 },
    { years: '20+', rate: 250000 }
];

for (const mk of masaKerjaRates) {
    await db.query(`
        MERGE INTO tunjangan_rate AS target
        USING (SELECT 'MASA_KERJA' AS category, ? AS item_key, ? AS rate) AS source
        ON (target.category = source.category AND target.item_key = source.item_key)
        WHEN MATCHED THEN
            UPDATE SET rate = source.rate, updated_at = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (category, item_key, rate, updated_at)
            VALUES (source.category, source.item_key, source.rate, GETDATE());
    `, [mk.years, mk.rate]);
}

// 3. Ambil rate
const mkRates = await TunjanganService.getRates('MASA_KERJA');
// { '0-5': 50000, '5-10': 100000, '10-15': 150000, '15-20': 200000, '20+': 250000 }
```

---

## Best Practices

### 1. **Selalu Handle Missing Rate**

```typescript
// ✅ GOOD: Default value jika tidak ditemukan
const jabatanRate = rates[jobTitle] || rates['Karyawan'] || 0;

// ❌ BAD: Bisa undefined
const jabatanRate = rates[jobTitle];
```

### 2. **Cache Results untuk Performance**

```typescript
// ✅ GOOD: Cache rates untuk menghindari query berulang
const cacheKey = `tunjangan_rates:JABATAN`;
let rates = cacheService.get<Record<string, number>>(cacheKey);

if (!rates) {
    rates = await TunjanganService.getRates('JABATAN');
    cacheService.set(cacheKey, rates, 3600); // Cache 1 jam
}
```

### 3. **Update Rate dengan Audit Trail**

```typescript
// ✅ GOOD: Update dengan timestamp dan log
async function updateJabatanRate(jobTitle: string, newRate: number) {
    const db = Database.getExtendedInstance();
    
    await db.query(`
        UPDATE tunjangan_rate 
        SET rate = ?, updated_at = GETDATE()
        WHERE category = 'JABATAN' AND item_key = ?
    `, [newRate, jobTitle]);
    
    console.log(`Updated ${jobTitle} rate to ${newRate}`);
    
    // Clear cache
    cacheService.delete('tunjangan_rates:JABATAN');
}
```

### 4. **Validasi Rate Sebelum Update**

```typescript
// ✅ GOOD: Validasi input
async function updateRate(category: string, key: string, rate: number) {
    if (rate < 0) {
        throw new Error('Rate tidak boleh negatif');
    }
    
    if (!['JABATAN', 'MASA_KERJA'].includes(category)) {
        throw new Error('Kategori tidak valid');
    }
    
    // Proceed with update...
}
```

---

## Query Examples

### 1. **Lihat Semua Rate**

```sql
SELECT category, item_key, rate, updated_at
FROM tunjangan_rate
ORDER BY category, item_key;
```

### 2. **Update Rate Tertentu**

```sql
UPDATE tunjangan_rate 
SET rate = 5000, updated_at = GETDATE()
WHERE category = 'JABATAN' AND item_key = 'Mandor';
```

### 3. **Tambah Kategori Baru**

```sql
INSERT INTO tunjangan_rate (category, item_key, rate, updated_at)
VALUES ('LEMBUR', 'Rate_Lembur_1', 15000);
```

### 4. **Hapus Kategori**

```sql
DELETE FROM tunjangan_rate 
WHERE category = 'MASA_KERJA';
```

---

## Troubleshooting

### Issue: Rate Tidak Ditemukan

**Symptom**: `jabatanRate` selalu 0.

**Solution**:
1. Cek apakah data sudah di-seed: `SELECT * FROM tunjangan_rate`
2. Verifikasi `item_key` match (case-sensitive)
3. Jalankan `seedJobTitleRates()` jika tabel kosong

### Issue: Duplicate Key Error

**Symptom**: Error saat seeding: "Violation of UNIQUE KEY constraint".

**Solution**:
1. Gunakan `MERGE` statement (sudah ada di code)
2. Jangan gunakan `INSERT` langsung untuk data yang sudah ada
3. Clear tabel: `DELETE FROM tunjangan_rate` lalu re-seed

### Issue: Rate Tidak Update

**Symptom**: Rate masih lama setelah update.

**Solution**:
1. Clear cache: `cacheService.delete('tunjangan_rates:JABATAN')`
2. Restart server jika menggunakan in-memory cache
3. Verifikasi update di database: `SELECT * FROM tunjangan_rate WHERE item_key = 'Mandor'`

---

## Referensi Terkait

- 📄 [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md) - Kalkulasi total tunjangan
- 📄 [`10_CALCULATION_FORMULAS.md`](./10_CALCULATION_FORMULAS.md) - Formula tunjangan jabatan & masa kerja
- 📄 [`09_DATABASE_SCHEMA.md`](./09_DATABASE_SCHEMA.md) - Schema tabel tunjangan_rate
- 📄 [`00_README_MAIN.md`](./00_README_MAIN.md) - Gambaran umum komponen upah

---

**Versi**: 1.0  
**Terakhir Update**: Maret 2026  
**File**: `backend/src/services/tunjanganService.ts`  
**Database**: `extend_db_ptrj.dbo.tunjangan_rate`
