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
    Button,
    Tooltip
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
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

    const handleExportPDF = () => {
        const doc = new jsPDF();

        // Header Rectangle
        doc.setFillColor(30, 41, 59); // Dark slate header
        doc.rect(0, 0, doc.internal.pageSize.width, 35, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('REPORT LEMBUR KARYAWAN', 14, 22);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Venus Rekap Web | Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 30);

        // Filter info
        let filterText = 'Menampilkan: Semua Data Karyawan Lembur';
        if (minHours !== '' || maxHours !== '' || searchTerm) {
            filterText = `Filter Aktif: ${searchTerm ? `Pencarian "${searchTerm}" | ` : ''} Range: ${minHours || 0} - ${maxHours || 'Tak Terhingga'} Jam`;
        }

        doc.setTextColor(80, 80, 80);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text(filterText, 14, 45);

        // Table
        const tableColumn = ["No.", "Karyawan", "PTRJ ID", "Stasiun", "Total Jam Lembur"];
        const tableRows = [];

        filteredEmployees.forEach((emp, ind) => {
            const empData = [
                ind + 1,
                emp.name,
                emp.ptrjEmployeeID || '-',
                emp.station,
                `${emp.totalOvertime} Jam`
            ];
            tableRows.push(empData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 50,
            theme: 'grid',
            headStyles: {
                fillColor: [100, 116, 139], // Slate-500
                textColor: 255,
                fontStyle: 'bold'
            },
            bodyStyles: {
                textColor: [50, 50, 50]
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252] // Slate-50
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 15 },
                2: { halign: 'center', cellWidth: 35 },
                4: { halign: 'center', cellWidth: 40, fontStyle: 'bold', textColor: [126, 34, 206] } // Purple-700
            },
            styles: { fontSize: 9, cellPadding: 3 },
            didDrawPage: function (data) {
                // Footer
                const str = 'Halaman ' + doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });

        doc.save(`Report_Lembur_${new Date().getTime()}.pdf`);
    };

    return (
        <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header & Filters */}
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HourglassIcon sx={{ color: 'secondary.main', mb: '2px' }} /> Report Lembur Karyawan
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Export ke PDF Ciamik">
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
                        <Chip label={`${filteredEmployees.length} Karyawan`} size="small" color="primary" variant="outlined" sx={{ fontWeight: 600, height: 32 }} />
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        placeholder="Cari Nama / ID"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        sx={{ minWidth: 220 }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper', p: 0.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                        <FilterAltIcon fontSize="small" color="action" sx={{ ml: 0.5 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>Range Jam:</Typography>
                        <TextField
                            size="small"
                            type="number"
                            placeholder="Min"
                            value={minHours}
                            onChange={(e) => setMinHours(e.target.value)}
                            sx={{ width: 80, '& input': { py: 0.5, textAlign: 'center' } }}
                        />
                        <Typography variant="body2" color="text.disabled">-</Typography>
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
                        <Button size="small" variant="text" color="inherit" onClick={handleClearFilters} sx={{ textTransform: 'none', color: 'text.secondary' }}>
                            Reset Filter
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Table */}
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto', borderTop: 'none', borderRadius: 0, border: 'none' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: 50, textAlign: 'center' }}>No.</TableCell>
                            <TableCell>Karyawan</TableCell>
                            <TableCell>PTRJ ID</TableCell>
                            <TableCell>Stasiun (Charge Job)</TableCell>
                            <TableCell align="center">Total Jam Lembur</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredEmployees.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                        <FilterAltIcon sx={{ fontSize: 40, color: 'text.disabled', opacity: 0.5 }} />
                                        <Typography>Tidak ada data karyawan lembur yang sesuai filter.</Typography>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEmployees.map((emp, index) => (
                                <TableRow key={emp.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                    <TableCell align="center" sx={{ color: 'text.secondary' }}>
                                        {index + 1}
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Avatar sx={{ width: 32, height: 32, fontSize: '0.85rem', bgcolor: 'primary.light', color: 'primary.contrastText', fontWeight: 600 }}>
                                                {emp.name?.charAt(0) || '?'}
                                            </Avatar>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>{emp.name}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 500 }}>
                                        {emp.ptrjEmployeeID || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <BusinessIcon sx={{ color: 'text.disabled', fontSize: 18 }} />
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{emp.station}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Chip
                                            label={`${emp.totalOvertime} Jam`}
                                            size="small"
                                            sx={{
                                                bgcolor: 'secondary.light',
                                                color: 'secondary.dark',
                                                fontWeight: 700,
                                                minWidth: 70
                                            }}
                                        />
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
