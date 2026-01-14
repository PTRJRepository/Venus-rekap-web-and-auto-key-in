import React, { useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import {
    CssBaseline,
    Box,
    Alert,
    CircularProgress,
    AppBar,
    Toolbar,
    Typography,
} from '@mui/material';
import theme from './theme';
import MonthYearSelector from './components/MonthYearSelector';
import AttendanceMatrix from './components/AttendanceMatrix';
import { fetchAttendanceData } from './services/api';

function App() {
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showMatrix, setShowMatrix] = useState(false);

    const handleFetchData = async (month, year) => {
        setLoading(true);
        setError(null);
        setShowMatrix(false);

        try {
            console.log(`Fetching data for ${month}/${year}...`);
            const data = await fetchAttendanceData(month, year);
            setAttendanceData(data);
            setShowMatrix(true);
        } catch (err) {
            setError('Gagal memuat data absensi. Pastikan backend server berjalan pada port 5000.');
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />

            {/* Top Navigation Bar */}
            <AppBar position="static" color="primary" elevation={2}>
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
                        VenusHR | Rekap Absensi Karyawan
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.9 }}>
                        PTRJ
                    </Typography>
                </Toolbar>
            </AppBar>

            {/* Main Container - FULL WIDTH */}
            <Box sx={{
                width: '100vw',
                minHeight: 'calc(100vh - 64px)',
                p: 0,
                m: 0,
                bgcolor: '#f5f5f5',
                overflow: 'auto'
            }}>
                <Box sx={{ p: 3 }}>
                    <MonthYearSelector onFetch={handleFetchData} loading={loading} />

                    {error && (
                        <Alert severity="error" sx={{ mb: 2, maxWidth: 1200, mx: 'auto' }} onClose={() => setError(null)}>
                            {error}
                        </Alert>
                    )}

                    {loading && (
                        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={10}>
                            <CircularProgress size={60} thickness={4} />
                            <Typography variant="h6" color="text.secondary" sx={{ mt: 2 }}>
                                Memuat Data Absensi...
                            </Typography>
                        </Box>
                    )}

                    {showMatrix && !loading && (
                        <Box sx={{ mt: 3 }}>
                            <AttendanceMatrix data={attendanceData} />
                        </Box>
                    )}
                </Box>
            </Box>
        </ThemeProvider>
    );
}

export default App;