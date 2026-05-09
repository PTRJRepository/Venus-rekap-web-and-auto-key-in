const { waitForElement } = require('../utils/selectors');
const fs = require('fs');
const path = require('path');
const { getLoopJitterDelay, scaleDelay, sleep } = require('../utils/timing');

// Directory untuk menyimpan failed employee CSV
const FAILED_EMP_DIR = path.join(__dirname, 'logs', 'emp_failed');

/**
 * Format date to string (native JS, no dependencies)
 * @param {Date} date - Date object
 * @param {string} format - Format string: 'yyyyMMdd_HHmmss' or 'yyyy-MM-dd HH:mm:ss'
 * @returns {string} Formatted date string
 */
const formatDate = (date, formatStr) => {
    const y = date.getFullYear();
    const M = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const H = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');

    if (formatStr === 'yyyyMMdd_HHmmss') {
        return `${y}${M}${d}_${H}${m}${s}`;
    } else if (formatStr === 'yyyy-MM-dd HH:mm:ss') {
        return `${y}-${M}-${d} ${H}:${m}:${s}`;
    }
    return `${y}-${M}-${d}`;
};

const isNavigationTransientError = (error) => {
    const message = error?.message || String(error || '');
    return /execution context was destroyed|cannot find context|navigation|frame was detached/i.test(message);
};

// Ensure directory exists
const ensureFailedEmpDir = () => {
    if (!fs.existsSync(FAILED_EMP_DIR)) {
        fs.mkdirSync(FAILED_EMP_DIR, { recursive: true });
        console.log(`📁 Created directory: ${FAILED_EMP_DIR}`);
    }
};

// Helper: Wait for page to be stable (internal usage)
const _waitForPageStable = async (page, timeoutMs = 3000) => {
    try {
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: timeoutMs });
        await sleep(500); // Extra stabilization
    } catch (e) {
        // Timeout is ok
    }
};

// Helper: Safe evaluate that handles navigation errors
const safeEvaluate = async (page, fn, ...args) => {
    for (let retry = 0; retry < 3; retry++) {
        try {
            return await page.evaluate(fn, ...args);
        } catch (e) {
            if (isNavigationTransientError(e)) {
                console.log(`  ⚠️ Page navigated, waiting for stability...`);
                await _waitForPageStable(page);
            } else {
                throw e;
            }
        }
    }
    return null;
};

const cleanChargeJobInputValue = (value) => {
    return String(value || '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const EXPENSE_CODE_INPUT_VALUES = {
    C: 'CONTRACTOR',
    L: 'LABOUR',
    M: 'MATERIAL',
    O: 'OTHERS',
    V: 'VRA'
};

const normalizeExpenseCodeInputValue = (rawValue, cleanValue) => {
    const raw = String(rawValue || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const clean = String(cleanValue || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const knownText = Object.values(EXPENSE_CODE_INPUT_VALUES).find((text) => clean === text);
    if (knownText) return knownText;

    if (EXPENSE_CODE_INPUT_VALUES[clean]) return EXPENSE_CODE_INPUT_VALUES[clean];

    const leadingCode = raw.match(/^([CLMOV])(?:\s|\(|$)/);
    if (leadingCode && EXPENSE_CODE_INPUT_VALUES[leadingCode[1]]) {
        return EXPENSE_CODE_INPUT_VALUES[leadingCode[1]];
    }

    const exactText = raw.match(/\((CONTRACTOR|LABOUR|MATERIAL|OTHERS|VRA)\)/);
    return exactText ? exactText[1] : '';
};

const normalizeDomComparable = (value) => String(value ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
const compactDomComparable = (value) => normalizeDomComparable(value).replace(/[^0-9A-Z]/g, '');

const domValuesMatch = (actual, expected) => {
    const actualText = normalizeDomComparable(actual);
    const expectedText = normalizeDomComparable(expected);
    if (!expectedText) return true;
    if (!actualText) return false;

    const actualNumber = Number(String(actual).replace(',', '.'));
    const expectedNumber = Number(String(expected).replace(',', '.'));
    if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
        return Math.abs(actualNumber - expectedNumber) < 0.001;
    }

    if (actualText === expectedText || actualText.includes(expectedText) || expectedText.includes(actualText)) {
        return true;
    }

    const actualCompact = compactDomComparable(actual);
    const expectedCompact = compactDomComparable(expected);
    return Boolean(
        expectedCompact &&
        (actualCompact === expectedCompact || actualCompact.includes(expectedCompact) || expectedCompact.includes(actualCompact))
    );
};

const registerDomValuePair = (context, pair) => {
    if (!context || !pair?.selector) return;

    if (!Array.isArray(context.__domValuePairs)) {
        context.__domValuePairs = [];
    }

    const index = pair.index ?? 0;
    const kind = pair.kind || 'input';
    const key = pair.key || `${kind}:${pair.selector}:${index}`;
    const nextPair = {
        key,
        kind,
        selector: pair.selector,
        index,
        value: pair.value === undefined || pair.value === null ? '' : String(pair.value),
        actualValue: pair.actualValue === undefined || pair.actualValue === null ? '' : String(pair.actualValue),
        label: pair.label || pair.selector,
        restoreBeforeAdd: Boolean(pair.restoreBeforeAdd),
        requiredBeforeAdd: pair.requiredBeforeAdd !== false,
        updatedAt: Date.now()
    };

    const existingIndex = context.__domValuePairs.findIndex((item) => item.key === key);
    if (existingIndex >= 0) {
        context.__domValuePairs[existingIndex] = { ...context.__domValuePairs[existingIndex], ...nextPair };
    } else {
        context.__domValuePairs.push(nextPair);
    }

    console.log(`  🧾 DOM pair: ${nextPair.label} => "${nextPair.value}"`);
};

const readDomValuePair = async (page, pair) => {
    if (!pair?.selector) return { exists: false, value: '', text: '', reason: 'missing pair selector' };

    return safeEvaluate(page, (pair) => {
        const visible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null && !el.disabled;
        };

        if (pair.kind === 'select' || pair.kind === 'expense') {
            const select = document.querySelector(pair.selector);
            if (!select) return { exists: false, value: '', text: '', reason: 'select not found' };
            const selected = select.options?.[select.selectedIndex];
            return {
                exists: true,
                value: select.value || '',
                text: (selected?.textContent || '').trim(),
                visible: visible(select)
            };
        }

        const elements = Array.from(document.querySelectorAll(pair.selector));
        const visibleElements = elements.filter(visible);
        const el = visibleElements[pair.index || 0] || elements[pair.index || 0] || elements[0];
        if (!el) return { exists: false, value: '', text: '', reason: 'element not found', count: elements.length };
        return {
            exists: true,
            value: el.value || '',
            text: (el.textContent || '').trim(),
            visible: visible(el),
            count: elements.length
        };
    }, pair).catch((error) => ({
        exists: false,
        value: '',
        text: '',
        reason: error.message
    }));
};

const restoreDomValuePair = async (page, pair) => {
    if (pair.kind === 'select' || pair.kind === 'expense') {
        return selectExpenseCodeByDom(page, pair.value, {
            selector: pair.selector,
            fallbackValue: pair.value || 'LABOUR',
            settleTimeout: 5000,
            quietMs: 400
        });
    }

    const noPostback = pair.noPostback === true
        || pair.selector === '#MainContent_txtHours'
        || pair.selector === '#MainContent_txtAmount';

    return setInputValueByDom(page, pair.selector, pair.index || 0, pair.value, {
        blur: !noPostback,
        dispatchChange: !noPostback,
        triggerJquery: !noPostback
    });
};

const verifyAndRestoreDomPairsBeforeAdd = async (page, context) => {
    const pairs = Array.isArray(context.__domValuePairs)
        ? context.__domValuePairs.filter((pair) => pair.requiredBeforeAdd !== false)
        : [];

    if (!pairs.length) {
        console.log(`  🧾 DOM/value pairs: none registered before Add`);
        return { ok: true, checked: 0, problems: [] };
    }

    console.log(`  🧾 Checking ${pairs.length} DOM/value pair(s) before Add...`);
    const problems = [];

    for (const pair of pairs) {
        const current = await readDomValuePair(page, pair);
        const actual = current.text || current.value || '';
        const missing = !current.exists || !String(actual).trim();
        const changed = !missing && !domValuesMatch(actual, pair.value);
        const status = missing ? 'KOSONG' : changed ? 'BERUBAH' : 'OK';
        console.log(`  │ ${status}: ${pair.label} expected="${pair.value}" actual="${actual}"`);

        if (!missing && !changed) continue;

        if (!pair.restoreBeforeAdd) {
            problems.push({ pair, current, status });
            continue;
        }

        console.log(`  │ ↻ Restoring ${pair.label} before Add`);
        const restoreResult = await restoreDomValuePair(page, pair);
        if (!restoreResult.success) {
            console.log(`  │ ⚠️ Restore failed for ${pair.label}: ${restoreResult.reason || 'unknown'}`);
            problems.push({ pair, current, status, restoreResult });
            continue;
        }

        await waitForAspNetQuiet(page, 3000, 300);
        const after = await readDomValuePair(page, pair);
        const afterActual = after.text || after.value || '';
        if (after.exists && String(afterActual).trim() && domValuesMatch(afterActual, pair.value)) {
            console.log(`  │ ✅ Restored ${pair.label}: "${afterActual}"`);
        } else {
            console.log(`  │ ⚠️ Still not matched ${pair.label}: "${afterActual}"`);
            problems.push({ pair, current: after, status: 'RESTORE_NOT_MATCHED', restoreResult });
        }
    }

    if (!context.metadata) context.metadata = {};
    context.metadata.beforeAddDomPairProblems = problems.map(({ pair, current, status }) => ({
        key: pair.key,
        label: pair.label,
        expected: pair.value,
        actual: current?.text || current?.value || '',
        status
    }));

    return { ok: problems.length === 0, checked: pairs.length, problems };
};

const setInputValueByDom = async (page, selector, index = 0, value, options = {}) => {
    return safeEvaluate(page, ({ selector, index, value, blur, dispatchChange, dispatchKeyup, triggerJquery }) => {
        const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && el.offsetParent !== null
                && !el.disabled;
        };
        const elements = Array.from(document.querySelectorAll(selector)).filter(isVisible);
        const el = elements[index] || elements[0];
        if (!el) {
            return { success: false, reason: `element not found (${selector}[${index}])`, count: elements.length };
        }

        const nextValue = value === undefined || value === null ? '' : String(value);
        const setNativeValue = (target, targetValue) => {
            const prototype = Object.getPrototypeOf(target);
            const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'value');
            if (descriptor && descriptor.set) {
                descriptor.set.call(target, targetValue);
            } else {
                target.value = targetValue;
            }
        };
        const dispatch = (target, eventName, eventInit = {}) => {
            target.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true, ...eventInit }));
        };

        if (typeof el.focus === 'function') el.focus();
        setNativeValue(el, '');
        dispatch(el, 'input');
        setNativeValue(el, nextValue);
        dispatch(el, 'input');
        if (dispatchKeyup !== false) dispatch(el, 'keyup');
        if (dispatchChange !== false) dispatch(el, 'change');

        if (triggerJquery !== false && window.jQuery) {
            try {
                const jq = window.jQuery(el).val(nextValue).trigger('input');
                if (dispatchKeyup !== false) jq.trigger('keyup');
                if (dispatchChange !== false) jq.trigger('change');
            } catch (_) { }
        }

        if (blur !== false && typeof el.blur === 'function') el.blur();

        return {
            success: true,
            id: el.id || '',
            name: el.name || '',
            value: el.value || ''
        };
    }, {
        selector,
        index: index || 0,
        value,
        blur: options.blur !== false,
        dispatchChange: options.dispatchChange !== false,
        dispatchKeyup: options.dispatchKeyup !== false,
        triggerJquery: options.triggerJquery !== false
    }).catch((error) => ({
        success: false,
        reason: error.message
    }));
};

const readInputValueByDom = async (page, selector, index = 0) => {
    return safeEvaluate(page, ({ selector, index }) => {
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && el.offsetParent !== null
                && !el.disabled;
        };
        const elements = Array.from(document.querySelectorAll(selector)).filter(isVisible);
        const el = elements[index] || elements[0];
        if (!el) {
            return { exists: false, value: '', reason: `element not found (${selector}[${index}])`, count: elements.length };
        }
        return {
            exists: true,
            id: el.id || '',
            name: el.name || '',
            value: el.value || ''
        };
    }, { selector, index: index || 0 }).catch((error) => ({
        exists: false,
        value: '',
        reason: error.message
    }));
};

const normalizeDateComparable = (value) => {
    const text = String(value ?? '').trim();
    let match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
        const [, day, month, year] = match;
        return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
    }

    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
        const [, year, month, day] = match;
        return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
    }

    return '';
};

const inputValuesEquivalent = (actual, expected) => {
    const actualDate = normalizeDateComparable(actual);
    const expectedDate = normalizeDateComparable(expected);
    if (actualDate && expectedDate) return actualDate === expectedDate;
    return domValuesMatch(actual, expected);
};

const clickElementByDom = async (page, selector, index = 0) => {
    const result = await safeEvaluate(page, ({ selector, index }) => {
        const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && el.offsetParent !== null
                && !el.disabled;
        };
        const elements = Array.from(document.querySelectorAll(selector));
        const visibleElements = elements.filter(isVisible);
        const el = visibleElements[index] || elements[index] || elements[0];
        if (!el) return { success: false, reason: `element not found (${selector}[${index}])` };

        if (typeof el.focus === 'function') el.focus();
        if (el.type === 'radio' || el.type === 'checkbox') {
            el.checked = true;
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        }

        const view = window;
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view }));
        if (typeof el.click === 'function') {
            el.click();
        } else {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view }));
        }

        return {
            success: true,
            id: el.id || '',
            name: el.name || '',
            checked: Boolean(el.checked)
        };
    }, { selector, index: index || 0 }).catch((error) => ({
        success: false,
        reason: error.message
    }));

    return result || { success: true, transientNavigation: true };
};

const dispatchKeyByDom = async (page, key = 'Enter', target = null) => {
    return safeEvaluate(page, ({ key, target }) => {
        const keyCodeMap = {
            Enter: 13,
            Tab: 9,
            Escape: 27,
            ArrowDown: 40,
            ArrowUp: 38
        };
        const isVisible = (el) => {
            if (!el || el === document.body || el === document.documentElement) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        };
        const findTarget = () => {
            if (target && target.selector) {
                const matches = Array.from(document.querySelectorAll(target.selector)).filter(isVisible);
                return matches[target.index || 0] || matches[0];
            }
            return isVisible(document.activeElement) ? document.activeElement : document.body;
        };

        const el = findTarget();
        if (!el) return { success: false, reason: 'target not found' };
        if (typeof el.focus === 'function') el.focus();

        const keyCode = keyCodeMap[key] || (key && key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
        const eventInit = {
            key,
            code: key,
            keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        };
        el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        el.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        el.dispatchEvent(new KeyboardEvent('keyup', eventInit));

        return {
            success: true,
            id: el.id || '',
            name: el.name || '',
            tagName: el.tagName
        };
    }, { key, target }).catch((error) => ({
        success: false,
        reason: error.message
    }));
};

const selectFirstAutocompleteOptionByDom = async (page) => {
    return safeEvaluate(page, () => {
        const lists = Array.from(document.querySelectorAll('ul.ui-autocomplete'));
        for (const list of lists) {
            const style = window.getComputedStyle(list);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && list.offsetParent !== null;
            if (!visible) continue;

            const item = list.querySelector('li.ui-menu-item');
            if (!item) continue;

            const target = item.querySelector('div, a') || item;
            const view = window;
            target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view }));
            if (window.jQuery) {
                try {
                    window.jQuery(target)
                        .trigger('mouseenter')
                        .trigger('mousedown')
                        .trigger('mouseup')
                        .trigger('click');
                } catch (_) { }
            }

            return {
                success: true,
                optionClicked: true,
                text: (target.textContent || item.textContent || '').trim(),
                itemCount: list.querySelectorAll('li.ui-menu-item').length
            };
        }

        return { success: false, reason: 'visible autocomplete option not found' };
    }).catch((error) => ({
        success: false,
        reason: error.message
    }));
};

const emptyAspNetFormState = (overrides = {}) => ({
    url: '',
    readyState: '',
    asyncPostback: false,
    employeeValue: '',
    amountValue: '',
    addExists: false,
    addDisabled: false,
    totalText: '',
    lineRowCount: 0,
    lineRows: [],
    validationTexts: [],
    transientNavigation: false,
    ...overrides
});

const isResetInputValue = (value) => {
    const text = String(value ?? '').trim();
    return !text || text === '0' || text === '0.0' || text === '0.00';
};

const getAspNetFormState = async (page, totalHoursSelector = '') => {
    const state = await safeEvaluate(page, (totalHoursSelector) => {
        const visible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
        };
        const textOf = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
        const valueOf = (selector) => document.querySelector(selector)?.value?.trim() || '';
        const lineRows = Array.from(document.querySelectorAll('#MainContent_gvLine tr.mr-l'))
            .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()))
            .filter((cells) => cells.length > 0);
        const validationTexts = Array.from(document.querySelectorAll('span[id*="RFV"], span[style*="color:Red"], span[style*="color: red"], span.RedText'))
            .filter(visible)
            .map((el) => el.textContent.trim())
            .filter((text) => text && text !== '*' && /please|required|select|invalid|harus|wajib/i.test(text));

        let asyncPostback = false;
        try {
            const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
            asyncPostback = Boolean(prm?.get_isInAsyncPostBack?.());
        } catch (_) { }

        return {
            url: window.location.href,
            readyState: document.readyState,
            asyncPostback,
            employeeValue: valueOf('.ui-autocomplete-input.CBOBox'),
            amountValue: valueOf('#MainContent_txtHours') || valueOf('#MainContent_txtAmount'),
            addExists: Boolean(document.querySelector('#MainContent_btnAdd')),
            addDisabled: Boolean(document.querySelector('#MainContent_btnAdd')?.disabled),
            totalText: totalHoursSelector ? textOf(totalHoursSelector) : '',
            lineRowCount: lineRows.length,
            lineRows,
            validationTexts
        };
    }, totalHoursSelector).catch((error) => emptyAspNetFormState({
        error: error.message,
        url: typeof page.url === 'function' ? page.url() : '',
        readyState: isNavigationTransientError(error) ? 'loading' : 'error',
        asyncPostback: isNavigationTransientError(error),
        transientNavigation: isNavigationTransientError(error)
    }));

    return state || emptyAspNetFormState({
        url: typeof page.url === 'function' ? page.url() : '',
        readyState: 'loading',
        asyncPostback: true,
        transientNavigation: true
    });
};

