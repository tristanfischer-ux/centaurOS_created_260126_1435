"""
CAD Generation Experiment V2: Research-Informed, Maximum Detail
==============================================================

Replicates what the Claude app does:
1. Web research provides real product specs
2. Specs are fed as context to Claude  
3. Claude writes maximum-detail CadQuery code
4. Code executes on Modal

Key changes from v1:
- Research data baked into prompt (real dimensions)
- NO extended thinking (full 32k tokens for code output)
- Explicit: write LINEAR code, no functions, max sub-components
- CadQuery positioning technique included
"""

import requests
import base64
import json
import os
import sys
import time

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY")
MODAL_ENDPOINT = os.environ.get("MODAL_CAD_ENDPOINT_URL")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

# ─── Research Data (from web search) ──────────────────────────────

DJI_MAVIC_RESEARCH = """
=== DJI Mavic Air 2 — Real Specifications (from web research) ===

OVERALL DIMENSIONS:
- Folded: 180 × 97 × 84 mm (L×W×H)
- Unfolded: 183 × 253 × 77 mm (L×W×H)  
- Diagonal distance (motor to motor): 302 mm
- Weight: 570 g total

BODY SHELL:
- Main body approximately 180mm long × 85mm wide × 48mm tall
- Streamlined shape with aerodynamic dome on top rear
- Shell wall thickness: ~2mm injection-molded polycarbonate
- Internal structural ribbing (longitudinal + 3 cross ribs)
- 8 screw bosses (M2.5 self-tap) for top/bottom shell assembly

FOLDING ARMS (4x):
- Each arm ~140mm from pivot to motor center
- Arm cross-section: ~20mm wide × 16mm tall  
- Hollow with 2mm walls for weight reduction
- Internal wire routing channel (~6mm diameter) for motor power cables
- Front arms angle ~32° from centerline, rear arms ~38°
- Spring-loaded folding hinge at root

MOTORS (4x brushless outrunners):
- Motor mount outer diameter: ~28mm
- Stator bore: ~22mm
- Motor mount height: 5mm platform
- 3 mounting screws per motor on bolt circle (3x M3, 16mm bolt circle dia)
- Motor bell (outer rotor): ~24mm OD × 12mm height
- Permanent magnet ring inside bell: 22mm OD, 18mm ID, 8mm height
- Motor shaft: 5mm diameter × 10mm protrusion above bell

ESC (Electronic Speed Controller, 4x in arms):
- Small PCB: ~30mm × 15mm × 5mm
- Mounted inside arm, ~35mm from body center along arm

PROPELLERS (4x, model 7238F):
- Diameter: 183mm (7.2 inches) tip-to-tip
- 2 blades per propeller
- Hub: 12mm OD, 5.2mm shaft bore, 6mm height
- Blade root chord: ~18mm, tip chord: ~8mm
- Blade thickness: ~2.5mm
- Material: Nylon + glass fiber

CAMERA / GIMBAL SYSTEM:
- 3-axis gimbal (tilt/roll/pan)
- Gimbal mounting plate: 40mm × 30mm × 3mm
- 4x vibration damper mounts (rubber grommets): 8mm OD, 4mm ID, 6mm height
- Yaw motor ring: 20mm OD × 6mm height
- Pitch arms (pair): 15mm × 6mm × 4mm
- Camera body: 28mm × 22mm × 26mm
- Lens barrel: 16mm OD, 12mm lens element, 10mm depth
- Camera sensor: 1/2" CMOS (actual physical size ~6.4mm × 4.8mm)

BATTERY BAY:
- Battery pack: ~110mm × 62mm × 30mm
- 3S LiPo, 3500mAh, 198g
- Slide-in from rear with rail guides (4mm wide rails on each side)
- Mechanical latch: 16mm × 8mm × 6mm at front of bay
- 6 electrical contacts (4mm × 8mm each, 8mm spacing) at rear wall
- Bay wall thickness: 1.5mm

PCB / FLIGHT CONTROLLER:
- Main PCB: ~60mm × 40mm
- 4 mounting posts (5mm OD, M2.5 holes, 6mm standoff height)

PORTS & CUTOUTS:
- USB-C port: 8.94mm × 3.26mm opening (left side)
- microSD card slot: ~12mm × 1.5mm opening (left side)
- Status LED bar: 30mm × 3mm (front face)
- Rear LED indicators: 2x 8mm × 3mm (rear face)

SENSORS:
- Front stereo obstacle avoidance: 2 recesses, 10mm × 8mm each, 26mm apart
- Bottom downward vision: 12mm diameter circular
- Bottom ToF sensor: 6mm diameter  
- Rear obstacle avoidance: 10mm diameter circular

GPS:
- GPS puck: 22mm diameter × 5mm height
- Recessed into top surface: 24mm recess × 3mm depth

ANTENNA:
- RF antenna housing: 35mm × 16mm × 4mm
- Hollow cavity (1.5mm walls), mounted on rear top of body

LANDING GEAR (2x skid-style):
- Main strut: 50mm length × 10mm wide × 18mm tall
- Weight-saving lightening slot in center
- Foot pad: 54mm × 12mm × 4mm with 2mm rubber layer
- Fillet radius: 3mm

PROP GUARD MOUNT BOSSES (4x, on each motor mount):
- 6mm OD, 2mm ID hole, 5mm height

VENTILATION:
- Top surface: 6 vent slots, each 2mm × 15mm, spaced 4mm apart

TOLERANCES:
- Press fit: 0.05mm
- Clearance fit: 0.15mm
- Loose fit: 0.3mm
"""

