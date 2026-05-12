/**
 * Delete OT Runner
 *
 * Correct Millware flow:
 * 1. Login.
 * 2. Open Task Register list page.
 * 3. Click the target DocID row from the list page.
 * 4. On the detail page, delete matching OT/Normal rows.
 *
 * Usage:
 *   node delete-ot-runner.js --all
 *   node delete-ot-runner.js --dry-run --all
 *   node delete-ot-runner.js 34986 34987
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'testing_data', 'current_delete_data.json');
const MILLWARE_BASE = 'http://millwarep3.rebinmas.com:8003';
const TASK_REGISTER_LIST_URL = `${MILLWARE_BASE}/en/PR/trx/frmPrTrxTaskRegisterList.aspx`;
const TASK_REGISTER_DETAIL_URL = `${MILLWARE_BASE}/en/PR/trx/frmPrTrxTaskRegisterDet.aspx`;
const USERNAME = process.env.MILLWARE_USER || 'adm075';
const PASSWORD = process.env.MILLWARE_PASS || 'adm075';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isScreenshotEnabled = () => process.env.SCREENSHOT !== 'false';

const log = (...args) => {
    const ts = new Date().toISOString().substring(11, 19);
    console.log(`[${ts}] ${args.join(' ')}`);
};

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const snap = async (page, label, dir) => {
    if (!isScreenshotEnabled()) return;
    const screenshotDir = dir || path.join(__dirname, 'logs', 'screenshots', 'ot-delete');
    ensureDir(screenshotDir);
    const safeLabel = String(label).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
    const filename = `${safeLabel}_${Date.now()}.png`;
    try {
        await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: false });
        log(`Screenshot: ${filename}`);
    } catch (_) {
        // Screenshot is diagnostic only.
    }
};

const normalizeKey = (value) => String(value || '').trim().toUpperCase();

const escapeCssId = (id) => String(id).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');

const getTargetKeys = (target) => {
    if (target && typeof target === 'object') {
        return [
            target.internalId,
            target.id,
            target.docId,
            target.doc_id,
            target.docNumber,
            target.doc_number,
            target.label
        ].map(normalizeKey).filter(Boolean);
    }
    return [normalizeKey(target)].filter(Boolean);
};

const normalizeTarget = (target) => {
    if (target && typeof target === 'object') {
        return {
            internalId: target.internalId || target.id || target.docId || target.doc_id || '',
            docNumber: target.docNumber || target.doc_number || '',
            label: target.label || target.docNumber || target.doc_number || target.docId || target.doc_id || target.id || ''
        };
    }
    return {
        internalId: String(target || ''),
        docNumber: '',
        label: String(target || '')
    };
};

const normalizeEmployeeFilter = (employees) => {
    return (Array.isArray(employees) ? employees : [])
        .map((employee) => ({
            empCode: normalizeKey(
                employee.empCode ||
                employee.ptrjEmployeeID ||
                employee.PTRJEmployeeID ||
                employee.ptrjId ||
                employee.id
            ),
            empName: employee.empName || employee.name || employee.EmployeeName || employee.employeeName || ''
        }))
        .filter((employee) => employee.empCode);
};

const categoryLabel = (category) => {
    if (category === 'all') return 'ALL';
    if (category === 'normal') return 'Normal';
    return 'OT';
};

const waitForNavigationSoft = async (page, action, timeout = 15000) => {
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }).catch(() => null),
        action()
    ]);
};

const handleLoginPopup = async (page) => {
    try {
        const ok = await page.$('#MainContent_btnOkay');
        if (ok) {
            await ok.click();
            await sleep(1000);
        }
    } catch (_) {
        // Popup is optional.
    }
};

const login = async (page) => {
    log('Login check');
    await page.goto(MILLWARE_BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);

    const usernameField = await page.$('#txtUsername');
    if (!usernameField) {
        log('Existing session appears valid');
        await handleLoginPopup(page);
        return;
    }

    await page.click('#txtUsername', { clickCount: 3 });
    await page.type('#txtUsername', USERNAME, { delay: 40 });
    await page.click('#txtPassword', { clickCount: 3 });
    await page.type('#txtPassword', PASSWORD, { delay: 40 });
    await waitForNavigationSoft(page, () => page.click('#btnLogin'), 15000);
    await sleep(1500);
    await handleLoginPopup(page);
    log('Login complete');
};

const navigateToListPage = async (page) => {
    await page.goto(TASK_REGISTER_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);

    if (await page.$('#txtUsername')) {
        log('Session expired while opening list page, logging in again');
        await login(page);
        await page.goto(TASK_REGISTER_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(1500);
    }

    await snap(page, 'task-register-list');
};

const setFieldIfExists = async (page, selectors, value) => {
    if (value === undefined || value === null || value === '') return false;
    for (const selector of selectors) {
        const element = await page.$(selector);
        if (!element) continue;

        const tag = await page.evaluate((el) => el.tagName.toLowerCase(), element);
        if (tag === 'select') {
            const selected = await page.select(selector, String(value)).catch(() => []);
            if (selected.length > 0) return true;
        } else {
            await element.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await element.type(String(value), { delay: 20 });
            return true;
        }
    }
    return false;
};

const setDocSearchField = async (page, value) => {
    const searchValue = String(value || '').trim();
    if (!searchValue) return false;

    const directSet = await setFieldIfExists(page, [
        '#MainContent_txtDocID',
        '#MainContent_txtDocId',
        '#MainContent_txtDocNo',
        '#MainContent_txtDocNO',
        '#MainContent_txtDoc',
        '#MainContent_txtDocumentNo',
        '#MainContent_txtDocumentID',
        'input[id*="DocID"]',
        'input[id*="DocId"]',
        'input[id*="DocNo"]',
        'input[id*="DocNO"]',
        'input[id*="DocumentNo"]',
        'input[id*="DocumentID"]',
        'input[name*="DocID"]',
        'input[name*="DocNo"]',
        'input[name*="DocumentNo"]'
    ], searchValue);
    if (directSet) return true;

    return page.evaluate((docId) => {
        const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const labels = Array.from(document.querySelectorAll('td, label, span, div'))
            .filter((el) => /doc\s*(id|no|number)?|document/i.test((el.textContent || '').trim()))
            .filter(isVisible);

        for (const label of labels) {
            const row = label.closest('tr');
            const candidates = [
                ...(row ? Array.from(row.querySelectorAll('input[type="text"], input:not([type]), textarea')) : []),
                ...Array.from(label.parentElement?.querySelectorAll('input[type="text"], input:not([type]), textarea') || [])
            ].filter(isVisible);

            const input = candidates[0];
            if (!input) continue;
            input.focus();
            input.value = docId;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        return false;
    }, searchValue);
};

const clickSearchIfPresent = async (page) => {
    const selector = [
        '#MainContent_btnSearch',
        '#MainContent_btnFilter',
        '#MainContent_btnFind',
        '#MainContent_btnGo',
        '#MainContent_btnView',
        'input[id*="btnSearch"]',
        'input[id*="btnFilter"]',
        'input[id*="btnFind"]',
        'input[id*="btnGo"]',
        'input[id*="btnView"]',
        'button[id*="btnSearch"]',
        'button[id*="btnFilter"]',
        'input[type="submit"][value*="Search"]',
        'input[type="submit"][value*="Filter"]',
        'input[type="submit"][value*="Find"]',
        'input[type="submit"][value*="Cari"]'
    ].join(', ');

    const button = await page.$(selector);
    if (!button) return false;

    await waitForNavigationSoft(page, () => button.click(), 15000);
    await sleep(1500);
    return true;
};

const searchDocIdOnList = async (page, target, options = {}) => {
    const normalized = normalizeTarget(target);
    const searchValue = normalized.docNumber || normalized.label || normalized.internalId;
    if (!searchValue) return false;

    await navigateToListPage(page);
    await applyPeriodFilterIfAvailable(page, options.month, options.year);

    const fieldSet = await setDocSearchField(page, searchValue);
    if (!fieldSet) {
        log(`DocID search field not found, fallback to list scan for "${searchValue}"`);
        return false;
    }

    const clicked = await clickSearchIfPresent(page);
    if (!clicked) {
        log(`Search button not found after filling DocID "${searchValue}", fallback to list scan`);
        return false;
    }

    await sleep(1200);
    await snap(page, `task-register-search-${searchValue}`);
    log(`DocID search submitted: ${searchValue}`);
    return true;
};

const applyPeriodFilterIfAvailable = async (page, month, year) => {
    if (!month && !year) return;

    try {
        const monthSet = await setFieldIfExists(page, [
            '#MainContent_ddlMonth',
            '#MainContent_ddlPhyMonth',
            '#MainContent_txtMonth',
            '#MainContent_txtPhyMonth',
            'select[id*="Month"]',
            'input[id*="Month"]'
        ], month);

        const yearSet = await setFieldIfExists(page, [
            '#MainContent_ddlYear',
            '#MainContent_ddlPhyYear',
            '#MainContent_txtYear',
            '#MainContent_txtPhyYear',
            'select[id*="Year"]',
            'input[id*="Year"]'
        ], year);

        if (monthSet || yearSet) {
            const clicked = await clickSearchIfPresent(page);
            log(`Period filter attempted: month=${month || '-'}, year=${year || '-'}, search=${clicked}`);
            await snap(page, 'task-register-list-filtered');
        }
    } catch (error) {
        log(`Period filter skipped: ${error.message}`);
    }
};

const parseListRows = async (page) => {
    return page.evaluate(() => {
        const rowSelectors = [
            '#MainContent_gvList tr.mr-l',
            '#MainContent_gvList tr.mr-r',
            'table[id*="gvList"] tr.mr-l',
            'table[id*="gvList"] tr.mr-r',
            'table[id*="TaskRegister"] tr.mr-l',
            'table[id*="TaskRegister"] tr.mr-r'
        ];

        const rows = Array.from(document.querySelectorAll(rowSelectors.join(', ')));
        return rows.map((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll('td'));
            const anchors = Array.from(row.querySelectorAll('a'));
            const detailAnchor = anchors.find((anchor) => /frmPrTrxTaskRegisterDet\.aspx|__doPostBack/i.test(anchor.href || anchor.getAttribute('href') || '')) || anchors[0] || null;
            const href = detailAnchor ? (detailAnchor.href || detailAnchor.getAttribute('href') || '') : '';
            const idMatch = href.match(/[?&]id=([^&#]+)/i);
            const cellTexts = cells.map((cell) => (cell.textContent || '').trim());

            return {
                rowIndex,
                linkId: detailAnchor ? (detailAnchor.id || '') : '',
                linkText: detailAnchor ? (detailAnchor.textContent || '').trim() : '',
                href,
                hrefId: idMatch ? decodeURIComponent(idMatch[1]) : '',
                cellTexts
            };
        }).filter((row) => row.linkId || row.href || row.linkText || row.cellTexts.some(Boolean));
    });
};

const rowMatchesTarget = (row, target) => {
    const targetKeys = getTargetKeys(target);
    if (targetKeys.length === 0) return false;

    const rowKeys = [
        row.linkText,
        row.hrefId,
        row.href,
        ...(row.cellTexts || [])
    ].map(normalizeKey).filter(Boolean);

    return targetKeys.some((targetKey) => {
        return rowKeys.some((rowKey) => rowKey === targetKey || rowKey.includes(`ID=${targetKey}`));
    });
};

const clickListRow = async (page, row) => {
    if (row.linkId) {
        const selector = `#${escapeCssId(row.linkId)}`;
        await waitForNavigationSoft(page, () => page.click(selector), 20000);
    } else if (row.href && /^https?:\/\//i.test(row.href)) {
        await page.goto(row.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } else {
        await waitForNavigationSoft(page, () => page.evaluate((rowIndex) => {
            const rows = Array.from(document.querySelectorAll('#MainContent_gvList tr.mr-l, #MainContent_gvList tr.mr-r, table[id*="gvList"] tr.mr-l, table[id*="gvList"] tr.mr-r'));
            const link = rows[rowIndex]?.querySelector('a');
            if (!link) throw new Error(`No clickable link in row ${rowIndex}`);
            link.click();
        }, row.rowIndex), 20000);
    }

    await sleep(1800);
    await snap(page, `detail-opened-${row.linkText || row.hrefId || row.rowIndex}`);
};

const getListRowsSignature = async (page) => {
    return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#MainContent_gvList tr.mr-l, #MainContent_gvList tr.mr-r, table[id*="gvList"] tr.mr-l, table[id*="gvList"] tr.mr-r'));
        return rows.map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim()).join('|');
    }).catch(() => '');
};

const waitForSignatureChange = async (getSignature, beforeSignature, timeoutMs = 20000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        await sleep(500);
        const currentSignature = await getSignature();
        if (!beforeSignature || !currentSignature || currentSignature !== beforeSignature) {
            return true;
        }
    }
    return false;
};

const goToNextListPage = async (page) => {
    const next = await page.$([
        '#MainContent_btnNext:not([disabled])',
        'input[id*="btnNext"]:not([disabled])',
        'input[name*="btnNext"]:not([disabled])',
        '#MainContent_gvList a[href*="Page$Next"]',
        'table[id*="gvList"] a[href*="Page$Next"]',
        '#MainContent_gvList a[id*="Next"]',
        'table[id*="gvList"] a[id*="Next"]'
    ].join(', '));

    if (!next) return false;
    const beforeSignature = await getListRowsSignature(page);
    await waitForNavigationSoft(page, () => next.click(), 15000);
    const changed = await waitForSignatureChange(() => getListRowsSignature(page), beforeSignature, 20000);
    if (!changed) {
        log('Next clicked but list grid did not change; stopping list pagination');
        return false;
    }
    return true;
};

const openDocFromList = async (page, target, options = {}) => {
    const { month, year } = options;
    const normalized = normalizeTarget(target);
    log(`Open from list: ${normalized.label || normalized.internalId || normalized.docNumber}`);

    const searched = await searchDocIdOnList(page, normalized, { month, year });
    if (!searched) {
        await navigateToListPage(page);
        await applyPeriodFilterIfAvailable(page, month, year);
    }

    let pageNum = 1;
    while (true) {
        const rows = await parseListRows(page);
        log(`List page ${pageNum}: ${rows.length} rows`);

        const match = rows.find((row) => rowMatchesTarget(row, normalized));
        if (match) {
            log(`Matched list row ${match.rowIndex}: text="${match.linkText}", hrefId="${match.hrefId}"`);
            await clickListRow(page, match);
            return { pageNum, row: match };
        }

        const hasNext = await goToNextListPage(page);
        if (!hasNext) break;
        pageNum += 1;
    }

    if (searched) {
        log('No matching row after DocID search, retrying full list scan');
        await navigateToListPage(page);
        await applyPeriodFilterIfAvailable(page, month, year);

        pageNum = 1;
        while (true) {
            const rows = await parseListRows(page);
            log(`Fallback list page ${pageNum}: ${rows.length} rows`);

            const match = rows.find((row) => rowMatchesTarget(row, normalized));
            if (match) {
                log(`Matched fallback row ${match.rowIndex}: text="${match.linkText}", hrefId="${match.hrefId}"`);
                await clickListRow(page, match);
                return { pageNum, row: match };
            }

            const hasNext = await goToNextListPage(page);
            if (!hasNext) break;
            pageNum += 1;
        }
    }

    throw new Error(`Target DocID not found on Task Register list: ${normalized.label || normalized.internalId || normalized.docNumber}`);
};

const canOpenDirectDetail = (target) => {
    const normalized = normalizeTarget(target);
    return /^\d+$/.test(String(normalized.internalId || '').trim());
};

const openDocDirect = async (page, target) => {
    const normalized = normalizeTarget(target);
    const detailId = String(normalized.internalId || '').trim();
    if (!detailId) throw new Error('Missing internal detail id for direct open');

    log(`Open detail directly: id=${detailId}, label=${normalized.label || normalized.docNumber || '-'}`);
    await page.goto(`${TASK_REGISTER_DETAIL_URL}?id=${encodeURIComponent(detailId)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });
    await sleep(1500);

    if (await page.$('#txtUsername')) {
        log('Session expired while opening detail, logging in again');
        await login(page);
        await page.goto(`${TASK_REGISTER_DETAIL_URL}?id=${encodeURIComponent(detailId)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await sleep(1500);
    }

    await snap(page, `detail-direct-${normalized.label || detailId}`);
};

const collectDocTargetsFromList = async (page, options = {}) => {
    const { month, year, limit = 0 } = options;
    await navigateToListPage(page);
    await applyPeriodFilterIfAvailable(page, month, year);

    const collected = [];
    const seen = new Set();
    let pageNum = 1;

    while (true) {
        const rows = await parseListRows(page);
        log(`List page ${pageNum}: collected scan ${rows.length} rows`);

        for (const row of rows) {
            const internalId = row.hrefId || '';
            const docNumber = row.linkText || row.cellTexts?.[0] || '';
            const key = normalizeKey(internalId || docNumber || row.href);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            collected.push({
                internalId,
                docNumber,
                label: docNumber || internalId,
                listPage: pageNum
            });
            if (limit && collected.length >= limit) return collected;
        }

        const hasNext = await goToNextListPage(page);
        if (!hasNext) break;
        pageNum += 1;
    }

    return collected;
};

const parseCurrentDetailRows = async (page, options = {}) => {
    const { category = 'ot', employeeFilter = [] } = options;
    const normalizedCategory = String(category || 'ot').toLowerCase();
    const filterSet = new Set((employeeFilter || []).map((employee) => normalizeKey(employee.empCode)).filter(Boolean));

    return page.evaluate((targetCategory, empCodes) => {
        const wantedEmployees = new Set(empCodes);
        const rows = Array.from(document.querySelectorAll('#MainContent_gvLine tr.mr-l, #MainContent_gvLine tr.mr-r, table[id*="gvLine"] tr.mr-l, table[id*="gvLine"] tr.mr-r'));

        return rows.map((row, idx) => {
            const cells = Array.from(row.querySelectorAll('td'));
            const deleteLink = row.querySelector([
                'a[id*="lbDelete"]',
                'a[id*="Delete"]',
                'a[href*="Delete"]',
                'input[id*="Delete"]',
                'input[value*="Delete"]',
                'button[id*="Delete"]'
            ].join(', '));
            const normalOT = (cells[9]?.textContent || '').trim();
            const empCode = (cells[2]?.textContent || '').trim();
            const empKey = empCode.trim().toUpperCase();

            let matchesCategory = false;
            if (targetCategory === 'all') matchesCategory = true;
            else if (targetCategory === 'normal') matchesCategory = normalOT.toUpperCase() === 'NORMAL';
            else matchesCategory = normalOT.toUpperCase() === 'OT';

            const matchesEmployee = wantedEmployees.size === 0 || wantedEmployees.has(empKey);

            return {
                rowIndex: idx,
                taskCode: (cells[0]?.textContent || '').trim(),
                trxDate: (cells[1]?.textContent || '').trim(),
                empCode,
                empName: (cells[3]?.textContent || '').trim(),
                station: (cells[4]?.textContent || '').trim(),
                normalOT,
                shiftCode: (cells[10]?.textContent || '').trim(),
                hours: (cells[11]?.textContent || '').trim(),
                amount: (cells[14]?.textContent || '').trim(),
                deleteId: deleteLink?.id || '',
                hasDelete: Boolean(deleteLink),
                isTarget: matchesCategory && matchesEmployee
            };
        });
    }, normalizedCategory, Array.from(filterSet));
};

const getDetailRowsSignature = async (page) => {
    return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#MainContent_gvLine tr.mr-l, #MainContent_gvLine tr.mr-r, table[id*="gvLine"] tr.mr-l, table[id*="gvLine"] tr.mr-r'));
        return rows.map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim()).join('|');
    }).catch(() => '');
};

const goToNextDetailPage = async (page) => {
    const next = await page.$([
        '#MainContent_btnNext:not([disabled])',
        'input[id*="btnNext"]:not([disabled])',
        'input[name*="btnNext"]:not([disabled])',
        '#MainContent_gvLine a[href*="Page$Next"]',
        'table[id*="gvLine"] a[href*="Page$Next"]',
        '#MainContent_gvLine a[id*="Next"]',
        'table[id*="gvLine"] a[id*="Next"]'
    ].join(', '));

    if (!next) return false;
    const beforeSignature = await getDetailRowsSignature(page);
    await waitForNavigationSoft(page, () => next.click(), 15000);
    const changed = await waitForSignatureChange(() => getDetailRowsSignature(page), beforeSignature, 20000);
    if (!changed) {
        log('Next clicked but detail grid did not change; stopping pagination');
        return false;
    }
    return true;
};

const deleteDetailRow = async (page, row) => {
    if (!row.deleteId) throw new Error(`Row ${row.rowIndex} has no delete link`);

    let dialogMessage = '';
    const onDialog = async (dialog) => {
        dialogMessage = dialog.message();
        log(`Dialog: ${dialogMessage}`);
        await dialog.accept();
    };

    page.once('dialog', onDialog);
    await snap(page, `before-delete-${row.empCode}-${row.trxDate}-${row.rowIndex}`);
    await waitForNavigationSoft(page, () => page.click(`#${escapeCssId(row.deleteId)}`), 20000);
    await sleep(1800);
    await snap(page, `after-delete-${row.empCode}-${row.trxDate}-${row.rowIndex}`);

    return dialogMessage;
};

const processCurrentDetailPage = async (page, docTarget, options = {}) => {
    const { category = 'ot', employeeFilter = [], dryRun = false, onProgress, maxPages = 50 } = options;
    const docLabel = normalizeTarget(docTarget).label || normalizeTarget(docTarget).internalId;

    let pageNum = 1;
    let totalFound = 0;
    let totalDeleted = 0;
    const results = [];

    while (true) {
        let pass = 1;

        while (true) {
            await sleep(1000);
            const rows = await parseCurrentDetailRows(page, { category, employeeFilter });
            const targetRows = rows.filter((row) => row.isTarget);
            totalFound += targetRows.length;

            log(`Detail page ${pageNum}.${pass}: found ${targetRows.length} ${categoryLabel(category)} row(s)`);
            for (const row of targetRows) {
                log(`  target row=${row.rowIndex} ${row.trxDate} ${row.empCode} ${row.empName} ${row.normalOT} ${row.hours}h delete=${row.deleteId || 'no'}`);
            }

            if (targetRows.length === 0) break;

            for (let i = targetRows.length - 1; i >= 0; i--) {
                const row = targetRows[i];
                if (dryRun) {
                    results.push({ docId: docLabel, page: pageNum, rowIndex: row.rowIndex, date: row.trxDate, empCode: row.empCode, status: 'dry-run' });
                    continue;
                }

                try {
                    log(`Deleting row ${row.rowIndex}: ${row.trxDate} ${row.empCode} ${row.empName} ${row.normalOT} ${row.hours}h`);
                    const dialogMessage = await deleteDetailRow(page, row);
                    totalDeleted += 1;
                    const result = {
                        docId: docLabel,
                        page: pageNum,
                        rowIndex: row.rowIndex,
                        date: row.trxDate,
                        empCode: row.empCode,
                        empName: row.empName,
                        status: 'deleted',
                        dialogMessage
                    };
                    results.push(result);
                    if (onProgress) onProgress({ docId: docLabel, pageNum, rowIndex: row.rowIndex, totalDeleted, totalFound, result });
                } catch (error) {
                    log(`Delete error: ${error.message}`);
                    results.push({
                        docId: docLabel,
                        page: pageNum,
                        rowIndex: row.rowIndex,
                        date: row.trxDate,
                        empCode: row.empCode,
                        empName: row.empName,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            if (dryRun) break;
            pass += 1;
        }

        if (pageNum >= maxPages) {
            log(`Max detail pages reached (${maxPages}); stopping pagination for this DocID`);
            break;
        }

        const hasNext = await goToNextDetailPage(page);
        if (!hasNext) break;
        log(`Moved to detail page ${pageNum + 1} via Next`);
        pageNum += 1;
    }

    log(`Result doc=${docLabel} found=${totalFound} deleted=${totalDeleted} dryRun=${dryRun}`);
    return { docId: docLabel, totalFound, totalDeleted, dryRun, results };
};

const processDocId = async (page, docTarget, options = {}) => {
    const { month, year, category = 'ot', employeeFilter = [], dryRun = false, onProgress, maxPages = 50 } = options;

    if (canOpenDirectDetail(docTarget)) {
        await openDocDirect(page, docTarget);
    } else {
        await openDocFromList(page, docTarget, { month, year });
    }

    try {
        await page.waitForSelector('#MainContent_gvLine, table[id*="gvLine"]', { timeout: 15000 });
    } catch (error) {
        throw new Error(`Detail grid not found after opening DocID: ${error.message}`);
    }

    return processCurrentDetailPage(page, docTarget, { category, employeeFilter, dryRun, onProgress, maxPages });
};

const createBrowser = async (engineIndex = 1) => {
    const headless = process.env.HEADLESS === 'true';
    const profileDir = path.join(__dirname, 'chrome_data', `engine_${engineIndex}`);

    const browser = await puppeteer.launch({
        headless,
        userDataDir: profileDir,
        args: [
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--ignore-certificate-errors'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    return { browser, page };
};

const partitionTargets = (targets, maxEngines) => {
    const partitions = [];
    for (let i = 0; i < maxEngines; i += 1) partitions.push([]);
    targets.forEach((target, index) => {
        partitions[index % maxEngines].push(target);
    });
    return partitions.filter((partition) => partition.length > 0);
};

const discoverAllTargetsFromList = async (options = {}) => {
    const { month, year, limit = 0 } = options;
    const { browser, page } = await createBrowser(1);
    try {
        await login(page);
        const targets = await collectDocTargetsFromList(page, { month, year, limit });
        log(`Discovered ${targets.length} DocID target(s) from list page`);
        return targets;
    } finally {
        await browser.close();
    }
};

const runParallel = async (targets, options = {}) => {
    const maxEngines = Math.max(1, parseInt(process.env.AUTOMATION_INSTANCES || '1', 10));
    const category = String(options.category || 'ot').toLowerCase();
    const dryRun = Boolean(options.dryRun);
    const employeeFilter = normalizeEmployeeFilter(options.employeeFilter || options.employees || []);
    const month = options.month || null;
    const year = options.year || null;
    const maxPages = Math.max(1, parseInt(options.maxPages || '50', 10));

    let docTargets = (Array.isArray(targets) ? targets : []).map(normalizeTarget).filter((target) => target.internalId || target.docNumber || target.label);

    if (options.processAllFromList) {
        docTargets = await discoverAllTargetsFromList({ month, year, limit: options.limit || 0 });
    }

    if (docTargets.length === 0) {
        throw new Error('No DocID targets to process');
    }

    console.log('');
    console.log('='.repeat(70));
    console.log(`DELETE RUNNER - ${docTargets.length} DocID target(s), category=${category}, dryRun=${dryRun}, engines=${maxEngines}`);
    if (employeeFilter.length > 0) console.log(`Employee filter: ${employeeFilter.map((e) => e.empCode).join(', ')}`);
    console.log('='.repeat(70));
    console.log('');

    const partitions = partitionTargets(docTargets, maxEngines);
    partitions.forEach((partition, index) => {
        console.log(`Engine ${index + 1}: ${partition.map((target) => target.label || target.internalId || target.docNumber).join(', ')}`);
    });

    const allResults = [];

    for (let i = 0; i < partitions.length; i += 1) {
        const { browser, page } = await createBrowser(i + 1);
        try {
            await login(page);
            for (const target of partitions[i]) {
                try {
                    const result = await processDocId(page, target, {
                        month,
                        year,
                        category,
                        employeeFilter,
                        dryRun,
                        maxPages,
                        onProgress: (info) => {
                            if (info.result) allResults.push(info.result);
                        }
                    });
                    console.log(JSON.stringify(result));
                    if (dryRun) allResults.push(...result.results);
                } catch (error) {
                    const docLabel = target.label || target.internalId || target.docNumber;
                    const result = { docId: docLabel, status: 'error', error: error.message };
                    allResults.push(result);
                    console.error(JSON.stringify(result));
                }
            }
        } finally {
            await browser.close();
        }
    }

    const deletedCount = allResults.filter((result) => result.status === 'deleted').length;
    const dryRunCount = allResults.filter((result) => result.status === 'dry-run').length;

    console.log('');
    console.log('='.repeat(70));
    console.log(`DELETE RUNNER COMPLETE - deleted=${deletedCount}, dryRunTargets=${dryRunCount}`);
    console.log('='.repeat(70));

    return allResults;
};

const loadDataFile = () => {
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`Data file not found: ${DATA_FILE}`);
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

const getTargetsFromData = (data) => {
    if (Array.isArray(data.docTargets) && data.docTargets.length > 0) return data.docTargets;
    return (data.docIds || []).map((docId) => ({ internalId: docId, label: docId }));
};

const parseBooleanOption = (value, fallback = false) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
};

const runFromDataFile = async (options = {}) => {
    const data = loadDataFile();
    const metadata = data.metadata || {};
    const processAllFromList = Boolean(metadata.processAllFromList || metadata.mode === 'all' || metadata.targetMode === 'all');
    const targets = getTargetsFromData(data);
    const dryRun = options.dryRun !== undefined
        ? parseBooleanOption(options.dryRun)
        : parseBooleanOption(metadata.dryRun);

    return runParallel(targets, {
        processAllFromList,
        category: options.category || metadata.category || 'ot',
        employees: data.employees || [],
        month: metadata.month,
        year: metadata.year,
        dryRun,
        limit: options.limit ?? metadata.limit ?? 0,
        maxPages: options.maxPages ?? metadata.maxPages ?? 50
    });
};

const main = async () => {
    const args = process.argv.slice(2);
    const hasDryRunArg = args.includes('--dry-run') || args.includes('--dry');
    const dryRun = hasDryRunArg ? true : undefined;
    const limitArgIndex = args.findIndex((arg) => arg === '--limit');
    const categoryArgIndex = args.findIndex((arg) => arg === '--category');
    const maxPagesArgIndex = args.findIndex((arg) => arg === '--max-pages');
    const limit = limitArgIndex >= 0 ? parseInt(args[limitArgIndex + 1] || '0', 10) : 0;
    const category = categoryArgIndex >= 0 ? String(args[categoryArgIndex + 1] || 'ot').toLowerCase() : 'ot';
    const maxPages = maxPagesArgIndex >= 0 ? parseInt(args[maxPagesArgIndex + 1] || '50', 10) : 50;
    const positional = args.filter((arg, index) => {
        if (arg === '--dry-run' || arg === '--dry' || arg === '--all') return false;
        if (arg === '--limit' || (limitArgIndex >= 0 && index === limitArgIndex + 1)) return false;
        if (arg === '--category' || (categoryArgIndex >= 0 && index === categoryArgIndex + 1)) return false;
        if (arg === '--max-pages' || (maxPagesArgIndex >= 0 && index === maxPagesArgIndex + 1)) return false;
        return !arg.startsWith('--');
    });

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Usage:
  node delete-ot-runner.js --all
      Load current_delete_data.json and process configured scope.

  node delete-ot-runner.js --dry-run --all
      Same flow, but only lists rows that would be deleted.

  node delete-ot-runner.js --dry-run --all --limit 2
      Dry-run first 2 DocIDs discovered from list mode.

  node delete-ot-runner.js --dry-run --category all AD26040006
      Dry-run all detail rows and exercise detail pagination.

  node delete-ot-runner.js --dry-run --category all --max-pages 2 AD26040006
      Dry-run first two detail pages only.

  node delete-ot-runner.js 34986 34987
      Click matching DocIDs from Task Register list, then delete OT rows.
`);
        return;
    }

    if (args.includes('--all')) {
        await runFromDataFile({ dryRun, limit, category, maxPages });
        return;
    }

    if (positional.length > 0) {
        await runParallel(positional.map((docId) => ({ internalId: docId, label: docId })), { dryRun: Boolean(dryRun), category, maxPages });
        return;
    }

    throw new Error('No DocID targets specified. Use --all or pass DocID values.');
};

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    TASK_REGISTER_LIST_URL,
    login,
    navigateToListPage,
    collectDocTargetsFromList,
    openDocFromList,
    parseCurrentDetailRows,
    processDocId,
    runParallel,
    runFromDataFile,
    normalizeTarget,
    normalizeEmployeeFilter
};
