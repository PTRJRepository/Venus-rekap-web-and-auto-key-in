/**
 * MatrixPage — orchestrator for the Matrix Kehadiran "Dark Matrix Command
 * Center" page.
 *
 * Owns:
 *   - The reducer (`useMatrixState`) — synchronous UI state.
 *   - The data fetch (`useMonthlyGrid`) — month/year keyed `/api/monthly-grid`.
 *   - The viewport breakpoint (`useBreakpoint`) and resize-aware width.
 *   - The debounced search query (`useDebouncedSearch`).
 *   - Derived slices (filtered employees + attendance, monthly summary).
 *   - The 3-column CSS-grid layout (sidebar | main workspace | insight).
 *   - Failure-mode wiring: loading skeleton, ErrorState, empty state,
 *     export-disable, and popover dismissal when the selected employee
 *     is filtered out.
 *   - The Ctrl/Cmd+K shortcut → focus the search input.
 *
 * The dark theme is scoped by wrapping the entire returned JSX in a local
 * `<ThemeProvider theme={matrixTheme}>` + `<CssBaseline />`, so other tabs
 * in `App.jsx` keep their existing light theme (Requirement 14.4).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 3.6, 3.7,
 *               3.10, 4.13, 9.4, 9.5, 13.1, 13.3, 13.4, 13.5, 13.6, 14.2,
 *               14.3, 16.1, 16.2, 16.5, 16.6.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement } from 'react';
import { Box, CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';

import { matrixTheme } from './matrixTheme';
import { tokens } from './tokens';
import { useBreakpoint } from './hooks/useBreakpoint';
import { useDebouncedSearch } from './hooks/useDebouncedSearch';
import { useMatrixState, initialMatrixState } from './hooks/useMatrixState';
import { useMonthlyGrid } from './hooks/useMonthlyGrid';
import { applyFilters } from './domain/filter';
import { computeMonthlySummary } from './domain/summary';
import { computeEmployeeSummaries } from './domain/employeeSummary';
import {
  computeCellWidth,
  empColWidth as resolveEmpColWidth,
  insightWidth as resolveInsightWidth,
  sidebarWidth as resolveSidebarWidth,
} from './domain/layout';

import { LeftSidebar } from './components/LeftSidebar';
import { TopHeader } from './components/TopHeader';
import { KPIRow } from './components/KPIRow';
import { MatrixTable } from './components/MatrixTable';
import { FooterLegend } from './components/FooterLegend';
import { RightInsightPanel } from './components/RightInsightPanel';
import { CellDetailPopover } from './components/CellDetailPopover';
import { ErrorState } from './components/ErrorState';
import { MatrixModeSelector } from './components/MatrixModeSelector';

import type { AttendanceStatus, QuickFilterState } from './types';
import type { MatrixMode, HeatmapMetric } from './domain/heatmap';

// ─── Public props ──────────────────────────────────────────────────────────

export interface MatrixPageProps {
  /** Visible month, 1..12. Defaults to the current local month. */
  month?: number;
  /** Visible year (4-digit). Defaults to the current local year. */
  year?: number;
  /** Fired when the user picks a new month inside the page. */
  onMonthChange?: (newMonth: number) => void;
  /** Fired when the user picks a new year inside the page. */
  onYearChange?: (newYear: number) => void;
  /** Fired when the user clicks a non-Matrix item in the left sidebar. */
  onNavigate?: (tabKey: string) => void;
  /**
   * Currently unused at this layer; reserved for a future "include staff"
   * toggle that the App.jsx parent already owns.
   */
  showStaff?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Default fallback period when the parent does not pass `month`/`year`
 * props. Resolved on every render — cheap, and ensures the page picks up
 * a midnight rollover without a remount.
 */
function getDefaultMonth(): number {
  return new Date().getMonth() + 1;
}

function getDefaultYear(): number {
  return new Date().getFullYear();
}

/**
 * Tracks `window.innerWidth` via a resize listener. SSR-safe: returns a
 * sensible default when `window` is undefined. The listener is attached
 * once per mount and removed on unmount.
 */
