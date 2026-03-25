-- Apply weekly_target_minutes column (previous migration versions were recorded but SQL didn't execute)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_target_minutes integer DEFAULT 2400;

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_weekly_target_range
    CHECK (weekly_target_minutes IS NULL OR (weekly_target_minutes >= 60 AND weekly_target_minutes <= 10080));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
