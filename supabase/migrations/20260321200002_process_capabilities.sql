-- Manufacturing Process Capabilities Database
-- Real achievable tolerances, wall thicknesses, and constraints per process
-- Prevents impossible-to-manufacture designs (e.g. ±0.01mm on FDM)

CREATE TABLE IF NOT EXISTS process_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    process_name TEXT NOT NULL,            -- "cnc_milling", "cnc_turning", "sheet_metal_bending", "fdm", "sla", "sls", "injection_molding", "die_casting", "investment_casting", "sand_casting", "laser_cutting", "waterjet_cutting", "wire_edm"
    display_name TEXT NOT NULL,            -- "CNC Milling", "Sheet Metal Bending", "FDM 3D Printing"

    -- Tolerance & Surface Finish
    tolerance_min_mm REAL,                 -- best achievable (e.g. 0.01 for CNC)
    tolerance_typical_mm REAL,             -- standard tolerance (e.g. 0.05 for CNC)
    tolerance_max_mm REAL,                 -- loosest reasonable (e.g. 0.1 for CNC)
    surface_finish_ra_min_um REAL,         -- best surface finish
    surface_finish_ra_typical_um REAL,

    -- Geometric Constraints
    min_wall_thickness_mm REAL,
    max_part_size_x_mm REAL,
    max_part_size_y_mm REAL,
    max_part_size_z_mm REAL,
    min_feature_size_mm REAL,
    min_hole_diameter_mm REAL,
    min_internal_radius_mm REAL,

    -- Process-Specific Rules (JSONB for flexibility)
    process_rules JSONB DEFAULT '{}',
    -- Injection molding: {draft_angle_deg_min, gate_diameter_mm, ejector_pin_min_diameter_mm}
    -- Sheet metal: {min_bend_radius_multiplier, k_factor, max_thickness_mm}
    -- 3D printing: {layer_height_mm, support_angle_deg, min_overhang_mm}

    -- Cost & Lead Time
    setup_cost_usd_typical REAL,
    per_part_cost_multiplier REAL,         -- relative cost factor (CNC=1.0, injection=0.1 at volume)
    typical_lead_time_days INTEGER,
    suitable_batch_sizes TEXT[] DEFAULT '{}', -- ["prototype", "low_volume", "medium_volume", "high_volume"]

    -- Materials
    suitable_materials TEXT[] DEFAULT '{}', -- material family names
    unsuitable_materials TEXT[] DEFAULT '{}',

    -- Metadata
    source TEXT DEFAULT 'engineering_handbook',
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(process_name)
);

ALTER TABLE process_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read process capabilities" ON process_capabilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service write process capabilities" ON process_capabilities FOR ALL USING (auth.role() = 'service_role');
