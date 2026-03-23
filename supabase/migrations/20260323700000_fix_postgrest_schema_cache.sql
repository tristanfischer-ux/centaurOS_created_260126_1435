-- Fix PostgREST schema cache issue
-- The previous migration had CREATE TABLE IF NOT EXISTS standard_hardware
-- which was a no-op (table exists) but may have confused PostgREST.
-- Drop and recreate the PostgREST schema cache by touching a view.

-- Force schema reload by altering a comment on a table
COMMENT ON TABLE material_properties IS 'Verified engineering material property handbook data';
COMMENT ON TABLE process_capabilities IS 'Real manufacturing process tolerances from supplier data';
COMMENT ON TABLE design_standards IS 'ISO/ASTM/DIN/BS engineering design standards';
COMMENT ON TABLE standard_hardware IS 'Standard off-the-shelf hardware components';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
