-- Red Team Pass 2 (2026-03-25)
-- RT-2: RAISE EXCEPTION messages were leaking foundry_id values to attackers.
-- Fix: Use generic error messages that don't confirm foundry existence.

-- ============================================================
-- Fix get_marketplace_recommendations — generic error message
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_marketplace_recommendations(p_foundry_id text, p_limit integer DEFAULT 10)
RETURNS TABLE (
    id uuid,
    source_type text,
    category text,
    subcategory text,
    search_term text,
    reasoning text,
    priority integer,
    created_at timestamptz
) AS $$
BEGIN
    -- SECURITY: Verify caller belongs to requested foundry
    IF NOT EXISTS (
      SELECT 1 FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.foundry_id = p_foundry_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: caller is not a member of the requested foundry';
    END IF;

    RETURN QUERY
    SELECT
        mr.id,
        mr.source_type,
        mr.category,
        mr.subcategory,
        mr.search_term,
        mr.reasoning,
        mr.priority,
        mr.created_at
    FROM public.marketplace_recommendations mr
    WHERE mr.foundry_id = p_foundry_id
      AND mr.is_dismissed = false
      AND (mr.expires_at IS NULL OR mr.expires_at > now())
    ORDER BY mr.priority DESC, mr.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Fix generate_gap_recommendations — generic error message
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_gap_recommendations(p_foundry_id text)
RETURNS integer AS $$
DECLARE
    v_count integer := 0;
    v_gap RECORD;
BEGIN
    -- SECURITY: Verify caller belongs to requested foundry
    IF NOT EXISTS (
      SELECT 1 FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.foundry_id = p_foundry_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: caller is not a member of the requested foundry';
    END IF;

    FOR v_gap IN
        SELECT
            ffc.id as coverage_id,
            bf.category as func_category,
            bf.name as func_name,
            bf.description
        FROM public.foundry_function_coverage ffc
        JOIN public.business_functions bf ON bf.id = ffc.function_id
        WHERE ffc.foundry_id = p_foundry_id
          AND ffc.coverage_status = 'gap'
    LOOP
        INSERT INTO public.marketplace_recommendations (
            foundry_id, source_type, source_id, category, subcategory,
            search_term, reasoning, priority
        )
        VALUES (
            p_foundry_id,
            'coverage_gap',
            v_gap.coverage_id,
            CASE v_gap.func_category
                WHEN 'legal' THEN 'Services'
                WHEN 'finance' THEN 'Services'
                WHEN 'people' THEN 'People'
                WHEN 'product' THEN 'People'
                WHEN 'operations' THEN 'Services'
                ELSE 'People'
            END,
            v_gap.func_name,
            v_gap.func_name,
            format('Your foundry has a gap in %s. Consider finding help in the marketplace.', v_gap.func_name),
            CASE
                WHEN v_gap.func_category IN ('legal', 'finance') THEN 80
                WHEN v_gap.func_category IN ('product', 'strategy') THEN 70
                ELSE 50
            END
        )
        ON CONFLICT DO NOTHING;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Fix count_active_founders — generic error message
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_active_founders(target_foundry_id text)
RETURNS integer AS $$
BEGIN
    -- SECURITY: Verify caller belongs to requested foundry
    IF NOT EXISTS (
      SELECT 1 FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.foundry_id = target_foundry_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: caller is not a member of the requested foundry';
    END IF;

    RETURN (
      SELECT COUNT(*)::integer
      FROM public.profiles
      WHERE foundry_id = target_foundry_id
        AND role = 'Founder'
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
