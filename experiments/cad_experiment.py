"""
CAD Generation Experiment: Minimal Prompt vs ForgeOS Pipeline
=============================================================

This script replicates what the Claude app does:
1. Send a simple, unencumbered prompt to Claude
2. Get CadQuery code back
3. Execute it on Modal
4. Save the output files

The hypothesis: Claude produces BETTER CadQuery when given
fewer constraints, not more.
"""

import anthropic
import requests
import base64
import json
import os
import sys
import time

# ─── Configuration ─────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODAL_ENDPOINT = os.environ.get("MODAL_CAD_ENDPOINT_URL")

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── The Simple Prompt (like the Claude app) ───────────────────────

SYSTEM_PROMPT = """You are an expert mechanical engineer and CadQuery programmer.
When asked to model something, write complete, working CadQuery Python code.

Rules:
- Use `import cadquery as cq` and `import math` only.
- Do NOT use `import os`, `open()`, `print()`, or any file I/O.
- Assign the final assembled model to a variable called `result`.
- The code will be executed in a sandboxed environment that handles file export.
- Focus entirely on making the model detailed and geometrically accurate.
- Use real-world dimensions in millimeters.

CRITICAL CadQuery technique — union reliability:
- Build ALL geometry at its FINAL position. Do NOT create at origin then translate/rotate.
- Use `.workplane(offset=z).transformed(offset=(x, y, 0))` to position geometry directly.
- This ensures solid overlaps for reliable `.union()` operations.
- Bad: `arm = cq.Workplane("XY").box(...).translate((x, y, 0)); body = body.union(arm)`
- Good: `arm = cq.Workplane("XY").workplane(offset=z).transformed(offset=(cx, cy, 0), rotate=(0, 0, angle)).box(...); body = body.union(arm)`
- Accumulate ALL geometry into a single variable using .union() and .cut() incrementally.
"""


def generate_cadquery_code(subject: str, model: str = "claude-sonnet-4-20250514") -> str:
    """
    Call Claude with a minimal prompt and get CadQuery code back.
    This mimics what the Claude app does — just ask, get code.
    """
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    user_prompt = f"""Create a detailed, manufacturing-ready CadQuery model of: {subject}

Make it as detailed and realistic as possible with proper engineering features:
- Real-world dimensions
- Shell/hollow bodies where appropriate
- Internal structure (ribs, bosses, mounting points)
- Surface details (ports, vents, buttons, displays)
- Proper fillets and chamfers

Write the complete Python code. Assign the final model to `result`."""

    print(f"\n{'='*60}")
    print(f"Generating CadQuery code for: {subject}")
    print(f"Model: {model}")
    print(f"{'='*60}\n")

    start = time.time()

    # Use streaming to support Opus (which can take >10 min)
    full_text = ""
    input_tokens = 0
    output_tokens = 0

    # Enable extended thinking for Opus models (this is what the Claude app does)
    use_thinking = "opus" in model.lower()
    
    kwargs = dict(
        model=model,
        max_tokens=16000,
        messages=[{"role": "user", "content": user_prompt}],
    )
    
    if use_thinking:
        # Extended thinking requires temperature=1 and uses budget_tokens
        # High budget lets the model plan extensively (like the Claude app does)
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": 16000}
        kwargs["max_tokens"] = 32000
        kwargs["temperature"] = 1
        # System prompt goes in messages for thinking models
        kwargs["messages"] = [
            {"role": "user", "content": SYSTEM_PROMPT + "\n\n" + user_prompt}
        ]
    else:
        kwargs["system"] = SYSTEM_PROMPT

    with client.messages.stream(**kwargs) as stream:
        for event in stream:
            pass  # Just consume the stream
        response = stream.get_final_message()

    elapsed = time.time() - start
    print(f"Claude responded in {elapsed:.1f}s")

    # Extract code from response (skip thinking blocks)
    full_text = ""
    for block in response.content:
        if hasattr(block, "text"):
            full_text = block.text
            break
    
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens

    # Try to extract code block
    if "```python" in full_text:
        code = full_text.split("```python")[1].split("```")[0].strip()
    elif "```" in full_text:
        code = full_text.split("```")[1].split("```")[0].strip()
    else:
        code = full_text.strip()

    lines = code.strip().split("\n")
    print(f"Generated {len(lines)} lines of CadQuery code")
    print(f"Tokens used: {input_tokens} in / {output_tokens} out")

    return code


def execute_on_modal(code: str, subject_slug: str) -> dict:
    """
    Send CadQuery code to Modal for execution.
    Returns the result dict with base64-encoded files.
    """
    print(f"\nSending to Modal for execution...")
    start = time.time()

    response = requests.post(
        MODAL_ENDPOINT,
        json={
            "code": code,
            "module_id": f"experiment-{subject_slug}",
            "material_density": 1240.0,
        },
        timeout=180,
    )

    elapsed = time.time() - start
    print(f"Modal responded in {elapsed:.1f}s")

    if response.status_code != 200:
        print(f"ERROR: Modal returned status {response.status_code}")
        print(response.text[:500])
        return {"error": f"HTTP {response.status_code}"}

    return response.json()


