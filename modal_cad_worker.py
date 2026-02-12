"""
Modal CadQuery Worker for ForgeOS Product X-Ray
================================================

Executes AI-generated CadQuery code in a sandboxed container,
returns STEP, STL, SVG engineering views, and computes mass
properties + DFM (Design for Manufacturability) checks.

Deploy:
    modal deploy modal_cad_worker.py

Test locally:
    modal run modal_cad_worker.py

Environment:
    Requires MODAL_TOKEN_ID and MODAL_TOKEN_SECRET configured.
"""

import modal
import base64
import json
import math
import os
import re
import tempfile
import traceback
import xml.etree.ElementTree as ET

# ─── Container Image ──────────────────────────────────────────────────

cadquery_image = (
    modal.Image.from_registry("continuumio/miniconda3:24.7.1-0")
    .run_commands(
        "apt-get update -qq && apt-get install -y -qq libosmesa6 libgl1-mesa-glx libglu1-mesa && apt-get clean",
        "conda install -y -c conda-forge python=3.11 cadquery=2.4 -q",
        "conda clean -afy",
    )
    .pip_install("fastapi[standard]")
)

app = modal.App("forgeos-cad")

# ─── Security: Code Validation ────────────────────────────────────────

BLOCKED_PATTERNS = [
    r"\bimport\s+os\b",
    r"\bimport\s+sys\b",
    r"\bimport\s+subprocess\b",
    r"\bimport\s+shutil\b",
    r"\bimport\s+socket\b",
    r"\bimport\s+requests\b",
    r"\bimport\s+urllib\b",
    r"\bimport\s+http\b",
    r"\bfrom\s+os\b",
    r"\bfrom\s+subprocess\b",
    r"\b__import__\b",
    r"\bexec\s*\(",
    r"\beval\s*\(",
    r"\bcompile\s*\(",
    r"\bglobals\s*\(",
    r"\bgetattr\s*\(",
    r"\bsetattr\s*\(",
    r"\bdelattr\s*\(",
    r"\bopen\s*\(",  # file I/O — we inject our own export logic
]


def validate_code(code: str) -> list[str]:
    """
    Scans CadQuery code for disallowed patterns.

    Returns a list of violation descriptions. Empty list means safe.
    """
    violations = []
    for pattern in BLOCKED_PATTERNS:
        matches = re.findall(pattern, code)
        if matches:
            violations.append(f"Blocked pattern: {matches[0]}")
    return violations


# ─── Common Material Densities (kg/m³) ───────────────────────────────

MATERIAL_DENSITIES = {
    "pla": 1240,
    "petg": 1270,
    "abs": 1040,
    "nylon": 1140,
    "tpu": 1210,
    "pc": 1200,
    "asa": 1070,
    "resin": 1100,
    "aluminum": 2700,
    "steel": 7850,
    "titanium": 4500,
    "carbon_fiber_composite": 1600,
    "default": 1240,  # PLA as default for 3D-printed parts
}


# ─── SVG ViewBox Refit ────────────────────────────────────────────────


