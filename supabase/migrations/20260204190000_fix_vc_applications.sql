/**
 * Fix VC Application Submissions
 * 
 * Problem: VCs trying to "Apply for Access" cannot submit applications because:
 * 1. The provider_applications.user_id column is NOT NULL
 * 2. The RLS policy requires auth.uid() for inserts
 * 3. VC applications are submitted by unauthenticated users (no account yet)
 * 
 * Solution:
 * 1. Make user_id nullable (applications can be submitted without an account)
 * 2. Add RLS policy to allow unauthenticated users to submit applications
 * 3. Applications will have user_id = NULL until account is created/linked
 */

-- 1. Make user_id nullable to allow unauthenticated applications
ALTER TABLE public.provider_applications
    ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add RLS policy to allow unauthenticated application submissions
-- This allows users without accounts to apply (VC, Factory, University, Network)
CREATE POLICY "allow_unauthenticated_applications" ON public.provider_applications
    FOR INSERT 
    WITH CHECK (
        user_id IS NULL 
        OR user_id = auth.uid()
    );

-- 3. Update comment to reflect new behavior
COMMENT ON TABLE public.provider_applications IS 
'Supplier/partner vetting workflow for marketplace onboarding. 
user_id can be NULL for unauthenticated applications (VCs, factories, universities, network partners). 
When the applicant creates an account, user_id can be updated to link the application to their profile.';

-- 4. Add index for NULL user_id queries (for admin review of unauthenticated applications)
CREATE INDEX IF NOT EXISTS idx_provider_applications_null_user_id 
    ON public.provider_applications(id) 
    WHERE user_id IS NULL;

-- Note: The existing "insert_own_applications" policy will handle authenticated users
-- The new "allow_unauthenticated_applications" policy handles unauthenticated applications
