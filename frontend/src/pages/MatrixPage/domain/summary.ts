/**
 * Monthly summary aggregation — pure reduction over `AttendanceRecord[]`
 * into the `MonthlySummary` shape consumed by the KPI_Row and the
 * Right_Insight_Panel donut.
 *
 * Pure module: NO React, MUI, or DOM imports. Imports only the shared
 * domain types so this helper can be exercised by property-based tests
 * without a renderer.
 *
 * Design reference:
 *   .kiro/specs/matrix-kehadiran-dark-redesign/design.md
 *     §"Derived data pipeline" → `computeMonthlySummary`
 *
 * Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8.
 */

import type {
  AttendanceRecord,
  AttendanceStatus,
  MonthlySummary,
} from '../types';

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Round to one decimal place using the standard "half-away-from-zero"
 * rule baked into `Math.round`. The caller guarantees `value` is finite
 * and in `[0, 100]`, so the result is also in `[0, 100]`.
 */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Aggregate the per-cell `AttendanceRecord` array into a single month
 * snapshot.
 *
 * Counts:
 *   `presentCount + alphaCount + leaveCount + sickCount + lateCount + offCount`
 *   sums to `records.length` (every record carries a non-null status per
 *   `types.ts`).
 *
 * `totalEmployees`:
 *   - When the second argument is provided, used verbatim (the page
 *     typically has a known headcount independent of how many cells the
 *     filter pipeline produced).
 *   - Otherwise, computed as the cardinality of distinct
 *     `record.employeeId` values — `new Set(records.map(...)).size`.
 *
 * `averageAttendancePercent`:
 *   - Defined as `present / (present + alpha + leave + sick + late) * 100`.
 *     `off` is intentionally excluded from the denominator: Day Off cells
 *     are not work-days and would otherwise dilute the rate.
 *   - When the denominator is 0 (no work-day records at all), the result
 *     is `0` rather than `NaN`.
 *   - Reported with one decimal place; the result is always in `[0, 100]`.
 *
 * Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8.
 */
export function computeMonthlySummary(
  records: AttendanceRecord[],
  totalEmployees?: number,
): MonthlySummary {
  let presentCount = 0;
  let alphaCount = 0;
  let leaveCount = 0;
  let sickCount = 0;
  let lateCount = 0;
  let offCount = 0;

  // Single linear pass. We deliberately switch on the literal status
  // strings rather than indexing a counter object so the compiler can
  // exhaustiveness-check the `AttendanceStatus` union — adding a new
  // status would surface here as a type error.
  for (const record of records) {
    const status: AttendanceStatus = record.status;
    switch (status) {
      case 'present':
        presentCount += 1;
        break;
      case 'alpha':
        alphaCount += 1;
        break;
      case 'leave':
        leaveCount += 1;
        break;
      case 'sick':
        sickCount += 1;
        break;
      case 'late':
        lateCount += 1;
        break;
      case 'off':
        offCount += 1;
        break;
    }
  }

  const employeeCount =
    totalEmployees !== undefined
      ? totalEmployees
      : new Set(records.map((r) => r.employeeId)).size;

  const workdayDenominator =
    presentCount + alphaCount + leaveCount + sickCount + lateCount;

  const averageAttendancePercent =
    workdayDenominator === 0
      ? 0
      : roundToOneDecimal((presentCount / workdayDenominator) * 100);

  return {
    totalEmployees: employeeCount,
    averageAttendancePercent,
    presentCount,
    alphaCount,
    leaveCount,
    sickCount,
    lateCount,
    offCount,
  };
}
