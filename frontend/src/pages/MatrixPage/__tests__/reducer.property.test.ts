// Feature: matrix-kehadiran-dark-redesign, Property 10: Reducer invariant — at most one popover selection
//
// Validates: Requirements 8.6, 8.7, 8.8
//
// Pure-domain property test for `matrixReducer`. Generates random sequences
// of `MatrixAction`s, reduces them sequentially starting from
// `initialMatrixState(5, 2026)`, and asserts the single-popover invariant
// holds at EVERY prefix:
//
//   state.selectedCell === null
//     OR
//   state.selectedCell is a single object with
//     { employeeId: string, date: string, anchorRect: DOMRect }
//
// In particular, `selectedCell` MUST NEVER become an array — the action
// surface only exposes `SELECT_CELL` (single-record replacement) and
// `CLEAR_SELECTION` (null), so no reachable reducer path can produce a
// multi-element selection.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  initialMatrixState,
  matrixReducer,
} from '../hooks/useMatrixState';
import type {
  MatrixAction,
  MatrixState,
} from '../hooks/useMatrixState';
import type { Breakpoint } from '../domain/layout';
import type {
  AttendanceStatus,
  QuickFilterState,
} from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build a fake `DOMRect` shaped like the real DOM type. The reducer
 * never reads any field of `anchorRect`, but Property 10 requires the
 * stored object to look like a single `DOMRect` rather than an array.
 */
const fakeRect = (x = 0, y = 0): DOMRect =>
  ({
    x,
    y,
    width: 32,
    height: 44,
    top: y,
    left: x,
    right: x + 32,
    bottom: y + 44,
    toJSON: () => ({}),
  }) as DOMRect;

const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'present',
  'alpha',
  'leave',
  'sick',
  'late',
  'off',
] as const;

const BREAKPOINTS: readonly Breakpoint[] = [
  'wide',
  'standard',
  'narrow',
] as const;

const FILTER_SENTINEL = ['all', 'HR', 'Finance', 'IT'] as const;
const STATUS_FILTER_POOL: readonly (AttendanceStatus | 'all')[] = [
  'all',
  ...ATTENDANCE_STATUSES,
];
const LOCATION_POOL = ['all', 'Jakarta', 'Bandung', 'Surabaya'] as const;

const quickFilterArb: fc.Arbitrary<QuickFilterState> = fc.record({
  department: fc.constantFrom(...FILTER_SENTINEL),
  status: fc.constantFrom(...STATUS_FILTER_POOL),
  location: fc.constantFrom(...LOCATION_POOL),
});

// ─── Action arbitrary ──────────────────────────────────────────────────────

/**
 * Covers every action that the reducer accepts EXCEPT `FETCH_SUCCESS`,
 * which would require a complete `BackendMonthlyGridResponse` payload
 * orthogonal to Property 10's invariant. The popover-related actions
 * (`SELECT_CELL`, `CLEAR_SELECTION`) are oversampled so the random
 * sequence exercises the single-slot discriminator more often than once
 * per ~14-action run.
 */
