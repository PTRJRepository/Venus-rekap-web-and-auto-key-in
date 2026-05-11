import React, { useMemo } from 'react';
import { Box, Paper, Typography, Tooltip, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EventIcon from '@mui/icons-material/Event';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import PeopleIcon from '@mui/icons-material/People';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { alpha } from '@mui/material/styles';

const AttendanceSummaryBar = ({ data = [], isFiltered = false }) => {
    const totalEmployees = data.length;

    // Memoize stats calculation to prevent recalculation on every render
    const stats = useMemo(() => {
        let present = 0, absent = 0, leave = 0, sick = 0, totalOt = 0;

        if (totalEmployees > 0) {
            data.forEach(emp => {
                Object.values(emp.attendance || {}).forEach(day => {
                    const st = (day?.status || '').toUpperCase();
                    const ot = Number(day?.overtimeHours) || 0;
                    if (st === 'HADIR') present++;
                    else if (st === 'ALFA') absent++;
                    else if (['CT', 'CUTI', 'I', 'IZIN'].includes(st)) leave++;
                    else if (['S', 'SAKIT', 'SD'].includes(st)) sick++;
                    totalOt += ot;
                });
            });
        }

        return { present, absent, leave, sick, totalOt };
    }, [data, totalEmployees]);

    // Destructure memoized stats
    const { present, absent, leave, sick, totalOt } = stats;

    const StatItem = ({ icon, label, value, color, filterLabel }) => (
        <Tooltip title={isFiltered ? `${filterLabel}: ${label}` : label} arrow>
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 2, borderRight: '1px solid #DFE1E6',
                cursor: 'default',
                '&:last-child': { borderRight: 'none' },
            }}>
                <Box sx={{ color: alpha(color, 0.85), display: 'flex' }}>{icon}</Box>
                <Box>
                    <Typography variant="body2" sx={{
                        fontWeight: 800, color: color, fontSize: '0.9rem', lineHeight: 1,
                    }}>
                        {value}
                    </Typography>
                    <Typography sx={{
                        fontSize: '0.6rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {label}
                    </Typography>
                </Box>
            </Box>
        </Tooltip>
    );

    return (
        <Paper elevation={0} sx={{
            mb: 1, border: '1px solid #DFE1E6', borderRadius: 2,
            display: 'flex', alignItems: 'center',
            bgcolor: isFiltered ? '#f8f5ff' : '#fff',
            borderColor: isFiltered ? '#ddd6fe' : '#DFE1E6',
            boxShadow: isFiltered ? '0 2px 8px rgba(124,58,237,0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
            transition: 'all 0.3s ease', py: 0.6, px: 1,
        }}>
            {/* Label Badge */}
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, mr: 1,
                bgcolor: isFiltered ? alpha('#7C3AED', 0.1) : alpha('#0F2040', 0.05),
                borderRadius: 1.5, py: 0.5,
            }}>
                {isFiltered
                    ? <FilterAltIcon sx={{ fontSize: 14, color: '#7C3AED' }} />
                    : <PeopleIcon sx={{ fontSize: 14, color: '#0F2040' }} />
                }
                <Typography variant="caption" sx={{
                    fontWeight: 900, color: isFiltered ? '#7C3AED' : '#0F2040',
                    letterSpacing: '0.08em', fontSize: '0.7rem',
                }}>
                    {isFiltered ? 'FILTERED' : 'SNAPSHOT'}
                </Typography>
            </Box>

            {/* Stats */}
            <StatItem icon={<PeopleIcon sx={{ fontSize: 18 }} />} label="Total" value={totalEmployees} color="#0F2040" filterLabel="Karyawan" />
            <StatItem icon={<CheckCircleIcon sx={{ fontSize: 18 }} />} label="Hadir" value={present} color="#1B5E20" filterLabel="Hari Hadir" />
            <StatItem icon={<CancelIcon sx={{ fontSize: 18 }} />} label="Alfa" value={absent} color="#B71C1C" filterLabel="Hari Alfa" />
            <StatItem icon={<EventIcon sx={{ fontSize: 18 }} />} label="Izin/Cuti" value={leave} color="#1E40AF" filterLabel="Hari Izin/Cuti" />
            <StatItem icon={<MedicalServicesIcon sx={{ fontSize: 18 }} />} label="Sakit" value={sick} color="#B45309" filterLabel="Hari Sakit" />
            <StatItem icon={<FilterAltIcon sx={{ fontSize: 18 }} />} label="Total OT" value={`${totalOt}h`} color="#6D28D9" filterLabel="Jam Filter" />

            <Box sx={{ flexGrow: 1 }} />

            {isFiltered && (
                <Chip
                    label="FILTER AKTIF"
                    size="small"
                    sx={{ height: 22, fontSize: '0.65rem', fontWeight: 800, bgcolor: '#7C3AED', color: '#fff', mr: 1 }}
                />
            )}
        </Paper>
    );
};

export default React.memo(AttendanceSummaryBar);