const waitForAspNetIdle = async (page, timeoutMs = 8000, minWaitMs = 300) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const state = await getAspNetFormState(page);
        const elapsed = Date.now() - start;
        if (elapsed >= minWaitMs && state.readyState !== 'loading' && !state.asyncPostback) {
            return { success: true, status: 'idle', elapsedMs: elapsed };
        }
        await sleep(200);
    }
    return { success: false, status: 'timeout', elapsedMs: Date.now() - start };
};

const waitForAspNetQuiet = async (page, timeoutMs = 10000, quietMs = 700) => {
    const start = Date.now();
    let quietSince = 0;
    let lastState = null;

    while (Date.now() - start < timeoutMs) {
        const state = await getAspNetFormState(page);
        lastState = state;
        const busy = state.transientNavigation || state.readyState === 'loading' || state.asyncPostback;

        if (busy) {
            quietSince = 0;
        } else if (!quietSince) {
            quietSince = Date.now();
        } else if (Date.now() - quietSince >= quietMs) {
            return {
                success: true,
                status: 'quiet',
                elapsedMs: Date.now() - start,
                quietMs: Date.now() - quietSince,
                state
            };
        }

        await sleep(busy ? 150 : 100);
    }

    return {
        success: false,
        status: 'timeout',
        elapsedMs: Date.now() - start,
        lastState
    };
};

const waitForTaskRegisterDetailReady = async (page, timeoutMs = 15000, minWaitMs = 500) => {
    const start = Date.now();
    let lastState = null;

    while (Date.now() - start < timeoutMs) {
        const state = await safeEvaluate(page, () => {
            const visible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && el.offsetParent !== null
                    && !el.disabled;
            };

            let asyncPostback = false;
            try {
                const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
                asyncPostback = Boolean(prm?.get_isInAsyncPostBack?.());
            } catch (_) { }

            return {
                url: window.location.href,
                readyState: document.readyState,
                asyncPostback,
                hasDocDate: visible(document.querySelector('#MainContent_txtDocDate')),
                hasTrxDate: visible(document.querySelector('#MainContent_txtTrxDate')),
                hasAddButton: visible(document.querySelector('#MainContent_btnAdd')),
                visibleComboCount: Array.from(document.querySelectorAll('.ui-autocomplete-input.CBOBox')).filter(visible).length,
                employeeValue: document.querySelector('.ui-autocomplete-input.CBOBox')?.value?.trim() || '',
                hoursValue: document.querySelector('#MainContent_txtHours')?.value?.trim() || ''
            };
        }).catch((error) => ({
            url: typeof page.url === 'function' ? page.url() : '',
            readyState: isNavigationTransientError(error) ? 'loading' : 'error',
            asyncPostback: isNavigationTransientError(error),
            hasDocDate: false,
            hasTrxDate: false,
            hasAddButton: false,
            visibleComboCount: 0,
            error: error.message
        }));

        lastState = state;
        const elapsedMs = Date.now() - start;
        if (
            elapsedMs >= minWaitMs &&
            state.readyState !== 'loading' &&
            !state.asyncPostback &&
            state.hasTrxDate &&
            state.hasAddButton &&
            state.visibleComboCount > 0 &&
            !state.employeeValue &&
            isResetInputValue(state.hoursValue)
        ) {
            return { success: true, status: 'detail-ready-empty-inputs', elapsedMs, ...state };
        }

        await sleep(state.asyncPostback ? 150 : 250);
    }

    return {
        success: false,
        status: 'detail-not-ready',
        elapsedMs: Date.now() - start,
        lastState
    };
};

const waitForAddCompletion = async (page, beforeState, options = {}) => {
    const timeoutMs = options.timeout || 8000;
    const totalHoursSelector = options.totalHoursSelector || '';
    const start = Date.now();
    let navigationObserved = false;

    while (Date.now() - start < timeoutMs) {
        const state = await getAspNetFormState(page, totalHoursSelector);
        const elapsedMs = Date.now() - start;

        if (state.transientNavigation || state.readyState === 'loading') {
            await sleep(150);
            continue;
        }

        if (state.validationTexts?.length) {
            return {
                success: false,
                status: 'validation',
                message: state.validationTexts.join(' | '),
                elapsedMs
            };
        }

        if (beforeState.url && state.url && state.url !== beforeState.url) {
            navigationObserved = true;
        }

        if (state.lineRowCount > beforeState.lineRowCount) {
            return {
                success: true,
                status: 'grid-row-added',
                lineRowCount: state.lineRowCount,
                previousLineRowCount: beforeState.lineRowCount,
                latestRow: state.lineRows?.[state.lineRows.length - 1] || [],
                elapsedMs
            };
        }

        if (
            state.addExists &&
            beforeState.employeeValue &&
            beforeState.amountValue &&
            !state.employeeValue &&
            isResetInputValue(state.amountValue)
        ) {
            return {
                success: true,
                status: 'inputs-empty-ready',
                lineRowCount: state.lineRowCount,
                previousLineRowCount: beforeState.lineRowCount,
                navigationObserved,
                elapsedMs
            };
        }

        if (beforeState.employeeValue && !state.employeeValue) {
            return { success: true, status: 'employee-input-empty', navigationObserved, elapsedMs };
        }

        if (beforeState.amountValue && isResetInputValue(state.amountValue)) {
            return { success: true, status: 'hours-input-empty', navigationObserved, elapsedMs };
        }

        if (totalHoursSelector && state.totalText && state.totalText !== beforeState.totalText) {
            return {
                success: true,
                status: 'total-hours-updated',
                totalText: state.totalText,
                elapsedMs
            };
        }

        if (totalHoursSelector && !beforeState.totalText && state.totalText && state.totalText !== '0' && state.totalText !== '0.00') {
            return {
                success: true,
                status: 'total-hours-populated',
                totalText: state.totalText,
                elapsedMs
            };
        }

        await sleep(state.asyncPostback ? 150 : 250);
    }

    return {
        success: navigationObserved,
        status: navigationObserved ? 'navigation-no-empty-confirmation' : 'timeout',
        message: navigationObserved
            ? `Navigation observed but inputs did not become empty within ${timeoutMs}ms`
            : `Add not confirmed within ${timeoutMs}ms`,
        elapsedMs: Date.now() - start
    };
};

const clickVisibleAutocompleteOptionByIndex = async (page, optionIndex = 0) => {
    return safeEvaluate(page, ({ optionIndex }) => {
        const visibleItems = [];
        const lists = Array.from(document.querySelectorAll('ul.ui-autocomplete'));
        for (const list of lists) {
            const style = window.getComputedStyle(list);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && list.offsetParent !== null;
            if (!visible) continue;
            visibleItems.push(...Array.from(list.querySelectorAll('li.ui-menu-item')));
        }

        const item = visibleItems[optionIndex];
        if (!item) return { success: false, reason: `autocomplete option ${optionIndex} not found`, count: visibleItems.length };

        const target = item.querySelector('div, a') || item;
        const view = window;
        target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view }));
        if (window.jQuery) {
            try {
                window.jQuery(target)
                    .trigger('mouseenter')
                    .trigger('mousedown')
                    .trigger('mouseup')
                    .trigger('click');
            } catch (_) { }
        }

        return {
            success: true,
            optionClicked: true,
            text: (target.textContent || item.textContent || '').trim(),
            itemCount: visibleItems.length
        };
    }, { optionIndex }).catch((error) => ({
        success: false,
        reason: error.message
    }));
};

const selectMatchingAutocompleteOptionByDom = async (page, value) => {
    return safeEvaluate(page, ({ value }) => {
        const normalize = (text) => String(text || '').toUpperCase().replace(/\s+/g, ' ').trim();
        const compact = (text) => normalize(text).replace(/[^0-9A-Z]/g, '');
        const wanted = normalize(value);
        const wantedCompact = compact(value);
        const matches = (text) => {
            const normalizedText = normalize(text);
            const compactText = compact(text);
            return Boolean(
                normalizedText === wanted ||
                normalizedText.includes(wanted) ||
                wanted.includes(normalizedText) && normalizedText.length > 2 ||
                wantedCompact && (compactText === wantedCompact || compactText.includes(wantedCompact))
            );
        };

        const visibleItems = [];
        const lists = Array.from(document.querySelectorAll('ul.ui-autocomplete'));
        for (const list of lists) {
            const style = window.getComputedStyle(list);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && list.offsetParent !== null;
            if (!visible) continue;
            visibleItems.push(...Array.from(list.querySelectorAll('li.ui-menu-item')));
        }

        for (let index = 0; index < visibleItems.length; index++) {
            const item = visibleItems[index];
            const target = item.querySelector('div, a') || item;
            const text = (target.textContent || item.textContent || '').trim();
            if (!text || !matches(text)) continue;

            const view = window;
            target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view }));
            if (window.jQuery) {
                try {
                    window.jQuery(target)
                        .trigger('mouseenter')
                        .trigger('mousedown')
                        .trigger('mouseup')
                        .trigger('click');
                } catch (_) { }
            }

            return {
                success: true,
                optionClicked: true,
                text,
                optionIndex: index,
                itemCount: visibleItems.length
            };
        }

        return {
            success: false,
            reason: 'matching autocomplete option not found',
            itemCount: visibleItems.length,
            sample: visibleItems.slice(0, 8).map((item) => (item.textContent || '').trim())
        };
    }, { value }).catch((error) => ({
        success: false,
        reason: error.message
    }));
};

const singleRemainingVisibleAutocompleteOptionIndex = async (page) => {
    return safeEvaluate(page, () => {
        const normalize = (text) => String(text || '').toUpperCase().replace(/\s+/g, ' ').trim();
        const visibleItems = [];
        const lists = Array.from(document.querySelectorAll('ul.ui-autocomplete'));
        for (const list of lists) {
            const style = window.getComputedStyle(list);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && list.offsetParent !== null;
            if (!visible) continue;
            visibleItems.push(...Array.from(list.querySelectorAll('li.ui-menu-item')));
        }

        const selectable = visibleItems
            .map((item, index) => ({ index, text: normalize(item.textContent || '') }))
            .filter((item) => Boolean(item.text));

        return selectable.length === 1
            ? { success: true, optionIndex: selectable[0].index, text: selectable[0].text, itemCount: visibleItems.length }
            : { success: false, reason: `visible selectable count ${selectable.length}`, itemCount: visibleItems.length };
    }).catch((error) => ({
        success: false,
        reason: error.message
    }));
};

const triggerAutocompleteSearchByDom = async (page, selector, index, value, key = '') => {
    return safeEvaluate(page, ({ selector, index, value, key }) => {
        const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && el.offsetParent !== null
                && !el.disabled;
        };
        const inputs = Array.from(document.querySelectorAll(selector)).filter(isVisible);
        const el = inputs[index] || inputs[0];
        if (!el) return { success: false, reason: 'input not found' };

        const setNativeValue = (target, targetValue) => {
            const prototype = Object.getPrototypeOf(target);
            const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'value');
            if (descriptor && descriptor.set) {
                descriptor.set.call(target, targetValue);
            } else {
                target.value = targetValue;
            }
        };

        if (typeof el.focus === 'function') el.focus();
        setNativeValue(el, value);

        const keyCode = key ? key.toUpperCase().charCodeAt(0) : 0;
        const keyboardInit = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true };
        if (key) el.dispatchEvent(new KeyboardEvent('keydown', keyboardInit));
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        if (key) el.dispatchEvent(new KeyboardEvent('keyup', keyboardInit));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

        let method = 'events';
        if (window.jQuery) {
            try {
                const $el = window.jQuery(el);
                $el.val(value).trigger('input').trigger('keyup');
                if ($el.autocomplete) {
                    $el.autocomplete('search', value);
                    method = 'jquery-autocomplete';
                }
            } catch (error) {
                method = `jquery-failed:${error.message}`;
            }
        }

        return { success: true, method, value: el.value || '' };
    }, { selector, index: index || 0, value, key }).catch((error) => ({
        success: false,
        reason: error.message
    }));
};

const typeAutocompleteSlowlyAndChooseSingleRemainingByDom = async (page, selector, index = 0, value, options = {}) => {
    await setInputValueByDom(page, selector, index, '', { blur: false });
    await sleep(options.initialWait || 300);

    let partial = '';
    for (const character of String(value || '')) {
        partial += character;
        const triggerResult = await triggerAutocompleteSearchByDom(page, selector, index, partial, character);
        if (!triggerResult.success) return triggerResult;

        await sleep(options.keyDelay || 350);
        const singleResult = await singleRemainingVisibleAutocompleteOptionIndex(page);
        if (singleResult.success) {
            const clickResult = await clickVisibleAutocompleteOptionByIndex(page, singleResult.optionIndex);
            if (clickResult.success) {
                await sleep(options.afterSelectWait || 700);
                return {
                    ...clickResult,
                    method: 'slow-single-remaining',
                    typedValue: partial
                };
            }
        }
    }

    await sleep(options.finalWait || 1000);
    const singleResult = await singleRemainingVisibleAutocompleteOptionIndex(page);
    if (singleResult.success) {
        const clickResult = await clickVisibleAutocompleteOptionByIndex(page, singleResult.optionIndex);
        if (clickResult.success) {
            await sleep(options.afterSelectWait || 700);
            return {
                ...clickResult,
                method: 'slow-single-remaining-final',
                typedValue: partial
            };
        }
    }

    return {
        success: false,
        optionClicked: false,
        reason: `no unique autocomplete option remained for ${value}`
    };
};

const setAutocompleteInputByDom = async (page, selector, index = 0, value, options = {}) => {
    const inputResult = await setInputValueByDom(page, selector, index, value, { blur: false });
    if (!inputResult.success) return inputResult;

    const searchResult = await safeEvaluate(page, ({ selector, index, value }) => {
        const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && el.offsetParent !== null
                && !el.disabled;
        };
        const inputs = Array.from(document.querySelectorAll(selector)).filter(isVisible);
        const el = inputs[index] || inputs[0];
        if (!el) return { success: false, reason: 'input not found' };

        let method = 'events';
        if (window.jQuery) {
            try {
                const $el = window.jQuery(el);
                $el.val(value).trigger('input').trigger('keydown').trigger('keyup');
                if ($el.autocomplete) {
                    $el.autocomplete('search', value);
                    method = 'jquery-autocomplete';
                }
            } catch (error) {
                method = `jquery-failed:${error.message}`;
            }
        }

        ['focus', 'input', 'keydown', 'keyup', 'change'].forEach((eventName) => {
            el.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
        });

        return { success: true, method, value: el.value || '' };
    }, { selector, index: index || 0, value }).catch((error) => ({
        success: false,
        reason: error.message
    }));

    await sleep(options.dropdownWait || 800);
    const optionResult = await selectMatchingAutocompleteOptionByDom(page, options.matchValue || value);
    if (optionResult.success) {
        await sleep(options.afterSelectWait || 700);
        return { ...optionResult, method: searchResult.method || 'dom', inputValue: inputResult.value };
    }

    if (options.slowUntilSingle === true) {
        console.log(`  🔎 No matching option. Slow typing until one option remains: "${options.slowValue || value}"`);
        const slowResult = await typeAutocompleteSlowlyAndChooseSingleRemainingByDom(
            page,
            selector,
            index,
            options.slowValue || value,
            {
                keyDelay: options.slowKeyDelay || 350,
                afterSelectWait: options.afterSelectWait || 700
            }
        );
        if (slowResult.success) {
            return { ...slowResult, inputValue: inputResult.value };
        }
    }

    if (options.allowFirstOption === true) {
        const firstOptionResult = await selectFirstAutocompleteOptionByDom(page);
        if (firstOptionResult.success) {
            await sleep(options.afterSelectWait || 700);
            return { ...firstOptionResult, method: 'first-option', inputValue: inputResult.value };
        }
    }

    if (options.requireOption === true) {
        return {
            success: false,
            method: searchResult.method || 'value-only',
            inputValue: inputResult.value,
            optionClicked: false,
            reason: optionResult.reason || 'autocomplete option not selected',
            sample: optionResult.sample || []
        };
    }

    return {
        success: true,
        method: searchResult.method || 'value-only',
        inputValue: inputResult.value,
        optionClicked: false,
        optionReason: optionResult.reason
    };
};

const selectPairedHiddenSelect = async (page, inputSelector, index = 0, value) => {
    if (!inputSelector || value === undefined || value === null) {
        return { success: false, reason: 'missing selector/value' };
    }

    return page.evaluate(({ inputSelector, index, value }) => {
        const normalize = (text) => String(text || '').toUpperCase().replace(/\s+/g, ' ').trim();
        const compact = (text) => normalize(text).replace(/[^0-9A-Z]/g, '');
        const wanted = normalize(value);
        const wantedCompact = compact(value);

        const visibleInputs = Array.from(document.querySelectorAll(inputSelector))
            .filter((el) => el.offsetParent !== null && !el.disabled);
        const input = visibleInputs[index] || visibleInputs[0];
        if (!input) return { success: false, reason: 'input not found' };

        const candidates = [];
        const addSelects = (root) => {
            if (!root) return;
            if (root.tagName === 'SELECT') candidates.push(root);
            if (root.querySelectorAll) {
                candidates.push(...Array.from(root.querySelectorAll('select')));
            }
        };

        addSelects(input.previousElementSibling);
        addSelects(input.parentElement);
        addSelects(input.closest('td'));
        addSelects(input.closest('tr'));

        const select = candidates.find((candidate) => candidate && candidate.options && candidate.options.length > 0);
        if (!select) return { success: false, reason: 'paired select not found' };

        const options = Array.from(select.options || []);
        const matched = options.find((option) => normalize(option.value) === wanted)
            || options.find((option) => normalize(option.textContent) === wanted)
            || options.find((option) => compact(option.value) === wantedCompact && wantedCompact)
            || options.find((option) => compact(option.textContent) === wantedCompact && wantedCompact)
            || options.find((option) => normalize(option.value).includes(wanted) && wanted.length > 2)
            || options.find((option) => normalize(option.textContent).includes(wanted) && wanted.length > 2)
            || options.find((option) => wanted.includes(normalize(option.textContent)) && normalize(option.textContent).length > 2);

        if (!matched || !matched.value) {
            return {
                success: false,
                reason: 'matching option not found',
                selectId: select.id || '',
                optionCount: options.length,
                sample: options.slice(0, 8).map((option) => `${option.value}:${option.textContent || ''}`)
            };
        }

        select.value = matched.value;
        input.value = (matched.textContent || matched.value || '').trim();

        const dispatch = (target, eventName) => {
            target.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
        };

        dispatch(input, 'focus');
        dispatch(input, 'input');
        dispatch(input, 'change');
        dispatch(select, 'input');
        dispatch(select, 'change');
        if (typeof select.onchange === 'function') {
            select.onchange(new Event('change', { bubbles: true, cancelable: true }));
        }
        if (window.jQuery) {
            try { window.jQuery(select).trigger('change'); } catch (_) {}
            try { window.jQuery(input).trigger('input').trigger('change'); } catch (_) {}
        }
        dispatch(input, 'blur');

        return {
            success: true,
            selectId: select.id || '',
            optionValue: matched.value,
            optionText: (matched.textContent || '').trim()
        };
    }, { inputSelector, index, value }).catch((error) => ({
        success: false,
        reason: error.message
    }));
};

