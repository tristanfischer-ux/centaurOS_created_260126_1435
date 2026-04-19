-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Forge redesign · PR #1 — Shared primitives
-- B.3 · audit_log additive columns for SHARED-SCHEMA §1.3
--
-- Existing audit_log columns (unchanged, continue serving legacy readers):
--   id, foundry_id, user_id, action, entity_type, entity_id, metadata, created_at
--
-- Added columns mandated by SHARED-SCHEMA §1.3:
--   section            : 'forge' | 'products' | 'plan' | 'money' | 'meta'
--   event              : 'created' | 'updated' | 'locked' | 'archived' | 'promoted' | 'merged' | 'shipped' (free-form for now)
--   actor_user_id      : semantic alias for the existing user_id (populated via dual-write helper)
--   actor_specialist   : specialist id when system-initiated ('cal', 'sage', etc.)
--   payload            : semantic alias for the existing metadata (populated via dual-write helper)
--
-- Dual-write rule: new writers go through src/lib/audit/write.ts which sets
-- both action+event (same value) and both metadata+payload (same value) so
-- legacy readers of action/metadata keep working unchanged.
--
-- All additive. No existing columns renamed or dropped.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS section text
    CHECK (section IS NULL OR section IN ('forge', 'products', 'plan', 'money', 'meta'));

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS event text;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_specialist text;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS payload jsonb;

COMMENT ON COLUMN public.audit_log.section IS
  'SHARED-SCHEMA §1.3 — which of the four route groups (or meta) this event belongs to.';
COMMENT ON COLUMN public.audit_log.event IS
  'SHARED-SCHEMA §1.3 — event name. Dual-write helper mirrors this from `action`.';
COMMENT ON COLUMN public.audit_log.actor_user_id IS
  'SHARED-SCHEMA §1.3 — semantic alias for user_id. Dual-write helper mirrors both.';
COMMENT ON COLUMN public.audit_log.actor_specialist IS
  'SHARED-SCHEMA §1.3 — specialist id (cal/sage/chase/fang/finn/fiona/priya/jian/max/harper/leo/sal/mia) '
  'when the event is system-initiated. Null = human-initiated.';
COMMENT ON COLUMN public.audit_log.payload IS
  'SHARED-SCHEMA §1.3 — semantic alias for metadata. Dual-write helper mirrors both.';

-- ── 2. Indexes per SHARED-SCHEMA §1.3 ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS audit_log_foundry_created_at_idx
  ON public.audit_log (foundry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_foundry_section_entity_idx
  ON public.audit_log (foundry_id, section, entity_id)
  WHERE section IS NOT NULL;