IPHONE_RESEARCH = """
=== iPhone 16 Pro — Real Specifications (from web research) ===

OVERALL DIMENSIONS:
- Height: 149.6 mm
- Width: 71.5 mm
- Depth: 8.25 mm
- Weight: 199 g
- Corner radius: 6.3mm (display corners)

CHASSIS:
- Grade 5 Titanium frame (side band)
- Titanium band width: ~8.25mm (full depth), ~2mm thick
- Internal aluminum subframe
- Shell wall thickness: ~1.5mm
- Flat edges (not rounded like older iPhones)

DISPLAY (FRONT):
- 6.3" Super Retina XDR OLED
- Display glass: Ceramic Shield front
- Bezel: ~1.7mm uniform around display
- Raised lip: ~0.3mm above frame for screen protection
- Dynamic Island: pill-shaped cutout, ~36mm × 11mm, centered at top

REAR GLASS:
- Textured matte glass (color-infused)
- Camera bump platform: ~38mm × 38mm, 1.2mm raised, corner radius ~12mm
- MagSafe ring (internal, centered): ~56mm diameter

CAMERA MODULE (rear, on bump platform):
- 3 camera lenses arranged in triangle pattern:
  - Main (48MP): lens ring 16mm OD, 14mm glass, centered at top-left of triangle
  - Ultra Wide (12MP): lens ring 12mm OD, 10mm glass, bottom-left
  - Telephoto (12MP): lens ring 12mm OD, 10mm glass, top-right
- Lens protrusion: ~3.5mm above rear glass
- Sapphire crystal lens covers
- LiDAR scanner: 4mm diameter dot, positioned between lenses
- LED flash: 6mm × 4mm module, positioned between lenses
- Microphone hole: 1mm pinhole near flash

SIDE BUTTONS (LEFT):
- Action button: 10mm × 3mm, ~35mm from top
- Volume Up: 12mm × 3mm, ~52mm from top  
- Volume Down: 12mm × 3mm, ~66mm from top
- Button recess depth: ~0.5mm, edge radius: 1mm
- SIM tray: 18mm × 2mm slot, ~90mm from top, with 0.8mm ejection pin hole

SIDE BUTTONS (RIGHT):
- Power/Side button: 18mm × 3mm, ~55mm from top
- mmWave 5G window (US models): ~12mm × 3mm cutout

BOTTOM EDGE:
- USB-C port: 8.94mm × 3.26mm opening, centered
- Speaker grille: 6 holes on each side of USB-C port
  - Hole diameter: 1mm, spacing: 1.6mm center-to-center
- Microphone: 1mm pinhole between speaker and USB-C

TOP EDGE:
- Microphone: 1mm pinhole, centered

ANTENNA BANDS:
- Subtle grooves (~0.3mm wide × 0.2mm deep) around edges
- Positions: 2 on top edge, 2 on bottom edge, 1 each on left/right sides
"""


