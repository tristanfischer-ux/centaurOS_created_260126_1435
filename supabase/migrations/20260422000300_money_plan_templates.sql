-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1A · plan_templates (seed)
-- MONEY-SCHEMA.md §6.4a · plan_templates
--
-- Shared read-only starter templates cloned during onboarding. Added in
-- response to red-team critique #7 (cold-start): founders on day 1 have no
-- Xero / no plan / no thesis — templates give them a head start.
--
-- Each row has a JSONB line_items_seed array that onboarding clones into
-- plan_line_items rows (with source='template' + owner_user_id set to the
-- founder who triggered the seed).
--
-- Global table — no RLS tenant scoping (read is public). Write is
-- service_role only (seeded at release).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_templates (
  id                text PRIMARY KEY,
  label             text NOT NULL,
  region            text NOT NULL CHECK (region IN ('UK','US','EU','global')),
  stage             text NOT NULL CHECK (stage IN
                      ('pre_seed','seed','series_a','bootstrapped','other')),
  description       text,
  line_items_seed   jsonb NOT NULL DEFAULT '[]'::jsonb,
  active            boolean NOT NULL DEFAULT true,
  sort_order        smallint NOT NULL DEFAULT 100,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plan_templates IS
  'MONEY-SCHEMA §6.4a · shared read-only starter templates for Plan onboarding. '
  'Each row holds a JSONB array of seed line_items that onboarding clones into '
  'plan_line_items. No RLS — read is public; write is service_role only.';

CREATE INDEX IF NOT EXISTS plan_templates_active_region_idx
  ON public.plan_templates (active, region, sort_order)
  WHERE active = true;

DROP TRIGGER IF EXISTS plan_templates_set_updated_at ON public.plan_templates;
CREATE TRIGGER plan_templates_set_updated_at
  BEFORE UPDATE ON public.plan_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Read is public (no RLS) — templates are not tenant data.
-- Write is service_role only.
ALTER TABLE public.plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_templates_public_select
  ON public.plan_templates FOR SELECT
  USING (active = true);

CREATE POLICY plan_templates_service_role_write
  ON public.plan_templates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Seed: 4 starter templates ────────────────────────────────────────────────
-- line_items_seed shape: [{name, direction, category, amount_cents, frequency,
-- months_from_now_start, months_duration, probability_pct}]

INSERT INTO public.plan_templates (id, label, region, stage, description, line_items_seed, sort_order)
VALUES
  ('uk_pre_seed_4_eng', 'UK pre-seed · 4 engineers', 'UK', 'pre_seed',
    'Classic UK pre-seed hardware startup: 4 engineering salaries, modest premises, prototype materials, small growth budget. Assumes 12-month runway target.',
    $json$[
      {"name":"Founder salary","direction":"out","category":"people","amount_cents":600000,"frequency":"monthly"},
      {"name":"Engineer 1 salary","direction":"out","category":"people","amount_cents":550000,"frequency":"monthly"},
      {"name":"Engineer 2 salary","direction":"out","category":"people","amount_cents":550000,"frequency":"monthly"},
      {"name":"Engineer 3 salary","direction":"out","category":"people","amount_cents":550000,"frequency":"monthly"},
      {"name":"Coworking desks (4)","direction":"out","category":"premises","amount_cents":120000,"frequency":"monthly"},
      {"name":"SaaS tooling (GitHub, Figma, Slack)","direction":"out","category":"tools","amount_cents":25000,"frequency":"monthly"},
      {"name":"Prototype materials","direction":"out","category":"materials","amount_cents":150000,"frequency":"monthly"},
      {"name":"Marketing & events","direction":"out","category":"growth","amount_cents":50000,"frequency":"monthly"},
      {"name":"Accounting + legal","direction":"out","category":"other","amount_cents":40000,"frequency":"monthly"}
    ]$json$::jsonb,
    10),

  ('uk_pre_seed_bootstrapped', 'UK bootstrapped · 2 founders', 'UK', 'bootstrapped',
    'Two founders, no external funding, part-time paid roles, minimum overheads. Typical shape for a founder team still at a day job that bills consulting revenue.',
    $json$[
      {"name":"Founder 1 salary (50%)","direction":"out","category":"people","amount_cents":250000,"frequency":"monthly"},
      {"name":"Founder 2 salary (50%)","direction":"out","category":"people","amount_cents":250000,"frequency":"monthly"},
      {"name":"Home office allowance","direction":"out","category":"premises","amount_cents":15000,"frequency":"monthly"},
      {"name":"SaaS essentials","direction":"out","category":"tools","amount_cents":15000,"frequency":"monthly"},
      {"name":"Prototype materials","direction":"out","category":"materials","amount_cents":80000,"frequency":"monthly"},
      {"name":"Consulting revenue","direction":"in","category":"revenue","amount_cents":800000,"frequency":"monthly","probability_pct":70}
    ]$json$::jsonb,
    20),

  ('us_pre_seed_bootstrapped', 'US bootstrapped · 2 founders', 'US', 'bootstrapped',
    'US-equivalent bootstrapped pair. Higher salary baseline, Delaware C-corp overhead. Amounts in USD cents (note currency during onboarding).',
    $json$[
      {"name":"Founder 1 salary","direction":"out","category":"people","amount_cents":500000,"frequency":"monthly"},
      {"name":"Founder 2 salary","direction":"out","category":"people","amount_cents":500000,"frequency":"monthly"},
      {"name":"Coworking or WeWork","direction":"out","category":"premises","amount_cents":80000,"frequency":"monthly"},
      {"name":"SaaS tooling","direction":"out","category":"tools","amount_cents":30000,"frequency":"monthly"},
      {"name":"Delaware C-corp fees","direction":"out","category":"other","amount_cents":10000,"frequency":"monthly"},
      {"name":"Consulting revenue","direction":"in","category":"revenue","amount_cents":1000000,"frequency":"monthly","probability_pct":70}
    ]$json$::jsonb,
    30),

  ('uk_hardware_prototyping', 'UK hardware · prototyping stage', 'UK', 'pre_seed',
    'UK hardware startup mid-prototype — heavier tooling + materials + small contractor spend. Typical between first prototype and first unit.',
    $json$[
      {"name":"Founder salary","direction":"out","category":"people","amount_cents":600000,"frequency":"monthly"},
      {"name":"CTO salary","direction":"out","category":"people","amount_cents":650000,"frequency":"monthly"},
      {"name":"Engineering contractor","direction":"out","category":"people","amount_cents":400000,"frequency":"monthly","probability_pct":80},
      {"name":"Workshop rental","direction":"out","category":"premises","amount_cents":200000,"frequency":"monthly"},
      {"name":"CAD + CAM licences","direction":"out","category":"tools","amount_cents":50000,"frequency":"monthly"},
      {"name":"Prototype materials (BOM)","direction":"out","category":"materials","amount_cents":300000,"frequency":"monthly"},
      {"name":"Specialist services (PCB, CNC)","direction":"out","category":"materials","amount_cents":200000,"frequency":"monthly"},
      {"name":"Grant income (Innovate UK)","direction":"in","category":"grants","amount_cents":5000000,"frequency":"one_off","probability_pct":40}
    ]$json$::jsonb,
    40)
ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label,
      region = EXCLUDED.region,
      stage = EXCLUDED.stage,
      description = EXCLUDED.description,
      line_items_seed = EXCLUDED.line_items_seed,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();
