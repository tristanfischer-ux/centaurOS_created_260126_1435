-- Blueprint Integration Enhancements
-- Adds foundry_id to blueprint_domain_coverage for direct RLS
-- Adds metadata JSONB to tasks for blueprint/domain linking
-- Adds blueprint_id to objectives for initiative grouping

-- ============================================================================
-- 1. ADD FOUNDRY_ID TO BLUEPRINT_DOMAIN_COVERAGE
-- Enables direct RLS without join to blueprints table
-- ============================================================================

-- Add column (nullable first for existing data)
ALTER TABLE blueprint_domain_coverage 
ADD COLUMN IF NOT EXISTS foundry_id TEXT;

-- Backfill from blueprints table
UPDATE blueprint_domain_coverage bdc
SET foundry_id = b.foundry_id
FROM blueprints b
WHERE bdc.blueprint_id = b.id
AND bdc.foundry_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE blueprint_domain_coverage 
ALTER COLUMN foundry_id SET NOT NULL;

-- Add foreign key
ALTER TABLE blueprint_domain_coverage
ADD CONSTRAINT blueprint_domain_coverage_foundry_id_fkey 
FOREIGN KEY (foundry_id) REFERENCES foundries(id) ON DELETE CASCADE;

-- Add index for RLS performance
CREATE INDEX IF NOT EXISTS idx_blueprint_domain_coverage_foundry 
ON blueprint_domain_coverage(foundry_id);

-- Update RLS policies for direct foundry access
DROP POLICY IF EXISTS "View coverage for accessible blueprints" ON blueprint_domain_coverage;
DROP POLICY IF EXISTS "Manage coverage for own blueprints" ON blueprint_domain_coverage;

CREATE POLICY "Users can view coverage in their foundry" 
ON blueprint_domain_coverage FOR SELECT 
USING (
    foundry_id = get_my_foundry_id()
    AND is_active_user()
);

CREATE POLICY "Users can insert coverage in their foundry" 
ON blueprint_domain_coverage FOR INSERT 
WITH CHECK (
    foundry_id = get_my_foundry_id()
    AND is_active_user()
);

CREATE POLICY "Users can update coverage in their foundry" 
ON blueprint_domain_coverage FOR UPDATE 
USING (
    foundry_id = get_my_foundry_id()
    AND is_active_user()
);

CREATE POLICY "Users can delete coverage in their foundry" 
ON blueprint_domain_coverage FOR DELETE 
USING (
    foundry_id = get_my_foundry_id()
    AND is_active_user()
);

-- ============================================================================
-- 2. ADD METADATA JSONB TO TASKS
-- Enables blueprint_id and domain_id tagging for task tracking
-- ============================================================================

-- Add column with default empty object
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add comment documenting schema
COMMENT ON COLUMN tasks.metadata IS 'Extensible metadata. Schema: {blueprint_id?: uuid, domain_id?: uuid, artifact_type?: string, provenance?: object}';

-- Add GIN index for JSONB queries (CONCURRENTLY to avoid lock)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_metadata_gin 
ON tasks USING GIN (metadata);

-- Add specific indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_blueprint_id 
ON tasks ((metadata->>'blueprint_id')) 
WHERE metadata->>'blueprint_id' IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_domain_id 
ON tasks ((metadata->>'domain_id')) 
WHERE metadata->>'domain_id' IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_artifact_type 
ON tasks ((metadata->>'artifact_type')) 
WHERE metadata->>'artifact_type' IS NOT NULL;

-- ============================================================================
-- 3. ADD BLUEPRINT_ID TO OBJECTIVES
-- Links initiatives to blueprints for project grouping
-- ============================================================================

-- Add column
ALTER TABLE objectives 
ADD COLUMN IF NOT EXISTS blueprint_id UUID REFERENCES blueprints(id) ON DELETE SET NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_objectives_blueprint 
ON objectives(blueprint_id) 
WHERE blueprint_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN objectives.blueprint_id IS 'Optional link to blueprint for initiative grouping';

-- ============================================================================
-- 4. ADD UPDATED_AT TRIGGER FOR OPTIMISTIC LOCKING
-- Ensures updated_at is always current for conflict detection
-- ============================================================================

-- Create function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to blueprint_domain_coverage
DROP TRIGGER IF EXISTS set_updated_at ON blueprint_domain_coverage;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON blueprint_domain_coverage
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. HELPER FUNCTION FOR BLUEPRINT TASK QUERIES
-- ============================================================================

CREATE OR REPLACE FUNCTION get_blueprint_tasks(p_blueprint_id UUID)
RETURNS SETOF tasks AS $$
BEGIN
    RETURN QUERY
    SELECT t.*
    FROM tasks t
    WHERE t.foundry_id = get_my_foundry_id()
    AND t.metadata->>'blueprint_id' = p_blueprint_id::text
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. HELPER FUNCTION FOR DOMAIN TASKS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_domain_tasks(p_domain_id UUID)
RETURNS SETOF tasks AS $$
BEGIN
    RETURN QUERY
    SELECT t.*
    FROM tasks t
    WHERE t.foundry_id = get_my_foundry_id()
    AND t.metadata->>'domain_id' = p_domain_id::text
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. VALIDATION CHECK CONSTRAINT FOR METADATA
-- Ensures metadata has valid structure when set
-- ============================================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS valid_blueprint_metadata;
ALTER TABLE tasks ADD CONSTRAINT valid_blueprint_metadata CHECK (
    metadata IS NULL 
    OR jsonb_typeof(metadata) = 'object'
);
