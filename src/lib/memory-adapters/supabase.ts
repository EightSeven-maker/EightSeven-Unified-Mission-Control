/**
 * @deprecated Re-export from new memory system.
 * Agent memory now uses @/lib/memory/supabase-adapter.
 * This file is kept for backwards compatibility.
 */
export {
  saveMemoryEntry as saveMemory,
  getMemoryEntries as getMemory,
  searchMemoryEntries as searchMemory,
  loadAgentMemoryContext as loadContext,
  endSession as endSessionSession,
} from '@/lib/memory/supabase-adapter';