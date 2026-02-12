"""
V5: Full detail with SAFE fillets.
Key insight: Fillets crash CadQuery silently. Use try/except on each fillet.
"""

import requests
import base64
import json
import os
import sys
import time
import re

GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY")
MODAL_ENDPOINT = os.environ.get("MODAL_CAD_ENDPOINT_URL")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_v5")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SYSTEM_PROMPT = """You are an expert CadQuery programmer creating detailed 3D CAD models.

SANDBOX RULES:
- ONLY: import cadquery as cq, import math
- FORBIDDEN: import os, open(), print(), cq.exporters, any file I/O
- End with: result = body_shell

GEOMETRY PATTERNS (use ONLY these — they are the only reliable patterns):

1. ALWAYS start from cq.Workplane("XY"). Never "YZ" or "XZ".
2. Z positioning: .workplane(offset=Z_VALUE)
3. XY positioning: .transformed(offset=(X, Y, 0))
4. Rotation: .transformed(offset=(X, Y, 0), rotate=(0, 0, ANGLE_DEG))
5. ALL .box() calls MUST use centered=True
6. Accumulate into body_shell via .union() and .cut()

SAFE FILLET PATTERN — fillets CAN crash CadQuery. ALWAYS wrap in try/except:
```
try:
    body_shell = body_shell.edges("|Z").fillet(4)
except Exception:
    pass  # Skip fillet if it fails — geometry is intact without it
```

This pattern is MANDATORY for every .fillet() and .chamfer() call.
NEVER chain fillets in a single expression — do them one at a time with try/except.

For hollow bodies: cut inner box from outer box. Do NOT use .shell().

Example complete feature:
```
# Motor mount at position
mount = (
    cq.Workplane("XY")
    .workplane(offset=z)
    .transformed(offset=(mx, my, 0))
    .circle(mount_od / 2).extrude(mount_h)
)
try:
    mount = mount.edges(">Z").fillet(1.5)
except Exception:
    pass
bore = (
    cq.Workplane("XY")
    .workplane(offset=z - 1)
    .transformed(offset=(mx, my, 0))
    .circle(bore_id / 2).extrude(mount_h + 2)
)
mount = mount.cut(bore)
body_shell = body_shell.union(mount)
```"""

PROMPT = """Model a DJI Mavic Air 2 quadcopter drone with MAXIMUM detail.

=== REAL DIMENSIONS (from web research) ===

BODY: 180mm x 85mm x 48mm, wall 2mm, corner radius 12mm
  Top dome: ellipse at rear, 15mm height
  Internal ribs: 1 longitudinal + 3 cross ribs, 1.5mm thick
  8 screw bosses: 6mm OD, M2.5 holes, 10mm height

ARMS (4x): 140mm pivot-to-motor, 20mm x 16mm cross-section, 2mm walls
  Front: 32deg from forward axis, Rear: 38deg from rear axis
  Wire channel: 6mm diameter internal
  
MOTORS (4x): Mount plate 28mm OD x 5mm, center bore 22mm
  3x M3 bolts on 16mm bolt circle
  Bell: 24mm OD x 12mm (hollow, 2mm wall)
  Magnet ring: 22mm OD / 18mm ID / 8mm
  Shaft: 5mm x 10mm

PROPELLERS (4x): 183mm diameter, 2 blades
  Hub: 12mm OD, 5.2mm bore, 6mm height

ESC (4x): 30mm x 15mm x 5mm, in arm, 35mm from body center

CAMERA/GIMBAL: Under front body
  Gimbal plate: 40mm x 30mm x 3mm, 4x vibration dampers (8mm OD)
  Yaw motor: 20mm OD x 6mm ring
  Pitch arms (pair): 15mm x 6mm x 4mm
  Camera: 28mm x 22mm x 26mm
  Lens: 16mm OD barrel, 12mm element, 10mm depth

BATTERY BAY: 110mm x 62mm x 30mm rear cutout
  Rail guides: 4mm wide on each side
  6 contacts: 4mm x 8mm, 8mm spacing at rear wall
  Latch: 16mm x 8mm x 6mm at front of bay

PCB: 60mm x 40mm x 1.6mm
  4 standoffs: 5mm OD, M2.5, 6mm height

PORTS (left side): USB-C 8.94mm x 3.26mm, microSD 12mm x 1.5mm
SENSORS: Front 2x 10mm x 8mm, Bottom 12mm + 6mm, Rear 10mm
LEDs: Front bar 30mm x 3mm, Rear 2x 8mm x 3mm
GPS: 22mm dia x 5mm puck, recessed in top (24mm recess, 3mm deep)
ANTENNA: 35mm x 16mm x 4mm hollow housing on rear top
VENTILATION: 6 slots 2mm x 15mm on top
LANDING GEAR (2x): Strut 50mm x 10mm x 18mm, Foot 54mm x 12mm x 4mm
PROP GUARD BOSSES (4x): 6mm OD, 2mm hole, 5mm height

=== INSTRUCTIONS ===

1. Declare ALL dimensions as named variables at the top
2. Build EVERY feature listed above with maximum sub-component detail
3. Use ONLY the patterns from the system prompt
4. EVERY .fillet() and .chamfer() MUST be wrapped in try/except
5. Never chain fillets — one at a time
6. End with: result = body_shell
7. Target: 800+ lines of detailed code"""


def run():
    subject_dir = os.path.join(OUTPUT_DIR, "drone")
    os.makedirs(subject_dir, exist_ok=True)

    print("Generating with Gemini 2.5 Pro (safe fillets)...")
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

    # Clean forbidden patterns that appear in comments
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
    mr = requests.post(MODAL_ENDPOINT, json={"code": code, "module_id": "v5-drone", "material_density": 1240.0}, timeout=300)
    print(f"  Modal: {time.time()-t:.1f}s")

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
                print(f"\n  Bbox: {bb.get('xLen',0):.0f} x {bb.get('yLen',0):.0f} x {bb.get('zLen',0):.0f} mm")
                vol = mp.get('volume_mm3', 0)
                bb_vol = bb.get('xLen',1) * bb.get('yLen',1) * bb.get('zLen',1)
                if bb_vol > 0:
                    print(f"  Fill: {vol/bb_vol*100:.1f}%")
                print(f"  Mass: {mp.get('mass_kg',0)*1000:.1f} g")
                print(f"  Volume: {vol:.0f} mm3")

    print(f"\n  Output: {subject_dir}")


if __name__ == "__main__":
    if not GOOGLE_AI_API_KEY or not MODAL_ENDPOINT:
        print("Set GOOGLE_AI_API_KEY and MODAL_CAD_ENDPOINT_URL"); sys.exit(1)
    run()
