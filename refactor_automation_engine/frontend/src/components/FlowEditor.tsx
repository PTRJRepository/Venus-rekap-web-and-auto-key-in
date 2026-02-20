import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    MiniMap,
    Edge,
    Node,
    useReactFlow,
    OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { io, Socket } from 'socket.io-client';

import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import PropertiesPanel from './PropertiesPanel';
import ExecutionLog from './ExecutionLog';
import ActionNode from './ActionNode';
import ImportModal, { TemplateInfo } from './ImportModal';
import RecordModal from './RecordModal';

const nodeTypes = {
    actionNode: ActionNode,
};

const initialNodes: Node[] = [
    {
        id: 'start-1',
        type: 'actionNode',
        position: { x: 300, y: 50 },
        data: {
            label: 'Start',
            actionType: 'start',
            params: {},
        },
    },
];

const initialEdges: Edge[] = [];

interface FlowEditorState {
    flowName: string;
    loadedFilename: string | null;
    isRunning: boolean;
    isRecording: boolean;
    showImportModal: boolean;
    showRecordModal: boolean;
    templates: TemplateInfo[];
    showSidebar: boolean;
    showLog: boolean;
    showToolbar: boolean;
    extraFlowData: Record<string, any>;
}

// Sub-component to access useReactFlow hook
const FlowCanvas: React.FC<any> = ({
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    onNodeClick, onPaneClick, onNodeContextMenu, onEdgeContextMenu, setNodes, addLog
}) => {
    const { screenToFlowPosition } = useReactFlow();

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');

            // check if the dropped element is valid
            if (typeof type === 'undefined' || !type) {
                return;
            }

            const actionData = JSON.parse(type);
            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode: Node = {
                id: uuidv4(),
                type: 'actionNode',
                position,
                data: {
                    label: actionData.label || actionData.actionType,
                    actionType: actionData.actionType,
                    params: actionData.params || {},
                    executionStatus: 'idle',
                },
            };

            setNodes((nds: Node[]) => nds.concat(newNode));
            addLog('info', `➕ Added action: ${actionData.label || actionData.actionType}`);
        },
        [screenToFlowPosition, setNodes, addLog]
    );

    return (
        <div className="canvas-container">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onNodeContextMenu={onNodeContextMenu}
                onEdgeContextMenu={onEdgeContextMenu}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                fitView
                snapToGrid
                snapGrid={[15, 15]}
            >
                <Background color="#2d2d50" gap={20} />
                <Controls />
                <MiniMap
                    nodeColor={(node) => {
                        const actionType = (node as Node).data?.actionType;
                        switch (actionType) {
                            case 'navigate': return '#6366f1';
                            case 'click':
                            case 'type': return '#10b981';
                            case 'forEach':
                            case 'conditional':
                            case 'wait': return '#f59e0b';
                            default: return '#3b82f6';
                        }
                    }}
                    maskColor="rgba(15, 15, 26, 0.8)"
                />
            </ReactFlow>

            {nodes.length === 1 && nodes[0].id === 'start-1' && (
                <div className="empty-state">
                    <div className="empty-state__icon">🎬</div>
                    <div className="empty-state__text">Start building your flow</div>
                    <div className="empty-state__hint">
                        Drag actions from the sidebar or import a template
                    </div>
                </div>
            )}
        </div>
    );
};

