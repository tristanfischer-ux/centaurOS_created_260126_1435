"""
V6: Correct fillet strategy — fillet pieces BEFORE union, NEVER body_shell.
"""

import requests, base64, json, os, sys, time, re

GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY")
MODAL_ENDPOINT = os.environ.get("MODAL_CAD_ENDPOINT_URL")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_v6")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SYSTEM_PROMPT = """You are an expert CadQuery programmer writing detailed 3D CAD models.

SANDBOX RULES:
- ONLY: import cadquery as cq, import math
- FORBIDDEN: import os, open(), print(), cq.exporters, any file I/O
- End with: result = body_shell

=== GEOMETRY POSITIONING PATTERNS ===

ALWAYS start from cq.Workplane("XY"). NEVER use "YZ" or "XZ".
Z positioning: .workplane(offset=Z_VALUE)
XY positioning: .transformed(offset=(X, Y, 0))
Rotation: .transformed(offset=(X, Y, 0), rotate=(0, 0, ANGLE_DEG))
ALL .box() calls MUST use centered=True

=== CRITICAL FILLET RULE ===

FILLET INDIVIDUAL PIECES — NEVER fillet body_shell!

CORRECT:
```
piece = cq.Workplane("XY").box(100, 50, 30, centered=True)
piece = piece.edges("|Z").fillet(8)    # Fillet the PIECE
piece = piece.edges(">Z").fillet(4)    # More fillets on the PIECE
body_shell = body_shell.union(piece)   # Then union
```

WRONG (will crash):
```
body_shell = body_shell.edges("|Z").fillet(8)  # NEVER DO THIS
```

For hollow bodies, fillet the outer and inner SEPARATELY before cutting:
```
outer = cq.Workplane("XY").box(180, 85, 48, centered=True)
outer = outer.edges("|Z").fillet(12)
outer = outer.edges(">Z").fillet(8)
outer = outer.edges("<Z").fillet(4)

inner = cq.Workplane("XY").workplane(offset=-1).box(176, 81, 46, centered=True)
inner = inner.edges("|Z").fillet(10)
inner = inner.edges(">Z").fillet(6)

body_shell = outer.cut(inner)  # Fillet already applied to both pieces
```

For arms:
```
arm = (
    cq.Workplane("XY")
    .workplane(offset=z)
    .transformed(offset=(cx, cy, 0), rotate=(0, 0, angle))
    .box(length, width, height, centered=True)
)
arm = arm.edges("|Z").fillet(4)   # Fillet the arm piece
arm_inner = (
    cq.Workplane("XY")
    .workplane(offset=z + wall)
    .transformed(offset=(cx, cy, 0), rotate=(0, 0, angle))
    .box(length - 10, width - wall*2, height - wall*2, centered=True)
)
arm_inner = arm_inner.edges("|Z").fillet(3)
body_shell = body_shell.union(arm.cut(arm_inner))
```

Keep fillet radii CONSERVATIVE: never more than 1/3 of the shortest adjacent edge.
For cylinders (.circle().extrude()), use .edges(">Z").fillet(r) with r < height/4.
"""

PROMPT = """Model a DJI Mavic Air 2 quadcopter drone with MAXIMUM detail using real dimensions.

BODY: 180mm x 85mm x 48mm, 2mm wall, corner radius 12mm
  Top dome: elliptical, 15mm height at rear
  Internal: 1 longitudinal + 3 cross ribs (1.5mm thick)
  8 screw bosses: 6mm OD, M2.5 holes, 10mm height

ARMS (4x): 140mm to motor, 20mm x 16mm, 2mm walls, 4mm fillet
  Front: 32deg, Rear: 38deg, wire channel 6mm dia

MOTORS (4x): 28mm mount x 5mm, 22mm bore, 3xM3 on 16mm bolt circle
  Bell: 24mm x 12mm (hollow 2mm wall)
  Magnet ring: 22mm/18mm x 8mm, Shaft: 5mm x 10mm

PROPELLERS (4x): 183mm dia, 2 blades, hub 12mm x 6mm

ESC (4x): 30mm x 15mm x 5mm, in arm 35mm from center

CAMERA/GIMBAL: Gimbal plate 40mm x 30mm x 3mm, 4x dampers 8mm OD
  Yaw ring 20mm x 6mm, Pitch arms 15mm x 6mm x 4mm
  Camera 28mm x 22mm x 26mm, Lens 16mm OD x 10mm

BATTERY BAY: 110mm x 62mm x 30mm cutout, rail guides 4mm
  6 contacts, latch 16mm x 8mm x 6mm

PCB: 60mm x 40mm, 4x standoffs 5mm OD x 6mm

PORTS: USB-C 8.94mm x 3.26mm, microSD 12mm x 1.5mm (left)
SENSORS: Front 2x 10mm x 8mm, Bottom 12mm + 6mm, Rear 10mm
LEDs: Front bar 30mm x 3mm, Rear 2x 8mm x 3mm
GPS: 22mm puck, recessed, ANTENNA: 35mm x 16mm x 4mm
VENTS: 6 slots 2mm x 15mm, LANDING: 2x strut+foot
PROP GUARD BOSSES: 4x 6mm OD, 2mm hole, 5mm height

RULES:
1. Declare ALL dimensions as named variables
2. Fillet individual PIECES, never body_shell
3. Conservative fillets (<1/3 shortest edge)
4. ONLY use cq.Workplane("XY") with .workplane(offset=z).transformed(offset=(x,y,0))
5. ALL .box() centered=True
6. For hollow: fillet outer + inner separately, then cut
7. End with: result = body_shell
8. Target: 800+ lines"""


def run():
    subject_dir = os.path.join(OUTPUT_DIR, "drone")
    os.makedirs(subject_dir, exist_ok=True)

    print("V6: Generating with Gemini 2.5 Pro (correct fillet strategy)...")
    start = time.time()
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={GOOGLE_AI_API_KEY}"
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": PROMPT}]}],
        "generationConfig": {"maxOutputTokens": 65536, "temperature": 0.4}
    }
    
    resp = requests.post(url, json=payload, timeout=900)
    resp.raise_for_status()
    data = resp.json()
    
    full_text = data["candidates"][0]["content"]["parts"][0]["text"]
    usage = data.get("usageMetadata", {})
    elapsed = time.time() - start

    if "```python" in full_text:
        code = full_text.split("```python")[1].split("```")[0].strip()
    elif "```" in full_text:
        code = full_text.split("```")[1].split("```")[0].strip()
    else:
        code = full_text.strip()

    cleaned = []
    for line in code.split("\n"):
        s = line.strip()
        if s.startswith("#") and any(p in s for p in ["import os", "open(", "print("]):
            continue
        if s.startswith("import os") or s.startswith("from os"):
            continue
        if re.match(r'^print\s*\(', s):
            continue
        cleaned.append(line)
    code = "\n".join(cleaned)

    lines = code.strip().split("\n")
    print(f"  {elapsed:.1f}s, {len(lines)} lines, {usage.get('candidatesTokenCount', 0)} output tokens")

    with open(os.path.join(subject_dir, "drone.py"), "w") as f:
        f.write(code)

    print("Sending to Modal...")
    t = time.time()
    mr = requests.post(MODAL_ENDPOINT, json={"code": code, "module_id": "v6-drone", "material_density": 1240.0}, timeout=300)
    modal_t = time.time() - t
    print(f"  Modal: {modal_t:.1f}s")

    result = mr.json()
    if result.get("error"):
        print(f"  ERROR: {result['error'][:500]}")
        with open(os.path.join(subject_dir, "error.txt"), "w") as f:
            f.write(result["error"])
    else:
        for key in ["step", "stl", "svg_iso", "svg_top", "svg_front", "svg_right"]:
            d = result.get(key)
            if d:
                ext = {"step": "step", "stl": "stl", "svg_iso": "iso.svg", "svg_top": "top.svg", "svg_front": "front.svg", "svg_right": "right.svg"}[key]
                fp = os.path.join(subject_dir, f"drone.{ext}")
                with open(fp, "wb") as f:
                    f.write(base64.b64decode(d))
                print(f"  {key}: {len(base64.b64decode(d))/1024:.1f} KB")

        analysis = result.get("analysis")
        if analysis:
            with open(os.path.join(subject_dir, "analysis.json"), "w") as f:
                json.dump(analysis, f, indent=2)
            mp = analysis.get("mass_properties", {})
            if mp and "error" not in mp:
                bb = mp.get("bounding_box", {})
                vol = mp.get('volume_mm3', 0)
                bb_vol = bb.get('xLen',1) * bb.get('yLen',1) * bb.get('zLen',1)
                print(f"\n  Bbox: {bb.get('xLen',0):.0f} x {bb.get('yLen',0):.0f} x {bb.get('zLen',0):.0f} mm")
                if bb_vol > 0:
                    print(f"  Fill: {vol/bb_vol*100:.1f}%")
                print(f"  Mass: {mp.get('mass_kg',0)*1000:.1f} g")
                print(f"  Volume: {vol:.0f} mm3")
                print(f"  STEP size: {os.path.getsize(os.path.join(subject_dir, 'drone.step'))/1024:.0f} KB")

    print(f"\n  Output: {subject_dir}")


if __name__ == "__main__":
    if not GOOGLE_AI_API_KEY or not MODAL_ENDPOINT:
        print("Set GOOGLE_AI_API_KEY and MODAL_CAD_ENDPOINT_URL"); sys.exit(1)
    run()
