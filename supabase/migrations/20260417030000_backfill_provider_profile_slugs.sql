-- Backfill profile_slug on every provider_profile and keep new rows populated.
--
-- Problem: provider_profiles.profile_slug and username were NULL on all 31 rows
-- (production). ExpertCard.tsx uses `profile_slug || username` to build the
-- /expert/[slug] link — with neither set it fell back to href="#". Result: the
-- public /experts directory AND the Executive Review tab on Specify/Source
-- rendered dead links.
--
-- Fix: backfill slugs from profiles.full_name via generate_profile_slug(), and
-- install a BEFORE INSERT/UPDATE trigger so new rows can never regress.

-- ── 1. Backfill existing rows ──
--
-- generate_profile_slug already handles uniqueness with a counter suffix, so
-- updating one-row-at-a-time is safe even when two profiles share a name.
DO $$
DECLARE
    rec RECORD;
    new_slug TEXT;
BEGIN
    FOR rec IN
        SELECT pp.user_id, p.full_name
        FROM public.provider_profiles pp
        JOIN public.profiles p ON p.id = pp.user_id
        WHERE pp.profile_slug IS NULL
    LOOP
        new_slug := public.generate_profile_slug(
            COALESCE(rec.full_name, ''),
            rec.user_id
        );
        UPDATE public.provider_profiles
        SET profile_slug = new_slug
        WHERE user_id = rec.user_id
          AND profile_slug IS NULL;
    END LOOP;
END;
$$;

-- ── 2. Auto-populate slug on INSERT/UPDATE ──
--
-- Runs BEFORE write so the row is persisted with a slug in the same transaction.
-- If a caller supplies an explicit slug we keep it; otherwise we derive one
-- from the linked profiles.full_name.
CREATE OR REPLACE FUNCTION public.set_provider_profile_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    full_name_val TEXT;
BEGIN
    IF NEW.profile_slug IS NOT NULL AND NEW.profile_slug <> '' THEN
        RETURN NEW;
    END IF;

    SELECT p.full_name INTO full_name_val
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    NEW.profile_slug := public.generate_profile_slug(
        COALESCE(full_name_val, ''),
        NEW.user_id
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_provider_profile_slug ON public.provider_profiles;

CREATE TRIGGER trigger_set_provider_profile_slug
BEFORE INSERT OR UPDATE OF profile_slug, user_id
ON public.provider_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_provider_profile_slug();
