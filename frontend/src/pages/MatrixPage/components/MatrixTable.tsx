/**
 * MatrixTable — the core scrollable grid that orchestrates the Matrix
 * Kehadiran view. Wires together:
 *   - A top filter bar (department `Select` + reserved Status / Lokasi /
 *     Group placeholders, per req 5.13).
 *   - A CSS-grid matrix region built from `EmployeeColumn` (sticky-left),
 *     a sticky-top date header strip, and `MatrixCell` instances per
 *     (employee, day) tuple.
 *   - Internal hover state (`hoveredRow` × `hoveredCol`) so cells can
 *     decorate themselves without prop drilling, satisfying req 7.1 / 7.2.
 *
 * Layout decisions:
 *   - The grid uses `display: grid` with
 *     `grid-template-columns: ${empColWidth}px repeat(${days.length}, ${cellWidth}px)`
 *     so column widths are deterministic and stay aligned with the sticky
 *     header — no per-cell layout math.
 *   - The header row uses two sticky tiers: the top-left corner cell is
 *     `position: sticky; top: 0; left: 0` (z-index 3); date headers are
 *     `top: 0` (z-index 2); the per-row employee column is `left: 0`
 *     (z-index 1). This produces the standard "freeze panes" behavior
 *     when scrolling inside the matrix region.
 *   - On narrow viewports (`isNarrow === true`) we permit horizontal
 *     scroll on the matrix region (req 11.7); otherwise we hide it
 *     (req 11.8). Vertical scroll is always allowed for many-row datasets
 *     (req 5.10).
 *
 * Loading / empty states (req 13.3 + spec):
 *   - `isLoading` → render 3 skeleton rows of cell-height bars instead of
 *     the real grid; the filter bar remains interactive.
 *   - `!isLoading && employees.length === 0` → render a centered
 *     Indonesian empty-state message inside the matrix area.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11,
 *               5.12, 5.13, 5.14, 7.1, 7.2, 7.4, 7.5, 11.7, 11.8, 13.3
 */

