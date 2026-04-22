// ============================================================
// Agent Memory API Route
// GET /api/agent-memory — load context / search
// POST /api/agent-memory — checkpoint / task events
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  loadAgentMemoryContext,
  setWorkingContext,
  addMistake,
  addDecision,
  upsertProject,
  saveCheckpoint,
  endSession,
  getMemoryEntries,
  searchMemoryEntries,
  searchSessionHistory,
  getUserProfile,
  getProjects,
  getDecisions,
  getMistakes,
  getDailyLog,
  getSessionHistory,
} from '@/lib/memory/supabase-adapter';
import type { ProjectState } from '@/lib/memory/schema';

const VALID_AGENTS = ['jarvis', 'harvey'] as const;
const VALID_DECISION_BY = ['jarvis', 'harvey', 'karan'] as const;

function getAgentId(req: NextRequest): 'jarvis' | 'harvey' {
  const agent = req.headers.get('x-agent-id');
  if (agent && VALID_AGENTS.includes(agent as 'jarvis' | 'harvey')) {
    return agent as 'jarvis' | 'harvey';
  }
  return 'jarvis'; // default
}

// ── GET ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const agentId = getAgentId(request);
  const { searchParams } = new URL(request.url);

  try {
    const action = searchParams.get('action') || 'context';
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const date = searchParams.get('date');
    const table = searchParams.get('table');
    const sessionId = searchParams.get('sessionId');

    // ── Full context load (Layer 3) ──
    if (action === 'context') {
      const context = await loadAgentMemoryContext(agentId);
      return NextResponse.json({ ok: true, context, agentId });
    }

    // ── Formatted context text for LLM system prompt ──
    if (action === 'context-text') {
      const context = await loadAgentMemoryContext(agentId);
      const lines: string[] = [];

      if (context.userProfile.length) {
        lines.push('### User Profile');
        for (const p of context.userProfile) {
          lines.push(`- ${p.key}: ${p.value}`);
        }
        lines.push('');
      }

      if (context.projectState.length) {
        lines.push('### Active Projects');
        for (const p of context.projectState) {
          lines.push(`- **${p.project_name}** [${p.status}]`);
        }
        lines.push('');
      }

      const wc = context.workingContext[0];
      if (wc?.current_task) {
        lines.push('### Currently Working On');
        lines.push(`- ${wc.current_task} (${wc.task_status})`);
        lines.push('');
      }

      if (context.todayLog) {
        lines.push('### Today\'s Log (recent)');
        lines.push(context.todayLog.content.slice(-600));
        lines.push('');
      }

      if (context.decisionsLog.length) {
        lines.push('### Recent Decisions');
        for (const d of context.decisionsLog.slice(0, 5)) {
          lines.push(`- ${d.decision}`);
        }
        lines.push('');
      }

      if (context.recentMistakes.length) {
        lines.push('### Lessons Learned');
        for (const m of context.recentMistakes.slice(0, 3)) {
          lines.push(`- ${m.mistake} → ${m.correction ?? 'TBD'}`);
        }
        lines.push('');
      }

      return NextResponse.json({ ok: true, context: lines.join('\n'), agentId });
    }

    // ── Search memory entries ──
    if (action === 'search' && query) {
      const results = await searchMemoryEntries({ query, limit });
      return NextResponse.json({ ok: true, results, agentId });
    }

    // ── Search past sessions (Layer 4) ──
    if (action === 'search-sessions' && query) {
      const results = await searchSessionHistory(query, limit);
      return NextResponse.json({ ok: true, results, agentId });
    }

    // ── Get raw table data ──
    if (table) {
      switch (table) {
        case 'user_profile':
          return NextResponse.json({ ok: true, rows: await getUserProfile() });
        case 'project_state':
          return NextResponse.json({ ok: true, rows: await getProjects() });
        case 'decisions_log':
          return NextResponse.json({ ok: true, rows: await getDecisions(limit) });
        case 'mistakes':
          return NextResponse.json({ ok: true, rows: await getMistakes(agentId, limit) });
        case 'daily_logs': {
          const dateStr = date || new Date().toISOString().split('T')[0];
          return NextResponse.json({ ok: true, row: await getDailyLog(dateStr) });
        }
        case 'session_history':
          return NextResponse.json({ ok: true, rows: await getSessionHistory(limit) });
        default:
          return NextResponse.json({ error: `unknown table: ${table}` }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'action required' }, { status: 400 });
  } catch (err) {
    console.error('[agent-memory GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const agentId = getAgentId(request);
  const body = await request.json().catch(() => ({}));

  try {
    const action = String(body.action || '');

    switch (action) {
      // ── Checkpoint ──
      case 'checkpoint': {
        const entry = await saveCheckpoint({
          agentId: agentId as 'jarvis' | 'harvey',
          sessionId: body.sessionId || `session_${Date.now()}`,
          toolCallCount: body.toolCalls || 0,
          currentTask: body.currentTask || null,
          content: String(body.content || ''),
          tags: Array.isArray(body.tags) ? body.tags : ['checkpoint'],
          memoryType: (body.memoryType || 'task') as 'general' | 'task' | 'project' | 'preference' | 'decision' | 'error',
          metadata: {
            source: 'checkpoint',
            task_id: body.taskId,
            ...body.metadata,
          },
        });
        return NextResponse.json({ ok: true, entry });
      }

      // ── Task start ──
      case 'task-start': {
        await setWorkingContext(agentId, {
          current_task: body.taskDescription || '',
          task_status: 'planning',
          details: { task_id: body.taskId },
        });
        await saveCheckpoint({
          agentId: agentId as 'jarvis' | 'harvey',
          sessionId: body.sessionId || '',
          toolCallCount: 0,
          currentTask: body.taskDescription || null,
          content: `Started task: ${body.taskDescription || ''}`,
          tags: ['task-start', body.taskId].filter(Boolean),
          memoryType: 'task',
          metadata: { source: 'task_start', task_id: body.taskId },
        });
        return NextResponse.json({ ok: true, agentId });
      }

      // ── Task end ──
      case 'task-end': {
        const today = new Date().toISOString().split('T')[0];
        const { appendToDailyLog } = await import('@/lib/memory/supabase-adapter');
        await setWorkingContext(agentId, {
          current_task: null,
          task_status: 'done',
          details: { task_id: body.taskId, outcome: body.outcome },
        });
        await appendToDailyLog(
          today,
          `✅ Task complete (${agentId}): ${body.taskDescription ?? body.taskId} — ${body.outcome ?? 'done'}`,
          agentId
        );
        return NextResponse.json({ ok: true, agentId });
      }

      // ── Record mistake ──
      case 'mistake': {
        const entry = await addMistake({
          agent_id: agentId,
          mistake: String(body.mistake || ''),
          correction: body.correction || null,
          context: body.context || null,
        });
        return NextResponse.json({ ok: true, entry });
      }

      // ── Record decision ──
      case 'decision': {
        const decidedBy = VALID_DECISION_BY.includes(body.decidedBy as 'jarvis' | 'harvey' | 'karan')
          ? (body.decidedBy as 'jarvis' | 'harvey' | 'karan')
          : agentId;
        const entry = await addDecision({
          decision: String(body.decision || ''),
          context: body.context || null,
          outcome: body.outcome || null,
          decided_by: decidedBy,
        });
        return NextResponse.json({ ok: true, entry });
      }

      // ── Update project ──
      case 'project': {
        const status = ['active', 'paused', 'completed', 'archived'].includes(body.status)
          ? (body.status as ProjectState['status'])
          : 'active';
        const entry = await upsertProject({
          project_name: String(body.projectName || ''),
          status,
          details: body.details || {},
        });
        return NextResponse.json({ ok: true, entry });
      }

      // ── End session ──
      case 'end-session': {
        const { appendToDailyLog: appendDaily } = await import('@/lib/memory/supabase-adapter');
        const today = new Date().toISOString().split('T')[0];
        const sessionId = body.sessionId || '';

        await endSession(
          agentId,
          sessionId,
          body.summary || 'Session ended',
          body.fullContent,
          body.tags
        );
        await appendDaily(
          today,
          `Session end (${agentId}): ${body.summary || 'Session ended'}`,
          agentId
        );
        return NextResponse.json({ ok: true, sessionId, agentId });
      }

      // ── Save user profile key ──
      case 'preference': {
        const { setUserProfileKey } = await import('@/lib/memory/supabase-adapter');
        const entry = await setUserProfileKey(body.key || '', String(body.value || ''));
        return NextResponse.json({ ok: true, entry });
      }

      // ── Raw memory entry ──
      case 'memory': {
        const entry = await saveCheckpoint({
          agentId: agentId as 'jarvis' | 'harvey',
          sessionId: body.sessionId || '',
          toolCallCount: 0,
          currentTask: null,
          content: String(body.content || ''),
          tags: Array.isArray(body.tags) ? body.tags : ['manual'],
          memoryType: (body.memoryType || 'general') as 'general' | 'task' | 'project' | 'preference' | 'decision' | 'error',
          metadata: {
            source: 'manual',
            task_id: body.taskId,
            ...body.metadata,
          },
        });
        return NextResponse.json({ ok: true, entry });
      }

      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[agent-memory POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}