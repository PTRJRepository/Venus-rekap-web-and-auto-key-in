/**
 * DonutSummary — small SVG donut chart + legend rendered inside the
 * Right_Insight_Panel "Ringkasan Bulan Ini" section.
 *
 * Visual structure (per design.md and tasks.md §8.6):
 *  - Five-slice SVG donut (140×140 px) covering the visible attendance
 *    categories: present, alpha, leave, sick, late. The `off` (Day Off)
 *    category is intentionally excluded from the donut per design — it
 *    represents non-working days and would skew the share visualization.
 *  - Each slice is drawn as a `<circle>` with `strokeDasharray` /
 *    `strokeDashoffset` cumulative-length arithmetic; no chart library
 *    is used so the panel stays dependency-free.
 *  - A subtitle in the donut center reads "Bulan Ini" so the chart
 *    self-identifies even when read in isolation.
 *  - A vertical legend below the donut renders one row per category with
 *    a colored swatch (8 px circle), the Indonesian label, the
 *    percentage (one decimal, comma decimal separator per id-ID), and
 *    the integer count.
 *
 * Pure presentational module: no hooks, no side effects, no derived
 * state beyond the per-render arc / percentage computations.
 *
 * Requirements: 9.1, 9.2.
 */

import * as React from 'react';
import { Box, Stack, Typography } from '@mui/material';

import { tokens } from '../tokens';
import {
  attendanceStatusToLabel,
  getStatusColor,
} from '../domain/statusMapping';
import type { AttendanceStatus, MonthlySummary } from '../types';

// ─── Closed list of statuses rendered in the donut + legend ────────────────

/**
 * Render order for both the donut slices (clockwise from 12 o'clock) and
 * the legend rows beneath. `off` is excluded by design — non-working
 * days are not part of the "kehadiran" share.
 */
const VISIBLE_STATUSES: ReadonlyArray<AttendanceStatus> = [
  'present',
  'alpha',
  'leave',
  'sick',
  'late',
];

// ─── SVG geometry constants ────────────────────────────────────────────────

const SVG_SIZE = 140;
const CENTER = SVG_SIZE / 2; // 70
const RADIUS = 50;
const STROKE_WIDTH = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Format a percentage with one decimal and `id-ID` comma decimal
 * separator (e.g. `95.2 → "95,2%"`). Total over the non-negative reals.
 *
 * Exposed at module scope (rather than inlined) so the same formatting
 * stays consistent if the legend is later reused elsewhere.
 */
function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

interface Arc {
  /** Negative offset along the circumference (slice start). */
  offset: number;
  /** Arc length in user units (a fraction of `CIRCUMFERENCE`). */
  length: number;
}

/**
 * Convert a vector of non-negative counts into the cumulative
 * `(offset, length)` pairs consumed by each slice's `strokeDasharray` /
 * `strokeDashoffset`. When `total` is 0 the function returns zero-length
 * arcs so the SVG renders only the background ring.
 */
function computeArcs(values: ReadonlyArray<number>): Arc[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return values.map(() => ({ offset: 0, length: 0 }));
  }
  let cumulative = 0;
  return values.map((v) => {
    const length = (v / total) * CIRCUMFERENCE;
    const offset = -cumulative;
    cumulative += length;
    return { offset, length };
  });
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface DonutSummaryProps {
  /**
   * Aggregated counts for the visible month. Only the 5 visible category
   * counts are read — `offCount` and the `totalEmployees` /
   * `averageAttendancePercent` slots are unused here.
   */
  summary: MonthlySummary;
}

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * Render the donut + legend pair. Renders a fully visible, neutral
 * background ring even when `total === 0` so the chart never collapses
 * to an empty SVG region.
 */
export function DonutSummary(props: DonutSummaryProps): React.ReactElement {
  const { summary } = props;

  // Per-status count vector aligned to `VISIBLE_STATUSES`.
  const counts: number[] = [
    summary.presentCount,
    summary.alphaCount,
    summary.leaveCount,
    summary.sickCount,
    summary.lateCount,
  ];

  const total = counts.reduce((sum, v) => sum + v, 0);
  const arcs = computeArcs(counts);

  return (
    <Stack direction="column" spacing={1.5} alignItems="stretch">
      {/* ─── Donut SVG ─────────────────────────────────────────────── */}
      <Box
        sx={{
          position: 'relative',
          width: SVG_SIZE,
          height: SVG_SIZE,
          alignSelf: 'center',
        }}
      >
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          role="img"
          aria-label="Ringkasan kehadiran bulan ini"
        >
          {/* Background ring — drawn under the slices so empty data
              still produces a visible donut shape. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={tokens.border.subtle}
            strokeWidth={STROKE_WIDTH}
          />

          {/* Per-status slices. Rotated -90° around center so the first
              slice begins at 12 o'clock and grows clockwise. */}
          {VISIBLE_STATUSES.map((status, index) => {
            const arc = arcs[index];
            if (arc.length <= 0) return null;
            return (
              <circle
                key={status}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={getStatusColor(status)}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE}`}
                strokeDashoffset={arc.offset}
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
              />
            );
          })}
        </svg>

        {/* Center label — absolute-positioned over the SVG so the text
            stays crisp regardless of viewBox scaling. */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 1.1,
              color: tokens.text.primary,
            }}
          >
            {total}
          </Typography>
          <Typography
            component="span"
            sx={{
              fontSize: 11,
              color: tokens.text.muted,
              lineHeight: 1.2,
              mt: 0.25,
            }}
          >
            Bulan Ini
          </Typography>
        </Box>
      </Box>

      {/* ─── Legend ────────────────────────────────────────────────── */}
      <Stack direction="column" spacing={0.75}>
        {VISIBLE_STATUSES.map((status, index) => {
          const count = counts[index];
          const percent = total > 0 ? (count / total) * 100 : 0;
          return (
            <Stack
              key={status}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ width: '100%' }}
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
                  flexGrow: 1,
                  lineHeight: 1.2,
                }}
              >
                {attendanceStatusToLabel(status)}
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontSize: 12,
                  color: tokens.text.secondary,
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 48,
                  textAlign: 'right',
                  lineHeight: 1.2,
                }}
              >
                {formatPercent(percent)}
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontSize: 12,
                  color: tokens.text.primary,
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 32,
                  textAlign: 'right',
                  lineHeight: 1.2,
                }}
              >
                {count}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}

export default DonutSummary;
