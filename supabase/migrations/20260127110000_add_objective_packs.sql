-- =============================================
-- MIGRATION: Add Objective Packs (Playbooks)
-- =============================================

-- 1. Create objective_packs table
CREATE TABLE IF NOT EXISTS public.objective_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    difficulty TEXT,
    estimated_duration TEXT,
    icon_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Create pack_items table
CREATE TABLE IF NOT EXISTS public.pack_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id UUID NOT NULL REFERENCES public.objective_packs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    role public.member_role NOT NULL DEFAULT 'Apprentice',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Enable RLS
ALTER TABLE public.objective_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_items ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
-- Allow authenticated users to view all packs (they are templates)
CREATE POLICY "Authenticated users can view packs" ON public.objective_packs
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view pack items" ON public.pack_items
    FOR SELECT USING (auth.role() = 'authenticated');

-- For now, maybe restricted write access? But for CentaurOS demo, allowing authenticated to create templates is fine.
CREATE POLICY "Authenticated users can manage packs" ON public.objective_packs
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage pack items" ON public.pack_items
    FOR ALL USING (auth.role() = 'authenticated');

-- 5. Seed Initial Data (Optional but helpful for "Playbook" feature)
INSERT INTO public.objective_packs (title, description, category, difficulty, estimated_duration, icon_name)
VALUES 
('Launch MVP', 'Standard startup launch protocol with AI support.', 'Product', 'Hard', '4 Weeks', 'Rocket'),
('Content Marketing Sprint', 'Generate 1 month of content in 3 days.', 'Marketing', 'Medium', '3 Days', 'Pencil');

-- Get IDs for seeding items (using DO block)
DO $$
DECLARE
    mvp_id UUID;
    content_id UUID;
BEGIN
    SELECT id INTO mvp_id FROM public.objective_packs WHERE title = 'Launch MVP' LIMIT 1;
    SELECT id INTO content_id FROM public.objective_packs WHERE title = 'Content Marketing Sprint' LIMIT 1;

    -- MVP Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (mvp_id, 'Market Research', 'Analyze top 3 competitors.', 'AI_Agent', 1),
    (mvp_id, 'Define User Stories', 'Create Jira tickets for core features.', 'Executive', 2),
    (mvp_id, 'Initial Deployment', 'Deploy to Vercel and verify pipeline.', 'Apprentice', 3);

    -- Content Items
    INSERT INTO public.pack_items (pack_id, title, description, role, order_index) VALUES
    (content_id, 'Keyword Research', 'Identify high volume keywords.', 'AI_Agent', 1),
    (content_id, 'Draft Blog Posts', 'Write 4 articles based on keywords.', 'AI_Agent', 2),
    (content_id, 'Review and Publish', 'Edit drafts and schedule social media.', 'Executive', 3);
END $$;
