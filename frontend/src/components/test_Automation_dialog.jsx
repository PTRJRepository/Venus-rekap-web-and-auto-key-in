import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, LinearProgress, Switch, FormControlLabel, Radio, RadioGroup, FormControl, FormLabel } from '@mui/material';
import PlayIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import StopIcon from '@mui/icons-material/Stop';
import RobotIcon from '@mui/icons-material/SmartToy';
import DownloadIcon from '@mui/icons-material/Download';

const AutomationDialog = ({ open, onClose, selectedEmployees, month, year, compareMode, comparisonData, onRefresh }) => {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('idle');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [onlyOvertime, setOnlyOvertime] = useState(false); // Legacy state for backend flag
    const [filterSynced, setFilterSynced] = useState(true);
    const [targetMode, setTargetMode] = useState('all'); // all, regular, overtime
    const logEndRef = useRef(null);

    // Auto-set Target Mode based on prop
    useEffect(() => {
        if (open) {
            if (compareMode === 'overtime') {
                setTargetMode('overtime');
                setOnlyOvertime(true);
            } else {
                setTargetMode('all'); // Default to all (mismatches)
                setOnlyOvertime(false);
            }
        }
    }, [open, compareMode]);

    // Sync onlyOvertime flag when targetMode changes
    useEffect(() => {
        if (targetMode === 'overtime') setOnlyOvertime(true);
        else setOnlyOvertime(false);
    }, [targetMode]);

    // Auto-Refresh when completed
    useEffect(() => {
        if (status === 'completed' && onRefresh) {
            addLog('info', '🔄 Auto-Refreshing Comparison Data...');
            onRefresh();
        }
    }, [status, onRefresh]);

    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    // FILTER LOGIC
    const filterEmployees = (isExport = false) => {
        // Only filter if compareMode is active AND filterSynced is TRUE
        if (!compareMode || compareMode === 'off' || !comparisonData || !filterSynced) {
            return { filtered: selectedEmployees, modeLog: (!filterSynced ? ' (Filter Disabled)' : '') };
        }

        if (!isExport) addLog('info', `🔍 STRICT FILTERING: Keeping only ${targetMode.toUpperCase()} Mismatches...`);

        const employeesToProcess = selectedEmployees.map(emp => {
            const ptrjId = emp.ptrjEmployeeID;
            if (!ptrjId || ptrjId === 'N/A') return null;

            // Clone attendance map to filter it
            const filteredAttendance = {};
            let hasMismatch = false;

            Object.values(emp.attendance || {}).forEach(day => {
                const dateStr = day.date;
                const key = `${ptrjId}_${dateStr}`;
                const millwareRecord = comparisonData[key];

                // Date range filter (if applied)
                if (startDate && dateStr < startDate) return;
                if (endDate && dateStr > endDate) return;

                let shouldInclude = false;
                let reason = "";

                const statusUpper = (day.status || '').toUpperCase();

                // 1. Initial Inclusion based on Status
                if (!millwareRecord) {
                    // Record missing in Millware
                    shouldInclude = true;
                    reason = `Missing in Millware`;
                } else if (millwareRecord.status === 'MISS') {
                    // Record exists but mismatch
                    shouldInclude = true;
                    reason = `Mismatch detected`;
                }

                // 2. REFINE SELECTION BASED ON TARGET MODE (Critical cleanup)
                if (shouldInclude) {
                    // --- Target: REGULAR ---
                    if (targetMode === 'regular') {
                        if (millwareRecord && millwareRecord.regularMatched === true) {
                            shouldInclude = false; // Matched in Millware
                        } else if (!millwareRecord && (day.regularHours || 0) === 0) {
                            shouldInclude = false; // Missing but Venus 0 Regular => Not a mismatch
                        } else {
                            if (millwareRecord) reason = `Regular Hours Mismatch (${day.regularHours} vs ${millwareRecord.normal || 0})`;
                        }
                    }
                    // --- Target: OVERTIME ---
                    else if (targetMode === 'overtime') {
                        if (millwareRecord && millwareRecord.otMatched === true) {
                            shouldInclude = false; // Matched in Millware
                        } else if (!millwareRecord && (day.overtimeHours || 0) === 0) {
                            shouldInclude = false; // Missing but Venus 0 OT => Not a mismatch
                        } else {
                            if (millwareRecord) reason = `Overtime Mismatch (${day.overtimeHours} vs ${millwareRecord.ot || 0})`;
                        }
                    }
                }

                // Extra check for "Overtime Only" mode from prop (legacy compatibility)
                if (compareMode === 'overtime' && targetMode !== 'overtime') {
                    // If visual mode is QT, but user selected 'Regular', force skip OT matched?
                    // Actually, if compareMode is OT, we usually only care about OT.
                    // But user explicit selection overrides.
                }


                if (shouldInclude) {
                    // --- FALLBACK LOGIC FOR ZERO HOURS ---
                    let finalRegularHours = day.regularHours || 0;
                    const isAnnualLeave = day.isAnnualLeave || ['CT', 'CUTI', 'I', 'IZIN', 'S', 'SAKIT', 'SD'].some(s => statusUpper.startsWith(s));

                    if (finalRegularHours === 0 && (statusUpper === 'HADIR' || statusUpper === 'PARTIAL IN' || isAnnualLeave)) {
                        const dateObj = new Date(dateStr);
                        const dayNum = dateObj.getDay();
                        if (dayNum !== 0) {
                            finalRegularHours = (dayNum === 6) ? 5 : 7;
                            reason += ` (Auto-fixed 0h -> ${finalRegularHours}h)`;
                        }
                    }

                    const fixedDay = { ...day, regularHours: finalRegularHours };
                    if (!isExport) addLog('info', `   • [${dateStr}] ${reason} -> Reg:${finalRegularHours}h, OT:${day.overtimeHours}h`);

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
        addLog('info', '📤 Preparing to Export Miss Only Data...');
        const { filtered: employeesToProcess } = filterEmployees(true);

        if (employeesToProcess.length === 0) {
            addLog('info', '✅ No filtered data to export!');
            return;
        }

        addLog('info', `Sending ${employeesToProcess.length} records to export service...`);

        try {
            const response = await fetch('/api/export/miss-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employees: employeesToProcess,
                    startDate: startDate || `${year}-${String(month).padStart(2, '0')}-01`, // Default to full month if empty
                    endDate: endDate || `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`,
                    options: {
                        onlyOvertime: targetMode === 'overtime',
                        syncRegularOnly: targetMode === 'regular'
                    }
                })
            });

            if (!response.ok) {
                const err = await response.json();
                addLog('error', `Export failed: ${err.error}`);
                return;
            }

            const data = await response.json();
            if (data.success && data.data) {
                if (data.data.filename) {
                    addLog('info', `✅ Export generated: ${data.data.filename}`);
                    // Trigger Download
                    window.open(`/api/export/download/${data.data.filename}`, '_blank');
                } else if (data.data.count === 0) {
                    addLog('info', `✅ No mismatched data found on server (Strict Filter applied).`);
                } else {
                    addLog('error', 'Export response invalid (missing filename)');
                }
            } else {
                addLog('error', 'Export response unsuccessfull');
            }

        } catch (e) {
            addLog('error', `Export error: ${e.message}`);
        }
    };

    const handleRun = async () => {
        setLogs([]);
        setStatus('running');

        const { filtered: employeesToProcess, modeLog } = filterEmployees(false);

        if (employeesToProcess.length === 0 && filterSynced) {
            addLog('info', '✅ All selected records are already synced! Nothing to do.');
            setStatus('completed');
            return;
        }

        addLog('info', `Starting automation for ${employeesToProcess.length} employees (${month}/${year})${modeLog}`);
        if (startDate && endDate) addLog('info', `Date Filter: ${startDate} to ${endDate}`);
        if (targetMode === 'overtime') addLog('info', `Mode: Only Overtime (skipping regular attendance)`);
        if (targetMode === 'regular') addLog('info', `Mode: Only Regular (skipping matched regular hours)`);

        try {
            const response = await fetch('/api/automation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employees: employeesToProcess,
                    month,
                    year,
                    startDate,
                    endDate,
                    onlyOvertime: targetMode === 'overtime',
                    syncMismatchesOnly: filterSynced,
                    syncRegularOnly: targetMode === 'regular'
                })
            });

            if (!response.ok) {
                const err = await response.json();
                addLog('error', err.error || 'Failed to start');
                setStatus('failed');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                for (const line of text.split('\n')) {
                    if (line.startsWith('data: ')) {
                        try {
                            const msg = JSON.parse(line.slice(6));
                            if (msg.type === 'log' || msg.type === 'info') addLog('info', msg.data);
                            else if (msg.type === 'error') addLog('error', msg.data);
                            else if (msg.type === 'status') {
                                if (msg.data === 'completed') setStatus('completed');
                                if (msg.data === 'failed') setStatus('failed');
                            }
                        } catch (e) { }
                    }
                }
            }
        } catch (e) {
            addLog('error', `Connection error: ${e.message}`);
            setStatus('failed');
        }
    };

    const addLog = (type, message) => {
        setLogs(prev => [...prev, { type, message, time: new Date().toLocaleTimeString() }]);
    };

    const handleStop = async () => {
        try {
            await fetch('/api/automation/stop', { method: 'POST' });
            addLog('info', '🛑 Stopping automation process...');
            setStatus('stopped');
        } catch (e) {
            addLog('error', 'Failed to stop process');
        }
    };

    return (
        <Dialog open={open} onClose={status === 'running' ? undefined : onClose} maxWidth="md" fullWidth PaperProps={{ sx: { minHeight: '60vh', bgcolor: '#1e1e1e', color: '#e0e0e0' } }}>
            <DialogTitle sx={{ borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 1 }}>
                <RobotIcon sx={{ color: '#4caf50' }} />
                <Typography component="span" variant="h6" sx={{ flexGrow: 1 }}>Automation Console</Typography>
                {status === 'running' && <Typography component="span" variant="caption" sx={{ color: '#fb8c00', border: '1px solid #fb8c00', px: 1, borderRadius: 1 }}>RUNNING</Typography>}
                {status === 'completed' && <Typography component="span" variant="caption" sx={{ color: '#4caf50', border: '1px solid #4caf50', px: 1, borderRadius: 1 }}>COMPLETED</Typography>}
                {status === 'failed' && <Typography component="span" variant="caption" sx={{ color: '#f44336', border: '1px solid #f44336', px: 1, borderRadius: 1 }}>FAILED</Typography>}
            </DialogTitle>
            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 2, bgcolor: '#252526', borderBottom: '1px solid #333' }}>
                    <Typography variant="body2" sx={{ color: '#aaa', mb: 1 }}>Target: <strong>{selectedEmployees.length} Karyawan</strong> | Periode: <strong>{month}/{year}</strong></Typography>

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.75rem', color: '#888' }}>Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{ background: '#333', border: '1px solid #555', color: 'white', padding: '4px', borderRadius: '4px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.75rem', color: '#888' }}>End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{ background: '#333', border: '1px solid #555', color: 'white', padding: '4px', borderRadius: '4px' }}
                            />
                        </div>

                        {/* Target Mode Selector */}
                        <FormControl component="fieldset" sx={{ ml: 2, border: '1px solid #444', borderRadius: 1, px: 1, py: 0.5 }}>
                            <FormLabel component="legend" sx={{ fontSize: '0.7rem', color: '#AAA' }}>Filter Mode</FormLabel>
                            <RadioGroup
                                row
                                value={targetMode}
                                onChange={(e) => setTargetMode(e.target.value)}
                            >
                                <FormControlLabel
                                    value="all"
                                    control={<Radio size="small" sx={{ color: '#aaa', '&.Mui-checked': { color: '#90caf9' } }} />}
                                    label={<Typography variant="caption" sx={{ color: '#ddd' }}>All Mismatches</Typography>}
                                />
                                <FormControlLabel
                                    value="regular"
                                    control={<Radio size="small" sx={{ color: '#aaa', '&.Mui-checked': { color: '#ce93d8' } }} />}
                                    label={<Typography variant="caption" sx={{ color: '#ddd' }}>Regular Only</Typography>}
                                />
                                <FormControlLabel
                                    value="overtime"
                                    control={<Radio size="small" sx={{ color: '#aaa', '&.Mui-checked': { color: '#ffcc80' } }} />}
                                    label={<Typography variant="caption" sx={{ color: '#ddd' }}>Overtime Only</Typography>}
                                />
                            </RadioGroup>
                        </FormControl>

                        {comparisonData && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={filterSynced}
                                        onChange={(e) => setFilterSynced(e.target.checked)}
                                        color="error"
                                        size="small"
                                    />
                                }
                                label={<Typography variant="caption" sx={{ color: filterSynced ? '#f44336' : '#888', fontWeight: filterSynced ? 'bold' : 'normal' }}>Filter Synced</Typography>}
                                sx={{ ml: 1 }}
                            />
                        )}
                    </Box>

                    {status === 'running' && <LinearProgress color="success" sx={{ mt: 1 }} />}
                </Box>
                <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem', maxHeight: 400 }}>
                    {logs.length === 0 && status === 'idle' && <Typography sx={{ color: '#666', textAlign: 'center', mt: 4 }}>Klik "Run" untuk memulai</Typography>}
                    {logs.map((log, i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                            <span style={{ color: '#666', minWidth: 70 }}>[{log.time}]</span>
                            <span style={{ color: log.type === 'error' ? '#ff5252' : '#d4d4d4' }}>{log.message}</span>
                        </Box>
                    ))}
                    <div ref={logEndRef} />
                </Box>
            </DialogContent >
            <DialogActions sx={{ borderTop: '1px solid #333', p: 2 }}>
                <Button onClick={onClose} disabled={status === 'running'} sx={{ color: '#aaa', mr: 'auto' }}>Close</Button>

                {status !== 'running' && (
                    <Button
                        variant="outlined"
                        color="primary"
                        startIcon={<DownloadIcon />}
                        onClick={handleExportMiss}
                        disabled={!comparisonData || !filterSynced}
                        sx={{ mr: 1 }}
                    >
                        Export Miss Only
                    </Button>
                )}

                {status === 'running' && (
                    <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={handleStop}>
                        Stop
                    </Button>
                )}
                {status !== 'running' && (
                    <Button variant="contained" color="success" startIcon={status === 'idle' ? <PlayIcon /> : <RefreshIcon />} onClick={handleRun}>
                        {status === 'idle' ? 'Run' : 'Rerun'}
                    </Button>
                )}
            </DialogActions>
        </Dialog >
    );
};

export default AutomationDialog;