import * as React from 'react';
import {
  Box,
  Button,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';

import { tokens } from '../tokens';
import { attendanceStatusToLabel } from '../domain/statusMapping';
import type { AttendanceRecord, DayMeta, Employee } from '../types';
import type { EmployeeSummaryRow } from '../domain/employeeSummary';
import { EmployeeColumn } from './EmployeeColumn';
import { MatrixCell } from './MatrixCell';
import { SummaryColumnsHeader, SummaryColumnsRow, SUMMARY_TOTAL_WIDTH } from './SummaryColumns';

// ─── Public props ──────────────────────────────────────────────────────────

export interface MatrixTableProps {
  employees: Employee[];
  days: DayMeta[];
  attendance: Map<string, AttendanceRecord>;
  selectedCell?: { employeeId: string; date: string } | null;
  onCellClick: (employeeId: string, date: string, anchorEl: HTMLElement) => void;
  onRowClick?: (employeeId: string) => void;
  onEmployeeMenu?: (employeeId: string, anchorEl: HTMLElement) => void;
  empColWidth: number;
  cellWidth: number;
  cellHeight?: number;
  departmentOptions?: string[];
  selectedDepartment: string;
  onDepartmentChange: (newValue: string) => void;
  isLoading?: boolean;
  isNarrow?: boolean;
  employeeSummaries?: Map<string, EmployeeSummaryRow>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Format a `yyyy-MM-dd` date into a long Indonesian phrase such as
 * `5 Mei 2026`. Used inside the per-cell `aria-label` / tooltip text so
 * screen-reader users hear the full date rather than the bare ISO key.
 */
export function formatDateIdLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

function resolveHeaderBackground(day: DayMeta): string {
  if (day.isSaturday) return tokens.weekend.saturdayHeaderBg;
  if (day.isSunday) return tokens.weekend.sundayHeaderBg;
  return tokens.bg.surface;
}

function resolveHeaderBorderTop(day: DayMeta): string {
  if (day.isSaturday) return `2px solid ${tokens.weekend.saturdayHeaderBorder}`;
  if (day.isSunday) return `2px solid ${tokens.weekend.sundayHeaderBorder}`;
  return '2px solid transparent';
}

function resolveDayNumberColor(day: DayMeta): string {
  if (day.isSaturday) return tokens.weekend.saturdayText;
  if (day.isSunday) return tokens.weekend.sundayText;
  return tokens.text.primary;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function MatrixTable(props: MatrixTableProps): React.ReactElement {
  const {
    employees,
    days,
    attendance,
    selectedCell,
    onCellClick,
    onRowClick,
    onEmployeeMenu,
    empColWidth,
    cellWidth,
    cellHeight = 44,
    departmentOptions,
    selectedDepartment,
    onDepartmentChange,
    isLoading = false,
    isNarrow = false,
    employeeSummaries,
  } = props;

  const [hoveredRow, setHoveredRow] = React.useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = React.useState<string | null>(null);

  const handleDeptChange = React.useCallback(
    (event: SelectChangeEvent<string>) => {
      onDepartmentChange(event.target.value);
    },
    [onDepartmentChange],
  );

  const handleClearHover = React.useCallback(() => {
    setHoveredRow(null);
    setHoveredCol(null);
  }, []);

  const sortedDepartments = React.useMemo(() => {
    if (!departmentOptions || departmentOptions.length === 0) return [];
    return [...departmentOptions].sort((a, b) =>
      a.localeCompare(b, 'id-ID', { sensitivity: 'base' }),
    );
  }, [departmentOptions]);

  const hasSummary = employeeSummaries != null && employeeSummaries.size > 0;
  const gridTemplateColumns = hasSummary
    ? `${empColWidth}px repeat(${days.length}, ${cellWidth}px) ${SUMMARY_TOTAL_WIDTH}px`
    : `${empColWidth}px repeat(${days.length}, ${cellWidth}px)`;

  const showEmpty = !isLoading && employees.length === 0;

  // ─── Filter bar ────────────────────────────────────────────────────────
  const filterBar = (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        p: 1,
        alignItems: 'center',
        borderBottom: `1px solid ${tokens.border.subtle}`,
        backgroundColor: tokens.bg.surface,
      }}
    >
      <Select
        size="small"
        value={selectedDepartment}
        onChange={handleDeptChange}
        aria-label="Filter departemen"
        sx={{
          width: 200,
          color: tokens.text.primary,
          backgroundColor: tokens.bg.card,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.border.subtle,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.border.subtle,
          },
          '& .MuiSvgIcon-root': { color: tokens.text.secondary },
        }}
      >
        <MenuItem value="all">Semua Departemen</MenuItem>
        {sortedDepartments.map((dept) => (
          <MenuItem key={dept} value={dept}>
            {dept}
          </MenuItem>
        ))}
      </Select>

      <Button variant="outlined" size="small" disabled>
        Semua Status
      </Button>
      <Button variant="outlined" size="small" disabled>
        Semua Lokasi
      </Button>
      <Button variant="outlined" size="small" disabled>
        Group Kerja
      </Button>
    </Stack>
  );

  // ─── Header row contents (rendered inside the CSS grid) ───────────────
  const cornerCell = (
    <Box
      key="__corner"
      sx={{
        position: 'sticky',
        top: 0,
        left: 0,
        zIndex: 31,
        height: 56,
        backgroundColor: tokens.bg.surface,
        borderBottom: `1px solid ${tokens.header.borderBottom}`,
        borderRight: `1px solid ${tokens.border.subtle}`,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Typography
        sx={{
          px: 1,
          py: 1,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: tokens.text.muted,
          fontWeight: 600,
        }}
      >
        Karyawan
      </Typography>
    </Box>
  );

  const todayStr = new Date().toISOString().slice(0, 10);

  const dateHeaderCells = days.map((day) => {
    const isToday = day.date === todayStr;
    let headerBg = resolveHeaderBackground(day);
    if (isToday) headerBg = tokens.today.headerBg;

    return (
      <Box
        key={`hdr-${day.date}`}
        role="columnheader"
        aria-label={`${day.day} ${day.weekdayShort}`}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          height: 56,
          backgroundColor: headerBg,
          borderTop: resolveHeaderBorderTop(day),
          borderBottom: `1px solid ${tokens.header.borderBottom}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          boxShadow:
            hoveredCol === day.date
              ? 'inset 0 0 0 9999px rgba(255,255,255,0.08)'
              : 'none',
        }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.1,
            color: isToday ? tokens.accent.cyan : resolveDayNumberColor(day),
          }}
        >
          {day.day}
        </Typography>
        <Typography
          component="span"
          sx={{
            fontSize: 10,
            lineHeight: 1.2,
            color: tokens.text.secondary,
          }}
        >
          {day.weekdayShort}
        </Typography>
      </Box>
    );
  });

  // ─── Body rows ────────────────────────────────────────────────────────
  const handleRowMouseEnter = (employeeId: string) => () => {
    setHoveredRow(employeeId);
  };

  const handleEmployeeRowClick = (employeeId: string) => () => {
    if (onRowClick) onRowClick(employeeId);
  };

  const bodyRows = employees.map((emp) => {
    const isRowHovered = hoveredRow === emp.employeeId;

    return (
      <React.Fragment key={emp.employeeId}>
        <Box
          sx={{
            position: 'sticky',
            left: 0,
            zIndex: 1,
            backgroundColor: tokens.bg.page,
            borderRight: `1px solid ${tokens.border.subtle}`,
            borderBottom: `1px solid ${tokens.border.cell}`,
          }}
          onMouseEnter={handleRowMouseEnter(emp.employeeId)}
          onClick={handleEmployeeRowClick(emp.employeeId)}
        >
          <EmployeeColumn
            employee={emp}
            width={empColWidth}
            height={cellHeight}
            isHovered={isRowHovered}
            onMenuClick={onEmployeeMenu}
          />
        </Box>

        {days.map((day) => {
          const key = `${emp.employeeId}|${day.date}`;
          const record = attendance.get(key);
          const status = record?.status ?? null;
          const ariaLabel = `${emp.name} · ${formatDateIdLong(day.date)} · ${
            status ? attendanceStatusToLabel(status) : 'Tidak ada data'
          }`;
          const isSelected =
            selectedCell != null &&
            selectedCell.employeeId === emp.employeeId &&
            selectedCell.date === day.date;
          const isColHovered = hoveredCol === day.date;

          return (
            <Box
              key={key}
              sx={{ borderBottom: `1px solid ${tokens.border.cell}` }}
            >
              <MatrixCell
                status={status}
                isWeekend={day.isWeekend}
                isSaturday={day.isSaturday}
                isSunday={day.isSunday}
                isToday={day.date === todayStr}
                isSelected={isSelected}
                isRowHovered={isRowHovered}
                isColHovered={isColHovered}
                width={cellWidth}
                height={cellHeight}
                ariaLabel={ariaLabel}
                onMouseEnter={() => {
                  setHoveredRow(emp.employeeId);
                  setHoveredCol(day.date);
                }}
                onMouseLeave={() => {
                }}
                onClick={(anchorEl) =>
                  onCellClick(emp.employeeId, day.date, anchorEl)
                }
              />
            </Box>
          );
        })}
        {hasSummary && (
          <SummaryColumnsRow
            employeeId={emp.employeeId}
            summary={employeeSummaries!.get(emp.employeeId)}
            cellHeight={cellHeight}
          />
        )}
      </React.Fragment>
    );
  });

  // ─── Loading skeleton rows ────────────────────────────────────────────
  const skeletonRows = Array.from({ length: 5 }).map((_, rowIdx) => (
    <React.Fragment key={`skeleton-${rowIdx}`}>
      <Box
        sx={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          backgroundColor: tokens.bg.page,
          borderRight: `1px solid ${tokens.border.subtle}`,
          borderBottom: `1px solid ${tokens.border.cell}`,
          px: 1,
          display: 'flex',
          alignItems: 'center',
          height: cellHeight,
        }}
      >
        <Skeleton
          variant="rectangular"
          width={empColWidth - 16}
          height={cellHeight - 16}
          sx={{ bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 1 }}
        />
      </Box>
      {days.map((day) => (
        <Box
          key={`skeleton-${rowIdx}-${day.date}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: cellHeight,
            borderBottom: `1px solid ${tokens.border.cell}`,
          }}
        >
          <Skeleton
            variant="rectangular"
            width={cellWidth - 8}
            height={cellHeight - 16}
            sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 1 }}
          />
        </Box>
      ))}
    </React.Fragment>
  ));

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        backgroundColor: tokens.bg.surface,
        border: `1px solid ${tokens.border.subtle}`,
        borderRadius: `${tokens.radius.card}px`,
        overflow: 'hidden',
      }}
    >
      {filterBar}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowX: isNarrow ? 'auto' : 'hidden',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 380px)',
          backgroundColor: tokens.bg.page,
        }}
        onMouseLeave={handleClearHover}
      >
        {showEmpty ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 8,
              minHeight: 240,
            }}
          >
            <Typography
              sx={{ color: tokens.text.secondary, fontSize: 14 }}
            >
              Tidak ada karyawan untuk periode ini.
            </Typography>
          </Box>
        ) : (
          <Box
            role="grid"
            aria-rowcount={
              isLoading ? 6 : employees.length + 1 /* header */
            }
            aria-colcount={days.length + 1 /* employee column */}
            sx={{
              display: 'grid',
              gridTemplateColumns,
              width: 'fit-content',
              minWidth: '100%',
            }}
          >
            {cornerCell}
            {dateHeaderCells}
            {hasSummary && <SummaryColumnsHeader />}
            {isLoading ? skeletonRows : bodyRows}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default MatrixTable;
