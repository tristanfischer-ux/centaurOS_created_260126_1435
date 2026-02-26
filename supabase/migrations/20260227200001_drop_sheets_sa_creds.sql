-- Drop the Service Account credentials table — replaced by per-user OAuth tokens.
-- The sheets integration now uses the admin's Google/Microsoft OAuth token
-- instead of a Service Account.

DROP TABLE IF EXISTS sheets_service_credentials CASCADE;
