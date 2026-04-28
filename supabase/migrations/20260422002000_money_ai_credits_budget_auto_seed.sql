-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 5G · ai_credits_budget auto-seed on foundry create
--
-- Closes the gap where a new foundry's Money flag flip would leave the
-- Credits pill hidden (pill hides when capCents === 0). Seeds a
-- current-month ai_credits_budget row on every foundries INSERT, with the
-- cap derived from the foundry's subscription tier.
--
-- Plus: backfill every existing foundry that doesn't already have a
-- current-month row.
--
-- Idempotent — safe to re-run. The trigger ON CONFLICT DO NOTHINGs.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_ai_credits_budget_for_foundry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap_cents integer;
  v_period_start date := date_trunc('month', now())::date;
  v_period_end date := (date_trunc('month', now()) + interval '1 month')::date;
BEGIN
  -- Tier → cap (matches SUBSCRIPTION_PLANS.limits.creditsCapCents in src)
  v_cap_cents := CASE COALESCE(NEW.tier, 'free')
    WHEN 'free'       THEN 200     -- £2
    WHEN 'explorer'   THEN 200     -- £2
    WHEN 'starter'    THEN 2500    -- £25
    WHEN 'pro'        THEN 10000   -- £100
    WHEN 'enterprise' THEN 40000   -- £400
    ELSE 200
  END;

  INSERT INTO public.ai_credits_budget
    (foundry_id, period_type, period_start, period_end, cap_cents,
     warning_threshold_pct, breach_behaviour, tier_seeded)
  VALUES
    (NEW.id, 'monthly', v_period_start, v_period_end, v_cap_cents,
     80, 'block', true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foundries_seed_ai_credits_budget ON public.foundries;
CREATE TRIGGER foundries_seed_ai_credits_budget
  AFTER INSERT ON public.foundries
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_ai_credits_budget_for_foundry();

-- Backfill existing foundries with no current-month budget.
INSERT INTO public.ai_credits_budget
  (foundry_id, period_type, period_start, period_end, cap_cents,
   warning_threshold_pct, breach_behaviour, tier_seeded)
SELECT f.id, 'monthly',
       date_trunc('month', now())::date,
       (date_trunc('month', now()) + interval '1 month')::date,
       CASE COALESCE(f.tier, 'free')
         WHEN 'free'       THEN 200
         WHEN 'explorer'   THEN 200
         WHEN 'starter'    THEN 2500
         WHEN 'pro'        THEN 10000
         WHEN 'enterprise' THEN 40000
         ELSE 200
       END,
       80, 'block', true
FROM public.foundries f
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_credits_budget b
  WHERE b.foundry_id = f.id
    AND b.period_start = date_trunc('month', now())::date
);

COMMENT ON FUNCTION public.seed_ai_credits_budget_for_foundry() IS
  'MONEY-SCHEMA Chunk 5G · auto-seeds ai_credits_budget for the current '
  'month when a foundry is created. Cap derived from foundries.tier.';
