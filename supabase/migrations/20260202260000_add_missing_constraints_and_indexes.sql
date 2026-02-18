-- Migration: Add missing foreign key constraints and indexes for data integrity
-- Created: 2026-02-02
-- Description: Fixes missing FK constraint on report_snapshots.foundry_id and adds missing indexes

-- 1. Add missing foreign key constraint on report_snapshots.foundry_id
-- This prevents orphaned records if a foundry is deleted
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'report_snapshots_foundry_id_fkey'
    ) THEN
        ALTER TABLE report_snapshots 
        ADD CONSTRAINT report_snapshots_foundry_id_fkey 
        FOREIGN KEY (foundry_id) REFERENCES foundries(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Add missing indexes on foreign key columns for performance
-- These indexes speed up joins and RLS policy checks

-- Index for report_preferences.profile_id (used in RLS policies and queries)
CREATE INDEX IF NOT EXISTS idx_report_preferences_profile_id 
ON report_preferences(profile_id);

-- Index for report_snapshots.profile_id (used in RLS policies and queries)
CREATE INDEX IF NOT EXISTS idx_report_snapshots_profile_id 
ON report_snapshots(profile_id);

-- Index for report_snapshots.foundry_id (used in RLS policies and queries)
CREATE INDEX IF NOT EXISTS idx_report_snapshots_foundry_id 
ON report_snapshots(foundry_id);

-- Index for qa_test_runs.triggered_by (used in queries)
CREATE INDEX IF NOT EXISTS idx_qa_test_runs_triggered_by 
ON qa_test_runs(triggered_by);

-- Verify all constraints and indexes were created successfully
DO $$
BEGIN
    -- Verify FK constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'report_snapshots_foundry_id_fkey'
    ) THEN
        RAISE EXCEPTION 'Failed to create report_snapshots_foundry_id_fkey constraint';
    END IF;

    -- Verify indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_report_preferences_profile_id') THEN
        RAISE WARNING 'Index idx_report_preferences_profile_id may not have been created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_report_snapshots_profile_id') THEN
        RAISE WARNING 'Index idx_report_snapshots_profile_id may not have been created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_report_snapshots_foundry_id') THEN
        RAISE WARNING 'Index idx_report_snapshots_foundry_id may not have been created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_qa_test_runs_triggered_by') THEN
        RAISE WARNING 'Index idx_qa_test_runs_triggered_by may not have been created';
    END IF;

    RAISE NOTICE 'Migration completed successfully: Foreign key constraint and indexes added';
END $$;
