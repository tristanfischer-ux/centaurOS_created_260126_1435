---
name: cad-component-creator
description: Add new parametric CAD components to the ForgeOS component geometry library. Use when adding components, creating geometry types, seeding CAD parts, adding CadQuery functions, or when the user mentions CAD, component, geometry, part, CadQuery, tier 1, tier 2, tier 3, or component library.
role: |
  You are a senior mechanical engineer and CadQuery expert who has built large parametric component libraries.
  You write clean, well-parameterized geometry functions that produce manufacturable parts.
  You always follow the existing registry patterns exactly and never skip the migration + type regeneration pipeline.
  You never hardcode dimensions that should be parameters. You never forget ON CONFLICT in SQL upserts.
---

# CAD Component Creator Skill

This skill handles the complete workflow for adding new parametric CAD components to the ForgeOS component geometry library. It covers Python geometry functions, registry entries, physical/procurement metadata, SQL migrations, and Supabase deployment.

## CRITICAL: Full Pipeline Policy — NEVER Skip Steps

**Whenever you create new CAD components, ALWAYS do ALL of the following automatically:**

1. **Write the geometry function** in the correct tier Python file
2. **Add the registry entry** with all required keys
3. **Create the SQL migration** with `ON CONFLICT (slug) DO UPDATE`
4. **Push the migration:** `npx supabase db push`
5. **Regenerate TypeScript types:** `npx supabase gen types typescript --linked > src/types/database.types.ts`
6. **Verify the build:** `npx tsc --noEmit`

Physical properties and procurement data are optional but recommended. The user considers the full pipeline to be the agent's responsibility.

## Discovery (Before You Start)

Before writing any geometry, ensure you have answers to these questions. If any are unclear, ask the user:

- [ ] **Which tier?** Tier 1 (universal primitives), Tier 2 (electromechanical), or Tier 3 (domain-specific)
- [ ] **Which category?** e.g. `fastener`, `motor`, `bearing`, `kitchen`, `bathroom`, `drone`, `structural`
- [ ] **What real-world part?** Specific part name, standards it follows (ISO, NEMA, BS, etc.)
- [ ] **What parameters should be exposed?** Dimensions, counts, material variants
- [ ] **Physical properties needed?** Mass, electrical, thermal, mechanical data
- [ ] **Procurement data needed?** Cost estimates, lead times, common suppliers
- [ ] **Single part or batch?** One component or a whole category (e.g. "all bathroom fittings")

## Quick Reference

### Tier System

| Tier | DB Value | Scope | Examples |
|------|----------|-------|----------|
| 1 | `universal` | Universal mechanical primitives | Fasteners, bearings, springs, shafts, gears, rails, seals |
| 2 | `electromechanical` | Electromechanical parts | Motors, PCBs, switches, fans, pumps, relays, displays |
| 3 | `domain` | Domain-specific components | House fittings, drone parts, CubeSat, EV, vertical farming |

### File Locations

| Purpose | Path |
|---------|------|
| Tier 1 geometry | `Tier 1 and 2 parts for cad /tier1_universal.py` |
| Tier 1 expansion | `Tier 1 and 2 parts for cad /tier1_expansion.py` |
| Tier 2 geometry | `Tier 1 and 2 parts for cad /tier2_electromechanical.py` |
| Tier 2 expansion | `Tier 1 and 2 parts for cad /tier2_expansion.py` |
| Tier 3 (new domain) | `Tier 1 and 2 parts for cad /tier3_{domain}.py` |
| Physical properties | `Tier 1 and 2 parts for cad /physical_properties.py` or `{domain}_physical_properties.py` |
| Procurement data | `Tier 1 and 2 parts for cad /procurement_data.py` |
| SQL migrations | `supabase/migrations/YYYYMMDDHHMMSS_{description}.sql` |
| Python seeder | `Tier 1 and 2 parts for cad /seed_supabase.py` |
| Generated types | `src/types/database.types.ts` |
| Server actions | `src/actions/component-library.ts` |

