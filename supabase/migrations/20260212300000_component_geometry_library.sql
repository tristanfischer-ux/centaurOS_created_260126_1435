-- ============================================================
-- ForgeOS Component Geometry Library
-- Migration: 20260212300000_component_geometry_library
-- ============================================================
-- Extends the existing components table with CAD geometry
-- capabilities. Each component TYPE has a geometry generator
-- function, and each component INSTANCE has specific parameters.

-- ─── Geometry Types ─────────────────────────────────────────
-- A "geometry type" is a parametric CadQuery function that
-- generates a recognisable 3D shape from parameters.
-- e.g. "brushless_motor" takes {od, height, shaft_d, bolt_pcd}
-- and produces a motor with bell, stator, shaft, bolt holes.

CREATE TABLE component_geometry_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    slug TEXT UNIQUE NOT NULL,              -- e.g. 'brushless_motor', 'm_bolt', 'ball_bearing'
    name TEXT NOT NULL,                     -- e.g. 'Brushless Motor (Outrunner)'
    tier TEXT NOT NULL CHECK (tier IN ('universal', 'electromechanical', 'domain')),
    category TEXT NOT NULL,                 -- e.g. 'fastener', 'motor', 'bearing', 'connector'
    
    -- The CadQuery generator function (Python source code)
    -- This function MUST:
    --   1. Accept a single `params` dict argument
    --   2. Return a cq.Workplane (the solid geometry)
    --   3. Use only safe CadQuery operations (no .rotate, .translate, .sweep)
    --   4. Position the part centered at origin, base at Z=0
    cadquery_code TEXT NOT NULL,
    
    -- Parameter schema (JSON Schema format)
    -- Defines what parameters the generator accepts with types, defaults, ranges
    param_schema JSONB NOT NULL DEFAULT '{}',
    
    -- Mounting interfaces this type exposes
    -- e.g. a motor exposes: "top_shaft" (cylinder), "base_bolts" (bolt_circle)
    mounting_interfaces JSONB NOT NULL DEFAULT '[]',
    
    -- Bounding box function of parameters (for collision detection)
    -- Stored as expressions: {"x": "od + 2", "y": "od + 2", "z": "height + shaft_h"}
    bbox_expressions JSONB NOT NULL DEFAULT '{}',
    
    -- Visual identity tags (for renderer colour coding)
    visual_tags TEXT[] DEFAULT '{}',         -- e.g. ['metal', 'rotating', 'electrical']
    default_colour TEXT DEFAULT '#888888',   -- Hex colour for 3D viewer
    
    -- Metadata
    description TEXT,
    version INTEGER DEFAULT 1,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_geom_types_slug ON component_geometry_types(slug);
CREATE INDEX idx_geom_types_tier ON component_geometry_types(tier);
CREATE INDEX idx_geom_types_category ON component_geometry_types(category);


-- ─── Mounting Interface Standards ───────────────────────────
-- Reusable interface definitions. A motor's bolt circle and a
-- PCB's mounting holes both reference the same M3 bolt standard.

CREATE TABLE mounting_standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    slug TEXT UNIQUE NOT NULL,              -- e.g. 'bolt_circle_m3_16mm', 'usb_c_receptacle'
    name TEXT NOT NULL,
    interface_type TEXT NOT NULL CHECK (interface_type IN (
        'bolt_circle',      -- Circular bolt pattern (PCD, count, bolt_size)
        'bolt_grid',        -- Rectangular bolt pattern (rows, cols, spacing)
        'press_fit',        -- Interference fit (hole_d, shaft_d, depth)
        'snap_fit',         -- Clip/snap connection
        'thread',           -- Screw thread (ISO metric, pipe thread, etc.)
        'slot',             -- T-slot, dovetail, rail
        'magnetic',         -- Magnetic attachment
        'adhesive',         -- Bonded joint
        'pipe',             -- Pipe connection (ID, OD, thread type)
        'electrical'        -- Electrical connector (pin count, pitch)
    )),
    
    -- Interface parameters
    params JSONB NOT NULL DEFAULT '{}',
    
    -- Mating interface (what this connects TO)
    mates_with TEXT[],                      -- slugs of compatible mounting_standards
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mounting_slug ON mounting_standards(slug);
CREATE INDEX idx_mounting_type ON mounting_standards(interface_type);


-- ─── Component Catalogue ────────────────────────────────────
-- Each row is a SPECIFIC real-world part (e.g. "EMAX ECO II 2807 1300KV")
-- linked to a geometry type (e.g. "brushless_motor") with specific params.

