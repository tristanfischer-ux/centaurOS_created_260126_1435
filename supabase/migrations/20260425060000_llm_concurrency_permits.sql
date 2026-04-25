-- 20260425060000_llm_concurrency_permits.sql
--
-- Centralised LLM concurrency permit pool.
--
-- Why: today (April 2026) the production Anthropic API key is shared across
-- the whole platform. Multiple foundries each launching autopilot chains in
-- parallel saturate the org-level rate limit (~4000 RPM, ~400k input
-- tokens/min on Tier 4) and every chain's specialist calls 429-cascade. The
-- per-project Fang concurrency cap (= 3) and the per-foundry chain cap (= 3)
-- bound the worst case but don't enforce a true cross-tenant ceiling.
--
-- This migration adds a Postgres-backed semaphore: every Anthropic /
-- DeepSeek / OpenAI call site goes through `acquire_llm_permit(provider,
-- model, ttl_seconds)`. The function INSERTs a permit row only if the live
-- count for that (provider, model) is below the configured cap. Callers
-- block (in the application layer) until a permit is granted, then release
-- it on completion. Crashed callers self-clean via the `expires_at` TTL.
--
-- Design choices:
--   - Postgres for storage (no Redis dependency; ForgeOS already has Supabase).
--   - Single global pool per (provider, model) — not per-foundry. The shared
--     LLM key IS the contended resource; partitioning would defeat the purpose.
--   - TTL-based cleanup on each acquire so a crashed caller doesn't hold a
--     permit forever. 5-minute default matches Vercel's 300s function ceiling.
--   - `llm_permit_caps` is a config table so caps can be tuned in production
--     without code deploy (e.g. when Anthropic tier upgrades land).
--
-- Future extensions (deliberately not in this migration):
--   - Per-foundry sub-quotas (e.g. premium tier gets reserved permits).
--   - Token-aware accounting (currently request-count only).
--   - Per-key partitioning when BYOK ships.

-- ─── Permit table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_concurrency_permits (
  id          BIGSERIAL PRIMARY KEY,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ
);

-- Live permits = released_at IS NULL AND expires_at > now(). Index supports
-- both the count check and the cleanup sweep.
CREATE INDEX IF NOT EXISTS idx_llm_permits_live
  ON llm_concurrency_permits (provider, model, expires_at)
  WHERE released_at IS NULL;

-- ─── Cap config ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_permit_caps (
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  max_concurrent  INT  NOT NULL CHECK (max_concurrent >= 0),
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, model)
);

-- Initial caps. Tier 4 Anthropic ~4000 RPM at the org level; with average
-- call duration ~30s, sustained 50 in flight is ~6000 calls/min — uncomfortable.
-- Setting opus-4-7 at 30 leaves headroom, sonnet-4-6 at 60 (lighter calls).
-- DeepSeek and OpenAI generous since they aren't the contended resource.
INSERT INTO llm_permit_caps (provider, model, max_concurrent, notes) VALUES
  ('anthropic', 'claude-opus-4-7',     30, 'Tier 4 ~4000 RPM; 30 concurrent leaves headroom'),
  ('anthropic', 'claude-sonnet-4-6',   60, 'Lighter calls; cap higher than opus'),
  ('anthropic', 'claude-haiku-4-5',   120, 'Cheap fast tier'),
  ('deepseek',  'deepseek-v4',         60, 'Separate provider quota'),
  ('deepseek',  'deepseek-v4-flash',   60, 'Separate provider quota'),
  ('openai',    'gpt-5.4',             40, 'Reasoning model — slower per call'),
  ('openai',    'gpt-4.1-mini',       120, 'Cheap fast tier'),
  ('openai',    'gpt-image-2',         20, 'Image generation, separate quota tier')
ON CONFLICT (provider, model) DO NOTHING;

-- ─── Acquire ────────────────────────────────────────────────────────
-- Returns the new permit id, OR NULL if the live count is at the cap.
-- Caller polls (with backoff) until it gets a permit.
--
-- Uses a transaction-scoped advisory lock keyed on (provider, model) so
-- two concurrent acquire calls can't both squeeze through when at cap-1.
-- The advisory lock is tiny (held for milliseconds) and Postgres releases
-- it automatically on transaction end.
CREATE OR REPLACE FUNCTION acquire_llm_permit(
  p_provider     TEXT,
  p_model        TEXT,
  p_ttl_seconds  INT DEFAULT 300
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cap          INT;
  v_live         INT;
  v_lock_key     BIGINT;
  v_permit_id    BIGINT;
BEGIN
  -- Resolve cap. Missing config row = unlimited (returns NULL cap, treated
  -- as "no cap, always grant"). Lets new models work without a config edit.
  SELECT max_concurrent INTO v_cap
  FROM llm_permit_caps
  WHERE provider = p_provider AND model = p_model;

  -- Per (provider, model) advisory lock — int8 hash of the pair. Held for
  -- the duration of this function call only. Prevents the "both check,
  -- both insert" race when count = cap-1.
  v_lock_key := hashtext(p_provider || ':' || p_model)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Sweep expired (TTL-elapsed) permits opportunistically — costs a tiny
  -- index range scan per acquire, keeps the live-count honest without a
  -- separate cron sweep.
  UPDATE llm_concurrency_permits
     SET released_at = now()
   WHERE provider = p_provider
     AND model    = p_model
     AND released_at IS NULL
     AND expires_at < now();

  -- If a cap is configured, count live permits and refuse if at cap.
  IF v_cap IS NOT NULL THEN
    SELECT count(*) INTO v_live
    FROM llm_concurrency_permits
    WHERE provider = p_provider
      AND model    = p_model
      AND released_at IS NULL
      AND expires_at > now();

    IF v_live >= v_cap THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO llm_concurrency_permits (provider, model, expires_at)
  VALUES (p_provider, p_model, now() + make_interval(secs => p_ttl_seconds))
  RETURNING id INTO v_permit_id;

  RETURN v_permit_id;
END;
$$;

-- ─── Release ────────────────────────────────────────────────────────
-- Idempotent: if the permit is already released or expired, no-op.
CREATE OR REPLACE FUNCTION release_llm_permit(p_permit_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE llm_concurrency_permits
     SET released_at = now()
   WHERE id = p_permit_id
     AND released_at IS NULL;
END;
$$;

-- ─── Grants ────────────────────────────────────────────────────────
-- Service-role only. The application's admin client uses the service role.
-- No RLS — service-role bypasses anyway, and there's no per-user data here.
REVOKE ALL ON FUNCTION acquire_llm_permit(TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_llm_permit(BIGINT)         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_llm_permit(TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION release_llm_permit(BIGINT)         TO service_role;
GRANT SELECT, INSERT, UPDATE ON llm_concurrency_permits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE llm_concurrency_permits_id_seq TO service_role;
GRANT SELECT ON llm_permit_caps TO service_role;

COMMENT ON TABLE llm_concurrency_permits IS
  'In-flight LLM call accounting. acquire_llm_permit grabs a row; release_llm_permit closes it. TTL-based cleanup recovers crashed callers.';
COMMENT ON TABLE llm_permit_caps IS
  'Tunable concurrency cap per (provider, model). Edit in production via SQL — no code deploy required.';
