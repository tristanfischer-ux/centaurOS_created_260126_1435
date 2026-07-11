-- @file 20260711173000_seed_lfp_prismatic_cell_geometry.sql
-- @description Adds the reusable prismatic LFP cell family used by cabinet-scale CAD renders.

INSERT INTO component_geometry_types (
    slug,
    name,
    tier,
    category,
    cadquery_code,
    param_schema,
    mounting_interfaces,
    visual_tags,
    default_colour,
    description,
    verified
)
VALUES (
    'lfp_prismatic_cell',
    'Prismatic LFP Cell',
    'electromechanical',
    'battery',
$CADQUERY$
def lfp_prismatic_cell(params):
    """Prismatic LFP cell with aluminium can, top terminals and safety vent."""
    width = params.get("width", 148.0)
    depth = params.get("depth", 27.0)
    height = params.get("height", 102.0)
    corner_r = params.get("corner_r", 3.0)
    terminal_d = params.get("terminal_d", 12.0)
    terminal_h = params.get("terminal_h", 6.0)

    can = (
        cq.Workplane("XY")
        .sketch()
        .rect(width, depth)
        .vertices().fillet(corner_r)
        .finalize()
        .extrude(height)
    )
    cap = (
        cq.Workplane("XY")
        .workplane(offset=height)
        .sketch()
        .rect(width - 2.0, depth - 2.0)
        .vertices().fillet(max(0.5, corner_r - 0.5))
        .finalize()
        .extrude(2.0)
    )
    cell = can.union(cap)
    terminal_x = width * 0.34
    for x in (-terminal_x, terminal_x):
        insulator = (
            cq.Workplane("XY")
            .workplane(offset=height + 2.0)
            .transformed(offset=(x, 0, 0))
            .circle(terminal_d * 0.72)
            .extrude(2.0)
        )
        terminal = (
            cq.Workplane("XY")
            .workplane(offset=height + 4.0)
            .transformed(offset=(x, 0, 0))
            .circle(terminal_d / 2.0)
            .extrude(terminal_h)
        )
        cell = cell.union(insulator).union(terminal)
    vent = (
        cq.Workplane("XY")
        .workplane(offset=height + 2.0)
        .circle(depth * 0.22)
        .extrude(1.5)
    )
    return cell.union(vent)
$CADQUERY$,
    '{
      "width": {"type": "number", "default": 148.0, "min": 40, "max": 400, "unit": "mm"},
      "depth": {"type": "number", "default": 27.0, "min": 8, "max": 120, "unit": "mm"},
      "height": {"type": "number", "default": 102.0, "min": 50, "max": 400, "unit": "mm"},
      "corner_r": {"type": "number", "default": 3.0, "min": 0.5, "max": 12, "unit": "mm"},
      "terminal_d": {"type": "number", "default": 12.0, "min": 4, "max": 30, "unit": "mm"},
      "terminal_h": {"type": "number", "default": 6.0, "min": 2, "max": 20, "unit": "mm"}
    }'::jsonb,
    '[
      {"name": "positive_terminal", "type": "threaded_stud", "position": "top"},
      {"name": "negative_terminal", "type": "threaded_stud", "position": "top"}
    ]'::jsonb,
    ARRAY['battery', 'lfp', 'aluminium', 'electrical'],
    '#A7ADB4',
    'Parametric aluminium-can prismatic LFP cell with insulated terminals and a safety vent.',
    true
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    cadquery_code = EXCLUDED.cadquery_code,
    param_schema = EXCLUDED.param_schema,
    mounting_interfaces = EXCLUDED.mounting_interfaces,
    visual_tags = EXCLUDED.visual_tags,
    default_colour = EXCLUDED.default_colour,
    description = EXCLUDED.description,
    verified = EXCLUDED.verified,
    updated_at = now();
