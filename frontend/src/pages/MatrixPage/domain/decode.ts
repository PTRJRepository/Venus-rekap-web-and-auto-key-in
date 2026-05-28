/**
 * Backend payload decoder for the Matrix Kehadiran page.
 *
 * Translates the raw `BackendMonthlyGridResponse` returned by
 * `GET /api/monthly-grid?month=N&year=Y` into the three derived structures
 * the UI layer consumes:
 *   - `employees`: one `Employee` per `grid_data[i]` entry.
 *   - `days`:      `DayMeta[]` for the visible month, with `isHoliday`
 *                  overlaid from the backend cells (logical OR across all
 *                  employee rows that mention the same date).
 *   - `attendance`: `Map<string, AttendanceRecord>` keyed by
 *                  `${employeeId}|${date}`, populated only for cells whose
 *                  status decodes to a non-null `AttendanceStatus`.
 *
 * Pure module: imports only the shared types, the calendar helper, and
 * `mapBackendStatus`. NO React, MUI, or DOM. Defensive against undefined
 * / null fields so a malformed entry skips itself rather than throwing.
 *
 * Design reference:
 *   .kiro/specs/matrix-kehadiran-dark-redesign/design.md
 *     §"Derived data pipeline" → `decodeBackendResponse`
 *
 * Requirements: 13.1, 13.2, 13.6, 6.9.
 */

import { buildMonthDays } from './calendar';
import { mapBackendStatus } from './statusMapping';
import type {
  AttendanceRecord,
  BackendDayCell,
  BackendMonthlyGridResponse,
  DayMeta,
  Employee,
} from '../types';

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * The three derived structures produced by `decodeBackendResponse`. The
 * `attendance` map's key is `${employeeId}|${date}`.
 */
export interface DecodedGrid {
  employees: Employee[];
  days: DayMeta[];
  attendance: Map<string, AttendanceRecord>;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Compose the canonical attendance map key. Centralised so callers and
 * the renderer stay in lock-step (changing the separator only needs to
 * happen here).
 */
function makeAttendanceKey(employeeId: string, date: string): string {
  return `${employeeId}|${date}`;
}

/**
 * Coerce a value to a non-empty trimmed string or `null`. Used for the
 * optional `chargeJob`/`PTRJEmployeeID`/check-in/-out fields where the
 * backend may return empty strings, whitespace, or `null` to signal
 * "not present".
 */
function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Coerce a value to a finite number or `0`. Backend hours fields are
 * expected to be numbers, but defensive coercion guards against
 * `null`/`undefined`/`NaN` slipping in from a malformed payload.
 */
function toFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Pick the first non-empty `chargeJob` across an employee's day cells.
 * Used as a heuristic for `Employee.department` until the backend
 * exposes a dedicated department field.
 */
function deriveDepartment(
  days: Record<string, BackendDayCell> | null | undefined,
): string | null {
  if (days == null || typeof days !== 'object') return null;
  for (const cell of Object.values(days)) {
    if (cell == null) continue;
    const dept = toNonEmptyString(cell.chargeJob);
    if (dept !== null) return dept;
  }
  return null;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Decode the backend monthly-grid payload into the three derived
 * structures consumed by the Matrix Page state layer.
 *
 * Behavior summary:
 *   1. `days` is built from `buildMonthDays(year, month)` with `isHoliday`
 *      overlaid via logical OR across every backend cell that mentions a
 *      given date.
 *   2. `employees` is one `Employee` per `grid_data[i]`. `department` is
 *      derived from the first non-empty `chargeJob` found across that
 *      employee's day cells (falls back to `null`).
 *   3. `attendance` is keyed by `${employeeId}|${date}`. Cells whose raw
 *      status decodes to `null` are SKIPPED entirely (they render as
 *      empty neutral cells per requirement 6.9). `workHours` is the sum
 *      of `regularHours + overtimeHours`, or `null` when both are 0.
 *      `note` mirrors `chargeJob` (empty → `null`).
 *
 * Defensive: never throws on malformed input. A malformed `grid_data[i]`
 * entry without an `EmployeeID` is skipped; a malformed `days[k]` entry
 * is skipped; missing fields fall back to `null`.
 */
export function decodeBackendResponse(
  resp: BackendMonthlyGridResponse,
): DecodedGrid {
  // 1. Build the calendar scaffold first so we can overlay holidays from
  //    backend cells as we walk `grid_data`. `buildMonthDays` initialises
  //    every `isHoliday` to `false`.
  const days = buildMonthDays(resp.year, resp.month);

  // Map yyyy-MM-dd → index into `days`, used to overlay holidays in O(1).
  const dayIndexByDate = new Map<string, number>();
  for (let i = 0; i < days.length; i++) {
    dayIndexByDate.set(days[i].date, i);
  }

  const employees: Employee[] = [];
  const attendance = new Map<string, AttendanceRecord>();

  // `grid_data` may be undefined / null on a degenerate payload (e.g.
  // before the first successful fetch). Treat as empty rather than throw.
  const gridData = Array.isArray(resp.grid_data) ? resp.grid_data : [];

  for (const row of gridData) {
    if (row == null) continue;

    const employeeId = toNonEmptyString(row.EmployeeID);
    if (employeeId === null) {
      // Without a stable `EmployeeID` we have no key for the attendance
      // map, so the entire row is unusable. Skip silently.
      continue;
    }

    const name = toNonEmptyString(row.EmployeeName) ?? employeeId;
    const ptrjEmployeeId = toNonEmptyString(row.PTRJEmployeeID);
    const department = deriveDepartment(row.days);

    employees.push({
      employeeId,
      name,
      ptrjEmployeeId,
      department,
    });

    // 2. Walk this employee's day cells, building attendance records and
    //    overlaying holiday flags onto the shared `days` scaffold.
    const rowDays = row.days;
    if (rowDays == null || typeof rowDays !== 'object') continue;

    for (const cell of Object.values(rowDays)) {
      if (cell == null) continue;

      const date = toNonEmptyString(cell.date);
      if (date === null) continue;

      // Holiday overlay (logical OR): once any backend cell flags the
      // date as a holiday, the DayMeta stays holiday.
      if (cell.isHoliday === true) {
        const idx = dayIndexByDate.get(date);
        if (idx !== undefined) {
          days[idx] = { ...days[idx], isHoliday: true };
        }
      }

      const status = mapBackendStatus(cell.status);
      // Unknown / empty status → render an empty neutral cell. We do NOT
      // emit an attendance record in that case (requirement 6.9).
      if (status === null) continue;

      const regular = toFiniteNumber(cell.regularHours);
      const overtime = toFiniteNumber(cell.overtimeHours);
      const totalHours = regular + overtime;

      attendance.set(makeAttendanceKey(employeeId, date), {
        employeeId,
        date,
        status,
        checkIn: toNonEmptyString(cell.checkIn),
        checkOut: toNonEmptyString(cell.checkOut),
        workHours: totalHours > 0 ? totalHours : null,
        note: toNonEmptyString(cell.chargeJob),
      });
    }
  }

  return { employees, days, attendance };
}