def _refit_svg_viewbox(svg_path: str, padding_pct: float = 0.10) -> None:
    """
    Parse an SVG file, compute the tight bounding box of all visible
    content, and rewrite the viewBox so the drawing is centered with
    proportional padding. Fixes CadQuery's exporter which leaves
    geometry stuck in the top-left of a fixed 800x600 canvas.
    """
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()

        # CadQuery SVGs use default namespace
        ns = ""
        if root.tag.startswith("{"):
            ns = root.tag.split("}")[0] + "}"

        # Collect all coordinate values from path, line, circle, rect, polyline
        coords_x: list[float] = []
        coords_y: list[float] = []

        for elem in root.iter():
            tag = elem.tag.replace(ns, "")

            # <line x1 y1 x2 y2>
            if tag == "line":
                for attr in ("x1", "x2"):
                    v = elem.get(attr)
                    if v:
                        coords_x.append(float(v))
                for attr in ("y1", "y2"):
                    v = elem.get(attr)
                    if v:
                        coords_y.append(float(v))

            # <circle cx cy r>
            elif tag == "circle":
                cx = float(elem.get("cx", "0"))
                cy = float(elem.get("cy", "0"))
                r = float(elem.get("r", "0"))
                coords_x.extend([cx - r, cx + r])
                coords_y.extend([cy - r, cy + r])

            # <rect x y width height>
            elif tag == "rect":
                x = float(elem.get("x", "0"))
                y = float(elem.get("y", "0"))
                w = float(elem.get("width", "0"))
                h = float(elem.get("height", "0"))
                coords_x.extend([x, x + w])
                coords_y.extend([y, y + h])

            # <path d="..."> — extract numbers from M, L, C, Q, A commands
            elif tag == "path":
                d = elem.get("d", "")
                # Extract all number pairs from path data
                numbers = re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", d)
                for i in range(0, len(numbers) - 1, 2):
                    try:
                        coords_x.append(float(numbers[i]))
                        coords_y.append(float(numbers[i + 1]))
                    except (ValueError, IndexError):
                        pass

            # <polyline points="x1,y1 x2,y2 ...">
            elif tag == "polyline" or tag == "polygon":
                pts = elem.get("points", "")
                pairs = pts.strip().split()
                for pair in pairs:
                    parts = pair.split(",")
                    if len(parts) == 2:
                        try:
                            coords_x.append(float(parts[0]))
                            coords_y.append(float(parts[1]))
                        except ValueError:
                            pass

        if not coords_x or not coords_y:
            return  # No content found — leave SVG as is

        min_x = min(coords_x)
        max_x = max(coords_x)
        min_y = min(coords_y)
        max_y = max(coords_y)

        content_w = max_x - min_x
        content_h = max_y - min_y

        if content_w < 0.01 or content_h < 0.01:
            return  # Degenerate — leave as is

        # Add padding
        pad_x = content_w * padding_pct
        pad_y = content_h * padding_pct

        vb_x = min_x - pad_x
        vb_y = min_y - pad_y
        vb_w = content_w + 2 * pad_x
        vb_h = content_h + 2 * pad_y

        root.set("viewBox", f"{vb_x:.2f} {vb_y:.2f} {vb_w:.2f} {vb_h:.2f}")

        # Keep width/height for proper aspect ratio in img tags
        root.set("width", "100%")
        root.set("height", "100%")

        tree.write(svg_path, xml_declaration=True, encoding="unicode")

    except Exception as e:
        print(f"WARNING: SVG viewBox refit failed for {svg_path}: {e}")
        # Non-fatal — leave the SVG as CadQuery produced it


# ─── Export Wrapper (with mass properties + DFM) ──────────────────────

