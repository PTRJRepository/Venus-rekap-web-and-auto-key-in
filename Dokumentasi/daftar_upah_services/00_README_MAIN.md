# Dokumentasi Layanan Daftar Upah (Payroll Services)

## Gambaran Umum

Dokumentasi ini menjelaskan secara lengkap seluruh komponen layanan yang terlibat dalam perhitungan dan pengelolaan **Daftar Upah** (Payroll) di sistem Plantware Auto Report. Dokumentasi ini dirancang untuk memberikan pemahaman menyeluruh tentang bagaimana upah bersih (net salary) dihitung dari seluruh komponen tunjangan, premi, dan potongan.

## Struktur Dokumentasi

```
daftar_upah_services/
├── 00_README_MAIN.md                 # File ini - Panduan utama
├── 01_PAYROLL_SERVICE.md            # PayrollService - Kalkulasi inti
├── 02_TUNJANGAN_SERVICE.md          # TunjanganService - Tunjangan jabatan & masa kerja
├── 03_WAGES_SERVICE.md              # WagesService - Perbandingan dengan wages
├── 04_OTHER_INCOMES_SERVICE.md      # OtherIncomesService - THR & Bonus
├── 05_CARUMAN_DEFINITIONS.md        # CarumanDefinitions - BPJS & ASTEK
├── 06_UPAH_BERSIH_DETAIL_SERVICE.md # UpahBersihDetailService - Detail aktivitas
├── 07_PAYROLL_DATA_SERVICE.md       # PayrollDataService - Agregasi data
├── 08_API_ROUTES_WAGES.md           # API Routes - Endpoint wages comparison
├── 09_DATABASE_SCHEMA.md            # Database Schema - Tabel & relasi
├── 10_CALCULATION_FORMULAS.md       # Formula Perhitungan - Referensi lengkap
├── 11_LEMBUR_CALCULATION.md         # Lembur Calculator - Perhitungan lembur detail
├── 12_SQL_QUERIES_REFERENCE.md      # SQL Queries Reference - Kumpulan query lengkap
└── diagrams/                        # Diagram alur perhitungan
```

## Komponen Utama Daftar Upah

### 1. **Komponen Pendapatan (Income Components)**

| Komponen | Deskripsi | Sumber Data |
|----------|-----------|-------------|
| **Gaji Pokok** | Upah pokok berdasarkan HK × Payrate | `HR_PAYROLL.PayRate` |
| **Tunjangan Beras** | Tunjangan beras per HK | `HR_PAYROLL.RiceRation` |
| **Tunjangan Jabatan** | Tunjangan berdasarkan jabatan | `tunjangan_rate` / `PR_ADTRANS` |
| **Tunjangan Masa Kerja** | Tunjangan berdasarkan lama kerja | `HR_HISTORY` / `PR_ADTRANS` |
| **Lembur** | Upah lembur berdasarkan jam | `PR_TASKREG` |
| **Premi Brondol** | Premi loose fruit | `PR_LOOSEFRUIT_ARC` |
| **Premi Dinamis** | Premi insentif, kinerja, dll | `PR_ADTRANS_ARC` |

### 2. **Komponen Potongan (Deduction Components)**

| Komponen | Deskripsi | Persentase/Rate |
|----------|-----------|-----------------|
| **BPJS Kesehatan Pekerja** | Iuran kesehatan pekerja | 1% dari base |
| **BPJS Pensiun Pekerja** | Iuran pensiun pekerja | 1% dari base |
| **ASTEK Pekerja** | JHT Pekerja | 2% dari base |
| **SPSI** | Iuran serikat pekerja | Fixed amount |
| **PPh 21** | Pajak penghasilan | Progressif berdasarkan PTKP |
| **Koreksi** | Penyesuaian/potongan khusus | Variable |

### 3. **Formula Perhitungan Upah Bersih**

```
┌─────────────────────────────────────────────────────────────┐
│                    PERHITUNGAN DAFTAR UPAH                   │
└─────────────────────────────────────────────────────────────┘

1. GAJI POKOK = Jumlah HK × Upah Dasar (Payrate)

2. TOTAL TUNJANGAN = Beras + Jabatan + Masa Kerja + Lembur
   ├─ Tunjangan Beras = HK × RiceRation
   ├─ Tunjangan Jabatan = Fixed amount berdasarkan jabatan
   ├─ Tunjangan Masa Kerja = Fixed amount berdasarkan tahun kerja
   └─ Lembur = Σ (Jam × Rate)

3. TOTAL PREMI = Brondol + Premi Dinamis (Insentif, Kinerja, dll)

4. JUMLAH UPAH KOTOR = Gaji Pokok + Total Tunjangan + Total Premi

5. TOTAL POTONGAN = BPJS Pekerja + SPSI + PPh 21 + Koreksi
   ├─ BPJS Pekerja = (1% Kes + 1% Pensiun + 2% JHT) × Base
   ├─ Base = (Upah Dasar × 30) + Masa Kerja
   ├─ SPSI = Fixed amount
   └─ PPh 21 = Tarif progresif × (Penghasilan Bruto - PTKP)

6. UPAH BERSIH = Jumlah Upah Kotor - Total Potongan
```

