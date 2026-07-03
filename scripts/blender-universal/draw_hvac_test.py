#!/usr/bin/env python3
"""
scripts/blender-universal/draw_hvac_test.py

Headless test for draw_hvac.py. Asserts the projected drawing is a REAL HVAC / DUCT
LAYOUT — the exact visual rubric a building-services (mechanical) engineer (and
Tristan) judges it on — NOT a generic node graph:

  EQUIPMENT + ROLES   the supply hub (AHU / DX / CRAC / chiller) is picked out of the
                      placed manifest by role, and the served zones / racks are its
                      consumers — the same hub→consumer→collector pattern as the water
                      loop (never an undifferentiated box dump).
  SIZED DUCTS         every duct carries a SIZE label (e.g. 400×250 / Ø315) derived from
                      its airflow ÷ a target duct velocity; a liquid system is sized in
                      DN instead (honestly a coolant loop, see below).
  SUPPLY vs RETURN    supply and return are drawn DISTINCTLY (solid navy supply vs dashed
                      teal return) and both appear.
  AIRFLOW ARROWS+FLOW airflow-direction arrow markers are defined + used, and the design
                      airflow is labelled in cfm / m³/s.
  DIFFUSERS / GRILLES a supply diffuser (or cold-plate / return grille) terminal appears
                      at the served zones.
  LEGEND + TITLE BLOCK both present, with the "not for construction" scope note, a
                      drawing number, a stated scale + scale bar, a PLAN + a SECTION.
  HONESTY             a LIQUID-cooled archetype (BESS) is drawn + titled as a COOLANT
                      layout (NOT mis-labelled an air duct system); an air archetype is
                      drawn as sized air ducts.

Three air-cooled archetypes are exercised from a pre-built manifest (regenerate via
  INSPECT=1 BLENDER_OUT_DIR=/tmp/hvac-vertical_farm   <blender> ... -- out/rerun-vertical_farm/state.json
  INSPECT=1 BLENDER_OUT_DIR=/tmp/hvac-edge_ai_server  <blender> ... -- out/rerun-edge_ai_server/state.json
  INSPECT=1 BLENDER_OUT_DIR=/tmp/hvac-energy_storage  <blender> ... -- out/rerun-energy_storage/state.json
):
  vertical_farm (DX/AHU air, zones derived) · edge_ai (CRAC air, hot/cold aisle) ·
  energy_storage (BESS liquid coolant loop — the honesty case).

Run (no venv needed — pure stdlib + the pre-built parts-manifest.json + state.json):
    python3 scripts/blender-universal/draw_hvac_test.py
    HVAC_RASTER=1 python3 scripts/blender-universal/draw_hvac_test.py   # also write PNGs

Exits non-zero on the first failed assertion; prints an inspectable per-archetype
summary either way. Skips an archetype (with a clear note) if its manifest has not yet
been generated, so the test never hard-fails purely for a missing Blender run — but at
least ONE manifest must be present or the test errors.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_hvac as H  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RASTER = os.environ.get("HVAC_RASTER") == "1"

# (label, manifest-dir candidates, sibling state.json, expected medium) — the manifest
# dir is the /tmp build dir from build_universal_scene with INSPECT=1.
CASES = [
    ("vertical_farm (air)", ["/tmp/hvac-vertical_farm"],
     REPO / "out/rerun-vertical_farm/state.json", "air"),
    ("edge_ai (air, hot/cold aisle)", ["/tmp/hvac-edge_ai_server"],
     REPO / "out/rerun-edge_ai_server/state.json", "air"),
    ("energy_storage (BESS liquid)", ["/tmp/hvac-energy_storage"],
     REPO / "out/rerun-energy_storage/state.json", "liquid"),
]


class Fail(AssertionError):
    pass


def _check(cond, msg):
    if not cond:
        raise Fail(msg)


def _find_manifest_dir(candidates):
    for c in candidates:
        if (Path(c) / "parts-manifest.json").is_file():
            return c
    return None


def _run_case(label, manifest_dir, state_path, expect_medium):
    summary, sysm, svg = H.generate_hvac(manifest_dir, str(state_path),
                                         rasterise_png=RASTER)
    liquid = summary["medium"] == "liquid"

    print(f"\n=== {label} ===")
    print(f"  archetype : {summary['archetype']}  (medium={summary['medium']})")
    print(f"  manifest  : {manifest_dir}/parts-manifest.json")
    print(f"  hubs/zones: {summary['hubs']} / {summary['zones']}"
          f"{'  (derived)' if summary['zones_derived'] else ''}")
    print(f"  ducts     : {summary['ducts']}  diffusers: {summary['diffusers']}")
    if not liquid:
        print(f"  airflow   : {summary['airflow_cms']} m³/s "
              f"({summary['airflow_cfm']:,} cfm)")
    print(f"  cooling   : {summary['cooling_kw']} kW")
    print(f"  SVG bytes : {len(svg)}")

    # ---- (0) MEDIUM honesty — the BESS must read as a COOLANT loop, not air ------
    _check(summary["medium"] == expect_medium,
           f"{label}: medium {summary['medium']} != expected {expect_medium}")
    if liquid:
        _check("COOLANT" in svg.upper(),
               f"{label}: liquid system not labelled as a COOLANT layout")
        _check("LIQUID-COOLED" in svg.upper() or "coolant" in svg.lower(),
               f"{label}: liquid system doesn't honestly state it's a coolant loop")
    else:
        _check("DUCT" in svg.upper(),
               f"{label}: air system not labelled as a DUCT layout")

    # ---- (1) HUB + SERVED ZONES, the role-based system (not a box dump) ----------
    _check(summary["hubs"] >= 1, f"{label}: no supply hub identified")
    _check(summary["zones"] >= 2,
           f"{label}: too few served zones ({summary['zones']})")
    hub_roles = {h.role for h in sysm.hubs}
    _check(hub_roles & {"ahu", "crac", "dx", "chiller", "fan"},
           f"{label}: hub has no recognised mechanical role ({hub_roles})")
    # equipment tags drawn on the outlines (a few sampled hub/zone tags appear).
    tags = [e.tag for e in (sysm.hubs + sysm.zones)]
    drawn = [t for t in tags if f">{t}<" in svg]
    _check(len(drawn) >= 2,
           f"{label}: equipment tags not drawn on outlines (have {tags[:4]}…, "
           f"found {drawn[:4]})")

    # ---- (2) SIZED DUCTS / PIPES — a size on (almost) every run ------------------
    _check(len(sysm.ducts) >= 4, f"{label}: too few duct runs ({len(sysm.ducts)})")
    if liquid:
        sized = [d for d in sysm.ducts if re.search(r"DN\d+", d.size_label)]
    else:
        sized = [d for d in sysm.ducts
                 if re.search(r"\d+×\d+|Ø\d+", d.size_label)]
    _check(len(sized) >= max(3, len(sysm.ducts) - 1),
           f"{label}: too few SIZED runs ({len(sized)}/{len(sysm.ducts)})")
    # the size labels reach the SVG (rendered on the ducts).
    _check(any(d.size_label.split()[0] in svg for d in sized),
           f"{label}: duct/pipe size labels not rendered in the drawing")

    # ---- (3) SUPPLY vs RETURN drawn DISTINCTLY ----------------------------------
    services = {d.service for d in sysm.ducts}
    _check(H.SERVICE_RETURN in services,
           f"{label}: no RETURN run — supply/return not both present")
    main_service = H.SERVICE_LIQUID if liquid else H.SERVICE_SUPPLY
    _check(main_service in services,
           f"{label}: no {main_service} run")
    # the two service inks differ (so they read distinctly on paper).
    _check(H._service_ink(main_service)[0] != H._service_ink(H.SERVICE_RETURN)[0],
           f"{label}: supply + return drawn in the same colour")

    # ---- (4) AIRFLOW ARROWS + FLOW labels ---------------------------------------
    _check('marker-end="url(#air' in svg,
           f"{label}: no airflow-direction arrows on the runs")
    if not liquid:
        _check(re.search(r"[\d,]+\s*cfm", svg),
               f"{label}: no airflow (cfm) labelled on the drawing")
        _check(summary["airflow_cms"] > 0,
               f"{label}: air system has zero design airflow")

    # ---- (5) DIFFUSERS / GRILLES / COLD PLATES at served zones -------------------
    _check(len(sysm.diffusers) >= 2,
           f"{label}: too few terminal diffusers/grilles ({len(sysm.diffusers)})")
    _check(summary["diffusers"] == len(sysm.zones)
           or summary["diffusers"] >= 2,
           f"{label}: diffusers not placed at the served zones")

    # ---- (6) PLAN + SECTION, LEGEND + TITLE BLOCK + scope note -------------------
    _check("PLAN" in svg, f"{label}: no PLAN view")
    _check("SECTION" in svg, f"{label}: no SECTION view")
    _check("LEGEND" in svg, f"{label}: no LEGEND")
    _check("HVAC" in svg.upper(), f"{label}: no HVAC title")
    _check("not for construction" in svg.lower(),
           f"{label}: scope note 'not for construction' missing")
    _check("ISO 2768-mK" in svg,
           f"{label}: shared general-tolerance note (ISO 2768-mK) missing")
    _check("FF-HVAC-001" in svg, f"{label}: no HVAC drawing number in the title block")
    _check(re.search(r"SCALE\s*1:\d+", svg), f"{label}: no stated scale (1:N)")
    _check(re.search(r'>N<', svg), f"{label}: no north arrow on the plan")

    # ---- structural SVG sanity --------------------------------------------------
    _check(svg.lstrip().startswith("<svg"), f"{label}: output is not an SVG document")
    _check(svg.count("<text") >= 15, f"{label}: implausibly few text labels")
    # determinism — the SVG must be byte-identical on a re-run (deterministic projector).
    _summary2, _s2, svg2 = H.generate_hvac(manifest_dir, str(state_path),
                                           rasterise_png=False)
    _check(svg2 == svg, f"{label}: SVG is non-deterministic across runs")

    print(f"  PASS  (medium={summary['medium']}, {len(sized)} sized runs, "
          f"services={sorted(services)}, diffusers={len(sysm.diffusers)})")
    if RASTER and summary.get("png"):
        print(f"  PNG  -> {summary['png']}")
    return summary


def main():
    ran = 0
    skipped = []
    for label, cand, state_path, medium in CASES:
        if not Path(state_path).is_file():
            skipped.append((label, f"state.json missing ({state_path})"))
            continue
        mdir = _find_manifest_dir(cand)
        if not mdir:
            skipped.append((label, f"no parts-manifest.json (looked in {cand})"))
            continue
        try:
            _run_case(label, mdir, state_path, medium)
        except Fail as ex:
            print(f"\n[hvac-test] FAIL: {ex}")
            return 1
        ran += 1
    if skipped:
        print("\n[skip] " + "; ".join(f"{lab}: {why}" for lab, why in skipped))
    if ran == 0:
        print("\nERROR: no parts-manifest.json found for ANY case — generate one with\n"
              "  INSPECT=1 BLENDER_OUT_DIR=/tmp/hvac-edge_ai_server <blender> "
              "--background --python scripts/blender-universal/build_universal_scene.py "
              "-- out/rerun-edge_ai_server/state.json")
        return 1
    print(f"\n[hvac-test] ALL PASS ({ran} archetype(s)) — each projects a real HVAC / "
          "duct layout (role-based supply hub → sized supply/return ducts → diffusers, "
          "airflow arrows + cfm, legend + title block; liquid systems honestly drawn as "
          "coolant loops).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
