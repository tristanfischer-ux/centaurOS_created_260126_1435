#!/usr/bin/env python3
"""Provisional partner seeds — temporary hypotheses until Jack/partners return.

Tristan 2026-08-04: without Jack feedback, freeze educated guesses so the twin
is 100% consistent under a named hypothesis. When partners replace a seed,
dependent results change. This is NOT measured data, NOT ship_ok, NOT homologation.

Writes:
  _motor_stack/provisional_partner_seeds.json
  jack pack page 25 + ABD inputs
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
PATH_B = "em_fia_front_kit_case_PATH_B_DEC009.json"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _q(quantities: dict, key: str, default=None):
    r = quantities.get(key)
    if isinstance(r, dict):
        return r.get("value", default)
    return default if r is None else r


def build_seeds(twin: Path) -> dict:
    ms = twin / "_motor_stack"
    st = json.loads((twin / "state.json").read_text())
    q = st["orchestratorContract"]["quantities"]
    pb = json.loads((ms / PATH_B).read_text()) if (ms / PATH_B).is_file() else {}
    wik = pb.get("works_in_kit_context") or {}
    iq = pb.get("input_quantities") or {}
    cap = {}
    if (ms / "dc_link_capacitor_concept_screen.json").is_file():
        cap = json.loads((ms / "dc_link_capacitor_concept_screen.json").read_text())
    inv = {}
    if (ms / "inverter_packaging_fia_front_kit_case.json").is_file():
        inv = json.loads((ms / "inverter_packaging_fia_front_kit_case.json").read_text())
    inv_scr = inv.get("screening_results") or {}
    env = (cap.get("envelope") or {}) if cap else {}

    bay_w = float(_q(q, "front_bay_envelope_w_mm") or 343)
    bay_d = float(_q(q, "front_bay_envelope_d_mm") or 259)
    bay_h = float(_q(q, "front_bay_envelope_h_mm") or 267)

    # Provisional interface XYZ — bay-local mm, origin at bay corner min-corner.
    # Educated packaging layout only — NOT a chassis ICD.
    iface = {
        "coordinate_frame": "bay_local_mm_origin_min_corner_W_D_H",
        "bay_mm": {"w": bay_w, "d": bay_d, "h": bay_h},
        "ports": [
            {
                "id": "HV_DC_IN",
                "xyz_mm": [bay_w * 0.92, bay_d * 0.15, bay_h * 0.55],
                "direction": "+W",
                "class": "HV_DC_connector_class",
            },
            {
                "id": "COOLANT_IN",
                "xyz_mm": [bay_w * 0.12, bay_d * 0.08, bay_h * 0.35],
                "direction": "-D",
                "class": "QD_coolant",
            },
            {
                "id": "COOLANT_OUT",
                "xyz_mm": [bay_w * 0.28, bay_d * 0.08, bay_h * 0.35],
                "direction": "-D",
                "class": "QD_coolant",
            },
            {
                "id": "LV_CAN",
                "xyz_mm": [bay_w * 0.88, bay_d * 0.85, bay_h * 0.70],
                "direction": "+W",
                "class": "LV_signal",
            },
            {
                "id": "HALFSHAFT_L",
                "xyz_mm": [bay_w * 0.08, bay_d * 0.50, bay_h * 0.45],
                "direction": "-W",
                "class": "mechanical_output",
            },
            {
                "id": "HALFSHAFT_R",
                "xyz_mm": [bay_w * 0.08, bay_d * 0.50, bay_h * 0.45],
                "direction": "note_single_output_path_provisional",
                "class": "mechanical_output",
            },
            {
                "id": "MOUNT_A",
                "xyz_mm": [bay_w * 0.20, bay_d * 0.20, 0.0],
                "direction": "-H",
                "class": "bay_mount",
            },
            {
                "id": "MOUNT_B",
                "xyz_mm": [bay_w * 0.80, bay_d * 0.20, 0.0],
                "direction": "-H",
                "class": "bay_mount",
            },
            {
                "id": "MOUNT_C",
                "xyz_mm": [bay_w * 0.20, bay_d * 0.80, 0.0],
                "direction": "-H",
                "class": "bay_mount",
            },
            {
                "id": "MOUNT_D",
                "xyz_mm": [bay_w * 0.80, bay_d * 0.80, 0.0],
                "direction": "-H",
                "class": "bay_mount",
            },
        ],
        "replace_with": "Chassis ICD XYZ from team (BARB-ICD-XYZ)",
    }

    seeds = [
        {
            "id": "S-EM-TRUTH",
            "domain": "electromagnetics",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "Until dyno returns, Path B FE kit-case mean torque is the working EM truth",
            "value": {
                "path_b_mean_nm": wik.get("torque_magnitude_mean_nm") or 122.099939,
                "architecture_duty_nm": wik.get("required_shaft_torque_nm") or 104.098914,
                "binding_duty_nm": _q(q, "binding_duty_shaft_torque_nm") or 125.214912,
                "rpm": iq.get("max_rotor_speed_rpm") or 24000,
                "stack_mm": (pb.get("machine_geometry") or {}).get("active_length_mm") or 130,
                "magnets": "6.0 × 22.5 mm, 16 regions",
                "current_angle_context_deg": -30,
            },
            "basis": "em_fia_front_kit_case_PATH_B_DEC009.json",
            "replace_with": "BARB-DYNO measured map @ 24k / 60 °C / 12 L/min",
            "if_changed": "Re-run Path B correlation, dual bars, ripple, voltage screens, ABD results",
        },
        {
            "id": "S-DUTY-LAP",
            "domain": "duty_cycle",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "Until lap log returns, DEC-008 intermittent vignette is the thermal duty hypothesis",
            "value": {
                "vignette": "24 s on / 100 s class intermittent regen",
                "continuous_electrical_kw": 250,
                "magnet_temp_intermittent_c": _q(q, "mgu_magnet_temp_c") or 99.4,
                "magnet_temp_continuous_screen_c": _q(q, "magnet_temperature_screen_c") or 159.35,
            },
            "basis": "DEC-008 + twin magnet stamps",
            "replace_with": "BARB-DUTY-CYCLE lap/stint CSV ≥20 Hz",
            "if_changed": "Re-stamp thermal storyboard, duty_torque_screen narrative, cooling margins",
        },
        {
            "id": "S-COOLANT",
            "domain": "thermal_hydraulic",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "Coolant boundary until flow bench",
            "value": {
                "inlet_c": _q(q, "coolant_inlet_c") or 60,
                "flow_l_min": _q(q, "coolant_flow_l_min") or 12,
                "network_delta_p_kpa_seed": 45.08,
            },
            "basis": "twin seeds + analytical cooling network",
            "replace_with": "BARB-FLOW-BENCH measured Δp/flow/wall taps",
            "if_changed": "Re-run cooling network + module/winding temps",
        },
        {
            "id": "S-BUS-PE",
            "domain": "power_electronics",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "DC bus + SiC class + ESL until supplier/double-pulse",
            "value": {
                "vdc_nom_v": iq.get("dc_bus_voltage_v") or 750,
                "vdc_min_v": iq.get("dc_bus_min_voltage_v") or 600,
                "vdc_max_v": iq.get("dc_bus_max_voltage_v") or 900,
                "sic_module_count_class": inv_scr.get("sic_module_count") or 3,
                "esl_nominal_nh": inv_scr.get("bus_esl_nominal_nh") or 6.39,
                "esl_band_nh": [4.15, 9.9],
                "cap_c_uF_band": (env.get("c_min_uF") or {"min": 71, "max": 884}),
                "cap_vol_cm3_nom_band": env.get("volume_cm3_nom_band"),
                "mpn": "NO_MPN_CLASS_ONLY",
            },
            "basis": "packaging + capacitor concept screens",
            "replace_with": "BARB-SIC-MODULE + BARB-DOUBLE-PULSE + film cap MPN",
            "if_changed": "Re-run ESL budget, cap envelope, inverter mass, voltage util",
        },
        {
            "id": "S-PCB",
            "domain": "electronics",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "Forge draft PCBs remain the working topology until supplier Gerbers",
            "value": {
                "disposition": "NOT_FABRICATION_READY",
                "boards": "gate-drive + control drafts",
                "supplier_gerbers": False,
            },
            "basis": "twin pcb architecture",
            "replace_with": "BARB-GERBERS supplier-stamped stack-up",
            "if_changed": "PCB honesty sheet + fab disposition only — do not claim FAB-READY from drafts",
        },
        {
            "id": "S-IFACE-XYZ",
            "domain": "vehicle_interface",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "Bay-local provisional port/mount XYZ for packaging & GA layout",
            "value": iface,
            "basis": "educated packaging layout inside 343×259×267 bay — NOT chassis ICD",
            "replace_with": "BARB-ICD-XYZ team interface control drawing",
            "if_changed": "Update Blender ports, GA, single-line leaders, mount screens",
        },
        {
            "id": "S-GEAR",
            "domain": "driveline",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "Ratio seed 8 held; planetary nest strength remains architecture hold",
            "value": {
                "gear_ratio": _q(q, "gear_ratio") or 8,
                "architecture_hold": "PLANETARY_STRENGTH_VS_ROTOR_BORE",
                "writeback_invalidated": True,
                "working_topology_hypothesis": (
                    "Keep ratio 8 for vehicle math; treat nest as packaging seed only "
                    "until bore/topology change unblocks strength"
                ),
            },
            "basis": "twin gear_ratio + gear_geometry_writeback invalidated",
            "replace_with": "BARB-GEAR-STRENGTH topology decision + BARB-GEAR-OIL-BENCH",
            "if_changed": "ISO 6336, oil screen, halfshaft packaging, mass remainder",
        },
        {
            "id": "S-ROTOR-FOS",
            "domain": "structures",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "Screening FoS 1.74 @ 24k is working structural hypothesis until instrumented overspeed",
            "value": {
                "screening_fos_24k": _q(q, "dec_009_adopted_rotor_fos") or 1.74,
                "assumed_yield_mpa": 355,
                "release_fos_closed": False,
            },
            "basis": "CalculiX speed sweep / DEC-009",
            "replace_with": "BARB-ROTOR-RETENTION instrumented overspeed",
            "if_changed": "Release FoS narrative only — screening card stays labelled screening",
        },
        {
            "id": "S-NVH",
            "domain": "nvh",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "No modal numbers invented; OPEN register is the working state",
            "value": {
                "modal_hz": None,
                "policy": "explicit_OPEN_until_mounts_and_dyno_NVH",
            },
            "basis": "W2.11 NVH OPEN register",
            "replace_with": "BARB-NVH + frozen mounts",
            "if_changed": "Only then run housing modal",
        },
        {
            "id": "S-IRON-LOSS",
            "domain": "losses",
            "status": "PROVISIONAL_HYPOTHESIS",
            "statement": "Iron loss working band until calorimeter",
            "value": {
                "lamination_mid_w": 6035.1,
                "class_band_kw": [3.9, 8.5],
                "dec009_stamp_w": _q(q, "mgu_iron_loss_w") or 11732.5,
            },
            "basis": "W2.7 corner table + DEC-009 stamp",
            "replace_with": "BARB-IRON-LOSS calorimeter / transient FE",
            "if_changed": "Thermal network loss inject + efficiency story",
        },
    ]

    return {
        "schema": "forgeos.fpk.provisional_partner_seeds/v1",
        "status": "HYPOTHESIS_SET_ACTIVE",
        "ship_ok": False,
        "homologation": "unchanged_~1/10_until_partners_replace_seeds",
        "ran_at": _iso(),
        "policy": {
            "rule": (
                "Design and screen 100% consistently under these seeds. "
                "Never present a seed as measured partner data. "
                "When a partner replaces a seed, invalidate and re-run dependents listed in if_changed."
            ),
            "authority": "Forge provisional until partner overwrite",
            "ship_ok": False,
            "bar_a": "may improve definition under hypothesis; does not close dyno/hardware Bar B",
            "bar_b": "opens only when partners replace seeds with measured artefacts",
        },
        "seeds": seeds,
        "explicitly_not_claimed": [
            "measured_dyno_map",
            "supplier_Gerbers",
            "chassis_ICD_XYZ",
            "SiC_MPN",
            "measured_ESL",
            "release_FoS",
            "ship_ok",
            "homologation_ready",
        ],
        "release_statement": (
            "Provisional partner seeds for autonomous progress without Jack. "
            "Hypothesis-consistent only. ship_ok false."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"
    ms.mkdir(parents=True, exist_ok=True)
    rep = build_seeds(twin)
    out = ms / "provisional_partner_seeds.json"
    out.write_text(json.dumps(rep, indent=2) + "\n")
    print(json.dumps({"wrote": str(out), "n_seeds": len(rep["seeds"]), "ship_ok": False}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
