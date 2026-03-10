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
    Tooltip,
    Avatar,
    AvatarGroup,
    Button
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SickIcon from '@mui/icons-material/LocalHospital';
import FlightIcon from '@mui/icons-material/Flight';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import CancelIcon from '@mui/icons-material/Cancel';
import BusinessIcon from '@mui/icons-material/Business';
import WeekendIcon from '@mui/icons-material/Weekend';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Extract station name from chargeJob field
 * Example: "(GA9010) VEHICLE RUNNING / LN002 ((POWERMAX) COMPOSTING 2 2024) / 11 (DRIVER WAGES)"
 * → Split by '/' → Take index 0 → "(GA9010) VEHICLE RUNNING"
 * → Extract name after code → "VEHICLE RUNNING"
 */
const getStation = (chargeJob) => {
    if (!chargeJob || chargeJob === '-') return 'Tidak Diketahui';

    // Split by '/' and take the first part (index 0)
    const parts = chargeJob.split('/');
    const firstPart = parts[0]?.trim() || '';

    if (!firstPart) return 'Tidak Diketahui';

    // Extract station name: remove code in parentheses at the start
    // Format: "(CODE) STATION NAME" → "STATION NAME"
    const match = firstPart.match(/^\([^)]+\)\s*(.+)$/);
    if (match && match[1]) {
        return match[1].trim();
    }

    // If no parentheses pattern, return the whole first part
    return firstPart;
};

/**
 * Count attendance status for an employee
 */
const countAttendanceStatus = (attendance) => {
    const counts = { hadirNormal: 0, hadirMinggu: 0, hadirLibur: 0, hadirLembur: 0, sakit: 0, cutiIzin: 0, alfa: 0 };

    if (!attendance) return counts;

    Object.values(attendance).forEach(day => {
        const status = (day.status || '').toUpperCase();
        const dateObj = new Date(day.date);
        const isSunday = dateObj.getDay() === 0 || day.dayName === 'Min';
        const isHoliday = day.isHoliday === true || status.includes('LIBUR');
        const otHours = Number(day.overtimeHours) || 0;

        const isHadir = (status === 'HADIR' || status.includes('PARTIAL'));

        if (isHadir) {
            if (otHours > 0) {
                counts.hadirLembur++;
            }
            if (isSunday) {
                counts.hadirMinggu++;
            } else if (isHoliday) {
                counts.hadirLibur++;
            } else {
                counts.hadirNormal++;
            }
        } else if (['S', 'SAKIT', 'SD', 'SICK'].includes(status)) {
            counts.sakit++;
        } else if (['CT', 'CUTI', 'I', 'IZIN'].includes(status)) {
            counts.cutiIzin++;
        } else if (status === 'ALFA') {
            counts.alfa++;
        }
    });

    return counts;
};

/**
 * Station Row Component with expandable employee list
 */
