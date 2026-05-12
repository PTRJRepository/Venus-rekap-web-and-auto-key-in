import React, { useState, useRef, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
    Box, Radio, RadioGroup, FormControl, FormLabel, TextField, Chip,
    FormControlLabel, CircularProgress, Alert, Divider
} from '@mui/material';
import PlayIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';
import { alpha } from '@mui/material/styles';

const DARK = {
    bg: '#0F172A', surface: '#1E293B', card: '#283548',
    border: '#334155', text: '#CBD5E1', muted: '#64748B',
    accent: '#3B82F6', green: '#10B981', red: '#EF4444',
    amber: '#F59E0B', orange: '#F97316',
};

const OTResetDialog = ({
    open, onClose,
    docIds = [],          // available DocIds from Millware
    selectedEmployees = [], // currently selected employees in app
    allEmployees = [],     // ALL employees in the current month (for selection)
    month, year,
    onRefresh
}) => {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('idle'); // idle|running|completed|failed|stopped
    const [category, setCategory] = useState('OT'); // OT | Normal | all
    const [scope, setScope] = useState('all');      // all | selected | docids
    const [runMode, setRunMode] = useState('dry-run'); // dry-run | delete
    const [browserMode, setBrowserMode] = useState('headful'); // headful | headless
    const [docLimit, setDocLimit] = useState('');
    const [maxPages, setMaxPages] = useState('50');
    const [tabCount, setTabCount] = useState('1');
    const [manualDocIds, setManualDocIds] = useState(''); // manual input
    const [selectedEmpIds, setSelectedEmpIds] = useState([]); // chosen employee IDs
    const [fetchingDocIds, setFetchingDocIds] = useState(false);
    const [docIdFetchError, setDocIdFetchError] = useState('');
    const [displayDocIds, setDisplayDocIds] = useState([]); // shown in chip list
    const logEndRef = useRef(null);
    const abortControllerRef = useRef(null);

    const getEmpKey = (emp) => String(emp?.id || emp?.ptrjEmployeeID || emp?.PTRJEmployeeID || emp?.empCode || '').trim();
    const getEmpCode = (emp) => String(emp?.empCode || emp?.ptrjEmployeeID || emp?.PTRJEmployeeID || emp?.ptrjId || '').trim();
    const parseManualDocIds = () => manualDocIds
        .split(/[,\n\s]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // Reset state on open/close
    useEffect(() => {
        if (open) {
            setLogs([]);
            setStatus('idle');
            setManualDocIds('');
            setSelectedEmpIds((selectedEmployees || []).map(getEmpKey).filter(Boolean));
            setDocIdFetchError('');
            // Pre-fill docIds from Millware if available
            setDisplayDocIds(docIds.length > 0 ? docIds : []);
        } else {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        }
    }, [open]);

    // Auto-scroll logs
    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    // Auto-refresh after completion
    useEffect(() => {
        if (status === 'completed' && onRefresh) {
            addLog('info', 'Memuat ulang data...');
            onRefresh();
        }
    }, [status, onRefresh]);

    const addLog = (type, message) => setLogs(prev => {
        const newLog = { type, message, time: new Date().toLocaleTimeString() };
        return [...prev, newLog].slice(-500); // keep last 500
    });

    // Fetch DocIds from Millware DB (with optional emp filter)
    const handleFetchDocIds = async () => {
        if (scope === 'all') {
            addLog('info', 'Mode Semua tidak query DocID. Runner akan membaca DocID dari halaman Task Register List.');
            setDisplayDocIds([]);
            setManualDocIds('');
            return;
        }
        if (scope === 'selected' && selectedEmpIds.length === 0) {
            setDocIdFetchError('Pilih minimal satu karyawan.');
            return;
        }

        setFetchingDocIds(true);
        setDocIdFetchError('');
        try {
            // Build empCodes param from selected employees
            const params = new URLSearchParams({ month, year, category });
            const parsedLimit = Math.max(0, parseInt(docLimit || '0', 10) || 0);
            if (parsedLimit > 0) params.set('limit', String(parsedLimit));
            if (scope === 'selected' && selectedEmpIds.length > 0) {
                // Get PTRJ IDs from allEmployees for selected ids
                const empCodes = allEmployees
                    .filter(e => selectedEmpIds.includes(getEmpKey(e)))
                    .map(getEmpCode)
                    .filter(Boolean);
                if (empCodes.length === 0) {
                    setDocIdFetchError('Karyawan dipilih tidak punya PTRJ Employee ID valid.');
                    return;
                }
                if (empCodes.length > 0) params.set('empCodes', empCodes.join(','));
            }
            const res = await fetch(`/api/task-register/doc-ids?${params}`);
            const data = await res.json();
            if (data.docIds && data.docIds.length > 0) {
                setDisplayDocIds(data.docIds);
                setManualDocIds(data.docIds.join(', '));
                addLog('info', `Ditemukan ${data.docIds.length} DocIds dari Millware (${scope === 'selected' ? selectedEmpIds.length + ' karyawan' : 'semua'})`);
            } else {
                setDocIdFetchError('Tidak ada DocIds ditemukan. Masukkan secara manual.');
                addLog('error', 'Millware tidak mengembalikan DocIds');
            }
        } catch (e) {
            setDocIdFetchError(`Gagal mengambil DocIds: ${e.message}`);
            addLog('error', `Error: ${e.message}`);
        } finally {
            setFetchingDocIds(false);
        }
    };

    // Employee chip toggle (uses ptrjEmployeeID for DB filtering)
    const toggleEmp = (id) => {
        setSelectedEmpIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };
    const selectAllEmps = () => {
        if (selectedEmpIds.length === allEmployees.length) setSelectedEmpIds([]);
        else setSelectedEmpIds(allEmployees.map(getEmpKey).filter(Boolean));
    };

    // Get DocIds to process
    const getDocIds = () => {
        if (scope === 'docids') {
            return parseManualDocIds();
        }
        if (scope === 'selected') return displayDocIds;
        return [];
    };

    const handleRun = async () => {
        setLogs([]);
        setStatus('running');

        const docIdsToProcess = getDocIds();
        const categoryValue = category;
        const parsedLimit = Math.max(0, parseInt(docLimit || '0', 10) || 0);
        const parsedMaxPages = Math.max(1, parseInt(maxPages || '50', 10) || 50);
        const parsedTabCount = Math.max(1, Math.min(10, parseInt(tabCount || '1', 10) || 1));

        if (scope === 'docids' && docIdsToProcess.length === 0) {
            addLog('error', 'Tidak ada DocID manual.');
            setStatus('failed');
            return;
        }

        // Get employee objects
        const empObjects = (scope === 'selected' ? allEmployees.filter(e => selectedEmpIds.includes(getEmpKey(e))) : []);
        if (scope === 'selected' && empObjects.length === 0) {
            addLog('error', 'Pilih minimal satu karyawan.');
            setStatus('failed');
            return;
        }

        addLog('info', `OT Reset: mode=${scope}, run=${runMode}, docIds=${docIdsToProcess.length}, kategori=${categoryValue}`);
        if (scope === 'selected') {
            addLog('info', `Karyawan: ${empObjects.length} dipilih`);
        } else if (scope === 'all') {
            addLog('info', 'Semua karyawan + semua DocID: runner baca Task Register List, catat DocID, bagi per tab, lalu buka via pencarian.');
        } else {
            addLog('info', `DocID manual: ${docIdsToProcess.length}`);
        }

        try {
            const controller = new AbortController();
            abortControllerRef.current = controller;

            const response = await fetch('/api/ot-reset/automation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    docIds: scope === 'all' ? [] : docIdsToProcess,
                    employees: empObjects,
                    category: categoryValue,
                    targetMode: scope,
                    dryRun: runMode === 'dry-run',
                    headless: browserMode === 'headless',
                    limit: scope === 'all' ? parsedLimit : 0,
                    maxPages: parsedMaxPages,
                    tabCount: parsedTabCount,
                    month, year
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
                    else if (msg.type === 'status') {
                        if (msg.data === 'completed') setStatus('completed');
                        if (msg.data === 'failed') setStatus('failed');
                    } else if (msg.type === 'done') {
                        addLog('info', `Selesai (exit code: ${msg.data?.code})`);
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
                addLog('info', 'Stream ditutup (dialog ditutup)');
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
            await fetch('/api/ot-reset/automation/stop', { method: 'POST' });
            addLog('info', 'Menghentikan...');
            setStatus('stopped');
        } catch (e) {
            addLog('error', `Gagal stop: ${e.message}`);
        }
    };

    const STATUS_COLORS = { idle: DARK.muted, running: DARK.orange, completed: DARK.green, failed: DARK.red, stopped: DARK.amber };
    const STATUS_LABELS = { idle: 'READY', running: 'RUNNING', completed: 'COMPLETED', failed: 'FAILED', stopped: 'STOPPED' };

    const docIdsToProcess = getDocIds();
    const empObjects = scope === 'selected' ? allEmployees.filter(e => selectedEmpIds.includes(getEmpKey(e))) : [];
    const runDisabled = status === 'running'
        || (scope === 'docids' && docIdsToProcess.length === 0)
        || (scope === 'selected' && selectedEmpIds.length === 0)
        || !maxPages
        || (parseInt(maxPages, 10) || 0) < 1
        || !tabCount
        || (parseInt(tabCount, 10) || 0) < 1;

    return (
        <Dialog
            open={open}
            onClose={status === 'running' ? undefined : onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { minHeight: '80vh', bgcolor: DARK.bg, color: DARK.text, border: `1px solid ${DARK.border}`, borderRadius: 3 } }}
        >
            {/* Header */}
            <DialogTitle sx={{ borderBottom: `1px solid ${DARK.border}`, display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: alpha(DARK.red, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <DeleteIcon sx={{ color: DARK.red, fontSize: 20 }} />
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Hapus Record OT / Normal</Typography>
                    <Typography variant="caption" sx={{ color: DARK.muted }}>Task Register — Millware PR System</Typography>
                </Box>
                <Chip label={STATUS_LABELS[status]} size="small" sx={{ fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.08em', bgcolor: alpha(STATUS_COLORS[status], 0.15), color: STATUS_COLORS[status], border: `1px solid ${alpha(STATUS_COLORS[status], 0.4)}` }} />
            </DialogTitle>

            {/* Warning */}
            <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(DARK.amber, 0.08), borderBottom: `1px solid ${alpha(DARK.amber, 0.2)}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningIcon sx={{ fontSize: 16, color: DARK.amber }} />
                <Typography variant="caption" sx={{ color: DARK.amber, fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                    Record yang dihapus TIDAK dapat dikembalikan.
                </Typography>
            </Box>

            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Controls */}
                <Box sx={{ p: 2.5, bgcolor: DARK.surface, borderBottom: `1px solid ${DARK.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>

                    {/* Period + Summary chips */}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Chip label={`Bulan: ${month}/${year}`} size="small" sx={{ bgcolor: alpha(DARK.accent, 0.15), color: DARK.accent, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={scope === 'all' ? 'Semua Karyawan + Semua DocID' : `${docIdsToProcess.length} DocIds`} size="small" sx={{ bgcolor: alpha(DARK.green, 0.15), color: DARK.green, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={runMode === 'dry-run' ? 'Cek saja' : 'Hapus'} size="small" sx={{ bgcolor: alpha(runMode === 'dry-run' ? DARK.accent : DARK.red, 0.15), color: runMode === 'dry-run' ? DARK.accent : DARK.red, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={browserMode === 'headful' ? 'Browser tampil' : 'Headless'} size="small" sx={{ bgcolor: alpha(DARK.amber, 0.15), color: DARK.amber, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={`${tabCount || 1} Tab`} size="small" sx={{ bgcolor: alpha(DARK.green, 0.12), color: DARK.green, fontWeight: 700, fontSize: '0.75rem' }} />
                        {scope === 'selected' && (
                            <Chip label={`${selectedEmpIds.length} Karyawan`} size="small" sx={{ bgcolor: alpha(DARK.orange, 0.15), color: DARK.orange, fontWeight: 700, fontSize: '0.75rem' }} />
                        )}
                    </Box>

                    {/* Scope selection */}
                    <FormControl component="fieldset" size="small">
                        <FormLabel component="legend" sx={{ fontSize: '0.65rem', color: DARK.muted, mb: 0.5 }}>SCOPE</FormLabel>
                        <RadioGroup row value={scope} onChange={e => setScope(e.target.value)}>
                            <FormControlLabel value="all" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.accent } }} />} label={<Typography variant="caption" sx={{ color: DARK.text, fontWeight: 600 }}>Semua Karyawan + Semua DocID</Typography>} />
                            <FormControlLabel value="selected" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.green } }} />} label={<Typography variant="caption" sx={{ color: DARK.text, fontWeight: 600 }}>Karyawan Dipilih</Typography>} />
                            <FormControlLabel value="docids" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.amber } }} />} label={<Typography variant="caption" sx={{ color: DARK.text, fontWeight: 600 }}>DocID Manual</Typography>} />
                        </RadioGroup>
                    </FormControl>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                        <FormControl component="fieldset" size="small">
                            <FormLabel component="legend" sx={{ fontSize: '0.65rem', color: DARK.muted, mb: 0.5 }}>AKSI</FormLabel>
                            <RadioGroup row value={runMode} onChange={e => setRunMode(e.target.value)}>
                                <FormControlLabel value="dry-run" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.accent } }} />} label={<Typography variant="caption" sx={{ color: DARK.accent, fontWeight: 700 }}>Cek Saja</Typography>} />
                                <FormControlLabel value="delete" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.red } }} />} label={<Typography variant="caption" sx={{ color: DARK.red, fontWeight: 700 }}>Hapus</Typography>} />
                            </RadioGroup>
                        </FormControl>

                        <FormControl component="fieldset" size="small">
                            <FormLabel component="legend" sx={{ fontSize: '0.65rem', color: DARK.muted, mb: 0.5 }}>BROWSER</FormLabel>
                            <RadioGroup row value={browserMode} onChange={e => setBrowserMode(e.target.value)}>
                                <FormControlLabel value="headful" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.amber } }} />} label={<Typography variant="caption" sx={{ color: DARK.amber, fontWeight: 700 }}>Tampil</Typography>} />
                                <FormControlLabel value="headless" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.muted } }} />} label={<Typography variant="caption" sx={{ color: DARK.text, fontWeight: 600 }}>Headless</Typography>} />
                            </RadioGroup>
                        </FormControl>
                    </Box>

                    {/* Category */}
                    <FormControl component="fieldset" size="small">
                        <FormLabel component="legend" sx={{ fontSize: '0.65rem', color: DARK.muted, mb: 0.5 }}>KATEGORI HAPUS</FormLabel>
                        <RadioGroup row value={category} onChange={e => setCategory(e.target.value)}>
                            <FormControlLabel value="OT" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.red } }} />} label={<Typography variant="caption" sx={{ color: DARK.red, fontWeight: 700 }}>OT Saja</Typography>} />
                            <FormControlLabel value="Normal" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.amber } }} />} label={<Typography variant="caption" sx={{ color: DARK.amber, fontWeight: 700 }}>Normal Saja</Typography>} />
                            <FormControlLabel value="all" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.muted } }} />} label={<Typography variant="caption" sx={{ color: DARK.text, fontWeight: 600 }}>Semua</Typography>} />
                        </RadioGroup>
                    </FormControl>

                    {/* DocIds: Fetch + Input */}
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Typography variant="caption" sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem' }}>DOC IDS</Typography>
                            <Button size="small" startIcon={fetchingDocIds ? <CircularProgress size={10} color="inherit" /> : <RefreshIcon sx={{ fontSize: 13 }} />}
                                onClick={handleFetchDocIds} disabled={fetchingDocIds || status === 'running' || scope === 'all'}
                                sx={{ color: DARK.accent, fontSize: '0.7rem', py: 0.25, px: 1 }}>
                                {fetchingDocIds ? 'Mengambil...' : 'Ambil DocID DB'}
                            </Button>
                        </Box>
                        <TextField
                            multiline minRows={2} maxRows={5}
                            fullWidth size="small"
                            placeholder={scope === 'all' ? 'Mode Semua: runner membaca semua DocID dari Task Register List, membagi per tab, lalu buka via pencarian DocID' : 'Internal ID atau DocID tampil: 34986, AD26040007'}
                            value={manualDocIds}
                            onChange={e => { setManualDocIds(e.target.value); setScope('docids'); }}
                            disabled={status === 'running' || scope === 'all'}
                            inputProps={{ style: { color: DARK.text, backgroundColor: DARK.card, borderRadius: 6, fontSize: '0.82rem', fontFamily: 'monospace' } }}
                        />
                        {docIdFetchError && (
                            <Alert severity="warning" sx={{ mt: 0.5, py: 0.25, fontSize: '0.72rem' }}>{docIdFetchError}</Alert>
                        )}
                        {displayDocIds.length > 0 && scope !== 'docids' && (
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1, maxHeight: 80, overflowY: 'auto', p: 1, bgcolor: DARK.card, borderRadius: 1 }}>
                                {displayDocIds.map(id => (
                                    <Chip key={id} label={id} size="small" sx={{ fontSize: '0.68rem', bgcolor: alpha(DARK.green, 0.1), color: DARK.green, border: `1px solid ${alpha(DARK.green, 0.3)}` }} />
                                ))}
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                        <TextField
                            label="Limit DocID"
                            type="number"
                            size="small"
                            value={docLimit}
                            onChange={e => setDocLimit(e.target.value)}
                            disabled={status === 'running' || scope !== 'all'}
                            placeholder="Kosong = semua"
                            inputProps={{ min: 0, style: { color: DARK.text } }}
                            InputLabelProps={{ sx: { color: DARK.muted } }}
                        />
                        <TextField
                            label="Maks. Page Detail"
                            type="number"
                            size="small"
                            value={maxPages}
                            onChange={e => setMaxPages(e.target.value)}
                            disabled={status === 'running'}
                            inputProps={{ min: 1, style: { color: DARK.text } }}
                            InputLabelProps={{ sx: { color: DARK.muted } }}
                        />
                        <TextField
                            label="Jumlah Tab"
                            type="number"
                            size="small"
                            value={tabCount}
                            onChange={e => setTabCount(e.target.value)}
                            disabled={status === 'running'}
                            inputProps={{ min: 1, max: 10, style: { color: DARK.text } }}
                            InputLabelProps={{ sx: { color: DARK.muted } }}
                        />
                    </Box>

                    {/* Employee selection */}
                    {scope === 'selected' && (
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Typography variant="caption" sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem' }}>PILIH KARYAWAN ({selectedEmpIds.length}/{allEmployees.length})</Typography>
                                <Button size="small" onClick={selectAllEmps} sx={{ color: DARK.accent, fontSize: '0.68rem', py: 0.25, px: 1 }}>
                                    {selectedEmpIds.length === allEmployees.length ? 'Deselect All' : 'Select All'}
                                </Button>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxHeight: 140, overflowY: 'auto', p: 1, bgcolor: DARK.card, borderRadius: 1 }}>
                                {allEmployees.map(emp => {
                                    const empKey = getEmpKey(emp);
                                    return (
                                    <Chip
                                        key={empKey} label={emp.name || empKey} clickable
                                        onClick={() => toggleEmp(empKey)}
                                        size="small"
                                        sx={{
                                            fontSize: '0.68rem',
                                            bgcolor: selectedEmpIds.includes(empKey) ? alpha(DARK.green, 0.2) : 'transparent',
                                            color: selectedEmpIds.includes(empKey) ? DARK.green : DARK.muted,
                                            border: `1px solid ${selectedEmpIds.includes(empKey) ? alpha(DARK.green, 0.5) : DARK.border}`,
                                            '&:hover': { bgcolor: alpha(DARK.green, 0.1) }
                                        }}
                                    />
                                    );
                                })}
                                {allEmployees.length === 0 && (
                                    <Typography variant="caption" sx={{ color: DARK.muted }}>Tidak ada data karyawan</Typography>
                                )}
                            </Box>
                        </Box>
                    )}
                </Box>

                {/* Logs */}
                <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto', maxHeight: 350 }}>
                    {logs.length === 0 && status === 'idle' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 1 }}>
                            <DeleteIcon sx={{ fontSize: 40, color: alpha(DARK.muted, 0.5) }} />
                            <Typography sx={{ color: DARK.muted, textAlign: 'center', fontSize: '0.875rem' }}>
                                Klik "Jalankan" untuk mulai hapus record
                            </Typography>
                        </Box>
                    )}
                    {logs.map((log, i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 0.4, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            <Typography component="span" sx={{ color: alpha(DARK.muted, 0.6), minWidth: 70, fontSize: '0.72rem', mt: '1px' }}>{log.time}</Typography>
                            <Typography component="span" sx={{ color: log.type === 'error' ? DARK.red : (log.type === 'info' ? DARK.accent : DARK.text) }}>
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
                    <Button variant="contained" size="small" startIcon={<PlayIcon />} onClick={handleRun}
                        disabled={runDisabled}
                        sx={{ bgcolor: DARK.red, '&:hover': { bgcolor: '#DC2626' } }}>
                        {runMode === 'dry-run' ? 'Cek Record' : 'Hapus Record'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default OTResetDialog;
