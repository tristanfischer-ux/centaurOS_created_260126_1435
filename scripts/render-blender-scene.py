#!/usr/bin/env python3
"""render-blender-scene.py — dispatch a per-class Blender template.

For a given state.json, looks up the product_class, finds the matching
hand-coded template under scripts/blender-templates/, and invokes Blender
once. The template's run_render_pipeline produces all images (00-hero.png
+ module-<id>.png per module) in one Blender call (~13 s for BESS).

This is the May 17 quality bar restored (drawer
forgeos_decisions_3f18c3cae92fe29e). Replaces the per-module loop in
generate-module-images.tsx when a template exists for the class.

Usage:
  python3 scripts/render-blender-scene.py \\
      --state /tmp/<run>/state.json \\
      --out-dir /tmp/<run>

Exit codes:
  0  success — all expected PNGs present at out_dir
  5  no template for this product_class (caller should fall back)
  6  template found but Blender failed to render
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = REPO_ROOT / "scripts" / "blender-templates"
BLENDER_BIN = os.environ.get(
    "BLENDER_BIN", "/Applications/Blender.app/Contents/MacOS/Blender"
)

# product_class → template filename. Substring match: any product_class
# CONTAINING the key uses the matching template. Order doesn't matter for
# correctness because keys don't overlap, but list shorter keys last so
# longer specific matches win (e.g. "bess-utility-scale" → bess).
CLASS_TO_TEMPLATE: dict[str, str] = {
    # BESS — chain classifier emits "energy_storage" as the primary slug
    "energy_storage": "bess-9shot.py",
    "battery_energy_storage": "bess-9shot.py",
    "bess": "bess-9shot.py",
    # Bioreactor
    "bioreactor": "bioreactor-9shot.py",
    # Drone
    "drone": "drone-9shot.py",
    "consumer_cinematography_drone": "drone-9shot.py",
    # AUV
    "auv": "auv-9shot.py",
    "autonomous_underwater": "auv-9shot.py",
    # CGM / wearable
    "cgm": "cgm-9shot.py",
    "wearable_medical_device": "cgm-9shot.py",
    # Edge-AI
    "edge_ai": "edge-ai-9shot.py",
    "edge-ai": "edge-ai-9shot.py",
    # EV charger
    "ev_charger": "ev-charger-9shot.py",
    "ev-charger": "ev-charger-9shot.py",
    "dc_fast_ev_charger": "ev-charger-9shot.py",
}


def resolve_template(product_class: str) -> Path | None:
    pc = product_class.lower().strip()
    for key, fname in CLASS_TO_TEMPLATE.items():
        if key in pc:
            tpl = TEMPLATES_DIR / fname
            if tpl.exists():
                return tpl
    return None


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--state", required=True, help="absolute path to state.json")
    p.add_argument("--out-dir", required=True, help="directory to write images into")
    args = p.parse_args()

    state_path = Path(args.state).resolve()
    out_dir = Path(args.out_dir).resolve()

    if not state_path.exists():
        print(f"[render-scene] FATAL: state not found: {state_path}", file=sys.stderr)
        return 1

    state = json.loads(state_path.read_text())
    product_class = str(
        state.get("moduleDecomposition", {}).get("product_class")
        or state.get("parsedBrief", {}).get("product_class")
        or ""
    )
    if not product_class:
        print("[render-scene] FATAL: state has no product_class", file=sys.stderr)
        return 1

    template = resolve_template(product_class)
    if template is None:
        print(
            f"[render-scene] no template for product_class={product_class!r}; "
            f"caller should fall back to the universal renderer",
            file=sys.stderr,
        )
        return 5

    out_dir.mkdir(parents=True, exist_ok=True)
    if not Path(BLENDER_BIN).exists():
        print(f"[render-scene] FATAL: Blender binary missing at {BLENDER_BIN}", file=sys.stderr)
        return 1

    env = os.environ.copy()
    env["BLENDER_OUT_DIR"] = str(out_dir)

    print(
        f"[render-scene] product_class={product_class} → template={template.name}, "
        f"out={out_dir}",
        flush=True,
    )
    try:
        subprocess.run(
            [BLENDER_BIN, "--background", "--python", str(template)],
            env=env,
            check=True,
            timeout=300,
        )
    except subprocess.CalledProcessError as e:
        print(f"[render-scene] FATAL: Blender exited {e.returncode}", file=sys.stderr)
        return 6
    except subprocess.TimeoutExpired:
        print("[render-scene] FATAL: Blender render timed out", file=sys.stderr)
        return 6

    # Verify outputs. Template MUST produce 00-hero.png + at least one module-*.png.
    hero = out_dir / "00-hero.png"
    modules = sorted(out_dir.glob("module-*.png"))
    if not hero.exists() or not modules:
        print(
            f"[render-scene] FATAL: template ran but expected outputs missing "
            f"(hero={hero.exists()}, modules={len(modules)})",
            file=sys.stderr,
        )
        return 6

    # Mirror 00-hero.png to blender-cover.png so the existing Gemini i2i
    # cover step uses the engineering-correct geometry as input rather than
    # the legacy cube-grid blender-cover.png. Renderer/chain reads
    # state.blender_cover_image_path which points to <out>/blender-cover.png.
    blender_cover = out_dir / "blender-cover.png"
    blender_cover.write_bytes(hero.read_bytes())

    print(
        f"[render-scene] OK — {len(modules)} module pages + hero "
        f"({hero.stat().st_size // 1024} KB) at {out_dir}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
