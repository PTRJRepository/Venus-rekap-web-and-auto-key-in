/**
 * RightInsightPanel — container component for the right-side insight panel.
 *
 * Layout (top → bottom):
 *   1. "Ringkasan Bulan Ini" — section header + `<DonutSummary>`.
 *   2. Divider (1 px, tokens.border.subtle).
 *   3. "Filter Cepat" — three labelled `<Select size="small">` inputs:
 *        - Departemen (first option "Semua Departemen", value 'all')
 *        - Status     (first option "Semua Status",     value 'all',
 *                      followed by the six attendance statuses with
 *                      labels resolved via `attendanceStatusToLabel`).
 *        - Lokasi     (first option "Semua Lokasi",     value 'all').
 *      Each `<Select>` is preceded by an `<InputLabel>` (11 px,
 *      tokens.text.secondary) — note that since MUI's free-form label
 *      requires `<FormControl>` + `shrink`-style behavior or a manual
 *      label above the input, we render the label as a sibling element
 *      *above* the Select via `<InputLabel shrink>` inside `<FormControl>`
 *      with the Select's `notched` border disabled (no embedded label).
 *   4. Divider.
 *   5. "Informasi" — two text rows:
 *        - "Periode: {monthLabel}"   (13 px, tokens.text.primary)
 *        - "Hari kerja: {workdayCount} hari"
 *   6. Divider.
 *   7. Footer — "Data diperbarui: {timestamp}" (11 px, tokens.text.muted).
 *      Timestamp formatted via the same `Intl.DateTimeFormat('id-ID', …)`
 *      configuration used by `FooterLegend`.
 *
 * Container styling:
 *   - Background: tokens.bg.surface
 *   - Padding:    16 px
 *   - Border-left: 1 px solid tokens.border.subtle (inline mode only;
 *                  inside the Drawer the panel sits flush against the
 *                  drawer paper, so no extra border).
 *   - Display:     flex column, gap 16 px.
 *
 * Drawer behavior:
 *   When `isNarrow` is true the entire content is wrapped in
 *   `<Drawer anchor="right">` controlled by `drawerOpen` / `onDrawerClose`.
 *   The drawer paper width is 320 px. Otherwise the panel renders inline
 *   directly into the parent grid cell.
 *
 * Pure presentational module aside from the inline `Select` change
 * handlers — all derived state lives upstream in the MatrixPage reducer.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 11.5, 11.6, 15.5
 */

