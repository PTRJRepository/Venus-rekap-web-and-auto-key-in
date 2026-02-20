import React, { useState, useMemo } from 'react';
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Collapse,
    IconButton,
    Chip,
    Tooltip,
    Avatar,
    AvatarGroup
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SickIcon from '@mui/icons-material/LocalHospital';
import FlightIcon from '@mui/icons-material/Flight';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import CancelIcon from '@mui/icons-material/Cancel';
import BusinessIcon from '@mui/icons-material/Business';

/**
 * Extract station name from chargeJob field
 * Example: "(GA9010) VEHICLE RUNNING / LN002 ((POWERMAX) COMPOSTING 2 2024) / 11 (DRIVER WAGES)"
 * → Split by '/' → Take index 0 → "(GA9010) VEHICLE RUNNING"
 * → Extract name after code → "VEHICLE RUNNING"
 */
const getStation = (chargeJob) => {
    if (!chargeJob || chargeJob === '-') return 'Tidak Diketahui';

    // Split by '/' and take the first part (index 0)
    const parts = chargeJob.split('/');
    const firstPart = parts[0]?.trim() || '';

    if (!firstPart) return 'Tidak Diketahui';

    // Extract station name: remove code in parentheses at the start
    // Format: "(CODE) STATION NAME" → "STATION NAME"
    const match = firstPart.match(/^\([^)]+\)\s*(.+)$/);
    if (match && match[1]) {
        return match[1].trim();
    }

    // If no parentheses pattern, return the whole first part
    return firstPart;
};

/**
 * Count attendance status for an employee
 */
const countAttendanceStatus = (attendance) => {
    const counts = { hadir: 0, sakit: 0, cuti: 0, izin: 0, alfa: 0, off: 0 };

    if (!attendance) return counts;

    Object.values(attendance).forEach(day => {
        const status = (day.status || '').toUpperCase();

        if (status === 'HADIR' || status === 'PARTIAL IN' || status === 'PARTIAL OUT') {
            counts.hadir++;
        } else if (['S', 'SAKIT', 'SD', 'SICK'].includes(status)) {
            counts.sakit++;
        } else if (['CT', 'CUTI'].includes(status)) {
            counts.cuti++;
        } else if (['I', 'IZIN'].includes(status)) {
            counts.izin++;
        } else if (status === 'ALFA') {
            counts.alfa++;
        } else if (status === 'OFF') {
            counts.off++;
        }
    });

    return counts;
};

/**
 * Station Row Component with expandable employee list
 */
