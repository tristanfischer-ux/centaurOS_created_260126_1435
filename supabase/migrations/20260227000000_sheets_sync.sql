-- =============================================
-- Google Sheets Two-Way Sync — Schema
-- =============================================
-- INTENT: Support real-time bidirectional sync between ForgeOS and Google Sheets.
-- Three new tables:
--   1. sheets_service_credentials — encrypted Service Account JSON per foundry
--   2. sheets_row_map — maps ForgeOS entities to Sheet rows for targeted updates
--   3. sheets_sync_log — audit trail for all sync operations

-- =============================================
-- 1. SHEETS_SERVICE_CREDENTIALS
-- =============================================
-- Stores AES-256-GCM encrypted Google Service Account JSON per foundry.
-- One SA per foundry; foundry_id is UNIQUE.

CREATE TABLE IF NOT EXISTS public.sheets_service_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL UNIQUE,
    encrypted_credentials bytea NOT NULL,
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sheets_service_credentials ENABLE ROW LEVEL SECURITY;

-- SECURITY: Only Founders can manage service account credentials
CREATE POLICY "Founders manage SA credentials"
    ON public.sheets_service_credentials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.foundry_id = sheets_service_credentials.foundry_id
              AND p.role = 'Founder'
              AND p.is_active = true
        )
    );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_sheets_service_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_sheets_service_credentials_updated_at
    BEFORE UPDATE ON public.sheets_service_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_sheets_service_credentials_updated_at();

-- =============================================
-- 2. SHEETS_ROW_MAP
-- =============================================
-- Maps ForgeOS entities (tasks/objectives) to specific rows in Google Sheets tabs.
-- Enables targeted cell updates without scanning the whole sheet.

CREATE TABLE IF NOT EXISTS public.sheets_row_map (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    spreadsheet_id text NOT NULL,
    sheet_tab_name text NOT NULL,
    sheet_tab_gid integer NOT NULL,
    entity_type text NOT NULL CHECK (entity_type IN ('task', 'objective')),
    entity_id uuid NOT NULL,
    row_number integer NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (foundry_id, spreadsheet_id, sheet_tab_name, entity_id)
);

CREATE INDEX idx_sheets_row_map_entity ON public.sheets_row_map(entity_type, entity_id);
CREATE INDEX idx_sheets_row_map_foundry ON public.sheets_row_map(foundry_id, spreadsheet_id);

ALTER TABLE public.sheets_row_map ENABLE ROW LEVEL SECURITY;

-- SECURITY: Founders and Executives can manage row mappings
CREATE POLICY "Admins manage row map"
    ON public.sheets_row_map
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.foundry_id = sheets_row_map.foundry_id
              AND p.is_active = true
              AND p.role IN ('Founder', 'Executive')
        )
    );

-- Service role bypass for background sync operations
CREATE POLICY "Service role manages row map"
    ON public.sheets_row_map
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_sheets_row_map_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_sheets_row_map_updated_at
    BEFORE UPDATE ON public.sheets_row_map
    FOR EACH ROW
    EXECUTE FUNCTION update_sheets_row_map_updated_at();

-- =============================================
-- 3. SHEETS_SYNC_LOG
-- =============================================
-- Audit trail for all sync operations (outbound and inbound).

CREATE TABLE IF NOT EXISTS public.sheets_sync_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    direction text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    entity_type text NOT NULL CHECK (entity_type IN ('task', 'objective', 'batch')),
    entity_id uuid,
    operation text NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'full_sync')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
    error_message text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sheets_sync_log_foundry ON public.sheets_sync_log(foundry_id, created_at DESC);
CREATE INDEX idx_sheets_sync_log_entity ON public.sheets_sync_log(entity_id);

ALTER TABLE public.sheets_sync_log ENABLE ROW LEVEL SECURITY;

-- SECURITY: Founders and Executives can view the sync log
CREATE POLICY "Admins view sync log"
    ON public.sheets_sync_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.foundry_id = sheets_sync_log.foundry_id
              AND p.is_active = true
              AND p.role IN ('Founder', 'Executive')
        )
    );

-- Service role can insert/update sync logs during background operations
CREATE POLICY "Service role manages sync log"
    ON public.sheets_sync_log
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (true);