CREATE TABLE component_catalogue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    name TEXT NOT NULL,                     -- e.g. 'EMAX ECO II 2807 1300KV'
    manufacturer TEXT,
    part_number TEXT,
    
    -- Link to geometry generator
    geometry_type_slug TEXT NOT NULL REFERENCES component_geometry_types(slug),
    
    -- Specific parameters for THIS part (passed to the CadQuery generator)
    geometry_params JSONB NOT NULL DEFAULT '{}',
    
    -- Mounting points on THIS part (with positions relative to part origin)
    mounting_points JSONB DEFAULT '[]',
    
    -- Physical (for BOM and shipping)
    weight_g DECIMAL(10,2),
    material TEXT,
    
    -- Sourcing
    sources JSONB DEFAULT '[]',             -- [{supplier, url, price, currency, in_stock}]
    datasheet_url TEXT,
    
    -- Visual
    colour_override TEXT,                   -- Override geometry type default colour
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_catalogue_geom_type ON component_catalogue(geometry_type_slug);
CREATE INDEX idx_catalogue_manufacturer ON component_catalogue(manufacturer);
CREATE INDEX idx_catalogue_tags ON component_catalogue USING GIN(tags);
CREATE INDEX idx_catalogue_name ON component_catalogue USING GIN(to_tsvector('english', name));


-- ─── Assemblies ─────────────────────────────────────────────
-- A complete product design with placed components.

CREATE TABLE cad_assemblies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name TEXT NOT NULL,
    description TEXT,
    creator_id UUID REFERENCES auth.users(id),
    
    -- Assembly-level parameters
    assembly_params JSONB DEFAULT '{}',
    
    -- Space budget (from interface definition)
    bounding_box JSONB DEFAULT '{}',
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'exported', 'published')),
    
    -- Generated files
    step_file_url TEXT,
    stl_file_url TEXT,
    thumbnail_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ─── Placed Components ──────────────────────────────────────
-- Each row is one component placed in an assembly at a specific
-- position and orientation.

CREATE TABLE placed_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    assembly_id UUID NOT NULL REFERENCES cad_assemblies(id) ON DELETE CASCADE,
    
    -- What component (either from catalogue or a generic geometry type)
    catalogue_id UUID REFERENCES component_catalogue(id),
    geometry_type_slug TEXT REFERENCES component_geometry_types(slug),
    
    -- If using a generic type, pass custom params
    custom_params JSONB DEFAULT '{}',
    
    -- Placement in assembly coordinate system
    position JSONB NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
    rotation JSONB NOT NULL DEFAULT '{"rx":0,"ry":0,"rz":0}',
    
    -- Assembly metadata
    label TEXT,
    quantity INTEGER DEFAULT 1,
    
    -- Connection to other placed components
    connections JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_placed_assembly ON placed_components(assembly_id);
CREATE INDEX idx_placed_catalogue ON placed_components(catalogue_id);


-- ─── Row Level Security ─────────────────────────────────────

ALTER TABLE component_geometry_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE mounting_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE cad_assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE placed_components ENABLE ROW LEVEL SECURITY;

-- Geometry types and standards are readable by everyone
CREATE POLICY "geometry_types_read" ON component_geometry_types FOR SELECT USING (true);
CREATE POLICY "mounting_standards_read" ON mounting_standards FOR SELECT USING (true);
CREATE POLICY "catalogue_read" ON component_catalogue FOR SELECT USING (true);

-- Assemblies are owned by their creator
CREATE POLICY "assemblies_owner" ON cad_assemblies 
    FOR ALL USING (auth.uid() = creator_id);
CREATE POLICY "placed_owner" ON placed_components 
    FOR ALL USING (
        assembly_id IN (SELECT id FROM cad_assemblies WHERE creator_id = auth.uid())
    );

-- Service-role insert policies for seeding geometry types and catalogue
-- (Service key bypasses RLS, but explicit policies for clarity)
CREATE POLICY "geometry_types_service_insert" ON component_geometry_types
    FOR INSERT WITH CHECK (true);
CREATE POLICY "mounting_standards_service_insert" ON mounting_standards
    FOR INSERT WITH CHECK (true);
CREATE POLICY "catalogue_service_insert" ON component_catalogue
    FOR INSERT WITH CHECK (true);


-- ─── Updated At Triggers ────────────────────────────────────

CREATE OR REPLACE FUNCTION update_component_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_geom_types_updated 
    BEFORE UPDATE ON component_geometry_types 
    FOR EACH ROW EXECUTE FUNCTION update_component_updated_at();

CREATE TRIGGER trg_catalogue_updated 
    BEFORE UPDATE ON component_catalogue 
    FOR EACH ROW EXECUTE FUNCTION update_component_updated_at();

CREATE TRIGGER trg_assemblies_updated 
    BEFORE UPDATE ON cad_assemblies 
    FOR EACH ROW EXECUTE FUNCTION update_component_updated_at();
