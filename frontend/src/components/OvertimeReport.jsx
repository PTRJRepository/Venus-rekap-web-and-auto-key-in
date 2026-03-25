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
    Avatar,
    TextField,
    Button,
    Tooltip,
    Grid
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PeopleIcon from '@mui/icons-material/People';
import HistoryIcon from '@mui/icons-material/History';
import GroupsIcon from '@mui/icons-material/Groups';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Extract station name from chargeJob field
 */
const getStation = (chargeJob) => {
    if (!chargeJob || chargeJob === '-') return 'Tidak Diketahui';
    const parts = chargeJob.split('/');
    const firstPart = parts[0]?.trim() || '';
    if (!firstPart) return 'Tidak Diketahui';
    const match = firstPart.match(/^\([^)]+\)\s*(.+)$/);
    if (match && match[1]) return match[1].trim();
    return firstPart;
};

/**
 * Collapsible Station Row - shows station header with subtotal, expands to show employees
 */
const StationRow = ({ station, employees, stats, open: controlledOpen, onToggle }) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const handleToggle = onToggle || (() => setInternalOpen(!internalOpen));

    return (
        <>
            {/* Station Header Row */}
            <TableRow
                hover
                onClick={handleToggle}
                sx={{
                    cursor: 'pointer',
                    bgcolor: open ? '#f0fdf4' : '#f8fafc',
                    '&:hover': { bgcolor: open ? '#dcfce7' : '#f1f5f9' }
                }}
            >
                <TableCell sx={{ width: 50 }}>
                    <IconButton size="small">
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell colSpan={2} sx={{ fontWeight: 700 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon sx={{ color: '#7c3aed', fontSize: 18 }} />
                        <Typography sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.8rem' }}>{station}</Typography>
                        <Chip
                            label={`${employees.length} org`}
                            size="small"
                            sx={{
                                bgcolor: '#e0e7ff',
                                color: '#4338ca',
                                fontWeight: 700,
                                height: 18,
                                fontSize: '0.65rem'
                            }}
                        />
                    </Box>
                </TableCell>
                <TableCell align="center">
                    <Chip
                        label={`${stats.totalDays} Hari`}
                        size="small"
                        sx={{
                            bgcolor: '#FEF3C7',
                            color: '#B45309',
                            fontWeight: 700,
                            height: 22,
                            fontSize: '0.7rem',
                            border: '1px solid #FCD34D'
                        }}
                    />
                </TableCell>
                <TableCell align="center">
                    <Chip
                        label={`${stats.totalHours.toFixed(2)} Jam`}
                        size="small"
                        sx={{
                            bgcolor: '#F3E8FF',
                            color: '#7B1FA2',
                            fontWeight: 700,
                            height: 22,
                            fontSize: '0.7rem',
                            border: '1px solid #E1BEE7',
                            minWidth: 80
                        }}
                    />
                </TableCell>
            </TableRow>

            {/* Expanded Employee Detail Rows */}
            <TableRow>
                <TableCell colSpan={6} sx={{ py: 0, border: 0 }}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 1, bgcolor: '#fafafa' }}>
                            <Table size="small" sx={{ bgcolor: 'white', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                        <TableCell sx={{ fontWeight: 800, fontSize: '0.65rem', width: 50 }} align="center">NO</TableCell>
                                        <TableCell sx={{ fontWeight: 800, fontSize: '0.65rem' }}>NAMA KARYAWAN</TableCell>
                                        <TableCell sx={{ fontWeight: 800, fontSize: '0.65rem' }} align="center">PTRJ ID</TableCell>
                                        <TableCell sx={{ fontWeight: 800, fontSize: '0.65rem' }} align="center">HARI SPL</TableCell>
                                        <TableCell sx={{ fontWeight: 800, fontSize: '0.65rem' }} align="center">TOTAL JAM SPL</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {employees.map((emp, idx) => (
                                        <TableRow key={emp.id} hover>
                                            <TableCell align="center" sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>{idx + 1}</TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Avatar sx={{ width: 22, height: 22, fontSize: '0.65rem', bgcolor: '#7c3aed', fontWeight: 700 }}>
                                                        {emp.name?.charAt(0) || '?'}
                                                    </Avatar>
                                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#1e293b' }}>{emp.name}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell align="center" sx={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>
                                                {emp.ptrjEmployeeID || '-'}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={emp.totalOvertimeDays}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: '#FEF3C7',
                                                        color: '#B45309',
                                                        fontWeight: 700,
                                                        height: 20,
                                                        fontSize: '0.65rem',
                                                        minWidth: 32
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={`${emp.totalOvertimeHours.toFixed(2)} Jam`}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: '#F3E8FF',
                                                        color: '#7B1FA2',
                                                        fontWeight: 700,
                                                        height: 20,
                                                        fontSize: '0.65rem',
                                                        minWidth: 70
                                                    }}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {/* Subtotal Row */}
                                    <TableRow sx={{ bgcolor: '#1e293b' }}>
                                        <TableCell colSpan={2} sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#fbbf24', py: 0.75 }}>
                                            SUBTOTAL {station.toUpperCase()}
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#fbbf24' }}>
                                            {employees.length} org
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24' }}>
                                            {stats.totalDays} Hari
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24' }}>
                                            {stats.totalHours.toFixed(2)} Jam
                                        </TableCell>
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

/**
 * Main Overtime Report Component
 */
const OvertimeReport = ({ data = [] }) => {
    const safeData = Array.isArray(data) ? data : [];

    // Filter State
    const [minHours, setMinHours] = useState('');
    const [maxHours, setMaxHours] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Calculate and group by station
    const { stationData, grandStats } = useMemo(() => {
        // Step 1: Calculate per-employee SPL totals
        const withTotals = safeData.map(emp => {
            let totalOtHours = 0;
            let totalOtDays = 0;
            if (emp.attendance) {
                Object.values(emp.attendance).forEach(day => {
                    const ot = Number(day.overtimeHours) || 0;
                    if (ot > 0) {
                        totalOtHours += ot;
                        totalOtDays++;
                    }
                });
            }
            return {
                ...emp,
                totalOvertimeHours: totalOtHours,
                totalOvertimeDays: totalOtDays,
                station: getStation(emp.chargeJob)
            };
        });

        // Step 2: Apply filters
        const min = minHours === '' ? 0 : Number(minHours);
        const max = maxHours === '' ? Infinity : Number(maxHours);

        const filtered = withTotals.filter(emp => {
            if (emp.totalOvertimeHours < min || emp.totalOvertimeHours > max) return false;
            if (minHours === '' && emp.totalOvertimeHours === 0) return false;
            if (searchTerm) {
                const s = searchTerm.toLowerCase();
                if (!(emp.name || '').toLowerCase().includes(s) &&
                    !(emp.ptrjEmployeeID || '').toLowerCase().includes(s)) return false;
            }
            return true;
        });

        // Step 3: Group by station
        const stationMap = {};
        filtered.forEach(emp => {
            if (!stationMap[emp.station]) {
                stationMap[emp.station] = {
                    station: emp.station,
                    employees: [],
                    stats: { totalDays: 0, totalHours: 0, totalEmployees: 0 }
                };
            }
            stationMap[emp.station].employees.push(emp);
            stationMap[emp.station].stats.totalDays += emp.totalOvertimeDays;
            stationMap[emp.station].stats.totalHours += emp.totalOvertimeHours;
            stationMap[emp.station].stats.totalEmployees++;
        });

        // Step 4: Grand total
        const grand = {
            totalEmployees: 0,
            totalDays: 0,
            totalHours: 0
        };
        Object.values(stationMap).forEach(st => {
            grand.totalEmployees += st.stats.totalEmployees;
            grand.totalDays += st.stats.totalDays;
            grand.totalHours += st.stats.totalHours;
        });

        return {
            stationData: Object.values(stationMap).sort((a, b) => b.stats.totalHours - a.stats.totalHours),
            grandStats: grand
        };
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

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 210, 45, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('REPORT SPL (SURAT PERINTAH LEMBUR)', 105, 16, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Venus Rekap Web | Dicetak: ${new Date().toLocaleDateString('id-ID')}`, 105, 26, { align: 'center' });

        let filterText = 'Menampilkan: Semua Data';
        if (minHours !== '' || maxHours !== '' || searchTerm) {
            filterText = `Filter: ${searchTerm ? `"${searchTerm}" | ` : ''}Range: ${minHours || 0} - ${maxHours || '∞'} Jam`;
        }
        doc.setFontSize(9);
        doc.text(filterText, 105, 36, { align: 'center' });

        let y = 52;

        stationData.forEach(st => {
            if (y > 240) { doc.addPage(); y = 20; }

            // Station header
            doc.setFillColor(241, 245, 249);
            doc.rect(14, y - 5, 182, 8, 'F');
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text(`${st.station} (${st.employees.length} org)`, 16, y);
            doc.setTextColor(124, 58, 237);
            doc.text(`${st.stats.totalDays} Hari | ${st.stats.totalHours.toFixed(2)} Jam`, 180, y, { align: 'right' });
            y += 8;

            // Employee rows
            const rows = st.employees.map((e, i) => [
                i + 1,
                e.name,
                e.ptrjEmployeeID || '-',
                e.totalOvertimeDays,
                `${e.totalOvertimeHours.toFixed(2)}`
            ]);
            rows.push([
                '',
                `SUBTOTAL ${st.station.toUpperCase()}`,
                `${st.employees.length} org`,
                st.stats.totalDays,
                st.stats.totalHours.toFixed(2)
            ]);

            autoTable(doc, {
                head: [['No', 'Karyawan', 'PTRJ ID', 'Hari SPL', 'Total Jam SPL']],
                body: rows,
                startY: y,
                theme: 'grid',
                margin: { left: 14, right: 14 },
                headStyles: {
                    fillColor: [100, 116, 139],
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 8
                },
                bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 12 },
                    1: { cellWidth: 80 },
                    2: { halign: 'center', cellWidth: 30 },
                    3: { halign: 'center', cellWidth: 20 },
                    4: { halign: 'center', cellWidth: 25 }
                },
                didParseCell: function (data) {
                    // Bold and color subtotal row
                    if (data.row.index === rows.length - 1) {
                        data.cell.styles.fillColor = [124, 58, 237];
                        data.cell.styles.textColor = [255, 255, 255];
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fontSize = 8;
                    }
                },
                didDrawPage: function (pageData) {
                    const str = 'Halaman ' + doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.setTextColor(150);
                    doc.text(str, pageData.settings.margin.left, doc.internal.pageSize.height - 8);
                }
            });

            y = doc.lastAutoTable.finalY + 10;
        });

        // Grand total
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFillColor(15, 23, 42);
        doc.rect(14, y - 5, 182, 10, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(251, 191, 36);
        doc.text('GRAND TOTAL', 16, y + 2);
        doc.text(`${grandStats.totalEmployees} org | ${grandStats.totalDays} Hari | ${grandStats.totalHours.toFixed(2)} Jam`, 196, y + 2, { align: 'right' });

        doc.save(`Report_SPL_${new Date().getTime()}.pdf`);
    };

    return (
        <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header & Filters */}
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HourglassIcon sx={{ color: 'secondary.main', mb: '2px' }} />
                        Report SPL (Surat Perintah Lembur)
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Tooltip title="Export PDF">
                            <Button
                                variant="contained"
                                size="small"
                                color="error"
                                onClick={handleExportPDF}
                                startIcon={<PictureAsPdfIcon />}
                                sx={{ fontWeight: 800, borderRadius: 1.5, boxShadow: '0 4px 6px rgba(239, 68, 68, 0.2)' }}
                            >
                                GET PDF
                            </Button>
                        </Tooltip>
                        <Chip
                            icon={<PeopleIcon sx={{ fontSize: '16px !important' }} />}
                            label={`${grandStats.totalEmployees} Karyawan`}
                            size="small"
                            sx={{ fontWeight: 700, height: 28 }}
                        />
                    </Box>
                </Box>

                {/* Stats Cards */}
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={4}>
                        <Paper sx={{ p: 1.5, borderLeft: '4px solid #4338ca', bgcolor: '#eef2ff' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <PeopleIcon sx={{ color: '#4338ca', fontSize: 18 }} />
                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#4338ca' }}>TOTAL KARYAWAN</Typography>
                            </Box>
                            <Typography sx={{ fontWeight: 900, fontSize: '1.4rem', color: '#1e293b', lineHeight: 1.2 }}>{grandStats.totalEmployees}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={4}>
                        <Paper sx={{ p: 1.5, borderLeft: '4px solid #b45309', bgcolor: '#fffbeb' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <HistoryIcon sx={{ color: '#b45309', fontSize: 18 }} />
                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#b45309' }}>TOTAL HARI SPL</Typography>
                            </Box>
                            <Typography sx={{ fontWeight: 900, fontSize: '1.4rem', color: '#1e293b', lineHeight: 1.2 }}>{grandStats.totalDays}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={4}>
                        <Paper sx={{ p: 1.5, borderLeft: '4px solid #7c3aed', bgcolor: '#f5f3ff' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <AccessTimeIcon sx={{ color: '#7c3aed', fontSize: 18 }} />
                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#6d28d9' }}>TOTAL JAM SPL</Typography>
                            </Box>
                            <Typography sx={{ fontWeight: 900, fontSize: '1.4rem', color: '#1e293b', lineHeight: 1.2 }}>{grandStats.totalHours.toFixed(2)} Jam</Typography>
                        </Paper>
                    </Grid>
                </Grid>

                {/* Filter Bar */}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        placeholder="Cari Nama / PTRJ ID"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        sx={{ minWidth: 220 }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper', p: 0.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                        <FilterAltIcon fontSize="small" color="action" sx={{ ml: 0.5 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>Range:</Typography>
                        <TextField
                            size="small"
                            type="number"
                            placeholder="Min"
                            value={minHours}
                            onChange={(e) => setMinHours(e.target.value)}
                            sx={{ width: 75, '& input': { py: 0.5, textAlign: 'center', fontSize: '0.8rem' } }}
                        />
                        <Typography variant="body2" color="text.disabled">-</Typography>
                        <TextField
                            size="small"
                            type="number"
                            placeholder="Max"
                            value={maxHours}
                            onChange={(e) => setMaxHours(e.target.value)}
                            sx={{ width: 75, '& input': { py: 0.5, textAlign: 'center', fontSize: '0.8rem' } }}
                        />
                    </Box>
                    {(minHours !== '' || maxHours !== '' || searchTerm !== '') && (
                        <Button size="small" variant="text" color="inherit" onClick={handleClearFilters} sx={{ textTransform: 'none', color: 'text.secondary', fontSize: '0.75rem' }}>
                            Reset
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Table */}
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto', borderTop: 'none', borderRadius: 0, border: 'none' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#1e293b' }}>
                            <TableCell sx={{ width: 50, bgcolor: '#1e293b', color: 'white', borderRight: '1px solid rgba(255,255,255,0.1)' }} />
                            <TableCell sx={{ bgcolor: '#1e293b', color: 'white', fontWeight: 800, fontSize: '0.75rem', borderRight: '1px solid rgba(255,255,255,0.1)' }}>STASIUN / DEPARTEMEN</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#1e293b', color: 'white', fontWeight: 800, fontSize: '0.75rem', borderRight: '1px solid rgba(255,255,255,0.1)' }}>HARI SPL</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#1e293b', color: 'white', fontWeight: 800, fontSize: '0.75rem' }}>TOTAL JAM SPL</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {stationData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                        <FilterAltIcon sx={{ fontSize: 40, color: 'text.disabled', opacity: 0.5 }} />
                                        <Typography>Tidak ada data SPL yang sesuai filter.</Typography>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ) : (
                            stationData.map(st => (
                                <StationRow
                                    key={st.station}
                                    station={st.station}
                                    employees={st.employees}
                                    stats={st.stats}
                                />
                            ))
                        )}

                        {/* Grand Total Row */}
                        {stationData.length > 0 && (
                            <TableRow sx={{ bgcolor: '#0f172a' }}>
                                <TableCell sx={{ borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                                    <GroupsIcon sx={{ color: '#fbbf24', fontSize: 18 }} />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 900, color: '#fbbf24', fontSize: '0.8rem' }}>
                                    GRAND TOTAL
                                    <Typography component="span" sx={{ fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', ml: 1 }}>
                                        {stationData.length} stasiun
                                    </Typography>
                                </TableCell>
                                <TableCell align="center">
                                    <Chip
                                        label={`${grandStats.totalDays} Hari`}
                                        size="small"
                                        sx={{
                                            bgcolor: '#fbbf24',
                                            color: '#0f172a',
                                            fontWeight: 800,
                                            height: 24,
                                            fontSize: '0.75rem',
                                            minWidth: 60
                                        }}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <Chip
                                        label={`${grandStats.totalHours.toFixed(2)} Jam`}
                                        size="small"
                                        sx={{
                                            bgcolor: '#7c3aed',
                                            color: 'white',
                                            fontWeight: 800,
                                            height: 24,
                                            fontSize: '0.75rem',
                                            minWidth: 80
                                        }}
                                    />
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default OvertimeReport;
