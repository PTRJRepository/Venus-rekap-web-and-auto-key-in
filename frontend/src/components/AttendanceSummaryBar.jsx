import React from 'react';
import { Box, Paper, Typography, Tooltip, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EventIcon from '@mui/icons-material/Event';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import PeopleIcon from '@mui/icons-material/People';
import FilterAltIcon from '@mui/icons-material/FilterAlt';

const AttendanceSummaryBar = ({ data = [], isFiltered = false }) => {
    const totalEmployees = data.length;
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

    const StatItem = ({ icon, label, value, color, filterLabel }) => (
        <Tooltip title={isFiltered ? `${filterLabel}: ${label}` : label}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 2, borderRight: '1px solid #DFE1E6' }}>
                {icon}
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: color, fontSize: '0.85rem', lineHeight: 1 }}>{value}</Typography>
                    {isFiltered && (
                        <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                            {filterLabel}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Tooltip>
    );

    return (
        <Paper elevation={0} sx={{ 
            mb: 1, border: '1px solid #DFE1E6', borderRadius: 1.5, 
            display: 'flex', alignItems: 'center', bgcolor: isFiltered ? '#f5f3ff' : '#fff', py: 0.8, px: 1,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            transition: 'all 0.3s ease'
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1 }}>
                {isFiltered ? <FilterAltIcon sx={{ fontSize: 14, color: '#7c3aed' }} /> : <PeopleIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
                <Typography variant="caption" sx={{ fontWeight: 900, color: isFiltered ? '#7c3aed' : 'text.disabled', letterSpacing: '0.05em' }}>
                    {isFiltered ? 'HASIL FILTER:' : 'SNAPSHOT:'}
                </Typography>
            </Box>

            <StatItem icon={<PeopleIcon sx={{ fontSize: 16, color: '#42526E' }} />} label="Karyawan" value={totalEmployees} color="#172B4D" filterLabel="MATCH" />
            <StatItem icon={<CheckCircleIcon sx={{ fontSize: 16, color: '#00875A' }} />} label="Hadir" value={present} color="#00875A" filterLabel="HARI" />
            <StatItem icon={<CancelIcon sx={{ fontSize: 16, color: '#DE350B' }} />} label="Absen" value={absent} color="#DE350B" filterLabel="HARI" />
            <StatItem icon={<EventIcon sx={{ fontSize: 16, color: '#0052CC' }} />} label="Izin/Cuti" value={leave} color="#0052CC" filterLabel="HARI" />
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 2, borderRight: '1px solid #DFE1E6' }}>
                <FilterAltIcon sx={{ fontSize: 16, color: '#7c3aed' }} />
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 900, color: '#7c3aed', fontSize: '0.85rem', lineHeight: 1 }}>{totalOt}h</Typography>
                    <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                        JAM FILTER
                    </Typography>
                </Box>
            </Box>
            
            <Box sx={{ flexGrow: 1 }} />
            
            {isFiltered && (
                <Chip 
                    label="FILTER AKTIF" 
                    size="small" 
                    sx={{ height: 20, fontSize: '0.6rem', fontWeight: 900, bgcolor: '#7c3aed', color: 'white' }} 
                />
            )}
        </Paper>
    );
};

export default AttendanceSummaryBar;
