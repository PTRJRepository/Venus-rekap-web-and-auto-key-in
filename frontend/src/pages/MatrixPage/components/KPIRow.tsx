/**
 * KPIRow — container component for the six KPI tiles plus the "Ekspor" button.
 *
 * Visual structure (per design.md, Section "Components and Interfaces"):
 *  - Flex row of `<KPICard>` instances rendered in a fixed order
 *    (Total Karyawan, Rata-rata Kehadiran, Alfa, Izin/Cuti, Terlambat, Sakit).
 *  - Trailing MUI `<Button variant="contained">` "Ekspor" with download icon,
 *    height-matched to the KPI cards (100 px).
 *  - When `exportEnabled` is false the button is rendered disabled (req 4.13:
 *    export is unavailable while the export service is offline / data is
 *    loading).
 *
 * The component is intentionally stateless: it derives its visual content
 * entirely from the supplied `MonthlySummary` snapshot and forwards the
 * export click upwards via `onExportClick`. The percentage value is
 * formatted with one decimal using the Indonesian comma separator
 * (e.g. `94,3%`) per locale conventions used elsewhere on the page.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.12, 4.13, 16.4.
 */

import type { ReactElement } from 'react';
import { Box, Button, Stack } from '@mui/material';
import {
  AccessTimeRounded,
  DownloadRounded,
  ErrorRounded,
  FlightRounded,
  GroupsRounded,
  MedicalServicesRounded,
  TrendingUpRounded,
} from '@mui/icons-material';
import KPICard from './KPICard';
import { tokens } from '../tokens';
import type { MonthlySummary } from '../types';

export interface KPIRowProps {
  summary: MonthlySummary;
  exportEnabled: boolean;
  onExportClick: () => void;
}

/**
 * Format a 0..100 percentage value with one decimal place using the
 * Indonesian comma decimal separator (e.g. 94.3 → "94,3%"). Negative
 * and out-of-range values are passed through `toFixed` unchanged; the
 * caller is responsible for clamping if needed.
 */
function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export function KPIRow(props: KPIRowProps): ReactElement {
  const { summary, exportEnabled, onExportClick } = props;

  return (
    <Stack
      direction="row"
      spacing={0}
      sx={{
        gap: '12px',
        padding: '12px',
        width: '100%',
        alignItems: 'stretch',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <KPICard
          title="Total Karyawan"
          value={summary.totalEmployees}
          icon={<GroupsRounded fontSize="small" />}
          color={tokens.accent.green}
        />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <KPICard
          title="Rata-rata Kehadiran"
          value={formatPercent(summary.averageAttendancePercent)}
          icon={<TrendingUpRounded fontSize="small" />}
          color={tokens.accent.green}
        />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <KPICard
          title="Alfa"
          value={summary.alphaCount}
          icon={<ErrorRounded fontSize="small" />}
          color={tokens.accent.red}
        />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <KPICard
          title="Izin/Cuti"
          value={summary.leaveCount}
          icon={<FlightRounded fontSize="small" />}
          color={tokens.accent.purple}
        />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <KPICard
          title="Terlambat"
          value={summary.lateCount}
          icon={<AccessTimeRounded fontSize="small" />}
          color={tokens.accent.orange}
        />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <KPICard
          title="Sakit"
          value={summary.sickCount}
          icon={<MedicalServicesRounded fontSize="small" />}
          color={tokens.accent.cyan}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
        <Button
          variant="contained"
          startIcon={<DownloadRounded />}
          disabled={!exportEnabled}
          onClick={onExportClick}
          sx={{
            height: 100,
            minWidth: 120,
            borderRadius: `${tokens.radius.button}px`,
            textTransform: 'none',
            fontWeight: 600,
          }}
        >
          Ekspor
        </Button>
      </Box>
    </Stack>
  );
}

export default KPIRow;
