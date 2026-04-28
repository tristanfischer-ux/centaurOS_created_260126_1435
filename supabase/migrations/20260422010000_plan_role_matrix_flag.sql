-- PLAN-SCHEMA §16.3 · Access-change audit (MANDATORY before flag flip).
--
-- Adds two columns on `foundries` so we can record when a `founder` /
-- `co_founder` clicked "Apply Phase 3 role matrix" from the /plan/settings
-- Permissions tab. Until a row is stamped, Plan writes continue to use the
-- permissive legacy RLS behaviour for any role that would lose access under
-- the §16.1 matrix — so we never silently reduce access on flag flip.
--
-- Build terminal (Chunk E.2) reads/writes these columns via:
--   src/actions/plan/permissions.ts :: applyPhase3RoleMatrix()
--   src/app/(platform)/plan/settings/tabs/PermissionsTab.tsx (banner gate)

ALTER TABLE public.foundries
  ADD COLUMN IF NOT EXISTS phase3_role_matrix_applied_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS phase3_role_matrix_applied_by uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.foundries.phase3_role_matrix_applied_at IS
  'PLAN-SCHEMA §16.3 · when a founder / co_founder confirmed the Phase 3 role matrix delta. NULL = matrix not yet applied, Plan falls back to permissive legacy behaviour.';

COMMENT ON COLUMN public.foundries.phase3_role_matrix_applied_by IS
  'PLAN-SCHEMA §16.3 · auth.users.id of the member who confirmed the matrix. Exists for audit traceability, NULL when unapplied.';
