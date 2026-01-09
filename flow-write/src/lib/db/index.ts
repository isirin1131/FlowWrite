/**
 * FlowWrite Database
 *
 * IndexedDB persistence using Dexie.js with a document-oriented schema.
 * Stores workflows as complete JSON documents and settings as key-value pairs.
 */

import Dexie, { type Table } from 'dexie';
import type { Workflow } from '../core';

// ============================================================================
// Record Types
// ============================================================================

/**
 * Workflow storage record
 * Stores the entire workflow object as a JSON document
 */
export interface WorkflowRecord {
  id: string;
  name: string;
  data: string;  // JSON.stringify(Workflow) - stored as string for compatibility
  createdAt: number;
  updatedAt: number;
}

/**
 * Settings storage record
 * Key-value store for app settings, preferences, and API test state
 */
export interface SettingsRecord {
  key: string;
  value: string;  // JSON.stringify(value) - stored as string for compatibility
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
      // Workflows indexed by id (primary), name, and updatedAt for sorting
      workflows: 'id, name, updatedAt',
      // Settings indexed by key (primary)
      settings: 'key'
    });
  }
}

// ============================================================================
// Database Instance
// ============================================================================

export const db = new FlowWriteDB();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Serialize a workflow for storage
 */
export function serializeWorkflow(workflow: Workflow): string {
  // Convert NodeMap to array for JSON serialization
  const serializable = {
    ...workflow,
    nodes: Array.from(workflow.nodes.entries())
  };
  return JSON.stringify(serializable);
}

/**
 * Deserialize a workflow from storage
 */
export function deserializeWorkflow(data: string): Workflow {
  const parsed = JSON.parse(data);
  // Convert nodes array back to Map
  return {
    ...parsed,
    nodes: new Map(parsed.nodes)
  };
}
