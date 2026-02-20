# Fix Browser About:Blank Issue

## Penyebab
Browser terbuka tapi hanya about:blank karena:
1. Node `navigate` tidak terhubung ke node `start`
2. URL di parameter navigate kosong
3. Tidak ada node navigate sama sekali

## Cara Cek Flow

1. Buka file flow yang direcord (file `.flow.json`)
2. Cek apakah ada node dengan `actionType: "navigate"`
3. Cek apakah navigate punya `params.url` yang terisi
4. Cek apakah ada edge dari `start` ke node navigate

## Contoh Flow yang Benar

```json
{
  "nodes": [
    {
      "id": "start-1",
      "type": "actionNode",
      "data": {
        "actionType": "start",
        "params": {}
      }
    },
    {
      "id": "navigate-xxx",
      "type": "actionNode",
      "data": {
        "actionType": "navigate",
        "params": {
          "url": "http://millwarep3.rebinmas.com:8003/"
        }
      }
    }
  ],
  "edges": [
    {
      "source": "start-1",
      "target": "navigate-xxx"
    }
  ]
}
```

## Quick Fix

Jika flow yang direcord tidak punya navigate, tambahkan manual di Flow Editor:

1. Drag "Navigate" dari sidebar
2. Isi URL target
3. Hubungkan dari node Start ke Navigate
4. Hubungkan Navigate ke node berikutnya

## Debug dengan Script

Jalankan di terminal:
```bash
node debug_flow.js nama-flow.flow.json
```

Script akan menunjukkan:
- Execution chain
- Apakah navigate terhubung
- Apakah URL navigate terisi
