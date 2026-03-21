-- Standard Hardware Library
-- ISO metric fasteners, bearings, seals — real dimensions for CAD generation
-- Eliminates hallucinated bolt sizes, clearance holes, thread pitches

CREATE TABLE IF NOT EXISTS standard_hardware (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    hardware_type TEXT NOT NULL,           -- bolt, nut, washer, bearing, seal, spring, pin, rivet, screw, standoff
    standard TEXT NOT NULL,                -- "ISO 4762", "DIN 912", "ISO 4032", "ISO 7089"
    designation TEXT NOT NULL,             -- "M3", "M4", "M5", "M6", "M8", "M10", "608-2RS"

    -- Dimensions (JSONB for flexibility across hardware types)
    dimensions JSONB NOT NULL DEFAULT '{}',
    -- Bolts: {thread_pitch_mm, head_diameter_mm, head_height_mm, clearance_hole_mm, close_fit_hole_mm, tapping_drill_mm, key_size_mm}
    -- Nuts: {across_flats_mm, height_mm, thread_pitch_mm}
    -- Washers: {outer_diameter_mm, inner_diameter_mm, thickness_mm}
    -- Bearings: {bore_mm, outer_diameter_mm, width_mm, dynamic_load_kn, static_load_kn, max_rpm}

    -- Strength & Material
    strength_grades TEXT[] DEFAULT '{}',   -- ["8.8", "10.9", "12.9"] or ["A2-70", "A4-80"]
    material_options TEXT[] DEFAULT '{}',  -- ["carbon_steel", "stainless_A2", "stainless_A4", "brass"]
    torque_specs JSONB DEFAULT '{}',       -- {"8.8": {"M6": 10.5, "M8": 25.0}, "10.9": {...}}

    -- Metadata
    source TEXT DEFAULT 'iso_standard',
    created_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(standard, designation)
);

ALTER TABLE standard_hardware ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read standard hardware" ON standard_hardware FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service write standard hardware" ON standard_hardware FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_standard_hardware_type ON standard_hardware(hardware_type);
CREATE INDEX idx_standard_hardware_designation ON standard_hardware(designation);
