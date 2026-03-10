import React from 'react';
import { Box, Paper, Typography, Tooltip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EventIcon from '@mui/icons-material/Event';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import PeopleIcon from '@mui/icons-material/People';

const AttendanceSummaryBar = ({ data = [] }) => {
    const totalEmployees = data.length;
    let present = 0, absent = 0, leave = 0, sick = 0;
    
    if (totalEmployees > 0) {
        data.forEach(emp => {
            const today = new Date().getDate();
            const d = emp.attendance?.[today] || emp.attendance?.['1'];
            const st = (d?.status || '').toUpperCase();
            if (st === 'HADIR') present++;
            else if (st === 'ALFA') absent++;
            else if (['CT', 'CUTI', 'I', 'IZIN'].includes(st)) leave++;
            else if (['S', 'SAKIT', 'SD'].includes(st)) sick++;
        });
    }

    const StatItem = ({ icon, label, value, color }) => (
        <Tooltip title={label}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 2, borderRight: '1px solid #DFE1E6' }}>
                {icon}
                <Typography variant="body2" sx={{ fontWeight: 800, color: color, fontSize: '0.85rem' }}>{value}</Typography>
            </Box>
        </Tooltip>
    );

    return (
        <Paper elevation={0} sx={{ 
            mb: 1, border: '1px solid #DFE1E6', borderRadius: 1.5, 
            display: 'flex', alignItems: 'center', bgcolor: '#fff', py: 0.5, px: 1,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled', px: 1, letterSpacing: '0.05em' }}>SNAPSHOT:</Typography>
            <StatItem icon={<PeopleIcon sx={{ fontSize: 16, color: '#42526E' }} />} label="Total Karyawan" value={totalEmployees} color="#172B4D" />
            <StatItem icon={<CheckCircleIcon sx={{ fontSize: 16, color: '#00875A' }} />} label="Hadir" value={present} color="#00875A" />
            <StatItem icon={<CancelIcon sx={{ fontSize: 16, color: '#DE350B' }} />} label="Absen" value={absent} color="#DE350B" />
            <StatItem icon={<EventIcon sx={{ fontSize: 16, color: '#0052CC' }} />} label="Izin/Cuti" value={leave} color="#0052CC" />
            <StatItem icon={<MedicalServicesIcon sx={{ fontSize: 16, color: '#FF991F' }} />} label="Sakit" value={sick} color="#FF991F" />
            
            <Box sx={{ flexGrow: 1 }} />
            
            {/* Minimalist Legend integrated into the bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#E8F5E9', border: '1px solid #C8E6C9' }} />
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary' }}>HADIR</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#FFEBEE', border: '1px solid #FFCDD2' }} />
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary' }}>ABSEN</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, border: '2px solid #2196F3', borderRadius: '2px' }} />
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#1976D2' }}>HARI INI</Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default AttendanceSummaryBar;
