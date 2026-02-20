

Tentu, ini adalah **System Requirements Specification (SRS)** dan dokumentasi proyek yang rapi, serta panduan langkah demi langkah untuk meng-upgrade project ini menjadi tingkat **Enterprise Grade**.

---

# 1. System Requirements Specification (SRS)

Dokumen ini mendefinisikan persyaratan teknis untuk menjalankan *Browser Automation Engine*.

### 1.1 Persyaratan Hardware (Minimum)
*   **CPU:** Prosesor Dual-core (2 vCPU) atau lebih. (Chrome sangat berat di CPU).
*   **RAM:** Minimal 4 GB (Direkomendasikan 8 GB ke atas jika menjalankan banyak tab/instance).
*   **Storage:** Minimal 2 GB ruang kosong (untuk cache browser, logs, dan dependensi Node.js).

### 1.2 Persyaratan Software
*   **Operating System:**
    *   Windows 10/11 / Windows Server 2019+
    *   Linux (Ubuntu 20.04 LTS / Debian 10+) - *Disarankan untuk produksi.*
    *   macOS (Big Sur atau lebih baru)
*   **Runtime:**
    *   Node.js (Versi LTS terbaru, misal v18.x atau v20.x).
    *   NPM (Biasanya terinstal otomatis dengan Node.js) atau Yarn.
*   **Browser Dependencies:**
    *   Puppeteer akan mendownload Chromium otomatis saat `npm install`, namun membutuhkan library sistem Linux seperti `gconf-service`, `libnss3`, dll (jika di Linux).
*   **Tools (Opsional tapi disarankan):**
    *   Git (untuk version control).
    *   Docker (untuk containerization).

### 1.3 Persyaratan Jaringan
*   Koneksi internet stabil.
*   Akses keluar (outbound) ke URL target (Millware, dll).
*   Port yang tidak diblokir (Puppeteer menggunakan port acak untuk debugging WebSocket).

---

# 2. Dokumentasi Proyek

Berikut adalah panduan cara kerja, instalasi, dan penggunaan sistem secara sistematis.

### 2.1 Struktur Project
```text
browser-automation-engine/
│
├── engine.js              # Otak dari sistem (Controller)
├── index.js               # Entry point (CLI)
├── package.json           # Definisi dependensi
│
├── actions/               # Modul tindakan (Reusable Logic)
│   └── index.js           # Daftar fungsi: navigate, click, type, etc.
│
├── utils/                 # Helper functions
│   └── selectors.js       # Fungsi utilitas untuk seleksi elemen DOM
│
└── templates/             # Folder untuk menyimpan flow otomasi
    └── template-flow.json # Contoh konfigurasi kasus Millware
```

### 2.2 Panduan Instalasi
1.  Clone atau download repository.
2.  Buka terminal di folder proyek.
3.  Install dependensi:
    ```bash
    npm install
    ```
4.  Pastikan instalasi sukses dan folder `node_modules` terbentuk.

### 2.3 Cara Membuat Template Baru
1.  Buka folder `templates`.
2.  Buat file baru berekstensi `.json` (contoh: `register-user.json`).
3.  Struktur JSON wajib mengikuti format ini:
    ```json
    {
      "name": "Nama Proses",
      "description": "Penjelasan singkat",
      "steps": [
        {
          "action": "nama_aksi",
          "params": {
            "selector": "css_selector",
            "value": "data input",
            "url": "http://url.target.com"
          }
        }
      ]
    }
    ```
4.  Referensi aksi yang tersedia (didefinisikan di `actions/index.js`):
    *   `navigate`: Buka halaman (`params.url`).
    *   `typeInput`: Isi text (`params.selector`, `params.value`).
    *   `click`: Klik tombol/link (`params.selector`).
    *   `waitForElement`: Tunggu elemen muncul (`params.selector`, `params.timeout`).
    *   `wait`: Jeda waktu (`params.duration` ms).

### 2.4 Cara Menjalankan
Buka terminal, jalankan perintah berikut:
```bash
node index.js nama_template
```
*Contoh:*
```bash
node index.js template-flow
```

---

# 3. Roadmap ke "Enterprise Grade"

Agar project ini bukan hanya sekadar script otomasi biasa, melainkan sistem yang tangguh, aman, dan bisa di-scale (Enterprise Grade), berikut adalah rekomendasi dan saran implementasi:

