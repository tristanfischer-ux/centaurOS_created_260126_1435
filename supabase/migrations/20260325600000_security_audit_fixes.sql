-- Security Audit Remediation (2026-03-25)
-- Fixes: C2 (tasks RLS), C3 (switch_active_foundry auth), C4 (SECURITY DEFINER RPCs)
--
-- C2: Migration 20260204270000 replaced foundry-scoped tasks RLS with USING(true),
--     allowing cross-foundry task reads. Restore proper foundry isolation.
-- C3: switch_active_foundry accepts arbitrary p_user_id without verifying auth.uid().
-- C4: get_marketplace_recommendations, generate_gap_recommendations, count_active_founders,
--     has_foundry_admin_access accept caller-supplied foundry_id with SECURITY DEFINER
--     but never verify caller belongs to that foundry.

-- ============================================================
-- C2: Fix tasks RLS — cross-foundry read
-- ============================================================

DROP POLICY IF EXISTS "authenticated_users_view_tasks" ON public.tasks;

CREATE POLICY "authenticated_users_view_tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
    )
  );

-- ============================================================
-- C3: Fix switch_active_foundry — no auth.uid() check
-- ============================================================

CREATE OR REPLACE FUNCTION public.switch_active_foundry(p_user_id uuid, p_foundry_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- SECURITY: Caller must be the user whose foundry is being switched
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must match p_user_id';
  END IF;

  -- Verify user has membership in the target foundry
  IF NOT EXISTS (
    SELECT 1 FROM foundry_memberships
    WHERE user_id = p_user_id AND foundry_id = p_foundry_id
  ) THEN
    RETURN false;
  END IF;

  -- Update active foundry
  UPDATE profiles
  SET active_foundry_id = p_foundry_id,
      foundry_id = p_foundry_id,
      role = (SELECT role FROM foundry_memberships WHERE user_id = p_user_id AND foundry_id = p_foundry_id),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN true;
END;
$$;

-- ============================================================
-- C4: Fix get_marketplace_recommendations — no caller check
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
-- C4: Fix generate_gap_recommendations — no caller check
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
-- C4: Fix has_foundry_admin_access — no caller check
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_foundry_admin_access(user_id uuid, target_foundry_id text)
RETURNS boolean AS $$
DECLARE
    user_role text;
    user_is_active boolean;
    has_permission boolean;
BEGIN
    -- SECURITY: Caller must be the user being checked
    IF auth.uid() IS NULL OR auth.uid() != user_id THEN
      RAISE EXCEPTION 'Unauthorized: caller must match user_id';
    END IF;

    SELECT role, is_active INTO user_role, user_is_active
    FROM public.profiles
    WHERE id = user_id AND foundry_id = target_foundry_id;

    IF NOT COALESCE(user_is_active, false) THEN
        RETURN false;
    END IF;

    IF user_role = 'Founder' THEN
        RETURN true;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.foundry_admin_permissions
        WHERE profile_id = user_id AND foundry_id = target_foundry_id
    ) INTO has_permission;

    RETURN has_permission;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- C4: Fix count_active_founders — no caller check
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
