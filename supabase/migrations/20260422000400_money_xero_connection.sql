-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1B · xero_connection
-- MONEY-SCHEMA.md §2 · xero_connection
--
-- One Xero org per foundry (multi-Xero-org per foundry deferred to V2).
-- One Xero org across two foundries is EXPLICITLY REJECTED in V1 — the OAuth
-- flow errors with "This Xero organisation is already connected to foundry X.
-- Contact support to split." PK stays foundry_id; future multi-org enablement
-- additive via (foundry_id, organisation_id) composite PK.
--
-- Tokens encrypted at application layer before INSERT (bytea columns). Service
-- role only reads/writes — never exposed to browser.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.xero_connection (
  foundry_id                text PRIMARY KEY
                              REFERENCES public.foundries(id) ON DELETE CASCADE,
  organisation_id           text NOT NULL,
  organisation_name         text NOT NULL,
  access_token_encrypted    bytea NOT NULL,
  refresh_token_encrypted   bytea NOT NULL,
  token_expires_at          timestamptz NOT NULL,
  scopes                    text[] NOT NULL DEFAULT '{}'::text[],
  connected_by_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at              timestamptz NOT NULL DEFAULT now(),
  last_sync_at              timestamptz,
  sync_frequency            text NOT NULL DEFAULT 'every_15_min'
                              CHECK (sync_frequency IN
                                ('every_15_min','hourly','every_4h','daily','manual')),
  webhook_enabled           boolean NOT NULL DEFAULT true,
  sync_state                text NOT NULL DEFAULT 'healthy'
                              CHECK (sync_state IN ('healthy','syncing','error','paused')),
  last_error_message        text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.xero_connection IS
  'MONEY-SCHEMA §2 · one Xero org per foundry. V1 rejects one-org-two-foundries '
  'at OAuth time. Tokens encrypted at app layer before INSERT.';

-- Global uniqueness on organisation_id — one Xero org → one foundry.
-- OAuth flow catches this and returns an explicit error.
CREATE UNIQUE INDEX IF NOT EXISTS xero_connection_unique_org_id
  ON public.xero_connection (organisation_id);

DROP TRIGGER IF EXISTS xero_connection_set_updated_at ON public.xero_connection;
CREATE TRIGGER xero_connection_set_updated_at
  BEFORE UPDATE ON public.xero_connection
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.xero_connection ENABLE ROW LEVEL SECURITY;

-- SELECT: Founder + Executive only (tokens are confidential).
-- Apprentice, AI_Agent, Supplier have no access.
CREATE POLICY xero_connection_foundry_select
  ON public.xero_connection FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

-- Write: Founder-only. Executive can read but not reconnect/revoke.
CREATE POLICY xero_connection_founder_write
  ON public.xero_connection FOR ALL
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
