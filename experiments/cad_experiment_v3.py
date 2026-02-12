"""
CAD Generation Experiment V3: Few-Shot with Reference Patterns
==============================================================

Approach: Include WORKING CadQuery code excerpts as examples,
so the model follows patterns that actually produce geometry.
"""

import requests
import base64
import json
import os
import sys
import time

GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY")
MODAL_ENDPOINT = os.environ.get("MODAL_CAD_ENDPOINT_URL")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_v3")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── The Prompt ──────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert mechanical engineer writing CadQuery code for CAD models.

SANDBOX RULES (violating ANY of these makes the code fail):
- Use ONLY: `import cadquery as cq` and `import math`
- FORBIDDEN: `import os`, `open()`, `print()`, `cq.exporters`, any file I/O
- Assign the final model to: `result = body_shell`

CADQUERY PATTERNS — Follow these EXACTLY. These are the ONLY patterns that reliably produce geometry:

PATTERN 1 — Main body (centered at origin):
```
body_outer = (
    cq.Workplane("XY")
    .box(180, 85, 48, centered=True)
    .edges("|Z").fillet(12)
    .edges(">Z").fillet(8)
    .edges("<Z").fillet(4)
)
body_inner = (
    cq.Workplane("XY")
    .workplane(offset=-1)
    .box(176, 81, 46, centered=True)
    .edges("|Z").fillet(10)
    .edges(">Z").fillet(6)
)
body_shell = body_outer.cut(body_inner)
```

PATTERN 2 — Feature at position (Z via workplane, XY via transformed):
```
feature = (
    cq.Workplane("XY")
    .workplane(offset=-body_height / 2 + wall)
    .transformed(offset=(x_pos, y_pos, 0))
    .circle(radius).extrude(height)
)
body_shell = body_shell.union(feature)
```

PATTERN 3 — Rotated feature (arm, angled part):
```
arm_outer = (
    cq.Workplane("XY")
    .workplane(offset=z_offset)
    .transformed(offset=(center_x, center_y, 0), rotate=(0, 0, angle_deg))
    .box(length, width, height, centered=True)
    .edges("|Z").fillet(4)
)
arm_inner = (
    cq.Workplane("XY")
    .workplane(offset=z_offset + wall)
    .transformed(offset=(center_x, center_y, 0), rotate=(0, 0, angle_deg))
    .box(length - 10, width - wall*2, height - wall*2, centered=True)
)
body_shell = body_shell.union(arm_outer.cut(arm_inner))
```

PATTERN 4 — Hole/cutout at position:
```
hole = (
    cq.Workplane("XY")
    .workplane(offset=z_offset - 1)
    .transformed(offset=(x, y, 0))
    .circle(radius).extrude(depth + 2)
)
body_shell = body_shell.cut(hole)
```

PATTERN 5 — Dome/elliptical feature:
```
dome = (
    cq.Workplane("XY")
    .workplane(offset=body_height / 2 - 4)
    .ellipse(length/2 - 5, width/2 - 5)
    .extrude(dome_height)
    .edges(">Z").fillet(8)
)
body_shell = body_shell.union(dome)
```

PATTERN 6 — Ring (annular) feature:
```
ring = (
    cq.Workplane("XY")
    .workplane(offset=z)
    .transformed(offset=(x, y, 0))
    .circle(outer_r).circle(inner_r)
    .extrude(height)
)
body_shell = body_shell.union(ring)
```

CRITICAL RULES:
- ALWAYS start from cq.Workplane("XY"). NEVER use "YZ" or "XZ" as the base.
- ALWAYS use .workplane(offset=z) for Z positioning.
- ALWAYS use .transformed(offset=(x, y, 0)) for XY positioning.
- NEVER use .translate() or .rotate() after geometry creation.
- NEVER use cq.Workplane("XY", origin=(x,y,z)). Use .workplane(offset=z).transformed(offset=(x,y,0)) instead.
- ALL boxes must use centered=True.
- For fillets: use conservative radii (< half the shortest edge). Skip fillet if risky.
- Accumulate everything into body_shell via .union() and .cut()
- End with: result = body_shell

Target: 800+ lines of CadQuery code with maximum detail."""


DJI_MAVIC_RESEARCH = """
=== DJI Mavic Air 2 — Real Specifications (from web research) ===

OVERALL DIMENSIONS:
- Folded: 180 x 97 x 84 mm (LxWxH)
- Unfolded: 183 x 253 x 77 mm
- Diagonal distance (motor to motor): 302 mm
- Weight: 570 g total

