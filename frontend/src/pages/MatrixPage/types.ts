/**
 * Public domain types for the Matrix Kehadiran page.
 *
 * This module is intentionally dependency-free: it is shared by the UI layer,
 * the state layer (reducer + hooks), and the pure-domain layer (status mapping,
 * calendar, summary, layout, popover). It MUST NOT import React, MUI, or any
 * runtime helper, so that domain functions remain unit/property-testable
 * without a DOM or component runtime.
 *
 * Conventions:
 * - `AttendanceStatus` is the closed set of statuses recognized by the UI.
 *   Derived/display-time structures (cells, popover, filters) may widen it
 *   to `AttendanceStatus | null` to represent "no data". The base
 *   `AttendanceRecord.status` is non-null per the design.
 * - Backend payload types mirror the observed shape returned by
 *   `GET /api/monthly-grid?month=N&year=Y`. Status tokens arrive in
 *   uppercase Indonesian (e.g. `HADIR`, `ALFA`, `OFF`, `S`, `CT`,
 *   `PARTIAL_HADIR`, `LIBUR`); decoding is the responsibility of
 *   `domain/statusMapping.ts`.
 */

// ─── Domain types ──────────────────────────────────────────────────────────

/**
 * Attendance status recognized by the Matrix Page UI. Matches the six visual
 * categories in the legend (Hadir, Alfa, Izin/Cuti, Sakit, Terlambat, Day Off).
 */
export type AttendanceStatus =
  | 'present'
  | 'alpha'
  | 'leave'
  | 'sick'
  | 'late'
  | 'off';

/**
 * A single employee row in the matrix.
 *
 * - `employeeId` is the Venus `EmployeeID` (canonical key for client-side
 *   joins with `AttendanceRecord`).
 * - `ptrjEmployeeId` is the Millware/PTRJ identifier carried alongside Venus
 *   data; nullable because not all employees are mapped to PTRJ.
 */
export interface Employee {
  employeeId: string;
  name: string;
  ptrjEmployeeId?: string | null;
  department?: string | null;
  unit?: string | null;
  avatarUrl?: string | null;
}

/**
 * Attendance for a single (employee, date) cell. The base record is
 * non-nullable on `status`; cells with no backend data are represented
 * by the *absence* of an entry in the attendance map (or, at the UI
 * boundary, by widening to `AttendanceStatus | null`).
 *
 * `date` is `yyyy-MM-dd`. `checkIn` / `checkOut` are `HH:mm` strings.
 * `workHours` is the sum of `regularHours + overtimeHours` from the
 * backend payload.
 */
export interface AttendanceRecord {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours?: number | null;
  regularHours?: number | null;
  overtimeHours?: number | null;
  note?: string | null;
}

/**
 * Aggregate snapshot for one month, computed from the records map.
 *
 * `averageAttendancePercent` is reported with one decimal place (0..100),
 * computed as `present / (present + alpha + leave + sick + late) * 100`
 * over records with a non-null status (denominator falls back to 0 when
 * no records exist; see `domain/summary.ts`).
 */
export interface MonthlySummary {
  totalEmployees: number;
  averageAttendancePercent: number;
  alphaCount: number;
  leaveCount: number;
  lateCount: number;
  sickCount: number;
  presentCount: number;
  offCount: number;
}

/**
 * Per-column metadata for a single calendar day in the visible month.
 *
 * `weekdayShort` is the 3-character `id-ID` short weekday (`Sen`, `Sel`,
 * `Rab`, `Kam`, `Jum`, `Sab`, `Min`). `isSaturday` and `isSunday` are
 * carried explicitly so the renderer can apply weekend tints without
 * recomputing from `Date`.
 */
export interface DayMeta {
  date: string;
  day: number;
  weekdayShort: string;
  isWeekend: boolean;
  isSaturday: boolean;
  isSunday: boolean;
  isHoliday: boolean;
}

/**
 * Quick-filter selections owned by the Right Insight Panel. `'all'` is
 * the sentinel used when the filter is inactive.
 */
export interface QuickFilterState {
  department: string | 'all';
  status: AttendanceStatus | 'all';
  location: string | 'all';
}

// ─── Backend payload types ─────────────────────────────────────────────────

/**
 * One day cell as returned by `GET /api/monthly-grid`. Status is a raw
 * string (uppercase Indonesian, e.g. `HADIR`, `ALFA`, `OFF`, `S`, `CT`,
 * `LIBUR`, `PARTIAL_HADIR`) and is decoded into `AttendanceStatus | null`
 * by `mapBackendStatus`.
 */
export interface BackendDayCell {
  date: string;
  dayName: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  regularHours: number;
  overtimeHours: number;
  chargeJob: string;
  isHoliday: boolean;
  holidayName: string | null;
  isSunday: boolean;
}

/**
 * Top-level response shape from `GET /api/monthly-grid?month=N&year=Y`.
 * `grid_data` carries one entry per employee, with `days` keyed by the
 * day number as a string (`"1"` .. `"31"`).
 */
export interface BackendMonthlyGridResponse {
  success: boolean;
  year: number;
  month: number;
  month_name: string;
  days_in_month: number;
  total_employees: number;
  date_range: string;
  data_availability: {
    latest_available_date: string;
    available_days_count: number;
    total_days_in_month: number;
    has_unavailable_dates: boolean;
  };
  grid_data: Array<{
    No: number;
    EmployeeID: string;
    EmployeeName: string;
    PTRJEmployeeID: string;
    days: Record<string, BackendDayCell>;
  }>;
}
