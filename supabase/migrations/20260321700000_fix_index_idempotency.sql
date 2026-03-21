-- Fixup: Make indexes idempotent (IF NOT EXISTS) for safe re-runs
-- The original migrations (20260321100000, 20260321200000, 20260321200001)
-- used CREATE INDEX without IF NOT EXISTS. This migration is a no-op on
-- fresh installs but prevents errors if migrations are replayed.

-- design_standards indexes (already exist from 20260321100000)
CREATE INDEX IF NOT EXISTS idx_design_standards_domain ON design_standards(industry_domain);
CREATE INDEX IF NOT EXISTS idx_design_standards_product_tags ON design_standards USING GIN(product_tags);
CREATE INDEX IF NOT EXISTS idx_design_standards_engineering_tags ON design_standards USING GIN(engineering_tags);
CREATE INDEX IF NOT EXISTS idx_design_standards_issuing_body ON design_standards(issuing_body);

-- material_properties indexes (already exist from 20260321200000)
CREATE INDEX IF NOT EXISTS idx_material_properties_family ON material_properties(material_family);
CREATE INDEX IF NOT EXISTS idx_material_properties_processes ON material_properties USING GIN(common_processes);

-- standard_hardware indexes (already exist from 20260321200001)
CREATE INDEX IF NOT EXISTS idx_standard_hardware_type ON standard_hardware(hardware_type);
CREATE INDEX IF NOT EXISTS idx_standard_hardware_designation ON standard_hardware(designation);