### Database Schema

Table: `component_geometry_types`

| Column | Type | Description |
|--------|------|-------------|
| `slug` | TEXT (unique) | Snake_case identifier, matches function name |
| `name` | TEXT | Human-readable display name |
| `tier` | TEXT | `'universal'`, `'electromechanical'`, or `'domain'` |
| `category` | TEXT | Grouping category (e.g. `fastener`, `kitchen`) |
| `cadquery_code` | TEXT | Full CadQuery Python source |
| `param_schema` | JSONB | Parameter definitions with type, default, min, max, unit |
| `mounting_interfaces` | JSONB | Bolt circles, press fits, threads, connectors |
| `bbox_expressions` | JSONB | Bounding-box size expressions |
| `visual_tags` | TEXT[] | Material/domain tags for filtering |
| `default_colour` | TEXT | Hex colour for 3D rendering |
| `description` | TEXT | Docstring from geometry function |
| `verified` | BOOLEAN | Whether geometry has been validated |
| `physical_properties` | JSONB | Mass, electrical, thermal, mechanical data |
| `procurement` | JSONB | Cost, lead time, suppliers |
| `data_source` | TEXT | `'training_estimate'`, `'datasheet_verified'`, `'user_provided'` |

## Workflow

```
CAD Component Addition Progress:
- [ ] 1. Write CadQuery geometry function
- [ ] 2. Add registry entry to tier dict
- [ ] 3. Add physical properties (recommended)
- [ ] 4. Add procurement data (optional)
- [ ] 5. Create SQL migration
- [ ] 6. Push migration to Supabase (npx supabase db push)
- [ ] 7. Regenerate TypeScript types
- [ ] 8. Verify build compiles (npx tsc --noEmit)
```

## Step 1: Write the CadQuery Geometry Function

Create the parametric geometry function in the appropriate tier file.

### CadQuery Rules (MUST FOLLOW)

- Function takes a single `params: dict` argument
- Returns `cq.Workplane`
- Geometry is **centered at origin**, base at **Z=0**
- Use `params.get("name", default_value)` for all dimensions
- Include a docstring describing the part
- Use only standard CadQuery operations: `.box()`, `.cylinder()`, `.cut()`, `.union()`, `.fillet()`, `.chamfer()`, `.hole()`, `.cboreHole()`, `.sketch()`
- For positioning sub-parts, use `.transformed(offset=(x, y, z))` — NOT `.rotate()` or `.translate()` at top level
- Keep functions self-contained (no imports beyond `cadquery as cq` and `math`)

### Template: Geometry Function

```python
def my_component_slug(params):
    """Brief description of the component (becomes the DB description)."""
    # Extract parameters with sensible defaults
    w = params.get("width", 100.0)
    h = params.get("height", 50.0)
    d = params.get("depth", 60.0)
    wall_t = params.get("wall_thickness", 3.0)

    # Base shape
    body = cq.Workplane("XY").box(w, d, h)

    # Subtract internal cavity (if applicable)
    cavity = (cq.Workplane("XY")
              .transformed(offset=(0, 0, wall_t))
              .box(w - 2*wall_t, d - 2*wall_t, h - wall_t))
    body = body.cut(cavity)

    # Add features (mounting holes, fillets, etc.)
    body = body.edges("|Z").fillet(2.0)

    return body
```

### Real Example (from existing codebase)

