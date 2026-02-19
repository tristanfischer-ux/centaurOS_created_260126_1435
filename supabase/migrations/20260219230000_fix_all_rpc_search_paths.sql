/**
 * Migration: Fix search_path on all remaining RPC functions
 *
 * Purpose: 10 functions were created without SET search_path = public,
 * which causes "relation does not exist" errors in Supabase when the
 * function's default search_path doesn't include public.
 *
 * Security:
 * - All SECURITY DEFINER functions get explicit search_path = public
 * - Trigger functions also get search_path for consistency
 * - Prevents schema injection attacks via search_path manipulation
 *
 * Rollback: Functions are recreated from original definitions, so
 * rolling back means re-running without SET search_path (not recommended).
 */

-- 1. get_invitation_by_token (SECURITY DEFINER, called by invitation acceptance flow)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invitation_token text)
RETURNS TABLE (
    id uuid,
    foundry_id text,
    foundry_name text,
    email text,
    role public.member_role,
    invited_by_name text,
    expires_at timestamptz,
    is_valid boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ci.id,
        ci.foundry_id,
        f.name as foundry_name,
        ci.email,
        ci.role,
        p.full_name as invited_by_name,
        ci.expires_at,
        (ci.accepted_at IS NULL AND ci.expires_at > now()) as is_valid
    FROM public.company_invitations ci
    JOIN public.foundries f ON f.id = ci.foundry_id
    JOIN public.profiles p ON p.id = ci.invited_by
    WHERE ci.token = invitation_token;
END;
$$;

-- 2. update_knowledge_updated_at (trigger function)
CREATE OR REPLACE FUNCTION update_knowledge_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 3. update_knowledge_link_count (trigger function)
CREATE OR REPLACE FUNCTION update_knowledge_link_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.knowledge_notes
            SET link_count = link_count + 1
            WHERE id IN (NEW.source_note_id, NEW.target_note_id);
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.knowledge_notes
            SET link_count = GREATEST(link_count - 1, 0)
            WHERE id IN (OLD.source_note_id, OLD.target_note_id);
    END IF;
    RETURN NULL;
END;
$$;

-- 4. update_knowledge_domain_note_count (trigger function)
CREATE OR REPLACE FUNCTION update_knowledge_domain_note_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.domain_id IS NOT NULL THEN
        UPDATE public.knowledge_domains
            SET note_count = note_count + 1
            WHERE id = NEW.domain_id;
    ELSIF TG_OP = 'DELETE' AND OLD.domain_id IS NOT NULL THEN
        UPDATE public.knowledge_domains
            SET note_count = GREATEST(note_count - 1, 0)
            WHERE id = OLD.domain_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.domain_id IS DISTINCT FROM NEW.domain_id THEN
            IF OLD.domain_id IS NOT NULL THEN
                UPDATE public.knowledge_domains
                    SET note_count = GREATEST(note_count - 1, 0)
                    WHERE id = OLD.domain_id;
            END IF;
            IF NEW.domain_id IS NOT NULL THEN
                UPDATE public.knowledge_domains
                    SET note_count = note_count + 1
                    WHERE id = NEW.domain_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

-- 5. update_reference_models_updated_at (trigger function)
CREATE OR REPLACE FUNCTION public.update_reference_models_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 6. cleanup_old_intelligence_reports (SECURITY DEFINER, maintenance job)
CREATE OR REPLACE FUNCTION cleanup_old_intelligence_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM intelligence_reports
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- 7. cleanup_old_outreach_logs (SECURITY DEFINER, maintenance job)
CREATE OR REPLACE FUNCTION cleanup_old_outreach_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM telegram_outreach_log
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- 8. cleanup_expired_telegram_sessions (SECURITY DEFINER, maintenance job)
CREATE OR REPLACE FUNCTION public.cleanup_expired_telegram_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.telegram_specialist_sessions
    WHERE updated_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- 9. seed_founder_demo_data_expanded (SECURITY DEFINER, onboarding seed)
CREATE OR REPLACE FUNCTION seed_founder_demo_data_expanded(
  p_foundry_id TEXT,
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_listing UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE foundry_id = p_foundry_id
      AND event_type = 'demo_seed'
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Fractional Executive',
    'Sarah Chen — Fractional CTO',
    'Former VP Engineering at a Series B startup. 15 years building scalable systems. Available 2-3 days/week for early-stage companies needing technical leadership without full-time overhead.',
    jsonb_build_object(
      'expertise', ARRAY['System Architecture', 'Team Building', 'Technical Strategy'],
      'availability', '2-3 days/week',
      'experience_years', 15,
      'is_demo', true
    ),
    true
  );

  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Fractional Executive',
    'Marcus Williams — Fractional CFO',
    'Ex-Big 4 audit partner turned startup advisor. Specializes in fundraising preparation, financial modeling, and investor relations for hardware companies.',
    jsonb_build_object(
      'expertise', ARRAY['Financial Modeling', 'Fundraising', 'Investor Relations'],
      'availability', '1-2 days/week',
      'experience_years', 20,
      'is_demo', true
    ),
    true
  );

  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Fractional Executive',
    'Aisha Patel — Fractional CMO',
    'Growth marketing leader with 3 successful product launches. Expert in go-to-market strategy for hardware products, from positioning to launch campaigns.',
    jsonb_build_object(
      'expertise', ARRAY['Go-to-Market', 'Brand Strategy', 'Launch Campaigns'],
      'availability', '2 days/week',
      'experience_years', 12,
      'is_demo', true
    ),
    true
  );

  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Apprentice',
    'James Liu — Full-Stack Developer',
    'Recent CS graduate with strong React/Node.js skills and a passion for hardware-software integration. Built IoT prototypes during university. Ready to ship production code.',
    jsonb_build_object(
      'expertise', ARRAY['React', 'Node.js', 'IoT'],
      'availability', 'Full-time',
      'experience_years', 2,
      'is_demo', true
    ),
    true
  );

  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Apprentice',
    'Emma Rodriguez — Product Designer',
    'UX designer with industrial design background. Creates user experiences for physical products and their companion apps. Figma, CAD, and user research expertise.',
    jsonb_build_object(
      'expertise', ARRAY['UX Design', 'Industrial Design', 'User Research'],
      'availability', 'Full-time',
      'experience_years', 3,
      'is_demo', true
    ),
    true
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'company_created',
    jsonb_build_object(
      'message', 'Welcome to ForgeOS! Your company workspace has been created.',
      'is_demo', true
    ),
    v_now - INTERVAL '2 hours'
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'objective_created',
    jsonb_build_object(
      'title', 'Launch MVP Product',
      'type', 'strategic_goal',
      'message', 'Created strategic goal: Launch MVP Product',
      'is_demo', true
    ),
    v_now - INTERVAL '1 hour 45 minutes'
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'task_completed',
    jsonb_build_object(
      'title', 'Define product requirements',
      'message', 'Completed task: Define product requirements',
      'is_demo', true
    ),
    v_now - INTERVAL '1 hour'
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'objective_created',
    jsonb_build_object(
      'title', 'Build Your Team',
      'type', 'strategic_goal',
      'message', 'Created strategic goal: Build Your Team',
      'is_demo', true
    ),
    v_now - INTERVAL '45 minutes'
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'demo_seed',
    jsonb_build_object(
      'message', 'Demo data seeded for new founder experience',
      'is_demo', true
    ),
    v_now
  );

END;
$$;

-- 10. archive_grammar_version_on_update (SECURITY DEFINER, trigger function)
CREATE OR REPLACE FUNCTION archive_grammar_version_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.name = '__core_library__' THEN
    RETURN NEW;
  END IF;

  INSERT INTO cad_grammar_versions (
    grammar_id, version, python_code, core_library_code,
    param_specs, defaults, created_by
  ) VALUES (
    OLD.id,
    OLD.version,
    OLD.python_code,
    OLD.core_library_code,
    OLD.param_specs,
    OLD.defaults,
    auth.uid()
  );

  RETURN NEW;
END;
$$;