const StationRow = ({ station, employees, stats }) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <TableRow
                hover
                onClick={() => setOpen(!open)}
                sx={{
                    cursor: 'pointer',
                    bgcolor: open ? '#f0fdf4' : 'inherit',
                    '&:hover': { bgcolor: '#f8fafc' }
                }}
            >
                <TableCell sx={{ width: 50 }}>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon sx={{ color: '#7c3aed', fontSize: 18 }} />
                        {station}
                        <Chip
                            label={`${employees.length}`}
                            size="small"
                            sx={{ ml: 1, bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 600, fontSize: '0.65rem', height: 20 }}
                        />
                    </Box>
                </TableCell>
                <TableCell align="center">
                    <Chip icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} label={stats.hadirNormal} size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 700, minWidth: 45 }} />
                </TableCell>
                <TableCell align="center">
                    <Chip icon={<WeekendIcon sx={{ fontSize: 14 }} />} label={stats.hadirMinggu} size="small" sx={{ bgcolor: '#ffedd5', color: '#c2410c', fontWeight: 700, minWidth: 45 }} />
                </TableCell>
                <TableCell align="center">
                    <Chip icon={<BeachAccessIcon sx={{ fontSize: 14 }} />} label={stats.hadirLibur} size="small" sx={{ bgcolor: '#f3e8ff', color: '#7e22ce', fontWeight: 700, minWidth: 45 }} />
                </TableCell>
                <TableCell align="center">
                    <Chip icon={<AccessTimeIcon sx={{ fontSize: 14 }} />} label={stats.hadirLembur} size="small" sx={{ bgcolor: '#fae8ff', color: '#a21caf', fontWeight: 700, minWidth: 45 }} />
                </TableCell>
                <TableCell align="center">
                    <Chip icon={<FlightIcon sx={{ fontSize: 14 }} />} label={stats.cutiIzin} size="small" sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontWeight: 700, minWidth: 45 }} />
                </TableCell>
                <TableCell align="center">
                    <Chip icon={<SickIcon sx={{ fontSize: 14 }} />} label={stats.sakit} size="small" sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 700, minWidth: 45 }} />
                </TableCell>
                <TableCell align="center">
                    <Chip icon={<CancelIcon sx={{ fontSize: 14 }} />} label={stats.alfa} size="small" sx={{ bgcolor: '#7f1d1d', color: '#fff', fontWeight: 700, minWidth: 45 }} />
                </TableCell>
            </TableRow>

            {/* Expanded Employee List */}
            <TableRow>
                <TableCell colSpan={9} sx={{ py: 0, borderBottom: open ? '2px solid #e5e7eb' : 'none' }}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 3, bgcolor: '#fafafa' }}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#374151', fontWeight: 600 }}>
                                Daftar Karyawan di Stasiun {station}
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#f1f5f9' }}>Nama</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#f1f5f9' }}>Hadir</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#f1f5f9' }}>H.Mgg</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#f1f5f9' }}>H.Libur</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#f1f5f9' }}>Lembur</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#f1f5f9' }}>Cut/Iz</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#f1f5f9' }}>Sakit</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#f1f5f9' }}>Alfa</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {employees.map((emp, idx) => {
                                        const empStats = countAttendanceStatus(emp.attendance);
                                        return (
                                            <TableRow key={emp.id} sx={{ bgcolor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                <TableCell sx={{ fontSize: '0.75rem' }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Avatar sx={{ width: 20, height: 20, fontSize: '0.65rem', bgcolor: '#7c3aed' }}>
                                                            {emp.name?.charAt(0) || '?'}
                                                        </Avatar>
                                                        {emp.name}
                                                    </Box>
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#166534', fontSize: '0.75rem' }}>{empStats.hadirNormal}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#c2410c', fontSize: '0.75rem' }}>{empStats.hadirMinggu}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#7e22ce', fontSize: '0.75rem' }}>{empStats.hadirLibur}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#a21caf', fontSize: '0.75rem' }}>{empStats.hadirLembur}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#1e40af', fontSize: '0.75rem' }}>{empStats.cutiIzin}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#991b1b', fontSize: '0.75rem' }}>{empStats.sakit}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#7f1d1d', fontSize: '0.75rem' }}>{empStats.alfa}</TableCell>
                                            </TableRow>
                                        );
                                    })}
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
 * Main Attendance Summary Report Component
 */
