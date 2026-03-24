import React, { useState } from 'react';
import {
    Box,
    Alert,
    CircularProgress,
    Typography,
    Paper,
    Select,
    MenuItem,
    FormControl,
    Button,
    Chip,
    Tooltip,
    IconButton,
    Collapse,
    Badge,
    Tabs,
    Tab
} from '@mui/material';
import {
    CheckCircle as CheckIcon,
    Cancel as CancelIcon,
    Person as PersonIcon,
    AccessTime as TimeIcon,
    Flight as FlightIcon,
    LocalHospital as HospitalIcon,
    WbSunny as SunIcon,
    Search as SearchIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Refresh as RefreshIcon,
    Sync as SyncIcon,
    CompareArrows as CompareIcon,
    Assessment as AssessmentIcon,
    TableView as TableViewIcon,
    Compare as CompareTabIcon
} from '@mui/icons-material';
import AttendanceMatrix from '../components/AttendanceMatrix';
import AutomationDialog from '../components/AutomationDialog';
import ComparisonDialog from '../components/ComparisonDialog';
import AttendanceSummaryReport from '../components/AttendanceSummaryReport';
import { fetchAttendanceData } from '../services/api';

const getMonths = () => [
    { id: 1, name: 'Januari', short: 'Jan' },
    { id: 2, name: 'Februari', short: 'Feb' },
    { id: 3, name: 'Maret', short: 'Mar' },
    { id: 4, name: 'April', short: 'Apr' },
    { id: 5, name: 'Mei', short: 'Mei' },
    { id: 6, name: 'Juni', short: 'Jun' },
    { id: 7, name: 'Juli', short: 'Jul' },
    { id: 8, name: 'Agustus', short: 'Agt' },
    { id: 9, name: 'September', short: 'Sep' },
    { id: 10, name: 'Oktober', short: 'Okt' },
    { id: 11, name: 'November', short: 'Nov' },
    { id: 12, name: 'Desember', short: 'Des' },
];

const getYears = () => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
};

// Compact Legend Items
const legendItems = [
    { icon: <CheckIcon sx={{ fontSize: 12, color: '#059669' }} />, label: 'H', tooltip: 'Hadir', color: '#ecfdf5' },
    { icon: <TimeIcon sx={{ fontSize: 12, color: '#c2410c' }} />, label: 'OT', tooltip: 'Lembur', color: '#fff7ed' },
    { icon: <CancelIcon sx={{ fontSize: 12, color: '#ffffff' }} />, label: 'A', tooltip: 'ALFA', color: '#7f1d1d' },
    { icon: <SunIcon sx={{ fontSize: 12, color: '#64748b' }} />, label: 'OFF', tooltip: 'Libur', color: '#f1f5f9' },
    { icon: <FlightIcon sx={{ fontSize: 12, color: '#1e40af' }} />, label: 'C/I', tooltip: 'Cuti/Izin', color: '#eff6ff' },
    { icon: <HospitalIcon sx={{ fontSize: 12, color: '#b91c1c' }} />, label: 'S', tooltip: 'Sakit', color: '#fee2e2' },
    { icon: <HospitalIcon sx={{ fontSize: 12, color: '#be185d' }} />, label: 'M', tooltip: 'Haid', color: '#fce7f3' },
];

