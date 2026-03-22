-- INTENT: Allow authenticated providers to create and update their own marketplace listings.
-- The existing RLS only has Global Read (SELECT) and Service Role Manage (ALL for service_role).
-- New users who sign up as providers get "You don't have permission to modify this record"
-- when trying to create a listing via self-service because no INSERT/UPDATE policy exists.

-- Providers can INSERT listings they create (created_by_provider_id must be their own)
CREATE POLICY "providers_can_create_listings"
  ON public.marketplace_listings
  FOR INSERT
  WITH CHECK (
    created_by_provider_id IN (
      SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
    )
  );

-- Providers can UPDATE their own listings only
CREATE POLICY "providers_can_update_own_listings"
  ON public.marketplace_listings
  FOR UPDATE
  USING (
    created_by_provider_id IN (
      SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by_provider_id IN (
      SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
    )
  );

-- Providers can DELETE their own listings (e.g., withdraw from marketplace)
CREATE POLICY "providers_can_delete_own_listings"
  ON public.marketplace_listings
  FOR DELETE
  USING (
    created_by_provider_id IN (
      SELECT id FROM public.provider_profiles WHERE user_id = auth.uid()
    )
  );
