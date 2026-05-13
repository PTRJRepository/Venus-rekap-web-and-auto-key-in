const fs = require('fs');
const path = require('path');
const AutomationEngine = require('./engine');

const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_payroll_data.json');
const DEFAULT_MAPPING_FILE = path.join(__dirname, 'testing_data', 'payroll_taskcode_mapping.json');

const parseArgs = (argv = process.argv.slice(2)) => {
    const args = {
        dataFile: DEFAULT_DATA_FILE,
        mappingFile: DEFAULT_MAPPING_FILE,
        engineId: 'payroll_taskcode_discovery',
        headless: process.env.HEADLESS === 'true',
        autoClose: process.env.AUTO_CLOSE !== 'false'
    };

    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--mapping-file') {
            args.mappingFile = argv[++i] || args.mappingFile;
        } else if (arg.startsWith('--mapping-file=')) {
            args.mappingFile = arg.split('=')[1] || args.mappingFile;
        } else if (arg === '--engine-id') {
            args.engineId = argv[++i] || args.engineId;
        } else if (arg.startsWith('--engine-id=')) {
            args.engineId = arg.split('=')[1] || args.engineId;
        } else if (arg === '--headless') {
            args.headless = true;
        } else if (arg === '--no-headless') {
            args.headless = false;
        } else if (arg === '--keep-open') {
            args.autoClose = false;
        } else if (arg === '--auto-close') {
            args.autoClose = true;
        } else {
            positional.push(arg);
        }
    }

    if (positional[0]) args.dataFile = positional[0];
    return args;
};

const parseTaskCodeOption = (text = '', value = '') => {
    const selectedValue = String(value || '').trim();
    const selectedText = String(text || '').replace(/\s+/g, ' ').trim();
    const codeFromValue = selectedValue.match(/[A-Z]{1,4}\d{2,}[A-Z0-9]*/i)?.[0] || '';
    const codeFromText = selectedText.match(/[A-Z]{1,4}\d{2,}[A-Z0-9]*/i)?.[0] || '';
    const taskCode = (codeFromValue || codeFromText || selectedValue.split(/\s+/)[0] || '').trim();
    return {
        taskCode,
        taskDesc: selectedText,
        selectedValue,
        selectedText
    };
};

const KEYWORD_CANDIDATES = {
    jabatan: ['JABATAN'],
    masaKerja: ['MASA', 'KERJA', 'MASA KERJA'],
    pph21: ['PPH', 'PPH21', 'PPH 21'],
    spsi: ['SPSI'],
    beras: ['BERAS', 'RICE'],
    premi: ['PREMI', 'INSENTIF', 'BONUS', 'KINERJA']
};

const uniqueValues = (values) => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];

const loadPayload = (dataFile) => JSON.parse(fs.readFileSync(path.resolve(dataFile), 'utf8'));

const collectDiscoveryTargets = (payload) => {
    const targets = new Map();
    for (const employee of payload.employees || []) {
        for (const component of employee.components || []) {
            const componentKey = String(component.componentKey || '').trim();
            const keyword = String(component.adSearchKeyword || '').trim();
            if (!componentKey || !keyword) continue;
            if (!targets.has(componentKey)) {
                targets.set(componentKey, {
                    componentKey,
                    componentName: component.componentName || componentKey,
                    keyword,
                    keywords: uniqueValues([...(KEYWORD_CANDIDATES[componentKey] || []), keyword, component.componentName]),
                    type: component.type || '',
                    existingAdCode: component.adCode || '',
                    sampleEmployee: {
                        employeeName: employee.employeeName || '',
                        ptrjId: employee.ptrjId || ''
                    }
                });
            }
        }
    }
    return [...targets.values()];
};

const loadMapping = (mappingFile) => {
    if (!fs.existsSync(mappingFile)) {
        return { version: 1, updatedAt: null, mappings: {} };
    }
    return JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
};

const saveMapping = (mappingFile, mapping) => {
    const resolved = path.resolve(mappingFile);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(mapping, null, 2), 'utf8');
};

