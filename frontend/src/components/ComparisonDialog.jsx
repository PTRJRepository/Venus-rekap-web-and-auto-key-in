import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, Table, TableHead, TableRow, TableCell, TableBody,
    Chip, CircularProgress, Alert, TextField, FormControlLabel, Radio, RadioGroup, FormControl, FormLabel
} from '@mui/material';
import CompareIcon from '@mui/icons-material/Compare';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';

const ComparisonDialog = ({ open, onClose, selectedEmployees, month, year, onComparisonComplete }) => {
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [compareMode, setCompareMode] = useState('all'); // 'all', 'regular', 'overtime'

    React.useEffect(() => {
        if (open && month && year) {
            const lastDay = new Date(year, month, 0).getDate();
            const start = `${year}-${String(month).padStart(2, '0')}-01`;
            const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            setStartDate(start);
            setEndDate(end);
        }
    }, [open, month, year]);

    const handleCompare = async () => {
        if (!startDate || !endDate) {
            setError('Please select start and end dates');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const options = {};
            if (compareMode === 'regular') options.onlyRegular = true;
            if (compareMode === 'overtime') options.onlyOvertime = true;

            const response = await fetch('/api/comparison/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employees: selectedEmployees,
                    startDate,
                    endDate,
                    options
                })
            });

            const data = await response.json();
            if (data.success) {
                setResults(data);
                if (onComparisonComplete) {
                    onComparisonComplete(data, startDate, endDate, options);
                }
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
                <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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
                    
                    <FormControl sx={{ minWidth: 200 }}>
                        <FormLabel sx={{ color: '#aaa', fontSize: '0.75rem' }}>Compare Mode</FormLabel>
                        <RadioGroup
                            row
                            value={compareMode}
                            onChange={(e) => setCompareMode(e.target.value)}
                            sx={{ '& .MuiRadio-root': { py: 0 } }}
                        >
                            <FormControlLabel
                                value="all"
                                control={<Radio size="small" sx={{ color: '#aaa' }} />}
                                label={<Typography sx={{ fontSize: '0.75rem', color: '#ccc' }}>All</Typography>}
                            />
                            <FormControlLabel
                                value="regular"
                                control={<Radio size="small" sx={{ color: '#aaa' }} />}
                                label={<Typography sx={{ fontSize: '0.75rem', color: '#ccc' }}>Regular Only</Typography>}
                            />
                            <FormControlLabel
                                value="overtime"
                                control={<Radio size="small" sx={{ color: '#aaa' }} />}
                                label={<Typography sx={{ fontSize: '0.75rem', color: '#ccc' }}>Overtime Only</Typography>}
                            />
                        </RadioGroup>
                    </FormControl>
                    
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
                        {selectedEmployees.length} employees
                    </Typography>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* Summary */}
                {results && (
                    <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip 
                            icon={<CheckCircleIcon />} 
                            label={`✓ Synced: ${results.summary.synced}`} 
                            color="success" 
                            sx={{ fontWeight: 'bold' }}
                        />
                        <Chip 
                            icon={<CancelIcon />} 
                            label={`❌ Not Synced: ${results.summary.mismatch}`} 
                            color="error" 
                            sx={{ fontWeight: 'bold' }}
                        />
                        <Typography variant="body2" sx={{ color: '#888' }}>
                            Total: {results.summary.total} records
                        </Typography>
                        {compareMode === 'regular' && (
                            <Chip 
                                size="small" 
                                label="Mode: Regular Only" 
                                sx={{ bgcolor: '#1976d2', color: 'white' }}
                            />
                        )}
                        {compareMode === 'overtime' && (
                            <Chip 
                                size="small" 
                                label="Mode: Overtime Only" 
                                sx={{ bgcolor: '#d32f2f', color: 'white' }}
                            />
                        )}
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
                                    {compareMode === 'overtime' ? (
                                        <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Venus OT</TableCell>
                                    ) : (
                                        <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Venus Regular</TableCell>
                                    )}
                                    {compareMode === 'overtime' ? (
                                        <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Millware OT</TableCell>
                                    ) : (
                                        <TableCell sx={{ bgcolor: '#252526', color: '#aaa' }}>Millware Regular</TableCell>
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {results.results.map((row, idx) => (
                                    <TableRow key={idx} sx={{
                                        bgcolor: row.syncStatus === 'synced' ? 'rgba(76,175,80,0.15)' :
                                            row.syncStatus === 'not_synced' || row.status === 'MISS' ? 'rgba(244,67,54,0.15)' :
                                                'rgba(255,152,0,0.15)'
                                    }}>
                                        <TableCell>{getSyncChip(row.syncStatus)}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0', fontFamily: 'monospace' }}>{row.ptrjId}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>{row.employeeName}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>{row.date}</TableCell>
                                        <TableCell sx={{ color: '#e0e0e0' }}>{row.venusStatus}</TableCell>
                                        {compareMode === 'overtime' ? (
                                            <>
                                                <TableCell sx={{ color: '#e0e0e0', fontWeight: 'bold' }}>{row.venusOvertimeHours}h</TableCell>
                                                <TableCell sx={{ color: row.details?.otMatched ? '#4caf50' : '#ff9800' }}>
                                                    {row.details ? `${row.details.millwareOT}h` : '-'}
                                                    {row.details?.otMatched ? ' ✓' : ' ⚠'}
                                                </TableCell>
                                            </>
                                        ) : (
                                            <>
                                                <TableCell sx={{ color: '#e0e0e0', fontWeight: 'bold' }}>{row.venusRegularHours}h</TableCell>
                                                <TableCell sx={{ color: row.details?.regularMatched ? '#4caf50' : '#ff9800' }}>
                                                    {row.details ? `${row.details.millwareNormal}h` : '-'}
                                                    {row.details?.regularMatched ? ' ✓' : ' ⚠'}
                                                </TableCell>
                                            </>
                                        )}
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
