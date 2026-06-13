import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Typography, CircularProgress, Alert, Collapse, IconButton, Chip,
    Divider, Tabs, Tab, Grid, Card, CardContent, Fade, List, ListItem, ListItemText, ListItemIcon,
    Button, TextField, MenuItem, Menu, Tooltip
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import RiceBowlIcon from '@mui/icons-material/RiceBowl';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssessmentIcon from '@mui/icons-material/Assessment';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PaymentsIcon from '@mui/icons-material/Payments';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import StorageIcon from '@mui/icons-material/Storage';

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const formatNumber = (amount) => {
    return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount) || 0);
};

const PAYROLL_SYNC_COMPONENTS = [
    { key: 'all', label: 'Semua', componentKeys: ['jabatan', 'masaKerja', 'beras', 'pph21', 'spsi'] },
    { key: 'jabatan', label: 'Tj. Jabatan' },
    { key: 'masaKerja', label: 'Masa Kerja' },
    { key: 'beras', label: 'Tj. Beras' },
    { key: 'pph21', label: 'PPh 21' },
    { key: 'spsi', label: 'SPSI' }
];

const PAYROLL_MATRIX_COMPONENTS = [
    { key: 'jabatan', label: 'Tj. Jabatan', type: 'Tunjangan', syncable: true },
    { key: 'masaKerja', label: 'Tj. Masa Kerja', type: 'Tunjangan', syncable: true },
    { key: 'beras', label: 'Tj. Beras', type: 'Tunjangan', syncable: true },
    { key: 'pph21', label: 'PPh 21', type: 'Potongan', syncable: true },
    { key: 'spsi', label: 'SPSI', type: 'Potongan', syncable: true },
    { key: 'lembur', label: 'Lembur', type: 'Info', syncable: false },
    { key: 'premi', label: 'Premi', type: 'Info', syncable: false },
    { key: 'bpjsKes', label: 'BPJS Kes.', type: 'Info', syncable: false },
    { key: 'bpjsPen', label: 'BPJS Pens.', type: 'Info', syncable: false }
];

const getComponentStatus = (pair, hasMillware, tolerance = 50, componentKey = null) => {
    const venus = Number(pair?.venus || 0);
    const millware = Number(pair?.millware || 0);
    const diff = venus - millware;

    if (!hasMillware && venus !== 0) return { code: 'NO_DATA', label: 'NO MW', color: '#92400e', bg: '#fef3c7', diff };
    if (Math.abs(venus) <= tolerance && Math.abs(millware) <= tolerance) return { code: 'EMPTY', label: '-', color: '#64748b', bg: '#f8fafc', diff };

    // Special handling for beras: if one side has value and other is zero, it's always MISS
    if (componentKey === 'beras') {
        const oneSideHasValue = (venus > 0) !== (millware > 0);
        if (oneSideHasValue) {
            return {
                code: 'MISS',
                label: 'MISS',
                color: '#991b1b',
                bg: '#fee2e2',
                diff,
                isMissingComponent: true,
                missingIn: venus === 0 ? 'Venus' : 'Millware'
            };
        }
    }

    if (Math.abs(diff) <= tolerance) return { code: 'MATCH', label: 'SYNC', color: '#166534', bg: '#dcfce7', diff };
    if (venus !== 0 && Math.abs(millware) <= tolerance) return { code: 'MISS', label: 'MISS', color: '#991b1b', bg: '#fee2e2', diff };
    return { code: 'DIFF', label: 'SELISIH', color: '#9a3412', bg: '#ffedd5', diff };
};

const COMPONENT_LABELS = {
    gajiPokok: 'Gaji Pokok',
    lembur: 'Lembur',
    jabatan: 'Tj. Jabatan',
    beras: 'Tj. Beras',
    masaKerja: 'Tj. Masa Kerja',
    premi: 'Premi',
    pph21: 'PPh 21',
    bpjsKes: 'BPJS Kes.',
    bpjsPen: 'BPJS Pens.',
    spsi: 'SPSI',
    upahBersih: 'Net Pay'
};

const buildFallbackNetpayAnalysis = (rows = []) => {
    const componentKeys = Object.keys(COMPONENT_LABELS);
    const initialComponentTotals = componentKeys.reduce((acc, key) => {
        acc[key] = { venus: 0, millware: 0, diff: 0, absDiff: 0 };
        return acc;
    }, {});

    const analysis = rows.reduce((acc, row) => {
        const hasMillware = Boolean(row.millware);
        const venusNetpay = Number(row.sync?.upahBersih?.venus || 0);
        const millwareNetpay = hasMillware ? Number(row.sync?.upahBersih?.millware || 0) : 0;
        const diff = venusNetpay - millwareNetpay;

        acc.employeeCount += 1;
        acc.venusNetpayTotal += venusNetpay;
        acc.millwareNetpayTotal += millwareNetpay;
        if (!hasMillware) acc.noMillwareCount += 1;
        else if (Math.abs(diff) <= 50) acc.matchCount += 1;
        else acc.mismatchCount += 1;

        if (!hasMillware || Math.abs(diff) > 50) {
            acc.problemRows.push({
                id: row.id,
                name: row.name,
                ptrjId: row.ptrjId,
                hasMillware,
                venusNetpay,
                millwareNetpay,
                diff,
                absDiff: Math.abs(diff),
                status: hasMillware ? 'MISMATCH' : 'NO_MILLWARE'
            });
        }

        componentKeys.forEach((key) => {
            const venus = Number(row.sync?.[key]?.venus || 0);
            const millware = hasMillware ? Number(row.sync?.[key]?.millware || 0) : 0;
            const componentDiff = venus - millware;
            acc.componentTotals[key].venus += venus;
            acc.componentTotals[key].millware += millware;
            acc.componentTotals[key].diff += componentDiff;
            acc.componentTotals[key].absDiff += Math.abs(componentDiff);
        });

        return acc;
    }, {
        employeeCount: 0,
        matchCount: 0,
        mismatchCount: 0,
        noMillwareCount: 0,
        venusNetpayTotal: 0,
        millwareNetpayTotal: 0,
        componentTotals: initialComponentTotals,
        problemRows: []
    });

    analysis.netpayDiff = analysis.venusNetpayTotal - analysis.millwareNetpayTotal;
    analysis.netpayAbsDiff = Math.abs(analysis.netpayDiff);
    analysis.problemRows.sort((a, b) => b.absDiff - a.absDiff);
    analysis.topProblemRows = analysis.problemRows.slice(0, 25);
    analysis.componentRanking = Object.entries(analysis.componentTotals)
        .map(([key, totals]) => ({ key, ...totals }))
        .sort((a, b) => b.absDiff - a.absDiff);
    return analysis;
};

