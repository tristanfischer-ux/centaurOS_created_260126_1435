-- Migration: Fix concurrency issues in agent memory system
--
-- Purpose: Prevent duplicate threads, duplicate observations, and race conditions
-- when multiple specialist dialogs are used simultaneously.
--
-- Problems fixed:
-- 1. No UNIQUE constraint on threads → duplicate threads created on concurrent init
-- 2. No UNIQUE constraint on observations → duplicate observation rows per thread
-- 3. processMemory can double-process messages when called concurrently
--
-- Approach:
-- - Add unique index on (foundry_id, context_type, context_id) for threads
-- - Add unique index on (thread_id) for observations (one observation set per thread)
-- - Create an RPC function for atomic get-or-create thread operations
-- - Create an RPC function for advisory-locked memory processing
--
-- Rollback:
--   DROP FUNCTION IF EXISTS get_or_create_specialist_thread;
--   DROP FUNCTION IF EXISTS acquire_memory_processing_lock;
--   DROP INDEX IF EXISTS idx_memory_threads_unique_context;
--   DROP INDEX IF EXISTS idx_memory_observations_unique_thread;

-- ─── 1. Deduplicate existing threads before adding constraint ────────
-- If duplicates already exist (from past race conditions), keep the oldest
-- and reassign messages from duplicates to the canonical thread.

DO $$
DECLARE
    dup RECORD;
    canonical_id UUID;
BEGIN
    -- Find groups with duplicates
    FOR dup IN
        SELECT foundry_id, context_type, context_id, COUNT(*) as cnt
        FROM agent_memory_threads
        WHERE context_id IS NOT NULL
        GROUP BY foundry_id, context_type, context_id
        HAVING COUNT(*) > 1
    LOOP
        -- Get the canonical (oldest) thread
        SELECT id INTO canonical_id
        FROM agent_memory_threads
        WHERE foundry_id = dup.foundry_id
          AND context_type = dup.context_type
          AND context_id = dup.context_id
        ORDER BY created_at ASC
        LIMIT 1;

        -- Reassign messages from duplicate threads to canonical
        UPDATE agent_memory_messages
        SET thread_id = canonical_id
        WHERE thread_id IN (
            SELECT id FROM agent_memory_threads
            WHERE foundry_id = dup.foundry_id
              AND context_type = dup.context_type
              AND context_id = dup.context_id
              AND id != canonical_id
        );

        -- Reassign observations from duplicate threads to canonical
        UPDATE agent_memory_observations
        SET thread_id = canonical_id
        WHERE thread_id IN (
            SELECT id FROM agent_memory_threads
            WHERE foundry_id = dup.foundry_id
              AND context_type = dup.context_type
              AND context_id = dup.context_id
              AND id != canonical_id
        );

        -- Delete duplicate threads
        DELETE FROM agent_memory_threads
        WHERE foundry_id = dup.foundry_id
          AND context_type = dup.context_type
          AND context_id = dup.context_id
          AND id != canonical_id;
    END LOOP;
END $$;

-- Deduplicate observations (keep highest version per thread)
DO $$
DECLARE
    dup RECORD;
    keep_id UUID;
BEGIN
    FOR dup IN
        SELECT thread_id, COUNT(*) as cnt
        FROM agent_memory_observations
        GROUP BY thread_id
        HAVING COUNT(*) > 1
    LOOP
        -- Keep the one with highest version
        SELECT id INTO keep_id
        FROM agent_memory_observations
        WHERE thread_id = dup.thread_id
        ORDER BY version DESC
        LIMIT 1;

        DELETE FROM agent_memory_observations
        WHERE thread_id = dup.thread_id
          AND id != keep_id;
    END LOOP;
END $$;

-- ─── 2. Add UNIQUE constraints ──────────────────────────────────────

-- Unique thread per (foundry, context_type, context_id) where context_id is non-null
-- This covers specialists, workflow runs, etc.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_threads_unique_context
    ON agent_memory_threads(foundry_id, context_type, context_id)
    WHERE context_id IS NOT NULL;

-- For foundry-level threads where context_id is null, one per foundry per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_threads_unique_foundry_type
    ON agent_memory_threads(foundry_id, context_type)
    WHERE context_id IS NULL;

-- One observation row per thread
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_observations_unique_thread
    ON agent_memory_observations(thread_id);

-- ─── 3. Atomic get-or-create thread RPC ─────────────────────────────
-- Uses INSERT ... ON CONFLICT to atomically create or return existing thread.
-- Eliminates the SELECT-then-INSERT race condition entirely.

CREATE OR REPLACE FUNCTION get_or_create_specialist_thread(
    p_foundry_id TEXT,
    p_user_id UUID,
    p_context_type TEXT,
    p_context_id TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_thread_id UUID;
BEGIN
    -- Try INSERT first (optimistic — most calls after first will conflict)
    INSERT INTO agent_memory_threads (foundry_id, created_by, context_type, context_id, metadata)
    VALUES (p_foundry_id, p_user_id, p_context_type, p_context_id, p_metadata)
    ON CONFLICT (foundry_id, context_type, context_id) WHERE context_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_thread_id;

    -- If INSERT succeeded (new thread), return it
    IF v_thread_id IS NOT NULL THEN
        RETURN v_thread_id;
    END IF;

    -- Otherwise, fetch existing thread
    SELECT id INTO v_thread_id
    FROM agent_memory_threads
    WHERE foundry_id = p_foundry_id
      AND context_type = p_context_type
      AND context_id = p_context_id
    LIMIT 1;

    RETURN v_thread_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_or_create_specialist_thread TO authenticated;

-- ─── 4. Advisory lock helper for memory processing ──────────────────
-- Returns TRUE if the lock was acquired, FALSE if another process holds it.
-- Uses pg_try_advisory_xact_lock with thread UUID hash as the lock key.
-- Lock is automatically released at transaction end.

CREATE OR REPLACE FUNCTION acquire_memory_processing_lock(p_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Use hashtext to convert UUID to integer for advisory lock
    -- pg_try_advisory_xact_lock returns true if lock acquired, false if already held
    RETURN pg_try_advisory_xact_lock(hashtext(p_thread_id::text));
END;
$$;

GRANT EXECUTE ON FUNCTION acquire_memory_processing_lock TO authenticated;