const AttendanceSummaryReport = ({ data = [] }) => {
    const safeData = Array.isArray(data) ? data : [];

    // Group employees by station and calculate stats
    const { stationData, totalStats } = useMemo(() => {
        const stationMap = {};
        const totals = { hadirNormal: 0, hadirMinggu: 0, hadirLibur: 0, hadirLembur: 0, sakit: 0, cutiIzin: 0, alfa: 0 };

        safeData.forEach(emp => {
            const station = getStation(emp.chargeJob);

            if (!stationMap[station]) {
                stationMap[station] = {
                    employees: [],
                    stats: { hadirNormal: 0, hadirMinggu: 0, hadirLibur: 0, hadirLembur: 0, sakit: 0, cutiIzin: 0, alfa: 0 }
                };
            }

            stationMap[station].employees.push(emp);

            // Calculate stats for this employee
            const empStats = countAttendanceStatus(emp.attendance);

            // Add to station totals
            stationMap[station].stats.hadirNormal += empStats.hadirNormal;
            stationMap[station].stats.hadirMinggu += empStats.hadirMinggu;
            stationMap[station].stats.hadirLibur += empStats.hadirLibur;
            stationMap[station].stats.hadirLembur += empStats.hadirLembur;
            stationMap[station].stats.sakit += empStats.sakit;
            stationMap[station].stats.cutiIzin += empStats.cutiIzin;
            stationMap[station].stats.alfa += empStats.alfa;

            // Add to grand totals
            totals.hadirNormal += empStats.hadirNormal;
            totals.hadirMinggu += empStats.hadirMinggu;
            totals.hadirLibur += empStats.hadirLibur;
            totals.hadirLembur += empStats.hadirLembur;
            totals.sakit += empStats.sakit;
            totals.cutiIzin += empStats.cutiIzin;
            totals.alfa += empStats.alfa;
        });

        // Convert to sorted array
        const sortedStations = Object.entries(stationMap)
            .map(([station, data]) => ({ station, ...data }))
            .sort((a, b) => a.station.localeCompare(b.station));

        return { stationData: sortedStations, totalStats: totals };
    }, [safeData]);

    if (safeData.length === 0) {
        return (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">Pilih Periode untuk menampilkan data</Typography>
            </Box>
        );
    }

    const handleExportPDF = () => {
        const doc = new jsPDF('landscape');

        // Header
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, doc.internal.pageSize.width, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('REPORT JUMlAH KEHADIRAN KARYAWAN', 14, 22);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Venus Rekap Web | Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 30);

        doc.setTextColor(80, 80, 80);
        doc.text('Menampilkan Report Akumulasi Kehadiran (Hadir Normal, Hadir Minggu, Libur, Lembur, dll)', 14, 45);

        const tableColumn = ["Nama", "Stasiun", "Hadir Normal", "Hadir Mgg", "Hadir Libur", "Hadir Lembur", "Cuti/Izin", "Sakit", "Alfa"];
        const tableRows = [];

        stationData.forEach(station => {
            station.employees.forEach(emp => {
                const est = countAttendanceStatus(emp.attendance);
                tableRows.push([
                    emp.name,
                    station.station,
                    est.hadirNormal,
                    est.hadirMinggu,
                    est.hadirLibur,
                    est.hadirLembur,
                    est.cutiIzin,
                    est.sakit,
                    est.alfa
                ]);
            });
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 50,
            theme: 'grid',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 50 },
                1: { cellWidth: 50 },
                2: { halign: 'center', textColor: [22, 101, 52] },
                3: { halign: 'center', textColor: [194, 65, 12] },
                4: { halign: 'center', textColor: [126, 34, 206] },
                5: { halign: 'center', textColor: [162, 28, 175], fontStyle: 'bold' },
                6: { halign: 'center', textColor: [30, 64, 175] },
                7: { halign: 'center', textColor: [153, 27, 27] },
                8: { halign: 'center', textColor: [127, 29, 29], fontStyle: 'bold' }
            },
            styles: { fontSize: 8 },
            didDrawPage: function (data) {
                const str = 'Halaman ' + doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });

        doc.save(`Report_Absensi_${new Date().getTime()}.pdf`);
    };

    return (
        <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', bgcolor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
                    📊 Report Absensi per Stasiun
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
                    <Chip label={`${stationData.length} Stasiun`} size="small" sx={{ bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 600, height: 32 }} />
                    <Chip label={`${safeData.length} Karyawan`} size="small" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600, height: 32 }} />
                </Box>
            </Box>

            {/* Table */}
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: '#f1f5f9', width: 50 }} />
                            <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.8rem' }}>Stasiun</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>Hadir<br />Normal</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>Hadir<br />Minggu</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>Hadir<br />Libur</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>Hadir<br />Lembur</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>Cuti /<br />Izin</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>Total<br />Sakit</TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>Total<br />Alfa</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {stationData.map(({ station, employees, stats }) => (
                            <StationRow
                                key={station}
                                station={station}
                                employees={employees}
                                stats={stats}
                            />
                        ))}

                        {/* Grand Total Row */}
                        <TableRow sx={{ bgcolor: '#1e293b' }}>
                            <TableCell />
                            <TableCell sx={{ fontWeight: 700, color: '#fff', fontSize: '0.8.5rem' }}>
                                TOTAL KESELURUHAN
                            </TableCell>
                            <TableCell align="center"><Chip label={totalStats.hadirNormal} size="small" sx={{ bgcolor: '#22c55e', color: '#fff', fontWeight: 700, minWidth: 45 }} /></TableCell>
                            <TableCell align="center"><Chip label={totalStats.hadirMinggu} size="small" sx={{ bgcolor: '#f97316', color: '#fff', fontWeight: 700, minWidth: 45 }} /></TableCell>
                            <TableCell align="center"><Chip label={totalStats.hadirLibur} size="small" sx={{ bgcolor: '#a855f7', color: '#fff', fontWeight: 700, minWidth: 45 }} /></TableCell>
                            <TableCell align="center"><Chip label={totalStats.hadirLembur} size="small" sx={{ bgcolor: '#d946ef', color: '#fff', fontWeight: 700, minWidth: 45 }} /></TableCell>
                            <TableCell align="center"><Chip label={totalStats.cutiIzin} size="small" sx={{ bgcolor: '#3b82f6', color: '#fff', fontWeight: 700, minWidth: 45 }} /></TableCell>
                            <TableCell align="center"><Chip label={totalStats.sakit} size="small" sx={{ bgcolor: '#ef4444', color: '#fff', fontWeight: 700, minWidth: 45 }} /></TableCell>
                            <TableCell align="center"><Chip label={totalStats.alfa} size="small" sx={{ bgcolor: '#dc2626', color: '#fff', fontWeight: 700, minWidth: 45 }} /></TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default AttendanceSummaryReport;
