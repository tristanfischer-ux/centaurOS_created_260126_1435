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

CONTAINERISED ROUTING (Tristan 2026-07-03): a design whose brief/contract carries a
container/enclosure signal (long-thin max_dimensions_mm envelope, aspect >= 2.2, or a
contract container_payload_rating_kg — the SAME detection build_universal_scene.py
main() uses; a signal, never a class table) renders via the UNIVERSAL deterministic
builder, which assembles the container shell + interior. The LLM-generated bespoke
template (geom-gen, non-deterministic — it shipped BESS as an exploded view its own
shadow critic passed) is bypassed for these designs.
Kill-switch: UNIVERSAL_CONTAINERISED=0 (default ON) restores the bespoke/template path.

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
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))
from blender_out_lock import blender_out_dir_lock  # noqa: E402
from render_view_contract import is_product_scale, required_views  # noqa: E402

# Plant-scale bespoke templates that must NEVER render a benchtop lab instrument. The
# "bioreactor" key is a 200 L single-use skid; it wrongly substring-matches the benchtop
# `benchtop_bioreactor` class → an opaque vessel-on-a-box with no cut-away and no
# parts-manifest (so the spatial drawings are skipped). A product-scale design whose only
# template match is one of these routes to the UNIVERSAL builder instead, which renders
# sealed-enclosure instruments WITH a cut-away hero + a full parts-manifest for the drawings.
_PLANT_TEMPLATES_WRONG_FOR_BENCHTOP = {"bioreactor-9shot.py"}

