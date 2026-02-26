-- Microsoft OAuth tokens — per-user, per-foundry token storage
-- Mirrors google_oauth_tokens for Microsoft Graph API access

CREATE TABLE IF NOT EXISTS microsoft_oauth_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    microsoft_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, foundry_id)
);

-- RLS: Users can only manage their own tokens
ALTER TABLE microsoft_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Microsoft tokens"
    ON microsoft_oauth_tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Microsoft tokens"
    ON microsoft_oauth_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Microsoft tokens"
    ON microsoft_oauth_tokens FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Microsoft tokens"
    ON microsoft_oauth_tokens FOR DELETE
    USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER microsoft_oauth_tokens_updated_at
    BEFORE UPDATE ON microsoft_oauth_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
