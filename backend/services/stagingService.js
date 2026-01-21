const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '../../../data/staging_attendance.db');

// Initialize Database
const initStagingDB = () => {
    return new Promise((resolve, reject) => {
        // Ensure the data directory exists
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log(`Created data directory: ${dataDir}`);
        }

        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Failed to connect to staging DB:', err);
                return reject(err);
            }
        });

        const schema = `
            CREATE TABLE IF NOT EXISTS staging_attendance (
                id TEXT PRIMARY KEY,
                employee_id TEXT NOT NULL,
                employee_name TEXT NOT NULL,
                ptrj_employee_id TEXT DEFAULT "N/A",
                date TEXT NOT NULL,
                day_of_week TEXT,
                shift TEXT,
                check_in TEXT,
                check_out TEXT,
                regular_hours REAL DEFAULT 0,
                overtime_hours REAL DEFAULT 0,
                total_hours REAL DEFAULT 0,
                task_code TEXT,
                station_code TEXT,
                machine_code TEXT,
                expense_code TEXT,
                raw_charge_job TEXT,
                leave_type_code TEXT,
                leave_type_description TEXT,
                leave_ref_number TEXT,
                is_alfa BOOLEAN DEFAULT 0,
                is_on_leave BOOLEAN DEFAULT 0,
                status TEXT DEFAULT 'staged',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                source_record_id TEXT,
                notes TEXT
            );
            
            CREATE INDEX IF NOT EXISTS idx_staging_employee_id ON staging_attendance(employee_id);
            CREATE INDEX IF NOT EXISTS idx_staging_date ON staging_attendance(date);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_staging_unique_employee_date ON staging_attendance(employee_id, date);
        `;

        db.exec(schema, (err) => {
            if (err) {
                console.error('Failed to initialize staging DB schema:', err);
                reject(err);
            } else {
                console.log('Staging DB initialized.');
                resolve(db);
            }
            db.close();
        });
    });
};

const getStagingConnection = () => {
    return new sqlite3.Database(DB_PATH);
};

const getStagingData = (filters = {}) => {
    return new Promise((resolve, reject) => {
        const db = getStagingConnection();
        let query = `SELECT * FROM staging_attendance WHERE 1=1`;
        const params = [];

        if (filters.status) {
            query += ` AND status = ?`;
            params.push(filters.status);
        }
        if (filters.start_date) {
            query += ` AND date >= ?`;
            params.push(filters.start_date);
        }
        if (filters.end_date) {
            query += ` AND date <= ?`;
            params.push(filters.end_date);
        }
        if (filters.employee_id) {
            query += ` AND employee_id = ?`;
            params.push(filters.employee_id);
        }

        query += ` ORDER BY date ASC, employee_name ASC`;

        if (filters.limit) {
            query += ` LIMIT ?`;
            params.push(filters.limit);
        }
        if (filters.offset) {
            query += ` OFFSET ?`;
            params.push(filters.offset);
        }

        db.all(query, params, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const addStagingRecord = (record) => {
    return new Promise((resolve, reject) => {
        const db = getStagingConnection();
        const id = uuidv4();
        const now = new Date().toISOString();

        // Basic duplicate check or upsert logic
        // For simplicity, we use INSERT OR REPLACE or standard INSERT and handle unique constraint
        // The legacy app does update if exists.

        const query = `
            INSERT INTO staging_attendance (
                id, employee_id, employee_name, ptrj_employee_id, date, day_of_week, shift,
                check_in, check_out, regular_hours, overtime_hours, total_hours,
                task_code, station_code, machine_code, expense_code, raw_charge_job,
                leave_type_code, leave_type_description, leave_ref_number,
                is_alfa, is_on_leave, status,
                created_at, updated_at, source_record_id, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(employee_id, date) DO UPDATE SET
                employee_name=excluded.employee_name,
                ptrj_employee_id=excluded.ptrj_employee_id,
                check_in=excluded.check_in,
                check_out=excluded.check_out,
                regular_hours=excluded.regular_hours,
                overtime_hours=excluded.overtime_hours,
                total_hours=excluded.total_hours,
                task_code=excluded.task_code,
                station_code=excluded.station_code,
                machine_code=excluded.machine_code,
                expense_code=excluded.expense_code,
                raw_charge_job=excluded.raw_charge_job,
                leave_type_code=excluded.leave_type_code,
                leave_type_description=excluded.leave_type_description,
                is_alfa=excluded.is_alfa,
                is_on_leave=excluded.is_on_leave,
                updated_at=excluded.updated_at,
                notes=excluded.notes
        `;

        const params = [
            id, record.employee_id, record.employee_name, record.ptrj_employee_id || 'N/A', record.date, record.day_of_week, record.shift,
            record.check_in, record.check_out, record.regular_hours || 0, record.overtime_hours || 0, (record.regular_hours || 0) + (record.overtime_hours || 0),
            record.task_code, record.station_code, record.machine_code, record.expense_code, record.raw_charge_job,
            record.leave_type_code, record.leave_type_description, record.leave_ref_number,
            record.is_alfa ? 1 : 0, record.is_on_leave ? 1 : 0, 'staged',
            now, now, record.source_record_id, record.notes
        ];

        db.run(query, params, function (err) {
            db.close();
            if (err) reject(err);
            else resolve({ id: id, changes: this.changes });
        });
    });
};

const deleteStagingRecord = (id) => {
    return new Promise((resolve, reject) => {
        const db = getStagingConnection();
        db.run('DELETE FROM staging_attendance WHERE id = ?', [id], function (err) {
            db.close();
            if (err) reject(err);
            else resolve({ changes: this.changes });
        });
    });
};

const deleteAllStaging = () => {
    return new Promise((resolve, reject) => {
        const db = getStagingConnection();
        db.run('DELETE FROM staging_attendance', [], function (err) {
            db.close();
            if (err) reject(err);
            else resolve({ changes: this.changes });
        });
    });
};

module.exports = {
    initStagingDB,
    getStagingData,
    addStagingRecord,
    deleteStagingRecord,
    deleteAllStaging
};
