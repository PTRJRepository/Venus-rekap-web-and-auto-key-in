# DocDesc & Component Mapping Data (Real Data 2026)

Dokumen ini berisi variasi nyata (real data) dari database Millware dan Venus sepanjang tahun 2026. Digunakan sebagai referensi untuk membuat sistem Auto Key-In.

## 1. Data Transaksi Millware (PR_ADTRANS)

Berikut adalah kombinasi `DocDesc` (Inputan Header Millware), `ADCode` (`TaskCode` di detail Millware), dan `TaskDesc` (Master Deskripsi Task) yang pernah digunakan:

### Kategori: Lainnya / Tidak Dikenali
| DocDesc (Input Header) | ADCode (TaskCode) | TaskDesc (Master Deskripsi) |
|---|---|---|
| *(KOSONG)* | AL0011 | TUNJANGAN TRANSPORT |
| TUNJANGAN TRANSPORT | AL0011 | TUNJANGAN TRANSPORT |

### Kategori: Potongan Lain
| DocDesc (Input Header) | ADCode (TaskCode) | TaskDesc (Master Deskripsi) |
|---|---|---|
| POTONGAN BPJS TAMBAHAN | DEGA9110 | Potongan Gaji |
| POTONGAN GAJI | DEGA9110 | Potongan Gaji |

### Kategori: Potongan PPh21
| DocDesc (Input Header) | ADCode (TaskCode) | TaskDesc (Master Deskripsi) |
|---|---|---|
| *(KOSONG)* | DEPH21 | (DE) POTONGAN PPH21 |
| PENGEMBALIAN PPH 21 | AL0009 | TUNJANGAN STAFF |
| PENGEMBALIAN PPH 21 | AL0019 | (AL) TUNJANGAN LEMBUR |
| PPH 21 | DEPH21 | (DE) POTONGAN PPH21 |

### Kategori: Potongan SPSI
| DocDesc (Input Header) | ADCode (TaskCode) | TaskDesc (Master Deskripsi) |
|---|---|---|
| (DE0003) (DE) POTONGAN SPSI | DE0003 | (DE) POTONGAN SPSI |

### Kategori: Tunjangan Jabatan
| DocDesc (Input Header) | ADCode (TaskCode) | TaskDesc (Master Deskripsi) |
|---|---|---|
| *(KOSONG)* | GA9128 | (AL) PERSONNEL TUNJANGAN JABATAN |
| TUNJANGAN JABATAN | GA9128 | (AL) PERSONNEL TUNJANGAN JABATAN |

### Kategori: Tunjangan Lembur
| DocDesc (Input Header) | ADCode (TaskCode) | TaskDesc (Master Deskripsi) |
|---|---|---|
| TUNJANGAN LEMBUR | AL0019 | (AL) TUNJANGAN LEMBUR |

### Kategori: Tunjangan Masa Kerja
| DocDesc (Input Header) | ADCode (TaskCode) | TaskDesc (Master Deskripsi) |
|---|---|---|
| TUNJANGAN MASA KERJA | DEPH21 | (DE) POTONGAN PPH21 |
| TUNJANGAN MASA KERJA | GA9129 | (AL) PERSONNEL TUNJANGAN MASA KERJA |

## 2. Data Komponen Venus (HR_T_PYWeekly_DComponent)

Berikut adalah daftar semua komponen Upah/Gaji yang dihasilkan oleh sistem payroll Venus:

| Tipe | Kode Komponen | Nama Komponen (PYCompName) | Take Home Pay? |
|---|---|---|---|
| Addition | #BNS# | BONUS | Tidak |
| Addition | #KES_TP# | BPJS KESEHATAN DITANGGUNG PERUSAHAAN | Tidak |
| Addition | #GP# | GAJI POKOK | Ya |
| Addition | #JHT_TP# | JAMINAN HARI TUA DITANGGUNG PERUSAHAAN | Tidak |
| Addition | #JKK# | JAMINAN KECELAKAAN KERJA | Tidak |
| Addition | #JKM# | JAMINAN KEMATIAN | Tidak |
| Addition | #JP_TP# | JAMINAN PENSIUN DITANGGUNG PERUSAHAAN | Tidak |
| Addition | #OT1# | OT Jam ke 1 | Ya |
| Addition | #OT2# | OT Jam ke 2 | Ya |
| Addition | #OT3# | OT Jam ke 3 | Ya |
| Addition | #OT4# | OT Jam ke 4 | Ya |
| Addition | TTHF | TUNGJANGAN TRANSPORT HARIAN | Ya |
| Addition | #TJ_BERAS# | TUNJANGAN BERAS | Ya |
| Addition | #TJ_JABATAN# | TUNJANGAN JABATAN | Ya |
| Addition | #TJ_LAIN# | TUNJANGAN LAIN-LAIN | Ya |
| Addition | #TJ_MASAKERJA# | TUNJANGAN MASA KERJA | Ya |
| Addition | #TPRF# | TUNJANGAN PREMI RIT | Ya |
| Addition | #TJ_TRANSPORT# | TUNJANGAN TRANSPORT | Ya |
| Deduction | #KES_TK# | BPJS KESEHATAN DITANGGUNG KARYAWAN | Ya |
| Deduction | #TK_TK# | BPJS TK DITANGGUNG KARYAWAN | Ya |
| Deduction | #JP_TK# | JAMINAN PENSIUN DITANGGUNG KARYAWAN | Ya |
| Deduction | #LOAN1# | PINJAMAN PRIBADI | Ya |
| Deduction | #POT_ABSEN# | POTONGAN ABSEN | Ya |
| Deduction | #POT_BPJS# | POTONGAN BPJS TAMBAHAN | Ya |
| Deduction | #POT_LAIN# | POTONGAN LAIN-LAIN | Ya |
| Deduction | #POT_SPSI# | POTONGAN SPSI | Ya |
| Deduction | #POT_TELAT1# | POTONGAN TERLAMBAT | Ya |
| Deduction | #PPH21_DIPTG# | PPH21 DIPOTONG | Ya |


