-- Atomic mute toggle to avoid TOCTOU race condition
-- DECISION: SECURITY DEFINER so it bypasses RLS; caller identity checked via p_profile_id.
CREATE OR REPLACE FUNCTION toggle_conversation_mute(
  p_conversation_id uuid,
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_muted boolean;
BEGIN
  UPDATE conversation_participants
  SET is_muted = NOT is_muted
  WHERE conversation_id = p_conversation_id
    AND profile_id = p_profile_id
  RETURNING is_muted INTO new_muted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found in conversation';
  END IF;

  RETURN new_muted;
END;
$$;
