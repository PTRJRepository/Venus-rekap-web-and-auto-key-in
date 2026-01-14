import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import {
    CssBaseline,
    Box,
    AppBar,
    Toolbar,
    Typography,
    Paper,
    Divider,
    IconButton,
    Tooltip,
    Alert,
    CircularProgress,
    Chip
} from '@mui/material';
import { 
    Menu as MenuIcon, 
    Refresh as RefreshIcon, 
    DateRange as DateRangeIcon,
    FileDownload as FileDownloadIcon,
    Settings as SettingsIcon,
    Person as PersonIcon
} from '@mui/icons-material';
import theme from './theme';
import MonthNavigator from './components/MonthNavigator';
import AttendanceMatrix from './components/AttendanceMatrix';
import { fetchAttendanceData } from './services/api';

function App() {
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentPeriod, setCurrentPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });

    const handleFetchData = async (month, year) => {
        setLoading(true);
        setError(null);
        setCurrentPeriod({ month, year });
        try {
            const responseData = await fetchAttendanceData(month, year);
            // Handle both array (if api.js fixed) or object { success: true, data: [] }
            const finalData = Array.isArray(responseData) ? responseData : (responseData?.data || []);
            setAttendanceData(finalData);
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Gagal menghubungkan ke server. Periksa koneksi backend.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
                
                {/* 1. Top Navbar (Odoo Style - Dark Navy) */}
                <AppBar position="static" color="primary" elevation={0} sx={{ borderBottom: '1px solid #1e293b' }}>
                    <Toolbar variant="dense" sx={{ minHeight: 48 }}>
                        <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 1 }}>
                            <MenuIcon fontSize="small" />
                        </IconButton>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                             <DateRangeIcon fontSize="small" sx={{ opacity: 0.8 }} />
                             <Typography variant="subtitle1" component="div" sx={{ fontWeight: 700 }}>
                                Rekap Absensi
                            </Typography>
                        </Box>
                        
                        <Box sx={{ flexGrow: 1 }} />
                        
                        <Chip 
                            label="Venus Millware v2.0" 
                            size="small" 
                            sx={{ 
                                bgcolor: 'rgba(255,255,255,0.1)', 
                                color: 'white', 
                                height: 24, 
                                fontSize: '0.7rem',
                                mr: 2,
                                border: '1px solid rgba(255,255,255,0.2)'
                            }} 
                        />
                        <IconButton color="inherit" size="small"><SettingsIcon fontSize="small" /></IconButton>
                        <IconButton color="inherit" size="small"><PersonIcon fontSize="small" /></IconButton>
                    </Toolbar>
                </AppBar>

                {/* 2. Control Bar (White Toolbar - Filters & Actions) */}
                <Paper 
                    elevation={0} 
                    sx={{ 
                        borderRadius: 0, 
                        borderBottom: '1px solid #e2e8f0', 
                        px: 2, 
                        py: 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        zIndex: 10
                    }}
                >
                    {/* Month Navigator Integrated here */}
                    <Box sx={{ flexGrow: 1, maxWidth: '800px' }}>
                        <MonthNavigator onFetch={handleFetchData} loading={loading} />
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ height: 28, my: 'auto' }} />

                    {/* Action Buttons */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Refresh Data">
                            <IconButton 
                                size="small" 
                                onClick={() => handleFetchData(currentPeriod.month, currentPeriod.year)}
                                disabled={loading}
                                sx={{ border: '1px solid #e2e8f0', borderRadius: 1 }}
                            >
                                <RefreshIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Export Excel">
                            <IconButton 
                                size="small"
                                disabled={loading || attendanceData.length === 0} 
                                sx={{ border: '1px solid #e2e8f0', borderRadius: 1 }}
                            >
                                <FileDownloadIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Paper>

                {/* 3. Main Content Area (Scroll Locked to this area) */}
                <Box sx={{ flexGrow: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                    
                    {error && (
                        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2, mb: 0 }}>
                            {error}
                        </Alert>
                    )}

                    {loading && (
                        <Box sx={{ 
                            position: 'absolute', 
                            top: 0, left: 0, right: 0, bottom: 0, 
                            display: 'flex', 
                            flexDirection: 'column',
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            bgcolor: 'rgba(255,255,255,0.8)',
                            zIndex: 20,
                            backdropFilter: 'blur(2px)'
                        }}>
                            <CircularProgress size={40} thickness={4} />
                            <Typography variant="body2" sx={{ mt: 2, fontWeight: 500, color: 'text.secondary' }}>
                                Mengambil data dari server...
                            </Typography>
                        </Box>
                    )}

                    {/* Matrix fills remaining space exactly */}
                    <Box sx={{ flexGrow: 1, p: 2, overflow: 'hidden' }}>
                        <AttendanceMatrix data={attendanceData} />
                    </Box>
                    
                    {/* Footer Status Bar */}
                    <Box sx={{ 
                        borderTop: '1px solid #e2e8f0', 
                        bgcolor: '#fff', 
                        px: 2, 
                        py: 0.5, 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: 'text.secondary'
                    }}>
                        <Typography variant="caption">
                            Menampilkan {attendanceData?.length || 0} karyawan.
                        </Typography>
                        <Typography variant="caption">
                             &copy; 2026 Rebinmas Venus
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}

export default App;
