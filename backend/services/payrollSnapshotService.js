const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

let DB_PATH = process.env.PAYROLL_SNAPSHOT_DB_PATH
    || path.join(__dirname, '../../data/payroll_snapshot.db');

const COMPONENT_DEFS = {
    gajiPokok: { label: 'Gaji Pokok', type: 'earning', automatable: false },
    lembur: { label: 'Lembur', type: 'earning', automatable: true, adCode: 'AL0019' },
    jabatan: { label: 'Tj. Jabatan', type: 'earning', automatable: true, adCode: 'GA9128' },
    beras: { label: 'Tj. Beras', type: 'earning', automatable: true, adCode: 'AL0011' },
    masaKerja: { label: 'Tj. Masa Kerja', type: 'earning', automatable: true, adCode: 'GA9129' },
    premi: { label: 'Premi', type: 'earning', automatable: false },
    pph21: { label: 'PPh 21', type: 'deduction', automatable: true, adCode: 'DEPH21' },
    bpjsKes: { label: 'BPJS Kesehatan', type: 'deduction', automatable: false },
    bpjsPen: { label: 'BPJS Pensiun', type: 'deduction', automatable: false },
    spsi: { label: 'SPSI', type: 'deduction', automatable: true, adCode: 'DE0003' },
    upahBersih: { label: 'Net Pay', type: 'summary', automatable: false }
};

const openConnection = () => {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    return new sqlite3.Database(DB_PATH);
};

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
    });
});

const get = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const all = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
    });
});

const exec = (db, sql) => new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
    });
});

const close = (db) => new Promise((resolve, reject) => {
    db.close((err) => {
        if (err) reject(err);
        else resolve();
    });
});

const jsonStringify = (value) => JSON.stringify(value ?? null);

const jsonParse = (value, fallback = null) => {
    if (value === null || value === undefined || value === '') return fallback;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
};

const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const toBoolInt = (value) => value ? 1 : 0;

const hashPayload = (payload) => crypto
    .createHash('sha256')
    .update(JSON.stringify(payload ?? null))
    .digest('hex');

const assertPeriod = (month, year) => {
    const numericMonth = parseInt(month, 10);
    const numericYear = parseInt(year, 10);
    if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
        throw new Error('month must be an integer from 1 to 12');
    }
    if (!Number.isInteger(numericYear) || numericYear < 2000) {
        throw new Error('year must be a valid four-digit year');
    }
    return { month: numericMonth, year: numericYear };
};

