-- Migration: Fix overly permissive RLS policies
-- This restricts access to certain tables for better security

-- Fix popular_searches: restrict INSERT to service role only
DROP POLICY IF EXISTS "Authenticated users can insert popular searches" ON popular_searches;

CREATE POLICY "Service role can insert popular searches"
  ON popular_searches FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Add comment
COMMENT ON POLICY "Service role can insert popular searches" ON popular_searches IS 
  'Only the service role can insert popular searches to prevent user manipulation of trending data';

-- Note: service_providers policy "Global Read for Service Providers" allows all authenticated users to read
-- This is intentional for a public marketplace, but documenting here for review
-- If providers should only be visible within their foundry, this policy should be updated to:
-- CREATE POLICY "Users can view service providers in their foundry"
--   ON public.service_providers FOR SELECT
--   USING (foundry_id = get_my_foundry_id());
