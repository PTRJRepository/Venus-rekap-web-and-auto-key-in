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
    Work as WorkIcon,
    Person as PersonIcon,
    Fingerprint as FingerprintIcon,
    Summarize as SummarizeIcon
} from '@mui/icons-material';

// Enterprise Status Colors
const getStatusStyle = (status) => {
    switch(status) {
        case 'Hadir': return { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' }; // Green
        case 'Lembur': return { bg: '#fff7ed', color: '#c2410c', border: '#ffedd5' }; // Orange
        case 'Sakit': 
        case 'S': return { bg: '#fef2f2', color: '#b91c1c', border: '#fee2e2' }; // Red
        case 'Izin': 
        case 'I': return { bg: '#f0f9ff', color: '#0369a1', border: '#e0f2fe' }; // Sky
        case 'Cuti': 
        case 'CT': return { bg: '#f5f3ff', color: '#6d28d9', border: '#ede9fe' }; // Violet
        case 'ALFA': return { bg: '#450a0a', color: '#ffffff', border: '#450a0a' }; // Dark Red
        case 'OFF': return { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' }; // Slate
        case 'Incomplete': return { bg: '#fffbeb', color: '#b45309', border: '#fef3c7' }; // Amber
        default: return { bg: '#ffffff', color: '#334155', border: 'transparent' };
    }
};

const AttendanceMatrix = ({ data = [] }) => {
    const safeData = Array.isArray(data) ? data : [];
    
    if (safeData.length === 0) {
        return (
            <Paper 
                elevation={0} 
                sx={{ 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    bgcolor: 'background.default',
                    border: '1px dashed #cbd5e1',
                    borderRadius: 2
                }}
            >
                <Box sx={{ textAlign: 'center', p: 4 }}>
                    <FingerprintIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        Tidak ada data
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Pilih periode atau refresh data untuk melihat rekap absensi.
                    </Typography>
                </Box>
            </Paper>
        );
    }

    const daysMap = safeData[0]?.attendance || {};
    const dayNumbers = Object.keys(daysMap).sort((a, b) => Number(a) - Number(b));

    return (
        <Paper 
            elevation={0} 
            sx={{ 
                width: '100%', 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden',
                border: '1px solid #e2e8f0',
                borderRadius: 1, 
                bgcolor: '#fff'
            }}
        >
            <TableContainer sx={{ flexGrow: 1 }}>
                <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
                    <TableHead>
                        <TableRow>
                            {/* Sticky Columns Group */}
                            <TableCell sx={{ position: 'sticky', left: 0, zIndex: 10, width: 220, bgcolor: '#f8fafc', borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PersonIcon fontSize="small" color="disabled" />
                                    NAMA KARYAWAN
                                </Box>
                            </TableCell>
                            <TableCell sx={{ position: 'sticky', left: 220, zIndex: 10, width: 120, bgcolor: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>
                                PTRJ ID
                            </TableCell>
                             <TableCell sx={{ position: 'sticky', left: 340, zIndex: 10, width: 180, bgcolor: '#f8fafc', borderRight: '2px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.05)' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <WorkIcon fontSize="small" color="disabled" />
                                    CHARGE JOB
                                </Box>
                            </TableCell>

                            {/* Date Columns */}
                            {dayNumbers.map((day) => {
                                const dayData = daysMap[day];
                                const isHoliday = dayData?.isHoliday;
                                const isSunday = dayData?.isSunday;
                                
                                return (
                                    <TableCell
                                        key={day}
                                        align="center"
                                        sx={{
                                            width: 45,
                                            p: '4px !important',
                                            bgcolor: isHoliday ? '#fef2f2' : (isSunday ? '#f8fafc' : '#ffffff'),
                                            color: isHoliday ? '#ef4444' : (isSunday ? '#64748b' : 'inherit'),
                                            borderRight: '1px solid #f1f5f9'
                                        }}
                                    >
                                        <Box sx={{ lineHeight: 1 }}>
                                            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, fontSize: '0.85rem' }}>
                                                {day}
                                            </Typography>
                                            <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.8 }}>
                                                {dayData?.dayName?.substring(0, 3)}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                );
                            })}

                            {/* Summary Headers */}
                            <TableCell sx={{ width: 60, bgcolor: '#f1f5f9', fontWeight: 'bold', fontSize: '0.75rem', borderLeft: '2px solid #e2e8f0', textAlign: 'center' }}>
                                HADIR
                            </TableCell>
                            <TableCell sx={{ width: 60, bgcolor: '#f1f5f9', fontWeight: 'bold', fontSize: '0.75rem', textAlign: 'center' }}>
                                OT (Jam)
                            </TableCell>
                            <TableCell sx={{ width: 60, bgcolor: '#f1f5f9', fontWeight: 'bold', fontSize: '0.75rem', textAlign: 'center', color: '#b91c1c' }}>
                                ALFA
                            </TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {safeData.map((employee, index) => {
                            // Find charge job (Take first valid one found in the month)
                            // We scan all days to find a non-empty charge job
                            let chargeJobDisplay = '-';
                            for (const d of dayNumbers) {
                                const job = employee.attendance[d]?.chargeJob;
                                if (job && job !== '-' && job !== '') {
                                    chargeJobDisplay = job;
                                    break;
                                }
                            }

                            const isEven = index % 2 === 0;

                            // Calculate Totals
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
                                        bgcolor: isEven ? '#ffffff' : '#f8fafc',
                                        '&:hover': { bgcolor: '#f1f5f9 !important' }
                                    }}
                                >
                                    {/* 1. Name Column (Sticky) */}
                                    <TableCell sx={{ position: 'sticky', left: 0, zIndex: 5, bgcolor: 'inherit', borderRight: '1px solid #e2e8f0', fontWeight: 600, color: '#1e293b', py: 1, boxShadow: '2px 0 5px -2px rgba(0,0,0,0.05)' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem', bgcolor: theme => theme.palette.primary.light }}>
                                                {employee.name.charAt(0)}
                                            </Avatar>
                                            <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                                                {employee.name}
                                            </Typography>
                                        </Box>
                                    </TableCell>

                                    {/* 2. ID Column (Sticky) */}
                                    <TableCell sx={{ position: 'sticky', left: 220, zIndex: 5, bgcolor: 'inherit', borderRight: '1px solid #e2e8f0', color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                        {employee.ptrjEmployeeID}
                                    </TableCell>

                                     {/* 3. Charge Job (Sticky) */}
                                     <TableCell sx={{ position: 'sticky', left: 340, zIndex: 5, bgcolor: 'inherit', borderRight: '2px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.05)' }}>
                                        {chargeJobDisplay !== '-' && (
                                            <Tooltip title={chargeJobDisplay}>
                                                <Chip 
                                                    label={chargeJobDisplay} 
                                                    size="small" 
                                                    variant="outlined"
                                                    sx={{ height: 22, fontSize: '0.65rem', maxWidth: 160, borderColor: '#cbd5e1', borderRadius: '4px', color: '#475569' }} 
                                                />
                                            </Tooltip>
                                        )}
                                    </TableCell>

                                    {/* Data Cells */}
                                    {dayNumbers.map((day) => {
                                        const dayData = employee.attendance[day];
                                        if (!dayData) return <TableCell key={day} />;

                                        const style = getStatusStyle(dayData.status);
                                        const regHours = dayData.regularHours || 0;
                                        const otHours = dayData.overtimeHours || 0;
                                        const hasHours = regHours > 0 || otHours > 0;

                                        const tooltipContent = (
                                            <Box sx={{ p: 1 }}>
                                                <Typography variant="subtitle2" color="inherit">{dayData.date}</Typography>
                                                <Typography variant="body2">Status: <b>{dayData.status}</b></Typography>
                                                <Typography variant="body2">In/Out: {dayData.checkIn || '--:--'} - {dayData.checkOut || '--:--'}</Typography>
                                                <Typography variant="body2">Reg: {regHours}h | OT: {otHours}h</Typography>
                                                {dayData.chargeJob && dayData.chargeJob !== '-' && (
                                                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#94a3b8', borderTop: '1px solid #334155', pt: 0.5 }}>
                                                        {dayData.chargeJob}
                                                    </Typography>
                                                )}
                                            </Box>
                                        );

                                        let cellContent;
                                        const isStatusText = ['ALFA', 'OFF', 'Sakit', 'Izin', 'Cuti', 'S', 'I', 'CT', 'Incomplete'].includes(dayData.status);

                                        if (isStatusText) {
                                            cellContent = (
                                                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                                                    {dayData.status === 'Incomplete' ? '?' : dayData.status.substring(0, 3).toUpperCase()}
                                                </Typography>
                                            );
                                        } else {
                                            cellContent = (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                                    {regHours > 0 && <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e293b' }}>{regHours}</Typography>}
                                                    {otHours > 0 && <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#c2410c', mt: -0.3 }}>{otHours}</Typography>}
                                                </Box>
                                            );
                                        }

                                        return (
                                            <Tooltip key={`${employee.id}-${day}`} title={tooltipContent} arrow placement="top">
                                                <TableCell align="center" padding="none" sx={{ bgcolor: hasHours ? '#ffffff' : style.bg, color: style.color, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', height: 40, transition: 'all 0.1s', position: 'relative', '&:hover': { filter: 'brightness(0.97)', cursor: 'crosshair', zIndex: 1 } }}>
                                                    {cellContent}
                                                </TableCell>
                                            </Tooltip>
                                        );
                                    })}

                                    {/* Summary Columns (Totals) */}
                                    <TableCell align="center" sx={{ borderLeft: '2px solid #e2e8f0', bgcolor: '#f8fafc', fontWeight: 'bold' }}>
                                        {totalHadir}
                                    </TableCell>
                                    <TableCell align="center" sx={{ bgcolor: '#f8fafc', fontWeight: 'bold' }}>
                                        {totalOT.toFixed(1).replace('.0', '')}
                                    </TableCell>
                                    <TableCell align="center" sx={{ bgcolor: '#fef2f2', color: '#b91c1c', fontWeight: 'bold' }}>
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
