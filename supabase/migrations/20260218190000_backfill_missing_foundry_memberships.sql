/**
 * Migration: Backfill missing foundry_memberships rows
 *
 * Purpose:
 * Users who have profiles.foundry_id set but no row in foundry_memberships
 * (e.g. created after multi-foundry migration, or signup path that skipped
 * membership insert) see "No companies yet" on My Profile and inconsistent
 * company display. This re-runs the same backfill logic as 20260206400000
 * Step 4 so every user with a foundry_id has a membership row.
 *
 * Security:
 * - INSERT only; no RLS bypass needed (run as migration).
 * - ON CONFLICT DO NOTHING keeps existing rows unchanged.
 *
 * Related:
 * - 20260206400000_multi_foundry_support.sql (original backfill)
 * - My Profile: src/app/(platform)/my-profile/
 */

INSERT INTO foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
SELECT
  p.id,
  p.foundry_id,
  p.role,
  true,
  COALESCE(p.created_at, now())
FROM profiles p
WHERE p.foundry_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM foundry_memberships fm
    WHERE fm.user_id = p.id AND fm.foundry_id = p.foundry_id
  )
ON CONFLICT (user_id, foundry_id) DO NOTHING;
