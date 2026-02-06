-- Drop the UUID overload so only the TEXT version remains
DROP FUNCTION IF EXISTS update_foundry_purpose(UUID, JSONB);
