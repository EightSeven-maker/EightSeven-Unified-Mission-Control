// ============================================================
// Agent Memory System — Type Definitions
// Maps to Supabase tables in wvsgstxcaczxmdtkhnxf
// ============================================================

// ── Layer 3 Tables ──────────────────────────────────────────

export type UserProfile = {
  id: string;
  key: string;
  value: string;
  updated_at: string;
};

export type ProjectState = {
  id: string;
  project_name: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  details: {
    description?: string;
    repo_url?: string;
    priority?: 'high' | 'medium' | 'low';
    tags?: string[];
    [key: string]: unknown;
  };
  updated_at: string;
};

export type DecisionsLog = {
  id: string;
  decision: string;
  context: string | null;
  outcome: string | null;
  decided_by: 'jarvis' | 'harvey' | 'karan' | 'unknown';
  created_at: string;
};

export type WorkingContext = {
  id: string;
  agent_id: 'jarvis' | 'harvey';
  current_task: string | null;
  task_status: 'idle' | 'planning' | 'in_progress' | 'review' | 'done';
  details: {
    task_id?: string;
    file_path?: string;
    subtasks?: string[];
    blockers?: string[];
    [key: string]: unknown;
  };
  updated_at: string;
};

export type Mistake = {
  id: string;
  agent_id: 'jarvis' | 'harvey';
  mistake: string;
  correction: string | null;
  context: string | null;
  created_at: string;
};

export type DailyLog = {
  id: string;
  log_date: string; // YYYY-MM-DD
  content: string;
  agent_id: 'jarvis' | 'harvey' | 'both' | null;
  created_at: string;
};

// ── Layer 3/4 Shared Tables ──────────────────────────────────

export type MemoryEntry = {
  id: string;
  agent_id: 'jarvis' | 'harvey';
  session_id: string | null;
  content: string;
  tags: string[];
  metadata: {
    source?: 'task_start' | 'task_end' | 'checkpoint' | 'correction' | 'manual';
    tool_calls?: number;
    task_id?: string | null;
    [key: string]: unknown;
  };
  memory_type: 'general' | 'task' | 'project' | 'preference' | 'decision' | 'error';
  created_at: string;
};

export type SessionHistory = {
  id: string;
  session_id: string;
  agent_id: 'jarvis' | 'harvey' | null;
  summary: string;
  full_content: string | null;
  tags: string[];
  created_at: string;
};

// ── Query Options ────────────────────────────────────────────

export type MemoryQueryOptions = {
  agentId?: 'jarvis' | 'harvey';
  sessionId?: string;
  tags?: string[];
  memoryType?: MemoryEntry['memory_type'];
  limit?: number;
  before?: Date;
};

export type SearchOptions = {
  query: string;
  limit?: number;
  agentId?: 'jarvis' | 'harvey';
};

// ── Memory Layer Output ──────────────────────────────────────

export type AgentMemoryContext = {
  userProfile: UserProfile[];
  projectState: ProjectState[];
  decisionsLog: DecisionsLog[];
  workingContext: WorkingContext[];
  todayLog: DailyLog | null;
  recentMistakes: Mistake[];
  recentMemory: MemoryEntry[];
};

export type AgentMemoryCheckpoint = {
  agentId: 'jarvis' | 'harvey';
  sessionId: string;
  toolCallCount: number;
  currentTask: string | null;
  content: string;
  tags: string[];
  memoryType: MemoryEntry['memory_type'];
  metadata: MemoryEntry['metadata'];
};