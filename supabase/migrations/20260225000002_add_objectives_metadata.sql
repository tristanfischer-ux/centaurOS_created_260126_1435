-- Add metadata jsonb column to objectives table
-- Mirrors the existing metadata column on tasks for storing
-- provenance info like source_thread_id from Forge conversations.

ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

COMMENT ON COLUMN objectives.metadata IS 'Flexible metadata bag — e.g. { source_thread_id }';
