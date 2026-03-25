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
    Collapse,
    IconButton,
    Chip,
    Button,
    TextField,
    Grid,
    Divider
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import BusinessIcon from '@mui/icons-material/Business';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PeopleIcon from '@mui/icons-material/People';
import HistoryIcon from '@mui/icons-material/History';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const getStation = (chargeJob) => {
    if (!chargeJob || chargeJob === '-') return 'Tidak Diketahui';
    const parts = chargeJob.split('/');
    const firstPart = parts[0]?.trim() || '';
    if (!firstPart) return 'Tidak Diketahui';
    const match = firstPart.match(/^\([^)]+\)\s*(.+)$/);
    if (match && match[1]) return match[1].trim();
    return firstPart;
};

const StationRow = ({ station, employees, stats, open: controlledOpen, onToggle }) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const handleToggle = onToggle || (() => setInternalOpen(!internalOpen));

    return (
        <>
            <TableRow hover onClick={handleToggle} sx={{ cursor: 'pointer', bgcolor: open ? '#f0fdf4' : 'inherit' }}>
                <TableCell sx={{ width: 50 }}>
                    <IconButton size="small">{open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}</IconButton>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon sx={{ color: '#7c3aed', fontSize: 18 }} />
                        {station}
                        <Chip label={`${employees.length} org`} size="small" sx={{ ml: 1, bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 700, height: 20 }} />
                    </Box>
                </TableCell>
                <TableCell align="center">
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <Typography sx={{ fontWeight: 700, color: '#b45309' }}>{stats.hariDalamRange} Hari</Typography>
                        <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: '#d97706' }}>{stats.totalJamOTRange}h</Typography>
                    </Box>
                </TableCell>
                <TableCell align="center">
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <Typography sx={{ fontWeight: 800, color: '#7c3aed' }}>{stats.totalJamOTRange}h</Typography>
                        <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: '#a78bfa' }}>avg: {(employees.length > 0 ? (stats.totalJamOTRange / employees.length).toFixed(1) : 0)}h/org</Typography>
                    </Box>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: '#fafafa' }}>
                            <Table size="small" sx={{ bgcolor: 'white', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                        <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem' }}>NAMA KARYAWAN</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.7rem' }}>ID</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.7rem', color: '#b45309' }}>HARI DLM RANGE</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.7rem', color: '#7c3aed' }}>JAM OT DLM RANGE</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {employees.map((emp) => (
                                        <TableRow key={emp.id} hover>
                                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{emp.name}</TableCell>
                                            <TableCell align="center" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{emp.id}</TableCell>
                                            <TableCell align="center" sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#b45309' }}>{emp.hariDalamRange}</TableCell>
                                            <TableCell align="center" sx={{ fontSize: '0.8rem', fontWeight: 800, color: '#7c3aed' }}>{emp.totalJamOTRange}h</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow sx={{ bgcolor: '#F1F5F9', fontWeight: 800 }}>
                                        <TableCell colSpan={2} sx={{ fontWeight: 800, fontSize: '0.75rem', color: '#1E293B' }}>SUBTOTAL {station}</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.8rem', color: '#b45309' }}>{stats.hariDalamRange}</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.8rem', color: '#7c3aed' }}>{stats.totalJamOTRange}h</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
};

