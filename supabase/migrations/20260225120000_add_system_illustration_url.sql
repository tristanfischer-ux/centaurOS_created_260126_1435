-- Add system_illustration_url to cad_lab_projects so the generated system
-- overview image persists across page loads (previously only held in React state).
alter table cad_lab_projects
  add column if not exists system_illustration_url text;
