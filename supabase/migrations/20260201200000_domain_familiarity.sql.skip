-- Migration: Add domain familiarity tracking and primer content
-- Part of Tech Tree Actions Redesign

-- =============================================================================
-- 1. Add primer field to knowledge_domains
-- =============================================================================

ALTER TABLE knowledge_domains 
ADD COLUMN IF NOT EXISTS primer JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN knowledge_domains.primer IS 'AI-generated or human-written primer content for the domain. Structure: {overview, key_concepts[], decision_points[], terminology{}, ai_generated, last_updated}';

-- =============================================================================
-- 2. Create domain_familiarity table
-- =============================================================================

CREATE TABLE IF NOT EXISTS domain_familiarity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES knowledge_domains(id) ON DELETE CASCADE,
  foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  familiarity TEXT NOT NULL CHECK (familiarity IN ('expert', 'familiar', 'learning', 'unknown')) DEFAULT 'unknown',
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  UNIQUE(domain_id, foundry_id)
);

CREATE INDEX IF NOT EXISTS idx_domain_familiarity_foundry ON domain_familiarity(foundry_id);
CREATE INDEX IF NOT EXISTS idx_domain_familiarity_domain ON domain_familiarity(domain_id);

COMMENT ON TABLE domain_familiarity IS 'Tracks team-level familiarity with knowledge domains. One record per domain per foundry.';

-- =============================================================================
-- 3. Create domain_question_assignments table (optional future use)
-- =============================================================================

CREATE TABLE IF NOT EXISTS domain_question_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES knowledge_domains(id) ON DELETE CASCADE,
  foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'answered', 'skipped')),
  answer TEXT,
  notes TEXT,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_question_assignments_foundry ON domain_question_assignments(foundry_id);
CREATE INDEX IF NOT EXISTS idx_domain_question_assignments_assigned ON domain_question_assignments(assigned_to);

COMMENT ON TABLE domain_question_assignments IS 'Tracks question assignments to team members for specific domains.';

-- =============================================================================
-- 4. RLS Policies for domain_familiarity
-- =============================================================================

ALTER TABLE domain_familiarity ENABLE ROW LEVEL SECURITY;

-- Members can view familiarity for their foundry
CREATE POLICY "domain_familiarity_select_policy"
ON domain_familiarity FOR SELECT
TO authenticated
USING (
  foundry_id IN (
    SELECT foundry_id FROM foundry_members 
    WHERE profile_id = auth.uid()
  )
);

-- Members can insert familiarity for their foundry
CREATE POLICY "domain_familiarity_insert_policy"
ON domain_familiarity FOR INSERT
TO authenticated
WITH CHECK (
  foundry_id IN (
    SELECT foundry_id FROM foundry_members 
    WHERE profile_id = auth.uid()
  )
);

-- Members can update familiarity for their foundry
CREATE POLICY "domain_familiarity_update_policy"
ON domain_familiarity FOR UPDATE
TO authenticated
USING (
  foundry_id IN (
    SELECT foundry_id FROM foundry_members 
    WHERE profile_id = auth.uid()
  )
)
WITH CHECK (
  foundry_id IN (
    SELECT foundry_id FROM foundry_members 
    WHERE profile_id = auth.uid()
  )
);

-- Members can delete familiarity for their foundry (admins/managers)
CREATE POLICY "domain_familiarity_delete_policy"
ON domain_familiarity FOR DELETE
TO authenticated
USING (
  foundry_id IN (
    SELECT fm.foundry_id FROM foundry_members fm
    WHERE fm.profile_id = auth.uid()
    AND fm.role IN ('admin', 'manager')
  )
);

-- =============================================================================
-- 5. RLS Policies for domain_question_assignments
-- =============================================================================

ALTER TABLE domain_question_assignments ENABLE ROW LEVEL SECURITY;

-- Members can view assignments for their foundry
CREATE POLICY "domain_question_assignments_select_policy"
ON domain_question_assignments FOR SELECT
TO authenticated
USING (
  foundry_id IN (
    SELECT foundry_id FROM foundry_members 
    WHERE profile_id = auth.uid()
  )
);

-- Members can insert assignments for their foundry
CREATE POLICY "domain_question_assignments_insert_policy"
ON domain_question_assignments FOR INSERT
TO authenticated
WITH CHECK (
  foundry_id IN (
    SELECT foundry_id FROM foundry_members 
    WHERE profile_id = auth.uid()
  )
);

-- Assignee or admins can update assignments
CREATE POLICY "domain_question_assignments_update_policy"
ON domain_question_assignments FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid()
  OR foundry_id IN (
    SELECT fm.foundry_id FROM foundry_members fm
    WHERE fm.profile_id = auth.uid()
    AND fm.role IN ('admin', 'manager')
  )
);

-- Admins can delete assignments
CREATE POLICY "domain_question_assignments_delete_policy"
ON domain_question_assignments FOR DELETE
TO authenticated
USING (
  foundry_id IN (
    SELECT fm.foundry_id FROM foundry_members fm
    WHERE fm.profile_id = auth.uid()
    AND fm.role IN ('admin', 'manager')
  )
);

-- =============================================================================
-- 6. Function to upsert domain familiarity
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_domain_familiarity(
  p_domain_id UUID,
  p_foundry_id TEXT,
  p_familiarity TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS domain_familiarity
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result domain_familiarity;
BEGIN
  -- Verify user is member of foundry
  IF NOT EXISTS (
    SELECT 1 FROM foundry_members 
    WHERE foundry_id = p_foundry_id AND profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to update familiarity for this foundry';
  END IF;

  -- Upsert the familiarity record
  INSERT INTO domain_familiarity (domain_id, foundry_id, familiarity, updated_by, notes, updated_at)
  VALUES (p_domain_id, p_foundry_id, p_familiarity, auth.uid(), p_notes, now())
  ON CONFLICT (domain_id, foundry_id) 
  DO UPDATE SET 
    familiarity = EXCLUDED.familiarity,
    updated_by = EXCLUDED.updated_by,
    notes = COALESCE(EXCLUDED.notes, domain_familiarity.notes),
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION upsert_domain_familiarity TO authenticated;

COMMENT ON FUNCTION upsert_domain_familiarity IS 'Upserts a domain familiarity record for a foundry. Validates membership.';