## Alur Proses Perhitungan

### Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    ALUR PERHITUNGAN DAFTAR UPAH                   │
└──────────────────────────────────────────────────────────────────┘

     ┌─────────────────┐
     │  Input: Periode │
     │  (Bulan/Tahun)  │
     └────────┬────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  1. Ambil Data Karyawan │
     │     - Dari HR_EMPLOYEE  │
     │     - Dari PR_GANGLN    │
     │     - Filter by Divisi  │
     └────────┬────────────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  2. Ambil Data Absensi  │
     │     - Total HK          │
     │     - Cuti (Tahunan,    │
     │       Sakit, Minggu,    │
     │       Nasional)         │
     └────────┬────────────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  3. Ambil Payrate       │
     │     - HR_PAYROLL        │
     │     - Upah Dasar        │
     │     - RiceRation        │
     └────────┬────────────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  4. Hitung Gaji Pokok   │
     │     HK × Payrate        │
     └────────┬────────────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  5. Hitung Tunjangan    │
     │     ├─ Beras            │
     │     ├─ Jabatan          │
     │     ├─ Masa Kerja       │
     │     └─ Lembur           │
     └────────┬────────────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  6. Hitung Premi        │
     │     ├─ Brondol          │
     │     └─ Premi Dinamis    │
     └────────┬────────────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  7. Hitung Potongan     │
     │     ├─ BPJS Pekerja     │
     │     ├─ SPSI             │
     │     ├─ PPh 21           │
     │     └─ Koreksi          │
     └────────┬────────────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  8. Hitung Upah Bersih  │
     │     Kotor - Potongan    │
     └────────┬────────────────┘
              │
              ▼
     ┌─────────────────────────┐
     │  Output: Daftar Upah    │
     │  - Per Karyawan         │
     │  - Per Gang             │
     │  - Per Divisi           │
     │  - Agregat              │
     └─────────────────────────┘
