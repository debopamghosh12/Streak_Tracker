import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function create(): SupabaseClient | null {
  if (!url || !anonKey) return null; // local-only mode
  try {
    return createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Implicit flow lets a magic link requested on the laptop be opened on the phone (and vice versa).
        flowType: 'implicit',
      },
    });
  } catch (err) {
    console.warn('[prisma] Supabase disabled — invalid VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY', err);
    return null;
  }
}

/** The browser client, built with the public anon key only. Null when sync isn't configured. */
export const supabase = create();
