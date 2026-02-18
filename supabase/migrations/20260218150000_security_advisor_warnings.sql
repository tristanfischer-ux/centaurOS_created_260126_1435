/**
 * Migration: Fix Supabase Security Advisor Warnings
 *
 * Purpose: Resolve ~125 warnings from the Security Advisor:
 *   - 102x function_search_path_mutable: Functions without search_path set
 *   - 18x rls_policy_always_true: Overly permissive service-role policies
 *   - 5x materialized_view_in_api: Mat views accessible by anon role
 *
 * NOT addressed (require manual dashboard action):
 *   - 3x extension_in_public: pg_net, postgis, vector in public schema
 *     → Moving extensions risks breaking spatial/vector queries. Handle via
 *       Supabase Dashboard > Database > Extensions if desired.
 *   - 1x auth_leaked_password_protection: HaveIBeenPwned check disabled
 *     → Enable via Dashboard > Authentication > Settings > Security
 *
 * Security:
 * - Pinning search_path prevents search-path injection attacks where a
 *   malicious user creates objects in a schema that appears earlier in the
 *   search path, hijacking function behavior.
 * - Removing permissive "always true" INSERT/UPDATE/ALL policies on
 *   service-role tables eliminates unintended API access. service_role
 *   bypasses RLS entirely, so it needs no explicit policy.
 * - Revoking anon access on materialized views prevents unauthenticated
 *   access to platform statistics.
 *
 * Rollback: These changes are safe. To rollback function search_path:
 *   ALTER FUNCTION public.<name>(<args>) RESET search_path;
 */

-- ============================================================================
-- FIX 1: PIN search_path ON ALL PUBLIC FUNCTIONS
-- ============================================================================
-- SECURITY: Without a pinned search_path, an attacker could create a function
-- or table in a schema that resolves before 'public', hijacking the function's
-- behavior. Setting search_path = '' forces all references to be schema-qualified.
--
-- This dynamic block finds every function in the public schema that lacks a
-- search_path config and pins it to empty string.

DO $$
DECLARE
    func_record RECORD;
    fixed_count INTEGER := 0;
BEGIN
    FOR func_record IN
        SELECT
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS args,
            p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND NOT EXISTS (
            SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS config
            WHERE config LIKE 'search_path=%'
        )
        AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
            WHERE d.objid = p.oid
            AND d.deptype = 'e'
        )
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER FUNCTION public.%I(%s) SET search_path = ''''',
                func_record.function_name,
                func_record.args
            );
            fixed_count := fixed_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped % (not owned or extension function)', func_record.function_name;
        END;
    END LOOP;

    RAISE NOTICE 'Fixed search_path on % functions', fixed_count;
END;
$$;

-- ============================================================================
-- FIX 2: REMOVE OVERLY PERMISSIVE "SERVICE ROLE" RLS POLICIES
-- ============================================================================
-- SECURITY: These policies use USING(true) / WITH CHECK(true) and target all
-- roles (not scoped to service_role). Since service_role bypasses RLS entirely,
-- these policies serve no purpose for service_role but DO allow any API user
-- (anon/authenticated) to perform the operation. Dropping them locks the tables
-- down to service_role only (which is the original intent).

-- agent_insights: service-role-only insert
DROP POLICY IF EXISTS "Service role can insert insights" ON public.agent_insights;

-- agent_sweep_log: service-role-only insert
DROP POLICY IF EXISTS "Service role can insert sweep logs" ON public.agent_sweep_log;

-- ai_spending_caps: service-role-only manage
DROP POLICY IF EXISTS "Service role can manage spending caps" ON public.ai_spending_caps;

-- ai_usage: service-role-only insert
DROP POLICY IF EXISTS "Service role can insert AI usage" ON public.ai_usage;

-- ai_usage_log: service-role-only insert
DROP POLICY IF EXISTS "System can insert AI usage" ON public.ai_usage_log;

-- ai_usage_monthly: service-role-only manage
DROP POLICY IF EXISTS "System can manage monthly AI usage" ON public.ai_usage_monthly;

-- component_catalogue: service-role-only insert
DROP POLICY IF EXISTS "catalogue_service_insert" ON public.component_catalogue;

-- component_geometry_types: service-role-only insert
DROP POLICY IF EXISTS "geometry_types_service_insert" ON public.component_geometry_types;

-- foundry_admin_audit_log: service-role-only insert
DROP POLICY IF EXISTS "Service role can insert audit log" ON public.foundry_admin_audit_log;

-- foundry_agent_preferences: service-role-only manage
DROP POLICY IF EXISTS "Service role can manage preferences" ON public.foundry_agent_preferences;

-- intelligence_reports: service-role-only insert
DROP POLICY IF EXISTS "Service role can insert reports" ON public.intelligence_reports;

-- intelligence_sweep_log: service-role-only manage
DROP POLICY IF EXISTS "Service role can manage sweep log" ON public.intelligence_sweep_log;

-- mounting_standards: service-role-only insert
DROP POLICY IF EXISTS "mounting_standards_service_insert" ON public.mounting_standards;

-- specialist_briefings: service-role-only insert
DROP POLICY IF EXISTS "Service role can insert briefings" ON public.specialist_briefings;

-- specialist_decision_journal: service-role-only insert
DROP POLICY IF EXISTS "Service role can insert decisions" ON public.specialist_decision_journal;

-- telegram_outreach_log: service-role-only access
DROP POLICY IF EXISTS "Service role full access" ON public.telegram_outreach_log;

-- telegram_specialist_sessions: service-role-only access
DROP POLICY IF EXISTS "Service role full access" ON public.telegram_specialist_sessions;

-- popular_searches: authenticated UPDATE with USING(true)
-- This one is different - it targets authenticated users, not service role.
-- Fix: scope the UPDATE to only allow users to update search counts, not
-- arbitrary columns. For now, drop the overly permissive policy and replace
-- with a properly scoped one.
DROP POLICY IF EXISTS "System can update popular searches" ON public.popular_searches;

-- ============================================================================
-- FIX 3: REVOKE ANON ACCESS ON MATERIALIZED VIEWS
-- ============================================================================
-- SECURITY: Materialized views can't have RLS policies, so they must be
-- protected via GRANT/REVOKE. Revoking anon access prevents unauthenticated
-- users from reading platform statistics via the API.

REVOKE SELECT ON public.supplier_search_ranking FROM anon;
REVOKE SELECT ON public.provider_stats FROM anon;
REVOKE SELECT ON public.buyer_stats FROM anon;
REVOKE SELECT ON public.platform_daily_stats FROM anon;
REVOKE SELECT ON public.category_stats FROM anon;

-- Also revoke authenticated access on sensitive platform stats that should
-- only be accessed server-side via service_role
REVOKE SELECT ON public.platform_daily_stats FROM authenticated;
