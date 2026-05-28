/**
 * AnalysisTabs — tabbed analysis section for the Right Insight Panel.
 * Shows top-5 rankings for overtime and short hours.
 */
import * as React from 'react';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { tokens } from '../tokens';
import type { EmployeeSummaryRow } from '../domain/employeeSummary';
import type { Employee } from '../types';

export interface AnalysisTabsProps {
  employeeSummaries: Map<string, EmployeeSummaryRow>;
  employees: Employee[];
}

function getTopByField(
  summaries: Map<string, EmployeeSummaryRow>,
  employees: Employee[],
  field: keyof EmployeeSummaryRow,
  limit = 5,
): Array<{ name: string; value: number }> {
  const empMap = new Map(employees.map((e) => [e.employeeId, e.name]));
  return Array.from(summaries.values())
    .sort((a, b) => (b[field] as number) - (a[field] as number))
    .slice(0, limit)
    .filter((row) => (row[field] as number) > 0)
    .map((row) => ({
      name: empMap.get(row.employeeId) ?? row.employeeId,
      value: row[field] as number,
    }));
}

function RankingList(props: { items: Array<{ name: string; value: number }>; unit: string; color: string }) {
  const { items, unit, color } = props;
  if (items.length === 0) {
    return <Typography sx={{ fontSize: 11, color: tokens.text.muted }}>Tidak ada data</Typography>;
  }
  return (
    <Stack spacing={0.75}>
      {items.map((item, idx) => (
        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 11, color: tokens.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
            {idx + 1}. {item.name}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'ui-monospace, monospace' }}>
            {item.value}{unit}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

export function AnalysisTabs(props: AnalysisTabsProps): React.ReactElement {
  const { employeeSummaries, employees } = props;
  const [tab, setTab] = React.useState(0);

  const topOvertime = React.useMemo(
    () => getTopByField(employeeSummaries, employees, 'totalOvertimeHours'),
    [employeeSummaries, employees],
  );

  const topShortHours = React.useMemo(
    () => getTopByField(employeeSummaries, employees, 'totalShortHours'),
    [employeeSummaries, employees],
  );

  const topAlpha = React.useMemo(
    () => getTopByField(employeeSummaries, employees, 'alphaCount'),
    [employeeSummaries, employees],
  );

  const totalOT = React.useMemo(
    () => Array.from(employeeSummaries.values()).reduce((s, r) => s + r.totalOvertimeHours, 0),
    [employeeSummaries],
  );

  const totalShort = React.useMemo(
    () => Array.from(employeeSummaries.values()).reduce((s, r) => s + r.totalShortHours, 0),
    [employeeSummaries],
  );

  return (
    <Stack spacing={1}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.text.primary }}>
        Analisis
      </Typography>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          minHeight: 28,
          '& .MuiTab-root': { minHeight: 28, py: 0.5, px: 1, fontSize: 10, fontWeight: 600, textTransform: 'none', color: tokens.text.secondary },
          '& .Mui-selected': { color: tokens.text.primary },
          '& .MuiTabs-indicator': { backgroundColor: tokens.accent.blue, height: 2 },
        }}
      >
        <Tab label="Lembur" />
        <Tab label="Jam Kurang" />
        <Tab label="Alfa" />
      </Tabs>

      <Box sx={{ pt: 0.5 }}>
        {tab === 0 && (
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 10, color: tokens.text.muted }}>Total OT bulan ini</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: tokens.accent.cyan }}>{totalOT.toFixed(1)}h</Typography>
            </Box>
            <Typography sx={{ fontSize: 10, color: tokens.text.muted, mb: 0.5 }}>Top 5 Lembur Tertinggi</Typography>
            <RankingList items={topOvertime} unit="h" color={tokens.accent.cyan} />
          </Stack>
        )}
        {tab === 1 && (
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 10, color: tokens.text.muted }}>Total jam kurang</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: tokens.accent.orange }}>{totalShort.toFixed(1)}h</Typography>
            </Box>
            <Typography sx={{ fontSize: 10, color: tokens.text.muted, mb: 0.5 }}>Top 5 Jam Kurang Tertinggi</Typography>
            <RankingList items={topShortHours} unit="h" color={tokens.accent.orange} />
          </Stack>
        )}
        {tab === 2 && (
          <Stack spacing={1}>
            <Typography sx={{ fontSize: 10, color: tokens.text.muted, mb: 0.5 }}>Top 5 Alfa Tertinggi</Typography>
            <RankingList items={topAlpha} unit="x" color={tokens.accent.red} />
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

export default AnalysisTabs;
