#!/usr/bin/env python3
"""form_signature_gate.py — deterministic PRODUCT-IDENTITY gate on the rendered scene.

WHY (Tristan 2026-07-18, after SIGHTing all 7 Yuri renders): the colour-fraction
`form_render_glance` and the LLM `render_vision_critic` both PASSED renders that a
5-second human glance rejects — a wide featureless grey box with a detached "story"
module floating behind it. The engine scored ships/floor-9 on products that do not
resemble the real thing. Root cause the gate must catch: the SCENE never contained
product-specific geometry — several DIFFERENT product classes were rendered from the
SAME generic mesh skeleton.

This gate reads form-meshes.json (the authoritative list of placed Blender meshes) +
the product_class from state.json and asserts the scene carries REAL, product-specific
geometry — never trusting a pixel colour signature. Deterministic, no LLM, £0, instant.

THE TWO RULES (each proven on the real 2026-07-18 form-meshes.json):

  R1 GENERIC-SKELETON — the scene's mesh signature is (a subset of) a known GENERIC
     fallback skeleton that carries no product identity. The `u_se_le_*` set
     (bnc/cell/chip/pcb/usb) was emitted BYTE-IDENTICALLY for a potentiostat, a
     benchtop bioreactor AND a digital-microfluidics platform — three different
     products, one generic PCB-in-a-box stand-in. A design whose whole scene is the
     generic skeleton has no signature part (no vial, no electrode grid, no cell array)
     and cannot be a faithful render of any specific product. → FAIL.

  R2 EXTERIOR-BODY-ABSENT — every placed mesh is a cutaway/interior "story" prop
     (`*_story_*`) with NO exterior product body. The colorimeter scene was ONLY the
     optical-bench story (bench/beam/cuvette/detector/led/display) with no sealed
     exterior shell, so the product-exterior view rendered the floating story props as
     the "product". A real product-exterior render needs an exterior body mesh. → FAIL.

  R3 CLASS-SIGNATURE (reinforcing) — a class with a well-known signature part must place
     it: digital_microfluidics → an electrode/DMF grid mesh; benchtop_bioreactor → a
     vial/vessel/culture mesh; syringe_pump → syringe meshes; thermocycler → a sample
     block/wells; lab_microscope → a stage/optics tube; optical_instrument → a cuvette.
     Absent → FAIL. Universal (keyed on class, not a product-name table); a class with
     no registered signature is not checked by R3 (R1/R2 still apply).

Usage:  python3 form_signature_gate.py <run_dir>            # exit 0 PASS / 1 FAIL
        python3 form_signature_gate.py <run_dir> --json     # verdict as JSON
        python3 form_signature_gate.py --selftest           # proveCatch (4 FAIL / 3 PASS)
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any


# The generic fallback skeletons that carry NO product identity. A scene whose whole
# mesh signature is a subset of one of these is a generic stand-in, not a real product.
# `u_se_le_*` is the lab_electronics fallback (bnc/cell/chip/pcb/usb) emitted identically
# for 3 different classes on 2026-07-18. Add a new skeleton here if another generic
# fallback is discovered — never a product-name entry.
GENERIC_SKELETONS: list[frozenset[str]] = [
    frozenset({"u_se_le_bnc", "u_se_le_cell", "u_se_le_chip", "u_se_le_pcb", "u_se_le_usb"}),
]

# Per-class signature part: at least one placed mesh name must match the pattern.
# Keyed on product_class (never a product-name table). A class absent here is not
# checked by R3 (R1/R2 still gate it).
CLASS_SIGNATURE_PATTERNS: dict[str, str] = {
    "digital_microfluidics": r"electrode|dmf|ewod|grid|pad_array|actuation_array",
    "benchtop_bioreactor": r"vial|vessel|culture|reactor_tube|stir|impeller|sparg",
    "syringe_pump": r"syringe",
    "thermocycler": r"sample_block|well|thermal_block",
    "lab_microscope": r"stage|optics_tube|objective",
    "optical_instrument": r"cuvette|sample_cell",
    "optical_handheld": r"cuvette|sample_cell",
}

# R4 FOREIGN_SAMPLE_INTERFACE — the "colorimeter deck applied to everything" bug (Cursor
# 2026-07-18). A NON-optical instrument must not wear a foreign optical-BENCH sample
# interface — a colorimeter cuvette + collimated optical path + monochromator (the
# `instrument_story` optical cutaway: cuvette / optical cube / beam / baffle). Classes
# whose whole sample interface is genuinely optical are exempt.
_OPTICAL_STORY_RE = re.compile(r"instrument_story|cuvette|optical_cube|_beam(_|$)|baffle")
# An OD (optical-DENSITY) sensor — an LED + photodiode straddling a culture vessel — is a
# device's OWN LEGITIMATE sample interface (a benchtop/vial bioreactor monitors turbidity
# optically; it is NOT a colorimeter cuvette-bench leak). The bare mesh `od_led_source` /
# `od_photodiode_det` / `od_src` / `od_det` is that in-situ OD probe. Exempted per-mesh so
# a genuine colorimeter deck (instrument_story cuvette/beam) STILL fires the gate — the OD
# probe is the noun signal (never a class-name table), so any culture/monitoring device
# whose optical interface is just an OD LED/photodiode is not a foreign-bench leak.
# 2026-07-21: organoid/benchtop bioreactor rebake3 (R4 phenotype already fixed) — the OD
# LED was wrongly read as the colorimeter deck; the fix is here (the CHECK), not the render.
_OD_SENSOR_RE = re.compile(r"(^|_)od_(led|source|src|photodiode|det|sensor|arm)(_|$)")
_OPTICAL_CLASSES = {"optical_instrument", "optical_handheld", "colorimeter",
                    "spectrophotometer", "photometer", "fluorometer", "turbidity_meter",
                    "lab_microscope"}  # microscope legitimately has an optical path

# R5 WRONG_TRANSPORT_PHYSICS — a digital-microfluidics / EWOD device actuates droplets
# ELECTRICALLY on a plane; continuous-flow plant morphology (manifold / valve / pipe /
# pump-head) is the wrong physics leaking in (Cursor: OpenDrop "Distribution Manifold").
_FLOW_PLANT_RE = re.compile(r"manifold|(^|_)valve(_|$)|(^|_)pipe(_|$)|pump_head|impeller|nozzle|flow_control")
_EWOD_CLASSES = {"digital_microfluidics", "opendrop", "electrowetting", "ewod"}

_STORY_RE = re.compile(r"_story(_|$)")
_INDEX_SUFFIX_RE = re.compile(r"_\d+$")


def _strip_index(name: str) -> str:
    return _INDEX_SUFFIX_RE.sub("", name)


def _signature(meshes: list[str]) -> frozenset[str]:
    """The set of mesh 'roles' (index suffix stripped) — the scene's identity fingerprint."""
    return frozenset(_strip_index(m) for m in meshes)


