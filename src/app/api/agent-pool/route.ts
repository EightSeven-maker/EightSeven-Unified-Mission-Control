/**
 * Agent Pool API — multi-agent task coordination
 *
 * Endpoints:
 * GET /api/agent-pool — list agents and their status
 * POST /api/agent-pool/route — route a task to an agent
 * POST /api/agent-pool/dispatch — dispatch a task to a specific agent
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAllAgents,
  getAgent,
  getAgentsWithMetrics,
  refreshAgentStatus,
  routeTask,
  dispatchToAgent,
  requiresApproval,
  setQualityGate,
  type AgentId,
  type RouteRequest,
  type DispatchOptions,
} from "@/lib/agent-pool";
import { formatTaskForDispatch, inferCapabilities } from "@/lib/task-types";

/* ── GET — list agents ────────────────────────── */

export async function GET() {
  try {
    const agents = await refreshAgentStatus();
    return NextResponse.json({
      agents,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("Agent pool GET error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

/* ── POST — actions ──────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === "route") {
      return handleRoute(body);
    }
    if (action === "dispatch") {
      return handleDispatch(body);
    }
    if (action === "refresh") {
      return handleRefresh();
    }

    return NextResponse.json(
      { error: "Unknown action. Use: route, dispatch, refresh" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Agent pool POST error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

/* ── Route handler ──────────────────────────────── */

async function handleRoute(body: {
  taskTitle: string;
  taskDescription?: string;
  requiredCapabilities?: string[];
  preferredAgent?: AgentId;
  routingStrategy?: "auto" | "capability-match" | "manual";
}) {
  const { taskTitle, taskDescription, requiredCapabilities, preferredAgent, routingStrategy } = body;

  if (!taskTitle) {
    return NextResponse.json(
      { error: "taskTitle is required" },
      { status: 400 }
    );
  }

  // Build route request
  const routeReq: RouteRequest = {
    taskTitle,
    taskDescription,
    requiredCapabilities: requiredCapabilities as string[] as any,
    preferredAgent,
    routingStrategy,
  };

  try {
    const result = await routeTask(routeReq);
    return NextResponse.json({
      ...result,
      taskTitle,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

/* ── Dispatch handler ──────────────────────────────── */

async function handleDispatch(body: {
  taskId: number;
  agentId: AgentId;
  message: string;
  sessionKey?: string;
}) {
  const { taskId, agentId, message, sessionKey } = body;

  if (!taskId) {
    return NextResponse.json(
      { error: "taskId is required" },
      { status: 400 }
    );
  }
  if (!agentId) {
    return NextResponse.json(
      { error: "agentId is required (jarvis or harvey)" },
      { status: 400 }
    );
  }
  if (!message) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  // Validate agent exists
  const agent = getAgent(agentId);
  if (!agent) {
    return NextResponse.json(
      { error: `Unknown agent: ${agentId}` },
      { status: 400 }
    );
  }

  const dispatchOpts: DispatchOptions = {
    taskId,
    agentId,
    message,
    sessionKey: sessionKey || `task-${taskId}`,
  };

  try {
    // Refresh agent status first
    await refreshAgentStatus();

    // Dispatch based on agent
    let result: any;
    if (agentId === "jarvis") {
      result = await dispatchToAgent(dispatchOpts);
    } else if (agentId === "harvey") {
      result = await dispatchToHarvey(dispatchOpts);
    } else {
      return NextResponse.json(
        { error: `Agent ${agentId} dispatch not implemented` },
        { status: 501 }
      );
    }

    return NextResponse.json({
      ok: true,
      taskId,
      agentId,
      result,
    });
  } catch (err) {
    console.error("Dispatch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

/* ── Refresh handler ─────────────────────────────── */

async function handleRefresh() {
  const agents = await refreshAgentStatus();
  return NextResponse.json({
    ok: true,
    agents,
    timestamp: Date.now(),
  });
}

/* ── Hermes dispatch helper ─────────────────────── */

async function dispatchToHarvey(opts: {
  taskId: number;
  message: string;
}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }

  const chatId = process.env.HERMES_CHAT_ID
    ? Number(process.env.HERMES_CHAT_ID)
    : undefined;

  if (!chatId) {
    throw new Error("HERMES_CHAT_ID not configured");
  }

  const { sendMessage } = await import("@/lib/hermes-api");
  const result = await sendMessage(botToken, chatId, opts.message);
  return result;
}