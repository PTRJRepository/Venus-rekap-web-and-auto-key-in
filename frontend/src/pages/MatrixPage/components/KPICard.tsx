/**
 * KPICard — stateless KPI summary tile used by `KPIRow`.
 *
 * Visual structure (per design.md, Section "Components and Interfaces"):
 *  - Top row: title (left) + small circular icon badge (right).
 *  - Main row: large numeric/string value.
 *  - Bottom row: optional subtitle (e.g. delta percentage) and optional
 *    inline mini sparkline drawn with raw SVG (no chart library).
 *
 * The icon badge background is the `color` token mixed with ~12% opacity
 * (rendered as `${color}20`), and the icon itself is colored with the
 * full `color`. This keeps the tile palette aligned with the matrix's
 * accent system (green / red / orange / cyan / purple / blue) without
 * introducing per-card tint logic.
 *
 * The component is intentionally stateless and free of side effects, so
 * it can be unit-tested with a plain `render()` call.
 *
 * Requirements: 4.9, 4.10, 4.11, 15.2.
 */

import type { ReactElement, ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { tokens } from '../tokens';

export interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  /**
   * Token color (e.g. `tokens.accent.green`) used for the icon badge tint
   * and the sparkline stroke. The badge background is `${color}20` (12%
   * opacity) and the icon foreground is the full color value.
   */
  color: string;
  /**
   * Optional numeric series rendered as a small inline sparkline at the
   * bottom of the tile. When omitted (or shorter than 2 points), no SVG
   * is rendered.
   */
  sparkline?: number[];
}

/**
 * Inline mini sparkline (60×16) rendered with a single SVG `<polyline>`.
 * Returns `null` for series with fewer than 2 points (no visual signal).
 */
function MiniSparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}): ReactElement | null {
  if (data.length < 2) return null;

  const w = 60;
  const h = 16;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="sparkline"
    >
      <polyline
        points={points}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
      />
    </svg>
  );
}

export function KPICard(props: KPICardProps): ReactElement {
  const { title, value, subtitle, icon, color, sparkline } = props;
  const hasSparkline = Array.isArray(sparkline) && sparkline.length >= 2;

  return (
    <Paper
      elevation={0}
      sx={{
        backgroundColor: 'rgba(255,255,255,0.045)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: `${tokens.radius.card}px`,
        padding: 2,
        height: 100,
        minWidth: 140,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography
          variant="body2"
          sx={{
            fontSize: 12,
            lineHeight: 1.2,
            color: tokens.text.secondary,
            fontWeight: 500,
          }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: `${color}20`,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      </Stack>

      <Box>
        <Typography
          variant="h4"
          sx={{
            fontSize: 24,
            lineHeight: 1.1,
            fontWeight: 600,
            color: tokens.text.primary,
          }}
        >
          {value}
        </Typography>
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        {subtitle ? (
          <Typography
            variant="body2"
            sx={{
              fontSize: 11,
              lineHeight: 1.2,
              color: tokens.text.secondary,
            }}
          >
            {subtitle}
          </Typography>
        ) : (
          <Box />
        )}
        {hasSparkline ? (
          <MiniSparkline data={sparkline!} color={color} />
        ) : null}
      </Stack>
    </Paper>
  );
}

export default KPICard;