function useViewportWidth(): number {
  const [width, setWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (): void => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return width;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function MatrixPage(props: MatrixPageProps): ReactElement {
  const initialMonth = props.month ?? getDefaultMonth();
  const initialYear = props.year ?? getDefaultYear();

  // ── State / refs ─────────────────────────────────────────────────────
  const [state, dispatch] = useMatrixState(
    initialMatrixState(initialMonth, initialYear),
  );

  /** DOM ref to the search input — focused via Ctrl/Cmd+K. */
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * The most-recently clicked cell DOM element. Stored separately from
   * the reducer's `selectedCell` because MUI Popover requires an
   * `HTMLElement` anchor (not a `DOMRect`), and `DOMRect` does not
   * survive serialization through reducer actions cleanly.
   */
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  // ── Sync controlled props → reducer ─────────────────────────────────
  // When App.jsx changes month/year via props, mirror the change into the
  // reducer so a single source of truth drives the data fetch and UI.
  useEffect(() => {
    if (props.month === undefined && props.year === undefined) return;
    const nextMonth = props.month ?? state.month;
    const nextYear = props.year ?? state.year;
    if (nextMonth !== state.month || nextYear !== state.year) {
      dispatch({ type: 'SET_PERIOD', month: nextMonth, year: nextYear });
    }
    // We intentionally exclude `state.month`/`state.year` from deps so
    // user-initiated period changes don't bounce back through this sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.month, props.year]);

  // ── Hooks driven by state ────────────────────────────────────────────
  const grid = useMonthlyGrid(state.month, state.year);
  const breakpoint = useBreakpoint(state.days.length || 31);
  const debouncedSearch = useDebouncedSearch(state.search, 150);
  const viewportWidth = useViewportWidth();

  // ── Sync grid hook → reducer ────────────────────────────────────────
  useEffect(() => {
    if (grid.status === 'loading') {
      dispatch({ type: 'FETCH_START' });
    } else if (grid.status === 'loaded' && grid.data) {
      dispatch({ type: 'FETCH_SUCCESS', response: grid.data });
    } else if (grid.status === 'error') {
      dispatch({
        type: 'FETCH_ERROR',
        error: grid.error ?? 'Terjadi kesalahan saat memuat data.',
      });
    }
  }, [grid.status, grid.data, grid.error, dispatch]);

  // ── Sync breakpoint → reducer ───────────────────────────────────────
  useEffect(() => {
    if (breakpoint !== state.breakpoint) {
      dispatch({ type: 'SET_BREAKPOINT', breakpoint });
    }
  }, [breakpoint, state.breakpoint, dispatch]);

  // ── Auto-collapse sidebar on narrow per req 11.4 ────────────────────
  useEffect(() => {
    if (breakpoint === 'narrow' && state.sidebarMode === 'expanded') {
      dispatch({ type: 'SET_SIDEBAR_MODE', mode: 'collapsed' });
    }
  }, [breakpoint, state.sidebarMode, dispatch]);

  // ── Derived: filtered employees + attendance ────────────────────────
  const filtered = useMemo(
    () =>
      applyFilters(
        state.employees,
        state.attendance,
        debouncedSearch,
        state.departmentFilter,
        state.quickFilters,
      ),
    [
      state.employees,
      state.attendance,
      debouncedSearch,
      state.departmentFilter,
      state.quickFilters,
    ],
  );

  // ── Derived: monthly summary computed from FILTERED attendance ──────
  const summary = useMemo(
    () => computeMonthlySummary(Array.from(filtered.attendance.values())),
    [filtered.attendance],
  );

  // ── Derived: per-employee summaries for summary columns ────────────
  const employeeSummaries = useMemo(
    () => computeEmployeeSummaries(filtered.employees, filtered.attendance, state.days),
    [filtered.employees, filtered.attendance, state.days],
  );

  // ── Derived: layout widths ──────────────────────────────────────────
  const sidebarWidthPx = useMemo(
    () => resolveSidebarWidth(breakpoint, state.sidebarMode),
    [breakpoint, state.sidebarMode],
  );

  const insightWidthPx = useMemo(
    () => state.rightPanelVisible ? resolveInsightWidth(breakpoint) : 0,
    [breakpoint, state.rightPanelVisible],
  );

  const empColWidthPx = useMemo(
    () => resolveEmpColWidth(breakpoint),
    [breakpoint],
  );

  const cellWidth = useMemo(
    () =>
      computeCellWidth(
        viewportWidth,
        breakpoint,
        state.sidebarMode !== 'hidden' && state.sidebarMode === 'expanded',
        state.days.length || 31,
      ),
    [viewportWidth, breakpoint, state.sidebarMode, state.days.length],
  );

  // ── Derived: department options for the filter dropdowns ───────────
  // Computed from the *unfiltered* employees so the dropdown remains
  // usable even after the user picks a narrowing department.
  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          state.employees
            .map((e) => e.department)
            .filter((d): d is string => typeof d === 'string' && d.length > 0),
        ),
      ),
    [state.employees],
  );

  // ── Derived: month label + workday count ────────────────────────────
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
      }).format(new Date(state.year, state.month - 1, 1)),
    [state.month, state.year],
  );

  const workdayCount = useMemo(
    () => state.days.filter((d) => !d.isWeekend && !d.isHoliday).length,
    [state.days],
  );

  // ── Derived: selected cell detail (for popover) ─────────────────────
  const selectedDetail = useMemo(() => {
    if (state.selectedCell === null) return null;
    const { employeeId, date } = state.selectedCell;
    const emp = state.employees.find((e) => e.employeeId === employeeId);
    if (!emp) return null;
    const record = state.attendance.get(`${employeeId}|${date}`);
    return {
      employeeName: emp.name,
      date,
      status: record?.status ?? null,
      checkIn: record?.checkIn ?? null,
      checkOut: record?.checkOut ?? null,
      workHours: record?.workHours ?? null,
      note: record?.note ?? null,
    };
  }, [state.selectedCell, state.employees, state.attendance]);

  // ── Effect: dismiss popover if its employee is filtered out ────────
  useEffect(() => {
    if (state.selectedCell === null) return;
    const stillVisible = filtered.employees.some(
      (e) => e.employeeId === state.selectedCell!.employeeId,
    );
    if (!stillVisible) {
      dispatch({ type: 'CLEAR_SELECTION' });
      setPopoverAnchor(null);
    }
  }, [filtered.employees, state.selectedCell, dispatch]);

  // ── Effect: Ctrl/Cmd+K → focus search ───────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleMonthChange = useCallback(
    (newMonth: number) => {
      dispatch({ type: 'SET_PERIOD', month: newMonth, year: state.year });
      props.onMonthChange?.(newMonth);
    },
    [dispatch, state.year, props],
  );

  const handleYearChange = useCallback(
    (newYear: number) => {
      dispatch({ type: 'SET_PERIOD', month: state.month, year: newYear });
      props.onYearChange?.(newYear);
    },
    [dispatch, state.month, props],
  );

  const handleTodayClick = useCallback(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    dispatch({ type: 'SET_PERIOD', month: m, year: y });
    props.onMonthChange?.(m);
    props.onYearChange?.(y);
  }, [dispatch, props]);

  const handleSearchChange = useCallback(
    (value: string) => dispatch({ type: 'SET_SEARCH', search: value }),
    [dispatch],
  );

  const handleDeptChange = useCallback(
    (value: string) =>
      dispatch({ type: 'SET_DEPT_FILTER', departmentFilter: value }),
    [dispatch],
  );

  const handleQuickFilterChange = useCallback(
    (next: QuickFilterState) =>
      dispatch({ type: 'SET_QUICK_FILTER', quickFilters: next }),
    [dispatch],
  );

  const handleCellClick = useCallback(
    (employeeId: string, date: string, anchorEl: HTMLElement) => {
      setPopoverAnchor(anchorEl);
      dispatch({
        type: 'SELECT_CELL',
        employeeId,
        date,
        anchorRect: anchorEl.getBoundingClientRect(),
      });
    },
    [dispatch],
  );

  const handlePopoverClose = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
    setPopoverAnchor(null);
  }, [dispatch]);

  const handleToggleSidebar = useCallback(
    () => dispatch({ type: 'TOGGLE_SIDEBAR' }),
    [dispatch],
  );

  const handleSetSidebarMode = useCallback(
    (mode: 'expanded' | 'collapsed' | 'hidden') =>
      dispatch({ type: 'SET_SIDEBAR_MODE', mode }),
    [dispatch],
  );

  const handleToggleKpi = useCallback(
    () => dispatch({ type: 'TOGGLE_KPI' }),
    [dispatch],
  );

  const handleToggleRightPanel = useCallback(
    () => dispatch({ type: 'TOGGLE_RIGHT_PANEL' }),
    [dispatch],
  );

  const handleFocusMode = useCallback(
    () => dispatch({
      type: 'SET_VIEW_MODE',
      mode: state.viewMode === 'focus' ? 'default' : 'focus',
    }),
    [dispatch, state.viewMode],
  );

  const handleMatrixModeChange = useCallback(
    (mode: MatrixMode) => dispatch({ type: 'SET_MATRIX_MODE', mode }),
    [dispatch],
  );

  const handleHeatmapMetricChange = useCallback(
    (metric: HeatmapMetric) => dispatch({ type: 'SET_HEATMAP_METRIC', metric }),
    [dispatch],
  );

  const handleNavigate = useCallback(
    (tabKey: string) => {
      if (tabKey === 'matrix') return;
      // Map sidebar keys to App.jsx tab system
      const tabMap: Record<string, string> = {
        dashboard: 'matrix',
        employees: 'matrix',
        overtime: 'report',
        leave: 'report',
        sick: 'report',
        late: 'report',
        report: 'report',
        payroll: 'payroll',
        settings: 'matrix',
        help: 'matrix',
      };
      props.onNavigate?.(tabMap[tabKey] ?? tabKey);
    },
    [props],
  );

  const handleToggleInsightDrawer = useCallback(() => {
    dispatch(
      state.insightDrawerOpenOnNarrow
        ? { type: 'CLOSE_INSIGHT_DRAWER' }
        : { type: 'OPEN_INSIGHT_DRAWER' },
    );
  }, [dispatch, state.insightDrawerOpenOnNarrow]);

  const handleExportClick = useCallback(() => {
    // Export wiring is intentionally deferred (req 4.13: button must be
    // disabled while no export service is wired). When enabled, this
    // would call the existing `/api/export` endpoint.
    // eslint-disable-next-line no-console
    console.log('Ekspor not implemented yet');
  }, []);

  // ── Failure-mode flags ───────────────────────────────────────────────
  const isLoading = state.fetchStatus === 'loading';
  const isError = state.fetchStatus === 'error';
  const exportEnabled = state.fetchStatus === 'loaded';
  const isNarrow = breakpoint === 'narrow';

  // ── Avatar status filter (record-level) — applied at render time ────
  // QuickFilters.status is informational at the employee level (Property
  // 9 forbids it from reducing employee rows). At the matrix-cell level
  // we *can* mask out non-matching status icons by re-keying the
  // attendance map to only entries whose status equals the selected one.
  const visibleAttendance = useMemo(() => {
    if (state.quickFilters.status === 'all') return filtered.attendance;
    const status = state.quickFilters.status as AttendanceStatus;
    const next = new Map<string, typeof filtered.attendance extends Map<infer _K, infer V> ? V : never>();
    for (const [key, rec] of filtered.attendance) {
      if (rec.status === status) next.set(key, rec);
    }
    return next;
  }, [filtered.attendance, state.quickFilters.status]);

  // ── Layout: column template ──────────────────────────────────────────
  const gridTemplateColumns = (() => {
    if (sidebarWidthPx === 0 && insightWidthPx === 0) return '1fr';
    if (sidebarWidthPx === 0) return `1fr ${insightWidthPx}px`;
    if (insightWidthPx === 0 || isNarrow) return `${sidebarWidthPx}px 1fr`;
    return `${sidebarWidthPx}px 1fr ${insightWidthPx}px`;
  })();

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <ThemeProvider theme={matrixTheme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns,
          gridTemplateRows: '1fr',
          width: '100%',
          height: '100%',
          backgroundColor: tokens.bg.page,
          color: tokens.text.primary,
          // Outer 12–16 px gutter (req 1.6, mid-point 14 px).
          padding: '14px',
          gap: '14px',
          boxSizing: 'border-box',
        }}
      >
        {/* ── Column 1: Left sidebar ────────────────────────────────── */}
        {state.sidebarMode !== 'hidden' && (
        <Box
          sx={{
            gridColumn: 1,
            minWidth: 0,
            height: '100%',
            borderRadius: `${tokens.radius.card}px`,
            overflow: 'hidden',
          }}
        >
          <LeftSidebar
            expanded={state.sidebarExpanded}
            activeTab="matrix"
            onNavigate={handleNavigate}
            onToggleCollapse={handleToggleSidebar}
          />
        </Box>
        )}

        {/* ── Column 2: Main workspace ─────────────────────────────── */}
        <Box
          sx={{
            gridColumn: state.sidebarMode === 'hidden' ? 1 : 2,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: state.viewMode === 'focus' ? '4px' : '12px',
            height: '100%',
          }}
        >
          <TopHeader
            month={state.month}
            year={state.year}
            searchValue={state.search}
            onMonthChange={handleMonthChange}
            onYearChange={handleYearChange}
            onTodayClick={handleTodayClick}
            onSearchChange={handleSearchChange}
            onToggleInsightDrawer={handleToggleInsightDrawer}
            showInsightDrawerToggle={isNarrow}
            searchInputRef={searchInputRef}
            onToggleKpi={handleToggleKpi}
            kpiVisible={state.kpiVisible}
            onToggleRightPanel={handleToggleRightPanel}
            rightPanelVisible={state.rightPanelVisible}
            onFocusMode={handleFocusMode}
            isFocusMode={state.viewMode === 'focus'}
            sidebarMode={state.sidebarMode}
            onSetSidebarMode={handleSetSidebarMode}
          />

          {state.kpiVisible && (
          <KPIRow
            summary={summary}
            exportEnabled={exportEnabled}
            onExportClick={handleExportClick}
          />
          )}

          <MatrixModeSelector
            mode={state.matrixMode}
            heatmapMetric={state.heatmapMetric}
            onModeChange={handleMatrixModeChange}
            onHeatmapMetricChange={handleHeatmapMetricChange}
          />

          {/*
            Matrix region: error → ErrorState; otherwise the table itself
            handles loading skeleton + empty-state internally so
            Top_Header / KPI_Row / Left_Sidebar stay interactive while
            data loads (req 13.3).
          */}
          {isError ? (
            <ErrorState
              message={state.fetchError ?? undefined}
              onRetry={grid.retry}
            />
          ) : (
            <MatrixTable
              employees={filtered.employees}
              days={state.days}
              attendance={visibleAttendance}
              selectedCell={
                state.selectedCell
                  ? {
                      employeeId: state.selectedCell.employeeId,
                      date: state.selectedCell.date,
                    }
                  : null
              }
              onCellClick={handleCellClick}
              empColWidth={empColWidthPx}
              cellWidth={cellWidth}
              departmentOptions={departmentOptions}
              selectedDepartment={state.departmentFilter}
              onDepartmentChange={handleDeptChange}
              isLoading={isLoading}
              isNarrow={isNarrow}
              employeeSummaries={employeeSummaries}
              matrixMode={state.matrixMode}
              heatmapMetric={state.heatmapMetric}
            />
          )}

          <FooterLegend lastUpdated={state.lastUpdated} />
        </Box>

        {/* ── Column 3: Right insight panel (or drawer on narrow) ──── */}
        {isNarrow ? (
          <RightInsightPanel
            summary={summary}
            filters={state.quickFilters}
            monthLabel={monthLabel}
            workdayCount={workdayCount}
            lastUpdated={state.lastUpdated}
            departmentOptions={departmentOptions}
            onFilterChange={handleQuickFilterChange}
            isNarrow
            drawerOpen={state.insightDrawerOpenOnNarrow}
            onDrawerClose={handleToggleInsightDrawer}
            employeeSummaries={employeeSummaries}
            employees={filtered.employees}
          />
        ) : state.rightPanelVisible ? (
          <Box
            sx={{
              minWidth: 0,
              height: '100%',
              borderRadius: `${tokens.radius.card}px`,
              overflow: 'hidden',
            }}
          >
            <RightInsightPanel
              summary={summary}
              filters={state.quickFilters}
              monthLabel={monthLabel}
              workdayCount={workdayCount}
              lastUpdated={state.lastUpdated}
              departmentOptions={departmentOptions}
              onFilterChange={handleQuickFilterChange}
              employeeSummaries={employeeSummaries}
              employees={filtered.employees}
            />
          </Box>
        ) : null}

        {/* ── Cell detail popover (anchored to clicked cell) ──────── */}
        <CellDetailPopover
          open={state.selectedCell !== null && popoverAnchor !== null}
          anchorEl={popoverAnchor}
          detail={selectedDetail}
          onClose={handlePopoverClose}
        />
      </Box>
    </ThemeProvider>
  );
}

export default MatrixPage;
