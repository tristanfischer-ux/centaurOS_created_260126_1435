#!/usr/bin/env python3
"""FPK Blender ontology coverage — every first-principles part → mesh.

INTENT (2026-07-29 Tristan): engineering drawings / cutaways must show ALL
sub-components from the FPK ontology, each forced by physics (FFF) — not a
shelf+blob. This module is the SOURCE checklist + proveCatch.

FLOW:
  fpk_first_principles.all_fpk_parts()
    → ONTOLOGY_MESH_MAP (part_id → mesh regex + function)
    → evaluate_blender_coverage(form-meshes.json)
    → proveCatch fires when any required part has zero meshes

DECISION: deep physics-tree leaves (enamel, TIM, helicoil…) stay BoM/physics
only; Blender covers the 48 part-level ontology IDs (covers on everything).

Run:
  python3 scripts/lib/fpk_blender_coverage.py --selftest
  python3 scripts/lib/fpk_blender_coverage.py out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

from fpk_first_principles import all_fpk_parts

SCHEMA = "fpk-blender-coverage/1"
SOURCE = "scripts/lib/fpk_blender_coverage.py"

# INTENT: each ontology part_id maps to ≥1 Blender mesh regex + the function
# that forces the form (FFF). Patterns match stripped mesh names in form-meshes.
# GOTCHA: one mesh may serve one ontology id; aliases allowed when physics says
# the same volume (e.g. cold plate = mcu_cold_plate).
ONTOLOGY_MESH_MAP: dict[str, dict[str, Any]] = {
    # ── MCU ──────────────────────────────────────────────────────────────
    "inverter_housing": {
        "patterns": [r"^u_se_td_inverter_housing(_wall_\d+)?$"],
        "function": "EMI/structural enclosure around SiC stack + DC link",
        "physics": "creepage + coolant/HV isolation volume",
    },
    "inverter_cover": {
        "patterns": [r"^u_se_td_inverter_cover$"],
        "function": "Service lid closes MCU volume; fastener grid",
        "physics": "cover on everything — seal + service access",
    },
    "mcu_cold_plate": {
        "patterns": [r"^u_se_td_inverter_coldplate(_rib_\d+)?$"],
        "function": "Reject SiC + DC-link loss into EGW",
        "physics": "Q̇ → channel / ribbed plate from fluids+ht",
    },
    "sic_power_module_stack": {
        "patterns": [r"^u_se_td_sic_inverter(_mod_\d+)?$"],
        "function": "3-phase SiC power stage",
        "physics": "module_count from sic-loss / phase current",
    },
    "dc_link_capacitor_bank": {
        "patterns": [r"^u_se_td_dclink_cap_\d+$"],
        "function": "DC-link energy / ripple buffer",
        "physics": "C≈I/(8·f_sw·ΔV) → N caps",
    },
    "hv_dc_busbar_link": {
        "patterns": [r"^u_se_td_hv_bus(_leg_[vh])?$"],
        "function": "HV± laminated run MCU↔connector",
        "physics": "section from I_ph / J_cu; ESL from fpk:bus-esl",
    },
    "ac_phase_busbar_pierce": {
        "patterns": [r"^u_se_td_phase_bus_\d+(_leg_[vh])?$"],
        "function": "UVW pierce MCU shelf → stator terminals",
        "physics": "3× bus from phase current; no long cable loom",
    },
    "gate_driver_board": {
        "patterns": [r"^u_se_td_gate_drive_pcb$", r"^u_se_td_pcb$"],
        "function": "Gate ×6 + desat channels for SiC",
        "physics": "channel-true PCB architecture",
        "alias_ok": True,
    },
    "oem_inverter_control_board": {
        "patterns": [r"^u_se_td_control_pcb$", r"^u_se_td_pcb$"],
        "function": "OEM control / CAN-FD / resolver decode",
        "physics": "MCU shelf area split: control vs gate-drive",
        "alias_ok": True,
    },
    "hv_dc_connector": {
        "patterns": [r"^u_se_td_hv_connector(_barrel)?$"],
        "function": "HV DC interface to vehicle",
        "physics": "current + creepage → shell OD",
    },
    "lv_signal_connector": {
        "patterns": [r"^u_se_td_lv_connector$"],
        "function": "LV / CAN / HVIL signals",
        "physics": "ICD pin count OPEN until supplier",
    },
    "coolant_port_in": {
        "patterns": [r"^u_se_td_coolant_in(_flange)?$"],
        "function": "Coolant inlet boss",
        "physics": "flow L/min → port ID",
    },
    "coolant_port_out": {
        "patterns": [r"^u_se_td_coolant_out(_flange)?$"],
        "function": "Coolant outlet boss",
        "physics": "flow L/min → port ID",
    },
    # ── Motor ────────────────────────────────────────────────────────────
    "motor_outer_casing": {
        "patterns": [r"^u_se_td_motor_housing$"],
        "function": "Structural barrel + jacket land",
        "physics": "housing OD/L from IPMSM + bay clamp",
    },
    "motor_cooling_jacket": {
        "patterns": [r"^u_se_td_coolant_jacket$", r"^u_se_td_jacket_band$"],
        "function": "Stator heat reject to EGW",
        "physics": "channel count from thermal lump",
    },
    "stator_laminations": {
        "patterns": [r"^u_se_td_stator_ring$", r"^u_se_td_stator_hint$"],
        "function": "Magnetic circuit yoke + teeth volume",
        "physics": "stator OD/ID from airgap + build factor",
    },
    "stator_windings": {
        "patterns": [r"^u_se_td_winding_end_\d+$"],
        "function": "Copper turns / end-winding overhang",
        "physics": "turns/phase from electric loading",
    },
    "permanent_magnet_set": {
        "patterns": [r"^u_se_td_magnet_\d+$"],
        "function": "PM excitation on rotor",
        "physics": "2·pole_pairs segments; Br grade seed",
    },
    "hollow_rotor_barrel": {
        "patterns": [r"^u_se_td_hollow_rotor$", r"^u_se_td_rotor_hint$"],
        "function": "PM carrier + transmission cavity",
        "physics": "rotor OD/ID; bore hosts planetary",
    },
    "motor_shaft": {
        "patterns": [r"^u_se_td_motor_shaft$"],
        "function": "Torque path sun ↔ rotor structure",
        "physics": "shaft OD from √T seed",
    },
    "front_bearing": {
        "patterns": [r"^u_se_td_bearing_cap_0$", r"^u_se_td_bearing_cap_\d+$"],
        "function": "Rotor support / L10 life",
        "physics": "bore from shaft OD",
    },
    "rear_bearing": {
        "patterns": [r"^u_se_td_bearing_cap_1$", r"^u_se_td_bearing_cap_\d+$"],
        "function": "Rotor support opposite end",
        "physics": "bore from shaft OD",
    },
    "front_end_bell": {
        "patterns": [r"^u_se_td_end_bell_0$", r"^u_se_td_end_bell_\d+$"],
        "function": "Close motor cavity + bearing land",
        "physics": "cover on everything",
    },
    "rear_end_bell": {
        "patterns": [r"^u_se_td_end_bell_1$", r"^u_se_td_end_bell_\d+$"],
        "function": "Close motor cavity opposite end",
        "physics": "cover on everything",
    },
    "resolver": {
        "patterns": [r"^u_se_td_resolver_bulge$", r"^u_se_td_resolver$"],
        "function": "Rotor angle for FOC",
        "physics": "sensor at shaft end",
    },
    "encoder": {
        "patterns": [r"^u_se_td_encoder$"],
        "function": "Redundant / high-res angle (if fitted)",
        "physics": "opposite or coax sensor land",
    },
    "motor_power_terminals": {
        "patterns": [r"^u_se_td_motor_terminal_\d+$"],
        "function": "UVW termination to phase busbars",
        "physics": "3 terminals at pierce interface",
    },
    "motor_cover": {
        "patterns": [r"^u_se_td_motor_cover$"],
        "function": "Axial closure of motor barrel",
        "physics": "cover on everything",
    },
    # ── Transmission ─────────────────────────────────────────────────────
    "gearbox_housing": {
        "patterns": [r"^u_se_td_gearbox$"],
        "function": "Planetary nest volume inside rotor",
        "physics": "ring ID × gear face from ratio + bore",
    },
    "gearbox_cover": {
        "patterns": [r"^u_se_td_gearbox_cover$"],
        "function": "Close gear nest axial face",
        "physics": "cover on everything",
    },
    "sun_gear": {
        "patterns": [r"^u_se_td_sun_gear(_tooth_\d+)?$"],
        "function": "Input sun of planetary",
        "physics": "sun OD + teeth from gear_ratio",
    },
    "planet_gears": {
        "patterns": [r"^u_se_td_planet_\d+(_tooth_\d+)?$"],
        "function": "Planet pinions on carrier PCD",
        "physics": "planet OD/count from ring−sun",
    },
    "ring_gear": {
        "patterns": [r"^u_se_td_ring_gear(_tooth_\d+)?$"],
        "function": "Fixed ring inside rotor bore",
        "physics": "ring ID from rotor ID − clearance",
    },
    "planet_carrier": {
        "patterns": [r"^u_se_td_planet_carrier$"],
        "function": "Carries planets; output to diff",
        "physics": "carrier OD from PCD",
    },
    "pinion_gear": {
        "patterns": [r"^u_se_td_pinion_gear(_tooth_\d+)?$"],
        "function": "Diff spider pinion",
        "physics": "bevel/seed pinion in diff nest",
    },
    "intermediate_shaft": {
        "patterns": [r"^u_se_td_intermediate_shaft$"],
        "function": "Carrier↔diff torque path",
        "physics": "short shaft OD from T_out",
    },
    "differential_carrier": {
        "patterns": [r"^u_se_td_diff_nest$", r"^u_se_td_diff_bulge$"],
        "function": "Mini-diff case in rotor",
        "physics": "diff OD/L from nest budget",
    },
    "side_gears": {
        "patterns": [r"^u_se_td_side_gear_\d+$"],
        "function": "Diff side gears → halfshafts",
        "physics": "2× side gears in nest",
    },
    "output_gears": {
        "patterns": [r"^u_se_td_output_gear_\d+$"],
        "function": "Output mesh / flange drive",
        "physics": "pair at shaft stubs",
    },
    "output_shaft_left": {
        "patterns": [r"^u_se_td_output_shaft$"],
        "function": "LH wheel torque exit",
        "physics": "stub from shaft OD seed",
    },
    "output_shaft_right": {
        "patterns": [r"^u_se_td_output_shaft_b$"],
        "function": "RH wheel torque exit",
        "physics": "stub from shaft OD seed",
    },
    "gearbox_bearings": {
        "patterns": [r"^u_se_td_gearbox_bearing_\d+$"],
        "function": "Support sun/carrier/diff",
        "physics": "bearing rings at nest ends",
    },
    "oil_seals": {
        "patterns": [r"^u_se_td_oil_seal_\d+$"],
        "function": "Retain gear oil at shaft exits",
        "physics": "seal_count from first-principles",
    },
    "gear_oil_charge": {
        "patterns": [r"^u_se_td_gear_oil$"],
        "function": "Lubricant volume in nest",
        "physics": "oil_volume_ml seed — translucent cue",
    },
    # ── Cassette ─────────────────────────────────────────────────────────
    "traction_drive_housing": {
        "patterns": [r"^u_se_td_pack_housing(_flange_\d+)?$", r"^u_se_td_pack_base(_rail_\d+)?$"],
        "function": "Unitised bay shell / spine",
        "physics": "bay envelope − wall",
    },
    "cassette_cover": {
        "patterns": [r"^u_se_td_cassette_cover$"],
        "function": "Top closure of cassette",
        "physics": "cover on everything",
    },
    "mounting_ear_set": {
        "patterns": [r"^u_se_td_mount_ear_\d+$"],
        "function": "Chassis mount ears",
        "physics": "load path into bay",
    },
    "halfshaft_output_flange_pair": {
        "patterns": [r"^u_se_td_halfshaft_flange_\d+$"],
        "function": "Halfshaft bolt flanges",
        "physics": "flange OD from shaft + bolt circle",
    },
}


def _load_form_meshes(run_dir: Path) -> dict[str, Any]:
    for rel in ("form-meshes.json", "blender-universal/form-meshes.json"):
        path = run_dir / rel
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    return {}


def _mesh_names(form: Mapping[str, Any]) -> list[str]:
    meshes = form.get("meshes")
    if isinstance(meshes, list):
        return [str(m) for m in meshes]
    return []


def evaluate_blender_coverage(
    form_meshes: Mapping[str, Any] | None = None,
    *,
    run_dir: Path | None = None,
) -> dict[str, Any]:
    """Score ontology part coverage against delivered Blender meshes.

    @description Every ``all_fpk_parts()`` id must match ≥1 mesh regex.
    @returns coverage dict with missing/present + proveCatch payload
    """
    form = dict(form_meshes or {})
    if run_dir is not None and not form:
        form = _load_form_meshes(Path(run_dir))
    names = _mesh_names(form)
    present_rows: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []

    ontology = all_fpk_parts()
    for assembly, part_id, name_human in ontology:
        spec = ONTOLOGY_MESH_MAP.get(part_id)
        if spec is None:
            missing.append(
                {
                    "assembly": assembly,
                    "part_id": part_id,
                    "name": name_human,
                    "reason": "no_mesh_map_entry",
                }
            )
            continue
        patterns = [re.compile(p) for p in spec["patterns"]]
        hits = [n for n in names if any(p.search(n) for p in patterns)]
        row = {
            "assembly": assembly,
            "part_id": part_id,
            "name": name_human,
            "function": spec.get("function"),
            "physics": spec.get("physics"),
            "meshes": hits,
            "ok": bool(hits),
        }
        if hits:
            present_rows.append(row)
        else:
            missing.append(row)

    total = len(ontology)
    covered = len(present_rows)
    score = (covered / total) if total else 0.0
    return {
        "schema": SCHEMA,
        "source": SOURCE,
        "mesh_count": len(names),
        "ontology_count": total,
        "covered": covered,
        "missing_count": len(missing),
        "score": round(score, 4),
        "ok": len(missing) == 0,
        "missing": missing,
        "present": present_rows,
        "form": form.get("form"),
        "architecture": form.get("architecture"),
    }


def prove_catch_incomplete_coverage() -> dict[str, Any]:
    """Adversarial: form-meshes with only pack_base must FIRE incomplete coverage.

    @description Gate intent — missing ontology parts must not silently pass.
    """
    bad = {
        "form": "traction_drive_concentric_bay_fill",
        "meshes": ["u_se_td_pack_base", "u_se_td_motor_housing"],
    }
    result = evaluate_blender_coverage(bad)
    fired = (not result["ok"]) and result["missing_count"] >= 40
    return {
        "gate": "fpk_blender_ontology_coverage",
        "fires": fired,
        "missing_count": result["missing_count"],
        "score": result["score"],
        "intended_action": "block_route_to_build_universal_scene_placer",
    }


def stamp_coverage(run_dir: Path, state: dict[str, Any] | None = None) -> dict[str, Any]:
    """Write coverage into twin artefacts + optional state.

    @description Persist evaluate result; never sets ship_ok true.
    """
    result = evaluate_blender_coverage(run_dir=run_dir)
    result["ship_ok"] = False
    out_json = run_dir / "JLR-FE-FRONT-FPK-BLENDER-COVERAGE.json"
    out_json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    lines = [
        "# FPK Blender ontology coverage (FFF)",
        "",
        f"**Score:** {result['score']:.1%} "
        f"({result['covered']}/{result['ontology_count']} parts)  ",
        f"**Meshes:** {result['mesh_count']}  ",
        f"**ok:** `{str(result['ok']).lower()}`  ",
        f"**ship_ok:** false  ",
        "",
        "## Missing (must place from physics)",
        "",
    ]
    if not result["missing"]:
        lines.append("_None — all ontology parts have Blender meshes._")
    else:
        lines.append("| Assembly | Part | Function |")
        lines.append("|---|---|---|")
        for m in result["missing"]:
            lines.append(
                f"| {m.get('assembly')} | `{m.get('part_id')}` | "
                f"{m.get('function') or m.get('reason')} |"
            )
    (run_dir / "JLR-FE-FRONT-FPK-BLENDER-COVERAGE.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )
    if isinstance(state, dict):
        state["fpkBlenderCoverage"] = {
            "schema": SCHEMA,
            "score": result["score"],
            "ok": result["ok"],
            "covered": result["covered"],
            "ontology_count": result["ontology_count"],
            "missing_count": result["missing_count"],
            "missing_ids": [m["part_id"] for m in result["missing"]],
            "ship_ok": False,
        }
        state["ship_ok"] = False
    # Merge ontology map into form-meshes when present
    form_path = run_dir / "form-meshes.json"
    if form_path.is_file():
        form = json.loads(form_path.read_text(encoding="utf-8"))
        form["ontology_coverage"] = {
            "score": result["score"],
            "ok": result["ok"],
            "covered": result["covered"],
            "ontology_count": result["ontology_count"],
            "missing_ids": [m["part_id"] for m in result["missing"]],
        }
        form_path.write_text(json.dumps(form, indent=2), encoding="utf-8")
    return result


def _selftest() -> int:
    bad = 0
    # Map covers every ontology id
    for _a, pid, _n in all_fpk_parts():
        if pid not in ONTOLOGY_MESH_MAP:
            print(f"  FAIL map missing {pid}")
            bad += 1
    if bad:
        return 1
    catch = prove_catch_incomplete_coverage()
    if not catch["fires"]:
        print("  FAIL proveCatch must fire on sparse meshes")
        return 1
    # Synthetic full coverage
    synth_meshes = [
        "u_se_td_inverter_housing",
        "u_se_td_inverter_cover",
        "u_se_td_inverter_coldplate",
        "u_se_td_sic_inverter",
        "u_se_td_dclink_cap_0",
        "u_se_td_hv_bus_leg_v",
        "u_se_td_phase_bus_0_leg_v",
        "u_se_td_gate_drive_pcb",
        "u_se_td_control_pcb",
        "u_se_td_hv_connector",
        "u_se_td_lv_connector",
        "u_se_td_coolant_in",
        "u_se_td_coolant_out",
        "u_se_td_motor_housing",
        "u_se_td_coolant_jacket",
        "u_se_td_stator_ring",
        "u_se_td_winding_end_0",
        "u_se_td_magnet_0",
        "u_se_td_hollow_rotor",
        "u_se_td_motor_shaft",
        "u_se_td_bearing_cap_0",
        "u_se_td_bearing_cap_1",
        "u_se_td_end_bell_0",
        "u_se_td_end_bell_1",
        "u_se_td_resolver_bulge",
        "u_se_td_encoder",
        "u_se_td_motor_terminal_0",
        "u_se_td_motor_cover",
        "u_se_td_gearbox",
        "u_se_td_gearbox_cover",
        "u_se_td_sun_gear",
        "u_se_td_planet_0",
        "u_se_td_ring_gear",
        "u_se_td_planet_carrier",
        "u_se_td_pinion_gear",
        "u_se_td_intermediate_shaft",
        "u_se_td_diff_nest",
        "u_se_td_side_gear_0",
        "u_se_td_output_gear_0",
        "u_se_td_output_shaft",
        "u_se_td_output_shaft_b",
        "u_se_td_gearbox_bearing_0",
        "u_se_td_oil_seal_0",
        "u_se_td_gear_oil",
        "u_se_td_pack_housing",
        "u_se_td_cassette_cover",
        "u_se_td_mount_ear_0",
        "u_se_td_halfshaft_flange_0",
    ]
    good = evaluate_blender_coverage({"meshes": synth_meshes})
    if not good["ok"]:
        print("  FAIL synthetic full set must cover:", good["missing"])
        return 1
    print(
        f"fpk_blender_coverage --selftest OK — ontology={good['ontology_count']} "
        f"proveCatch_fires={catch['fires']}"
    )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("run_dir", nargs="?", help="Twin out/ dir")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--stamp", action="store_true", help="Write coverage artefacts")
    args = ap.parse_args(list(argv) if argv is not None else None)
    if args.selftest:
        return _selftest()
    if not args.run_dir:
        ap.error("run_dir required unless --selftest")
    run_dir = Path(args.run_dir)
    if args.stamp:
        state_path = run_dir / "state.json"
        state = None
        if state_path.is_file():
            state = json.loads(state_path.read_text(encoding="utf-8"))
        result = stamp_coverage(run_dir, state)
        if state is not None:
            state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    else:
        result = evaluate_blender_coverage(run_dir=run_dir)
        print(json.dumps(result, indent=2))
    print(
        f"coverage={result['score']:.1%} "
        f"({result['covered']}/{result['ontology_count']}) "
        f"missing={result['missing_count']} ok={result['ok']}",
        file=sys.stderr,
    )
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