const setAutocompleteAndPickFirst = async (page, selector, value) => {
    return page.evaluate(async ({ selector, value }) => {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const visible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null && !el.disabled;
        };
        const input = Array.from(document.querySelectorAll(selector)).find(visible);
        if (!input) return { success: false, reason: `input not found: ${selector}` };

        input.focus();
        input.value = value;
        if (window.jQuery) {
            const $input = window.jQuery(input);
            $input.val(value).trigger('input').trigger('keydown').trigger('keyup');
            if ($input.autocomplete) $input.autocomplete('search', value);
        }
        ['input', 'keydown', 'keyup', 'change'].forEach(eventName => {
            input.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
        });

        for (let attempt = 0; attempt < 20; attempt++) {
            await sleep(150);
            const lists = Array.from(document.querySelectorAll('ul.ui-autocomplete')).filter(visible);
            const items = lists.flatMap(list => Array.from(list.querySelectorAll('li.ui-menu-item')));
            const firstItem = items.find(item => (item.textContent || '').trim());
            if (!firstItem) continue;

            const target = firstItem.querySelector('div, a') || firstItem;
            const optionText = (target.textContent || firstItem.textContent || '').trim();
            const view = window;
            target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view }));
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view }));
            if (window.jQuery) {
                try {
                    window.jQuery(target).trigger('mouseenter').trigger('mousedown').trigger('mouseup').trigger('click');
                } catch (_) {}
            }
            await sleep(250);

            const row = input.closest('tr') || input.parentElement;
            const select = (input.previousElementSibling && input.previousElementSibling.tagName === 'SELECT' && input.previousElementSibling)
                || (row && row.querySelector('select'));
            const selectedOption = select && select.options ? select.options[select.selectedIndex] : null;
            return {
                success: true,
                keyword: value,
                optionText,
                inputValue: input.value || '',
                selectedValue: select ? select.value : '',
                selectedText: selectedOption ? (selectedOption.textContent || '').trim() : '',
                optionCount: items.length
            };
        }

        return { success: false, reason: `no autocomplete options for ${value}` };
    }, { selector, value });
};

const waitForAdDetailReady = async (page) => {
    await page.waitForSelector('#MainContent_ddlTaskCode + input.ui-autocomplete-input', { visible: true, timeout: 30000 });
};

const discoverTaskCodeTarget = async (page, target, attempts = 2) => {
    let lastError = null;
    const keywords = target.keywords?.length ? target.keywords : [target.keyword];
    const failures = [];

    for (const keyword of keywords) {
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                await waitForAdDetailReady(page);
                const result = await setAutocompleteAndPickFirst(page, '#MainContent_ddlTaskCode + input.ui-autocomplete-input', keyword);
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null);
                await page.waitForTimeout?.(300);
                if (!result.success) {
                    failures.push(`${keyword}: ${result.reason}`);
                    break;
                }
                return { ...result, keyword };
            } catch (error) {
                lastError = error;
                console.error(`Discovery retry ${attempt}/${attempts} for ${target.componentKey} (${keyword}): ${error.message}`);
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
                await waitForAdDetailReady(page).catch(() => null);
            }
        }
    }

    return { success: false, reason: failures.join(' | ') || lastError?.message || 'unknown discovery error' };
};

const gotoWithRetry = async (page, url, options = {}, attempts = 3) => {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            console.log(`Navigate attempt ${attempt}/${attempts}: ${url}`);
            await page.goto(url, {
                waitUntil: options.waitUntil || 'domcontentloaded',
                timeout: options.timeout || 120000
            });
            return;
        } catch (error) {
            lastError = error;
            console.error(`Navigate failed attempt ${attempt}/${attempts}: ${error.message}`);
            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    throw lastError;
};

