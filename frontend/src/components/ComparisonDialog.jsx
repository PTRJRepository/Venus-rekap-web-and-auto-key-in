import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, Table, TableHead, TableRow, TableCell, TableBody,
    Chip, CircularProgress, Alert, TextField, FormControlLabel, Radio,
    RadioGroup, FormControl, FormLabel, Tabs, Tab, Paper, Divider
} from '@mui/material';
import CompareIcon from '@mui/icons-material/Compare';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { alpha } from '@mui/material/styles';

const DARK = {
    bg: '#0F172A',
    surface: '#1E293B',
    card: '#283548',
    border: '#334155',
    text: '#CBD5E1',
    muted: '#64748B',
    accent: '#3B82F6',
    green: '#10B981',
    red: '#EF4444',
    amber: '#F59E0B',
    violet: '#8B5CF6',
};

const ComparisonDialog = ({ open, onClose, selectedEmployees = [], month, year, onComparisonComplete, inline = false }) => {
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [compareMode, setCompareMode] = useState('all');
    const [tabIndex, setTabIndex] = useState(0);

    React.useEffect(() => {
        if ((open || inline) && month && year) {
            const lastDay = new Date(year, month, 0).getDate();
            const start = `${year}-${String(month).padStart(2, '0')}-01`;
            const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            setStartDate(start); setEndDate(end);
        }
    }, [open, inline, month, year]);

    const handleCompare = async () => {
        if (!startDate || !endDate) { setError('Please select start and end dates'); return; }
        setLoading(true); setError(null);
        try {
            const options = {};
            if (compareMode === 'regular') options.onlyRegular = true;
            if (compareMode === 'overtime') options.onlyOvertime = true;
            const response = await fetch('/api/comparison/compare', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employees: selectedEmployees, startDate, endDate, options })
            });
            const data = await response.json();
            if (data.success) {
                setResults(data);
                if (onComparisonComplete) onComparisonComplete(data, startDate, endDate, options);
            } else { setError(data.error || 'Comparison failed'); }
        } catch (e) { setError(`Error: ${e.message}`); }
        finally { setLoading(false); }
    };

    const getSyncIcon = (status) => {
        const icons = { synced: <CheckCircleIcon sx={{ fontSize: 16 }} />, not_synced: <CancelIcon sx={{ fontSize: 16 }} />, mismatch: <WarningIcon sx={{ fontSize: 16 }} /> };
        const colors = { synced: DARK.green, not_synced: DARK.red, mismatch: DARK.amber };
        return <Box sx={{ color: colors[status], display: 'flex' }}>{icons[status]}</Box>;
    };

    const globalSummary = React.useMemo(() => {
        if (!results?.results) return null;
        const sum = { totalCuti: 0, totalSakit: 0, totalHadir: 0, totalAlfa: 0, totalJamRegularVenus: 0, totalJamRegularMillware: 0, totalJamLemburVenus: 0, totalJamLemburMillware: 0 };
        results.results.forEach(row => {
            const status = (row.venusStatus || '').toUpperCase();
            if (status.includes('CT') || status.includes('CUTI') || status === 'I' || status === 'IZIN') sum.totalCuti++;
            else if (status === 'S' || status.includes('SAKIT') || status === 'SD') sum.totalSakit++;
            else if (status === 'A' || status.includes('ALFA')) sum.totalAlfa++;
            else if (status !== 'OFF' && status !== 'LIBUR') sum.totalHadir++;
            sum.totalJamRegularVenus += row.venusRegularHours || 0;
            sum.totalJamLemburVenus += row.venusOvertimeHours || 0;
            if (row.details) {
                sum.totalJamRegularMillware += row.details.millwareNormal || 0;
                sum.totalJamLemburMillware += row.details.millwareOT || 0;
            }
        });
        return {
            ...sum,
            totalJamRegularVenus: Number(sum.totalJamRegularVenus.toFixed(2)),
            totalJamLemburVenus: Number(sum.totalJamLemburVenus.toFixed(2)),
            totalJamRegularMillware: Number(sum.totalJamRegularMillware.toFixed(2)),
            totalJamLemburMillware: Number(sum.totalJamLemburMillware.toFixed(2)),
        };
    }, [results]);

    const employeeSummary = results ? results.results.reduce((acc, row) => {
        if (!acc[row.ptrjId]) acc[row.ptrjId] = { ptrjId: row.ptrjId, employeeName: row.employeeName, synced: 0, mismatch: 0, venusRegularHours: 0, venusOvertimeHours: 0, millwareRegularHours: 0, millwareOvertimeHours: 0 };
        if (row.syncStatus === 'synced') acc[row.ptrjId].synced += 1;
        else acc[row.ptrjId].mismatch += 1;
        acc[row.ptrjId].venusRegularHours = Number((acc[row.ptrjId].venusRegularHours + (row.venusRegularHours || 0)).toFixed(2));
        acc[row.ptrjId].venusOvertimeHours = Number((acc[row.ptrjId].venusOvertimeHours + (row.venusOvertimeHours || 0)).toFixed(2));
        if (row.details) {
            acc[row.ptrjId].millwareRegularHours = Number((acc[row.ptrjId].millwareRegularHours + (row.details.millwareNormal || 0)).toFixed(2));
            acc[row.ptrjId].millwareOvertimeHours = Number((acc[row.ptrjId].millwareOvertimeHours + (row.details.millwareOT || 0)).toFixed(2));
        }
        return acc;
    }, {}) : {};

    const summaryArray = Object.values(employeeSummary);

    const StatCard = ({ title, value, color = DARK.accent, subvalue }) => (
        <Paper elevation={0} sx={{
            p: 1.5, border: `1px solid ${alpha(color, 0.2)}`, borderRadius: 2,
            minWidth: 110, bgcolor: alpha(color, 0.05), flex: 1,
        }}>
            <Typography variant="caption" sx={{ color: DARK.muted, display: 'block', mb: 0.5, fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {title}
            </Typography>
            <Typography variant="body2" sx={{ color, fontWeight: 800, lineHeight: 1.2, fontSize: '0.95rem' }}>{value}</Typography>
            {subvalue && <Typography variant="caption" sx={{ color: DARK.muted, display: 'block', mt: 0.3, fontSize: '0.68rem' }}>{subvalue}</Typography>}
        </Paper>
    );

    const content = (
        <Box sx={{ p: inline ? 0 : 2, display: 'flex', flexDirection: 'column', height: inline ? '100%' : 'auto' }}>
            {!inline && (
                <Box sx={{ borderBottom: `1px solid ${DARK.border}`, display: 'flex', alignItems: 'center', gap: 1.5, pb: 2, mb: 2 }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: alpha(DARK.accent, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CompareIcon sx={{ color: DARK.accent, fontSize: 20 }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Sync Comparison</Typography>
                        <Typography variant="caption" sx={{ color: DARK.muted }}>PR_TASKREGLN — Venus vs Millware</Typography>
                    </Box>
                </Box>
            )}

            {/* Controls */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <TextField type="date" label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }} size="small"
                    inputProps={{ style: { color: DARK.text, backgroundColor: DARK.card, borderRadius: 6, fontSize: '0.85rem' } }}
                />
                <TextField type="date" label="End Date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }} size="small"
                    inputProps={{ style: { color: DARK.text, backgroundColor: DARK.card, borderRadius: 6, fontSize: '0.85rem' } }}
                />
                <FormControl size="small">
                    <FormLabel sx={{ color: DARK.muted, fontSize: '0.65rem', mb: 0.5 }}>Compare Mode</FormLabel>
                    <RadioGroup row value={compareMode} onChange={(e) => setCompareMode(e.target.value)}>
                        {[['all', 'All', DARK.accent], ['regular', 'Regular', DARK.green], ['overtime', 'OT Only', DARK.violet]].map(([v, l, c]) => (
                            <FormControlLabel key={v} value={v}
                                control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: c } }} />}
                                label={<Typography sx={{ fontSize: '0.78rem', color: DARK.text, fontWeight: 600 }}>{l}</Typography>}
                            />
                        ))}
                    </RadioGroup>
                </FormControl>
                <Button variant="contained" onClick={handleCompare} disabled={loading} startIcon={loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <CompareIcon />}
                    sx={{ bgcolor: DARK.accent, '&:hover': { bgcolor: '#2563EB' }, height: 36 }}>
                    {loading ? 'Comparing...' : 'Compare'}
                </Button>
                <Chip label={`${selectedEmployees.length} employees`} size="small" sx={{ bgcolor: alpha(DARK.muted, 0.15), color: DARK.muted, fontWeight: 700 }} />
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Summary Metrics */}
            {results && globalSummary && (
                <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <FilterAltIcon sx={{ fontSize: 15, color: DARK.accent }} />
                        <Typography variant="caption" sx={{ color: DARK.muted, fontWeight: 800, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Summary ({results.summary.total} records)
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <StatCard title="Synced" value={results.summary.synced} color={DARK.green} />
                        <StatCard title="Mismatch" value={results.summary.mismatch} color={DARK.red} />
                        <StatCard title="Hadir" value={`${globalSummary.totalHadir} Hari`} color={DARK.text} />
                        <StatCard title="Cuti/Izin" value={`${globalSummary.totalCuti} Hari`} color={DARK.amber} />
                        <StatCard title="Sakit" value={`${globalSummary.totalSakit} Hari`} color={DARK.accent} />
                        <StatCard title="Jam Reguler" value={`${globalSummary.totalJamRegularVenus}h`} color={DARK.violet} subvalue={`MW: ${globalSummary.totalJamRegularMillware}h`} />
                        <StatCard title="Jam Lembur" value={`${globalSummary.totalJamLemburVenus}h`} color={DARK.amber} subvalue={`MW: ${globalSummary.totalJamLemburMillware}h`} />
                    </Box>
                </Box>
            )}

            {/* Tabs */}
            {results && (
                <Box sx={{ borderBottom: `1px solid ${DARK.border}`, mb: 2 }}>
                    <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} textColor="inherit" indicatorColor="primary">
                        <Tab label={<Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: tabIndex === 0 ? DARK.accent : DARK.muted }}>Per Day</Typography>} />
                        <Tab label={<Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: tabIndex === 1 ? DARK.accent : DARK.muted }}>Per Employee</Typography>} />
                    </Tabs>
                </Box>
            )}

            {/* Per Day Table */}
            {results && tabIndex === 0 && results.results.length > 0 && (
                <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                {['Status', 'PTRJ ID', 'Name', 'Date', 'Venus Status', 'Venus Hours', 'Millware Hours'].map(h => (
                                    <TableCell key={h} sx={{ bgcolor: DARK.surface, color: DARK.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', py: 1.5 }}>{h}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {results.results.map((row, idx) => (
                                <TableRow key={idx} sx={{ bgcolor: row.syncStatus === 'synced' ? alpha(DARK.green, 0.08) : (row.syncStatus === 'not_synced' || row.status === 'MISS' ? alpha(DARK.red, 0.08) : alpha(DARK.amber, 0.08)) }}>
                                    <TableCell sx={{ py: 1 }}>{getSyncIcon(row.syncStatus)}</TableCell>
                                    <TableCell sx={{ color: DARK.text, fontFamily: 'monospace', fontSize: '0.82rem', py: 1 }}>{row.ptrjId}</TableCell>
                                    <TableCell sx={{ color: DARK.text, fontSize: '0.82rem', py: 1 }}>{row.employeeName}</TableCell>
                                    <TableCell sx={{ color: DARK.muted, fontSize: '0.82rem', py: 1 }}>{row.date}</TableCell>
                                    <TableCell sx={{ color: DARK.text, fontSize: '0.82rem', py: 1 }}>{row.venusStatus}</TableCell>
                                    {compareMode === 'overtime' ? (
                                        <>
                                            <TableCell sx={{ color: DARK.text, fontWeight: 700, py: 1 }}>{row.venusOvertimeHours}h</TableCell>
                                            <TableCell sx={{ color: row.details?.otMatched ? DARK.green : DARK.amber, py: 1 }}>
                                                {row.details ? `${row.details.millwareOT}h` : '-'}
                                                {row.details?.otMatched ? '' : ` (${row.details?.millwareOT - row.venusOvertimeHours}h)`}
                                            </TableCell>
                                        </>
                                    ) : (
                                        <>
                                            <TableCell sx={{ color: DARK.text, fontWeight: 700, py: 1 }}>{row.venusRegularHours}h</TableCell>
                                            <TableCell sx={{ color: row.details?.regularMatched ? DARK.green : DARK.amber, py: 1 }}>
                                                {row.details ? `${row.details.millwareNormal}h` : '-'}
                                                {row.details?.regularMatched ? '' : ' ⚠'}
                                            </TableCell>
                                        </>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}

            {/* Per Employee Table */}
            {results && tabIndex === 1 && summaryArray.length > 0 && (
                <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                {['Status', 'PTRJ ID', 'Name', 'Synced', 'Miss', 'Venus Reg', 'MW Reg', 'Venus OT', 'MW OT'].map(h => (
                                    <TableCell key={h} sx={{ bgcolor: DARK.surface, color: DARK.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', py: 1.5 }}>{h}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {summaryArray.map((row, idx) => {
                                const isPerfectMatch = row.mismatch === 0;
                                return (
                                    <TableRow key={idx} sx={{ bgcolor: isPerfectMatch ? alpha(DARK.green, 0.08) : alpha(DARK.red, 0.08) }}>
                                        <TableCell sx={{ py: 1 }}>
                                            <Chip size="small" label={isPerfectMatch ? 'Synced' : 'Mismatch'}
                                                sx={{ bgcolor: isPerfectMatch ? alpha(DARK.green, 0.15) : alpha(DARK.red, 0.15), color: isPerfectMatch ? DARK.green : DARK.red, fontWeight: 700, fontSize: '0.7rem', height: 22 }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ color: DARK.text, fontFamily: 'monospace', fontSize: '0.82rem', py: 1 }}>{row.ptrjId}</TableCell>
                                        <TableCell sx={{ color: DARK.text, fontSize: '0.82rem', py: 1 }}>{row.employeeName}</TableCell>
                                        <TableCell sx={{ color: DARK.green, fontWeight: 700, py: 1 }}>{row.synced}</TableCell>
                                        <TableCell sx={{ color: row.mismatch > 0 ? DARK.red : DARK.text, fontWeight: row.mismatch > 0 ? 700 : 400, py: 1 }}>{row.mismatch}</TableCell>
                                        {(compareMode === 'all' || compareMode === 'regular') && [
                                            <TableCell key="vr" sx={{ color: DARK.text, py: 1 }}>{row.venusRegularHours}h</TableCell>,
                                            <TableCell key="mr" sx={{ color: row.venusRegularHours === row.millwareRegularHours ? DARK.green : DARK.amber, py: 1 }}>{row.millwareRegularHours}h</TableCell>,
                                        ]}
                                        {(compareMode === 'all' || compareMode === 'overtime') && [
                                            <TableCell key="vo" sx={{ color: DARK.text, py: 1 }}>{row.venusOvertimeHours}h</TableCell>,
                                            <TableCell key="mo" sx={{ color: row.venusOvertimeHours === row.millwareOvertimeHours ? DARK.green : DARK.amber, py: 1 }}>
                                                {row.millwareOvertimeHours}h
                                                {row.venusOvertimeHours !== row.millwareOvertimeHours && (
                                                    <Typography component="span" sx={{ fontSize: '0.7em', ml: 0.5, color: DARK.amber }}>
                                                        ({(row.millwareOvertimeHours - row.venusOvertimeHours).toFixed(2)}h)
                                                    </Typography>
                                                )}
                                            </TableCell>,
                                        ]}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Box>
            )}

            {results && results.results.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                    <CompareIcon sx={{ fontSize: 48, color: alpha(DARK.muted, 0.3), mb: 2 }} />
                    <Typography sx={{ color: DARK.muted }}>No records to compare</Typography>
                </Box>
            )}
            {!results && !loading && (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                    <CompareIcon sx={{ fontSize: 48, color: alpha(DARK.muted, 0.3), mb: 2 }} />
                    <Typography sx={{ color: DARK.muted }}>Select date range and click "Compare"</Typography>
                </Box>
            )}
        </Box>
    );

    if (inline) {
        return <Paper elevation={0} sx={{ height: '100%', bgcolor: '#ffffff', overflowY: 'auto', p: 2 }}>{content}</Paper>;
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { minHeight: '70vh', bgcolor: DARK.bg, color: DARK.text, border: `1px solid ${DARK.border}`, borderRadius: 3 } }}>
            <DialogTitle sx={{ borderBottom: `1px solid ${DARK.border}`, display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: alpha(DARK.accent, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CompareIcon sx={{ color: DARK.accent, fontSize: 20 }} />
                </Box>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Sync Comparison</Typography>
                    <Typography variant="caption" sx={{ color: DARK.muted }}>PR_TASKREGLN — Venus vs Millware</Typography>
                </Box>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>{content}</DialogContent>
            <DialogActions sx={{ borderTop: `1px solid ${DARK.border}`, p: 2, bgcolor: DARK.surface }}>
                <Button onClick={onClose} sx={{ color: DARK.muted }}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ComparisonDialog;