EXPORT_TEMPLATE = '''
# === ForgeOS export wrapper (injected) ===
import cadquery as cq
import json as _json
import math as _math
import os as _os

_output_dir = "{output_dir}"
_material_density = {material_density}  # kg/m³

# The user code should produce a variable called `result` or `body_shell` or similar.
# We search for the last CadQuery Workplane in local scope.
_candidates = [v for v in reversed(list(locals().values()))
               if isinstance(v, cq.Workplane)]
if not _candidates:
    raise RuntimeError("No CadQuery Workplane object found in script output")

_model = _candidates[0]

# Export STEP
cq.exporters.export(_model, _os.path.join(_output_dir, "model.step"))

# Export STL
cq.exporters.export(_model, _os.path.join(_output_dir, "model.stl"))

# Export SVG views
# Projection directions follow right-hand rule: vector points FROM camera TOWARD object
# Positive Z component = right-way-up orientation (ground at bottom)
# Reference: vertical farm uses (1, 0.8, 0.3) for right-way-up isometric
# CRITICAL: width/height must be specified to avoid empty/tiny SVG output
_views = {{
    "iso": (1, 0.8, 0.3),      # Isometric, slightly upward — shows feet/base at bottom
    "top": (0, 0, -1),         # Looking straight down
    "front": (0, 1, 0),        # Front elevation (Y-axis view)
    "back": (0, -1, 0),        # Back elevation (negative Y-axis view)
    "right": (1, 0, 0),        # Right side elevation (X-axis view)
    "left": (-1, 0, 0),        # Left side elevation (negative X-axis view)
}}
for _name, _dir in _views.items():
    cq.exporters.export(
        _model,
        _os.path.join(_output_dir, f"{{_name}}.svg"),
        opt={{
            "width": 800,
            "height": 600,
            "marginLeft": 20,
            "marginTop": 20,
            "projectionDir": _dir,
            "showHidden": False,
            "strokeWidth": 0.25,
        }},
    )

# === Exploded View Export (if result_exploded exists) ===
try:
    _exploded_candidates = [v for k, v in locals().items()
                            if k == "result_exploded" and isinstance(v, cq.Workplane)]
    if _exploded_candidates:
        _exploded_model = _exploded_candidates[0]
        cq.exporters.export(
            _exploded_model,
            _os.path.join(_output_dir, "exploded_iso.svg"),
            opt={{
                "width": 800,
                "height": 600,
                "marginLeft": 20,
                "marginTop": 20,
                "projectionDir": (1, 0.4, 0.8),  # Exploded iso: slight upward angle to show layer separation
                "showHidden": False,
                "strokeWidth": 0.25,
            }},
        )
except Exception:
    pass  # Exploded view is best-effort — never block main exports

# === Mass Properties Computation ===
_analysis = {{"mass_properties": None, "dfm": None}}

try:
    _shape = _model.val()
    if hasattr(_shape, 'wrapped'):
        _occ_shape = _shape.wrapped
    else:
        _occ_shape = _shape

    # Volume in mm³ (CadQuery uses mm by default)
    _volume_mm3 = _shape.Volume() if hasattr(_shape, 'Volume') else 0.0

    # Center of gravity (mm)
    _center = _shape.Center() if hasattr(_shape, 'Center') else None
    _cg = [
        round(_center.x, 3) if _center else 0.0,
        round(_center.y, 3) if _center else 0.0,
        round(_center.z, 3) if _center else 0.0,
    ]

    # Mass in kg (volume mm³ -> m³, then * density kg/m³)
    _volume_m3 = _volume_mm3 * 1e-9
    _mass_kg = round(_volume_m3 * _material_density, 6)

    # Bounding box
    _bb = _shape.BoundingBox() if hasattr(_shape, 'BoundingBox') else None
    _bbox = {{
        "xLen": round(_bb.xlen, 2) if _bb else 0,
        "yLen": round(_bb.ylen, 2) if _bb else 0,
        "zLen": round(_bb.zlen, 2) if _bb else 0,
        "xMin": round(_bb.xmin, 2) if _bb else 0,
        "yMin": round(_bb.ymin, 2) if _bb else 0,
        "zMin": round(_bb.zmin, 2) if _bb else 0,
        "xMax": round(_bb.xmax, 2) if _bb else 0,
        "yMax": round(_bb.ymax, 2) if _bb else 0,
        "zMax": round(_bb.zmax, 2) if _bb else 0,
    }}

    # Moment of inertia via OCC GProp_GProps
    _moi = {{"Ixx": 0, "Iyy": 0, "Izz": 0, "Ixy": 0, "Ixz": 0, "Iyz": 0}}
    try:
        from OCP.GProp import GProp_GProps
        from OCP.BRepGProp import BRepGProp
        _props = GProp_GProps()
        BRepGProp.VolumeProperties_s(_occ_shape, _props)
        _mat = _props.MatrixOfInertia()
        # Convert from mm^5 to kg*mm² (multiply by density in kg/mm³)
        _density_kg_per_mm3 = _material_density * 1e-9
        _moi = {{
            "Ixx": round(_mat.Value(1, 1) * _density_kg_per_mm3, 6),
            "Iyy": round(_mat.Value(2, 2) * _density_kg_per_mm3, 6),
            "Izz": round(_mat.Value(3, 3) * _density_kg_per_mm3, 6),
            "Ixy": round(_mat.Value(1, 2) * _density_kg_per_mm3, 6),
            "Ixz": round(_mat.Value(1, 3) * _density_kg_per_mm3, 6),
            "Iyz": round(_mat.Value(2, 3) * _density_kg_per_mm3, 6),
        }}
    except Exception:
        pass  # MOI is optional; CG and mass are the critical outputs

    # Surface area (mm²) for material estimation
    _surface_area_mm2 = 0.0
    try:
        from OCP.GProp import GProp_GProps
        from OCP.BRepGProp import BRepGProp
        _sprops = GProp_GProps()
        BRepGProp.SurfaceProperties_s(_occ_shape, _sprops)
        _surface_area_mm2 = round(_sprops.Mass(), 2)
    except Exception:
        pass

    _analysis["mass_properties"] = {{
        "mass_kg": _mass_kg,
        "volume_mm3": round(_volume_mm3, 2),
        "surface_area_mm2": _surface_area_mm2,
        "center_of_gravity": _cg,
        "moment_of_inertia": _moi,
        "bounding_box": _bbox,
        "material_density_kg_m3": _material_density,
    }}
except Exception as _e:
    _analysis["mass_properties"] = {{"error": str(_e)[:300]}}


# === DFM (Design for Manufacturability) Checks ===
try:
    _dfm_issues = []
    _dfm_printable = True

    # Check 1: Build volume fit (common FDM printers)
    _build_volumes = {{
        "Prusa MK4": (250, 210, 220),
        "Bambu Lab X1": (256, 256, 256),
        "Creality Ender 3": (220, 220, 250),
        "Voron 2.4 350": (350, 350, 340),
    }}
    if _bb:
        _dims = sorted([_bb.xlen, _bb.ylen, _bb.zlen], reverse=True)
        _fits_any = False
        _fits_printers = []
        for _pname, (_px, _py, _pz) in _build_volumes.items():
            _pvol = sorted([_px, _py, _pz], reverse=True)
            if _dims[0] <= _pvol[0] and _dims[1] <= _pvol[1] and _dims[2] <= _pvol[2]:
                _fits_any = True
                _fits_printers.append(_pname)
        if not _fits_any:
            _dfm_issues.append({{
                "severity": "critical",
                "category": "build_volume",
                "message": f"Part dimensions ({{_dims[0]:.0f}} x {{_dims[1]:.0f}} x {{_dims[2]:.0f}} mm) exceed all common FDM build volumes. Consider splitting into sub-parts.",
            }})
            _dfm_printable = False
        elif len(_fits_printers) <= 1:
            _dfm_issues.append({{
                "severity": "warning",
                "category": "build_volume",
                "message": f"Part only fits on {{_fits_printers[0]}}. Consider redesigning for wider printer compatibility.",
            }})

    # Check 2: Minimum feature size (aspect ratio of bounding box)
    if _bb and min(_bb.xlen, _bb.ylen, _bb.zlen) < 1.0:
        _dfm_issues.append({{
            "severity": "warning",
            "category": "feature_size",
            "message": "One or more dimensions under 1mm. Features this small may not resolve on FDM printers (min ~0.4mm).",
        }})

    # Check 3: Part volume vs bounding box volume (hollowness indicator)
    if _bb and _volume_mm3 > 0:
        _bb_volume = _bb.xlen * _bb.ylen * _bb.zlen
        if _bb_volume > 0:
            _fill_ratio = _volume_mm3 / _bb_volume
            if _fill_ratio > 0.9:
                _dfm_issues.append({{
                    "severity": "info",
                    "category": "material_usage",
                    "message": f"Part is {{_fill_ratio*100:.0f}}% solid. Consider shelling or adding infill patterns to reduce material and print time.",
                }})

    # Check 4: Estimated print time and material (heuristic)
    # Rough estimate: 20 mm³/s for FDM at 20% infill
    _infill_pct = 0.20
    _effective_volume = _volume_mm3 * _infill_pct if _volume_mm3 > 1000 else _volume_mm3
    _print_speed_mm3_per_s = 20.0
    _est_print_time_min = round(_effective_volume / _print_speed_mm3_per_s / 60, 1) if _effective_volume > 0 else 0
    # Add ~30% for travel, retraction, layer changes
    _est_print_time_min = round(_est_print_time_min * 1.3, 1)

    # Material estimate (volume * density at 20% infill + walls)
    _wall_shell_pct = 0.15  # ~15% of volume is solid walls/top/bottom
    _effective_density_ratio = _infill_pct + _wall_shell_pct
    _est_material_g = round(_volume_mm3 * 1e-3 * _material_density * 1e-3 * _effective_density_ratio, 1)

    # Support volume estimate (very rough — based on overhang heuristic)
    # Without full overhang analysis, estimate 5-15% of part volume
    _est_support_pct = 10.0  # Default estimate

    _analysis["dfm"] = {{
        "printable": _dfm_printable,
        "issues": _dfm_issues,
        "estimated_print_time_min": _est_print_time_min,
        "estimated_material_g": _est_material_g,
        "support_volume_pct": _est_support_pct,
        "compatible_printers": _fits_printers if _bb else [],
    }}
except Exception as _e:
    _analysis["dfm"] = {{"error": str(_e)[:300], "printable": False, "issues": []}}


# Write analysis results to a JSON file for the host to read
try:
    import builtins as _builtins
    with _builtins.open(_os.path.join(_output_dir, "analysis.json"), "w") as _af:
        _af.write(_json.dumps(_analysis))
except Exception:
    pass  # Analysis write failure should not kill STEP/STL/SVG generation
'''

