import React, { useState } from 'react';
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
    Switch,
    FormControlLabel,
    Chip,
} from '@mui/material';

// CSS Class to Style Mapping (from original templates/index.html)
const getCellStyle = (className) => {
    const styles = {
        // Primary statuses
        'hours-alfa': { bg: '#ffcdd2', color: '#d32f2f', border: '2px solid #d32f2f', fontWeight: 'bold' },
        'hours-normal': { bg: '#e8f5e8', color: '#2d5a2d', fontWeight: 'bold' },
        'hours-normal-overtime': { bg: '#d4edda', color: '#155724', border: '2px solid #28a745', fontWeight: 'bold' },
        'hours-overtime-only': { bg: '#fff3cd', color: '#664d03', border: '2px solid #ffc107', fontWeight: 'bold' },
        'hours-full': { bg: '#d1e7dd', color: '#0f5132', fontWeight: 'bold' },

        // Incomplete
        'hours-partial-check-in-only': { bg: '#bbdefb', color: '#1976d2', border: '2px solid #2196f3', fontWeight: 'bold' },
        'hours-partial-check-out-only': { bg: '#bbdefb', color: '#1976d2', border: '2px solid #2196f3', fontWeight: 'bold' },

        // Leave types
        'leave-ct': { bg: '#e3f2fd', color: '#1976d2', fontWeight: 'bold' },
        'leave-cb': { bg: '#e1f5fe', color: '#0277bd', fontWeight: 'bold' },
        'leave-s': { bg: '#ffebee', color: '#d32f2f', fontWeight: 'bold' },
        'leave-i': { bg: '#f9fbe7', color: '#689f38', fontWeight: 'bold' },
        'leave-h2': { bg: '#fce4ec', color: '#c2185b', fontWeight: 'bold' },
        'leave-p1': { bg: '#f3e5f5', color: '#7b1fa2', fontWeight: 'bold' },
        'leave-p2': { bg: '#e8f5e8', color: '#388e3c', fontWeight: 'bold' },
        'leave-p3': { bg: '#fff3e0', color: '#f57c00', fontWeight: 'bold' },

        // Absence types
        'absence-unpaid-alfa': { bg: '#ffcdd2', color: '#d32f2f', border: '2px solid #f44336', fontWeight: 'bold' },
        'absence-sick': { bg: '#ffebee', color: '#c62828', border: '2px solid #f44336', fontWeight: 'bold' },
        'absence-duty': { bg: '#e8eaf6', color: '#3f51b5', border: '2px solid #3f51b5', fontWeight: 'bold' },

        // OFF and unavailable
        'hours-off': { bg: '#f5f5f5', color: '#757575', fontStyle: 'italic' },
        'hours-absent': { bg: '#f8f9fa', color: '#6c757d' },
        'hours-data-unavailable': { bg: '#e9ecef', color: '#adb5bd', fontStyle: 'italic', cursor: 'not-allowed' },

        // Default
        'default': { bg: '#ffffff', color: '#000000' }
    };

    return styles[className] || styles['default'];
};

