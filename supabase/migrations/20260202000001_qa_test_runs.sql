-- QA Test Runs table for tracking Day in the Life test results
-- Stores results from GitHub Actions workflow runs

-- Create enum for test status
CREATE TYPE qa_test_status AS ENUM ('pending', 'running', 'passed', 'failed', 'cancelled');

-- Create enum for environment
CREATE TYPE qa_test_environment AS ENUM ('staging', 'production');

-- Create the qa_test_runs table
CREATE TABLE IF NOT EXISTS qa_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- GitHub workflow identifiers
    github_run_id TEXT UNIQUE,
    github_run_url TEXT,
    
    -- Test configuration
    environment qa_test_environment NOT NULL DEFAULT 'staging',
    
    -- Who triggered it
    triggered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    triggered_by_name TEXT,
    
    -- Overall status
    status qa_test_status NOT NULL DEFAULT 'pending',
    
    -- Per-persona results (JSON for flexibility)
    results JSONB DEFAULT '{}'::jsonb,
    -- Example: { "executive": "passed", "founder": "failed", "apprentice": "passed" }
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Artifacts
    artifacts_url TEXT,
    error_message TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Foundry scope (for multi-tenant)
    foundry_id TEXT REFERENCES foundries(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX idx_qa_test_runs_status ON qa_test_runs(status);
CREATE INDEX idx_qa_test_runs_environment ON qa_test_runs(environment);
CREATE INDEX idx_qa_test_runs_foundry ON qa_test_runs(foundry_id);
CREATE INDEX idx_qa_test_runs_created ON qa_test_runs(created_at DESC);
CREATE INDEX idx_qa_test_runs_github ON qa_test_runs(github_run_id);

-- Add updated_at trigger
CREATE TRIGGER set_qa_test_runs_updated_at
    BEFORE UPDATE ON qa_test_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE qa_test_runs ENABLE ROW LEVEL SECURITY;

-- Admins can view all test runs in their foundry
CREATE POLICY "Admins can view qa test runs"
    ON qa_test_runs
    FOR SELECT
    TO authenticated
    USING (
        foundry_id = get_my_foundry_id()
        AND (
            get_my_role() IN ('Founder', 'Executive')
            OR EXISTS (
                SELECT 1 FROM foundry_admin_permissions
                WHERE profile_id = auth.uid()
                AND foundry_id = qa_test_runs.foundry_id
            )
        )
    );

-- Admins can create test runs
CREATE POLICY "Admins can create qa test runs"
    ON qa_test_runs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        foundry_id = get_my_foundry_id()
        AND (
            get_my_role() IN ('Founder', 'Executive')
            OR EXISTS (
                SELECT 1 FROM foundry_admin_permissions
                WHERE profile_id = auth.uid()
                AND foundry_id = qa_test_runs.foundry_id
            )
        )
    );

-- Admins can update test runs (for webhook callbacks)
CREATE POLICY "Admins can update qa test runs"
    ON qa_test_runs
    FOR UPDATE
    TO authenticated
    USING (
        foundry_id = get_my_foundry_id()
        AND (
            get_my_role() IN ('Founder', 'Executive')
            OR EXISTS (
                SELECT 1 FROM foundry_admin_permissions
                WHERE profile_id = auth.uid()
                AND foundry_id = qa_test_runs.foundry_id
            )
        )
    );

-- Service role can do everything (for webhook callbacks)
CREATE POLICY "Service role full access"
    ON qa_test_runs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add comment
COMMENT ON TABLE qa_test_runs IS 'Tracks QA Day in the Life test runs triggered from admin panel';
