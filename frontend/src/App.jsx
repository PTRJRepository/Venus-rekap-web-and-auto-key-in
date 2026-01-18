import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import {
    CssBaseline,
    Box,
    Paper,
    Divider,
    IconButton,
    Tooltip,
    Alert,
    CircularProgress,
    Chip,
    Typography,
    Snackbar,
    ToggleButtonGroup,
    ToggleButton,
    Tabs,
    Tab
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    FileDownload as FileDownloadIcon,
    Info as InfoIcon,
    Visibility as VisibilityIcon,
    Timer as TimerIcon,
    Details as DetailsIcon,
    TableChart as TableChartIcon,
    ImportExport as ImportExportIcon,
    SaveAlt as SaveAltIcon,
    CheckCircle as CheckIcon,
    Cancel as CancelIcon,
    AccessTime as TimeIcon,
    Flight as FlightIcon,
    LocalHospital as HospitalIcon,
    WbSunny as SunIcon
} from '@mui/icons-material';
import theme from './theme';
import TopNavbar from './components/TopNavbar';
import MonthNavigator from './components/MonthNavigator';
import MonthYearSelector from './components/MonthYearSelector';
import AttendanceMatrix from './components/AttendanceMatrix';
import ExportTab from './components/ExportTab';
import { fetchAttendanceData } from './services/api';

// Compact Legend Items for inline display
const legendItems = [
    { icon: <CheckIcon sx={{ fontSize: 11, color: '#059669' }} />, label: 'H', tooltip: 'Hadir', color: '#ecfdf5' },
    { icon: <CancelIcon sx={{ fontSize: 11, color: '#fff' }} />, label: 'A', tooltip: 'ALFA', color: '#7f1d1d' },
    { icon: <SunIcon sx={{ fontSize: 11, color: '#64748b' }} />, label: 'OFF', tooltip: 'Libur/Minggu', color: '#f1f5f9' },
    { icon: <TimeIcon sx={{ fontSize: 11, color: '#c2410c' }} />, label: 'OT', tooltip: 'Lembur', color: '#fff7ed' },
    { icon: <FlightIcon sx={{ fontSize: 11, color: '#1e40af' }} />, label: 'C', tooltip: 'Cuti/Izin', color: '#eff6ff' },
    { icon: <HospitalIcon sx={{ fontSize: 11, color: '#b91c1c' }} />, label: 'S', tooltip: 'Sakit', color: '#fee2e2' },
];

