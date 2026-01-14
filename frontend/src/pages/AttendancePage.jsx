import React, { useState } from 'react';
import { Container, Alert, Box, CircularProgress, Typography } from '@mui/material';
import MonthYearSelector from '../components/MonthYearSelector';
import AttendanceMatrix from '../components/AttendanceMatrix';
import { fetchAttendanceData } from '../services/api';

const AttendancePage = () => {
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleFetchData = async (month, year) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchAttendanceData(month, year);
            setAttendanceData(data);
        } catch (err) {
            setError('Failed to load attendance data. Please check the backend connection.');
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth={false}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" gutterBottom component="div" sx={{ fontWeight: 500, color: 'primary.main' }}>
                    Attendance Matrix
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    View monthly attendance overview with status, overtime, and charge job codes.
                </Typography>
            </Box>

            <MonthYearSelector onFetch={handleFetchData} loading={loading} />

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {loading ? (
                <Box display="flex" justifyContent="center" p={5}>
                    <CircularProgress />
                </Box>
            ) : (
                <AttendanceMatrix data={attendanceData} />
            )}
        </Container>
    );
};

export default AttendancePage;
