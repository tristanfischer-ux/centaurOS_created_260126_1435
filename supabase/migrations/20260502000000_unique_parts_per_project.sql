-- Prevent duplicate part numbers within the same project
CREATE UNIQUE INDEX IF NOT EXISTS idx_parts_number_project 
  ON parts (part_number, cad_lab_project_id)
  WHERE part_number IS NOT NULL AND part_number <> '';