# ─── Main Function ────────────────────────────────────────────────────


def _empty_result() -> dict:
    """Returns a result dict with all file fields set to None."""
    return {
        "error": None,
        "step": None,
        "stl": None,
        "svg_iso": None,
        "svg_top": None,
        "svg_front": None,
        "svg_back": None,
        "svg_right": None,
        "svg_left": None,
        "svg_exploded": None,
        "analysis": None,
    }


@app.function(
    image=cadquery_image,
    timeout=120,
    memory=2048,
)
def generate_cad(
    cadquery_code: str,
    module_id: str,
    material_density: float = 1240.0,
) -> dict:
    """
    Executes CadQuery code and returns exported files as base64,
    plus mass properties and DFM analysis results.

    Args:
        cadquery_code: Python source code using CadQuery to build a model.
                       Must produce a cq.Workplane as the final result.
        module_id: Identifier for logging/debugging.
        material_density: Material density in kg/m³ (default: 1240 for PLA).

    Returns:
        dict with keys: step, stl, svg_iso, svg_top, svg_front, svg_right,
        analysis, error. File values are base64-encoded strings.
        analysis is a dict with mass_properties and dfm sub-dicts.
        error is None on success.
    """
    # SECURITY: Validate code before execution
    violations = validate_code(cadquery_code)
    if violations:
        result = _empty_result()
        result["error"] = f"Code validation failed: {'; '.join(violations)}"
        return result

    with tempfile.TemporaryDirectory() as tmpdir:
        # Prepare export wrapper (executed separately to survive user code crashes)
        export_code = EXPORT_TEMPLATE.format(
            output_dir=tmpdir,
            material_density=material_density,
        )

        # Phase 1: Execute user code — may crash during result_exploded,
        # but `result` is already in namespace by that point
        namespace: dict = {}
        user_exec_error: str | None = None
        try:
            exec(cadquery_code, namespace)  # noqa: S102 — intentional sandboxed exec
        except Exception:
            user_exec_error = traceback.format_exc()[-1500:]

        # Phase 2: Execute export wrapper in the SAME namespace — can find
        # `result` even if Phase 1 crashed partway through (e.g. during
        # result_exploded). This is the key fix: the wrapper always runs.
        export_exec_error: str | None = None
        try:
            exec(export_code, namespace)  # noqa: S102 — intentional sandboxed exec
        except Exception:
            export_exec_error = traceback.format_exc()[-1500:]

        # Determine final error state:
        # - If the export wrapper failed, that's the real error (no files)
        # - If only user code failed but export succeeded, files were recovered
        exec_error: str | None = None
        if export_exec_error:
            exec_error = (
                f"CadQuery export failed for module '{module_id}': "
                f"{export_exec_error}"
            )
        elif user_exec_error:
            # User code crashed (likely during result_exploded) but export
            # wrapper succeeded — log it but don't treat as fatal
            exec_error = (
                f"CadQuery execution warning for module '{module_id}': "
                f"{user_exec_error}"
            )

        # Post-process SVG viewBoxes so drawings are centered
        for svg_name in ["iso", "top", "front", "back", "right", "left", "exploded_iso"]:
            svg_path = os.path.join(tmpdir, f"{svg_name}.svg")
            if os.path.exists(svg_path):
                _refit_svg_viewbox(svg_path)

        # Read output files
        file_map = {
            "step": "model.step",
            "stl": "model.stl",
            "svg_iso": "iso.svg",
            "svg_top": "top.svg",
            "svg_front": "front.svg",
            "svg_back": "back.svg",
            "svg_right": "right.svg",
            "svg_left": "left.svg",
            "svg_exploded": "exploded_iso.svg",
        }

        result: dict = {"error": exec_error}
        has_any_file = False
        for key, filename in file_map.items():
            filepath = os.path.join(tmpdir, filename)
            if os.path.exists(filepath):
                with open(filepath, "rb") as f:  # noqa: SIM115
                    file_bytes = f.read()
                    result[key] = base64.b64encode(file_bytes).decode("utf-8")
                    # Debug logging for SVG files
                    if filename.endswith(".svg"):
                        try:
                            svg_preview = file_bytes.decode("utf-8")[:300]
                            print(f"SVG {key}: {len(file_bytes)} bytes, preview: {svg_preview}")
                        except Exception:
                            pass
                has_any_file = True
            else:
                result[key] = None
                print(f"WARNING: Expected file not found: {filename}")

        # If we recovered files despite an error, clear the error
        # so the caller gets the result instead of a failure
        if exec_error and has_any_file:
            result["error"] = None

        # Read analysis results
        analysis_path = os.path.join(tmpdir, "analysis.json")
        if os.path.exists(analysis_path):
            with open(analysis_path, "r") as f:
                result["analysis"] = json.loads(f.read())
        else:
            result["analysis"] = None

        return result


