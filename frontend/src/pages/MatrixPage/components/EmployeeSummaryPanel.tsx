import * as React from 'react';
import { Box, Button, Chip, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import CompareArrowsRounded from '@mui/icons-material/CompareArrowsRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import WorkRounded from '@mui/icons-material/WorkRounded';

import { tokens } from '../tokens';
import { attendanceStatusToLabel } from '../domain/statusMapping';
import type { Employee } from '../types';
import type { EmployeeSummaryRow } from '../domain/employeeSummary';

export interface EmployeeSummaryPanelProps {
  employee: Employee;
  summary: EmployeeSummaryRow;
  monthLabel: string;
  onClose: () => void;
  /** Called when user clicks "Bandingkan dengan Millware" */
  onCompareMillware?: (employee: Employee) => void;
}

const rowSx = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 13,
} as const;

const labelSx = { fontSize: 12, color: tokens.text.secondary } as const;
const valueSx = { fontSize: 12, fontWeight: 600, color: tokens.text.primary } as const;

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Box sx={rowSx}>
      <Typography sx={labelSx}>{label}</Typography>
      <Typography sx={{ ...valueSx, color: color ?? tokens.text.primary }}>{value}</Typography>
    </Box>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ py: '3px' }}>
      <Box sx={{ color: tokens.text.muted, display: 'flex', alignItems: 'center', mt: '1px', flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 10, color: tokens.text.muted, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 12, color: tokens.text.primary, fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' }}>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

export function EmployeeSummaryPanel(props: EmployeeSummaryPanelProps): React.ReactElement {
  const { employee, summary, monthLabel, onClose, onCompareMillware } = props;

  const hasPtrj = !!employee.ptrjEmployeeId && employee.ptrjEmployeeId !== 'N/A';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        height: '100%',
        padding: '14px',
        backgroundColor: tokens.bg.surface,
        boxSizing: 'border-box',
        overflowY: 'auto',
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { background: tokens.border.subtle, borderRadius: 2 },
      }}
    >
      {/* ── Header: avatar + nama + close ── */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: 'rgba(20,118,255,0.15)',
              border: '1.5px solid rgba(20,118,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <PersonRounded sx={{ fontSize: 20, color: '#1476FF' }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.text.primary, lineHeight: 1.3 }}>
              {employee.name}
            </Typography>
            <Typography sx={{ fontSize: 11, color: tokens.text.muted, lineHeight: 1.4 }}>
              ID Venus: {employee.employeeId}
            </Typography>
          </Box>
        </Stack>
        <Tooltip title="Tutup">
          <IconButton size="small" onClick={onClose} sx={{ color: tokens.text.muted, mt: -0.5, flexShrink: 0 }}>
            <CloseRounded sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* ── Status Millware ── */}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {hasPtrj ? (
          <Chip
            label={`Millware: ${employee.ptrjEmployeeId}`}
            size="small"
            sx={{
              fontSize: 10,
              height: 20,
              backgroundColor: 'rgba(34,197,94,0.12)',
              color: tokens.accent.green,
              border: `1px solid rgba(34,197,94,0.25)`,
              fontWeight: 600,
            }}
          />
        ) : (
          <Chip
            label="Belum terhubung Millware"
            size="small"
            sx={{
              fontSize: 10,
              height: 20,
              backgroundColor: 'rgba(239,68,68,0.1)',
              color: tokens.accent.red,
              border: `1px solid rgba(239,68,68,0.2)`,
              fontWeight: 600,
            }}
          />
        )}
      </Stack>

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* ── Info Karyawan ── */}
      <Box>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: tokens.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
          Informasi Karyawan
        </Typography>
        <Stack spacing={0.25}>
          {employee.chargeJob && employee.chargeJob !== '-' && (
            <InfoRow
              icon={<WorkRounded sx={{ fontSize: 13 }} />}
              label="Charge Job / Jabatan"
              value={employee.chargeJob}
            />
          )}
          {employee.department && employee.department !== employee.chargeJob && (
            <InfoRow
              icon={<WorkRounded sx={{ fontSize: 13 }} />}
              label="Departemen"
              value={employee.department}
            />
          )}
          {employee.unit && (
            <InfoRow
              icon={<BadgeRounded sx={{ fontSize: 13 }} />}
              label="Unit"
              value={employee.unit}
            />
          )}
          <InfoRow
            icon={<BadgeRounded sx={{ fontSize: 13 }} />}
            label="ID Venus"
            value={employee.employeeId}
          />
          {hasPtrj && (
            <InfoRow
              icon={<BadgeRounded sx={{ fontSize: 13 }} />}
              label="ID Millware (PTRJ)"
              value={employee.ptrjEmployeeId!}
            />
          )}
        </Stack>
      </Box>

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* ── Kehadiran ── */}
      <Box>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: tokens.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
          Kehadiran — {monthLabel}
        </Typography>
        <Stack spacing={0.5}>
          <StatRow label={attendanceStatusToLabel('present')} value={summary.presentCount} color={tokens.accent.green} />
          <StatRow label={attendanceStatusToLabel('alpha')} value={summary.alphaCount || '—'} color={summary.alphaCount > 0 ? tokens.accent.red : tokens.text.muted} />
          <StatRow label={attendanceStatusToLabel('leave')} value={summary.leaveCount || '—'} color={summary.leaveCount > 0 ? tokens.accent.leaveBlue : tokens.text.muted} />
          <StatRow label={attendanceStatusToLabel('sick')} value={summary.sickCount || '—'} color={summary.sickCount > 0 ? tokens.accent.cyan : tokens.text.muted} />
          <StatRow label={attendanceStatusToLabel('late')} value={summary.lateCount || '—'} color={summary.lateCount > 0 ? tokens.accent.orange : tokens.text.muted} />
        </Stack>
      </Box>

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* ── Jam Kerja ── */}
      <Box>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: tokens.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
          Jam Kerja &amp; Lembur
        </Typography>
        <Stack spacing={0.5}>
          <StatRow label="Jam Aktual" value={`${summary.totalWorkHours} jam`} />
          <StatRow
            label="Jam Kurang"
            value={summary.totalShortHours > 0 ? `${summary.totalShortHours} jam` : '—'}
            color={summary.totalShortHours > 0 ? tokens.accent.orange : tokens.text.muted}
          />
          <StatRow
            label="Lembur (OT)"
            value={summary.totalOvertimeHours > 0 ? `${summary.totalOvertimeHours} jam` : '—'}
            color={summary.totalOvertimeHours > 0 ? tokens.accent.cyan : tokens.text.muted}
          />
          <StatRow
            label="% Hadir"
            value={`${summary.attendancePercent}%`}
            color={summary.attendancePercent >= 90 ? tokens.accent.green : summary.attendancePercent >= 75 ? tokens.accent.orange : tokens.accent.red}
          />
        </Stack>
      </Box>

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* ── Aksi ── */}
      <Stack spacing={0.75}>
        {/* Bandingkan dengan Millware — aktif jika ada ptrjEmployeeId */}
        <Tooltip title={hasPtrj ? 'Bandingkan data kehadiran Venus vs Millware untuk karyawan ini' : 'Karyawan belum terhubung ke Millware (tidak ada ID PTRJ)'}>
          <span style={{ width: '100%' }}>
            <Button
              variant="contained"
              size="small"
              fullWidth
              disabled={!hasPtrj}
              startIcon={<CompareArrowsRounded sx={{ fontSize: 14 }} />}
              onClick={() => onCompareMillware?.(employee)}
              sx={{
                fontSize: 11,
                py: '5px',
                fontWeight: 700,
                textTransform: 'none',
                backgroundColor: hasPtrj ? 'rgba(20,118,255,0.85)' : undefined,
                '&:hover': { backgroundColor: hasPtrj ? '#1476FF' : undefined },
              }}
            >
              Bandingkan dengan Millware
            </Button>
          </span>
        </Tooltip>

        <Button
          variant="outlined"
          size="small"
          fullWidth
          disabled
          sx={{ fontSize: 11, py: '4px', borderColor: tokens.border.subtle, color: tokens.text.secondary, textTransform: 'none' }}
        >
          Ajukan Koreksi
        </Button>
      </Stack>
    </Box>
  );
}

export default EmployeeSummaryPanel;
