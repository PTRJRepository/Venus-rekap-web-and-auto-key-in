/**
 * DateHeader — column header strip for the Matrix Table.
 *
 * Renders one cell per DayMeta showing day-of-month number and weekday short.
 * Solid opaque background, strong border, weekend solid colors, today highlight.
 */
import { memo } from 'react';
import { Box, Stack, Typography } from '@mui/material';

import { tokens } from '../tokens';
import type { DayMeta } from '../types';

export interface DateHeaderProps {
  days: DayMeta[];
  cellWidth: number;
  hoveredDate?: string | null;
  todayDate?: string | null;
}

function resolveBackground(day: DayMeta, hoveredDate: string | null | undefined, todayDate: string | null | undefined): string {
  if (hoveredDate && day.date === hoveredDate) {
    return 'rgba(255,255,255,0.12)';
  }
  if (todayDate && day.date === todayDate) return tokens.today.headerBg;
  if (day.isSaturday) return tokens.weekend.saturdayHeaderBg;
  if (day.isSunday) return tokens.weekend.sundayHeaderBg;
  return tokens.bg.surface;
}

function resolveDayNumberColor(day: DayMeta): string {
  if (day.isSaturday) return tokens.weekend.saturdayText;
  if (day.isSunday) return tokens.weekend.sundayText;
  return tokens.text.primary;
}

function resolveBorderTop(day: DayMeta): string {
  if (day.isSaturday) return `2px solid ${tokens.weekend.saturdayHeaderBorder}`;
  if (day.isSunday) return `2px solid ${tokens.weekend.sundayHeaderBorder}`;
  return '2px solid transparent';
}

function DateHeaderImpl(props: DateHeaderProps): React.ReactElement {
  const { days, cellWidth, hoveredDate = null, todayDate = null } = props;

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
            backgroundColor: resolveBackground(day, hoveredDate, todayDate),
            borderTop: resolveBorderTop(day),
            borderBottom: `1px solid ${tokens.header.borderBottom}`,
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

export const DateHeader = memo(DateHeaderImpl);
DateHeader.displayName = 'DateHeader';

export default DateHeader;
