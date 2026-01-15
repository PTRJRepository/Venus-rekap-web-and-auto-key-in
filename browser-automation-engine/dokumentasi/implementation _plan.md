

Tentu, ini adalah implementasi lengkap dari **Browser Automation Engine** menggunakan Puppeteer sesuai dengan rencana yang Anda buat. Struktur ini bersifat modular, menggunakan template JSON, dan sudah mencakup kasus spesifik untuk Millware yang Anda sebutkan.

Berikut adalah struktur folder dan kode-kodenya:

### Struktur Folder
```text
browser-automation-engine/
├── package.json
├── engine.js
├── index.js
├── utils/
│   └── selectors.js
├── actions/
│   └── index.js
└── templates/
    └── template-flow.json
```

---

### 1. `package.json`
File ini mengatur dependensi proyek.

```json
{
  "name": "browser-automation-engine",
  "version": "1.0.0",
  "description": "Modular template-based browser automation engine",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "puppeteer": "^21.0.0"
  }
}
```

---

### 2. `utils/selectors.js`
Utilitas untuk membantu pemilihan elemen (memastikan elemen siap diinteraksi).

```javascript
/**
 * Helper untuk menunggu elemen muncul dan terlihat (visible)
 */
async function waitForElement(page, selector, timeout = 5000) {
    try {
        await page.waitForSelector(selector, { visible: true, timeout });
        return true;
    } catch (error) {
        throw new Error(`Elemen ${selector} tidak ditemukan dalam ${timeout}ms`);
    }
}

/**
 * Helper untuk mengetik dengan aman (membersihkan field terlebih dahulu)
 */
async function safeType(page, selector, text) {
    await waitForElement(page, selector);
    await page.click(selector, { clickCount: 3 }); // Triple click untuk select all text
    await page.type(selector, text, { delay: 50 }); // Delay meniru ketikan manusia
}

module.exports = {
    waitForElement,
    safeType
};
```

---

### 3. `actions/index.js`
Berisi definisi aksi-aksi modular yang dapat dipanggil oleh template.

```javascript
const { waitForElement, safeType } = require('../utils/selectors');

const actions = {
    /**
     * Navigasi ke URL
     */
    navigate: async (page, params) => {
        console.log(`🔄 Navigasi ke: ${params.url}`);
        await page.goto(params.url, { waitUntil: 'networkidle2' });
    },

    /**
     * Mengetik input text
     */
    typeInput: async (page, params) => {
        console.log(`⌨️  Mengetik "${params.value}" ke elemen: ${params.selector}`);
        await safeType(page, params.selector, params.value);
    },

    /**
     * Mengklik elemen
     */
    click: async (page, params) => {
        console.log(`🖱️  Mengklik elemen: ${params.selector}`);
        await waitForElement(page, params.selector);
        await page.click(params.selector);
    },

    /**
     * Menunggu elemen spesifik muncul (misal: popup)
     */
    waitForElement: async (page, params) => {
        console.log(`⏳ Menunggu elemen: ${params.selector}`);
        await waitForElement(page, params.selector, params.timeout || 10000);
    },

    /**
     * Menunggu jeda waktu (sleep)
     */
    wait: async (page, params) => {
        const duration = params.duration || 1000;
        console.log(`💤 Menunggu selama ${duration}ms`);
        await new Promise(resolve => setTimeout(resolve, duration));
    }
};

module.exports = actions;
```

---

### 4. `engine.js`
Inti dari mesin ini. Ia membaca template dan mengeksekusi langkah-langkahnya secara berurutan.

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const actions = require('./actions');

class AutomationEngine {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    /**
     * Memulai browser
     */
    async launch() {
        console.log('🚀 Meluncurkan Browser Chrome...');
        this.browser = await puppeteer.launch({
            headless: false, // Set true jika ingin berjalan di background
            defaultViewport: null,
            args: ['--start-maximized'] // Membuka layar penuh
        });
        this.page = await this.browser.newPage();
    }

