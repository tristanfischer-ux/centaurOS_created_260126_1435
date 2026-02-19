/**
 * Migration: Fix infinite recursion in foundry_memberships INSERT policy
 *
 * Purpose:
 * - The "Admins can create memberships" INSERT policy on foundry_memberships
 *   JOINs profiles to check p.role, creating a circular dependency:
 *   profiles RLS → can_access_profile() → foundry_memberships → profiles RLS
 * - Fix: use fm.role (the per-foundry role in foundry_memberships) instead of
 *   joining profiles. This is also semantically more correct since the
 *   membership role is the per-foundry role, not the legacy profiles.role.
 *
 * Security:
 * - Preserves the same authorization logic: only Founders/Executives can
 *   create memberships in their foundries.
 * - Users can still create their own membership (for accepting invitations).
 *
 * Related:
 * - 20260206400000_multi_foundry_support.sql (original policy)
 * - 20260214150000_restore_profiles_rls_with_membership_guard.sql (profiles RLS)
 *
 * Rollback:
 * - DROP POLICY "Admins can create memberships" ON foundry_memberships;
 * - Recreate original policy with profiles JOIN.
 */

-- SECURITY: Remove the policy that causes infinite recursion via profiles JOIN.
DROP POLICY IF EXISTS "Admins can create memberships" ON public.foundry_memberships;

-- SECURITY: Recreate using fm.role from foundry_memberships directly,
-- avoiding any reference to the profiles table.
CREATE POLICY "Admins can create memberships" ON public.foundry_memberships
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
      AND fm.foundry_id = foundry_memberships.foundry_id
      AND fm.role IN ('Founder', 'Executive')
    )
    OR auth.uid() = user_id  -- Users can also create their own (for accepting invitations)
  );
