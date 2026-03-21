-- Material Properties Database
-- Verified engineering data for ~200 common materials
-- Eliminates hallucinated material properties in CAD generation

CREATE TABLE IF NOT EXISTS material_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    material_code TEXT NOT NULL,           -- e.g. "6061-T6", "304-SS", "ABS", "PETG"
    material_name TEXT NOT NULL,           -- e.g. "Aluminum 6061-T6"
    material_family TEXT NOT NULL,         -- aluminum, steel, stainless_steel, titanium, copper, polymer, elastomer, ceramic, composite, wood

    -- Mechanical Properties
    density_kg_m3 REAL,
    yield_strength_mpa REAL,
    ultimate_strength_mpa REAL,
    elastic_modulus_gpa REAL,
    elongation_percent REAL,
    hardness_value REAL,
    hardness_scale TEXT,                   -- "HRC", "HRB", "HV", "Shore A"
    fatigue_strength_mpa REAL,
    poisson_ratio REAL,

    -- Thermal Properties
    thermal_conductivity_w_mk REAL,
    specific_heat_j_kgk REAL,
    melting_point_c REAL,
    max_service_temp_c REAL,
    coefficient_of_thermal_expansion REAL, -- µm/(m·K)

    -- Other Properties
    electrical_resistivity_ohm_m REAL,
    corrosion_resistance TEXT,             -- "excellent", "good", "moderate", "poor"
    weldability TEXT,                      -- "excellent", "good", "moderate", "poor", "not_weldable"
    machinability_rating INTEGER,          -- 0-100 (free-cutting steel = 100)

    -- Cost & Availability
    cost_per_kg_usd REAL,                 -- approximate market price
    common_forms TEXT[] DEFAULT '{}',      -- ["sheet", "bar", "rod", "tube", "wire", "plate", "forging"]
    common_processes TEXT[] DEFAULT '{}',  -- ["cnc_milling", "cnc_turning", "sheet_metal", "casting", "forging", "3d_printing", "injection_molding"]

    -- Metadata
    source TEXT DEFAULT 'engineering_handbook',
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(material_code)
);

ALTER TABLE material_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read material properties" ON material_properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service write material properties" ON material_properties FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_material_properties_family ON material_properties(material_family);
CREATE INDEX idx_material_properties_processes ON material_properties USING GIN(common_processes);
