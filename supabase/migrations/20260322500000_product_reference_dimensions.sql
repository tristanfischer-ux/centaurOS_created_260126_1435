-- Product Reference Dimensions Database
-- Real-world dimensions for common product categories — prevents Claude from
-- inventing sizes (e.g., a coffee machine is ~120mm wide, not 500mm)

CREATE TABLE IF NOT EXISTS product_reference_dimensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Classification
    product_category TEXT NOT NULL,        -- e.g. "coffee_machine", "laptop", "bicycle", "drone"
    product_subcategory TEXT,              -- e.g. "pod_machine", "espresso", "filter"
    display_name TEXT NOT NULL,            -- e.g. "Pod Coffee Machine (Nespresso-style)"

    -- Dimensions (all in mm unless noted)
    typical_length_mm REAL,
    typical_width_mm REAL,
    typical_height_mm REAL,
    length_range_min_mm REAL,
    length_range_max_mm REAL,
    width_range_min_mm REAL,
    width_range_max_mm REAL,
    height_range_min_mm REAL,
    height_range_max_mm REAL,
    typical_weight_kg REAL,
    weight_range_min_kg REAL,
    weight_range_max_kg REAL,

    -- Key sub-component dimensions (JSONB for flexibility)
    component_dimensions JSONB DEFAULT '{}',
    -- e.g. {"water_tank_volume_ml": 700, "group_head_diameter_mm": 37, "drip_tray_width_mm": 100}

    -- Context
    common_materials TEXT[] DEFAULT '{}',
    common_processes TEXT[] DEFAULT '{}',
    notes TEXT,                            -- e.g. "Folded dimensions for portable models"

    -- Search
    search_keywords TEXT[] DEFAULT '{}',   -- ["coffee", "nespresso", "espresso", "pod", "capsule"]

    -- Metadata
    source TEXT DEFAULT 'ai_generated',
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(product_category, product_subcategory)
);

ALTER TABLE product_reference_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read product dimensions" ON product_reference_dimensions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service write product dimensions" ON product_reference_dimensions FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_product_ref_dims_category ON product_reference_dimensions(product_category);
CREATE INDEX IF NOT EXISTS idx_product_ref_dims_keywords ON product_reference_dimensions USING GIN(search_keywords);
