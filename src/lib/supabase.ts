import { createClient } from '@supabase/supabase-js';

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://wvsgstxcaczxmdtkhnxf.supabase.co';

const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2c2dzdHhjYWN6eG1kdGtobnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTgxNDksImV4cCI6MjA5MTU3NDE0OX0.TfMdVwfkrTVyk2bVV2s09yzp2KO3ImWPBfqgqC-iySA';

export const supabase = createClient(url, anonKey);
export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;
export type SupabaseClient = typeof supabase;