# ─── Web Endpoint (for calling from Next.js) ─────────────────────────


@app.function(
    image=cadquery_image,
    timeout=120,
    memory=2048,
)
@modal.fastapi_endpoint(method="POST")
def generate_cad_endpoint(item: dict) -> dict:
    """
    HTTP POST endpoint for CadQuery generation + analysis.

    Expects JSON body:
        {
            "code": "...",
            "module_id": "...",
            "material_density": 1240  // optional, kg/m³
        }
    Returns JSON with base64-encoded files and analysis results.
    """
    code = item.get("code", "")
    module_id = item.get("module_id", "unknown")
    material_density = item.get("material_density", 1240.0)

    if not code.strip():
        return {"error": "No CadQuery code provided"}

    return generate_cad.remote(code, module_id, material_density)


# ─── Analysis-Only Endpoint ───────────────────────────────────────────


@app.function(
    image=cadquery_image,
    timeout=90,
    memory=2048,
)
@modal.fastapi_endpoint(method="POST")
def analyze_cad_endpoint(item: dict) -> dict:
    """
    HTTP POST endpoint for analysis-only (no file export).

    Re-runs mass properties and DFM checks on existing CadQuery code,
    useful for re-analyzing with different material parameters.

    Expects JSON body:
        {
            "code": "...",
            "module_id": "...",
            "material_density": 2700  // e.g. aluminum
        }
    Returns JSON with analysis results only (no file exports).
    """
    code = item.get("code", "")
    module_id = item.get("module_id", "unknown")
    material_density = item.get("material_density", 1240.0)

    if not code.strip():
        return {"error": "No CadQuery code provided"}

    # Run full generation but only return analysis
    result = generate_cad.remote(code, module_id, material_density)
    return {
        "error": result.get("error"),
        "analysis": result.get("analysis"),
        "module_id": module_id,
    }


