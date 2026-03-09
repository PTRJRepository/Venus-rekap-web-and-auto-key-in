import React, { useState, useEffect } from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, CircularProgress, Alert, Collapse, IconButton, Chip } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const getComponentSyncStatus = (name, syncData) => {
    if (!syncData) return null;
    const desc = name.toUpperCase();

    let key = null;
    if (desc.includes('JABATAN')) key = 'jabatan';
    else if (desc.includes('BERAS')) key = 'beras';
    else if (desc.includes('MASA KERJA')) key = 'masaKerja';
    else if (desc.includes('OT JAM') || desc.includes('LEMBUR')) key = 'lembur';
    else if (desc.includes('PREMI') && !desc.includes('PPH')) key = 'premi';
    else if (desc.includes('PPH') && !desc.includes('PREMI')) key = 'pph21';
    else if (desc.includes('BPJS') && desc.includes('KESEHATAN')) key = 'bpjsKes';
    else if ((desc.includes('BPJS') && (desc.includes('TK') || desc.includes('PENSIUN'))) ||
        desc.includes('JHT') || desc.includes('JAMINAN PENSIUN')) key = 'bpjsPen';
    else if (desc.includes('SPSI')) key = 'spsi';

    if (key && syncData[key]) {
        if (['lembur', 'beras', 'bpjsKes', 'bpjsPen'].includes(key)) {
            return 'Ignored';
        }
        const diff = Math.abs((syncData[key].venus || 0) - (syncData[key].millware || 0));
        return diff <= 10 ? 'Match' : 'Mismatch';
    }
    return null;
};

