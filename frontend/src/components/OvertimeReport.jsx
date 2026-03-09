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
    Chip,
    Avatar,
    TextField,
    Button
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import FilterAltIcon from '@mui/icons-material/FilterAlt';

/**
 * Extract station name from chargeJob field
 */
const getStation = (chargeJob) => {
    if (!chargeJob || chargeJob === '-') return 'Tidak Diketahui';
    const parts = chargeJob.split('/');
    const firstPart = parts[0]?.trim() || '';
    if (!firstPart) return 'Tidak Diketahui';
    const match = firstPart.match(/^\([^)]+\)\s*(.+)$/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return firstPart;
};

/**
 * Main Overtime Report Component
 */
const OvertimeReport = ({ data = [] }) => {
    const safeData = Array.isArray(data) ? data : [];

    // Filter State
    const [minHours, setMinHours] = useState('');
    const [maxHours, setMaxHours] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Calculate total overtime and filter employees
    const filteredEmployees = useMemo(() => {
        const result = safeData.map(emp => {
            let totalOt = 0;
            if (emp.attendance) {
                Object.values(emp.attendance).forEach(day => {
                    const ot = Number(day.overtimeHours) || 0;
                    totalOt += ot;
                });
            }
            return {
                ...emp,
                totalOvertime: totalOt,
                station: getStation(emp.chargeJob) // For display grouping if needed
            };
        });

        const min = minHours === '' ? 0 : Number(minHours);
        const max = maxHours === '' ? Infinity : Number(maxHours);

        return result.filter(emp => {
            // Apply Range Filter
            if (emp.totalOvertime < min || emp.totalOvertime > max) return false;

            // Apply Search Filter (Name or ID)
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                const nameMatch = (emp.name || '').toLowerCase().includes(searchLower);
                const idMatch = (emp.ptrjEmployeeID || '').toLowerCase().includes(searchLower);
                if (!nameMatch && !idMatch) return false;
            }

            // Exclude employees with 0 overtime if no min is set, assuming we only want to see people who *did* overtime
            // But if user explicitly sets min=0, then show them.
            if (minHours === '' && emp.totalOvertime === 0) return false;

            return true;
        }).sort((a, b) => b.totalOvertime - a.totalOvertime); // Sort highest OT first
    }, [safeData, minHours, maxHours, searchTerm]);

    const handleClearFilters = () => {
        setMinHours('');
        setMaxHours('');
        setSearchTerm('');
    };

    if (safeData.length === 0) {
        return (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">Pilih Periode untuk menampilkan data</Typography>
            </Box>
        );
    }

    return (
        <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden' }}>
            {/* Header & Filters */}
            <Box sx={{ p: 2, borderBottom: '1px solid #e5e7eb', bgcolor: '#f9fafb' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                        ⏱️ Report Lembur Karyawan
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip label={`${filteredEmployees.length} Karyawan`} size="small" sx={{ bgcolor: '#ffedd5', color: '#c2410c', fontWeight: 600 }} />
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        placeholder="Cari Nama / ID"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        sx={{ bgcolor: 'white', minWidth: 200 }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'white', p: 0.5, borderRadius: 1, border: '1px solid #e5e7eb' }}>
                        <FilterAltIcon fontSize="small" sx={{ color: '#6b7280', ml: 0.5 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#4b5563' }}>Range Jam:</Typography>
                        <TextField
                            size="small"
                            type="number"
                            placeholder="Min"
                            value={minHours}
                            onChange={(e) => setMinHours(e.target.value)}
                            sx={{ width: 80, '& input': { py: 0.5, textAlign: 'center' } }}
                        />
                        <Typography variant="body2" sx={{ color: '#9ca3af' }}>-</Typography>
                        <TextField
                            size="small"
                            type="number"
                            placeholder="Max"
                            value={maxHours}
                            onChange={(e) => setMaxHours(e.target.value)}
                            sx={{ width: 80, '& input': { py: 0.5, textAlign: 'center' } }}
                        />
                    </Box>
                    {(minHours !== '' || maxHours !== '' || searchTerm !== '') && (
                        <Button size="small" variant="text" color="inherit" onClick={handleClearFilters} sx={{ textTransform: 'none', color: '#6b7280' }}>
                            Reset Filter
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Table */}
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: '#f1f5f9', width: 50, textAlign: 'center' }}>No.</TableCell>
                            <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>Karyawan</TableCell>
                            <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>PTRJ ID</TableCell>
                            <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>Stasiun (Charge Job)</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>Total Jam Lembur</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredEmployees.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4, color: '#6b7280' }}>
                                    Tidak ada data karyawan lembur yang sesuai filter.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEmployees.map((emp, index) => (
                                <TableRow key={emp.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                    <TableCell align="center" sx={{ color: '#6b7280', fontSize: '0.8rem' }}>
                                        {index + 1}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8rem' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.8rem', bgcolor: '#f97316' }}>
                                                {emp.name?.charAt(0) || '?'}
                                            </Avatar>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{emp.name}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8rem', color: '#4b5563' }}>
                                        {emp.ptrjEmployeeID || '-'}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8rem' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <BusinessIcon sx={{ color: '#9ca3af', fontSize: 16 }} />
                                            <Typography variant="body2" sx={{ color: '#4b5563' }}>{emp.station}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#c2410c' }}>
                                            {emp.totalOvertime} Jam
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default OvertimeReport;
