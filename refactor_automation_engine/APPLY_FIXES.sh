#!/bin/bash

# Script untuk menerapkan perbaikan recording ke Venus Automation Studio
# Usage: ./APPLY_FIXES.sh

echo "🔧 Venus Automation Studio - Recording Fixes"
echo "=============================================="
echo ""

cd "$(dirname "$0")"

# Check if backend exists
if [ ! -d "backend/src/engine" ]; then
    echo "❌ Error: backend/src/engine not found"
    echo "   Make sure you're running this from the refactor_automation_engine directory"
    exit 1
fi

# Backup original files
echo "📦 Creating backups..."
mkdir -p backups

if [ -f "backend/src/engine/recorder.ts" ]; then
    cp backend/src/engine/recorder.ts backups/recorder.ts.bak
    echo "   ✓ Backed up recorder.ts"
fi

if [ -f "backend/src/engine/Engine.ts" ]; then
    cp backend/src/engine/Engine.ts backups/Engine.ts.bak
    echo "   ✓ Backed up Engine.ts"
fi

echo ""
echo "🧪 Checking TypeScript compilation..."
cd backend

# Check if npm modules exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "📝 Applying fixes..."
echo ""

# Apply fixes using sed or replacement
cat > src/engine/recorder.ts << 'RECORDER_EOF'
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
RECORDER_EOF

echo "   ✓ recorder.ts updated"

# Rebuild to check for errors
echo ""
echo "🧪 Building TypeScript..."
npm run build 2>&1 | head -50

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "🚀 To start the server:"
    echo "   cd backend && npm start"
else
    echo ""
    echo "❌ Build failed. Check errors above."
    echo "   Restoring from backup..."
    
    if [ -f "../backups/recorder.ts.bak" ]; then
        cp ../backups/recorder.ts.bak src/engine/recorder.ts
        echo "   ✓ Restored recorder.ts"
    fi
fi

cd ..

echo ""
echo "=============================================="
echo "✅ Fix application complete!"
echo ""
echo "📋 Summary of changes:"
echo "   • Improved deduplication (content hash + 100ms window)"
echo "   • Better element detection for clicks"
echo "   • Enhanced selector generation"
echo "   • Added event throttling (50ms)"
echo "   • Improved debouncing with value comparison"
echo ""
echo "📝 Backups saved to: ./backups/"
echo ""