```python
def kitchen_base_cabinet(params):
    """Standard kitchen base cabinet (carcass + door)."""
    w = params.get("width", 600.0)
    d = params.get("depth", 570.0)
    h = params.get("height", 720.0)
    panel_t = params.get("panel_thickness", 18.0)

    # Carcass (open front box)
    outer = cq.Workplane("XY").box(w, d, h)
    inner = (cq.Workplane("XY").transformed(offset=(0, -panel_t/2, panel_t/2))
             .box(w - 2*panel_t, d - panel_t, h - panel_t))
    carcass = outer.cut(inner)
    # Door (front face)
    door = (cq.Workplane("XY").transformed(offset=(0, -(d/2 - panel_t/2 - 1), 0))
            .box(w - 4, panel_t, h - 4))
    # Handle (bar style)
    handle = (cq.Workplane("XY")
              .transformed(offset=(w/2 - 30, -(d/2 + 8), h/4))
              .box(12, 16, 150))
    # Shelf
    shelf = (cq.Workplane("XY").transformed(offset=(0, 0, 0))
             .box(w - 2*panel_t - 2, d - panel_t - 10, panel_t))
    # Plinth recess at bottom
    plinth = (cq.Workplane("XY").transformed(offset=(0, -(d/2 - 50), -(h/2 - 75)))
              .box(w + 2, 100, 150))
    return carcass.union(door).union(handle).union(shelf).cut(plinth)
```

## Step 2: Add Registry Entry

Add the component to the registry dict at the bottom of the same Python file.

### Template: Registry Entry

```python
"my_component_slug": {
    "function": my_component_slug,
    "name": "Human-Readable Component Name",
    "category": "category_name",
    "default_colour": "#C0C0C0",
    "visual_tags": ["material_1", "material_2", "domain_tag"],
    "param_schema": {
        "width": {"type": "number", "default": 100.0, "min": 10.0, "max": 5000.0, "unit": "mm"},
        "height": {"type": "number", "default": 50.0, "min": 5.0, "max": 3000.0, "unit": "mm"},
        "depth": {"type": "number", "default": 60.0, "unit": "mm"},
        "wall_thickness": {"type": "number", "default": 3.0, "min": 0.5, "max": 50.0, "unit": "mm"},
    },
    "mounting_interfaces": [
        {"name": "base_mount", "type": "bolt_circle", "position": "bottom",
         "params": {"bolt_size": "M3", "pcd": 40.0, "count": 4}},
    ],
},
```

### Required Keys

| Key | Type | Description |
|-----|------|-------------|
| `function` | callable | Reference to the geometry function |
| `name` | str | Display name (title case, include standard if applicable) |
| `category` | str | Lowercase category: `fastener`, `motor`, `bearing`, `kitchen`, etc. |
| `default_colour` | str | Hex colour: `#C0C0C0` (metal), `#F5F5F0` (white/plastic), `#8B7355` (wood), etc. |
| `visual_tags` | list[str] | Material and domain tags, all lowercase with underscores |
| `param_schema` | dict | Parameter definitions (see below) |

### Optional Keys

| Key | Type | Description |
|-----|------|-------------|
| `mounting_interfaces` | list[dict] | Bolt circles, press fits, threads, connectors |
| `bbox_expressions` | dict | Bounding-box expressions: `{"x": "width", "y": "depth", "z": "height"}` |

### param_schema Format

Each parameter entry:

```python
"param_name": {
    "type": "number",       # "number", "integer", or "string"
    "default": 100.0,       # Default value (REQUIRED)
    "min": 10.0,            # Minimum value (optional, for number/integer)
    "max": 5000.0,          # Maximum value (optional, for number/integer)
    "unit": "mm",           # Unit string (optional but recommended)
    "enum": [100, 200, 300] # Allowed values (optional, for constrained params)
}
```

### Common Colour Values

| Material | Hex | Usage |
|----------|-----|-------|
| Steel/Metal | `#C0C0C0` | Fasteners, structural steel |
| Dark metal | `#808080` | Cast iron, dark alloys |
| White plastic/ceramic | `#F5F5F5` | Sockets, switches, sanitaryware |
| Cream/melamine | `#F5F5F0` | Cabinets, painted wood |
| Wood (light) | `#D2B48C` | Pine, oak furniture |
| Wood (dark) | `#8B7355` | Walnut, mahogany |
| Black/dark | `#2F2F2F` | Ovens, dark appliances |
| Glass | `#E0F0F0` | Windows, shower screens |
| Aluminium | `#A0A0A0` | Extrusions, frames |
| Copper/brass | `#B87333` | Plumbing, electrical |
| Green PCB | `#006400` | Circuit boards |
| Purple | `#6A0DAD` | Motors (convention) |

