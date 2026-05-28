// Feature: matrix-kehadiran-dark-redesign, Property 8: Monthly summary aggregation invariant
//
// Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
//
// Pure-domain property test for `computeMonthlySummary`. Generates random
// attendance-record arrays and asserts the three invariants from the
// design's "Derived data pipeline":
//   - status counts partition `records.length`
//   - default `totalEmployees` is the cardinality of distinct employeeIds
//   - `averageAttendancePercent ∈ [0, 100]`

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { computeMonthlySummary } from '../domain/summary';
import type { AttendanceRecord, AttendanceStatus } from '../types';

const STATUS_VALUES: readonly AttendanceStatus[] = [
  'present',
  'alpha',
  'leave',
  'sick',
  'late',
  'off',
] as const;

const recordArbitrary: fc.Arbitrary<AttendanceRecord> = fc.record({
  employeeId: fc.string({ minLength: 1, maxLength: 10 }),
  date: fc
    .date({ min: new Date(2020, 0, 1), max: new Date(2030, 0, 1) })
    .map((d) => d.toISOString().slice(0, 10)),
  status: fc.constantFrom<AttendanceStatus>(...STATUS_VALUES),
});

describe('Property 8: Monthly summary aggregation invariant', () => {
  it('counts partition records.length, default totalEmployees = distinct employeeIds, and percent stays in [0, 100]', () => {
    fc.assert(
      fc.property(fc.array(recordArbitrary), (records) => {
        const summary = computeMonthlySummary(records);

        // Count partitioning: every record is assigned to exactly one bucket.
        const totalCounted =
          summary.presentCount +
          summary.alphaCount +
          summary.leaveCount +
          summary.sickCount +
          summary.lateCount +
          summary.offCount;
        expect(totalCounted).toBe(records.length);

        // Default totalEmployees is the cardinality of distinct employeeIds.
        const distinctIds = new Set(records.map((r) => r.employeeId)).size;
        expect(summary.totalEmployees).toBe(distinctIds);

        // Average attendance percent is bounded.
        expect(summary.averageAttendancePercent).toBeGreaterThanOrEqual(0);
        expect(summary.averageAttendancePercent).toBeLessThanOrEqual(100);
      }),
      { numRuns: 25 },
    );
  });
});
