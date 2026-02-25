-- Specialist message feedback (thumbs up/down)
CREATE TABLE IF NOT EXISTS specialist_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    specialist_id TEXT NOT NULL,
    thread_id UUID,
    message_index INTEGER NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_specialist_feedback_foundry
    ON specialist_feedback(foundry_id, specialist_id, created_at DESC);

CREATE INDEX idx_specialist_feedback_thread
    ON specialist_feedback(thread_id, message_index);

-- RLS
ALTER TABLE specialist_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own foundry feedback"
    ON specialist_feedback FOR SELECT
    USING (foundry_id IN (
        SELECT foundry_id FROM profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert own foundry feedback"
    ON specialist_feedback FOR INSERT
    WITH CHECK (foundry_id IN (
        SELECT foundry_id FROM profiles WHERE id = auth.uid()
    ));

-- Unique constraint: one rating per message per thread
CREATE UNIQUE INDEX idx_specialist_feedback_unique
    ON specialist_feedback(thread_id, message_index);
