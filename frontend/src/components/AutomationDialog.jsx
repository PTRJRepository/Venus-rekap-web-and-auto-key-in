import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, LinearProgress } from '@mui/material';
import PlayIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import RobotIcon from '@mui/icons-material/SmartToy';

const AutomationDialog = ({ open, onClose, selectedEmployees, month, year }) => {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('idle');
    const logEndRef = useRef(null);

    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    const handleRun = async () => {
        setLogs([]);
        setStatus('running');
        addLog('info', `Starting automation for ${selectedEmployees.length} employees (${month}/${year})`);

        try {
            const response = await fetch('/api/automation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employees: selectedEmployees, month, year })
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

    return (
        <Dialog open={open} onClose={status === 'running' ? undefined : onClose} maxWidth="md" fullWidth PaperProps={{ sx: { minHeight: '60vh', bgcolor: '#1e1e1e', color: '#e0e0e0' } }}>
            <DialogTitle sx={{ borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 1 }}>
                <RobotIcon sx={{ color: '#4caf50' }} />
                <Typography variant="h6" sx={{ flexGrow: 1 }}>Automation Console</Typography>
                {status === 'running' && <Typography variant="caption" sx={{ color: '#fb8c00', border: '1px solid #fb8c00', px: 1, borderRadius: 1 }}>RUNNING</Typography>}
                {status === 'completed' && <Typography variant="caption" sx={{ color: '#4caf50', border: '1px solid #4caf50', px: 1, borderRadius: 1 }}>COMPLETED</Typography>}
                {status === 'failed' && <Typography variant="caption" sx={{ color: '#f44336', border: '1px solid #f44336', px: 1, borderRadius: 1 }}>FAILED</Typography>}
            </DialogTitle>
            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 2, bgcolor: '#252526', borderBottom: '1px solid #333' }}>
                    <Typography variant="body2" sx={{ color: '#aaa' }}>Target: <strong>{selectedEmployees.length} Karyawan</strong> | Periode: <strong>{month}/{year}</strong></Typography>
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
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid #333', p: 2 }}>
                <Button onClick={onClose} disabled={status === 'running'} sx={{ color: '#aaa' }}>Close</Button>
                {status !== 'running' && (
                    <Button variant="contained" color="success" startIcon={status === 'idle' ? <PlayIcon /> : <RefreshIcon />} onClick={handleRun}>
                        {status === 'idle' ? 'Run' : 'Rerun'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default AutomationDialog;
