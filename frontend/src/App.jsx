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
import DeleteIcon from '@mui/icons-material/Delete';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

import AttendanceSummaryReport from './components/AttendanceSummaryReport';
import AttendanceMatrix from './components/AttendanceMatrix';
import PayrollReport from './components/PayrollReport';
import OvertimeReport from './components/OvertimeReport';
import OvertimeRangeReport from './components/OvertimeRangeReport';
import AutomationDialog from './components/AutomationDialog';
import OTResetDialog from './components/OTResetDialog';
import ComparisonDialog from './components/ComparisonDialog';
import AttendanceSummaryBar from './components/AttendanceSummaryBar';
import AttendanceFilterBar from './components/AttendanceFilterBar';
import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import { fetchAttendanceData, exportAttendanceJSON, fetchLatestPeriod } from './services/api';
import { getFallbackAttendancePeriod, getYearOptions, normalizeAttendancePeriod } from './utils/period';

const App = () => {
    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('venus_auth') === 'true');
    
    const [activeTab, setActiveTab] = useState('matrix');
    const [reportType, setReportType] = useState(null);
    const [viewMode, setViewMode] = useState('attendance');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedYear, setSelectedYear] = useState(null);
    const [periodLoading, setPeriodLoading] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
    const [isComparing, setIsComparing] = useState(false);
    const [syncTargetMode, setSyncTargetMode] = useState('all');
    const [isEditMode, setIsEditMode] = useState(false);
    const [showStaff, setShowStaff] = useState(false);

    // Filter State
    const [filterMode, setFilterMode] = useState('all'); 
    const [attendanceFilter, setAttendanceFilter] = useState('all'); 
    const [overtimeMin, setOvertimeMin] = useState('');
    const [overtimeMax, setOvertimeMax] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    // Automation & Comparison State
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [isAutomationOpen, setIsAutomationOpen] = useState(false);
    const [isOTResetOpen, setIsOTResetOpen] = useState(false);
    const [taskRegisterDocIds, setTaskRegisterDocIds] = useState([]);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);
    const [comparisonData, setComparisonData] = useState(null);
    const [compareMode, setCompareMode] = useState('off');
    const [isPayrollAutomationRunning, setIsPayrollAutomationRunning] = useState(false);
    const [isPayrollADResetRunning, setIsPayrollADResetRunning] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const DRAWER_WIDTH = 340;
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const years = useMemo(() => getYearOptions(selectedYear), [selectedYear]);

    const handleLogin = (status) => {
        setIsAuthenticated(status);
        localStorage.setItem('venus_auth', status);
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('venus_auth');
    };

    useEffect(() => {
        if (!isAuthenticated) return;

        let isCancelled = false;

        const loadLatestPeriod = async () => {
            setPeriodLoading(true);
            try {
                const latestPeriod = normalizeAttendancePeriod(await fetchLatestPeriod());
                if (!latestPeriod) throw new Error('Periode absensi terakhir tidak valid');

                if (!isCancelled) {
                    setSelectedMonth(latestPeriod.month);
                    setSelectedYear(latestPeriod.year);
                }
            } catch (error) {
                const fallbackPeriod = getFallbackAttendancePeriod();
                if (!isCancelled) {
                    setSelectedMonth(fallbackPeriod.month);
                    setSelectedYear(fallbackPeriod.year);
                    setSnackbar({
                        open: true,
                        message: `Gagal mengambil periode absensi terakhir: ${error.message}`,
                        severity: 'warning'
                    });
                }
            } finally {
                if (!isCancelled) setPeriodLoading(false);
            }
        };

        loadLatestPeriod();

        return () => {
            isCancelled = true;
        };
    }, [isAuthenticated]);

    const handleFetchData = async () => {
        if (!selectedMonth || !selectedYear || !isAuthenticated) return;
        setLoading(true);
        setData([]); // Reset to empty array so filteredData is always safe
        try {
            const result = await fetchAttendanceData(selectedMonth, selectedYear, showStaff);
            // Frontend also needs to bypass isKaryawan filter if showStaff is true
            const filteredResult = result?.filter(emp => showStaff || emp.isKaryawan !== false) || [];
            setData(filteredResult);
            showSnackbar('Data berhasil dimuat', 'success');
        } catch (error) {
            setData([]); // Reset on error — prevents stale data from showing
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
    }, [selectedMonth, selectedYear, isAuthenticated, showStaff]);

    const handleDataUpdate = (updateInfo) => {
        if (!updateInfo || typeof updateInfo === 'function') {
            handleFetchData();
            return;
        }
        if (updateInfo.type === 'update_employee') {
            setData(prevData => {
                if (!prevData) return prevData;
                return prevData.map(emp =>
                    emp.id === updateInfo.id ? { ...emp, ...updateInfo.updates } : emp
                );
            });
        }
    };

    const handleComparisonComplete = (data, nextCompareMode = null) => {
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
        if (nextCompareMode) setCompareMode(nextCompareMode);
        else if (compareMode === 'off') setCompareMode('presence');
    };

    const performComparison = async (nextCompareMode = null) => {
        if (!data || data.length === 0 || loading) {
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
                handleComparisonComplete(result, nextCompareMode);
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

    const handleViewModeChange = (nextMode) => {
        if (!nextMode) return;
        setViewMode(nextMode);
        if (nextMode === 'comparison') {
            setCompareMode('all');
            if (!comparisonData) performComparison('all');
        }
    };

    const handleCompareToggle = () => {
        if (loading) return; // Guard: prevent compare during data fetch
        if (compareMode === 'off') {
            setCompareMode('presence');
            performComparison('presence');
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

    const openOTResetDialog = async () => {
        // Dialog will handle DocIds fetch internally
        // Pre-fetch if we have cached ones, otherwise just open
        setIsOTResetOpen(true);
    };

    const handlePayrollAutomation = async (options = {}) => {
        setIsPayrollAutomationRunning(true);
        const componentKeys = options.componentKeys || (options.componentKey ? [options.componentKey] : []);
        showSnackbar(componentKeys.length ? `Memulai sync payroll: ${componentKeys.join(', ')}` : 'Memulai Auto Key-In Payroll...', 'info');
        try {
            const response = await fetch('/api/payroll/automation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: selectedMonth, year: selectedYear, componentKeys })
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

    const handlePayrollADReset = async (options = {}) => {
        const confirmed = window.confirm(`Hapus Monthly Allowance/Deduction Millware untuk ${monthNames[(selectedMonth || 1) - 1]} ${selectedYear}?`);
        if (!confirmed) return;

        setIsPayrollADResetRunning(true);
        showSnackbar('Memulai reset Monthly Allowance/Deduction...', 'info');

        try {
            const response = await fetch('/api/payroll/ad-reset/automation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    month: selectedMonth,
                    year: selectedYear,
                    targetMode: options.targetMode || 'all',
                    dryRun: Boolean(options.dryRun),
                    windowCount: options.windowCount || 5
                })
            });

            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.error || 'Gagal memulai reset Monthly AD');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalStatus = 'completed';

            while (reader) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const chunks = buffer.split('\n\n');
                buffer = chunks.pop() || '';

                chunks.forEach((chunk) => {
                    const line = chunk.split('\n').find(item => item.startsWith('data: '));
                    if (!line) return;
                    const event = JSON.parse(line.slice(6));
                    if (event.type === 'error') finalStatus = 'failed';
                    if (event.type === 'status' && event.data === 'failed') finalStatus = 'failed';
                });
            }

            showSnackbar(finalStatus === 'failed' ? 'Reset Monthly AD selesai dengan error' : 'Reset Monthly AD selesai', finalStatus === 'failed' ? 'error' : 'success');
        } catch (e) {
            showSnackbar('Error: ' + e.message, 'error');
        } finally {
            setIsPayrollADResetRunning(false);
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
                            <Select value={selectedMonth || ''} onChange={(e) => setSelectedMonth(Number(e.target.value))} variant="standard" disableUnderline disabled={periodLoading} sx={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700 }}>
                                {monthNames.map((name, idx) => <MenuItem key={idx} value={idx + 1}>{name}</MenuItem>)}
                            </Select>
                            <Select value={selectedYear || ''} onChange={(e) => setSelectedYear(Number(e.target.value))} variant="standard" disableUnderline disabled={periodLoading} sx={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700 }}>
                                {years.map(year => <MenuItem key={year} value={year}>{year}</MenuItem>)}
                            </Select>
                            <FormControlLabel
                                control={<Switch checked={showStaff} onChange={(e) => setShowStaff(e.target.checked)} color="info" size="small" />}
                                label={<Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#fff', whiteSpace: 'nowrap' }}>Tampilkan Staff</Typography>}
                                sx={{ ml: 1, mr: 0 }}
                            />
                        </Box>
                        <IconButton onClick={handleFetchData} size="small" disabled={periodLoading} sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' }}>
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
                    <Paper elevation={0} sx={{ zIndex: 11, borderBottom: '1px solid #DFE1E6', px: 2.5, py: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 800 }}>{activeTab.toUpperCase()}</Typography>
                            {activeTab === 'matrix' && (
                                <ToggleButtonGroup value={viewMode} exclusive onChange={(e, v) => handleViewModeChange(v)} size="small" sx={{ height: 32 }}>
                                    <ToggleButton value="attendance" sx={{ px: 2, fontSize: '0.8rem', fontWeight: 600 }}>Presence</ToggleButton>
                                    <ToggleButton value="overtime" sx={{ px: 2, fontSize: '0.8rem', fontWeight: 600 }}>Overtime</ToggleButton>
                                    <ToggleButton value="detail" sx={{ px: 2, fontSize: '0.8rem', fontWeight: 600 }}>Detail</ToggleButton>
                                    <ToggleButton value="comparison" sx={{ px: 2, fontSize: '0.8rem', fontWeight: 600 }}>Komparasi</ToggleButton>
                                </ToggleButtonGroup>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {activeTab === 'matrix' && (
                                <>
                                    <FormControlLabel
                                        control={<Switch checked={isEditMode} onChange={(e) => setIsEditMode(e.target.checked)} color="warning" size="small" />}
                                        label={<Typography sx={{ fontWeight: 700, fontSize: '0.72rem', color: isEditMode ? '#D97706' : 'text.secondary' }}>EDIT</Typography>}
                                    />
                                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                                    <Button variant={compareMode !== 'off' ? "contained" : "outlined"} size="small" color={compareMode !== 'off' ? "secondary" : "inherit"} startIcon={isComparing ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <CompareIcon />} onClick={handleCompareToggle} disabled={isComparing} sx={{ height: 32, fontWeight: 700, fontSize: '0.8rem' }}>
                                        {isComparing ? 'Syncing...' : 'COMPARE'}
                                    </Button>
                                    <Button variant="contained" size="small" color="success" startIcon={<SyncIcon />} onClick={() => openSyncDialog('all')} disabled={!data || data.length === 0} sx={{ height: 32, fontWeight: 700, fontSize: '0.8rem' }}>
                                        Sinkron ({selectedEmployeeIds.length > 0 ? selectedEmployeeIds.length : (data ? data.length : 0)})
                                    </Button>
                                    <Button variant="outlined" size="small" color="error" startIcon={<DeleteIcon />} onClick={openOTResetDialog} sx={{ height: 32, fontWeight: 700, fontSize: '0.8rem' }}>
                                        Hapus OT
                                    </Button>
                                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                                    <Button variant="outlined" size="small" startIcon={<FilterListIcon />} onClick={() => setIsSidebarOpen(true)} sx={{ height: 32, fontWeight: 700, fontSize: '0.8rem' }}>
                                        PARAMETER
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
                                        <Chip
                                            size="small"
                                            label={`${filteredData.length} Karyawan`}
                                            sx={{
                                                fontWeight: 800, fontSize: '0.75rem',
                                                bgcolor: '#EFF6FF', color: '#0052CC',
                                                border: '1px solid #BFDBFE',
                                                height: 26
                                            }}
                                        />
                                        {isFilterActive && (
                                            <Chip
                                                size="small"
                                                label="FILTER AKTIF"
                                                sx={{ bgcolor: '#7C3AED', color: '#fff', fontWeight: 900, fontSize: '0.7rem', px: 1, height: 26 }}
                                            />
                                        )}
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<FileDownloadIcon />}
                                            onClick={handleExportExcel}
                                            sx={{ fontWeight: 700, fontSize: '0.78rem', height: 32, borderColor: '#DFE1E6', color: '#42526E' }}
                                        >
                                            Excel
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<FileDownloadIcon />}
                                            onClick={handleExportCSV}
                                            sx={{ fontWeight: 700, fontSize: '0.78rem', height: 32, borderColor: '#DFE1E6', color: '#42526E' }}
                                        >
                                            CSV
                                        </Button>
                                    </Box>
                                </Box>
                                <ErrorBoundary>
                                    <AttendanceMatrix
                                        data={filteredData} viewMode={viewMode} onDataUpdate={handleDataUpdate}
                                        selectedIds={selectedEmployeeIds} onToggleSelect={setSelectedEmployeeIds}
                                        compareMode={compareMode} comparisonData={comparisonData}
                                        isLoadingComparison={isComparing} isEditMode={isEditMode} setIsEditMode={setIsEditMode}
                                        isFiltered={isFilterActive} isLoading={loading}
                                    />
                                </ErrorBoundary>
                            </>
                        )}
                        {activeTab === 'report' && (
                            <Box sx={{ height: '100%' }}>
                                {!reportType ? (
                                    <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', mt: 8 }}>
                                        <Paper
                                            onClick={() => setReportType('attendance')}
                                            sx={{
                                                p: 4, width: 260, textAlign: 'center', cursor: 'pointer',
                                                border: '2px solid transparent',
                                                background: 'linear-gradient(135deg, #fff 0%, #f8fafc 100%)',
                                                transition: 'all 0.25s ease',
                                                '&:hover': {
                                                    border: '2px solid #0052CC',
                                                    transform: 'translateY(-4px)',
                                                    boxShadow: '0 12px 30px rgba(0,82,204,0.15)',
                                                },
                                            }}
                                        >
                                            <Box sx={{
                                                width: 56, height: 56, borderRadius: 3, bgcolor: '#EFF6FF',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                mx: 'auto', mb: 2
                                            }}>
                                                <AssessmentIcon sx={{ fontSize: 28, color: '#0052CC' }} />
                                            </Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: '#172B4D' }}>Report Absensi</Typography>
                                            <Typography variant="body2" sx={{ color: '#5E6C84' }}>
                                                Ringkasan kehadiran karyawan per stasiun
                                            </Typography>
                                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
                                                <Chip label="Grouped by Station" size="small" variant="outlined" />
                                            </Box>
                                        </Paper>
                                        <Paper
                                            onClick={() => setReportType('overtime')}
                                            sx={{
                                                p: 4, width: 260, textAlign: 'center', cursor: 'pointer',
                                                border: '2px solid transparent',
                                                background: 'linear-gradient(135deg, #fff 0%, #f8fafc 100%)',
                                                transition: 'all 0.25s ease',
                                                '&:hover': {
                                                    border: '2px solid #7C3AED',
                                                    transform: 'translateY(-4px)',
                                                    boxShadow: '0 12px 30px rgba(124,58,237,0.15)',
                                                },
                                            }}
                                        >
                                            <Box sx={{
                                                width: 56, height: 56, borderRadius: 3, bgcolor: '#F5F3FF',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                mx: 'auto', mb: 2
                                            }}>
                                                <HourglassIcon sx={{ fontSize: 28, color: '#7C3AED' }} />
                                            </Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: '#172B4D' }}>Report Lembur</Typography>
                                            <Typography variant="body2" sx={{ color: '#5E6C84' }}>
                                                Detail SPL (Surat Perintah Lembur) per karyawan
                                            </Typography>
                                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
                                                <Chip label="SPL Breakdown" size="small" variant="outlined" />
                                            </Box>
                                        </Paper>
                                        <Paper
                                            onClick={() => setReportType('range_ot')}
                                            sx={{
                                                p: 4, width: 260, textAlign: 'center', cursor: 'pointer',
                                                border: '2px solid transparent',
                                                background: 'linear-gradient(135deg, #fff 0%, #f8fafc 100%)',
                                                transition: 'all 0.25s ease',
                                                '&:hover': {
                                                    border: '2px solid #059669',
                                                    transform: 'translateY(-4px)',
                                                    boxShadow: '0 12px 30px rgba(5,150,105,0.15)',
                                                },
                                            }}
                                        >
                                            <Box sx={{
                                                width: 56, height: 56, borderRadius: 3, bgcolor: '#ECFDF5',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                mx: 'auto', mb: 2
                                            }}>
                                                <FilterListIcon sx={{ fontSize: 28, color: '#059669' }} />
                                            </Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: '#172B4D' }}>Report Range OT</Typography>
                                            <Typography variant="body2" sx={{ color: '#5E6C84' }}>
                                                Filter kehadiran berdasarkan range jam lembur
                                            </Typography>
                                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
                                                <Chip label="Custom Range" size="small" variant="outlined" sx={{ borderColor: '#059669', color: '#059669' }} />
                                            </Box>
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
                        {activeTab === 'payroll' && <PayrollReport month={selectedMonth} year={selectedYear} onPayrollAutomation={handlePayrollAutomation} isPayrollAutomationRunning={isPayrollAutomationRunning} onPayrollADReset={handlePayrollADReset} isPayrollADResetRunning={isPayrollADResetRunning} />}
                    </Box>
                </Box>

                <Drawer
                    anchor="right"
                    open={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                    PaperProps={{ sx: { width: DRAWER_WIDTH, bgcolor: '#fff', borderLeft: '1px solid #DFE1E6' } }}
                >
                    <Box sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        px: 3, py: 2.5, borderBottom: '1px solid #DFE1E6',
                        bgcolor: 'linear-gradient(135deg, #fff 0%, #f8fafc 100%)',
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FilterListIcon sx={{ fontSize: 18, color: '#0052CC' }} />
                            </Box>
                            <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1 }}>Parameter &amp; KPI</Typography>
                                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>Filter &amp; Statistik Kehadiran</Typography>
                            </Box>
                        </Box>
                        <IconButton onClick={() => setIsSidebarOpen(false)} size="small" sx={{ bgcolor: '#F4F5F7' }}>
                            <CloseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>
                    <Box sx={{ p: 3 }}>
                        <AttendanceFilterBar
                            data={filteredData} filter={attendanceFilter} onFilterChange={setAttendanceFilter}
                            overtimeMin={overtimeMin} overtimeMax={overtimeMax} onOvertimeMinChange={setOvertimeMin} onOvertimeMaxChange={setOvertimeMax}
                            onReset={() => { setAttendanceFilter('all'); setOvertimeMin(''); setOvertimeMax(''); }}
                            onExportPdf={handleExportAttendancePDF}
                            onApplyFilter={() => { setIsSidebarOpen(false); showSnackbar('Parameter diterapkan ke Matrix', 'success'); }}
                        />
                    </Box>
                </Drawer>
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
            </Snackbar>

            <AutomationDialog open={isAutomationOpen} onClose={() => { setIsAutomationOpen(false); setSyncTargetMode('all'); }} selectedEmployees={selectedEmployeeIds.length > 0 ? (data ? data.filter(e => selectedEmployeeIds.includes(e.id)) : []) : (data || [])} month={selectedMonth} year={selectedYear} compareMode={compareMode} syncTargetMode={syncTargetMode} comparisonData={comparisonData} onRefresh={performComparison} />
            <ComparisonDialog open={isComparisonOpen} onClose={() => setIsComparisonOpen(false)} selectedEmployees={selectedEmployeeIds.length > 0 ? (data ? data.filter(e => selectedEmployeeIds.includes(e.id)) : []) : (data || [])} month={selectedMonth} year={selectedYear} onComparisonComplete={handleComparisonComplete} />
            <OTResetDialog
                open={isOTResetOpen}
                onClose={() => setIsOTResetOpen(false)}
                docIds={taskRegisterDocIds}
                selectedEmployees={selectedEmployeeIds.length > 0 ? (data ? data.filter(e => selectedEmployeeIds.includes(e.id)) : []) : []}
                allEmployees={data || []}
                month={selectedMonth}
                year={selectedYear}
                onRefresh={performComparison}
            />
        </Box>
    );
};

export default App;
