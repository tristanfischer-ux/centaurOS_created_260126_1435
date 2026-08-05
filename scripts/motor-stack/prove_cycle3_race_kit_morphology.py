#!/usr/bin/env python3
"""proveCatch: cycle-3 race-kit morphology is present in source (no Blender).

Does NOT set ship_ok. Run anytime after editing traction helpers:

  python3 scripts/motor-stack/prove_cycle3_race_kit_morphology.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
UNIV = REPO / "scripts" / "blender-universal" / "build_universal_scene.py"
LIB = REPO / "scripts" / "blender-templates" / "forge_blender_lib.py"
BOM = REPO / "scripts" / "lib" / "bom_physical_properties.py"
NOTE = (
    REPO
    / "out"
    / "formula-e-front-mgu-20260729-1432"
    / "_motor_stack"
    / "blender_cycle3_morphology_note.json"
)


def _must(cond: bool, msg: str, fails: list[str]) -> None:
    if not cond:
        fails.append(msg)


def main() -> int:
    fails: list[str] = []
    univ = UNIV.read_text(encoding="utf-8")
    lib = LIB.read_text(encoding="utf-8")
    bom = BOM.read_text(encoding="utf-8")

    # Universal helper
    _must("def make_powertrain_role_mat" in lib, "make_powertrain_role_mat missing in forge_blender_lib", fails)
    for role in (
        "cast_al_housing",
        "machined_al",
        "carbon_structure",
        "sic_module_body",
        "ceramic_dbc",
        "hv_safety_orange",
        "braid_shield",
        "coolant_qd_collar",
    ):
        _must(f'"{role}"' in lib, f"powertrain role {role!r} missing", fails)

    # BoM PBR map
    _must(r"\bsic\b" in bom or "silicon\\s*carbide" in bom, "SiC PBR pattern missing", fails)
    _must("carbon\\s*fibre" in bom or "carbon fibre" in bom, "carbon fibre PBR pattern missing", fails)
    _must("ceramic" in bom and "dbc" in bom.lower(), "ceramic DBC PBR pattern missing", fails)

    # SiC stack morphology
    _must("def _fpk_place_sic_inverter_stack" in univ, "sic stack helper missing", fails)
    _must("_dbc" in univ, "SiC ceramic DBC mesh missing", fails)
    _must("tab_" in univ, "SiC copper terminal tabs missing", fails)

    # HV connector kit
    _must("def _fpk_place_hv_connector" in univ, "HV connector helper missing", fails)
    _must("safety_collar" in univ, "HV safety orange collar missing", fails)
    _must("hazard_band" in univ, "HV hazard band missing", fails)
    _must("pin_0" in univ or 'f"{name}_pin_{pi}"' in univ, "HV dual pins missing", fails)
    _must("hvil" in univ.lower(), "HVIL pin missing", fails)
    _must("braid" in univ.lower(), "HV braid boot missing", fails)

    # LV connector kit
    _must("def _fpk_place_lv_connector" in univ, "LV multipin helper missing", fails)
    _must("_fpk_place_lv_connector(" in univ, "LV helper not called from placer", fails)

    # Housing race details
    _must("housing_machine_band" in univ, "machined housing band missing", fails)
    _must("end_bell_face_" in univ, "end-bell machined faces missing", fails)
    _must("_foot" in univ, "cast rib T-section feet missing", fails)
    _must("nameplate_border" in univ, "nameplate border missing", fails)

    # Materials wired into traction placer
    _must("make_powertrain_role_mat" in univ, "placer does not use role palette", fails)
    _must("mat_hv_orange" in univ, "HV orange material not wired", fails)
    _must("mat_ceramic" in univ, "ceramic material not wired", fails)
    _must("mat_alum_mach" in univ, "machined Al material not wired", fails)

    # Coolant QD retained
    _must("def _fpk_place_coolant_qd_pair" in univ, "coolant QD helper missing", fails)
    _must("coolant_qd_collar" in univ or "m_se_td_qd_collar" in univ, "QD collar material missing", fails)

    # ship_ok must stay false in morphology note
    if NOTE.is_file():
        note = json.loads(NOTE.read_text(encoding="utf-8"))
        _must(note.get("ship_ok") is False, "morphology note must not set ship_ok", fails)
    else:
        fails.append(f"morphology note missing: {NOTE}")

    # proveCatch selftest strings still in traction keep-list suite
    _must("safety_collar" in univ and "make_powertrain_role_mat" in univ, "selftest markers incomplete", fails)

    proof = {
        "schema": "forgeos.motor_stack.blender_cycle3_source_proof/v1",
        "ok": not fails,
        "fails": fails,
        "ship_ok": False,
        "files": {
            "forge_blender_lib": str(LIB),
            "build_universal_scene": str(UNIV),
            "bom_physical_properties": str(BOM),
            "morphology_note": str(NOTE),
        },
    }
    out_paths = [
        REPO
        / "out"
        / "formula-e-front-mgu-20260729-1432"
        / "_motor_stack"
        / "blender_cycle3_source_proof.json",
    ]
    for p in out_paths:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {p}")

    print(json.dumps(proof, indent=2))
    if fails:
        print("FAIL:", *fails, sep="\n  ", file=sys.stderr)
        return 1
    print("prove_cycle3_race_kit_morphology: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
