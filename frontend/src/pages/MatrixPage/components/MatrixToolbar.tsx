/**
 * MatrixToolbar — Layer 2 toolbar (max 44px).
 *
 * Left:  mode selector (Status | Jam Kerja | Jam Kurang | Lembur | Heatmap | Rekap)
 *        + optional heatmap metric dropdown
 * Right: dept filter | sidebar toggle | KPI toggle | panel toggle | focus button
 */

import type { ReactElement } from 'react';
import {
  Box,
  IconButton,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import TableChartRounded from '@mui/icons-material/TableChartRounded';
import ViewSidebarRounded from '@mui/icons-material/ViewSidebarRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';

import { tokens } from '../tokens';
import type { HeatmapMetric, MatrixMode } from '../domain/heatmap';

export interface MatrixToolbarProps {
  matrixMode: MatrixMode;
  heatmapMetric: HeatmapMetric;
  onModeChange: (mode: MatrixMode) => void;
  onHeatmapMetricChange: (metric: HeatmapMetric) => void;

  departmentOptions: string[];
  selectedDepartment: string;
  onDepartmentChange: (dept: string) => void;

  sidebarMode: 'expanded' | 'collapsed' | 'hidden';
  onSetSidebarMode: (mode: 'expanded' | 'collapsed' | 'hidden') => void;

  kpiVisible: boolean;
  onToggleKpi: () => void;

  rightPanelVisible: boolean;
  onToggleRightPanel: () => void;

  isFocusMode: boolean;
  onFocusMode: () => void;

  /** App-level view mode: attendance | overtime | comparison */
  viewMode?: string;
  onViewModeChange?: (mode: string) => void;
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

export function MatrixToolbar(props: MatrixToolbarProps): ReactElement {
  const {
    matrixMode,
    heatmapMetric,
    onModeChange,
    onHeatmapMetricChange,
    departmentOptions,
    selectedDepartment,
    onDepartmentChange,
    sidebarMode,
    onSetSidebarMode,
    kpiVisible,
    onToggleKpi,
    rightPanelVisible,
    onToggleRightPanel,
    isFocusMode,
    onFocusMode,
    viewMode,
    onViewModeChange,
  } = props;

  const handleDeptChange = (e: SelectChangeEvent<string>): void => {
    onDepartmentChange(e.target.value);
  };

  const sidebarIcon = sidebarMode === 'hidden'
    ? <DashboardRounded sx={{ fontSize: 16 }} />
    : <TableChartRounded sx={{ fontSize: 16 }} />;

  const sidebarTooltip = sidebarMode === 'hidden'
    ? 'Tampilkan sidebar'
    : sidebarMode === 'expanded'
    ? 'Sembunyikan sidebar'
    : 'Tampilkan sidebar';

  const handleSidebarToggle = (): void => {
    if (sidebarMode === 'hidden') {
      onSetSidebarMode('expanded');
    } else {
      onSetSidebarMode('hidden');
    }
  };

  const compactSelectSx = {
    fontSize: 11,
    color: tokens.text.primary,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border.subtle },
    '& .MuiSvgIcon-root': { color: tokens.text.secondary },
    '& .MuiSelect-select': { py: '3px', pr: '24px !important' },
  };

  const iconBtnSx = (active: boolean, activeColor?: string) => ({
    color: active ? (activeColor ?? tokens.accent.blue) : tokens.text.secondary,
    backgroundColor: active ? `${activeColor ?? tokens.accent.blue}18` : 'transparent',
    borderRadius: '6px',
    padding: '4px',
    '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
        px: 2,
        height: 44,
        minHeight: 44,
        maxHeight: 44,
        width: '100%',
        backgroundColor: tokens.bg.surface,
        borderBottom: `1px solid ${tokens.border.subtle}`,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {/* App-level view mode: Presence | Overtime | Komparasi */}
      {viewMode !== undefined && onViewModeChange && (
        <>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => { if (v) onViewModeChange(v); }}
            size="small"
            sx={{
              flexShrink: 0,
              '& .MuiToggleButton-root': {
                px: 1.25,
                py: '3px',
                fontSize: 11,
                fontWeight: 700,
                color: tokens.text.secondary,
                borderColor: tokens.border.subtle,
                textTransform: 'none',
                lineHeight: 1.5,
                '&.Mui-selected': {
                  color: '#fff',
                  backgroundColor: 'rgba(20,118,255,0.7)',
                  borderColor: '#1476FF',
                },
              },
            }}
          >
            <ToggleButton value="attendance">Presence</ToggleButton>
            <ToggleButton value="overtime">Overtime</ToggleButton>
            <ToggleButton value="comparison">Komparasi</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ width: 1, height: 24, backgroundColor: tokens.border.subtle, flexShrink: 0 }} />
        </>
      )}

      {/* Matrix display mode selector */}
      <ToggleButtonGroup
        value={matrixMode}
        exclusive
        onChange={(_, v) => { if (v) onModeChange(v as MatrixMode); }}
        size="small"
        sx={{
          flexShrink: 0,
          '& .MuiToggleButton-root': {
            px: 1,
            py: '3px',
            fontSize: 11,
            fontWeight: 600,
            color: tokens.text.secondary,
            borderColor: tokens.border.subtle,
            textTransform: 'none',
            lineHeight: 1.5,
            '&.Mui-selected': {
              color: tokens.text.primary,
              backgroundColor: 'rgba(20,118,255,0.15)',
              borderColor: '#1476FF',
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

      {/* Heatmap metric — only when heatmap mode active */}
      {matrixMode === 'heatmap' && (
        <Select
          size="small"
          value={heatmapMetric}
          onChange={(e) => onHeatmapMetricChange(e.target.value as HeatmapMetric)}
          sx={{ width: 110, ...compactSelectSx }}
        >
          {(Object.keys(HEATMAP_METRIC_LABELS) as HeatmapMetric[]).map((m) => (
            <MenuItem key={m} value={m} sx={{ fontSize: 11 }}>
              {HEATMAP_METRIC_LABELS[m]}
            </MenuItem>
          ))}
        </Select>
      )}

      <Box sx={{ flexGrow: 1 }} />

      {/* Right controls */}
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
        {/* Dept filter */}
        {departmentOptions.length > 0 && (
          <Select
            size="small"
            value={selectedDepartment}
            onChange={handleDeptChange}
            displayEmpty
            sx={{ width: 120, ...compactSelectSx }}
            renderValue={(v) => (
              <Typography sx={{ fontSize: 11, color: tokens.text.primary }}>
                {v === 'all' || !v ? 'Semua Dept' : v}
              </Typography>
            )}
          >
            <MenuItem value="all" sx={{ fontSize: 11 }}>Semua Dept</MenuItem>
            {departmentOptions.map((d) => (
              <MenuItem key={d} value={d} sx={{ fontSize: 11 }}>{d}</MenuItem>
            ))}
          </Select>
        )}

        {/* Sidebar toggle */}
        <Tooltip title={sidebarTooltip}>
          <IconButton
            size="small"
            aria-label={sidebarTooltip}
            onClick={handleSidebarToggle}
            sx={iconBtnSx(sidebarMode !== 'hidden')}
          >
            {sidebarIcon}
          </IconButton>
        </Tooltip>

        {/* KPI toggle */}
        <Tooltip title={kpiVisible ? 'Sembunyikan KPI' : 'Tampilkan KPI'}>
          <IconButton
            size="small"
            aria-label={kpiVisible ? 'Sembunyikan KPI' : 'Tampilkan KPI'}
            onClick={onToggleKpi}
            sx={iconBtnSx(kpiVisible)}
          >
            {kpiVisible
              ? <VisibilityRounded sx={{ fontSize: 16 }} />
              : <VisibilityOffRounded sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>

        {/* Right panel toggle */}
        <Tooltip title={rightPanelVisible ? 'Sembunyikan panel' : 'Tampilkan panel'}>
          <IconButton
            size="small"
            aria-label={rightPanelVisible ? 'Sembunyikan panel' : 'Tampilkan panel'}
            onClick={onToggleRightPanel}
            sx={iconBtnSx(rightPanelVisible)}
          >
            <ViewSidebarRounded sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Focus mode */}
        <Tooltip title={isFocusMode ? 'Keluar Fokus' : 'Fokus Matrix'}>
          <IconButton
            size="small"
            aria-label={isFocusMode ? 'Keluar mode fokus' : 'Masuk mode fokus'}
            onClick={onFocusMode}
            sx={iconBtnSx(isFocusMode, tokens.accent.cyan)}
          >
            {isFocusMode
              ? <FullscreenExitRounded sx={{ fontSize: 16 }} />
              : <FullscreenRounded sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

export default MatrixToolbar;
