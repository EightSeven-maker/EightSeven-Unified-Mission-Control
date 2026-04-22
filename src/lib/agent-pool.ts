/**
 * Agent Pool Registry — tracks all agents available to the Mission Control system.
 *
 * Manages both Jarvis (OpenClaw Gateway) and Harvey (Hermes Telegram) agents,
 * including their capabilities, status, and routing configuration.
 */

import { isHermesReachable, getHermesStatus, type HermesStatus } from "./hermes-api";
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
  | "telegram";

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
  description: "OpenClaw Gateway agent — all tasks, projects, code, research, files, chat, and automation",
  capabilities: ["code", "research", "files", "gateway", "chat", "tasks", "projects", "quick-reply", "telegram"],
  status: "unknown",
  requiresApproval: true, // Quality Gate - Jarvis needs approval before completing tasks
  metrics: { totalTokens: 0, totalCost: 0, tasksCompleted: 0, tasksInProgress: 0 },
};

const HARVEY_INFO: AgentInfo = {
  id: "harvey",
  name: "Harvey",
  description: "Telegram agent — all tasks, projects, code, research, chat, and quick replies",
  capabilities: ["code", "research", "files", "gateway", "chat", "tasks", "projects", "quick-reply", "telegram"],
  status: "unknown",
  requiresApproval: true, // Quality Gate - Harvey needs approval before completing tasks
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
 * Get agent status — pings each agent to determine availability
 */
export async function refreshAgentStatus(): Promise<AgentInfo[]> {
  // Check Jarvis (OpenClaw Gateway)
  const jarvisStatus: AgentStatus = await checkJarvisStatus();

  // Check Harvey (Hermes Telegram)
  const harveyStatus: AgentStatus = await checkHarveyStatus();

  // Update cache
  cachedAgents = cachedAgents.map((agent) => ({
    ...agent,
    status: agent.id === "jarvis" ? jarvisStatus : harveyStatus,
    lastActive: Date.now(),
  }));

  return [...cachedAgents];
}

async function checkJarvisStatus(): Promise<AgentStatus> {
  try {
    // Try a lightweight gateway call to check if Jarvis is responsive
    const result = await gatewayCall<{ status?: string }>(
      "system.health",
      {},
      5000
    );
    return result?.status === "ok" ? "online" : "offline";
  } catch {
    // If gateway call fails, try a simpler health check
    try {
      const sessions = await gatewayCall<{ count?: number }>(
        "sessions.list",
        { limit: 1 },
        5000
      );
      return sessions !== undefined ? "online" : "offline";
    } catch {
      return "offline";
    }
  }
}

async function checkHarveyStatus(): Promise<AgentStatus> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return "offline";
  }
  try {
    const reachable = await isHermesReachable(botToken);
    if (!reachable) return "offline";

    // Also try to get more detailed status
    const chatId = process.env.HERMES_CHAT_ID
      ? Number(process.env.HERMES_CHAT_ID)
      : undefined;
    if (chatId) {
      const status = await getHermesStatus(botToken, chatId);
      return status.online ? "online" : "offline";
    }
    return "online";
  } catch {
    return "offline";
  }
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
    return dispatchToHarvey<T>({ message });
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
  message: string;
}): Promise<T> {
  const { botToken, chatId } = getHermesConfig();

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }

  const numericChatId = chatId ? Number(chatId) : await getMyChatId(botToken);
  const { sendMessage } = await import("./hermes-api");

  const result = await sendMessage(botToken, numericChatId, opts.message);
  return result as T;
}

function getHermesConfig(): { botToken: string; chatId: string } {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.HERMES_CHAT_ID || "";
  return { botToken, chatId };
}

async function getMyChatId(botToken: string): Promise<number> {
  const { getMe } = await import("./hermes-api");
  const me = await getMe(botToken);
  return me.id;
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

export type { HermesStatus };