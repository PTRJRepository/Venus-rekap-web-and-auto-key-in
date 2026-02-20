import React, { useState, useEffect } from 'react';
import { Box, Paper, Tabs, Tab, Typography, IconButton, Snackbar, Alert, CircularProgress, Chip, Select, FormControl, MenuItem, ToggleButtonGroup, ToggleButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalendarIcon from '@mui/icons-material/CalendarMonth';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ExportIcon from '@mui/icons-material/FileDownload';
import TableViewIcon from '@mui/icons-material/TableView';
import ListIcon from '@mui/icons-material/ViewList';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import DetailIcon from '@mui/icons-material/EventNote';

import AttendanceSummaryReport from './components/AttendanceSummaryReport';
import AttendanceMatrix from './components/AttendanceMatrix';
import { fetchAttendanceData } from './services/api';

const App = () => {
    const [activeTab, setActiveTab] = useState('report');
    const [viewMode, setViewMode] = useState('attendance');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(1);
    const [selectedYear, setSelectedYear] = useState(2026);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

    // Month names
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const years = [2024, 2025, 2026];

    const handleFetchData = async () => {
        if (!selectedMonth || !selectedYear) return;
        setLoading(true);
        setData(null);
        try {
            const result = await fetchAttendanceData(selectedMonth, selectedYear);
            setData(result);
            showSnackbar('Data berhasil dimuat', 'success');
        } catch (error) {
            showSnackbar(`Gagal memuat data: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedMonth && selectedYear) handleFetchData();
    }, [selectedMonth, selectedYear]);

    const showSnackbar = (message, severity = 'info') => setSnackbar({ open: true, message, severity });

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f3f4f6' }}>
            <Paper elevation={1} sx={{ zIndex: 10, borderRadius: 0, borderBottom: '1px solid #e5e7eb', bgcolor: '#ffffff', px: 2, py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ minHeight: 40 }}>
                            <Tab icon={<AssessmentIcon fontSize="small" />} iconPosition="start" label="Report" value="report" sx={{ minHeight: 40, py: 0, fontSize: '0.85rem' }} />
                            <Tab icon={<TableViewIcon fontSize="small" />} iconPosition="start" label="Matrix" value="matrix" sx={{ minHeight: 40, py: 0, fontSize: '0.85rem' }} />
                            <Tab icon={<ExportIcon fontSize="small" />} iconPosition="start" label="Ekspor" value="export" sx={{ minHeight: 40, py: 0, fontSize: '0.85rem' }} />
                        </Tabs>
                        <Box sx={{ width: 1, height: 24, bgcolor: '#e5e7eb' }} />

                        {/* PERIOD SELECTOR */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f9fafb', p: 0.5, borderRadius: 1, border: '1px solid #e5e7eb' }}>
                            <CalendarIcon fontSize="small" sx={{ color: '#7c3aed', ml: 0.5 }} />
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
                                    {years.map((year) => (
                                        <MenuItem key={year} value={year}>{year}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Box>
                    </Box>

                    {/* RIGHT ACTIONS */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {activeTab === 'matrix' && (
                            <ToggleButtonGroup value={viewMode} exclusive onChange={(e, v) => v && setViewMode(v)} size="small" sx={{ height: 32 }}>
                                <ToggleButton value="attendance" sx={{ fontSize: '0.75rem', px: 1 }}><ListIcon fontSize="small" sx={{ mr: 0.5 }} />Absen</ToggleButton>
                                <ToggleButton value="overtime" sx={{ fontSize: '0.75rem', px: 1 }}><HourglassIcon fontSize="small" sx={{ mr: 0.5 }} />Lembur</ToggleButton>
                                <ToggleButton value="detail" sx={{ fontSize: '0.75rem', px: 1 }}><DetailIcon fontSize="small" sx={{ mr: 0.5 }} />Detail</ToggleButton>
                            </ToggleButtonGroup>
                        )}
                        <Chip size="small" label={`${data ? data.length : 0} Karyawan`} sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600 }} />
                        <IconButton onClick={handleFetchData} size="small" color="primary" disabled={loading}>
                            {loading ? <CircularProgress size={20} /> : <RefreshIcon fontSize="small" />}
                        </IconButton>
                    </Box>
                </Box>
            </Paper>

            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 1, overflow: 'hidden' }}>
                {activeTab === 'report' && (
                    <AttendanceSummaryReport data={data || []} />
                )}
                {activeTab === 'matrix' && (
                    <AttendanceMatrix
                        data={data || []}
                        viewMode={viewMode}
                        onDataUpdate={handleFetchData}
                    />
                )}
                {activeTab === 'export' && (
                    <Box sx={{ p: 4, textAlign: 'center' }}><Typography variant="h6" color="text.secondary">Fitur Ekspor (Segera Hadir)</Typography></Box>
                )}
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
};

export default App;
