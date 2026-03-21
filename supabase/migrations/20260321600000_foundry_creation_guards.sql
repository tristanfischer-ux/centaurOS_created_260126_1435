/**
 * Migration: Foundry creation guards and RLS update for dual identity.
 *
 * Purpose:
 * 1. Database-level enforcement of max 3 foundries per user (prevents TOCTOU race)
 * 2. Allow Executives to create foundries (prerequisite for "Create a Company" feature)
 *
 * Rollback:
 *   DROP TRIGGER IF EXISTS enforce_foundry_limit ON foundries;
 *   DROP FUNCTION IF EXISTS check_foundry_limit();
 *   -- Re-create the old INSERT policy manually
 */

-- C-2: Enforce max 3 foundries per owner at the database level
CREATE OR REPLACE FUNCTION check_foundry_limit()
RETURNS trigger AS $$
BEGIN
    IF (SELECT count(*) FROM foundries WHERE owner_id = NEW.owner_id) >= 3 THEN
        RAISE EXCEPTION 'Maximum foundry limit reached (3 per user)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_foundry_limit
    BEFORE INSERT ON foundries
    FOR EACH ROW
    EXECUTE FUNCTION check_foundry_limit();

-- H-3: Allow Executives (and Founders) to insert foundries.
-- Previously only Founders could INSERT, but the "Create a Company" flow
-- needs Executives to create their first foundry (they become Founder after).
DO $$ BEGIN
    -- Drop the old restrictive policy if it exists
    DROP POLICY IF EXISTS "Founders can insert their foundry" ON foundries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Team builders can create foundries"
    ON foundries FOR INSERT
    WITH CHECK (
        auth.uid() = owner_id
        AND get_my_role() IN ('Founder', 'Executive')
    );
