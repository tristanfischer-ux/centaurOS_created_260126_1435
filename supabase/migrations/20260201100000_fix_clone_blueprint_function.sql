-- Fix clone_blueprint_from_template function to include foundry_id
-- The original function was created before foundry_id was added to blueprint_domain_coverage

CREATE OR REPLACE FUNCTION clone_blueprint_from_template(
    p_template_id UUID,
    p_foundry_id TEXT,
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_blueprint_id UUID;
    v_domain RECORD;
BEGIN
    -- Create the blueprint
    INSERT INTO blueprints (
        foundry_id, template_id, name, description, project_type, created_by
    )
    VALUES (
        p_foundry_id, p_template_id, p_name, p_description, 'product', p_created_by
    )
    RETURNING id INTO v_blueprint_id;
    
    -- Copy domains from template to coverage records
    -- Now includes foundry_id which is required after 20260201000000 migration
    FOR v_domain IN 
        SELECT kd.id, kd.name, kd.category, kd.criticality,
               (
                   SELECT string_agg(parent.name, ' > ' ORDER BY parent.depth)
                   FROM knowledge_domains parent
                   WHERE parent.template_id = kd.template_id
                   AND (
                       parent.id = kd.id 
                       OR parent.id = kd.parent_id
                       OR parent.id IN (
                           SELECT p.parent_id FROM knowledge_domains p WHERE p.id = kd.parent_id
                       )
                   )
               ) as domain_path
        FROM knowledge_domains kd
        WHERE kd.template_id = p_template_id
    LOOP
        INSERT INTO blueprint_domain_coverage (
            blueprint_id, domain_id, domain_name, domain_path, status, is_critical, foundry_id
        )
        VALUES (
            v_blueprint_id, 
            v_domain.id, 
            v_domain.name,
            COALESCE(v_domain.domain_path, v_domain.name),
            'gap',
            v_domain.criticality = 'critical',
            p_foundry_id  -- Include foundry_id for RLS
        );
    END LOOP;
    
    -- Update template use count
    UPDATE blueprint_templates
    SET use_count = use_count + 1
    WHERE id = p_template_id;
    
    -- Log in history
    INSERT INTO blueprint_history (blueprint_id, action, details, user_id)
    VALUES (v_blueprint_id, 'created_from_template', jsonb_build_object('template_id', p_template_id), p_created_by);
    
    RETURN v_blueprint_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
