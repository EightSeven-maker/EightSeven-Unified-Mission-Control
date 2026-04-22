// ============================================================
// Supabase Memory Adapter — Layer 3 (Agent Vault)
// Replaces Obsidian vault with Supabase database
// ============================================================

import { supabase } from '@/lib/supabase';
import type {
  UserProfile,
  ProjectState,
  DecisionsLog,
  WorkingContext,
  Mistake,
  DailyLog,
  MemoryEntry,
  SessionHistory,
  MemoryQueryOptions,
  SearchOptions,
  AgentMemoryContext,
  AgentMemoryCheckpoint,
} from './schema';

// ── Helper ────────────────────────────────────────────────────

async function handleResult<T>(result: { data: T | null; error: unknown }) {
  if (result.error) throw result.error;
  return result.data as T;
}

// ── User Profile ──────────────────────────────────────────────

export async function getUserProfile(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .order('key');
  if (error) throw error;
  return data || [];
}

export async function getUserProfileKey(key: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('user_profile')
    .select('*')
    .eq('key', key)
    .single();
  return data;
}

export async function setUserProfileKey(key: string, value: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profile')
    .upsert({ key, value, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Project State ─────────────────────────────────────────────

export async function getProjects(): Promise<ProjectState[]> {
  const { data } = await supabase
    .from('project_state')
    .select('*')
    .order('updated_at', { ascending: false });
  return data || [];
}

export async function getProject(name: string): Promise<ProjectState | null> {
  const { data } = await supabase
    .from('project_state')
    .select('*')
    .eq('project_name', name)
    .single();
  return data;
}

export async function upsertProject(project: Omit<ProjectState, 'id' | 'updated_at'>): Promise<ProjectState> {
  const { data, error } = await supabase
    .from('project_state')
    .upsert({
      project_name: project.project_name,
      status: project.status,
      details: project.details,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProjectStatus(name: string, status: ProjectState['status']): Promise<void> {
  const { error } = await supabase
    .from('project_state')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('project_name', name);
  if (error) throw error;
}

// ── Decisions Log ──────────────────────────────────────────────

export async function getDecisions(limit = 20): Promise<DecisionsLog[]> {
  const { data } = await supabase
    .from('decisions_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function addDecision(entry: Omit<DecisionsLog, 'id' | 'created_at'>): Promise<DecisionsLog> {
  const { data, error } = await supabase
    .from('decisions_log')
    .insert([entry])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Working Context ───────────────────────────────────────────

export async function getWorkingContext(agentId: 'jarvis' | 'harvey'): Promise<WorkingContext | null> {
  const { data } = await supabase
    .from('working_context')
    .select('*')
    .eq('agent_id', agentId)
    .single();
  return data;
}

export async function setWorkingContext(
  agentId: 'jarvis' | 'harvey',
  context: Partial<Omit<WorkingContext, 'id' | 'agent_id' | 'updated_at'>>
): Promise<WorkingContext> {
  const { data: existing } = await supabase
    .from('working_context')
    .select('id')
    .eq('agent_id', agentId)
    .single();

  const payload = {
    agent_id: agentId,
    current_task: context.current_task ?? null,
    task_status: context.task_status ?? 'idle',
    details: context.details ?? {},
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from('working_context')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('working_context')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function clearWorkingContext(agentId: 'jarvis' | 'harvey'): Promise<void> {
  const { error } = await supabase
    .from('working_context')
    .update({ current_task: null, task_status: 'idle', updated_at: new Date().toISOString() })
    .eq('agent_id', agentId);
  if (error) throw error;
}

// ── Mistakes ───────────────────────────────────────────────────

export async function getMistakes(agentId: 'jarvis' | 'harvey', limit = 10): Promise<Mistake[]> {
  const { data } = await supabase
    .from('mistakes')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function addMistake(entry: Omit<Mistake, 'id' | 'created_at'>): Promise<Mistake> {
  const { data, error } = await supabase
    .from('mistakes')
    .insert([entry])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Daily Logs ────────────────────────────────────────────────

export async function getDailyLog(date: string): Promise<DailyLog | null> {
  const { data } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('log_date', date)
    .single();
  return data;
}

export async function upsertDailyLog(entry: Omit<DailyLog, 'id' | 'created_at'>): Promise<DailyLog> {
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert({ log_date: entry.log_date, content: entry.content, agent_id: entry.agent_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function appendToDailyLog(date: string, newContent: string, agentId: string): Promise<void> {
  const existing = await getDailyLog(date);
  if (existing) {
    const { error } = await supabase
      .from('daily_logs')
      .update({ content: existing.content + '\n' + newContent })
      .eq('log_date', date);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('daily_logs')
      .insert([{ log_date: date, content: newContent, agent_id: agentId as DailyLog['agent_id'] }]);
    if (error) throw error;
  }
}

// ── Memory Entries ────────────────────────────────────────────

export async function saveMemoryEntry(
  entry: Omit<MemoryEntry, 'id' | 'created_at'>
): Promise<MemoryEntry> {
  const { data, error } = await supabase
    .from('memory_entries')
    .insert([entry])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMemoryEntries(options: MemoryQueryOptions = {}): Promise<MemoryEntry[]> {
  let query = supabase
    .from('memory_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.agentId) query = query.eq('agent_id', options.agentId);
  if (options.sessionId) query = query.eq('session_id', options.sessionId);
  if (options.before) query = query.lte('created_at', options.before.toISOString());
  if (options.memoryType) query = query.eq('memory_type', options.memoryType);
  if (options.limit) query = query.limit(options.limit);

  if (options.tags && options.tags.length) {
    query = query.overlaps('tags', options.tags);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function searchMemoryEntries(options: SearchOptions): Promise<MemoryEntry[]> {
  const { data, error } = await supabase
    .from('memory_entries')
    .select('*')
    .or(`content.ilike.%${options.query}%,tags.cs.{${options.query}}`)
    .order('created_at', { ascending: false })
    .limit(options.limit || 10);

  if (error) throw error;
  return data || [];
}

// ── Session History ───────────────────────────────────────────

export async function addSessionHistory(
  entry: Omit<SessionHistory, 'id' | 'created_at'>
): Promise<SessionHistory> {
  const { data, error } = await supabase
    .from('session_history')
    .insert([entry])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSessionHistory(limit = 20): Promise<SessionHistory[]> {
  const { data } = await supabase
    .from('session_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function searchSessionHistory(query: string, limit = 10): Promise<SessionHistory[]> {
  const { data, error } = await supabase
    .from('session_history')
    .select('*')
    .or(`summary.ilike.%${query}%,tags.cs.{${query}}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ── Full Context Load ─────────────────────────────────────────

export async function loadAgentMemoryContext(agentId: 'jarvis' | 'harvey'): Promise<AgentMemoryContext> {
  const today = new Date().toISOString().split('T')[0];

  const [
    userProfile,
    projectState,
    decisions,
    workingContext,
    recentMistakes,
    recentMemory,
  ] = await Promise.all([
    getUserProfile(),
    getProjects(),
    getDecisions(20),
    getWorkingContext(agentId),
    getMistakes(agentId, 10),
    getMemoryEntries({ agentId, limit: 20 }),
  ]);

  const todayLog = await getDailyLog(today);

  return {
    userProfile,
    projectState,
    decisionsLog: decisions,
    workingContext: workingContext ? [workingContext] : [],
    todayLog,
    recentMistakes,
    recentMemory,
  };
}

// ── Checkpoint ───────────────────────────────────────────────

export async function saveCheckpoint(entry: AgentMemoryCheckpoint): Promise<MemoryEntry> {
  return saveMemoryEntry({
    agent_id: entry.agentId,
    session_id: entry.sessionId,
    content: entry.content,
    tags: entry.tags,
    metadata: { ...entry.metadata, tool_calls: entry.toolCallCount, task_id: entry.currentTask },
    memory_type: entry.memoryType,
  });
}

// ── Session End ───────────────────────────────────────────────

export async function endSession(
  agentId: 'jarvis' | 'harvey',
  sessionId: string,
  summary: string,
  fullContent?: string,
  tags?: string[]
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const dateStr = new Date().toISOString();

  // Save to session history
  await addSessionHistory({
    session_id: sessionId,
    agent_id: agentId,
    summary,
    full_content: fullContent ?? null,
    tags: tags ?? [],
  });

  // Append to daily log
  await appendToDailyLog(
    today,
    `Session ${sessionId} (${agentId}): ${summary}`,
    agentId
  );

  // Clear working context
  await clearWorkingContext(agentId);
}