## Step 3: Add Physical Properties (Recommended)

Add to `physical_properties.py` or the domain-specific variant.

### Template: Physical Properties Entry

```python
"my_component_slug": {
    "mass": {
        "material": "steel_grade_8.8",   # or "ABS", "aluminium_6061", "MDF", etc.
        "density_kg_m3": 7850,
        "typical_mass_g": 12.0,          # Mass at default param values
    },
    "electrical": None,                   # None for passive mechanical parts
    # OR for electrical components:
    # "electrical": {
    #     "voltage_v": 12.0,
    #     "current_a": 2.5,
    #     "power_w": 30.0,
    #     "resistance_ohm": 4.8,
    # },
    "thermal": {
        "max_temp_c": 300,
        "min_temp_c": -40,
    },
    "mechanical": {
        "tensile_strength_mpa": 800,
        "yield_strength_mpa": 640,
        # Add relevant mechanical properties for the part type
    },
    "interface": {
        "type": "threaded",              # or "press_fit", "bolt_circle", "clip", "adhesive"
        "standard": "ISO_4014",          # Reference standard if applicable
    },
},
```

### Units Convention

| Property | Unit |
|----------|------|
| Mass | g (grams), kg/m3 (density) |
| Voltage | V |
| Current | A |
| Power | W |
| Temperature | C (Celsius) |
| Force | N |
| Torque | Nm |
| Pressure | MPa or bar |
| Speed | RPM or mm/s |
| Resistance | ohm |
| Length | mm (always) |

## Step 4: Add Procurement Data (Optional)

Add to `procurement_data.py`.

### Template: Procurement Entry

```python
"my_component_slug": {
    "typical_unit_cost_gbp": 5.00,
    "lead_time_days": 3,
    "common_suppliers": ["RS Components", "Farnell", "Amazon"],
},
```

## Step 5: Create SQL Migration

Create a migration file in `supabase/migrations/`.

**Naming convention:** `YYYYMMDDHHMMSS_seed_{description}.sql`

### Template: Single Component INSERT

```sql
-- ============================================================
-- ForgeOS Component Geometry Library — Seed: {Description}
-- Migration: {timestamp}_{description}
-- ============================================================
-- Seeds {N} geometry type(s) for {category} components.

INSERT INTO component_geometry_types (
    slug, name, tier, category, cadquery_code, param_schema,
    mounting_interfaces, visual_tags, default_colour, description, verified
)
VALUES (
    'my_component_slug',
    'Human-Readable Name',
    'universal',  -- or 'electromechanical' or 'domain'
    'category_name',
$CADQUERY$
def my_component_slug(params):
    """Brief description."""
    w = params.get("width", 100.0)
    h = params.get("height", 50.0)
    body = cq.Workplane("XY").box(w, w, h)
    return body
$CADQUERY$,
    '{"width": {"type": "number", "default": 100.0, "min": 10.0, "max": 5000.0, "unit": "mm"}, "height": {"type": "number", "default": 50.0, "unit": "mm"}}'::jsonb,
    '[]'::jsonb,
    '{metal,steel}',
    '#C0C0C0',
    'Brief description.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    mounting_interfaces = EXCLUDED.mounting_interfaces,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified;
```

### Template: With Physical Properties and Procurement

If the enrichment columns exist, include them:

