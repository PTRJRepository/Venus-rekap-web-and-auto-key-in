# Attendance Input - Template Usage

## ✅ Template Siap Pakai: `attendance-input-loop`

Template ini akan:
1. Login ke Millware
2. Loop setiap employee dalam JSON
3. Loop setiap tanggal dalam attendance
4. Input data regular (7 jam) untuk setiap hari hadir
5. Input data overtime (sesuai jam) jika ada
6. **Klik tombol Add** setelah setiap input

## 🚀 Cara Menjalankan

```bash
node index.js attendance-input-loop
```

**Catatan:** Harus ketik nama yang benar: `attendance-input-loop` (bukan `attance` atau `attandance`)

## 📍 Checkpoint URL

Template akan mulai dalam mode loop ketika sudah berada di:
- URL List: `http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterList.aspx`
- Setiap klik "New" akan membuka form detail di: `...frmPrTrxTaskRegisterDet.aspx`

## 🔄 Alur Loop

```
forEach Employee
  ├─ Employee: Adyka (POM00213)
  │
  └─ forEachProperty Attendance (per tanggal)
      │
      ├─ 2025-12-01 (Status: Hadir, OT: 2h)
      │   ├─ Klik New
      │   ├─ Input tanggal: 2025-12-01
      │   ├─ Input employee: POM00213
      │   ├─ Pilih Normal
      │   ├─ Input 7.0 jam
      │   ├─ **Klik Add** ← IMPORTANT!
      │   │
      │   ├─ Klik New (untuk OT)
      │   ├─ Input tanggal: 2025-12-01
      │   ├─ Input employee: POM00213
      │   ├─ Pilih Overtime
      │   ├─ Input 2 jam
      │   └─ **Klik Add** ← IMPORTANT!
      │
      ├─ 2025-12-02 (Status: Hadir, OT: 2h)
      │   └─ (sama seperti di atas)
      │
      └─ ... dst untuk semua tanggal
```

## ⚙️ Yang Sudah Diperbaiki

1. ✅ Conditional logic sekarang check `attendance.status` (bukan `regularHours` yang null)
2. ✅ Tombol **Add** (`#MainContent_btnAdd`) diklik setelah setiap input
3. ✅ Wait time ditambahkan untuk stabilitas (terutama setelah autocomplete)
4. ✅ Log lebih informatif dengan status attendance

## 📝 TODO: ChargeJob Parsing

Template saat ini belum parse ChargeJob yang menggunakan delimiter `/`. 

Data ChargeJob:
```
(GA9010) VEHICLE RUNNING / BE001 ((XGMA1) Whell Loader) / 11 (DRIVER WAGES)
```

Perlu di-split dan diinput ke field-field yang berbeda sesuai urutan.

## 🐛 Debugging

Jika ada masalah, aktifkan log dengan membaca output console. Setiap step akan menampilkan:
- Employee yang sedang diproses
- Tanggal dan status attendance
- Action yang dilakukan

Browser akan tetap terbuka setelah selesai untuk inspeksi manual.
