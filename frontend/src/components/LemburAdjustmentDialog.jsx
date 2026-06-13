import React, { useState, useRef, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
    Box, Chip, CircularProgress, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper
} from '@mui/material';
import PlayIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTimeFilled';
import { alpha } from '@mui/material/styles';

const DARK = {
    bg: '#0F172A', surface: '#1E293B', card: '#283548',
    border: '#334155', text: '#CBD5E1', muted: '#64748B',
    accent: '#3B82F6', green: '#10B981', red: '#EF4444',
    amber: '#F59E0B', orange: '#F97316',
};

const formatAmount = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;

const LemburAdjustmentDialog = ({
    open, onClose,
    month, year,
    payrollSource = { source: 'live', snapshotId: null }
}) => {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('idle');
    const [previewData, setPreviewData] = useState(null);
    const [fetchingPreview, setFetchingPreview] = useState(false);
    const [runMode, setRunMode] = useState('dry-run');
    const [browserMode, setBrowserMode] = useState('headful');
    const [workerCount, setWorkerCount] = useState(4);
    const logEndRef = useRef(null);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        if (open) {
            setLogs([]);
            setStatus('idle');
            setPreviewData(null);
            setRunMode('dry-run');
            setBrowserMode('headful');
            setWorkerCount(4);
            handleFetchPreview();
        }
    }, [open, month, year, payrollSource?.source, payrollSource?.snapshotId]);

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, []);

    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    const addLog = (type, message) => setLogs(prev => {
        const newLog = { type, message, time: new Date().toLocaleTimeString() };
        return [...prev, newLog].slice(-500);
    });

    const handleFetchPreview = async () => {
        if (!month || !year) {
            addLog('warn', 'Pilih bulan dan tahun terlebih dahulu');
            return;
        }

        setFetchingPreview(true);
        addLog('info', `Mengambil data adjustment lembur untuk ${month}/${year}...`);
        addLog('info', '⚡ MEMAKSAKAN DATA LIVE (MINUS_OVT dieksklusi dari Venus total)');

        try {
            const res = await fetch('/api/payroll/lembur-adjustment/prepare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month, year, ...payrollSource })
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Gagal mengambil data');
            }

            setPreviewData(data);
            addLog('info', `Ditemukan ${data.summary.totalEmployees} karyawan dengan selisih lembur`);

            if (data.employees && data.employees.length > 0) {
                data.employees.slice(0, 5).forEach(emp => {
                    const comp = emp.component || {};
                    addLog('info', `  - ${emp.name} (${emp.ptrjId}): Venus=${formatAmount(comp.venusAmount)}, MW=${formatAmount(comp.millwareAmount)}, Input=${formatAmount(comp.inputAmount)}`);
                });
                if (data.employees.length > 5) {
                    addLog('info', `  ... dan ${data.employees.length - 5} employee(s) lainnya`);
                }
            }

            if (data.summary.totalEmployees === 0) {
                addLog('info', 'Tidak ada adjustment lembur. Semua sudah cocok atau Millware lebih besar.');
            }
        } catch (e) {
            addLog('error', `Error: ${e.message}`);
        } finally {
            setFetchingPreview(false);
        }
    };

    const handleRun = async () => {
        setLogs([]);
        setStatus('running');

        addLog('info', `LEMBUR ADJUSTMENT: ${month}/${year}`);
        addLog('info', `Mode: ${runMode === 'dry-run' ? 'DRY RUN (cek saja)' : 'EXECUTE (input sebenarnya)'}`);
        addLog('info', `Browser: ${browserMode === 'headful' ? 'Tampil' : 'Headless'}`);
        addLog('info', `Tab paralel: ${workerCount} (1 baris per worker)`);
        addLog('info', '----------------------------------------');

        if (!previewData || previewData.summary.totalEmployees === 0) {
            addLog('warn', 'Tidak ada data adjustment lembur untuk diproses');
            setStatus('completed');
            return;
        }

        try {
            const controller = new AbortController();
            abortControllerRef.current = controller;

            const response = await fetch('/api/payroll/lembur-adjustment/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    month,
                    year,
                    ...payrollSource,
                    dryRun: runMode === 'dry-run',
                    headless: browserMode === 'headless',
                    workerCount
                })
            });

            if (!response.ok) {
                const text = await response.text();
                let message = text;
                try { message = JSON.parse(text).error || text; } catch (_) { /* keep text */ }
                addLog('error', message || 'Gagal memulai');
                setStatus('failed');
                return;
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/event-stream')) {
                const data = await response.json();
                addLog('info', data.message || 'Dry-run selesai');
                setStatus('preview');
                return;
            }

            if (!response.body) {
                addLog('error', 'Response stream tidak tersedia.');
                setStatus('failed');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            const handleLine = (line) => {
                if (!line.startsWith('data: ')) return;
                try {
                    const msg = JSON.parse(line.slice(6));
                    const payload = typeof msg.data === 'object' && msg.data !== null ? (msg.data.message || JSON.stringify(msg.data)) : msg.data;
                    if (msg.type === 'log' || msg.type === 'info') addLog('info', payload);
                    else if (msg.type === 'error') addLog('error', msg.data);
                    else if (msg.type === 'complete') {
                        const exitCode = msg.data?.code ?? 0;
                        if (exitCode === 0) {
                            addLog('info', `Selesai: ${msg.data?.employees || 0} karyawan diproses`);
                            setStatus('completed');
                        } else {
                            addLog('error', `Runner berhenti dengan exit code ${exitCode}`);
                            setStatus('failed');
                        }
                    }
                } catch (_) { /* ignore parse errors */ }
            };

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split(/\r?\n/);
                    buffer = lines.pop() || '';
                    lines.forEach(handleLine);
                }
                buffer += decoder.decode();
                if (buffer.trim()) buffer.split(/\r?\n/).forEach(handleLine);
            } catch (e) {
                if (e.name !== 'AbortError') throw e;
                addLog('info', 'Stream ditutup');
            } finally {
                abortControllerRef.current = null;
            }
        } catch (e) {
            addLog('error', `Error: ${e.message}`);
            setStatus('failed');
        }
    };

    const handleStop = async () => {
        try {
            await fetch('/api/payroll/automation/stop', { method: 'POST' });
            addLog('info', 'Menghentikan...');
            setStatus('stopped');
        } catch (e) {
            addLog('error', `Gagal stop: ${e.message}`);
        }
    };

    const STATUS_COLORS = { idle: DARK.muted, running: DARK.orange, completed: DARK.green, failed: DARK.red, stopped: DARK.amber, preview: DARK.accent };
    const STATUS_LABELS = { idle: 'READY', running: 'RUNNING', completed: 'COMPLETED', failed: 'FAILED', stopped: 'STOPPED', preview: 'PREVIEW' };

    const totalEmployees = previewData?.summary?.totalEmployees || 0;
    const totalSelisih = previewData?.employees?.reduce((sum, emp) => sum + (emp.component?.inputAmount || 0), 0) || 0;

    return (
        <Dialog
            open={open}
            onClose={status === 'running' ? undefined : onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { minHeight: '80vh', bgcolor: DARK.bg, color: DARK.text, border: `1px solid ${DARK.border}`, borderRadius: 3 } }}
        >
            <DialogTitle sx={{ borderBottom: `1px solid ${DARK.border}`, display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: alpha(DARK.orange, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AccessTimeIcon sx={{ color: DARK.orange, fontSize: 20 }} />
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Adjustment Selisih Lembur</Typography>
                    <Typography variant="caption" sx={{ color: DARK.muted }}>Millware AD Lists - AL0019 TUNJANGAN LEMBUR</Typography>
                </Box>
                <Chip label={STATUS_LABELS[status]} size="small" sx={{ fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.08em', bgcolor: alpha(STATUS_COLORS[status], 0.15), color: STATUS_COLORS[status], border: `1px solid ${alpha(STATUS_COLORS[status], 0.4)}` }} />
            </DialogTitle>

            <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(DARK.orange, 0.08), borderBottom: `1px solid ${alpha(DARK.orange, 0.2)}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTimeIcon sx={{ fontSize: 16, color: DARK.orange }} />
                <Typography variant="caption" sx={{ color: DARK.orange, fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                    DATA LIVE | MINUS_OVT EXCLUDED | Standard/Workshop/Vehicle Lembur Types
                </Typography>
            </Box>

            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 2.5, bgcolor: DARK.surface, borderBottom: `1px solid ${DARK.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                        {month && year && (
                            <Chip label={`Bulan: ${month}/${year}`} size="small" sx={{ bgcolor: alpha(DARK.accent, 0.15), color: DARK.accent, fontWeight: 700, fontSize: '0.75rem' }} />
                        )}
                        <Chip label={`${totalEmployees} Karyawan`} size="small" sx={{ bgcolor: alpha(DARK.green, 0.15), color: DARK.green, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={`Total Selisih: ${formatAmount(totalSelisih)}`} size="small" sx={{ bgcolor: alpha(DARK.amber, 0.15), color: DARK.amber, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={runMode === 'dry-run' ? 'Cek saja' : 'Input Data'} size="small" sx={{ bgcolor: alpha(runMode === 'dry-run' ? DARK.accent : DARK.green, 0.15), color: runMode === 'dry-run' ? DARK.accent : DARK.green, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={`${workerCount} Tab`} size="small" sx={{ bgcolor: alpha(DARK.orange, 0.15), color: DARK.orange, fontWeight: 700, fontSize: '0.75rem' }} />
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem' }}>AKSI:</Typography>
                            <Button variant={runMode === 'dry-run' ? 'contained' : 'outlined'} size="small" onClick={() => setRunMode('dry-run')} sx={{ bgcolor: runMode === 'dry-run' ? DARK.accent : 'transparent', color: runMode === 'dry-run' ? '#fff' : DARK.accent, borderColor: DARK.accent, fontSize: '0.7rem' }}>Cek Saja</Button>
                            <Button variant={runMode === 'execute' ? 'contained' : 'outlined'} size="small" onClick={() => setRunMode('execute')} sx={{ bgcolor: runMode === 'execute' ? DARK.green : 'transparent', color: runMode === 'execute' ? '#fff' : DARK.green, borderColor: DARK.green, fontSize: '0.7rem' }}>Input Data</Button>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem' }}>BROWSER:</Typography>
                            <Button variant={browserMode === 'headful' ? 'contained' : 'outlined'} size="small" onClick={() => setBrowserMode('headful')} sx={{ bgcolor: browserMode === 'headful' ? DARK.amber : 'transparent', color: browserMode === 'headful' ? '#fff' : DARK.amber, borderColor: DARK.amber, fontSize: '0.7rem' }}>Tampil</Button>
                            <Button variant={browserMode === 'headless' ? 'contained' : 'outlined'} size="small" onClick={() => setBrowserMode('headless')} sx={{ bgcolor: browserMode === 'headless' ? DARK.muted : 'transparent', color: browserMode === 'headless' ? '#fff' : DARK.muted, borderColor: DARK.muted, fontSize: '0.7rem' }}>Headless</Button>
                        </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="caption" sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem' }}>TAB PARALEL:</Typography>
                        {[4, 5, 6, 8].map(count => (
                            <Button
                                key={count}
                                variant={workerCount === count ? 'contained' : 'outlined'}
                                size="small"
                                onClick={() => setWorkerCount(count)}
                                sx={{ bgcolor: workerCount === count ? DARK.orange : 'transparent', color: workerCount === count ? '#fff' : DARK.orange, borderColor: DARK.orange, fontSize: '0.7rem', minWidth: 42 }}
                            >
                                {count}
                            </Button>
                        ))}
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button size="small" startIcon={fetchingPreview ? <CircularProgress size={12} color="inherit" /> : <RefreshIcon sx={{ fontSize: 13 }} />} onClick={handleFetchPreview} disabled={fetchingPreview || status === 'running'} sx={{ color: DARK.accent, fontSize: '0.7rem' }}>
                            Refresh Data
                        </Button>
                    </Box>

                    {previewData && previewData.employees && previewData.employees.length > 0 && (
                        <TableContainer component={Paper} sx={{ bgcolor: DARK.card, maxHeight: 250 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: DARK.surface }}>
                                        <TableCell sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem', borderColor: DARK.border }}>No</TableCell>
                                        <TableCell sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem', borderColor: DARK.border }}>Nama</TableCell>
                                        <TableCell sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem', borderColor: DARK.border }}>PTRJ ID</TableCell>
                                        <TableCell sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem', borderColor: DARK.border }}>Type</TableCell>
                                        <TableCell sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem', borderColor: DARK.border, textAlign: 'right' }}>Venus</TableCell>
                                        <TableCell sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem', borderColor: DARK.border, textAlign: 'right' }}>Millware</TableCell>
                                        <TableCell sx={{ color: DARK.amber, fontWeight: 700, fontSize: '0.7rem', borderColor: DARK.border, textAlign: 'right' }}>SELISIH</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {previewData.employees.map((emp, idx) => {
                                        const comp = emp.component || {};
                                        const lemburType = emp.lemburType || 'standard';
                                        const typeLabel = lemburType === 'workshop_control_account' ? 'WORKSHOP' : lemburType === 'vehicle_running' ? 'VEHICLE' : 'STANDARD';
                                        const typeColor = lemburType === 'workshop_control_account' ? DARK.green : lemburType === 'vehicle_running' ? DARK.orange : DARK.muted;
                                        return (
                                            <TableRow key={emp.ptrjId} sx={{ '&:hover': { bgcolor: alpha(DARK.accent, 0.1) } }}>
                                                <TableCell sx={{ color: DARK.text, fontSize: '0.75rem', borderColor: DARK.border }}>{idx + 1}</TableCell>
                                                <TableCell sx={{ color: DARK.text, fontSize: '0.75rem', borderColor: DARK.border }}>{emp.name}</TableCell>
                                                <TableCell sx={{ color: DARK.accent, fontSize: '0.75rem', borderColor: DARK.border, fontFamily: 'monospace' }}>{emp.ptrjId}</TableCell>
                                                <TableCell sx={{ color: typeColor, fontSize: '0.65rem', borderColor: DARK.border, fontWeight: 700 }}>{typeLabel}</TableCell>
                                                <TableCell sx={{ color: DARK.text, fontSize: '0.75rem', borderColor: DARK.border, textAlign: 'right' }}>{formatAmount(comp.venusAmount)}</TableCell>
                                                <TableCell sx={{ color: DARK.muted, fontSize: '0.75rem', borderColor: DARK.border, textAlign: 'right' }}>{formatAmount(comp.millwareAmount)}</TableCell>
                                                <TableCell sx={{ color: DARK.amber, fontWeight: 700, fontSize: '0.75rem', borderColor: DARK.border, textAlign: 'right' }}>{formatAmount(comp.inputAmount)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {previewData && previewData.summary.totalEmployees === 0 && (
                        <Box sx={{ p: 3, textAlign: 'center', bgcolor: alpha(DARK.green, 0.1), borderRadius: 2, border: `1px solid ${alpha(DARK.green, 0.2)}` }}>
                            <AccessTimeIcon sx={{ fontSize: 40, color: DARK.green, mb: 1 }} />
                            <Typography sx={{ color: DARK.green, fontWeight: 700 }}>Tidak ada adjustment lembur</Typography>
                            <Typography variant="caption" sx={{ color: DARK.muted }}>Tidak ada karyawan yang perlu diinputkan</Typography>
                        </Box>
                    )}
                </Box>

                <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto', maxHeight: 250 }}>
                    {logs.length === 0 && status === 'idle' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, gap: 1 }}>
                            <AccessTimeIcon sx={{ fontSize: 40, color: alpha(DARK.muted, 0.5) }} />
                            <Typography sx={{ color: DARK.muted, textAlign: 'center', fontSize: '0.875rem' }}>
                                Klik "Cek Saja" atau "Input Data" untuk memulai
                            </Typography>
                        </Box>
                    )}
                    {logs.map((log, i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 0.4, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            <Typography component="span" sx={{ color: alpha(DARK.muted, 0.6), minWidth: 70, fontSize: '0.72rem', mt: '1px' }}>{log.time}</Typography>
                            <Typography component="span" sx={{ color: log.type === 'error' ? DARK.red : (log.type === 'info' ? DARK.accent : log.type === 'warn' ? DARK.amber : DARK.text) }}>
                                {log.message}
                            </Typography>
                        </Box>
                    ))}
                    <div ref={logEndRef} />
                </Box>
            </DialogContent>

            <DialogActions sx={{ borderTop: `1px solid ${DARK.border}`, p: 2, bgcolor: DARK.surface }}>
                <Button onClick={onClose} disabled={status === 'running'} sx={{ color: DARK.muted }}>Tutup</Button>
                <Box sx={{ flexGrow: 1 }} />
                {status === 'running' ? (
                    <Button variant="contained" color="error" size="small" startIcon={<StopIcon />} onClick={handleStop}>Stop</Button>
                ) : (
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<PlayIcon />}
                        onClick={handleRun}
                        disabled={fetchingPreview || !previewData || previewData.summary.totalEmployees === 0}
                        sx={{ bgcolor: runMode === 'execute' ? DARK.green : DARK.accent, '&:hover': { bgcolor: runMode === 'execute' ? '#059669' : '#2563EB' } }}
                    >
                        {runMode === 'dry-run' ? 'Cek Saja' : 'Input Adjustment Lembur'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default LemburAdjustmentDialog;