# product_class → template filename. Substring match: any product_class
# CONTAINING the key uses the matching template. Order doesn't matter for
# correctness because keys don't overlap, but list shorter keys last so
# longer specific matches win (e.g. "bess-utility-scale" → bess).
CLASS_TO_TEMPLATE: dict[str, str] = {
    # Original 7 templates (May 17 ported 2026-05-24)
    "energy_storage": "bess-9shot.py",
    "battery_energy_storage": "bess-9shot.py",
    "bess": "bess-9shot.py",
    "bioreactor": "bioreactor-9shot.py",
    "drone": "drone-9shot.py",
    "consumer_cinematography_drone": "drone-9shot.py",
    "auv": "auv-9shot.py",
    "autonomous_underwater": "auv-9shot.py",
    "cgm": "cgm-9shot.py",
    "wearable_medical_device": "cgm-9shot.py",
    "edge_ai": "edge-ai-9shot.py",
    "edge-ai": "edge-ai-9shot.py",
    "ev_charger": "ev-charger-9shot.py",
    "ev-charger": "ev-charger-9shot.py",
    "dc_fast_ev_charger": "ev-charger-9shot.py",
    # Phase 1 stage-gate templates (bootstrapped via GPT-5.5, 2026-05-24)
    "heat_pump": "heat-pump-residential-9shot.py",
    "heat-pump": "heat-pump-residential-9shot.py",
    "heat_pump_residential": "heat-pump-residential-9shot.py",
    "heatpump": "heat-pump-residential-9shot.py",
    "mini_split_heatpump": "heat-pump-residential-9shot.py",
    "vertical_farm": "vertical-farm-9shot.py",
    "vertical-farm": "vertical-farm-9shot.py",
    "haps": "haps-9shot.py",
    "high_altitude_pseudo_satellite": "haps-9shot.py",
    # Phase 2 renewables (bootstrapped via GPT-5.5, 2026-05-24)
    "bess_utility_scale": "bess-utility-scale-9shot.py",
    "bess-utility-scale": "bess-utility-scale-9shot.py",
    "pv_string_inverter": "pv-string-inverter-9shot.py",
    "pv-string-inverter": "pv-string-inverter-9shot.py",
    "pv_module_residential": "pv-module-residential-9shot.py",
    "pv-module-residential": "pv-module-residential-9shot.py",
    "pv_module": "pv-module-residential-9shot.py",
    "wind_turbine_small": "wind-turbine-small-9shot.py",
    "wind-turbine-small": "wind-turbine-small-9shot.py",
    "wind_turbine": "wind-turbine-small-9shot.py",
    "fuel_cell_power_module": "fuel-cell-power-module-9shot.py",
    "fuel-cell-power-module": "fuel-cell-power-module-9shot.py",
    "fuel_cell": "fuel-cell-power-module-9shot.py",
    "hydrogen_electrolyser": "hydrogen-electrolyser-9shot.py",
    "hydrogen-electrolyser": "hydrogen-electrolyser-9shot.py",
    "h2_electrolyser": "hydrogen-electrolyser-9shot.py",
    # CO2 capture + mineralisation process skid (added 2026-06-03). Bespoke
    # template models the absorber/stripper columns + carbonation reactor +
    # filter/centrifuge + dryer + crystalliser + MEA tanks + skid frame.
    "co2_mineralisation": "co2-mineralisation-9shot.py",
    "co2-mineralisation": "co2-mineralisation-9shot.py",
    "mineralisation": "co2-mineralisation-9shot.py",
    # Power-to-Liquid Fischer-Tropsch SAF synthesis plant (added 2026-06-06).
    # Bespoke template models the feed compressors + fired preheater + the hero
    # multitubular FT reactor + steam drum + hot/cold separators + recycle
    # compressor + hydrocracker/isomeriser + fractionation column + thermal
    # oxidiser/flare + MV transformer + SAF/naphtha tanks + loading gantry +
    # DCS/SIS + H2/CO gas detection on a field-erected open steel skid.
    # "e_fuel" substring covers "e_fuel_synthesis"; the variants below are
    # belt-and-braces for the synonyms the classifier may emit.
    "e_fuel_synthesis": "e-fuel-synthesis-9shot.py",
    "e-fuel-synthesis": "e-fuel-synthesis-9shot.py",
    "e_fuel": "e-fuel-synthesis-9shot.py",
    "power_to_liquid": "e-fuel-synthesis-9shot.py",
    "ptl": "e-fuel-synthesis-9shot.py",
    # Direct-air-capture CO2 plant (added 2026-06-06). Bespoke template models the
    # signature louvred AIR CONTACTOR fan-wall + regeneration/calciner vessel + CO2
    # twin-tower dryer + two-stage CO2 compression train + knock-out drum + dense-
    # phase CO2 storage bullet + steam/heat package + dry-cooler + water tank + MV
    # transformer + DCS/SIS + CO2 gas detection on a field-erected open steel skid.
    "dac": "dac-9shot.py",
    "direct_air_capture": "dac-9shot.py",
    # Steam-methane-reforming hydrogen plant (added 2026-06-06). Bespoke template
    # models the signature fired REFORMER FURNACE (radiant box + vertical catalyst
    # tubes + tall flue stack) + steam drum/waste-heat boiler + HT/LT shift reactor
    # pair + the signature PSA adsorber bank (4 tall vessels) + desulphuriser + tail-
    # gas drum + H2 product compressor + dry-cooler + demin tank + MV transformer +
    # DCS/SIS + H2/CO gas detection on a field-erected open steel skid.
    # CRITICAL (2026-06-06): the registered "smr" class-plan (class-plans/smr.ts) is a
    # NUCLEAR Small Modular Reactor, NOT steam-methane reforming. "smr" is therefore
    # DELIBERATELY NOT a key here — the nuclear class stays template-less so the render-
    # quality gate flags it until a proper nuclear-SMR template exists, rather than
    # silently rendering a steam-reforming plant over a reactor. The reforming template
    # is keyed ONLY on reforming-specific slugs (which the nuclear "smr" product_class
    # never contains), so it can never resolve for the nuclear class.
    "steam_methane_reform": "steam-methane-reforming-9shot.py",
    "steam_methane_reforming": "steam-methane-reforming-9shot.py",
    "hydrogen_reformer": "steam-methane-reforming-9shot.py",
    # Phase 3 industrial + other (bootstrapped via GPT-5.5, 2026-05-24)
    "industrial_inspection_drone": "industrial-inspection-drone-9shot.py",
    "industrial-inspection-drone": "industrial-inspection-drone-9shot.py",
    "industrial_robot_arm": "industrial-robot-arm-9shot.py",
    "industrial-robot-arm": "industrial-robot-arm-9shot.py",
    "robotics": "industrial-robot-arm-9shot.py",
    "industrial_3d_printer": "industrial-3d-printer-9shot.py",
    "industrial-3d-printer": "industrial-3d-printer-9shot.py",
    "automated_guided_vehicle_agv": "automated-guided-vehicle-agv-9shot.py",
    "automated-guided-vehicle-agv": "automated-guided-vehicle-agv-9shot.py",
    "agv": "automated-guided-vehicle-agv-9shot.py",
    "vfd_motor_drive": "vfd-motor-drive-9shot.py",
    "vfd-motor-drive": "vfd-motor-drive-9shot.py",
    "vfd": "vfd-motor-drive-9shot.py",
    "chiller": "chiller-9shot.py",
    "distribution_transformer": "distribution-transformer-9shot.py",
    "distribution-transformer": "distribution-transformer-9shot.py",
    "transformer": "distribution-transformer-9shot.py",
    "vehicle_battery_pack": "vehicle-battery-pack-9shot.py",
    "vehicle-battery-pack": "vehicle-battery-pack-9shot.py",
    "ev_battery_pack": "vehicle-battery-pack-9shot.py",
    "insulin_pump": "insulin-pump-9shot.py",
    "insulin-pump": "insulin-pump-9shot.py",
}