const selectExpenseCodeByDom = async (page, value, options = {}) => {
    const selector = options.selector || '#MainContent_MultiDimAcc_ddlExpCode';
    const fallbackValue = options.fallbackValue || 'LABOUR';
    const timeout = options.timeout || 12000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const state = await safeEvaluate(page, (selector) => {
            const select = document.querySelector(selector);
            if (!select) return { exists: false, ready: false, reason: 'expense select not found' };
            const row = select.closest('tr');
            const input = (select.parentElement && select.parentElement.querySelector('input.ui-autocomplete-input.CBOBox'))
                || (row && row.querySelector('input.ui-autocomplete-input.CBOBox'));
            return {
                exists: true,
                ready: !select.disabled,
                disabled: Boolean(select.disabled),
                rowVisible: row ? row.offsetParent !== null : true,
                inputVisible: input ? input.offsetParent !== null && !input.disabled : false
            };
        }, selector).catch((error) => ({ exists: false, ready: false, reason: error.message }));

        if (state?.exists && state.ready) break;
        await sleep(300);
    }

    const result = await safeEvaluate(page, ({ selector, value, fallbackValue }) => {
        const normalize = (text) => String(text || '').toUpperCase().replace(/\s+/g, ' ').trim();
        const compact = (text) => normalize(text).replace(/[^0-9A-Z]/g, '');
        const aliases = {
            C: 'CONTRACTOR',
            L: 'LABOUR',
            M: 'MATERIAL',
            O: 'OTHERS',
            V: 'VRA'
        };
        const normalizeWanted = (input) => {
            const wanted = normalize(input);
            if (!wanted) return '';
            if (aliases[wanted]) return aliases[wanted];
            const leading = wanted.match(/^([CLMOV])(?:\s|\(|$)/);
            if (leading && aliases[leading[1]]) return aliases[leading[1]];
            return wanted;
        };

        const select = document.querySelector(selector);
        if (!select) return { success: false, reason: 'expense select not found' };

        const options = Array.from(select.options || []);
        const wantedValues = [value, fallbackValue, 'LABOUR', 'L']
            .map(normalizeWanted)
            .filter(Boolean)
            .filter((item, index, array) => array.indexOf(item) === index);

        const matchOption = (wanted) => {
            const wantedCompact = compact(wanted);
            return options.find((option) => normalize(option.value) === wanted)
                || options.find((option) => normalize(option.textContent) === wanted)
                || options.find((option) => compact(option.value) === wantedCompact && wantedCompact)
                || options.find((option) => compact(option.textContent) === wantedCompact && wantedCompact)
                || options.find((option) => normalize(option.textContent).includes(wanted) && wanted.length > 1)
                || options.find((option) => normalize(option.value).includes(wanted) && wanted.length > 1);
        };

        let matched = null;
        let matchedFrom = '';
        for (const wanted of wantedValues) {
            matched = matchOption(wanted);
            if (matched && matched.value) {
                matchedFrom = wanted;
                break;
            }
        }

        if (!matched || !matched.value) {
            return {
                success: false,
                reason: 'expense option not found',
                wantedValues,
                optionCount: options.length,
                sample: options.slice(0, 8).map((option) => `${option.value}:${option.textContent || ''}`)
            };
        }

        const row = select.closest('tr');
        const input = (select.parentElement && select.parentElement.querySelector('input.ui-autocomplete-input.CBOBox'))
            || (row && row.querySelector('input.ui-autocomplete-input.CBOBox'));
        const optionText = (matched.textContent || matched.value || '').trim();
        const dispatch = (target, eventName) => {
            target.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
        };

        select.value = matched.value;
        if (input) {
            input.value = optionText;
            dispatch(input, 'focus');
            dispatch(input, 'input');
            dispatch(input, 'change');
            dispatch(input, 'blur');
        }
        dispatch(select, 'input');
        dispatch(select, 'change');

        return {
            success: true,
            selectId: select.id || '',
            optionValue: matched.value,
            optionText,
            matchedFrom,
            inputVisible: input ? input.offsetParent !== null && !input.disabled : false
        };
    }, { selector, value, fallbackValue }).catch((error) => ({
        success: false,
        reason: error.message
    }));

    if (!result.success) return result;

    const idleResult = await waitForAspNetQuiet(page, options.settleTimeout || 10000, options.quietMs || 900);
    await sleep(300);
    return { ...result, settleStatus: idleResult.status, settleElapsedMs: idleResult.elapsedMs };
};

/**
 * Update failed employee CSV in real-time
 * Handles file lock if file is being opened/viewed by user
 * Appends new failed records to existing file
 */
const updateFailedEmployeeCSV = async (failedRecords, context) => {
    if (!failedRecords || failedRecords.length === 0) {
        return;
    }

    try {
        ensureFailedEmpDir();

        // Generate filename based on session/metadata
        const now = new Date();
        const timestamp = formatDate(now, 'yyyyMMdd_HHmmss');

        // Use consistent filename for the session (can be opened while automation runs)
        // Filename format: failed_employees_YYYYMMDD_HHMMSS.csv
        // If file exists, append to it

        // Get existing filename from context or create new one
        if (!context.failedCsvFilename) {
            context.failedCsvFilename = `failed_employees_${timestamp}.csv`;
        }

        const filePath = path.join(FAILED_EMP_DIR, context.failedCsvFilename);
        const fileExists = fs.existsSync(filePath);

        // Define CSV headers
        const headers = [
            "Timestamp",
            "EmployeeID",
            "Name",
            "PTRJ_ID",
            "Date",
            "Venus_Status",
            "Venus_Regular_Hours",
            "Venus_OT_Hours",
            "Sync_Status",
            "Reason",
            "Millware_Records_Count",
            "Millware_Total_Hours"
        ];

        // Convert records to CSV rows
        const rows = failedRecords.map(record => {
            return [
                formatDate(now, 'yyyy-MM-dd HH:mm:ss'),
                record.employeeId,
                `"${record.employeeName.replace(/"/g, '""')}"`, // Escape quotes
                record.ptrjId,
                record.date,
                record.venusStatus,
                record.venusRegularHours,
                record.venusOvertimeHours,
                record.syncStatus,
                record.reason || '', // Reason for failure
                record.millwareRecords,
                record.millwareHours
            ].join(",");
        });

        // Build CSV content
        let csvContent = '';

        // If file doesn't exist, add headers first
        if (!fileExists) {
            csvContent += headers.join(",") + "\n";
            console.log(`📄 Creating new failed employees CSV: ${context.failedCsvFilename}`);
        } else {
            console.log(`📄 Appending to existing failed employees CSV: ${context.failedCsvFilename}`);
        }

        // Append new rows
        csvContent += rows.join("\n") + "\n";

        // Write to file with lock handling (retry if file is locked)
        let writeSuccess = false;
        let retryCount = 0;
        const maxRetries = 5;

        while (!writeSuccess && retryCount < maxRetries) {
            try {
                // Try to write (append mode)
                fs.appendFileSync(filePath, csvContent, { mode: 0o666, flag: 'a' });
                writeSuccess = true;
                console.log(`✅ Updated CSV with ${failedRecords.length} failed record(s)`);
                console.log(`   📍 File: ${filePath}`);
            } catch (error) {
                if (error.code === 'EBUSY' || error.code === 'EACCES' || error.code === 'EPERM') {
                    // File is locked (possibly opened by user)
                    retryCount++;
                    const waitTime = 1000 * retryCount; // Exponential backoff
                    console.log(`⚠️ File is locked (retry ${retryCount}/${maxRetries}) - waiting ${waitTime}ms...`);
                    console.log(`   💡 Close the Excel file if you are viewing it, or wait for retry...`);
                    await new Promise(r => setTimeout(r, waitTime));
                } else {
                    // Other error - throw it
                    throw error;
                }
            }
        }

        if (!writeSuccess) {
            console.error(`❌ Failed to update CSV after ${maxRetries} retries - file may be locked`);
            console.error(`   💡 Please close ${context.failedCsvFilename} if you are viewing it in Excel`);

            // Save to backup file as last resort
            const backupFilename = `failed_backup_${Date.now()}.csv`;
            const backupPath = path.join(FAILED_EMP_DIR, backupFilename);
            try {
                const backupContent = fileExists ? '' : headers.join(",") + "\n";
                fs.writeFileSync(backupPath, backupContent + rows.join("\n") + "\n");
                console.log(`🔄 Backup saved to: ${backupFilename}`);
            } catch (e) {
                console.error(`❌ Failed to save backup: ${e.message}`);
            }
        }

    } catch (error) {
        console.error(`❌ CSV update error: ${error.message}`);
    }
};

