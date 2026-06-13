import React, { useState, useRef, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
    Box, LinearProgress, Switch, FormControlLabel, Radio, RadioGroup,
    FormControl, FormLabel, TextField, Divider, Chip, Alert, Paper
} from '@mui/material';
import PlayIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import StopIcon from '@mui/icons-material/Stop';
import RobotIcon from '@mui/icons-material/SmartToy';
import DownloadIcon from '@mui/icons-material/Download';
import FilterListIcon from '@mui/icons-material/FilterList';
import { alpha } from '@mui/material/styles';

const DARK = {
    bg: '#0F172A',       // Slate 900
    surface: '#1E293B',   // Slate 800
    card: '#283548',      // Elevated
    border: '#334155',     // Slate 700
    text: '#CBD5E1',      // Slate 300
    muted: '#64748B',      // Slate 500
    accent: '#3B82F6',    // Blue 500
    green: '#10B981',      // Emerald 500
    red: '#EF4444',        // Red 500
    amber: '#F59E0B',      // Amber 500
    violet: '#8B5CF6',     // Violet 500
};

const MIN_WINDOW_COUNT = 1;
const MAX_WINDOW_COUNT = 6;
const TABS_PER_WINDOW = 8;

const AutomationDialog = ({ open, onClose, selectedEmployees, month, year, compareMode, syncTargetMode, comparisonData, onRefresh }) => {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('idle');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [onlyOvertime, setOnlyOvertime] = useState(false);
    const [filterSynced, setFilterSynced] = useState(true);
    const [targetMode, setTargetMode] = useState('all');
    const [windowCount, setWindowCount] = useState('');
    const logEndRef = useRef(null);
    const refreshedAfterCompletionRef = useRef(false);

    useEffect(() => {
        if (open) {
            if (syncTargetMode) {
                setTargetMode(syncTargetMode);
                setOnlyOvertime(syncTargetMode === 'overtime');
            } else if (compareMode === 'overtime') {
                setTargetMode('overtime');
                setOnlyOvertime(true);
            } else {
                setTargetMode('all');
                setOnlyOvertime(false);
            }
        }
    }, [open, compareMode, syncTargetMode]);

    useEffect(() => {
        if (targetMode === 'overtime') setOnlyOvertime(true);
        else setOnlyOvertime(false);
    }, [targetMode]);

    const validateWindowCount = (value) => {
        const text = String(value ?? '').trim();
        if (!text) return { value: null, error: 'Isi jumlah window' };

        const parsed = Number(text);
        if (!Number.isInteger(parsed)) return { value: null, error: 'Harus angka bulat' };
        if (parsed < MIN_WINDOW_COUNT || parsed > MAX_WINDOW_COUNT) {
            return { value: null, error: `Masukkan ${MIN_WINDOW_COUNT}-${MAX_WINDOW_COUNT}` };
        }

        return { value: parsed, error: '' };
    };

    const handleWindowCountChange = (value) => {
        if (/^\d*$/.test(value)) setWindowCount(value);
    };

    useEffect(() => {
        if (status === 'completed' && onRefresh && !refreshedAfterCompletionRef.current) {
            refreshedAfterCompletionRef.current = true;
            addLog('info', 'Auto-Refreshing Comparison Data...');
            onRefresh(targetMode === 'regular' ? 'presence' : targetMode === 'overtime' ? 'overtime' : 'all');
        }
    }, [status]);

    // Cleanup logs when dialog closes to free memory
    useEffect(() => {
        if (!open) {
            setLogs([]);
            setStatus('idle');
            refreshedAfterCompletionRef.current = false;
        }
    }, [open]);

    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    const filterEmployees = (isExport = false) => {
        if (!compareMode || compareMode === 'off' || !comparisonData || !filterSynced) {
            return { filtered: selectedEmployees, modeLog: (!filterSynced ? ' (Filter Disabled)' : '') };
        }

        if (!isExport) addLog('info', `Filtering: Keeping only ${targetMode.toUpperCase()} Mismatches...`);

        const employeesToProcess = selectedEmployees.map(emp => {
            const ptrjId = emp.ptrjEmployeeID;
            if (!ptrjId || ptrjId === 'N/A') return null;
            const filteredAttendance = {};
            let hasMismatch = false;

            Object.values(emp.attendance || {}).forEach(day => {
                const dateStr = day.date;
                const key = `${ptrjId}_${dateStr}`;
                const millwareRecord = comparisonData[key];
                if (startDate && dateStr < startDate) return;
                if (endDate && dateStr > endDate) return;
                let shouldInclude = false;
                let reason = '';
                const statusUpper = (day.status || '').toUpperCase();

                const isSunday = new Date(`${dateStr}T00:00:00`).getDay() === 0;
                const needsRegular = isSunday || day.isHoliday === true || Boolean(day.holidayName) || !['ALFA', 'N/A'].includes(statusUpper);
                const millwareNormal = Number(millwareRecord?.normal) || 0;
                const regularMissing = needsRegular && (
                    !millwareRecord ||
                    millwareRecord.hasRegularRecord !== true ||
                    millwareNormal <= 0
                );
                const overtimeMissing = (Number(day.overtimeHours) || 0) > 0 && (
                    !millwareRecord ||
                    millwareRecord.hasOTRecord !== true
                );

                if (targetMode === 'regular') {
                    shouldInclude = regularMissing;
                    reason = shouldInclude
                        ? `Regular Missing (Venus: ${day.regularHours || 0}h, Millware: ${millwareNormal}h)`
                        : `Regular already synced`;
                } else if (targetMode === 'overtime') {
                    shouldInclude = overtimeMissing;
                    reason = shouldInclude
                        ? `Overtime Missing (Venus:${day.overtimeHours || 0})`
                        : `Overtime already synced`;
                } else if (!millwareRecord) {
                    shouldInclude = true; reason = `Missing in Millware`;
                } else if (millwareRecord.status === 'MISS' || regularMissing || overtimeMissing) {
                    shouldInclude = true; reason = `Mismatch detected`;
                }

                if (!isExport && shouldInclude && millwareRecord) {
                    addLog('debug', `   [${dateStr}] ${ptrjId}:`);
                    addLog('debug', `      Millware OT=0: ${millwareRecord.hasRegularRecord ? 'EXISTS' : 'MISSING'} (${millwareRecord.normal || 0}h, rows=${millwareRecord.regularRecordCount || 0})`);
                    addLog('debug', `      Millware OT=1: ${millwareRecord.hasOTRecord ? 'EXISTS' : 'MISSING'} (${millwareRecord.ot || 0}h, rows=${millwareRecord.overtimeRecordCount || 0})`);
                    addLog('debug', `      Venus: Reg=${day.regularHours || 0}h, OT=${day.overtimeHours || 0}h`);
                }

                if (compareMode === 'overtime' && targetMode !== 'overtime') { /* legacy compat */ }

                if (shouldInclude) {
                    let finalRegularHours = day.regularHours || 0;
                    const isAnnualLeave = ['CT', 'CUTI', 'I', 'IZIN', 'S', 'SAKIT', 'SD', 'SICK'].some(s => statusUpper.startsWith(s));
                    const isAutoRegular = ['HADIR', 'PARTIAL IN', 'OFF', 'LBR', 'LIBUR'].some(s => statusUpper.startsWith(s)) || isAnnualLeave;
                    if (finalRegularHours === 0 && isAutoRegular) {
                        const dateObj = new Date(dateStr);
                        const dayNum = dateObj.getDay();
                        finalRegularHours = (dayNum === 6) ? 5 : 7;
                        reason += ` (Auto-fixed 0h -> ${finalRegularHours}h)`;
                    }
                    const fixedDay = { ...day, regularHours: finalRegularHours };
                    if (!isExport) addLog('info', `   [${dateStr}] ${reason} -> Reg:${finalRegularHours}h, OT:${day.overtimeHours}h`);
                    filteredAttendance[new Date(dateStr).getDate()] = fixedDay;
                    hasMismatch = true;
                }
            });

            if (!hasMismatch) return null;
            return { ...emp, attendance: filteredAttendance };
        }).filter(Boolean);

        return { filtered: employeesToProcess, modeLog: ` (Filtered: ${employeesToProcess.length} employees with ${targetMode} mismatches)` };
    };

    const handleExportMiss = async () => {
        addLog('info', 'Preparing to Export Miss Only Data...');
        const { filtered: employeesToProcess } = filterEmployees(true);
        if (employeesToProcess.length === 0) { addLog('info', 'No filtered data to export!'); return; }
        addLog('info', `Sending ${employeesToProcess.length} records to export service...`);
        try {
            const response = await fetch('/api/export/miss-data', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employees: employeesToProcess,
                    startDate: startDate || `${year}-${String(month).padStart(2, '0')}-01`,
                    endDate: endDate || `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`,
                    options: { onlyOvertime: targetMode === 'overtime', syncRegularOnly: targetMode === 'regular' }
                })
            });
            if (!response.ok) { const err = await response.json(); addLog('error', `Export failed: ${err.error}`); return; }
            const data = await response.json();
            if (data.success && data.data?.filename) {
                addLog('info', `Export generated: ${data.data.filename}`);
                window.open(`/api/export/download/${data.data.filename}`, '_blank');
            } else if (data.data?.count === 0) {
                addLog('info', 'No mismatched data found on server.');
            } else { addLog('error', 'Export response invalid'); }
        } catch (e) { addLog('error', `Export error: ${e.message}`); }
    };

    const handleRun = async () => {
        setLogs([]);
        const windowValidation = validateWindowCount(windowCount);
        if (windowValidation.error) {
            setStatus('idle');
            addLog('error', `Jumlah window wajib diisi. ${windowValidation.error}.`);
            return;
        }

        refreshedAfterCompletionRef.current = false;
        setStatus('running');
        const { filtered: employeesToProcess, modeLog } = filterEmployees(false);
        if (employeesToProcess.length === 0 && filterSynced) {
            addLog('info', 'All selected records are already synced! Nothing to do.'); setStatus('completed'); return;
        }
        addLog('info', `Starting automation for ${employeesToProcess.length} employees (${month}/${year})${modeLog}`);
        const normalizedWindowCount = windowValidation.value;
        addLog('info', `Windows: ${normalizedWindowCount} (${normalizedWindowCount * TABS_PER_WINDOW} max tabs, ${TABS_PER_WINDOW} tabs/window)`);
        if (startDate && endDate) addLog('info', `Date Filter: ${startDate} to ${endDate}`);
        if (targetMode === 'overtime') addLog('info', 'Mode: Only Overtime (skipping regular attendance)');
        if (targetMode === 'regular') addLog('info', 'Mode: Only Regular (skipping matched regular hours)');
        try {
            const response = await fetch('/api/automation/run', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employees: employeesToProcess,
                    month,
                    year,
                    startDate,
                    endDate,
                    onlyOvertime: targetMode === 'overtime',
                    syncMismatchesOnly: filterSynced,
                    syncRegularOnly: targetMode === 'regular',
                    windowCount: normalizedWindowCount,
                })
            });
            if (!response.ok) { const err = await response.json(); addLog('error', err.error || 'Failed to start'); setStatus('failed'); return; }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const handleMessageLine = (line) => {
                if (!line.startsWith('data: ')) return;
                try {
                    const msg = JSON.parse(line.slice(6));
                    if (msg.type === 'log' || msg.type === 'info') addLog('info', msg.data);
                    else if (msg.type === 'error') addLog('error', msg.data);
                    else if (msg.type === 'event') {
                        if (msg.data?.event === 'run.completed') setStatus('completed');
                        if (msg.data?.event === 'run.failed') setStatus('failed');
                    } else if (msg.type === 'status') {
                        if (msg.data === 'completed') setStatus('completed');
                        if (msg.data === 'failed') setStatus('failed');
                    }
                } catch (e) { }
            };
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';
                lines.forEach(handleMessageLine);
            }
            buffer += decoder.decode();
            if (buffer.trim()) buffer.split(/\r?\n/).forEach(handleMessageLine);
        } catch (e) { addLog('error', `Connection error: ${e.message}`); setStatus('failed'); }
    };

    const MAX_LOGS = 500;
    const addLog = (type, message) => setLogs(prev => {
        const newLog = { type, message, time: new Date().toLocaleTimeString() };
        const updated = [...prev, newLog];
        // Keep only the last MAX_LOGS entries to prevent memory bloat
        return updated.length > MAX_LOGS ? updated.slice(-MAX_LOGS) : updated;
    });

    const handleStop = async () => {
        try {
            await fetch('/api/automation/stop', { method: 'POST' });
            addLog('info', 'Stopping automation process...'); setStatus('stopped');
        } catch (e) { addLog('error', 'Failed to stop process'); }
    };

    const STATUS_COLORS = { idle: DARK.muted, running: DARK.accent, completed: DARK.green, failed: DARK.red, stopped: DARK.amber };
    const STATUS_LABELS = { idle: 'READY', running: 'RUNNING', completed: 'COMPLETED', failed: 'FAILED', stopped: 'STOPPED' };
    const windowValidation = validateWindowCount(windowCount);
    const windowHelperText = windowValidation.error || `${windowValidation.value * TABS_PER_WINDOW} max tab`;

    return (
        <Dialog
            open={open}
            onClose={status === 'running' ? undefined : onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: {
                minHeight: '60vh', bgcolor: DARK.bg, color: DARK.text,
                border: `1px solid ${DARK.border}`, borderRadius: 3,
            } }}
        >
            {/* Header */}
            <DialogTitle sx={{ borderBottom: `1px solid ${DARK.border}`, display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: alpha(DARK.green, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RobotIcon sx={{ color: DARK.green, fontSize: 20 }} />
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>
                        Automation Console
                    </Typography>
                    <Typography variant="caption" sx={{ color: DARK.muted }}>
                        Attendance Sync — Venus HR to Millware
                    </Typography>
                </Box>
                <Chip
                    label={STATUS_LABELS[status]}
                    size="small"
                    sx={{
                        fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.08em',
                        bgcolor: alpha(STATUS_COLORS[status], 0.15),
                        color: STATUS_COLORS[status],
                        border: `1px solid ${alpha(STATUS_COLORS[status], 0.4)}`,
                    }}
                />
            </DialogTitle>

            {/* Sync Mode Banner */}
            <Box sx={{
                px: 2.5, py: 1,
                bgcolor: alpha(targetMode === 'regular' ? DARK.red : (targetMode === 'overtime' ? DARK.violet : DARK.accent), 0.1),
                borderBottom: `1px solid ${alpha(targetMode === 'regular' ? DARK.red : (targetMode === 'overtime' ? DARK.violet : DARK.accent), 0.2)}`,
                display: 'flex', alignItems: 'center', gap: 1.5,
            }}>
                <FilterListIcon sx={{ fontSize: 15, color: targetMode === 'regular' ? DARK.red : (targetMode === 'overtime' ? DARK.violet : DARK.accent) }} />
                <Typography variant="caption" sx={{
                    fontWeight: 800, fontSize: '0.7rem', color: targetMode === 'regular' ? DARK.red : (targetMode === 'overtime' ? DARK.violet : DARK.accent),
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                    {targetMode === 'regular' ? 'SINKRONISASI ABSENSI SAJA' : (targetMode === 'overtime' ? 'SINKRONISASI OVERTIME SAJA' : 'SINKRONISASI ABSENSI + OVERTIME')}
                </Typography>
            </Box>

            <DialogContent sx={{ p: 0 }}>
                {/* Controls Panel */}
                <Box sx={{ p: 2.5, bgcolor: DARK.surface, borderBottom: `1px solid ${DARK.border}` }}>
                    {/* Target Info */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Chip label={`${selectedEmployees.length} Karyawan`} size="small" sx={{ bgcolor: alpha(DARK.accent, 0.15), color: DARK.accent, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Chip label={`Periode: ${month}/${year}`} size="small" sx={{ bgcolor: alpha(DARK.muted, 0.15), color: DARK.text, fontWeight: 700, fontSize: '0.75rem' }} />
                        {filterSynced && comparisonData && (
                            <Chip label="Filter: Synced Records" size="small" icon={<FilterListIcon sx={{ fontSize: 13 }} />} sx={{ bgcolor: alpha(DARK.amber, 0.15), color: DARK.amber, fontWeight: 700, fontSize: '0.75rem' }} />
                        )}
                    </Box>

                    {/* Controls */}
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <TextField
                            type="date" label="Start" value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            size="small" sx={{ minWidth: 160 }}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ style: { color: DARK.text, backgroundColor: DARK.card, borderRadius: 6, fontSize: '0.85rem' } }}
                        />
                        <TextField
                            type="date" label="End" value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            size="small" sx={{ minWidth: 160 }}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ style: { color: DARK.text, backgroundColor: DARK.card, borderRadius: 6, fontSize: '0.85rem' } }}
                        />
                        <TextField
                            required
                            type="number" label="Windows" value={windowCount}
                            onChange={(e) => handleWindowCountChange(e.target.value)}
                            size="small" sx={{ width: 120 }}
                            disabled={status === 'running'}
                            InputLabelProps={{ shrink: true }}
                            error={Boolean(windowValidation.error)}
                            inputProps={{
                                min: MIN_WINDOW_COUNT,
                                max: MAX_WINDOW_COUNT,
                                step: 1,
                                style: { color: DARK.text, backgroundColor: DARK.card, borderRadius: 6, fontSize: '0.85rem' }
                            }}
                            helperText={windowHelperText}
                            FormHelperTextProps={{
                                sx: {
                                    color: windowValidation.error ? DARK.red : DARK.muted,
                                    mx: 0,
                                    fontSize: '0.65rem'
                                }
                            }}
                        />
                        <FormControl component="fieldset" size="small">
                            <FormLabel component="legend" sx={{ fontSize: '0.65rem', color: DARK.muted, mb: 0.5 }}>Filter Mode</FormLabel>
                            <RadioGroup row value={targetMode} onChange={(e) => setTargetMode(e.target.value)}>
                                {[
                                    { value: 'all', label: 'All', color: DARK.accent },
                                    { value: 'regular', label: 'Regular', color: DARK.red },
                                    { value: 'overtime', label: 'OT Only', color: DARK.violet },
                                ].map(({ value, label, color }) => (
                                    <FormControlLabel
                                        key={value} value={value}
                                        control={<Radio size="small" sx={{ color: DARK.muted, '&.Mui-checked': { color } }} />}
                                        label={<Typography variant="caption" sx={{ color: DARK.text, fontWeight: 600 }}>{label}</Typography>}
                                    />
                                ))}
                            </RadioGroup>
                        </FormControl>
                        {comparisonData && (
                            <FormControlLabel
                                control={<Switch checked={filterSynced} onChange={(e) => setFilterSynced(e.target.checked)} size="small" sx={{ '& .Mui-checked': { color: DARK.red }, '& .Mui-checked + .MuiSwitch-track': { backgroundColor: alpha(DARK.red, 0.5) } }} />}
                                label={<Typography variant="caption" sx={{ color: filterSynced ? DARK.red : DARK.muted, fontWeight: 700 }}>Filter Synced</Typography>}
                            />
                        )}
                    </Box>
                </Box>

                {/* Log Console */}
                <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto', maxHeight: 380 }}>
                    {logs.length === 0 && status === 'idle' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 1 }}>
                            <RobotIcon sx={{ fontSize: 40, color: alpha(DARK.muted, 0.5) }} />
                            <Typography sx={{ color: DARK.muted, textAlign: 'center', fontSize: '0.875rem' }}>
                                Click "Run" to start automation
                            </Typography>
                        </Box>
                    )}
                    {logs.map((log, i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 0.5, fontFamily: '"Fira Code", "Cascadia Code", monospace', fontSize: '0.82rem' }}>
                            <Typography component="span" sx={{ color: alpha(DARK.muted, 0.6), minWidth: 70, fontSize: '0.75rem', mt: '1px' }}>
                                {log.time}
                            </Typography>
                            <Typography component="span" sx={{
                                color: log.type === 'error' ? DARK.red : (log.type === 'debug' ? DARK.muted : DARK.text),
                                fontFamily: 'inherit',
                            }}>
                                {log.message}
                            </Typography>
                        </Box>
                    ))}
                    <div ref={logEndRef} />
                </Box>
            </DialogContent>

            <DialogActions sx={{ borderTop: `1px solid ${DARK.border}`, p: 2, bgcolor: DARK.surface }}>
                <Button onClick={onClose} disabled={status === 'running'} sx={{ color: DARK.muted, mr: 'auto' }}>
                    Close
                </Button>
                {status !== 'running' && (
                    <Button
                        variant="outlined" size="small"
                        startIcon={<DownloadIcon />}
                        onClick={handleExportMiss}
                        disabled={!comparisonData || !filterSynced}
                        sx={{ borderColor: DARK.border, color: DARK.text, mr: 1 }}
                    >
                        Export Miss
                    </Button>
                )}
                {status === 'running' ? (
                    <Button variant="contained" size="small" color="error" startIcon={<StopIcon />} onClick={handleStop}>
                        Stop
                    </Button>
                ) : (
                    <Button
                        variant="contained" size="small"
                        startIcon={status === 'idle' ? <PlayIcon /> : <RefreshIcon />}
                        onClick={handleRun}
                        disabled={Boolean(windowValidation.error)}
                        sx={{ bgcolor: DARK.green, '&:hover': { bgcolor: '#059669' } }}
                    >
                        {status === 'idle' ? 'Run' : 'Re-run'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default AutomationDialog;
