-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1D · investor_update + investor_update_recipient
-- MONEY-SCHEMA.md §2 · investor_update, investor_update_recipient
--
-- Monthly investor updates. V1 sends via Gmail OAuth (founder's own address)
-- per HANDOVER-money.md §Open questions #7 default decision 2026-04-19.
-- Bounce/open/click tracking per-recipient for analytics in V1 aggregate form
-- only (per-recipient detail UI is V2-cut).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── investor_update ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.investor_update (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id            text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  round_id              uuid REFERENCES public.investor_round(id) ON DELETE SET NULL,
  month_label           text NOT NULL,
  subject               text NOT NULL,
  body_html             text NOT NULL,
  body_sections         jsonb NOT NULL DEFAULT '{}'::jsonb,
  headline_quote        text,
  sent_by_user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at               timestamptz,
  scheduled_for         timestamptz,
  state                 text NOT NULL DEFAULT 'draft'
                          CHECK (state IN ('draft','scheduled','sent','cancelled')),
  send_method           text NOT NULL DEFAULT 'gmail_oauth'
                          CHECK (send_method IN ('gmail_oauth','transactional_smtp','manual_copy')),
  aggregate_delivered   integer NOT NULL DEFAULT 0,
  aggregate_opened      integer NOT NULL DEFAULT 0,
  aggregate_clicked     integer NOT NULL DEFAULT 0,
  aggregate_replied     integer NOT NULL DEFAULT 0,
  aggregate_bounced     integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.investor_update IS
  'MONEY-SCHEMA §2 · monthly investor update. V1 sends via Gmail OAuth '
  '(founder''s own address). Aggregate tracking columns denormalised from '
  'investor_update_recipient for quick display; refreshed by trigger.';

CREATE INDEX IF NOT EXISTS investor_update_foundry_state_idx
  ON public.investor_update (foundry_id, state, sent_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS investor_update_set_updated_at ON public.investor_update;
CREATE TRIGGER investor_update_set_updated_at
  BEFORE UPDATE ON public.investor_update
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.investor_update ENABLE ROW LEVEL SECURITY;

CREATE POLICY investor_update_foundry_select
  ON public.investor_update FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

CREATE POLICY investor_update_foundry_write
  ON public.investor_update FOR ALL
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

-- ── investor_update_recipient ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.investor_update_recipient (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id             uuid NOT NULL REFERENCES public.investor_update(id) ON DELETE CASCADE,
  foundry_id            text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  pipeline_state_id     uuid REFERENCES public.investor_pipeline_state(id) ON DELETE SET NULL,
  email                 text NOT NULL,
  name                  text,
  stage_at_send         text,
  delivered_at          timestamptz,
  opened_count          integer NOT NULL DEFAULT 0,
  opened_first_at       timestamptz,
  opened_last_at        timestamptz,
  clicked_count         integer NOT NULL DEFAULT 0,
  replied_at            timestamptz,
  bounced_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.investor_update_recipient IS
  'MONEY-SCHEMA §2 · per-recipient investor-update tracking. '
  'Aggregate stats roll up to investor_update via trigger.';

CREATE INDEX IF NOT EXISTS investor_update_recipient_update_idx
  ON public.investor_update_recipient (update_id);

CREATE INDEX IF NOT EXISTS investor_update_recipient_email_delivered_idx
  ON public.investor_update_recipient (email, delivered_at DESC NULLS LAST);

ALTER TABLE public.investor_update_recipient ENABLE ROW LEVEL SECURITY;

CREATE POLICY investor_update_recipient_foundry_select
  ON public.investor_update_recipient FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

-- Writes happen via service_role (send pipeline + webhook handlers).
