-- ─── AI Provider Keys (encrypted, per-user BYOAI) ────────────────────
-- Stores encrypted API keys for various AI providers.
-- Keys are encrypted server-side using AES-256-GCM before storage.

CREATE TABLE IF NOT EXISTS ai_provider_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,  -- 'openai', 'anthropic', 'google', etc.
    encrypted_key TEXT NOT NULL,
    key_hint TEXT NOT NULL DEFAULT '',  -- last 4 chars for display
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Each user can only have one key per provider
    UNIQUE(user_id, provider_id)
);

-- ─── AI Provider Preferences (per-user defaults) ─────────────────────
-- Stores the user's default provider + model for each output modality.

CREATE TABLE IF NOT EXISTS ai_provider_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    modality TEXT NOT NULL,  -- 'text', 'image', 'audio', 'video', 'slides'
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Each user can only have one preference per modality
    UNIQUE(user_id, modality)
);

-- ─── RLS Policies ────────────────────────────────────────────────────

ALTER TABLE ai_provider_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own keys
CREATE POLICY "Users can view own provider keys"
    ON ai_provider_keys FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own provider keys"
    ON ai_provider_keys FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own provider keys"
    ON ai_provider_keys FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own provider keys"
    ON ai_provider_keys FOR DELETE
    USING (auth.uid() = user_id);

-- Users can only see/manage their own preferences
CREATE POLICY "Users can view own provider preferences"
    ON ai_provider_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own provider preferences"
    ON ai_provider_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own provider preferences"
    ON ai_provider_preferences FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own provider preferences"
    ON ai_provider_preferences FOR DELETE
    USING (auth.uid() = user_id);

-- ─── Indexes ─────────────────────────────────────────────────────────

CREATE INDEX idx_ai_provider_keys_user ON ai_provider_keys(user_id);
CREATE INDEX idx_ai_provider_prefs_user ON ai_provider_preferences(user_id);
