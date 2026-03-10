import React, { useState, useEffect, useMemo } from 'react';
import { Box, Paper, AppBar, Toolbar, Tabs, Tab, Typography, IconButton, Snackbar, Alert, CircularProgress, Chip, Select, FormControl, MenuItem, ToggleButtonGroup, ToggleButton, Button, FormControlLabel, Switch } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarIcon from '@mui/icons-material/CalendarMonth';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ExportIcon from '@mui/icons-material/FileDownload';
import TableViewIcon from '@mui/icons-material/TableView';
import ListIcon from '@mui/icons-material/ViewList';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import DetailIcon from '@mui/icons-material/EventNote';
import SyncIcon from '@mui/icons-material/Sync';
import CompareIcon from '@mui/icons-material/CompareArrows';
import ReceiptIcon from '@mui/icons-material/Receipt';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterListIcon from '@mui/icons-material/FilterList';

import AttendanceSummaryReport from './components/AttendanceSummaryReport';
import AttendanceMatrix from './components/AttendanceMatrix';
import PayrollReport from './components/PayrollReport';
import OvertimeReport from './components/OvertimeReport';
import AutomationDialog from './components/AutomationDialog';
import ComparisonDialog from './components/ComparisonDialog';
import AttendanceSummaryBar from './components/AttendanceSummaryBar';
import { fetchAttendanceData, exportAttendanceJSON } from './services/api';

