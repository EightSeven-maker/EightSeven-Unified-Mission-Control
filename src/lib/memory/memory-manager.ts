// ============================================================
// AgentMemoryManager — Core 4-Layer Logic
// Layer 3 = Supabase (replaces Obsidian vault)
// Layer 4 = Supabase session_history (replaces session search)
// ============================================================

import {
  loadAgentMemoryContext,
  setWorkingContext,
  addMistake,
  appendToDailyLog,
  saveCheckpoint,
  endSession,
  getMemoryEntries,
  searchSessionHistory,
  getUserProfileKey,
  setUserProfileKey,
  upsertProject,
  addDecision,
  getMistakes,
  getDecisions,
  getProjects,
} from './supabase-adapter';
import type {
  AgentMemoryContext,
  AgentMemoryCheckpoint,
  UserProfile,
  ProjectState,
  DecisionsLog,
  Mistake,
} from './schema';

// ── Session State ────────────────────────────────────────────

const _activeSessions = new Map<
  string,
  {
    agentId: 'jarvis' | 'harvey';
    sessionId: string;
    startedAt: Date;
    toolCallCount: number;
    lastCheckpointAt: number;
    currentTask: string | null;
    context: AgentMemoryContext | null;
  }
>();

// ── Manager Class ────────────────────────────────────────────

export class AgentMemoryManager {
  private agentId: 'jarvis' | 'harvey';
  private sessionId: string;
  private toolCallCount = 0;
  private lastCheckpointAt = 0;
  private currentTask: string | null = null;
  private context: AgentMemoryContext | null = null;
  private flushed = false;

  constructor(agentId: 'jarvis' | 'harvey', sessionId?: string) {
    this.agentId = agentId;
    this.sessionId = sessionId ?? this._generateSessionId();
  }

  private _generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ── Layer 1: Built-in Memory (static, injected from workspace) ──
  // Handled by AGENTS.md / workspace files — not managed here.

  // ── Layer 2: AGENTS.md + SOUL.md (static, injected from workspace) ──
  // Handled by agent workspace files — not managed here.

  // ── Layer 3: Supabase Vault ──
  // Loaded once at session start.

  /** Load all Layer 3 context from Supabase */
  async loadContext(): Promise<AgentMemoryContext> {
    this.context = await loadAgentMemoryContext(this.agentId);
    return this.context;
  }

  getContext(): AgentMemoryContext | null {
    return this.context;
  }

