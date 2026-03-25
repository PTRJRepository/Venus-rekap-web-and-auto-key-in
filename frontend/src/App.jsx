import React, { useState, useEffect, useMemo } from 'react';
import { Box, Paper, AppBar, Toolbar, Tabs, Tab, Typography, IconButton, Snackbar, Alert, CircularProgress, Chip, Select, FormControl, MenuItem, ToggleButtonGroup, ToggleButton, Button, FormControlLabel, Switch, Drawer, Divider, Tooltip } from '@mui/material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarIcon from '@mui/icons-material/CalendarMonth';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TableViewIcon from '@mui/icons-material/TableView';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import SyncIcon from '@mui/icons-material/Sync';
import CompareIcon from '@mui/icons-material/CompareArrows';
import ReceiptIcon from '@mui/icons-material/Receipt';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterListIcon from '@mui/icons-material/FilterList';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

import AttendanceSummaryReport from './components/AttendanceSummaryReport';
import AttendanceMatrix from './components/AttendanceMatrix';
import PayrollReport from './components/PayrollReport';
import OvertimeReport from './components/OvertimeReport';
import OvertimeRangeReport from './components/OvertimeRangeReport';
import AutomationDialog from './components/AutomationDialog';
import ComparisonDialog from './components/ComparisonDialog';
import AttendanceSummaryBar from './components/AttendanceSummaryBar';
import AttendanceFilterBar from './components/AttendanceFilterBar';
import LoginPage from './components/LoginPage';
import { fetchAttendanceData, exportAttendanceJSON } from './services/api';

