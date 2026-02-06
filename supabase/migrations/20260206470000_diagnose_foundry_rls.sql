-- Diagnostic function to inspect the live RLS state on the foundries table.
-- DELETE THIS AFTER DEBUGGING.
CREATE OR REPLACE FUNCTION diagnose_foundry_rls()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_foundry_id TEXT;
    v_is_active BOOLEAN;
    v_get_my_result TEXT;
    v_policies JSONB;
    v_foundry_exists BOOLEAN;
BEGIN
    v_user_id := auth.uid();

    SELECT foundry_id, is_active INTO v_foundry_id, v_is_active
    FROM profiles WHERE id = v_user_id;

    v_get_my_result := get_my_foundry_id();

    SELECT jsonb_agg(jsonb_build_object(
        'name', policyname,
        'cmd', cmd,
        'permissive', permissive,
        'roles', roles,
        'qual', qual
    )) INTO v_policies
    FROM pg_policies WHERE tablename = 'foundries';

    SELECT EXISTS(SELECT 1 FROM foundries WHERE id = v_foundry_id)
    INTO v_foundry_exists;

    RETURN jsonb_build_object(
        'user_id', v_user_id,
        'profile_foundry_id', v_foundry_id,
        'profile_is_active', v_is_active,
        'get_my_foundry_id_returns', v_get_my_result,
        'foundry_row_exists', v_foundry_exists,
        'policies', v_policies
    );
END;
$$;
