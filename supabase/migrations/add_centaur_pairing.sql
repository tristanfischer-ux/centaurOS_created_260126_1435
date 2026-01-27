-- Add paired_ai_id column to profiles table to link a human to an AI agent
ALTER TABLE profiles
ADD COLUMN paired_ai_id UUID REFERENCES profiles(id);

-- Add index for performance on lookups
CREATE INDEX idx_profiles_paired_ai_id ON profiles(paired_ai_id);
