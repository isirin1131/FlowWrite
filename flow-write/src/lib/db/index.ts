/**
 * FlowWrite Database
 *
 * IndexedDB persistence using Dexie.js with a document-oriented schema.
 * Stores workflow definitions (metadata only) and settings.
 *
 * Note: Only metadata is persisted. Runtime state belongs in core-runner
 * and is volatile (not stored).
 */

import Dexie, { type Table } from 'dexie';
import type {
  WorkflowDefinition,
  NodeDefinition,
  NodeId,
  TextBlockList,
  AnyTextBlockDef,
  TextBlock,
  VirtualTextBlockDef,
  ApiConfiguration
} from '../core';

// ============================================================================
// Record Types
// ============================================================================

export interface WorkflowRecord {
  id: string;
  name: string;
  data: string;  // JSON.stringify(WorkflowDefinition)
  createdAt: number;
  updatedAt: number;
}

export interface SettingsRecord {
  key: string;
  value: string;
  updatedAt: number;
}

// ============================================================================
// Database Definition
// ============================================================================

class FlowWriteDB extends Dexie {
  workflows!: Table<WorkflowRecord>;
  settings!: Table<SettingsRecord>;

  constructor() {
    super('FlowWriteDB');

    this.version(1).stores({
      workflows: 'id, name, updatedAt',
      settings: 'key'
    });
  }
}

export const db = new FlowWriteDB();

// ============================================================================
// Type Guards for Validation
// ============================================================================

export function isValidTextBlock(obj: unknown): obj is TextBlock {
  if (!obj || typeof obj !== 'object') return false;
  const block = obj as Record<string, unknown>;
  return (
    block.type === 'text' &&
    typeof block.id === 'string' &&
    typeof block.content === 'string'
  );
}

export function isValidVirtualTextBlockDef(obj: unknown): obj is VirtualTextBlockDef {
  if (!obj || typeof obj !== 'object') return false;
  const block = obj as Record<string, unknown>;
  return (
    block.type === 'virtual' &&
    typeof block.id === 'string' &&
    typeof block.sourceNodeId === 'string'
  );
}

export function isValidAnyTextBlockDef(obj: unknown): obj is AnyTextBlockDef {
  return isValidTextBlock(obj) || isValidVirtualTextBlockDef(obj);
}

export function isValidTextBlockList(obj: unknown): obj is TextBlockList {
  if (!obj || typeof obj !== 'object') return false;
  const list = obj as Record<string, unknown>;
  return (
    typeof list.id === 'string' &&
    Array.isArray(list.blocks) &&
    list.blocks.every(isValidAnyTextBlockDef)
  );
}

export function isValidApiConfiguration(obj: unknown): obj is ApiConfiguration {
  if (!obj || typeof obj !== 'object') return false;
  const config = obj as Record<string, unknown>;
  return (
    config.connection !== null &&
    typeof config.connection === 'object' &&
    config.parameters !== null &&
    typeof config.parameters === 'object' &&
    isValidTextBlockList(config.systemPrompt) &&
    isValidTextBlockList(config.userPrompt)
  );
}

export function isValidNodeDefinition(obj: unknown): obj is NodeDefinition {
  if (!obj || typeof obj !== 'object') return false;
  const node = obj as Record<string, unknown>;
  return (
    typeof node.id === 'string' &&
    typeof node.name === 'string' &&
    isValidApiConfiguration(node.apiConfig) &&
    node.position !== null &&
    typeof node.position === 'object'
  );
}

// ============================================================================
// Serialization Functions
// ============================================================================

interface SerializedWorkflow {
  id: string;
  name: string;
  nodes: [NodeId, NodeDefinition][];
}

export function serializeWorkflow(workflow: WorkflowDefinition): string {
  const serializable: SerializedWorkflow = {
    id: workflow.id,
    name: workflow.name,
    nodes: Array.from(workflow.nodes.entries())
  };
  return JSON.stringify(serializable);
}

export function deserializeWorkflow(data: string): WorkflowDefinition {
  const parsed = JSON.parse(data) as SerializedWorkflow;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid workflow data: not an object');
  }

  if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string') {
    throw new Error('Invalid workflow data: missing id or name');
  }

  if (!Array.isArray(parsed.nodes)) {
    throw new Error('Invalid workflow data: nodes is not an array');
  }

  const nodeEntries: [NodeId, NodeDefinition][] = [];
  for (const entry of parsed.nodes) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error('Invalid workflow data: invalid node entry format');
    }
    const [nodeId, node] = entry;
    if (typeof nodeId !== 'string') {
      throw new Error('Invalid workflow data: node ID is not a string');
    }
    if (!isValidNodeDefinition(node)) {
      throw new Error(`Invalid workflow data: invalid node structure for node ${nodeId}`);
    }
    nodeEntries.push([nodeId, node as NodeDefinition]);
  }

  return {
    id: parsed.id,
    name: parsed.name,
    nodes: new Map(nodeEntries)
  };
}

// ============================================================================
// Individual Serialization Helpers
// ============================================================================

export function serializeTextBlockList(list: TextBlockList): string {
  return JSON.stringify(list);
}

export function deserializeTextBlockList(data: string): TextBlockList {
  const parsed = JSON.parse(data);
  if (!isValidTextBlockList(parsed)) {
    throw new Error('Invalid TextBlockList data');
  }
  return parsed;
}

export function serializeNodeDefinition(node: NodeDefinition): string {
  return JSON.stringify(node);
}

export function deserializeNodeDefinition(data: string): NodeDefinition {
  const parsed = JSON.parse(data);
  if (!isValidNodeDefinition(parsed)) {
    throw new Error('Invalid NodeDefinition data');
  }
  return parsed;
}

export function serializeApiConfiguration(config: ApiConfiguration): string {
  return JSON.stringify(config);
}

export function deserializeApiConfiguration(data: string): ApiConfiguration {
  const parsed = JSON.parse(data);
  if (!isValidApiConfiguration(parsed)) {
    throw new Error('Invalid ApiConfiguration data');
  }
  return parsed;
}