const FlowEditor: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const clipboardRef = useRef<Node | null>(null);
    
    // FIX: Add ref for tracking last recorded event to prevent duplicates
    const lastRecordedEventRef = useRef<{ type: string; selector?: string; url?: string; timestamp: number } | null>(null);

    const [state, setState] = useState<FlowEditorState>({
        flowName: 'Untitled Flow',
        loadedFilename: null,
        isRunning: false,
        isRecording: false,
        showImportModal: false,
        showRecordModal: false,
        templates: [],
        showSidebar: true,
        showLog: false,
        showToolbar: true,
        extraFlowData: {},
    });

    const [hasClipboard, setHasClipboard] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null; edgeId: string | null } | null>(null);

    const [logEntries, setLogEntries] = useState<Array<{
        time: string;
        type: 'info' | 'success' | 'error' | 'warn';
        message: string;
    }>>([]);

    useEffect(() => {
        socketRef.current = io('http://localhost:5001');
        socketRef.current.on('execution:log', ({ message, level }: any) => {
            addLog(level === 'success' ? 'success' : level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info', message);
            if (level === 'error' || level === 'success') setState(prev => ({ ...prev, showLog: true }));
        });
        socketRef.current.on('execution:step', ({ nodeId, status }: any) => updateNodeStatus(nodeId, status));
        socketRef.current.on('execution:complete', ({ status }: any) => {
            setState(prev => ({ ...prev, isRunning: false, showLog: true }));
            addLog(status === 'success' ? 'success' : 'warn', `Flow execution ${status}`);
        });
        socketRef.current.on('recording:event', (event: any) => {
            // Ignore explicit waitForElement events from backend to avoid duplicates
            if (event.type === 'waitForElement') return;
            
            // FIX: Duplicate detection - skip if same event within 500ms
            const now = Date.now();
            const lastEvent = lastRecordedEventRef.current;
            if (lastEvent && 
                lastEvent.type === event.type &&
                lastEvent.selector === event.selector &&
                lastEvent.url === event.url &&
                (now - lastEvent.timestamp) < 500) {
                console.log('[FlowEditor] Skipping duplicate event:', event.type, event.selector);
                return;
            }
            
            // Update last recorded event
            lastRecordedEventRef.current = {
                type: event.type,
                selector: event.selector,
                url: event.url,
                timestamp: now
            };

            addLog('info', `🎥 Recorded: ${event.type} ${event.url || event.selector || ''}`);

            // Use a functional update to ensure we have the latest nodes
            setNodes((prevNodes) => {
                const lastNode = prevNodes[prevNodes.length - 1];
                const lastY = lastNode ? lastNode.position.y : 50;

                // For 'navigate', we don't need a validation node before it
                if (event.type === 'navigate') {
                    const navNodeId = uuidv4();
                    const navNode: Node = {
                        id: navNodeId,
                        type: 'actionNode',
                        position: { x: 300, y: lastY + 100 },
                        data: {
                            label: event.label || `Navigate to ${event.url}`,
                            actionType: 'navigate',
                            params: { url: event.params?.url || event.url },
                            executionStatus: 'idle'
                        }
                    };

                    // Update edges in a separate state update to avoid race conditions
                    setTimeout(() => {
                        setEdges((prevEdges) => {
                            if (!lastNode) return prevEdges;
                            // Avoid duplicate edges
                            const edgeExists = prevEdges.some(e => e.source === lastNode.id && e.target === navNodeId);
                            if (edgeExists) return prevEdges;
                            return [...prevEdges, {
                                id: uuidv4(),
                                source: lastNode.id,
                                target: navNodeId,
                                type: 'smoothstep'
                            }];
                        });
                    }, 0);

                    return [...prevNodes, navNode];
                }

                // For other actions, create validation + action
                // 1. Create Wait For Element (Validation) node
                const waitNodeId = uuidv4();
                const waitNode: Node = {
                    id: waitNodeId,
                    type: 'actionNode',
                    position: { x: 300, y: lastY + 100 },
                    data: {
                        label: `Wait for ${event.label || event.selector}`,
                        actionType: 'waitForElement',
                        params: { selector: event.selector, timeout: 10000 },
                        executionStatus: 'idle'
                    }
                };

                // 2. Create the Action node
                const actionNodeId = uuidv4();
                const actionNode: Node = {
                    id: actionNodeId,
                    type: 'actionNode',
                    position: { x: 300, y: lastY + 220 },
                    data: {
                        label: event.label || `${event.type} on ${event.selector}`,
                        actionType: event.type,
                        params: {
                            selector: event.selector,
                            value: event.value,
                            timeout: 10000
                        },
                        executionStatus: 'idle'
                    }
                };

                // Add edges after nodes are added (using setTimeout to avoid race conditions)
                setTimeout(() => {
                    setEdges((prevEdges) => {
                        const newEdges = [...prevEdges];
                        if (lastNode) {
                            const edgeExists = prevEdges.some(e => e.source === lastNode.id && e.target === waitNodeId);
                            if (!edgeExists) {
                                newEdges.push({
                                    id: uuidv4(),
                                    source: lastNode.id,
                                    target: waitNodeId,
                                    type: 'smoothstep'
                                });
                            }
                        }
                        const waitToActionExists = prevEdges.some(e => e.source === waitNodeId && e.target === actionNodeId);
                        if (!waitToActionExists) {
                            newEdges.push({
                                id: uuidv4(),
                                source: waitNodeId,
                                target: actionNodeId,
                                type: 'smoothstep'
                            });
                        }
                        return newEdges;
                    });
                }, 0);

                return [...prevNodes, waitNode, actionNode];
            });
        });
        return () => { socketRef.current?.disconnect(); };
    }, []);

    useEffect(() => { fetchTemplates(); }, []);

    const fetchTemplates = async () => {
        try {
            const response = await fetch('/api/templates');
            if (response.ok) {
                const data = await response.json();
                setState(prev => ({ ...prev, templates: data.templates || [] }));
            }
        } catch (error) { console.error('Failed to load templates:', error); }
    };

    const updateNodeStatus = (nodeId: string, status: 'idle' | 'running' | 'success' | 'failed') => {
        setNodes((nds) => nds.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, executionStatus: status } } : node));
    };

    const onConnect: OnConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds)), [setEdges]);
    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);
    const onPaneClick = useCallback(() => { setSelectedNode(null); setContextMenu(null); }, []);

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();
        setSelectedNode(node);
        setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id, edgeId: null });
    }, []);

    const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, nodeId: null, edgeId: edge.id });
    }, []);

    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    const addNode = useCallback((actionType: string) => {
        const newNode: Node = {
            id: uuidv4(),
            type: 'actionNode',
            position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
            data: { label: actionType, actionType: actionType, params: {}, executionStatus: 'idle' },
        };
        setNodes((nds) => [...nds, newNode]);
    }, [setNodes]);

    const updateNodeData = useCallback((nodeId: string, newData: any) => {
        setNodes((nds) => nds.map((node) => {
            if (node.id === nodeId) {
                const dataToUpdate = typeof newData === 'function' ? newData(node.data) : newData;
                return { ...node, data: { ...node.data, ...dataToUpdate } };
            }
            return node;
        }));
    }, [setNodes]);

    const deleteSelectedNode = useCallback(() => {
        if (!selectedNode) return;
        setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
        setEdges((eds) => eds.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
        setSelectedNode(null);
    }, [selectedNode, setNodes, setEdges]);

    const deleteEdge = useCallback((edgeId: string) => {
        setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
        addLog('info', '🔌 Connection removed');
    }, [setEdges]);

    const disconnectNode = useCallback((nodeId: string) => {
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
        addLog('info', '🔌 All node connections removed');
    }, [setEdges]);

    const handleClear = useCallback(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
        setSelectedNode(null);
        addLog('info', '🗑️ Canvas cleared');
    }, [setNodes, setEdges]);

    const handleSave = useCallback(() => {
        const flowData = { id: uuidv4(), name: state.flowName, nodes, edges };
        const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.flowName.toLowerCase().replace(/\s+/g, '-')}.flow.json`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('success', `💾 Flow saved: ${a.download}`);
    }, [state.flowName, nodes, edges]);

    const handleSaveToTemplate = useCallback(async () => {
        if (!state.flowName || state.flowName === 'Untitled Flow') {
            addLog('warn', '⚠️ Please give your flow a name first');
            return;
        }

        const templateId = state.loadedFilename
            ? state.loadedFilename.replace('.flow.json', '')
            : state.flowName.toLowerCase().replace(/\s+/g, '-');

        addLog('info', `💾 Attempting to save template: ${templateId}...`);

        try {
            const flowData = {
                ...state.extraFlowData,
                id: templateId,
                name: state.flowName,
                nodes,
                edges,
                description: 'Auto-saved from Flow Editor',
                metadata: {
                    lastSaved: new Date().toISOString(),
                    nodeCount: nodes.length
                }
            };

            const response = await fetch(`/api/templates/${templateId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flowData),
            });

            if (response.ok) {
                const result = await response.json();
                addLog('success', `✅ Template successfully overwritten: ${result.filename}`);

                // Update local state
                setState(prev => ({
                    ...prev,
                    loadedFilename: result.filename
                }));

                // Refresh the templates list for the Import Modal
                fetchTemplates();
            } else {
                const error = await response.json();
                addLog('error', `❌ Save failed: ${error.error || 'Unknown error'}`);
            }
        } catch (error: any) {
            addLog('error', `❌ Save error: ${error.message}`);
            console.error('Save error:', error);
        }
    }, [state.flowName, state.loadedFilename, nodes, edges, fetchTemplates]);

    const handleImport = useCallback(() => setState(prev => ({ ...prev, showImportModal: true })), []);

    const handleImportConfirm = useCallback((flowData: any) => {
        if (flowData.nodes && Array.isArray(flowData.nodes)) {
            const sanitizedNodes = flowData.nodes.map((node: any) => ({
                ...node,
                type: node.type || 'actionNode',
                data: { ...node.data, executionStatus: node.data?.executionStatus || 'idle' }
            }));
            setNodes(sanitizedNodes);
        }
        if (flowData.edges && Array.isArray(flowData.edges)) setEdges(flowData.edges);

        // Preserve other properties like dataFile
        const { nodes: _n, edges: _e, name: _name, filename: _f, ...extra } = flowData;

        setState(prev => ({
            ...prev,
            flowName: flowData.name || prev.flowName,
            loadedFilename: flowData.filename || null, // Capture the filename for later overwrite
            showImportModal: false,
            extraFlowData: extra
        }));

        addLog('success', `📥 Imported: ${flowData.name || 'Flow Template'}`);
    }, [setNodes, setEdges]);

    const handleImportCancel = useCallback(() => setState(prev => ({ ...prev, showImportModal: false })), []);

    // Global Paste Listener for Images
    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (!blob) continue;

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const base64 = e.target?.result as string;
                        // Create a note node with the image
                        const newNode: Node = {
                            id: uuidv4(),
                            type: 'actionNode',
                            position: { x: 400, y: 300 },
                            data: {
                                label: 'Image Note',
                                actionType: 'note',
                                params: {
                                    text: 'Pasted Image',
                                    imageUrl: base64
                                },
                                executionStatus: 'idle'
                            },
                        };
                        setNodes((nds) => [...nds, newNode]);
                        addLog('success', '🖼️ Image pasted as note');
                    };
                    reader.readAsDataURL(blob);
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [setNodes]);

    const toggleSidebar = () => setState(prev => ({ ...prev, showSidebar: !prev.showSidebar }));
    const toggleLog = () => setState(prev => ({ ...prev, showLog: !prev.showLog }));
    const toggleToolbar = () => setState(prev => ({ ...prev, showToolbar: !prev.showToolbar }));

    const handleExecute = useCallback(() => {
        if (!socketRef.current?.connected) { addLog('error', '❌ Not connected to execution server'); return; }
        setState(prev => ({ ...prev, showLog: true }));
        setNodes((nds) => nds.map((node) => ({ ...node, data: { ...node.data, executionStatus: 'idle' as const } })));

        const flowData = {
            ...state.extraFlowData,
            id: uuidv4(),
            name: state.flowName,
            nodes,
            edges
        };

        setState(prev => ({ ...prev, isRunning: true }));
        addLog('info', '▶️ Starting flow execution...');
        socketRef.current.emit('run', flowData);
    }, [state.flowName, nodes, edges, state.extraFlowData]);

    const handleStop = useCallback(() => {
        if (socketRef.current?.connected) socketRef.current.emit('stop');
        setState(prev => ({ ...prev, isRunning: false }));
        addLog('warn', '⏹️ Flow execution stopped');
    }, []);

    const handleStartRecording = useCallback(() => {
        if (!socketRef.current?.connected) { addLog('error', '❌ Not connected to server'); return; }
        setState(prev => ({ ...prev, showRecordModal: true }));
    }, []);

    const handleRecordConfirm = useCallback((url: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('record:start', { url });
            setState(prev => ({ ...prev, isRecording: true, showRecordModal: false }));
            addLog('info', `🔴 Recording started on: ${url}`);
        }
    }, []);

    const handleRecordCancel = useCallback(() => {
        setState(prev => ({ ...prev, showRecordModal: false }));
    }, []);

    const handleStopRecording = useCallback(() => {
        if (socketRef.current?.connected) socketRef.current.emit('record:stop');
        setState(prev => ({ ...prev, isRecording: false }));
        addLog('success', '⏹️ Recording stopped');
    }, []);

    const addLog = (type: 'info' | 'success' | 'error' | 'warn', message: string) => {
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour12: false });
        setLogEntries(prev => [...prev, { time, type, message }]);
    };

    const handleCopy = useCallback(() => {
        if (!selectedNode) { addLog('warn', '⚠️ No node selected to copy'); return; }
        clipboardRef.current = { ...selectedNode };
        setHasClipboard(true);
        addLog('info', `📋 Copied: ${selectedNode.data.label || selectedNode.id}`);
    }, [selectedNode]);

    const handlePaste = useCallback(() => {
        if (!clipboardRef.current) { addLog('warn', '⚠️ Nothing to paste'); return; }
        const newNode = {
            ...clipboardRef.current,
            id: uuidv4(),
            position: { x: (clipboardRef.current.position?.x || 0) + 50, y: (clipboardRef.current.position?.y || 0) + 50 },
            data: { ...clipboardRef.current.data as any, executionStatus: 'idle' as const },
        };
        setNodes((nds) => [...nds, newNode]);
        setSelectedNode(newNode);
        addLog('success', `📄 Pasted: ${(newNode.data as any).label || newNode.id}`);
    }, [setNodes]);

    const handleDuplicate = useCallback(() => {
        if (!selectedNode) { addLog('warn', '⚠️ No node selected to duplicate'); return; }
        const newNode = {
            ...selectedNode,
            id: uuidv4(),
            position: { x: (selectedNode.position?.x || 0) + 40, y: (selectedNode.position?.y || 0) + 40 },
            data: { ...selectedNode.data as any, executionStatus: 'idle' as const },
        };
        setNodes((nds) => [...nds, newNode]);
        setSelectedNode(newNode);
        addLog('success', `📑 Duplicated: ${(newNode.data as any).label || newNode.id}`);
    }, [selectedNode, setNodes]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if ((event.ctrlKey || event.metaKey) && event.key === 'c') { event.preventDefault(); handleCopy(); }
            if ((event.ctrlKey || event.metaKey) && event.key === 'v') { event.preventDefault(); handlePaste(); }
            if ((event.ctrlKey || event.metaKey) && event.key === 'd') { event.preventDefault(); handleDuplicate(); }
            if (event.key === 'Delete' || event.key === 'Backspace') {
                if (selectedNode && selectedNode.data.actionType !== 'start') { event.preventDefault(); deleteSelectedNode(); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNode, handleCopy, handlePaste, handleDuplicate, deleteSelectedNode]);

    return (
        <ReactFlowProvider>
            <div className={`app-layout ${!state.showToolbar ? 'app-layout--no-toolbar' : ''}`}>
                {state.showToolbar && (
                    <Toolbar
                        flowName={state.flowName}
                        loadedFilename={state.loadedFilename}
                        onFlowNameChange={(name) => setState(prev => ({ ...prev, flowName: name }))}
                        onExecute={handleExecute}
                        onStop={handleStop}
                        onSave={handleSave}
                        onSaveToTemplate={handleSaveToTemplate}
                        onClear={handleClear}
                        onStartRecording={handleStartRecording}
                        onStopRecording={handleStopRecording}
                        onImport={handleImport}
                        onCopy={handleCopy}
                        onPaste={handlePaste}
                        onDuplicate={handleDuplicate}
                        isRunning={state.isRunning}
                        isRecording={state.isRecording}
                        hasClipboard={hasClipboard}
                        showSidebar={state.showSidebar}
                        onToggleSidebar={toggleSidebar}
                        showLog={state.showLog}
                        onToggleLog={toggleLog}
                        onToggleToolbar={toggleToolbar}
                    />
                )}

                {!state.showToolbar && (
                    <button className="toolbar-toggle-floating" onClick={toggleToolbar} title="Show Toolbar">▼</button>
                )}

                {state.isRecording && (
                    <div className="recording-banner">
                        <span className="recording-banner__dot" />
                        Recording in progress...
                    </div>
                )}

                <div className="main-content">
                    {state.showSidebar && <Sidebar onAddNode={addNode} />}

                    <FlowCanvas
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        onNodeContextMenu={onNodeContextMenu}
                        onEdgeContextMenu={onEdgeContextMenu}
                        setNodes={setNodes}
                        addLog={addLog}
                    />

                    {selectedNode && (
                        <PropertiesPanel
                            node={selectedNode}
                            onUpdate={updateNodeData}
                            onDelete={deleteSelectedNode}
                            onClose={() => setSelectedNode(null)}
                        />
                    )}

                    {/* Context Menu */}
                    {contextMenu && (
                        <div
                            className="context-menu"
                            style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999 }}
                            onClick={closeContextMenu}
                        >
                            {contextMenu.nodeId && (
                                <>
                                    <div className="context-menu__item" onClick={(e) => { e.stopPropagation(); handleCopy(); closeContextMenu(); }}>📋 Copy</div>
                                    <div className="context-menu__item" onClick={(e) => { e.stopPropagation(); handleDuplicate(); closeContextMenu(); }}>📑 Duplicate</div>
                                    <div className="context-menu__divider" />
                                    <div className={`context-menu__item ${!hasClipboard ? 'context-menu__item--disabled' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); if (hasClipboard) { handlePaste(); closeContextMenu(); } }}>📄 Paste</div>
                                    <div className="context-menu__divider" />
                                    <div className="context-menu__item" onClick={(e) => { e.stopPropagation(); if (contextMenu.nodeId) disconnectNode(contextMenu.nodeId); closeContextMenu(); }}>🔌 Disconnect All</div>
                                    <div className={`context-menu__item ${contextMenu.nodeId === 'start-1' ? 'context-menu__item--disabled' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); if (contextMenu.nodeId !== 'start-1') { deleteSelectedNode(); closeContextMenu(); } }}>🗑️ Delete</div>
                                </>
                            )}
                            {contextMenu.edgeId && (
                                <div className="context-menu__item" onClick={(e) => { e.stopPropagation(); if (contextMenu.edgeId) deleteEdge(contextMenu.edgeId); closeContextMenu(); }}>🔌 Disconnect</div>
                            )}
                        </div>
                    )}
                </div>

                <ExecutionLog entries={logEntries} onClear={() => setLogEntries([])} isVisible={state.showLog} onToggle={toggleLog} />

                {state.showImportModal && (
                    <ImportModal onConfirm={handleImportConfirm} onCancel={handleImportCancel} templates={state.templates} />
                )}

                {state.showRecordModal && (
                    <RecordModal onConfirm={handleRecordConfirm} onCancel={handleRecordCancel} />
                )}
            </div>
        </ReactFlowProvider>
    );
};

export default FlowEditor;