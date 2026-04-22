/**
 * Agent Pool Registry — tracks all agents available to the Mission Control system.
 *
 * Manages both Jarvis (OpenClaw Gateway) and Harvey (Hermes Telegram) agents,
 * including their capabilities, status, and routing configuration.
 */

import { gatewayCall } from "./openclaw";

// ── Types ─────────────────────────────────────────────

export type AgentId = "jarvis" | "harvey";

export type AgentCapability =
  | "code"
  | "research"
  | "files"
  | "gateway"
  | "chat"
  | "quick-reply"
  | "telegram"
  | "tasks"
  | "projects";

export type AgentStatus = "online" | "offline" | "busy" | "unknown";

export interface AgentMetrics {
  totalTokens: number;
  totalCost: number;
  tasksCompleted: number;
  tasksInProgress: number;
}

export interface AgentInfo {
  id: AgentId;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  status: AgentStatus;
  lastActive?: number;
  metrics?: AgentMetrics;
  requiresApproval?: boolean; // Quality Gate
  metadata?: Record<string, unknown>;
}

export interface AgentPoolConfig {
  agents: AgentInfo[];
  defaultRoutingStrategy: "auto" | "capability-match" | "manual";
}

// ── Agent definitions ─────────────────────────────────

const JARVIS_INFO: AgentInfo = {
  id: "jarvis",
  name: "Jarvis",
  description: "OpenClaw Gateway agent — code, research, files, and automation",
  capabilities: ["code", "research", "files", "gateway", "chat", "tasks", "projects", "quick-reply"],
  status: "online", // Always online since gateway is running
  requiresApproval: true,
  metrics: { totalTokens: 0, totalCost: 0, tasksCompleted: 0, tasksInProgress: 0 },
};

const HARVEY_INFO: AgentInfo = {
  id: "harvey",
  name: "Harvey",
  description: "Strategy agent — code, research, quality control",
  capabilities: ["code", "research", "files", "gateway", "chat", "tasks", "projects", "quick-reply"],
  status: "online", // Always online since gateway is running
  requiresApproval: true,
  metrics: { totalTokens: 0, totalCost: 0, tasksCompleted: 0, tasksInProgress: 0 },
};

// ── Registry ─────────────────────────────────────────

let cachedAgents: AgentInfo[] = [JARVIS_INFO, HARVEY_INFO];

/**
 * Get all registered agents
 */
export function getAllAgents(): AgentInfo[] {
  return [...cachedAgents];
}

/**
 * Get a specific agent by ID
 */
export function getAgent(id: AgentId): AgentInfo | undefined {
  return cachedAgents.find((a) => a.id === id);
}

/**
 * Find agents that have a specific capability
 */
export function findAgentsByCapability(capability: AgentCapability): AgentInfo[] {
  return cachedAgents.filter((a) => a.capabilities.includes(capability));
}

/**
 * Get agent status — already set to online in definitions
 */
export async function refreshAgentStatus(): Promise<AgentInfo[]> {
  cachedAgents = cachedAgents.map((agent) => ({
    ...agent,
    lastActive: Date.now(),
  }));
  return [...cachedAgents];
}

// ── Routing Engine ────────────────────────────────

export type RoutingStrategy = "auto" | "capability-match" | "manual";

export interface RouteRequest {
  taskTitle: string;
  taskDescription?: string;
  requiredCapabilities?: AgentCapability[];
  preferredAgent?: AgentId;
  routingStrategy?: RoutingStrategy;
}

export interface RouteResult {
  agentId: AgentId;
  agent: AgentInfo;
  confidence: number;
  reason: string;
}

/**
 * Route a task to the appropriate agent based on strategy.
 *
 * Strategies:
 * - "auto": Best agent based on capabilities + availability
 * - "capability-match": Match required capabilities
 * - "manual": Use preferred agent if available
 */
