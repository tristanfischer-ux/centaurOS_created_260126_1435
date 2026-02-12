"""
Run the KNOWN-WORKING drone_v2.py through Modal.
Manually strips the export section and forbidden imports.
"""

import requests
import base64
import json
import os
import time

MODAL_ENDPOINT = os.environ.get("MODAL_CAD_ENDPOINT_URL")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output", "reference")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Read the reference drone code
ref_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "drone_output", "drone_v2.py")
with open(ref_path, "r") as f:
    lines = f.readlines()

# Keep lines 1-914 (all geometry), skip the rest (export section)
# Also filter out forbidden patterns line-by-line
cleaned_lines = []
skip_patterns = [
    "import os",
    "OUTPUT_DIR = ",
    "print(",
]

for i, line in enumerate(lines):
    # Stop before the export section (line 917 onwards: "# 16. FINAL ASSEMBLY EXPORT")
    if i >= 916:  # 0-indexed, so line 917 = index 916
        break
    
    # Skip forbidden lines
    stripped = line.strip()
    if any(stripped.startswith(p) for p in skip_patterns):
        continue
    
    cleaned_lines.append(line)

# Add result assignment
cleaned_lines.append("\n# Assign for Modal export wrapper\n")
cleaned_lines.append("result = body_shell\n")

code = "".join(cleaned_lines)
print(f"Cleaned code: {len(code.splitlines())} lines")

# Save cleaned code
with open(os.path.join(OUTPUT_DIR, "drone_v2_cleaned.py"), "w") as f:
    f.write(code)

# Send to Modal
print(f"\nSending to Modal...")
start = time.time()
response = requests.post(
    MODAL_ENDPOINT,
    json={"code": code, "module_id": "reference-drone-v2", "material_density": 1240.0},
    timeout=180,
)
elapsed = time.time() - start
print(f"Modal responded in {elapsed:.1f}s")

result = response.json()

if result.get("error"):
    print(f"\nERROR: {result['error'][:1000]}")
    with open(os.path.join(OUTPUT_DIR, "error.txt"), "w") as f:
        f.write(result["error"])
else:
    # Save files
    file_map = {
        "step": "reference_drone.step",
        "stl": "reference_drone.stl",
        "svg_iso": "reference_drone_iso.svg",
        "svg_top": "reference_drone_top.svg",
        "svg_front": "reference_drone_front.svg",
        "svg_right": "reference_drone_right.svg",
    }
    for key, filename in file_map.items():
        data = result.get(key)
        if data:
            filepath = os.path.join(OUTPUT_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(data))
            size_kb = len(base64.b64decode(data)) / 1024
            print(f"  {key}: {filename} ({size_kb:.1f} KB)")

    analysis = result.get("analysis")
    if analysis:
        with open(os.path.join(OUTPUT_DIR, "analysis.json"), "w") as f:
            json.dump(analysis, f, indent=2)
        mp = analysis.get("mass_properties", {})
        if mp and "error" not in mp:
            print(f"\n  Mass: {mp.get('mass_kg', 0)*1000:.1f} g")
            print(f"  Volume: {mp.get('volume_mm3', 0):.0f} mm³")
            bb = mp.get("bounding_box", {})
            if bb:
                print(f"  Bounding box: {bb.get('xLen',0):.0f} x {bb.get('yLen',0):.0f} x {bb.get('zLen',0):.0f} mm")
                bb_vol = bb.get('xLen',1) * bb.get('yLen',1) * bb.get('zLen',1)
                if bb_vol > 0:
                    fill = mp.get('volume_mm3', 0) / bb_vol * 100
                    print(f"  Fill ratio: {fill:.1f}%")

print("\nDone.")