def _product_class(state: dict[str, Any]) -> str | None:
    for path in (
        ("parsedBrief", "product_class"),
        ("moduleDecomposition", "product_class"),
        ("orchestratorContract", "product_class"),
        ("keyMetrics", "product_class"),
    ):
        node: Any = state
        for key in path:
            node = (node or {}).get(key) if isinstance(node, dict) else None
        if isinstance(node, str) and node.strip():
            return node.strip()
    return None


def evaluate_form_signature(meshes: list[str], product_class: str | None) -> dict[str, Any]:
    """Pure decision — no filesystem. Returns {ok, findings:[{code,severity,message,fix}]}.

    ok is False when ANY rule fires. Each finding names its SOURCE fix stage so the
    loop can route it (CORE FIX PRINCIPLE)."""
    findings: list[dict[str, str]] = []
    sig = _signature(meshes)
    non_story = [m for m in meshes if not _STORY_RE.search(m)]

    # R1 — generic skeleton stand-in.
    for skel in GENERIC_SKELETONS:
        if sig and sig <= skel:
            findings.append({
                "code": "GENERIC_SKELETON",
                "severity": "high",
                "message": (
                    f"scene is the generic fallback skeleton {sorted(sig)} — no "
                    f"product-specific geometry (this exact skeleton was rendered for "
                    f"multiple different classes). class={product_class}"
                ),
                "fix": "build_universal_scene.py: give this class real signature "
                       "geometry (a vial/electrode-grid/etc.), not the generic le_ box",
            })
            break

    # R2 — exterior body absent (only cutaway 'story' props).
    if meshes and not non_story:
        findings.append({
            "code": "EXTERIOR_BODY_ABSENT",
            "severity": "high",
            "message": (
                f"every placed mesh is a cutaway 'story' prop ({len(meshes)} meshes, all "
                f"*_story_*) — there is NO exterior product body, so the product-exterior "
                f"view renders the floating interior props as the 'product'. class={product_class}"
            ),
            "fix": "build_universal_scene.py: place a sealed exterior body for this form, "
                   "not only the cutaway optical-story props",
        })

    # R3 — class signature part (reinforcing; only for classes we have a pattern for).
    pat = CLASS_SIGNATURE_PATTERNS.get((product_class or "").strip())
    if pat:
        rx = re.compile(pat, re.I)
        if not any(rx.search(m) for m in meshes):
            findings.append({
                "code": "CLASS_SIGNATURE_ABSENT",
                "severity": "high",
                "message": (
                    f"class {product_class!r} has a known signature part (/{pat}/) but the "
                    f"scene places none of it — the render cannot show what makes this "
                    f"product recognisable"
                ),
                "fix": f"build_universal_scene.py: place the {product_class} signature "
                       f"geometry (mesh name matching /{pat}/)",
            })

    cls = (product_class or "").strip().lower()

    # R4 — foreign (optical) sample interface on a non-optical instrument. An OD
    # (optical-density) LED/photodiode probe is a device's OWN legitimate optical
    # sample interface (a bioreactor monitors culture turbidity in situ), so it is
    # NEVER counted as a foreign colorimeter-bench leak — only the instrument_story
    # cuvette/beam optical deck is.
    if cls and cls not in _OPTICAL_CLASSES:
        offby = [m for m in meshes
                 if _OPTICAL_STORY_RE.search(m) and not _OD_SENSOR_RE.search(m)]
        if offby:
            findings.append({
                "code": "FOREIGN_SAMPLE_INTERFACE",
                "severity": "high",
                "message": (
                    f"non-optical class {product_class!r} wears an OPTICAL sample interface "
                    f"({offby[:3]}) — the colorimeter optical-bench deck leaked onto a device "
                    f"whose sample interface is not optical"
                ),
                "fix": "build_universal_scene.py: give this class its OWN sample interface "
                       "(electrodes / vial / cartridge), never the optical cuvette story",
            })

    # R5 — continuous-flow transport morphology on an electrical droplet device.
    if cls in _EWOD_CLASSES:
        flow = [m for m in meshes if _FLOW_PLANT_RE.search(m)]
        if flow:
            findings.append({
                "code": "WRONG_TRANSPORT_PHYSICS",
                "severity": "high",
                "message": (
                    f"EWOD/digital-microfluidics class {product_class!r} has continuous-flow "
                    f"plant geometry ({flow[:3]}) — droplets are actuated ELECTRICALLY on a "
                    f"plane; manifolds/valves/pipes are the wrong transport physics"
                ),
                "fix": "build_universal_scene.py: remove flow/manifold/valve morphology; "
                       "model the planar electrode grid + cartridge instead",
            })

    return {
        "schema": "form-signature-gate/v1",
        "product_class": product_class,
        "n_meshes": len(meshes),
        "signature": sorted(sig),
        "ok": len(findings) == 0,
        "findings": findings,
    }


