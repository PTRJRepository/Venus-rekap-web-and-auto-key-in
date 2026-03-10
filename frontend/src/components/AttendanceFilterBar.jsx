import React, { useMemo } from 'react';
import { Box, Paper, Typography, Chip, TextField, Button, Select, MenuItem, FormControl, InputLabel, InputAdornment, Grid, Divider } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EventIcon from '@mui/icons-material/Event';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import FilterAltIcon from '@mui/icons-material/FilterAlt';

const STATUS_COLORS = {
    hadir: { bg: '#E8F5E9', text: '#2E7D32', border: '#C8E6C9' },
    alfa: { bg: '#FFEBEE', text: '#C62828', border: '#FFCDD2' },
    off: { bg: '#F5F5F5', text: '#616161', border: '#E0E0E0' },
    cuti: { bg: '#E3F2FD', text: '#1565C0', border: '#BBDEFB' },
    sakit: { bg: '#FFF9C4', text: '#F57F17', border: '#FFF59D' },
    overtime: { bg: '#F3E5F5', text: '#7B1FA2', border: '#E1BEE7' },
};

const SummaryCard = ({ icon, label, value, color, onClick, selected }) => (
    <Paper
        elevation={0}
        onClick={onClick}
        sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 1.5,
            borderRadius: 2,
            cursor: onClick ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
            border: selected ? `2px solid ${color}` : `1px solid ${color}20`,
            bgcolor: selected ? `${color}10` : 'white',
            '&:hover': onClick ? {
                transform: 'translateY(-2px)',
                boxShadow: `0 4px 8px ${color}20`,
                bgcolor: `${color}05`
            } : {},
        }}
    >
        <Box sx={{ color, mb: 0.5 }}>
            {React.cloneElement(icon, { sx: { fontSize: 20 } })}
        </Box>
        <Typography sx={{
            fontSize: '1.2rem',
            fontWeight: 800,
            color: color,
            lineHeight: 1,
            mb: 0.5
        }}>
            {value}
        </Typography>
        <Typography sx={{
            fontSize: '0.6rem',
            fontWeight: 700,
            color: 'text.secondary',
            textTransform: 'uppercase',
            textAlign: 'center'
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
            {/* KPI Section */}
            <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled', mb: 1.5, display: 'block', letterSpacing: '0.1em' }}>SUMMARY STATS (FILTERED)</Typography>
                <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                        <SummaryCard
                            icon={<CheckCircleIcon />} label="HADIR" value={summary.hadir}
                            color={STATUS_COLORS.hadir.text} onClick={() => onFilterChange?.(filter === 'hadir' ? 'all' : 'hadir')}
                            selected={filter === 'hadir'}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <SummaryCard
                            icon={<CancelIcon />} label="ALFA" value={summary.alfa}
                            color={STATUS_COLORS.alfa.text} onClick={() => onFilterChange?.(filter === 'alfa' ? 'all' : 'alfa')}
                            selected={filter === 'alfa'}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <SummaryCard
                            icon={<WbSunnyIcon />} label="OFF/LIBUR" value={summary.off}
                            color={STATUS_COLORS.off.text} onClick={() => onFilterChange?.(filter === 'off' ? 'all' : 'off')}
                            selected={filter === 'off'}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <SummaryCard
                            icon={<EventIcon />} label="CUTI/IZIN" value={summary.cuti}
                            color={STATUS_COLORS.cuti.text} onClick={() => onFilterChange?.(filter === 'cuti' ? 'all' : 'cuti')}
                            selected={filter === 'cuti'}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <SummaryCard
                            icon={<MedicalServicesIcon />} label="SAKIT" value={summary.sakit}
                            color={STATUS_COLORS.sakit.text} onClick={() => onFilterChange?.(filter === 'sakit' ? 'all' : 'sakit')}
                            selected={filter === 'sakit'}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <SummaryCard
                            icon={<AccessTimeIcon />} label="TOTAL OT" value={`${summary.totalOvertime}h`}
                            color={STATUS_COLORS.overtime.text} onClick={() => onFilterChange?.(filter === 'overtime' ? 'all' : 'overtime')}
                            selected={filter === 'overtime'}
                        />
                    </Grid>
                </Grid>
            </Box>

            <Divider />

            {/* Filter Section */}
            <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled', mb: 1.5, display: 'block', letterSpacing: '0.1em' }}>FILTER PARAMETERS</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Status Kehadiran</InputLabel>
                        <Select value={filter} label="Status Kehadiran" onChange={(e) => onFilterChange?.(e.target.value)}>
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
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>Range Overtime Per Hari (Jam)</Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <TextField
                                size="small" label="Min" type="number" value={overtimeMin}
                                onChange={(e) => onOvertimeMinChange?.(e.target.value)}
                                InputProps={{ endAdornment: <InputAdornment position="end">h</InputAdornment> }}
                            />
                            <TextField
                                size="small" label="Max" type="number" value={overtimeMax}
                                onChange={(e) => onOvertimeMaxChange?.(e.target.value)}
                                InputProps={{ endAdornment: <InputAdornment position="end">h</InputAdornment> }}
                            />
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                            * Hanya jam dlm range yang muncul di matrix & dihitung.
                        </Typography>
                    </Box>

                    <Button 
                        fullWidth 
                        variant="contained" 
                        color="primary" 
                        startIcon={<FilterAltIcon />} 
                        onClick={() => onApplyFilter?.(filter, overtimeMin, overtimeMax)}
                        sx={{ fontWeight: 800, height: 40, mt: 1, boxShadow: '0 4px 10px rgba(0, 82, 204, 0.2)' }}
                    >
                        TERAPKAN PARAMETER
                    </Button>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button fullWidth variant="outlined" size="small" startIcon={<RestartAltIcon />} onClick={onReset} sx={{ fontWeight: 700 }}>Reset</Button>
                        {showExport && (
                            <Button fullWidth variant="contained" size="small" startIcon={<PictureAsPdfIcon />} onClick={onExportPdf} sx={{ fontWeight: 700, bgcolor: '#D32F2F', '&:hover': { bgcolor: '#B71C1C' } }}>PDF</Button>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default AttendanceFilterBar;
