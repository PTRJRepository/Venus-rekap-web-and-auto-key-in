export interface FlowNode {
    id: string; // unique UUID
    type: string; // e.g., 'actionNode', 'decisionNode'
    position: { x: number; y: number }; // reliable UI positioning
    data: {
        label: string;
        actionType: ActionType; // 'click', 'navigate', etc.
        params: Record<string, any>; // { selector: '.btn', url: '...' }
        isStart?: boolean;
        description?: string;
    };
}

export interface FlowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string; // 'success', 'failure', 'true', 'false'
    targetHandle?: string;
    label?: string; // 'onSuccess', 'onFailure', 'true', 'false'
    type?: string; // 'default', 'smoothstep'
    animated?: boolean;
}

export interface AutomationFlow {
    id: string;
    name: string;
    description: string;
    nodes: FlowNode[];
    edges: FlowEdge[];
    metadata: {
        createdAt: number;
        updatedAt: number;
        author?: string;
        version: number;
    };
}

export type ActionType =
    | 'navigate'
    | 'click'
    | 'type' // Input text
    | 'wait'
    | 'waitForElement'
    | 'extract' // Get text/attribute
    | 'screenshot'
    | 'conditional' // If/Else
    | 'loop-start'
    | 'loop-end'
    | 'javascript' // Custom JS execution
    | 'scroll';

export interface ExecutionLog {
    flowId: string;
    status: 'running' | 'completed' | 'failed' | 'stopped';
    startTime: number;
    endTime?: number;
    steps: ExecutionStep[];
}

export interface ExecutionStep {
    nodeId: string;
    actionType: string;
    status: 'pending' | 'success' | 'failed' | 'skipped';
    timestamp: number;
    duration?: number;
    error?: string;
    output?: any; // Data extracted or result
    screenshot?: string; // Base64 or path
}

export interface ActionDefinition {
    type: ActionType;
    label: string;
    description: string;
    params: ActionParam[];
}

export interface ActionParam {
    name: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'json';
    required?: boolean;
    defaultValue?: any;
    options?: { label: string; value: any }[]; // For select type
    placeholder?: string;
}
