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
    Badge
} from '@mui/material';
import {
    CheckCircle as CheckIcon,
    Cancel as CancelIcon,
    AccessTime as TimeIcon,
    Flight as FlightIcon,
    LocalHospital as HospitalIcon,
    WbSunny as SunIcon,
    Search as SearchIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Refresh as RefreshIcon,
    Sync as SyncIcon,
    CompareArrows as CompareIcon
} from '@mui/icons-material';
import AttendanceMatrix from '../components/AttendanceMatrix';
import AutomationDialog from '../components/AutomationDialog';
import ComparisonDialog from '../components/ComparisonDialog';
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
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [currentPeriod, setCurrentPeriod] = useState(null);
    const [showLegend, setShowLegend] = useState(false);

    // Automation State
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [isAutomationOpen, setIsAutomationOpen] = useState(false);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);
    const [comparisonData, setComparisonData] = useState(null);
    const [compareMode, setCompareMode] = useState('off');

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
        }
    };

    const handleComparisonComplete = (data) => {
        const map = {};
        if (data && data.results) {
            data.results.forEach(r => {
                const key = `${r.ptrjId}_${r.date}`;
                // If not_synced, we don't put it in map (or put null) so !map[key] works
                // If synced/mismatch, we put details
                if (r.syncStatus !== 'not_synced') { // Include ALL Millware records (even matched ones) to know they exist
                    if (r.details) {
                        map[key] = {
                            hours: r.details.millwareHours,
                            normal: r.details.millwareNormal,
                            ot: r.details.millwareOT,
                            TaskCode: r.details.millwareTaskCode || r.millwareTaskCode // Capture TaskCode
                        };
                    }
                }
            });
        }
        setComparisonData(map);
        if (compareMode === 'off') setCompareMode('presence');
        // Don't close dialog automatically, let user review results
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
                        {/* Compare Button - Always show when data exists */}
                        {attendanceData.length > 0 && (
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                    variant={compareMode !== 'off' ? "contained" : "outlined"}
                                    size="small"
                                    color="info"
                                    startIcon={<CompareIcon />}
                                    onClick={() => setIsComparisonOpen(true)}
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    Compare
                                </Button>
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

                        {/* Sync Button - Shows when employees ARE selected */}
                        {selectedEmployeeIds.length > 0 && (
                            <Button
                                variant="contained"
                                size="small"
                                color="success"
                                startIcon={<SyncIcon />}
                                onClick={() => setIsAutomationOpen(true)}
                                sx={{
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    mr: 1
                                }}
                            >
                                Sinkron ({selectedEmployeeIds.length})
                            </Button>
                        )}

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
                    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                        <AttendanceMatrix
                            data={attendanceData}
                            onDataUpdate={handleDataUpdate}
                            selectedIds={selectedEmployeeIds}
                            onToggleSelect={setSelectedEmployeeIds}
                            compareMode={compareMode}
                            comparisonData={comparisonData}
                        />
                    </Box>
                )}
            </Box>

            {/* Automation Dialog */}
            <AutomationDialog
                open={isAutomationOpen}
                onClose={() => setIsAutomationOpen(false)}
                selectedEmployees={attendanceData.filter(e => selectedEmployeeIds.includes(e.id))}
                month={selectedMonth}
                year={selectedYear}
                compareMode={compareMode}
                compareMode={compareMode}
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


