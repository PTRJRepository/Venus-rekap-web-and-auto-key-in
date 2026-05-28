/**
 * Heatmap color rules and cell display value computation for matrix modes.
 * Pure module: no React/DOM.
 */

import { tokens } from '../tokens';
import type { AttendanceStatus } from '../types';

export type MatrixMode = 'status' | 'work_hours' | 'short_hours' | 'overtime' | 'heatmap' | 'recap';
export type HeatmapMetric = 'work_hours' | 'short_hours' | 'overtime';

const REQUIRED_WORK_HOURS = 7;

export interface CellRenderInfo {
  displayValue: string | null;
  heatmapBg: string;
  heatmapText: string;
}

function workHoursColor(hours: number): { bg: string; text: string } {
  if (hours <= 0) return tokens.heatmap.workHours.gray;
  if (hours >= 8) return tokens.heatmap.workHours.green;
  if (hours >= 6) return tokens.heatmap.workHours.yellow;
  return tokens.heatmap.workHours.red;
}

function shortHoursColor(short: number): { bg: string; text: string } {
  if (short <= 0) return tokens.heatmap.shortHours.green;
  if (short <= 1) return tokens.heatmap.shortHours.yellow;
  if (short <= 3) return tokens.heatmap.shortHours.orange;
  return tokens.heatmap.shortHours.red;
}

function overtimeColor(ot: number): { bg: string; text: string } {
  if (ot <= 0) return tokens.heatmap.overtime.none;
  if (ot <= 2) return tokens.heatmap.overtime.green;
  if (ot <= 4) return tokens.heatmap.overtime.blue;
  if (ot <= 8) return tokens.heatmap.overtime.orange;
  return tokens.heatmap.overtime.red;
}

export function getCellRenderInfo(
  mode: MatrixMode,
  status: AttendanceStatus | null,
  regularHours: number | null | undefined,
  overtimeHours: number | null | undefined,
  heatmapMetric: HeatmapMetric = 'work_hours',
): CellRenderInfo {
  if (status === null) {
    return { displayValue: null, heatmapBg: 'transparent', heatmapText: tokens.text.muted };
  }

  const regular = regularHours ?? 0;
  const ot = overtimeHours ?? 0;
  const shortVal = Math.max(0, REQUIRED_WORK_HOURS - regular);

  switch (mode) {
    case 'status':
      return { displayValue: null, heatmapBg: 'transparent', heatmapText: '' };

    case 'work_hours': {
      const color = workHoursColor(regular);
      const display = status === 'off' ? '-' : regular > 0 ? regular.toFixed(1) : '0';
      return { displayValue: display, heatmapBg: color.bg, heatmapText: color.text };
    }

    case 'short_hours': {
      if (status === 'off' || status === 'leave') {
        return { displayValue: '-', heatmapBg: 'transparent', heatmapText: tokens.text.muted };
      }
      const color = shortHoursColor(shortVal);
      const display = shortVal === 0 ? '0' : `-${shortVal.toFixed(1)}`;
      return { displayValue: display, heatmapBg: color.bg, heatmapText: color.text };
    }

    case 'overtime': {
      const color = overtimeColor(ot);
      const display = ot > 0 ? ot.toFixed(1) : '-';
      return { displayValue: display, heatmapBg: color.bg, heatmapText: color.text };
    }

    case 'heatmap': {
      let value: number;
      let colorFn: (v: number) => { bg: string; text: string };
      switch (heatmapMetric) {
        case 'work_hours': value = regular; colorFn = workHoursColor; break;
        case 'short_hours': value = shortVal; colorFn = shortHoursColor; break;
        case 'overtime': value = ot; colorFn = overtimeColor; break;
      }
      const color = colorFn(value);
      const display = value > 0 ? value.toFixed(1) : (status === 'off' ? '-' : '0');
      return { displayValue: display, heatmapBg: color.bg, heatmapText: color.text };
    }

    case 'recap':
      return { displayValue: null, heatmapBg: 'transparent', heatmapText: '' };

    default:
      return { displayValue: null, heatmapBg: 'transparent', heatmapText: '' };
  }
}
