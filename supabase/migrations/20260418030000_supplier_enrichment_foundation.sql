-- =============================================================================
-- Supplier Enrichment Foundation — schema for items 1, 3, 10, 11, 15, 18, 19
-- =============================================================================
--
-- INTENT: Adds the columns + tables that the next wave of supplier-enrichment
-- features (ISO normalisation, certifications-with-expiry, structured
-- capability matrix, relationship graph, sanctions screening, sustainability,
-- AI brief cache) writes into.
--
-- SAFETY: All columns added with defaults; all new tables created with RLS.
-- Existing marketplace_listings rows are NOT modified by this migration —
-- backfill is a separate step (scripts/supplier-enrichment/backfill-*.ts).
-- =============================================================================

-- ─── 1. ISO country + freshness (items #1, #3) ───────────────────────────────

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS country_iso CHAR(2),
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_sources JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN marketplace_listings.country_iso IS 'Canonical ISO 3166-1 alpha-2 code. Populated by backfill + ingest pipelines. Use this for matching, fall back to free-text country for display.';
COMMENT ON COLUMN marketplace_listings.last_enriched_at IS 'Most recent enrichment timestamp across all sources. Freshness indicator for the UI.';
COMMENT ON COLUMN marketplace_listings.enrichment_sources IS 'Array of {source, run_at, fields[]} entries recording which pipeline populated which fields and when. Audit trail.';

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_country_iso
  ON marketplace_listings (country_iso)
  WHERE country_iso IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_last_enriched
  ON marketplace_listings (last_enriched_at DESC NULLS LAST);

-- ─── 2. Sustainability / ESG flags (item #19) ────────────────────────────────

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS iso_14001 BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS carbon_disclosed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recycled_content_percent SMALLINT,
  ADD COLUMN IF NOT EXISTS ecovadis_score SMALLINT,
  ADD COLUMN IF NOT EXISTS sustainability_notes TEXT;

COMMENT ON COLUMN marketplace_listings.iso_14001 IS 'ISO 14001 environmental management system certification.';
COMMENT ON COLUMN marketplace_listings.ecovadis_score IS 'EcoVadis rating 0-100 if known.';

-- ─── 3. Certifications with expiry (item #10) ────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  cert_code TEXT NOT NULL,
  cert_label TEXT NOT NULL,
  issuer TEXT,
  issued_at DATE,
  expires_at DATE,
  evidence_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, cert_code)
);

CREATE INDEX IF NOT EXISTS idx_supplier_certifications_listing
  ON supplier_certifications (listing_id);
CREATE INDEX IF NOT EXISTS idx_supplier_certifications_expires
  ON supplier_certifications (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE supplier_certifications ENABLE ROW LEVEL SECURITY;

-- Marketplace-wide read (same as marketplace_listings SELECT policy)
CREATE POLICY "supplier_certifications_select_all"
  ON supplier_certifications FOR SELECT TO authenticated
  USING (true);

-- Only service-role / enrichment pipelines write — no self-service INSERT/UPDATE policy
-- Pipelines use createAdminClient() which bypasses RLS.

COMMENT ON TABLE supplier_certifications IS 'Structured cert records with expiry. Replaces flat certifications JSONB once migrated.';

-- ─── 4. Structured capability matrix (item #11) ──────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  process_category TEXT NOT NULL,
  materials TEXT[] DEFAULT ARRAY[]::TEXT[],
  tolerance_min_mm NUMERIC(6,4),
  tolerance_max_mm NUMERIC(6,4),
  batch_min INT,
  batch_max INT,
  equipment TEXT[] DEFAULT ARRAY[]::TEXT[],
  evidence_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_capabilities_listing
  ON supplier_capabilities (listing_id);
CREATE INDEX IF NOT EXISTS idx_supplier_capabilities_process
  ON supplier_capabilities (process_category);

ALTER TABLE supplier_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_capabilities_select_all"
  ON supplier_capabilities FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE supplier_capabilities IS 'Structured {process, materials, tolerance range, batch range, equipment} tuples. Feeds the 25-pt capability factor in supplier matching.';

-- ─── 5. Supplier relationship graph (item #15) ──────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  child_listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('subcontracts_to', 'owned_by', 'subsidiary_of', 'partners_with', 'competes_with')),
  source TEXT,
  evidence_url TEXT,
  confidence SMALLINT DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_listing_id, child_listing_id, relationship_type),
  CHECK (parent_listing_id <> child_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_relationships_parent
  ON supplier_relationships (parent_listing_id);
CREATE INDEX IF NOT EXISTS idx_supplier_relationships_child
  ON supplier_relationships (child_listing_id);

ALTER TABLE supplier_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_relationships_select_all"
  ON supplier_relationships FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE supplier_relationships IS 'Directed graph of inter-supplier relationships. Feeds sub-tier risk propagation.';

-- ─── 6. Sanctions screening flags (item #18) ────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_sanctions_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  list_name TEXT NOT NULL,
  list_entry_ref TEXT,
  reason TEXT,
  match_score SMALLINT,
  active BOOLEAN NOT NULL DEFAULT true,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  UNIQUE (listing_id, list_name, list_entry_ref)
);

CREATE INDEX IF NOT EXISTS idx_supplier_sanctions_flags_listing
  ON supplier_sanctions_flags (listing_id) WHERE active = true;

ALTER TABLE supplier_sanctions_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_sanctions_flags_select_all"
  ON supplier_sanctions_flags FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE supplier_sanctions_flags IS 'Active sanctions flags per supplier. Populated weekly by scripts/supplier-enrichment/sanctions-screen.ts. Any active flag should block awarding work to this supplier.';

-- ─── 7. Foundry-scoped post-project supplier ratings (item #13) ─────────────

CREATE TABLE IF NOT EXISTS supplier_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  project_id UUID REFERENCES cad_lab_projects(id) ON DELETE SET NULL,
  rated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  on_time SMALLINT CHECK (on_time BETWEEN 1 AND 5),
  quality SMALLINT CHECK (quality BETWEEN 1 AND 5),
  responsiveness SMALLINT CHECK (responsiveness BETWEEN 1 AND 5),
  commercial_fairness SMALLINT CHECK (commercial_fairness BETWEEN 1 AND 5),
  notes TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, foundry_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_ratings_listing
  ON supplier_ratings (listing_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ratings_foundry
  ON supplier_ratings (foundry_id);

ALTER TABLE supplier_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_ratings_select_public_or_own"
  ON supplier_ratings FOR SELECT TO authenticated
  USING (
    is_public = true
    OR foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "supplier_ratings_insert_own_foundry"
  ON supplier_ratings FOR INSERT TO authenticated
  WITH CHECK (
    rated_by = auth.uid()
    AND foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "supplier_ratings_update_own"
  ON supplier_ratings FOR UPDATE TO authenticated
  USING (rated_by = auth.uid())
  WITH CHECK (rated_by = auth.uid());

COMMENT ON TABLE supplier_ratings IS 'Post-project ratings. Public by default — ratings contribute to marketplace-wide average. Foundry-scoped write + own-row update.';

-- ─── 8. Interview-pack responses (item #12) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_interview_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  project_id UUID REFERENCES cad_lab_projects(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  raw_reply TEXT NOT NULL,
  parsed JSONB,
  moq_min INT,
  moq_max INT,
  tooling_cost_min_gbp NUMERIC(12,2),
  tooling_cost_max_gbp NUMERIC(12,2),
  lead_time_days INT,
  payment_terms TEXT,
  unit_price_at_100_gbp NUMERIC(12,2),
  unit_price_at_1000_gbp NUMERIC(12,2),
  unit_price_at_10000_gbp NUMERIC(12,2),
  parse_error TEXT,
  share_publicly BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_interview_responses_listing
  ON supplier_interview_responses (listing_id);
CREATE INDEX IF NOT EXISTS idx_supplier_interview_responses_foundry
  ON supplier_interview_responses (foundry_id);

ALTER TABLE supplier_interview_responses ENABLE ROW LEVEL SECURITY;

-- Public reads if share_publicly = true; otherwise foundry-scoped
CREATE POLICY "supplier_interview_responses_select_public_or_own"
  ON supplier_interview_responses FOR SELECT TO authenticated
  USING (
    share_publicly = true
    OR foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "supplier_interview_responses_insert_own_foundry"
  ON supplier_interview_responses FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
  );

COMMENT ON TABLE supplier_interview_responses IS 'Parsed Capability Interview Pack replies. Structured fields built from LLM extraction of the raw_reply. Foundry-scoped by default; share_publicly=true contributes to marketplace-wide benchmarks.';

-- ─── 9. Founder-contributed corrections (item #14) ──────────────────────────

CREATE TABLE IF NOT EXISTS supplier_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  field_name TEXT NOT NULL,
  current_value TEXT,
  proposed_value TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'rejected', 'superseded')),
  applied_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_corrections_listing
  ON supplier_corrections (listing_id);
CREATE INDEX IF NOT EXISTS idx_supplier_corrections_status
  ON supplier_corrections (status) WHERE status = 'pending';

ALTER TABLE supplier_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_corrections_select_own_foundry"
  ON supplier_corrections FOR SELECT TO authenticated
  USING (foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "supplier_corrections_insert_own_foundry"
  ON supplier_corrections FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
  );

COMMENT ON TABLE supplier_corrections IS 'Crowdsourced data fixes. Reviewed + applied by enrichment pipeline or admin.';

-- ─── 10. AI brief cache (item #20) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_ai_briefs (
  listing_id UUID PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  brief_markdown TEXT NOT NULL,
  who_line TEXT,
  great_at_line TEXT,
  watch_for_line TEXT,
  generated_model TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  input_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_ai_briefs_generated
  ON supplier_ai_briefs (generated_at DESC);

ALTER TABLE supplier_ai_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_ai_briefs_select_all"
  ON supplier_ai_briefs FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE supplier_ai_briefs IS 'AI-generated 3-paragraph supplier summary. Cached by input_hash so the same underlying data yields a stable brief.';

-- ─── 11. Auto-update triggers for updated_at columns ────────────────────────

CREATE OR REPLACE FUNCTION supplier_enrichment_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_certifications_upd ON supplier_certifications;
CREATE TRIGGER trg_supplier_certifications_upd
  BEFORE UPDATE ON supplier_certifications
  FOR EACH ROW EXECUTE FUNCTION supplier_enrichment_set_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_capabilities_upd ON supplier_capabilities;
CREATE TRIGGER trg_supplier_capabilities_upd
  BEFORE UPDATE ON supplier_capabilities
  FOR EACH ROW EXECUTE FUNCTION supplier_enrichment_set_updated_at();
