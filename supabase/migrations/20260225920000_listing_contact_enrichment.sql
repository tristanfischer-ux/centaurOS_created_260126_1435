-- =============================================
-- MIGRATION: Contact Enrichment for Marketplace Listings
-- Purpose: Add structured contact fields and outreach tracking
-- to marketplace_listings for marketing campaign support.
-- =============================================

-- Contact fields (structured, not buried in JSONB)
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_title TEXT,
  ADD COLUMN IF NOT EXISTS contact_linkedin TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_source TEXT DEFAULT 'manual'
    CHECK (contact_source IN ('manual', 'ai_enriched', 'self_reported', 'csv_import')),
  ADD COLUMN IF NOT EXISTS contact_enriched_at TIMESTAMPTZ;

-- Outreach tracking (supplier-level, independent of outreach_contacts)
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS outreach_status TEXT DEFAULT 'not_started'
    CHECK (outreach_status IN (
      'not_started', 'enriching', 'ready', 'imported',
      'contacted', 'replied', 'claimed', 'onboarded', 'not_relevant'
    )),
  ADD COLUMN IF NOT EXISTS outreach_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- Linking columns for outreach bridge (Phase 2)
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS outreach_contact_id UUID;

-- Index for filtering by outreach status (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_outreach_status
  ON public.marketplace_listings(outreach_status);

-- Index for finding listings with/without emails
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_contact_email
  ON public.marketplace_listings(contact_email)
  WHERE contact_email IS NOT NULL;

-- Index for linking back from outreach contacts
ALTER TABLE public.outreach_contacts
  ADD COLUMN IF NOT EXISTS source_listing_id UUID;