const actionArbitrary: fc.Arbitrary<MatrixAction> = fc.oneof(
  // SET_PERIOD
  fc.record({
    type: fc.constant('SET_PERIOD' as const),
    month: fc.integer({ min: 1, max: 12 }),
    year: fc.integer({ min: 2000, max: 2099 }),
  }),
  // FETCH_START
  fc.constant<MatrixAction>({ type: 'FETCH_START' }),
  // FETCH_ERROR
  fc.record({
    type: fc.constant('FETCH_ERROR' as const),
    error: fc.string({ minLength: 0, maxLength: 30 }),
  }),
  // SET_SEARCH
  fc.record({
    type: fc.constant('SET_SEARCH' as const),
    search: fc.string({ minLength: 0, maxLength: 20 }),
  }),
  // SET_DEPT_FILTER
  fc.record({
    type: fc.constant('SET_DEPT_FILTER' as const),
    departmentFilter: fc.constantFrom(...FILTER_SENTINEL),
  }),
  // SET_QUICK_FILTER
  fc.record({
    type: fc.constant('SET_QUICK_FILTER' as const),
    quickFilters: quickFilterArb,
  }),
  // SELECT_CELL — oversampled (3x) so popover transitions get exercised.
  fc.record({
    type: fc.constant('SELECT_CELL' as const),
    employeeId: fc.string({ minLength: 1, maxLength: 8 }),
    date: fc
      .integer({ min: 1, max: 28 })
      .map((d) => `2026-05-${String(d).padStart(2, '0')}`),
    anchorRect: fc
      .tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 800 }))
      .map(([x, y]) => fakeRect(x, y)),
  }),
  fc.record({
    type: fc.constant('SELECT_CELL' as const),
    employeeId: fc.string({ minLength: 1, maxLength: 8 }),
    date: fc
      .integer({ min: 1, max: 28 })
      .map((d) => `2026-05-${String(d).padStart(2, '0')}`),
    anchorRect: fc
      .tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 800 }))
      .map(([x, y]) => fakeRect(x, y)),
  }),
  fc.record({
    type: fc.constant('SELECT_CELL' as const),
    employeeId: fc.string({ minLength: 1, maxLength: 8 }),
    date: fc
      .integer({ min: 1, max: 28 })
      .map((d) => `2026-05-${String(d).padStart(2, '0')}`),
    anchorRect: fc
      .tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 800 }))
      .map(([x, y]) => fakeRect(x, y)),
  }),
  // CLEAR_SELECTION
  fc.constant<MatrixAction>({ type: 'CLEAR_SELECTION' }),
  // HOVER_CELL
  fc.record({
    type: fc.constant('HOVER_CELL' as const),
    employeeId: fc.string({ minLength: 1, maxLength: 8 }),
    date: fc
      .integer({ min: 1, max: 28 })
      .map((d) => `2026-05-${String(d).padStart(2, '0')}`),
  }),
  // CLEAR_HOVER
  fc.constant<MatrixAction>({ type: 'CLEAR_HOVER' }),
  // TOGGLE_SIDEBAR
  fc.constant<MatrixAction>({ type: 'TOGGLE_SIDEBAR' }),
  // SET_BREAKPOINT
  fc.record({
    type: fc.constant('SET_BREAKPOINT' as const),
    breakpoint: fc.constantFrom(...BREAKPOINTS),
  }),
  // OPEN_INSIGHT_DRAWER / CLOSE_INSIGHT_DRAWER
  fc.constant<MatrixAction>({ type: 'OPEN_INSIGHT_DRAWER' }),
  fc.constant<MatrixAction>({ type: 'CLOSE_INSIGHT_DRAWER' }),
);

/**
 * Predicate: `selectedCell` is either `null` OR a single record with the
 * three required fields. Crucially, it MUST NOT be an array — Property
 * 10 forbids accumulating multiple popover selections.
 */
function isValidSelection(selectedCell: MatrixState['selectedCell']): boolean {
  if (selectedCell === null) return true;
  if (Array.isArray(selectedCell)) return false;
  if (typeof selectedCell !== 'object') return false;
  if (typeof selectedCell.employeeId !== 'string') return false;
  if (typeof selectedCell.date !== 'string') return false;
  // anchorRect is a DOMRect-shaped object; we only require it be a
  // non-array object (the reducer never reads its fields).
  if (selectedCell.anchorRect === null) return false;
  if (typeof selectedCell.anchorRect !== 'object') return false;
  if (Array.isArray(selectedCell.anchorRect)) return false;
  return true;
}

// ─── Property 10 ───────────────────────────────────────────────────────────

describe('Property 10: Reducer invariant — at most one popover selection', () => {
  it('selectedCell stays null OR a single record at every prefix of any action sequence', () => {
    fc.assert(
      fc.property(
        fc.array(actionArbitrary, { minLength: 0, maxLength: 60 }),
        (actions) => {
          let state = initialMatrixState(5, 2026);

          // The initial state must satisfy the invariant.
          expect(isValidSelection(state.selectedCell)).toBe(true);

          for (const action of actions) {
            state = matrixReducer(state, action);
            // Every prefix must satisfy the invariant.
            expect(isValidSelection(state.selectedCell)).toBe(true);
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
