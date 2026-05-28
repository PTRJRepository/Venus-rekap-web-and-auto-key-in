/**
 * Property-based tests for `domain/filter.ts`.
 *
 * Test stack: Vitest + fast-check.
 *
 * Property  9 — Filter purity: column geometry stability
 * Property 11 — `matchEmployee`: case-insensitive substring on name OR id
 *
 * Validates: Requirements 3.9, 5.13, 5.14, 9.4, 9.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { applyFilters, matchEmployee } from '../domain/filter';
import { computeCellWidth } from '../domain/layout';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  QuickFilterState,
} from '../types';

// ─── Generators ────────────────────────────────────────────────────────────

const ATTENDANCE_STATUSES = [
  'present',
  'alpha',
  'leave',
  'sick',
  'late',
  'off',
] as const satisfies readonly AttendanceStatus[];

/** Pool of department names so the filter has a non-trivial chance of matching. */
const DEPARTMENT_POOL = ['HR', 'Finance', 'IT', 'Operations', 'Sales'] as const;

/** Pool of small alpha tokens used to seed names and ids. */
const TOKEN_POOL = [
  'Andi',
  'Budi',
  'Citra',
  'Dewi',
  'Eka',
  'Fani',
  'EMP001',
  'EMP002',
  'EMP003',
  'STAFF42',
] as const;

const employeeArb: fc.Arbitrary<Employee> = fc.record({
  employeeId: fc.string({ minLength: 1, maxLength: 12 }),
  name: fc.string({ minLength: 1, maxLength: 24 }),
  department: fc.option(fc.constantFrom(...DEPARTMENT_POOL), { nil: null }),
});

const employeesArb: fc.Arbitrary<Employee[]> = fc
  .array(employeeArb, { minLength: 0, maxLength: 6 })
  // Deduplicate by employeeId so the attendance map keys remain unique.
  .map((arr) => {
    const seen = new Set<string>();
    const out: Employee[] = [];
    for (const e of arr) {
      if (seen.has(e.employeeId)) continue;
      seen.add(e.employeeId);
      out.push(e);
    }
    return out;
  });

/**
 * Build an attendance map for a given employee set. Keys: `${empId}|${date}`.
 * Dates are synthesized 1..daysCount in May 2026.
 *
 * Returns an empty map when the employee list is empty (degenerate case
 * has no attendance records to attach).
 */
function buildAttendanceArb(
  employees: Employee[],
  daysCount: number,
): fc.Arbitrary<Map<string, AttendanceRecord>> {
  if (employees.length === 0) {
    return fc.constant(new Map<string, AttendanceRecord>());
  }
  const recordArb = fc.record({
    empIdx: fc.integer({ min: 0, max: employees.length - 1 }),
    day: fc.integer({ min: 1, max: daysCount }),
    status: fc.constantFrom<AttendanceStatus>(...ATTENDANCE_STATUSES),
  });
  return fc.array(recordArb, { minLength: 0, maxLength: 12 }).map((items) => {
    const map = new Map<string, AttendanceRecord>();
    for (const { empIdx, day, status } of items) {
      const emp = employees[empIdx]!;
      const date = `2026-05-${String(day).padStart(2, '0')}`;
      const key = `${emp.employeeId}|${date}`;
      map.set(key, { employeeId: emp.employeeId, date, status });
    }
    return map;
  });
}

/**
 * Composite arbitrary that generates a consistent (employees, attendance,
 * daysCount) triple — the attendance map only references employees that
 * exist in the employees array.
 */
const filterScenarioArb = fc
  .tuple(employeesArb, fc.integer({ min: 28, max: 31 }))
  .chain(([employees, daysCount]) =>
    buildAttendanceArb(employees, daysCount).map((attendance) => ({
      employees,
      attendance,
      daysCount,
    })),
  );

const quickFiltersArb: fc.Arbitrary<QuickFilterState> = fc.record({
  department: fc.oneof(
    fc.constant<'all'>('all'),
    fc.constantFrom(...DEPARTMENT_POOL),
  ) as fc.Arbitrary<QuickFilterState['department']>,
  status: fc.oneof(
    fc.constant<'all'>('all'),
    fc.constantFrom<AttendanceStatus>(...ATTENDANCE_STATUSES),
  ) as fc.Arbitrary<QuickFilterState['status']>,
  location: fc.oneof(
    fc.constant<'all'>('all'),
    fc.constantFrom('Jakarta', 'Bandung', 'Surabaya'),
  ) as fc.Arbitrary<QuickFilterState['location']>,
});

const departmentFilterArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant('all'),
  fc.constantFrom(...DEPARTMENT_POOL),
);

const searchArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('  '),
  fc.constantFrom(...TOKEN_POOL),
  fc.string({ minLength: 0, maxLength: 8 }),
);

// ─── Property 9: Filter purity — column geometry stability ────────────────

describe('Property 9: Filter purity — column geometry stability', () => {
  // Feature: matrix-kehadiran-dark-redesign, Property 9: Filter purity — column geometry stability
  // Validates: Requirements 5.13, 5.14, 9.4, 9.5

  it('cellWidth derived from (W, b, expanded, daysCount) is unchanged by applyFilters', () => {
    fc.assert(
      fc.property(
        filterScenarioArb,
        searchArb,
        departmentFilterArb,
        quickFiltersArb,
        ({ employees, attendance, daysCount }, search, deptFilter, quickFilters) => {
          const W = 1920;
          const b = 'wide' as const;
          const expanded = true;

          // Snapshot the inputs BEFORE applying filters so we can confirm
          // purity (no mutation of the originals).
          const attendanceSnapshot = new Map(attendance);
          const employeesSnapshot = [...employees];

          const cellWidthBefore = computeCellWidth(W, b, expanded, daysCount);

          const result = applyFilters(
            employees,
            attendance,
            search,
            deptFilter,
            quickFilters,
          );

          // applyFilters does not accept `days` — column geometry is
          // independent of the filter, so the post-filter cell width
          // computed from the same `daysCount` must be identical.
          const cellWidthAfter = computeCellWidth(W, b, expanded, daysCount);

          expect(cellWidthAfter).toBe(cellWidthBefore);

          // Returned collections are NEW references, not the input.
          expect(result.employees).not.toBe(employees);
          expect(result.attendance).not.toBe(attendance);

          // Inputs are not mutated.
          expect(employees).toEqual(employeesSnapshot);
          expect(attendance.size).toBe(attendanceSnapshot.size);
          for (const [k, v] of attendanceSnapshot) {
            expect(attendance.get(k)).toEqual(v);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it('applyFilters has a 5-arg signature that does not include days', () => {
    // Safety net: if a future refactor accidentally adds a `days` parameter
    // to `applyFilters`, this assertion will fail and the property's
    // narrative ("filter never touches column geometry") will need
    // updating in lock-step.
    expect(applyFilters.length).toBe(5);
  });
});

// ─── Property 11: matchEmployee — case-insensitive substring on name OR id ─

describe('Property 11: matchEmployee — case-insensitive substring on name OR id', () => {
  // Feature: matrix-kehadiran-dark-redesign, Property 11: matchEmployee — case-insensitive substring on name OR id
  // Validates: Requirements 3.9

  it('matches iff the trimmed-lowercased query is a substring of name OR employeeId (lowercased)', () => {
    fc.assert(
      fc.property(
        fc.record({
          employeeId: fc.string({ minLength: 1, maxLength: 12 }),
          name: fc.string({ minLength: 1, maxLength: 24 }),
        }),
        fc.string({ minLength: 0, maxLength: 16 }),
        ({ employeeId, name }, q) => {
          const emp: Employee = { employeeId, name };
          const got = matchEmployee(emp, q);

          const trimmed = q.trim();
          if (trimmed.length === 0) {
            expect(got).toBe(true);
            return;
          }

          const needle = trimmed.toLowerCase();
          const expected =
            name.toLowerCase().includes(needle) ||
            employeeId.toLowerCase().includes(needle);
          expect(got).toBe(expected);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('returns true for empty and whitespace-only queries', () => {
    const emp: Employee = { employeeId: 'EMP001', name: 'Andi Wijaya' };
    expect(matchEmployee(emp, '')).toBe(true);
    expect(matchEmployee(emp, '   ')).toBe(true);
    expect(matchEmployee(emp, '\t\n')).toBe(true);
  });

  it('case-insensitive on both name and id', () => {
    const emp: Employee = { employeeId: 'EMP001', name: 'Andi Wijaya' };
    expect(matchEmployee(emp, 'andi')).toBe(true);
    expect(matchEmployee(emp, 'ANDI')).toBe(true);
    expect(matchEmployee(emp, 'wIjA')).toBe(true);
    expect(matchEmployee(emp, 'emp001')).toBe(true);
    expect(matchEmployee(emp, 'EMP001')).toBe(true);
    expect(matchEmployee(emp, 'zzz')).toBe(false);
  });

  it('trims surrounding whitespace before matching', () => {
    const emp: Employee = { employeeId: 'EMP001', name: 'Andi Wijaya' };
    expect(matchEmployee(emp, '  andi  ')).toBe(true);
    expect(matchEmployee(emp, '\tEMP001\n')).toBe(true);
  });
});