const actions = {
    /**
     * Navigasi ke URL dengan retry logic
     * waitUntil: 'domcontentloaded' lebih reliable untuk server internal/corporate
     * yang mungkin punya background polling atau koneksi persistent.
     */
    navigate: async (page, params) => {
        const waitStrategy = params.waitUntil || 'domcontentloaded';
        const gotoTimeout = params.gotoTimeout || 60000;
        const maxRetries = params.retries !== undefined ? params.retries : 3;
        const retryDelay = params.retryDelay || 3000;

        console.log(`🔄 Navigasi ke: ${params.url} (wait: ${waitStrategy}, timeout: ${gotoTimeout}ms)`);

        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await page.goto(params.url, { waitUntil: waitStrategy, timeout: gotoTimeout });
                console.log(`✅ [Navigasi berhasil] URL: ${params.url}`);
                return;
            } catch (error) {
                lastError = error;
                const isTimeout = error.message.includes('TIMED_OUT') || error.message.includes('Timeout');

                if (attempt < maxRetries) {
                    const delay = retryDelay * attempt; // Exponential backoff
                    console.log(`⚠️ [Attempt ${attempt}/${maxRetries}] ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${error.message}`);
                    console.log(`   ⏳ Retry dalam ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    console.error(`❌ [Navigasi GAGAL setelah ${maxRetries} percobaan]`);
                    console.error(`   💥 Error: ${error.message}`);
                    throw error;
                }
            }
        }
    },

    /**
     * Wait for page to be stable (no pending network requests, animations, etc.)
     * Useful for ensuring page is fully loaded before interacting
     */
    waitForPageStable: async (page, params) => {
        const timeout = params.timeout || 5000;
        const checkInterval = params.interval || 500;

        console.log(`⏳ Waiting for page to stabilize (timeout: ${timeout}ms)...`);

        const startTime = Date.now();
        let lastHtml = '';
        let stableCount = 0;
        const requiredStableChecks = 2;

        while (Date.now() - startTime < timeout) {
            // Wait for network idle
            try {
                await page.waitForNetworkIdle({ timeout: checkInterval, idleTime: 250 });
            } catch (e) {
                // Network still busy, continue
            }

            // Check if DOM is stable
            const currentHtml = await page.evaluate(() => document.body?.innerHTML?.length || 0);

            if (currentHtml === lastHtml && currentHtml > 0) {
                stableCount++;
                if (stableCount >= requiredStableChecks) {
                    console.log(`  ✅ Page stable after ${Date.now() - startTime}ms`);
                    return;
                }
            } else {
                stableCount = 0;
            }

            lastHtml = currentHtml;
            await new Promise(r => setTimeout(r, checkInterval));
        }

        console.log(`  ⚠️ Page stability timeout reached`);
    },

    /**
     * Include another template logic (sub-routine)
     * Supports parameter passing via params.params (will be merged into context)
     */
    include: async (page, params, context, engine) => {
        const templateName = params.template;
        console.log(`📂 Including template: ${templateName}`);

        // DEBUG: Log current context keys for troubleshooting
        console.log(`  🔍 Current context keys: ${Object.keys(context).join(', ') || '(empty)'}`);

        // Merge additional params into context
        const mergedContext = { ...context };
        if (params.params && typeof params.params === 'object') {
            Object.keys(params.params).forEach(key => {
                mergedContext[key] = params.params[key];
                console.log(`  📌 Param: ${key} = ${params.params[key]}`);
            });
        }

        // DEBUG: Log merged context keys
        console.log(`  🔍 Merged context keys: ${Object.keys(mergedContext).join(', ') || '(empty)'}`);

        const template = engine.loadTemplate(templateName);
        console.log(`  ✅ Template "${templateName}" loaded with ${template.steps.length} steps`);

        // Execute steps with merged context
        await engine.executeSteps(template.steps, mergedContext, 1);
        Object.assign(context, mergedContext);
    },

    /**
     * Reload the current page
     */
    reloadPage: async (page) => {
        console.log("🔄 Reloading page...");
        await page.reload({ waitUntil: 'domcontentloaded' });
    },

    /**
     * Verify Sync Status with DB and flag retries
     * NEW BEHAVIOR: If mismatches found, SKIP retry, move to next employee, and UPDATE CSV REAL-TIME
     */
    verifyEmployeeSync: async (page, params, context, engine) => {
        const employee = context.employee;
        if (!employee || !employee.PTRJEmployeeID) {
            console.log("⚠️ Verification skipped: No employee in context");
            context.retryNeeded = false;
            return;
        }

        console.log(`🔍 Verifying Sync Status for ${employee.PTRJEmployeeID}...`);

        try {
            // Dynamic import to avoid load issues
            const comparisonService = require('../../backend/services/comparisonService');

            // Calculate date range
            let startDate, endDate;
            if (context.data && context.data.metadata && context.data.metadata.period_start) {
                startDate = context.data.metadata.period_start;
                endDate = context.data.metadata.period_end;
            } else {
                const dates = Object.keys(employee.Attendance || {}).sort();
                if (dates.length > 0) {
                    startDate = dates[0];
                    endDate = dates[dates.length - 1];
                } else {
                    // Fallback
                    const now = new Date();
                    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                    endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
                }
            }

            // Run comparison
            const venusData = [employee];
            const result = await comparisonService.compareWithTaskReg(venusData, startDate, endDate, {
                onlyOvertime: context.metadata?.onlyOvertime || false
            });

            // Filter results for this employee
            const employeeResults = result.results.filter(r => r.ptrjId === employee.PTRJEmployeeID);

            let hasMismatches = false;
            let missingDates = [];
            let failedRecords = []; // Store failed records for CSV export

            employeeResults.forEach(res => {
                const date = res.date;
                const att = employee.Attendance[date];
                if (att) {
                    // Check sync status from taskregln database
                    if (res.status === 'MISS') {
                        hasMismatches = true;
                        missingDates.push(date);

                        // Store mismatch details for logging/reporting
                        const details = res.details || {};
                        att.regularMatched = details.regularMatched;
                        att.otMatched = details.otMatched;
                        att.syncStatus = 'MISS';

                        // Collect failed record for CSV export
                        failedRecords.push({
                            employeeId: employee.EmployeeID || 'N/A',
                            employeeName: employee.EmployeeName || 'Unknown',
                            ptrjId: employee.PTRJEmployeeID || 'N/A',
                            date: date,
                            venusStatus: att.status || 'N/A',
                            venusRegularHours: att.regularHours || 0,
                            venusOvertimeHours: att.overtimeHours || 0,
                            syncStatus: 'MISS',
                            reason: `Transfer gagal - Regular: ${details.regularMatched ? '✅' : '❌'}, OT: ${details.otMatched ? '✅' : '❌'}`,
                            millwareRecords: details.records || 0,
                            millwareHours: details.millwareHours || 0
                        });

                        console.log(`     ❌ [${date}] Transfer FAILED - Not found in taskregln DB`);
                        console.log(`        Regular: ${details.regularMatched ? '✅' : '❌'}, OT: ${details.otMatched ? '✅' : '❌'}`);
                    } else {
                        // Sync successful - mark as matched
                        att.syncStatus = 'SYNCED';
                        console.log(`     ✅ [${date}] Transfer SUCCESS - Found in taskregln DB`);
                    }
                }
            });

            if (hasMismatches) {
                console.log(`⚠️ Some transfers FAILED for ${employee.PTRJEmployeeID} on dates: ${missingDates.join(', ')}`);
                console.log(`⏭️ Moving to NEXT employee (no retry as configured)`);
                context.retryNeeded = false; // CHANGED: Don't retry, move to next employee
                context.employeeFailed = true; // Flag this employee as partially failed
                context.failedDates = missingDates; // Store which dates failed
                context.failedRecords = failedRecords; // Store failed records for CSV export

                // REAL-TIME CSV UPDATE: Immediately append to failed employees CSV
                await updateFailedEmployeeCSV(failedRecords, context);
            } else {
                console.log(`✅ All transfers SUCCESSFUL for ${employee.PTRJEmployeeID}`);
                context.retryNeeded = false;
                context.employeeFailed = false;
            }

        } catch (error) {
            console.error(`⚠️ Verification failed: ${error.message}`);
            context.retryNeeded = false; // Don't retry on error
            context.employeeFailed = true;
        }
    },

    /**
     * Set a variable in the context (supports deep properties via dot notation)
     * e.g., variable: "metadata.failed", value: true
     */
    setVariable: async (page, params, context) => {
        const { variable, value } = params;
        const keys = variable.split('.');
        let target = context;
        for (let i = 0; i < keys.length - 1; i++) {
            if (target[keys[i]] === undefined || target[keys[i]] === null) {
                target[keys[i]] = {};
            }
            target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = value;
        // console.log(`💾 Set variable: ${variable} = ${value}`);
    },

    /**
     * setContext - Set a value in context with variable substitution support
     * params.key: the key to set in context (e.g., "radioSelector")
     * params.value: static value to set
     * params.valueSource: dot-notation path to get value from context (e.g., "attendance.regularHours")
     */
    setContext: async (page, params, context, engine) => {
        const { key, value, valueSource, regularFullHours } = params;

        if (regularFullHours) {
            const attendance = context.attendance || {};
            const rawDate = attendance.date || context.date || '';
            const dayName = String(attendance.dayName || attendance.day || attendance.hari || '').trim().toLowerCase();
            let isSaturday = ['sab', 'sabtu', 'sat', 'saturday'].includes(dayName);

            if (!isSaturday && /^\d{4}-\d{2}-\d{2}/.test(String(rawDate))) {
                const [year, month, day] = String(rawDate).slice(0, 10).split('-').map(Number);
                isSaturday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 6;
            }

            const regularHours = isSaturday ? 5 : 7;
            context[key] = regularHours;
            console.log(`💾 setContext: ${key} = ${regularHours} (normal full hours, ${isSaturday ? 'Saturday' : 'weekday/default'})`);
            return;
        }

        if (valueSource) {
            // Get value from context using dot notation
            const keys = valueSource.split('.');
            let val = context;
            for (const k of keys) {
                if (val === undefined || val === null) {
                    console.log(`⚠️ setContext: Cannot access '${valueSource}' - undefined at key '${k}'`);
                    console.log(`   Available context keys: ${Object.keys(context).join(', ')}`);
                    val = undefined;
                    break;
                }
                val = val[k];
            }
            context[key] = val;
            console.log(`💾 setContext: ${key} = ${val} (from ${valueSource})`);
        } else {
            // Use static value (with variable substitution if needed)
            const resolvedValue = engine.substituteVariables(value || '', context);
            context[key] = resolvedValue;
            console.log(`💾 setContext: ${key} = ${resolvedValue}`);
        }
    },

    /**
     * Assert that a specific element has focus before typing
     * Prevents typing into wrong elements in parallel execution
     */
    assertFocus: async (page, params) => {
        const { selector, index, retries = 3, delay = 500 } = params;

        console.log(`🎯 Asserting focus on: ${selector}${index !== undefined ? ` (index: ${index})` : ''}`);

        for (let attempt = 1; attempt <= retries; attempt++) {
            let targetElement;

            if (index !== undefined) {
                const elements = await page.$$(selector);
                const visibleElements = [];
                for (const el of elements) {
                    const isVisible = await el.evaluate(node => node.offsetParent !== null);
                    if (isVisible) visibleElements.push(el);
                }
                targetElement = visibleElements[index];
            } else {
                targetElement = await page.$(selector);
            }

            if (!targetElement) {
                console.log(`  ⚠️ Element not found, retrying (${attempt}/${retries})...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            // Click to ensure focus
            await targetElement.click();
            await new Promise(r => setTimeout(r, 100));

            // Verify focus
            const hasFocus = await targetElement.evaluate(el => document.activeElement === el);

            if (hasFocus) {
                console.log(`  ✅ Focus confirmed`);
                return true;
            }

            console.log(`  ⚠️ Focus not on target, retrying (${attempt}/${retries})...`);
            await new Promise(r => setTimeout(r, delay));
        }

        console.log(`❌ Failed after ${retries} attempts`);

        // CRITICAL: Check if failure was due to Employee not found
        // If "Please select Employee" error is still visible, this employee doesn't exist in the system
        // NOTE: `checkForValidationErrors` and `value` are not defined in this scope.
        // This code assumes they are available from a broader context or will be added.
        // For now, keeping it commented out as `checkForValidationErrors` and `value` are not defined.
        // const finalError = await checkForValidationErrors();
        // if (finalError.hasError && finalError.message.toLowerCase().includes('please select employee')) {
        //     console.log(`⚠️ EMPLOYEE NOT FOUND: "${value}"`);
        //     console.log(`⏭️ Skipping this employee and continuing to next...`);

        //     // Throw special error type that templates can catch to skip employee
        //     const skipError = new Error(`EMPLOYEE_NOT_FOUND: ${value}`);
        //     skipError.code = 'EMPLOYEE_NOT_FOUND';
        //     skipError.employeeId = value;
        //     throw skipError;
        // }

        throw new Error(`Failed to assert focus on ${selector} after ${retries} attempts`);
    },

    /**
     * Mengetik input text
     */
    typeInput: async (page, params, context = {}) => {
        // DEBUG: Log received params
        console.log(`📋 [typeInput] Received params:`);
        console.log(`   selector: ${params.selector}`);
        console.log(`   index: ${params.index}`);
        console.log(`   value: "${params.value}"`);
        console.log(`   value type: ${typeof params.value}`);
        console.log(`   value length: ${params.value?.length || 0}`);

        // Detect if this is an autocomplete field (CBOBox) that needs smart selection
        const isAutocomplete = (params.selector && (
            params.selector.includes('ui-autocomplete-input') ||
            params.selector.includes('CBOBox')
        )) || params.smartSelect === true;

        if (isAutocomplete) {
            console.log(`⌨️  Smart Typing "${params.value}" ke elemen: ${params.selector} (Index: ${params.index || 0})`);

            const selector = params.selector;
            const index = params.index || 0;
            const value = params.value;
            const restoreBeforeAdd = params.restoreBeforeAdd === true;
            const requiredBeforeAdd = params.requiredBeforeAdd !== false;
            context.__lastInputTarget = { selector, index };

            const pairedSelectResult = await selectPairedHiddenSelect(page, selector, index, value);
            if (pairedSelectResult.success) {
                console.log(`  ✅ Selected paired hidden select (${pairedSelectResult.selectId || 'unknown'}): "${pairedSelectResult.optionText || value}"`);
                registerDomValuePair(context, {
                    kind: 'autocomplete',
                    selector,
                    index,
                    value,
                    actualValue: pairedSelectResult.optionText || value,
                    label: params.label || `Autocomplete ${index}`,
                    restoreBeforeAdd,
                    requiredBeforeAdd
                });
                await sleep(800);
                return;
            }
            console.log(`  ℹ️ Paired hidden select unavailable: ${pairedSelectResult.reason}`);

            const autocompleteResult = await setAutocompleteInputByDom(page, selector, index, value, {
                dropdownWait: 800,
                afterSelectWait: 700,
                allowFirstOption: true
            });
            if (!autocompleteResult.success) {
                throw new Error(`DOM autocomplete input failed: ${autocompleteResult.reason}`);
            }

            if (autocompleteResult.optionClicked === false) {
                console.log(`  ⚠️ Autocomplete option not clicked (${autocompleteResult.optionReason || 'unknown'}). Value set by DOM.`);
            } else {
                console.log(`  ✅ Autocomplete selected via DOM (${autocompleteResult.method || 'dom'})`);
            }
            registerDomValuePair(context, {
                kind: 'autocomplete',
                selector,
                index,
                value,
                actualValue: autocompleteResult.text || autocompleteResult.inputValue || value,
                label: params.label || `Autocomplete ${index}`,
                restoreBeforeAdd,
                requiredBeforeAdd
            });

        } else {
            const index = params.index || 0;
            console.log(`⌨️  Set value via DOM "${params.value}" ke elemen: ${params.selector}${params.index !== undefined ? ` (Index: ${params.index})` : ''}`);
            const inputTimeout = params.timeout || (params.selector === '#MainContent_txtDocDate' ? 3000 : 15000);
            try {
                await waitForElement(page, params.selector, inputTimeout);
            } catch (error) {
                if (params.selector === '#MainContent_txtDocDate') {
                    const fallbackState = await safeEvaluate(page, () => {
                        const visible = (el) => {
                            if (!el) return false;
                            const style = window.getComputedStyle(el);
                            return style.display !== 'none'
                                && style.visibility !== 'hidden'
                                && el.offsetParent !== null
                                && !el.disabled;
                        };
                        return {
                            docDateVisible: visible(document.querySelector('#MainContent_txtDocDate')),
                            trxDateVisible: visible(document.querySelector('#MainContent_txtTrxDate')),
                            addVisible: visible(document.querySelector('#MainContent_btnAdd')),
                            url: window.location.href
                        };
                    }).catch(() => null);

                    if (fallbackState?.trxDateVisible && fallbackState?.addVisible) {
                        console.log(`  ℹ️ #MainContent_txtDocDate not visible after postback; continuing with transaction date field.`);
                        return;
                    }
                }
                throw error;
            }
            const noPostback = params.noPostback === true;
            if (params.skipIfSame === true) {
                const currentInput = await readInputValueByDom(page, params.selector, index);
                if (currentInput.exists && String(currentInput.value || '').trim() && inputValuesEquivalent(currentInput.value, params.value)) {
                    console.log(`  ↷ Skip input: ${params.selector} already equals "${params.value}" (current="${currentInput.value}")`);
                    context.__lastInputTarget = { selector: params.selector, index };
                    registerDomValuePair(context, {
                        kind: 'input',
                        selector: params.selector,
                        index,
                        value: params.value,
                        actualValue: currentInput.value,
                        label: params.label || params.selector,
                        restoreBeforeAdd: params.restoreBeforeAdd === true || params.selector === '#MainContent_txtHours' || params.selector === '#MainContent_txtAmount',
                        requiredBeforeAdd: params.requiredBeforeAdd !== false,
                        noPostback
                    });
                    return;
                }
            }
            const result = await setInputValueByDom(page, params.selector, index, params.value, {
                blur: noPostback ? false : params.blur !== false,
                dispatchChange: noPostback ? false : params.dispatchChange !== false,
                dispatchKeyup: params.dispatchKeyup !== false,
                triggerJquery: noPostback ? false : params.triggerJquery !== false
            });
            if (!result.success) {
                if (params.selector === '#MainContent_txtDocDate') {
                    const fallbackState = await safeEvaluate(page, () => {
                        const visible = (el) => {
                            if (!el) return false;
                            const style = window.getComputedStyle(el);
                            return style.display !== 'none'
                                && style.visibility !== 'hidden'
                                && el.offsetParent !== null
                                && !el.disabled;
                        };
                        return {
                            docDateVisible: visible(document.querySelector('#MainContent_txtDocDate')),
                            trxDateVisible: visible(document.querySelector('#MainContent_txtTrxDate')),
                            addVisible: visible(document.querySelector('#MainContent_btnAdd')),
                            visibleComboCount: Array.from(document.querySelectorAll('.ui-autocomplete-input.CBOBox')).filter(visible).length,
                            url: window.location.href
                        };
                    }).catch(() => null);

                    if (fallbackState?.trxDateVisible && fallbackState?.addVisible && fallbackState.visibleComboCount > 0) {
                        console.log(`  ℹ️ #MainContent_txtDocDate missing on ready detail page; continuing with transaction date field.`);
                        return;
                    }
                }
                throw new Error(`DOM input failed for ${params.selector}: ${result.reason}`);
            }
            context.__lastInputTarget = { selector: params.selector, index };
            console.log(`  ✅ Value set: "${result.value}"`);
            registerDomValuePair(context, {
                kind: 'input',
                selector: params.selector,
                index,
                value: params.value,
                actualValue: result.value,
                label: params.label || params.selector,
                restoreBeforeAdd: params.restoreBeforeAdd === true || params.selector === '#MainContent_txtHours' || params.selector === '#MainContent_txtAmount',
                requiredBeforeAdd: params.requiredBeforeAdd !== false,
                noPostback
            });
        }
    },

    /**
     * Alias for pressKey
     */
    press: async (page, params, context = {}) => {
        const key = params.key || 'Enter';
        console.log(`⌨️  Menekan tombol: ${key}`);
        const result = await dispatchKeyByDom(page, key, params.selector ? { selector: params.selector, index: params.index || 0 } : context.__lastInputTarget);
        if (!result.success) {
            console.log(`  ⚠️ DOM key dispatch failed (${result.reason}), fallback keyboard.`);
            await page.keyboard.press(key);
        }
    },

    /**
     * Mengklik elemen
     */
    click: async (page, params) => {
        console.log(`🖱️  Mengklik elemen: ${params.selector}`);
        await waitForElement(page, params.selector, params.timeout || 10000);

        const result = await clickElementByDom(page, params.selector, params.index || 0);
        if (!result.success) {
            console.log(`  ⚠️ DOM click failed (${result.reason}), fallback page.click.`);
            await page.click(params.selector);
        }
        if (params.waitForAspNet !== false && params.selector && /rblOT|Radio|radio/i.test(params.selector)) {
            const idle = await waitForAspNetIdle(page, params.timeout ? Math.min(params.timeout, 5000) : 5000, 400);
            console.log(`  ${idle.success ? '✅' : '⚠️'} Radio ASP.NET settle: ${idle.status} (${idle.elapsedMs}ms)`);
        }
        await sleep(300);
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
        const actualDuration = params.scale === false ? duration : scaleDelay(duration);
        console.log(`💤 Menunggu selama ${actualDuration}ms (template: ${duration}ms)`);
        await sleep(duration, { scale: params.scale !== false });
    },

    /**
     * Jalankan script JavaScript di halaman
     */
    executeJavascript: async (page, params, context) => {
        const script = params.script;
        const saveTo = params.saveTo;
        if (!script) {
            console.error(`⚠️ executeJavascript: Parameter 'script' required`);
            return;
        }

        console.log(`🖥️  Executing JS: ${script.substring(0, 50)}...`);
        try {
            // Evaluasi script (bisa return value)
            const result = await page.evaluate((scriptContent) => {
                // Function wrapper agar bisa return
                return new Function(scriptContent)();
            }, script);

            if (saveTo && context) {
                context[saveTo] = result;
                console.log(`  💾 Result saved to '${saveTo}':`, result);
            }
        } catch (err) {
            console.error(`❌ JS Execution Error: ${err.message}`);
            // Jangan throw error agar automation lanjut (kecuali kritikal?)
        }
    },

    /**
     * Submit form (optional action)
     */
    submit: async (page, params) => {
        console.log(`📤 Submit form: ${params.selector}`);
        await waitForElement(page, params.selector);
        await page.evaluate((selector) => {
            document.querySelector(selector).submit();
        }, params.selector);
    },

    /**
     * Screenshot untuk dokumentasi
     */
    screenshot: async (page, params) => {
        const filename = params.filename || `screenshot_${Date.now()}.png`;
        console.log(`📸 Mengambil screenshot: ${filename}`);
        await page.screenshot({
            path: filename,
            fullPage: params.fullPage !== false
        });
    },

    /**
     * Tekan tombol keyboard (Enter, Tab, Escape, dll)
     */
    pressKey: async (page, params, context = {}) => {
        const key = params.key || 'Enter';
        console.log(`⌨️  Menekan tombol: ${key}`);
        const result = await dispatchKeyByDom(page, key, params.selector ? { selector: params.selector, index: params.index || 0 } : context.__lastInputTarget);
        if (!result.success) {
            console.log(`  ⚠️ DOM key dispatch failed (${result.reason}), fallback keyboard.`);
            await page.keyboard.press(key);
        }
    },

    /**
     * Tekan tombol keyboard (Enter) dan tunggu halaman reload (berguna untuk ASP.NET postbacks)
     */
    pressKeyAndWaitForReload: async (page, params, context = {}) => {
        const key = params.key || 'Enter';
        const timeout = params.timeout || 30000;
        const settleTimeout = Math.min(timeout, params.settleTimeout || 8000);
        console.log(`⌨️🔄 Menekan tombol: ${key} dan menunggu ASP.NET settle...`);

        try {
            const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: settleTimeout })
                .then(() => ({ success: true, status: 'navigation' }))
                .catch(() => null);
            const idlePromise = waitForAspNetIdle(page, settleTimeout, 500);

            await dispatchKeyByDom(page, key, params.selector ? { selector: params.selector, index: params.index || 0 } : context.__lastInputTarget);
            const result = await Promise.race([navigationPromise, idlePromise]);
            await sleep(300);

            if (result?.success) {
                console.log(`✅ ASP.NET settle selesai (${result.status}, ${result.elapsedMs || 0}ms)`);
            } else {
                console.log(`⚠️ ASP.NET settle timeout ${settleTimeout}ms, lanjut ke wait selector berikutnya`);
            }
        } catch (error) {
            console.warn(`⚠️ Warning saat pressKeyAndWaitForReload: ${error.message}`);
        }
    },

    /**
     * Format date string to dd/mm/yyyy
     * Useful for converting yyyy-mm-dd to Millware's expected format
     */
    formatDate: async (page, params, context, engine) => {
        const dateStr = params.date || params.value;
        const variableName = params.saveTo || 'formattedDate';

        // Parse yyyy-mm-dd format
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            const formatted = `${day}/${month}/${year}`;

            console.log(`📅 Format tanggal: ${dateStr} → ${formatted}`);

            // Store DIRECTLY in context (top-level) for easy access
            context[variableName] = formatted;

            return formatted;
        }

        console.log(`⚠️  Format tanggal tidak valid: ${dateStr}`);
        return dateStr;
    },

    /**
     * Parse ChargeJob string to extract parts separated by '/'.
     * Text inside parentheses is ignored before inputting to Millware autocomplete.
     * Example: "(GA9010) VEHICLE RUNNING / BE001 (...) / 11 (...)"
     * Results: part1="VEHICLE RUNNING", part2="BE001", part3="11"
     * Also stores: chargeJobPartsCount, hasChargeJobPart2, hasChargeJobPart3
     * NEW: Also creates chargeJobPartsArray for dynamic task code filling
     */
    parseChargeJob: async (page, params, context, engine) => {
        const chargeJob = params.chargeJob || params.value || '';
        console.log(`🔍 Parsing ChargeJob: "${chargeJob}"`);

        // Split by '/' and remove descriptions/codes in parentheses before input.
        // Expense code is special: source usually comes as "L (LABOUR)", where
        // cleanup leaves a single "L". Keep it as LABOUR so the required field runs.
        const rawParts = chargeJob.split('/').map(p => p.trim()).filter(p => p.length >= 2);
        const parts = [];
        const partRawValues = [];
        let expenseFallbackApplied = false;

        for (const rawPart of rawParts) {
            const cleanPart = cleanChargeJobInputValue(rawPart);
            const expenseValue = normalizeExpenseCodeInputValue(rawPart, cleanPart);

            if (expenseValue) {
                while (parts.length < 3) {
                    parts.push('');
                    partRawValues.push('');
                }
                parts[3] = expenseValue;
                partRawValues[3] = rawPart;
                continue;
            }

            if (cleanPart.length >= 2) {
                parts.push(cleanPart);
                partRawValues.push(rawPart);
            }
        }

        if (!parts[3]) {
            while (parts.length < 3) {
                parts.push('');
                partRawValues.push('');
            }
            parts[3] = 'LABOUR';
            partRawValues[3] = 'LABOUR';
            expenseFallbackApplied = true;
        }

        // Store parts count for conditional logic (excluding Employee field)
        context.chargeJobPartsCount = parts.filter(p => p && p.length >= 2).length;
        // Expected field count = parts.length + 1 (for Employee field at index 0)
        // This is used by retryInputWithValidation to skip waiting for non-existent fields
        context.expectedFieldCount = parts.length + 1;
        context.chargeJobExpenseFallbackApplied = expenseFallbackApplied;
        console.log(`  📊 Total VALID parts found: ${context.chargeJobPartsCount}, Expected fields: ${context.expectedFieldCount}`);
        console.log(`  📋 Raw parts: ${JSON.stringify(rawParts)}`);
        console.log(`  📋 Clean parts: ${JSON.stringify(parts)}`);
        if (expenseFallbackApplied) {
            console.log(`  ⚠️ Expense Code missing from ChargeJob. Fallback set to "LABOUR"`);
        }

        // Store DIRECTLY in context (top-level) for easy access
        // Part 1: Task Code
        if (parts.length > 0 && parts[0] && parts[0].length >= 2) {
            const rawPart1 = partRawValues[0] || parts[0];
            context.chargeJobPart1 = rawPart1;
            context.chargeJobPart1Clean = parts[0];
            console.log(`  Part 1 (Raw)  : "${rawPart1}"`);
            console.log(`  Part 1 (Clean): "${context.chargeJobPart1Clean}"`);
        } else {
            context.chargeJobPart1 = "";
            context.chargeJobPart1Clean = "";
        }

        // Part 2: Resource/Equipment
        if (parts.length > 1 && parts[1] && parts[1].length >= 2) {
            context.chargeJobPart2 = parts[1];
            context.hasChargeJobPart2 = true;
            console.log(`  Part 2: "${context.chargeJobPart2}"`);
        } else {
            context.chargeJobPart2 = "";
            context.hasChargeJobPart2 = false;
        }

        // Part 3: Cost Center
        if (parts.length > 2 && parts[2] && parts[2].length >= 2) {
            context.chargeJobPart3 = parts[2];
            context.hasChargeJobPart3 = true;
            console.log(`  Part 3: "${context.chargeJobPart3}"`);
        } else {
            context.chargeJobPart3 = "";
            context.hasChargeJobPart3 = false;
        }

        // Part 4
        if (parts.length > 3 && parts[3] && parts[3].length >= 2) {
            context.chargeJobPart4 = parts[3];
            context.hasChargeJobPart4 = true;
            console.log(`  Part 4: "${context.chargeJobPart4}"`);
        } else {
            context.chargeJobPart4 = "";
            context.hasChargeJobPart4 = false;
        }

        // Part 5
        if (parts.length > 4 && parts[4] && parts[4].length >= 2) {
            context.chargeJobPart5 = parts[4];
            context.hasChargeJobPart5 = true;
            console.log(`  Part 5: "${context.chargeJobPart5}"`);
        } else {
            context.chargeJobPart5 = "";
            context.hasChargeJobPart5 = false;
        }

        // NEW: Create chargeJobPartsArray for dynamic task code filling
        // This array contains all parts (cleaned) for fillAllTaskCodes action
        context.chargeJobPartsArray = parts;
        console.log(`  📦 chargeJobPartsArray: ${JSON.stringify(context.chargeJobPartsArray)}`);
        console.log(`  ✅ ChargeJob parsed - ${parts.length} parts (hasP2: ${context.hasChargeJobPart2}, hasP3: ${context.hasChargeJobPart3}, hasP4: ${context.hasChargeJobPart4}, hasP5: ${context.hasChargeJobPart5})`);
    },

    /**
     * Check element state (disabled, value, etc.) and save to context
     */
    checkElementState: async (page, params, context) => {
        const { selector, index, saveTo } = params;
        console.log(`🔍 Checking state of: ${selector}${index !== undefined ? `[${index}]` : ''}`);

        try {
            // Wait briefly for element (optional)
            try {
                await page.waitForFunction((sel, idx) => {
                    const els = document.querySelectorAll(sel);
                    const visibleEls = Array.from(els).filter(el => el.offsetParent !== null);
                    return visibleEls.length > (idx || 0);
                }, { timeout: 2000 }, selector, index || 0);
            } catch (e) { }

            const state = await page.evaluate((sel, idx) => {
                const els = document.querySelectorAll(sel);
                const visibleEls = Array.from(els).filter(el => el.offsetParent !== null); // Filter visible only
                const el = visibleEls[idx || 0];

                if (!el) return { exists: false };

                return {
                    exists: true,
                    disabled: el.disabled || el.classList.contains('aspNetDisabled') || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled'),
                    readonly: el.readOnly || el.hasAttribute('readonly'),
                    checked: el.checked || el.getAttribute('checked') === 'checked' || el.getAttribute('checked') === 'true',
                    value: el.value || '',
                    text: el.textContent || ''
                };
            }, selector, index);

            console.log(`  📊 State: ${JSON.stringify(state)}`);

            if (saveTo) {
                context[saveTo] = state;
            }

            // Allow storing specific property directly if requested (e.g. saveTo="isTaskDisabled", listProperty="disabled")
            // But usually context[saveTo].disabled is enough.

        } catch (e) {
            console.error(`  ⚠️ Error checking state: ${e.message}`);
            if (saveTo) context[saveTo] = { exists: false, error: e.message };
        }
    },

    /**
     * Validasi apakah element memiliki text (untuk memastikan data berhasil diinput)
     */
    validateText: async (page, params) => {
        const selector = params.selector;
        const expectedMinLength = params.minLength || 1;

        console.log(`✓ Validasi: Mengecek text di ${selector}`);

        try {
            await waitForElement(page, selector, params.timeout || 5000);

            const text = await page.$eval(selector, el => el.textContent.trim());

            if (text && text.length >= expectedMinLength && text !== '0' && text !== '0.00') {
                console.log(`  ✅ Validasi berhasil: "${text}"`);
                return true;
            } else {
                console.log(`  ⚠️  Validasi gagal: text kosong atau 0`);
                if (params.throwOnFail) {
                    throw new Error(`Validation failed: ${selector} has no valid text`);
                }
                return false;
            }
        } catch (error) {
            console.log(`  ❌ Validasi error: ${error.message}`);
            if (params.throwOnFail) {
                throw error;
            }
            return false;
        }
    },

    /**
     * forEach - Loop through array data
     * params.items: path ke array dalam context (contoh: "data.data")
     * params.itemName: nama variable untuk setiap item (contoh: "employee")
     * params.steps: array of steps yang akan dijalankan untuk setiap item
     * WITH ERROR RECOVERY: On error, refresh page and skip to next item
     */
    forEach: async (page, params, context, engine) => {
        // Ambil array dari context menggunakan path
        const itemsPath = params.items || params.array;
        const keys = itemsPath.split('.');
        let items = context;

        for (const key of keys) {
            items = items ? items[key] : undefined;
        }

        if (!Array.isArray(items)) {
            throw new Error(`forEach: "${itemsPath}" bukan array atau tidak ditemukan di context`);
        }

        const itemName = params.itemName || 'item';
        const steps = params.steps || [];

        // Error recovery configuration
        const TASK_REGISTER_URL = 'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterList.aspx';
        const failedItems = [];

        // RESUME LOGIC
        const loopId = `${itemsPath}`; // Unique identifier for this loop
        let lastSuccessIndex = -1;

        // Try to get resume state if available
        if (engine && engine.recoveryManager) {
            lastSuccessIndex = engine.recoveryManager.getLoopState(loopId);
            if (lastSuccessIndex >= 0) {
                console.log(`⏩ RESUME: Skipping ${lastSuccessIndex + 1} previously completed items.`);
            }
        }

        console.log(`\n🔁 Loop forEach: ${items.length} items dari "${itemsPath}"`);
        console.log(`   Variable name: "${itemName}"`);
        console.log(`   Steps: ${steps.length} actions\n`);

        for (let i = 0; i < items.length; i++) {
            // Check if we should skip this item (Resume feature)
            if (i <= lastSuccessIndex) {
                continue;
            }

            // --- OPTIMIZATION 1: BROWSER RECYCLING ---
            // Restart browser setiap 20 item untuk mencegah Memory Leak (Chrome melambat seiring waktu)
            // Hanya restart jika bukan item pertama dan engine tersedia
            if (i > 0 && i % 20 === 0 && engine && !engine.disableBrowserRecycle) {
                console.log(`\n♻️  MEMORY OPTIMIZATION: Recycling Browser (Item ${i})...`);
                try {
                    await engine.closeBrowser();
                    await sleep(2000); // Cool down
                    await engine.launch();
                    console.log(`✅  Browser Refreshed!`);

                    // Navigate back to base URL if needed (biasanya template handle navigasi, tapi kita pastikan aman)
                    // Note: Karena kita me-restart, konteks halaman hilang. 
                    // Kita asumsikan langkah awal di 'steps' akan melakukan navigasi atau pengecekan yang benar.
                    // Jika steps mengasumsikan halaman sudah terbuka, kita perlu navigasi manual ke Task Register.
                    const TASK_REGISTER_URL = 'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterList.aspx';
                    await engine.page.goto(TASK_REGISTER_URL, { waitUntil: 'domcontentloaded' });

                } catch (recycleError) {
                    console.error(`⚠️ Gagal recycle browser: ${recycleError.message}. Melanjutkan...`);
                }
            }

            // --- OPTIMIZATION 2: JITTER (LOAD BALANCING) ---
            // Default kecil agar multi-tab lebih cepat; naikkan lewat env jika server lambat.
            const jitter = getLoopJitterDelay();
            if (jitter > 0) {
                await sleep(jitter, { scale: false });
            }

            const item = items[i];
            const itemLabel = item.EmployeeName || item.PTRJEmployeeID || `Item ${i + 1}`;
            console.log(`\n  ┌─ Iteration ${i + 1}/${items.length}: ${itemLabel} ─────`);

            // Mark as STARTED to handle crash recovery (skip this item if we crash)
            if (engine && engine.recoveryManager) {
                engine.recoveryManager.saveLoopProgress(loopId, i, 'STARTED');
            }

            // Buat context baru dengan item saat ini
            const loopContext = {
                ...context,
                [itemName]: item,
                index: i,
                isFirst: i === 0,
                isLast: i === items.length - 1
            };

            try {
                // Execute steps dengan context baru
                await engine.executeSteps(steps, loopContext, 2);

                // Save progress AFTER successful iteration
                if (engine && engine.recoveryManager) {
                    engine.recoveryManager.saveLoopState(loopId, i);
                }

                console.log(`  └─────────────────────────\n`);
            } catch (error) {
                // ═══ ERROR RECOVERY ═══
                console.error(`\n  ⚠️ ERROR at ${itemLabel}: ${error.message}`);
                console.log(`  🔄 RECOVERY: Refreshing page and skipping to next employee...`);

                failedItems.push({ label: itemLabel, error: error.message });

                try {
                    // ═══ SMART RECOVERY ═══
                    const currentUrl = page.url();
                    console.log(`  🔄 RECOVERY: Current URL is ${currentUrl}`);

                    if (currentUrl.includes('chrome-error://chromewebdata') || currentUrl.includes('SessionExpire')) {
                        console.log(`  🔐 RECOVERY: Browser/session error page detected. Re-login on current tab...`);
                        if (!engine?.recoverMillwareSession || !(await engine.recoverMillwareSession('loop recovery error page'))) {
                            throw new Error('Session recovery failed from browser error page');
                        }
                    } else if (currentUrl.includes('frmPrTrxTaskRegisterDet.aspx')) {
                        console.log(`  🔄 RECOVERY: On Input/Detail Page. Reloading...`);
                        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                    } else if (currentUrl.includes('frmPrTrxTaskRegisterList.aspx')) {
                        console.log(`  🔄 RECOVERY: On List Page. Clicking "New" to return to input...`);
                        try {
                            await page.waitForSelector('#MainContent_btnNew', { visible: true, timeout: 5000 });
                            await page.click('#MainContent_btnNew');
                            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
                        } catch (navError) {
                            console.log(`  ⚠️ Failed to click New on List page: ${navError.message}. Force navigating...`);
                            await page.goto(TASK_REGISTER_URL, { waitUntil: 'domcontentloaded' });
                            await page.waitForSelector('#MainContent_btnNew', { visible: true });
                            await page.click('#MainContent_btnNew');
                        }
                    } else {
                        console.log(`  🔄 RECOVERY: On unknown page. Navigating to List...`);
                        await page.goto(TASK_REGISTER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForSelector('#MainContent_btnNew', { visible: true });
                        await page.click('#MainContent_btnNew');
                    }

                    await page.waitForSelector('.ui-autocomplete-input.CBOBox', { visible: true, timeout: 15000 });

                    console.log(`  ✅ RECOVERY: Ready to continue.`);
                    console.log(`  └─────────────────────────\n`);
                } catch (recoveryError) {
                    if (/ERR_TOO_MANY_REDIRECTS|chrome-error/i.test(recoveryError.message || '') && engine?.recoverMillwareSession) {
                        console.log(`  🔐 RECOVERY: Redirect loop detected. Clearing cookies and re-login...`);
                        if (await engine.recoverMillwareSession('redirect loop during recovery')) {
                            console.log(`  ✅ RECOVERY: Ready after re-login.`);
                            console.log(`  └─────────────────────────\n`);
                            continue;
                        }
                    }
                    console.error(`  ❌ RECOVERY FAILED: ${recoveryError.message}`);
                    console.log(`  Attempting to continue anyway...`);
                    console.log(`  └─────────────────────────\n`);
                }
            }
        }

        // Report failed items at the end
        if (failedItems.length > 0) {
            console.log(`\n⚠️ EMPLOYEE LOOP SUMMARY: ${failedItems.length} employees failed:`);
            failedItems.forEach(item => {
                console.log(`   - ${item.label}: ${item.error}`);
            });
            console.log('');
        }
    },

    /**
     * forEachProperty - Loop through object properties
     * Berguna untuk loop tanggal dalam Attendance object
     * WITH ERROR RECOVERY: On error, refresh page and skip to next item
     */
    forEachProperty: async (page, params, context, engine) => {
        const objectPath = params.object;
        const keys = objectPath.split('.');
        let obj = context;

        for (const key of keys) {
            obj = obj ? obj[key] : undefined;
        }

        if (!obj || typeof obj !== 'object') {
            throw new Error(`forEachProperty: "${objectPath}" bukan object atau tidak ditemukan`);
        }

        const keyName = params.keyName || 'key';
        const valueName = params.valueName || 'value';
        const steps = params.steps || [];

        // Error recovery configuration
        const TASK_REGISTER_URL = 'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterList.aspx';
        const failedItems = [];

        const entries = Object.entries(obj);
        console.log(`\n🔁 Loop forEachProperty: ${entries.length} properties dari "${objectPath}"`);
        console.log(`   Steps: ${steps.length} actions\n`);

        for (let i = 0; i < entries.length; i++) {
            const [key, value] = entries[i];

            // ═══ EARLY EXIT: If employee input failed, skip remaining dates ═══
            if (context.metadata && context.metadata.employeeInputFailed) {
                console.log(`\n  ⏭️ SKIP DATE ${key}: Employee input failed, skipping to next employee`);
                continue;
            }

            console.log(`\n  ┌─ Property ${i + 1}/${entries.length}: ${key} ─────`);

            const loopContext = {
                ...context,
                [keyName]: key,
                [valueName]: value,
                index: i,
                isFirst: i === 0,
                isLast: i === entries.length - 1
            };

            try {
                // Execute steps for this attendance
                await engine.executeSteps(steps, loopContext, 2);
                console.log(`  └─────────────────────────\n`);
            } catch (error) {
                // ═══ ERROR RECOVERY ═══
                console.error(`\n  ⚠️ ERROR at ${key}: ${error.message}`);
                console.log(`  🔄 RECOVERY: Refreshing page and skipping to next...`);

                failedItems.push({ key, error: error.message });

                try {
                    // ═══ SMART RECOVERY ═══
                    const currentUrl = page.url();
                    console.log(`  🔄 RECOVERY: Current URL is ${currentUrl}`);

                    if (currentUrl.includes('chrome-error://chromewebdata') || currentUrl.includes('SessionExpire')) {
                        console.log(`  🔐 RECOVERY: Browser/session error page detected. Re-login on current tab...`);
                        if (!engine?.recoverMillwareSession || !(await engine.recoverMillwareSession('loop recovery error page'))) {
                            throw new Error('Session recovery failed from browser error page');
                        }
                    } else if (currentUrl.includes('frmPrTrxTaskRegisterDet.aspx')) {
                        console.log(`  🔄 RECOVERY: On Input/Detail Page. Reloading...`);
                        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                    } else if (currentUrl.includes('frmPrTrxTaskRegisterList.aspx')) {
                        console.log(`  🔄 RECOVERY: On List Page. Clicking "New" to return to input...`);
                        try {
                            await page.waitForSelector('#MainContent_btnNew', { visible: true, timeout: 5000 });
                            await page.click('#MainContent_btnNew');
                            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
                        } catch (navError) {
                            console.log(`  ⚠️ Failed to click New on List page: ${navError.message}. Force navigating...`);
                            await page.goto(TASK_REGISTER_URL, { waitUntil: 'domcontentloaded' });
                            await page.waitForSelector('#MainContent_btnNew', { visible: true });
                            await page.click('#MainContent_btnNew');
                        }
                    } else {
                        console.log(`  🔄 RECOVERY: On unknown page. Navigating to List...`);
                        await page.goto(TASK_REGISTER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForSelector('#MainContent_btnNew', { visible: true });
                        await page.click('#MainContent_btnNew');
                    }

                    await page.waitForSelector('.ui-autocomplete-input.CBOBox', { visible: true, timeout: 15000 });

                    console.log(`  ✅ RECOVERY: Ready to continue.`);
                    console.log(`  └─────────────────────────\n`);
                } catch (recoveryError) {
                    if (/ERR_TOO_MANY_REDIRECTS|chrome-error/i.test(recoveryError.message || '') && engine?.recoverMillwareSession) {
                        console.log(`  🔐 RECOVERY: Redirect loop detected. Clearing cookies and re-login...`);
                        if (await engine.recoverMillwareSession('redirect loop during recovery')) {
                            console.log(`  ✅ RECOVERY: Ready after re-login.`);
                            console.log(`  └─────────────────────────\n`);
                            continue;
                        }
                    }
                    console.error(`  ❌ RECOVERY FAILED: ${recoveryError.message}`);
                    console.log(`  Attempting to continue anyway...`);
                    console.log(`  └─────────────────────────\n`);
                }
            }
        }

        // Report failed items at the end
        if (failedItems.length > 0) {
            console.log(`\n⚠️ SUMMARY: ${failedItems.length} items failed during processing:`);
            failedItems.forEach(item => {
                console.log(`   - ${item.key}: ${item.error}`);
            });
            console.log('');
            context.employeeFailed = true;
            if (!context.metadata) context.metadata = {};
            context.metadata.employeeFailed = true;
            context.failedAttendanceItems = failedItems;
        }
    },

    /**
     * if - Conditional execution
     * params.condition: expression to evaluate (simple comparison)
     * params.thenSteps: steps to execute if true
     * params.elseSteps: steps to execute if false (optional)
     */
    if: async (page, params, context, engine) => {
        const { condition, thenSteps, elseSteps } = params;

        if (thenSteps) console.log(`   Running IF (thenSteps count: ${thenSteps.length})`);
        if (elseSteps) console.log(`   Running IF (elseSteps count: ${elseSteps.length})`);

        // Evaluate simple condition
        let result = false;

        // Simple evaluation: check if value exists and is truthy
        if (typeof condition === 'string') {
            // CHECK: Is this an expression or a simple variable?
            // If it contains operators OR starts with unary NOT (!), treat as expression
            const isExpression =
                condition.includes(' === ') || condition.includes(' !== ') ||
                condition.includes(' == ') || condition.includes(' != ') ||
                condition.includes(' || ') || condition.includes(' && ') ||
                condition.includes(' > ') || condition.includes(' < ') ||
                condition.startsWith('!');  // Support unary NOT operator at start

            if (isExpression) {

                try {
                    // Evaluate expression using context variables
                    const fn = new Function('context', `with(context) { return ${condition}; }`);
                    result = fn(context);
                } catch (e) {
                    console.log(`  ⚠️ Failed to evaluate expression "${condition}": ${e.message}`);
                    // Fallback to false on error
                    result = false;
                }
            } else {
                // Legacy/Simple Mode: Variable substitution + Truthy check with Blacklist
                const value = engine.substituteVariables(`\${${condition}}`, context);
                // Treat specific status strings as falsy to prevent "Regular Input"
                result = !!value &&
                    value !== 'null' &&
                    value !== 'undefined' &&
                    value !== 'false' &&  // CRITICAL FIX: string 'false' (from JSON) should be falsy!
                    value !== '0' &&
                    value !== 'ALFA' &&
                    value !== 'ALPHA' &&
                    value !== 'OFF' &&
                    value !== 'LIBUR';
            }
        } else if (typeof condition === 'boolean') {
            result = condition;
        }

        console.log(`\n🔀 Conditional: ${condition} = ${result}`);

        if (result && thenSteps) {
            console.log(`  ✓ Executing THEN branch (${thenSteps.length} steps)`);
            await engine.executeSteps(thenSteps, context, 1);
        } else if (!result && elseSteps) {
            console.log(`  ✗ Executing ELSE branch (${elseSteps.length} steps)`);
            await engine.executeSteps(elseSteps, context, 1);
        } else {
            console.log(`  ○ No branch to execute`);
        }
    },

    /**
     * log - Debug logging
     */
    log: async (page, params, context) => {
        const message = params.message || params.text || '';
        console.log(`📝 LOG: ${message}`);
        if (params.value) {
            console.log(`   Value:`, params.value);
        }
    },

    /**
     * checkPageAndNavigate - Stay on detail page for input (no more list page detours!)
     * This ensures the automation stays on the detail page after clicking Add button
     * and doesn't navigate to the list page anymore
     */
    checkPageAndNavigate: async (page, params, context, engine) => {
        const currentUrl = page.url();
        console.log(`📍 Current URL: ${currentUrl}`);

        // If we're on the List page (which shouldn't happen now), log and stay on detail
        if (currentUrl.includes('frmPrTrxTaskRegisterList.aspx')) {
            console.log(`⚠️ On List page - this should not happen anymore!`);
            // Instead of navigating to detail, we'll just log and continue
            // This indicates the automation is working correctly if we don't see this message
        } else if (currentUrl.includes('frmPrTrxTaskRegisterDet.aspx')) {
            console.log(`✅ Already on Detail page - staying here for continuous input...`);
        } else {
            console.log(`⚠️ Unknown page detected: ${currentUrl}`);
        }
    },

    /**
     * checkEmployeeInputSuccess - Check if employee input succeeded
     * Verifies that the employee dropdown selection worked by checking if expected form elements appear
     * Sets metadata.employeeInputFailed flag for conditional processing
     * params.successSelector: selector to check for (default: #MainContent_ddlShift)
     * params.timeout: how long to wait for success indicator (default: 3000ms)
     */
    checkEmployeeInputSuccess: async (page, params, context, engine) => {
        const { successSelector = '#MainContent_ddlShift', timeout = 3000 } = params;

        try {
            await page.waitForSelector(successSelector, { timeout });
            console.log(`✅ Employee input successful - ${successSelector} found`);
            if (!context.metadata) context.metadata = {};
            context.metadata.employeeInputFailed = false;
            const lastFailed = context.metadata.lastFailedInput || {};
            const failedSelector = String(lastFailed.selector || '');
            const failedIndex = lastFailed.index || 0;
            const wasEmployeeInput = failedIndex === 0 || failedSelector.includes('employee') || failedSelector.includes('Employee');
            if (wasEmployeeInput) {
                context.metadata.inputFailed = false;
                delete context.metadata.lastFailedInput;
            }
            return true;
        } catch (error) {
            console.log(`⚠️ Employee input likely failed - ${successSelector} not found within ${timeout}ms`);
            console.log(`🔄 Will skip remaining form steps for this employee...`);
            if (!context.metadata) context.metadata = {};
            context.metadata.employeeInputFailed = true;
            return false;
        }
    },

    /**
     * Retry input logic if validation element appears
     * Useful for Millware's fragile autocomplete
     * params.selector: input selector
     * params.value: value to type
     * params.index: input index (optional)
     * params.confirmKey: key to press after type (default: Enter)
     * params.validationSelector: selector for error message (e.g. "Please select Task Code")
     * params.maxRetries: max attempts (default 5)
     * params.formReentryFields: array of previous fields to re-input when validation error detected
     *   Each field: { selector, value, index?, isDropdown? }
     */
    retryInputWithValidation: async (page, params, context, engine) => {
        const {
            selector,
            value,
            index,
            validationSelector,
            maxRetries = 1,
            formReentryFields = [],
            stopConditionSelector,
            expectedFieldCount,
            forceInput = false,
            checkIfAlreadyFilled = true,
            fallbackValue,
            fallbackSearchValue
        } = params;

        const isExpenseCodeField = params.expenseCode === true
            || validationSelector === '#MainContent_MultiDimAcc_reqValExpCode';

        if (isExpenseCodeField) {
            const requestedExpense = String(value || '').trim() || String(fallbackValue || 'LABOUR').trim();
            const expenseFallback = String(fallbackValue || 'LABOUR').trim();
            console.log(`🔁 Input Expense Code via hidden select: "${requestedExpense}" (fallback: "${expenseFallback}")`);

            const expenseResult = await selectExpenseCodeByDom(page, requestedExpense, {
                fallbackValue: expenseFallback,
                selector: params.expenseSelector || '#MainContent_MultiDimAcc_ddlExpCode',
                timeout: params.timeout || 12000,
                settleTimeout: params.settleTimeout || 8000
            });

            if (expenseResult.success) {
                console.log(`  ✅ Expense Code selected: "${expenseResult.optionText || requestedExpense}" (${expenseResult.optionValue})`);
                registerDomValuePair(context, {
                    kind: 'expense',
                    selector: params.expenseSelector || '#MainContent_MultiDimAcc_ddlExpCode',
                    index: 0,
                    value: requestedExpense,
                    actualValue: expenseResult.optionText || requestedExpense,
                    label: 'Expense Code',
                    restoreBeforeAdd: true,
                    requiredBeforeAdd: true
                });
                console.log(`  └─────────────────────────\n`);
                return;
            }

            console.log(`  ❌ Expense Code input failed: ${expenseResult.reason || 'unknown error'}`);
            if (expenseResult.sample) {
                console.log(`  📋 Expense option sample: ${JSON.stringify(expenseResult.sample)}`);
            }
            console.log(`⏭️  FAIL-FORWARD: continuing so Add can show Millware validation if needed\n`);
            if (!context.metadata) context.metadata = {};
            context.metadata.inputFailed = true;
            context.metadata.lastFailedInput = {
                selector: params.expenseSelector || '#MainContent_MultiDimAcc_ddlExpCode',
                index,
                value: requestedExpense,
                timestamp: Date.now()
            };
            return;
        }

        // CRITICAL: If expectedFieldCount is provided and target index is >= expectedFieldCount, skip immediately
        // This prevents waiting 20s for fields that don't exist (e.g., index 3 when only 2 jobs in charge job)
        if (expectedFieldCount !== undefined && index !== undefined && index >= expectedFieldCount) {
            console.log(`⏭️  Skipping input for index ${index}: expectedFieldCount is ${expectedFieldCount}`);
            return;
        }

        console.log(`🔁 Input (fail-forward): "${value}" into ${selector} (Attempts: ${maxRetries}, ExpectedFields: ${expectedFieldCount || 'N/A'}, ForceInput: ${forceInput})`);

        // Helper: Check for any visible validation error containing "Please"
        const checkForValidationErrors = async () => {
            try {
                const errorSpans = await page.$$('span[style*="color:Red"], span[style*="color: red"], span.RedText');
                for (const span of errorSpans) {
                    const isVisible = await span.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
                    });
                    if (isVisible) {
                        const text = await span.evaluate(el => el.textContent.trim());
                        if (text.toLowerCase().includes('please')) {
                            return { hasError: true, message: text };
                        }
                    }
                }
            } catch (e) { }
            return { hasError: false, message: '' };
        };

        // Helper: Re-input a single field
        const reInputField = async (field) => {
            // ═══ RADIO BUTTON SUPPORT ═══
            // If field has action property, it's a special action (like clicking radio button)
            if (field.action === 'clickRadioButton') {
                console.log(`    🔘 Re-clicking radio button: ${field.selector}`);
                try {
                    const clickResult = await clickElementByDom(page, field.selector, field.index || 0);
                    if (clickResult.success) {
                        const waitTime = field.waitAfter || 3000;
                        console.log(`    ⏳ Waiting ${scaleDelay(waitTime)}ms for radio button postback (template: ${waitTime}ms)...`);
                        await sleep(waitTime);
                    } else {
                        console.log(`    ⚠️ Radio button not clicked: ${field.selector} (${clickResult.reason})`);
                    }
                } catch (e) {
                    console.log(`    ⚠️ Failed to click radio button: ${e.message}`);
                }
                return; // Done with radio button, exit early
            }

            // ═══ TEXT INPUT LOGIC (existing code) ═══
            console.log(`    🔄 Re-entering: ${field.selector}[${field.index}] = "${field.value}"`);
            let elementHandle;

            try {
                // CRITICAL: Wait for page to be stable before trying to find elements
                // ASP.NET postbacks can temporarily remove all elements from DOM
                await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 }).catch(() => { });

                // Wait for the form table to be present (indicates page has loaded)
                await page.waitForFunction(
                    () => document.querySelector('#MainContent_tblSelection') !== null,
                    { timeout: 10000 }
                ).catch(() => {
                    console.log(`    ⚠️ Form table not found, waiting...`);
                });

                // Extra stabilization wait
                await sleep(500);

                if (field.index !== undefined) {
                    // Retry loop to find element (it may not be visible immediately after postback)
                    const findStartTime = Date.now();
                    while (Date.now() - findStartTime < 15000) {
                        const elements = await page.$$(field.selector);
                        const visibleElements = [];
                        for (const el of elements) {
                            try {
                                const isVisible = await el.evaluate(node => node.offsetParent !== null);
                                if (isVisible) visibleElements.push(el);
                            } catch (e) {
                                // Element became stale, skip
                            }
                        }
                        if (visibleElements.length > field.index) {
                            elementHandle = visibleElements[field.index];
                            break;
                        }
                        await sleep(500);
                    }
                } else {
                    elementHandle = await page.$(field.selector);
                }

                if (!elementHandle) {
                    console.log(`    ⚠️ Element not found for re-entry`);
                    return;
                }

                const fieldIndex = field.index || 0;
                const isCascadingChargeJobField = field.selector.includes('CBOBox') && Number(fieldIndex) > 0;
                const pairedSelectResult = isCascadingChargeJobField
                    ? { success: false, reason: 'skipped for cascading Charge Job field' }
                    : await selectPairedHiddenSelect(page, field.selector, fieldIndex, field.value);
                if (pairedSelectResult.success) {
                    console.log(`    ✅ Re-entry via paired select: "${pairedSelectResult.optionText || field.value}"`);
                } else {
                    const autocompleteResult = await setAutocompleteInputByDom(page, field.selector, fieldIndex, field.value, {
                        dropdownWait: 800,
                        afterSelectWait: 700,
                        requireOption: isCascadingChargeJobField,
                        slowUntilSingle: isCascadingChargeJobField,
                        slowValue: field.value
                    });
                    console.log(`    📋 DOM autocomplete: ${autocompleteResult.method || autocompleteResult.reason || 'unknown'}`);
                }
                await sleep(1500); // Wait for page update

                // Verify field was filled
                const verifyResult = await elementHandle.evaluate(el => el.value || '');
                console.log(`    📋 Field value after re-entry: "${verifyResult}"`);

            } catch (e) {
                console.log(`    ⚠️ Failed to re-enter field: ${e.message}`);
            }
        };

        // Helper: Verify if input field has a value (not empty)
        // Includes retry logic for elements that may be temporarily unavailable during postbacks
        const verifyInputValue = async (sel, idx) => {
            // Retry a few times in case page is still loading
            for (let verifyRetry = 0; verifyRetry < 3; verifyRetry++) {
                try {
                    let elementHandle;
                    if (idx !== undefined) {
                        const elements = await page.$$(sel);
                        const visibleElements = [];
                        for (const el of elements) {
                            try {
                                const isVisible = await el.evaluate(node => node.offsetParent !== null);
                                if (isVisible) visibleElements.push(el);
                            } catch (e) {
                                // Element became stale, skip
                            }
                        }
                        if (visibleElements.length > idx) {
                            elementHandle = visibleElements[idx];
                        }
                    } else {
                        elementHandle = await page.$(sel);
                    }

                    if (!elementHandle) {
                        // Element not found, wait and retry
                        await sleep(500);
                        continue;
                    }

                    const inputValue = await elementHandle.evaluate(el => el.value || '');
                    return { hasValue: inputValue.trim().length > 0, value: inputValue.trim() };
                } catch (e) {
                    // Wait and retry
                    await sleep(500);
                }
            }
            return { hasValue: false, value: '' };
        };

        // Helper: Check if previous fields need to be re-entered
        const checkPreviousFieldsNeedReentry = async () => {
            for (const field of formReentryFields) {
                const result = await verifyInputValue(field.selector, field.index);
                if (!result.hasValue) {
                    console.log(`  ⚠️ Previous field ${field.selector}[${field.index}] is empty, need re-entry`);
                    return true;
                }
            }
            return false;
        };

        // Helper: Capture form state and log HTML structure for debugging
        const captureFormState = async () => {
            try {
                const formState = await page.evaluate(() => {
                    // Get all CBOBox inputs (autocomplete fields)
                    const cboBoxes = document.querySelectorAll('.ui-autocomplete-input.CBOBox');
                    const fieldValues = [];
                    cboBoxes.forEach((el, idx) => {
                        fieldValues.push({
                            index: idx,
                            value: el.value || '(empty)',
                            visible: el.offsetParent !== null
                        });
                    });

                    // Get all visible validation errors
                    const errors = [];
                    const errorSpans = document.querySelectorAll('span');
                    errorSpans.forEach(span => {
                        const style = window.getComputedStyle(span);
                        if (style.display !== 'none' && span.offsetHeight > 0) {
                            const text = span.textContent.trim();
                            if (text.toLowerCase().includes('please')) {
                                errors.push(text);
                            }
                        }
                    });

                    // Get key form elements HTML
                    const formTable = document.querySelector('#MainContent_tblSelection');
                    const formHTML = formTable ? formTable.outerHTML.substring(0, 2000) : 'Form not found';

                    return { fieldValues, errors, formHTML };
                });

                console.log('\n  ═══════════════════════════════════════════════');
                console.log('  📊 FORM STATE CAPTURE');
                console.log('  ═══════════════════════════════════════════════');
                console.log('  Field Values:');
                formState.fieldValues.forEach(f => {
                    const status = f.value === '(empty)' ? '❌' : '✅';
                    console.log(`    ${status} [${f.index}]: "${f.value}" ${f.visible ? '' : '(hidden)'}`);
                });

                if (formState.errors.length > 0) {
                    console.log('  \n  ⚠️ Validation Errors:');
                    formState.errors.forEach(e => console.log(`    - ${e}`));
                }

                console.log('  \n  📄 Form HTML (truncated):');
                console.log('  ' + formState.formHTML.substring(0, 500) + '...');
                console.log('  ═══════════════════════════════════════════════\n');

                return formState;
            } catch (e) {
                console.log(`  ⚠️ Failed to capture form state: ${e.message}`);
                return { fieldValues: [], errors: [], formHTML: '' };
            }
        };

        // Helper: Wait for element to be fully ready (visible, enabled, and stable)
        const waitForElementReady = async (sel, idx, timeoutMs = 5000) => {
            const startTime = Date.now();
            let lastValue = null;
            let stableCount = 0;

            while (Date.now() - startTime < timeoutMs) {
                try {
                    const elements = await page.$$(sel);
                    const visibleElements = [];
                    for (const el of elements) {
                        const isVisible = await el.evaluate(node => node.offsetParent !== null);
                        if (isVisible) visibleElements.push(el);
                    }

                    // Check stop condition if target not found yet
                    if ((idx === undefined || visibleElements.length <= idx) && stopConditionSelector) {
                        const stopEl = await page.$(stopConditionSelector);
                        if (stopEl) {
                            const isStopVisible = await stopEl.evaluate(node => node.offsetParent !== null && node.offsetHeight > 0);
                            if (isStopVisible) {
                                console.log(`  🛑 Stop condition met: ${stopConditionSelector} is visible. Skipping target.`);
                                return 'skipped';
                            }
                        }
                    }

                    if (idx !== undefined && visibleElements.length > idx) {
                        const el = visibleElements[idx];
                        const state = await el.evaluate(node => ({
                            enabled: !node.disabled,
                            visible: node.offsetParent !== null,
                            value: node.value || ''
                        }));

                        if (state.visible && state.enabled) {
                            // Check if value is stable (not loading)
                            if (lastValue === state.value) {
                                stableCount++;
                                if (stableCount >= 2) {
                                    console.log(`  ✅ Element [${idx}] ready: visible=${state.visible}, enabled=${state.enabled}`);
                                    return true;
                                }
                            } else {
                                lastValue = state.value;
                                stableCount = 0;
                            }
                        }
                    }
                } catch (e) { }

                await sleep(200);
            }

            console.log(`  ⚠️ Element [${idx}] not ready after ${timeoutMs}ms`);
            return false;
        };

        // Helper: Get a fresh element reference (prevents stale handle errors)
        const getFreshElement = async (sel, idx) => {
            const elements = await page.$$(sel);
            const visibleElements = [];
            for (const el of elements) {
                try {
                    const isVisible = await el.evaluate(node => node.offsetParent !== null);
                    if (isVisible) visibleElements.push(el);
                } catch (e) {
                    // Element became stale, skip it
                }
            }
            if (idx !== undefined && visibleElements.length > idx) {
                return visibleElements[idx];
            }
            return visibleElements[0] || null;
        };

        // Helper: Wait for page to be stable (no ongoing navigation)
        const waitForPageStable = async (timeoutMs = 3000) => {
            try {
                await page.waitForFunction(() => document.readyState === 'complete', { timeout: timeoutMs });
                await sleep(500); // Extra stabilization
            } catch (e) {
                // Timeout is ok, continue
            }
        };

        const waitForVisibleInputCount = async (sel, minCount, timeoutMs = 15000) => {
            try {
                await page.waitForFunction(
                    (selector, expectedCount) => {
                        const elements = Array.from(document.querySelectorAll(selector));
                        const visibleCount = elements.filter((el) => {
                            const style = window.getComputedStyle(el);
                            return style.display !== 'none'
                                && style.visibility !== 'hidden'
                                && el.offsetParent !== null
                                && !el.disabled;
                        }).length;
                        return visibleCount >= expectedCount;
                    },
                    { timeout: timeoutMs },
                    sel,
                    minCount
                );
                return true;
            } catch (_) {
                return false;
            }
        };

        const resolveExpectedFieldCount = () => {
            const raw = expectedFieldCount !== undefined ? expectedFieldCount : context.expectedFieldCount;
            const resolved = Number(raw);
            return Number.isFinite(resolved) ? resolved : undefined;
        };

        // Helper: Safe evaluate that handles navigation errors
        const safeEvaluate = async (fn, ...args) => {
            for (let retry = 0; retry < 3; retry++) {
                try {
                    return await page.evaluate(fn, ...args);
                } catch (e) {
                    if (e.message.includes('context was destroyed') || e.message.includes('navigation')) {
                        console.log(`  ⚠️ Page navigated, waiting for stability...`);
                        await waitForPageStable();
                    } else {
                        throw e;
                    }
                }
            }
            return null;
        };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const isLastAttempt = attempt === maxRetries;
            console.log(`  ┌─ Input Attempt ${attempt}/${maxRetries} ${isLastAttempt ? '(FINAL - will skip on failure)' : ''} ─────`);

            // STRICT ENFORCEMENT: ALWAYS check and fill previous fields BEFORE attempting current input
            // This prevents skipping to next field when prior fields are empty
            if (formReentryFields.length > 0) {
                let previousFieldsValid = false;
                let reentryAttempt = 0;
                const maxReentryAttempts = 3;

                while (!previousFieldsValid && reentryAttempt < maxReentryAttempts) {
                    reentryAttempt++;

                    // CRITICAL: Wait for page stability BEFORE checking fields
                    // ASP.NET postbacks can temporarily remove elements
                    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 }).catch(() => { });
                    await page.waitForFunction(
                        () => document.querySelector('#MainContent_tblSelection') !== null,
                        { timeout: 5000 }
                    ).catch(() => { });
                    await sleep(500);

                    // Check each previous field
                    let allFieldsFilled = true;
                    for (const field of formReentryFields) {
                        const result = await verifyInputValue(field.selector, field.index);
                        if (!result.hasValue) {
                            console.log(`  ❌ Required field [${field.index}] is EMPTY - must fill before proceeding`);
                            allFieldsFilled = false;
                        } else {
                            console.log(`  ✅ Field [${field.index}] has value: "${result.value}"`);
                        }
                    }

                    if (!allFieldsFilled) {
                        console.log(`  🔄 Re-entry attempt ${reentryAttempt}/${maxReentryAttempts}: Filling all previous fields...`);

                        // Capture form state for debugging
                        await captureFormState();

                        // Re-enter all previous fields
                        for (const field of formReentryFields) {
                            await reInputField(field);

                            // Verify this field was filled after input
                            const verifyResult = await verifyInputValue(field.selector, field.index);
                            if (!verifyResult.hasValue) {
                                console.log(`  ⚠️ Field [${field.index}] still empty after input, retrying...`);
                                await reInputField(field);
                            }
                        }
                        await sleep(1500);
                    } else {
                        previousFieldsValid = true;
                        console.log(`  ✅ All previous fields verified as filled`);
                    }
                }

                if (!previousFieldsValid) {
                    console.log(`  ❌ Could not fill previous fields after ${maxReentryAttempts} attempts`);
                    await captureFormState();
                    throw new Error(`Prerequisites not met: previous fields could not be filled`);
                }
            }

            // Also check for validation errors
            const preCheck = await checkForValidationErrors();
            if (preCheck.hasError) {
                console.log(`  ⚠️ Validation error still present: "${preCheck.message}"`);
            }

            // 0. Wait for element to be ready before proceeding
            console.log(`  ⏳ Waiting for element [${index}] to be ready...`);
            const readyState = await waitForElementReady(selector, index, 20000);
            if (readyState === 'skipped') {
                console.log(`  ⏭️  Skipping input: Stop condition met.`);
                return;
            }

            // optimization: Check if field already has a value (skip if filled, unless forceInput is true)
            if (!forceInput && checkIfAlreadyFilled) {
                try {
                    const currentStatus = await verifyInputValue(selector, index);
                    if (currentStatus.hasValue && currentStatus.value && currentStatus.value.trim().length > 0) {
                        console.log(`  ⏭️  Field already filled with: "${currentStatus.value}". Skipping input.`);
                        return true;
                    }
                } catch (e) {
                    console.log(`  ⚠️ Failed to check existing value: ${e.message}. Proceeding with input.`);
                }
            } else if (forceInput) {
                console.log(`  🔧 Force input enabled - will overwrite existing value`);
            }

            // 1. Find Element (Manual logic to support incremental typing)
            let elementHandle;
            if (index !== undefined) {
                // Reuse logic from safeTypeAtIndex to find correct visible element
                // Wait for presence
                try {
                    await page.waitForFunction(
                        (sel, idx) => document.querySelectorAll(sel).length >= idx + 1,
                        { timeout: 15000 }, selector, index
                    );
                } catch (e) { } // ignore timeout, proceed to find

                // 1. Find Element (Manual logic to support incremental typing)
                // Wait loop for finding element visibility
                const findStartTime = Date.now();
                while (true) {
                    const elements = await page.$$(selector);
                    const visibleElements = [];
                    for (const el of elements) {
                        try {
                            const isVisible = await el.evaluate(node => node.offsetParent !== null);
                            if (isVisible) visibleElements.push(el);
                        } catch (e) { }
                    }

                    if (visibleElements.length > index) {
                        elementHandle = visibleElements[index];
                        break;
                    }
                    // Timeout after 20 seconds (increased for ASP.NET postbacks)
                    if (Date.now() - findStartTime > 20000) {
                        console.log(`  ❌ Element at index ${index} not found. Found ${visibleElements.length} visible.`);
                        await captureFormState();
                        // One last attempt to fetch to ensure error accuracy
                        const freshElements = await page.$$(selector);
                        throw new Error(`Element at index ${index} not found. Found ${freshElements.length} found (some might be hidden).`);
                    }
                    await sleep(500);
                }
            } else {
                await waitForElement(page, selector);
                elementHandle = await page.$(selector);
            }

            // Reference runner pattern: prefer setting the hidden select paired to the
            // autocomplete input. This is target-page DOM work and does not rely on
            // the browser tab being foreground/focused.
            const isCascadingChargeJobField = selector.includes('CBOBox') && Number(index) > 0;
            if (isCascadingChargeJobField) {
                console.log(`  ℹ️ Charge Job cascade field detected (index ${index}). Using autocomplete select, not hidden select.`);
            } else {
                const pairedSelectResult = await selectPairedHiddenSelect(page, selector, index || 0, value);
                if (pairedSelectResult.success) {
                    console.log(`  ✅ Paired hidden select selected (${pairedSelectResult.selectId || 'unknown'}): "${pairedSelectResult.optionText || value}"`);
                    await sleep(1200);
                    await waitForPageStable(3000);

                    const postCheck = await checkForValidationErrors();
                    const fieldValue = await verifyInputValue(selector, index);
                    if (!postCheck.hasError && fieldValue.hasValue) {
                        console.log(`  ✅ Input Success via paired select: "${fieldValue.value}"`);
                        registerDomValuePair(context, {
                            kind: 'autocomplete',
                            selector,
                            index: index || 0,
                            value,
                            actualValue: fieldValue.value,
                            label: params.label || `Field ${index || 0}`,
                            restoreBeforeAdd: params.restoreBeforeAdd === true,
                            requiredBeforeAdd: params.requiredBeforeAdd !== false
                        });
                        console.log(`  └─────────────────────────\n`);
                        return;
                    }

                    console.log(`  ⚠️ Paired select did not fully validate (hasError=${postCheck.hasError}, hasValue=${fieldValue.hasValue}). Falling back to autocomplete typing.`);
                } else {
                    console.log(`  ℹ️ Paired hidden select unavailable: ${pairedSelectResult.reason}`);
                }
            }

            // 2. DOM autocomplete fallback. This avoids page.keyboard/page.click so
            // background tabs can keep processing independently.
            let searchValue;
            if (index === 0) {
                searchValue = value;
                console.log(`  📝 DOM search FULL value (Employee): "${searchValue}"`);
            } else {
                searchValue = value.length > 3 ? value.slice(0, -3) : value;
                console.log(`  📝 DOM search truncated value (Charge Job): "${searchValue}" (original: "${value}")`);
            }

            let autocompleteSelectionFailed = false;
            let nextChargeJobBranchMissing = false;
            const configuredFallbackValue = fallbackValue === undefined || fallbackValue === null
                ? ''
                : String(fallbackValue).trim();
            const configuredFallbackSearchValue = fallbackSearchValue === undefined || fallbackSearchValue === null
                ? configuredFallbackValue
                : String(fallbackSearchValue).trim();
            let autocompleteResult = await setAutocompleteInputByDom(page, selector, index || 0, searchValue, {
                dropdownWait: 900,
                afterSelectWait: 900,
                requireOption: true,
                slowUntilSingle: isCascadingChargeJobField,
                slowValue: value
            });

            if (!autocompleteResult.success) {
                console.log(`  ⚠️ DOM autocomplete failed: ${autocompleteResult.reason}`);
                autocompleteSelectionFailed = true;
            } else if (autocompleteResult.optionClicked === false) {
                console.log(`  ⚠️ DOM autocomplete set value only (${autocompleteResult.optionReason || 'no visible option'})`);
                autocompleteSelectionFailed = true;
            } else {
                console.log(`  ✅ DOM autocomplete selected option: "${autocompleteResult.text || value}"`);
            }

            if (autocompleteSelectionFailed && configuredFallbackValue) {
                console.log(`  🔁 Fallback autocomplete: "${value}" not selected, trying "${configuredFallbackValue}"`);
                const fallbackResult = await setAutocompleteInputByDom(
                    page,
                    selector,
                    index || 0,
                    configuredFallbackSearchValue,
                    {
                        dropdownWait: 900,
                        afterSelectWait: 900,
                        requireOption: true,
                        slowUntilSingle: true,
                        slowValue: configuredFallbackValue,
                        matchValue: configuredFallbackValue
                    }
                );

                if (fallbackResult.success && fallbackResult.optionClicked !== false) {
                    autocompleteResult = {
                        ...fallbackResult,
                        fallbackFrom: value,
                        fallbackValue: configuredFallbackValue
                    };
                    autocompleteSelectionFailed = false;
                    console.log(`  ✅ Fallback selected option: "${fallbackResult.text || configuredFallbackValue}"`);
                } else {
                    console.log(`  ⚠️ Fallback "${configuredFallbackValue}" failed: ${fallbackResult.reason || fallbackResult.optionReason || 'option not selected'}`);
                }
            }

            await waitForPageStable(2000);

            const resolvedExpectedFieldCount = resolveExpectedFieldCount();
            const currentIndex = Number(index);
            const shouldWaitForNextChargeJobBranch = isCascadingChargeJobField
                && Number.isFinite(resolvedExpectedFieldCount)
                && Number.isFinite(currentIndex)
                && currentIndex + 1 < resolvedExpectedFieldCount;

            if (shouldWaitForNextChargeJobBranch) {
                const requiredVisibleCount = currentIndex + 2;
                console.log(`  ⏳ Waiting staged Charge Job branch: need ${requiredVisibleCount} visible CBOBox field(s)...`);
                const branchReady = await waitForVisibleInputCount(selector, requiredVisibleCount, 15000);
                if (branchReady) {
                    console.log(`  ✅ Next Charge Job branch is ready`);
                } else {
                    console.log(`  ⚠️ Next Charge Job branch did not appear yet`);
                    nextChargeJobBranchMissing = true;
                }
            }

            // 5. Wait for potential error or success
            await sleep(2000);

            // 6. Check validation - now using comprehensive check
            const postCheck = await checkForValidationErrors();

            // Also check specific validation selector if provided
            let hasSpecificError = false;
            if (isCascadingChargeJobField && autocompleteSelectionFailed) {
                console.log(`  ⚠️ Charge Job option was not selected from autocomplete`);
                hasSpecificError = true;
            }
            if (nextChargeJobBranchMissing) {
                console.log(`  ⚠️ Charge Job cascade did not advance to the next field`);
                hasSpecificError = true;
            }
            if (validationSelector) {
                try {
                    const errorEl = await page.$(validationSelector);
                    if (errorEl) {
                        const isVisible = await errorEl.evaluate(el => {
                            const style = window.getComputedStyle(el);
                            return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
                        });
                        if (isVisible) {
                            const errorText = await errorEl.evaluate(el => el.textContent.trim());
                            console.log(`  ⚠️ Error detected: "${errorText}"`);
                            hasSpecificError = true;
                        }
                    }
                } catch (e) { }
            }

            // 7. Verify the current field actually has a value
            const fieldValue = await verifyInputValue(selector, index);
            if (!fieldValue.hasValue) {
                if (isCascadingChargeJobField && autocompleteResult.success && autocompleteResult.optionClicked !== false) {
                    console.log(`  ℹ️ Field not readable after cascade postback, but autocomplete option was selected`);
                } else {
                    console.log(`  ⚠️ Field is empty after input attempt`);
                    hasSpecificError = true;
                }
            } else {
                console.log(`  📋 Field value: "${fieldValue.value}"`);
            }

            if (!postCheck.hasError && !hasSpecificError) {
                console.log(`  ✅ Input Success`);
                registerDomValuePair(context, {
                    kind: 'autocomplete',
                    selector,
                    index: index || 0,
                    value: autocompleteResult.fallbackValue || value,
                    actualValue: fieldValue.value || autocompleteResult.text || autocompleteResult.inputValue || value,
                    label: params.label || `Field ${index || 0}`,
                    restoreBeforeAdd: params.restoreBeforeAdd === true,
                    requiredBeforeAdd: params.requiredBeforeAdd !== false
                });
                console.log(`  └─────────────────────────\n`);
                return; // Success!
            }

            console.log(`  ❌ Attempt ${attempt} failed.`);
            // Capture form state for debugging when attempt fails
            if (attempt === maxRetries) {
                console.log(`  🔍 Capturing final form state for debugging...`);
                await captureFormState();
            }
            console.log(`  └─────────────────────────\n`);

            await sleep(1000);
        }

        // ═══ FAIL-FORWARD BEHAVIOR ═══
        // Instead of throwing error and stopping, mark as failed and continue
        // This allows the automation to move to next employee/date

        console.log(`\n❌ INPUT FAILED: "${value}" into ${selector}[${index || 0}]`);
        console.log(`⏭️  FAIL-FORWARD: Skipping this input and continuing to next data...\n`);

        // Set flag in context so subsequent steps can check it
        if (!context.metadata) context.metadata = {};
        context.metadata.inputFailed = true;
        context.metadata.lastFailedInput = { selector, index, value, timestamp: Date.now() };

        // For employee input, set specific flag
        if (index === 0 || (selector.includes('employee') || selector.includes('Employee'))) {
            context.metadata.employeeInputFailed = true;
            console.log(`  📌 Flagged: employeeInputFailed = true`);
        }

        // Return without throwing - allows flow to continue
        return;
    },

    /**
     * Verify that Add button click was successful by detecting page navigation/reload
     * Uses Puppeteer's native waitForNavigation for fast, event-based detection
     * params.timeout: max time to wait for reload (default 15000ms)
     */
    verifyAddButtonClicked: async (page, params, context, engine) => {
        const timeout = params.timeout || 15000;

        console.log(`🔍 Waiting for page reload after Add button...`);

        try {
            // Use Puppeteer's native waitForNavigation - this is EVENT-BASED, not polling
            // It will wait for the page to start and finish navigating
            await page.waitForNavigation({
                waitUntil: 'domcontentloaded',
                timeout: timeout
            });
            console.log(`  ✅ Page reload detected - Add successful`);
            return true;
        } catch (e) {
            // If waitForNavigation times out but we still see a fresh form, it's a partial reload (ASP.NET postback)
            console.log(`  ⚠️ Navigation event not detected, checking form state...`);

            // Quick check: is the Employee field empty? (indicates successful add)
            try {
                const employeeField = await page.$('.ui-autocomplete-input.CBOBox');
                if (employeeField) {
                    const value = await employeeField.evaluate(el => el.value || '');
                    if (value.length === 0) {
                        console.log(`  ✅ Form reset detected (Employee field empty) - Add successful`);
                        return true;
                    }
                }
            } catch (checkError) {
                // Ignore
            }

            console.log(`  ⚠️ Add verification unclear, continuing...`);
            return false;
        }
    },

    /**
     * Wait for an element to appear (event-based, no polling delay)
     * More efficient replacement for wait + waitForElement combo
     * params.selector: CSS selector to wait for
     * params.timeout: max time to wait (default 10000ms)
     * params.visible: if true, wait for element to be visible (default true)
     */
    waitForReady: async (page, params) => {
        const { selector, timeout = 10000, visible = true } = params;

        console.log(`⏳ Waiting for ${selector} to be ready...`);

        try {
            await page.waitForSelector(selector, {
                visible: visible,
                timeout: timeout
            });
            console.log(`  ✅ ${selector} is ready`);
            return true;
        } catch (e) {
            console.log(`  ⚠️ ${selector} not ready after ${timeout}ms`);
            return false;
        }
    },

    /**
     * Click and wait for navigation in a single atomic action
     * Combines click + waitForNavigation for ASP.NET postback buttons
     * params.selector: button selector to click
     * params.timeout: max time to wait for navigation (default 15000ms)
     */
    clickAndWaitForReload: async (page, params, context = {}) => {
        const { selector, timeout = 8000 } = params;
        const totalHoursSelector = params.totalHoursSelector || context.totalHoursSelector || '';
        const maxAttempts = params.maxAttempts || 1;

        console.log(`🖱️ Clicking ${selector} once and waiting for Millware auto-refresh...`);

        if (context.metadata?.inputFailed) {
            console.log(`  ⚠️ Previous input was flagged failed, but Add will still be clicked: ${JSON.stringify(context.metadata.lastFailedInput || {})}`);
        }

        await waitForElement(page, selector, timeout);
        if (params.skipPreAddQuiet === true) {
            console.log(`  ⚡ Fast Add: skip pre-Add quiet wait; clicking after DOM/value check.`);
        } else {
            const quietBeforeAdd = await waitForAspNetQuiet(page, params.preAddQuietTimeout || 10000, params.preAddQuietMs || 800);
            if (quietBeforeAdd.success) {
                console.log(`  ✅ Form quiet before Add (${quietBeforeAdd.elapsedMs}ms)`);
            } else {
                console.log(`  ⚠️ Form was not fully quiet before Add; continuing without page refresh`);
            }
        }
        const pairCheck = await verifyAndRestoreDomPairsBeforeAdd(page, context);
        if (!pairCheck.ok) {
            console.log(`  ⚠️ ${pairCheck.problems.length} DOM/value pair(s) still not matching before Add. Add will be clicked once so Millware validation can respond.`);
        }

        let lastResult = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            let beforeState = await getAspNetFormState(page, totalHoursSelector);
            console.log(`  ┌─ Add click attempt ${attempt}/${maxAttempts}`);
            console.log(`  │ Before: emp="${beforeState.employeeValue}" hours="${beforeState.amountValue}" total="${beforeState.totalText || '-'}" gridRows=${beforeState.lineRowCount}`);

            if (!String(beforeState.employeeValue || '').trim()) {
                console.log(`  ⚠️ Employee field is empty before Add; clicking Add anyway so Millware validation is triggered.`);
            }

            if (!String(beforeState.amountValue || '').trim()) {
                const hoursValue = String(context.hoursValue ?? params.hoursValue ?? '').trim();
                if (hoursValue) {
                    console.log(`  ⚠️ Hours was empty after cascade auto-refresh. Re-filling hours="${hoursValue}" before Add.`);
                    const hoursResult = await setInputValueByDom(page, '#MainContent_txtHours', 0, hoursValue, {
                        blur: false,
                        dispatchChange: false,
                        triggerJquery: false
                    });
                    if (hoursResult.success) {
                        await sleep(100);
                        beforeState = await getAspNetFormState(page, totalHoursSelector);
                        console.log(`  │ After hours refill: hours="${beforeState.amountValue}"`);
                    } else {
                        console.log(`  ⚠️ Failed to refill hours before Add: ${hoursResult.reason}`);
                    }
                } else {
                    console.log(`  ⚠️ Hours/amount field is empty before Add; clicking Add anyway so Millware validation is triggered.`);
                }
            }

            const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: Math.min(timeout, 5000) })
                .then(() => ({ success: true, status: 'navigation' }))
                .catch(() => null);
            let clickResult;
            if (attempt === 1) {
                clickResult = await clickElementByDom(page, selector, params.index || 0)
                    .catch((error) => {
                        if (isNavigationTransientError(error)) {
                            return { success: true, transientNavigation: true };
                        }
                        return { success: false, reason: error.message };
                    });
            } else {
                console.log(`  │ Retrying Add with native page.click()`);
                clickResult = await page.click(selector, { delay: 20 })
                    .then(() => ({ success: true, method: 'page.click' }))
                    .catch((error) => {
                        if (isNavigationTransientError(error)) {
                            return { success: true, transientNavigation: true, method: 'page.click' };
                        }
                        return { success: false, reason: error.message, method: 'page.click' };
                    });
            }
            if (!clickResult.success) {
                console.log(`  │ ⚠️ Add click failed (${clickResult.method || 'dom'}): ${clickResult.reason}`);
                if (attempt === maxAttempts) {
                    throw new Error(`Add button click failed: ${clickResult.reason}`);
                }
                await sleep(500);
                continue;
            }

            lastResult = await waitForAddCompletion(page, beforeState, { timeout, totalHoursSelector });
            if (!lastResult.success) {
                const navigationResult = await navigationPromise;
                if (navigationResult?.success) {
                    console.log(`  │ Navigation happened, waiting once more for grid/form state after auto-refresh...`);
                    lastResult = await waitForAddCompletion(page, beforeState, { timeout: params.postNavigationTimeout || 6000, totalHoursSelector });
                    if (!lastResult.success) {
                        lastResult = navigationResult;
                    }
                }
            }

            if (lastResult.success) {
                console.log(`  ✅ Add confirmed: ${lastResult.status}${lastResult.totalText ? ` total=${lastResult.totalText}` : ''}${lastResult.lineRowCount !== undefined ? ` gridRows=${lastResult.previousLineRowCount}->${lastResult.lineRowCount}` : ''} (${lastResult.elapsedMs || 0}ms)`);
                if (lastResult.latestRow?.length) {
                    console.log(`  ✅ Grid latest row: ${JSON.stringify(lastResult.latestRow)}`);
                }
                if (!context.metadata) context.metadata = {};
                context.metadata.addedRows = (context.metadata.addedRows || 0) + 1;
                context.lastAddResult = lastResult;
                const readyResult = await waitForTaskRegisterDetailReady(page, params.readyTimeout || 5000, 200);
                context.lastAddReadyResult = readyResult;
                if (readyResult.success) {
                    console.log(`  ✅ Detail form ready after Add: inputs empty (${readyResult.elapsedMs}ms)`);
                } else {
                    console.log(`  ⚠️ Detail form not fully empty after Add: ${JSON.stringify(readyResult.lastState || {})}`);
                }
                context.__domValuePairs = [];
                return true;
            }

            console.log(`  ⚠️ Add not confirmed: ${lastResult.status}${lastResult.message ? ` - ${lastResult.message}` : ''}`);
            if (lastResult.status === 'validation') {
                if (!context.metadata) context.metadata = {};
                context.metadata.inputFailed = true;
                context.metadata.lastFailedInput = {
                    selector,
                    value: beforeState.amountValue,
                    reason: lastResult.message,
                    timestamp: Date.now()
                };
                console.log(`  ⏭️ Validation shown after Add. No manual refresh; continuing to next data.`);
                context.__domValuePairs = [];
                return false;
            }

            if (attempt < maxAttempts) {
                await sleep(600);
            }
        }

        console.log(`  ⚠️ Add click was sent but confirmation was unclear: ${lastResult?.message || 'no confirmation'}`);
        const readyResult = await waitForTaskRegisterDetailReady(page, params.readyTimeout || 5000, 200);
        context.lastAddReadyResult = readyResult;
        if (!context.metadata) context.metadata = {};
        context.lastAddResult = lastResult || { success: false, status: 'unclear' };
        if (readyResult.success) {
            context.metadata.addedRows = (context.metadata.addedRows || 0) + 1;
            console.log(`  ✅ Detail form ready after Add auto-refresh (${readyResult.elapsedMs}ms). Continuing without extra refresh.`);
            context.__domValuePairs = [];
            return true;
        } else {
            context.metadata.inputFailed = true;
            context.metadata.lastFailedInput = {
                selector,
                value: context.hoursValue ?? '',
                reason: lastResult?.message || 'Add click was not confirmed and form did not reset',
                timestamp: Date.now()
            };
            console.log(`  🛑 Add was not accepted/confirmed; form still not reset. Not counting this row as added.`);
        }
        context.__domValuePairs = [];
        return false;
    },

    /**
     * Explicitly throw an error to trigger recovery
     */
    throwError: async (page, params) => {
        const message = params.message || 'An error occurred';
        console.error(`❌ Throwing Error: ${message}`);
        throw new Error(message);
    },

    /**
     * checkFormReady - Check if form is ready for input
     * Verifies required form elements exist before continuing
     * params.requiredSelector: selector to check for (default: #MainContent_txtTrxDate)
     * params.timeout: how long to wait (default: 5000ms)
     * params.onFailure: 'skip', 'refreshAndNavigate', or 'log'
     */
    checkFormReady: async (page, params, context, engine) => {
        const {
            requiredSelector = '#MainContent_txtTrxDate',
            timeout = 5000,
            onFailure = 'skip'
        } = params;

        try {
            await page.waitForSelector(requiredSelector, { timeout });
            console.log(`✅ Form ready - ${requiredSelector} found`);
            context.formNotReady = false;
            return true;
        } catch (error) {
            console.log(`⚠️ Form not ready - ${requiredSelector} missing`);

            if (onFailure === 'refreshAndNavigate') {
                console.log(`🔄 Recovery: Staying on detail page and refreshing...`);
                try {
                    // Navigate DIRECTLY to detail page (never go to list page)
                    console.log(`  → Navigating directly to detail page...`);
                    await page.goto('http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterDet.aspx');
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
                    await sleep(2000);

                    console.log(`✅ Now on detail page - form should be ready`);
                    context.formNotReady = false;
                    return true;
                } catch (recoveryError) {
                    console.log(`❌ Recovery failed:`, recoveryError.message);
                    context.formNotReady = true;
                    return false;
                }
            }

            context.formNotReady = true;
            return false;
        }
    },

    /**
     * logValidation - Log validation entry to backend (NON-BLOCKING/Fire-and-Forget)
     * Called after each successful Add operation
     * params.ptrjEmployeeID: PTRJ Employee ID
     * params.employeeName: Employee Name (from context: employee.PTRJEmployeeID)
     * params.date: Date (from context: attendance.date)
     * params.regularHours: Regular hours input (from context: attendance.regularHours)
     * params.overtimeHours: Overtime hours input (from context: attendance.overtimeHours)
     * params.inputType: 'REGULAR' or 'OVERTIME'
     * params.status: 'SUCCESS' or 'FAILED'
     * params.apiUrl: Validation API URL (default: http://localhost:5000/api/validation/log)
     */
    logValidation: async (page, params, context, engine) => {
        const {
            ptrjEmployeeID,
            employeeName,
            date,
            regularHours,
            overtimeHours,
            inputType,
            status = 'SUCCESS',
            apiUrl = 'http://localhost:5000/api/validation/log'
        } = params;

        // Get values from context if not provided
        const finalPtrjId = ptrjEmployeeID || context.employee?.PTRJEmployeeID || '';
        const finalName = employeeName || context.employee?.EmployeeName || '';
        const finalDate = date || context.attendance?.date || '';
        const finalRegHours = regularHours !== undefined ? regularHours : (context.attendance?.regularHours || 0);
        const finalOTHours = overtimeHours !== undefined ? overtimeHours : (context.attendance?.overtimeHours || 0);

        // Fire-and-forget: Don't await the validation API call
        // This prevents validation from slowing down the automation
        const axios = require('axios');
        const payload = {
            ptrjEmployeeID: finalPtrjId,
            employeeName: finalName,
            date: finalDate,
            regularHours: finalRegHours,
            overtimeHours: finalOTHours,
            inputType: inputType,
            status: status
        };

        console.log(`[Validation] Logging: ${finalPtrjId} @ ${finalDate} (${inputType})`);

        // Non-blocking: Send to backend validation API without awaiting
        axios.post(apiUrl, payload, {
            timeout: 3000,
            headers: { 'Content-Type': 'application/json' }
        }).then(response => {
            if (response.data.success) {
                const validationResult = response.data.data.validationResult;
                if (validationResult === 'VALID') {
                    console.log(`[Validation] ✓ VALID: Data confirmed in PR_TASKREGLN`);
                } else if (validationResult === 'INVALID') {
                    console.log(`[Validation] ✗ INVALID: Data NOT found in PR_TASKREGLN`);
                } else if (validationResult === 'ERROR') {
                    console.log(`[Validation] ⚠️ ERROR: Validation failed`);
                }
            }
        }).catch(error => {
            console.log(`[Validation] ⚠️ Failed to log validation:`, error.message);
        });

        // Return immediately without waiting for validation
        return true;
    },

    /**
     * checkRegularDataExists - Check if regular data exists in Millware taskregln database BEFORE processing overtime
     * SYARAT: Overtime hanya bisa diinput jika regular hours sudah ada di database taskregln
     *
     * params.date: Date to check (from context: attendance.date)
     * params.employeeId: Employee ID (from context: employee.PTRJEmployeeID)
     *
     * Returns:
     * - true: Regular data exists in taskregln → overtime can be processed
     * - false: Regular data NOT in taskregln → skip overtime (Miss: regular belum ada)
     */
    checkRegularDataExists: async (page, params, context, engine) => {
        const { date = context.attendance?.date, employeeId = context.employee?.PTRJEmployeeID } = params;

        console.log(`🔍 [OVERTIME PRE-CHECK] Checking if regular data exists in taskregln for ${employeeId} on ${date}...`);

        try {
            // Dynamic import to avoid load issues
            const comparisonService = require('../../backend/services/comparisonService');

            // Construct proper data structure expected by compareWithTaskReg
            // It expects: ptrjEmployeeID (lowercase) and attendance object with date keys
            const checkDate = date;

            // Build attendance object with the specific date we're checking
            const attendanceObj = {};
            attendanceObj[date] = {
                date: date,
                status: context.attendance?.status || 'OT',
                regularHours: context.attendance?.regularHours || 0,
                overtimeHours: context.attendance?.overtimeHours || 0
            };

            const venusData = [{
                id: context.employee.EmployeeID,
                name: context.employee.EmployeeName,
                ptrjEmployeeID: context.employee.PTRJEmployeeID,
                attendance: attendanceObj
            }];

            console.log(`  📋 Data structure: ptrjEmployeeID=${venusData[0].ptrjEmployeeID}, attendance keys=${Object.keys(attendanceObj).join(', ')}`);

            const result = await comparisonService.compareWithTaskReg(venusData, checkDate, checkDate, {
                onlyRegular: true  // Only check regular data
            });

            console.log(`  📊 Comparison result: ${result.results.length} records returned`);

            // Filter results for this employee and date
            const employeeResults = result.results.filter(r =>
                r.ptrjId === employeeId && r.date === checkDate
            );

            if (employeeResults.length > 0) {
                const res = employeeResults[0];
                const details = res.details || {};

                console.log(`  📋 Details: regularMatched=${details.regularMatched}, hasRegularRecord=${details.hasRegularRecord !== undefined ? details.hasRegularRecord : 'N/A'}`);
                console.log(`     → millwareNormal=${details.millwareNormal || 0}, venusNormal=${details.venusNormal || 0}`);

                // Check if regular data MATCHED (exists in database)
                if (details.regularMatched === true) {
                    console.log(`  ✅ Regular data FOUND in taskregln for ${date}`);
                    console.log(`     → Hours: ${details.millwareNormal || 'N/A'}`);
                    console.log(`     → Overtime can be processed`);

                    // Mark that regular exists for this date
                    if (!context.attendance) context.attendance = {};
                    context.attendance.regularDataExists = true;
                    context.attendance.canProcessOvertime = true;

                    return true;
                } else {
                    console.log(`  ❌ Regular data NOT FOUND in taskregln for ${date}`);
                    console.log(`     → Overtime CANNOT be processed (Miss: regular belum diinput)`);

                    // Mark that regular doesn't exist
                    if (!context.attendance) context.attendance = {};
                    context.attendance.regularDataExists = false;
                    context.attendance.canProcessOvertime = false;
                    context.attendance.overtimeMissReason = 'REGULAR_NOT_IN_TASKREGLN';

                    // Log to failed CSV
                    const failedRecord = {
                        employeeId: context.employee.EmployeeID || 'N/A',
                        employeeName: context.employee.EmployeeName || 'Unknown',
                        ptrjId: employeeId,
                        date: date,
                        venusStatus: context.attendance.status || 'N/A',
                        venusRegularHours: context.attendance.regularHours || 0,
                        venusOvertimeHours: context.attendance.overtimeHours || 0,
                        syncStatus: 'MISS_REGULAR_NOT_IN_TASKREGLN',
                        millwareRecords: details.records || 0,
                        millwareHours: details.millwareHours || 0,
                        reason: `Regular data belum diinput ke taskregln (Venus: ${context.attendance.regularHours || 0}h, DB: ${details.millwareNormal || 0})`
                    };

                    await updateFailedEmployeeCSV([failedRecord], context);

                    return false;
                }
            } else {
                console.log(`  ⚠️ No results found for ${employeeId} on ${date}`);
                context.attendance.canProcessOvertime = false;
                context.attendance.overtimeMissReason = 'NO_DATA_FOUND';
                return false;
            }

        } catch (error) {
            console.error(`❌ Error checking regular data: ${error.message}`);
            console.error(error.stack);
            // On error, allow processing but log warning
            console.log(`  ⚠️ Proceeding with overtime (check failed)`);
            context.attendance.canProcessOvertime = true; // Default to allow on error
            return true;
        }
    },

    /**
     * fillAllTaskCodes - REMOVED: Not supported due to page refresh on each input
     * Charge job must be input one by one because page refreshes after each input
     */
    fillAllTaskCodes: async (page, params, context) => {
        console.log(`⚠️ fillAllTaskCodes is disabled - charge job must be input individually due to page refresh`);
        return true;
    },
};

module.exports = actions;
