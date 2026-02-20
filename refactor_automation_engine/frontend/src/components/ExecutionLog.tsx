import React, { useRef, useEffect } from 'react';

interface LogEntry {
    time: string;
    type: 'info' | 'success' | 'error' | 'warn';
    message: string;
}

interface ExecutionLogProps {
    entries: LogEntry[];
    onClear: () => void;
    isVisible: boolean;
    onToggle: () => void;
}

const ExecutionLog: React.FC<ExecutionLogProps> = ({ entries, onClear, isVisible, onToggle }) => {
    const bodyRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new log
    useEffect(() => {
        if (bodyRef.current && isVisible) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [entries, isVisible]);

    const levelIcon = (level: string) => {
        switch (level) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warn': return '⚠️';
            default: return 'ℹ️';
        }
    };

    if (!isVisible) return null;

    return (
        <div className="execution-log">
            <div className="execution-log__header" onClick={onToggle}>
                <div className="execution-log__title">
                    ▼ Execution Log
                    {entries.length > 0 && (
                        <span className="execution-log__badge">{entries.length}</span>
                    )}
                </div>
                <div className="execution-log__actions">
                    {entries.length > 0 && (
                        <button
                            onClick={e => { e.stopPropagation(); onClear(); }}
                            className="execution-log__clear-btn"
                        >
                            Clear
                        </button>
                    )}
                    <button className="execution-log__close-btn" onClick={e => { e.stopPropagation(); onToggle(); }}>
                        ✕
                    </button>
                </div>
            </div>
            <div className="execution-log__body" ref={bodyRef}>
                {entries.length === 0 ? (
                    <div style={{ color: '#6b6b85', textAlign: 'center', paddingTop: 24 }}>
                        No logs yet. Execute a flow to see logs here.
                    </div>
                ) : (
                    entries.map((entry, index) => (
                        <div key={index} className={`log-entry log-entry--${entry.type}`}>
                            <span className="log-entry__time">{entry.time}</span>
                            <span className="log-entry__icon">{levelIcon(entry.type)}</span>
                            <span className="log-entry__msg">{entry.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ExecutionLog;