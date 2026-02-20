/**
 * Node type definition schema
 */
export interface NodeType {
  type: string;
  category: NodeCategory;
  name: string;
  description: string;
  icon?: string;
  inputs: NodePortDefinition[];
  outputs: NodePortDefinition[];
  parameters: ParameterDefinition[];
  defaultTimeout?: number;
}

/**
 * Node category
 */
export type NodeCategory =
  | 'trigger'
  | 'data'
  | 'browser'
  | 'template'
  | 'logic'
  | 'transform'
  | 'output'
  | 'utility';

/**
 * Port definition
 */
export interface NodePortDefinition {
  id: string;
  label: string;
  type: 'success' | 'error' | 'branch' | 'data';
  required?: boolean;
}

/**
 * Parameter definition
 */
export interface ParameterDefinition {
  name: string;
  type: ParameterType;
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  options?: ParameterOption[];
  placeholder?: string;
}

/**
 * Parameter type
 */
export type ParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'code'
  | 'file'
  | 'json';

/**
 * Option for select/multiselect parameters
 */
export interface ParameterOption {
  label: string;
  value: any;
}