```

## Services yang Terdokumentasi

### 1. **PayrollService** (`payrollService.ts`)
Service inti untuk kalkulasi payroll. Menyediakan fungsi-fungsi untuk:
- Perhitungan gaji pokok
- Perhitungan total tunjangan
- Perhitungan premi
- Perhitungan BPJS
- Perhitungan upah bersih

📄 **Lihat**: [`01_PAYROLL_SERVICE.md`](./01_PAYROLL_SERVICE.md)

### 2. **TunjanganService** (`tunjanganService.ts`)
Service untuk mengelola tunjangan jabatan dan masa kerja:
- CRUD rate tunjangan
- Seed data jabatan
- Lookup rate berdasarkan kategori

📄 **Lihat**: [`02_TUNJANGAN_SERVICE.md`](./02_TUNJANGAN_SERVICE.md)

### 3. **WagesService** (`wagesService.ts`)
Service untuk perbandingan data payroll dengan wages (penggajian):
- Perbandingan daftar upah vs wages
- Verifikasi pembayaran
- Summary perbedaan

📄 **Lihat**: [`03_WAGES_SERVICE.md`](./03_WAGES_SERVICE.md)

### 4. **OtherIncomesService** (`otherIncomesService.ts`)
Service untuk pendapatan lain di luar payroll reguler:
- THR (Tunjangan Hari Raya)
- Bonus
- Income custom

📄 **Lihat**: [`04_OTHER_INCOMES_SERVICE.md`](./04_OTHER_INCOMES_SERVICE.md)

### 5. **CarumanDefinitions** (`carumanDefinitions.ts`)
Single Source of Truth untuk semua persentase BPJS dan ASTEK:
- Definisi rate BPJS Kesehatan
- Definisi rate BPJS Pensiun
- Definisi rate ASTEK/Jamsostek
- Fungsi kalkulasi caruman

📄 **Lihat**: [`05_CARUMAN_DEFINITIONS.md`](./05_CARUMAN_DEFINITIONS.md)

### 6. **UpahBersihDetailService** (`upahBersihDetailService.ts`)
Service untuk mengambil detail aktivitas upah bersih:
- Detail lembur per karyawan
- Detail premi per karyawan
- Filter berdasarkan aktivitas

📄 **Lihat**: [`06_UPAH_BERSIH_DETAIL_SERVICE.md`](./06_UPAH_BERSIH_DETAIL_SERVICE.md)

### 7. **PayrollDataService** (`payrollDataService.ts`)
Service untuk agregasi dan fetch data payroll:
- Fetch data payroll per divisi
- Fetch data employee detail
- Mapping ke aggregation structure

📄 **Lihat**: [`07_PAYROLL_DATA_SERVICE.md`](./07_PAYROLL_DATA_SERVICE.md)

### 8. **API Routes** (`wagesRoutes.ts`)
Endpoint API untuk wages comparison:
- GET available periods
- GET wages by period
- GET employee wages history
- GET wages comparison
- GET verification summary

📄 **Lihat**: [`08_API_ROUTES_WAGES.md`](./08_API_ROUTES_WAGES.md)

### 9. **LemburCalculator** (`lemburCalculator.ts`)
Service khusus untuk perhitungan lembur (overtime):
- Perhitungan berdasarkan jenis hari (hari kerja, Minggu, libur)
- Sistem tier multiplier (1.5x, 2x, 3x, 4x)
- UPJ (Upah per Jam) calculation
- Batch calculation untuk multiple employees
- Task code breakdown

📄 **Lihat**: [`11_LEMBUR_CALCULATION.md`](./11_LEMBUR_CALCULATION.md)

### 10. **SQL Queries Reference** (`12_SQL_QUERIES_REFERENCE.md`)
Kumpulan lengkap semua query SQL yang digunakan di seluruh sistem:
- Employee & Payroll Data queries
- Attendance & Leave queries
- Overtime (Lembur) queries
- Premi & Tunjangan queries
- BPJS & Caruman queries
- Wages Comparison queries
- THR & Other Incomes queries
- History & Aggregation queries
- Complex join queries

📄 **Lihat**: [`12_SQL_QUERIES_REFERENCE.md`](./12_SQL_QUERIES_REFERENCE.md)

## Database yang Digunakan

### 1. **Database Utama** (Config.DB_PROFILE)
- `HR_EMPLOYEE` - Data karyawan
- `HR_PAYROLL` - Payrate dan rice ration
- `HR_GANGLN` - Assignment karyawan ke gang
- `PR_WAGES` / `PR_EMPWAGES` - Data wages

### 2. **Database Transaksi** (Config.DB_EXTEND_PROFILE)
- `PR_TASKREG` - Transaksi lembur
- `PR_ADTRANS` - Transaksi premi/tunjangan
- `PR_LOOSEFRUIT` - Transaksi brondol

### 3. **Database History** (Config.DB_EXTEND_TRANS_DATABASE)
- `payroll_history_header` - Header history payroll
- `payroll_history_detail` - Detail history payroll
- `history_taskreg` - History lembur
- `history_adtrans` - History premi

### 4. **Database Extended** (extend_db_ptrj)
- `tunjangan_rate` - Rate tunjangan jabatan
- `employee_other_incomes` - THR/Bonus
- `daftar_upah_aggregation_history` - Agregasi payroll

## Cara Menggunakan Dokumentasi

### Untuk Developer Baru
1. Mulai dari **00_README_MAIN.md** (file ini) untuk gambaran umum
2. Lanjut ke **10_CALCULATION_FORMULAS.md** untuk memahami formula
3. Baca **01_PAYROLL_SERVICE.md** untuk logika kalkulasi inti
4. Pelajari **09_DATABASE_SCHEMA.md** untuk struktur data

### Untuk Maintenance/Debugging
1. Gunakan **10_CALCULATION_FORMULAS.md** sebagai referensi cepat
2. Cek **05_CARUMAN_DEFINITIONS.md** untuk rate BPJS terkini
3. Lihat **09_DATABASE_SCHEMA.md** untuk query dan tabel
4. Refer ke **08_API_ROUTES_WAGES.md** untuk endpoint API

### Untuk Penambahan Fitur Baru
1. Pahami arsitektur dari **01_PAYROLL_SERVICE.md**
2. Ikuti pola yang ada di service terkait
3. Update **09_DATABASE_SCHEMA.md** jika ada perubahan schema
4. Tambahkan endpoint di **08_API_ROUTES_WAGES.md** jika perlu

## Konvensi Penamaan

### Divisi
- **Source Divisions**: P1A, P1B, P2A, P2B, DME, ARA, AB1, AB2, ARC, IJL, INF, NRS
- **Virtual Divisions**: WKS_PG, WKS_AR
- **Aliases**: PG1A→P1A, PG1B→P1B, INFRA→INF, NURSERY→NRS

### Gang Prefix
- P1A → A, P1B → B, P2A → C, P2B → D
- DME → E, ARA → F, AB1 → G, AB2 → H
- INF → I, AREC → J, IJL → L
- STF-OFFICE → O, SECURITY → SEC

### Komponen Upah
- `upah_dasar` = Payrate per HK
- `gaji_pokok` = HK × Upah Dasar
- `total_tunjangan` = Beras + Jabatan + Masa Kerja + Lembur
- `total_premi` = Brondol + Premi Dinamis
- `jumlah_upah_kotor` = Gaji Pokok + Total Tunjangan + Total Premi
- `total_potongan` = BPJS + SPSI + PPh21 + Koreksi
- `upah_bersih` = Jumlah Upah Kotor - Total Potongan

## Kontak dan Support

Untuk pertanyaan atau klarifikasi mengenai dokumentasi ini:
- 📧 Email: [Tambahkan email tim]
- 💬 Slack: [Tambahkan channel tim]
- 📝 Issue Tracker: [Tambahkan link Jira/GitHub Issues]

---

**Versi Dokumentasi**: 1.0  
**Terakhir Diupdate**: Maret 2026  
**Penulis**: Development Team
