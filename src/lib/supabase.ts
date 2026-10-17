// ─────────────────────────────────────────────
// Outsider klyne — Supabase admin client
// ─────────────────────────────────────────────
// Используем Service Role Key — этот клиент обходит RLS.
// НИКОГДА не отдавайте этот ключ на фронтенд.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env';

let _client: SupabaseClient | null = null;

/**
 * Возвращает Supabase-клиент с правами Service Role.
 * Клиент создаётся один раз и кэшируется.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    const env = getEnv();
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}