const NetpayAnalysisPanel = ({ data, analysis }) => {
    const [statusFilter, setStatusFilter] = useState('problem');
    const [search, setSearch] = useState('');

    const netpayAnalysis = useMemo(() => analysis || buildFallbackNetpayAnalysis(data), [analysis, data]);
    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return (data || []).map((row) => {
            const hasMillware = Boolean(row.millware);
            const venusNetpay = Number(row.sync?.upahBersih?.venus || 0);
            const millwareNetpay = hasMillware ? Number(row.sync?.upahBersih?.millware || 0) : 0;
            const diff = venusNetpay - millwareNetpay;
            const status = !hasMillware ? 'NO_MILLWARE' : Math.abs(diff) <= 50 ? 'MATCH' : 'MISMATCH';
            return { ...row, hasMillware, venusNetpay, millwareNetpay, diff, absDiff: Math.abs(diff), status };
        }).filter((row) => {
            if (query && !`${row.name} ${row.ptrjId} ${row.id}`.toLowerCase().includes(query)) return false;
            if (statusFilter === 'all') return true;
            if (statusFilter === 'problem') return row.status !== 'MATCH';
            return row.status === statusFilter;
        }).sort((a, b) => b.absDiff - a.absDiff);
    }, [data, search, statusFilter]);

    const includedMillwareCount = (netpayAnalysis.employeeCount || 0) - (netpayAnalysis.noMillwareCount || 0);
    const statusCards = [
        { label: 'Total Karyawan', value: netpayAnalysis.employeeCount || 0, color: '#0f172a', bg: '#f8fafc' },
        { label: 'Match Net Pay', value: netpayAnalysis.matchCount || 0, color: '#166534', bg: '#dcfce7' },
        { label: 'Mismatch Net Pay', value: netpayAnalysis.mismatchCount || 0, color: '#991b1b', bg: '#fee2e2' },
        { label: 'No Millware', value: netpayAnalysis.noMillwareCount || 0, color: '#92400e', bg: '#fef3c7' }
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
            <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                    <Paper elevation={0} sx={{ p: 2, border: '1px solid #bfdbfe', bgcolor: '#eff6ff', borderRadius: 2, height: '100%' }}>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: '#1d4ed8' }}>TOTAL NET PAY VENUS</Typography>
                        <Typography sx={{ mt: 1, fontSize: '1.35rem', fontWeight: 900, color: '#0f172a' }}>{formatCurrency(netpayAnalysis.venusNetpayTotal || 0)}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#475569' }}>Dari {formatNumber(netpayAnalysis.employeeCount)} karyawan payroll</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper elevation={0} sx={{ p: 2, border: '1px solid #bbf7d0', bgcolor: '#f0fdf4', borderRadius: 2, height: '100%' }}>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: '#15803d' }}>TOTAL NET PAY MILLWARE</Typography>
                        <Typography sx={{ mt: 1, fontSize: '1.35rem', fontWeight: 900, color: '#0f172a' }}>{formatCurrency(netpayAnalysis.millwareNetpayTotal || 0)}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#475569' }}>Terhitung untuk {formatNumber(includedMillwareCount)} karyawan yang punya data Millware</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper elevation={0} sx={{ p: 2, border: '1px solid #fed7aa', bgcolor: '#fff7ed', borderRadius: 2, height: '100%' }}>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: '#c2410c' }}>SELISIH TOTAL (VENUS - MILLWARE)</Typography>
                        <Typography sx={{ mt: 1, fontSize: '1.35rem', fontWeight: 900, color: Math.abs(netpayAnalysis.netpayDiff || 0) > 50 ? '#dc2626' : '#16a34a' }}>{formatCurrency(netpayAnalysis.netpayDiff || 0)}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#475569' }}>Toleransi match Rp50 per karyawan</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {statusCards.map((card) => (
                    <Chip key={card.label} label={`${card.label}: ${formatNumber(card.value)}`} sx={{ bgcolor: card.bg, color: card.color, fontWeight: 900 }} />
                ))}
            </Box>

            <Grid container spacing={2} sx={{ minHeight: 0 }}>
                <Grid item xs={12} lg={5}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, maxHeight: 360 }}>
                        <Table stickyHeader size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>KOMPONEN PENYUMBANG SELISIH</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>VENUS</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>MILLWARE</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>SELISIH</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(netpayAnalysis.componentRanking || []).map((component) => (
                                    <TableRow key={component.key} sx={{ bgcolor: component.key === 'upahBersih' ? '#f0f9ff' : 'inherit' }}>
                                        <TableCell sx={{ fontSize: '0.75rem', fontWeight: component.key === 'upahBersih' ? 900 : 700 }}>{COMPONENT_LABELS[component.key] || component.key}</TableCell>
                                        <TableCell align="right" sx={{ fontSize: '0.72rem' }}>{formatCurrency(component.venus || 0)}</TableCell>
                                        <TableCell align="right" sx={{ fontSize: '0.72rem' }}>{formatCurrency(component.millware || 0)}</TableCell>
                                        <TableCell align="right" sx={{ fontSize: '0.72rem', fontWeight: 900, color: Math.abs(component.diff || 0) > 50 ? '#dc2626' : '#16a34a' }}>{formatCurrency(component.diff || 0)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                <Grid item xs={12} lg={7}>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <TextField
                                size="small"
                                placeholder="Cari karyawan/PTRJ"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                sx={{ width: 220, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                            />
                            <TextField
                                select
                                size="small"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                sx={{ width: 170, '& .MuiInputBase-input': { fontSize: '0.8rem', fontWeight: 700 } }}
                            >
                                <MenuItem value="problem">Mismatch + No MW</MenuItem>
                                <MenuItem value="all">Semua</MenuItem>
                                <MenuItem value="MISMATCH">Mismatch</MenuItem>
                                <MenuItem value="NO_MILLWARE">No Millware</MenuItem>
                                <MenuItem value="MATCH">Match</MenuItem>
                            </TextField>
                        </Box>
                        <Typography sx={{ alignSelf: 'center', fontSize: '0.72rem', color: '#64748b', fontWeight: 800 }}>
                            {formatNumber(rows.length)} baris
                        </Typography>
                    </Box>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, maxHeight: 360 }}>
                        <Table stickyHeader size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>KARYAWAN</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>VENUS</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>MILLWARE</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>SELISIH</TableCell>
                                    <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 900 }}>STATUS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((row) => (
                                    <TableRow key={`${row.id}-${row.ptrjId}`} hover>
                                        <TableCell>
                                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>{row.name}</Typography>
                                            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{row.ptrjId || row.id}</Typography>
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontSize: '0.72rem', fontWeight: 700 }}>{formatCurrency(row.venusNetpay)}</TableCell>
                                        <TableCell align="right" sx={{ fontSize: '0.72rem', fontWeight: 700 }}>{formatCurrency(row.millwareNetpay)}</TableCell>
                                        <TableCell align="right" sx={{ fontSize: '0.72rem', fontWeight: 900, color: row.status === 'MATCH' ? '#16a34a' : '#dc2626' }}>{formatCurrency(row.diff)}</TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                label={row.status === 'MATCH' ? 'MATCH' : row.status === 'NO_MILLWARE' ? 'NO MW' : 'MISMATCH'}
                                                size="small"
                                                sx={{ height: 20, fontSize: '0.58rem', fontWeight: 900, bgcolor: row.status === 'MATCH' ? '#dcfce7' : row.status === 'NO_MILLWARE' ? '#fef3c7' : '#fee2e2', color: row.status === 'MATCH' ? '#166534' : row.status === 'NO_MILLWARE' ? '#92400e' : '#991b1b' }}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>
        </Box>
    );
};

