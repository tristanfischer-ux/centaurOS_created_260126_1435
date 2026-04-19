-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Forge redesign · PR #1 — Shared primitives
-- B.5 · event_log — Today V3 triage queue source per SHARED-SCHEMA §1.4
--
-- Event-sourced stream the Today V3 panels + Cal's morning briefing consume.
-- Each section (Forge / Products / Plan / Money / meta) writes attention-worthy
-- events via its own server actions. Today V3 reads them via RLS-scoped SELECT,
-- with Supabase Realtime pushing new rows to the browser.
--
-- "Attention-worthy" test (SHARED-SCHEMA §5.1): "Would a founder opening the
-- app at 8am want to know this happened?" Examples that belong:
--   BRIEF-LOCK, supplier cert <30d, cost breach >10%, risk severity ≥high,
--   objective on-track → at-risk, scenario variance, investor touch overdue,
--   readiness-item closed, LOI signed, task overdue >3d, blocker interview.
-- Examples that don't: BOM line added, interview note edited, pipeline reorder.
--
-- PR #1 creates the table empty. PR #2+ Forge routes write events. Other
-- sections' events land in Phases 2/3/4.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_log (
  id                  bigserial PRIMARY KEY,
  foundry_id          text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  section             text NOT NULL CHECK (section IN ('forge', 'products', 'plan', 'money', 'meta')),
  source_entity_type  text NOT NULL,
  source_entity_id    text NOT NULL,
  urgency             text NOT NULL CHECK (urgency IN ('critical', 'high', 'medium', 'low')),
  decay_rate          text CHECK (decay_rate IS NULL OR decay_rate IN ('immediate', '1d', '3d', '7d', '30d')),
  consequence_weight  integer CHECK (consequence_weight IS NULL OR (consequence_weight BETWEEN 1 AND 100)),
  title               text NOT NULL,
  body                text,
  cta_label           text,
  cta_href            text,
  assigned_to         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_log IS
  'SHARED-SCHEMA §1.4 — Today V3 triage queue source. Event-sourced stream of '
  'attention-worthy happenings across Forge/Products/Plan/Money/meta.';

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

-- Hot query: pending events for a foundry, grouped by assignee and decay rate.
CREATE INDEX IF NOT EXISTS event_log_foundry_unresolved_idx
  ON public.event_log (foundry_id, assigned_to, decay_rate)
  WHERE resolved_at IS NULL;

-- Expire cleanup + section fan-out.
CREATE INDEX IF NOT EXISTS event_log_foundry_section_idx
  ON public.event_log (foundry_id, section, created_at DESC);

CREATE INDEX IF NOT EXISTS event_log_expires_idx
  ON public.event_log (expires_at)
  WHERE expires_at IS NOT NULL AND resolved_at IS NULL;

-- ── 3. updated_at trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS event_log_set_updated_at ON public.event_log;

CREATE TRIGGER event_log_set_updated_at
  BEFORE UPDATE ON public.event_log
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;

-- Foundry-scoped SELECT via foundry_memberships.
CREATE POLICY "event_log_foundry_select"
  ON public.event_log
  FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

-- Inserts restricted to service_role (server actions only). Client/browser
-- cannot write directly — each section's server actions have the service role
-- context when writing attention-worthy events. Per SHARED-SCHEMA §1.4:
-- "Insert: section-owned — each section writes its own events through its
-- server actions."
CREATE POLICY "event_log_service_role_insert"
  ON public.event_log
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- UPDATE: foundry members can resolve (set resolved_at) their own assignments
-- or any event assigned to null (team-wide). No other fields editable via RLS;
-- server actions use service role for everything else.
CREATE POLICY "event_log_foundry_resolve"
  ON public.event_log
  FOR UPDATE
  USING (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
    AND (assigned_to = auth.uid() OR assigned_to IS NULL)
  );

-- ── 5. Supabase Realtime publication ─────────────────────────────────────────
-- Today V3 subscribes client-side via Supabase Realtime so events push to the
-- open browser tab without refresh. Matches SHARED-SCHEMA §6 Q3 resolution.

ALTER PUBLICATION supabase_realtime ADD TABLE public.event_log;