### 3.1 Keamanan (Security) & Credential Management
**Masalah:** Saat ini, password `adm075` disimpan di dalam file JSON (`templates`). Ini sangat berbahaya (hardcoded credentials).
**Solusi Enterprise:**
1.  **Environment Variables:** Jangan simpan password di JSON. Gunakan `.env`.
    *   Ubah template jadi: `"value": "${MILLWARE_PASS}"`
    *   Gunakan library `dotenv` di Node.js untuk membaca variabel tersebut.
2.  **Vault Integration:** Untuk level perusahaan, gunakan tool seperti *HashiCorp Vault* atau *AWS Secrets Manager* untuk menyimpan password secara dinamis dan rotasi password otomatis.

### 3.2 Scalability & Concurrency (Antrian & Worker)
**Masalah:** `index.js` saat ini menjalankan satu proses per satu (synchronous). Jika ada 100 proses, browser akan macet.
**Solusi Enterprise:**
1.  **Job Queue System:** Pisahkan "Penerima Request" dan "Pelaksana Tugas". Gunakan Redis + Bull/BullMQ.
    *   User kirim request -> Masuk ke Antrian (Queue).
    *   Worker (Server lain) mengambil dari antrian satu per satu untuk dijalankan.
2.  **Docker & Kubernetes:**
    *   Bungup aplikasi dalam **Docker Container**. Ini memastikan environment sama di mana-mana.
    *   Gunakan **Kubernetes (K8s)** untuk men-scaling Worker secara otomatis jika antrian membludak (Auto-scaling).

### 3.3 Observability (Monitoring & Logging)
**Masalah:** Jika script gagal, kita hanya melihat `console.log` yang hilang begitu saja. Kita tidak tahu *kenapa* gagal (apakah network lambat? elemen tidak ditemukan?).
**Solusi Enterprise:**
1.  **Structured Logging:** Ganti `console.log` dengan library seperti **Winston** atau **Pino**. Log harus berformat JSON dan dikirim ke sistem log sentral (seperti ELK Stack, Splunk, atau Datadog).
2.  **Evidence on Failure:** Saat error terjadi, engine harus otomatis mengambil **Screenshot** dan merekam **Video** sesi browser tersebut, lalu menyimpannya di AWS S3 atau Google Cloud Storage untuk audit.

### 3.4 Reliability (Keandalan)
**Masalah:** Jaringan internet sering putus atau server target *down* sesaat.
**Solusi Enterprise:**
1.  **Retry Mechanism:** Implementasikan logika *retry* cerdas. Jika gagal klik karena elemen belum siap, coba ulang 3 kali dengan jeda 2 detik sebelum dianggap gagal total.
2.  **Headless Mode:** Saat di server produksi, jalankan browser dalam mode `headless: true` agar tidak memakan resource GUI (Graphical User Interface).

### 3.5 Code Quality & Tech Stack
**Masalah:** JavaScript murni (Vanilla JS) rentan terhadap kesalahan *typo* dan sulit di-maintain saat tim berkembang.
**Solusi Enterprise:**
1.  **Migrasi ke TypeScript:** Gunakan TypeScript agar ada *type checking*. Ini mencegah bug sebelum kode dijalankan dan membuat kode lebih mudah dibaca tim.
2.  **Testing:** Buat unit test menggunakan **Jest** untuk setiap fungsi di `actions/` dan `utils/`.
3.  **Anti-Detection:** Banyak situs modern yang memblokir Puppeteer. Gunakan library **`puppeteer-extra`** dengan plugin **`puppeteer-extra-plugin-stealth`** agar browser terlihat seperti manusia asli (bukan bot).

### Contoh Implementasi Sederhana: Menambahkan Screenshot saat Error
Di dalam `engine.js`, pada blok `catch`, tambahkan logika ini:

```javascript
} catch (error) {
    console.error('❌ Terjadi kesalahan:', error.message);
    
    // Enterprise Feature: Ambil bukti error
    const timestamp = new Date().getTime();
    await this.page.screenshot({ 
        path: `logs/errors/error_${timestamp}.png`,
        fullPage: true 
    });
    
    throw error;
}
```

Dengan menerapkan poin-poin di atas, mesin otomasi Anda akan berubah dari sekadar "script helper" menjadi **Platform Automation** yang profesional.