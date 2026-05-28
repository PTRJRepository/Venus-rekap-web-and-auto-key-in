/**
 * Calendar utilities for the Matrix Kehadiran page.
 *
 * Builds the per-column metadata (`DayMeta`) array for the visible month and
 * provides weekend-detection helpers. This module is intentionally pure: no
 * React, no MUI, no DOM, so it stays unit/property-testable without a
 * component runtime.
 *
 * Conventions:
 * - `month` arguments are 1-indexed (1 = January, 12 = December), matching the
 *   contract of `Monthly_Grid_API` and the rest of the Matrix domain layer.
 * - `weekdayShort` is the 3-character Indonesian short-day label keyed by the
 *   native `Date.getDay()` value (0 = Sunday … 6 = Saturday). A const lookup
 *   array is used in lieu of `date-fns/locale/id` to avoid locale bundling
 *   side-effects.
 * - Dates are constructed in local time so that the formatted `yyyy-MM-dd`
 *   string matches the calendar day perceived by the user.
 * - `isHoliday` is initialised to `false` here; the backend decoder
 *   (`domain/decode.ts`) overlays the real holiday flag from the API payload.
 *
 * Requirements: 5.1, 5.6, 5.7, 5.8, 16.3
 */

import { format } from 'date-fns';
import { tokens } from '../tokens';
import type { DayMeta } from '../types';

/**
 * Indonesian short-day labels indexed by `Date.getDay()`
 * (0 = Sunday … 6 = Saturday).
 */
const WEEKDAY_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;

/**
 * Number of days in the given (year, month) pair. `month` is 1-12.
 *
 * Implementation note: `new Date(year, month, 0)` resolves to the last day of
 * `month - 1` because day 0 wraps to the previous month, which is the standard
 * JavaScript trick for "last day of month".
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Build the `DayMeta` array for every calendar day in the given month.
 *
 * The returned array has length `daysInMonth(year, month)` with sequential
 * `day` values 1..N. Each entry carries pre-computed weekend flags so the
 * renderer does not need to recompute them per cell.
 */
export function buildMonthDays(year: number, month: number): DayMeta[] {
  const total = daysInMonth(year, month);
  const result: DayMeta[] = [];
  for (let day = 1; day <= total; day++) {
    const dt = new Date(year, month - 1, day);
    const dow = dt.getDay();
    const isSaturday = dow === 6;
    const isSunday = dow === 0;
    result.push({
      date: format(dt, 'yyyy-MM-dd'),
      day,
      weekdayShort: WEEKDAY_SHORT_ID[dow],
      isWeekend: isSaturday || isSunday,
      isSaturday,
      isSunday,
      isHoliday: false,
    });
  }
  return result;
}

/**
 * Returns `true` when the input date falls on a Saturday or Sunday.
 *
 * Accepts either a `Date` instance or a `yyyy-MM-dd` string (e.g. the
 * `DayMeta.date` field). String inputs are parsed via the native `Date`
 * constructor; the caller should pass already-normalised yyyy-MM-dd values.
 */
export function isWeekend(date: Date | string): boolean {
  const dt = typeof date === 'string' ? new Date(date) : date;
  const dow = dt.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Returns the column background tint for a given `DayMeta`:
 * - Saturday → `tokens.weekend.saturdayTint`
 * - Sunday   → `tokens.weekend.sundayTint`
 * - otherwise → `'transparent'`
 */
export function getColumnTint(meta: DayMeta): string {
  if (meta.isSaturday) return tokens.weekend.saturdayTint;
  if (meta.isSunday) return tokens.weekend.sundayTint;
  return 'transparent';
}
