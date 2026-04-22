/**
 * @deprecated Obsidian is no longer used as agent memory.
 * Agent memory now uses Supabase (see @/lib/memory and @/lib/memory/supabase-adapter).
 * This file is kept for backwards compatibility — re-exports from Supabase adapter.
 */
export {
  saveMemoryEntry as saveMemory,
  getMemoryEntries as getMemory,
  searchMemoryEntries as searchMemory,
  loadAgentMemoryContext as loadContext,
  endSession as endSessionSession,
  getUserProfile,
  getUserProfileKey,
  setUserProfileKey,
  getProjects,
  upsertProject,
  getDecisions,
  addDecision,
  getWorkingContext,
  setWorkingContext,
  getMistakes,
  addMistake,
  getDailyLog,
  upsertDailyLog,
  appendToDailyLog,
  addSessionHistory,
  getSessionHistory,
  searchSessionHistory,
} from '@/lib/memory/supabase-adapter';

export type {
  MemoryEntry,
  UserProfile,
  ProjectState,
  DecisionsLog,
  WorkingContext,
  Mistake,
  DailyLog,
  SessionHistory,
  MemoryQueryOptions,
  SearchOptions,
  AgentMemoryContext,
  AgentMemoryCheckpoint,
} from '@/lib/memory/schema';

/*
 * OBSIDIAN REMOVAL NOTE (2026-04-22)
 * ───────────────────────────────────
 * Obsidian vault was removed from the memory system because:
 * 1. Obsidian Desktop is local — agents on VPS can't write to it
 * 2. No reliable sync mechanism between Mac (Obsidian) and VPS
 * 3. Supabase provides real-time access from anywhere
 *
 * All agent memory now lives in Supabase project: wvsgstxcaczxmdtkhnxf
 * Tables: user_profile, project_state, decisions_log, working_context,
 *         mistakes, daily_logs, memory_entries, session_history
 *
 * For human-readable backup, a cron job can export Supabase data to
 * markdown files in the workspace if needed.
 */