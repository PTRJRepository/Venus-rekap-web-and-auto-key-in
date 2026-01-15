# Quick Start Guide - Browser Automation Engine

## 🎯 Cara Cepat Menjalankan

### 1. Pastikan sudah install dependencies
```bash
cd browser-automation-engine
npm install
```

### 2. Jalankan template Millware
```bash
node index.js template-flow
```

### 3. Yang akan terjadi:
- Browser Chrome akan terbuka otomatis
- Login ke Millware dengan akun adm075
- Handle popup login
- Navigate ke halaman Task Register
- Klik tombol "New"
- Browser akan tetap terbuka untuk inspeksi

## 🛠️ Troubleshooting

### Jika browser tidak terbuka
```powershell
# Install ulang puppeteer
npm install puppeteer --force
```

### Jika ada error "element not found"
- Website mungkin lambat, tambahkan delay di template
- Edit `templates/template-flow.json` dan tingkatkan `timeout` value

## 📝 Membuat Template Baru

1. Buat file di `templates/nama-baru.json`
2. Copy struktur dari `template-flow.json`
3. Sesuaikan steps sesuai kebutuhan
4. Jalankan: `node index.js nama-baru`

## 🔧 Configuration

Edit `.env` untuk mengubah behavior:
```env
HEADLESS=false    # true = tanpa GUI (background)
SLOW_MO=500       # Slow motion untuk debugging (ms)
SCREENSHOT=true   # Screenshot saat error
```

## 📸 Error Screenshots

Jika terjadi error, screenshot otomatis disimpan di:
```
logs/errors/error_[timestamp].png
```

## 📚 Dokumentasi Lengkap

- [README.md](../README.md) - Full documentation
- [SRS.md](dokumentasi/SRS.md) - System requirements
- [Implementation Plan](dokumentasi/implementation_plan.md) - Detail implementasi