const AttendancePage = () => {
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedYear, setSelectedYear] = useState(null);
    const [currentPeriod, setCurrentPeriod] = useState(null);
    const [showLegend, setShowLegend] = useState(false);
    const [activeTab, setActiveTab] = useState('matrix');

    // Fetch dynamic initial period from backend on component mount
    React.useEffect(() => {
        const fetchInitialPeriod = async () => {
            try {
                const response = await fetch('/api/latest-period');
                const data = await response.json();
                if (data.success) {
                    setSelectedMonth(data.month);
                    setSelectedYear(data.year);
                } else {
                    throw new Error(data.error);
                }
            } catch (err) {
                console.error('Failed to fetch initial period:', err);
                // Fallback to static logic if API fails
                const today = new Date();
                let m = today.getMonth() + 1;
                let y = today.getFullYear();
                if (today.getDate() < 15) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
                setSelectedMonth(m);
                setSelectedYear(y);
            }
        };
        fetchInitialPeriod();
    }, []);

    // Automation State
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [isAutomationOpen, setIsAutomationOpen] = useState(false);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);
    const [comparisonData, setComparisonData] = useState(null);
    const [compareMode, setCompareMode] = useState('off');
    const [isComparing, setIsComparing] = useState(false);
    const [syncTargetMode, setSyncTargetMode] = useState('all');

    const months = getMonths();
    const years = getYears();

    const handleFetchData = async () => {
        if (!selectedMonth || !selectedYear) return;

        setLoading(true);
        setError(null);
        setSelectedEmployeeIds([]); // Reset selection on new fetch
        try {
            const data = await fetchAttendanceData(selectedMonth, selectedYear);
            setAttendanceData(data);
            setCurrentPeriod({
                month: months.find(m => m.id === selectedMonth)?.name,
                year: selectedYear,
                count: data.length
            });
        } catch (err) {
            setError('Gagal memuat data. Periksa koneksi backend.');
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = () => {
        if (currentPeriod) {
            handleFetchData();
        }
    };

    // Handle data updates - either full refresh or local state update
    const handleDataUpdate = (updateInfo) => {
        if (!updateInfo) {
            // No info = full refresh (backward compatibility)
            handleRefresh();
            return;
        }

        if (updateInfo.type === 'update_employee') {
            // Local state update - don't fetch all data again
            setAttendanceData(prevData =>
                prevData.map(emp =>
                    emp.id === updateInfo.id
                        ? { ...emp, ...updateInfo.updates }
                        : emp
                )
            );
        }
    };

    const performComparison = async () => {
        if (!attendanceData.length) return;

        setIsComparing(true);
        // Default to current selected month range if not specified
        // We assume comparison uses same period as selected
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Filter employees if selection exists
        const employeesToCompare = selectedEmployeeIds.length > 0
            ? attendanceData.filter(e => selectedEmployeeIds.includes(e.id))
            : attendanceData;

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

            const data = await response.json();
            if (data.success) {
                handleComparisonComplete(data);
                return data;
            }
        } catch (e) {
            console.error("Auto-Comparison failed:", e);
        } finally {
            setIsComparing(false);
        }
    };

    // Calculate MISS counts for selected employees
    const getSelectedMissCounts = () => {
        if (!comparisonData || selectedEmployeeIds.length === 0 || !attendanceData.length) {
            return { hasRegularMiss: false, hasOTMiss: false, regularMissCount: 0, otMissCount: 0 };
        }

        let regularMissCount = 0;
        let otMissCount = 0;

        selectedEmployeeIds.forEach(empId => {
            const emp = attendanceData.find(e => e.id === empId);
            if (!emp || !emp.attendance) return;

            const ptrjId = emp.ptrjEmployeeID;
            if (!ptrjId || ptrjId === 'N/A') return;

            Object.values(emp.attendance).forEach(day => {
                if (!day || !day.status) return;
                const dateStr = day.date;
                const key = `${ptrjId}_${dateStr}`;
                const millwareRecord = comparisonData[key];
                const statusUpper = (day.status || '').toUpperCase();

                if (['ALFA', 'N/A', 'OFF'].includes(statusUpper)) return;

                if (compareMode === 'presence') {
                    if (!millwareRecord || !millwareRecord.hasRegularRecord) {
                        regularMissCount++;
                    } else if (!millwareRecord.regularMatched) {
                        regularMissCount++;
                    }
                } else if (compareMode === 'overtime') {
                    const vOT = Number(day.overtimeHours) || 0;
                    if (vOT > 0) {
                        if (!millwareRecord || !millwareRecord.hasOTRecord) {
                            otMissCount += vOT;
                        } else if (!millwareRecord.otMatched) {
                            otMissCount += vOT;
                        }
                    }
                } else {
                    // All mode: count both
                    if (!millwareRecord || !millwareRecord.hasRegularRecord) {
                        regularMissCount++;
                    } else if (!millwareRecord.regularMatched) {
                        regularMissCount++;
                    }

                    const vOT = Number(day.overtimeHours) || 0;
                    if (vOT > 0) {
                        if (!millwareRecord || !millwareRecord.hasOTRecord) {
                            otMissCount += vOT;
                        } else if (!millwareRecord.otMatched) {
                            otMissCount += vOT;
                        }
                    }
                }
            });
        });

        return {
            hasRegularMiss: regularMissCount > 0,
            hasOTMiss: otMissCount > 0,
            regularMissCount,
            otMissCount
        };
    };

    const openSyncDialog = (mode) => {
        setSyncTargetMode(mode);
        setIsAutomationOpen(true);
    };

    const handleComparisonComplete = (data) => {
        const map = {};
        if (data && data.results) {
            data.results.forEach(r => {
                const key = `${r.ptrjId}_${r.date}`;
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
        }
        setComparisonData(map);
        // If we just got data and mode was off, set it to presence
        if (compareMode === 'off') setCompareMode('presence');
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

    return (
        <Box sx={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#f8fafc',
            overflow: 'hidden'
        }}>
            {/* Compact Header Bar */}
            <Paper
                elevation={0}
                sx={{
                    px: 2,
                    py: 1,
                    borderBottom: '1px solid #e2e8f0',
                    bgcolor: '#ffffff',
                    flexShrink: 0
                }}
            >
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    flexWrap: 'wrap'
                }}>
                    {/* Left: Title + Period Selector */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {/* Title */}
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 700,
                                color: '#0f172a',
                                fontSize: '1rem',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            📊 Rekap Absensi
                        </Typography>

                        <Box sx={{ width: 1, height: 24, bgcolor: '#e5e7eb', mx: 1 }} />
                        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ minHeight: 40 }}>
                            <Tab icon={<AssessmentIcon fontSize="small" />} iconPosition="start" label="Report" value="report" sx={{ minHeight: 40, py: 0, fontSize: '0.85rem' }} />
                            <Tab icon={<TableViewIcon fontSize="small" />} iconPosition="start" label="Matrix" value="matrix" sx={{ minHeight: 40, py: 0, fontSize: '0.85rem' }} />
                            <Tab icon={<CompareTabIcon fontSize="small" />} iconPosition="start" label="Komparasi" value="comparison" sx={{ minHeight: 40, py: 0, fontSize: '0.85rem' }} />
                        </Tabs>

                        {/* REMOVED DIVIDER AS REQUESTED */}

                        {/* Period Selector - Compact */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FormControl size="small" sx={{ minWidth: 90 }}>
                                <Select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    sx={{
                                        fontSize: '0.85rem',
                                        '& .MuiSelect-select': { py: 0.75, px: 1.5 }
                                    }}
                                >
                                    {years.map(year => (
                                        <MenuItem key={year} value={year}>{year}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl size="small" sx={{ minWidth: 120 }}>
                                <Select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    sx={{
                                        fontSize: '0.85rem',
                                        '& .MuiSelect-select': { py: 0.75, px: 1.5 }
                                    }}
                                >
                                    {months.map(m => (
                                        <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleFetchData}
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <SearchIcon />}
                                sx={{
                                    bgcolor: '#7c3aed',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    px: 2,
                                    py: 0.75,
                                    '&:hover': { bgcolor: '#6d28d9' }
                                }}
                            >
                                {loading ? 'Loading...' : 'Tampilkan'}
                            </Button>

                            {currentPeriod && (
                                <Tooltip title="Refresh Data">
                                    <IconButton
                                        size="small"
                                        onClick={handleRefresh}
                                        disabled={loading}
                                        sx={{ color: '#64748b' }}
                                    >
                                        <RefreshIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Box>
                    </Box>

                    {/* Center: Current Period Info */}
                    {currentPeriod && (
                        <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
                            <Chip
                                label={`${currentPeriod.month} ${currentPeriod.year}`}
                                size="small"
                                sx={{
                                    bgcolor: '#f0fdf4',
                                    color: '#166534',
                                    fontWeight: 600,
                                    fontSize: '0.75rem'
                                }}
                            />
                            <Chip
                                label={`${currentPeriod.count} Karyawan`}
                                size="small"
                                sx={{
                                    bgcolor: '#eff6ff',
                                    color: '#1e40af',
                                    fontWeight: 500,
                                    fontSize: '0.75rem'
                                }}
                            />
                        </Box>
                    )}

                    {/* Right: Legend Toggle + Compact Legend */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                        {/* Compare Button - Now cycles modes and triggers comparison */}
                        {attendanceData.length > 0 && (
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                    variant={compareMode !== 'off' ? "contained" : "outlined"}
                                    size="small"
                                    color={compareMode !== 'off' ? "info" : "inherit"}
                                    startIcon={isComparing ? <CircularProgress size={14} color="inherit" /> : <CompareIcon />}
                                    onClick={handleCompareToggle}
                                    disabled={isComparing}
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 800,
                                        fontSize: '0.8rem',
                                        height: 32,
                                        minWidth: 100
                                    }}
                                >
                                    {isComparing ? 'Syncing...' : (compareMode === 'off' ? 'CHECK SYNC' : compareMode.toUpperCase())}
                                </Button>
                                
                                <Tooltip title="Buka Detail Komparasi">
                                    <IconButton 
                                        size="small" 
                                        onClick={() => setIsComparisonOpen(true)}
                                        sx={{ bgcolor: 'rgba(0,0,0,0.05)' }}
                                    >
                                        <CompareTabIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>

                                {comparisonData && compareMode !== 'off' && (
                                    <Select
                                        size="small"
                                        value={compareMode}
                                        onChange={(e) => setCompareMode(e.target.value)}
                                        sx={{ height: 32, fontSize: '0.8rem', bgcolor: 'white' }}
                                    >
                                        <MenuItem value="presence">Presence</MenuItem>
                                        <MenuItem value="overtime">Overtime</MenuItem>
                                        <MenuItem value="off">Off</MenuItem>
                                    </Select>
                                )}
                            </Box>
                        )}

                        {/* Sync Buttons - Shows when employees ARE selected AND comparison data exists */}
                        {selectedEmployeeIds.length > 0 && comparisonData && compareMode !== 'off' && (() => {
                            const counts = getSelectedMissCounts();
                            const showAbsen = counts.hasRegularMiss;
                            const showOT = counts.hasOTMiss;
                            const showCombined = counts.hasRegularMiss || counts.hasOTMiss;
                            return (
                                <Box sx={{ display: 'flex', gap: 1, mr: 1 }}>
                                    {/* Combined Sync */}
                                    {showCombined && (
                                        <Tooltip title="Sinkronkan Absensi & Overtime">
                                            <Button
                                                variant="contained"
                                                size="small"
                                                color="primary"
                                                startIcon={<SyncIcon />}
                                                onClick={() => openSyncDialog('all')}
                                                sx={{
                                                    textTransform: 'none',
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    minWidth: 90
                                                }}
                                            >
                                                Sinkron ({selectedEmployeeIds.length})
                                            </Button>
                                        </Tooltip>
                                    )}
                                    {/* Regular Only */}
                                    {showAbsen && (
                                        <Tooltip title={`Sinkronkan ${counts.regularMissCount} hari absensi MISS`}>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                color="warning"
                                                startIcon={<CancelIcon />}
                                                onClick={() => openSyncDialog('regular')}
                                                sx={{
                                                    textTransform: 'none',
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    minWidth: 60,
                                                    borderColor: '#DC2626',
                                                    color: '#DC2626',
                                                    '&:hover': { borderColor: '#DC2626', bgcolor: 'rgba(220, 38, 38, 0.04)' }
                                                }}
                                            >
                                                Absen {counts.regularMissCount > 0 ? `(${counts.regularMissCount})` : ''}
                                            </Button>
                                        </Tooltip>
                                    )}
                                    {/* Overtime Only */}
                                    {showOT && (
                                        <Tooltip title={`Sinkronkan ${counts.otMissCount}h overtime MISS`}>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                sx={{
                                                    textTransform: 'none',
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    minWidth: 60,
                                                    borderColor: '#7C3AED',
                                                    color: '#7C3AED',
                                                    '&:hover': { borderColor: '#7C3AED', bgcolor: 'rgba(124, 58, 237, 0.04)' }
                                                }}
                                                onClick={() => openSyncDialog('overtime')}
                                            >
                                                <TimeIcon sx={{ fontSize: '14px !important', mr: 0.5, color: '#7C3AED' }} />
                                                OT {counts.otMissCount > 0 ? `(${counts.otMissCount}h)` : ''}
                                            </Button>
                                        </Tooltip>
                                    )}
                                </Box>
                            );
                        })()}

                        {/* Inline Compact Legend */}
                        <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.5 }}>
                            {legendItems.map((item, index) => (
                                <Tooltip key={index} title={item.tooltip} arrow>
                                    <Chip
                                        icon={item.icon}
                                        label={item.label}
                                        size="small"
                                        sx={{
                                            height: 22,
                                            bgcolor: item.color,
                                            color: item.label === 'A' ? '#ffffff' : '#374151',
                                            fontWeight: 600,
                                            fontSize: '0.65rem',
                                            border: '1px solid #e5e7eb',
                                            '& .MuiChip-icon': { ml: 0.5, mr: -0.5 },
                                            '& .MuiChip-label': { px: 0.5 }
                                        }}
                                    />
                                </Tooltip>
                            ))}
                        </Box>

                        {/* Mobile Legend Toggle */}
                        <IconButton
                            size="small"
                            onClick={() => setShowLegend(!showLegend)}
                            sx={{ display: { xs: 'flex', lg: 'none' }, color: '#64748b' }}
                        >
                            {showLegend ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                    </Box>
                </Box>

                {/* Mobile Legend Collapse */}
                <Collapse in={showLegend}>
                    <Box sx={{
                        display: { xs: 'flex', lg: 'none' },
                        flexWrap: 'wrap',
                        gap: 0.5,
                        mt: 1,
                        pt: 1,
                        borderTop: '1px solid #f1f5f9'
                    }}>
                        {legendItems.map((item, index) => (
                            <Chip
                                key={index}
                                icon={item.icon}
                                label={item.tooltip}
                                size="small"
                                sx={{
                                    height: 24,
                                    bgcolor: item.color,
                                    color: item.label === 'A' ? '#ffffff' : '#374151',
                                    fontWeight: 500,
                                    fontSize: '0.7rem',
                                    border: '1px solid #e5e7eb',
                                    '& .MuiChip-icon': { ml: 0.5 }
                                }}
                            />
                        ))}
                    </Box>
                </Collapse>
            </Paper>

            {/* Error Alert */}
            {error && (
                <Alert
                    severity="error"
                    sx={{ mx: 2, mt: 1, flexShrink: 0 }}
                    onClose={() => setError(null)}
                >
                    {error}
                </Alert>
            )}

            {/* Main Content Area - Takes all remaining space */}
            <Box sx={{
                flexGrow: 1,
                overflow: 'hidden',
                p: 1.5,
                display: 'flex',
                flexDirection: 'column'
            }}>
                {loading ? (
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        bgcolor: '#ffffff',
                        borderRadius: 1,
                        border: '1px solid #e2e8f0'
                    }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <CircularProgress sx={{ mb: 2 }} />
                            <Typography variant="body2" color="text.secondary">
                                Memuat data absensi...
                            </Typography>
                        </Box>
                    </Box>
                ) : attendanceData.length === 0 ? (
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        bgcolor: '#ffffff',
                        borderRadius: 1,
                        border: '1px solid #e2e8f0'
                    }}>
                        <Box sx={{ textAlign: 'center', p: 4 }}>
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                                Pilih Periode
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Pilih bulan dan tahun, lalu klik "Tampilkan" untuk memuat data absensi
                            </Typography>
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {activeTab === 'report' && (
                            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                                <AttendanceSummaryReport data={attendanceData} />
                            </Box>
                        )}
                        {activeTab === 'matrix' && (
                            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                                <AttendanceMatrix
                                    data={attendanceData}
                                    onDataUpdate={handleDataUpdate}
                                    selectedIds={selectedEmployeeIds}
                                    onToggleSelect={setSelectedEmployeeIds}
                                    compareMode={compareMode}
                                    comparisonData={comparisonData}
                                    isLoadingComparison={isComparing}
                                />
                            </Box>
                        )}
                        {activeTab === 'comparison' && (
                            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                                <ComparisonDialog
                                    open={false}
                                    inline={true}
                                    selectedEmployees={selectedEmployeeIds.length > 0
                                        ? attendanceData.filter(e => selectedEmployeeIds.includes(e.id))
                                        : attendanceData
                                    }
                                    month={selectedMonth}
                                    year={selectedYear}
                                    onComparisonComplete={handleComparisonComplete}
                                />
                            </Box>
                        )}
                    </Box>
                )}
            </Box>

            {/* Automation Dialog */}
            <AutomationDialog
                open={isAutomationOpen}
                onClose={() => { setIsAutomationOpen(false); setSyncTargetMode('all'); }}
                selectedEmployees={attendanceData.filter(e => selectedEmployeeIds.includes(e.id))}
                month={selectedMonth}
                year={selectedYear}
                compareMode={compareMode}
                syncTargetMode={syncTargetMode}
                comparisonData={comparisonData}
                onRefresh={performComparison}
            />

            {/* Comparison Dialog */}
            <ComparisonDialog
                open={isComparisonOpen}
                onClose={() => setIsComparisonOpen(false)}
                selectedEmployees={selectedEmployeeIds.length > 0
                    ? attendanceData.filter(e => selectedEmployeeIds.includes(e.id))
                    : attendanceData
                }
                month={selectedMonth}
                year={selectedYear}
                onComparisonComplete={handleComparisonComplete}
            />
        </Box>
    );
};

export default AttendancePage;