const loginAndOpenAdLists = async (page) => {
    await gotoWithRetry(page, 'http://millwarep3.rebinmas.com:8003/');
    await page.waitForSelector('#txtUsername', { visible: true, timeout: 15000 });
    await page.evaluate(() => {
        document.querySelector('#txtUsername').value = '';
        document.querySelector('#txtPassword').value = '';
    });
    await page.type('#txtUsername', 'adm075');
    await page.type('#txtPassword', 'adm075');
    await Promise.all([
        page.click('#btnLogin'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    ]);
    await page.waitForSelector('#MainContent_btnOkay', { visible: true, timeout: 15000 });
    await Promise.all([
        page.click('#MainContent_btnOkay'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    ]);
    await gotoWithRetry(page, 'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxADLists.aspx');
    await page.waitForSelector('#MainContent_btnNew', { visible: true, timeout: 20000 });
    await Promise.all([
        page.click('#MainContent_btnNew'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    ]);
    await page.waitForSelector('#MainContent_ddlEmployee + input.ui-autocomplete-input', { visible: true, timeout: 20000 });
};

const runTaskCodeDiscovery = async (options = {}) => {
    const dataFile = path.resolve(options.dataFile || DEFAULT_DATA_FILE);
    const mappingFile = path.resolve(options.mappingFile || DEFAULT_MAPPING_FILE);
    const payload = loadPayload(dataFile);
    const targets = collectDiscoveryTargets(payload);
    const sampleEmployee = targets.find(target => target.sampleEmployee.employeeName)?.sampleEmployee;

    if (!sampleEmployee) {
        return { success: false, error: 'No sample employee found in payroll payload' };
    }

    console.log('='.repeat(70));
    console.log('PAYROLL TASKCODE DISCOVERY');
    console.log('='.repeat(70));
    console.log(`Data file: ${dataFile}`);
    console.log(`Mapping file: ${mappingFile}`);
    console.log(`Targets: ${targets.length}`);
    console.log(`Sample employee: ${sampleEmployee.employeeName} (${sampleEmployee.ptrjId})`);

    const engine = new AutomationEngine({
        engineId: options.engineId || 'payroll_taskcode_discovery',
        headless: options.headless !== undefined ? options.headless : process.env.HEADLESS === 'true',
        screenshot: true,
        userDataDir: path.join(__dirname, 'chrome_data', options.engineId || 'payroll_taskcode_discovery')
    });
    engine.disableBrowserRecycle = true;

    const discovered = [];
    const failed = [];
    const mapping = loadMapping(mappingFile);
    mapping.version = 1;
    mapping.mappings = mapping.mappings || {};

    try {
        await engine.launch();
        const page = engine.page;
        await loginAndOpenAdLists(page);

        const employeeResult = await setAutocompleteAndPickFirst(page, '#MainContent_ddlEmployee + input.ui-autocomplete-input', sampleEmployee.employeeName);
        if (!employeeResult.success) {
            throw new Error(`Employee autocomplete failed: ${employeeResult.reason}`);
        }
        console.log(`Employee selected: ${employeeResult.selectedText || employeeResult.optionText}`);

        for (const target of targets) {
            const result = await discoverTaskCodeTarget(page, target);
            if (!result.success) {
                console.error(`FAILED ${target.componentKey} (${target.keywords.join(', ')}): ${result.reason}`);
                failed.push({ ...target, error: result.reason });
                continue;
            }

            const parsed = parseTaskCodeOption(result.selectedText || result.optionText, result.selectedValue);
            const row = {
                componentKey: target.componentKey,
                componentName: target.componentName,
                type: target.type,
                keyword: result.keyword || target.keyword,
                keywordsTried: target.keywords,
                taskCode: parsed.taskCode,
                taskDesc: parsed.taskDesc || result.optionText,
                selectedValue: parsed.selectedValue,
                selectedText: parsed.selectedText,
                optionText: result.optionText,
                inputValue: result.inputValue,
                optionCount: result.optionCount,
                discoveredAt: new Date().toISOString()
            };
            discovered.push(row);
            mapping.updatedAt = new Date().toISOString();
            mapping.mappings[row.componentKey] = row;
            saveMapping(mappingFile, mapping);
            console.log(`MAPPED ${target.componentKey}: "${target.keyword}" -> ${row.taskCode} | ${row.taskDesc}`);
        }

        mapping.updatedAt = new Date().toISOString();
        saveMapping(mappingFile, mapping);

        return { success: failed.length === 0, phase: 'discovery', discovered, failed, mappingFile };
    } finally {
        if ((options.autoClose !== undefined ? options.autoClose : process.env.AUTO_CLOSE !== 'false') && engine.browser) {
            await engine.closeBrowser().catch(() => {});
            console.log('Browser closed.');
        } else {
            console.log('Browser left open by configuration.');
        }
    }
};

if (require.main === module) {
    runTaskCodeDiscovery(parseArgs())
        .then(result => {
            console.log(result.success ? 'PAYROLL TASKCODE DISCOVERY COMPLETED' : 'PAYROLL TASKCODE DISCOVERY FAILED');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error(`PAYROLL TASKCODE DISCOVERY ERROR: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = {
    DEFAULT_DATA_FILE,
    DEFAULT_MAPPING_FILE,
    parseArgs,
    parseTaskCodeOption,
    collectDiscoveryTargets,
    runTaskCodeDiscovery
};
