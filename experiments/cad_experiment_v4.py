"""
V4: Diagnostic run — NO FILLETS. Test if base geometry is correct.
"""

import requests
import base64
import json
import os
import sys
import time

GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY")
MODAL_ENDPOINT = os.environ.get("MODAL_CAD_ENDPOINT_URL")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_v4")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SYSTEM_PROMPT = """You are an expert CadQuery programmer. Write CadQuery code that produces a 3D model.

SANDBOX RULES:
- ONLY: import cadquery as cq, import math
- FORBIDDEN: import os, open(), print(), cq.exporters, any file I/O
- End with: result = body_shell

CRITICAL — GEOMETRY PATTERNS (use ONLY these):

Position features with: cq.Workplane("XY").workplane(offset=Z).transformed(offset=(X, Y, 0))
Rotate features with: .transformed(offset=(X, Y, 0), rotate=(0, 0, ANGLE_DEG))
ALL boxes: centered=True
ALL geometry into body_shell via .union() and .cut()

DO NOT USE:
- .fillet() or .chamfer() — they crash silently and corrupt geometry
- .translate() or .rotate() — they misposition geometry
- cq.Workplane("YZ") or cq.Workplane("XZ") — use only "XY"
- .shell() — unreliable, manually cut inner from outer instead

Example body:
    outer = cq.Workplane("XY").box(180, 85, 48, centered=True)
    inner = cq.Workplane("XY").workplane(offset=-1).box(176, 81, 46, centered=True)
    body_shell = outer.cut(inner)

Example arm (rotated box at midpoint):
    arm_center_x = motor_x / 2
    arm_center_y = motor_y / 2
    arm_length = math.sqrt(motor_x**2 + motor_y**2)
    angle = math.degrees(math.atan2(motor_y, motor_x))
    arm = (
        cq.Workplane("XY")
        .workplane(offset=arm_z)
        .transformed(offset=(arm_center_x, arm_center_y, 0), rotate=(0, 0, angle))
        .box(arm_length, arm_width, arm_height, centered=True)
    )
    body_shell = body_shell.union(arm)

Example hole:
    hole = (
        cq.Workplane("XY")
        .workplane(offset=z - 1)
        .transformed(offset=(x, y, 0))
        .circle(r).extrude(depth + 2)
    )
    body_shell = body_shell.cut(hole)
"""

PROMPT = """Model a DJI Mavic Air 2 quadcopter drone. Use these REAL dimensions:

Body: 180mm long x 85mm wide x 48mm tall, 2mm wall thickness
Arms: 4x, each 140mm from pivot to motor, 20mm wide x 16mm tall, 2mm walls
  Front arms: 32deg from forward, Rear: 38deg from rear
Motors: 28mm OD mount plate, 5mm height, 22mm center bore, 3xM3 on 16mm bolt circle
  Bell: 24mm OD x 12mm, Magnet ring: 22mm OD / 18mm ID / 8mm
  Shaft: 5mm x 10mm
Propellers: 183mm diameter, 2 blades, hub 12mm OD
Battery bay: 110mm x 62mm x 30mm cutout in rear bottom
  Rail guides 4mm wide, 6 contacts at rear wall
PCB: 60mm x 40mm on 4x standoff posts (5mm OD, 6mm tall)
Camera/gimbal: Under front, 40mm x 30mm gimbal plate
  Camera body: 28mm x 22mm x 26mm, lens 16mm OD
Ports: USB-C 8.94mm x 3.26mm, microSD 12mm x 1.5mm (left side)
Sensors: Front 2x 10mm x 8mm, Bottom 12mm + 6mm, Rear 10mm
GPS: 22mm dia puck on top
Landing gear: 2x rear, strut 50mm x 10mm x 18mm, foot 54mm x 12mm x 4mm
Ventilation: 6 vent slots 2mm x 15mm on top
Antenna: 35mm x 16mm x 4mm housing on rear top

IMPORTANT:
- Declare ALL dimensions as named variables
- NO fillets or chamfers (they crash). Use only .box() and .circle().extrude()
- Use the EXACT patterns from the system prompt
- Model EVERY feature listed
- result = body_shell at the end"""


def run():
    subject_dir = os.path.join(OUTPUT_DIR, "drone")
    os.makedirs(subject_dir, exist_ok=True)

    print("Generating with Gemini 2.5 Pro (no fillets)...")
    start = time.time()
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={GOOGLE_AI_API_KEY}"
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": PROMPT}]}],
        "generationConfig": {"maxOutputTokens": 65536, "temperature": 0.3}
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

    # Clean
    import re
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
    mr = requests.post(MODAL_ENDPOINT, json={"code": code, "module_id": "v4-drone", "material_density": 1240.0}, timeout=300)
    print(f"  Modal: {time.time()-t:.1f}s")

    result = mr.json()
    if result.get("error"):
        print(f"  ERROR: {result['error'][:500]}")
        with open(os.path.join(subject_dir, "error.txt"), "w") as f:
            f.write(result["error"])
    else:
        for key in ["step", "stl", "svg_iso", "svg_top", "svg_front"]:
            d = result.get(key)
            if d:
                ext = {"step": "step", "stl": "stl", "svg_iso": "iso.svg", "svg_top": "top.svg", "svg_front": "front.svg"}[key]
                fp = os.path.join(subject_dir, f"drone.{ext}")
                with open(fp, "wb") as f:
                    f.write(base64.b64decode(d))
                print(f"  {key}: {len(base64.b64decode(d))/1024:.1f} KB")

        analysis = result.get("analysis")
        if analysis:
            mp = analysis.get("mass_properties", {})
            if mp and "error" not in mp:
                bb = mp.get("bounding_box", {})
                print(f"  Bbox: {bb.get('xLen',0):.0f} x {bb.get('yLen',0):.0f} x {bb.get('zLen',0):.0f} mm")
                vol = mp.get('volume_mm3', 0)
                bb_vol = bb.get('xLen',1) * bb.get('yLen',1) * bb.get('zLen',1)
                print(f"  Volume: {vol:.0f} mm3, Fill: {vol/bb_vol*100:.1f}%" if bb_vol > 0 else "")
                print(f"  Mass: {mp.get('mass_kg',0)*1000:.1f} g")


if __name__ == "__main__":
    if not GOOGLE_AI_API_KEY or not MODAL_ENDPOINT:
        print("Set GOOGLE_AI_API_KEY and MODAL_CAD_ENDPOINT_URL"); sys.exit(1)
    run()
