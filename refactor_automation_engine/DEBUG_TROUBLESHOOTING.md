# Troubleshooting Recording Issues - Automation Browser Flow Studio

## 🚨 Masalah yang Dilaporkan

1. **Browser tidak terbuka** saat recording
2. **Stuck di about:blank** - tidak sampai ke URL tujuan
3. **Duplikasi event** - event terekam berkali-kali
4. **Gagal capture dengan tepat** - selector salah/missing

---

## 🔍 Root Cause Analysis

### 1. Browser Tidak Terbuka / Stuck di about:blank

**Lokasi kode:** `backend/src/engine/Engine.ts` - method `startRecording()`

**Masalah yang terdeteksi:**

```typescript
// Saat ini di startRecording():
if (this.browser) await this.stopBrowser();  // ← Pertama-tama menutup browser
await this.startBrowser(false);               // ← Lalu bikin baru

// Tapi di startBrowser() ada check ini:
if (this.browser && this.browser.isConnected()) {
    console.log('[Engine] Closing existing browser for clean state...');
    // ... cleanup
}
```

**Permasalahan:**
- Stop dan start terlalu cepat, Chrome tidak sempat release port/profile
- Page `about:blank` default dari Puppeteer kadang tidak tertutup
- Timing issue antara stop dan start

### 2. Duplikasi Event

**Lokasi kode:** `backend/src/engine/recorder.ts` - `RECORDER_SCRIPT`

**Masalah yang terdeteksi:**

```javascript
// Deduplication ada tapi mungkin tidak cukup kuat:
const DEDUP_WINDOW = 500; // 500ms

// Masalah: 
// - 500ms masih bisa miss duplikat cepat
// - Tidak ada hash untuk konten event
// - beberapa eventype bisa overlap (click + change pada checkbox)
```

### 3. Gagal Capture Tepat

**Masalah selector:**

```javascript
// ID dengan pola ASP.NET di-filter: !el.id.match(/^ctl00/)
// Tapi ada pola lain yang juga auto-generated:
// - "_ctl", "__", "generated", dll

// Class filtering belum optimal:
// !c.includes('Mui')  ← React Material UI
// !c.match(/^css-/)   ← styled-components
// Tapi belum handle: Tailwind (tw-), Bootstrap (bs-), dll
```

---

## 🛠️ Perbaikan

### FIX 1: Browser Launch yang Lebih Robust

File: `backend/src/engine/Engine.ts`

**Ganti method `startRecording()`:**