export async function routeTask(request: RouteRequest): Promise<RouteResult> {
  const strategy = request.routingStrategy || "auto";
  const agents = await refreshAgentStatus();

  // Manual routing — use preferred agent
  if (strategy === "manual" && request.preferredAgent) {
    const agent = agents.find((a) => a.id === request.preferredAgent);
    if (agent && agent.status === "online") {
      return {
        agentId: agent.id,
        agent,
        confidence: 1.0,
        reason: `Manual assignment to ${agent.name}`,
      };
    }
    throw new Error(
      `Agent ${request.preferredAgent} is not available`
    );
  }

  // Capability matching
  if (strategy === "capability-match" && request.requiredCapabilities?.length) {
    const matches = agents.filter(
      (a) =>
        a.status === "online" &&
        request.requiredCapabilities!.every((cap) => a.capabilities.includes(cap))
    );

    if (matches.length === 0) {
      throw new Error(
        "No agent available with required capabilities"
      );
    }

    // Return the first matching agent
    const agent = matches[0];
    return {
      agentId: agent.id,
      agent,
      confidence: 1.0,
      reason: `Matched capabilities: ${request.requiredCapabilities.join(", ")}`,
    };
  }

  // Auto routing — use heuristics
  return autoRouteTask(request, agents);
}

/**
 * Auto-route based on task content heuristics
 */
function autoRouteTask(
  request: RouteRequest,
  agents: AgentInfo[]
): RouteResult {
  const titleLower = request.taskTitle.toLowerCase();
  const descLower = (request.taskDescription || "").toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // Heuristics for routing
  const isCodeTask =
    combined.includes("code") ||
    combined.includes("function") ||
    combined.includes("implement") ||
    combined.includes("fix bug") ||
    combined.includes("refactor") ||
    combined.includes("debug") ||
    combined.includes("api") ||
    combined.includes("file") ||
    combined.includes("component") ||
    combined.includes("class");

  const isResearchTask =
    combined.includes("research") ||
    combined.includes("find") ||
    combined.includes("search") ||
    combined.includes("lookup") ||
    combined.includes("information") ||
    combined.includes("what is") ||
    combined.includes("how does");

  const isQuickQuestion =
    combined.includes("?") &&
    combined.length < 150 &&
    !isCodeTask &&
    !isResearchTask;

  // Find available agents
  const onlineAgents = agents.filter((a) => a.status === "online");
  if (onlineAgents.length === 0) {
    throw new Error("No agents are currently online");
  }

  // Route based on task type
  if (isCodeTask || isResearchTask) {
    // Jarvis handles code and research
    const jarvis = onlineAgents.find((a) => a.id === "jarvis");
    if (jarvis) {
      return {
        agentId: "jarvis",
        agent: jarvis,
        confidence: isCodeTask ? 0.95 : 0.85,
        reason: isCodeTask
          ? "Code/automation task detected"
          : "Research task detected",
      };
    }
  }

  // Quick questions → Harvey (for quick replies)
  if (isQuickQuestion) {
    const harvey = onlineAgents.find((a) => a.id === "harvey");
    if (harvey) {
      return {
        agentId: "harvey",
        agent: harvey,
        confidence: 0.9,
        reason: "Quick conversational query",
      };
    }
  }

  // Default to Jarvis for mixed/unknown tasks
  const jarvis = onlineAgents.find((a) => a.id === "jarvis");
  if (jarvis) {
    return {
      agentId: "jarvis",
      agent: jarvis,
      confidence: 0.7,
      reason: "Default routing to code-capable agent",
    };
  }

  // Fallback: return first available agent
  const fallback = onlineAgents[0];
  return {
    agentId: fallback.id,
    agent: fallback,
    confidence: 0.5,
    reason: "Fallback to available agent",
  };
}

// ── Dispatch helpers ────────────────────────────

export interface DispatchOptions {
  taskId: number;
  agentId: AgentId;
  message: string;
  sessionKey?: string;
}

/**
 * Dispatch a task to the specified agent.
 * Returns the result from the agent execution.
 */