    /**
     * Memuat dan memvalidasi template JSON
     */
    loadTemplate(templateName) {
        const templatePath = path.join(__dirname, 'templates', `${templateName}.json`);
        
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template "${templateName}" tidak ditemukan di folder templates.`);
        }

        const rawTemplate = fs.readFileSync(templatePath, 'utf8');
        return JSON.parse(rawTemplate);
    }

    /**
     * Menjalankan langkah-langkah dari template
     */
    async runTemplate(templateName) {
        try {
            await this.launch();
            const template = this.loadTemplate(templateName);

            console.log(`📝 Menjalankan Template: ${template.name}`);
            console.log(`📖 Deskripsi: ${template.description}`);
            console.log('------------------------------------------------');

            const steps = template.steps;
            
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                console.log(`[Step ${i + 1}/${steps.length}] Action: ${step.action}`);

                // Cek apakah aksi ada di modul actions
                if (actions[step.action]) {
                    await actions[step.action](this.page, step.params);
                } else {
                    throw new Error(`Aksi "${step.action}" tidak dikenali.`);
                }
                
                // Jeda pendek antar langkah agar tidak terlalu cepat (opsional)
                // await new Promise(r => setTimeout(r, 500));
            }

            console.log('------------------------------------------------');
            console.log('✅ Semua langkah selesai dijalankan.');

        } catch (error) {
            console.error('❌ Terjadi kesalahan:', error.message);
            throw error;
        } finally {
            // Browser ditutup otomatis atau bisa dibiarkan terbuka untuk inspeksi
            // await this.browser.close(); 
        }
    }
}

module.exports = AutomationEngine;
```

---

### 5. `templates/template-flow.json`
Ini adalah template spesifik yang Anda minta untuk **Millware Task Register**. Sesuai instruksi, nama filenya `template-flow`.

```json
{
  "name": "Millware Absensi Task Register",
  "description": "Otomasi login dan navigasi ke menu Task Register",
  "steps": [
    {
      "action": "navigate",
      "params": {
        "url": "http://millwarep3.rebinmas.com:8003/"
      }
    },
    {
      "action": "typeInput",
      "params": {
        "selector": "#txtUsername",
        "value": "adm075"
      }
    },
    {
      "action": "typeInput",
      "params": {
        "selector": "#txtPassword",
        "value": "adm075"
      }
    },
    {
      "action": "waitForElement",
      "params": {
        "selector": ".PopupBoxLogin",
        "timeout": 10000
      }
    },
    {
      "action": "click",
      "params": {
        "selector": "#MainContent_btnOkay"
      }
    },
    {
      "action": "navigate",
      "params": {
        "url": "http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterList.aspx"
      }
    },
    {
      "action": "click",
      "params": {
        "selector": "#MainContent_btnNew"
      }
    }
  ]
}
```

---

### 6. `index.js`
Titik masuk (Entry Point) untuk menjalankan engine dari terminal.

```javascript
const AutomationEngine = require('./engine');

// Ambil nama template dari argumen command line
// Contoh penggunaan: node index.js template-flow
const templateName = process.argv[2];

if (!templateName) {
    console.error('⚠️  Harap tentukan nama template.');
    console.log('   Cara pakai: node index.js <nama-template>');
    console.log('   Contoh: node index.js template-flow');
    process.exit(1);
}

(async () => {
    const engine = new AutomationEngine();
    try {
        await engine.runTemplate(templateName);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
```

---

### Cara Menjalankan (Instruction)

1.  Pastikan Anda sudah menginstall Node.js.
2.  Buat folder `browser-automation-engine`.
3.  Buat semua file di atas sesuai dengan struktur foldernya.
4.  Buka terminal di dalam folder tersebut dan install dependensi:

    ```bash
    npm install
    ```

5.  Jalankan otomasi dengan perintah:

    ```bash
    node index.js template-flow
    ```

### Penjelasan Logika pada Template Millware:

1.  **Navigate:** Membuka halaman login.
2.  **TypeInput (Username):** Mengisi `#txtUsername` dengan `adm075`. Fungsi `safeType` akan melakukan klik 3x (select all) sebelum mengetik untuk memastikan input bersih.
3.  **TypeInput (Password):** Mengisi `#txtPassword` dengan `adm075`.
4.  **WaitForElement:** Script akan **pause** sampai menemukan elemen `.PopupBoxLogin`. Ini penting agar tidak gagal saat klik tombol OK jika popup belum muncul.
5.  **Click:** Mengklik tombol OK (`#MainContent_btnOkay`) di dalam popup tersebut.
6.  **Navigate:** Melanjutkan langsung ke halaman daftar Task Register.
7.  **Click:** Mengklik tombol New (`#MainContent_btnNew`).

Engine ini sudah modular. Jika Anda ingin membuat flow lain, Anda cukup membuat file JSON baru di folder `templates` tanpa mengubah kode program (`engine.js` atau `actions/index.js`).