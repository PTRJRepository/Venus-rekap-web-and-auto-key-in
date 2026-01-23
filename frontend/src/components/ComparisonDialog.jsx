import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, Table, TableHead, TableRow, TableCell, TableBody,
    Chip, CircularProgress, Alert, TextField
} from '@mui/material';
import CompareIcon from '@mui/icons-material/Compare';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';

const ComparisonDialog = ({ open, onClose, selectedEmployees, month, year }) => {
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleCompare = async () => {
        if (!startDate || !endDate) {
            setError('Please select start and end dates');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/comparison/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employees: selectedEmployees,
                    startDate,
                    endDate
                })
            });

            const data = await response.json();
            if (data.success) {
                setResults(data);
            } else {
                setError(data.error || 'Comparison failed');
            }
        } catch (e) {
            setError(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const getSyncIcon = (status) => {
        switch (status) {
            case 'synced': return <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 18 }} />;
            case 'not_synced': return <CancelIcon sx={{ color: '#f44336', fontSize: 18 }} />;
            case 'mismatch': return <WarningIcon sx={{ color: '#ff9800', fontSize: 18 }} />;
            default: return null;
        }
    };

    const getSyncChip = (status) => {
        const colors = { synced: 'success', not_synced: 'error', mismatch: 'warning' };
        const labels = { synced: 'Synced', not_synced: 'Not Synced', mismatch: 'Mismatch' };
        return <Chip size="small" color={colors[status]} label={labels[status]} icon={getSyncIcon(status)} />;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
            PaperProps={{ sx: { minHeight: '70vh', bgcolor: '#1e1e1e', color: '#e0e0e0' } }}>
            <DialogTitle sx={{ borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 1 }}>
                <CompareIcon sx={{ color: '#2196f3' }} />
                <Typography component="span" variant="h6" sx={{ flexGrow: 1 }}>Sync Comparison - PR_TASKREGLN</Typography>
            </DialogTitle>


            <DialogContent sx={{ p: 2 }}>
                {/* Controls */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                    <TextField
                        type="date"
                        label="Start Date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                        sx={{ '& input': { color: 'white' }, '& label': { color: '#888' } }}
                    />
                    <TextField
                        type="date"
                        label="End Date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                        sx={{ '& input': { color: 'white' }, '& label': { color: '#888' } }}
                    />
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleCompare}
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={16} /> : <CompareIcon />}
                    >
                        {loading ? 'Comparing...' : 'Compare'}
                    </Button>
                    <Typography variant="body2" sx={{ color: '#888' }}>
                        {selectedEmployees.length} employees selected
                    </Typography>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* Summary */}
                {results && (
                    <Box sx={{ mb: 2, display: 'flex', gap: 3 }}>
                        <Chip icon={<CheckCircleIcon />} label={`Synced: ${results.summary.synced}`} color="success" />
                        <Chip icon={<CancelIcon />} label={`Not Synced: ${results.summary.notSynced}`} color="error" />
                        <Chip icon={<WarningIcon />} label={`Mismatch: ${results.summary.mismatch}`} color="warning" />
                        <Typography variant="body2" sx={{ color: '#888', alignSelf: 'center' }}>
                            Total: {results.summary.total} records
                        </Typography>
                    </Box>
                )}

                {/* Results Table */}
                {results && results.results.length > 0 && (
                    <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Status</TableCell>
                                    <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>PTRJ ID</TableCell>
                                    <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Name</TableCell>
                                    <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Date</TableCell>
                                    <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Venus Status</TableCell>
                                    <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Venus Hours</TableCell>
                                    <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Millware Hours</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {results.results.map((row, idx) => (
                                    <TableRow key={idx} sx={{
                                        bgcolor: row.syncStatus === 'synced' ? 'rgba(76,175,80,0.1)' :
                                            row.syncStatus === 'not_synced' ? 'rgba(244,67,54,0.1)' :
                                                'rgba(255,152,0,0.1)'
                                    }}>
                                        <TableCell>{getSyncChip(row.syncStatus)}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>{row.ptrjId}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>{row.employeeName}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>{row.date}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>{row.venusStatus}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>
                                            {row.venusRegularHours + row.venusOvertimeHours}h
                                        </TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>
                                            {row.details ? `${row.details.millwareHours}h` : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Box>
                )}

                {results && results.results.length === 0 && (
                    <Typography sx={{ textAlign: 'center', color: '#666', mt: 4 }}>
                        No records to compare (employees may not have PTRJ IDs mapped)
                    </Typography>
                )}

                {!results && !loading && (
                    <Typography sx={{ textAlign: 'center', color: '#666', mt: 4 }}>
                        Select date range and click "Compare" to check sync status
                    </Typography>
                )}
            </DialogContent>

            <DialogActions sx={{ borderTop: '1px solid #333', p: 2 }}>
                <Button onClick={onClose} sx={{ color: '#aaa' }}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ComparisonDialog;
