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

const ADResetDialog = ({
    open, onClose,
    month, year,
    payrollSource = { source: 'live', snapshotId: null }
}) => {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('idle'); // idle|running|completed|failed|stopped|preview
    const [scope, setScope] = useState('dcoid');   // dcoid | month | duplicates | differences | amount-differences
    const [runMode, setRunMode] = useState('dry-run'); // dry-run | delete
    const [browserMode, setBrowserMode] = useState('headful'); // headful | headless
    const [windowCount, setWindowCount] = useState('5');
    const [manualDcoids, setManualDcoids] = useState(''); // manual DCOID input
    const [fetchingDcoids, setFetchingDcoids] = useState(false);
    const [dcoidFetchError, setDcoidFetchError] = useState('');
    const [displayDcoids, setDisplayDcoids] = useState([]); // shown in chip list
    const [fetchedDetails, setFetchedDetails] = useState([]); // DB details for dry run preview
    const [dryRunResult, setDryRunResult] = useState(null); // Store dry run results
    const [keepStrategy, setKeepStrategy] = useState('latest'); // latest | oldest
    const logEndRef = useRef(null);
    const abortControllerRef = useRef(null);

    // Reset state on open
    useEffect(() => {
        if (open) {
            setLogs([]);
            setStatus('idle');
            setManualDcoids('');
            setDisplayDcoids([]);
            setFetchedDetails([]);
            setDcoidFetchError('');
            setScope('dcoid'); // Reset to manual input mode
            setDryRunResult(null); // Clear previous dry run results
            setKeepStrategy('latest');
        }
    }, [open]);

    // Cleanup abort controller on close
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, []);

    // Auto-scroll logs
    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    // Handle status completion (no auto-refresh to avoid infinite loop)
    useEffect(() => {
        if (status === 'completed') {
            addLog('info', 'Proses selesai.');
        }
    }, [status]);

    const addLog = (type, message) => setLogs(prev => {
        const newLog = { type, message, time: new Date().toLocaleTimeString() };
        return [...prev, newLog].slice(-500); // keep last 500
    });

    // Parse manual DCOIDs from text input
    const parseManualDcoids = () => manualDcoids
        .split(/[,\n\s]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && /^AD\d+$/i.test(s));

    // Fetch DCOIDs from Millware DB by month/year
    const handleFetchDcoids = async () => {
        if (!month || !year) {
            setDcoidFetchError('Month dan Year diperlukan untuk fetch dari database.');
            return;
        }

        setFetchingDcoids(true);
        setDcoidFetchError('');
        try {
            let params;
            let res;
            let data;

            if (scope === 'duplicates') {
                // Fetch duplicate DocIDs
                params = new URLSearchParams({ month, year });
                params.set('keepStrategy', keepStrategy);
                res = await fetch(`/api/payroll/ad-reset/duplicate-doc-ids?${params}`);
                data = await res.json();
                if (data.docIds && data.docIds.length > 0) {
                    setDisplayDcoids(data.docIds);
                    setFetchedDetails(data.details || []);
                    addLog('info', `Ditemukan ${data.docIds.length} DUPLICATE ADTRANS dari database (${month}/${year})`);
                    addLog('info', `Strategi: keep ${keepStrategy}, hapus yang ${keepStrategy === 'latest' ? 'lama' : 'baru'}`);
                    if (data.duplicateGroups) {
                        const groupKeys = Object.keys(data.duplicateGroups);
                        addLog('info', `${groupKeys.length} grup duplikat terdeteksi`);
                    }
                } else {
                    setDcoidFetchError('Tidak ada duplicate ADTRANS ditemukan di database.');
                    addLog('error', 'Tidak ada duplicate ADTRANS ditemukan');
                }
            } else if (scope === 'differences') {
                // Fetch ADTRANS with differences (Venus != Millware)
                // For dry run, we call the differences API endpoint
                res = await fetch('/api/payroll/ad-reset/differences/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        month,
                        year,
                        dryRun: true,
                        headless: false,
                        windowCount: 5
                    })
                });
                data = await res.json();
                if (data.success && data.foundCount > 0) {
                    setDisplayDcoids(data.docTargets?.map(t => t.docNumber || t.label) || []);
                    setFetchedDetails(data.docTargets || []);
                    addLog('info', `Ditemukan ${data.foundCount} ADTRANS dengan SELISIH (${month}/${year})`);
                    addLog('info', `${data.employeeCount || 0} employee(s) memiliki record berbeda`);
                    if (data.employeeGroups) {
                        const empKeys = Object.keys(data.employeeGroups);
                        empKeys.slice(0, 5).forEach(key => {
                            const emp = data.employeeGroups[key];
                            addLog('info', `  - ${emp.empCode}: ${emp.uniqueDocCount} DocDesc berbeda (${emp.totalRecords} record)`);
                        });
                        if (empKeys.length > 5) {
                            addLog('info', `  ... dan ${empKeys.length - 5} employee(s) lainnya`);
                        }
                    }
                } else {
                    setDcoidFetchError('Tidak ada ADTRANS dengan selisih ditemukan.');
                    addLog('error', 'Tidak ada ADTRANS dengan selisih Venus vs Millware ditemukan');
                }
            } else if (scope === 'amount-differences') {
                // Fetch ADTRANS where AMOUNTS differ between Venus and Millware
                // Uses tolerance-based comparison (default 50 rupiah to match payrollService.js)
                const params = new URLSearchParams({
                    month,
                    year,
                    tolerance: 50,
                    source: payrollSource.source || 'live'
                });
                if (payrollSource.snapshotId) params.set('snapshotId', payrollSource.snapshotId);
                res = await fetch(`/api/payroll/ad-reset/amount-differences?${params}`);
                data = await res.json();
                if (data.success && data.totalRecords > 0) {
                    setDisplayDcoids(data.docIds || []);
                    setFetchedDetails(data.preview || []);
                    addLog('info', `Ditemukan ${data.totalRecords} ADTRANS dengan SELISIH AMOUNT (${month}/${year})`);
                    addLog('info', `${data.employeeCount || 0} employee(s) dengan selisih amount`);
                    addLog('info', `Tolerance: ${data.tolerance || 50} rupiah (sama dengan UI Payroll)`);
                    addLog('info', `Venus employees: ${data.venusEmployeeCount || 0}, Millware employees: ${data.millwareEmployeeCount || 0}`);
                    if (data.employees && data.employees.length > 0) {
                        addLog('info', 'Employee dengan selisih:');
                        data.employees.slice(0, 5).forEach(emp => {
                            const diffDetails = emp.differences.map(d => `${d.componentName}: Rp${d.venusAmount.toLocaleString()} vs Rp${d.millwareAmount.toLocaleString()} (selisih: Rp${d.diff.toLocaleString()})`).join(', ');
                            addLog('info', `  - ${emp.empCode} (${emp.empName}): ${diffDetails}`);
                        });
                        if (data.employees.length > 5) {
                            addLog('info', `  ... dan ${data.employees.length - 5} employee(s) lainnya`);
                        }
                    }
                } else {
                    setDcoidFetchError(`Tidak ada ADTRANS dengan selisih amount ditemukan (tolerance: ${data.tolerance || 50} rupiah).`);
                    addLog('error', `Tidak ada ADTRANS dengan selisih amount ditemukan untuk ${month}/${year}`);
                }
            } else {
                // Fetch all DocIDs by month/year
                params = new URLSearchParams({ month, year });
                res = await fetch(`/api/payroll/ad-reset/doc-ids?${params}`);
                data = await res.json();
                if (data.docIds && data.docIds.length > 0) {
                    setDisplayDcoids(data.docIds);
                    setFetchedDetails(data.details || []);
                    setManualDcoids(data.docIds.join(', '));
                    addLog('info', `Ditemukan ${data.docIds.length} DocID ADTRANS dari database (${month}/${year})`);
                } else {
                    setDcoidFetchError('Tidak ada DocID ADTRANS ditemukan di database.');
                    addLog('error', 'Database tidak mengembalikan DocID ADTRANS');
                }
            }
        } catch (e) {
            setDcoidFetchError(`Gagal mengambil DocIDs: ${e.message}`);
            addLog('error', `Error: ${e.message}`);
        } finally {
            setFetchingDcoids(false);
        }
    };

    // Get DCOIDs to process
    const getDcoids = () => {
        if (scope === 'dcoid') {
            return parseManualDcoids();
        }
        // For duplicates, differences, and month - use fetched displayDcoids
        return displayDcoids;
    };

    const handleRun = async () => {
        setLogs([]);
        setStatus('running');

        const dcoidsToProcess = getDcoids();
        const parsedWindowCount = Math.max(1, Math.min(10, parseInt(windowCount || '5', 10) || 5));

        // Allow empty dcoids for duplicates/differences/amount-differences scope - they use API directly
        if (!['duplicates', 'differences', 'amount-differences'].includes(scope) && dcoidsToProcess.length === 0) {
            addLog('error', 'Tidak ada DCOID untuk diproses.');
            setStatus('failed');
            return;
        }

        addLog('info', `ADTRANS Reset: scope=${scope}, run=${runMode}, dcoids=${scope === 'duplicates' || scope === 'differences' || scope === 'amount-differences' ? 'from-db' : dcoidsToProcess.length}`);
        addLog('info', `Window count: ${parsedWindowCount}`);

        if (scope === 'dcoid') {
            addLog('info', `DCOID manual: ${dcoidsToProcess.join(', ')}`);
        } else if (scope === 'duplicates') {
            addLog('info', `Strategi: keep ${keepStrategy}, hapus yang ${keepStrategy === 'latest' ? 'lama/duplikat' : 'baru'}`);
        } else if (scope === 'differences') {
            addLog('info', `Scope: Selisih ADTRANS (Venus ≠ Millware)`);
        } else if (scope === 'amount-differences') {
            addLog('info', `Scope: Selisih Amount (Venus vs Millware)`);
        } else {
            addLog('info', `DCOID dari database: ${dcoidsToProcess.length} record(s)`);
        }

        try {
            const controller = new AbortController();
            abortControllerRef.current = controller;

            // Determine API endpoint based on scope
            let apiEndpoint = '/api/payroll/ad-reset/by-dcoid/run';
            let requestBody = {
                dcoids: dcoidsToProcess,
                dryRun: runMode === 'dry-run',
                headless: browserMode === 'headless',
                windowCount: parsedWindowCount
            };

            if (scope === 'duplicates') {
                apiEndpoint = '/api/payroll/ad-reset/duplicates/run';
                requestBody = {
                    month,
                    year,
                    dryRun: runMode === 'dry-run',
                    headless: browserMode === 'headless',
                    windowCount: parsedWindowCount,
                    keepStrategy
                };
            } else if (scope === 'differences') {
                apiEndpoint = '/api/payroll/ad-reset/differences/run';
                requestBody = {
                    month,
                    year,
                    dryRun: runMode === 'dry-run',
                    headless: browserMode === 'headless',
                    windowCount: parsedWindowCount
                };
            } else if (scope === 'amount-differences') {
                apiEndpoint = '/api/payroll/ad-reset/amount-differences/run';
                requestBody = {
                    month,
                    year,
                    ...payrollSource,
                    dryRun: runMode === 'dry-run',
                    headless: browserMode === 'headless',
                    windowCount: parsedWindowCount
                };
            }

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const text = await response.text();
                let message = text;
                try { message = JSON.parse(text).error || text; } catch (_) { /* keep text */ }
                addLog('error', message || 'Gagal memulai');
                setStatus('failed');
                return;
            }

            // Check if it's a dry-run response (not SSE)
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/event-stream')) {
                const data = await response.json();
                if (data.dryRun) {
                    // Store dry run results and set status to 'preview'
                    setDryRunResult(data);
                    addLog('info', `DRY RUN RESULT: ${data.foundCount} DCOID(s) ditemukan di database`);

                    if (data.duplicateGroups) {
                        const groupKeys = Object.keys(data.duplicateGroups);
                        addLog('info', `${groupKeys.length} grup duplikat terdeteksi`);
                        // Show duplicate groups summary
                        groupKeys.slice(0, 5).forEach(key => {
                            const group = data.duplicateGroups[key];
                            addLog('info', `  - ${group.empCode} | ${group.docDesc}: ${group.duplicateCount} record(s), hapus ${group.deleteCount}`);
                        });
                        if (groupKeys.length > 5) {
                            addLog('info', `  ... dan ${groupKeys.length - 5} grup lainnya`);
                        }
                    }

                    if (data.employeeGroups) {
                        const empKeys = Object.keys(data.employeeGroups);
                        addLog('info', `${empKeys.length} employee(s) dengan selisih terdeteksi`);
                        empKeys.slice(0, 5).forEach(key => {
                            const emp = data.employeeGroups[key];
                            addLog('info', `  - ${emp.empCode} (${emp.empName}): ${emp.uniqueDocCount} DocDesc berbeda, ${emp.totalRecords} record(s)`);
                        });
                        if (empKeys.length > 5) {
                            addLog('info', `  ... dan ${empKeys.length - 5} employee(s) lainnya`);
                        }
                    }

                    // Handle amount-differences response format
                    if (data.employees && data.employees.length > 0) {
                        addLog('info', `${data.employees.length} employee(s) dengan selisih amount terdeteksi`);
                        addLog('info', `Tolerance: ${data.tolerance || 50} rupiah (sama dengan UI Payroll)`);
                        data.employees.slice(0, 5).forEach(emp => {
                            const diffDetails = emp.differences.map(d => `${d.componentName}: Rp${d.venusAmount.toLocaleString()} vs Rp${d.millwareAmount.toLocaleString()} (selisih: Rp${d.diff.toLocaleString()})`).join(', ');
                            addLog('info', `  - ${emp.empCode} (${emp.empName}): ${diffDetails}`);
                        });
                        if (data.employees.length > 5) {
                            addLog('info', `  ... dan ${data.employees.length - 5} employee(s) lainnya`);
                        }
                    }

                    if (data.notFoundDcoids && data.notFoundDcoids.length > 0) {
                        addLog('warn', `Tidak ditemukan: ${data.notFoundDcoids.join(', ')}`);
                    }
                    if (data.docTargets && data.docTargets.length > 0) {
                        addLog('info', 'Preview record yang akan dihapus:');
                        data.docTargets.slice(0, 10).forEach(target => {
                            addLog('info', `  - ${target.docNumber} | ${target.empCode} | ${target.docDesc || target.empName}`);
                        });
                        if (data.docTargets.length > 10) {
                            addLog('info', `  ... dan ${data.docTargets.length - 10} record lainnya`);
                        }
                    }
                    addLog('info', '---');
                    addLog('info', 'Ganti mode ke "Hapus" dan klik "Hapus Record" untuk menghapus data.');
                    setStatus('preview'); // Stay in preview mode
                    return;
                }
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
                    } else if (msg.type === 'exit') {
                        addLog('info', `Selesai (exit code: ${msg.code})`);
                        setStatus('completed');
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
            await fetch('/api/payroll/ad-reset/automation/stop', { method: 'POST' });
            addLog('info', 'Menghentikan...');
            setStatus('stopped');
        } catch (e) {
            addLog('error', `Gagal stop: ${e.message}`);
        }
    };

    const STATUS_COLORS = { idle: DARK.muted, running: DARK.orange, completed: DARK.green, failed: DARK.red, stopped: DARK.amber, preview: DARK.accent };
    const STATUS_LABELS = { idle: 'READY', running: 'RUNNING', completed: 'COMPLETED', failed: 'FAILED', stopped: 'STOPPED', preview: 'PREVIEW' };

    const dcoidsToProcess = getDcoids();
    // Allow running in preview mode only if runMode is 'delete'
    const runDisabled = status === 'running'
        || (status !== 'preview' && dcoidsToProcess.length === 0)
        || (status === 'preview' && runMode !== 'delete')
        || !windowCount
        || (parseInt(windowCount, 10) || 0) < 1;

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
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>Reset Monthly Allowance/Deduction (ADTRANS)</Typography>
                    <Typography variant="caption" sx={{ color: DARK.muted }}>Millware AD Lists — PR_ADTRANS</Typography>
                </Box>
                <Chip label={STATUS_LABELS[status]} size="small" sx={{ fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.08em', bgcolor: alpha(STATUS_COLORS[status], 0.15), color: STATUS_COLORS[status], border: `1px solid ${alpha(STATUS_COLORS[status], 0.4)}` }} />
            </DialogTitle>

            {/* Warning */}
            <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(DARK.amber, 0.08), borderBottom: `1px solid ${alpha(DARK.amber, 0.2)}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningIcon sx={{ fontSize: 16, color: DARK.amber }} />
                <Typography variant="caption" sx={{ color: DARK.amber, fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                    Record ADTRANS yang dihapus TIDAK dapat dikembalikan.
                </Typography>
            </Box>

            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Controls */}
                <Box sx={{ p: 2.5, bgcolor: DARK.surface, borderBottom: `1px solid ${DARK.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>

                    {/* Period + Summary chips */}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                        {month && year && (
                            <Chip label={`Bulan: ${month}/${year}`} size="small" sx={{ bgcolor: alpha(DARK.accent, 0.15), color: DARK.accent, fontWeight: 700, fontSize: '0.75rem' }} />
                        )}
                        <Chip label={scope === 'dcoid' ? `${dcoidsToProcess.length} DCOID(s) Manual` : scope === 'duplicates' ? `Duplikat DocDesc` : scope === 'differences' ? `Selisih Count` : scope === 'amount-differences' ? `Selisih Amount` : `${dcoidsToProcess.length} DCOID(s) dari DB`} size="small" sx={{ bgcolor: alpha(DARK.green, 0.15), color: DARK.green, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={runMode === 'dry-run' ? 'Cek saja' : 'Hapus'} size="small" sx={{ bgcolor: alpha(runMode === 'dry-run' ? DARK.accent : DARK.red, 0.15), color: runMode === 'dry-run' ? DARK.accent : DARK.red, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={browserMode === 'headful' ? 'Browser tampil' : 'Headless'} size="small" sx={{ bgcolor: alpha(DARK.amber, 0.15), color: DARK.amber, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={`${windowCount || 1} Window`} size="small" sx={{ bgcolor: alpha(DARK.green, 0.12), color: DARK.green, fontWeight: 700, fontSize: '0.75rem' }} />
                        {scope === 'duplicates' && (
                            <Chip label={`Keep: ${keepStrategy}`} size="small" sx={{ bgcolor: alpha(DARK.orange, 0.15), color: DARK.orange, fontWeight: 700, fontSize: '0.75rem' }} />
                        )}
                    </Box>

                    {/* Scope selection */}
                    <FormControl component="fieldset" size="small">
                        <FormLabel component="legend" sx={{ fontSize: '0.65rem', color: DARK.muted, mb: 0.5 }}>SUMBER DCOID</FormLabel>
                        <RadioGroup row value={scope} onChange={e => setScope(e.target.value)}>
                            <FormControlLabel value="dcoid" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.accent } }} />} label={<Typography variant="caption" sx={{ color: DARK.text, fontWeight: 600 }}>Input Manual</Typography>} />
                            <FormControlLabel value="month" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.green } }} />} label={<Typography variant="caption" sx={{ color: DARK.text, fontWeight: 600 }}>Dari DB (Bulan)</Typography>} />
                            <FormControlLabel value="duplicates" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.orange } }} />} label={<Typography variant="caption" sx={{ color: DARK.orange, fontWeight: 700 }}>Duplikat DocDesc</Typography>} />
                            <FormControlLabel value="differences" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.red } }} />} label={<Typography variant="caption" sx={{ color: DARK.red, fontWeight: 700 }}>Selisih Count</Typography>} />
                            <FormControlLabel value="amount-differences" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.amber } }} />} label={<Typography variant="caption" sx={{ color: DARK.amber, fontWeight: 700 }}>Selisih Amount</Typography>} />
                        </RadioGroup>
                    </FormControl>

                    {/* Keep Strategy for duplicates */}
                    {scope === 'duplicates' && (
                        <FormControl component="fieldset" size="small">
                            <FormLabel component="legend" sx={{ fontSize: '0.65rem', color: DARK.muted, mb: 0.5 }}>STRATEGI HAPUS DUPLIKAT</FormLabel>
                            <RadioGroup row value={keepStrategy} onChange={e => setKeepStrategy(e.target.value)}>
                                <FormControlLabel value="latest" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.green } }} />} label={<Typography variant="caption" sx={{ color: DARK.green, fontWeight: 700 }}>Keep Terbaru</Typography>} />
                                <FormControlLabel value="oldest" control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color: DARK.amber } }} />} label={<Typography variant="caption" sx={{ color: DARK.amber, fontWeight: 700 }}>Keep Terlama</Typography>} />
                            </RadioGroup>
                            <Typography variant="caption" sx={{ color: DARK.muted, fontSize: '0.65rem', mt: 0.5 }}>
                                {keepStrategy === 'latest'
                                    ? 'Hapus record yang lebih lama, simpan yang paling baru (CreatedDate DESC)'
                                    : 'Hapus record yang lebih baru, simpan yang paling lama (CreatedDate ASC)'}
                            </Typography>
                        </FormControl>
                    )}

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
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

                        <TextField
                            label="Jumlah Window"
                            type="number"
                            size="small"
                            value={windowCount}
                            onChange={e => setWindowCount(e.target.value)}
                            disabled={status === 'running'}
                            inputProps={{ min: 1, max: 10, style: { color: DARK.text } }}
                            InputLabelProps={{ sx: { color: DARK.muted } }}
                        />
                    </Box>

                    {/* DCOID Input */}
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Typography variant="caption" sx={{ color: DARK.muted, fontWeight: 700, fontSize: '0.7rem' }}>
                                {scope === 'duplicates' ? 'DUPLIKAT DOCDESC' : scope === 'differences' ? 'SELISIH COUNT' : scope === 'amount-differences' ? 'SELISIH AMOUNT' : 'DCOID (Document ID)'}
                            </Typography>
                            {(scope === 'month' || scope === 'duplicates' || scope === 'differences' || scope === 'amount-differences') && (
                                <Button size="small" startIcon={fetchingDcoids ? <CircularProgress size={10} color="inherit" /> : <RefreshIcon sx={{ fontSize: 13 }} />}
                                    onClick={handleFetchDcoids} disabled={fetchingDcoids || status === 'running' || !month || !year}
                                    sx={{ color: scope === 'duplicates' ? DARK.orange : scope === 'differences' ? DARK.red : scope === 'amount-differences' ? DARK.amber : DARK.accent, fontSize: '0.7rem', py: 0.25, px: 1 }}>
                                    {fetchingDcoids ? 'Mengambil...' : (scope === 'duplicates' ? 'Cari Duplikat' : scope === 'differences' ? 'Cari Selisih' : scope === 'amount-differences' ? 'Cari Amount' : 'Ambil dari DB')}
                                </Button>
                            )}
                            {(scope === 'duplicates' || scope === 'differences' || scope === 'amount-differences') && !month && !year && (
                                <Typography variant="caption" sx={{ color: DARK.orange, fontSize: '0.65rem' }}>
                                    ⚠ Pilih bulan & tahun
                                </Typography>
                            )}
                        </Box>
                        <TextField
                            multiline minRows={2} maxRows={5}
                            fullWidth size="small"
                            placeholder={scope === 'dcoid' ? 'Masukkan DCOID (format: AD26051752, AD26051473, ...)\nPisahkan dengan koma, spasi, atau baris baru' : scope === 'duplicates' ? 'Klik "Cari Duplikat" untuk mencari record duplikat berdasarkan DocDesc' : scope === 'differences' ? 'Klik "Cari Selisih" untuk mencari ADTRANS dengan perbedaan count' : scope === 'amount-differences' ? 'Klik "Cari Amount" untuk mencari ADTRANS dengan perbedaan amount Venus vs Millware' : 'Ambil dari database atau masukkan manual'}
                            value={manualDcoids}
                            onChange={e => { setManualDcoids(e.target.value); setScope('dcoid'); }}
                            disabled={status === 'running' || scope === 'duplicates' || scope === 'differences' || scope === 'amount-differences'}
                            inputProps={{ style: { color: DARK.text, backgroundColor: DARK.card, borderRadius: 6, fontSize: '0.82rem', fontFamily: 'monospace' } }}
                        />
                        {dcoidFetchError && (
                            <Alert severity="warning" sx={{ mt: 0.5, py: 0.25, fontSize: '0.72rem' }}>{dcoidFetchError}</Alert>
                        )}
                        {(displayDcoids.length > 0 && (scope === 'month' || scope === 'duplicates' || scope === 'differences' || scope === 'amount-differences')) && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" sx={{ color: scope === 'differences' ? DARK.red : scope === 'amount-differences' ? DARK.amber : scope === 'duplicates' ? DARK.orange : DARK.muted, fontSize: '0.68rem' }}>
                                    {scope === 'differences' ? `${displayDcoids.length} ADTRANS dengan selisih` : scope === 'amount-differences' ? `${displayDcoids.length} ADTRANS dengan selisih amount` : scope === 'duplicates' ? `${displayDcoids.length} record duplikat` : `${displayDcoids.length} DCOID(s) dari database`}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5, maxHeight: 80, overflowY: 'auto', p: 1, bgcolor: DARK.card, borderRadius: 1 }}>
                                    {displayDcoids.map(id => (
                                        <Chip key={id} label={id} size="small" sx={{ fontSize: '0.68rem', bgcolor: alpha(scope === 'amount-differences' ? DARK.amber : scope === 'differences' ? DARK.red : DARK.green, 0.1), color: scope === 'amount-differences' ? DARK.amber : scope === 'differences' ? DARK.red : DARK.green, border: `1px solid ${alpha(scope === 'amount-differences' ? DARK.amber : scope === 'differences' ? DARK.red : DARK.green, 0.3)}` }} />
                                    ))}
                                </Box>
                            </Box>
                        )}
                        {scope === 'dcoid' && dcoidsToProcess.length > 0 && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" sx={{ color: DARK.accent, fontSize: '0.68rem' }}>
                                    {dcoidsToProcess.length} DCOID(s) valid terdeteksi
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5, maxHeight: 80, overflowY: 'auto', p: 1, bgcolor: DARK.card, borderRadius: 1 }}>
                                    {dcoidsToProcess.map(id => (
                                        <Chip key={id} label={id} size="small" sx={{ fontSize: '0.68rem', bgcolor: alpha(DARK.accent, 0.1), color: DARK.accent, border: `1px solid ${alpha(DARK.accent, 0.3)}` }} />
                                    ))}
                                </Box>
                            </Box>
                        )}
                    </Box>

                    {/* Info Box */}
                    <Box sx={{ p: 1.5, bgcolor: alpha(DARK.accent, 0.08), borderRadius: 1, border: `1px solid ${alpha(DARK.accent, 0.2)}` }}>
                        <Typography variant="caption" sx={{ color: DARK.accent, fontWeight: 700, fontSize: '0.7rem', display: 'block', mb: 0.5 }}>
                            FORMAT DCOID (Document ID)
                        </Typography>
                        <Typography variant="caption" sx={{ color: DARK.muted, fontSize: '0.68rem' }}>
                            Format: <code style={{ color: DARK.green }}>AD</code> + <code style={{ color: DARK.amber }}>YYMMDDXXX</code> (10 karakter setelah AD)<br/>
                            Contoh: <code style={{ color: DARK.green }}>AD26051752</code> (DocID dari Millware AD Lists)
                        </Typography>
                    </Box>
                </Box>

                {/* logs */}
                <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto', maxHeight: 350 }}>
                    {logs.length === 0 && status === 'idle' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 1 }}>
                            <DeleteIcon sx={{ fontSize: 40, color: alpha(DARK.muted, 0.5) }} />
                            <Typography sx={{ color: DARK.muted, textAlign: 'center', fontSize: '0.875rem' }}>
                                Masukkan DCOID dan klik "Jalankan" untuk reset ADTRANS
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
                ) : status === 'preview' ? (
                    // Preview completed - user can run delete or reset to preview again
                    <>
                        <Button variant="outlined" size="small" startIcon={<RefreshIcon />}
                            onClick={() => { setStatus('idle'); setDryRunResult(null); }}
                            sx={{ color: DARK.muted, borderColor: DARK.border }}>
                            Reset
                        </Button>
                        <Button variant="contained" size="small" startIcon={<DeleteIcon />} onClick={handleRun}
                            disabled={runMode !== 'delete'}
                            sx={{ bgcolor: DARK.red, '&:hover': { bgcolor: '#DC2626' } }}>
                            Hapus Record ({dryRunResult?.foundCount || 0})
                        </Button>
                    </>
                ) : (
                    <Button variant="contained" size="small" startIcon={<PlayIcon />} onClick={handleRun}
                        disabled={runDisabled}
                        sx={{ bgcolor: runMode === 'dry-run' ? DARK.accent : DARK.red, '&:hover': { bgcolor: runMode === 'dry-run' ? '#2563EB' : '#DC2626' } }}>
                        {runMode === 'dry-run' ? 'Cek Record' : 'Hapus Record'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default ADResetDialog;
