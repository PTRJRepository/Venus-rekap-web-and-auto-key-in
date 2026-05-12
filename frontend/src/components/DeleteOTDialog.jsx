import React, { useState, useRef, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
    Box, LinearProgress, Radio, RadioGroup, FormControl, FormLabel,
    TextField, Divider, Alert, Paper
} from '"'"'@mui/material'"'"';
import DeleteIcon from '"'"'@mui/icons-material/DeleteForever'"'"';
import StopIcon from '"'"'@mui/icons-material/Stop'"'"';
import { alpha } from '"'"'@mui/material/styles'"'"';

const DARK = {
    bg: '"'"'#0F172A'"'"',
    surface: '"'"'#1E293B'"'"',
    card: '"'"'#283548'"'"',
    border: '"'"'#334155'"'"',
    text: '"'"'#CBD5E1'"'"',
    muted: '"'"'#64748B'"'"',
    red: '"'"'#EF4444'"'"',
    amber: '"'"'#F59E0B'"'"',
    green: '"'"'#10B981'"'"',
};

const DeleteOTDialog = ({
    open,
    onClose,
    selectedEmployees,
    month,
    year,
    data,
    onDeleteComplete
}) => {
    const [scope, setScope] = useState('all_docids');
    const [docIdInput, setDocIdInput] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [status, setStatus] = useState('idle');
    const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
    const [logs, setLogs] = useState([]);
    const logEndRef = useRef(null);

    useEffect(() => {
        if (open) {
            setStatus('idle');
            setLogs([]);
            setProgress({ done: 0, total: 0, current: '' });
            // Set default date range to current month
            const y = year || new Date().getFullYear();
            const m = month || new Date().getMonth() + 1;
            setStartDate(`'"'"'${y}-${String(m).padStart(2, '"'"'0'"'"')}-01'"'"'`);
            setEndDate(`'"'"'${y}-${String(m).padStart(2, '"'"'0'"'"')}-${new Date(y, m, 0).getDate()}'"'"'`);
        }
    }, [open, month, year]);

    const addLog = (msg, type = 'info') => {
        const ts = new Date().toLocaleTimeString('"'"'id-ID'"'"'');
        setLogs(prev => [...prev, { ts, msg, type }]);
    };

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: '"'"'smooth'"'"' });
    }, [logs]);

    const buildPayload = () => {
        const docIds = scope === '"'"'specific_docids'"'"'
            ? docIdInput.split(','"'"').map(s => s.trim()).filter(Boolean)
            : [];
        const employeeIds = scope === '"'"'selected_employees'"'"'
            ? (selectedEmployees || []).map(e => e.id)
            : [];

        return {
            mode: scope,
            docIds,
            employeeIds,
            startDate: startDate || null,
            endDate: endDate || null,
            category: '"'"'ot'"'"',
            month,
            year
        };
    };

    const handleStart = async () => {
        setStatus('running');
        addLog('Memulai proses hapus OT...', '"'"'info'"'"');

        try {
            const payload = buildPayload();
            addLog(`Scope: ${scope}`, '"'"'info'"'"');
            addLog(`Tanggal: ${payload.startDate} - ${payload.endDate}`, '"'"'info'"'"');
            if (payload.docIds.length) addLog(`DocIds: ${payload.docIds.join(', ')}`, '"'"'info'"'"');
            if (payload.employeeIds.length) addLog(`Employees: ${payload.employeeIds.length} dipilih`, '"'"'info'"'"');

            const response = await fetch('"'"'/api/task-register/delete-ot'"'"', {
                method: '"'"'POST'"'"',
                headers: { '"'"'Content-Type'"'"': '"'"'application/json'"'"' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.success) {
                setProgress({ done: 0, total: result.totalDocIds || 0, current: 'Memproses...' });
                addLog('Automation started successfully', '"'"'success'"'"');
            } else {
                addLog(`Error: ${result.error || '"'"'Unknown error'"'"'}`, '"'"'error'"'"');
                setStatus('idle');
            }
        } catch (e) {
            addLog(`Gagal memulai: ${e.message}`, '"'"'error'"'"');
            setStatus('idle');
        }
    };

    const handleStop = async () => {
        setStatus('idle');
        try {
            await fetch('"'"'/api/task-register/delete-ot/stop'"'"', { method: '"'"'POST'"'"' });
            addLog('Proses dihentikan', '"'"'warning'"'"');
        } catch (e) {
            addLog(`Stop error: ${e.message}`, '"'"'error'"'"');
        }
    };

    const handleClose = () => {
        if (status === '"'"'running'"'"') {
            if (!window.confirm('Proses masih berjalan. Yakin ingin menutup?')) return;
            handleStop();
        }
        onClose();
    };

    const empCount = selectedEmployees?.length || 0;
    const docIdCount = docIdInput.split(','"'"').map(s => s.trim()).filter(Boolean).length;

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth='"'"'sm'"'"'
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: DARK.surface,
                    border: `"'"'1px solid ${DARK.border}'"'"`,
                    backgroundImage: '"'"'none'"'"'
                }
            }}
        >
            <DialogTitle sx={{ display: '"'"'flex'"'"', alignItems: '"'"'center'"'"', gap: 1.5, borderBottom: `"'"'1px solid ${DARK.border}'"'"' }}>
                <DeleteIcon sx={{ color: DARK.red }} />
                <Typography variant='"'"'h6'"'"' sx={{ fontWeight: 800, color: DARK.text }}>
                    HAPUS OT - Task Register
                </Typography>
            </DialogTitle>

            <DialogContent sx={{ pt: 2 }}>
                {/* Warning */}
                <Alert severity='"'"'error'"'"' sx={{ mb: 2 }}>
                    <strong>Tindakan ini IRREVERSIBLE.</strong> Record OT yang dihapus tidak dapat dikembalikan.
                    Pastikan sudah membackup data sebelum melanjutkan.
                </Alert>

                {/* Scope */}
                <FormControl component='"'"'fieldset'"'"' sx={{ mb: 2, width: '"'"'100%'"'"' }}>
                    <FormLabel sx={{ color: DARK.text, fontWeight: 700, mb: 0.5 }}>Scope Penghapusan</FormLabel>
                    <RadioGroup value={scope} onChange={e => setScope(e.target.value)}>
                        <FormControlLabel value='"'"'all_docids'"'"' control={<Radio size='"'"'small'"'"' sx={{ color: DARK.muted }} />} label={
                            <Typography sx={{ color: DARK.text, fontSize: '"'"'0.875rem'"'"' }}>
                                Semua DocId dalam periode {month}/{year}
                            </Typography>
                        } />
                        <FormControlLabel value='"'"'specific_docids'"'"' control={<Radio size='"'"'small'"'"' sx={{ color: DARK.muted }} />} label={
                            <Box sx={{ display: '"'"'flex'"'"', alignItems: '"'"'center'"'"', gap: 1 }}>
                                <Typography sx={{ color: DARK.text, fontSize: '"'"'0.875rem'"'"' }}>DocId tertentu:</Typography>
                                <TextField
                                    size='"'"'small'"'"'
                                    placeholder='"'"'34986, 34987, 34988'"'"'
                                    value={docIdInput}
                                    onChange={e => setDocIdInput(e.target.value)}
                                    disabled={scope !== '"'"'specific_docids'"'"'}
                                    sx={{ flex: 1 }}
                                    inputProps={{ style: { color: DARK.text, fontSize: '"'"'0.8rem'"'"' } }}
                                />
                                {docIdCount > 0 && <Chip label={`${docIdCount} DocId`} size='"'"'small'"'"' sx={{ bgcolor: DARK.card, color: DARK.text }} />}
                            </Box>
                        } />
                        <FormControlLabel value='"'"'selected_employees'"'"' control={<Radio size='"'"'small'"'"' sx={{ color: DARK.muted }} />} label={
                            <Typography sx={{ color: DARK.text, fontSize: '"'"'0.875rem'"'"' }}>
                                Hanya karyawan dipilih ({empCount} orang)
                            </Typography>
                        } />
                    </RadioGroup>
                </FormControl>

                {/* Date Range */}
                <Box sx={{ display: '"'"'flex'"'"', gap: 2, mb: 2 }}>
                    <TextField
                        label='"'"'Dari Tanggal'"'"'
                        type='"'"'date'"'"'
                        size='"'"'small'"'"'
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                        inputProps={{ style: { color: DARK.text } }}
                    />
                    <TextField
                        label='"'"'Sampai Tanggal'"'"'
                        type='"'"'date'"'"'
                        size='"'"'small'"'"'
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                        inputProps={{ style: { color: DARK.text } }}
                    />
                </Box>

                <Divider sx={{ borderColor: DARK.border, mb: 2 }} />

                {/* Preview */}
                <Paper sx={{ p: 1.5, bgcolor: DARK.card, mb: 2 }}>
                    <Typography variant='"'"'caption'"'"' sx={{ color: DARK.muted, fontWeight: 700, textTransform: '"'"'uppercase'"'"' }}>
                        Preview
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                        <Typography sx={{ color: DARK.text, fontSize: '"'"'0.8rem'"'"' }}>
                            Hapus semua record dengan <strong style={{ color: DARK.red }}>OT</strong> pada:
                        </Typography>
                        <Typography sx={{ color: DARK.text, fontSize: '"'"'0.8rem'"'"' }}>
                            Tanggal: <strong>{startDate} - {endDate}</strong>
                        </Typography>
                        <Typography sx={{ color: DARK.text, fontSize: '"'"'0.8rem'"'"' }}>
                            Scope: <strong>
                                {scope === '"'"'all_docids'"'"' ? `Semua DocId` :
                                 scope === '"'"'specific_docids'"'"' ? `DocIds: ${docIdInput}` :
                                 `Karyawan dipilih: ${empCount} orang`}
                            </strong>
                        </Typography>
                    </Box>
                </Paper>

                {/* Progress */}
                {status === '"'"'running'"'"' && progress.total > 0 && (
                    <Box sx={{ mb: 2 }}>
                        <LinearProgress
                            variant='"'"'determinate'"'"'
                            value={(progress.done / progress.total) * 100}
                            sx={{ height: 6, borderRadius: 3, bgcolor: DARK.card }}
                        />
                        <Typography sx={{ color: DARK.muted, fontSize: '"'"'0.75rem'"'"', mt: 0.5 }}>
                            {progress.current} — {progress.done}/{progress.total} DocIds selesai
                        </Typography>
                    </Box>
                )}

                {/* Logs */}
                {logs.length > 0 && (
                    <Box sx={{
                        bgcolor: DARK.bg,
                        border: `"'"'1px solid ${DARK.border}'"'"'`,
                        borderRadius: 1,
                        p: 1,
                        maxHeight: 150,
                        overflowY: '"'"'auto'"'"',
                        fontFamily: '"'"'monospace'"'"',
                        fontSize: '"'"'0.72rem'"'"'
                    }}>
                        {logs.map((l, i) => (
                            <Box key={i} sx={{ color: l.type === '"'"'error'"'"' ? DARK.red : l.type === '"'"'success'"'"' ? DARK.green : l.type === '"'"'warning'"'"' ? DARK.amber : DARK.text, mb: 0.3 }}>
                                <span style={{ color: DARK.muted }}>[{l.ts}]</span> {l.msg}
                            </Box>
                        ))}
                        <div ref={logEndRef} />
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2, borderTop: `"'"'1px solid ${DARK.border}'"'"' }}>
                <Button onClick={handleClose} sx={{ color: DARK.muted }}>
                    {status === '"'"'running'"'"' ? '"'"'Batal'"'"' : '"'"'Tutup'"'"'}
                </Button>
                {status === '"'"'idle'"'"' ? (
                    <Button
                        variant='"'"'contained'"'"'
                        color='"'"'error'"'"'
                        startIcon={<DeleteIcon />}
                        onClick={handleStart}
                        sx={{ fontWeight: 700 }}
                        disabled={scope === '"'"'specific_docids'"'"' && docIdCount === 0}
                    >
                        PROSES HAPUS OT
                    </Button>
                ) : (
                    <Button
                        variant='"'"'outlined'"'"'
                        color='"'"'error'"'"'
                        startIcon={<StopIcon />}
                        onClick={handleStop}
                        sx={{ fontWeight: 700 }}
                    >
                        STOP
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default DeleteOTDialog;