const App = () => {
    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('venus_auth') === 'true');
    
    const [activeTab, setActiveTab] = useState('matrix');
    const [reportType, setReportType] = useState(null);
    const [viewMode, setViewMode] = useState('attendance');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(2);
    const [selectedYear, setSelectedYear] = useState(2026);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
    const [isComparing, setIsComparing] = useState(false);
    const [syncTargetMode, setSyncTargetMode] = useState('all');
    const [isEditMode, setIsEditMode] = useState(false);

    // Filter State
    const [filterMode, setFilterMode] = useState('all'); 
    const [attendanceFilter, setAttendanceFilter] = useState('all'); 
    const [overtimeMin, setOvertimeMin] = useState('');
    const [overtimeMax, setOvertimeMax] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    // Automation & Comparison State
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [isAutomationOpen, setIsAutomationOpen] = useState(false);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);
    const [comparisonData, setComparisonData] = useState(null);
    const [compareMode, setCompareMode] = useState('off');
    const [isPayrollAutomationRunning, setIsPayrollAutomationRunning] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const DRAWER_WIDTH = 340;
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const years = [2024, 2025, 2026];

    const handleLogin = (status) => {
        setIsAuthenticated(status);
        localStorage.setItem('venus_auth', status);
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('venus_auth');
    };

    const handleFetchData = async () => {
        if (!selectedMonth || !selectedYear || !isAuthenticated) return;
        setLoading(true);
        setData(null);
        try {
            const result = await fetchAttendanceData(selectedMonth, selectedYear);
            const filteredResult = result?.filter(emp => emp.isKaryawan !== false) || null;
            setData(filteredResult);
            showSnackbar('Data berhasil dimuat', 'success');
        } catch (error) {
            showSnackbar(`Gagal memuat data: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated && selectedMonth && selectedYear) {
            handleFetchData();
            setSelectedEmployeeIds([]);
            setComparisonData(null);
            setCompareMode('off');
        }
    }, [selectedMonth, selectedYear, isAuthenticated]);

    const handleDataUpdate = (updateInfo) => {
        if (!updateInfo || typeof updateInfo === 'function') {
            handleFetchData();
            return;
        }
        if (updateInfo.type === 'update_employee') {
            setData(prevData =>
                prevData.map(emp =>
                    emp.id === updateInfo.id ? { ...emp, ...updateInfo.updates } : emp
                )
            );
        }
    };

    const handleComparisonComplete = (data) => {
        const map = {};
        if (data && data.results) {
            data.results.forEach(r => {
                const key = `${r.ptrjId}_${r.date}`;
                if (r.details) {
                    map[key] = {
                        hours: r.details.millwareHours,
                        normal: r.details.millwareNormal,
                        ot: r.details.millwareOT,
                        TaskCode: r.details.millwareTaskCode || r.millwareTaskCode,
                        status: r.status,
                        syncStatus: r.syncStatus,
                        regularMatched: r.details.regularMatched === true,
                        otMatched: r.details.otMatched === true,
                        hasRegularRecord: r.details.hasRegularRecord === true,
                        hasOTRecord: r.details.hasOTRecord === true
                    };
                }
            });
        }
        setComparisonData(map);
        if (compareMode === 'off') setCompareMode('presence');
    };

    const performComparison = async () => {
        if (!data || data.length === 0) {
            showSnackbar('Tidak ada data untuk dibandingkan', 'warning');
            return;
        }
        setIsComparing(true);
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const employeesToCompare = selectedEmployeeIds.length > 0
            ? data.filter(e => selectedEmployeeIds.includes(e.id) && e.ptrjEmployeeID && e.ptrjEmployeeID !== 'N/A')
            : data.filter(e => e.ptrjEmployeeID && e.ptrjEmployeeID !== 'N/A');

        if (employeesToCompare.length === 0) {
            setIsComparing(false);
            showSnackbar('Tidak ada karyawan dengan PTRJ ID valid untuk dibandingkan.', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/comparison/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employees: employeesToCompare, startDate: start, endDate: end })
            });
            const result = await response.json();
            if (result.success) {
                handleComparisonComplete(result);
                const matchCount = result.results?.filter(r => r.status === 'MATCH').length || 0;
                showSnackbar(`Komparasi selesai! MATCH: ${matchCount}`, 'success');
            } else {
                showSnackbar(result.error || 'Gagal melakukan komparasi', 'error');
            }
        } catch (e) {
            showSnackbar('Gagal melakukan komparasi: ' + e.message, 'error');
        } finally {
            setIsComparing(false);
        }
    };

    const handleCompareToggle = () => {
        if (compareMode === 'off') {
            setCompareMode('presence');
            performComparison();
        } else if (compareMode === 'presence') {
            setCompareMode('overtime');
            if (!comparisonData) performComparison();
        } else {
            setCompareMode('off');
        }
    };

    const openSyncDialog = (mode) => {
        setSyncTargetMode(mode);
        setIsAutomationOpen(true);
    };

    const handlePayrollAutomation = async () => {
        setIsPayrollAutomationRunning(true);
        showSnackbar('Memulai Auto Key-In Payroll...', 'info');
        try {
            const response = await fetch('/api/payroll/automation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: selectedMonth, year: selectedYear })
            });
            const result = await response.json();
            if (result.success) showSnackbar(result.message || 'Auto Key-In Payroll dimulai', 'success');
            else showSnackbar(result.error || 'Gagal memulai', 'error');
        } catch (e) {
            showSnackbar('Error: ' + e.message, 'error');
        } finally {
            setIsPayrollAutomationRunning(false);
        }
    };

    const showSnackbar = (message, severity = 'info') => setSnackbar({ open: true, message, severity });

    const handleFilterChange = (mode) => setFilterMode(prev => prev === mode ? 'all' : mode);

    const isFilterActive = useMemo(() => {
        return attendanceFilter !== 'all' || overtimeMin !== '' || overtimeMax !== '';
    }, [attendanceFilter, overtimeMin, overtimeMax]);

    const filteredData = useMemo(() => {
        if (!data) return [];
        const todayNum = new Date().getDate();
        const minOt = overtimeMin === '' ? -1 : Number(overtimeMin);
        const maxOt = overtimeMax === '' ? 999 : Number(overtimeMax);
        const isRangeActive = overtimeMin !== '' || overtimeMax !== '';

        return data.map(emp => {
            let filteredAttendance = {};
            let hasAnyDayInRange = false;

            if (emp.attendance) {
                Object.entries(emp.attendance).forEach(([dayKey, dayData]) => {
                    const otHours = Number(dayData.overtimeHours) || 0;
                    const st = (dayData.status || '').toUpperCase();
                    let isDayPass = true;

                    if (isRangeActive) {
                        if (otHours < minOt || otHours > maxOt || otHours <= 0) isDayPass = false;
                    }

                    if (attendanceFilter !== 'all') {
                        if (attendanceFilter === 'hadir' && st !== 'HADIR') isDayPass = false;
                        else if (attendanceFilter === 'alfa' && st !== 'ALFA') isDayPass = false;
                        else if (attendanceFilter === 'off' && st !== 'OFF' && st !== 'LIBUR') isDayPass = false;
                        else if (attendanceFilter === 'cuti' && !['CT', 'CUTI', 'I', 'IZIN'].includes(st)) isDayPass = false;
                        else if (attendanceFilter === 'sakit' && !['S', 'SAKIT', 'SD'].includes(st)) isDayPass = false;
                        else if (attendanceFilter === 'overtime' && otHours <= 0) isDayPass = false;
                    }

                    if (isDayPass) {
                        filteredAttendance[dayKey] = dayData;
                        hasAnyDayInRange = true;
                    }
                });
            }

            if (filterMode === 'absent' && !Object.values(emp.attendance || {}).some(d => d.status === 'ALFA')) return null;
            if (filterMode === 'leave_sick' && !Object.values(emp.attendance || {}).some(d => ['CT', 'CUTI', 'I', 'IZIN', 'S', 'SAKIT', 'SD'].includes(d.status))) return null;
            if (filterMode === 'today' && !emp.attendance?.[todayNum]?.status) return null;

            if ((isRangeActive || attendanceFilter !== 'all') && !hasAnyDayInRange) return null;

            return { ...emp, attendance: filteredAttendance };
        }).filter(Boolean);
    }, [data, filterMode, attendanceFilter, overtimeMin, overtimeMax]);

    const handleExportExcel = async () => {
        if (!filteredData || filteredData.length === 0) {
            showSnackbar('Tidak ada data untuk diekspor', 'warning');
            return;
        }
        setIsExporting(true);
        try {
            const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
            const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
            const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            const result = await exportAttendanceJSON(start, end, filteredData.map(e => e.id));
            if (result?.filename) showSnackbar('Export Excel berhasil: ' + result.filename, 'success');
        } catch (error) {
            showSnackbar('Gagal export: ' + error.message, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportCSV = async () => {
        if (!filteredData || filteredData.length === 0) {
            showSnackbar('Tidak ada data untuk diekspor', 'warning');
            return;
        }
        setIsExporting(true);
        try {
            const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
            const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
            const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            const result = await exportAttendanceJSON(start, end, filteredData.map(e => e.id));
            if (result?.filename) showSnackbar('Export CSV berhasil: ' + result.filename, 'success');
        } catch (error) {
            showSnackbar('Gagal export: ' + error.message, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const calculateAttendanceSummary = (employeeData) => {
        const summary = { totalKaryawan: employeeData.length, hadir: 0, alfa: 0, cuti: 0, sakit: 0, off: 0, totalOvertime: 0 };
        employeeData.forEach(emp => {
            Object.values(emp.attendance || {}).forEach(day => {
                const st = (day.status || '').toUpperCase();
                const ot = Number(day.overtimeHours) || 0;
                if (st === 'HADIR' || st.includes('PARTIAL')) summary.hadir++;
                else if (st === 'ALFA') summary.alfa++;
                else if (['CT', 'CUTI', 'I', 'IZIN'].includes(st)) summary.cuti++;
                else if (['S', 'SAKIT', 'SD'].includes(st)) summary.sakit++;
                else if (st === 'OFF' || st === 'LIBUR') summary.off++;
                if (ot > 0) summary.totalOvertime += ot;
            });
        });
        return summary;
    };

    const handleExportAttendancePDF = () => {
        if (!filteredData || filteredData.length === 0) return;
        const monthName = monthNames[selectedMonth - 1];
        const summary = calculateAttendanceSummary(filteredData);
        const doc = new jsPDF('p');

        doc.setFillColor(15, 32, 64);
        doc.rect(0, 0, 210, 45, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        const title = isFilterActive ? 'LAPORAN KEHADIRAN (FILTER KHUSUS)' : 'LAPORAN KEHADIRAN KARYAWAN';
        doc.text(title, 105, 18, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`PT. REBINMAS ABADI - Periode: ${monthName} ${selectedYear}`, 105, 28, { align: 'center' });
        if (isFilterActive) {
            const filterStr = `Filter: Status ${attendanceFilter.toUpperCase()} | Range OT: ${overtimeMin || 0}-${overtimeMax || '∞'} jam`;
            doc.setFontSize(9);
            doc.text(filterStr, 105, 36, { align: 'center' });
        }
        doc.setTextColor(30, 30, 30);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(20, 55, 170, 50, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text(isFilterActive ? 'RINGKASAN HASIL FILTER' : 'RINGKASAN KEHADIRAN', 105, 65, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Total Karyawan Match: ${summary.totalKaryawan}`, 40, 80);
        doc.text(`Total Hari Match: ${summary.hadir + summary.alfa + summary.cuti + summary.sakit + summary.off}`, 40, 88);
        doc.text(`Total Jam OT Filter: ${summary.totalOvertime} jam`, 120, 80);
        doc.addPage();
        const tableColumn = ['No', 'Nama', 'ID', isFilterActive ? 'Hari Match' : 'Hadir', 'Alfa', 'Jam OT Match'];
        const tableRows = filteredData.map((emp, index) => {
            const s = calculateAttendanceSummary([emp]);
            const matchDays = s.hadir + s.alfa + s.cuti + s.sakit + s.off;
            return [index + 1, emp.name, emp.id, isFilterActive ? matchDays : s.hadir, s.alfa, `${s.totalOvertime}h` ];
        });
        autoTable(doc, { head: [tableColumn], body: tableRows, startY: 15, theme: 'grid', headStyles: { fillColor: isFilterActive ? [124, 58, 237] : [15, 32, 64] }, styles: { fontSize: 8 } });
        doc.save(`Laporan_Kehadiran_Filtered_${monthName}_${selectedYear}.pdf`);
        showSnackbar('PDF berhasil di-export', 'success');
    };

    // If not authenticated, show ONLY login page
    if (!isAuthenticated) {
        return <LoginPage onLogin={handleLogin} />;
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
            <AppBar position="static" elevation={0} sx={{ zIndex: 1201, background: 'linear-gradient(135deg, #0F2040 0%, #17366b 100%)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Toolbar sx={{ minHeight: 64, px: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mr: 4 }}>
                        <Box sx={{ width: 32, height: 32, bgcolor: 'secondary.main', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 1.5 }}>
                            <Typography sx={{ color: '#fff', fontWeight: 900 }}>V</Typography>
                        </Box>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1, color: '#fff' }}>VENUS HR</Typography>
                            <Typography variant="caption" sx={{ color: 'secondary.light', fontWeight: 700, fontSize: '0.6rem' }}>REBINMAS JAYA</Typography>
                        </Box>
                    </Box>
                    <Tabs value={activeTab} onChange={(e, v) => { setActiveTab(v); if (v !== 'report') setReportType(null); }} textColor="inherit" sx={{ flexGrow: 1 }}>
                        <Tab label="Matrix" value="matrix" icon={<TableViewIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
                        <Tab label="Reports" value="report" icon={<AssessmentIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
                        <Tab label="Payroll" value="payroll" icon={<ReceiptIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
                    </Tabs>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {/* Period Selector */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.08)', px: 1.5, py: 0.5, borderRadius: 2 }}>
                            <CalendarIcon sx={{ fontSize: 16, color: 'secondary.light' }} />
                            <Select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} variant="standard" disableUnderline sx={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700 }}>
                                {monthNames.map((name, idx) => <MenuItem key={idx} value={idx + 1}>{name}</MenuItem>)}
                            </Select>
                            <Select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} variant="standard" disableUnderline sx={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700 }}>
                                {years.map(year => <MenuItem key={year} value={year}>{year}</MenuItem>)}
                            </Select>
                        </Box>
                        <IconButton onClick={handleFetchData} size="small" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' }}>
                            {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <RefreshIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                        
                        <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.1)', mx: 1 }} />
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Tooltip title="Admin Mill">
                                <AccountCircleIcon sx={{ color: 'secondary.light' }} />
                            </Tooltip>
                            <IconButton onClick={handleLogout} size="small" sx={{ color: '#fff', bgcolor: 'rgba(255,0,0,0.1)', '&:hover': { bgcolor: 'rgba(255,0,0,0.2)' } }}>
                                <LogoutIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Box>
                    </Box>
                </Toolbar>
            </AppBar>

            <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <Paper elevation={0} sx={{ zIndex: 11, borderBottom: '1px solid #DFE1E6', px: 3, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 800 }}>{activeTab.toUpperCase()} VIEW</Typography>
                            {activeTab === 'matrix' && (
                                <ToggleButtonGroup value={viewMode} exclusive onChange={(e, v) => v && setViewMode(v)} size="small" sx={{ height: 32 }}>
                                    <ToggleButton value="attendance">Presence</ToggleButton>
                                    <ToggleButton value="overtime">Overtime</ToggleButton>
                                    <ToggleButton value="detail">Detail</ToggleButton>
                                </ToggleButtonGroup>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            {activeTab === 'matrix' && (
                                <>
                                    <FormControlLabel
                                        control={<Switch checked={isEditMode} onChange={(e) => setIsEditMode(e.target.checked)} color="warning" size="small" />}
                                        label={<Typography sx={{ fontWeight: 700, fontSize: '0.75rem' }}>EDIT MODE</Typography>}
                                    />
                                    <Button variant={compareMode !== 'off' ? "contained" : "outlined"} size="small" color={compareMode !== 'off' ? "secondary" : "inherit"} startIcon={isComparing ? <CircularProgress size={14} /> : <CompareIcon />} onClick={handleCompareToggle} disabled={isComparing} sx={{ height: 32, fontWeight: 800 }}>
                                        {isComparing ? 'Syncing...' : 'COMPARE'}
                                    </Button>
                                    <Button variant="contained" size="small" color="success" startIcon={<SyncIcon />} onClick={() => openSyncDialog('all')} disabled={!data || data.length === 0} sx={{ height: 32, fontWeight: 800, bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' } }}>
                                        Sinkron ({selectedEmployeeIds.length > 0 ? selectedEmployeeIds.length : (data ? data.length : 0)})
                                    </Button>
                                    <Button variant="contained" size="small" color="primary" startIcon={<FilterListIcon />} onClick={() => setIsSidebarOpen(true)} sx={{ height: 32, fontWeight: 800, ml: 1 }}>
                                        PARAMETER & KPI
                                    </Button>
                                </>
                            )}
                        </Box>
                    </Paper>

                    <Box sx={{ flexGrow: 1, p: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {activeTab === 'matrix' && (
                            <>
                                <AttendanceSummaryBar data={filteredData} isFiltered={isFilterActive} />
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, px: 0.5 }}>
                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                        <Chip size="small" label={`Match Karyawan: ${filteredData.length}`} color="primary" sx={{ fontWeight: 800 }} />
                                        {isFilterActive && (
                                            <Chip size="small" label="FILTER AKTIF" sx={{ bgcolor: '#7c3aed', color: 'white', fontWeight: 900, px: 1 }} />
                                        )}
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button size="small" startIcon={<FileDownloadIcon />} onClick={handleExportExcel}>Excel</Button>
                                        <Button size="small" startIcon={<FileDownloadIcon />} onClick={handleExportCSV}>CSV</Button>
                                    </Box>
                                </Box>
                                <AttendanceMatrix
                                    data={filteredData} viewMode={viewMode} onDataUpdate={handleDataUpdate}
                                    selectedIds={selectedEmployeeIds} onToggleSelect={setSelectedEmployeeIds}
                                    compareMode={compareMode} comparisonData={comparisonData}
                                    isLoadingComparison={isComparing} isEditMode={isEditMode} setIsEditMode={setIsEditMode}
                                    isFiltered={isFilterActive}
                                />
                            </>
                        )}
                        {activeTab === 'report' && (
                            <Box sx={{ height: '100%' }}>
                                {!reportType ? (
                                    <Box sx={{ display: 'flex', gap: 4, justifyContent: 'center', mt: 10 }}>
                                        <Paper sx={{ p: 5, width: 250, textAlign: 'center', cursor: 'pointer' }} onClick={() => setReportType('attendance')}>
                                            <AssessmentIcon sx={{ fontSize: 48, mb: 2 }} />
                                            <Typography variant="h6">Report Absensi</Typography>
                                        </Paper>
                                        <Paper sx={{ p: 5, width: 250, textAlign: 'center', cursor: 'pointer' }} onClick={() => setReportType('overtime')}>
                                            <HourglassIcon sx={{ fontSize: 48, mb: 2 }} />
                                            <Typography variant="h6">Report Lembur</Typography>
                                        </Paper>
                                        <Paper sx={{ p: 5, width: 250, textAlign: 'center', cursor: 'pointer', border: '2px solid #7c3aed' }} onClick={() => setReportType('range_ot')}>
                                            <FilterListIcon sx={{ fontSize: 48, mb: 2, color: '#7c3aed' }} />
                                            <Typography variant="h6" sx={{ color: '#7c3aed' }}>Report Range OT</Typography>
                                        </Paper>
                                    </Box>
                                ) : (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                        <Button startIcon={<ArrowBackIcon />} onClick={() => setReportType(null)} sx={{ alignSelf: 'flex-start', mb: 2 }}>Kembali</Button>
                                        {reportType === 'attendance' && <AttendanceSummaryReport data={data || []} />}
                                        {reportType === 'overtime' && <OvertimeReport data={data || []} />}
                                        {reportType === 'range_ot' && <OvertimeRangeReport data={filteredData} overtimeMin={overtimeMin} overtimeMax={overtimeMax} month={selectedMonth} year={selectedYear} appliedFilter={attendanceFilter} />}
                                    </Box>
                                )}
                            </Box>
                        )}
                        {activeTab === 'payroll' && <PayrollReport month={selectedMonth} year={selectedYear} />}
                    </Box>
                </Box>

                <Drawer anchor="right" open={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} PaperProps={{ sx: { width: DRAWER_WIDTH, p: 3, bgcolor: '#F4F5F7' } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>PARAMETER & KPI</Typography>
                        <IconButton onClick={() => setIsSidebarOpen(false)}><CloseIcon /></IconButton>
                    </Box>
                    <Divider sx={{ mb: 3 }} />
                    <AttendanceFilterBar
                        data={filteredData} filter={attendanceFilter} onFilterChange={setAttendanceFilter}
                        overtimeMin={overtimeMin} overtimeMax={overtimeMax} onOvertimeMinChange={setOvertimeMin} onOvertimeMaxChange={setOvertimeMax}
                        onReset={() => { setAttendanceFilter('all'); setOvertimeMin(''); setOvertimeMax(''); }}
                        onExportPdf={handleExportAttendancePDF}
                        onApplyFilter={() => { setIsSidebarOpen(false); showSnackbar('Parameter diterapkan ke Matrix', 'success'); }}
                    />
                </Drawer>
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
            </Snackbar>

            <AutomationDialog open={isAutomationOpen} onClose={() => { setIsAutomationOpen(false); setSyncTargetMode('all'); }} selectedEmployees={selectedEmployeeIds.length > 0 ? (data ? data.filter(e => selectedEmployeeIds.includes(e.id)) : []) : (data || [])} month={selectedMonth} year={selectedYear} compareMode={compareMode} syncTargetMode={syncTargetMode} comparisonData={comparisonData} onRefresh={performComparison} />
            <ComparisonDialog open={isComparisonOpen} onClose={() => setIsComparisonOpen(false)} selectedEmployees={selectedEmployeeIds.length > 0 ? (data ? data.filter(e => selectedEmployeeIds.includes(e.id)) : []) : (data || [])} month={selectedMonth} year={selectedYear} onComparisonComplete={handleComparisonComplete} />
        </Box>
    );
};

export default App;
