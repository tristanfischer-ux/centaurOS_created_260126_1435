/**
 * Create System Foundries for Suppliers, Executives, and Apprentices
 * 
 * Problem: Supplier, Executive, and Apprentice signups fail because:
 * 1. Code references "centaur-suppliers" foundry (line 190 in signup.ts)
 * 2. Code references "centaur-guild" foundry (line 197 in signup.ts)
 * 3. These foundries don't exist in the database
 * 4. Foreign key constraint on profiles.foundry_id fails when trying to insert
 * 
 * Solution: Create both system foundries if they don't exist
 * 
 * Note: The 20260202000000_add_account_type.sql migration created centaur-suppliers
 * but centaur-guild was never created.
 */

-- 1. Create the "Centaur Guild" foundry for Executives and Apprentices
-- This is where all executives and apprentices go until they're assigned to projects
INSERT INTO public.foundries (id, name, slug, owner_id, industry, stage)
VALUES (
    'centaur-guild',
    'The Centaur Guild',
    'centaur-guild',
    NULL,  -- System foundry, no owner
    'Platform',
    'Active'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug;

-- 2. Ensure "Centaur Suppliers" foundry exists (should exist from earlier migration)
-- Doing UPSERT to be safe
INSERT INTO public.foundries (id, name, slug, owner_id, industry, stage)
VALUES (
    'centaur-suppliers',
    'Marketplace Suppliers',
    'centaur-suppliers',
    NULL,  -- System foundry, no owner
    'Marketplace',
    'Active'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug;

-- 3. Add comments for documentation
COMMENT ON TABLE public.foundries IS 
'Foundries represent organizations in ForgeOS. 
Special system foundries:
- centaur-guild: Default foundry for Executives and Apprentices
- centaur-suppliers: Default foundry for Marketplace Suppliers';

-- 4. Create a special RLS policy for system foundries
-- System foundries should be viewable by anyone who needs to join them
DROP POLICY IF EXISTS "allow_view_system_foundries" ON public.foundries;

CREATE POLICY "allow_view_system_foundries"
    ON public.foundries FOR SELECT
    USING (
        id IN ('centaur-guild', 'centaur-suppliers')
        OR id = get_my_foundry_id()
    );

-- Note: The existing policies handle founder-specific operations
-- This new policy just ensures system foundries are visible for signup
