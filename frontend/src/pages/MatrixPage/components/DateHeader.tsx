/**
 * DateHeader — column header strip for the Matrix Table.
 *
 * Stateless presentational component that renders one cell per `DayMeta`,
 * showing the day-of-month number on top and the 3-character Indonesian
 * weekday short name underneath (e.g. `1 / Jum`).
 *
 * Coloring rules:
 * - Saturday day-numbers use `tokens.weekend.saturdayText` (#60A5FA).
 * - Sunday day-numbers use `tokens.weekend.sundayText` (#F87171).
 * - Other day-numbers use `tokens.text.primary`.
 * - Weekday short labels always use `tokens.text.secondary`.
 *
 * Background rules (priority order):
 * 1. If `day.date === hoveredDate` → rgba(255,255,255,0.08) for column-highlight mirroring.
 * 2. Else if `day.isSaturday` → `tokens.weekend.saturdayTint`.
 * 3. Else if `day.isSunday` → `tokens.weekend.sundayTint`.
 * 4. Else → transparent.
 *
 * Sticky-top positioning is intentionally NOT applied here — `MatrixTable`
 * places this component inside a sticky container (`position: sticky; top: 0`)
 * so the header strip floats over scrolled rows.
 *
 * Layout: a flex row of fixed-width column cells. Width is driven by the
 * `cellWidth` prop (computed in pixels by `domain/layout.ts`), so the header
 * stays aligned with the cell grid regardless of breakpoint.
 *
 * Requirements: 5.6, 5.7, 5.8
 */
import { memo } from 'react';
import { Box, Stack, Typography } from '@mui/material';

import { tokens } from '../tokens';
import type { DayMeta } from '../types';

export interface DateHeaderProps {
  /** Calendar day metadata for the currently visible month. */
  days: DayMeta[];
  /** Per-cell pixel width (matches the matrix grid column width). */
  cellWidth: number;
  /**
   * Date string (`yyyy-MM-dd`) of the currently hovered column. When set,
   * the matching header cell gets a brighter highlight so the user keeps
   * column context while scanning the grid.
   */
  hoveredDate?: string | null;
}

function resolveBackground(day: DayMeta, hoveredDate: string | null | undefined): string {
  if (hoveredDate && day.date === hoveredDate) {
    return 'rgba(255,255,255,0.08)';
  }
  if (day.isSaturday) return tokens.weekend.saturdayTint;
  if (day.isSunday) return tokens.weekend.sundayTint;
  return 'transparent';
}

function resolveDayNumberColor(day: DayMeta): string {
  if (day.isSaturday) return tokens.weekend.saturdayText;
  if (day.isSunday) return tokens.weekend.sundayText;
  return tokens.text.primary;
}

function DateHeaderImpl(props: DateHeaderProps): React.ReactElement {
  const { days, cellWidth, hoveredDate = null } = props;

  return (
    <Box
      role="row"
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        width: '100%',
        backgroundColor: tokens.bg.surface,
      }}
    >
      {days.map((day) => (
        <Stack
          key={day.date}
          role="columnheader"
          aria-label={`${day.day} ${day.weekdayShort}`}
          alignItems="center"
          justifyContent="center"
          spacing={0.25}
          sx={{
            flex: `0 0 ${cellWidth}px`,
            width: `${cellWidth}px`,
            height: 56,
            py: 1,
            textAlign: 'center',
            backgroundColor: resolveBackground(day, hoveredDate),
            borderBottom: `1px solid ${tokens.border.subtle}`,
            transition: 'background-color 120ms ease-out',
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.1,
              color: resolveDayNumberColor(day),
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
              textTransform: 'none',
            }}
          >
            {day.weekdayShort}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}

/**
 * Memoized export. Re-renders only when `days`, `cellWidth`, or
 * `hoveredDate` change — the parent `MatrixTable` is responsible for
 * passing stable references.
 */
export const DateHeader = memo(DateHeaderImpl);
DateHeader.displayName = 'DateHeader';

export default DateHeader;