```typescript
async startRecording(url: string) {
    // FIX: Ensure clean slate - force close and wait
    if (this.browser) {
        console.log('[Engine] Cleaning up existing browser...');
        await this.stopBrowser();
        // Wait for Chrome process to fully release resources
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // FIX: Force close any lingering Chrome processes from previous failed attempts
    try {
        const { execSync } = require('child_process');
        execSync('pkill -f "chrome.*--remote-debugging" 2>/dev/null || true');
        await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
        // Ignore errors
    }
    
    await this.startBrowser(false);
    
    if (!this.page) {
        throw new Error('Failed to create browser page');
    }

    this.onLog('🔴 Recording started', 'warn');
    
    // FIX: Longer wait for browser stability
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('[Engine] Browser ready, setting up recorder...');

    // Step 1: Expose the recording function BEFORE injecting script
    await this.page.exposeFunction('venice_record', (event: any) => {
        this.onLog(`🎥 Captured: ${event.type} on ${event.selector || url}`, 'info');
        this.onRecordEvent(event);
    });
    console.log('[Engine] venice_record function exposed');

    // Step 2: Inject recorder script to run on ALL documents
    await this.page.evaluateOnNewDocument(RECORDER_SCRIPT);
    console.log('[Engine] Recorder script scheduled for new documents');

    // FIX: Clear any existing about:blank pages
    const pages = await this.browser!.pages();
    for (const p of pages) {
        const pageUrl = await p.url();
        if (pageUrl === 'about:blank' && p !== this.page) {
            try { await p.close(); } catch(e) {}
        }
    }

    // Capture initial navigation
    this.onRecordEvent({
        type: 'navigate',
        params: { url: url },
        url: url,
        timestamp: Date.now(),
        label: `Navigate to ${url}`
    });

    let lastRecordedUrl = url;
    let isFirstNavigation = true;

    // FIX: Better frame navigation handling
    this.page.on('framenavigated', async (frame) => {
        if (frame === this.page!.mainFrame()) {
            const newUrl = frame.url();
            
            // FIX: More strict filtering - wait for actual navigation
            if (newUrl && 
                newUrl !== 'about:blank' && 
                newUrl !== 'about:srcdoc' &&
                !newUrl.startsWith('data:') &&
                !newUrl.startsWith('javascript:') &&
                newUrl !== lastRecordedUrl) {
                
                if (isFirstNavigation) {
                    isFirstNavigation = false;
                    return;
                }
                
                // FIX: Verify page is actually loaded, not intermediate
                try {
                    await this.page!.waitForFunction(() => document.readyState === 'complete', {
                        timeout: 5000
                    });
                } catch(e) {
                    // Page might still be loading, that's OK
                }
                
                lastRecordedUrl = newUrl;
                this.onLog(`🌐 Detected Navigation: ${newUrl}`, 'info');

                this.onRecordEvent({
                    type: 'navigate',
                    params: { url: newUrl },
                    url: newUrl,
                    timestamp: Date.now(),
                    label: `Navigate to ${newUrl}`
                });
            }
        }
    });

    // Step 4: Navigate to URL with better error handling
    this.onLog(`🌐 Navigating to ${url}...`, 'info');
    await this.tryNavigate(url);
    console.log('[Engine] Navigation complete');

    // Step 5: Re-inject script after navigation
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.page.evaluate(RECORDER_SCRIPT);
    console.log('[Engine] Recorder script re-injected after navigation');

    // Step 6: Verify recorder is active
    const isActive = await this.page.evaluate(() => {
        return typeof (window as any).venice_record === 'function' &&
               (window as any).veniceRecorderActive === true;
    });
    
    if (!isActive) {
        // FIX: Try injecting again with different method
        console.log('[Engine] Retrying script injection...');
        await this.page.evaluate(RECORDER_SCRIPT);
        
        const retryActive = await this.page.evaluate(() => {
            return (window as any).veniceRecorderActive === true;
        });
        
        if (!retryActive) {
            this.onLog('⚠️ Recorder may not be active - try restarting recording', 'warn');
        }
    } else {
        console.log('[Engine] Recorder verified active');
    }
}
```

### FIX 2: Perbaikan Deduplikasi Event yang Lebih Kuat

File: `backend/src/engine/recorder.ts`

**Ganti RECORDER_SCRIPT:**

