/**
 * KPIRow — compact strip (max 48px) replacing the tall 100px card layout.
 *
 * Each KPI is an inline chip: colored dot + label + bold value.
 * Export button is compact (icon + text, same row height).
 * Visibility is controlled by the parent via kpiVisible / onToggleKpi.
 */

import type { ReactElement } from 'react';
import { Box, Button, Divider, Stack, Tooltip, Typography } from '@mui/material';
import {
  AccessTimeRounded,
  DownloadRounded,
  ErrorRounded,
  FlightRounded,
  GroupsRounded,
  MedicalServicesRounded,
  TrendingUpRounded,
} from '@mui/icons-material';
import { tokens } from '../tokens';
import type { MonthlySummary } from '../types';

export interface KPIRowProps {
  summary: MonthlySummary;
  exportEnabled: boolean;
  onExportClick: () => void;
}

interface KPIChipProps {
  label: string;
  value: string | number;
  color: string;
  icon: ReactElement;
  tooltip?: string;
}

function KPIChip({ label, value, color, icon, tooltip }: KPIChipProps): ReactElement {
  const chip = (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      sx={{
        px: 1.25,
        py: '5px',
        borderRadius: '6px',
        backgroundColor: `${color}12`,
        border: `1px solid ${color}28`,
        cursor: 'default',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <Box sx={{ color, display: 'flex', alignItems: 'center' }}>
        {/* clone icon at 14px */}
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: 11,
          color: tokens.text.secondary,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: tokens.text.primary,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </Typography>
    </Stack>
  );

  return tooltip ? <Tooltip title={tooltip}>{chip}</Tooltip> : chip;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export function KPIRow(props: KPIRowProps): ReactElement {
  const { summary, exportEnabled, onExportClick } = props;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
        px: 2,
        height: 48,
        minHeight: 48,
        maxHeight: 48,
        width: '100%',
        backgroundColor: tokens.bg.surface,
        borderBottom: `1px solid ${tokens.border.subtle}`,
        boxSizing: 'border-box',
        flexShrink: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        '&::-webkit-scrollbar': { height: 3 },
        '&::-webkit-scrollbar-thumb': { background: tokens.border.subtle, borderRadius: 2 },
      }}
    >
      <KPIChip
        label="Total"
        value={summary.totalEmployees}
        color={tokens.accent.green}
        icon={<GroupsRounded sx={{ fontSize: 14 }} />}
        tooltip="Total Karyawan"
      />

      <KPIChip
        label="Hadir"
        value={formatPercent(summary.averageAttendancePercent)}
        color={tokens.accent.green}
        icon={<TrendingUpRounded sx={{ fontSize: 14 }} />}
        tooltip="Rata-rata Kehadiran"
      />

      <KPIChip
        label="Alfa"
        value={summary.alphaCount}
        color={tokens.accent.red}
        icon={<ErrorRounded sx={{ fontSize: 14 }} />}
        tooltip="Jumlah Alfa"
      />

      <KPIChip
        label="Izin/Cuti"
        value={summary.leaveCount}
        color={tokens.accent.purple}
        icon={<FlightRounded sx={{ fontSize: 14 }} />}
        tooltip="Izin dan Cuti"
      />

      <KPIChip
        label="Terlambat"
        value={summary.lateCount}
        color={tokens.accent.orange}
        icon={<AccessTimeRounded sx={{ fontSize: 14 }} />}
        tooltip="Jumlah Terlambat"
      />

      <KPIChip
        label="Sakit"
        value={summary.sickCount}
        color={tokens.accent.cyan}
        icon={<MedicalServicesRounded sx={{ fontSize: 14 }} />}
        tooltip="Jumlah Sakit"
      />

      <Box sx={{ flexGrow: 1 }} />

      <Divider orientation="vertical" flexItem sx={{ borderColor: tokens.border.subtle, mx: 0.5 }} />

      <Button
        variant="outlined"
        size="small"
        startIcon={<DownloadRounded sx={{ fontSize: 14 }} />}
        disabled={!exportEnabled}
        onClick={onExportClick}
        sx={{
          borderColor: tokens.border.subtle,
          color: tokens.text.secondary,
          fontSize: 11,
          py: '4px',
          px: 1.25,
          minWidth: 0,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          textTransform: 'none',
          '&:hover': {
            borderColor: tokens.accent.blue,
            color: tokens.text.primary,
            backgroundColor: 'rgba(20,118,255,0.08)',
          },
          '&.Mui-disabled': {
            borderColor: tokens.border.subtle,
            color: tokens.text.muted,
          },
        }}
      >
        Ekspor
      </Button>
    </Box>
  );
}

export default KPIRow;
