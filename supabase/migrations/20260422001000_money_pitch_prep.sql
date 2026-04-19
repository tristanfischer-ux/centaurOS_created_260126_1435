-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1D · pitch_prep_section + pitch_prep_slide
-- MONEY-SCHEMA.md §2 · pitch_prep_section, pitch_prep_slide
--
-- 8 sections per round (company, market, problem, traction, team, ask,
-- financial_model, cap_table). Slides ordered within each section.
-- Slide layout + body_elements + data_bindings stored as JSONB (not queried
-- on; just serialised to render).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── pitch_prep_section ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pitch_prep_section (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id               text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  round_id                 uuid NOT NULL REFERENCES public.investor_round(id) ON DELETE CASCADE,
  section_key              text NOT NULL
                             CHECK (section_key IN
                               ('company','market','problem','traction','team','ask',
                                'financial_model','cap_table')),
  status                   text NOT NULL DEFAULT 'not_started'
                             CHECK (status IN ('not_started','in_progress','done')),
  narrative_fields         jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_edited_by_user_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_edited_at           timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pitch_prep_section IS
  'MONEY-SCHEMA §2 · 8 canonical pitch sections per round. narrative_fields '
  'jsonb holds per-sub-field freetext (e.g. mission, wedge, moat).';

CREATE UNIQUE INDEX IF NOT EXISTS pitch_prep_section_unique_per_round
  ON public.pitch_prep_section (round_id, section_key);

DROP TRIGGER IF EXISTS pitch_prep_section_set_updated_at ON public.pitch_prep_section;
CREATE TRIGGER pitch_prep_section_set_updated_at
  BEFORE UPDATE ON public.pitch_prep_section
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pitch_prep_section ENABLE ROW LEVEL SECURITY;

CREATE POLICY pitch_prep_section_foundry_select
  ON public.pitch_prep_section FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

CREATE POLICY pitch_prep_section_foundry_write
  ON public.pitch_prep_section FOR ALL
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

-- ── pitch_prep_slide ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pitch_prep_slide (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id          text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  section_id          uuid NOT NULL REFERENCES public.pitch_prep_section(id) ON DELETE CASCADE,
  position            smallint NOT NULL,
  layout              text NOT NULL
                        CHECK (layout IN
                          ('title_body','title_bullets','bullets_chart','chart_full',
                           'two_column','image_caption','quote','team_grid','ask_headline')),
  title               text,
  subtitle            text,
  body_elements       jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_bindings       jsonb NOT NULL DEFAULT '[]'::jsonb,
  speaker_notes_md    text,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pitch_prep_slide IS
  'MONEY-SCHEMA §2 · ordered slides within a pitch section. body_elements '
  'is array of typed element descriptors; data_bindings maps element_id → '
  'binding_path (e.g. "plan.revenue.quarterly_2026").';

CREATE INDEX IF NOT EXISTS pitch_prep_slide_section_position_idx
  ON public.pitch_prep_slide (section_id, position)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS pitch_prep_slide_set_updated_at ON public.pitch_prep_slide;
CREATE TRIGGER pitch_prep_slide_set_updated_at
  BEFORE UPDATE ON public.pitch_prep_slide
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pitch_prep_slide ENABLE ROW LEVEL SECURITY;

CREATE POLICY pitch_prep_slide_foundry_select
  ON public.pitch_prep_slide FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

CREATE POLICY pitch_prep_slide_foundry_write
  ON public.pitch_prep_slide FOR ALL
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );
