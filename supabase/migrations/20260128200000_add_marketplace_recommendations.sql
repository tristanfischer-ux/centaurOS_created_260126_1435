-- =============================================
-- MIGRATION: Marketplace Recommendations Storage
-- =============================================
-- Store AI-generated marketplace recommendations from various sources
-- (Advisory answers, Coverage gaps, etc.) for surfacing in marketplace UI

-- 1. Add marketplace_suggestions JSONB column to advisory_answers
ALTER TABLE public.advisory_answers 
ADD COLUMN IF NOT EXISTS marketplace_suggestions jsonb DEFAULT '[]'::jsonb;

-- 2. Create marketplace_recommendations table for aggregating recommendations
CREATE TABLE IF NOT EXISTS public.marketplace_recommendations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    source_type text NOT NULL CHECK (source_type IN ('advisory', 'coverage_gap', 'ai_suggestion', 'manual')),
    source_id uuid, -- reference to advisory_answer, coverage record, etc.
    category text NOT NULL CHECK (category IN ('People', 'Products', 'Services', 'AI')),
    subcategory text,
    search_term text,
    reasoning text, -- why this is recommended
    priority integer DEFAULT 50, -- 0-100, higher = more important
    is_dismissed boolean DEFAULT false,
    dismissed_at timestamptz,
    dismissed_by uuid REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '30 days')
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_recommendations_foundry 
    ON public.marketplace_recommendations(foundry_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_recommendations_active 
    ON public.marketplace_recommendations(foundry_id, is_dismissed, expires_at) 
    WHERE is_dismissed = false;
CREATE INDEX IF NOT EXISTS idx_marketplace_recommendations_category 
    ON public.marketplace_recommendations(foundry_id, category);

-- 4. Enable RLS
ALTER TABLE public.marketplace_recommendations ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Users can view recommendations in their foundry" 
    ON public.marketplace_recommendations
    FOR SELECT
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert recommendations in their foundry" 
    ON public.marketplace_recommendations
    FOR INSERT
    WITH CHECK (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update recommendations in their foundry" 
    ON public.marketplace_recommendations
    FOR UPDATE
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete recommendations in their foundry" 
    ON public.marketplace_recommendations
    FOR DELETE
    USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

-- 6. Function to get active recommendations for marketplace
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

GRANT EXECUTE ON FUNCTION public.get_marketplace_recommendations TO authenticated;

-- 7. Function to generate recommendations from coverage gaps
CREATE OR REPLACE FUNCTION public.generate_gap_recommendations(p_foundry_id text)
RETURNS integer AS $$
DECLARE
    v_count integer := 0;
    v_gap RECORD;
BEGIN
    -- Insert recommendations for each coverage gap
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
        -- Map business function categories to marketplace categories
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

GRANT EXECUTE ON FUNCTION public.generate_gap_recommendations TO authenticated;

-- 8. Trigger to create recommendation when advisory answer has marketplace_suggestions
CREATE OR REPLACE FUNCTION public.create_recommendations_from_advisory()
RETURNS TRIGGER AS $$
DECLARE
    v_suggestion jsonb;
    v_foundry_id text;
BEGIN
    -- Get foundry_id from the question
    SELECT q.foundry_id INTO v_foundry_id
    FROM public.advisory_questions q
    WHERE q.id = NEW.question_id;
    
    -- If we have marketplace suggestions, create recommendations
    IF NEW.marketplace_suggestions IS NOT NULL AND jsonb_array_length(NEW.marketplace_suggestions) > 0 THEN
        FOR v_suggestion IN SELECT * FROM jsonb_array_elements(NEW.marketplace_suggestions)
        LOOP
            INSERT INTO public.marketplace_recommendations (
                foundry_id, source_type, source_id, category, subcategory,
                search_term, reasoning, priority
            )
            VALUES (
                v_foundry_id,
                'advisory',
                NEW.id,
                COALESCE(v_suggestion->>'category', 'Services'),
                v_suggestion->>'subcategory',
                v_suggestion->>'search_term',
                format('Based on your question about %s', 
                    (SELECT title FROM public.advisory_questions WHERE id = NEW.question_id)),
                60
            )
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_advisory_marketplace_recommendations
    AFTER INSERT OR UPDATE OF marketplace_suggestions ON public.advisory_answers
    FOR EACH ROW EXECUTE FUNCTION public.create_recommendations_from_advisory();

-- Comments
COMMENT ON TABLE public.marketplace_recommendations IS 'AI-generated marketplace recommendations from various sources';
COMMENT ON COLUMN public.marketplace_recommendations.source_type IS 'advisory: from Q&A, coverage_gap: from org blueprint, ai_suggestion: from AI analysis, manual: user added';
COMMENT ON FUNCTION public.get_marketplace_recommendations IS 'Returns active, non-dismissed recommendations for a foundry';
COMMENT ON FUNCTION public.generate_gap_recommendations IS 'Creates recommendations based on coverage gaps identified in org blueprint';
