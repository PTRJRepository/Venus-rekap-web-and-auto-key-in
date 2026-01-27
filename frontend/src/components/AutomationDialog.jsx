import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, LinearProgress, Switch, FormControlLabel } from '@mui/material';
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
    const [onlyOvertime, setOnlyOvertime] = useState(false);
    const [filterSynced, setFilterSynced] = useState(true);
    const logEndRef = useRef(null);

    // Auto-set Overtime Mode if Compare Mode is Overtime
    useEffect(() => {
        if (open && compareMode === 'overtime') {
            setOnlyOvertime(true);
        } else if (open) {
            setOnlyOvertime(false);
        }
    }, [open, compareMode]);

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

        if (!isExport) addLog('info', `🔍 STRICT FILTERING: Keeping only ${compareMode.toUpperCase()} Mismatches/Missing...`);

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

                // Filter Logic based on Compare Mode
                if (compareMode === 'presence') {
                    const isWorkingStatus = ['HADIR', 'PARTIAL IN', 'PARTIAL OUT'].includes(statusUpper);
                    const isLeaveStatus = ['SAKIT', 'IZIN', 'CUTI', 'ALPHA', 'I', 'S', 'C', 'CT', 'P', 'SD'].some(s => statusUpper.startsWith(s)) || day.isAnnualLeave || day.isSickLeave;

                    if (isWorkingStatus || isLeaveStatus) {
                        if (!millwareRecord) {
                            shouldInclude = true;
                            reason = `${day.status} (Missing in Millware)`;
                        } else {
                            // Record exists, check for Hour Mismatch (Strict Sync)
                            const venusReg = day.regularHours || 0;
                            const millReg = millwareRecord.hours || 0;
                            const hoursMismatch = Math.abs(venusReg - millReg) > 0.1;

                            // Smart Task Code Check
                            let taskCodeMismatch = false;
                            if (millwareRecord) {
                                const tc = (millwareRecord.TaskCode || millwareRecord.taskCode || '').toUpperCase();
                                if (day.isSickLeave) {
                                    if (!tc.includes('GA9127') && !tc.includes('SICK')) taskCodeMismatch = true;
                                } else if (day.isAnnualLeave) {
                                    if (!tc.includes('GA9130') && !tc.includes('ANNUAL')) taskCodeMismatch = true;
                                }
                            }

                            if (hoursMismatch || taskCodeMismatch) {
                                shouldInclude = true;
                                reason = hoursMismatch
                                    ? `Mismatch: Venus(${venusReg}h) vs Mill(${millReg}h)`
                                    : `Task Code Mismatch: Venus(Leave) vs Mill(${millwareRecord?.TaskCode || '?'})`;
                                if (!isExport) addLog('info', `DEBUG INCLUDE [${dateStr}]: ${reason}`);
                            } else {
                                shouldInclude = false;
                                if (!isExport) addLog('info', `DEBUG SKIP [${dateStr}]: Synced (Hours & Task Code match).`);
                            }
                        }
                    }
                } else if (compareMode === 'overtime') {
                    const ot = day.overtimeHours || 0;
                    if (ot > 0) {
                        const millwareOt = (millwareRecord && millwareRecord.ot !== undefined) ? millwareRecord.ot : (millwareRecord ? millwareRecord.hours : 0);

                        if (!millwareRecord) {
                            shouldInclude = true;
                            reason = `OT ${ot}h Missing in backend`;
                        } else if (Math.abs(millwareOt - ot) >= 0.1) {
                            shouldInclude = true;
                            reason = `OT Mismatch (Ven:${ot} vs Mill:${millwareOt})`;
                        }
                    }
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

        return { filtered: employeesToProcess, modeLog: ` (Filtered: ${employeesToProcess.length} employees with mismatches)` };
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
                    options: { onlyOvertime }
                })
            });

            if (!response.ok) {
                const err = await response.json();
                addLog('error', `Export failed: ${err.error}`);
                return;
            }

            const data = await response.json();
            if (data.success && data.data && data.data.filename) {
                addLog('info', `✅ Export generated: ${data.data.filename}`);
                // Trigger Download
                window.open(`/api/export/download/${data.data.filename}`, '_blank');
            } else {
                addLog('error', 'Export response invalid');
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
        if (onlyOvertime) addLog('info', `Mode: Only Overtime (skipping regular attendance)`);

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
                    onlyOvertime,
                    syncMismatchesOnly: filterSynced
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

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
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
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={onlyOvertime}
                                    onChange={(e) => setOnlyOvertime(e.target.checked)}
                                    color="warning"
                                />
                            }
                            label={<Typography variant="body2" sx={{ color: onlyOvertime ? '#fb8c00' : '#888' }}>Only Overtime</Typography>}
                            sx={{ ml: 2 }}
                        />
                        {comparisonData && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={filterSynced}
                                        onChange={(e) => setFilterSynced(e.target.checked)}
                                        color="error"
                                    />
                                }
                                label={<Typography variant="body2" sx={{ color: filterSynced ? '#f44336' : '#888', fontWeight: filterSynced ? 'bold' : 'normal' }}>Filter Synced Matches</Typography>}
                                sx={{ ml: 2 }}
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