```typescript
export const RECORDER_SCRIPT = `
(function() {
  // FIX: Better guard against multiple injections
  if (window.veniceRecorderActive) {
    console.log('[Recorder] Already active, skipping re-injection');
    return;
  }
  window.veniceRecorderActive = true;
  
  console.log('[Recorder] Venice Recorder Active v2');

  // FIX: Stronger deduplication with content hash
  const DEDUP_WINDOW = 100; // Reduced to 100ms for faster response
  let eventHistory = []; // Track recent events with content hash
  const MAX_HISTORY = 20; // Keep last 20 events

  function getEventHash(type, selector, value) {
    // Create simple hash of event content
    const str = type + '|' + (selector || '') + '|' + (value || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  function shouldRecord(type, selector, value) {
    const now = Date.now();
    const hash = getEventHash(type, selector, value);
    
    // Check if this exact event was recorded recently
    const recentMatch = eventHistory.find(e => 
      e.hash === hash && 
      (now - e.time) < DEDUP_WINDOW
    );
    
    if (recentMatch) {
      console.log('[Recorder] Skipping duplicate:', type, selector);
      return false;
    }
    
    // Add to history
    eventHistory.push({ type, hash, time: now, selector });
    
    // Cleanup old entries
    eventHistory = eventHistory.filter(e => (now - e.time) < 1000);
    
    // Limit history size
    if (eventHistory.length > MAX_HISTORY) {
      eventHistory.shift();
    }
    
    return true;
  }

  function getElementLabel(el) {
    if (!el) return 'unknown';
    
    // Try to find a label
    if (el.id) {
        const label = document.querySelector('label[for="' + el.id + '"]');
        if (label) return label.innerText.trim();
    }
    
    // placeholder
    if (el.placeholder) return el.placeholder;
    
    // aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    
    // data-testid
    if (el.getAttribute('data-testid')) return el.getAttribute('data-testid');
    
    // nearby text
    const prev = el.previousElementSibling;
    if (prev && prev.innerText && prev.innerText.length < 50) return prev.innerText.trim();
    
    const parent = el.parentElement;
    if (parent && parent.innerText && parent.innerText.length < 50) return parent.innerText.trim();

    // FIX: Try to get button text or link text
    if (el.tagName === 'BUTTON' || el.tagName === 'A') {
      return el.innerText.trim() || el.textContent.trim() || el.tagName.toLowerCase();
    }

    return el.tagName.toLowerCase();
  }

  function getSelector(el) {
    if (!el) return '';
    
    // 1. data-testid (most reliable)
    if (el.hasAttribute('data-testid')) {
      const val = el.getAttribute('data-testid');
      return '[data-testid="' + val + '"]';
    }
    
    // 2. ID - FIX: Better filtering of generated IDs
    if (el.id) {
      const id = el.id;
      // Skip if contains: numbers only, random, generated, ASP.NET patterns
      if (!id.match(/^\\d+$/) && 
          !id.includes('random') && 
          !id.includes('generated') &&
          !id.match(/^ctl00/) &&
          !id.match(/^__/) &&
          !id.match(/_ctl/) &&
          !id.match(/\\d{5,}/)) {
          const safeId = id.replace(/:/g, '\\\\:');
          return '#' + safeId;
      }
    }
    
    // 3. Attributes - FIX: Better uniqueness check
    const attrs = ['name', 'placeholder', 'aria-label', 'role', 'title'];
    for (const attr of attrs) {
      if (el.hasAttribute(attr)) {
        const val = el.getAttribute(attr);
        if (val && val.length > 0 && 
            !val.match(/^ctl00/) && 
            !val.match(/^__/)) {
            try {
                const matches = document.querySelectorAll('[' + attr + '="' + val + '"]');
                if (matches.length === 1) {
                    return '[' + attr + '="' + val + '"]';
                }
            } catch(e) {}
        }
      }
    }
    
    // 4. Unique Class - FIX: Better filtering
    if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ').filter(c => {
            c = c.trim();
            if (!c || c.length < 3) return false; // Too short
            
            // Filter out framework classes
            const frameworkPatterns = [
              'hover', 'active', 'focus', 'selected', 'disabled',
              'Mui', 'css-', 'tw-', 'bs-', 'ant-', 'chakra', 'v-', 
              'vue', 'ng-', 'react', 'styled', 'emotion',
              'sc-', 'a-', 'is-', 'has-'
            ];
            
            return !frameworkPatterns.some(p => c.includes(p));
        });
        
        // Try each non-framework class
        for (const cls of classes) {
            try {
                const matches = document.querySelectorAll('.' + cls);
                if (matches.length === 1) {
                    return '.' + cls;
                }
            } catch(e) {}
        }
        
        // FIX: Try combination of 2 classes if single not unique
        if (classes.length >= 2) {
          for (let i = 0; i < classes.length - 1; i++) {
            for (let j = i + 1; j < classes.length; j++) {
              const combined = '.' + classes[i] + '.' + classes[j];
              try {
                const matches = document.querySelectorAll(combined);
                if (matches.length === 1) {
                  return combined;
                }
              } catch(e) {}
            }
          }
        }
    }

    // 5. Recursive Path - FIX: More precise nth-child
    let path = [];
    let current = el;
    let depth = 0;
    const MAX_DEPTH = 6;
    
    while (current && current !== document.body && depth < MAX_DEPTH) {
      let tagName = current.tagName.toLowerCase();
      
      // Add unique attributes if available
      let uniqueAttr = '';
      if (current.id && !current.id.match(/^\\d+$/)) {
        uniqueAttr = '#' + current.id;
      } else if (current.className && typeof current.className === 'string') {
        const firstClass = current.className.split(' ').find(c => 
          c && c.length > 2 && !c.match(/hover|active|focus|Mui|css-/)
        );
        if (firstClass) uniqueAttr = '.' + firstClass;
      }
      
      let sibling = current;
      let nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.tagName.toLowerCase() === tagName) nth++;
      }
      
      const segment = tagName + uniqueAttr + (nth > 1 ? ':nth-of-type(' + nth + ')' : '');
      path.unshift(segment);
      
      current = current.parentElement;
      depth++;
    }
    
    return path.join(' > ');
  }

  // FIX: Add event throttling
  let lastEventTime = 0;
  const MIN_EVENT_INTERVAL = 50; // Minimum 50ms between events

  function throttleEvent(fn) {
    return function(e) {
      const now = Date.now();
      if (now - lastEventTime < MIN_EVENT_INTERVAL) {
        return;
      }
      lastEventTime = now;
      return fn.call(this, e);
    };
  }

  // --- EVENT LISTENERS ---

  // Click - FIX: Better element detection
  const clickHandler = function(e) {
    if(!e.isTrusted) return;
    
    // FIX: Find the actual clickable element
    let el = e.target;
    const clickableTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    const clickableRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'];
    
    // Traverse up to find clickable parent
    let depth = 0;
    while (el && depth < 5) {
      if (clickableTags.includes(el.tagName)) break;
      if (el.getAttribute && clickableRoles.includes(el.getAttribute('role'))) break;
      if (el.onclick || el.getAttribute('onclick')) break;
      el = el.parentElement;
      depth++;
    }
    
    const selector = getSelector(el);
    const label = getElementLabel(el);
    const value = el.value || el.innerText?.trim() || '';
    
    // FIX: Check for duplicate
    if (!shouldRecord('click', selector, value)) return;
    
    window.venice_record({
      type: 'click',
      selector: selector,
      label: 'Click ' + label,
      value: value,
      timestamp: Date.now(),
      params: { selector: selector }
    });
  };

  document.addEventListener('click', throttleEvent(clickHandler), true);

  // Input / Change - FIX: Better debouncing
  let inputTimeout;
  let lastInputValue = {};
  
  const inputHandler = function(e) {
    if(!e.isTrusted) return;
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') return;

    const inputType = e.target.type ? e.target.type.toLowerCase() : 'text';
    if (inputType === 'radio' || inputType === 'checkbox' || inputType === 'file') return;
    
    const selector = getSelector(e.target);
    const key = selector || e.target.name || e.target.id;
    
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
        const currentValue = e.target.value;
        
        // FIX: Don't record if value hasn't changed
        if (lastInputValue[key] === currentValue) return;
        lastInputValue[key] = currentValue;
        
        // FIX: Check for duplicate
        if (!shouldRecord('type', selector, currentValue)) return;
        
        const label = getElementLabel(e.target);

        window.venice_record({
          type: 'type',
          selector: selector,
          label: 'Type in ' + label,
          value: currentValue,
          timestamp: Date.now(),
          params: { selector: selector, value: currentValue }
        });
    }, 500); // 500ms debounce
  };

  document.addEventListener('input', inputHandler, true);

  // Change for selects - FIX: Include selected text
  const changeHandler = function(e) {
    if(!e.isTrusted) return;
    
    if (e.target.tagName === 'SELECT') {
        const selector = getSelector(e.target);
        const value = e.target.value;
        
        // FIX: Get selected option text
        const selectedOption = e.target.options[e.target.selectedIndex];
        const text = selectedOption ? selectedOption.text : value;
        
        // FIX: Check for duplicate
        if (!shouldRecord('select', selector, value)) return;
        
        const label = getElementLabel(e.target);
        
        window.venice_record({
          type: 'select',
          selector: selector,
          label: 'Select ' + label,
          value: value,
          text: text,
          timestamp: Date.now(),
          params: { selector: selector, value: value, text: text }
        });
    }
  };

  document.addEventListener('change', changeHandler, true);

  // FIX: Capture focus events for better context
  let lastFocusedSelector = null;
  document.addEventListener('focus', function(e) {
    if(!e.isTrusted) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      lastFocusedSelector = getSelector(e.target);
    }
  }, true);

})();
`;
```

