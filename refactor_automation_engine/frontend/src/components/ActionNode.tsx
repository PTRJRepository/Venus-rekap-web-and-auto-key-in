import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

// Action category → color mapping
const CATEGORY_COLORS: Record<string, string> = {
    browser: '#6366f1',
    input: '#10b981',
    flow: '#f59e0b',
    data: '#3b82f6',
    utility: '#8b5cf6',
    trigger: '#ef4444',
};

// Action type → icon mapping
const ACTION_ICONS: Record<string, string> = {
    navigate: '🌐',
    click: '🖱️',
    type: '⌨️',
    wait: '⏱️',
    waitForElement: '👁️',
    screenshot: '📸',
    pressKey: '⌨️',
    javascript: '🖥️',
    scroll: '📜',
    extract: '📋',
    forEach: '🔄',
    conditional: '🔀',
    setVariable: '💾',
    start: '▶️',
    submit: '📤',
    reloadPage: '🔄',
    include: '📂',
    note: '📝',
};

// Action type → category mapping
const ACTION_CATEGORIES: Record<string, string> = {
    navigate: 'browser',
    click: 'browser',
    reloadPage: 'browser',
    type: 'input',
    pressKey: 'input',
    submit: 'input',
    wait: 'flow',
    waitForElement: 'flow',
    forEach: 'flow',
    conditional: 'flow',
    extract: 'data',
    setVariable: 'data',
    javascript: 'utility',
    screenshot: 'utility',
    scroll: 'utility',
    include: 'utility',
    start: 'trigger',
    note: 'utility',
};

interface ActionNodeData {
    label: string;
    actionType: string;
    params?: Record<string, any>;
    executionStatus?: 'idle' | 'running' | 'success' | 'failed';
    [key: string]: unknown;
}

const ActionNode: React.FC<NodeProps> = memo(({ data, selected }) => {
    const nodeData = data as unknown as ActionNodeData;
    const actionType = nodeData.actionType || 'unknown';
    const category = ACTION_CATEGORIES[actionType] || 'utility';
    const color = CATEGORY_COLORS[category] || '#8b5cf6';
    const icon = ACTION_ICONS[actionType] || '⚙️';
    const status = nodeData.executionStatus || 'idle';

    // Get key params to display on node body
    const params = nodeData.params || {};
    const displayParams = Object.entries(params).slice(0, 3);

    // Special rendering for Notes
    if (actionType === 'note') {
        return (
            <div className={`action-node action-node--note ${selected ? 'selected' : ''}`}>
                <div className="action-node__note-content">
                    {params.text && <div className="action-node__note-text">{params.text}</div>}
                    {params.imageUrl && (
                        <div className="action-node__note-image">
                            <img src={params.imageUrl} alt="Documentation" style={{ maxWidth: '100%', borderRadius: '4px' }} />
                        </div>
                    )}
                </div>
                {/* Note nodes still need handles to be part of the flow if desired, 
                    but often notes are floating. Let's keep handles for flexibility. */}
                <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
                <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
            </div>
        );
    }

    return (
        <div className={`action-node ${selected ? 'selected' : ''} ${status}`}>
            {/* Input Handle */}
            {actionType !== 'start' && (
                <Handle type="target" position={Position.Top} />
            )}

            {/* Header */}
            <div
                className="action-node__header"
                style={{ background: color }}
            >
                <div className="action-node__icon">{icon}</div>
                <span>{nodeData.label || actionType}</span>
            </div>

            {/* Body — show key params */}
            {displayParams.length > 0 && (
                <div className="action-node__body">
                    {displayParams.map(([key, val]) => (
                        <div key={key} className="action-node__param">
                            <span className="action-node__param-key">{key}</span>
                            <span className="action-node__param-val">
                                {typeof val === 'string' ? val : JSON.stringify(val)}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Status indicator */}
            {status !== 'idle' && (
                <div className="action-node__status">
                    <span>
                        {status === 'running' && '⏳'}
                        {status === 'success' && '✅'}
                        {status === 'failed' && '❌'}
                    </span>
                    <span style={{
                        color: status === 'success' ? '#10b981' : status === 'failed' ? '#ef4444' : '#f59e0b'
                    }}>
                        {status}
                    </span>
                </div>
            )}

            {/* Output Handle */}
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
});

ActionNode.displayName = 'ActionNode';

export { ACTION_ICONS, ACTION_CATEGORIES, CATEGORY_COLORS };
export default ActionNode;
