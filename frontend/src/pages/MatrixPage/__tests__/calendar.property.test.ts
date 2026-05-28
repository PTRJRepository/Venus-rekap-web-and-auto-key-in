// Feature: matrix-kehadiran-dark-redesign, Property 3: Calendar generation and weekend-tinting determinism
//
// Validates: Requirements 5.1, 5.6, 5.7, 5.8, 16.3
//
// Generators:
//   year  ∈ [1900, 2100]
//   month ∈ [1, 12]
//
// Asserts:
//   - `buildMonthDays(y, m).length === daysInMonth(y, m)` and length ∈ {28,29,30,31}.
//   - `day` values are sequential 1..N.
//   - For each DayMeta, the weekend flags agree with native `Date.getDay()`
//     applied to the formatted `yyyy-MM-dd` string.
//   - `getColumnTint` returns the Saturday tint iff Saturday, Sunday tint iff
//     Sunday, and `'transparent'` otherwise.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildMonthDays,
  daysInMonth,
  getColumnTint,
} from '../domain/calendar';
import { tokens } from '../tokens';

const yearArb = fc.integer({ min: 1900, max: 2100 });
const monthArb = fc.integer({ min: 1, max: 12 });

describe('Property 3: Calendar generation and weekend-tinting determinism', () => {
  it('buildMonthDays length equals daysInMonth and is in {28,29,30,31}', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const days = buildMonthDays(year, month);
        const expected = daysInMonth(year, month);
        expect(days.length).toBe(expected);
        expect([28, 29, 30, 31]).toContain(days.length);
      }),
      { numRuns: 25 }
    );
  });

  it('day values are sequential 1..N', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const days = buildMonthDays(year, month);
        days.forEach((meta, idx) => {
          expect(meta.day).toBe(idx + 1);
        });
      }),
      { numRuns: 25 }
    );
  });

  it('weekend flags agree with native Date.getDay() on the formatted date string', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const days = buildMonthDays(year, month);
        for (const meta of days) {
          const dow = new Date(meta.date).getDay();
          const isSat = dow === 6;
          const isSun = dow === 0;
          expect(meta.isSaturday).toBe(isSat);
          expect(meta.isSunday).toBe(isSun);
          expect(meta.isWeekend).toBe(isSat || isSun);
        }
      }),
      { numRuns: 25 }
    );
  });

  it('getColumnTint returns Saturday/Sunday tints or transparent', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const days = buildMonthDays(year, month);
        for (const meta of days) {
          const tint = getColumnTint(meta);
          if (meta.isSaturday) {
            expect(tint).toBe(tokens.weekend.saturdayTint);
          } else if (meta.isSunday) {
            expect(tint).toBe(tokens.weekend.sundayTint);
          } else {
            expect(tint).toBe('transparent');
          }
        }
      }),
      { numRuns: 25 }
    );
  });
});
