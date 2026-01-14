import React from 'react';
import {
    Box,
    Paper,
    Typography,
    Chip,
    Divider,
    ToggleButtonGroup,
    ToggleButton
} from '@mui/material';
import {
    CheckCircle as CheckIcon,
    Cancel as CancelIcon,
    AccessTime as TimeIcon,
    Flight as FlightIcon,
    LocalHospital as HospitalIcon,
    Warning as WarningIcon,
    WbSunny as SunIcon
} from '@mui/icons-material';

const Legend = () => {
    const legendItems = [
        { icon: <CheckIcon sx={{ fontSize: 16, color: '#059669' }} />, label: 'Hadir', color: '#ecfdf5' },
        { icon: <TimeIcon sx={{ fontSize: 16, color: '#c2410c' }} />, label: 'Lembur', color: '#fff7ed' },
        { icon: <CancelIcon sx={{ fontSize: 16, color: '#ffffff' }} />, label: 'ALFA', color: '#7f1d1d' },
        { icon: <SunIcon sx={{ fontSize: 16, color: '#64748b' }} />, label: 'OFF (Libur)', color: '#f1f5f9' },
        { icon: <FlightIcon sx={{ fontSize: 16, color: '#1e40af' }} />, label: 'Cuti', color: '#eff6ff' },
        { icon: <HospitalIcon sx={{ fontSize: 16, color: '#b91c1c' }} />, label: 'Sakit', color: '#fee2e2' },
        { icon: <WarningIcon sx={{ fontSize: 16, color: '#b45309' }} />, label: 'Incomplete', color: '#fffbeb' },
    ];

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1.5,
                bgcolor: '#fafbfc',
                border: '1px solid #e5e7eb',
                borderRadius: 1
            }}
        >
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>
                Legenda Status
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {legendItems.map((item, index) => (
                    <Chip
                        key={index}
                        icon={item.icon}
                        label={item.label}
                        size="small"
                        sx={{
                            height: 26,
                            bgcolor: item.color,
                            color: item.label === 'ALFA' ? '#ffffff' : '#374151',
                            fontWeight: 500,
                            fontSize: '0.7rem',
                            border: '1px solid #e5e7eb',
                            '& .MuiChip-icon': {
                                ml: 1
                            }
                        }}
                    />
                ))}
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#1e293b' }}>7.5</Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem' }}>Jam Reguler</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#c2410c' }}>+2.5</Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.65rem' }}>Jam Lembur</Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default Legend;
