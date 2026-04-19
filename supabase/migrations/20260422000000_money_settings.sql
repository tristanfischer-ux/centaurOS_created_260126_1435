-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1A · money_settings
-- MONEY-SCHEMA.md §2 Tables · money_settings
--
-- Foundry-level preferences for the Money section. One row per foundry,
-- created lazily on first Money interaction (or seeded on foundry creation
-- when the build terminal wires the trigger).
--
-- Onboarding persistence (MONEY-SCHEMA §6.4 resolution 2026-04-19):
--   money_settings.onboarding_progress jsonb — foundry-level step tracking.
--   Shape: { connect_accounting: bool, first_plan_line: bool, define_thesis: bool,
--            create_round: bool, log_first_touch: bool, send_first_update: bool }
--
-- Credits budget (MONEY-SCHEMA ai_credits family):
--   credits_cap_cents is the hard ceiling consulted by checkCreditsBudget()
--   guard. Budget rows live in ai_credits_budget; this column is the default
--   seeded from SUBSCRIPTION_PLANS[tier].limits.creditsCapCents.
--
-- RLS foundry-scoping via foundry_memberships (per SHARED-SCHEMA §1.2).
-- Role enum is the production 5-value CapitalCase enum:
--   Founder / Executive / Apprentice / AI_Agent / Supplier (per Option A
--   compile decision 2026-04-19).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.money_settings (
  foundry_id                    text PRIMARY KEY
                                  REFERENCES public.foundries(id) ON DELETE CASCADE,
  currency                      text NOT NULL DEFAULT 'GBP',
  fiscal_year_start_month       smallint NOT NULL DEFAULT 4
                                  CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  number_format                 text NOT NULL DEFAULT 'en-GB',
  runway_danger_weeks           integer NOT NULL DEFAULT 13,
  runway_healthy_weeks          integer NOT NULL DEFAULT 18,
  runway_months_cached          numeric(6,2),
  runway_cached_at              timestamptz,
  large_expense_threshold_cents integer NOT NULL DEFAULT 50000,
  variance_alert_pct            smallint NOT NULL DEFAULT 10
                                  CHECK (variance_alert_pct BETWEEN 0 AND 100),
  digest_schedule               text NOT NULL DEFAULT 'weekly_mon_09',
  specialists_enabled           jsonb NOT NULL DEFAULT
                                  '{"finn":true,"fiona":true,"harper":true,"leo":true}'::jsonb,
  specialist_model_tier         text NOT NULL DEFAULT 'sonnet'
                                  CHECK (specialist_model_tier IN ('haiku','sonnet','opus')),
  retention_years               smallint NOT NULL DEFAULT 7
                                  CHECK (retention_years BETWEEN 1 AND 50),
  credits_cap_cents             integer,
  onboarding_progress           jsonb NOT NULL DEFAULT
                                  '{"connect_accounting":false,"first_plan_line":false,"define_thesis":false,"create_round":false,"log_first_touch":false,"send_first_update":false}'::jsonb,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.money_settings IS
  'MONEY-SCHEMA §2 · foundry-level Money preferences. One row per foundry, '
  'created lazily on first Money interaction.';

COMMENT ON COLUMN public.money_settings.runway_months_cached IS
  'MONEY-SCHEMA §2 · denormalised runway in months (numeric 6,2) refreshed by '
  'server action after plan/scenario/xero changes. NULL until first compute.';

COMMENT ON COLUMN public.money_settings.onboarding_progress IS
  'MONEY-SCHEMA §6.4 · foundry-level onboarding-step boolean map. '
  'Shape: {connect_accounting, first_plan_line, define_thesis, create_round, '
  'log_first_touch, send_first_update}.';

COMMENT ON COLUMN public.money_settings.credits_cap_cents IS
  'MONEY-SCHEMA ai_credits · hard ceiling for specialist-call spend per '
  'tier period. Null = no cap set yet (seeded from SUBSCRIPTION_PLANS tier limit).';

-- ── 2. updated_at trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS money_settings_set_updated_at ON public.money_settings;

CREATE TRIGGER money_settings_set_updated_at
  BEFORE UPDATE ON public.money_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.money_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: any active foundry member can read their foundry's Money settings.
CREATE POLICY money_settings_foundry_select
  ON public.money_settings
  FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

-- INSERT/UPDATE/DELETE: Founder-role only (permission_override grants others).
-- Note: Apprentice role sees settings read-only per §4 permissions matrix.
CREATE POLICY money_settings_foundry_write_founder
  ON public.money_settings
  FOR ALL
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );
