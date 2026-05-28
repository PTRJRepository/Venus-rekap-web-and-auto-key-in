/**
 * MatrixModeSelector — horizontal toggle for matrix display modes.
 * Renders above the matrix grid.
 */
import * as React from 'react';
import { Box, ToggleButton, ToggleButtonGroup, MenuItem, Select, Typography } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { tokens } from '../tokens';
import type { MatrixMode, HeatmapMetric } from '../domain/heatmap';

export interface MatrixModeSelectorProps {
  mode: MatrixMode;
  heatmapMetric: HeatmapMetric;
  onModeChange: (mode: MatrixMode) => void;
  onHeatmapMetricChange: (metric: HeatmapMetric) => void;
}

const MODE_LABELS: Record<MatrixMode, string> = {
  status: 'Status',
  work_hours: 'Jam Kerja',
  short_hours: 'Jam Kurang',
  overtime: 'Lembur',
  heatmap: 'Heatmap',
  recap: 'Rekap',
};

const HEATMAP_METRIC_LABELS: Record<HeatmapMetric, string> = {
  work_hours: 'Jam Kerja',
  short_hours: 'Jam Kurang',
  overtime: 'Lembur',
};

export function MatrixModeSelector(props: MatrixModeSelectorProps): React.ReactElement {
  const { mode, heatmapMetric, onModeChange, onHeatmapMetricChange } = props;

  const handleModeChange = (_: React.MouseEvent<HTMLElement>, newMode: string | null) => {
    if (newMode) onModeChange(newMode as MatrixMode);
  };

  const handleMetricChange = (event: SelectChangeEvent<string>) => {
    onHeatmapMetricChange(event.target.value as HeatmapMetric);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 1,
        py: 0.75,
      }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: tokens.text.muted, textTransform: 'uppercase' }}>
        Mode
      </Typography>
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={handleModeChange}
        size="small"
        sx={{
          '& .MuiToggleButton-root': {
            px: 1.5,
            py: 0.5,
            fontSize: 11,
            fontWeight: 600,
            color: tokens.text.secondary,
            borderColor: tokens.border.subtle,
            textTransform: 'none',
            '&.Mui-selected': {
              color: tokens.text.primary,
              backgroundColor: 'rgba(20,118,255,0.15)',
              borderColor: tokens.accent.blue,
            },
          },
        }}
      >
        {(Object.keys(MODE_LABELS) as MatrixMode[]).map((m) => (
          <ToggleButton key={m} value={m}>
            {MODE_LABELS[m]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {mode === 'heatmap' && (
        <Select
          size="small"
          value={heatmapMetric}
          onChange={handleMetricChange}
          sx={{
            width: 130,
            fontSize: 11,
            color: tokens.text.primary,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border.subtle },
            '& .MuiSvgIcon-root': { color: tokens.text.secondary },
          }}
        >
          {(Object.keys(HEATMAP_METRIC_LABELS) as HeatmapMetric[]).map((m) => (
            <MenuItem key={m} value={m} sx={{ fontSize: 12 }}>
              {HEATMAP_METRIC_LABELS[m]}
            </MenuItem>
          ))}
        </Select>
      )}
    </Box>
  );
}

export default MatrixModeSelector;
