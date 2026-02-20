-- Business Plan Intelligence Engine
-- Three new tables: analyses, hiring requirements, funding requirements
-- GOTCHA: foundries.id is TEXT (not UUID), so foundry_id must be TEXT.

-- 1. Store raw business plan analyses
CREATE TABLE IF NOT EXISTS public.business_plan_analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id    TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  file_name     TEXT,
  analyzed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  analysis_json JSONB NOT NULL DEFAULT '{}',
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_plan_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their foundry's analyses"
  ON public.business_plan_analyses FOR SELECT
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Members can insert analyses for their foundry"
  ON public.business_plan_analyses FOR INSERT
  WITH CHECK (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

-- 2. Hiring requirements derived from business plan
CREATE TABLE IF NOT EXISTS public.hiring_requirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id          TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  analysis_id         UUID REFERENCES public.business_plan_analyses(id) ON DELETE SET NULL,
  role_title          TEXT NOT NULL,
  role_type           TEXT NOT NULL CHECK (role_type IN ('full_time', 'fractional', 'apprentice')),
  reason              TEXT,
  linked_objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  ai_suggested_date   DATE,
  user_override_date  DATE,
  status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'recruiting', 'hired', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hiring_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view hiring requirements"
  ON public.hiring_requirements FOR SELECT
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Members can manage hiring requirements"
  ON public.hiring_requirements FOR ALL
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

-- 3. Funding requirements derived from business plan
CREATE TABLE IF NOT EXISTS public.funding_requirements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id           TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  analysis_id          UUID REFERENCES public.business_plan_analyses(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  amount_usd           NUMERIC(12, 2),
  reason               TEXT,
  needed_by_date       DATE,
  funding_type         TEXT CHECK (funding_type IN ('bootstrapping', 'angel', 'vc', 'grant', 'revenue_based', 'debt', 'other')),
  linked_objective_ids UUID[] DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'projected' CHECK (status IN ('projected', 'seeking', 'secured', 'cancelled')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funding_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view funding requirements"
  ON public.funding_requirements FOR SELECT
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Members can manage funding requirements"
  ON public.funding_requirements FOR ALL
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));