const initPayrollSnapshotDB = async () => {
    const db = openConnection();
    try {
        await exec(db, 'PRAGMA foreign_keys = ON;');
        await exec(db, `
            CREATE TABLE IF NOT EXISTS payroll_snapshots (
                id TEXT PRIMARY KEY,
                period_year INTEGER NOT NULL,
                period_month INTEGER NOT NULL,
                label TEXT NOT NULL,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                is_active INTEGER NOT NULL DEFAULT 0,
                source_type TEXT NOT NULL DEFAULT 'live_capture',
                captured_at TEXT NOT NULL,
                captured_by TEXT,
                employee_count INTEGER NOT NULL DEFAULT 0,
                component_count INTEGER NOT NULL DEFAULT 0,
                venus_total_netpay REAL NOT NULL DEFAULT 0,
                millware_total_netpay REAL NOT NULL DEFAULT 0,
                netpay_diff REAL NOT NULL DEFAULT 0,
                payload_hash TEXT,
                comparison_config_json TEXT,
                source_info_json TEXT,
                analysis_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT
            );

            CREATE TABLE IF NOT EXISTS payroll_snapshot_employees (
                id TEXT PRIMARY KEY,
                snapshot_id TEXT NOT NULL,
                row_order INTEGER NOT NULL DEFAULT 0,
                venus_employee_id TEXT NOT NULL,
                ptrj_employee_id TEXT,
                employee_name TEXT NOT NULL,
                charge_job TEXT,
                is_karyawan INTEGER,
                py_numbers_json TEXT,
                gaji_pokok REAL NOT NULL DEFAULT 0,
                tunjangan_total REAL NOT NULL DEFAULT 0,
                potongan_total REAL NOT NULL DEFAULT 0,
                upah_bersih REAL NOT NULL DEFAULT 0,
                has_millware INTEGER NOT NULL DEFAULT 0,
                is_synced INTEGER NOT NULL DEFAULT 0,
                sync_status TEXT NOT NULL DEFAULT 'UNKNOWN',
                employee_payload_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES payroll_snapshots(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS payroll_snapshot_components (
                id TEXT PRIMARY KEY,
                snapshot_id TEXT NOT NULL,
                snapshot_employee_id TEXT NOT NULL,
                component_key TEXT NOT NULL,
                component_label TEXT NOT NULL,
                component_type TEXT NOT NULL,
                venus_amount REAL NOT NULL DEFAULT 0,
                millware_amount REAL NOT NULL DEFAULT 0,
                diff_amount REAL NOT NULL DEFAULT 0,
                abs_diff_amount REAL NOT NULL DEFAULT 0,
                tolerance REAL NOT NULL DEFAULT 50,
                status TEXT NOT NULL,
                missing_in TEXT,
                is_missing_component INTEGER NOT NULL DEFAULT 0,
                is_automatable INTEGER NOT NULL DEFAULT 0,
                ad_code TEXT,
                ad_code_desc TEXT,
                venus_component_codes_json TEXT,
                venus_component_names_json TEXT,
                millware_task_codes_json TEXT,
                metadata_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES payroll_snapshots(id) ON DELETE CASCADE,
                FOREIGN KEY (snapshot_employee_id) REFERENCES payroll_snapshot_employees(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS payroll_snapshot_raw_sources (
                id TEXT PRIMARY KEY,
                snapshot_id TEXT NOT NULL,
                source_system TEXT NOT NULL,
                source_table TEXT,
                source_key TEXT,
                payload_hash TEXT,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES payroll_snapshots(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS payroll_snapshot_events (
                id TEXT PRIMARY KEY,
                snapshot_id TEXT,
                event_type TEXT NOT NULL,
                actor TEXT,
                details_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES payroll_snapshots(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_payroll_snapshots_period
                ON payroll_snapshots(period_year, period_month, deleted_at);
            CREATE INDEX IF NOT EXISTS idx_payroll_snapshots_active
                ON payroll_snapshots(period_year, period_month, is_active, deleted_at);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_snapshots_one_active_period
                ON payroll_snapshots(period_year, period_month)
                WHERE is_active = 1 AND deleted_at IS NULL;

            CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_employees_snapshot
                ON payroll_snapshot_employees(snapshot_id, row_order);
            CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_employees_venus
                ON payroll_snapshot_employees(snapshot_id, venus_employee_id);
            CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_employees_ptrj
                ON payroll_snapshot_employees(snapshot_id, ptrj_employee_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_snapshot_employees_unique
                ON payroll_snapshot_employees(snapshot_id, venus_employee_id);

            CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_components_snapshot
                ON payroll_snapshot_components(snapshot_id, component_key, status);
            CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_components_employee
                ON payroll_snapshot_components(snapshot_employee_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_snapshot_components_unique
                ON payroll_snapshot_components(snapshot_employee_id, component_key);

            CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_raw_sources_snapshot
                ON payroll_snapshot_raw_sources(snapshot_id, source_system, source_table);
            CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_events_snapshot
                ON payroll_snapshot_events(snapshot_id, created_at);
        `);
    } finally {
        await close(db);
    }
};

const getSnapshotSyncStatus = (row) => {
    if (row.sync?.isSynced) return 'SYNC';
    if (row.millware) return 'DIFF';
    return 'NO_MILLWARE';
};

const getComponentRows = (employee) => {
    const sync = employee.sync || {};
    return Object.entries(COMPONENT_DEFS).map(([key, def]) => {
        const pair = sync[key] || {};
        const venusAmount = toNumber(pair.venus);
        const millwareAmount = toNumber(pair.millware);
        const diffAmount = venusAmount - millwareAmount;
        const statusInfo = key === 'beras' ? sync.berasStatus : null;
        const status = statusInfo?.status
            || (Math.abs(diffAmount) <= 50 ? 'MATCH' : 'DIFF');

        return {
            component_key: key,
            component_label: def.label,
            component_type: def.type,
            venus_amount: venusAmount,
            millware_amount: millwareAmount,
            diff_amount: diffAmount,
            abs_diff_amount: Math.abs(diffAmount),
            tolerance: 50,
            status,
            missing_in: statusInfo?.missingIn || null,
            is_missing_component: toBoolInt(statusInfo?.isMissingComponent),
            is_automatable: toBoolInt(def.automatable),
            ad_code: def.adCode || null,
            ad_code_desc: null,
            metadata_json: jsonStringify(statusInfo || {})
        };
    });
};

