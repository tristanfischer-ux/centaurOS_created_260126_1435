-- Cleanup function for old agent memory messages.
-- Observed messages older than 90 days are deleted since their content has been
-- compressed into the observations table. Unobserved messages are preserved
-- regardless of age to prevent data loss.
--
-- Similar to cleanup_old_intelligence_reports() but with an is_observed guard.

CREATE OR REPLACE FUNCTION cleanup_old_memory_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM agent_memory_messages
    WHERE is_observed = true
      AND created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
