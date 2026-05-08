import React, { useMemo } from 'react';
import {
    Box, Paper, Typography, Chip, TextField, Button, Select, MenuItem,
    FormControl, InputLabel, InputAdornment, Grid, Divider
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EventIcon from '@mui/icons-material/Event';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { alpha } from '@mui/material/styles';

const STATUS_COLORS = {
    hadir:    { bg: '#E8F5E9', text: '#1B5E20', border: '#C8E6C9', chip: '#36B37E' },
    alfa:     { bg: '#FFEBEE', text: '#B71C1C', border: '#FFCDD2', chip: '#DE350B' },
    off:      { bg: '#F4F5F5', text: '#616161', border: '#E0E0E0', chip: '#5E6C84' },
    cuti:     { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE', chip: '#0052CC' },
    sakit:    { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', chip: '#D97706' },
    overtime: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', chip: '#7C3AED' },
};

const SummaryCard = ({ icon, label, value, color, onClick, selected }) => (
    <Paper
        elevation={0}
        onClick={onClick}
        sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', p: 2, borderRadius: 2,
            cursor: onClick ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
            border: selected ? `2px solid ${color}` : `1px solid ${alpha(color, 0.15)}`,
            bgcolor: selected ? alpha(color, 0.06) : '#fff',
            '&:hover': onClick ? {
                transform: 'translateY(-2px)',
                boxShadow: `0 6px 16px ${alpha(color, 0.18)}`,
                bgcolor: alpha(color, 0.04),
            } : {},
        }}
    >
        <Box sx={{ color, mb: 0.5 }}>
            {React.cloneElement(icon, { sx: { fontSize: 22 } })}
        </Box>
        <Typography sx={{
            fontSize: '1.3rem', fontWeight: 800, color, lineHeight: 1, mb: 0.5,
        }}>
            {value}
        </Typography>
        <Typography sx={{
            fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary',
            textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center',
        }}>
            {label}
        </Typography>
    </Paper>
);

const AttendanceFilterBar = ({
    data = [],
    filter = 'all',
    onFilterChange,
    overtimeMin = '',
    overtimeMax = '',
    onOvertimeMinChange,
    onOvertimeMaxChange,
    onReset,
    onExportPdf,
    onApplyFilter,
    showExport = true,
}) => {
    const summary = useMemo(() => {
        const totals = { hadir: 0, alfa: 0, off: 0, cuti: 0, sakit: 0, totalOvertime: 0, totalEmployees: data.length };
        data.forEach(emp => {
            Object.values(emp.attendance || {}).forEach(day => {
                const st = (day.status || '').toUpperCase();
                const otHours = Number(day.overtimeHours) || 0;
                if (st === 'HADIR') totals.hadir++;
                else if (st === 'ALFA') totals.alfa++;
                else if (st === 'OFF' || st === 'LIBUR') totals.off++;
                else if (['CT', 'CUTI', 'I', 'IZIN'].includes(st)) totals.cuti++;
                else if (['S', 'SAKIT', 'SD'].includes(st)) totals.sakit++;
                if (otHours > 0) totals.totalOvertime += otHours;
            });
        });
        return totals;
    }, [data]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* KPI Summary Cards */}
            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <FilterAltIcon sx={{ fontSize: 16, color: '#0052CC' }} />
                    <Typography variant="caption" sx={{
                        fontWeight: 800, color: '#0052CC', letterSpacing: '0.08em',
                    }}>
                        SUMMARY STATISTICS
                    </Typography>
                </Box>
                <Grid container spacing={1.5}>
                    {[
                        { key: 'hadir', icon: <CheckCircleIcon />, label: 'HADIR', color: STATUS_COLORS.hadir.text },
                        { key: 'alfa', icon: <CancelIcon />, label: 'ALFA', color: STATUS_COLORS.alfa.text },
                        { key: 'off', icon: <WbSunnyIcon />, label: 'OFF', color: STATUS_COLORS.off.text },
                        { key: 'cuti', icon: <EventIcon />, label: 'CUTI/IZIN', color: STATUS_COLORS.cuti.text },
                        { key: 'sakit', icon: <MedicalServicesIcon />, label: 'SAKIT', color: STATUS_COLORS.sakit.text },
                        { key: 'overtime', icon: <AccessTimeIcon />, label: 'TOTAL OT', color: STATUS_COLORS.overtime.text },
                    ].map(({ key, icon, label, color }) => (
                        <Grid item xs={6} key={key}>
                            <SummaryCard
                                icon={icon} label={label}
                                value={key === 'overtime' ? `${summary.totalOvertime}h` : summary[key]}
                                color={color}
                                onClick={() => onFilterChange?.(filter === key ? 'all' : key)}
                                selected={filter === key}
                            />
                        </Grid>
                    ))}
                </Grid>
            </Box>

            <Divider />

            {/* Filter Parameters */}
            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Typography variant="caption" sx={{
                        fontWeight: 800, color: 'text.disabled', letterSpacing: '0.08em',
                    }}>
                        FILTER PARAMETERS
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Status Kehadiran</InputLabel>
                        <Select
                            value={filter}
                            label="Status Kehadiran"
                            onChange={(e) => onFilterChange?.(e.target.value)}
                        >
                            <MenuItem value="all">Semua Status</MenuItem>
                            <MenuItem value="hadir">Hadir Saja</MenuItem>
                            <MenuItem value="alfa">Alfa Saja</MenuItem>
                            <MenuItem value="off">Off/Libur</MenuItem>
                            <MenuItem value="cuti">Cuti/Izin</MenuItem>
                            <MenuItem value="sakit">Sakit</MenuItem>
                            <MenuItem value="overtime">Ada Overtime</MenuItem>
                        </Select>
                    </FormControl>

                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'text.secondary', mb: 1 }}>
                            Range Overtime Per Hari (Jam)
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                            <TextField
                                size="small" label="Min" type="number" value={overtimeMin}
                                onChange={(e) => onOvertimeMinChange?.(e.target.value)}
                                InputProps={{ endAdornment: <InputAdornment position="end">h</InputAdornment> }}
                                sx={{ flex: 1 }}
                            />
                            <Typography sx={{ color: 'text.disabled', fontSize: '0.8rem' }}>—</Typography>
                            <TextField
                                size="small" label="Max" type="number" value={overtimeMax}
                                onChange={(e) => onOvertimeMaxChange?.(e.target.value)}
                                InputProps={{ endAdornment: <InputAdornment position="end">h</InputAdornment> }}
                                sx={{ flex: 1 }}
                            />
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                            * Hanya jam dalam range yang muncul di matrix &amp; dihitung.
                        </Typography>
                    </Box>

                    <Button
                        fullWidth variant="contained" color="primary"
                        startIcon={<FilterAltIcon />}
                        onClick={() => onApplyFilter?.(filter, overtimeMin, overtimeMax)}
                        sx={{ fontWeight: 800, height: 40 }}
                    >
                        TERAPKAN PARAMETER
                    </Button>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            fullWidth variant="outlined" size="small"
                            startIcon={<RestartAltIcon />}
                            onClick={onReset}
                            sx={{ fontWeight: 700 }}
                        >
                            Reset
                        </Button>
                        {showExport && (
                            <Button
                                fullWidth variant="contained" size="small"
                                startIcon={<PictureAsPdfIcon />}
                                onClick={onExportPdf}
                                sx={{ fontWeight: 700, bgcolor: '#DE350B', '&:hover': { bgcolor: '#BF2600' } }}
                            >
                                PDF
                            </Button>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default AttendanceFilterBar;
