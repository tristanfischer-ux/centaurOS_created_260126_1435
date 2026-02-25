-- Knowledge Confidence Decay RPC
--
-- INTENT: Specialist knowledge entries grow stale over time. This function
-- reduces confidence by 0.05 per 30-day period for entries not updated
-- in the last 30 days, keeping the knowledge base honest.
--
-- Called by: src/app/api/cron/knowledge-decay/route.ts (daily cron)
-- Returns: count of rows whose confidence was reduced

CREATE OR REPLACE FUNCTION decay_knowledge_confidence()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE specialist_knowledge_base
    SET confidence = GREATEST(
        0.0,
        confidence - 0.05 * EXTRACT(EPOCH FROM (NOW() - last_updated_at)) / (30 * 24 * 3600)
    )
    WHERE last_updated_at < NOW() - INTERVAL '30 days'
      AND confidence > 0.0;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;

-- SECURITY: Only the service role (used by cron) may invoke this function.
REVOKE ALL ON FUNCTION decay_knowledge_confidence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decay_knowledge_confidence() TO service_role;