BODY SHELL:
- Main body approximately 180mm long x 85mm wide x 48mm tall
- Shell wall thickness: 2mm
- Corner radius: 12mm on vertical edges
- Top fillet: 8mm, bottom fillet: 4mm
- Top rear aerodynamic dome: 15mm height
- Internal structural ribbing (1 longitudinal + 3 cross ribs, 1.5mm thick)
- 8 screw bosses (6mm OD, M2.5 holes, 10mm height)

FOLDING ARMS (4x):
- Each arm: 140mm from pivot to motor center
- Cross section: 20mm wide x 16mm tall, 4mm fillet on vertical edges
- Hollow with 2mm walls (weight reduction + wire routing)
- Internal wire channel: 6mm diameter
- Front arms: 32 degrees from forward axis
- Rear arms: 38 degrees from rear axis

MOTORS (4x brushless outrunners):
- Motor mount plate: 28mm OD, 5mm height, with 22mm center bore
- 3x M3 bolt holes on 16mm bolt circle
- Motor bell: 24mm OD x 12mm height (hollow, 2mm wall)
- Internal magnet ring: 22mm OD, 18mm ID, 8mm height
- Motor shaft: 5mm dia x 10mm protrusion

PROPELLERS (4x, 7238F):
- Diameter: 183mm tip-to-tip, 2 blades each
- Hub: 12mm OD, 5.2mm shaft bore, 6mm height
- Blade root chord: 18mm, tip chord: 8mm, thickness: 2.5mm

ESC (4x, one per arm):
- PCB: 30mm x 15mm x 5mm, mounted inside arm 35mm from body center
- 2x M2 mounting holes, spaced 22mm apart

CAMERA / GIMBAL:
- 3-axis gimbal, mounted under front of body
- Gimbal plate: 40mm x 30mm x 3mm, with 4x rubber damper mounts (8mm OD)
- Yaw motor ring: 20mm OD x 6mm height
- Pitch arms (pair): 15mm x 6mm x 4mm
- Camera body: 28mm x 22mm x 26mm
- Lens barrel: 16mm OD, 12mm lens, 10mm depth

BATTERY BAY:
- Bay: 110mm x 62mm x 30mm cutout in rear
- Slide-in from rear with 4mm rail guides on each side
- 6 electrical contacts (4mm x 8mm each, 8mm spacing)
- Mechanical latch: 16mm x 8mm x 6mm at front of bay

PCB / FLIGHT CONTROLLER:
- Main PCB: 60mm x 40mm, 1.6mm thick
- 4 mounting posts: 5mm OD, M2.5 holes, 6mm standoff

PORTS (left side of body):
- USB-C: 8.94mm x 3.26mm cutout
- microSD slot: 12mm x 1.5mm cutout, 15mm below USB-C

SENSORS:
- Front obstacle avoidance: 2 recesses, 10mm x 8mm, 26mm apart
- Bottom downward vision: 12mm diameter
- Bottom ToF: 6mm diameter
- Rear obstacle avoidance: 10mm diameter

LED INDICATORS:
- Front status bar: 30mm x 3mm
- Rear LEDs: 2x 8mm x 3mm, 40mm apart

GPS PUCK:
- 22mm diameter x 5mm height, recessed in top surface (24mm recess, 3mm deep)

ANTENNA HOUSING:
- 35mm x 16mm x 4mm, hollow (1.5mm walls), on rear top

VENTILATION:
- 6 vent slots on top: each 2mm x 15mm, spaced 4mm apart

LANDING GEAR:
- 2 rear landing skids (under rear motor positions)
- Each: vertical strut 50mm x 10mm x 18mm + horizontal foot pad 54mm x 12mm x 4mm
- Weight-saving slot in strut center
- 2mm rubber layer on bottom of foot pad
- Fillet: 3mm

PROP GUARD MOUNT BOSSES:
- 4x (one per motor mount), 6mm OD, 2mm ID hole, 5mm height
"""


def generate_and_execute(subject_name: str, research_data: str, model: str):
    """Generate CadQuery code with few-shot patterns and research, execute on Modal."""
    subject_dir = os.path.join(OUTPUT_DIR, subject_name)
    os.makedirs(subject_dir, exist_ok=True)

    user_prompt = f"""Model a DJI Mavic Air 2 quadcopter drone using the research data below.

{research_data}

Write complete CadQuery code following the EXACT patterns from the system prompt.
Declare ALL dimensions as named variables at the top.
Model EVERY feature listed above with maximum sub-component detail.
End with: result = body_shell