# ─── Local Test ───────────────────────────────────────────────────────


@app.local_entrypoint()
def main():
    """Quick smoke test with a simple CadQuery model."""
    test_code = """
import cadquery as cq

result = (
    cq.Workplane("XY")
    .box(40, 30, 20)
    .edges("|Z").fillet(4)
    .faces(">Z").workplane()
    .hole(8)
)
"""
    print("Running smoke test...")
    output = generate_cad.remote(test_code, "test-module", 1240.0)

    if output["error"]:
        print(f"ERROR: {output['error']}")
    else:
        for key in ["step", "stl", "svg_iso", "svg_top", "svg_front", "svg_back", "svg_right", "svg_left", "svg_exploded"]:
            val = output.get(key)
            if val:
                size_kb = len(val) * 3 / 4 / 1024  # base64 -> bytes -> KB
                print(f"  {key}: {size_kb:.1f} KB")
            else:
                print(f"  {key}: MISSING")

        # Print analysis results
        analysis = output.get("analysis")
        if analysis:
            print("\n  Analysis Results:")
            mp = analysis.get("mass_properties")
            if mp and "error" not in mp:
                print(f"    Mass: {mp['mass_kg']*1000:.1f} g")
                print(f"    Volume: {mp['volume_mm3']:.1f} mm³")
                cg = mp['center_of_gravity']
                print(f"    CG: ({cg[0]}, {cg[1]}, {cg[2]}) mm")
                bb = mp['bounding_box']
                print(f"    Bounding box: {bb['xLen']} x {bb['yLen']} x {bb['zLen']} mm")
            dfm = analysis.get("dfm")
            if dfm and "error" not in dfm:
                print(f"    Printable: {dfm['printable']}")
                print(f"    Est. print time: {dfm['estimated_print_time_min']} min")
                print(f"    Est. material: {dfm['estimated_material_g']} g")
                if dfm.get("issues"):
                    for issue in dfm["issues"]:
                        print(f"    DFM [{issue['severity']}]: {issue['message']}")

    print("Done.")
