import * as React from 'react';
import { Box, Button, Chip, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';

import { tokens } from '../tokens';
import { attendanceStatusToLabel, getStatusColor } from '../domain/statusMapping';
import type { AttendanceRecord, Employee } from '../types';

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return WEEKDAY_FORMATTER.format(new Date(y, m - 1, d));
}

const labelSx = { fontSize: 12, color: tokens.text.secondary } as const;
const valueSx = { fontSize: 13, fontWeight: 600, color: tokens.text.primary } as const;

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography sx={labelSx}>{label}</Typography>
      <Typography sx={{ ...valueSx, color: color ?? tokens.text.primary }}>{value}</Typography>
    </Box>
  );
}

export interface CellDetailPanelProps {
  employee: Employee;
  date: string;
  record: AttendanceRecord | null;
  onClose: () => void;
}

export function CellDetailPanel(props: CellDetailPanelProps): React.ReactElement {
  const { employee, date, record, onClose } = props;

  const statusColor = record?.status ? getStatusColor(record.status) : tokens.text.muted;
  const statusLabel = record?.status ? attendanceStatusToLabel(record.status) : 'Tidak ada data';

  const regularHours = record?.regularHours ?? 0;
  const overtimeHours = record?.overtimeHours ?? 0;
  const shortHours = regularHours > 0 ? Math.max(0, 7 - regularHours) : 0;

  // Build simple event log from check-in/out
  const events: { time: string; label: string }[] = [];
  if (record?.checkIn) events.push({ time: record.checkIn, label: 'Check-in' });
  if (record?.checkOut) events.push({ time: record.checkOut, label: 'Check-out' });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        height: '100%',
        padding: '16px',
        backgroundColor: tokens.bg.surface,
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.text.primary, lineHeight: 1.3 }}>
            {employee.name}
          </Typography>
          <Typography sx={{ fontSize: 11, color: tokens.text.muted, lineHeight: 1.4 }}>
            {employee.ptrjEmployeeId ?? employee.employeeId}
          </Typography>
          <Typography sx={{ fontSize: 12, color: tokens.text.secondary, lineHeight: 1.5, mt: 0.5 }}>
            {formatDate(date)}
          </Typography>
        </Box>
        <Tooltip title="Tutup">
          <IconButton size="small" onClick={onClose} sx={{ color: tokens.text.muted, mt: -0.5 }}>
            <CloseRounded sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* Status */}
      <Box>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: tokens.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
          Status Hari Ini
        </Typography>
        <Chip
          label={statusLabel}
          size="small"
          sx={{
            backgroundColor: `${statusColor}22`,
            color: statusColor,
            fontWeight: 600,
            fontSize: 12,
            border: `1px solid ${statusColor}44`,
          }}
        />
      </Box>

      {record && (
        <>
          <Divider sx={{ borderColor: tokens.border.subtle }} />

          {/* Jam Kerja */}
          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: tokens.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
              Analisis Jam
            </Typography>
            <Stack spacing={0.75}>
              {record.checkIn && <StatRow label="Masuk" value={record.checkIn} />}
              {record.checkOut && <StatRow label="Pulang" value={record.checkOut} />}
              <StatRow label="Jam Wajib" value="7.0" />
              <StatRow label="Jam Aktual" value={regularHours > 0 ? `${regularHours}` : '—'} />
              <StatRow
                label="Jam Kurang"
                value={shortHours > 0 ? `${shortHours.toFixed(1)}` : '—'}
                color={shortHours > 0 ? tokens.accent.orange : tokens.text.muted}
              />
              <StatRow
                label="Lembur"
                value={overtimeHours > 0 ? `${overtimeHours}` : '—'}
                color={overtimeHours > 0 ? tokens.accent.cyan : tokens.text.muted}
              />
            </Stack>
          </Box>

          {events.length > 0 && (
            <>
              <Divider sx={{ borderColor: tokens.border.subtle }} />
              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: tokens.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                  Event Log
                </Typography>
                <Stack spacing={0.5}>
                  {events.map((ev, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <Typography sx={{ fontSize: 12, color: tokens.text.muted, minWidth: 40 }}>{ev.time}</Typography>
                      <Typography sx={{ fontSize: 12, color: tokens.text.secondary }}>{ev.label}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {record.note && (
            <>
              <Divider sx={{ borderColor: tokens.border.subtle }} />
              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: tokens.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                  Catatan
                </Typography>
                <Typography sx={{ fontSize: 12, color: tokens.text.secondary }}>{record.note}</Typography>
              </Box>
            </>
          )}
        </>
      )}

      <Divider sx={{ borderColor: tokens.border.subtle }} />

      {/* Aksi */}
      <Stack spacing={1}>
        <Button variant="outlined" size="small" disabled fullWidth
          sx={{ fontSize: 12, borderColor: tokens.border.subtle, color: tokens.text.secondary }}>
          Tambah Catatan
        </Button>
        <Button variant="outlined" size="small" disabled fullWidth
          sx={{ fontSize: 12, borderColor: tokens.border.subtle, color: tokens.text.secondary }}>
          Ajukan Koreksi
        </Button>
        <Button variant="outlined" size="small" disabled fullWidth
          sx={{ fontSize: 12, borderColor: tokens.border.subtle, color: tokens.text.secondary }}>
          Lihat Rekap Bulanan
        </Button>
      </Stack>
    </Box>
  );
}

export default CellDetailPanel;
