-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1E · ai_credits family
-- MONEY-SCHEMA.md §2 · ai_credits_cost_rules, ai_credits_ledger, ai_credits_budget
--
-- Specialist cost metering. SHARED-SCHEMA §6 Q5 resolution (2026-04-19):
-- Forge / Products / Plan write specialist_call events to SHARED audit_log;
-- Money reads them + computes cost + surfaces in Cockpit "Credits" bar.
--
-- Trigger at bottom writes ai_credits_ledger row for every audit_log INSERT
-- where entity_type='specialist_call'. Cost computed from ai_credits_cost_rules
-- with per-foundry override fallback to global default.
--
-- Pre-requisite (red-team #2): Phase 1 Forge must write specialist_call events
-- to audit_log from every specialist invocation site. Chunk 5A backfill PR
-- ships that wiring before Today V3 Credits pill flips live.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ai_credits_cost_rules ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_credits_cost_rules (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                    text REFERENCES public.foundries(id) ON DELETE CASCADE,
  model_id                      text NOT NULL,
  input_cost_per_mtoken_cents   integer NOT NULL,
  output_cost_per_mtoken_cents  integer NOT NULL,
  margin_multiplier             numeric(5,2) NOT NULL DEFAULT 1.00
                                  CHECK (margin_multiplier >= 0),
  effective_from                timestamptz NOT NULL DEFAULT now(),
  effective_to                  timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_credits_cost_rules IS
  'MONEY-SCHEMA §2 · pricing table. foundry_id NULL = global default; '
  'per-foundry row overrides global when present and within effective window.';

-- Global pricing rows have foundry_id NULL; per-foundry overrides have foundry_id.
-- Lookup is: find most recent rule for (foundry_id OR global) and model_id
-- within the effective window, preferring foundry-specific.
CREATE INDEX IF NOT EXISTS ai_credits_cost_rules_lookup_idx
  ON public.ai_credits_cost_rules (model_id, effective_from DESC)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS ai_credits_cost_rules_foundry_idx
  ON public.ai_credits_cost_rules (foundry_id, model_id, effective_from DESC)
  WHERE foundry_id IS NOT NULL AND effective_to IS NULL;

DROP TRIGGER IF EXISTS ai_credits_cost_rules_set_updated_at ON public.ai_credits_cost_rules;
CREATE TRIGGER ai_credits_cost_rules_set_updated_at
  BEFORE UPDATE ON public.ai_credits_cost_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_credits_cost_rules ENABLE ROW LEVEL SECURITY;

-- Any foundry member can read; matters because downstream cost computation
-- references this for display.
CREATE POLICY ai_credits_cost_rules_read_all
  ON public.ai_credits_cost_rules FOR SELECT
  USING (true);

-- Service role writes global rules. Per-foundry overrides editable by Founder.
CREATE POLICY ai_credits_cost_rules_service_role_write
  ON public.ai_credits_cost_rules FOR ALL
  USING (
    auth.role() = 'service_role'
    OR (
      foundry_id IS NOT NULL
      AND foundry_id IN (
        SELECT fm.foundry_id FROM public.foundry_memberships fm
        WHERE fm.user_id = auth.uid()
          AND fm.active = true
          AND fm.role = 'Founder'
      )
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      foundry_id IS NOT NULL
      AND foundry_id IN (
        SELECT fm.foundry_id FROM public.foundry_memberships fm
        WHERE fm.user_id = auth.uid()
          AND fm.active = true
          AND fm.role = 'Founder'
      )
    )
  );

-- ── Seed: global default pricing (approximate, updatable) ────────────────────
-- Cents per 1M tokens. Values reflect public list pricing as of 2026-04-19.
-- Update via service-role seed scripts when vendor prices change.

INSERT INTO public.ai_credits_cost_rules
  (foundry_id, model_id, input_cost_per_mtoken_cents, output_cost_per_mtoken_cents, margin_multiplier)
VALUES
  (NULL, 'sonnet',         300,  1500, 1.20),
  (NULL, 'haiku',           80,   400, 1.20),
  (NULL, 'opus',          1500,  7500, 1.20),
  (NULL, 'deepseek-v4',     28,    28, 1.20),
  (NULL, 'gemini-flash',    15,    60, 1.20),
  (NULL, 'gpt-5.4',        250,  1000, 1.20),
  (NULL, 'minimax',         50,   200, 1.20)
ON CONFLICT DO NOTHING;

-- ── ai_credits_budget ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_credits_budget (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  period_type               text NOT NULL
                              CHECK (period_type IN ('monthly','quarterly','annual','custom')),
  period_start              date NOT NULL,
  period_end                date NOT NULL CHECK (period_end > period_start),
  cap_cents                 integer NOT NULL CHECK (cap_cents >= 0),
  warning_threshold_pct     smallint NOT NULL DEFAULT 80
                              CHECK (warning_threshold_pct BETWEEN 1 AND 100),
  breach_behaviour          text NOT NULL DEFAULT 'block'
                              CHECK (breach_behaviour IN ('block','warn_only')),
  tier_seeded               boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_credits_budget IS
  'MONEY-SCHEMA §2 · specialist cost budget per foundry per period. '
  'Seeded on foundry creation from SUBSCRIPTION_PLANS[tier].limits.';

CREATE INDEX IF NOT EXISTS ai_credits_budget_foundry_period_idx
  ON public.ai_credits_budget (foundry_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS ai_credits_budget_foundry_type_idx
  ON public.ai_credits_budget (foundry_id, period_type, period_start DESC);

DROP TRIGGER IF EXISTS ai_credits_budget_set_updated_at ON public.ai_credits_budget;
CREATE TRIGGER ai_credits_budget_set_updated_at
  BEFORE UPDATE ON public.ai_credits_budget
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_credits_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_credits_budget_foundry_select
  ON public.ai_credits_budget FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

CREATE POLICY ai_credits_budget_foundry_write
  ON public.ai_credits_budget FOR ALL
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

-- ── ai_credits_ledger ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_credits_ledger (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id            text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  audit_log_id          uuid NOT NULL,
  specialist_id         text NOT NULL,
  section               text NOT NULL
                          CHECK (section IN ('forge','products','plan','money','meta')),
  invoked_by_user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  model_id              text NOT NULL,
  input_tokens          integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens         integer NOT NULL CHECK (output_tokens >= 0),
  cost_cents            integer NOT NULL CHECK (cost_cents >= 0),
  billable_cost_cents   integer NOT NULL CHECK (billable_cost_cents >= 0),
  duration_ms           integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  invocation_id         text,
  invoked_at            timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_credits_ledger IS
  'MONEY-SCHEMA §2 · one row per specialist invocation. Denormalised rollup '
  'from audit_log.specialist_call events. cost_cents = raw; billable_cost_cents '
  '= cost × margin_multiplier. Read by founder+co_founder+fractional_exec only.';

CREATE INDEX IF NOT EXISTS ai_credits_ledger_foundry_invoked_idx
  ON public.ai_credits_ledger (foundry_id, invoked_at DESC);

CREATE INDEX IF NOT EXISTS ai_credits_ledger_foundry_specialist_idx
  ON public.ai_credits_ledger (foundry_id, specialist_id, invoked_at);

CREATE INDEX IF NOT EXISTS ai_credits_ledger_foundry_section_idx
  ON public.ai_credits_ledger (foundry_id, section, invoked_at);

CREATE UNIQUE INDEX IF NOT EXISTS ai_credits_ledger_unique_audit_log_id
  ON public.ai_credits_ledger (audit_log_id);

ALTER TABLE public.ai_credits_ledger ENABLE ROW LEVEL SECURITY;

-- Cost is founder-confidential. Founder role only per §4 matrix.
CREATE POLICY ai_credits_ledger_founder_select
  ON public.ai_credits_ledger FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role = 'Founder'
    )
  );

-- Writes happen only via the trigger below (service_role context).
-- No write policy for non-service-role ⇒ blocked.

-- ── Trigger: write ai_credits_ledger on audit_log INSERT ────────────────────
-- Fires on INSERT into SHARED audit_log where entity_type='specialist_call'.
-- Payload shape expected: {model, input_tokens, output_tokens, duration_ms,
-- specialist_id, invocation_id}.

CREATE OR REPLACE FUNCTION public.ai_credits_ledger_backfill()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_model             text;
  v_input_tokens      integer;
  v_output_tokens     integer;
  v_duration_ms       integer;
  v_specialist        text;
  v_invocation_id     text;
  v_cost_cents        integer;
  v_billable_cents    integer;
  v_rule              record;
BEGIN
  -- Guard: only specialist_call events. Also guard on foundry_id presence.
  IF NEW.entity_type IS NULL OR NEW.entity_type <> 'specialist_call' THEN
    RETURN NEW;
  END IF;
  IF NEW.foundry_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pull token counts from payload (dual-write: payload or metadata column).
  v_model          := COALESCE(NEW.payload->>'model', NEW.metadata->>'model');
  v_input_tokens   := COALESCE((NEW.payload->>'input_tokens')::integer,
                               (NEW.metadata->>'input_tokens')::integer, 0);
  v_output_tokens  := COALESCE((NEW.payload->>'output_tokens')::integer,
                               (NEW.metadata->>'output_tokens')::integer, 0);
  v_duration_ms    := COALESCE((NEW.payload->>'duration_ms')::integer,
                               (NEW.metadata->>'duration_ms')::integer, NULL);
  v_specialist     := COALESCE(NEW.actor_specialist,
                               NEW.payload->>'specialist_id',
                               NEW.metadata->>'specialist_id', 'unknown');
  v_invocation_id  := COALESCE(NEW.payload->>'invocation_id',
                               NEW.metadata->>'invocation_id');

  -- Skip if no model info — we can't price it.
  IF v_model IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find pricing rule: foundry-specific first, fall back to global.
  SELECT input_cost_per_mtoken_cents, output_cost_per_mtoken_cents, margin_multiplier
    INTO v_rule
  FROM public.ai_credits_cost_rules r
  WHERE r.model_id = v_model
    AND r.effective_from <= COALESCE(NEW.created_at, now())
    AND (r.effective_to IS NULL OR r.effective_to > COALESCE(NEW.created_at, now()))
    AND (r.foundry_id = NEW.foundry_id OR r.foundry_id IS NULL)
  ORDER BY (r.foundry_id IS NULL) ASC, r.effective_from DESC
  LIMIT 1;

  -- If no rule found, write zero-cost row (audit trail only).
  IF v_rule IS NULL THEN
    v_cost_cents := 0;
    v_billable_cents := 0;
  ELSE
    -- Cost in cents = (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000
    v_cost_cents := CEIL(
      (v_input_tokens::numeric * v_rule.input_cost_per_mtoken_cents
       + v_output_tokens::numeric * v_rule.output_cost_per_mtoken_cents)
      / 1000000.0
    )::integer;
    v_billable_cents := CEIL(v_cost_cents * v_rule.margin_multiplier)::integer;
  END IF;

  INSERT INTO public.ai_credits_ledger
    (foundry_id, audit_log_id, specialist_id, section, invoked_by_user_id,
     model_id, input_tokens, output_tokens, cost_cents, billable_cost_cents,
     duration_ms, invocation_id, invoked_at)
  VALUES
    (NEW.foundry_id, NEW.id, v_specialist,
     COALESCE(NEW.section, 'meta'),
     COALESCE(NEW.actor_user_id, NEW.user_id),
     v_model, v_input_tokens, v_output_tokens, v_cost_cents, v_billable_cents,
     v_duration_ms, v_invocation_id, COALESCE(NEW.created_at, now()))
  ON CONFLICT (audit_log_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_specialist_call_to_credits_ledger
  ON public.audit_log;

CREATE TRIGGER audit_log_specialist_call_to_credits_ledger
  AFTER INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_credits_ledger_backfill();

COMMENT ON FUNCTION public.ai_credits_ledger_backfill() IS
  'MONEY-SCHEMA §2 ai_credits · trigger that writes a ledger row for every '
  'audit_log INSERT where entity_type=specialist_call. Computes cost from '
  'foundry-specific or global ai_credits_cost_rules. Idempotent on audit_log_id.';
