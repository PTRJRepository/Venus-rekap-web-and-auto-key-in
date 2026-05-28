/**
 * CellDetailPopover — anchored popover that surfaces the per-cell attendance
 * detail when a Matrix_Cell is clicked.
 *
 * Visual structure (top → bottom):
 *   1. Header — employee name (subtitle1, weight 600) + date in long
 *      Indonesian form (`dd MMMM yyyy`, e.g. "5 Mei 2026").
 *   2. Status chip — colored from `getStatusColor(status)` and labeled via
 *      `attendanceStatusToLabel(status)`. When `status` is `null`, the chip
 *      slot renders a plain "—" placeholder.
 *   3. Detail rows — Masuk, Pulang, Jam kerja, Catatan. Missing fields fall
 *      back to "—". `workHours` is formatted to one decimal with the
 *      Indonesian comma separator (e.g. `8,5 jam`).
 *   4. Action row — "Lihat Detail", "Ajukan Koreksi", "Tambah Catatan".
 *      Buttons are always rendered; the corresponding handler may be
 *      undefined (no-op for now per design).
 *
 * Positioning:
 *   The popover uses MUI `<Popover>` with `anchorEl`, `anchorOrigin`, and
 *   `transformOrigin` so MUI handles flip/clamp automatically. The pure
 *   `clampPopoverPosition` helper in `domain/popover.ts` covers the same
 *   guarantees and is exercised independently by the property-based test
 *   suite (Property 6).
 *
 * Dismissal:
 *   - Click outside the paper → MUI Popover closes via its own backdrop and
 *     calls `onClose`.
 *   - ESC key → handled by a `keydown` listener on `document` that we
 *     register only while `open === true` (cleaned up on close/unmount).
 *     Note: MUI also closes on ESC by default, but registering our own
 *     listener satisfies the explicit requirement (8.7) and ensures the
 *     ESC path is observable in tests that don't go through MUI's modal
 *     manager.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9.
 */

import * as React from 'react';
import { useEffect } from 'react';
import {
  Popover,
  Box,
  Stack,
  Typography,
  Button,
  Chip,
} from '@mui/material';

import type { AttendanceStatus } from '../types';
import { tokens } from '../tokens';
import {
  attendanceStatusToLabel,
  getStatusColor,
} from '../domain/statusMapping';

// ─── Public props ──────────────────────────────────────────────────────────

export interface CellDetailPopoverProps {
  /** Whether the popover is currently visible. */
  open: boolean;
  /** DOM element the popover should anchor to (the clicked cell). */
  anchorEl: HTMLElement | null;
  /**
   * Cell detail to render. When `null`, the popover renders nothing — this
   * lets the parent keep the popover mounted across selection transitions
   * without flashing stale content.
   */
  detail: {
    employeeName: string;
    date: string; // yyyy-MM-dd
    status: AttendanceStatus | null;
    checkIn?: string | null;
    checkOut?: string | null;
    workHours?: number | null;
    note?: string | null;
  } | null;
  /** Called when the popover requests to close (backdrop click, ESC, etc.). */
  onClose: () => void;
  /** Optional handler for the "Lihat Detail" action button. */
  onLihatDetail?: () => void;
  /** Optional handler for the "Ajukan Koreksi" action button. */
  onAjukanKoreksi?: () => void;
  /** Optional handler for the "Tambah Catatan" action button. */
  onTambahCatatan?: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Indonesian long-form date formatter (e.g. `5 Mei 2026`). Constructed
 * once at module scope so each render reuses the same instance.
 */
const DATE_FORMATTER_ID = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Format a `yyyy-MM-dd` ISO date as a long Indonesian date. Uses local-time
 * `Date` construction (year, month-1, day) so the output is independent of
 * the host timezone — important because the input string is calendar-local
 * by design and not a UTC instant.
 */
function formatDateIdLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DATE_FORMATTER_ID.format(new Date(y, m - 1, d));
}

/**
 * Format `workHours` as `8,5 jam` (Indonesian decimal comma, one fractional
 * digit). Returns `'—'` for null/undefined inputs so the calling JSX can
 * uniformly render placeholders.
 */
function formatWorkHours(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(1).replace('.', ',')} jam`;
}

/**
 * Compact `key: value` row used for Masuk / Pulang / Jam kerja / Catatan.
 * Pulled out so the four rows render with identical typography.
 */
function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline">
      <Typography
        component="span"
        sx={{
          fontSize: 12,
          color: tokens.text.secondary,
          minWidth: 80,
        }}
      >
        {label}
      </Typography>
      <Typography
        component="span"
        sx={{ fontSize: 13, color: tokens.text.primary }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CellDetailPopover(
  props: CellDetailPopoverProps,
): React.ReactElement | null {
  const {
    open,
    anchorEl,
    detail,
    onClose,
    onLihatDetail,
    onAjukanKoreksi,
    onTambahCatatan,
  } = props;

  // Explicit ESC handler — registered only while `open`. MUI also closes on
  // ESC, but the explicit listener satisfies requirement 8.7 and keeps the
  // path observable in unit tests that bypass MUI's modal manager.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (detail === null) return null;

  const { employeeName, date, status, checkIn, checkOut, workHours, note } =
    detail;

  const statusLabel =
    status !== null ? attendanceStatusToLabel(status) : null;
  const statusColor = status !== null ? getStatusColor(status) : null;

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: `${tokens.radius.popover}px`,
            backgroundColor: tokens.bg.elevated,
            border: `1px solid ${tokens.border.subtle}`,
            color: tokens.text.primary,
          },
        },
      }}
    >
      <Box
        sx={{
          p: 2,
          minWidth: 280,
          maxWidth: 360,
          color: tokens.text.primary,
          backgroundColor: tokens.bg.elevated,
        }}
      >
        <Stack spacing={1.5}>
          {/* Header — name + date */}
          <Box>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: tokens.text.primary,
                lineHeight: 1.25,
              }}
            >
              {employeeName}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontSize: 12,
                color: tokens.text.secondary,
              }}
            >
              {formatDateIdLong(date)}
            </Typography>
          </Box>

          {/* Status chip */}
          <Box>
            {statusLabel !== null && statusColor !== null ? (
              <Chip
                size="small"
                label={statusLabel}
                sx={{
                  backgroundColor: `${statusColor}26`, // ~15% tint
                  color: statusColor,
                  border: `1px solid ${statusColor}`,
                  fontWeight: 600,
                  height: 22,
                }}
              />
            ) : (
              <Typography
                component="span"
                sx={{ fontSize: 13, color: tokens.text.muted }}
              >
                —
              </Typography>
            )}
          </Box>

          {/* Detail rows */}
          <Stack spacing={0.75}>
            <DetailRow label="Masuk" value={checkIn ?? '—'} />
            <DetailRow label="Pulang" value={checkOut ?? '—'} />
            <DetailRow
              label="Jam kerja"
              value={formatWorkHours(workHours)}
            />
            <DetailRow label="Catatan" value={note ?? '—'} />
          </Stack>

          {/* Action buttons */}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              size="small"
              onClick={onLihatDetail}
              sx={{
                borderColor: tokens.border.subtle,
                color: tokens.text.primary,
              }}
            >
              Lihat Detail
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onAjukanKoreksi}
              sx={{
                borderColor: tokens.border.subtle,
                color: tokens.text.primary,
              }}
            >
              Ajukan Koreksi
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onTambahCatatan}
              sx={{
                borderColor: tokens.border.subtle,
                color: tokens.text.primary,
              }}
            >
              Tambah Catatan
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Popover>
  );
}

export default CellDetailPopover;
