-- Report Downloads: persistent record of all exported reports for re-download.
-- Supports CAD Lab, general reports, presentations, and future export sources.

CREATE TABLE report_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id text NOT NULL REFERENCES foundries(id),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  report_name text NOT NULL,
  report_source text NOT NULL,    -- 'cad-lab' | 'reports' | 'investors' | 'finance' | 'agents'
  file_format text NOT NULL,      -- 'docx' | 'pptx' | 'pdf' | 'csv' | 'png'
  file_url text,
  file_size_bytes integer,
  storage_path text,
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE report_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_foundry" ON report_downloads FOR SELECT
  USING (foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "insert_own" ON report_downloads FOR INSERT
  WITH CHECK (profile_id = auth.uid());
CREATE POLICY "delete_own_foundry" ON report_downloads FOR DELETE
  USING (foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_report_downloads_foundry ON report_downloads(foundry_id, created_at DESC);
