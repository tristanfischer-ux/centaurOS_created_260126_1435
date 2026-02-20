-- Business Plan Intelligence Engine: indexes and missing policies
-- Adds foundry_id indexes for RLS performance + update/delete policies on analyses

-- Indexes for RLS policy checks (every query filters by foundry_id)
CREATE INDEX IF NOT EXISTS idx_business_plan_analyses_foundry_id
  ON public.business_plan_analyses(foundry_id);

CREATE INDEX IF NOT EXISTS idx_hiring_requirements_foundry_id
  ON public.hiring_requirements(foundry_id);

CREATE INDEX IF NOT EXISTS idx_funding_requirements_foundry_id
  ON public.funding_requirements(foundry_id);

-- Missing policies: allow members to update and delete their analyses
CREATE POLICY "Members can update their foundry's analyses"
  ON public.business_plan_analyses FOR UPDATE
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Members can delete their foundry's analyses"
  ON public.business_plan_analyses FOR DELETE
  USING (foundry_id IN (
    SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
  ));
