-- Ensure the test-foundry-001 foundry row exists
-- Profiles reference this foundry_id but the row may be missing from the foundries table
INSERT INTO foundries (id, name)
VALUES ('test-foundry-001', 'Forge Foundry')
ON CONFLICT (id) DO NOTHING;
