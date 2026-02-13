/**
 * Migration: Add endorsements system for People marketplace
 *
 * Purpose: Enable founders and executives to endorse experts they've worked with.
 * Two types: general endorsements (testimonials) and skill endorsements (counts).
 * Creates a LinkedIn-like credibility layer that drives viral growth.
 *
 * Security:
 * - RLS: Users can only create endorsements from their own account
 * - Users can read all public endorsements
 * - Users can only update/delete their own endorsements
 * - One endorsement per endorser-endorsed pair per type
 *
 * Related:
 * - Frontend: src/components/marketplace/endorsement-section.tsx
 * - Action: src/actions/endorsements.ts
 * - PersonCard: src/components/marketplace/person-card.tsx
 *
 * Rollback: DROP TABLE endorsements CASCADE; DROP TABLE skill_endorsements CASCADE;
 */

-- General endorsements (testimonials)
CREATE TABLE IF NOT EXISTS endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endorser_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endorsed_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    testimonial TEXT NOT NULL,
    relationship TEXT, -- e.g., "Client", "Colleague", "Hired via ForgeOS"
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One general endorsement per endorser-endorsed pair
    CONSTRAINT unique_general_endorsement UNIQUE (endorser_id, endorsed_user_id),
    -- Can't endorse yourself
    CONSTRAINT no_self_endorsement CHECK (endorser_id != endorsed_user_id)
);

-- Skill endorsements (one per skill per endorser-endorsed pair)
CREATE TABLE IF NOT EXISTS skill_endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endorser_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endorsed_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One endorsement per skill per endorser-endorsed pair
    CONSTRAINT unique_skill_endorsement UNIQUE (endorser_id, endorsed_user_id, skill_name),
    -- Can't endorse yourself
    CONSTRAINT no_self_skill_endorsement CHECK (endorser_id != endorsed_user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_endorsements_endorsed ON endorsements(endorsed_user_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_endorser ON endorsements(endorser_id);
CREATE INDEX IF NOT EXISTS idx_skill_endorsements_endorsed ON skill_endorsements(endorsed_user_id);
CREATE INDEX IF NOT EXISTS idx_skill_endorsements_skill ON skill_endorsements(endorsed_user_id, skill_name);

-- RLS Policies for endorsements
ALTER TABLE endorsements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read public endorsements
CREATE POLICY "Read public endorsements"
    ON endorsements FOR SELECT
    USING (is_public = true);

-- Users can read their own private endorsements
CREATE POLICY "Read own endorsements"
    ON endorsements FOR SELECT
    USING (endorser_id = auth.uid() OR endorsed_user_id = auth.uid());

-- Users can create endorsements from their own account
CREATE POLICY "Create own endorsements"
    ON endorsements FOR INSERT
    WITH CHECK (endorser_id = auth.uid());

-- Users can update their own endorsements
CREATE POLICY "Update own endorsements"
    ON endorsements FOR UPDATE
    USING (endorser_id = auth.uid());

-- Users can delete their own endorsements
CREATE POLICY "Delete own endorsements"
    ON endorsements FOR DELETE
    USING (endorser_id = auth.uid());

-- RLS Policies for skill_endorsements
ALTER TABLE skill_endorsements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read skill endorsements
CREATE POLICY "Read skill endorsements"
    ON skill_endorsements FOR SELECT
    USING (true);

-- Users can create skill endorsements from their own account
CREATE POLICY "Create own skill endorsements"
    ON skill_endorsements FOR INSERT
    WITH CHECK (endorser_id = auth.uid());

-- Users can delete their own skill endorsements
CREATE POLICY "Delete own skill endorsements"
    ON skill_endorsements FOR DELETE
    USING (endorser_id = auth.uid());

-- Helper function: Get endorsement counts for a user
CREATE OR REPLACE FUNCTION get_endorsement_counts(p_user_id UUID)
RETURNS TABLE (
    general_count BIGINT,
    skill_count BIGINT,
    top_skills JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM endorsements WHERE endorsed_user_id = p_user_id AND is_public = true) as general_count,
        (SELECT COUNT(DISTINCT endorser_id) FROM skill_endorsements WHERE endorsed_user_id = p_user_id) as skill_count,
        (
            SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
            FROM (
                SELECT skill_name, COUNT(*) as count
                FROM skill_endorsements
                WHERE endorsed_user_id = p_user_id
                GROUP BY skill_name
                ORDER BY count DESC
                LIMIT 5
            ) t
        ) as top_skills;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
