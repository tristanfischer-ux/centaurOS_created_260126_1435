-- Add extended_description column to objectives table
-- This allows for a short description (summary) and a longer extended description (detailed context)

ALTER TABLE objectives
ADD COLUMN IF NOT EXISTS extended_description TEXT;

-- Add comment for documentation
COMMENT ON COLUMN objectives.description IS 'Short summary of the objective (1-2 sentences)';
COMMENT ON COLUMN objectives.extended_description IS 'Extended description with full context, background, and details (supports Markdown)';
