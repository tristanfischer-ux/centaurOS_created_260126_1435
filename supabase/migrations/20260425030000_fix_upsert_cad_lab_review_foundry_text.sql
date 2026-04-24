-- Fix type mismatch: upsert_cad_lab_review had p_foundry_id declared as UUID
-- but foundries.id is TEXT. Every call from cad-lab-reviews.ts with a text
-- foundry id (e.g. "claude-test-foundry") threw:
--   invalid input syntax for type uuid: "claude-test-foundry"
-- which silently swallowed the review save and left Fang reviews unmarked.
-- Observed 2026-04-24 in run 13 logs (every tick emitted this error).

DROP FUNCTION IF EXISTS public.upsert_cad_lab_review(uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.upsert_cad_lab_review(
  p_project_id uuid,
  p_foundry_id text,
  p_module_id text,
  p_specialist_id text,
  p_review jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_existing JSONB;
    v_module_reviews JSONB;
    v_filtered JSONB := '[]'::JSONB;
    v_i INT;
BEGIN
    -- SECURITY: Always filter by foundry_id to prevent IDOR
    SELECT COALESCE(reviews, '{}'::JSONB)
    INTO v_existing
    FROM public.cad_lab_projects
    WHERE id = p_project_id AND foundry_id = p_foundry_id
    FOR UPDATE;  -- Row lock prevents concurrent writes

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found or access denied';
    END IF;

    -- Get existing reviews for this module
    v_module_reviews := COALESCE(v_existing->p_module_id, '[]'::JSONB);

    -- Filter out existing review from same specialist (replace behavior)
    FOR v_i IN 0..(jsonb_array_length(v_module_reviews) - 1) LOOP
        IF (v_module_reviews->v_i->>'specialistId') != p_specialist_id THEN
            v_filtered := v_filtered || jsonb_build_array(v_module_reviews->v_i);
        END IF;
    END LOOP;

    -- Append the new review
    v_filtered := v_filtered || jsonb_build_array(p_review);

    -- Atomic update
    UPDATE public.cad_lab_projects
    SET reviews = jsonb_set(COALESCE(reviews, '{}'::JSONB), ARRAY[p_module_id], v_filtered)
    WHERE id = p_project_id AND foundry_id = p_foundry_id;
END;
$function$;
