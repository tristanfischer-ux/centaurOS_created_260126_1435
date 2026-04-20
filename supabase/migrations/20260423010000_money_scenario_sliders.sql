-- Money · scenario sliders (legacy-parity restoration)
--
-- Loss #5 from the legacy Cash Burn parity audit: the four "levers" founders
-- drag on a scenario (revenue delay, cost delay, revenue growth, opening
-- balance override) had no home in V2. This migration adds them as nullable
-- columns on money_scenarios so the client-side projection lib can apply
-- them deterministically and the detail view can save the dragged values.
--
-- All additive, all NOT NULL with sensible defaults, so existing scenarios
-- keep working (identity transform == no slider change).

ALTER TABLE public.money_scenarios
  ADD COLUMN IF NOT EXISTS revenue_delay_weeks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_delay_weeks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_growth_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_cents bigint NULL;

COMMENT ON COLUMN public.money_scenarios.revenue_delay_weeks IS 'Legacy-parity slider: shift all cash-in lines forward by N weeks (0-26)';
COMMENT ON COLUMN public.money_scenarios.cost_delay_weeks IS 'Legacy-parity slider: shift all cash-out lines forward by N weeks (0-26)';
COMMENT ON COLUMN public.money_scenarios.revenue_growth_pct IS 'Legacy-parity slider: multiply cash-in amounts by (1 + growth/100). Range -50..100';
COMMENT ON COLUMN public.money_scenarios.opening_balance_cents IS 'Per-scenario opening balance override (NULL = use foundry default)';
