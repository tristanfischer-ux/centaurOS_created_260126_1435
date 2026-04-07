-- ============================================================================
-- Clean up demo/seed data from Robert Schrimpff's foundry (solar-for-schools)
-- ============================================================================
-- Robert's AI agent was surfacing demo users' activity as real user progress.
-- Deactivate demo profiles and purge agent memory so the AI starts fresh.
-- ============================================================================

BEGIN;

-- Deactivate demo profiles (keeps FK integrity, hides from queries via is_active check)
UPDATE profiles
SET is_active = false,
    full_name = '[Demo] ' || full_name
WHERE foundry_id = 'solar-for-schools'
AND email LIKE '%@solarforschools.co.uk';

-- Remove their foundry memberships (they won't appear in team lists)
DELETE FROM foundry_memberships
WHERE foundry_id = 'solar-for-schools'
AND user_id IN (
    SELECT id FROM profiles WHERE email LIKE '%@solarforschools.co.uk'
);

-- Purge agent memory (contains references to demo users' activity)
DELETE FROM agent_memory_messages WHERE foundry_id = 'solar-for-schools';
DELETE FROM agent_memory_threads WHERE foundry_id = 'solar-for-schools';
DELETE FROM agent_insights WHERE foundry_id = 'solar-for-schools';

COMMIT;
