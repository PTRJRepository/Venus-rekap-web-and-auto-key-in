export const RECORDER_SCRIPT = `
(function() {
  if (window.veniceRecorderActive) return;
  window.veniceRecorderActive = true;

  console.log('🎥 Venice Recorder Active');

  // FIX: Event deduplication to prevent duplicate events
  const DEDUP_WINDOW = 500; // 500ms window
  let lastEventType = null;
  let lastEventTime = 0;
  let lastEventSelector = null;

  function shouldRecord(type, selector) {
    const now = Date.now();
    const isDuplicate = 
      lastEventType === type &&
      lastEventTime > 0 &&
      (now - lastEventTime) < DEDUP_WINDOW &&
      lastEventSelector === selector;
    
    if (isDuplicate) {
      console.log('[Recorder] Skipping duplicate event:', type, selector);
      return false;
    }
    
    lastEventType = type;
    lastEventTime = now;
    lastEventSelector = selector;
    return true;
  }

  function getElementLabel(el) {
    // Try to find a label or some descriptive text nearby
    if (el.id) {
        const label = document.querySelector(\`label[for="\${el.id}"]\`);
        if (label) return label.innerText.trim();
    }
    
    // placeholder
    if (el.placeholder) return el.placeholder;
    
    // aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    
    // data-testid (most reliable for automation)
    if (el.getAttribute('data-testid')) return el.getAttribute('data-testid');
    
    // nearby text (e.g. previous sibling or parent header)
    const prev = el.previousElementSibling;
    if (prev && prev.innerText && prev.innerText.length < 50) return prev.innerText.trim();
    
    const parent = el.parentElement;
    if (parent && parent.innerText && parent.innerText.length < 50) return parent.innerText.trim();

    return el.tagName.toLowerCase();
  }

  function getSelector(el) {
    if (!el) return '';
    
    // FIX: Improved selector generation with priority
    
    // 1. data-testid (most reliable for automation)
    if (el.hasAttribute('data-testid')) {
      const val = el.getAttribute('data-testid');
      return \`[data-testid="\${val}"]\`;
    }
    
    // 2. ID (but skip random/generated IDs and ASP.NET auto-generated IDs)
    if (el.id && !el.id.includes('random') && !el.id.match(/\d{5,}/) && !el.id.match(/^ctl00/)) {
        const safeId = el.id.replace(/:/g, '\\:');
        return '#' + safeId;
    }
    
    // 3. Attributes (name, placeholder, aria-label, role) - only if unique
    const attrs = ['name', 'placeholder', 'aria-label', 'data-testid', 'role'];
    for (const attr of attrs) {
      if (el.hasAttribute(attr)) {
        const val = el.getAttribute(attr);
        if (val && val.length > 0 && !val.match(/^ctl00/)) {
            // Check if unique
            try {
                if (document.querySelectorAll(\`[\${attr}="\${val}"]\`).length === 1) {
                    return \`[\${attr}="\${val}"]\`;
                }
            } catch(e) {}
        }
      }
    }
    
    // 4. Unique Class - be more selective, filter out framework classes
    if (el.className && typeof el.className === 'string' && el.className.split(' ').length > 0) {
        const classes = el.className.split(' ').filter(c => 
            c.trim().length > 0 && 
            !c.includes('hover') && 
            !c.includes('active') &&
            !c.includes('Mui') &&
            !c.match(/^css-/)
        );
        for(const cls of classes) {
            try {
                if(document.querySelectorAll('.' + cls).length === 1) {
                    return '.' + cls;
                }
            } catch(e) {}
        }
    }

    // 5. Recursive Path with nth-child for precision
    let path = [];
    let current = el;
    while (current && current !== document.body) {
      let tagName = current.tagName.toLowerCase();
      let sibling = current;
      let nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.tagName.toLowerCase() === tagName) nth++;
      }
      path.unshift(tagName + (nth > 1 ? \`:nth-of-type(\${nth})\` : ''));
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  // EVENT LISTENERS //

  // Click
  document.addEventListener('click', (e) => {
    if(!e.isTrusted) return; 
    const el = e.target.closest('button, a, input, [role="button"]') || e.target;
    const selector = getSelector(el);
    const label = getElementLabel(el);
    
    // FIX: Check for duplicate before recording
    if (!shouldRecord('click', selector)) return;
    
    window.venice_record({
      type: 'click',
      selector: selector,
      label: 'Click ' + label,
      timestamp: Date.now()
    });
  }, true);

  // Input / Change (Debounced)
  // IMPORTANT: Radio buttons and checkboxes should NOT trigger type recording
  // They are handled exclusively by click event
  let inputTimeout;
  document.addEventListener('input', (e) => {
    if(!e.isTrusted) return;
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') return;

    // Skip radio buttons and checkboxes - they only use click, not type
    const inputType = e.target.type?.toLowerCase();
    if (inputType === 'radio' || inputType === 'checkbox') return;
    
    // FIX: Check for duplicate before recording
    const selector = getSelector(e.target);
    if (!shouldRecord('type', selector)) return;
    
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
        const label = getElementLabel(e.target);

        window.venice_record({
          type: 'type',
          selector: selector,
          label: 'Type in ' + label,
          value: e.target.value,
          timestamp: Date.now()
        });
    }, 800); // FIX: Reduced debounce time for faster recording
  }, true);

  // Change (for selects, checkboxes) - ONLY for SELECT, not checkboxes/radios which are handled by click
  document.addEventListener('change', (e) => {
    if(!e.isTrusted) return;
    // Only record SELECT change, checkboxes and radios are handled by click event
    if (e.target.tagName === 'SELECT') {
        const selector = getSelector(e.target);
        
        // FIX: Check for duplicate before recording
        if (!shouldRecord('select', selector)) return;
        
        const label = getElementLabel(e.target);
        window.venice_record({
          type: 'select',
          selector: selector,
          label: 'Select ' + label,
          value: e.target.value,
          params: { selector: selector, value: e.target.value },
          timestamp: Date.now()
        });
    }
  }, true);

})();
`;
