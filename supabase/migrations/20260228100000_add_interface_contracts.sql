-- P1: Add interface_contracts column to cad_lab_projects
-- Stores extracted InterfaceContract[] JSON for cross-module validation

ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS interface_contracts JSONB DEFAULT NULL;

COMMENT ON COLUMN cad_lab_projects.interface_contracts IS 'P1: Extracted interface contracts between modules — InterfaceContractResult JSON';
