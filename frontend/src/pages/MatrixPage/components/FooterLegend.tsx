/**
 * FooterLegend — stateless presentational footer that sits below the
 * Matrix_Table inside Main_Workspace.
 *
 * Layout (left → right):
 *   1. Six legend chips, one per AttendanceStatus, in fixed order:
 *        present, alpha, leave, sick, late, off.
 *      Each chip = 8×8 px filled circle (color from getStatusColor) +
 *      Indonesian label (attendanceStatusToLabel, 12 px secondary text).
 *   2. Vertical divider (1 px × 16 px, tokens.border.subtle).
 *   3. Italic hint "Klik sel untuk lihat detail" (12 px, muted).
 *   4. Flex spacer.
 *   5. Right-aligned "Terakhir diperbarui: {timestamp}" where timestamp is
 *      formatted with `Intl.DateTimeFormat('id-ID', …)`. When `lastUpdated`
 *      is `null`, the timestamp slot renders an em-dash "—".
 *
 * Pure presentational module: no hooks, no DOM listeners, no derived state
 * beyond formatting `lastUpdated`.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import * as React from 'react';
import { Box, Stack, Typography, Divider } from '@mui/material';

import { tokens } from '../tokens';
import {
  attendanceStatusToLabel,
  getStatusColor,
} from '../domain/statusMapping';
import type { AttendanceStatus } from '../types';

// ─── Closed list of statuses rendered as legend chips ──────────────────────

/**
 * Legend chip render order. This is intentionally a literal tuple so
 * downstream changes to `AttendanceStatus` surface a TypeScript error if
 * the union and the legend drift apart.
 */
const STATUSES: AttendanceStatus[] = [
  'present',
  'alpha',
  'leave',
  'sick',
  'late',
  'off',
];

// ─── Date formatting ───────────────────────────────────────────────────────

/**
 * `Intl.DateTimeFormat` configured per the design's "Terakhir diperbarui"
 * spec: 2-digit day, short month, numeric year, 2-digit hour and minute,
 * locale `id-ID`. Constructed once at module load (no per-render cost).
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

export interface FooterLegendProps {
  /**
   * Timestamp of the most recent successful data fetch, or `null` when no
   * fetch has completed yet. When `null`, the timestamp slot renders "—".
   */
  lastUpdated: Date | null;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function FooterLegend(props: FooterLegendProps): React.ReactElement {
  const { lastUpdated } = props;

  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        height: 40,
        px: '12px',
        backgroundColor: tokens.bg.surface,
        borderTop: `1px solid ${tokens.border.subtle}`,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        {STATUSES.map((status) => (
          <Stack
            key={status}
            direction="row"
            spacing={0.75}
            alignItems="center"
          >
            <Box
              aria-hidden
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: getStatusColor(status),
                flexShrink: 0,
              }}
            />
            <Typography
              component="span"
              sx={{
                fontSize: 12,
                color: tokens.text.secondary,
                lineHeight: 1,
              }}
            >
              {attendanceStatusToLabel(status)}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Divider
        orientation="vertical"
        flexItem
        sx={{
          mx: 2,
          height: 16,
          alignSelf: 'center',
          borderColor: tokens.border.subtle,
        }}
      />

      <Typography
        component="span"
        sx={{
          fontStyle: 'italic',
          fontSize: 12,
          color: tokens.text.muted,
          lineHeight: 1,
        }}
      >
        Klik sel untuk lihat detail
      </Typography>

      <Box sx={{ flexGrow: 1 }} />

      <Typography
        component="span"
        sx={{
          fontSize: 12,
          color: tokens.text.muted,
          lineHeight: 1,
          textAlign: 'right',
        }}
      >
        {`Terakhir diperbarui: ${formatLastUpdated(lastUpdated)}`}
      </Typography>
    </Box>
  );
}

export default FooterLegend;
