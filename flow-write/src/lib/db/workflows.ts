/**
 * Workflow Persistence
 *
 * CRUD operations for workflow storage in IndexedDB.
 */

import { db, serializeWorkflow, deserializeWorkflow, type WorkflowRecord } from './index';
import type { WorkflowDefinition } from '../core';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function saveWorkflow(workflow: WorkflowDefinition): Promise<void> {
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

export async function loadWorkflow(id: string): Promise<WorkflowDefinition | null> {
  const record = await db.workflows.get(id);
  if (!record) return null;

  return deserializeWorkflow(record.data);
}

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

export async function deleteWorkflow(id: string): Promise<void> {
  await db.workflows.delete(id);
}

export async function workflowExists(id: string): Promise<boolean> {
  const count = await db.workflows.where('id').equals(id).count();
  return count > 0;
}

export async function getWorkflowCount(): Promise<number> {
  return db.workflows.count();
}

export async function clearAllWorkflows(): Promise<void> {
  await db.workflows.clear();
}