const Row = ({ row, index }) => {
    const [open, setOpen] = useState(false);
    const isEven = index % 2 === 0;

    return (
        <React.Fragment>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' }, bgcolor: isEven ? '#fff' : '#fafbfc' }}>
                <TableCell>
                    <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{row.name}<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{row.id}</span></TableCell>
                <TableCell sx={{ fontSize: '0.75rem', maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>{row.chargeJob}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{formatCurrency(row.gajiPokok)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#16a34a' }}>+ {formatCurrency(row.tunjanganTotal)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#dc2626' }}>- {formatCurrency(Math.abs(row.potonganTotal))}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0369a1' }}>{formatCurrency(row.upahBersih)}</TableCell>
                <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                    {!row.millware ? (
                        <Chip label="No Data" size="small" sx={{ bgcolor: '#e5e7eb', color: '#4b5563', height: 20, fontSize: '0.65rem' }} />
                    ) : row.sync?.isSynced ? (
                        <Chip label="Synced" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', height: 20, fontSize: '0.65rem' }} />
                    ) : (
                        <Chip label="Mismatch" size="small" sx={{ bgcolor: '#fee2e2', color: '#e11d48', height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
                    )}
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <Box sx={{ display: 'flex', gap: 4 }}>
                                {/* Tunjangan Details */}
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="subtitle2" gutterBottom component="div" sx={{ color: '#16a34a', fontWeight: 'bold' }}>
                                        Detail Tunjangan
                                    </Typography>
                                    <Table size="small" aria-label="tunjangan">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold' }}>Komponen</TableCell>
                                                <TableCell align="center" sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold' }}>Sync</TableCell>
                                                <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold' }}>Jumlah</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {row.tunjanganDetails.map((detail, i) => {
                                                const syncStatus = getComponentSyncStatus(detail.name, row.sync);
                                                return (
                                                    <TableRow key={i}>
                                                        <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>{detail.name} {!detail.isTHP && <span style={{ color: '#9ca3af', fontSize: '0.6rem' }}>(Non-THP)</span>}</TableCell>
                                                        <TableCell align="center" sx={{ py: 0.5 }}>
                                                            {syncStatus === 'Match' && <Chip label="Match" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#dcfce7', color: '#166534' }} />}
                                                            {syncStatus === 'Mismatch' && <Chip label="Mismatch" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#fee2e2', color: '#e11d48' }} />}
                                                            {syncStatus === 'Ignored' && <Chip label="Ignored" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#f3f4f6', color: '#6b7280' }} />}
                                                            {!syncStatus && <Typography variant="caption" color="text.secondary">-</Typography>}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem' }}>{formatCurrency(detail.amount)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </Box>

                                {/* Potongan Details */}
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="subtitle2" gutterBottom component="div" sx={{ color: '#dc2626', fontWeight: 'bold' }}>
                                        Detail Potongan
                                    </Typography>
                                    <Table size="small" aria-label="potongan">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold' }}>Komponen</TableCell>
                                                <TableCell align="center" sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold' }}>Sync</TableCell>
                                                <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold' }}>Jumlah</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {row.potonganDetails.map((detail, i) => {
                                                const syncStatus = getComponentSyncStatus(detail.name, row.sync);
                                                return (
                                                    <TableRow key={i}>
                                                        <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>{detail.name} {!detail.isTHP && <span style={{ color: '#9ca3af', fontSize: '0.6rem' }}>(Non-THP)</span>}</TableCell>
                                                        <TableCell align="center" sx={{ py: 0.5 }}>
                                                            {syncStatus === 'Match' && <Chip label="Match" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#dcfce7', color: '#166534' }} />}
                                                            {syncStatus === 'Mismatch' && <Chip label="Mismatch" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#fee2e2', color: '#e11d48' }} />}
                                                            {syncStatus === 'Ignored' && <Chip label="Ignored" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#f3f4f6', color: '#6b7280' }} />}
                                                            {!syncStatus && <Typography variant="caption" color="text.secondary">-</Typography>}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem' }}>{formatCurrency(detail.amount)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </Box>
                            </Box> {/* Close the inner flex row box */}

                            {/* Millware Comparison */}
                            {row.millware && row.sync && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom component="div" sx={{ color: '#4b5563', fontWeight: 'bold' }}>
                                        Komparasi Kategori (Venus vs Millware)
                                    </Typography>
                                    <Table size="small" aria-label="komparasi" sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
                                        <TableHead sx={{ bgcolor: '#f9fafb' }}>
                                            <TableRow>
                                                <TableCell sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold', width: '30%' }}>Kategori Komponen</TableCell>
                                                <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold', width: '20%' }}>Venus (Total)</TableCell>
                                                <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold', width: '20%' }}>Millware (PR_ADTRANS)</TableCell>
                                                <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 'bold', width: '20%' }}>Selisih</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {[
                                                { label: 'Tunjangan Lembur', key: 'lembur' },
                                                { label: 'Tunjangan Jabatan', key: 'jabatan' },
                                                { label: 'Tunjangan Beras', key: 'beras' },
                                                { label: 'Tunjangan Masa Kerja', key: 'masaKerja' },
                                                { label: 'Total Premi', key: 'premi' },
                                                { label: 'Potongan PPh 21', key: 'pph21' },
                                                { label: 'Potongan BPJS Kesehatan', key: 'bpjsKes' },
                                                { label: 'Potongan BPJS Pensiun/JHT', key: 'bpjsPen' },
                                                { label: 'Potongan SPSI', key: 'spsi' }
                                            ].map(cat => {
                                                const v = row.sync[cat.key]?.venus || 0;
                                                const m = row.sync[cat.key]?.millware || 0;
                                                const diff = Math.abs(v - m);
                                                const hasData = v !== 0 || m !== 0;

                                                if (!hasData) return null;
                                                const isIgnored = ['lembur', 'beras', 'bpjsKes', 'bpjsPen'].includes(cat.key);

                                                return (
                                                    <TableRow key={cat.key}>
                                                        <TableCell sx={{ py: 0.5, fontSize: '0.75rem' }}>{cat.label} {isIgnored && <span style={{ color: '#9ca3af', fontSize: '0.6rem' }}>(Ignored)</span>}</TableCell>
                                                        <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem', color: '#16a34a' }}>{formatCurrency(v)}</TableCell>
                                                        <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem', color: '#0284c7' }}>{formatCurrency(m)}</TableCell>
                                                        <TableCell align="right" sx={{ py: 0.5, fontSize: '0.75rem', color: (diff > 10 && !isIgnored) ? '#dc2626' : '#9ca3af', fontWeight: (diff > 10 && !isIgnored) ? 'bold' : 'normal' }}>
                                                            {formatCurrency(diff)}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </Box>
                            )}
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

const PayrollReport = ({ month, year }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPayroll = async () => {
            if (!month || !year) return;
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/payroll?month=${month}&year=${year}`);
                const result = await response.json();
                if (result.success) {
                    setData(result.data);
                } else {
                    setError(result.error);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPayroll();
    }, [month, year]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 2 }}>
                <Alert severity="error">Gagal memuat data payroll: {error}</Alert>
            </Box>
        );
    }

    if (!data || data.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Typography color="text.secondary">Tidak ada data payroll untuk periode ini</Typography>
            </Box>
        );
    }

    return (
        <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden' }}>
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto' }}>
                <Table stickyHeader size="small" sx={{ minWidth: 800 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: 40, bgcolor: '#f9fafb', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }} />
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f9fafb', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }}>NAMA / VENUS ID</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f9fafb', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }}>CHARGE JOB</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f9fafb', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }}>GAJI POKOK</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f9fafb', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }}>TUNJANGAN</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f9fafb', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }}>POTONGAN</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f0f9ff', color: '#0369a1', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }}>UPAH BERSIH</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, bgcolor: '#f9fafb', boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)' }}>MILLWARE SYNC</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((row, idx) => (
                            <Row key={row.id} row={row} index={idx} />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default PayrollReport;
