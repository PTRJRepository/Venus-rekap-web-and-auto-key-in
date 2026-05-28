/**
 * SummaryColumns — sticky-right per-employee summary columns in the matrix.
 * Displays: H, A, I/C, S, T, Jam, Kurang, OT, % Hadir
 */
import * as React from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../tokens';
import type { EmployeeSummaryRow } from '../domain/employeeSummary';

export interface SummaryColumnsProps {
  summaries: Map<string, EmployeeSummaryRow>;
  employeeIds: string[];
  cellHeight: number;
}

const COLUMNS = [
  { key: 'H', field: 'presentCount', width: 34 },
  { key: 'A', field: 'alphaCount', width: 34 },
  { key: 'I/C', field: 'leaveCount', width: 34 },
  { key: 'S', field: 'sickCount', width: 34 },
  { key: 'T', field: 'lateCount', width: 34 },
  { key: 'Jam', field: 'totalWorkHours', width: 50 },
  { key: 'Kurang', field: 'totalShortHours', width: 50 },
  { key: 'OT', field: 'totalOvertimeHours', width: 50 },
  { key: '%', field: 'attendancePercent', width: 44 },
] as const;

export const SUMMARY_TOTAL_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

function getValueColor(field: string, value: number): string {
  if (field === 'alphaCount' && value > 0) return tokens.accent.red;
  if (field === 'totalShortHours' && value > 0) return tokens.accent.orange;
  if (field === 'totalOvertimeHours' && value > 0) return tokens.accent.cyan;
  if (field === 'attendancePercent') {
    if (value >= 90) return tokens.accent.green;
    if (value >= 75) return tokens.accent.orange;
    return tokens.accent.red;
  }
  return tokens.text.secondary;
}

export function SummaryColumnsHeader(): React.ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: 56,
        backgroundColor: tokens.summary.bg,
        borderLeft: `1px solid ${tokens.summary.border}`,
        borderBottom: `1px solid ${tokens.header.borderBottom}`,
        position: 'sticky',
        top: 0,
        right: 0,
        zIndex: 30,
      }}
    >
      {COLUMNS.map((col) => (
        <Box
          key={col.key}
          sx={{
            width: col.width,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              color: tokens.text.muted,
              textAlign: 'center',
              lineHeight: 1.1,
            }}
          >
            {col.key}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export function SummaryColumnsRow(props: {
  employeeId: string;
  summary: EmployeeSummaryRow | undefined;
  cellHeight: number;
}): React.ReactElement {
  const { summary, cellHeight } = props;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: cellHeight,
        backgroundColor: tokens.summary.bg,
        borderLeft: `1px solid ${tokens.summary.border}`,
        borderBottom: `1px solid ${tokens.border.cell}`,
      }}
    >
      {COLUMNS.map((col) => {
        const value = summary ? summary[col.field as keyof EmployeeSummaryRow] as number : 0;
        const display = col.field === 'attendancePercent' ? `${value}` : (value === 0 ? '-' : String(value));
        return (
          <Box
            key={col.key}
            sx={{
              width: col.width,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
                color: getValueColor(col.field, value),
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              }}
            >
              {display}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export const SummaryColumns = React.memo(SummaryColumnsRow);
SummaryColumns.displayName = 'SummaryColumns';
