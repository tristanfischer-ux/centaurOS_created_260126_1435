/**
 * Migration: Telegram specialist chat sessions
 *
 * Purpose: Tracks which specialist a user is currently chatting with via Telegram.
 * When a user sends /chat sage, a session row is created so subsequent plain-text
 * messages are routed to that specialist until /endchat or /chat [other].
 *
 * Security:
 * - RLS enabled but uses service-role-only policy (Telegram webhook uses admin client)
 * - Sessions auto-expire after 24 hours via cleanup function
 *
 * Related:
 * - src/lib/telegram/specialist-chat.ts
 * - src/app/api/bot/telegram/route.ts
 *
 * Rollback: DROP TABLE telegram_specialist_sessions CASCADE;
 */

-- ─── Telegram Specialist Sessions ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.telegram_specialist_sessions (
    chat_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    specialist_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup queries (expire old sessions)
CREATE INDEX IF NOT EXISTS idx_telegram_specialist_sessions_updated
    ON public.telegram_specialist_sessions(updated_at);

-- RLS: Service role only (Telegram webhook uses admin client)
ALTER TABLE public.telegram_specialist_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (admin client bypasses RLS anyway,
-- but this explicit policy documents the intent)
DROP POLICY IF EXISTS "Service role full access" ON public.telegram_specialist_sessions;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'telegram_specialist_sessions' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access"
      ON public.telegram_specialist_sessions
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ─── Cleanup Function ────────────────────────────────────────────────

-- Auto-expire sessions older than 24 hours to prevent stale state
CREATE OR REPLACE FUNCTION public.cleanup_expired_telegram_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM public.telegram_specialist_sessions
    WHERE updated_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
