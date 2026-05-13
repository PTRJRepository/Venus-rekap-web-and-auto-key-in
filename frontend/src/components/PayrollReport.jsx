import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Typography, CircularProgress, Alert, Collapse, IconButton, Chip,
    Divider, Tabs, Tab, Grid, Card, CardContent, Fade, List, ListItem, ListItemText, ListItemIcon,
    Button, TextField, MenuItem
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssessmentIcon from '@mui/icons-material/Assessment';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import PaymentsIcon from '@mui/icons-material/Payments';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const PAYROLL_SYNC_COMPONENTS = [
    { key: 'all', label: 'Semua', componentKeys: ['jabatan', 'masaKerja', 'pph21', 'spsi'] },
    { key: 'jabatan', label: 'Tj. Jabatan' },
    { key: 'masaKerja', label: 'Masa Kerja' },
    { key: 'pph21', label: 'PPh 21' },
    { key: 'spsi', label: 'SPSI' }
];

const PAYROLL_MATRIX_COMPONENTS = [
    { key: 'jabatan', label: 'Tj. Jabatan', type: 'Tunjangan', syncable: true },
    { key: 'masaKerja', label: 'Tj. Masa Kerja', type: 'Tunjangan', syncable: true },
    { key: 'pph21', label: 'PPh 21', type: 'Potongan', syncable: true },
    { key: 'spsi', label: 'SPSI', type: 'Potongan', syncable: true },
    { key: 'beras', label: 'Tj. Beras', type: 'Info', syncable: false },
    { key: 'lembur', label: 'Lembur', type: 'Info', syncable: false },
    { key: 'premi', label: 'Premi', type: 'Info', syncable: false },
    { key: 'bpjsKes', label: 'BPJS Kes.', type: 'Info', syncable: false },
    { key: 'bpjsPen', label: 'BPJS Pens.', type: 'Info', syncable: false }
];

const getComponentStatus = (pair, hasMillware, tolerance = 50) => {
    const venus = Number(pair?.venus || 0);
    const millware = Number(pair?.millware || 0);
    const diff = venus - millware;

    if (!hasMillware && venus !== 0) return { code: 'NO_DATA', label: 'NO MW', color: '#92400e', bg: '#fef3c7', diff };
    if (Math.abs(venus) <= tolerance && Math.abs(millware) <= tolerance) return { code: 'EMPTY', label: '-', color: '#64748b', bg: '#f8fafc', diff };
    if (Math.abs(diff) <= tolerance) return { code: 'MATCH', label: 'SYNC', color: '#166534', bg: '#dcfce7', diff };
    if (venus !== 0 && Math.abs(millware) <= tolerance) return { code: 'MISS', label: 'MISS', color: '#991b1b', bg: '#fee2e2', diff };
    return { code: 'DIFF', label: 'SELISIH', color: '#9a3412', bg: '#ffedd5', diff };
};