```sql
-- After the main INSERT, update with physical properties and procurement
UPDATE component_geometry_types SET
    physical_properties = '{
        "mass": {"material": "steel", "density_kg_m3": 7850, "typical_mass_g": 12.0},
        "electrical": null,
        "thermal": {"max_temp_c": 300, "min_temp_c": -40},
        "mechanical": {"tensile_strength_mpa": 800}
    }'::jsonb,
    procurement = '{
        "typical_unit_cost_gbp": 0.05,
        "lead_time_days": 1,
        "common_suppliers": ["RS", "Misumi"]
    }'::jsonb,
    data_source = 'training_estimate'
WHERE slug = 'my_component_slug';
```

### CRITICAL: SQL Rules

- **ALWAYS use `ON CONFLICT (slug) DO UPDATE SET`** — prevents duplicate errors on re-run
- **ALWAYS use `$CADQUERY$` dollar-quoting** for CadQuery code (avoids escaping nightmares)
- **visual_tags use Postgres array syntax:** `'{tag1,tag2,tag3}'` (no spaces after commas)
- **param_schema is JSONB:** Cast with `::jsonb`
- **mounting_interfaces is JSONB array:** Cast with `::jsonb`, use `'[]'::jsonb` if empty

## Step 6: Push Migration and Regenerate Types

**Run these commands automatically after creating the migration — NEVER ask the user.**

```bash
# Apply migration
npx supabase db push

# Regenerate TypeScript types
npx supabase gen types typescript --linked > src/types/database.types.ts

# Verify build
npx tsc --noEmit
```

## Step 7: Update Python Seeder (If Needed)

If adding components that should be available in the Python seeder (for dev/testing workflows):

1. **Import the new registry** in `seed_supabase.py`:

```python
from tier3_new_domain import TIER3_NEW_DOMAIN
```

2. **Add to FULL_REGISTRY:**

```python
FULL_REGISTRY.update(TIER3_NEW_DOMAIN)
```

3. **Add tier mapping:**

```python
for slug in TIER3_NEW_DOMAIN:
    TIER_MAP[slug] = "domain"
```

## Batch Addition Pattern

When adding many components at once (common for new domains like "garden", "automotive", "marine"):

1. **Create the tier Python file** with all geometry functions
2. **Build the complete registry dict** at the bottom of the file
3. **Create physical properties** in a `{domain}_physical_properties.py` file
4. **Generate ONE SQL migration** for the entire batch
5. **Push once** — not per component

### Batch SQL Template

For N components, repeat the INSERT block for each:

```sql
-- ============================================================
-- ForgeOS Component Geometry Library — Tier 3: {Domain Name}
-- Migration: YYYYMMDDHHMMSS_seed_tier3_{domain}
-- ============================================================
-- Seeds {N} domain-specific geometry types for {domain} components.

-- 1. first_component_slug
INSERT INTO component_geometry_types (slug, name, tier, category, cadquery_code, param_schema, mounting_interfaces, visual_tags, default_colour, description, verified)
VALUES (
    'first_component_slug',
    'First Component Name',
    'domain',
    'category',
$CADQUERY$
def first_component_slug(params):
    ...
$CADQUERY$,
    '{...}'::jsonb,
    '[]'::jsonb,
    '{tag1,tag2}',
    '#C0C0C0',
    'Description.',
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, tier = EXCLUDED.tier, category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code, param_schema = EXCLUDED.param_schema,
    visual_tags = EXCLUDED.visual_tags, default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description, verified = EXCLUDED.verified;

-- 2. second_component_slug
INSERT INTO component_geometry_types ...
```

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Slug | `snake_case` | `kitchen_base_cabinet`, `hex_bolt` |
| Function name | Matches slug exactly | `def kitchen_base_cabinet(params):` |
| Category | Lowercase, underscores | `building_fabric`, `kitchen`, `fastener` |
| Visual tags | Lowercase, underscores | `stainless_steel`, `cast_iron` |
| File (new tier 3) | `tier3_{domain}.py` | `tier3_marine.py`, `tier3_garden.py` |
| Registry dict | `TIER3_{DOMAIN}` (uppercase) | `TIER3_MARINE`, `TIER3_GARDEN` |
| Migration | `YYYYMMDDHHMMSS_seed_tier3_{domain}.sql` | `20260213100000_seed_tier3_marine.sql` |