def check_run(run_dir: str) -> dict[str, Any]:
    """Read form-meshes.json + state.json from a run dir and evaluate."""
    fm_path = None
    for cand in (
        os.path.join(run_dir, "form-meshes.json"),
        os.path.join(run_dir, "blender-universal", "form-meshes.json"),
    ):
        if os.path.exists(cand):
            fm_path = cand
            break
    if fm_path is None:
        return {
            "schema": "form-signature-gate/v1", "ok": True, "skipped": True,
            "message": "no form-meshes.json — non-Blender run, gate not applicable",
            "findings": [],
        }
    with open(fm_path, "r", encoding="utf-8") as fh:
        fm = json.load(fh)
    meshes = fm.get("meshes") or []
    state: dict[str, Any] = {}
    sp = os.path.join(run_dir, "state.json")
    if os.path.exists(sp):
        with open(sp, "r", encoding="utf-8") as fh:
            state = json.load(fh)
    return evaluate_form_signature(meshes, _product_class(state))


def _selftest() -> int:
    """proveCatch on synthetic signatures mirroring the real 2026-07-18 form-meshes.json:
    the 4 confirmed-bad renders FAIL, the 3 good renders PASS."""
    bad = 0
    cases = [
        # (name, meshes, product_class, expect_ok)
        ("rodeostat", ["u_se_le_bnc_0", "u_se_le_bnc_1", "u_se_le_cell", "u_se_le_chip_0",
                       "u_se_le_chip_1", "u_se_le_chip_2", "u_se_le_pcb", "u_se_le_usb"],
         "potentiostat", False),
        ("pioreactor", ["u_se_le_bnc_0", "u_se_le_cell", "u_se_le_chip_0", "u_se_le_pcb",
                        "u_se_le_usb"], "benchtop_bioreactor", False),
        ("opendrop", ["u_se_le_bnc_0", "u_se_le_cell", "u_se_le_chip_0", "u_se_le_pcb",
                      "u_se_le_usb"], "digital_microfluidics", False),
        ("colorimeter", ["u_se_instrument_story_bench", "u_se_instrument_story_beam",
                         "u_se_instrument_story_cuvette", "u_se_instrument_story_detector",
                         "u_se_instrument_story_led", "u_se_instrument_story_display",
                         "u_se_instrument_story_pcb"], "optical_instrument", False),
        ("ninjapcr", ["u_se_product_tc_lid", "u_se_product_tc_knob", "u_se_tc_sample_block",
                      "u_se_tc_well_1", "u_se_tc_well_2", "u_se_tc_peltier",
                      "u_se_tc_control_pcb"], "thermocycler", True),
        ("poseidon", ["u_se_sp_base", "u_se_sp_console", "u_se_sp_ch1_syringe",
                      "u_se_sp_ch1_stepper", "u_se_sp_ch1_carriage",
                      "u_se_sp_ch1_leadscrew"], "syringe_pump", True),
        ("openflexure", ["u_se_lm_body", "u_se_lm_stage", "u_se_lm_optics_tube",
                        "u_se_lm_slide", "u_se_lm_act_x_stepper", "u_se_lm_condenser"],
         "lab_microscope", True),
    ]
    for name, meshes, cls, expect_ok in cases:
        res = evaluate_form_signature(meshes, cls)
        got = res["ok"]
        codes = [f["code"] for f in res["findings"]]
        if got != expect_ok:
            print(f"  FAIL {name}: ok={got} (want {expect_ok}) codes={codes}")
            bad += 1
        else:
            tag = "PASS" if got else "FAIL(caught " + ",".join(codes) + ")"
            print(f"  ok  {name}: {tag}")
    # R4 proveCatch — a potentiostat wearing the optical cuvette story (colorimeter deck
    # leak) must fire FOREIGN_SAMPLE_INTERFACE; an actual optical instrument must NOT.
    r4 = evaluate_form_signature(
        ["u_se_le_pcb", "u_se_le_bnc", "u_se_instrument_story_cuvette",
         "u_se_instrument_story_beam"], "potentiostat")
    if "FOREIGN_SAMPLE_INTERFACE" not in [f["code"] for f in r4["findings"]]:
        print("  FAIL R4: optical story on a potentiostat must fire FOREIGN_SAMPLE_INTERFACE"); bad += 1
    r4ok = evaluate_form_signature(
        ["u_se_instrument_story_cuvette", "u_se_product_body"], "optical_instrument")
    if "FOREIGN_SAMPLE_INTERFACE" in [f["code"] for f in r4ok["findings"]]:
        print("  FAIL R4: an optical instrument's cuvette must NOT fire FOREIGN_SAMPLE_INTERFACE"); bad += 1
    # R4 OD-SENSOR PROVECATCH (2026-07-21) — a benchtop/vial bioreactor's OWN OD probe (an
    # LED + photodiode straddling the culture vial) is its LEGITIMATE optical sample
    # interface, NOT a colorimeter cuvette-bench leak — it must NOT fire. Mirrors the real
    # organoid-bioreactor rebake3 form-meshes.json (vial + stir + heater + OD LED/PD).
    r4od = evaluate_form_signature(
        ["u_se_le_vial", "u_se_le_vial_fluid", "u_se_le_stir_motor", "u_se_le_heater_block",
         "u_se_le_od_led_source", "u_se_le_od_photodiode_det", "u_se_le_od_src",
         "u_se_le_od_det"], "benchtop_bioreactor")
    if "FOREIGN_SAMPLE_INTERFACE" in [f["code"] for f in r4od["findings"]]:
        print("  FAIL R4: a bioreactor's own OD LED/photodiode is its legitimate sample "
              "interface — must NOT fire FOREIGN_SAMPLE_INTERFACE"); bad += 1
    # …but a GENUINE colorimeter cuvette bench leaking onto that SAME non-optical bioreactor
    # (not just an OD probe) must STILL fire — the OD exemption must not blind the real leak.
    r4leak = evaluate_form_signature(
        ["u_se_le_vial", "u_se_le_stir_motor", "u_se_le_od_led_source",
         "u_se_instrument_story_cuvette", "u_se_instrument_story_beam"], "benchtop_bioreactor")
    if "FOREIGN_SAMPLE_INTERFACE" not in [f["code"] for f in r4leak["findings"]]:
        print("  FAIL R4: a real colorimeter cuvette bench on a bioreactor must STILL fire "
              "FOREIGN_SAMPLE_INTERFACE despite the OD-sensor exemption"); bad += 1
    # R5 proveCatch — an EWOD device with a flow manifold must fire WRONG_TRANSPORT_PHYSICS.
    r5 = evaluate_form_signature(
        ["u_se_ewod_electrode_grid", "u_se_dmf_cartridge", "u_se_distribution_manifold"],
        "digital_microfluidics")
    if "WRONG_TRANSPORT_PHYSICS" not in [f["code"] for f in r5["findings"]]:
        print("  FAIL R5: a manifold on an EWOD device must fire WRONG_TRANSPORT_PHYSICS"); bad += 1
    # A clean EWOD device (grid + cartridge, no flow parts) must NOT fire R5 (and passes R3).
    r5ok = evaluate_form_signature(
        ["u_se_ewod_electrode_grid", "u_se_dmf_cartridge", "u_se_hv_driver"],
        "digital_microfluidics")
    if not r5ok["ok"]:
        print(f"  FAIL R5: a clean EWOD grid+cartridge must PASS, got {[f['code'] for f in r5ok['findings']]}"); bad += 1

    # A generic-skeleton design must NEVER be rescued by a class with no R3 pattern.
    res = evaluate_form_signature(["u_se_le_pcb", "u_se_le_cell"], "some_new_gadget")
    if res["ok"]:
        print("  FAIL new-class generic skeleton must still fail R1"); bad += 1
    # A non-Blender run (no meshes) must not be spuriously failed by the pure evaluator.
    res = evaluate_form_signature([], None)
    if not res["ok"]:
        print("  FAIL empty scene must be OK (gate not applicable)"); bad += 1
    print("form_signature_gate selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


def main() -> int:
    if "--selftest" in sys.argv[1:]:
        return 1 if _selftest() else 0
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv[1:]
    if not args:
        print("usage: form_signature_gate.py <run_dir> [--json] | --selftest", file=sys.stderr)
        return 2
    res = check_run(args[0])
    if as_json:
        print(json.dumps(res, indent=2))
    else:
        if res.get("ok"):
            print(f"form-signature PASS {args[0]} (class={res.get('product_class')})")
        else:
            print(f"form-signature FAIL {args[0]} (class={res.get('product_class')})")
            for f in res.get("findings", []):
                print(f"  [{f['severity']}] {f['code']}: {f['message']}")
                print(f"      fix: {f['fix']}")
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
