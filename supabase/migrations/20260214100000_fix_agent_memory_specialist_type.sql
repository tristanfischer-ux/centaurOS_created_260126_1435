-- Migration: Allow 'specialist' context_type in agent_memory_threads
--
-- Purpose: Fix critical bug where specialist advisor memory threads cannot be
-- created because the CHECK constraint on context_type doesn't include
-- 'specialist'. This causes silent failures in getOrCreateSpecialistThread(),
-- resulting in specialists having no persistent memory.
--
-- Root Cause: Original migration (20260211200000_agent_memory.sql) defined:
--   CHECK (context_type IN ('workflow_run', 'foundry', 'ghost_worker', 'chat'))
-- But src/actions/agent-memory.ts uses 'specialist' as the context_type
-- for all specialist advisor threads (lines 153, 219, 326).
--
-- Impact: Without this fix, every specialist conversation starts from scratch
-- with no memory of past interactions and no cross-specialist awareness.
--
-- Rollback: ALTER TABLE agent_memory_threads
--   DROP CONSTRAINT agent_memory_threads_context_type_check,
--   ADD CONSTRAINT agent_memory_threads_context_type_check
--   CHECK (context_type IN ('workflow_run', 'foundry', 'ghost_worker', 'chat'));

ALTER TABLE agent_memory_threads
    DROP CONSTRAINT IF EXISTS agent_memory_threads_context_type_check;

ALTER TABLE agent_memory_threads
    ADD CONSTRAINT agent_memory_threads_context_type_check
    CHECK (context_type IN ('workflow_run', 'foundry', 'ghost_worker', 'chat', 'specialist'));
