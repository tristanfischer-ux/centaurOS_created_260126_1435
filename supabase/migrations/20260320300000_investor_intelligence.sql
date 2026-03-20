-- Migration: Add deep_bio column to vc_pe_contacts for Forge-Capital deep intelligence.
-- Also adds email_verified column if not present (needed for verified email push).

ALTER TABLE public.vc_pe_contacts ADD COLUMN IF NOT EXISTS deep_bio TEXT;