export async function dispatchToAgent<T = unknown>(options: DispatchOptions): Promise<T> {
  const { taskId, agentId, message, sessionKey } = options;

  if (agentId === "jarvis") {
    return dispatchToJarvis<T>({ taskId, message, sessionKey });
  }

  if (agentId === "harvey") {
    return dispatchToHarvey<T>({ taskId: options.taskId, message: options.message, sessionKey: options.sessionKey });
  }

  throw new Error(`Unknown agent: ${agentId}`);
}

async function dispatchToJarvis<T>(opts: {
  taskId: number;
  message: string;
  sessionKey?: string;
}): Promise<T> {
  const idempotencyKey = `task-${opts.taskId}-${Date.now()}`;
  const sessionKey = opts.sessionKey || `task-${opts.taskId}`;

  const result = await gatewayCall<T>(
    "agent",
    {
      agentId: "default",
      message: opts.message,
      sessionKey,
      idempotencyKey,
      inputProvenance: {
        kind: "external_user",
        sourceChannel: "mission-control",
        sourceTool: "task-dispatch",
      },
    },
    300000 // 5 min timeout for task execution
  );

  return result;
}

async function dispatchToHarvey<T>(opts: {
  taskId: number;
  message: string;
  sessionKey?: string;
}): Promise<T> {
  const idempotencyKey = `task-${opts.taskId}-${Date.now()}`;
  const sessionKey = opts.sessionKey || `task-${opts.taskId}`;

  // Harvey uses same OpenClaw Gateway with harvey agentId
  const result = await gatewayCall<T>(
    "agent",
    {
      agentId: "harvey", // Dedicated Harvey agent
      message: opts.message,
      sessionKey,
      idempotencyKey,
      inputProvenance: {
        kind: "external_user",
        sourceChannel: "mission-control",
        sourceTool: "task-dispatch",
      },
    },
    300000 // 5 min timeout for task execution
  );

  return result;
}

// ── Agent Metrics ─────────────────────────────────

/**
 * Record task completion and update agent metrics
 */
export function recordTaskCompletion(agentId: AgentId, tokens: number, cost: number): void {
  cachedAgents = cachedAgents.map((agent) => {
    if (agent.id === agentId && agent.metrics) {
      return {
        ...agent,
        metrics: {
          totalTokens: agent.metrics.totalTokens + tokens,
          totalCost: agent.metrics.totalCost + cost,
          tasksCompleted: agent.metrics.tasksCompleted + 1,
          tasksInProgress: Math.max(0, agent.metrics.tasksInProgress - 1),
        },
      };
    }
    return agent;
  });
}

/**
 * Record task started
 */
export function recordTaskStarted(agentId: AgentId): void {
  cachedAgents = cachedAgents.map((agent) => {
    if (agent.id === agentId && agent.metrics) {
      return {
        ...agent,
        metrics: {
          ...agent.metrics,
          tasksInProgress: agent.metrics.tasksInProgress + 1,
        },
      };
    }
    return agent;
  });
}

/**
 * Get agent metrics
 */
export function getAgentMetrics(agentId: AgentId): AgentMetrics | undefined {
  const agent = cachedAgents.find((a) => a.id === agentId);
  return agent?.metrics;
}

/**
 * Get all agents with their metrics
 */
export function getAgentsWithMetrics(): AgentInfo[] {
  return [...cachedAgents];
}

// ── Quality Gates ─────────────────────────────────

/**
 * Check if agent requires approval (Quality Gate)
 */
export function requiresApproval(agentId: AgentId): boolean {
  const agent = cachedAgents.find((a) => a.id === agentId);
  return agent?.requiresApproval ?? false;
}

/**
 * Toggle quality gate for an agent
 */
export function setQualityGate(agentId: AgentId, enabled: boolean): void {
  cachedAgents = cachedAgents.map((agent) => {
    if (agent.id === agentId) {
      return { ...agent, requiresApproval: enabled };
    }
    return agent;
  });
}

// ── Exports ─────────────────────────────────────