def save_outputs(result: dict, subject_slug: str, code: str) -> None:
    """Save all output files to disk."""
    subject_dir = os.path.join(OUTPUT_DIR, subject_slug)
    os.makedirs(subject_dir, exist_ok=True)

    # Save the generated code
    code_path = os.path.join(subject_dir, f"{subject_slug}.py")
    with open(code_path, "w") as f:
        f.write(code)
    print(f"\n  Code saved: {code_path}")

    if result.get("error"):
        error_path = os.path.join(subject_dir, "error.txt")
        with open(error_path, "w") as f:
            f.write(result["error"])
        print(f"  ERROR: {result['error'][:200]}")
        return

    # Save binary files
    file_map = {
        "step": f"{subject_slug}.step",
        "stl": f"{subject_slug}.stl",
        "svg_iso": f"{subject_slug}_iso.svg",
        "svg_top": f"{subject_slug}_top.svg",
        "svg_front": f"{subject_slug}_front.svg",
        "svg_right": f"{subject_slug}_right.svg",
        "svg_exploded": f"{subject_slug}_exploded.svg",
    }

    for key, filename in file_map.items():
        data = result.get(key)
        if data:
            filepath = os.path.join(subject_dir, filename)
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(data))
            size_kb = len(base64.b64decode(data)) / 1024
            print(f"  {key}: {filename} ({size_kb:.1f} KB)")
        else:
            print(f"  {key}: not generated")

    # Save analysis
    analysis = result.get("analysis")
    if analysis:
        analysis_path = os.path.join(subject_dir, "analysis.json")
        with open(analysis_path, "w") as f:
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


def run_experiment(subject: str, subject_slug: str, model: str = "claude-sonnet-4-20250514"):
    """Run the full experiment for a single subject."""
    # Step 1: Generate code with minimal prompt
    code = generate_cadquery_code(subject, model)

    # Step 2: Execute on Modal
    result = execute_on_modal(code, subject_slug)

    # Step 3: Save outputs
    save_outputs(result, subject_slug, code)

    print(f"\n{'='*60}")
    print(f"Experiment complete: {subject_slug}")
    print(f"Output dir: {os.path.join(OUTPUT_DIR, subject_slug)}")
    print(f"{'='*60}\n")

    return result


# ─── Main ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not ANTHROPIC_API_KEY:
        print("ERROR: Set ANTHROPIC_API_KEY environment variable")
        sys.exit(1)
    if not MODAL_ENDPOINT:
        print("ERROR: Set MODAL_CAD_ENDPOINT_URL environment variable")
        sys.exit(1)

    # Parse command line
    subjects = {
        "drone": """A manufacturing-ready DJI Mavic-class quadcopter drone in CadQuery.

I want an EXTREMELY detailed model — 500+ lines of CadQuery code minimum. Include ALL of these features:
- Shell body with 2mm wall thickness and internal structural ribbing  
- 4 folding arms (hollow, with wire routing channels inside)
- Motor mounts at arm tips with M3 bolt circle patterns
- Motor bells (outer rotor representation) with magnet ring
- Propeller hubs with shaft bore and realistic 2-blade geometry
- Camera gimbal: vibration damper mounts, yaw ring, pitch arms, camera body, lens barrel
- Battery bay with slide rails, latch mechanism, and electrical contacts
- PCB mounting posts with standoffs and M2.5 screw holes
- 8 screw bosses for shell assembly
- Ventilation grilles (cutout slots on top surface)
- USB-C port and micro SD card slot cutouts
- Front stereo obstacle avoidance sensor recesses
- Bottom downward vision sensor and ToF sensor
- Rear obstacle avoidance sensor
- GPS puck recess on top surface
- Antenna housing (rear top, hollow cavity)
- Landing gear with lightening slots and rubber foot pads
- Prop guard mounting bosses
- Status LED bar channels (front and rear)
- ESC mounting bays inside each arm

Use parameterized dimensions (declare all measurements as variables at the top).
Build everything into a single `body_shell` variable using union/cut operations.
Assign: result = body_shell""",

        "phone": """A manufacturing-ready iPhone 16 Pro smartphone in CadQuery.

I want an EXTREMELY detailed model — 500+ lines of CadQuery code minimum. Include ALL of these features:
- Main chassis: 146.6 x 71.5 x 8.25mm titanium-grade shell with 2mm walls
- Display bezel with 0.5mm raised lip and rounded corners (6.3mm radius)
- Rear camera module: 3 lenses (48mm main, 12mm ultrawide, 12mm telephoto) with sapphire rings
- LiDAR scanner dot
- LED flash module
- Side buttons: volume up/down (left), action button (left), power button (right)
- SIM tray slot (left side) with ejection pin hole
- Lightning/USB-C port opening (bottom center)
- Speaker grille holes (bottom, 6 holes each side of port)
- Microphone holes (bottom, top)
- Front camera / Face ID sensor array cutout (Dynamic Island pill shape)
- Rear glass panel with subtle camera bump platform
- Antenna band lines (subtle grooves around edges)
- Mute switch / action button recess

Use parameterized dimensions. Build into a single variable. Assign: result = phone_body""",
    }

    target = sys.argv[1] if len(sys.argv) > 1 else "drone"
    model = sys.argv[2] if len(sys.argv) > 2 else "claude-sonnet-4-20250514"

    if target == "all":
        for slug, desc in subjects.items():
            run_experiment(desc, slug, model)
    elif target in subjects:
        run_experiment(subjects[target], target, model)
    else:
        print(f"Unknown subject: {target}")
        print(f"Available: {', '.join(subjects.keys())}, all")
        sys.exit(1)
