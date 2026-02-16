/**
 * Migration: Make forge_map factories and capabilities publicly readable
 *
 * Purpose: The original RLS policies required `auth.role() = 'authenticated'`,
 * which blocks unauthenticated reads (anon key, MCP tools, public API consumers).
 * Factories and capabilities are shared reference data — there's no reason to
 * gate them behind authentication. Reviews remain foundry-isolated.
 *
 * Changes:
 * - forge_map_factories: SELECT policy → USING (true)
 * - forge_map_capabilities: SELECT policy → USING (true)
 *
 * Security:
 * - Read: anyone (public reference data)
 * - Write: still service_role only (no INSERT/UPDATE/DELETE policies for anon/authenticated)
 * - Reviews: unchanged (foundry-isolated)
 *
 * Rollback:
 *   DROP POLICY "public_read_factories" ON forge_map_factories;
 *   DROP POLICY "public_read_capabilities" ON forge_map_capabilities;
 *   CREATE POLICY "authenticated_read_factories" ON forge_map_factories FOR SELECT USING (auth.role() = 'authenticated');
 *   CREATE POLICY "authenticated_read_capabilities" ON forge_map_capabilities FOR SELECT USING (auth.role() = 'authenticated');
 */

-- Drop the old authenticated-only policies
DROP POLICY IF EXISTS "authenticated_read_factories" ON public.forge_map_factories;
DROP POLICY IF EXISTS "authenticated_read_capabilities" ON public.forge_map_capabilities;

-- Create public read policies (matches assembly_templates pattern)
CREATE POLICY "public_read_factories"
    ON public.forge_map_factories
    FOR SELECT
    USING (true);

CREATE POLICY "public_read_capabilities"
    ON public.forge_map_capabilities
    FOR SELECT
    USING (true);
