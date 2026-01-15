# Browser Automation Engine

Mesin otomasi browser modular berbasis template menggunakan Puppeteer untuk Chrome automation.

## 🎯 Fitur

- **Modular Actions**: Sistem aksi yang dapat digunakan kembali (navigate, click, type, wait, dll)
- **Template-Based**: Definisi flow otomasi dalam file JSON yang mudah dibuat dan di-maintain
- **Error Handling**: Screenshot otomatis saat terjadi error untuk debugging
- **Configurable**: Konfigurasi melalui environment variables
- **Enterprise-Ready**: Siap untuk dikembangkan ke production dengan logging, retry mechanism, dll

## 📁 Struktur Project

```
browser-automation-engine/
│
├── engine.js              # Core automation engine
├── index.js               # Entry point (CLI)
├── package.json           # Dependencies
│
├── actions/               # Modular action definitions
│   └── index.js           # navigate, click, type, wait, dll
│
├── utils/                 # Helper functions
│   └── selectors.js       # Selector utilities & screenshot
│
├── templates/             # Automation flow templates
│   └── template-flow.json # Millware task register flow
│
├── logs/                  # Error logs & screenshots
│   └── errors/
│
└── dokumentasi/           # Documentation
    ├── SRS.md             # System Requirements Specification
    └── implementation_plan.md
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Template

```bash
node index.js template-flow
```

## 📝 Membuat Template Baru

Buat file JSON baru di folder `templates/`:

```json
{
  "name": "Nama Template",
  "description": "Deskripsi singkat",
  "steps": [
    {
      "action": "navigate",
      "params": {
        "url": "https://example.com"
      }
    },
    {
      "action": "typeInput",
      "params": {
        "selector": "#username",
        "value": "myusername"
      }
    },
    {
      "action": "click",
      "params": {
        "selector": "#submit-btn"
      }
    }
  ]
}
```

## 🎮 Available Actions

### Basic Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `navigate` | Buka halaman | `url` |
| `typeInput` | Ketik text ke input field | `selector`, `value` |
| `click` | Klik elemen | `selector`, `timeout` (optional) |
| `waitForElement` | Tunggu elemen muncul | `selector`, `timeout` (optional) |
| `wait` | Jeda/sleep | `duration` (ms) |
| `screenshot` | Ambil screenshot | `filename`, `fullPage` |
| `submit` | Submit form | `selector` |
| `pressKey` | Tekan keyboard | `key` (Enter, Tab, etc) |
| `log` | Debug logging | `message`, `value` |

### Loop & Data Actions (NEW!)

| Action | Description | Parameters |
|--------|-------------|------------|
| `forEach` | Loop array data | `items`, `itemName`, `steps` |
| `forEachProperty` | Loop object properties | `object`, `keyName`, `valueName`, `steps` |
| `if` | Conditional execution | `condition`, `thenSteps`, `elseSteps` |

📖 **Panduan lengkap looping**: Lihat [LOOP_GUIDE.md](LOOP_GUIDE.md)

## ⚙️ Configuration

Copy `.env.example` menjadi `.env` dan sesuaikan:

```bash
# Jalankan headless (tanpa GUI)
HEADLESS=false

# Slow motion (ms) - berguna untuk debugging
SLOW_MO=100

# Screenshot on error
SCREENSHOT=true
```

## 📋 Template Millware Task Register

Template `template-flow.json` mengotomasi:

1. ✅ Login ke Millware (http://millwarep3.rebinmas.com:8003/)
2. ✅ Isi username: adm075
3. ✅ Isi password: adm075
4. ✅ Tunggu popup login muncul
5. ✅ Klik tombol OK
6. ✅ Navigate ke halaman Task Register List
7. ✅ Klik tombol "New"

## 🔧 Troubleshooting

### Browser tidak terbuka
- Pastikan Puppeteer sudah terinstall: `npm install puppeteer`
- Di Linux, install dependencies: `sudo apt-get install -y libgbm-dev`

### Element tidak ditemukan
- Cek selector di browser developer tools (F12)
- Tambahkan `wait` action sebelum `click` jika perlu
- Tingkatkan `timeout` di parameter action

### Screenshot error tidak tersimpan
- Pastikan folder `logs/errors/` memiliki write permission

## 🚀 Roadmap Enterprise Features

Lihat [dokumentasi/SRS.md](dokumentasi/SRS.md) untuk:
- Security & Credential Management (Vault integration)
- Scalability (Job Queue, Docker, Kubernetes)
- Observability (Structured logging, ELK Stack)
- Reliability (Retry mechanism, Anti-detection)
- Code Quality (TypeScript migration, Testing)

## 📄 License

ISC

## 👨‍💻 Author

Created for Rebinmas automation needs.
