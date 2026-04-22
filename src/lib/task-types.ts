/**
 * Extended task types for multi-agent routing in Mission Control.
 *
 * Extends the basic KanbanTask with agent pool features:
 * - Capability-based routing
 * - Multi-agent dispatch (Jarvis + Harvey)
 * - Task handoff between agents
 */

import type { AgentCapability, AgentId } from "./agent-pool";

// Re-export agent types
export type { AgentId, AgentCapability };

// ── Extended Task Types ────────────────────────────

/**
 * Extended task fields for multi-agent routing
 */
export interface RoutableTask {
  // Existing fields (from kanban.json)
  id: number;
  title: string;
  description?: string;
  column: string;
  priority: string;
  assignee?: string;
  attachments?: string[];
  agentId?: string;
  dispatchStatus?: DispatchStatus;
  dispatchRunId?: string;
  dispatchedAt?: number;
  completedAt?: number;
  dispatchError?: string;

  // New routing fields
  requiredCapabilities?: AgentCapability[];
  routingStrategy?: RoutingStrategy;
  targetAgent?: AgentId;
  contextFiles?: string[];
  parentTaskId?: number;
  delegationHistory?: DelegationEntry[];
  routingNotes?: string;
}

/**
 * Task dispatch status
 */
export type DispatchStatus =
  | "idle"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "delegating";

/**
 * Routing strategy for task assignment
 */
export type RoutingStrategy =
  | "auto"           // Auto-detect best agent
  | "capability-match" // Match required capabilities
  | "manual";       // Use explicitly assigned agent

/**
 * Entry in the delegation history when task moves between agents
 */
export interface DelegationEntry {
  fromAgent: AgentId;
  toAgent: AgentId;
  timestamp: number;
  reason?: string;
  result?: string;
}

/**
 * Board data with extended fields
 */
export interface RoutableBoard {
  columns: Column[];
  tasks: RoutableTask[];
}

/**
 * Kanban column definition
 */
export interface Column {
  id: string;
  title: string;
  color: string;
}

// ── Default columns ────────────────────────────────

export const DEFAULT_COLUMNS: Column[] = [
  { id: "backlog", title: "Backlog", color: "#6b7280" },
  { id: "in-progress", title: "In Progress", color: "#f59e0b" },
  { id: "review", title: "Review", color: "#8b5cf6" },
  { id: "done", title: "Done", color: "#10b981" },
];

// ── Helper functions ────────────────────────

/**
 * Get default capabilities for a task based on its content
 */
export function inferCapabilities(
  title: string,
  description?: string
): AgentCapability[] {
  const combined = `${title} ${description || ""}`.toLowerCase();
  const capabilities: AgentCapability[] = [];

  if (
    combined.includes("code") ||
    combined.includes("function") ||
    combined.includes("implement") ||
    combined.includes("fix") ||
    combined.includes("refactor") ||
    combined.includes("api") ||
    combined.includes("file") ||
    combined.includes("component")
  ) {
    capabilities.push("code");
  }

  if (
    combined.includes("research") ||
    combined.includes("find") ||
    combined.includes("search") ||
    combined.includes("lookup") ||
    combined.includes("?")
  ) {
    capabilities.push("research");
  }

  if (combined.includes("file") || combined.includes("read")) {
    capabilities.push("files");
  }

  // Default to chat capability if nothing inferred
  if (capabilities.length === 0) {
    capabilities.push("chat");
  }

  return capabilities;
}

/**
 * Get priority weight for sorting
 */
export function getPriorityWeight(priority: string): number {
  switch (priority.toLowerCase()) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

/**
 * Check if a task can be handled by an agent based on capabilities
 */
export function canAgentHandleTask(
  agentCapabilities: AgentCapability[],
  taskCapabilities: AgentCapability[]
): boolean {
  if (!taskCapabilities || taskCapabilities.length === 0) {
    return true; // No requirements = anyone can handle
  }
  return taskCapabilities.every((cap) =>
    agentCapabilities.includes(cap)
  );
}

/**
 * Format task for dispatch to agent
 */
export function formatTaskForDispatch(task: RoutableTask): string {
  const lines = [
    `**Task:** ${task.title}`,
  ];

  if (task.description) {
    lines.push("", task.description);
  }

  if (task.priority) {
    lines.push("", `*Priority:* ${task.priority}`);
  }

  if (task.requiredCapabilities?.length) {
    lines.push(`*Capabilities needed:* ${task.requiredCapabilities.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Check if task needs human review
 */
export function needsReview(task: RoutableTask): boolean {
  return (
    task.dispatchStatus === "completed" &&
    task.priority === "high"
  );
}

/**
 * Get task age in ms
 */
export function getTaskAge(task: RoutableTask): number {
  if (task.dispatchedAt) {
    return Date.now() - task.dispatchedAt;
  }
  return 0;
}

/**
 * Check if task has timed out
 */
export function hasTaskTimedOut(
  task: RoutableTask,
  timeoutMs: number = 300000 // 5 min default
): boolean {
  return getTaskAge(task) > timeoutMs;
}