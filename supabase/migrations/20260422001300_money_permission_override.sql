-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1F · permission_override + audit_log additive
-- MONEY-SCHEMA.md §2 · permission_override + §2 audit_log additive columns
--
-- permission_override is the coarse-compile escape valve (per Option A
-- decision 2026-04-19). Until the 5→9 member_role enum expansion lands
-- as its own focused PR, per-user exceptions granting capabilities beyond
-- the role default live here, time-boxed.
--
-- audit_log gets two additive columns (ip_address, user_agent) needed for
-- compliance export. Null-safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── permission_override ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_override (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id              text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  capability              text NOT NULL
                            CHECK (capability IN (
                              -- Raise capabilities
                              'raise_read','raise_write','raise_lock','raise_send_update',
                              -- Plan capabilities
                              'plan_read','plan_write','plan_lock',
                              -- Cockpit capabilities
                              'cockpit_read','xero_connect','xero_disconnect',
                              -- Cost visibility
                              'credits_read','credits_budget_edit',
                              -- Settings
                              'settings_read','settings_write','permissions_edit',
                              -- Audit
                              'audit_read','audit_export'
                            )),
  granted                 boolean NOT NULL DEFAULT true,
  granted_by_user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason                  text,
  expires_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.permission_override IS
  'MONEY-SCHEMA §2 · per-user capability override beyond role default. '
  'Time-boxed via expires_at. Enables coarse-compile 5-role strategy (Option A) '
  'to handle cases the role matrix alone can''t express.';

COMMENT ON COLUMN public.permission_override.capability IS
  'Enum of capability keys. Server actions check both role-default and override '
  'before permitting the operation.';

CREATE UNIQUE INDEX IF NOT EXISTS permission_override_unique_per_user
  ON public.permission_override (foundry_id, user_id, capability);

CREATE INDEX IF NOT EXISTS permission_override_expiry_idx
  ON public.permission_override (expires_at)
  WHERE expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS permission_override_set_updated_at ON public.permission_override;
CREATE TRIGGER permission_override_set_updated_at
  BEFORE UPDATE ON public.permission_override
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.permission_override ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see their own overrides; Founder can see all foundry overrides.
CREATE POLICY permission_override_self_select
  ON public.permission_override FOR SELECT
  USING (
    user_id = auth.uid()
    OR foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role = 'Founder'
    )
  );

-- Write: Founder only (with founder-notified side-effect for co_founder edits
-- if 9-role enum lands later). For now Founder = only writer.
CREATE POLICY permission_override_founder_write
  ON public.permission_override FOR ALL
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role = 'Founder'
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role = 'Founder'
    )
  );

-- ── SHARED audit_log additive columns ───────────────────────────────────────
-- MONEY-SCHEMA §2 audit_log · compliance-export fields (ip_address + user_agent)

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS ip_address inet;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS user_agent text;

COMMENT ON COLUMN public.audit_log.ip_address IS
  'MONEY-SCHEMA §2 · client IP for compliance export. Null-safe — Phase 1 rows '
  'have NULL. Populated by src/lib/audit/write.ts helper from request headers.';

COMMENT ON COLUMN public.audit_log.user_agent IS
  'MONEY-SCHEMA §2 · client user-agent for compliance export. Null-safe.';

-- Additional index for Money settings audit log view (scope filter + date).
CREATE INDEX IF NOT EXISTS audit_log_scope_created_idx
  ON public.audit_log (section, created_at DESC)
  WHERE section IS NOT NULL;