SYSTEM_PROMPT = """You are an expert mechanical engineer and CadQuery programmer creating manufacturing-ready CAD models.

CRITICAL RULES:
1. Use ONLY `import cadquery as cq` and `import math`. No other imports.
2. Do NOT use `import os`, `open()`, `print()`, or any file I/O.
3. Write ALL code as LINEAR top-level statements. Do NOT use functions or classes.
4. Build ALL geometry into a SINGLE accumulator variable using .union() and .cut().
5. Every feature should have MAXIMUM sub-component detail (fillets, chamfers, hollow interiors, mounting holes, etc.)
6. Declare ALL dimensions as named parameters at the top of the file.

CRITICAL CadQuery TECHNIQUE for reliable geometry:
- Build ALL geometry at its FINAL POSITION. Do NOT create at origin then translate/rotate.
- Use: `.workplane(offset=z).transformed(offset=(x, y, 0))` to position geometry.
- For angled parts: `.transformed(offset=(x, y, 0), rotate=(0, 0, angle))`
- Each feature: create solid → union to main body, then create cutout → cut from main body.
- For hollow shells: create outer solid, create inner solid (slightly smaller), cut inner from outer.
  Do NOT use .shell() as it is unreliable. Instead manually subtract an inner box/cylinder.

TARGET: 800-1000+ lines of CadQuery code. Every feature from the spec sheet must be modeled
with maximum sub-component detail. More geometry = better."""


