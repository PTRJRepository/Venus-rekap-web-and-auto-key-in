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
    ToggleButton
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    FileDownload as FileDownloadIcon,
    Info as InfoIcon,
    Visibility as VisibilityIcon,
    Timer as TimerIcon,
    Details as DetailsIcon
} from '@mui/icons-material';
import theme from './theme';
import TopNavbar from './components/TopNavbar';
import MonthNavigator from './components/MonthNavigator';
import AttendanceMatrix from './components/AttendanceMatrix';
import Legend from './components/Legend';
import { fetchAttendanceData } from './services/api';

function App() {
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('attendance'); // 'attendance', 'overtime', 'detail'
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

                {/* 1. Top Navbar (Fixed) */}
                <TopNavbar />

                {/* 2. Control Bar (Fixed) */}
                <Paper
                    elevation={0}
                    sx={{
                        borderRadius: 0,
                        borderBottom: '1px solid #e5e7eb',
                        px: 2,
                        py: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        zIndex: 10,
                        bgcolor: '#ffffff'
                    }}
                >
                    {/* Month Period Info */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                            label="PERIODE"
                            size="small"
                            sx={{
                                height: 24,
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                bgcolor: '#ede9fe',
                                color: '#7c3aed'
                            }}
                        />
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#111827' }}>
                            {getMonthName(currentPeriod.month)} {currentPeriod.year}
                        </Typography>
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ my: 'auto', height: 28 }} />

                    {/* Month Navigator */}
                    <Box sx={{ flexGrow: 1 }}>
                        <MonthNavigator onFetch={handleFetchData} loading={loading} />
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ my: 'auto', height: 28 }} />

                    {/* View Mode Toggle */}
                    <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        onChange={(e, newMode) => newMode && setViewMode(newMode)}
                        size="small"
                        sx={{
                            '& .MuiToggleButton-root': {
                                px: 1.5,
                                py: 0.5,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                textTransform: 'none',
                                border: '1px solid #e5e7eb',
                                color: '#64748b',
                                '&.Mui-selected': {
                                    bgcolor: '#7c3aed',
                                    color: 'white',
                                    fontWeight: 700,
                                    '&:hover': { bgcolor: '#6d28d9' }
                                }
                            }
                        }}
                    >
                        <ToggleButton value="attendance">
                            <VisibilityIcon sx={{ fontSize: 14, mr: 0.5 }} />
                            Kehadiran
                        </ToggleButton>
                        <ToggleButton value="overtime">
                            <TimerIcon sx={{ fontSize: 14, mr: 0.5 }} />
                            + Lembur
                        </ToggleButton>
                        <ToggleButton value="detail">
                            <DetailsIcon sx={{ fontSize: 14, mr: 0.5 }} />
                            Detail Lengkap
                        </ToggleButton>
                    </ToggleButtonGroup>

                    <Divider orientation="vertical" flexItem sx={{ my: 'auto', height: 28 }} />

                    {/* Action Buttons */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Refresh Data">
                            <IconButton
                                size="small"
                                onClick={() => handleFetchData(currentPeriod.month, currentPeriod.year)}
                                disabled={loading}
                                sx={{
                                    border: '1px solid #e5e7eb',
                                    bgcolor: '#fafbfc',
                                    '&:hover': { bgcolor: '#f3f4f6' }
                                }}
                            >
                                <RefreshIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Export to Excel">
                            <IconButton
                                size="small"
                                disabled={loading || attendanceData.length === 0}
                                sx={{
                                    border: '1px solid #e5e7eb',
                                    bgcolor: '#fafbfc',
                                    '&:hover': { bgcolor: '#f3f4f6' }
                                }}
                            >
                                <FileDownloadIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>

                    {/* Employee Count */}
                    <Chip
                        label={`${attendanceData.length} Karyawan`}
                        size="small"
                        icon={<InfoIcon />}
                        sx={{
                            height: 26,
                            fontWeight: 600,
                            bgcolor: '#eff6ff',
                            color: '#1e40af',
                            border: '1px solid #dbeafe'
                        }}
                    />
                </Paper>

                {/* 3. Main Content Area - SINGLE SCROLL CONTAINER */}
                <Box sx={{
                    flexGrow: 1,
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: '#f9fafb'
                }}>

                    {/* Error Alert */}
                    {error && (
                        <Alert
                            severity="error"
                            onClose={() => setError(null)}
                            sx={{ m: 2, mb: 0, borderRadius: 1 }}
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
                            <CircularProgress size={40} thickness={4} />
                            <Typography variant="body2" sx={{ mt: 2, fontWeight: 500, color: '#6b7280' }}>
                                Mengambil data dari server...
                            </Typography>
                        </Box>
                    )}

                    {/* Legend Bar */}
                    {!loading && attendanceData.length > 0 && (
                        <Box sx={{ px: 2, pt: 2 }}>
                            <Legend />
                        </Box>
                    )}

                    {/* Attendance Matrix - FILLS REMAINING SPACE WITH INTERNAL SCROLL */}
                    <Box sx={{
                        flexGrow: 1,
                        p: 2,
                        pt: attendanceData.length > 0 ? 1 : 2,
                        overflow: 'hidden', // CRITICAL: Parent doesn't scroll
                        display: 'flex'
                    }}>
                        {/* Matrix has its own internal scroll */}
                        <AttendanceMatrix data={attendanceData} viewMode={viewMode} />
                    </Box>

                    {/* Footer Status Bar (Fixed) */}
                    <Box sx={{
                        borderTop: '1px solid #e5e7eb',
                        bgcolor: '#ffffff',
                        px: 2,
                        py: 0.75,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: '#6b7280'
                    }}>
                        <Typography variant="caption">
                            Sistem Rekap Absensi • VenusHR Enterprise
                        </Typography>
                        <Typography variant="caption">
                            © 2026 Rebinmas Venus • v2.0
                        </Typography>
                    </Box>
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