const PayrollComponentMatrix = ({ data, onPayrollAutomation, onBerasAutomation, onLemburAdjustment, isPayrollAutomationRunning, isSnapshotSource, hasSnapshot, month, year, onExport }) => {
    const [statusFilter, setStatusFilter] = useState('problem');
    const [search, setSearch] = useState('');
    const [exportAnchor, setExportAnchor] = useState(null);
    const [exportFilter, setExportFilter] = useState('all');
    const [exporting, setExporting] = useState(false);

    const matrixRows = useMemo(() => {
        return (data || []).map((row) => {
            const cells = PAYROLL_MATRIX_COMPONENTS.map((component) => {
                const pair = row.sync?.[component.key] || { venus: 0, millware: 0 };
                return {
                    ...component,
                    ...pair,
                    status: getComponentStatus(pair, Boolean(row.millware), 50, component.key)
                };
            });

            const syncableCells = cells.filter((cell) => cell.syncable);
            const counts = syncableCells.reduce((acc, cell) => {
                acc[cell.status.code] = (acc[cell.status.code] || 0) + 1;
                return acc;
            }, {});

            return {
                id: row.id,
                name: row.name,
                ptrjId: row.ptrjId,
                cells,
                counts,
                syncedCount: counts.MATCH || 0,
                missCount: counts.MISS || 0,
                diffCount: counts.DIFF || 0,
                noDataCount: counts.NO_DATA || 0,
                hasProblem: syncableCells.some((cell) => ['NO_DATA', 'MISS', 'DIFF'].includes(cell.status.code))
            };
        });
    }, [data]);

    const summary = useMemo(() => {
        return matrixRows.flatMap((row) => row.cells.filter((cell) => cell.syncable)).reduce((acc, cell) => {
            acc.total += 1;
            acc[cell.status.code] = (acc[cell.status.code] || 0) + 1;
            return acc;
        }, { total: 0, MATCH: 0, MISS: 0, DIFF: 0, NO_DATA: 0, EMPTY: 0 });
    }, [matrixRows]);

    const filteredRows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return matrixRows.filter((row) => {
            if (query && !`${row.name} ${row.ptrjId}`.toLowerCase().includes(query)) return false;
            if (statusFilter === 'all') return true;
            if (statusFilter === 'problem') return row.hasProblem;
            return row.cells.some((cell) => cell.syncable && cell.status.code === statusFilter);
        });
    }, [matrixRows, search, statusFilter]);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={`SYNC ${summary.MATCH}`} sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 800 }} size="small" />
                    <Chip label={`BELUM MASUK ${summary.MISS}`} sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 800 }} size="small" />
                    <Chip label={`SELISIH ${summary.DIFF}`} sx={{ bgcolor: '#ffedd5', color: '#9a3412', fontWeight: 800 }} size="small" />
                    <Chip label={`NO MW ${summary.NO_DATA}`} sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 800 }} size="small" />
                    <Chip label="BPJS diabaikan dari MISS/SYNC" sx={{ bgcolor: '#e0f2fe', color: '#075985', fontWeight: 800 }} size="small" />
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isSnapshotSource && (
                        <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            disabled={isPayrollAutomationRunning || !hasSnapshot}
                            startIcon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
                            onClick={() => onLemburAdjustment?.()}
                            sx={{ height: 32, fontSize: '0.68rem', fontWeight: 800 }}
                        >
                            Adjustment Lembur
                        </Button>
                    )}
                    {PAYROLL_SYNC_COMPONENTS.map((component) => (
                        <Button
                            key={component.key}
                            size="small"
                            variant={component.key === 'all' ? 'contained' : 'outlined'}
                            color={component.key === 'beras' ? 'warning' : 'primary'}
                            disabled={isPayrollAutomationRunning}
                            startIcon={isPayrollAutomationRunning ? <CircularProgress size={14} color="inherit" /> : component.key === 'beras' ? <RiceBowlIcon sx={{ fontSize: 14 }} /> : <PlayArrowIcon />}
                            onClick={() => {
                                if (component.key === 'beras') {
                                    // Beras uses separate automation that inputs SELISIH amount
                                    onBerasAutomation?.();
                                } else {
                                    onPayrollAutomation?.({ componentKeys: component.componentKeys || [component.key] });
                                }
                            }}
                            sx={{ height: 32, fontSize: '0.68rem', fontWeight: 800 }}
                        >
                            Sync {component.label}
                        </Button>
                    ))}
                    <TextField
                        size="small"
                        placeholder="Cari karyawan/PTRJ"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        sx={{ width: 220, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                    />
                    <TextField
                        select
                        size="small"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        sx={{ width: 150, '& .MuiInputBase-input': { fontSize: '0.8rem', fontWeight: 700 } }}
                    >
                        <MenuItem value="problem">Belum Beres</MenuItem>
                        <MenuItem value="all">Semua</MenuItem>
                        <MenuItem value="MISS">Belum Masuk</MenuItem>
                        <MenuItem value="DIFF">Selisih</MenuItem>
                        <MenuItem value="NO_DATA">No Millware</MenuItem>
                        <MenuItem value="MATCH">Sync</MenuItem>
                    </TextField>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <FileDownloadIcon />}
                        onClick={(e) => setExportAnchor(e.currentTarget)}
                        disabled={exporting}
                        sx={{ fontWeight: 700, fontSize: '0.68rem', px: 1.5, borderColor: '#6366f1', color: '#6366f1', height: 32 }}
                    >
                        Export
                    </Button>
                    <Menu
                        anchorEl={exportAnchor}
                        open={Boolean(exportAnchor)}
                        onClose={() => setExportAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    >
                        <Box sx={{ px: 2, py: 1, minWidth: 180 }}>
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, mb: 1 }}>Filter Export:</Typography>
                            <TextField
                                select
                                size="small"
                                fullWidth
                                value={exportFilter}
                                onChange={(e) => setExportFilter(e.target.value)}
                                sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                            >
                                <MenuItem value="all">Semua Karyawan</MenuItem>
                                <MenuItem value="matched">Matched (Sesuai)</MenuItem>
                                <MenuItem value="mismatched">Mismatched (Selisih)</MenuItem>
                                <MenuItem value="no_millware">No Millware</MenuItem>
                            </TextField>
                        </Box>
                        <Divider />
                        <MenuItem onClick={() => { setExporting(true); onExport?.('csv', exportFilter); setExportAnchor(null); }} sx={{ fontSize: '0.8rem' }}>
                            <TableChartIcon sx={{ mr: 1, fontSize: 18 }} /> Export CSV
                        </MenuItem>
                        <MenuItem onClick={() => { setExporting(true); onExport?.('xlsx', exportFilter); setExportAnchor(null); }} sx={{ fontSize: '0.8rem' }}>
                            <TableChartIcon sx={{ mr: 1, fontSize: 18 }} /> Export Excel
                        </MenuItem>
                    </Menu>
                </Box>
            </Box>

            <TableContainer component={Paper} elevation={0} sx={{ flexGrow: 1, border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'auto' }}>
                <Table stickyHeader size="small" sx={{ minWidth: 1280 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 900, minWidth: 230 }}>KARYAWAN</TableCell>
                            {PAYROLL_MATRIX_COMPONENTS.map((component) => (
                                <TableCell key={component.key} align="center" sx={{ bgcolor: component.syncable ? (component.type === 'Tunjangan' ? '#ecfdf5' : '#fff1f2') : '#f8fafc', color: component.syncable ? 'inherit' : '#64748b', fontWeight: 900, fontSize: '0.72rem', minWidth: 118 }}>
                                    {component.label}
                                </TableCell>
                            ))}
                            <TableCell align="center" sx={{ bgcolor: '#f1f5f9', fontWeight: 900, minWidth: 95 }}>STATUS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredRows.map((row) => (
                            <TableRow key={row.id} hover>
                                <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: '#fff' }}>
                                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>{row.name}</Typography>
                                    <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{row.ptrjId || row.id}</Typography>
                                </TableCell>
                                {row.cells.map((cell) => (
                                    <TableCell key={cell.key} align="center" sx={{ bgcolor: cell.status.code === 'EMPTY' ? '#fff' : cell.status.bg, borderLeft: '1px solid #eef2f7' }}>
                                        <Chip label={cell.syncable ? cell.status.label : 'INFO'} size="small" sx={{ height: 18, fontSize: '0.58rem', fontWeight: 900, color: cell.syncable ? cell.status.color : '#64748b', bgcolor: '#fff' }} />
                                        {cell.key === 'lembur' ? (
                                            // Lembur breakdown display
                                            <React.Fragment>
                                                <Typography sx={{ mt: 0.4, fontSize: '0.62rem', fontWeight: 800, color: '#0f172a' }}>Total: {formatCurrency(cell.venus)}</Typography>
                                                <Typography sx={{ fontSize: '0.5rem', color: '#64748b' }}>
                                                    OT1: {formatCurrency(cell.venusDetail?.ot1 || 0)}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.5rem', color: '#64748b' }}>
                                                    OT2: {formatCurrency(cell.venusDetail?.ot2 || 0)}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.5rem', color: '#64748b' }}>
                                                    OT3: {formatCurrency(cell.venusDetail?.ot3 || 0)}
                                                </Typography>
                                                {(cell.venusDetail?.minusOvt || 0) !== 0 && (
                                                    <Typography sx={{ fontSize: '0.5rem', color: '#dc2626', fontWeight: 700 }}>
                                                        Minus: {formatCurrency(cell.venusDetail?.minusOvt || 0)}
                                                    </Typography>
                                                )}
                                                <Divider sx={{ my: 0.5 }} />
                                                <Typography sx={{ fontSize: '0.52rem', color: '#00695c', fontWeight: 700 }}>MW: {formatCurrency(cell.millware)}</Typography>
                                                <Typography sx={{ fontSize: '0.48rem', color: '#64748b' }}>
                                                    TaskReg: {formatCurrency(cell.millwareDetail?.taskreg || 0)}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.48rem', color: '#64748b' }}>
                                                    AdTrans: {formatCurrency(cell.millwareDetail?.adtrans || 0)}
                                                </Typography>
                                            </React.Fragment>
                                        ) : (
                                            <React.Fragment>
                                                <Typography sx={{ mt: 0.4, fontSize: '0.62rem', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(cell.venus)}</Typography>
                                                <Typography sx={{ fontSize: '0.58rem', color: '#64748b' }}>MW {formatCurrency(cell.millware)}</Typography>
                                            </React.Fragment>
                                        )}
                                        {cell.key === 'beras' && (
                                            <Typography sx={{ fontSize: '0.58rem', fontWeight: 800, color: '#475569' }}>
                                                Base {formatCurrency(row.millware?.tunjangan_beras_base || 0)} + Tambalan {formatCurrency(row.millware?.tunjangan_beras_adtrans || 0)}
                                            </Typography>
                                        )}
                                        {cell.syncable && ['MISS', 'DIFF', 'NO_DATA'].includes(cell.status.code) && (
                                            <Typography sx={{ fontSize: '0.58rem', fontWeight: 900, color: cell.status.color }}>
                                                Δ {formatCurrency(cell.status.diff)}
                                            </Typography>
                                        )}
                                    </TableCell>
                                ))}
                                <TableCell align="center">
                                    <Chip
                                        label={row.missCount > 0 ? `MISS ${row.missCount}` : row.diffCount > 0 ? `SELISIH ${row.diffCount}` : row.noDataCount > 0 ? `NO MW ${row.noDataCount}` : `SYNC ${row.syncedCount}`}
                                        size="small"
                                        sx={{ bgcolor: row.hasProblem ? '#fee2e2' : '#dcfce7', color: row.hasProblem ? '#991b1b' : '#166534', fontWeight: 900 }}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

const EmployeePayrollRow = ({ row, index, perspective }) => {
    const [open, setOpen] = useState(false);
    const [detailTab, setDetailTab] = useState(0);
    const mw = row.millware;
    const sync = row.sync;

    const displayGajiPokok = perspective === 'millware' ? (mw?.gaji_pokok || 0) : row.gajiPokok;
    const displayTunjangan = perspective === 'millware' ? 
        ((mw?.tunjangan_jabatan || 0) + (mw?.tunjangan_beras || 0) + (mw?.tunjangan_masa_kerja || 0) + (mw?.tunjangan_lembur || 0) + (mw?.premi_total || 0)) : 
        row.tunjanganTotal;
    const displayPotongan = perspective === 'millware' ? (mw?.potongan_total || 0) : row.potonganTotal;
    const displayNet = perspective === 'millware' ? (mw?.upah_bersih || 0) : row.upahBersih;

    return (
        <React.Fragment>
            <TableRow hover sx={{ bgcolor: open ? 'rgba(25, 118, 210, 0.04)' : 'inherit', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
                <TableCell width={40}>
                    <IconButton size="small">
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{row.name}</Typography>
                            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{row.ptrjId || row.id}</Typography>
                        </Box>
                        {perspective === 'millware' && mw && (
                            <Chip label={`${mw.paid_hk} HK`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#e0f2f1', color: '#00695c', fontWeight: 700 }} />
                        )}
                    </Box>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: perspective === 'millware' ? 700 : 400 }}>{formatCurrency(displayGajiPokok)}</TableCell>
                <TableCell align="right" sx={{ color: '#16a34a' }}>+ {formatCurrency(displayTunjangan)}</TableCell>
                <TableCell align="right" sx={{ color: '#dc2626' }}>- {formatCurrency(Math.abs(displayPotongan))}</TableCell>
                <TableCell align="right">
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: perspective === 'comparison' ? '#0369a1' : 'inherit' }}>
                        {formatCurrency(displayNet)}
                    </Typography>
                </TableCell>
                <TableCell align="center">
                    {perspective === 'comparison' ? (
                        !mw ? <Chip label="No Data" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} /> :
                        sync?.isSynced ? 
                        <Chip icon={<CheckCircleIcon style={{ fontSize: 14 }} />} label="MATCH" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 800, height: 22 }} /> :
                        <Chip icon={<ErrorOutlineIcon style={{ fontSize: 14 }} />} label="MISMATCH" size="small" sx={{ bgcolor: '#fee2e2', color: '#e11d48', fontWeight: 800, height: 22 }} />
                    ) : (
                        <Chip label={perspective.toUpperCase()} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, borderColor: perspective === 'millware' ? '#00695c' : 'primary.main' }} />
                    )}
                </TableCell>
            </TableRow>
            
            <TableRow>
                <TableCell colSpan={7} style={{ paddingBottom: 0, paddingTop: 0 }}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 3, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', m: 1, borderRadius: 2, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                                <Tabs value={detailTab} onChange={(e, v) => setDetailTab(v)} size="small">
                                    <Tab label="MILLWARE TRANSACTION AUDIT" icon={<FactCheckIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ fontSize: '0.7rem', fontWeight: 800 }} />
                                    <Tab label="VENUS PAYROLL DATA" icon={<PaymentsIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ fontSize: '0.7rem', fontWeight: 800 }} />
                                    <Tab label="VARIANCE ANALYSIS" icon={<CompareArrowsIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ fontSize: '0.7rem', fontWeight: 800 }} />
                                </Tabs>
                            </Box>

                            {/* Tab 0: Millware Real Transactions */}
                            {detailTab === 0 && (
                                <Fade in={true}>
                                    <Box>
                                        <Grid container spacing={3}>
                                            <Grid item xs={12} md={6}>
                                                <Typography variant="overline" sx={{ fontWeight: 900, color: 'text.secondary', ml: 1 }}>Attendance & Core Wages (TASKREG)</Typography>
                                                <List dense sx={{ bgcolor: 'white', borderRadius: 2, border: '1px solid #e2e8f0', mt: 1 }}>
                                                    <ListItem>
                                                        <ListItemIcon><EventAvailableIcon color="primary" /></ListItemIcon>
                                                        <ListItemText 
                                                            primary={<Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{mw?.paid_hk || 0} Hari Kerja Terdeteksi</Typography>}
                                                            secondary="Dihitung dari unique TrxDate di PR_TASKREGLN"
                                                        />
                                                        <Typography sx={{ fontWeight: 800 }}>{formatCurrency(mw?.pay_rate || 0)}/HK</Typography>
                                                    </ListItem>
                                                    <Divider variant="inset" component="li" />
                                                    <ListItem>
                                                        <ListItemIcon><AccessTimeFilledIcon sx={{ color: '#9a3412' }} /></ListItemIcon>
                                                        <ListItemText 
                                                            primary={<Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{mw?.jam_lembur?.toFixed(2) || 0} Jam Lembur</Typography>}
                                                            secondary="Akumulasi Hours dan Amount dari PR_TASKREGLN OT=1"
                                                        />
                                                        <Typography sx={{ fontWeight: 800, color: '#9a3412' }}>{formatCurrency(mw?.tunjangan_lembur || 0)}</Typography>
                                                    </ListItem>
                                                    <Box sx={{ p: 2, bgcolor: '#f0fdf4', mt: 1, borderRadius: '0 0 8px 8px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 800 }}>SUBTOTAL GAJI POKOK + LEMBUR</Typography>
                                                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 900, color: '#16a34a' }}>{formatCurrency((mw?.gaji_pokok || 0) + (mw?.tunjangan_lembur || 0))}</Typography>
                                                    </Box>
                                                </List>
                                            </Grid>
                                            
                                            <Grid item xs={12} md={6}>
                                                <Typography variant="overline" sx={{ fontWeight: 900, color: 'text.secondary', ml: 1 }}>Allowances & Premiums (ADTRANS)</Typography>
                                                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', mt: 1, borderRadius: 2 }}>
                                                    <Table size="small">
                                                        <TableBody>
                                                            <TableRow>
                                                                <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700 }}>Tj. Jabatan</TableCell>
                                                                <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{formatCurrency(mw?.tunjangan_jabatan || 0)}</TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700 }}>Tj. Beras (Calc + ADTRANS)</TableCell>
                                                                <TableCell align="right" sx={{ fontSize: '0.7rem' }}>
                                                                    {formatCurrency(mw?.tunjangan_beras || 0)}
                                                                    <Typography component="div" sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>
                                                                        Base {formatCurrency(mw?.tunjangan_beras_base || 0)} + Tambalan {formatCurrency(mw?.tunjangan_beras_adtrans || 0)}
                                                                    </Typography>
                                                                    <Typography component="div" sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>
                                                                        Rasio MW {formatNumber(mw?.rice_ration)}/HK
                                                                    </Typography>
                                                                </TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700 }}>Tj. Masa Kerja</TableCell>
                                                                <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{formatCurrency(mw?.tunjangan_masa_kerja || 0)}</TableCell>
                                                            </TableRow>
                                                            <TableRow sx={{ bgcolor: '#fdf2f8' }}>
                                                                <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#be185d' }}>TOTAL PREMI (BRONDOL/PANEN/DLL)</TableCell>
                                                                <TableCell align="right" sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#be185d' }}>{formatCurrency(mw?.premi_total || 0)}</TableCell>
                                                            </TableRow>
                                                            <TableRow sx={{ bgcolor: '#fff1f2' }}>
                                                                <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#e11d48' }}>TOTAL POTONGAN (BPJS/PPH/SPSI)</TableCell>
                                                                <TableCell align="right" sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#e11d48' }}>- {formatCurrency(Math.abs(mw?.potongan_total || 0))}</TableCell>
                                                            </TableRow>
                                                            {(mw?.auto_tunjangan_perusahaan || 0) > 0 && (
                                                                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                                                    <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b' }}>Benefit Perusahaan Venus (Info)</TableCell>
                                                                    <TableCell align="right" sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b' }}>
                                                                        {formatCurrency(mw?.auto_tunjangan_perusahaan || 0)}
                                                                        <Typography component="div" sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>
                                                                            Tidak masuk net pay
                                                                        </Typography>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                            {((mw?.auto_potongan_bpjs_kesehatan || 0) > 0 || (mw?.auto_potongan_bpjs_pensiun || 0) > 0 || (mw?.auto_potongan_lain || 0) > 0) && (
                                                                <TableRow sx={{ bgcolor: '#fff7ed' }}>
                                                                    <TableCell sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#c2410c' }}>BPJS Otomatis dari Venus</TableCell>
                                                                    <TableCell align="right" sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#c2410c' }}>
                                                                        - {formatCurrency((mw?.auto_potongan_bpjs_kesehatan || 0) + (mw?.auto_potongan_bpjs_pensiun || 0) + (mw?.auto_potongan_lain || 0))}
                                                                        <Typography component="div" sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>
                                                                            BPJS karyawan/pinjaman/absen/lain-lain
                                                                        </Typography>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </Grid>
                                        </Grid>
                                    </Box>
                                </Fade>
                            )}

                            {/* Tab 1: Venus Data */}
                            {detailTab === 1 && (
                                <Fade in={true}>
                                    <Box>
                                        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2 }}>
                                            <Table size="small">
                                                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem' }}>KOMPONEN VENUS</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.7rem' }}>JUMLAH</TableCell>
                                                        <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem' }}>KETERANGAN</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700 }}>Gaji Pokok (#GP#)</TableCell>
                                                        <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{formatCurrency(row.gajiPokok)}</TableCell>
                                                        <TableCell sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>Data Statis</TableCell>
                                                    </TableRow>
                                                    {row.tunjanganDetails.map((tj, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell sx={{ fontSize: '0.75rem' }}>{tj.name}</TableCell>
                                                            <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#16a34a' }}>+ {formatCurrency(tj.amount)}</TableCell>
                                                            <TableCell sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>Addition</TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {row.potonganDetails.map((pot, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell sx={{ fontSize: '0.75rem' }}>{pot.name}</TableCell>
                                                            <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#dc2626' }}>- {formatCurrency(Math.abs(pot.amount))}</TableCell>
                                                            <TableCell sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>Deduction</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Box>
                                </Fade>
                            )}

                            {/* Tab 2: Variance Analysis */}
                            {detailTab === 2 && (
                                <Fade in={true}>
                                    <Box>
                                        {!mw ? <Alert severity="warning">Data Millware tidak ditemukan untuk perbandingan</Alert> : (
                                            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2 }}>
                                                <Table size="small">
                                                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                                        <TableRow>
                                                            <TableCell sx={{ fontWeight: 800, fontSize: '0.7rem' }}>KOMPONEN</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.7rem' }}>VENUS</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.7rem' }}>MILLWARE (CALC)</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.7rem' }}>SELISIH (V - M)</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {[
                                                            { label: 'Gaji Pokok (HK x Rate)', key: 'gajiPokok' },
                                                            // Lembur breakdown rows
                                                            { label: '  - Lembur OT1 (OT Jam ke 1)', key: 'lembur_ot1', venusKey: 'lembur', venusField: 'ot1', subType: 'venus' },
                                                            { label: '  - Lembur OT2 (OT Jam ke 2)', key: 'lembur_ot2', venusKey: 'lembur', venusField: 'ot2', subType: 'venus' },
                                                            { label: '  - Lembur OT3 (OT Jam ke 3)', key: 'lembur_ot3', venusKey: 'lembur', venusField: 'ot3', subType: 'venus' },
                                                            { label: '  - Minus Ovt (Kurang Bayar)', key: 'lembur_minus', venusKey: 'lembur', venusField: 'minusOvt', subType: 'venus', italic: true },
                                                            { label: '  - Millware TaskReg (OT Hours)', key: 'lembur_taskreg', millwareKey: 'lembur', millwareField: 'taskreg', subType: 'millware' },
                                                            { label: '  - Millware AdTrans (Topup)', key: 'lembur_adtrans', millwareKey: 'lembur', millwareField: 'adtrans', subType: 'millware' },
                                                            { label: 'LEMBUR TOTAL', key: 'lembur', bold: true, bgColor: '#f0fdf4' },
                                                            // Other components
                                                            { label: 'Tj. Jabatan', key: 'jabatan' },
                                                            { label: 'Tj. Beras', key: 'beras' },
                                                            { label: 'Total Premi', key: 'premi' },
                                                            { label: 'UPAH BERSIH (NET)', key: 'upahBersih', bold: true }
                                                        ].map(cat => {
                                                            let v = 0, m = 0, diff = 0;
                                                            let showVenus = true, showMillware = true;

                                                            if (cat.subType === 'venus') {
                                                                // Sub-detail for Venus lembur breakdown
                                                                v = sync?.lembur?.venusDetail?.[cat.venusField] || 0;
                                                                showMillware = false;
                                                            } else if (cat.subType === 'millware') {
                                                                // Sub-detail for Millware lembur breakdown
                                                                m = sync?.lembur?.millwareDetail?.[cat.millwareField] || 0;
                                                                showVenus = false;
                                                            } else if (cat.key === 'lembur') {
                                                                // Lembur total row
                                                                v = sync?.lembur?.venus || 0;
                                                                m = sync?.lembur?.millware || 0;
                                                            } else {
                                                                v = sync?.[cat.key]?.venus || 0;
                                                                m = sync?.[cat.key]?.millware || 0;
                                                            }

                                                            diff = v - m;

                                                            return (
                                                                <TableRow key={cat.key} sx={{
                                                                    bgcolor: cat.bold ? (cat.bgColor || '#f0f9ff') : 'transparent',
                                                                    fontStyle: cat.italic ? 'italic' : 'normal'
                                                                }}>
                                                                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: cat.bold ? 800 : 400, fontStyle: cat.italic ? 'italic' : 'normal' }}>{cat.label}</TableCell>
                                                                    <TableCell align="right" sx={{ fontSize: '0.75rem', fontStyle: cat.italic ? 'italic' : 'normal' }}>
                                                                        {showVenus && formatCurrency(v)}
                                                                    </TableCell>
                                                                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                                                                        {showMillware && formatCurrency(m)}
                                                                        {cat.key === 'beras' && (
                                                                            <Typography component="div" sx={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>
                                                                                Base {formatCurrency(mw?.tunjangan_beras_base || 0)} + Tambalan {formatCurrency(mw?.tunjangan_beras_adtrans || 0)}
                                                                            </Typography>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 800, color: cat.bold ? '#00695c' : (Math.abs(diff) > 50 ? '#dc2626' : '#16a34a') }}>
                                                                        {cat.bold ? formatCurrency(diff) : (showVenus || showMillware ? formatCurrency(diff) : '-')}
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        )}
                                    </Box>
                                </Fade>
                            )}
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

const PayrollReport = ({ month, year, onPayrollAutomation, isPayrollAutomationRunning, onPayrollADReset, isPayrollADResetRunning, onBerasAutomation, onLemburAdjustment }) => {
    const [data, setData] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [sourceInfo, setSourceInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [mainPerspective, setMainPerspective] = useState('comparison');
    const [exportAnchor, setExportAnchor] = useState(null);
    const [exportFilter, setExportFilter] = useState('all');
    const [exporting, setExporting] = useState(false);
    const [payrollSource, setPayrollSource] = useState('live');
    const [snapshots, setSnapshots] = useState([]);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
    const [snapshotLoading, setSnapshotLoading] = useState(false);
    const [snapshotError, setSnapshotError] = useState(null);

    const payrollSourceParams = useMemo(() => ({
        source: payrollSource,
        snapshotId: payrollSource === 'snapshot' ? selectedSnapshotId : null
    }), [payrollSource, selectedSnapshotId]);

    const buildSourceQuery = () => {
        const params = new URLSearchParams({
            month,
            year,
            source: payrollSource
        });
        if (payrollSource === 'snapshot' && selectedSnapshotId) {
            params.set('snapshotId', selectedSnapshotId);
        }
        return params;
    };

    const loadSnapshots = async () => {
        if (!month || !year) return;
        setSnapshotLoading(true);
        setSnapshotError(null);
        try {
            const response = await fetch(`/api/payroll/snapshots?month=${month}&year=${year}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Gagal memuat snapshot');
            const nextSnapshots = result.data || [];
            setSnapshots(nextSnapshots);
            setSelectedSnapshotId(prev => {
                if (prev && nextSnapshots.some(snapshot => snapshot.id === prev)) return prev;
                return nextSnapshots.find(snapshot => snapshot.isActive)?.id || nextSnapshots[0]?.id || '';
            });
        } catch (err) {
            setSnapshotError(err.message);
            setSnapshots([]);
            setSelectedSnapshotId('');
        } finally {
            setSnapshotLoading(false);
        }
    };

    const handleExportClick = (event) => {
        setExportAnchor(event.currentTarget);
    };

    const handleExportClose = () => {
        setExportAnchor(null);
    };

    const handleExport = async (format, filterOverride) => {
        setExporting(true);
        const activeFilter = filterOverride !== undefined ? filterOverride : exportFilter;
        try {
            const params = buildSourceQuery();
            params.set('format', format);
            params.set('filter', activeFilter);
            const response = await fetch(`/api/payroll/export?${params}`);
            const result = await response.json();
            if (result.success && result.downloadUrl) {
                // Trigger file download
                window.open(result.downloadUrl, '_blank');
            } else if (result.count === 0) {
                alert('Tidak ada data untuk export dengan filter ini');
            } else {
                alert('Export gagal: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            alert('Export error: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    const handleCaptureSnapshot = async () => {
        if (!month || !year || snapshotLoading) return;
        setSnapshotLoading(true);
        setSnapshotError(null);
        try {
            const label = `Payroll ${String(month).padStart(2, '0')}/${year} - ${new Date().toLocaleString('id-ID')}`;
            const response = await fetch('/api/payroll/snapshots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month, year, label, setActive: true })
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Gagal membuat snapshot');
            await loadSnapshots();
            setSelectedSnapshotId(result.data.id);
            setPayrollSource('snapshot');
        } catch (err) {
            setSnapshotError(err.message);
        } finally {
            setSnapshotLoading(false);
        }
    };

    useEffect(() => {
        loadSnapshots();
    }, [month, year]);

    useEffect(() => {
        const fetchPayroll = async () => {
            if (!month || !year) return;
            if (payrollSource === 'snapshot' && !selectedSnapshotId) {
                setData([]);
                setAnalysis(null);
                setSourceInfo(null);
                setError(null);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/payroll?${buildSourceQuery()}`);
                const result = await response.json();
                if (result.success) {
                    setData(result.data);
                    setAnalysis(result.analysis || null);
                    setSourceInfo(result.sourceInfo || null);
                } else {
                    setError(result.error);
                    setAnalysis(null);
                    setSourceInfo(null);
                }
            } catch (err) { setError(err.message); }
            finally { setLoading(false); }
        };
        fetchPayroll();
    }, [month, year, payrollSource, selectedSnapshotId]);

    const selectedSnapshot = snapshots.find(snapshot => snapshot.id === selectedSnapshotId);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {snapshotError && (
                <Alert severity="warning" sx={{ mx: 2, mt: 1 }}>{snapshotError}</Alert>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 2, py: 1, bgcolor: '#f8fafc', borderRadius: '8px 8px 0 0' }}>
                <Tabs
                    value={mainPerspective}
                    onChange={(e, v) => setMainPerspective(v)}
                    sx={{ flexGrow: 1, minWidth: 320 }}
                >
                    <Tab
                        icon={<CompareArrowsIcon sx={{ fontSize: 18 }} />}
                        iconPosition="start"
                        label="COMPARISON SUMMARY" 
                        value="comparison" 
                        sx={{ fontWeight: 800, fontSize: '0.75rem' }} 
                    />
                    <Tab
                        icon={<InsightsIcon sx={{ fontSize: 18 }} />}
                        iconPosition="start"
                        label="ANALISIS NETPAY"
                        value="netpay"
                        sx={{ fontWeight: 800, fontSize: '0.75rem' }}
                    />
                    <Tab
                        icon={<AssessmentIcon sx={{ fontSize: 18 }} />}
                        iconPosition="start"
                        label="MATRIX TUNJANGAN/POTONGAN"
                        value="matrix"
                        sx={{ fontWeight: 800, fontSize: '0.75rem' }}
                    />
                    <Tab 
                        icon={<AccountBalanceWalletIcon sx={{ fontSize: 18 }} />} 
                        iconPosition="start" 
                        label="VENUS PERSPECTIVE" 
                        value="venus" 
                        sx={{ fontWeight: 800, fontSize: '0.75rem' }} 
                    />
                    <Tab 
                        icon={<FactCheckIcon sx={{ fontSize: 18 }} />} 
                        iconPosition="start" 
                        label="MILLWARE PERSPECTIVE (TRANSACTIONAL)" 
                        value="millware" 
                        sx={{ fontWeight: 800, fontSize: '0.75rem' }} 
                    />
                </Tabs>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <TextField
                        select
                        size="small"
                        value={payrollSource}
                        onChange={(event) => setPayrollSource(event.target.value)}
                        sx={{ width: 118, '& .MuiInputBase-input': { fontSize: '0.72rem', fontWeight: 800 } }}
                    >
                        <MenuItem value="live">Live</MenuItem>
                        <MenuItem value="snapshot" disabled={snapshots.length === 0}>Snapshot</MenuItem>
                    </TextField>
                    {payrollSource === 'snapshot' && (
                        <TextField
                            select
                            size="small"
                            value={selectedSnapshotId}
                            onChange={(event) => setSelectedSnapshotId(event.target.value)}
                            disabled={snapshotLoading || snapshots.length === 0}
                            sx={{ width: 220, '& .MuiInputBase-input': { fontSize: '0.72rem', fontWeight: 700 } }}
                        >
                            {snapshots.map(snapshot => (
                                <MenuItem key={snapshot.id} value={snapshot.id}>
                                    {snapshot.isActive ? '* ' : ''}{snapshot.label}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={snapshotLoading ? <CircularProgress size={14} color="inherit" /> : <CameraAltIcon />}
                        onClick={handleCaptureSnapshot}
                        disabled={snapshotLoading || !month || !year}
                        sx={{ fontWeight: 800, fontSize: '0.68rem', px: 1.2 }}
                    >
                        Snapshot
                    </Button>
                    <Chip
                        size="small"
                        icon={<StorageIcon sx={{ fontSize: 14 }} />}
                        label={payrollSource === 'snapshot' ? (selectedSnapshot?.label || sourceInfo?.label || 'Snapshot') : 'Live'}
                        sx={{
                            maxWidth: 220,
                            fontWeight: 900,
                            fontSize: '0.65rem',
                            bgcolor: payrollSource === 'snapshot' ? '#ede9fe' : '#dcfce7',
                            color: payrollSource === 'snapshot' ? '#5b21b6' : '#166534',
                            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' }
                        }}
                    />
                </Box>
                <Box sx={{ pr: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button
                        variant="outlined"
                        color="warning"
                        size="small"
                        startIcon={isPayrollADResetRunning ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
                        onClick={() => onPayrollADReset?.({ targetMode: 'all', windowCount: 5, ...payrollSourceParams })}
                        disabled={isPayrollADResetRunning || isPayrollAutomationRunning}
                        sx={{ fontWeight: 700, fontSize: '0.7rem', px: 1.5, borderColor: '#F59E0B', color: '#F59E0B' }}
                    >
                        {isPayrollADResetRunning ? 'Resetting...' : 'Reset AD'}
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RiceBowlIcon sx={{ fontSize: 16 }} />}
                        onClick={() => onBerasAutomation?.(payrollSourceParams)}
                        disabled={isPayrollAutomationRunning || isPayrollADResetRunning}
                        sx={{ fontWeight: 700, fontSize: '0.7rem', px: 1.5, borderColor: '#F59E0B', color: '#F59E0B' }}
                    >
                        Input Beras
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        startIcon={isPayrollAutomationRunning ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                        onClick={() => onPayrollAutomation({ componentKeys: ['jabatan', 'masaKerja', 'pph21', 'spsi'], ...payrollSourceParams })}
                        disabled={isPayrollAutomationRunning}
                        sx={{ fontWeight: 700, fontSize: '0.7rem', px: 1.5 }}
                    >
                        {isPayrollAutomationRunning ? 'Running...' : 'Input ke Millware'}
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <FileDownloadIcon />}
                        onClick={handleExportClick}
                        disabled={loading || exporting}
                        sx={{ fontWeight: 700, fontSize: '0.7rem', px: 1.5, borderColor: '#6366f1', color: '#6366f1' }}
                    >
                        Export
                    </Button>
                    <Menu
                        anchorEl={exportAnchor}
                        open={Boolean(exportAnchor)}
                        onClose={handleExportClose}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    >
                        <Box sx={{ px: 2, py: 1, minWidth: 200 }}>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, mb: 1 }}>Filter Data:</Typography>
                            <TextField
                                select
                                size="small"
                                fullWidth
                                value={exportFilter}
                                onChange={(e) => setExportFilter(e.target.value)}
                                sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                            >
                                <MenuItem value="all">Semua Karyawan</MenuItem>
                                <MenuItem value="matched">Matched (Sesuai)</MenuItem>
                                <MenuItem value="mismatched">Mismatched (Selisih)</MenuItem>
                                <MenuItem value="no_millware">No Millware</MenuItem>
                            </TextField>
                        </Box>
                        <Divider />
                        <MenuItem onClick={() => handleExport('csv')} sx={{ fontSize: '0.8rem' }}>
                            <TableChartIcon sx={{ mr: 1, fontSize: 18 }} /> Export CSV
                        </MenuItem>
                        <MenuItem onClick={() => handleExport('xlsx')} sx={{ fontSize: '0.8rem' }}>
                            <TableChartIcon sx={{ mr: 1, fontSize: 18 }} /> Export Excel
                        </MenuItem>
                    </Menu>
                </Box>
            </Box>

            {mainPerspective === 'netpay' ? (
                <NetpayAnalysisPanel data={data} analysis={analysis} />
            ) : mainPerspective === 'matrix' ? (
                <PayrollComponentMatrix
                    data={data}
                    onPayrollAutomation={(options) => onPayrollAutomation?.({ ...options, ...payrollSourceParams })}
                    onBerasAutomation={() => onBerasAutomation?.(payrollSourceParams)}
                    onLemburAdjustment={() => onLemburAdjustment?.(payrollSourceParams)}
                    isPayrollAutomationRunning={isPayrollAutomationRunning}
                    isSnapshotSource={payrollSource === 'snapshot'}
                    hasSnapshot={Boolean(selectedSnapshotId)}
                    month={month}
                    year={year}
                    onExport={handleExport}
                />
            ) : (
                <TableContainer component={Paper} elevation={0} sx={{ flexGrow: 1, border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'auto' }}>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell width={40} sx={{ bgcolor: '#f1f5f9' }} />
                                <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9' }}>EMPLOYEE NAME</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#f1f5f9' }}>BASIC SALARY</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#f1f5f9' }}>ALLOWANCES (+)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#f1f5f9' }}>DEDUCTIONS (-)</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#f0f9ff', color: '#0369a1' }}>NET PAY</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 800, bgcolor: '#f1f5f9' }}>VIEW</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.map((row, idx) => (
                                <EmployeePayrollRow 
                                    key={row.id} 
                                    row={row} 
                                    index={idx} 
                                    perspective={mainPerspective} 
                                />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
};

export default PayrollReport;
