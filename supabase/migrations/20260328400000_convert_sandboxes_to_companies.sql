-- Convert all existing sandbox foundries to real companies.
-- Name pattern: "{firstName}'s Workspace" → "{firstName}'s Company"
-- Slug is preserved to avoid breaking any bookmarks or cached references.
-- This is idempotent — running again on non-sandbox foundries is a no-op.

UPDATE public.foundries
SET
  is_sandbox = false,
  name = REPLACE(name, '''s Workspace', '''s Company')
WHERE is_sandbox = true;
