-- =============================================
-- MIGRATION: UK VC/PE Marketplace Support
-- Generated: 2026-02-25
-- Purpose: Add Finance category to marketplace + CRM contacts table
--          for UK VC/PE firm outreach tracking.
-- =============================================

-- =============================================
-- 1. Add 'Finance' to marketplace_category enum
-- =============================================
-- Postgres requires ALTER TYPE ... ADD VALUE (cannot be done inside a transaction block)
-- Using DO $$ block to check existence first
ALTER TYPE marketplace_category ADD VALUE IF NOT EXISTS 'Finance';

-- =============================================
-- 2. Create vc_pe_contacts table
-- Tracks individual contacts at VC/PE firms for CRM outreach.
-- Links to marketplace_listings (the firm record).
-- =============================================
CREATE TABLE IF NOT EXISTS public.vc_pe_contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    title TEXT,
    -- DECISION: seniority as text enum-like rather than DB enum for flexibility
    seniority TEXT CHECK (seniority IN ('partner', 'managing_director', 'principal', 'director', 'associate', 'analyst', 'other')),
    email TEXT,
    email_verified BOOLEAN DEFAULT false,
    linkedin_url TEXT,
    is_decision_maker BOOLEAN DEFAULT false,
    -- Warm intro: who in your network can intro you to this contact
    warm_intro_path TEXT,
    -- Outreach CRM
    outreach_status TEXT DEFAULT 'not_started' CHECK (
        outreach_status IN ('not_started', 'researching', 'contacted', 'replied', 'meeting_booked', 'in_discussion', 'closed_won', 'closed_lost', 'not_relevant')
    ),
    last_contacted_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by firm
CREATE INDEX IF NOT EXISTS vc_pe_contacts_listing_id_idx ON public.vc_pe_contacts(listing_id);
-- Index for CRM queries (find all contacts in a given outreach stage)
CREATE INDEX IF NOT EXISTS vc_pe_contacts_outreach_status_idx ON public.vc_pe_contacts(outreach_status);

-- RLS: authenticated users can read; service role manages
ALTER TABLE public.vc_pe_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Read VC PE Contacts') THEN
    CREATE POLICY "Authenticated Read VC PE Contacts" ON public.vc_pe_contacts
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role Manage VC PE Contacts') THEN
    CREATE POLICY "Service Role Manage VC PE Contacts" ON public.vc_pe_contacts
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.update_vc_pe_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vc_pe_contacts_updated_at ON public.vc_pe_contacts;
CREATE TRIGGER vc_pe_contacts_updated_at
    BEFORE UPDATE ON public.vc_pe_contacts
    FOR EACH ROW EXECUTE FUNCTION public.update_vc_pe_contacts_updated_at();