const mapSnapshotRow = (row) => ({
    id: row.id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    label: row.label,
    notes: row.notes,
    status: row.status,
    isActive: row.is_active === 1,
    sourceType: row.source_type,
    capturedAt: row.captured_at,
    capturedBy: row.captured_by,
    employeeCount: row.employee_count,
    componentCount: row.component_count,
    venusTotalNetpay: row.venus_total_netpay,
    millwareTotalNetpay: row.millware_total_netpay,
    netpayDiff: row.netpay_diff,
    payloadHash: row.payload_hash,
    sourceInfo: jsonParse(row.source_info_json, null),
    analysis: jsonParse(row.analysis_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

const insertEvent = async (db, snapshotId, eventType, details = {}, actor = null) => {
    await run(db, `
        INSERT INTO payroll_snapshot_events (id, snapshot_id, event_type, actor, details_json)
        VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), snapshotId || null, eventType, actor, jsonStringify(details)]);
};

const createPayrollSnapshot = async ({
    month,
    year,
    label,
    notes = '',
    payrollResult,
    setActive = false,
    capturedBy = null,
    comparisonConfig = null,
    sourceInfo = null
}) => {
    const period = assertPeriod(month, year);
    if (!payrollResult?.success || !Array.isArray(payrollResult.data)) {
        throw new Error('payrollResult with success=true and data array is required');
    }

    await initPayrollSnapshotDB();
    const db = openConnection();
    const snapshotId = uuidv4();
    const capturedAt = new Date().toISOString();
    const employees = payrollResult.data;
    const analysis = payrollResult.analysis || null;
    const componentCount = employees.reduce((sum, employee) => sum + getComponentRows(employee).length, 0);
    const effectiveLabel = String(label || `Payroll ${String(period.month).padStart(2, '0')}/${period.year} ${capturedAt}`).trim();
    const effectiveSourceInfo = {
        ...(sourceInfo || payrollResult.sourceInfo || {}),
        capturedFrom: payrollResult.sourceInfo?.source || 'live',
        snapshotId,
        capturedAt
    };

    try {
        await run(db, 'PRAGMA foreign_keys = ON;');
        await run(db, 'BEGIN IMMEDIATE TRANSACTION;');

        if (setActive) {
            await run(db, `
                UPDATE payroll_snapshots
                SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                WHERE period_year = ? AND period_month = ? AND deleted_at IS NULL
            `, [period.year, period.month]);
        }

        await run(db, `
            INSERT INTO payroll_snapshots (
                id, period_year, period_month, label, notes, status, is_active,
                source_type, captured_at, captured_by, employee_count, component_count,
                venus_total_netpay, millware_total_netpay, netpay_diff, payload_hash,
                comparison_config_json, source_info_json, analysis_json
            ) VALUES (?, ?, ?, ?, ?, 'active', ?, 'live_capture', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            snapshotId,
            period.year,
            period.month,
            effectiveLabel,
            notes || null,
            toBoolInt(setActive),
            capturedAt,
            capturedBy,
            employees.length,
            componentCount,
            toNumber(analysis?.venusNetpayTotal),
            toNumber(analysis?.millwareNetpayTotal),
            toNumber(analysis?.netpayDiff),
            hashPayload(payrollResult),
            jsonStringify(comparisonConfig),
            jsonStringify(effectiveSourceInfo),
            jsonStringify(analysis)
        ]);

        for (let index = 0; index < employees.length; index += 1) {
            const employee = employees[index];
            const snapshotEmployeeId = uuidv4();
            const pyNumbers = [
                ...(employee.tunjanganDetails || []).map(item => item.PYNumber).filter(Boolean),
                ...(employee.potonganDetails || []).map(item => item.PYNumber).filter(Boolean)
            ];

            await run(db, `
                INSERT INTO payroll_snapshot_employees (
                    id, snapshot_id, row_order, venus_employee_id, ptrj_employee_id,
                    employee_name, charge_job, is_karyawan, py_numbers_json,
                    gaji_pokok, tunjangan_total, potongan_total, upah_bersih,
                    has_millware, is_synced, sync_status, employee_payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                snapshotEmployeeId,
                snapshotId,
                index,
                String(employee.id || employee.EmployeeID || '').trim(),
                employee.ptrjId || employee.ptrjEmployeeID || employee.PTRJEmployeeID || null,
                employee.name || employee.EmployeeName || employee.id || 'Unknown',
                employee.chargeJob || null,
                employee.isKaryawan === undefined ? null : toBoolInt(employee.isKaryawan),
                jsonStringify([...new Set(pyNumbers)]),
                toNumber(employee.gajiPokok),
                toNumber(employee.tunjanganTotal),
                toNumber(employee.potonganTotal),
                toNumber(employee.upahBersih),
                toBoolInt(employee.millware),
                toBoolInt(employee.sync?.isSynced),
                getSnapshotSyncStatus(employee),
                jsonStringify(employee)
            ]);

            for (const component of getComponentRows(employee)) {
                await run(db, `
                    INSERT INTO payroll_snapshot_components (
                        id, snapshot_id, snapshot_employee_id, component_key, component_label,
                        component_type, venus_amount, millware_amount, diff_amount,
                        abs_diff_amount, tolerance, status, missing_in, is_missing_component,
                        is_automatable, ad_code, ad_code_desc, venus_component_codes_json,
                        venus_component_names_json, millware_task_codes_json, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    uuidv4(),
                    snapshotId,
                    snapshotEmployeeId,
                    component.component_key,
                    component.component_label,
                    component.component_type,
                    component.venus_amount,
                    component.millware_amount,
                    component.diff_amount,
                    component.abs_diff_amount,
                    component.tolerance,
                    component.status,
                    component.missing_in,
                    component.is_missing_component,
                    component.is_automatable,
                    component.ad_code,
                    component.ad_code_desc,
                    jsonStringify([]),
                    jsonStringify([]),
                    jsonStringify([]),
                    component.metadata_json
                ]);
            }
        }

        await run(db, `
            INSERT INTO payroll_snapshot_raw_sources (
                id, snapshot_id, source_system, source_table, source_key, payload_hash, payload_json
            ) VALUES (?, ?, 'application', 'payroll_result', ?, ?, ?)
        `, [
            uuidv4(),
            snapshotId,
            `${period.year}-${String(period.month).padStart(2, '0')}`,
            hashPayload(payrollResult),
            jsonStringify(payrollResult)
        ]);

        await insertEvent(db, snapshotId, 'created', {
            setActive: Boolean(setActive),
            employeeCount: employees.length,
            componentCount
        }, capturedBy);

        await run(db, 'COMMIT;');
        return getPayrollSnapshot(snapshotId);
    } catch (error) {
        try {
            await run(db, 'ROLLBACK;');
        } catch (_) {
            // Ignore rollback failure and surface the original error.
        }
        throw error;
    } finally {
        await close(db);
    }
};

const listPayrollSnapshots = async (month, year) => {
    const period = assertPeriod(month, year);
    await initPayrollSnapshotDB();
    const db = openConnection();
    try {
        const rows = await all(db, `
            SELECT *
            FROM payroll_snapshots
            WHERE period_year = ? AND period_month = ? AND deleted_at IS NULL
            ORDER BY is_active DESC, captured_at DESC, created_at DESC
        `, [period.year, period.month]);
        return rows.map(mapSnapshotRow);
    } finally {
        await close(db);
    }
};

const getPayrollSnapshot = async (snapshotId) => {
    if (!snapshotId) throw new Error('snapshotId is required');
    await initPayrollSnapshotDB();
    const db = openConnection();
    try {
        const row = await get(db, `
            SELECT *
            FROM payroll_snapshots
            WHERE id = ? AND deleted_at IS NULL
        `, [snapshotId]);
        if (!row) return null;
        return mapSnapshotRow(row);
    } finally {
        await close(db);
    }
};

const getActivePayrollSnapshot = async (month, year) => {
    const period = assertPeriod(month, year);
    await initPayrollSnapshotDB();
    const db = openConnection();
    try {
        const row = await get(db, `
            SELECT *
            FROM payroll_snapshots
            WHERE period_year = ? AND period_month = ?
              AND is_active = 1 AND deleted_at IS NULL
            ORDER BY captured_at DESC
            LIMIT 1
        `, [period.year, period.month]);
        return row ? mapSnapshotRow(row) : null;
    } finally {
        await close(db);
    }
};

const updatePayrollSnapshot = async (snapshotId, updates = {}) => {
    if (!snapshotId) throw new Error('snapshotId is required');
    const allowed = [];
    const params = [];

    if (updates.label !== undefined) {
        allowed.push('label = ?');
        params.push(String(updates.label || '').trim());
    }
    if (updates.notes !== undefined) {
        allowed.push('notes = ?');
        params.push(updates.notes || null);
    }
    if (updates.status !== undefined) {
        allowed.push('status = ?');
        params.push(String(updates.status || 'active').trim());
    }

    if (allowed.length === 0) return getPayrollSnapshot(snapshotId);

    await initPayrollSnapshotDB();
    const db = openConnection();
    try {
        await run(db, `
            UPDATE payroll_snapshots
            SET ${allowed.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND deleted_at IS NULL
        `, [...params, snapshotId]);
        await insertEvent(db, snapshotId, 'updated', updates, updates.actor || null);
    } finally {
        await close(db);
    }
    return getPayrollSnapshot(snapshotId);
};

const activatePayrollSnapshot = async (snapshotId, actor = null) => {
    if (!snapshotId) throw new Error('snapshotId is required');
    await initPayrollSnapshotDB();
    const db = openConnection();
    try {
        await run(db, 'BEGIN IMMEDIATE TRANSACTION;');
        const snapshot = await get(db, `
            SELECT *
            FROM payroll_snapshots
            WHERE id = ? AND deleted_at IS NULL
        `, [snapshotId]);
        if (!snapshot) throw new Error('Snapshot not found');

        await run(db, `
            UPDATE payroll_snapshots
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE period_year = ? AND period_month = ? AND deleted_at IS NULL
        `, [snapshot.period_year, snapshot.period_month]);
        await run(db, `
            UPDATE payroll_snapshots
            SET is_active = 1, status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [snapshotId]);
        await insertEvent(db, snapshotId, 'activated', {
            periodYear: snapshot.period_year,
            periodMonth: snapshot.period_month
        }, actor);
        await run(db, 'COMMIT;');
    } catch (error) {
        try {
            await run(db, 'ROLLBACK;');
        } catch (_) {
            // Ignore rollback failure.
        }
        throw error;
    } finally {
        await close(db);
    }
    return getPayrollSnapshot(snapshotId);
};

const softDeletePayrollSnapshot = async (snapshotId, actor = null) => {
    if (!snapshotId) throw new Error('snapshotId is required');
    await initPayrollSnapshotDB();
    const db = openConnection();
    try {
        await run(db, `
            UPDATE payroll_snapshots
            SET deleted_at = CURRENT_TIMESTAMP,
                status = 'deleted',
                is_active = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND deleted_at IS NULL
        `, [snapshotId]);
        await insertEvent(db, snapshotId, 'deleted', {}, actor);
    } finally {
        await close(db);
    }
    return { id: snapshotId, deleted: true };
};

const buildPayrollResultFromSnapshot = async (snapshotId) => {
    const snapshot = await getPayrollSnapshot(snapshotId);
    if (!snapshot) {
        return {
            success: false,
            error: 'Snapshot not found'
        };
    }

    const db = openConnection();
    try {
        const employeeRows = await all(db, `
            SELECT *
            FROM payroll_snapshot_employees
            WHERE snapshot_id = ?
            ORDER BY row_order ASC, employee_name ASC
        `, [snapshotId]);
        const data = employeeRows.map(row => jsonParse(row.employee_payload_json, {
            id: row.venus_employee_id,
            name: row.employee_name,
            ptrjId: row.ptrj_employee_id || '-',
            chargeJob: row.charge_job || '-',
            gajiPokok: row.gaji_pokok,
            tunjanganTotal: row.tunjangan_total,
            potonganTotal: row.potongan_total,
            upahBersih: row.upah_bersih,
            tunjanganDetails: [],
            potonganDetails: [],
            millware: row.has_millware ? {} : null,
            sync: { isSynced: row.is_synced === 1 }
        }));

        return {
            success: true,
            data,
            analysis: snapshot.analysis,
            sourceInfo: {
                source: 'snapshot',
                snapshotId: snapshot.id,
                label: snapshot.label,
                capturedAt: snapshot.capturedAt,
                isActive: snapshot.isActive,
                periodMonth: snapshot.periodMonth,
                periodYear: snapshot.periodYear
            }
        };
    } finally {
        await close(db);
    }
};

const buildPayrollResultFromActiveSnapshot = async (month, year) => {
    const activeSnapshot = await getActivePayrollSnapshot(month, year);
    if (!activeSnapshot) {
        return {
            success: false,
            error: `No active payroll snapshot for ${month}/${year}`
        };
    }
    return buildPayrollResultFromSnapshot(activeSnapshot.id);
};

const _setDatabasePathForTests = (nextPath) => {
    DB_PATH = nextPath;
};

const _getDatabasePath = () => DB_PATH;

module.exports = {
    initPayrollSnapshotDB,
    createPayrollSnapshot,
    listPayrollSnapshots,
    getPayrollSnapshot,
    getActivePayrollSnapshot,
    updatePayrollSnapshot,
    activatePayrollSnapshot,
    softDeletePayrollSnapshot,
    buildPayrollResultFromSnapshot,
    buildPayrollResultFromActiveSnapshot,
    _setDatabasePathForTests,
    _getDatabasePath
};