# mirrors build_universal_scene.py _CONTAINER_ASPECT_MIN (20-ft ISO = 2.48, 40-ft = 5.0)
CONTAINER_ASPECT_MIN = 2.2


def universal_containerised_on() -> bool:
    """UNIVERSAL_CONTAINERISED flag — default ON. Set 0/false/no/off to kill-switch
    containerised designs back onto the bespoke LLM-template path."""
    return os.environ.get("UNIVERSAL_CONTAINERISED", "1").strip().lower() not in (
        "0", "false", "no", "off")


def has_container_signal(state: dict) -> bool:
    """True when the design is a CONTAINERISED/enclosed plant. EXACTLY mirrors the
    detection in build_universal_scene.py main() (2026-06-24): the brief fixes a
    long-thin enclosure envelope (parsedBrief.constraints.max_dimensions_mm, aspect
    >= CONTAINER_ASPECT_MIN) OR the contract emits container_payload_rating_kg
    (present only for containerised classes). A signal in the contract/brief —
    never a product-class table — so any unseen containerised archetype routes."""
    try:
        dims = ((state.get("parsedBrief") or {}).get("constraints") or {}).get(
            "max_dimensions_mm") or {}
        w, d = float(dims.get("w") or 0), float(dims.get("d") or 0)
        q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
        payload = q.get("container_payload_rating_kg")
        has_payload = (payload.get("value") if isinstance(payload, dict) else payload
                       ) not in (None, 0, "")
        if w > 0 and d > 0:
            long_mm, short_mm = max(w, d), min(w, d)
            return short_mm > 0 and (has_payload
                                     or (long_mm / short_mm) >= CONTAINER_ASPECT_MIN)
    except (TypeError, ValueError):
        pass
    return False


def resolve_template(product_class: str) -> Path | None:
    pc = product_class.lower().strip()
    for key, fname in CLASS_TO_TEMPLATE.items():
        if key in pc:
            tpl = TEMPLATES_DIR / fname
            if tpl.exists():
                return tpl
    return None


