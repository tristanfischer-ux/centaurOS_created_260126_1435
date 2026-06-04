-- Novel-archetype detection columns for pdf_engine_runs.
--
-- The submit endpoint runs classifyProduct(brief_text) at insert time and
-- records the classifier verdict so the status workspace can decide whether to
-- show the "this is a new kind of system" research-status dialogue (a NOVEL
-- archetype: 60-90 min) instead of the generic running banner (a KNOWN system:
-- ~30 min).
--
-- All three columns are nullable + additive — the surfacing code is null-safe,
-- so rows inserted before this migration is applied simply render the generic
-- banner. Safe to apply to production with zero downtime and no backfill.
--
--   detected_class        — classifier productClass slug (e.g. 'energy_storage',
--                           'co2_mineralisation', or 'unknown')
--   detected_confidence   — 'HIGH' | 'MEDIUM' | 'LOW' (matches the classifier
--                           enum). 'LOW' or class 'unknown' ⇒ novel archetype.
--   detected_tech_domains — jsonb array of technology-domain strings the
--                           classifier inferred (electrical, battery, thermal, …)

ALTER TABLE public.pdf_engine_runs
    ADD COLUMN IF NOT EXISTS detected_class text,
    ADD COLUMN IF NOT EXISTS detected_confidence text,
    ADD COLUMN IF NOT EXISTS detected_tech_domains jsonb;

COMMENT ON COLUMN public.pdf_engine_runs.detected_class IS
    'classifyProduct() productClass slug captured at submit time; null for pre-migration rows.';
COMMENT ON COLUMN public.pdf_engine_runs.detected_confidence IS
    'classifyProduct() confidence (HIGH|MEDIUM|LOW); LOW or class=unknown ⇒ novel archetype.';
COMMENT ON COLUMN public.pdf_engine_runs.detected_tech_domains IS
    'classifyProduct() technologyDomains[] as jsonb; null for pre-migration rows.';
