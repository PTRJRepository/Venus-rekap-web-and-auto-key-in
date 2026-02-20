import React from 'react';

interface ToolbarProps {
    flowName: string;
    loadedFilename: string | null;
    onFlowNameChange: (name: string) => void;
    onExecute: () => void;
    onStop: () => void;
    onSave: () => void;
    onSaveToTemplate: () => void;
    onClear: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onImport: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onDuplicate: () => void;
    isRunning: boolean;
    isRecording: boolean;
    hasClipboard: boolean;
    showSidebar: boolean;
    onToggleSidebar: () => void;
    showLog: boolean;
    onToggleLog: () => void;
    onToggleToolbar: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
    flowName, loadedFilename, onFlowNameChange, onExecute, onStop, onSave, onSaveToTemplate, onClear,
    onStartRecording, onStopRecording, onImport, onCopy, onPaste, onDuplicate,
    isRunning, isRecording, hasClipboard,
    showSidebar, onToggleSidebar, showLog, onToggleLog, onToggleToolbar
}) => {
    return (
        <div className="toolbar">
            {/* Logo & Toggle Tools */}
            <div className="toolbar__section">
                <div className="toolbar__logo" title="Venus Automation Studio">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5-10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                    </svg>
                    <span className="toolbar__logo-text">Venus Studio</span>
                </div>
                
                <div className="toolbar__divider" />
                
                <div className="toolbar__toggle-group">
                    <button 
                        className={`toolbar__toggle-btn ${showSidebar ? 'active' : ''}`} 
                        onClick={onToggleSidebar}
                        title={showSidebar ? "Hide Actions Sidebar" : "Show Actions Sidebar"}
                    >
                        <span className="icon">📂</span>
                    </button>
                    <button 
                        className={`toolbar__toggle-btn ${showLog ? 'active' : ''}`} 
                        onClick={onToggleLog}
                        title={showLog ? "Hide Execution Log" : "Show Execution Log"}
                    >
                        <span className="icon">📋</span>
                    </button>
                    <button 
                        className="toolbar__toggle-btn" 
                        onClick={onToggleToolbar}
                        title="Hide Toolbar (Click floating arrow to show again)"
                    >
                        <span className="icon">🔼</span>
                    </button>
                </div>
            </div>

            <div className="toolbar__divider" />

            {/* Flow Name */}
            <div className="toolbar__name-container">
                <input
                    className="toolbar__flow-name"
                    value={flowName}
                    onChange={e => onFlowNameChange(e.target.value)}
                    placeholder="Untitled Flow"
                />
                {loadedFilename && (
                    <div className="toolbar__file-badge" title={`Currently editing ${loadedFilename}`}>
                        📄 {loadedFilename}
                    </div>
                )}
            </div>

            <div className="toolbar__spacer" />

            {/* Edit Actions Group */}
            <div className="toolbar__group">
                <button className="toolbar__btn" onClick={onCopy} title="Copy Node (Ctrl+C)">
                    Copy
                </button>
                <button className="toolbar__btn" onClick={onPaste} title="Paste Node (Ctrl+V)" disabled={!hasClipboard}>
                    Paste
                </button>
                <button className="toolbar__btn" onClick={onDuplicate} title="Duplicate Node (Ctrl+D)">
                    Duplicate
                </button>
            </div>

            <div className="toolbar__divider" />

            {/* File Actions Group */}
            <div className="toolbar__group">
                <button className="toolbar__btn" onClick={onClear} title="Clear Canvas">
                    Clear
                </button>
                <button className="toolbar__btn" onClick={onImport} title="Import Template">
                    Import
                </button>
                <button className="toolbar__btn" onClick={onSave} title="Export to File">
                    Export
                </button>
            </div>

            <div className="toolbar__divider" />

            {/* Primary Actions */}
            <div className="toolbar__section">
                {isRecording ? (
                    <button className="toolbar__btn toolbar__btn--recording" onClick={onStopRecording}>
                        <span className="toolbar__rec-dot" /> Stop
                    </button>
                ) : (
                    <button className="toolbar__btn toolbar__btn--record" onClick={onStartRecording} disabled={isRunning}>
                        <span className="icon">●</span> Record
                    </button>
                )}

                <button 
                    className="toolbar__btn toolbar__btn--primary" 
                    onClick={onSaveToTemplate} 
                    title="Save to Template Library (Overwrites existing)"
                    disabled={!flowName || flowName === 'Untitled Flow'}
                >
                    💾 Save
                </button>

                {isRunning ? (
                    <button className="toolbar__btn toolbar__btn--danger" onClick={onStop}>
                        ⏹ Stop
                    </button>
                ) : (
                    <button className="toolbar__btn toolbar__btn--success" onClick={onExecute} disabled={isRecording}>
                        ▶ Run
                    </button>
                )}
            </div>
        </div>
    );
};

export default Toolbar;