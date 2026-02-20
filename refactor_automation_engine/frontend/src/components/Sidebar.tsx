import React, { useState, useMemo } from 'react';
import { ACTION_ICONS, CATEGORY_COLORS } from './ActionNode';

// Full action definitions
interface ActionDef {
    type: string;
    label: string;
    description: string;
    category: string;
    params: { key: string; label: string; type: 'string' | 'number' | 'boolean' | 'select'; default?: any; options?: string[] }[];
}

const ACTION_DEFINITIONS: ActionDef[] = [
    // === Browser ===
    {
        type: 'navigate', label: 'Navigate', description: 'Go to a URL',
        category: 'browser',
        params: [
            { key: 'url', label: 'URL', type: 'string', default: 'https://example.com' },
        ]
    },
    {
        type: 'click', label: 'Click', description: 'Click an element',
        category: 'browser',
        params: [
            { key: 'selector', label: 'CSS Selector', type: 'string', default: '' },
            { key: 'timeout', label: 'Timeout (ms)', type: 'number', default: 10000 },
        ]
    },
    {
        type: 'reloadPage', label: 'Reload Page', description: 'Refresh the page',
        category: 'browser',
        params: []
    },
    // === Input ===
    {
        type: 'type', label: 'Type Text', description: 'Type into an input field',
        category: 'input',
        params: [
            { key: 'selector', label: 'CSS Selector', type: 'string', default: '' },
            { key: 'value', label: 'Text Value', type: 'string', default: '' },
            { key: 'index', label: 'Element Index', type: 'number' },
            { key: 'smartSelect', label: 'Autocomplete Mode', type: 'boolean', default: false },
        ]
    },
    {
        type: 'pressKey', label: 'Press Key', description: 'Press a keyboard key',
        category: 'input',
        params: [
            { key: 'key', label: 'Key Name', type: 'select', default: 'Enter', options: ['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Backspace', 'Delete'] },
        ]
    },
    {
        type: 'submit', label: 'Submit Form', description: 'Submit a form element',
        category: 'input',
        params: [
            { key: 'selector', label: 'Form Selector', type: 'string', default: '' },
        ]
    },
    // === Flow Control ===
    {
        type: 'wait', label: 'Wait', description: 'Pause for a duration',
        category: 'flow',
        params: [
            { key: 'duration', label: 'Duration (ms)', type: 'number', default: 1000 },
        ]
    },
    {
        type: 'waitForElement', label: 'Wait For Element', description: 'Wait until element appears',
        category: 'flow',
        params: [
            { key: 'selector', label: 'CSS Selector', type: 'string', default: '' },
            { key: 'timeout', label: 'Timeout (ms)', type: 'number', default: 10000 },
        ]
    },
    {
        type: 'forEach', label: 'For Each', description: 'Loop over a data array',
        category: 'flow',
        params: [
            { key: 'collection', label: 'Collection Variable', type: 'string', default: '' },
            { key: 'itemVariable', label: 'Item Variable Name', type: 'string', default: 'item' },
        ]
    },
    {
        type: 'conditional', label: 'Conditional', description: 'Branch based on condition',
        category: 'flow',
        params: [
            { key: 'condition', label: 'JS Expression', type: 'string', default: '' },
        ]
    },
    // === Data ===
    {
        type: 'setVariable', label: 'Set Variable', description: 'Store a value in context',
        category: 'data',
        params: [
            { key: 'variable', label: 'Variable Name', type: 'string', default: '' },
            { key: 'value', label: 'Value', type: 'string', default: '' },
        ]
    },
    {
        type: 'extract', label: 'Extract Data', description: 'Extract data from the page',
        category: 'data',
        params: [
            { key: 'selector', label: 'CSS Selector', type: 'string', default: '' },
            { key: 'attribute', label: 'Attribute (or innerText)', type: 'string', default: 'innerText' },
            { key: 'saveTo', label: 'Save To Variable', type: 'string', default: '' },
        ]
    },
    // === Utility ===
    {
        type: 'javascript', label: 'Run JavaScript', description: 'Execute JS in the page',
        category: 'utility',
        params: [
            { key: 'script', label: 'JavaScript Code', type: 'string', default: '' },
            { key: 'saveTo', label: 'Save Result To', type: 'string' },
        ]
    },
    {
        type: 'screenshot', label: 'Screenshot', description: 'Take a page screenshot',
        category: 'utility',
        params: [
            { key: 'filename', label: 'Filename', type: 'string', default: 'screenshot.png' },
            { key: 'fullPage', label: 'Full Page', type: 'boolean', default: true },
        ]
    },
    {
        type: 'scroll', label: 'Scroll', description: 'Scroll to element or position',
        category: 'utility',
        params: [
            { key: 'selector', label: 'Target Selector', type: 'string' },
            { key: 'y', label: 'Y Offset (px)', type: 'number' },
        ]
    },
    {
        type: 'include', label: 'Include Template', description: 'Run a sub-template',
        category: 'utility',
        params: [
            { key: 'template', label: 'Template Name', type: 'string', default: '' },
        ]
    },
    {
        type: 'note', label: 'Note / Doc', description: 'Add documentation or note',
        category: 'utility',
        params: [
            { key: 'text', label: 'Content', type: 'string', default: 'Enter your note here...' },
            { key: 'imageUrl', label: 'Image (Base64)', type: 'string' },
        ]
    },
];

