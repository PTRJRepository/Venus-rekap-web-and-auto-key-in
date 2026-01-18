import React, { useState, useEffect } from 'react';
import { Box, Paper, Tabs, Tab, Typography, IconButton, Snackbar, Alert, CircularProgress, ToggleButton, ToggleButtonGroup, Chip, Tooltip, Button, Menu, MenuItem, Select, FormControl } from '@mui/material';
import MatrixIcon from '@mui/icons-material/TableView';
import ExportIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import ListIcon from '@mui/icons-material/ViewList';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import DetailIcon from '@mui/icons-material/EventNote';
import CheckIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import FlightIcon from '@mui/icons-material/Flight';
import HospitalIcon from '@mui/icons-material/LocalHospital';
import AutoIcon from '@mui/icons-material/AutoMode';
import CalendarIcon from '@mui/icons-material/CalendarMonth';

import AttendanceMatrix from './components/AttendanceMatrix';
import AutomationDialog from './components/AutomationDialog';
import { fetchAttendanceData, fetchMonths } from './services/api';

const App = () => {
    const [activeTab, setActiveTab] = useState('matrix');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(1);
    const [selectedYear, setSelectedYear] = useState(2026);
    const [viewMode, setViewMode] = useState('attendance');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

    // Automation State
    const [selectedIds, setSelectedIds] = useState([]);
    const [openAutoDialog, setOpenAutoDialog] = useState(false);

    // Month names
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const years = [2024, 2025, 2026];

    const handleFetchData = async () => {
        if (!selectedMonth || !selectedYear) return;
        setLoading(true);
        setData(null);
        setSelectedIds([]);
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

    const selectedEmployees = data && Array.isArray(data) ? data.filter(d => selectedIds.includes(d.id)) : [];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f3f4f6' }}>
            <Paper elevation={1} sx={{ zIndex: 10, borderRadius: 0, borderBottom: '1px solid #e5e7eb', bgcolor: '#ffffff', px: 2, py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ minHeight: 40 }}>
                            <Tab icon={<MatrixIcon fontSize="small" />} iconPosition="start" label="Matrix" value="matrix" sx={{ minHeight: 40, py: 0, fontSize: '0.85rem' }} />
                            <Tab icon={<ExportIcon fontSize="small" />} iconPosition="start" label="Ekspor" value="export" sx={{ minHeight: 40, py: 0, fontSize: '0.85rem' }} />
                        </Tabs>
                        <Box sx={{ width: 1, height: 24, bgcolor: '#e5e7eb' }} />

                        {/* IMPROVED PERIOD SELECTOR */}
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

                    {/* LEGEND */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto', maxWidth: 350 }}>
                        <Tooltip title="Hadir"><Chip size="small" icon={<CheckIcon style={{ fontSize: 14 }} />} label="H" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#ecfdf5', color: '#059669' }} /></Tooltip>
                        <Tooltip title="Alfa"><Chip size="small" icon={<CancelIcon style={{ fontSize: 14 }} />} label="A" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#7f1d1d', color: '#fff' }} /></Tooltip>
                        <Tooltip title="Off"><Chip size="small" label="OFF" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#f1f5f9', color: '#64748b' }} /></Tooltip>
                        <Tooltip title="Cuti"><Chip size="small" icon={<FlightIcon style={{ fontSize: 12 }} />} label="C" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#eff6ff', color: '#1e40af' }} /></Tooltip>
                        <Tooltip title="Sakit"><Chip size="small" icon={<HospitalIcon style={{ fontSize: 12 }} />} label="S" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#fee2e2', color: '#b91c1c' }} /></Tooltip>
                    </Box>

                    {/* RIGHT ACTIONS */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {selectedIds.length > 0 && (
                            <Button variant="contained" color="secondary" size="small" startIcon={<AutoIcon />} onClick={() => setOpenAutoDialog(true)} sx={{ textTransform: 'none', fontWeight: 600 }}>
                                Sync ({selectedIds.length})
                            </Button>
                        )}
                        <ToggleButtonGroup value={viewMode} exclusive onChange={(e, v) => v && setViewMode(v)} size="small" sx={{ height: 32 }}>
                            <ToggleButton value="attendance" sx={{ fontSize: '0.75rem', px: 1 }}><ListIcon fontSize="small" sx={{ mr: 0.5 }} />Absen</ToggleButton>
                            <ToggleButton value="overtime" sx={{ fontSize: '0.75rem', px: 1 }}><HourglassIcon fontSize="small" sx={{ mr: 0.5 }} />Lembur</ToggleButton>
                            <ToggleButton value="detail" sx={{ fontSize: '0.75rem', px: 1 }}><DetailIcon fontSize="small" sx={{ mr: 0.5 }} />Detail</ToggleButton>
                        </ToggleButtonGroup>
                        <Chip size="small" label={`${data ? data.length : 0} Karyawan`} sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600 }} />
                        <IconButton onClick={handleFetchData} size="small" color="primary" disabled={loading}>
                            {loading ? <CircularProgress size={20} /> : <RefreshIcon fontSize="small" />}
                        </IconButton>
                    </Box>
                </Box>
            </Paper>

            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 1, overflow: 'hidden' }}>
                {activeTab === 'matrix' && (
                    <AttendanceMatrix data={data || []} viewMode={viewMode} onDataUpdate={handleFetchData} selectedIds={selectedIds} onToggleSelect={setSelectedIds} />
                )}
                {activeTab === 'export' && (
                    <Box sx={{ p: 4, textAlign: 'center' }}><Typography variant="h6" color="text.secondary">Fitur Ekspor (Segera Hadir)</Typography></Box>
                )}
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
            </Snackbar>
            <AutomationDialog open={openAutoDialog} onClose={() => setOpenAutoDialog(false)} selectedEmployees={selectedEmployees} month={selectedMonth} year={selectedYear} />
        </Box>
    );
};

export default App;
