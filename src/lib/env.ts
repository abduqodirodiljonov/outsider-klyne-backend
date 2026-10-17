// ─────────────────────────────────────────────
// Outsider klyne — Environment configuration
// ─────────────────────────────────────────────
// Все переменные окружения собраны в одном месте.
// При запуске без какого-либо ключа выбрасывается понятная ошибка.

import 'dotenv/config';

interface EnvConfig {
  /** Supabase */
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  /** Telegram Bot */
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;

  /** Resend (email) */
  RESEND_API_KEY: string;
  /** Адрес администратора, куда приходят уведомления */
  ADMIN_EMAIL: string;
  /** Адрес отправителя (verified domain в Resend) */
  FROM_EMAIL: string;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Загружает и валидирует все переменные окружения.
 * Вызывается один раз при старте — результат кэшируется.
 */
export function loadEnv(): EnvConfig {
  return {
    SUPABASE_URL:              requireEnv('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    TELEGRAM_BOT_TOKEN:        requireEnv('TELEGRAM_BOT_TOKEN'),
    TELEGRAM_CHAT_ID:          requireEnv('TELEGRAM_CHAT_ID'),
    RESEND_API_KEY:            requireEnv('RESEND_API_KEY'),
    ADMIN_EMAIL:               requireEnv('ADMIN_EMAIL'),
    FROM_EMAIL:                requireEnv('FROM_EMAIL'),
  };
}

/** Ленивый синглтон — инициализируется при первом обращении */
let _cached: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!_cached) {
    _cached = loadEnv();
  }
  return _cached;
}
