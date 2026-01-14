import React from 'react';
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Tooltip,
    Typography,
    Chip,
    Avatar
} from '@mui/material';
import {
    CheckCircle as CheckIcon,
    Cancel as CancelIcon,
    Warning as WarningIcon,
    Flight as FlightIcon,
    LocalHospital as HospitalIcon,
    Person as PersonIcon
} from '@mui/icons-material';

// CRITICAL FIX: Charge job is in employee.chargeJob, NOT in daily attendance
const AttendanceMatrix = ({ data = [], viewMode = 'attendance' }) => {
    const safeData = Array.isArray(data) ? data : [];

    if (safeData.length === 0) {
        return (
            <Box sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#fafbfc'
            }}>
                <Box sx={{ textAlign: 'center', p: 4 }}>
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        Pilih Periode
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Gunakan navigator di atas untuk menampilkan data absensi
                    </Typography>
                </Box>
            </Box>
        );
    }

    const daysMap = safeData[0]?.attendance || {};
    const dayNumbers = Object.keys(daysMap).sort((a, b) => Number(a) - Number(b));

    // Status color helper
    const getStatusColor = (status) => {
        if (status === 'Hadir') return { bg: '#ecfdf5', text: '#059669', icon: <CheckIcon sx={{ fontSize: 14, color: '#059669' }} /> };
        if (status === 'ALFA') return { bg: '#7f1d1d', text: '#ffffff', icon: <CancelIcon sx={{ fontSize: 14 }} /> };
        if (status === 'OFF') return { bg: '#f1f5f9', text: '#64748b', icon: null };
        if (status.includes('Lembur')) return { bg: '#fff7ed', text: '#c2410c', icon: null };
        if (['CT', 'Cuti', 'Izin', 'I'].includes(status)) return { bg: '#eff6ff', text: '#1e40af', icon: <FlightIcon sx={{ fontSize: 12 }} /> };
        if (['S', 'Sakit', 'Sick'].includes(status)) return { bg: '#fee2e2', text: '#b91c1c', icon: <HospitalIcon sx={{ fontSize: 12 }} /> };
        return { bg: '#ffffff', text: '#1e293b', icon: null };
    };

    return (
        <Paper
            elevation={0}
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 1,
                overflow: 'hidden'
            }}
        >
            {/* Table Container - Takes all available space */}
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'auto' }}>
                <Table
                    stickyHeader
                    size="small"
                    sx={{
                        minWidth: 'max-content',
                        '& .MuiTableCell-root': {
                            borderRight: '1px solid #f3f4f6',
                            borderBottom: '1px solid #f3f4f6',
                            py: 0.75,
                            px: 1
                        }
                    }}
                >
                    <TableHead>
                        <TableRow>
                            {/* ONLY Name Column is Sticky */}
                            <TableCell
                                sx={{
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 100,
                                    bgcolor: '#f9fafb',
                                    width: 220,
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: '#374151',
                                    boxShadow: '2px 0 5px rgba(0,0,0,0.08)',
                                    borderRight: '2px solid #cbd5e1 !important'
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PersonIcon fontSize="small" color="disabled" />
                                    NAMA KARYAWAN
                                </Box>
                            </TableCell>

                            {/* PTRJ ID - Scrollable */}
                            <TableCell
                                sx={{
                                    bgcolor: '#f9fafb',
                                    width: 110,
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    color: '#64748b'
                                }}
                            >
                                PTRJ ID
                            </TableCell>

                            {/* Charge Job - Scrollable */}
                            <TableCell
                                sx={{
                                    bgcolor: '#fef8ed',
                                    width: 200,
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    color: '#92400e',
                                    borderRight: '2px solid #f59e0b !important'
                                }}
                            >
                                ⚙️ CHARGE JOB
                            </TableCell>

                            {/* Date Columns */}
                            {dayNumbers.map(day => {
                                const d = daysMap[day];
                                const isHoliday = d?.isHoliday;
                                const isSun = d?.isSunday;

                                return (
                                    <TableCell
                                        key={day}
                                        align="center"
                                        sx={{
                                            width: 50,
                                            bgcolor: isHoliday ? '#fef2f2' : (isSun ? '#fafafa' : '#ffffff'),
                                            color: isHoliday ? '#dc2626' : (isSun ? '#9ca3af' : '#111827'),
                                            fontWeight: 600,
                                            fontSize: '0.75rem'
                                        }}
                                    >
                                        <Box sx={{ lineHeight: 1.2 }}>
                                            <div style={{ fontWeight: 700 }}>{day}</div>
                                            <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                                                {d?.dayName?.substring(0, 3).toUpperCase()}
                                            </div>
                                        </Box>
                                    </TableCell>
                                );
                            })}

                            {/* Summary Columns */}
                            <TableCell align="center" sx={{ bgcolor: '#f0fdf4', fontWeight: 700, fontSize: '0.7rem', borderLeft: '2px solid #10b981 !important' }}>
                                HADIR
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#fff7ed', fontWeight: 700, fontSize: '0.7rem' }}>
                                LEMBUR (H)
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#fef2f2', fontWeight: 700, fontSize: '0.7rem', color: '#b91c1c' }}>
                                ALFA
                            </TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {safeData.map((employee, index) => {
                            const isEven = index % 2 === 0;

                            // Calculate totals
                            let totalHadir = 0;
                            let totalOT = 0;
                            let totalAlfa = 0;

                            dayNumbers.forEach(day => {
                                const d = employee.attendance[day];
                                if (!d) return;

                                if (d.status === 'Hadir' || d.regularHours > 0) totalHadir++;
                                if (d.status === 'ALFA') totalAlfa++;
                                if (d.overtimeHours > 0) totalOT += d.overtimeHours;
                            });

                            return (
                                <TableRow
                                    key={employee.id}
                                    hover
                                    sx={{
                                        bgcolor: isEven ? '#ffffff' : '#fafbfc',
                                        '&:hover': {
                                            bgcolor: '#f0f9ff !important'
                                        }
                                    }}
                                >
                                    {/* Employee Name (ONLY STICKY) */}
                                    <TableCell
                                        sx={{
                                            position: 'sticky',
                                            left: 0,
                                            zIndex: 50,
                                            bgcolor: 'inherit',
                                            boxShadow: '3px 0 6px rgba(0,0,0,0.06)',
                                            fontWeight: 600,
                                            color: '#111827',
                                            borderRight: '2px solid #cbd5e1 !important'
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: '#7c3aed' }}>
                                                {employee.name.charAt(0)}
                                            </Avatar>
                                            <Typography variant="body2" noWrap sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                                                {employee.name}
                                            </Typography>
                                        </Box>
                                    </TableCell>

                                    {/* PTRJ ID - Scrollable */}
                                    <TableCell
                                        sx={{
                                            bgcolor: 'inherit',
                                            color: '#6b7280',
                                            fontFamily: 'monospace',
                                            fontSize: '0.75rem'
                                        }}
                                    >
                                        {employee.ptrjEmployeeID}
                                    </TableCell>

                                    {/* CHARGE JOB - Scrollable */}
                                    <TableCell
                                        sx={{
                                            bgcolor: isEven ? '#fffaf0' : '#fef8ed',
                                            borderRight: '2px solid #f59e0b !important'
                                        }}
                                    >
                                        {employee.chargeJob && employee.chargeJob !== '-' ? (
                                            <Tooltip title={employee.chargeJob} arrow placement="top">
                                                <Chip
                                                    label={employee.chargeJob}
                                                    size="small"
                                                    sx={{
                                                        height: 22,
                                                        fontSize: '0.7rem',
                                                        maxWidth: 200,
                                                        bgcolor: '#fff7ed', // Softer
                                                        border: '1px solid #f59e0b',
                                                        color: '#92400e',
                                                        fontWeight: 500,
                                                        '& .MuiChip-label': {
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }
                                                    }}
                                                />
                                            </Tooltip>
                                        ) : (
                                            <Typography variant="caption" sx={{ color: '#9ca3af', fontStyle: 'italic' }}>
                                                -
                                            </Typography>
                                        )}
                                    </TableCell>

                                    {/* Daily Attendance Cells */}
                                    {dayNumbers.map(day => {
                                        const d = employee.attendance[day];
                                        if (!d) return <TableCell key={day} sx={{ bgcolor: '#fafafa' }} />;

                                        const statusStyle = getStatusColor(d.status);
                                        const regH = d.regularHours || 0;
                                        const otH = d.overtimeHours || 0;

                                        const tooltipContent = (
                                            <Box sx={{ p: 1 }}>
                                                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{d.date}</Typography>
                                                <Typography variant="body2">Status: <b>{d.status}</b></Typography>
                                                <Typography variant="caption">In/Out: {d.checkIn || '--'} - {d.checkOut || '--'}</Typography>
                                                <Typography variant="caption" display="block">Reg: {regH}h | OT: {otH}h</Typography>
                                            </Box>
                                        );

                                        return (
                                            <Tooltip key={day} title={tooltipContent} arrow>
                                                <TableCell
                                                    align="center"
                                                    sx={{
                                                        bgcolor: statusStyle.bg,
                                                        color: statusStyle.text,
                                                        fontWeight: 600,
                                                        fontSize: '0.75rem',
                                                        cursor: 'crosshair',
                                                        transition: 'all 0.1s',
                                                        '&:hover': {
                                                            filter: 'brightness(0.95)',
                                                            zIndex: 10
                                                        }
                                                    }}
                                                >
                                                    {/* Display logic with VIEW MODE filtering */}
                                                    {d.status === 'Hadir' ? (
                                                        <Box>
                                                            {viewMode === 'attendance' ? (
                                                                <CheckIcon sx={{ fontSize: 16, color: '#059669' }} />
                                                            ) : viewMode === 'overtime' ? (
                                                                <Box>
                                                                    <CheckIcon sx={{ fontSize: 14, color: '#059669' }} />
                                                                    {otH > 0 && <div style={{ fontSize: '0.65rem', color: '#c2410c', fontWeight: 700 }}>+{otH}</div>}
                                                                </Box>
                                                            ) : (
                                                                <Box>
                                                                    {regH > 0 && <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{regH}</div>}
                                                                    {otH > 0 && <div style={{ fontSize: '0.65rem', color: '#c2410c', fontWeight: 700 }}>+{otH}</div>}
                                                                </Box>
                                                            )}
                                                        </Box>
                                                    ) : ['ALFA', 'OFF', 'CT', 'S', 'I'].includes(d.status) ? (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3 }}>
                                                            {statusStyle.icon}
                                                            <span style={{ fontSize: viewMode === 'detail' ? '0.7rem' : '0.65rem', fontWeight: 700 }}>
                                                                {d.status}
                                                            </span>
                                                        </Box>
                                                    ) : (
                                                        <span>{viewMode === 'detail' ? d.display : '~'}</span>
                                                    )}
                                                </TableCell>
                                            </Tooltip>
                                        );
                                    })}

                                    {/* Summary Cells */}
                                    <TableCell align="center" sx={{ bgcolor: '#f0fdf4', fontWeight: 700, borderLeft: '2px solid #10b981 !important' }}>
                                        {totalHadir}
                                    </TableCell>
                                    <TableCell align="center" sx={{ bgcolor: '#fff7ed', fontWeight: 700, color: '#c2410c' }}>
                                        {totalOT.toFixed(1).replace('.0', '')}
                                    </TableCell>
                                    <TableCell align="center" sx={{ bgcolor: '#fef2f2', fontWeight: 700, color: '#b91c1c' }}>
                                        {totalAlfa}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default AttendanceMatrix;