  /** Get context as formatted string for LLM system prompt */
  getContextAsText(): string {
    if (!this.context) return '';

    const lines: string[] = [];
    lines.push('## Agent Memory Context');
    lines.push('');

    // User profile
    if (this.context.userProfile.length) {
      lines.push('### User Profile');
      for (const p of this.context.userProfile) {
        lines.push(`- ${p.key}: ${p.value}`);
      }
      lines.push('');
    }

    // Project state
    if (this.context.projectState.length) {
      lines.push('### Active Projects');
      for (const p of this.context.projectState) {
        lines.push(`- **${p.project_name}** [${p.status}]: ${JSON.stringify(p.details)}`);
      }
      lines.push('');
    }

    // Working context
    const wc = this.context.workingContext[0];
    if (wc?.current_task) {
      lines.push(`### Currently Working On`);
      lines.push(`- ${wc.current_task} (${wc.task_status})`);
      lines.push('');
    }

    // Today log
    if (this.context.todayLog) {
      lines.push('### Today\'s Log');
      lines.push(this.context.todayLog.content.slice(0, 500));
      lines.push('');
    }

    // Recent decisions
    if (this.context.decisionsLog.length) {
      lines.push('### Recent Decisions');
      for (const d of this.context.decisionsLog.slice(0, 5)) {
        lines.push(`- ${d.decision} (by ${d.decided_by})`);
      }
      lines.push('');
    }

    // Recent mistakes (to avoid repeating)
    if (this.context.recentMistakes.length) {
      lines.push('### Lessons Learned (Avoid Repeating)');
      for (const m of this.context.recentMistakes.slice(0, 3)) {
        lines.push(`- ${m.mistake} → ${m.correction ?? 'TBD'}`);
      }
      lines.push('');
    }

    // Recent memory
    if (this.context.recentMemory.length) {
      lines.push('### Recent Memory Entries');
      for (const me of this.context.recentMemory.slice(0, 5)) {
        lines.push(`- [${me.memory_type}] ${me.content.slice(0, 100)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Checkpointing (every 3-5 tool calls) ──

  /** Call this after every tool use. Saves checkpoint every 5 calls. */
  async tick(taskDescription?: string): Promise<void> {
    this.toolCallCount++;
    if (taskDescription) this.currentTask = taskDescription;

    // Update working context
    await setWorkingContext(this.agentId, {
      current_task: this.currentTask,
      task_status: this.currentTask ? 'in_progress' : 'idle',
      details: { tool_calls: this.toolCallCount },
    });

    // Checkpoint every 5 tool calls
    if (this.toolCallCount - this.lastCheckpointAt >= 5 && this.currentTask) {
      await this.checkpoint();
    }
  }

  /** Force a checkpoint manually */
  async checkpoint(content?: string): Promise<void> {
    const checkpoint: AgentMemoryCheckpoint = {
      agentId: this.agentId,
      sessionId: this.sessionId,
      toolCallCount: this.toolCallCount,
      currentTask: this.currentTask,
      content: content ?? `Working on: ${this.currentTask ?? 'general task'}`,
      tags: ['checkpoint'],
      memoryType: 'task',
      metadata: {
        source: 'checkpoint',
        tool_calls: this.toolCallCount,
        task_id: this.currentTask ?? undefined,
      },
    };
    await saveCheckpoint(checkpoint);
    this.lastCheckpointAt = this.toolCallCount;
  }

  // ── Task Start ──

  async onTaskStart(taskId: string, taskDescription: string): Promise<void> {
    this.currentTask = taskDescription;

    await setWorkingContext(this.agentId, {
      current_task: taskDescription,
      task_status: 'planning',
      details: { task_id: taskId },
    });

    const checkpoint: AgentMemoryCheckpoint = {
      agentId: this.agentId,
      sessionId: this.sessionId,
      toolCallCount: this.toolCallCount,
      currentTask: taskDescription,
      content: `Started task: ${taskDescription}`,
      tags: ['task-start', taskId],
      memoryType: 'task',
      metadata: {
        source: 'task_start',
        task_id: taskId,
      },
    };
    await saveCheckpoint(checkpoint);
  }

  // ── Task End ──

  async onTaskEnd(taskId: string, outcome: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await appendToDailyLog(
      today,
      `✅ Task complete (${this.agentId}): ${this.currentTask ?? taskId} — ${outcome}`,
      this.agentId
    );

    await setWorkingContext(this.agentId, {
      current_task: null,
      task_status: 'done',
      details: { task_id: taskId, outcome },
    });

    this.currentTask = null;
  }

  // ── Mistakes ──

  async recordMistake(mistake: string, correction?: string, context?: string): Promise<void> {
    await addMistake({
      agent_id: this.agentId,
      mistake,
      correction: correction ?? null,
      context: context ?? null,
    });
  }

  // ── Decisions ──

  async recordDecision(
    decision: string,
    decidedBy: 'jarvis' | 'harvey' | 'karan',
    context?: string
  ): Promise<void> {
    await addDecision({ decision, context: context ?? null, outcome: null, decided_by: decidedBy });
  }

  // ── Projects ──

  async updateProject(projectName: string, status: ProjectState['status'], details?: ProjectState['details']): Promise<void> {
    await upsertProject({
      project_name: projectName,
      status,
      details: details ?? {},
    });
  }

  // ── Preferences ──

  async setPreference(key: string, value: string): Promise<void> {
    await setUserProfileKey(key, value);
  }

  async getPreference(key: string): Promise<string | null> {
    const entry = await getUserProfileKey(key);
    return entry?.value ?? null;
  }

  // ── Layer 4: Session Search ──

  async searchPastSessions(query: string, limit = 5) {
    return searchSessionHistory(query, limit);
  }

  // ── Session End ──

  async endSessionSession(sessionSummary: string): Promise<void> {
    if (this.flushed) return;
    this.flushed = true;

    const today = new Date().toISOString().split('T')[0];

    await endSession(
      this.agentId,
      this.sessionId,
      sessionSummary,
      undefined,
      ['session-end']
    );

    await appendToDailyLog(
      today,
      `Session end (${this.agentId}): ${sessionSummary}`,
      this.agentId
    );
  }

  // ── Getters ──

  getSessionId(): string {
    return this.sessionId;
  }

  getToolCallCount(): number {
    return this.toolCallCount;
  }

  needsCheckpoint(): boolean {
    return this.toolCallCount - this.lastCheckpointAt >= 3;
  }
}

// ── Convenience exports ───────────────────────────────────────

export async function createAgentMemoryManager(
  agentId: 'jarvis' | 'harvey'
): Promise<AgentMemoryManager> {
  const manager = new AgentMemoryManager(agentId);
  await manager.loadContext();
  return manager;
}