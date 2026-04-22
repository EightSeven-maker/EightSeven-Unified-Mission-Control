// ============================================================
// Memory System Index
// Layer 3 = Supabase (agent vault)
// Layer 4 = Supabase session_history
// ============================================================

// ── Core Class ───────────────────────────────────────────────
export { AgentMemoryManager, createAgentMemoryManager } from './memory-manager';

// ── All adapter functions (one re-export) ─────────────────────
export {
  getUserProfile,
  getUserProfileKey,
  setUserProfileKey,
  getProjects,
  getProject,
  upsertProject,
  updateProjectStatus,
  getDecisions,
  addDecision,
  getWorkingContext,
  setWorkingContext,
  clearWorkingContext,
  getMistakes,
  addMistake,
  getDailyLog,
  upsertDailyLog,
  appendToDailyLog,
  saveMemoryEntry,
  getMemoryEntries,
  searchMemoryEntries,
  saveCheckpoint,
  addSessionHistory,
  getSessionHistory,
  searchSessionHistory,
  loadAgentMemoryContext,
  endSession,
} from './supabase-adapter';

// ── All schema types (one re-export) ────────────────────────
export type {
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

/*
 * HOW IT WORKS (4 Layers)
 * ─────────────────────────
 *
 * LAYER 1: Built-in Memory (~2,200 chars)
 *   → Injected from AGENTS.md / workspace files (static, not managed here)
 *
 * LAYER 2: AGENTS.md + SOUL.md
 *   → Injected from agent workspace files (static, not managed here)
 *
 * LAYER 3: Supabase (replaces Obsidian vault)
 *   Tables: user_profile, project_state, decisions_log, working_context,
 *           mistakes, daily_logs, memory_entries
 *   Read:  session start, after compaction, when needing details
 *   Write: task start, every 5 tool calls, task completion, corrections
 *
 * LAYER 4: Supabase session_history (replaces session archive)
 *   Table: session_history
 *   Automatic write at session end
 *   Read: cross-session search via /api/agent-memory?action=search-sessions
 *
 * USAGE:
 *   import { createAgentMemoryManager } from '@/lib/memory';
 *
 *   const manager = await createAgentMemoryManager('jarvis');
 *   const contextText = manager.getContextAsText(); // for LLM system prompt
 *
 *   await manager.onTaskStart('task-123', 'Build the login page');
 *   await manager.tick('Working on auth');
 *   await manager.onTaskEnd('task-123', 'Completed with OAuth integration');
 *   await manager.endSessionSession('Completed login page with OAuth');
 *
 *   // Or via REST API:
 *   POST /api/agent-memory { action: 'task-start', taskId: '...', taskDescription: '...' }
 *   GET  /api/agent-memory?action=context-text
 *   GET  /api/agent-memory?action=search-sessions&query=login
 */