import * as React from 'react';
import {
  Box,
  Divider,
  Drawer,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';

import DonutSummary from './DonutSummary';
import { attendanceStatusToLabel } from '../domain/statusMapping';
import { tokens } from '../tokens';
import type {
  AttendanceStatus,
  MonthlySummary,
  QuickFilterState,
} from '../types';

// ─── Closed list of attendance statuses for the Status filter ──────────────

/**
 * Render order for the Status filter dropdown. Stable literal tuple so
 * the union and the dropdown stay in sync at the type level.
 */
const STATUS_OPTIONS: AttendanceStatus[] = [
  'present',
  'alpha',
  'leave',
  'sick',
  'late',
  'off',
];

// ─── Date formatting (matches FooterLegend) ────────────────────────────────

/**
 * `Intl.DateTimeFormat` configured per the design's "Data diperbarui" /
 * "Terakhir diperbarui" spec: 2-digit day, short month, numeric year,
 * 2-digit hour and minute, locale `id-ID`. Constructed once at module
 * load (no per-render cost).
 */
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatLastUpdated(value: Date | null): string {
  if (value === null) return '—';
  return TIMESTAMP_FORMATTER.format(value);
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface RightInsightPanelProps {
  /** Aggregated counts for the visible month (powers the donut). */
  summary: MonthlySummary;
  /** Currently active filter selections. */
  filters: QuickFilterState;
  /** Indonesian-localized label for the visible month, e.g. "Mei 2026". */
  monthLabel: string;
  /** Number of working days in the visible month. */
  workdayCount: number;
  /** Timestamp of the last successful Monthly_Grid_API response. */
  lastUpdated: Date | null;
  /** Optional list of department names for the Departemen filter. */
  departmentOptions?: string[];
  /** Optional list of location names for the Lokasi filter. */
  locationOptions?: string[];
  /** Invoked when any quick filter changes. */
  onFilterChange: (next: QuickFilterState) => void;
  /** When true the panel renders inside `<Drawer anchor="right">`. */
  isNarrow?: boolean;
  /** Drawer open state (only consulted when `isNarrow` is true). */
  drawerOpen?: boolean;
  /** Drawer close handler (only consulted when `isNarrow` is true). */
  onDrawerClose?: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function RightInsightPanel(
  props: RightInsightPanelProps,
): React.ReactElement {
  const {
    summary,
    filters,
    monthLabel,
    workdayCount,
    lastUpdated,
    departmentOptions = [],
    locationOptions = [],
    onFilterChange,
    isNarrow = false,
    drawerOpen = false,
    onDrawerClose,
  } = props;

  // ─── Filter change handlers ─────────────────────────────────────────────

  const handleDepartmentChange = (event: SelectChangeEvent<string>): void => {
    onFilterChange({ ...filters, department: event.target.value });
  };

  const handleStatusChange = (event: SelectChangeEvent<string>): void => {
    onFilterChange({
      ...filters,
      status: event.target.value as AttendanceStatus | 'all',
    });
  };

  const handleLocationChange = (event: SelectChangeEvent<string>): void => {
    onFilterChange({ ...filters, location: event.target.value });
  };

  // ─── Section header (subtitle2 — 13 px, weight 600, primary text) ───────

  const sectionHeaderSx = {
    fontSize: 13,
    fontWeight: 600,
    color: tokens.text.primary,
    lineHeight: 1.4,
  } as const;

  const inputLabelSx = {
    fontSize: 11,
    color: tokens.text.secondary,
    position: 'static' as const,
    transform: 'none',
    pointerEvents: 'auto' as const,
    mb: 0.5,
  };

  // ─── Inner content (rendered inline OR inside Drawer) ───────────────────

  const content = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        height: '100%',
        padding: '16px',
        backgroundColor: tokens.bg.surface,
        borderLeft: isNarrow
          ? 'none'
          : `1px solid ${tokens.border.subtle}`,
        boxSizing: 'border-box',
      }}
    >
      {/* ─── 1. Ringkasan Bulan Ini ─────────────────────────────────── */}
      <Stack direction="column" spacing={1.25}>
        <Typography component="h3" sx={sectionHeaderSx}>
          Ringkasan Bulan Ini
        </Typography>
        <DonutSummary summary={summary} />
      </Stack>

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* ─── 3. Filter Cepat ────────────────────────────────────────── */}
      <Stack direction="column" spacing={1.5}>
        <Typography component="h3" sx={sectionHeaderSx}>
          Filter Cepat
        </Typography>

        <FormControl fullWidth variant="outlined" size="small">
          <InputLabel
            shrink
            htmlFor="quick-filter-department"
            sx={inputLabelSx}
          >
            Departemen
          </InputLabel>
          <Select
            id="quick-filter-department"
            size="small"
            value={filters.department}
            onChange={handleDepartmentChange}
            notched={false}
            label=""
            sx={{
              fontSize: 13,
              color: tokens.text.primary,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: tokens.border.subtle,
              },
            }}
          >
            <MenuItem value="all">Semua Departemen</MenuItem>
            {departmentOptions.map((dept) => (
              <MenuItem key={dept} value={dept}>
                {dept}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth variant="outlined" size="small">
          <InputLabel
            shrink
            htmlFor="quick-filter-status"
            sx={inputLabelSx}
          >
            Status
          </InputLabel>
          <Select
            id="quick-filter-status"
            size="small"
            value={filters.status}
            onChange={handleStatusChange}
            notched={false}
            label=""
            sx={{
              fontSize: 13,
              color: tokens.text.primary,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: tokens.border.subtle,
              },
            }}
          >
            <MenuItem value="all">Semua Status</MenuItem>
            {STATUS_OPTIONS.map((status) => (
              <MenuItem key={status} value={status}>
                {attendanceStatusToLabel(status)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth variant="outlined" size="small">
          <InputLabel
            shrink
            htmlFor="quick-filter-location"
            sx={inputLabelSx}
          >
            Lokasi
          </InputLabel>
          <Select
            id="quick-filter-location"
            size="small"
            value={filters.location}
            onChange={handleLocationChange}
            notched={false}
            label=""
            sx={{
              fontSize: 13,
              color: tokens.text.primary,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: tokens.border.subtle,
              },
            }}
          >
            <MenuItem value="all">Semua Lokasi</MenuItem>
            {locationOptions.map((loc) => (
              <MenuItem key={loc} value={loc}>
                {loc}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* ─── 5. Informasi ───────────────────────────────────────────── */}
      <Stack direction="column" spacing={0.75}>
        <Typography component="h3" sx={sectionHeaderSx}>
          Informasi
        </Typography>
        <Typography
          component="p"
          sx={{
            fontSize: 13,
            color: tokens.text.primary,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {`Periode: ${monthLabel}`}
        </Typography>
        <Typography
          component="p"
          sx={{
            fontSize: 13,
            color: tokens.text.primary,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {`Hari kerja: ${workdayCount} hari`}
        </Typography>
      </Stack>

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* ─── 7. Footer timestamp ────────────────────────────────────── */}
      <Typography
        component="p"
        sx={{
          fontSize: 11,
          color: tokens.text.muted,
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {`Data diperbarui: ${formatLastUpdated(lastUpdated)}`}
      </Typography>
    </Box>
  );

  // ─── Render: inline OR inside Drawer ────────────────────────────────────

  if (isNarrow) {
    return (
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={onDrawerClose}
        PaperProps={{
          sx: {
            width: 320,
            backgroundColor: tokens.bg.surface,
            backgroundImage: 'none',
            borderLeft: `1px solid ${tokens.border.subtle}`,
          },
        }}
      >
        {content}
      </Drawer>
    );
  }

  return content;
}

export default RightInsightPanel;