function App() {
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('attendance'); // 'attendance', 'overtime', 'detail'
    const [activeTab, setActiveTab] = useState('matrix'); // 'matrix', 'export'
    const [currentPeriod, setCurrentPeriod] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
    });
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

    const handleFetchData = async (month, year) => {
        setLoading(true);
        setError(null);
        setCurrentPeriod({ month, year });

        try {
            const responseData = await fetchAttendanceData(month, year);
            const finalData = Array.isArray(responseData) ? responseData : (responseData?.data || []);
            setAttendanceData(finalData);

            setSnackbar({
                open: true,
                message: `Data ${getMonthName(month)} ${year} berhasil dimuat: ${finalData.length} karyawan`,
                severity: 'success'
            });
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Gagal menghubungkan ke server. Periksa koneksi backend.');
        } finally {
            setLoading(false);
        }
    };

    const getMonthName = (month) => {
        const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        return names[month - 1];
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />

            {/* ROOT CONTAINER - FIXED HEIGHT, NO SCROLL */}
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                overflow: 'hidden',
                bgcolor: '#f3f4f6'
            }}>

                {/* 1. Top Navbar (Fixed) - COMPACT */}
                <TopNavbar />

                {/* 2. Combined Control Bar - Tabs + Period + Legend + Actions */}
                <Paper
                    elevation={0}
                    sx={{
                        borderRadius: 0,
                        borderBottom: '1px solid #e5e7eb',
                        px: 1.5,
                        py: 0.75,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        zIndex: 10,
                        bgcolor: '#ffffff',
                        flexWrap: 'nowrap',
                        minHeight: 48
                    }}
                >
                    {/* Tab Buttons - Compact */}
                    <ToggleButtonGroup
                        value={activeTab}
                        exclusive
                        onChange={(e, v) => v && setActiveTab(v)}
                        size="small"
                        sx={{
                            '& .MuiToggleButton-root': {
                                px: 1.5,
                                py: 0.5,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                textTransform: 'none',
                                border: '1px solid #e5e7eb',
                                '&.Mui-selected': {
                                    bgcolor: '#7c3aed',
                                    color: 'white',
                                    '&:hover': { bgcolor: '#6d28d9' }
                                }
                            }
                        }}
                    >
                        <ToggleButton value="matrix">
                            <TableChartIcon sx={{ fontSize: 14, mr: 0.5 }} />
                            Matrix
                        </ToggleButton>
                        <ToggleButton value="export">
                            <SaveAltIcon sx={{ fontSize: 14, mr: 0.5 }} />
                            Export
                        </ToggleButton>
                    </ToggleButtonGroup>

                    {activeTab === 'matrix' && (
                        <>
                            <Divider orientation="vertical" flexItem sx={{ height: 28, my: 'auto' }} />

                            {/* Period Info */}
                            <Chip
                                label={`${getMonthName(currentPeriod.month)} ${currentPeriod.year}`}
                                size="small"
                                sx={{
                                    height: 24,
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    bgcolor: '#ede9fe',
                                    color: '#7c3aed'
                                }}
                            />

                            {/* Month Navigator */}
                            <MonthNavigator onFetch={handleFetchData} loading={loading} />

                            <Divider orientation="vertical" flexItem sx={{ height: 28, my: 'auto' }} />

                            {/* View Mode Toggle - Super Compact */}
                            <ToggleButtonGroup
                                value={viewMode}
                                exclusive
                                onChange={(e, newMode) => newMode && setViewMode(newMode)}
                                size="small"
                                sx={{
                                    '& .MuiToggleButton-root': {
                                        px: 1,
                                        py: 0.4,
                                        fontSize: '0.65rem',
                                        fontWeight: 600,
                                        textTransform: 'none',
                                        border: '1px solid #e5e7eb',
                                        color: '#64748b',
                                        '&.Mui-selected': {
                                            bgcolor: '#0f172a',
                                            color: 'white',
                                            '&:hover': { bgcolor: '#1e293b' }
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value="attendance">
                                    <VisibilityIcon sx={{ fontSize: 12, mr: 0.3 }} />
                                    Hadir
                                </ToggleButton>
                                <ToggleButton value="overtime">
                                    <TimerIcon sx={{ fontSize: 12, mr: 0.3 }} />
                                    +OT
                                </ToggleButton>
                                <ToggleButton value="detail">
                                    <DetailsIcon sx={{ fontSize: 12, mr: 0.3 }} />
                                    Detail
                                </ToggleButton>
                            </ToggleButtonGroup>

                            {/* Spacer */}
                            <Box sx={{ flexGrow: 1 }} />

                            {/* Inline Legend - Very Compact */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {legendItems.map((item, index) => (
                                    <Tooltip key={index} title={item.tooltip} arrow placement="bottom">
                                        <Chip
                                            icon={item.icon}
                                            label={item.label}
                                            size="small"
                                            sx={{
                                                height: 20,
                                                bgcolor: item.color,
                                                color: item.label === 'A' ? '#ffffff' : '#374151',
                                                fontWeight: 600,
                                                fontSize: '0.6rem',
                                                border: '1px solid #e5e7eb',
                                                '& .MuiChip-icon': { ml: 0.3, mr: -0.5 },
                                                '& .MuiChip-label': { px: 0.3 }
                                            }}
                                        />
                                    </Tooltip>
                                ))}
                            </Box>

                            <Divider orientation="vertical" flexItem sx={{ height: 28, my: 'auto' }} />

                            {/* Refresh Button */}
                            <Tooltip title="Refresh Data">
                                <IconButton
                                    size="small"
                                    onClick={() => handleFetchData(currentPeriod.month, currentPeriod.year)}
                                    disabled={loading}
                                    sx={{
                                        border: '1px solid #e5e7eb',
                                        bgcolor: '#fafbfc',
                                        width: 28,
                                        height: 28,
                                        '&:hover': { bgcolor: '#f3f4f6' }
                                    }}
                                >
                                    <RefreshIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>

                            {/* Employee Count */}
                            <Chip
                                label={`${attendanceData.length}`}
                                size="small"
                                icon={<InfoIcon sx={{ fontSize: '12px !important' }} />}
                                sx={{
                                    height: 22,
                                    fontWeight: 700,
                                    bgcolor: '#eff6ff',
                                    color: '#1e40af',
                                    border: '1px solid #dbeafe',
                                    '& .MuiChip-icon': { ml: 0.5 },
                                    '& .MuiChip-label': { px: 0.5 }
                                }}
                            />
                        </>
                    )}
                </Paper>

                {/* 3. Main Content Area - MAXIMIZED */}
                <Box sx={{
                    flexGrow: 1,
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: '#f9fafb'
                }}>

                    {/* Content Switcher */}
                    {activeTab === 'matrix' ? (
                        <>
                            {/* Error Alert */}
                            {error && (
                                <Alert
                                    severity="error"
                                    onClose={() => setError(null)}
                                    sx={{ mx: 1, mt: 1, mb: 0, borderRadius: 1, py: 0.5 }}
                                >
                                    {error}
                                </Alert>
                            )}

                            {/* Loading Overlay */}
                            {loading && (
                                <Box sx={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    bgcolor: 'rgba(255,255,255,0.9)',
                                    zIndex: 100,
                                    backdropFilter: 'blur(2px)'
                                }}>
                                    <CircularProgress size={36} thickness={4} />
                                    <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 500, color: '#6b7280' }}>
                                        Mengambil data...
                                    </Typography>
                                </Box>
                            )}

                            {/* Attendance Matrix - FILLS ALL REMAINING SPACE */}
                            <Box sx={{
                                flexGrow: 1,
                                p: 1,
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                {attendanceData.length > 0 ? (
                                    <AttendanceMatrix
                                        data={attendanceData}
                                        viewMode={viewMode}
                                        onDataUpdate={() => handleFetchData(currentPeriod.month, currentPeriod.year)}
                                    />
                                ) : (
                                    <Box sx={{ flexGrow: 1, display: 'flex' }}>
                                        <MonthYearSelector onFetch={handleFetchData} loading={loading} />
                                    </Box>
                                )}
                            </Box>
                        </>
                    ) : (
                        /* Export Tab Content */
                        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                            <ExportTab />
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Snackbar Notifications */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={3000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </ThemeProvider>
    );
}

export default App;
