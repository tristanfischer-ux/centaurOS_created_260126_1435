-- ⚠ FOR A DIFFERENT SUPABASE PROJECT — "ForgeOS Corpus" (ref: fnusjztykxibqybuekvh),
-- NOT the linked website project. Kept OUTSIDE supabase/migrations/ so `supabase db
-- push` never runs it against the wrong database. Applied live 2026-07-15 via the
-- Supabase migration API; committed here only for a version-controlled record.
--
-- Engine corpus (RAG) tables, written only via the service-role key (bypasses RLS).
-- Enabling RLS with no policy denies anon/authenticated access.
ALTER TABLE public.corpus_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_chunks_corpus ENABLE ROW LEVEL SECURITY;
