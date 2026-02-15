/**
 * Migration: Specialist decision journal
 *
 * Purpose: Tracks key decisions made with specialist input for "remember when"
 * references and pattern recognition. Enables specialists to reference past
 * decisions naturally in conversation.
 *
 * Security:
 * - RLS policy ensures users can only read decisions in their own foundry
 * - Service role used for inserts (from execute route and Telegram webhook)
 *
 * Related:
 * - Module: src/lib/agents/decision-journal.ts
 * - Execute: src/app/api/agents/execute/route.ts
 *
 * Rollback: DROP TABLE specialist_decision_journal CASCADE
 */

-- Specialist decision journal
CREATE TABLE IF NOT EXISTS specialist_decision_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    specialist_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    context TEXT,
    outcome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying decisions by foundry and specialist
CREATE INDEX IF NOT EXISTS idx_decision_journal_foundry
    ON specialist_decision_journal(foundry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_journal_specialist
    ON specialist_decision_journal(foundry_id, specialist_id, created_at DESC);

-- RLS
ALTER TABLE specialist_decision_journal ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read decisions in their foundry
CREATE POLICY "Users can read own foundry decisions" ON specialist_decision_journal
    FOR SELECT USING (
        foundry_id IN (
            SELECT COALESCE(active_foundry_id, foundry_id) FROM profiles WHERE id = auth.uid()
        )
    );

-- RLS: Service role can insert (from execute route and Telegram webhook)
CREATE POLICY "Service role can insert decisions" ON specialist_decision_journal
    FOR INSERT WITH CHECK (true);
