/**
 * _cutover_map.js — Mid-month starter cutover.
 *
 * Karyawan mid-month starter (POM00316–POM00329) punya baris Millware TERBENTUK
 * SEBELUM jam masuk pertama mereka (2026-08-18) — baris Sunday-Hadir terisolasi
 * + baris Hadir dari grid mingguan sebelum start. User minta baris itu DIHAPUS.
 *
 * Fungsi ini memotong attendance Venus SEBELUM tanggal masuk pertama, supaya:
 *  - monitor tidak menghitung hari-hari itu sebagai missing
 *  - regen/batch tidak me-input ulang baris yang dihapus
 *
 * Source of truth: _pre_start_check.js (HR_T_TAMachine_Summary first TACheckIn).
 * Nonaktifkan dengan env CUTOVER_DISABLE=1.
 */
const fs = require('fs');
const path = require('path');

const CUTOVER_FILE = path.join(__dirname, '_cutover_dates.json');

// First jam masuk per employee (verified via HR_T_TAMachine_Summary, 2026-09-10)
// POM00318 Agung Gintara: tidak punya jam masuk & tidak punya baris Millware — buang dari daftar.
const CUTOVER = {
    POM00329: '2026-08-18', // Letisia Adita
    POM00316: '2026-08-18', // Azh-Zhahir
    POM00317: '2026-08-18', // Meiggian Triputra
    POM00318: null,         // Agung Gintara — no clock-ins, no rows: no-op
    POM00319: '2026-08-18', // Riyan Kurniawan
    POM00320: '2026-08-18', // Diki Ramdani
    POM00321: '2026-08-18', // Virgian Septama
    POM00322: '2026-08-18', // Dandi Pratama
    POM00323: '2026-08-18', // Andrean Saputra
    POM00324: '2026-08-18', // Rezza
    POM00325: '2026-08-18', // Ari Sandi
    POM00326: '2026-08-18', // Ilham Dwi Saputra
    POM00327: '2026-08-18', // Arif Darmawan
    POM00328: '2026-08-18'  // Edi Saputra
};

let dates = { ...CUTOVER };
try {
    if (fs.existsSync(CUTOVER_FILE)) {
        dates = { ...dates, ...JSON.parse(fs.readFileSync(CUTOVER_FILE, 'utf8')) };
    }
} catch (_) { /* fall back to defaults */ }

/**
 * Drop attendance days strictly before the employee's cutover date.
 * @param {Array} employees — web-format employees (ptrjEmployeeID + attendance keyed by day number)
 */
function applyCutover(employees) {
    if (process.env.CUTOVER_DISABLE === '1') return employees;
    if (!Array.isArray(employees)) return employees;
    let touched = 0, dropped = 0;
    for (const emp of employees) {
        const cutover = dates[emp.ptrjEmployeeID || emp.PTRJEmployeeID];
        if (!cutover || !emp.attendance) continue;
        for (const dayKey of Object.keys(emp.attendance)) {
            const day = emp.attendance[dayKey];
            const dateStr = day && day.date ? String(day.date).slice(0, 10) : null;
            if (dateStr && dateStr < cutover) {
                delete emp.attendance[dayKey];
                dropped++;
            }
        }
        touched++;
    }
    if (dropped > 0) console.log(`[Cutover] Dropped ${dropped} pre-start attendance days across ${touched} employees`);
    return employees;
}

module.exports = { applyCutover, CUTOVER };
