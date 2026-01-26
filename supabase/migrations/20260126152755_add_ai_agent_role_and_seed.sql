-- Add 'AI_Agent' to member_role enum
ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'AI_Agent';

-- Seed AI Agents for existing foundries
DO $$
DECLARE
    f_id TEXT;
BEGIN
    -- Iterate over distinct foundry_ids found in profiles table
    FOR f_id IN SELECT DISTINCT foundry_id FROM public.profiles LOOP
        
        -- AI: Legal & Compliance
        INSERT INTO public.profiles (id, email, full_name, role, foundry_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'ai.legal.' || f_id || '@centauros.ai', -- Unique pseudo-email
            'AI: Legal & Compliance',
            'AI_Agent',
            f_id,
            now(),
            now()
        )
        ON CONFLICT (email) DO NOTHING;

        -- AI: General Assistant
        INSERT INTO public.profiles (id, email, full_name, role, foundry_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'ai.general.' || f_id || '@centauros.ai', -- Unique pseudo-email
            'AI: General Assistant',
            'AI_Agent',
            f_id,
            now(),
            now()
        )
        ON CONFLICT (email) DO NOTHING;

    END LOOP;
END $$;