/**
 * Execution record
 */
export interface Execution {
  id: string;
  flowId: string;
  flowVersion: number;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  triggerType: TriggerType;
  triggerData?: any;
  input?: any;
  output?: any;
  error?: string;
  nodeExecutions: NodeExecution[];
}

/**
 * Execution status
 */
export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/**
 * Trigger type
 */
export type TriggerType = 'manual' | 'webhook' | 'schedule' | 'event';

/**
 * Node execution record
 */
export interface NodeExecution {
  nodeId: string;
  nodeName: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  input?: any;
  output?: any;
  error?: string;
  retryCount?: number;
}

/**
 * Execution context (passed between nodes)
 */
export interface ExecutionContext {
  flowId: string;
  executionId: string;
  timestamp: string;
  data: Record<string, any>;
  variables: Record<string, any>;
  errors: ErrorRecord[];
  metadata: ExecutionMetadata;
}

/**
 * Error record
 */
export interface ErrorRecord {
  nodeId: string;
  message: string;
  stack?: string;
  timestamp: string;
}

/**
 * Execution metadata
 */
export interface ExecutionMetadata {
  currentNode?: string;
  loopIndex?: number;
  totalLoops?: number;
  remainingRetries?: number;
}