const App = () => {
    const [activeTab, setActiveTab] = useState('matrix');
    const [viewMode, setViewMode] = useState('attendance');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(2);
    const [selectedYear, setSelectedYear] = useState(2026);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
    const [isComparing, setIsComparing] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    // Filter State
    const [filterMode, setFilterMode] = useState('all'); // 'all', 'absent', 'leave_sick', 'today'
    const [isExporting, setIsExporting] = useState(false);

    // Automation & Comparison State
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [isAutomationOpen, setIsAutomationOpen] = useState(false);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);
    const [comparisonData, setComparisonData] = useState(null);
    const [compareMode, setCompareMode] = useState('off');
    const [isPayrollAutomationRunning, setIsPayrollAutomationRunning] = useState(false);

    // Month names
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const years = [2024, 2025, 2026];

    const handleFetchData = async () => {
        if (!selectedMonth || !selectedYear) return;
        setLoading(true);
        setData(null);
        try {
            const result = await fetchAttendanceData(selectedMonth, selectedYear);
            // Filter out employees with isKaryawan = false (non-karyawan)
            const filteredResult = result?.filter(emp => emp.isKaryawan !== false) || null;
            console.log('[App] Filtered out non-karyawan. Original:', result?.length, 'Filtered:', filteredResult?.length);
            setData(filteredResult);
            showSnackbar('Data berhasil dimuat', 'success');
        } catch (error) {
            showSnackbar(`Gagal memuat data: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedMonth && selectedYear) {
            handleFetchData();
            setSelectedEmployeeIds([]);
            setComparisonData(null);
            setCompareMode('off');
        }
    }, [selectedMonth, selectedYear]);

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
        console.log('[Compare Complete] Raw data:', JSON.stringify(data).substring(0, 500));
        const map = {};
        if (data && data.results) {
            console.log('[Compare Complete] Results count:', data.results.length);
            data.results.forEach(r => {
                const key = `${r.ptrjId}_${r.date}`;
                console.log('[Compare Complete] Processing key:', key, 'status:', r.status, 'hasDetails:', !!r.details);
                // Include ALL records - synced, mismatch, AND not_synced (MISS)
                // This way UI can show proper status for each
                if (r.details) {
                    map[key] = {
                        hours: r.details.millwareHours,
                        normal: r.details.millwareNormal,
                        ot: r.details.millwareOT,
                        TaskCode: r.details.millwareTaskCode || r.millwareTaskCode,
                        status: r.status, // MATCH or MISS
                        syncStatus: r.syncStatus, // synced, mismatch, or not_synced
                        regularMatched: r.details.regularMatched === true,
                        otMatched: r.details.otMatched === true,
                        hasRegularRecord: r.details.hasRegularRecord === true,
                        hasOTRecord: r.details.hasOTRecord === true
                    };
                }
            });
            console.log('[Compare Complete] Map entries:', Object.keys(map).length);
        } else {
            console.log('[Compare Complete] No results found in data:', Object.keys(data || {}));
        }
        setComparisonData(map);
        console.log('[Compare Complete] Setting comparisonData with', Object.keys(map).length, 'entries');
        if (compareMode === 'off') setCompareMode('presence');
    };

    const performComparison = async (force = false) => {
        if (!data || data.length === 0) {
            showSnackbar('Tidak ada data untuk dibandingkan', 'warning');
            return;
        }
        setIsComparing(true);
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Always send all employees with valid ptrjEmployeeID for comparison
        // Must filter out 'N/A' and empty/null values
        const employeesToCompare = selectedEmployeeIds.length > 0
            ? data.filter(e => selectedEmployeeIds.includes(e.id) && e.ptrjEmployeeID && e.ptrjEmployeeID !== 'N/A' && e.ptrjEmployeeID.trim() !== '')
            : data.filter(e => e.ptrjEmployeeID && e.ptrjEmployeeID !== 'N/A' && e.ptrjEmployeeID.trim() !== '');

        console.log('[Compare] Filtering out N/A ptrjEmployeeID. Valid count:', employeesToCompare.length);
        console.log('[Compare] Sample valid ptrjIDs:', employeesToCompare.slice(0, 3).map(e => e.ptrjEmployeeID));

        if (employeesToCompare.length === 0) {
            setIsComparing(false);
            showSnackbar('Tidak ada karyawan dengan PTRJ ID valid untuk dibandingkan. Pastikan employee sudah di-mapping di menu Employee Mill.', 'warning');
            return;
        }

        console.log('[Compare] Sending employees:', employeesToCompare.length, 'Date range:', start, 'to', end);

        try {
            const response = await fetch('/api/comparison/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employees: employeesToCompare,
                    startDate: start,
                    endDate: end
                })
            });
            const result = await response.json();
            console.log('[Compare] Result:', result);

            if (result.success) {
                handleComparisonComplete(result);
                const matchCount = result.results?.filter(r => r.status === 'MATCH').length || 0;
                const missCount = result.results?.filter(r => r.status === 'MISS').length || 0;
                setSnackbar({
                    open: true,
                    message: `Komparasi selesai! MATCH: ${matchCount}, MISS: ${missCount}`,
                    severity: 'success'
                });
            } else {
                setSnackbar({ open: true, message: result.error || 'Gagal melakukan komparasi', severity: 'error' });
            }
        } catch (e) {
            console.error("Auto-Comparison failed:", e);
            setSnackbar({ open: true, message: 'Gagal melakukan komparasi: ' + e.message, severity: 'error' });
        } finally {
            setIsComparing(false);
        }
    };

    const handleCompareToggle = () => {
        console.log('[Compare Toggle] Current mode:', compareMode, 'Has data:', !!comparisonData);
        if (compareMode === 'off') {
            setCompareMode('presence');
            // Always run comparison when turning on
            performComparison();
        } else if (compareMode === 'presence') {
            setCompareMode('overtime');
            // Run comparison again for overtime mode if no data
            if (!comparisonData) performComparison();
        } else {
            setCompareMode('off');
        }
    };

    const handleCompareLongClick = () => {
        setIsComparisonOpen(true);
    };

    const handlePayrollAutomation = async () => {
        if (!selectedMonth || !selectedYear) {
            setSnackbar({ open: true, message: 'Pilih bulan dan tahun terlebih dahulu', severity: 'warning' });
            return;
        }

        setIsPayrollAutomationRunning(true);
        setSnackbar({ open: true, message: 'Memulai Auto Key-In Payroll...', severity: 'info' });

        try {
            const response = await fetch('/api/payroll/automation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: selectedMonth, year: selectedYear })
            });
            const result = await response.json();

            if (result.success) {
                setSnackbar({
                    open: true,
                    message: result.message || 'Auto Key-In Payroll dimulai',
                    severity: 'success'
                });
            } else {
                setSnackbar({ open: true, message: result.error || 'Gagal memulai', severity: 'error' });
            }
        } catch (e) {
            console.error("Payroll automation failed:", e);
            setSnackbar({ open: true, message: 'Error: ' + e.message, severity: 'error' });
        } finally {
            setIsPayrollAutomationRunning(false);
        }
    };

    const showSnackbar = (message, severity = 'info') => setSnackbar({ open: true, message, severity });

    // Filter and export handlers
    const handleFilterChange = (mode) => {
        setFilterMode(prev => prev === mode ? 'all' : mode);
    };

    const filteredData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        const today = new Date().getDate();

        return data.filter(emp => {
            if (filterMode === 'all') return true;

            if (filterMode === 'today') {
                const d = emp.attendance?.[today] || emp.attendance?.['1'];
                return d && d.status;
            }

            if (filterMode === 'absent') {
                return Object.values(emp.attendance || {}).some(d => (d.status || '').toUpperCase() === 'ALFA');
            }

            if (filterMode === 'leave_sick') {
                return Object.values(emp.attendance || {}).some(d => {
                    const st = (d.status || '').toUpperCase();
                    return ['CT', 'CUTI', 'I', 'IZIN', 'S', 'SAKIT', 'SD'].includes(st);
                });
            }

            return true;
        });
    }, [data, filterMode]);

    const handleExportExcel = async () => {
        if (!data || data.length === 0) {
            showSnackbar('Tidak ada data untuk diekspor', 'warning');
            return;
        }
        setIsExporting(true);
        try {
            const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
            const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
            const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            const result = await exportAttendanceJSON(startDate, endDate, filteredData.map(e => e.id));
            if (result && result.filename) {
                showSnackbar('Export Excel berhasil: ' + result.filename, 'success');
            } else {
                showSnackbar('Export berhasil', 'success');
            }
        } catch (error) {
            console.error('Export error:', error);
            showSnackbar('Gagal export: ' + error.message, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportCSV = async () => {
        if (!data || data.length === 0) {
            showSnackbar('Tidak ada data untuk diekspor', 'warning');
            return;
        }
        setIsExporting(true);
        try {
            const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
            const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
            const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            const result = await exportAttendanceJSON(startDate, endDate, filteredData.map(e => e.id));
            if (result && result.filename) {
                showSnackbar('Export CSV berhasil: ' + result.filename, 'success');
            } else {
                showSnackbar('Export berhasil', 'success');
            }
        } catch (error) {
            console.error('Export error:', error);
            showSnackbar('Gagal export: ' + error.message, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
            {/* Main Modern Navigation Header */}
            <AppBar position="static" elevation={0} sx={{ 
                zIndex: 1200, 
                bgcolor: 'primary.main',
                background: 'linear-gradient(135deg, #0F2040 0%, #17366b 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 2, sm: 3 } }}>
                    {/* Brand Section */}
                    <Box sx={{ display: 'flex', alignItems: 'center', mr: 4 }}>
                        <Box sx={{ 
                            width: 32, height: 32, bgcolor: 'secondary.main', borderRadius: 1, 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 1.5,
                            boxShadow: '0 0 15px rgba(0, 82, 204, 0.4)'
                        }}>
                            <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '1rem' }}>V</Typography>
                        </Box>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1, color: '#fff', letterSpacing: '0.05em' }}>
                                VENUS <span style={{ fontWeight: 300, opacity: 0.7 }}>HR</span>
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'secondary.light', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.1em' }}>
                                REBINMAS JAYA
                            </Typography>
                        </Box>
                    </Box>

                    {/* Navigation Tabs - Moved to Header */}
                    <Tabs 
                        value={activeTab} 
                        onChange={(e, v) => setActiveTab(v)}
                        textColor="inherit"
                        sx={{ 
                            flexGrow: 1,
                            height: 64,
                            '& .MuiTabs-indicator': { bgcolor: 'secondary.main', height: 3, borderRadius: '3px 3px 0 0' },
                            '& .MuiTab-root': { 
                                minWidth: 100, 
                                fontSize: '0.8rem', 
                                fontWeight: 600, 
                                opacity: 0.7,
                                textTransform: 'none',
                                color: '#fff',
                                '&.Mui-selected': { opacity: 1, color: '#fff' },
                                '&:hover': { opacity: 0.9, bgcolor: 'rgba(255,255,255,0.05)' }
                            }
                        }}
                    >
                        <Tab label="Matrix" value="matrix" icon={<TableViewIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
                        <Tab label="Reports" value="report" icon={<AssessmentIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
                        <Tab label="Overtime" value="lembur" icon={<HourglassIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
                        <Tab label="Payroll" value="payroll" icon={<ReceiptIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
                    </Tabs>

                    {/* Global Actions */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {/* Period Selector - Sleek Version */}
                        <Box sx={{ 
                            display: 'flex', alignItems: 'center', gap: 1, 
                            bgcolor: 'rgba(255,255,255,0.08)', px: 1.5, py: 0.5, borderRadius: 2,
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <CalendarIcon sx={{ fontSize: 16, color: 'secondary.light' }} />
                            <Select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                variant="standard"
                                disableUnderline
                                sx={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, '& .MuiSvgIcon-root': { color: '#fff', fontSize: 16 } }}
                            >
                                {monthNames.map((name, idx) => (
                                    <MenuItem key={idx} value={idx + 1}>{name}</MenuItem>
                                ))}
                            </Select>
                            <Select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                variant="standard"
                                disableUnderline
                                sx={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, '& .MuiSvgIcon-root': { color: '#fff', fontSize: 16 } }}
                            >
                                {years.map(year => (
                                    <MenuItem key={year} value={year}>{year}</MenuItem>
                                ))}
                            </Select>
                        </Box>

                        <IconButton onClick={handleFetchData} size="small" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' }}>
                            {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <RefreshIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* Contextual Action Toolbar - Now Cleaner */}
            <Paper elevation={0} sx={{ 
                zIndex: 11, borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider', 
                bgcolor: 'background.paper', px: 3, py: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 800, mr: 1 }}>
                        {activeTab.toUpperCase()} VIEW
                    </Typography>
                    
                    {activeTab === 'matrix' && (
                        <ToggleButtonGroup value={viewMode} exclusive onChange={(e, v) => v && setViewMode(v)} size="small" sx={{ height: 32 }}>
                            <ToggleButton value="attendance" sx={{ fontSize: '0.7rem', px: 2, fontWeight: 700 }}>Presence</ToggleButton>
                            <ToggleButton value="overtime" sx={{ fontSize: '0.7rem', px: 2, fontWeight: 700 }}>Overtime</ToggleButton>
                            <ToggleButton value="detail" sx={{ fontSize: '0.7rem', px: 2, fontWeight: 700 }}>Detail</ToggleButton>
                        </ToggleButtonGroup>
                    )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {activeTab === 'matrix' && (
                        <>
                            {/* NEW: Edit Mode Switch integrated here */}
                            <FormControlLabel 
                                control={<Switch checked={isEditMode} onChange={(e) => setIsEditMode(e.target.checked)} color="warning" size="small" />} 
                                label={<Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: isEditMode ? 'warning.dark' : 'text.secondary' }}>EDIT MODE</Typography>} 
                                sx={{ m: 0, mr: 1, bgcolor: isEditMode ? 'rgba(255, 153, 31, 0.1)' : 'rgba(0, 0, 0, 0.03)', px: 1.5, py: 0.5, borderRadius: 1, border: '1px solid', borderColor: isEditMode ? 'warning.light' : 'divider', transition: 'all 0.2s' }} 
                            />

                            <Button
                                variant={compareMode !== 'off' ? "contained" : "outlined"}
                                size="small"
                                color={compareMode !== 'off' ? "secondary" : "inherit"}
                                startIcon={isComparing ? <CircularProgress size={14} color="inherit" /> : <CompareIcon />}
                                onClick={handleCompareToggle}
                                onDoubleClick={() => setIsComparisonOpen(true)}
                                disabled={isComparing}
                                sx={{ height: 32, fontWeight: 800, borderRadius: 1.5 }}
                            >
                                {isComparing ? 'Processing...' : 'COMPARE'}
                            </Button>

                            {/* Sync Status Legend - shows when compare mode is active */}
                            {compareMode !== 'off' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 2, px: 1.5, py: 0.5, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', mr: 0.5 }}>STATUS:</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 12, height: 12, border: '2px solid #00875A', borderRadius: 0.5 }} />
                                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Synced</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 12, height: 12, border: '2px solid #FF991F', borderRadius: 0.5 }} />
                                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Mismatch</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 12, height: 12, border: '2px solid #DE350B', borderRadius: 0.5, bgcolor: 'rgba(222,53,11,0.1)' }} />
                                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Not Synced</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 12, height: 12, border: '2px dashed #DE350B', borderRadius: 0.5, bgcolor: 'rgba(222,53,11,0.08)' }} />
                                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Belum Mapping</Typography>
                                    </Box>
                                </Box>
                            )}

                            {selectedEmployeeIds.length > 0 && (
                                <Button
                                    variant="contained"
                                    size="small"
                                    color="success"
                                    startIcon={<SyncIcon />}
                                    onClick={() => setIsAutomationOpen(true)}
                                    sx={{ height: 32, fontWeight: 800, borderRadius: 1.5, boxShadow: '0 4px 10px rgba(0, 135, 90, 0.2)' }}
                                >
                                    SYNC ({selectedEmployeeIds.length})
                                </Button>
                            )}
                        </>
                    )}
                </Box>
            </Paper>

            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: { xs: 1, sm: 2, md: 3 }, overflow: 'hidden' }}>
                {activeTab === 'matrix' && <AttendanceSummaryBar data={filterMode === 'all' ? (data || []) : filteredData} />}
                
                {activeTab === 'matrix' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                                size="small"
                                icon={<FilterListIcon />}
                                label={`All (${data?.length || 0})`}
                                onClick={() => handleFilterChange('all')}
                                color={filterMode === 'all' ? 'primary' : 'default'}
                                variant={filterMode === 'all' ? 'filled' : 'outlined'}
                                sx={{ fontWeight: 700 }}
                            />
                            <Chip
                                size="small"
                                label="Only Absent"
                                onClick={() => handleFilterChange('absent')}
                                color={filterMode === 'absent' ? 'error' : 'default'}
                                variant={filterMode === 'absent' ? 'filled' : 'outlined'}
                                sx={{ fontWeight: 600 }}
                            />
                            <Chip
                                size="small"
                                label="Leave/Sick"
                                onClick={() => handleFilterChange('leave_sick')}
                                color={filterMode === 'leave_sick' ? 'info' : 'default'}
                                variant={filterMode === 'leave_sick' ? 'filled' : 'outlined'}
                                sx={{ fontWeight: 600 }}
                            />
                            <Chip
                                size="small"
                                label="Today"
                                onClick={() => handleFilterChange('today')}
                                color={filterMode === 'today' ? 'secondary' : 'default'}
                                variant={filterMode === 'today' ? 'filled' : 'outlined'}
                                sx={{ fontWeight: 600 }}
                            />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button
                                size="small"
                                startIcon={isExporting ? <CircularProgress size={16} /> : <FileDownloadIcon />}
                                variant="outlined"
                                onClick={handleExportExcel}
                                disabled={isExporting}
                                sx={{ fontWeight: 700, borderRadius: 1.5, borderColor: 'divider' }}
                            >
                                Excel
                            </Button>
                            <Button
                                size="small"
                                startIcon={isExporting ? <CircularProgress size={16} /> : <FileDownloadIcon />}
                                variant="outlined"
                                onClick={handleExportCSV}
                                disabled={isExporting}
                                sx={{ fontWeight: 700, borderRadius: 1.5, borderColor: 'divider' }}
                            >
                                CSV
                            </Button>
                        </Box>
                    </Box>
                )}

                {activeTab === 'report' && (
                    <AttendanceSummaryReport data={data || []} />
                )}
                {activeTab === 'lembur' && (
                    <OvertimeReport data={data || []} />
                )}
                {activeTab === 'matrix' && (
                    <AttendanceMatrix
                        data={filterMode === 'all' ? (data || []) : filteredData}
                        viewMode={viewMode}
                        onDataUpdate={handleDataUpdate}
                        selectedIds={selectedEmployeeIds}
                        onToggleSelect={setSelectedEmployeeIds}
                        compareMode={compareMode}
                        comparisonData={comparisonData}
                        isLoadingComparison={isComparing}
                        isEditMode={isEditMode}
                        setIsEditMode={setIsEditMode}
                    />
                )}
                {activeTab === 'comparison' && (
                    <ComparisonDialog
                        open={false}
                        inline={true}
                        selectedEmployees={selectedEmployeeIds.length > 0
                            ? (data ? data.filter(e => selectedEmployeeIds.includes(e.id)) : [])
                            : (data || [])
                        }
                        month={selectedMonth}
                        year={selectedYear}
                        onComparisonComplete={handleComparisonComplete}
                    />
                )}
                {activeTab === 'payroll' && (
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#F4F5F7', borderBottom: '1px solid #DFE1E6' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CalendarIcon fontSize="small" sx={{ color: '#5E6C84' }} />
                                <FormControl size="small" sx={{ minWidth: 120 }}>
                                    <Select
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        sx={{
                                            '& .MuiSelect-select': { py: 0.5, fontSize: '0.85rem', fontWeight: 600 },
                                            '& .MuiOutlinedInput-notchedOutline': { border: 'none' }
                                        }}
                                    >
                                        {monthNames.map((name, idx) => (
                                            <MenuItem key={idx} value={idx + 1}>{name}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <FormControl size="small" sx={{ minWidth: 80 }}>
                                    <Select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        sx={{
                                            '& .MuiSelect-select': { py: 0.5, fontSize: '0.85rem', fontWeight: 600 },
                                            '& .MuiOutlinedInput-notchedOutline': { border: 'none' }
                                        }}
                                    >
                                        {years.map(year => (
                                            <MenuItem key={year} value={year}>{year}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>
                            <Button
                                variant="contained"
                                size="small"
                                color="success"
                                startIcon={<SyncIcon />}
                                onClick={handlePayrollAutomation}
                                disabled={isPayrollAutomationRunning}
                                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
                            >
                                {isPayrollAutomationRunning ? 'Sedang Berjalan...' : 'Auto Key-In Payroll'}
                            </Button>
                        </Box>
                        <PayrollReport month={selectedMonth} year={selectedYear} />
                    </Box>
                )}
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
            </Snackbar>

            {/* Dialogs */}
            <AutomationDialog
                open={isAutomationOpen}
                onClose={() => setIsAutomationOpen(false)}
                selectedEmployees={data ? data.filter(e => selectedEmployeeIds.includes(e.id)) : []}
                month={selectedMonth}
                year={selectedYear}
                compareMode={compareMode}
                comparisonData={comparisonData}
                onRefresh={performComparison}
            />

            <ComparisonDialog
                open={isComparisonOpen}
                onClose={() => setIsComparisonOpen(false)}
                selectedEmployees={selectedEmployeeIds.length > 0
                    ? (data ? data.filter(e => selectedEmployeeIds.includes(e.id)) : [])
                    : (data || [])
                }
                month={selectedMonth}
                year={selectedYear}
                onComparisonComplete={handleComparisonComplete}
            />
        </Box>
    );
};

export default App;
