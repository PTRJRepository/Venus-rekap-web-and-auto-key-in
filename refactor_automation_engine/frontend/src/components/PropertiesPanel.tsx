import React, { useCallback, useMemo, useRef } from 'react';
import { ACTION_DEFINITIONS } from './Sidebar';
import { Node } from '@xyflow/react';

interface PropertiesPanelProps {
    node: Node | null;
    onUpdate: (nodeId: string, updates: Partial<Record<string, any>>) => void;
    onDelete?: () => void;
    onClose: () => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ node, onUpdate, onClose }) => {
    if (!node) return null;

    const nodeData = node.data as Record<string, any>;
    const actionType = nodeData.actionType as string;
    const actionDef = ACTION_DEFINITIONS.find(a => a.type === actionType);
    const params = nodeData.params || {};

    // Use refs to track input values independently from React state
    // This prevents the "last character only" issue
    const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

    // Stable handler that directly updates node data
    const handleParamChange = useCallback((key: string, value: any) => {
        onUpdate(node.id, {
            params: {
                ...(params || {}),
                [key]: value
            }
        });
    }, [node.id, params, onUpdate]);

    const handleLabelChange = useCallback((label: string) => {
        onUpdate(node.id, { label });
    }, [node.id, onUpdate]);

    // Memoized param value getter
    const getParamValue = useCallback((key: string, defaultValue: any = '') => {
        const val = params[key];
        return val !== undefined ? val : defaultValue;
    }, [params]);

    if (!actionDef) {
        return (
            <div className="properties-panel">
                <div className="properties-panel__header">
                    <div className="properties-panel__title">Unknown Action</div>
                    <button className="properties-panel__close" onClick={onClose}>✕</button>
                </div>
                <div className="properties-panel__section">
                    <p style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        Action type "{actionType}" not found.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="properties-panel">
            <div className="properties-panel__header">
                <div className="properties-panel__title">
                    {nodeData.label || actionType}
                </div>
                <button className="properties-panel__close" onClick={onClose}>✕</button>
            </div>

            {/* Node Info */}
            <div className="properties-panel__section">
                <div className="properties-panel__section-title">Node Settings</div>
                <div className="properties-panel__field">
                    <label className="properties-panel__label">Display Name</label>
                    <input
                        key={`label-${node.id}`}
                        className="properties-panel__input"
                        defaultValue={nodeData.label || ''}
                        onChange={e => handleLabelChange(e.target.value)}
                        placeholder="Enter display name..."
                    />
                </div>
                <div className="properties-panel__field">
                    <label className="properties-panel__label">Action Type</label>
                    <select
                        key={`actionType-${node.id}`}
                        className="properties-panel__select"
                        value={actionType}
                        onChange={e => {
                            const newActionType = e.target.value;
                            const newActionDef = ACTION_DEFINITIONS.find(a => a.type === newActionType);
                            const newParams = Object.fromEntries(
                                (newActionDef?.params || []).map(p => [p.key, p.default ?? ''])
                            );
                            onUpdate(node.id, {
                                label: newActionDef?.label || newActionType,
                                actionType: newActionType,
                                params: newParams
                            });
                        }}
                    >
                        {ACTION_DEFINITIONS.map(action => (
                            <option key={action.type} value={action.type}>
                                {action.label} ({action.type})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Parameters */}
            <div className="properties-panel__section">
                <div className="properties-panel__section-title">Parameters</div>
                {actionDef.params.map(paramDef => {
                    const currentValue = getParamValue(paramDef.key, paramDef.default ?? '');
                    const inputKey = `${paramDef.key}-${node.id}-${currentValue}`;

                    return (
                        <div key={paramDef.key} className="properties-panel__field">
                            <label className="properties-panel__label">
                                {paramDef.label}
                                {paramDef.type === 'string' && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '6px' }}>
                                        - Text/Value
                                    </span>
                                )}
                                {paramDef.type === 'number' && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '6px' }}>
                                        - Number
                                    </span>
                                )}
                                {paramDef.type === 'boolean' && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '6px' }}>
                                        - True/False
                                    </span>
                                )}
                                {paramDef.type === 'select' && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '6px' }}>
                                        - Choose
                                    </span>
                                )}
                            </label>
                            
                            {paramDef.type === 'select' ? (
                                <select
                                    key={inputKey}
                                    className="properties-panel__select"
                                    value={currentValue}
                                    onChange={e => handleParamChange(paramDef.key, e.target.value)}
                                >
                                    {paramDef.options?.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            ) : paramDef.type === 'boolean' ? (
                                <select
                                    key={inputKey}
                                    className="properties-panel__select"
                                    value={String(currentValue)}
                                    onChange={e => handleParamChange(paramDef.key, e.target.value === 'true')}
                                >
                                    <option value="false">false</option>
                                    <option value="true">true</option>
                                </select>
                            ) : paramDef.type === 'number' ? (
                                <input
                                    key={inputKey}
                                    className="properties-panel__input"
                                    type="number"
                                    defaultValue={currentValue === '' ? '' : Number(currentValue)}
                                    onChange={e => {
                                        const val = e.target.value;
                                        handleParamChange(paramDef.key, val === '' ? '' : Number(val));
                                    }}
                                    placeholder={paramDef.default !== undefined ? `Default: ${paramDef.default}` : 'Enter number'}
                                />
                            ) : paramDef.key === 'script' ? (
                                <textarea
                                    key={inputKey}
                                    className="properties-panel__input properties-panel__input--textarea"
                                    defaultValue={currentValue}
                                    onChange={e => handleParamChange(paramDef.key, e.target.value)}
                                    rows={5}
                                    placeholder="// Enter JavaScript code here"
                                    style={{ fontFamily: 'monospace', fontSize: '11px' }}
                                />
                            ) : (
                                <input
                                    key={inputKey}
                                    className="properties-panel__input"
                                    type="text"
                                    defaultValue={currentValue}
                                    onChange={e => handleParamChange(paramDef.key, e.target.value)}
                                    placeholder={paramDef.default ? `Default: ${paramDef.default}` : 'Enter value'}
                                    style={{ width: '100%', minWidth: 0 }}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck="false"
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Node ID */}
            <div className="properties-panel__section">
                <div className="properties-panel__section-title">Debug</div>
                <div className="properties-panel__field">
                    <label className="properties-panel__label">Node ID</label>
                    <input 
                        className="properties-panel__input" 
                        value={node.id} 
                        disabled 
                        style={{ opacity: 0.5, fontSize: '10px' }} 
                    />
                </div>
                {params && Object.keys(params).length > 0 && (
                    <div className="properties-panel__field">
                        <label className="properties-panel__label">Current Params (Debug)</label>
                        <pre style={{ 
                            background: 'var(--bg-deep)', 
                            padding: '8px', 
                            borderRadius: '4px', 
                            fontSize: '9px', 
                            color: 'var(--accent-info)',
                            maxHeight: '150px',
                            overflow: 'auto'
                        }}>
                            {JSON.stringify(params, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PropertiesPanel;