const AttendanceMatrix = ({ data = [] }) => {
    const [showOvertime, setShowOvertime] = useState(true); // Toggle for overtime display
    const safeData = Array.isArray(data) ? data : [];

    if (!safeData || safeData.length === 0) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#f8f9fa', mt: 2 }}>
                <Typography variant="h6" color="text.secondary">
                    Tidak ada data untuk ditampilkan
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Pilih bulan untuk menampilkan rekap absensi
                </Typography>
            </Paper>
        );
    }

    const daysMap = safeData[0]?.attendance || {};
    const dayNumbers = Object.keys(daysMap).sort((a, b) => Number(a) - Number(b));

    // Sticky column widths (matching original)
    const stickyStyles = {
        no: { left: 0, minWidth: 50, zIndex: 30, bgcolor: '#f8f9fa' },
        id: { left: 50, minWidth: 100, zIndex: 30, bgcolor: '#f8f9fa' },
        ptrjId: { left: 150, minWidth: 100, zIndex: 30, bgcolor: '#f8f9fa', color: '#0284c7', fontWeight: 600 },
        name: { left: 250, minWidth: 200, zIndex: 30, bgcolor: '#f8f9fa', fontWeight: 600 },
        chargeJob: { left: 450, minWidth: 250, zIndex: 30, bgcolor: '#fffbeb' }
    };

    // Helper to format display based on toggle
    const getDisplayText = (d) => {
        if (!showOvertime) {
            // Hide overtime, just show status
            if (d.display.includes('+')) {
                return d.display.split('+')[0].trim(); // Remove overtime part
            }
        }
        return d.display;
    };

    return (
        <Paper elevation={3} sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
            {/* Header with Toggle */}
            <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    Matriks Rekap Absensi
                </Typography>
                <FormControlLabel
                    control={
                        <Switch
                            checked={showOvertime}
                            onChange={(e) => setShowOvertime(e.target.checked)}
                            sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                    color: '#fbbf24',
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    backgroundColor: '#fbbf24',
                                },
                            }}
                        />
                    }
                    label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ color: 'white' }}>
                                Tampilkan Jam Lembur
                            </Typography>
                            <Chip
                                label={showOvertime ? 'ON' : 'OFF'}
                                size="small"
                                sx={{
                                    bgcolor: showOvertime ? '#fbbf24' : '#64748b',
                                    color: 'white',
                                    fontWeight: 'bold'
                                }}
                            />
                        </Box>
                    }
                />
            </Box>

            <TableContainer sx={{ maxHeight: 'calc(100vh - 350px)', overflow: 'auto' }}>
                <Table stickyHeader size="small" sx={{
                    '& .MuiTableCell-root': {
                        border: '1px solid #dee2e6',
                        p: 0.5
                    }
                }}>
                    <TableHead>
                        <TableRow>
                            {/* Sticky Columns */}
                            <TableCell sx={{ ...stickyStyles.no, position: 'sticky', top: 0, bgcolor: '#2c5aa0', color: 'white', fontWeight: 'bold', zIndex: 40 }}>No</TableCell>
                            <TableCell sx={{ ...stickyStyles.id, position: 'sticky', top: 0, bgcolor: '#2c5aa0', color: 'white', fontWeight: 'bold', zIndex: 40 }}>ID</TableCell>
                            <TableCell sx={{ ...stickyStyles.ptrjId, position: 'sticky', top: 0, bgcolor: '#2c5aa0', color: '#60a5fa', fontWeight: 'bold', zIndex: 40 }}>PTRJ ID</TableCell>
                            <TableCell sx={{ ...stickyStyles.name, position: 'sticky', top: 0, bgcolor: '#2c5aa0', color: 'white', fontWeight: 'bold', zIndex: 40 }}>Nama Karyawan</TableCell>
                            <TableCell sx={{ ...stickyStyles.chargeJob, position: 'sticky', top: 0, bgcolor: '#2c5aa0', color: '#fbbf24', fontWeight: 'bold', zIndex: 40 }}>Charge Job</TableCell>

                            {/* Date Columns */}
                            {dayNumbers.map(day => {
                                const d = daysMap[day];
                                const isHoliday = d?.isHoliday || d?.isSunday;
                                return (
                                    <TableCell
                                        key={day}
                                        align="center"
                                        sx={{
                                            position: 'sticky',
                                            top: 0,
                                            minWidth: 80,
                                            bgcolor: isHoliday ? '#dc3545' : '#2c5aa0',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            p: 0.5,
                                            zIndex: 35
                                        }}
                                    >
                                        <Tooltip title={isHoliday ? (d.holidayName || 'Hari Libur') : ''}>
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{day}</div>
                                                <div style={{ fontSize: '0.65rem', opacity: 0.9 }}>{d?.dayName}</div>
                                            </div>
                                        </Tooltip>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {safeData.map((emp, idx) => (
                            <TableRow key={emp.id} hover>
                                {/* Sticky Data Columns */}
                                <TableCell sx={{ ...stickyStyles.no, position: 'sticky' }}>{idx + 1}</TableCell>
                                <TableCell sx={{ ...stickyStyles.id, position: 'sticky' }}>{emp.id}</TableCell>
                                <TableCell sx={{ ...stickyStyles.ptrjId, position: 'sticky' }}>{emp.ptrjEmployeeID}</TableCell>
                                <TableCell sx={{ ...stickyStyles.name, position: 'sticky' }}>{emp.name}</TableCell>
                                <TableCell sx={{ ...stickyStyles.chargeJob, position: 'sticky', fontSize: '0.75rem', color: '#92400e' }}>
                                    <Tooltip title={emp.chargeJob} arrow>
                                        <div style={{
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: 240
                                        }}>
                                            {emp.chargeJob || '-'}
                                        </div>
                                    </Tooltip>
                                </TableCell>

                                {/* Attendance Data Cells */}
                                {dayNumbers.map(day => {
                                    const d = emp.attendance[day];
                                    if (!d) return <TableCell key={day} />;

                                    const style = getCellStyle(d.class);

                                    return (
                                        <Tooltip
                                            key={day}
                                            arrow
                                            title={
                                                <Box sx={{ p: 0.5 }}>
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{d.date} ({d.dayName})</Typography>
                                                    <Typography variant="caption" display="block">Status: {d.status}</Typography>
                                                    <Typography variant="caption" display="block">In: {d.checkIn || '-'}</Typography>
                                                    <Typography variant="caption" display="block">Out: {d.checkOut || '-'}</Typography>
                                                    <Typography variant="caption" display="block">Reg: {d.regularHours}h | OT: {d.overtimeHours}h</Typography>
                                                </Box>
                                            }
                                        >
                                            <TableCell
                                                align="center"
                                                sx={{
                                                    bgcolor: style.bg,
                                                    color: style.color,
                                                    border: style.border,
                                                    fontWeight: style.fontWeight,
                                                    fontStyle: style.fontStyle,
                                                    cursor: d.class === 'hours-data-unavailable' ? 'not-allowed' : 'pointer',
                                                    fontSize: '0.85rem',
                                                    p: 0.5,
                                                    height: 40,
                                                    whiteSpace: 'nowrap',
                                                    '&:hover': {
                                                        filter: d.class !== 'hours-data-unavailable' ? 'brightness(0.95)' : 'none'
                                                    }
                                                }}
                                            >
                                                {getDisplayText(d)}
                                            </TableCell>
                                        </Tooltip>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default AttendanceMatrix;
