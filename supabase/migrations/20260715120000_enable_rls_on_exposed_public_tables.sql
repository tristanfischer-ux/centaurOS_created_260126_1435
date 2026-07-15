-- Enable Row-Level Security on public tables flagged by the Supabase security
-- advisor (rls_disabled_in_public), 2026-07-15. Applied live via the Supabase
-- migration API; committed here for version control.
--
-- These are backend/engine tables written only via the service-role key, which
-- BYPASSES RLS — so enabling RLS with no policy denies anon/authenticated access
-- (closing the anon-key hole) without affecting the engine.
ALTER TABLE public.corpus_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investors_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_concurrency_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_permit_caps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stage_locks ENABLE ROW LEVEL SECURITY;

-- price_index is read by an authenticated server component (/price-index page);
-- it is global reference data. Allow authenticated users to READ; writes remain
-- service-role-only (no INSERT/UPDATE/DELETE policy).
ALTER TABLE public.price_index ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "price_index_read_authenticated" ON public.price_index;
CREATE POLICY "price_index_read_authenticated"
  ON public.price_index FOR SELECT TO authenticated USING (true);

-- NOTE: public.spatial_ref_sys (PostGIS system table) is also flagged but cannot
-- have RLS enabled (not user-owned). It holds only public spatial-reference
-- definitions (no user data) — benign; the advisor line can be dismissed.
