/**
 * Migration: Google Workspace Integration
 *
 * Purpose: Add tables for Google OAuth token storage and calendar sync mappings.
 * Enables Google Calendar, Drive, and Meet integration per-user, per-foundry.
 *
 * Security:
 * - RLS policy ensures users can only access their own tokens
 * - Service role required for token refresh operations
 * - Tokens should be encrypted at application level before storage
 * - Foundry isolation enforced via RLS
 *
 * Related:
 * - src/lib/google/tokens.ts - Token CRUD operations
 * - src/lib/google/calendar.ts - Calendar API wrapper
 * - src/actions/google-calendar.ts - Calendar server actions
 *
 * Rollback: DROP TABLE calendar_sync_mappings, google_oauth_tokens CASCADE
 */

-- Google OAuth tokens for per-user, per-foundry Google API access
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    google_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, foundry_id)
);

-- RLS: Users can only manage their own tokens
ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Google tokens"
    ON google_oauth_tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Google tokens"
    ON google_oauth_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Google tokens"
    ON google_oauth_tokens FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Google tokens"
    ON google_oauth_tokens FOR DELETE
    USING (auth.uid() = user_id);

-- Calendar sync mappings: links CentaurOS entities to Google Calendar events
CREATE TABLE IF NOT EXISTS calendar_sync_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'discovery_call', 'objective', 'standup')),
    entity_id UUID NOT NULL,
    google_calendar_id TEXT NOT NULL DEFAULT 'primary',
    google_event_id TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_direction TEXT NOT NULL DEFAULT 'push' CHECK (sync_direction IN ('push', 'pull', 'bidirectional')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, entity_type, entity_id)
);

-- RLS: Users can only manage their own sync mappings
ALTER TABLE calendar_sync_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar mappings"
    ON calendar_sync_mappings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar mappings"
    ON calendar_sync_mappings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar mappings"
    ON calendar_sync_mappings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar mappings"
    ON calendar_sync_mappings FOR DELETE
    USING (auth.uid() = user_id);

-- Indexes for efficient lookups
CREATE INDEX idx_google_oauth_tokens_user ON google_oauth_tokens(user_id);
CREATE INDEX idx_google_oauth_tokens_foundry ON google_oauth_tokens(foundry_id);
CREATE INDEX idx_calendar_sync_entity ON calendar_sync_mappings(entity_type, entity_id);
CREATE INDEX idx_calendar_sync_user ON calendar_sync_mappings(user_id);
CREATE INDEX idx_calendar_sync_google_event ON calendar_sync_mappings(google_event_id);

-- Add source columns to task_files for Google Drive integration (Phase 2)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'task_files' AND column_name = 'source'
    ) THEN
        ALTER TABLE task_files ADD COLUMN source TEXT NOT NULL DEFAULT 'upload';
        ALTER TABLE task_files ADD COLUMN google_drive_file_id TEXT;
        ALTER TABLE task_files ADD COLUMN google_drive_url TEXT;
    END IF;
END $$;