const OvertimeRangeReport = ({
    data = [],
    filter = 'all',
    overtimeMin = '',
    overtimeMax = '',
    month = 1,
    year = 2026,
    appliedFilter = 'all'
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const { stationData, totalStats } = useMemo(() => {
        const minOt = overtimeMin === '' ? 0 : Number(overtimeMin);
        const maxOt = overtimeMax === '' ? Infinity : Number(overtimeMax);
        const stationMap = {};

        data.forEach(emp => {
            const station = getStation(emp.chargeJob);
            if (!stationMap[station]) {
                stationMap[station] = { station, employees: [], stats: { totalKaryawan: 0, hariDalamRange: 0, totalJamOTRange: 0 } };
            }

            let hariDalamRange = 0;
            let totalJamOTRange = 0;

            // Di sini logic kuncinya: Hanya hitung hari & jam yang masuk range
            Object.values(emp.attendance || {}).forEach(day => {
                const otHours = Number(day.overtimeHours) || 0;
                if (otHours >= minOt && otHours <= maxOt && otHours > 0) {
                    hariDalamRange++;
                    totalJamOTRange += otHours;
                }
            });

            if (hariDalamRange > 0) {
                stationMap[station].employees.push({ ...emp, hariDalamRange, totalJamOTRange });
                stationMap[station].stats.totalKaryawan++;
                stationMap[station].stats.hariDalamRange += hariDalamRange;
                stationMap[station].stats.totalJamOTRange += totalJamOTRange;
            }
        });

        const totals = { totalKaryawan: 0, totalHariRange: 0, grandTotalJamOTRange: 0 };
        Object.values(stationMap).forEach(s => {
            totals.totalKaryawan += s.stats.totalKaryawan;
            totals.totalHariRange += s.stats.hariDalamRange;
            totals.grandTotalJamOTRange += s.stats.totalJamOTRange;
        });

        return { 
            stationData: Object.values(stationMap).sort((a, b) => a.station.localeCompare(b.station)), 
            totalStats: totals 
        };
    }, [data, overtimeMin, overtimeMax]);

    const filteredStationData = useMemo(() => {
        if (!searchTerm) return stationData;
        const s = searchTerm.toLowerCase();
        return stationData.map(st => ({
            ...st,
            employees: st.employees.filter(e => e.name?.toLowerCase().includes(s) || e.id?.toLowerCase().includes(s))
        })).filter(st => st.employees.length > 0);
    }, [stationData, searchTerm]);

    const handleExportPDF = () => {
        const doc = new jsPDF('p');
        doc.setFillColor(15, 32, 64);
        doc.rect(0, 0, 210, 45, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.text('LAPORAN LEMBUR PER RANGE', 105, 15, { align: 'center' });
        doc.setFontSize(11);
        doc.text(`Periode: ${monthNames[month-1]} ${year} | Range: ${overtimeMin || '0'}-${overtimeMax || '∞'} Jam`, 105, 25, { align: 'center' });
        
        let y = 55;
        filteredStationData.forEach(st => {
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text(`${st.station} (${st.employees.length} Karyawan)`, 15, y);
            y += 5;
            const rows = st.employees.map((e, i) => [i+1, e.name, e.id, e.hariDalamRange, `${e.totalJamOTRange}h`]);
            autoTable(doc, {
                head: [['No', 'Nama', 'ID', 'Hari dlm Range', 'Total Jam OT Range']],
                body: rows,
                startY: y,
                theme: 'grid',
                headStyles: { fillColor: [124, 58, 237] },
                margin: { left: 15 }
            });
            y = doc.lastAutoTable.finalY + 10;
            if (y > 270) { doc.addPage(); y = 20; }
        });

        doc.save(`Report_Range_OT_${overtimeMin}_${overtimeMax}.pdf`);
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
            <Box sx={{ mb: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 900, color: '#1e293b', mb: 1 }}>REPORT RANGE LEMBUR</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <Chip icon={<HistoryIcon />} label={`Range: ${overtimeMin || '0'} - ${overtimeMax || '∞'} Jam`} color="secondary" sx={{ fontWeight: 700 }} />
                    <Chip label={`Status: ${appliedFilter.toUpperCase()}`} variant="outlined" sx={{ fontWeight: 700 }} />
                </Box>

                <Grid container spacing={2}>
                    <Grid item xs={4}>
                        <Paper sx={{ p: 2, borderLeft: '4px solid #3b82f6', bgcolor: '#eff6ff' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#1d4ed8' }}>TOTAL KARYAWAN TERDAMPAK</Typography>
                            <Typography variant="h4" sx={{ fontWeight: 900 }}>{totalStats.totalKaryawan}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={4}>
                        <Paper sx={{ p: 2, borderLeft: '4px solid #f59e0b', bgcolor: '#fffbeb' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#b45309' }}>TOTAL HARI DALAM RANGE</Typography>
                            <Typography variant="h4" sx={{ fontWeight: 900 }}>{totalStats.totalHariRange}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={4}>
                        <Paper sx={{ p: 2, borderLeft: '4px solid #7c3aed', bgcolor: '#f5f3ff' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#6d28d9' }}>TOTAL JAM OT DALAM RANGE</Typography>
                            <Typography variant="h4" sx={{ fontWeight: 900 }}>{totalStats.grandTotalJamOTRange}h</Typography>
                        </Paper>
                    </Grid>
                </Grid>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField size="small" placeholder="Cari Nama/ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} sx={{ width: 300, bgcolor: 'white' }} />
                <Box sx={{ flexGrow: 1 }} />
                <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={handleExportPDF} sx={{ bgcolor: '#dc2626', fontWeight: 800 }}>EXPORT REPORT RANGE</Button>
            </Box>

            <TableContainer component={Paper} sx={{ flexGrow: 1, boxShadow: 'none', border: '1px solid #e2e8f0' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: '#1e293b', color: 'white', width: 50 }} />
                            <TableCell sx={{ bgcolor: '#1e293b', color: 'white', fontWeight: 800 }}>STASIUN / DEPARTEMEN</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#1e293b', color: 'white', fontWeight: 800 }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <Typography sx={{ fontSize: '0.7rem' }}>HARI DALAM RANGE</Typography>
                                    <Typography sx={{ fontSize: '0.55rem', opacity: 0.8 }}>Total Jam</Typography>
                                </Box>
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#1e293b', color: 'white', fontWeight: 800 }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <Typography sx={{ fontSize: '0.7rem' }}>TOTAL JAM OT RANGE</Typography>
                                    <Typography sx={{ fontSize: '0.55rem', opacity: 0.8 }}>Rata-rata</Typography>
                                </Box>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredStationData.map(st => (
                            <StationRow key={st.station} station={st.station} employees={st.employees} stats={st.stats} />
                        ))}
                        {/* Grand Total Row */}
                        <TableRow sx={{ bgcolor: '#1e293b', fontWeight: 800 }}>
                            <TableCell sx={{ color: 'white' }} />
                            <TableCell sx={{ color: 'white', fontWeight: 800, fontSize: '0.85rem' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <BusinessIcon sx={{ color: '#fbbf24', fontSize: 18 }} />
                                    GRAND TOTAL
                                    <Chip label={`${totalStats.totalKaryawan} org`} size="small" sx={{ ml: 1, bgcolor: '#fbbf24', color: '#1e293b', fontWeight: 700, height: 20 }} />
                                </Box>
                            </TableCell>
                            <TableCell align="center">
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                    <Typography sx={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.85rem' }}>{totalStats.totalHariRange} Hari</Typography>
                                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#fcd34d' }}>{totalStats.grandTotalJamOTRange}h</Typography>
                                </Box>
                            </TableCell>
                            <TableCell align="center">
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                    <Typography sx={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.85rem' }}>{totalStats.grandTotalJamOTRange}h</Typography>
                                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#fcd34d' }}>avg: {(totalStats.totalKaryawan > 0 ? (totalStats.grandTotalJamOTRange / totalStats.totalKaryawan).toFixed(1) : 0)}h/org</Typography>
                                </Box>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default OvertimeRangeReport;
