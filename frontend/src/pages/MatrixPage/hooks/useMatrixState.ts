/**
 * useMatrixState — reducer + hook for the Matrix Kehadiran page.
 *
 * This module owns the synchronous state machine for the page: period
 * selection, fetch lifecycle, derived data, filters, hover/selection,
 * sidebar, breakpoint, and the narrow-screen insight drawer.
 *
 * Design constraints:
 *   - The reducer is PURE: no async work, no DOM access, no fetch.
 *     Side effects (network, ResizeObserver, debounced search) live in
 *     sibling hooks and dispatch into this reducer.
 *   - On `FETCH_SUCCESS`, the raw backend payload is decoded once via
 *     `decodeBackendResponse` and the resulting `employees`, `days`,
 *     `attendance`, and `summary` are stored alongside `rawResponse`.
 *     The renderer never re-decodes — it reads the derived slices.
 *   - `selectedCell` is a single record or `null` (the discriminator
 *     enforces Property 10's at-most-one-popover invariant).
 *
 * Design reference:
 *   .kiro/specs/matrix-kehadiran-dark-redesign/design.md
 *     §"Reducer state shape" / §"Data flow & state management"
 *
 * Requirements: 3.7, 7.1, 7.2, 7.4, 7.5, 8.1, 8.6, 8.7, 8.8.
 */

import { useReducer } from 'react';
import type { Dispatch } from 'react';

import { decodeBackendResponse } from '../domain/decode';
import { computeMonthlySummary } from '../domain/summary';
import type { Breakpoint } from '../domain/layout';
import type {
  AttendanceRecord,
  BackendMonthlyGridResponse,
  DayMeta,
  Employee,
  MonthlySummary,
  QuickFilterState,
} from '../types';

// ─── State ─────────────────────────────────────────────────────────────────

/**
 * Synchronous state for the Matrix page. All async / DOM-derived values
 * (network status, viewport breakpoint) are pushed into the reducer via
 * dispatched actions.
 */
export interface MatrixState {
  /** Visible period — month is 1..12 (NOT JS-style 0..11). */
  month: number;
  year: number;

  /** Fetch lifecycle for `/api/monthly-grid`. */
  fetchStatus: 'idle' | 'loading' | 'loaded' | 'error';
  fetchError: string | null;
  /** Wall-clock timestamp of the most recent successful fetch. */
  lastUpdated: Date | null;

  /** Raw backend payload — kept for diagnostics / future re-decoding. */
  rawResponse: BackendMonthlyGridResponse | null;
  /** Derived slices populated on `FETCH_SUCCESS`. */
  employees: Employee[];
  days: DayMeta[];
  attendance: Map<string, AttendanceRecord>;
  summary: MonthlySummary;

  /** Top_Header search box value (raw, before debounce). */
  search: string;
  /**
   * Department filter from the Right_Insight_Panel "Departemen" select.
   * Sentinel `'all'` means inactive. Stored as `string` (not `'all'` |
   * dept name) so a future "custom department" feature can drop in
   * without changing this type.
   */
  departmentFilter: string;
  quickFilters: QuickFilterState;

  /**
   * Cell currently anchoring the popover. `null` when no popover is
   * open. The discriminator is a single record (NOT an array) so the
   * Property 10 invariant — at most one popover selection at any time —
   * is enforced structurally.
   */
  selectedCell: {
    employeeId: string;
    date: string;
    anchorRect: DOMRect;
  } | null;

  /**
   * Most recent hovered cell, used for row + column highlight in the
   * matrix. `null` when no cell is hovered. Same single-slot shape as
   * `selectedCell`.
   */
  hoveredCell: { employeeId: string; date: string } | null;

  /** Left_Sidebar expand/collapse state on Desktop_Wide / Desktop_Standard. */
  sidebarExpanded: boolean;
  /**
   * On `narrow` breakpoint the Right_Insight_Panel collapses into a
   * drawer; this flag tracks whether the drawer is open.
   */
  insightDrawerOpenOnNarrow: boolean;
  breakpoint: Breakpoint;
}

// ─── Actions ───────────────────────────────────────────────────────────────

/**
 * Discriminated union of every action accepted by `matrixReducer`. New
 * actions MUST be added to this union so the exhaustive `switch` in
 * the reducer continues to type-check.
 */
