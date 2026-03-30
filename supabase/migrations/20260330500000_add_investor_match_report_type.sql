-- ═══════════════════════════════════════════════════════════════════════
-- Add 'investor-match' to report_snapshots report_type CHECK constraint
-- and create marketplace_listing_contacts table for partner data.
-- ═══════════════════════════════════════════════════════════════════════

-- Widen the report_type CHECK to include investor-match and supplier-match
ALTER TABLE public.report_snapshots
  DROP CONSTRAINT IF EXISTS report_snapshots_report_type_check;

ALTER TABLE public.report_snapshots
  ADD CONSTRAINT report_snapshots_report_type_check
  CHECK (report_type IN (
    'daily', 'weekly', 'monthly', 'weekly-update', 'board-pack', 'custom',
    'investor-match', 'supplier-match', 'recruit-match'
  ));

-- DECISION: marketplace_listing_contacts table not needed — vc_pe_contacts
-- already stores partner data linked to marketplace_listings via listing_id.
-- The contact query in the match route has been fixed to fetch all senior
-- contacts (not just seniority='partner') and filter by title keywords.
