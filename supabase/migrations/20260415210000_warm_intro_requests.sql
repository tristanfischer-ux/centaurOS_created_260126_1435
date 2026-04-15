-- Warm intro requests from users who want Fractional Forge to facilitate
-- an introduction to a specific investor firm. Foundry-scoped (multi-tenant).
CREATE TABLE warm_intro_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  foundry_id text NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  firm_name text NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 2000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','working_on_it','connected','declined','no_path')),
  admin_notes text,
  resolved_at timestamptz
);

CREATE INDEX idx_warm_intro_requests_foundry ON warm_intro_requests(foundry_id);
CREATE INDEX idx_warm_intro_requests_listing ON warm_intro_requests(listing_id);
CREATE INDEX idx_warm_intro_requests_pending ON warm_intro_requests(status) WHERE status = 'pending';

ALTER TABLE warm_intro_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warm_intro_requests_select_own_foundry"
  ON warm_intro_requests FOR SELECT
  USING (
    foundry_id IN (
      SELECT foundry_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "warm_intro_requests_insert_own"
  ON warm_intro_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND foundry_id IN (
      SELECT foundry_id FROM profiles WHERE id = auth.uid()
    )
  );
