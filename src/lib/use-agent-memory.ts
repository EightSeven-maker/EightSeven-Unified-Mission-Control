import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MemoryEntry } from '@/lib/memory';

const MEMORY_TABLE = process.env.NEXT_PUBLIC_MEMORY_TABLE || 'memory_entries';

export function useAgentMemory(agentId?: string) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let mounted = true;

    async function fetchMemory() {
      try {
        const { data, error: err } = await supabase
          .from(MEMORY_TABLE)
          .select('*')
          .eq('agent_id', agentId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!mounted) return;
        if (err) setError(err.message);
        else setEntries(data || []);
      } catch (e) {
        if (!mounted) return;
        setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchMemory();
    return () => { mounted = false; };
  }, [agentId]);

  return { entries, loading, error };
}