### FIX 3: Perbaikan startBrowser untuk Mencegah about:blank

File: `backend/src/engine/Engine.ts`

**Ganti method `startBrowser()`:**

```typescript
async startBrowser(headless = false) {
    console.log(`[Engine] startBrowser called (headless: ${headless})`);
    
    // FIX: Always force restart for clean state
    if (this.browser) {
        console.log('[Engine] Closing existing browser for clean state...');
        try { 
            await this.browser.close(); 
            await new Promise(r => setTimeout(r, 1000)); // Wait for cleanup
        } catch (e) { 
            console.warn('[Engine] Error closing browser:', e);
        }
        this.browser = null;
        this.page = null;
    }

    this.onLog('🚀 Launching browser...', 'info');
    console.log('[Engine] Launching Puppeteer...');
    
    try {
        // FIX: Better launch options
        this.browser = await puppeteer.launch({
            headless,
            defaultViewport: null,
            // FIX: Set executable path if needed
            // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-web-security',
                '--ignore-certificate-errors',
                // FIX: Better window handling
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials'
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            // FIX: Dumpio for debugging
            dumpio: process.env.NODE_ENV === 'development'
        });
        
        console.log('[Engine] Puppeteer launched successfully');

        // FIX: Wait for browser to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get existing pages and close about:blank ones
        const pages = await this.browser.pages();
        console.log(`[Engine] Found ${pages.length} initial pages`);
        
        for (const p of pages) {
            const url = await p.url();
            console.log(`[Engine] Initial page: ${url}`);
            if (url === 'about:blank') {
                try { 
                    await p.close(); 
                    console.log('[Engine] Closed about:blank page');
                } catch(e) {}
            }
        }

        // Create new page
        this.page = await this.browser.newPage();
        
        // Set default timeout
        this.page.setDefaultTimeout(30000);
        
        // FIX: Block unnecessary resources for faster loading
        await this.page.setRequestInterception(true);
        this.page.on('request', (req) => {
            const type = req.resourceType();
            // Skip images, fonts, media during recording for faster navigation
            if (type === 'image' || type === 'font' || type === 'media') {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`[Engine] Page ready`);
        await this.page.bringToFront();
        this.onLog('✅ Browser ready', 'success');
        
    } catch (error: any) {
        console.error('[Engine] Browser launch failed:', error);
        this.onLog(`❌ Browser launch failed: ${error.message}`, 'error');
        throw error;
    }
}
```