export type MatrixAction =
  | { type: 'SET_PERIOD'; month: number; year: number }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; response: BackendMonthlyGridResponse }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_DEPT_FILTER'; departmentFilter: string }
  | { type: 'SET_QUICK_FILTER'; quickFilters: QuickFilterState }
  | {
      type: 'SELECT_CELL';
      employeeId: string;
      date: string;
      anchorRect: DOMRect;
    }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'HOVER_CELL'; employeeId: string; date: string }
  | { type: 'CLEAR_HOVER' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_BREAKPOINT'; breakpoint: Breakpoint }
  | { type: 'OPEN_INSIGHT_DRAWER' }
  | { type: 'CLOSE_INSIGHT_DRAWER' };

// ─── Initial state ─────────────────────────────────────────────────────────

/**
 * Empty `MonthlySummary` shape — every count is zero and the percent is
 * zero. Used as the initial value before any fetch resolves.
 */
const EMPTY_SUMMARY: MonthlySummary = {
  totalEmployees: 0,
  averageAttendancePercent: 0,
  presentCount: 0,
  alphaCount: 0,
  leaveCount: 0,
  sickCount: 0,
  lateCount: 0,
  offCount: 0,
};

/**
 * Build the initial reducer state for a given period.
 *
 * Defaults:
 *   - `fetchStatus: 'idle'` — no fetch has been attempted yet.
 *   - `sidebarExpanded: true` — Left_Sidebar starts expanded.
 *   - `breakpoint: 'wide'` — assume Desktop_Wide until `useBreakpoint`
 *     dispatches `SET_BREAKPOINT` post-mount.
 *   - `insightDrawerOpenOnNarrow: false` — drawer closed by default.
 */
export function initialMatrixState(month: number, year: number): MatrixState {
  return {
    month,
    year,
    fetchStatus: 'idle',
    fetchError: null,
    lastUpdated: null,

    rawResponse: null,
    employees: [],
    days: [],
    attendance: new Map<string, AttendanceRecord>(),
    summary: EMPTY_SUMMARY,

    search: '',
    departmentFilter: 'all',
    quickFilters: {
      department: 'all',
      status: 'all',
      location: 'all',
    },

    selectedCell: null,
    hoveredCell: null,

    sidebarExpanded: true,
    insightDrawerOpenOnNarrow: false,
    breakpoint: 'wide',
  };
}

// ─── Reducer ───────────────────────────────────────────────────────────────

/**
 * Pure reducer for the Matrix page.
 *
 * Notes per action:
 *   - `SET_PERIOD`: updates month/year and clears `selectedCell` so a
 *     stale popover cannot survive a period change.
 *   - `FETCH_SUCCESS`: decodes the backend payload, computes the summary
 *     from the decoded attendance values, and stamps `lastUpdated`.
 *   - `SELECT_CELL`: REPLACES `selectedCell` with a new single record.
 *     The single-slot discriminator structurally guarantees Property 10
 *     (at most one popover selection at a time).
 */
export function matrixReducer(
  state: MatrixState,
  action: MatrixAction,
): MatrixState {
  switch (action.type) {
    case 'SET_PERIOD':
      return {
        ...state,
        month: action.month,
        year: action.year,
        // Clear any open popover so a stale selection from the previous
        // month cannot survive a period change.
        selectedCell: null,
      };

    case 'FETCH_START':
      return {
        ...state,
        fetchStatus: 'loading',
        fetchError: null,
      };

    case 'FETCH_SUCCESS': {
      const { employees, days, attendance } = decodeBackendResponse(
        action.response,
      );
      const summary = computeMonthlySummary(Array.from(attendance.values()));
      return {
        ...state,
        rawResponse: action.response,
        employees,
        days,
        attendance,
        summary,
        fetchStatus: 'loaded',
        fetchError: null,
        lastUpdated: new Date(),
      };
    }

    case 'FETCH_ERROR':
      return {
        ...state,
        fetchStatus: 'error',
        fetchError: action.error,
      };

    case 'SET_SEARCH':
      return { ...state, search: action.search };

    case 'SET_DEPT_FILTER':
      return { ...state, departmentFilter: action.departmentFilter };

    case 'SET_QUICK_FILTER':
      return { ...state, quickFilters: action.quickFilters };

    case 'SELECT_CELL':
      // Property 10 invariant: replace any existing selection with a
      // single new record (never an array).
      return {
        ...state,
        selectedCell: {
          employeeId: action.employeeId,
          date: action.date,
          anchorRect: action.anchorRect,
        },
      };

    case 'CLEAR_SELECTION':
      return { ...state, selectedCell: null };

    case 'HOVER_CELL':
      return {
        ...state,
        hoveredCell: {
          employeeId: action.employeeId,
          date: action.date,
        },
      };

    case 'CLEAR_HOVER':
      return { ...state, hoveredCell: null };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarExpanded: !state.sidebarExpanded };

    case 'SET_BREAKPOINT':
      return { ...state, breakpoint: action.breakpoint };

    case 'OPEN_INSIGHT_DRAWER':
      return { ...state, insightDrawerOpenOnNarrow: true };

    case 'CLOSE_INSIGHT_DRAWER':
      return { ...state, insightDrawerOpenOnNarrow: false };
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────

/**
 * Thin wrapper over `useReducer` returning the `[state, dispatch]` tuple.
 * Co-located with the reducer so callers always import both from the
 * same module.
 */
export function useMatrixState(
  initial: MatrixState,
): [MatrixState, Dispatch<MatrixAction>] {
  return useReducer(matrixReducer, initial);
}
