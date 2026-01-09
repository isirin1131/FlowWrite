/**
 * Workflow Persistence
 *
 * CRUD operations for workflow storage in IndexedDB.
 */

import { db, serializeWorkflow, deserializeWorkflow, type WorkflowRecord } from './index';
import type { Workflow } from '../core';

// ============================================================================
// Types
// ============================================================================

/**
 * Summary of a workflow for listing (without full data)
 */
export interface WorkflowSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Save a workflow to the database
 * Creates new or updates existing based on workflow.id
 */
export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const now = Date.now();
  const existing = await db.workflows.get(workflow.id);

  const record: WorkflowRecord = {
    id: workflow.id,
    name: workflow.name,
    data: serializeWorkflow(workflow),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  await db.workflows.put(record);
}

/**
 * Load a workflow from the database by ID
 */
export async function loadWorkflow(id: string): Promise<Workflow | null> {
  const record = await db.workflows.get(id);
  if (!record) return null;

  return deserializeWorkflow(record.data);
}

/**
 * List all workflows (returns summaries without full data)
 */
export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const records = await db.workflows
    .orderBy('updatedAt')
    .reverse()
    .toArray();

  return records.map(({ id, name, createdAt, updatedAt }) => ({
    id,
    name,
    createdAt,
    updatedAt
  }));
}

/**
 * Delete a workflow from the database
 */
export async function deleteWorkflow(id: string): Promise<void> {
  await db.workflows.delete(id);
}

/**
 * Check if a workflow exists in the database
 */
export async function workflowExists(id: string): Promise<boolean> {
  const count = await db.workflows.where('id').equals(id).count();
  return count > 0;
}

/**
 * Get the count of all workflows
 */
export async function getWorkflowCount(): Promise<number> {
  return db.workflows.count();
}

/**
 * Clear all workflows from the database
 */
export async function clearAllWorkflows(): Promise<void> {
  await db.workflows.clear();
}