---

## 🧪 Cara Testing Perbaikan

### 1. Test Recording Flow

```bash
cd /home/workspace/automation_browser_flow_studio/refactor_automation_engine

# Rebuild backend
cd backend
npm run build

# Restart server
npm start
```

### 2. Checklist Testing

- [ ] Klik "Start Recording" → Browser terbuka dengan benar
- [ ] URL target tercapai (bukan about:blank)
- [ ] Klik element → Terekam sekali saja (tidak duplikat)
- [ ] Type input → Terekam dengan value yang benar
- [ ] Select dropdown → Terekam dengan value dan text
- [ ] Navigasi page → Terekam event navigate dengan URL yang benar
- [ ] Stop recording → Browser menutup dengan bersih

### 3. Debug Mode

Untuk melihat detail lebih dalam, set environment variable:

```bash
cd backend
NODE_ENV=development npm start
```

Lihat log di terminal untuk melihat:
- Browser launch messages
- Recorder injection status
- Event capture log

### 4. Manual Debug dengan Chrome DevTools

1. Buka browser yang diluncurkan oleh Puppeteer
2. Buka Chrome DevTools (F12)
3. Cek Console untuk melihat log recorder
4. Cek Elements untuk melihat selector yang dihasilkan

---

## 📋 Summary Perubahan

| Masalah | Penyebab | Solusi |
|---------|----------|--------|
| Browser tidak terbuka | Timing issue stop/start | Tambah delay 1.5s + force cleanup |
| Stuck di about:blank | Page tidak tertutup | Close semua about:blank pages |
| Duplikasi event | Deduplikasi lemah | Content-based hash + throttling |
| Gagal capture | Selector buruk | Better filtering + combination classes |
| Event terlewat | Debounce terlalu lambat | 500ms optimal + value comparison |

---

## 🔄 Next Steps

Setelah menerapkan perbaikan:

1. **Test dengan target website Anda**
   - Millware: `http://millwarep3.rebinmas.com:8003/`
   - Website internal lainnya

2. **Monitor log** untuk melihat event terekam dengan benar

3. **Export dan jalankan flow** yang direkam untuk memastikan playback berfungsi

Jika masih ada masalah, cek:
- `/logs/` folder untuk error logs
- Screenshot di folder `screenshots/` untuk melihat state browser
- Console browser untuk JavaScript errors