const PayrollComponentMatrix = ({ data, onPayrollAutomation, isPayrollAutomationRunning }) => {
    const [statusFilter, setStatusFilter] = useState('problem');
    const [search, setSearch] = useState('');

    const matrixRows = useMemo(() => {
        return (data || []).map((row) => {
            const cells = PAYROLL_MATRIX_COMPONENTS.map((component) => {
                const pair = row.sync?.[component.key] || { venus: 0, millware: 0 };
                return {
                    ...component,
                    ...pair,
                    status: getComponentStatus(pair, Boolean(row.millware))
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
                    {PAYROLL_SYNC_COMPONENTS.map((component) => (
                        <Button
                            key={component.key}
                            size="small"
                            variant={component.key === 'all' ? 'contained' : 'outlined'}
                            color="primary"
                            disabled={isPayrollAutomationRunning}
                            startIcon={isPayrollAutomationRunning ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
                            onClick={() => onPayrollAutomation?.({ componentKeys: component.componentKeys || [component.key] })}
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
                                        <Typography sx={{ mt: 0.4, fontSize: '0.62rem', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(cell.venus)}</Typography>
                                        <Typography sx={{ fontSize: '0.58rem', color: '#64748b' }}>MW {formatCurrency(cell.millware)}</Typography>
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
                                                                <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700 }}>Tj. Beras (Manual/Calc)</TableCell>
                                                                <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{formatCurrency(mw?.tunjangan_beras || 0)}</TableCell>
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
                                                                <TableCell align="right" sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#e11d48' }}>- {formatCurrency(mw?.potongan_total || 0)}</TableCell>
                                                            </TableRow>
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
                                                            { label: 'Lembur (Accumulated)', key: 'lembur' },
                                                            { label: 'Tj. Jabatan', key: 'jabatan' },
                                                            { label: 'Tj. Beras', key: 'beras' },
                                                            { label: 'Total Premi', key: 'premi' },
                                                            { label: 'UPAH BERSIH (NET)', key: 'upahBersih', bold: true }
                                                        ].map(cat => {
                                                            const v = sync?.[cat.key]?.venus || 0;
                                                            const m = sync?.[cat.key]?.millware || 0;
                                                            const diff = v - m;
                                                            return (
                                                                <TableRow key={cat.key} sx={{ bgcolor: cat.bold ? '#f0f9ff' : 'transparent' }}>
                                                                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: cat.bold ? 800 : 400 }}>{cat.label}</TableCell>
                                                                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{formatCurrency(v)}</TableCell>
                                                                    <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{formatCurrency(m)}</TableCell>
                                                                    <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 800, color: Math.abs(diff) > 50 ? '#dc2626' : '#16a34a' }}>
                                                                        {formatCurrency(diff)}
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

const PayrollReport = ({ month, year, onPayrollAutomation, isPayrollAutomationRunning, onPayrollADReset, isPayrollADResetRunning }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [mainPerspective, setMainPerspective] = useState('comparison');

    useEffect(() => {
        const fetchPayroll = async () => {
            if (!month || !year) return;
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/payroll?month=${month}&year=${year}`);
                const result = await response.json();
                if (result.success) setData(result.data);
                else setError(result.error);
            } catch (err) { setError(err.message); }
            finally { setLoading(false); }
        };
        fetchPayroll();
    }, [month, year]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1, bgcolor: '#f8fafc', borderRadius: '8px 8px 0 0' }}>
                <Tabs
                    value={mainPerspective}
                    onChange={(e, v) => setMainPerspective(v)}
                    sx={{ flexGrow: 1 }}
                >
                    <Tab
                        icon={<CompareArrowsIcon sx={{ fontSize: 18 }} />}
                        iconPosition="start"
                        label="COMPARISON SUMMARY" 
                        value="comparison" 
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
                <Box sx={{ pr: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={isPayrollADResetRunning ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
                        onClick={() => onPayrollADReset?.({ targetMode: 'all', windowCount: 1 })}
                        disabled={isPayrollADResetRunning || isPayrollAutomationRunning}
                        sx={{ fontWeight: 700, fontSize: '0.7rem', px: 1.5 }}
                    >
                        {isPayrollADResetRunning ? 'Resetting...' : 'Reset AD'}
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        startIcon={isPayrollAutomationRunning ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                        onClick={() => onPayrollAutomation({ componentKeys: ['jabatan', 'masaKerja', 'pph21', 'spsi'] })}
                        disabled={isPayrollAutomationRunning}
                        sx={{ fontWeight: 700, fontSize: '0.7rem', px: 1.5 }}
                    >
                        {isPayrollAutomationRunning ? 'Running...' : 'Input ke Millware'}
                    </Button>
                </Box>
            </Box>

            {mainPerspective === 'matrix' ? (
                <PayrollComponentMatrix data={data} onPayrollAutomation={onPayrollAutomation} isPayrollAutomationRunning={isPayrollAutomationRunning} />
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
