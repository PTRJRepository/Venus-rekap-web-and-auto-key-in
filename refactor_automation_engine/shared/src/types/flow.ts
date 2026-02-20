/**
 * Represents a complete automation flow
 */
export interface Flow {
  id: string;
  name: string;
  description?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  nodes: FlowNode[];
  connections: Connection[];
  variables?: Record<string, any>;
  settings?: FlowSettings;
}

/**
 * A node in the flow
 */
export interface FlowNode {
  id: string;
  type: string;
  name: string;
  position: Position;
  parameters: Record<string, any>;
  inputs?: NodeInput[];
  outputs?: NodeOutput[];
  retryPolicy?: RetryPolicy;
  timeout?: number;
}

/**
 * Position on canvas
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Node input connection
 */
export interface NodeInput {
  id: string;
  sourceNodeId?: string;
  sourceOutputId?: string;
}

/**
 * Node output connection
 */
export interface NodeOutput {
  id: string;
  label: string;
  type: 'success' | 'error' | 'branch';
}

/**
 * Connection between two nodes
 */
export interface Connection {
  id: string;
  sourceNodeId: string;
  sourceOutputId: string;
  targetNodeId: string;
  targetInputId: string;
}

/**
 * Retry policy for node execution
 */
export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

/**
 * Flow-level settings
 */
export interface FlowSettings {
  timeout?: number;
  errorHandling?: 'stop' | 'continue' | 'retry';
  parallelExecution?: boolean;
}
