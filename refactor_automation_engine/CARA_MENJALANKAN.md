# 🚀 Cara Menjalankan Venus Automation Studio

## ⚡ Quick Start

### 1. Start Backend Server

**Cara Termudah - Double-click:**
```
refactor_automation_engine/start-backend.bat
```

**Atau manual:**
```bash
cd refactor_automation_engine/backend
npm install
npx tsx src/index.ts
```

**Output yang diharapkan:**
```
🚀 Server running on port 5001
📁 Templates directory: D:\...\templates
```

---

### 2. Start Frontend

**Terminal baru:**
```bash
cd refactor_automation_engine/frontend
npm install
npm run dev
```

**Output yang diharapkan:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

### 3. Buka Browser

Buka: **http://localhost:5173**

---

## 📝 Cara Mengedit dan Save Template

### **Metode 1: Edit di Flow Editor (Recommended)**

1. **Import Template:**
   - Klik tombol **"📥 Import"** di toolbar
   - Pilih template yang ada (misal: `millware-attendance`)
   - Template akan dimuat ke canvas

2. **Edit Node:**
   - Klik node di canvas
   - Edit properties di panel sebelah kanan
   - Contoh: ubah "Text Value" di node "Type Text"

3. **Save Perubahan:**
   - Klik **"💾 Save to Template"** (tombol biru di toolbar)
   - Template akan di-**overwrite** dengan perubahan Anda
   - File tersimpan di: `refactor_automation_engine/templates/`

---

### **Metode 2: Edit Manual File JSON**

1. **Buka file template:**
   ```
   refactor_automation_engine/templates/millware-attendance.flow.json
   ```

2. **Edit dengan text editor** (VS Code, Notepad++, dll)

3. **Edit node params:**
   ```json
   {
     "nodes": [
       {
         "id": "node-123",
         "type": "actionNode",
         "data": {
           "actionType": "type",
           "params": {
             "selector": "#username",
             "value": "admin"  ← Edit ini
           }
         }
       }
     ]
   }
   ```

4. **Save file** (Ctrl+S)

5. **Refresh browser** untuk melihat perubahan

---

## 🔧 Troubleshooting

### **Error: `GET http://localhost:5001/socket.io/... ERR_CONNECTION_REFUSED`**

**Solusi:** Backend belum running
```bash
cd refactor_automation_engine/backend
npx tsx src/index.ts
```

---

### **Error: `GET http://localhost:5174/api/templates 500`**

**Solusi:** 
1. Pastikan backend running di port 5001
2. Check console backend untuk error detail
3. Pastikan folder `templates` ada

---

### **Node properties tidak bisa diedit (hanya huruf terakhir)**

**Sudah diperbaiki!** Tapi jika masih terjadi:

1. **Clear browser cache:** Ctrl+Shift+R
2. **Restart frontend:**
   ```bash
   # Ctrl+C di terminal frontend
   npm run dev
   ```

---

### **Template tidak muncul di Import dialog**

**Solusi:**
1. Pastikan file ada di folder yang benar:
   ```
   refactor_automation_engine/templates/*.flow.json
   ```
2. Refresh browser (F5)
3. Check backend log untuk error

---

## 📂 Struktur Folder

```
refactor_automation_engine/
├── backend/
│   ├── src/
│   │   └── index.ts          ← Server Express (port 5001)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FlowEditor.tsx
│   │   │   ├── PropertiesPanel.tsx  ← Editor node properties
│   │   │   ├── Sidebar.tsx          ← Sidebar (editable defaults)
│   │   │   └── Toolbar.tsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
├── templates/                 ← Template JSON files
│   ├── millware-attendance.flow.json
│   ├── millware-overtime-only.flow.json
│   └── web-scraper.json
├── start-backend.bat          ← Quick start backend
└── run.js                     ← Standalone runner
```

---

## 🎯 Tips

### **Edit Default Values di Sidebar:**
1. Double-click node di Sidebar
2. Edit default values
3. Drag node ke canvas → nilai default sudah ter-set

### **Variable Substitution:**
Gunakan syntax `${variable}` di text fields:
- `${employee.name}` - nama karyawan
- `${date}` - tanggal
- `${formattedDate}` - tanggal format dd/mm/yyyy

### **Save Template dengan Nama Baru:**
1. Edit flow
2. Ubah nama di toolbar (misal: "My Custom Flow")
3. Klik "Save to Template"
4. File baru: `my-custom-flow.flow.json`

---

## 📞 Support

Jika masih ada masalah:
1. Screenshot error di browser console (F12)
2. Screenshot backend log
3. Share ke developer
