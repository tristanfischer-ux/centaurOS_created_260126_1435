-- =============================================
-- MIGRATION: Fix foundry_id Type Mismatch in create_notification Function
-- =============================================
-- Issue: v_foundry_id was declared as UUID but foundry_id column is TEXT
-- This caused "Invalid input syntax for type uuid: 'test-foundry-001'" error
-- =============================================

-- Drop and recreate the create_notification function with correct type
DROP FUNCTION IF EXISTS public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT DEFAULT NULL,
    p_link TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_foundry_id TEXT; -- Changed from UUID to TEXT to match profiles.foundry_id type
    v_notification_id UUID;
BEGIN
    -- Get user's foundry
    SELECT foundry_id INTO v_foundry_id FROM profiles WHERE id = p_user_id;
    
    IF v_foundry_id IS NULL THEN
        RAISE EXCEPTION 'User not found or has no foundry';
    END IF;
    
    INSERT INTO notifications (user_id, foundry_id, type, title, message, link, metadata)
    VALUES (p_user_id, v_foundry_id, p_type, p_title, p_message, p_link, p_metadata)
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- VERIFICATION
-- =============================================
-- The function should now work correctly with text foundry_ids like 'test-foundry-001'
-- Test: SELECT create_notification(auth.uid(), 'info', 'Test', 'Message');
-- =============================================
