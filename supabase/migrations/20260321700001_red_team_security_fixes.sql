/**
 * Migration: Red team security fixes (round 2).
 *
 * Fixes:
 * 1. match_alerts INSERT policy: WITH CHECK (true) → WITH CHECK (false)
 *    Only admin/service_role client should create alerts (bypasses RLS).
 *    Previous policy let any authenticated user create alerts for any user.
 *
 * 2. Foundry limit trigger: Add pg_advisory_xact_lock to prevent TOCTOU race.
 *    Two concurrent requests could both see count=2 and both insert.
 *
 * 3. get_unread_alert_count: Add auth.uid() check to prevent information disclosure.
 *    Any user could query any other user's unread count.
 *
 * 4. Foundry INSERT RLS: Add account_type check alongside role check.
 *    Prevents users with wrong account_type from creating foundries via direct API.
 *
 * Rollback:
 *   -- Revert each policy/function to previous version
 */

-- 1. Fix match_alerts INSERT policy: block all regular users
-- The admin client (service_role) bypasses RLS entirely, so server-side
-- createMatchAlert() still works. This prevents any authenticated user
-- from inserting fake alerts for arbitrary users.
DROP POLICY IF EXISTS "Service create alerts" ON match_alerts;
CREATE POLICY "Service create alerts" ON match_alerts
    FOR INSERT WITH CHECK (false);

-- 2. Fix foundry limit trigger: use advisory lock to prevent TOCTOU race
CREATE OR REPLACE FUNCTION check_foundry_limit()
RETURNS trigger AS $$
BEGIN
    -- SECURITY: Serialize per-user to prevent two concurrent inserts
    -- both reading count=2 and both succeeding.
    PERFORM pg_advisory_xact_lock(hashtext('foundry_limit_' || NEW.owner_id::text));
    IF (SELECT count(*) FROM foundries WHERE owner_id = NEW.owner_id) >= 3 THEN
        RAISE EXCEPTION 'Maximum foundry limit reached (3 per user)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Fix get_unread_alert_count: restrict to own user only
-- Previous version was SECURITY DEFINER with no caller check,
-- allowing any user to query any other user's unread count.
CREATE OR REPLACE FUNCTION get_unread_alert_count(p_user_id UUID)
RETURNS BIGINT AS $$
BEGIN
    -- SECURITY: Only allow querying own alert count
    IF p_user_id != auth.uid() THEN
        RETURN 0;
    END IF;
    RETURN (
        SELECT COUNT(*)
        FROM match_alerts
        WHERE user_id = p_user_id
          AND read_at IS NULL
          AND dismissed_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fix foundry INSERT RLS: add account_type check
-- Previous policy only checked get_my_role() which is active-foundry-scoped.
-- A supplier or wrong account_type user could bypass via direct PostgREST call
-- if their role happened to match.
DROP POLICY IF EXISTS "Team builders can create foundries" ON foundries;
CREATE POLICY "Team builders can create foundries"
    ON foundries FOR INSERT
    WITH CHECK (
        auth.uid() = owner_id
        AND (SELECT account_type FROM profiles WHERE id = auth.uid()) = 'team_builder'
        AND get_my_role() IN ('Founder', 'Executive')
    );