Remember:
- Start every feature from cq.Workplane("XY")
- Use .workplane(offset=z) then .transformed(offset=(x, y, 0))
- ALL boxes use centered=True
- Keep fillet radii conservative (less than half the shortest edge)
- If a fillet might fail, skip it rather than crash the whole model"""

    print(f"\n{'='*60}")
    print(f"Generating: {subject_name} (model: {model})")
    print(f"{'='*60}\n")

    start = time.time()
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GOOGLE_AI_API_KEY}"
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 65536,
            "temperature": 0.4,  # Lower temp for more reliable code
        }
    }
    
    resp = requests.post(url, json=payload, timeout=900)
    resp.raise_for_status()
    data = resp.json()
    
    full_text = data["candidates"][0]["content"]["parts"][0]["text"]
    usage = data.get("usageMetadata", {})
    tokens_in = usage.get("promptTokenCount", 0)
    tokens_out = usage.get("candidatesTokenCount", 0)
    elapsed = time.time() - start

    # Extract code
    if "```python" in full_text:
        code = full_text.split("```python")[1].split("```")[0].strip()
    elif "```" in full_text:
        code = full_text.split("```")[1].split("```")[0].strip()
    else:
        code = full_text.strip()

    # Clean forbidden patterns from comments
    import re
    cleaned_lines = []
    for line in code.split("\n"):
        s = line.strip()
        if s.startswith("#") and any(p in s for p in ["import os", "open(", "print("]):
            continue
        if s.startswith("import os") or s.startswith("from os"):
            continue
        if re.match(r'^print\s*\(', s):
            continue
        cleaned_lines.append(line)
    code = "\n".join(cleaned_lines)

    lines = code.strip().split("\n")
    print(f"Model responded in {elapsed:.1f}s")
    print(f"Generated {len(lines)} lines of CadQuery code")
    print(f"Tokens: {tokens_in} in / {tokens_out} out")

    # Save code
    code_path = os.path.join(subject_dir, f"{subject_name}.py")
    with open(code_path, "w") as f:
        f.write(code)

    # Execute on Modal
    print(f"\nSending to Modal...")
    modal_start = time.time()
    modal_resp = requests.post(
        MODAL_ENDPOINT,
        json={"code": code, "module_id": f"v3-{subject_name}", "material_density": 1240.0},
        timeout=300,
    )
    modal_elapsed = time.time() - modal_start
    print(f"Modal responded in {modal_elapsed:.1f}s")

    result = modal_resp.json()

    if result.get("error"):
        print(f"\nERROR: {result['error'][:1000]}")
        with open(os.path.join(subject_dir, "error.txt"), "w") as f:
            f.write(result["error"])
    else:
        file_map = {
            "step": f"{subject_name}.step",
            "stl": f"{subject_name}.stl",
            "svg_iso": f"{subject_name}_iso.svg",
            "svg_top": f"{subject_name}_top.svg",
            "svg_front": f"{subject_name}_front.svg",
            "svg_right": f"{subject_name}_right.svg",
        }
        for key, filename in file_map.items():
            d = result.get(key)
            if d:
                filepath = os.path.join(subject_dir, filename)
                with open(filepath, "wb") as f:
                    f.write(base64.b64decode(d))
                size_kb = len(base64.b64decode(d)) / 1024
                print(f"  {key}: {filename} ({size_kb:.1f} KB)")

        analysis = result.get("analysis")
        if analysis:
            with open(os.path.join(subject_dir, "analysis.json"), "w") as f:
                json.dump(analysis, f, indent=2)
            mp = analysis.get("mass_properties", {})
            if mp and "error" not in mp:
                print(f"\n  Mass: {mp.get('mass_kg', 0)*1000:.1f} g")
                print(f"  Volume: {mp.get('volume_mm3', 0):.0f} mm3")
                bb = mp.get("bounding_box", {})
                if bb:
                    print(f"  Bbox: {bb.get('xLen',0):.0f} x {bb.get('yLen',0):.0f} x {bb.get('zLen',0):.0f} mm")
                    bb_vol = bb.get('xLen',1) * bb.get('yLen',1) * bb.get('zLen',1)
                    if bb_vol > 0:
                        fill = mp.get('volume_mm3', 0) / bb_vol * 100
                        print(f"  Fill ratio: {fill:.1f}%")

    print(f"\n  Output: {subject_dir}")
    return result


if __name__ == "__main__":
    if not GOOGLE_AI_API_KEY:
        print("ERROR: Set GOOGLE_AI_API_KEY"); sys.exit(1)
    if not MODAL_ENDPOINT:
        print("ERROR: Set MODAL_CAD_ENDPOINT_URL"); sys.exit(1)

    model = sys.argv[1] if len(sys.argv) > 1 else "gemini-2.5-pro"
    generate_and_execute("drone", DJI_MAVIC_RESEARCH, model)