## Validation Checklist

Before marking a component addition complete, verify:

### Geometry Function
- [ ] Takes `params` dict as only argument
- [ ] Returns `cq.Workplane`
- [ ] Geometry centered at origin, base at Z=0
- [ ] All variable dimensions use `params.get("name", default)`
- [ ] Has a docstring describing the part
- [ ] No top-level `.rotate()` or `.translate()` (use `.transformed()`)
- [ ] Uses only `cq.Workplane` operations and `math` module

### Registry Entry
- [ ] Slug matches function name exactly
- [ ] Has all required keys: `function`, `name`, `category`, `default_colour`, `visual_tags`, `param_schema`
- [ ] `param_schema` includes `type`, `default`, and `unit` for every exposed parameter
- [ ] `visual_tags` are lowercase with underscores
- [ ] `default_colour` is a valid hex colour

### SQL Migration
- [ ] Uses `ON CONFLICT (slug) DO UPDATE SET` (prevents duplicate errors)
- [ ] CadQuery code wrapped in `$CADQUERY$` dollar-quoting
- [ ] `param_schema` cast as `::jsonb`
- [ ] `visual_tags` use Postgres array syntax `'{tag1,tag2}'`
- [ ] `mounting_interfaces` is `'[]'::jsonb` if empty

### Pipeline
- [ ] Migration pushed: `npx supabase db push`
- [ ] Types regenerated: `npx supabase gen types typescript --linked > src/types/database.types.ts`
- [ ] Build compiles: `npx tsc --noEmit`

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|-------------|-------------|-----------------|
| Hardcoding dimensions | Not parametric, can't be reused | Use `params.get("name", default)` for all variable dimensions |
| Missing `ON CONFLICT` in SQL | Duplicate slug errors on re-run | Always include `ON CONFLICT (slug) DO UPDATE SET ...` |
| Forgetting `$CADQUERY$` quoting | Single quotes in Python code break SQL | Always use dollar-quoting for CadQuery source |
| Skipping `db push` + type regen | Stale types, runtime errors | Always run the full pipeline |
| Using `.translate()` at top level | Breaks assembly positioning assumptions | Use `.transformed(offset=(...))` instead |
| Empty param_schema | Component can't be customized in CAD lab | Expose at least the primary dimensions |
| Missing docstring | DB description field will be empty | Always write a brief docstring |
| Inconsistent slug/function name | Registry lookup fails | Slug must exactly match the function name |
| Spaces in visual_tags array | Postgres array parse error | Use `'{tag1,tag2}'` not `'{tag1, tag2}'` |

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|---------|
| `duplicate key value violates unique constraint` | Missing `ON CONFLICT` clause | Add `ON CONFLICT (slug) DO UPDATE SET ...` |
| `syntax error at or near "$"` | Dollar-quoting issue | Ensure `$CADQUERY$` tags are on their own lines |
| `column "physical_properties" does not exist` | Enrichment migration not applied | Check that `20260212400001_component_enrichment.sql` is applied |
| Component not showing in CAD lab | `verified` is false or migration not pushed | Set `verified = true` and run `npx supabase db push` |
| TypeScript errors after adding components | Types not regenerated | Run `npx supabase gen types typescript --linked > src/types/database.types.ts` |
| Python seeder fails with ImportError | New tier file not imported | Add import to `seed_supabase.py` |

## Related Skills

| Skill | Use When |
|-------|----------|
| **supabase-migration** | Complex migration patterns, RLS policies, ALTER TABLE |
| **feature-implementation-guide** | Building UI for new component features |
| **code-quality** | Linting and type checking after changes |
