-- =============================================================================
-- techniques_stickiness_rebuild
--
-- Lever 1: project_techniques — save a technique to a project
-- Lever 2: project_technique_annotations — project-scoped notes per saved tech
-- Lever 4: technique_questions + technique_answers — per-technique Q&A feed
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Lever 1: project_techniques
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_techniques (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES cad_lab_projects(id) ON DELETE CASCADE,
  technique_id      text NOT NULL,
  technique_title   text NOT NULL,
  saved_by_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_techniques_unique UNIQUE (project_id, technique_id)
);

CREATE INDEX idx_project_techniques_project_id ON project_techniques(project_id);
CREATE INDEX idx_project_techniques_technique_id ON project_techniques(technique_id);

ALTER TABLE project_techniques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_techniques_select" ON project_techniques
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM cad_lab_projects
      WHERE foundry_id IN (
        SELECT foundry_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "project_techniques_insert" ON project_techniques
  FOR INSERT
  WITH CHECK (
    saved_by_user_id = auth.uid()
    AND project_id IN (
      SELECT id FROM cad_lab_projects
      WHERE foundry_id IN (
        SELECT foundry_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "project_techniques_delete" ON project_techniques
  FOR DELETE
  USING (
    saved_by_user_id = auth.uid()
    AND project_id IN (
      SELECT id FROM cad_lab_projects
      WHERE foundry_id IN (
        SELECT foundry_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Lever 2: project_technique_annotations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_technique_annotations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_technique_id  uuid NOT NULL REFERENCES project_techniques(id) ON DELETE CASCADE,
  author_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  note                  text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pte_annotations_project_technique_id ON project_technique_annotations(project_technique_id);

ALTER TABLE project_technique_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pte_annotations_select" ON project_technique_annotations
  FOR SELECT
  USING (
    project_technique_id IN (
      SELECT pt.id FROM project_techniques pt
      JOIN cad_lab_projects p ON p.id = pt.project_id
      WHERE p.foundry_id IN (
        SELECT foundry_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "pte_annotations_insert" ON project_technique_annotations
  FOR INSERT
  WITH CHECK (
    author_user_id = auth.uid()
    AND project_technique_id IN (
      SELECT pt.id FROM project_techniques pt
      JOIN cad_lab_projects p ON p.id = pt.project_id
      WHERE p.foundry_id IN (
        SELECT foundry_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "pte_annotations_update" ON project_technique_annotations
  FOR UPDATE
  USING (author_user_id = auth.uid());

CREATE POLICY "pte_annotations_delete" ON project_technique_annotations
  FOR DELETE
  USING (author_user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_pte_annotations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pte_annotations_updated_at
BEFORE UPDATE ON project_technique_annotations
FOR EACH ROW EXECUTE FUNCTION update_pte_annotations_updated_at();

-- ---------------------------------------------------------------------------
-- Lever 4: technique_question_status enum + technique_questions
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'technique_question_status'
  ) THEN
    CREATE TYPE technique_question_status AS ENUM ('queued', 'answered', 'closed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS technique_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technique_id      text NOT NULL,
  project_id        uuid REFERENCES cad_lab_projects(id) ON DELETE SET NULL,
  asker_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  question          text NOT NULL,
  status            technique_question_status NOT NULL DEFAULT 'queued',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_technique_questions_technique_id ON technique_questions(technique_id);
CREATE INDEX idx_technique_questions_project_id ON technique_questions(project_id);
CREATE INDEX idx_technique_questions_status ON technique_questions(status);

ALTER TABLE technique_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technique_questions_select" ON technique_questions
  FOR SELECT
  USING (
    asker_user_id IN (
      SELECT id FROM profiles
      WHERE foundry_id IN (
        SELECT foundry_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "technique_questions_insert" ON technique_questions
  FOR INSERT
  WITH CHECK (asker_user_id = auth.uid());

CREATE POLICY "technique_questions_update" ON technique_questions
  FOR UPDATE
  USING (asker_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Lever 4: technique_answers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS technique_answers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id       uuid NOT NULL REFERENCES technique_questions(id) ON DELETE CASCADE,
  author_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  specialist_id     text,
  answer            text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_technique_answers_question_id ON technique_answers(question_id);

ALTER TABLE technique_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technique_answers_select" ON technique_answers
  FOR SELECT
  USING (
    question_id IN (
      SELECT tq.id FROM technique_questions tq
      WHERE tq.asker_user_id IN (
        SELECT id FROM profiles
        WHERE foundry_id IN (
          SELECT foundry_id FROM profiles WHERE id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "technique_answers_insert" ON technique_answers
  FOR INSERT
  WITH CHECK (
    author_user_id = auth.uid()
    OR author_user_id IS NULL
  );
