import React, { useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    Grid,
    TextField,
    Checkbox,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Alert,
    Chip,
    FormControlLabel,
    InputAdornment
} from '@mui/material';
import {
    Search as SearchIcon,
    FileDownload as FileDownloadIcon,
    FilterList as FilterListIcon,
    DateRange as DateRangeIcon
} from '@mui/icons-material';
import { fetchActiveEmployees, exportAttendanceJSON } from '../services/api';

const ExportTab = () => {
    // State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [employees, setEmployees] = useState([]);
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [filterText, setFilterText] = useState('');

    // Fetch Employees
    const handleFetchEmployees = async () => {
        if (!startDate || !endDate) {
            setError("Silakan pilih Tanggal Mulai dan Tanggal Akhir terlebih dahulu.");
            return;
        }

        if (startDate > endDate) {
            setError("Tanggal Mulai tidak boleh lebih besar dari Tanggal Akhir.");
            return;
        }

        setLoading(true);
        setError(null);
        setSuccessMessage(null);
        setEmployees([]);
        setSelectedEmployeeIds(new Set());

        try {
            const data = await fetchActiveEmployees(startDate, endDate);
            setEmployees(data);
            if (data.length === 0) {
                setError("Tidak ada data karyawan aktif pada rentang tanggal tersebut.");
            }
        } catch (err) {
            setError("Gagal mengambil data karyawan. Periksa koneksi server.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Toggle Selection
    const handleToggleSelect = (id) => {
        const newSet = new Set(selectedEmployeeIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedEmployeeIds(newSet);
    };

    const handleSelectAll = (checked) => {
        if (checked) {
            // Select all currently visible (filtered) employees
            const ids = filteredEmployees.map(e => e.EmployeeID);
            setSelectedEmployeeIds(new Set(ids));
        } else {
            setSelectedEmployeeIds(new Set());
        }
    };

    // Filter Logic
    const filteredEmployees = employees.filter(emp => 
        emp.EmployeeName.toLowerCase().includes(filterText.toLowerCase()) ||
        (emp.IDNo && emp.IDNo.toLowerCase().includes(filterText.toLowerCase())) ||
        emp.EmployeeID.toLowerCase().includes(filterText.toLowerCase())
    );

    // Export Logic
    const handleExport = async () => {
        if (selectedEmployeeIds.size === 0) {
            setError("Pilih setidaknya satu karyawan untuk diekspor.");
            return;
        }

        setExporting(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const result = await exportAttendanceJSON(startDate, endDate, Array.from(selectedEmployeeIds));
            setSuccessMessage(`Berhasil mengekspor data ${result.count} karyawan ke: ${result.filename}`);
        } catch (err) {
            setError("Gagal melakukan ekspor data.");
            console.error(err);
        } finally {
            setExporting(false);
        }
    };

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            {/* Header */}
            <Box sx={{ mb: 4, textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b', mb: 1 }}>
                    Export Data Absensi
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Pilih rentang tanggal dan karyawan untuk mengekspor data ke format JSON.
                </Typography>
            </Box>

            {/* Step 1: Date Selection */}
            <Paper elevation={0} variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 2, bgcolor: '#ffffff' }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                        <TextField
                            label="Tanggal Mulai"
                            type="date"
                            fullWidth
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            label="Tanggal Akhir"
                            type="date"
                            fullWidth
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Button
                            variant="contained"
                            fullWidth
                            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                            onClick={handleFetchEmployees}
                            disabled={loading || !startDate || !endDate}
                            sx={{ height: 40, bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca' } }}
                        >
                            {loading ? 'Mencari...' : 'Cari Karyawan Aktif'}
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {/* Messages */}
            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}
            {successMessage && (
                <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage(null)}>
                    {successMessage}
                </Alert>
            )}

            {/* Step 2: Employee List */}
            {employees.length > 0 && (
                <Paper elevation={0} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {/* Toolbar */}
                    <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                                Daftar Karyawan
                            </Typography>
                            <Chip label={`${employees.length} Ditemukan`} size="small" color="primary" variant="outlined" />
                            <Chip label={`${selectedEmployeeIds.size} Dipilih`} size="small" color="secondary" />
                        </Box>
                        
                        <TextField
                            placeholder="Filter Nama / ID..."
                            size="small"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <FilterListIcon fontSize="small" color="action" />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ width: 250, bgcolor: 'white' }}
                        />
                    </Box>

                    {/* Table */}
                    <TableContainer sx={{ maxHeight: 400 }}>
                        <Table stickyHeader size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox" sx={{ bgcolor: '#f1f5f9' }}>
                                        <Checkbox
                                            indeterminate={selectedEmployeeIds.size > 0 && selectedEmployeeIds.size < filteredEmployees.length}
                                            checked={filteredEmployees.length > 0 && selectedEmployeeIds.size === filteredEmployees.length}
                                            onChange={(e) => handleSelectAll(e.target.checked)}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f1f5f9' }}>ID Karyawan</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f1f5f9' }}>Nama Lengkap</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f1f5f9' }}>No. Identitas (KTP)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredEmployees.map((emp) => {
                                    const isSelected = selectedEmployeeIds.has(emp.EmployeeID);
                                    return (
                                        <TableRow
                                            key={emp.EmployeeID}
                                            hover
                                            selected={isSelected}
                                            onClick={() => handleToggleSelect(emp.EmployeeID)}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            <TableCell padding="checkbox">
                                                <Checkbox checked={isSelected} />
                                            </TableCell>
                                            <TableCell>{emp.EmployeeID}</TableCell>
                                            <TableCell sx={{ fontWeight: 500 }}>{emp.EmployeeName}</TableCell>
                                            <TableCell>{emp.IDNo || '-'}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {filteredEmployees.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                            Tidak ada karyawan yang cocok dengan filter.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* Footer / Actions */}
                    <Box sx={{ p: 2, borderTop: '1px solid #e2e8f0', bgcolor: '#f8fafc', textAlign: 'right' }}>
                        <Button
                            variant="contained"
                            color="success"
                            size="large"
                            startIcon={exporting ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
                            onClick={handleExport}
                            disabled={exporting || selectedEmployeeIds.size === 0}
                            sx={{ px: 4, fontWeight: 700 }}
                        >
                            {exporting ? 'Mengekspor...' : `Ekspor ${selectedEmployeeIds.size} Karyawan`}
                        </Button>
                    </Box>
                </Paper>
            )}
        </Box>
    );
};

export default ExportTab;
