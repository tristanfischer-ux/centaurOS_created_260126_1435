/**
 * Migration: Fix Supabase Security Advisor Errors
 *
 * Purpose: Resolve all 8 errors reported by the Supabase Security Advisor:
 *   1. Security Definer View: platform_monthly_stats
 *   2. Security Definer View: ai_usage_daily_summary
 *   3. Security Definer View: ai_spending_monthly
 *   4. RLS Disabled: foundry_agent_permissions
 *   5. RLS Disabled: rate_limits
 *   6. RLS Disabled: agent_permission_tiers
 *   7. RLS Disabled: agent_action_tier_map
 *   8. RLS Disabled: spatial_ref_sys (SKIPPED - PostGIS system table, not owned by us)
 *
 * Security:
 * - Views switched from security_definer to security_invoker so RLS is
 *   respected when queried through the API
 * - RLS enabled on all public tables with appropriate policies:
 *   - Reference/lookup tables: authenticated users can SELECT
 *   - Foundry-scoped tables: foundry members can SELECT their own data
 *   - Service-only tables (rate_limits): RLS enabled with no user policies
 *     (only service_role bypasses RLS)
 *   - PostGIS system table (spatial_ref_sys): SKIPPED - owned by extension
 *
 * Rollback:
 *   ALTER VIEW platform_monthly_stats SET (security_invoker = off);
 *   ALTER VIEW ai_usage_daily_summary SET (security_invoker = off);
 *   ALTER VIEW ai_spending_monthly SET (security_invoker = off);
 *   ALTER TABLE foundry_agent_permissions DISABLE ROW LEVEL SECURITY;
 *   ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
 *   ALTER TABLE agent_permission_tiers DISABLE ROW LEVEL SECURITY;
 *   ALTER TABLE agent_action_tier_map DISABLE ROW LEVEL SECURITY;
 *   -- spatial_ref_sys: PostGIS system table, not modified by this migration
 */

-- ============================================================================
-- FIX 1-3: SECURITY DEFINER VIEWS → SECURITY INVOKER
-- ============================================================================
-- By default, views use security_definer which bypasses RLS. Switching to
-- security_invoker ensures queries respect the calling user's RLS policies.

ALTER VIEW public.platform_monthly_stats SET (security_invoker = on);
ALTER VIEW public.ai_usage_daily_summary SET (security_invoker = on);
ALTER VIEW public.ai_spending_monthly SET (security_invoker = on);

-- ============================================================================
-- FIX 4: ENABLE RLS ON foundry_agent_permissions
-- ============================================================================
-- SECURITY: Per-foundry agent permission overrides. Only foundry members
-- should see their own foundry's configuration.

ALTER TABLE public.foundry_agent_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "foundry_members_select_own_permissions"
    ON public.foundry_agent_permissions
    FOR SELECT
    USING (
        foundry_id IN (
            SELECT foundry_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "foundry_admins_manage_permissions"
    ON public.foundry_agent_permissions
    FOR ALL
    USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('Founder', 'Executive')
        )
    )
    WITH CHECK (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('Founder', 'Executive')
        )
    );

-- ============================================================================
-- FIX 5: ENABLE RLS ON rate_limits
-- ============================================================================
-- SECURITY: Rate limits are accessed exclusively via service_role from API
-- routes. Enabling RLS with no user-facing policies means only service_role
-- (which bypasses RLS) can access this table. This is the intended behavior.

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — service_role only

-- ============================================================================
-- FIX 6: ENABLE RLS ON agent_permission_tiers
-- ============================================================================
-- SECURITY: This is a global reference/lookup table (tier definitions).
-- All authenticated users need read access to display tier info in the UI.
-- Only service_role can modify tiers (seeded via migrations).

ALTER TABLE public.agent_permission_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_users_read_tiers"
    ON public.agent_permission_tiers
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================================
-- FIX 7: ENABLE RLS ON agent_action_tier_map
-- ============================================================================
-- SECURITY: Global reference table mapping action types to permission tiers.
-- All authenticated users need read access for the permission-checking UI.
-- Only service_role can modify mappings (seeded via migrations).

ALTER TABLE public.agent_action_tier_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_users_read_action_tier_map"
    ON public.agent_action_tier_map
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================================
-- NOTE ON spatial_ref_sys
-- ============================================================================
-- spatial_ref_sys is a PostGIS system table owned by the extension. We cannot
-- ALTER it (requires superuser/extension owner). This is a known Supabase
-- Security Advisor false positive for PostGIS-enabled projects. The table
-- contains only public coordinate reference system definitions and poses no
-- security risk.