def run_universal_fallback(state_path: Path, out_dir: Path, state: dict) -> int:
    """No bespoke per-class template for this product_class → render with the
    UNIVERSAL deterministic builder build_universal_scene.py. It places the real
    equipment (tanks/vessels/pumps as their classified SHAPES, not cubes),
    colour-codes by module and routes the pipework — the SAME engine that drives
    the 2D drawings — so the cover + module pages show the ACTUAL plant, never
    the legacy translucent cube-grid. Maps its inspect-*.png onto the 00-hero /
    blender-cover / module-<id>.png names the chain consumes.

    Tristan 2026-06-14: the good universal model had been ORPHANED — the hero +
    module generators dispatched here, hit return-5, and silently fell through to
    the ghost-box legacy pass (runBlenderCoverPass / runBlenderModulePass). This
    re-wires the no-template path to the real universal builder.
    """
    universal = REPO_ROOT / "scripts" / "blender-universal" / "build_universal_scene.py"
    if not universal.exists():
        print(f"[render-scene] universal builder missing at {universal}; caller falls back", file=sys.stderr)
        return 5
    if not Path(BLENDER_BIN).exists():
        print(f"[render-scene] FATAL: Blender binary missing at {BLENDER_BIN}", file=sys.stderr)
        return 1
    env = os.environ.copy()
    env["BLENDER_OUT_DIR"] = str(out_dir)
    env["INSPECT"] = "1"  # produce the inspect-*.png whole-plant renders
    print(f"[render-scene] no per-class template → UNIVERSAL builder {universal.name}", flush=True)
    shaded_ok = False
    inspect_hero = out_dir / "inspect-hero.png"
    # INTENT (Poseidon 2324): hold out_dir lock across BOTH inspect + shaded passes
    # so generate_drawing_set cannot interleave a third Blender on the same stamp.
    try:
        with blender_out_dir_lock(out_dir, timeout_s=2400.0):
            subprocess.run(
                [BLENDER_BIN, "--background", "--python", str(universal), "--", str(state_path)],
                env=env,
                check=True,
                timeout=900,
            )
            # SHADED HERO PASS (council 2026-06-16, render scored 3/10 "blobby"): the INSPECT=1
            # pass above produced the FLAT even-fill inspect-*.png — the fast input for the 2D
            # drawings, but a shallow open RAS tank rendered flat reads as a flat green DISC. The
            # dossier COVER + module pages must be SHADED. Run a SECOND pass with INSPECT=0 → the
            # studio KEY-SUN + soft-shadow + white-world rig (build_universal_scene's else-branch
            # + run_render_pipeline) writes a shaded 00-hero.png + module-<id>.png DIRECTLY. In
            # INSPECT=0 the pipe-diameter legibility FLOOR is also off, so the pipework renders at
            # its true (thinner) gauge — fixing the "fat tangle" at the same time. ~2× render, correct.
            env_shaded = os.environ.copy()
            env_shaded["BLENDER_OUT_DIR"] = str(out_dir)
            env_shaded["INSPECT"] = "0"
            env_shaded["BLENDER_PRESENTATION_BEVEL"] = "1"
            try:
                subprocess.run(
                    [BLENDER_BIN, "--background", "--python", str(universal), "--", str(state_path)],
                    env=env_shaded, check=True, timeout=900,
                )
                hero_path = out_dir / "00-hero.png"
                # GOTCHA (colorimeter 2254): exists()-only was True when a PRIOR inspect
                # fallback left 00-hero.png identical to inspect-hero while 04–07 product
                # cams wrote successfully — vision critic then floored Renders on the
                # labelled CAD arch. Require a real shaded hero ≠ inspect-hero.
                if hero_path.exists():
                    if inspect_hero.exists() and hero_path.read_bytes() == inspect_hero.read_bytes():
                        print("[render-scene] shaded hero pass: 00-hero is still inspect-hero "
                              "(byte-identical) — treating as MISSING", flush=True)
                    else:
                        shaded_ok = True
                print(f"[render-scene] shaded hero pass: 00-hero="
                      f"{'shaded OK' if shaded_ok else 'MISSING'}", flush=True)
                # REGENERATE THE DERIVED THUMBNAIL. hero-embed.png is a web-weight
                # downscale of 00-hero.png (1600x1067 from 2400x1600) that the Excel cover
                # prefers for size. NOTHING in the pipeline rewrote it when the hero was
                # re-rendered, so every re-render left a stale derivative on disk and
                # plan_render_coherence fired ("hero-embed.png older than 00-hero.png by
                # 9655s — Exec cover would show a stale generation vs the Renders
                # gallery"). A derived file must be rebuilt wherever its SOURCE is written,
                # which is here.
                if shaded_ok and hero_path.exists():
                    try:
                        from PIL import Image as _PIm
                        _emb = out_dir / "hero-embed.png"
                        _im = _PIm.open(hero_path)
                        _im.thumbnail((1600, 1600), _PIm.LANCZOS)
                        _im.save(_emb)
                        print(f"[render-scene] hero-embed.png regenerated from 00-hero "
                              f"({_im.size[0]}x{_im.size[1]})", flush=True)
                    except Exception as _hexc:  # noqa: BLE001 — never block the render
                        print(f"[render-scene] hero-embed regen skipped ({_hexc})",
                              file=sys.stderr)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
                print(f"[render-scene] shaded hero pass failed ({e}) — falling back",
                      file=sys.stderr)
    except subprocess.CalledProcessError as e:
        print(f"[render-scene] FATAL: universal builder exited {e.returncode}", file=sys.stderr)
        return 6
    except subprocess.TimeoutExpired:
        print("[render-scene] FATAL: universal builder timed out", file=sys.stderr)
        return 6
    except TimeoutError as e:
        print(f"[render-scene] FATAL: {e}", file=sys.stderr)
        return 6

    iso = out_dir / "inspect-iso.png"
    hero = inspect_hero if inspect_hero.exists() else (out_dir / "inspect-hero.png")
    # INTENT (colorimeter 2254): instrument product exterior is the real face —
    # never promote the flat inspect arch onto the cover when 04-product-exterior
    # already landed (inspect labels floor Renders via vision critic).
    product_exterior = out_dir / "04-product-exterior.png"
    is_instrument = bool(state.get("isInstrumentDevice"))
    cover_src = None
    if not shaded_ok:
        if is_instrument and product_exterior.exists() and product_exterior.stat().st_size > 50_000:
            cover_src = product_exterior
            print("[render-scene] cover fallback: 04-product-exterior "
                  "(instrument — not inspect-hero)", flush=True)
        else:
            cover_src = hero if hero.exists() else iso
    if not (shaded_ok or (cover_src is not None and cover_src.exists())):
        print("[render-scene] FATAL: no hero render produced", file=sys.stderr)
        return 6
    if not shaded_ok:
        (out_dir / "00-hero.png").write_bytes(cover_src.read_bytes())
    # blender-cover mirrors whatever 00-hero is (shaded if the pass ran, else flat)
    (out_dir / "blender-cover.png").write_bytes((out_dir / "00-hero.png").read_bytes())
    # Module pages: the INSPECT=0 pass already wrote shaded module-<id>.png; only fill a
    # gap from the colour-coded whole-plant iso when the shaded pass did not produce one.
    module_src = iso if iso.exists() else (out_dir / "00-hero.png")
    modules = (state.get("moduleDecomposition", {}) or {}).get("modules", []) or []
    written = 0
    for m in modules:
        mid = m.get("module") or m.get("id") or m.get("module_id")
        if not mid:
            continue
        mp = out_dir / f"module-{mid}.png"
        if not mp.exists():
            mp.write_bytes(module_src.read_bytes())
        written += 1
    if written == 0:
        (out_dir / "module-overview.png").write_bytes(module_src.read_bytes())
        written = 1
    _cover_name = cover_src.name if cover_src is not None else "shaded 00-hero"
    print(f"[render-scene] UNIVERSAL OK — cover + {written} module page(s) from {_cover_name}", flush=True)
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--state", required=True, help="absolute path to state.json")
    p.add_argument("--out-dir", required=True, help="directory to write images into")
    p.add_argument(
        "--force",
        action="store_true",
        help="rerender even when hero/module outputs already exist",
    )
    p.add_argument(
        "--cycles-samples",
        type=int,
        default=None,
        help="override product Cycles samples (8-512; default 64)",
    )
    args = p.parse_args()
    if args.cycles_samples is not None:
        if not 8 <= args.cycles_samples <= 512:
            p.error("--cycles-samples must be between 8 and 512")
        os.environ["BLENDER_CYCLES_SAMPLES"] = str(args.cycles_samples)

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

    # Phase 3 (mempalace drawer_forgeos_decisions_3f18c3cae92fe29e): prefer
    # an LLM-generated brief-specific blender-scene.py if it exists in out_dir
    # (written by generate-blender-scene.tsx). Falls back to the unmodified
    # class template if not present.
    out_dir.mkdir(parents=True, exist_ok=True)

    # Skip if outputs already exist (e.g. produced by phase 5 background
    # runner before hero/modules stages fire). Avoids redundant ~10 min
    # Blender runs for identical output.
    existing_hero = out_dir / "00-hero.png"
    existing_cover = out_dir / "blender-cover.png"
    existing_modules = list(out_dir.glob("module-*.png"))
    # STALENESS CHECK (2026-07-26). "Outputs exist" is NOT the same as "outputs are
    # current". This skip previously fired regardless of how old the renders were
    # relative to the scene inputs, and INSPECT=1 rebuilds of build_universal_scene
    # refresh the manifest + inspect-*.png but NOT these shaded product renders — so the
    # pair silently diverged. On the organoid r11 bake 04-product-exterior.png was 14
    # HOURS older than parts-manifest.json, and every render↔manifest↔GA coherence claim
    # (including the render_ga_vision_coherence gate) was judging a stale image against
    # fresh data. Re-render whenever an INPUT is newer than the hero we would keep.
    _stale_inputs = []
    if existing_hero.exists():
        try:
            _hero_mtime = existing_hero.stat().st_mtime
            for _src in (Path(args.state), out_dir / "parts-manifest.json"):
                if _src.exists() and _src.stat().st_mtime > _hero_mtime + 1.0:
                    _stale_inputs.append(_src.name)
        except OSError:
            pass
    # CONTRACT COMPLETENESS (2026-07-27). The staleness check above asks "is an INPUT
    # newer than my output"; it never asks "is my output set COMPLETE under today's
    # contract". So when a new REQUIRED view is added to render_view_contract, every
    # pre-existing run skips forever and can never acquire it — the view is simply absent
    # from those dossiers for good, and nothing reports it. Measured: the ghost-shell view
    # was added 2026-07-23 and 220 of 480 skippable runs are still missing a required
    # view; every one of them was rendered before that change landed (the 10 that looked
    # like exceptions are all from 07-23 itself, hours before the commit), which confirms
    # this is the additive-contract gap and not a second bug hiding underneath.
    #
    # Keyed on view.required ONLY. Optional views are "may not exist" by definition, so
    # including them would re-render every legacy run forever and never converge.
    _missing_required: list = []
    _missing_optional: list = []
    try:
        for _v in required_views(state):
            if (out_dir / _v.filename).exists():
                continue
            (_missing_required if _v.required else _missing_optional).append(_v.filename)
    except Exception as _rv_exc:  # noqa: BLE001 — never let the contract read block a render
        print(f"[render-scene] view-contract check skipped ({_rv_exc})", flush=True)
    if (not args.force and existing_hero.exists()
            and existing_cover.exists() and existing_modules
            and not _stale_inputs and not _missing_required):
        print(
            f"[render-scene] outputs already present "
            f"({len(existing_modules)} modules + hero + blender-cover); "
            f"skipping Blender re-run",
            flush=True,
        )
        return 0
    if _missing_required:
        print(
            f"[render-scene] INCOMPLETE render set — {len(_missing_required)} required "
            f"view(s) absent under the current contract "
            f"({', '.join(sorted(_missing_required))}); re-rendering to backfill",
            flush=True,
        )
    if _missing_optional:
        # Reported, never gated (SOL round 7): an optional view that is absent is not a
        # defect, but silently never noticing we failed to produce the nice-to-haves is
        # how the ghost view went missing on 220 runs unremarked.
        print(
            f"[render-scene] optional view(s) not present: "
            f"{', '.join(sorted(_missing_optional))} (not required — no re-render forced)",
            flush=True,
        )
    if _stale_inputs:
        print(
            f"[render-scene] STALE renders — {', '.join(sorted(set(_stale_inputs)))} "
            f"newer than 00-hero.png; re-rendering instead of shipping a stale image",
            flush=True,
        )

    # CONTAINERISED → UNIVERSAL (Tristan 2026-07-03): the plant must render ASSEMBLED
    # (container shell joined + roof on + interior visible), which the deterministic
    # universal builder guarantees — the LLM bespoke template shipped exploded views.
    # Takes precedence over any generated blender-scene.py / class template.
    if universal_containerised_on() and has_container_signal(state):
        print(
            "[render-scene] containerised design (enclosure signal in brief/contract) → "
            "UNIVERSAL deterministic builder (kill-switch: UNIVERSAL_CONTAINERISED=0)",
            flush=True,
        )
        return run_universal_fallback(state_path, out_dir, state)

    # BENCHTOP INSTRUMENT mis-matched a PLANT template → UNIVERSAL (2026-07-19): a
    # product-scale (benchtop) design whose only bespoke match is a plant-scale skid template
    # (the 200 L "bioreactor" catching benchtop_bioreactor) must render via the UNIVERSAL
    # builder — it gives a cut-away sealed-enclosure hero + the full parts-manifest the spatial
    # drawings need. Same precedence idea as the containerised → UNIVERSAL route above.
    _bench_tpl = resolve_template(product_class)
    if (is_product_scale(state) and _bench_tpl is not None
            and _bench_tpl.name in _PLANT_TEMPLATES_WRONG_FOR_BENCHTOP):
        print(
            f"[render-scene] benchtop instrument (product_class={product_class!r}, product-scale) "
            f"mis-matched plant template {_bench_tpl.name} → UNIVERSAL deterministic builder "
            f"(cut-away + parts-manifest for drawings)",
            flush=True,
        )
        return run_universal_fallback(state_path, out_dir, state)

    generated = out_dir / "blender-scene.py"
    if generated.exists():
        template = generated
        print(f"[render-scene] using LLM-generated blender-scene.py at {generated}", flush=True)
    else:
        template = resolve_template(product_class)
        if template is None:
            print(
                f"[render-scene] no template for product_class={product_class!r}; "
                f"rendering with the UNIVERSAL deterministic builder",
                file=sys.stderr,
            )
            return run_universal_fallback(state_path, out_dir, state)
        print(f"[render-scene] using unmodified template {template.name}", flush=True)
        # FAIL LOUD (2026-05-29): no blender-scene.py means the LLM geometry
        # step failed or was absent, so these renders will be a GENERIC stock
        # model — not this design. Drop a marker the chain / a render-quality
        # gate can detect instead of silently shipping the wrong object (iter-66).
        try:
            (out_dir / ".blender-template-fallback").write_text(
                f"template={template.name}\nreason=no blender-scene.py (geom-gen failed or absent)\n"
            )
        except Exception:
            pass
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
            timeout=900,  # LLM-generated scenes can have 150+ primitives → ~10 min render
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

    # Mirror 00-hero.png to blender-cover.png. For instruments (photoreal CAD
    # bar), this Cycles CAD render IS the product image — Gemini i2i must never
    # replace it. For plant/legacy PDF paths, blender-cover may still feed an
    # optional Gemini i2i step when CHAIN_WANT_GEMINI_I2I=1 (non-instruments only).
    # Renderer/chain reads state.blender_cover_image_path → <out>/blender-cover.png.
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