const StationRow = ({ station, employees, stats }) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <TableRow
                hover
                onClick={() => setOpen(!open)}
                sx={{
                    cursor: 'pointer',
                    bgcolor: open ? '#f0fdf4' : 'inherit',
                    '&:hover': { bgcolor: '#f8fafc' }
                }}
            >
                <TableCell sx={{ width: 50 }}>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon sx={{ color: '#7c3aed', fontSize: 20 }} />
                        {station}
                        <Chip
                            label={`${employees.length} orang`}
                            size="small"
                            sx={{ ml: 1, bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 600, fontSize: '0.7rem' }}
                        />
                    </Box>
                </TableCell>
                <TableCell align="center">
                    <Chip
                        icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                        label={stats.hadir}
                        size="small"
                        sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 700, minWidth: 60 }}
                    />
                </TableCell>
                <TableCell align="center">
                    <Chip
                        icon={<SickIcon sx={{ fontSize: 14 }} />}
                        label={stats.sakit}
                        size="small"
                        sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 700, minWidth: 60 }}
                    />
                </TableCell>
                <TableCell align="center">
                    <Chip
                        icon={<FlightIcon sx={{ fontSize: 14 }} />}
                        label={stats.cuti}
                        size="small"
                        sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontWeight: 700, minWidth: 60 }}
                    />
                </TableCell>
                <TableCell align="center">
                    <Chip
                        icon={<EventBusyIcon sx={{ fontSize: 14 }} />}
                        label={stats.izin}
                        size="small"
                        sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700, minWidth: 60 }}
                    />
                </TableCell>
                <TableCell align="center">
                    <Chip
                        icon={<CancelIcon sx={{ fontSize: 14 }} />}
                        label={stats.alfa}
                        size="small"
                        sx={{ bgcolor: '#7f1d1d', color: '#fff', fontWeight: 700, minWidth: 60 }}
                    />
                </TableCell>
            </TableRow>

            {/* Expanded Employee List */}
            <TableRow>
                <TableCell colSpan={7} sx={{ py: 0, borderBottom: open ? '2px solid #e5e7eb' : 'none' }}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 3, bgcolor: '#fafafa' }}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#374151', fontWeight: 600 }}>
                                Daftar Karyawan di Stasiun {station}
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f1f5f9' }}>Nama</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f1f5f9' }}>Charge Job</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f1f5f9' }}>Hadir</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f1f5f9' }}>Sakit</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f1f5f9' }}>Cuti</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f1f5f9' }}>Izin</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: '#f1f5f9' }}>Alfa</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {employees.map((emp, idx) => {
                                        const empStats = countAttendanceStatus(emp.attendance);
                                        return (
                                            <TableRow key={emp.id} sx={{ bgcolor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem', bgcolor: '#7c3aed' }}>
                                                            {emp.name?.charAt(0) || '?'}
                                                        </Avatar>
                                                        {emp.name}
                                                    </Box>
                                                </TableCell>
                                                <TableCell sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{emp.chargeJob || '-'}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#166534' }}>{empStats.hadir}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#991b1b' }}>{empStats.sakit}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#1e40af' }}>{empStats.cuti}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#92400e' }}>{empStats.izin}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#7f1d1d' }}>{empStats.alfa}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
};

/**
 * Main Attendance Summary Report Component
 */
const AttendanceSummaryReport = ({ data = [] }) => {
    const safeData = Array.isArray(data) ? data : [];

    // Group employees by station and calculate stats
    const { stationData, totalStats } = useMemo(() => {
        const stationMap = {};
        const totals = { hadir: 0, sakit: 0, cuti: 0, izin: 0, alfa: 0 };

        safeData.forEach(emp => {
            const station = getStation(emp.chargeJob);

            if (!stationMap[station]) {
                stationMap[station] = {
                    employees: [],
                    stats: { hadir: 0, sakit: 0, cuti: 0, izin: 0, alfa: 0 }
                };
            }

            stationMap[station].employees.push(emp);

            // Calculate stats for this employee
            const empStats = countAttendanceStatus(emp.attendance);

            // Add to station totals
            stationMap[station].stats.hadir += empStats.hadir;
            stationMap[station].stats.sakit += empStats.sakit;
            stationMap[station].stats.cuti += empStats.cuti;
            stationMap[station].stats.izin += empStats.izin;
            stationMap[station].stats.alfa += empStats.alfa;

            // Add to grand totals
            totals.hadir += empStats.hadir;
            totals.sakit += empStats.sakit;
            totals.cuti += empStats.cuti;
            totals.izin += empStats.izin;
            totals.alfa += empStats.alfa;
        });

        // Convert to sorted array
        const sortedStations = Object.entries(stationMap)
            .map(([station, data]) => ({ station, ...data }))
            .sort((a, b) => a.station.localeCompare(b.station));

        return { stationData: sortedStations, totalStats: totals };
    }, [safeData]);

    if (safeData.length === 0) {
        return (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">Pilih Periode untuk menampilkan data</Typography>
            </Box>
        );
    }

    return (
        <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', bgcolor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
                    📊 Report Absensi per Stasiun
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip label={`${stationData.length} Stasiun`} size="small" sx={{ bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 600 }} />
                    <Chip label={`${safeData.length} Karyawan`} size="small" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600 }} />
                </Box>
            </Box>

            {/* Table */}
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: '#f1f5f9', width: 50 }} />
                            <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>Stasiun</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>
                                <Tooltip title="Total Kehadiran"><span>Hadir</span></Tooltip>
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>
                                <Tooltip title="Total Sakit"><span>Sakit</span></Tooltip>
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>
                                <Tooltip title="Total Cuti"><span>Cuti</span></Tooltip>
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>
                                <Tooltip title="Total Izin"><span>Izin</span></Tooltip>
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>
                                <Tooltip title="Total Tanpa Keterangan"><span>Alfa</span></Tooltip>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {stationData.map(({ station, employees, stats }) => (
                            <StationRow
                                key={station}
                                station={station}
                                employees={employees}
                                stats={stats}
                            />
                        ))}

                        {/* Grand Total Row */}
                        <TableRow sx={{ bgcolor: '#1e293b' }}>
                            <TableCell />
                            <TableCell sx={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                                TOTAL KESELURUHAN
                            </TableCell>
                            <TableCell align="center">
                                <Chip label={totalStats.hadir} size="small" sx={{ bgcolor: '#22c55e', color: '#fff', fontWeight: 700, minWidth: 60 }} />
                            </TableCell>
                            <TableCell align="center">
                                <Chip label={totalStats.sakit} size="small" sx={{ bgcolor: '#ef4444', color: '#fff', fontWeight: 700, minWidth: 60 }} />
                            </TableCell>
                            <TableCell align="center">
                                <Chip label={totalStats.cuti} size="small" sx={{ bgcolor: '#3b82f6', color: '#fff', fontWeight: 700, minWidth: 60 }} />
                            </TableCell>
                            <TableCell align="center">
                                <Chip label={totalStats.izin} size="small" sx={{ bgcolor: '#f59e0b', color: '#fff', fontWeight: 700, minWidth: 60 }} />
                            </TableCell>
                            <TableCell align="center">
                                <Chip label={totalStats.alfa} size="small" sx={{ bgcolor: '#dc2626', color: '#fff', fontWeight: 700, minWidth: 60 }} />
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default AttendanceSummaryReport;
