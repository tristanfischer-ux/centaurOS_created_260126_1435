"""gen_primitive_api_doc.py — generate PRIMITIVE-API.md + primitive-api-schema.json
from forge_blender_lib.py docstrings (B2, ANVIL-UNIVERSAL-LOOP-PLAN.md WS-B).

The md is the PROMPT-FACING contract handed to the LLM scene author; the json
is the MACHINE-FACING schema validate_authored_scene.py type-checks calls
against. Both are CHECKED IN (versioned alongside PRIMITIVE_API_VERSION) and
regenerated whenever the lib changes:

  python3 scripts/blender-templates/gen_primitive_api_doc.py

Pure-stdlib (ast) — does NOT import the lib (which needs bpy).
"""
import ast
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
LIB = HERE / "forge_blender_lib.py"
OUT_MD = HERE / "PRIMITIVE-API.md"
OUT_SCHEMA = HERE / "primitive-api-schema.json"

# The AUTHORED-SCENE grammar: the ONLY forge_blender_lib functions an
# LLM-authored registry-miss scene may call. Deliberately EXCLUDES the legacy
# raw helpers (add_box / add_cyl / add_torus / add_sphere / add_frustum /
# add_pipe / add_compound_*) — authored scenes must compose parametric
# primitives so the placement-relation + module-tag machinery is always
# populated and the deterministic checks have something to bite on.
AUTHORED_ALLOWLIST = [
    # scene setup / render
    "init_scene", "make_default_palette", "make_mat", "make_module_dict",
    "add_lights", "make_world_white", "run_render_pipeline",
    "get_module_profile", "module_accent_mat",
    # module tagging + placement ontology
    "tag_module", "sync_module_tags",
    "declare_relation", "declare_structure_root", "add_clearance_zone",
    # parametric primitives (B1)
    "prim_fuselage", "prim_wing", "prim_tail", "prim_pod", "prim_propeller",
    "prim_vessel", "prim_skid_frame", "prim_pipe_rack", "prim_rack_row",
    "prim_enclosure", "prim_tower", "prim_hull", "prim_gantry",
    "prim_rotating_machine", "prim_panel_stack", "prim_foundation",
    # connection routing
    "route_orthogonal", "prim_pipe_run",
]

CONVENTIONS = """\
## Conventions (read first)

- **All public dimensions / locations are in MILLIMETRES** (`*_mm` params,
  `location_mm` tuples). The lib converts to Blender metres internally.
- **Ground-standing primitives** (vessel, skid, pipe rack, rack row,
  enclosure, tower, hull, gantry, rotating machine, panel stack, foundation)
  take `location_mm` = **BASE-CENTRE**: (x, y) footprint centre, z =
  UNDERSIDE. Stack by setting base z = parent assembly's `top_z_m * 1000`.
- **Airframe primitives** (fuselage, wing, pod, propeller) take
  `location_mm` = **volume CENTRE** (parts hang in space).
- Every primitive returns an **ASSEMBLY dict**
  `{"name", "root", "parts", "centre_m", "size_m", ...extras}` —
  `centre_m`/`size_m` are METRES; multiply by 1000 when feeding back into mm
  params. Extras worth using: `prim_vessel` → `ports_m["top"]`,
  `prim_foundation`/`prim_skid_frame`/`prim_tower` → `top_z_m`,
  `prim_fuselage`/`prim_pod` → `radius_m`, `length_m`.
- **Placement relations** make the connectivity + interpenetration checks
  pass: `declare_structure_root(asm)` on ≥1 anchor assembly; connect every
  other assembly via `declare_relation(a, "supports"|"contains"|"attached_to", b)`
  or the primitives' `parent=` / `fuselage=` / `connect=` kwargs. Overlaps
  between RELATED assemblies are exempt from the clash check; unrelated
  overlaps > tolerance FAIL.
- **Module tagging**: every primitive call passes `module=<module_id>` and
  `module_objects=MO`. The deterministic check `module_tag_count` requires
  EVERY module id in the design digest to own ≥1 mesh.
"""


def _sig(fn: ast.FunctionDef) -> tuple[str, list[dict]]:
    """Render the signature + param schema for a function def."""
    a = fn.args
    params: list[dict] = []
    pos = list(a.posonlyargs) + list(a.args)
    n_defaults = len(a.defaults)
    for i, arg in enumerate(pos):
        d_idx = i - (len(pos) - n_defaults)
        has_default = d_idx >= 0
        default = ast.unparse(a.defaults[d_idx]) if has_default else None
        params.append({"name": arg.arg, "required": not has_default,
                       "default": default})
    for arg, d in zip(a.kwonlyargs, a.kw_defaults):
        params.append({"name": arg.arg, "required": d is None,
                       "default": ast.unparse(d) if d is not None else None})
    rendered = ", ".join(
        p["name"] if p["required"] else f"{p['name']}={p['default']}"
        for p in params)
    star = ""
    if a.vararg:
        star = f", *{a.vararg.arg}"
    return f"{fn.name}({rendered}{star})", params


def main() -> int:
    tree = ast.parse(LIB.read_text())
    api_version = "unknown"
    fns: dict[str, ast.FunctionDef] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "PRIMITIVE_API_VERSION":
                    api_version = ast.literal_eval(node.value)
        if isinstance(node, ast.FunctionDef):
            fns[node.name] = node

    missing = [n for n in AUTHORED_ALLOWLIST if n not in fns]
    if missing:
        print(f"FATAL: allowlisted functions missing from lib: {missing}", file=sys.stderr)
        return 1

    md = [f"# ForgeOS Blender Primitive API — v{api_version}", "",
          "> GENERATED by gen_primitive_api_doc.py from forge_blender_lib.py "
          "docstrings — do not hand-edit. This is the COMPLETE grammar an "
          "authored (registry-miss) scene may use; anything else is rejected "
          "by validate_authored_scene.py.", "", CONVENTIONS, "## Functions", ""]
    schema = {"primitive_api_version": api_version, "functions": {}}
    for name in AUTHORED_ALLOWLIST:
        fn = fns[name]
        sig, params = _sig(fn)
        doc = ast.get_docstring(fn) or "(no docstring)"
        md.append(f"### `fl.{sig}`\n\n{doc}\n")
        schema["functions"][name] = {
            "params": params,
            "doc": doc.split("\n")[0],
        }

    OUT_MD.write_text("\n".join(md))
    OUT_SCHEMA.write_text(json.dumps(schema, indent=2) + "\n")
    print(f"wrote {OUT_MD} ({OUT_MD.stat().st_size} B) + {OUT_SCHEMA} "
          f"({len(schema['functions'])} functions, api v{api_version})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
