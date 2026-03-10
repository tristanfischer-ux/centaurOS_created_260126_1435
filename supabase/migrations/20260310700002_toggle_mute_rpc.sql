-- Atomic mute toggle to avoid TOCTOU race condition
-- SECURITY: auth.uid() check prevents toggling another user's mute status
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
  -- SECURITY: Only allow toggling your own mute status
  IF p_profile_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot toggle mute for another user';
  END IF;

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