def generate_code_anthropic(system_prompt: str, user_prompt: str, model: str):
    """Generate code using Anthropic API."""
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    
    with client.messages.stream(
        model=model,
        max_tokens=16000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        for event in stream:
            pass
        response = stream.get_final_message()

    full_text = ""
    for block in response.content:
        if hasattr(block, "text"):
            full_text = block.text
            break
    
    tokens_in = response.usage.input_tokens
    tokens_out = response.usage.output_tokens
    return full_text, tokens_in, tokens_out


def generate_code_gemini(system_prompt: str, user_prompt: str, model: str):
    """Generate code using Google Gemini API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GOOGLE_AI_API_KEY}"
    
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 65536,
            "temperature": 0.7,
        }
    }
    
    resp = requests.post(url, json=payload, timeout=600)
    resp.raise_for_status()
    data = resp.json()
    
    full_text = data["candidates"][0]["content"]["parts"][0]["text"]
    usage = data.get("usageMetadata", {})
    tokens_in = usage.get("promptTokenCount", 0)
    tokens_out = usage.get("candidatesTokenCount", 0)
    return full_text, tokens_in, tokens_out


def generate_and_run(subject_name: str, research_data: str, result_var: str, model: str):
    """Generate CadQuery code with research context and run on Modal."""
    subject_dir = os.path.join(OUTPUT_DIR, subject_name)
    os.makedirs(subject_dir, exist_ok=True)

    user_prompt = f"""{research_data}

Using the EXACT dimensions from the research above, create a complete CadQuery model.

Rules:
- Declare every dimension as a named parameter at the top
- Write LINEAR code (no functions, no classes) — every line builds geometry directly
- Build everything into `{result_var}` using .union() and .cut()
- At the end, write: result = {result_var}
- Model EVERY feature listed in the research with full sub-component detail
- Use .workplane(offset=z).transformed(offset=(x, y, 0)) for ALL positioning
- For hollow bodies: create outer shape, create inner shape, cut inner from outer (do NOT use .shell())
- Add fillets/chamfers to ALL visible edges where physically appropriate
- Target 800-1000+ lines of detailed CadQuery code"""

    print(f"\n{'='*60}")
    print(f"Generating: {subject_name} (model: {model})")
    print(f"{'='*60}\n")

    start = time.time()

    # Pick API based on model name
    is_gemini = "gemini" in model.lower()
    if is_gemini:
        full_text, tokens_in, tokens_out = generate_code_gemini(SYSTEM_PROMPT, user_prompt, model)
    else:
        full_text, tokens_in, tokens_out = generate_code_anthropic(SYSTEM_PROMPT, user_prompt, model)

    elapsed = time.time() - start

    # Extract code from response
    if "```python" in full_text:
        code = full_text.split("```python")[1].split("```")[0].strip()
    elif "```" in full_text:
        code = full_text.split("```")[1].split("```")[0].strip()
    else:
        code = full_text.strip()

    # Strip any forbidden patterns that might appear in comments
    import re
    cleaned_lines = []
    for line in code.split("\n"):
        stripped = line.strip()
        # Skip lines that are pure comments containing forbidden patterns
        if stripped.startswith("#") and any(p in stripped for p in ["import os", "open(", "print("]):
            continue
        # Skip actual forbidden imports/calls
        if stripped.startswith("import os") or stripped.startswith("from os"):
            continue
        if re.match(r'^print\s*\(', stripped):
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
    modal_response = requests.post(
        MODAL_ENDPOINT,
        json={"code": code, "module_id": f"v2-{subject_name}", "material_density": 1240.0},
        timeout=300,
    )
    modal_elapsed = time.time() - modal_start
    print(f"Modal responded in {modal_elapsed:.1f}s")

    result = modal_response.json()

    if result.get("error"):
        print(f"\nERROR: {result['error'][:500]}")
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
            data = result.get(key)
            if data:
                filepath = os.path.join(subject_dir, filename)
                with open(filepath, "wb") as f:
                    f.write(base64.b64decode(data))
                size_kb = len(base64.b64decode(data)) / 1024
                print(f"  {key}: {filename} ({size_kb:.1f} KB)")

        analysis = result.get("analysis")
        if analysis:
            with open(os.path.join(subject_dir, "analysis.json"), "w") as f:
                json.dump(analysis, f, indent=2)
            mp = analysis.get("mass_properties", {})
            if mp and "error" not in mp:
                print(f"\n  Mass: {mp.get('mass_kg', 0)*1000:.1f} g")
                print(f"  Volume: {mp.get('volume_mm3', 0):.0f} mm³")
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
    if not MODAL_ENDPOINT:
        print("ERROR: Set MODAL_CAD_ENDPOINT_URL"); sys.exit(1)

    target = sys.argv[1] if len(sys.argv) > 1 else "drone"
    model = sys.argv[2] if len(sys.argv) > 2 else "gemini-2.5-pro"
    
    is_gemini = "gemini" in model.lower()
    if is_gemini and not GOOGLE_AI_API_KEY:
        print("ERROR: Set GOOGLE_AI_API_KEY"); sys.exit(1)
    if not is_gemini and not ANTHROPIC_API_KEY:
        print("ERROR: Set ANTHROPIC_API_KEY"); sys.exit(1)

    subjects = {
        "drone": (DJI_MAVIC_RESEARCH, "body_shell"),
        "phone": (IPHONE_RESEARCH, "phone_body"),
    }

    if target == "all":
        for name, (research, var) in subjects.items():
            generate_and_run(name, research, var, model)
    elif target in subjects:
        research, var = subjects[target]
        generate_and_run(target, research, var, model)
    else:
        print(f"Unknown: {target}. Available: {', '.join(subjects.keys())}, all")
