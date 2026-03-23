-- Force PostgREST to reload its schema cache
-- This is needed after the engineering database seed migration
NOTIFY pgrst, 'reload schema';
