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
import SyncIcon from '@mui/icons-material/Sync';
import CompareIcon from '@mui/icons-material/CompareArrows';
import { Button } from '@mui/material';

import AttendanceSummaryReport from './components/AttendanceSummaryReport';
import AttendanceMatrix from './components/AttendanceMatrix';
import AutomationDialog from './components/AutomationDialog';
import ComparisonDialog from './components/ComparisonDialog';
import { fetchAttendanceData } from './services/api';

const App = () => {
    const [activeTab, setActiveTab] = useState('matrix');
    const [viewMode, setViewMode] = useState('attendance');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(1);
    const [selectedYear, setSelectedYear] = useState(2026);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

    // Automation & Comparison State
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [isAutomationOpen, setIsAutomationOpen] = useState(false);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);
    const [comparisonData, setComparisonData] = useState(null);
    const [compareMode, setCompareMode] = useState('off');

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
        if (compareMode === 'off') setCompareMode('presence');
    };

    const performComparison = async () => {
        if (!data || data.length === 0) return;
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const employeesToCompare = selectedEmployeeIds.length > 0
            ? data.filter(e => selectedEmployeeIds.includes(e.id))
            : data;

        try {
            const response = await fetch('/api/comparison/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employees: employeesToCompare, startDate: start, endDate: end })
            });
            const result = await response.json();
            if (result.success) handleComparisonComplete(result);
        } catch (e) { console.error("Auto-Comparison failed:", e); }
    };

    const handleCompareToggle = () => {
        if (compareMode === 'off') {
            setCompareMode('presence');
            if (!comparisonData) performComparison();
        } else if (compareMode === 'presence') {
            setCompareMode('overtime');
            if (!comparisonData) performComparison();
        } else {
            setCompareMode('off');
        }
    };

    const handleCompareLongClick = () => {
        setIsComparisonOpen(true);
    };

    const showSnackbar = (message, severity = 'info') => setSnackbar({ open: true, message, severity });

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f3f4f6' }}>
            <Paper elevation={1} sx={{ zIndex: 10, borderRadius: 0, borderBottom: '1px solid #e5e7eb', bgcolor: '#ffffff', px: 2, py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Tabs value={activeTab} onChange={(event, newValue) => {
                            console.log('Tab changing from', activeTab, 'to', newValue);
                            setActiveTab(newValue);
                        }} sx={{ minHeight: 40 }}>
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
                            <>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                        variant={compareMode !== 'off' ? "contained" : "outlined"}
                                        size="small"
                                        color="info"
                                        startIcon={<CompareIcon />}
                                        onClick={handleCompareToggle}
                                        onDoubleClick={() => setIsComparisonOpen(true)}
                                        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', height: 32 }}
                                        title="Click to cycle modes, Double-click for details"
                                    >
                                        Compare
                                    </Button>
                                    {comparisonData && compareMode !== 'off' && (
                                        <Select
                                            size="small"
                                            value={compareMode}
                                            onChange={(e) => setCompareMode(e.target.value)}
                                            sx={{ height: 32, fontSize: '0.75rem', bgcolor: 'white', minWidth: 100 }}
                                        >
                                            <MenuItem value="presence">Presence</MenuItem>
                                            <MenuItem value="overtime">Overtime</MenuItem>
                                            <MenuItem value="off">Off</MenuItem>
                                        </Select>
                                    )}
                                    {selectedEmployeeIds.length > 0 && (
                                        <Button
                                            variant="contained"
                                            size="small"
                                            color="success"
                                            startIcon={<SyncIcon />}
                                            onClick={() => setIsAutomationOpen(true)}
                                            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', height: 32 }}
                                        >
                                            Sinkron ({selectedEmployeeIds.length})
                                        </Button>
                                    )}
                                </Box>
                                <ToggleButtonGroup value={viewMode} exclusive onChange={(e, v) => v && setViewMode(v)} size="small" sx={{ height: 32 }}>
                                    <ToggleButton value="attendance" sx={{ fontSize: '0.75rem', px: 1 }}><ListIcon fontSize="small" sx={{ mr: 0.5 }} />Absen</ToggleButton>
                                    <ToggleButton value="overtime" sx={{ fontSize: '0.75rem', px: 1 }}><HourglassIcon fontSize="small" sx={{ mr: 0.5 }} />Lembur</ToggleButton>
                                    <ToggleButton value="detail" sx={{ fontSize: '0.75rem', px: 1 }}><DetailIcon fontSize="small" sx={{ mr: 0.5 }} />Detail</ToggleButton>
                                </ToggleButtonGroup>
                            </>
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
                        onDataUpdate={handleDataUpdate}
                        selectedIds={selectedEmployeeIds}
                        onToggleSelect={setSelectedEmployeeIds}
                        compareMode={compareMode}
                        comparisonData={comparisonData}
                    />
                )}
                {activeTab === 'export' && (
                    <Box sx={{ p: 4, textAlign: 'center' }}><Typography variant="h6" color="text.secondary">Fitur Ekspor (Segera Hadir)</Typography></Box>
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