// Group by category
const CATEGORIES = [
    { key: 'browser', label: 'Browser', color: CATEGORY_COLORS.browser },
    { key: 'input', label: 'Input', color: CATEGORY_COLORS.input },
    { key: 'flow', label: 'Flow Control', color: CATEGORY_COLORS.flow },
    { key: 'data', label: 'Data', color: CATEGORY_COLORS.data },
    { key: 'utility', label: 'Utility', color: CATEGORY_COLORS.utility },
];

interface SidebarProps {
    onAddNode?: (actionType: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onAddNode }) => {
    const [search, setSearch] = useState('');
    const [editingAction, setEditingAction] = useState<string | null>(null);
    const [editedDefaults, setEditedDefaults] = useState<Record<string, any>>({});

    const filteredActions = useMemo(() => {
        if (!search.trim()) return ACTION_DEFINITIONS;
        const q = search.toLowerCase();
        return ACTION_DEFINITIONS.filter(
            a => a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.type.toLowerCase().includes(q)
        );
    }, [search]);

    const onDragStart = (event: React.DragEvent, actionDef: ActionDef) => {
        const params = Object.fromEntries(
            actionDef.params
                .filter(p => p.default !== undefined)
                .map(p => [
                    p.key, 
                    editedDefaults[`${actionDef.type}.${p.key}`] !== undefined 
                        ? editedDefaults[`${actionDef.type}.${p.key}`] 
                        : p.default
                ])
        );
        
        const data = JSON.stringify({
            actionType: actionDef.type,
            label: actionDef.label,
            params,
        });
        event.dataTransfer.setData('application/reactflow', data);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleEditClick = (e: React.MouseEvent, actionType: string) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingAction(editingAction === actionType ? null : actionType);
    };

    const handleAddClick = (e: React.MouseEvent, actionType: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (onAddNode) {
            onAddNode(actionType);
        }
    };

    const handleDefaultChange = (actionType: string, paramKey: string, value: any) => {
        setEditedDefaults(prev => ({
            ...prev,
            [`${actionType}.${paramKey}`]: value
        }));
    };

    const getDefaultForAction = (actionType: string, paramKey: string, originalDefault: any) => {
        const key = `${actionType}.${paramKey}`;
        return editedDefaults[key] !== undefined ? editedDefaults[key] : originalDefault;
    };

    return (
        <aside className="sidebar">
            <div className="sidebar__header">
                <div className="sidebar__title">Actions</div>
                <input
                    className="sidebar__search"
                    type="text"
                    placeholder="Search actions..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {CATEGORIES.map(cat => {
                const actions = filteredActions.filter(a => a.category === cat.key);
                if (actions.length === 0) return null;
                return (
                    <div key={cat.key} className="sidebar__category">
                        <div className="sidebar__category-title">
                            <span className="sidebar__category-dot" style={{ background: cat.color }} />
                            {cat.label}
                        </div>
                        {actions.map(action => (
                            <div key={action.type}>
                                <div
                                    className="sidebar__node"
                                    draggable
                                    onDragStart={e => onDragStart(e, action)}
                                    onClick={e => handleAddClick(e, action.type)}
                                    onDoubleClick={e => handleEditClick(e, action.type)}
                                    title="Click to add, Drag to canvas, Double-click to edit defaults"
                                >
                                    <div
                                        className="sidebar__node-icon"
                                        style={{ background: `${cat.color}22`, color: cat.color }}
                                    >
                                        {ACTION_ICONS[action.type] || '⚙️'}
                                    </div>
                                    <div className="sidebar__node-info">
                                        <div className="sidebar__node-name">
                                            {action.label}
                                            {editedDefaults[`${action.type}.${action.params[0]?.key}`] !== undefined && (
                                                <span style={{ fontSize: '9px', color: 'var(--accent-success)', marginLeft: '4px' }}>●</span>
                                            )}
                                        </div>
                                        <div className="sidebar__node-desc">{action.description}</div>
                                    </div>
                                    <div className="sidebar__node-actions">
                                        <button
                                            className="sidebar__node-btn"
                                            onClick={e => handleEditClick(e, action.type)}
                                            title="Edit default values"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="sidebar__node-btn sidebar__node-btn--add"
                                            onClick={e => handleAddClick(e, action.type)}
                                            title="Add to canvas"
                                        >
                                            ➕
                                        </button>
                                    </div>
                                </div>

                                {/* Edit Panel for Defaults */}
                                {editingAction === action.type && (
                                    <div className="sidebar__edit-panel">
                                        <div className="sidebar__edit-panel-header">
                                            <span>Edit Defaults: {action.label}</span>
                                            <button
                                                onClick={() => setEditingAction(null)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer',
                                                    fontSize: '16px'
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        {action.params.map(param => (
                                            <div key={param.key} className="sidebar__edit-field">
                                                <label className="sidebar__edit-label">{param.label}</label>
                                                {param.type === 'boolean' ? (
                                                    <select
                                                        className="sidebar__edit-input"
                                                        value={String(getDefaultForAction(action.type, param.key, param.default ?? false))}
                                                        onChange={e => handleDefaultChange(action.type, param.key, e.target.value === 'true')}
                                                    >
                                                        <option value="false">false</option>
                                                        <option value="true">true</option>
                                                    </select>
                                                ) : param.type === 'number' ? (
                                                    <input
                                                        className="sidebar__edit-input"
                                                        type="number"
                                                        value={getDefaultForAction(action.type, param.key, param.default ?? '')}
                                                        onChange={e => handleDefaultChange(action.type, param.key, Number(e.target.value))}
                                                    />
                                                ) : (
                                                    <input
                                                        className="sidebar__edit-input"
                                                        type="text"
                                                        value={getDefaultForAction(action.type, param.key, param.default ?? '')}
                                                        onChange={e => handleDefaultChange(action.type, param.key, e.target.value)}
                                                        placeholder="Enter default value"
                                                    />
                                                )}
                                            </div>
                                        ))}
                                        <div className="sidebar__edit-actions">
                                            <button
                                                className="sidebar__edit-btn sidebar__edit-btn--reset"
                                                onClick={() => {
                                                    const newDefaults = { ...editedDefaults };
                                                    action.params.forEach(p => {
                                                        delete newDefaults[`${action.type}.${p.key}`];
                                                    });
                                                    setEditedDefaults(newDefaults);
                                                }}
                                            >
                                                Reset
                                            </button>
                                            <button
                                                className="sidebar__edit-btn sidebar__edit-btn--save"
                                                onClick={() => setEditingAction(null)}
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                );
            })}
        </aside>
    );
};

export { ACTION_DEFINITIONS };
export default Sidebar;