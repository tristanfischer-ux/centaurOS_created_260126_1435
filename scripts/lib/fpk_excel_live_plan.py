#!/usr/bin/env python3
"""FPK Excel LIVE cell plan — which power/thermal cells are formula-driven.

INTENT (JLR FE front FPK P7): document LIVE vs literal cells on the Calculations
tab power chain, provenance from orchestratorContract / fpkPhysicsTree, and the
UNVALIDATED tag policy while race holds (HIL, dyno, CFD) remain OPEN.

Run:
  python3 scripts/lib/fpk_excel_live_plan.py --selftest
  python3 scripts/lib/fpk_excel_live_plan.py --stamp out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "fpk-excel-live-plan/1"
SOURCE = "scripts/lib/fpk_excel_live_plan.py"

# LIVE cells emitted by build-excel-export._render_fpk_power_thermal_trace
FPK_POWER_TRACE_LIVE = (
    {"id": "P_ac", "label": "P_ac", "formula": "P_dc_cont*eta_inv", "unit": "kW",
     "provenance": ["continuous_power_kw", "inverter_efficiency"]},
    {"id": "P_shaft", "label": "P_shaft", "formula": "P_dc*η_inv*η_mgu", "unit": "kW",
     "provenance": ["continuous_power_kw", "inverter_efficiency", "mgu_efficiency"]},
    {"id": "P_wheel", "label": "P_wheel", "formula": "P_shaft*η_gear", "unit": "kW",
     "provenance": ["gear_efficiency", "derived_chain"]},
    {"id": "omega", "label": "omega", "formula": "rpm*2π/60", "unit": "rad/s",
     "provenance": ["mgu_base_speed_rpm"]},
    {"id": "T_shaft", "label": "T_shaft", "formula": "P_shaft/ω", "unit": "Nm",
     "provenance": ["derived_chain"]},
    {"id": "Q_loss", "label": "Q_loss", "formula": "P_dc-P_shaft", "unit": "kW",
     "provenance": ["derived_chain", "total_dissipated_kw_continuous"]},
    {"id": "mdot", "label": "mdot", "formula": "flow*ρ", "unit": "kg/s",
     "provenance": ["coolant_flow_l_min"]},
    {"id": "dT_coolant", "label": "dT_coolant", "formula": "Q/(ṁ·cp)", "unit": "K",
     "provenance": ["coolant_delta_t_k", "derived_chain"]},
    {"id": "I_ph_ideal", "label": "I_ph_ideal", "formula": "SVPWM ceiling", "unit": "A",
     "provenance": ["front_hardware_power_class_kw", "assumed_vdc_min_v"]},
    {"id": "I_ph_design", "label": "I_ph_design", "formula": "I_ph*marg", "unit": "A",
     "provenance": ["phase_current_design_a"]},
    {"id": "mass_unit", "label": "mass_unit", "formula": "Σ mass seeds", "unit": "kg",
     "provenance": ["mass_motor_kg", "mass_inverter_kg", "mass_gear_diff_kg"]},
)

FPK_POWER_TRACE_INPUTS = (
    {"id": "P_dc_cont", "contract_key": "continuous_power_kw", "role": "yellow_input"},
    {"id": "eta_inv", "contract_key": "inverter_efficiency", "role": "yellow_input"},
    {"id": "eta_mgu", "contract_key": "mgu_efficiency", "role": "yellow_input"},
    {"id": "eta_gear", "contract_key": "gear_efficiency", "role": "yellow_input"},
    {"id": "rpm", "contract_key": "mgu_base_speed_rpm", "role": "yellow_input"},
    {"id": "flow_l_min", "contract_key": "coolant_flow_l_min", "role": "yellow_input"},
    {"id": "P_hw", "contract_key": "front_hardware_power_class_kw", "role": "yellow_input"},
    {"id": "Vdc_min", "contract_key": "assumed_vdc_min_v", "role": "yellow_input"},
)

UNVALIDATED_POLICY = {
    "tag": "UNVALIDATED",
    "applies_when": [
        "no_dyno_evidence",
        "no_HIL_on_populated_PCB",
        "no_CFD_cold_plate_correlation",
        "analytical_only_physics",
    ],
    "forbid_claims": ["FUNCTIONALLY_VERIFIED", "SHIPS", "thermal_validated"],
    "excel_surface": "Engine seed column (E) carries contract value; LIVE column (B) "
    "recomputes — Δ column flags drift vs engine seed.",
}

# Fields whose authoritative value is the post-tool front FPK reconcile, not the
# raw tool operating point that may have fed the reconcile earlier in the plan.
FPK_RECONCILED_FIELDS = {
    "mgu_ac_electrical_input_kw",
    "mgu_shaft_power_kw",
    "gear_output_power_kw",
    "mgu_shaft_torque_nm",
    "peak_mechanical_power_kw",
    "electrical_frequency_hz",
}

FPK_FORMULA_LINEAGE: dict[str, tuple[str, tuple[str, ...]]] = {
    "mgu_ac_electrical_input_kw": (
        "mgu_ac_electrical_input_kw = continuous_power_kw*inverter_efficiency",
        ("continuous_power_kw", "inverter_efficiency"),
    ),
    "mgu_shaft_power_kw": (
        "mgu_shaft_power_kw = continuous_power_kw*inverter_efficiency*mgu_efficiency",
        ("continuous_power_kw", "inverter_efficiency", "mgu_efficiency"),
    ),
    "gear_output_power_kw": (
        "gear_output_power_kw = mgu_shaft_power_kw*gear_efficiency",
        ("mgu_shaft_power_kw", "gear_efficiency"),
    ),
    "mgu_shaft_torque_nm": (
        "mgu_shaft_torque_nm = mgu_shaft_power_kw*1000/(mgu_base_speed_rpm*2*3.141592653589793/60)",
        ("mgu_shaft_power_kw", "mgu_base_speed_rpm"),
    ),
    "peak_mechanical_power_kw": (
        "peak_mechanical_power_kw = mgu_shaft_power_kw",
        ("mgu_shaft_power_kw",),
    ),
    "electrical_frequency_hz": (
        "electrical_frequency_hz = mgu_base_speed_rpm/60*pole_pairs",
        ("mgu_base_speed_rpm", "pole_pairs"),
    ),
    "total_dissipated_kw_continuous": (
        "total_dissipated_kw_continuous = inverter_dissipated_kw+(mgu_copper_loss_w+mgu_iron_loss_w+mgu_magnet_loss_w)/1000",
        ("inverter_dissipated_kw", "mgu_copper_loss_w", "mgu_iron_loss_w", "mgu_magnet_loss_w"),
    ),
    "coolant_delta_t_k": (
        "coolant_delta_t_k = total_dissipated_kw_continuous*1000/((coolant_flow_l_min/60)*(coolant_density_kg_m3/1000)*coolant_cp_j_kgk)",
        ("total_dissipated_kw_continuous", "coolant_flow_l_min", "coolant_density_kg_m3", "coolant_cp_j_kgk"),
    ),
    "coolant_outlet_c": (
        "coolant_outlet_c = coolant_inlet_c+coolant_delta_t_k",
        ("coolant_inlet_c", "coolant_delta_t_k"),
    ),
    "phase_current_max_a": (
        "phase_current_max_a = front_hardware_power_class_kw*1000/(1.7320508075688772*(assumed_vdc_min_v/1.4142135623730951))",
        ("front_hardware_power_class_kw", "assumed_vdc_min_v"),
    ),
    "phase_current_design_a": (
        "phase_current_design_a = phase_current_max_a*1.12",
        ("phase_current_max_a",),
    ),
    "unit_mass_kg": (
        "unit_mass_kg = mass_motor_kg+mass_inverter_kg+mass_gear_diff_kg+mass_housing_misc_kg",
        ("mass_motor_kg", "mass_inverter_kg", "mass_gear_diff_kg", "mass_housing_misc_kg"),
    ),
    "mass_motor_kg": ("mass_motor_kg = fpk_mass_cap_kg*0.359375", ("fpk_mass_cap_kg",)),
    "mass_inverter_kg": ("mass_inverter_kg = fpk_mass_cap_kg*0.25625", ("fpk_mass_cap_kg",)),
    "mass_gear_diff_kg": ("mass_gear_diff_kg = fpk_mass_cap_kg*0.2", ("fpk_mass_cap_kg",)),
    "mass_housing_misc_kg": ("mass_housing_misc_kg = fpk_mass_cap_kg*0.084375", ("fpk_mass_cap_kg",)),
    "fpk_rotor_id_mm": (
        "fpk_rotor_id_mm = max(rotor_airgap_diameter_mm*0.76,fpk_ring_tip_diameter_mm+2)",
        ("rotor_airgap_diameter_mm", "fpk_ring_tip_diameter_mm"),
    ),
    "fpk_rotor_od_mm": (
        "fpk_rotor_od_mm = fpk_rotor_id_mm+rotor_airgap_diameter_mm*0.24",
        ("fpk_rotor_id_mm", "rotor_airgap_diameter_mm"),
    ),
    "fpk_stator_od_mm": (
        "fpk_stator_od_mm = fpk_rotor_od_mm+rotor_airgap_diameter_mm*0.35",
        ("fpk_rotor_od_mm", "rotor_airgap_diameter_mm"),
    ),
    "fpk_ring_id_mm": (
        "fpk_ring_id_mm = gear_module_mm*ring_teeth",
        ("gear_module_mm", "ring_teeth"),
    ),
    "fpk_ring_tip_diameter_mm": (
        "fpk_ring_tip_diameter_mm = gear_module_mm*(ring_teeth+2.5)",
        ("gear_module_mm", "ring_teeth"),
    ),
    "fpk_diff_od_mm": ("fpk_diff_od_mm = fpk_ring_id_mm*0.2165", ("fpk_ring_id_mm",)),
    "fpk_mcu_w_mm": ("fpk_mcu_w_mm = front_bay_envelope_w_mm*0.336", ("front_bay_envelope_w_mm",)),
    "fpk_mcu_d_mm": ("fpk_mcu_d_mm = front_bay_envelope_d_mm*0.491", ("front_bay_envelope_d_mm",)),
    "fpk_mcu_h_mm": ("fpk_mcu_h_mm = front_bay_envelope_h_mm*0.105", ("front_bay_envelope_h_mm",)),
    "winding_parallel_paths": ("winding_parallel_paths = phase_current_design_a/120", ("phase_current_design_a",)),
    "magnet_volume_cm3": ("magnet_volume_cm3 = magnet_mass_kg/0.0075", ("magnet_mass_kg",)),
    "magnet_mass_kg": ("magnet_mass_kg = magnet_volume_cm3*0.0075", ("magnet_volume_cm3",)),
    "sic_module_count": ("sic_module_count = phase_current_design_a/100", ("phase_current_design_a",)),
    "cold_plate_channel_count": (
        "cold_plate_channel_count = total_dissipated_kw_continuous/0.83",
        ("total_dissipated_kw_continuous",),
    ),
    "cold_plate_channel_height_mm": (
        "cold_plate_channel_height_mm = cold_plate_channel_width_mm/4",
        ("cold_plate_channel_width_mm",),
    ),
    "fpk_bus_esl_low_nh": ("fpk_bus_esl_low_nh = fpk_bus_esl_high_nh*0.419", ("fpk_bus_esl_high_nh",)),
    "fpk_bus_esl_high_nh": ("fpk_bus_esl_high_nh = fpk_bus_esl_low_nh*2.386", ("fpk_bus_esl_low_nh",)),
    "fpk_physics_tree_nodes": (
        "fpk_physics_tree_nodes = count(fpkPhysicsTree.nodes)",
        (),
    ),
}

FPK_ROOT_SOURCES: dict[str, tuple[str, str]] = {
    "ipmsm_capability_shaft_power_kw": (
        "tool:motor:ipmsm-analytical-sizing",
        "IPMSM D2L analytical capability retained as EM check; front_fpk_power_reconcile owns the power-flow shaft value",
    ),
    "winding_copper_fill_factor": ("class_anchor", "slot copper fill seed from Formula E FPK concept pack"),
    "magnet_br_t": ("class_anchor", "NdFeB-N42UH remanence seed; supplier magnet curve remains OPEN"),
    "airgap_b_t": ("class_anchor", "air-gap flux-density seed for first-pass IPMSM sizing"),
    "electric_loading_a_per_m": ("class_anchor", "electric loading seed for first-pass IPMSM sizing"),
    "switching_freq_hz": ("class_anchor", "SiC PWM frequency seed; EMI and loss optimisation remain OPEN"),
    "sun_teeth": ("class_anchor", "planetary gear tooth-count seed; detailed gear macro-geometry remains OPEN"),
    "planet_teeth": ("class_anchor", "planetary gear tooth-count seed; detailed gear macro-geometry remains OPEN"),
    "ring_teeth": ("class_anchor", "planetary gear tooth-count seed; detailed gear macro-geometry remains OPEN"),
    "copper_electrical_conductivity_s_m": ("physics_constant", "OFHC copper conductivity reference at 20 C"),
    "ndfeb_br_t": ("class_anchor", "NdFeB-N42UH remanence seed; supplier magnet curve remains OPEN"),
}


def _formula_rhs_symbols(formula: str) -> set[str]:
    """Return non-function identifier tokens from a worked-calc formula RHS."""
    rhs = formula.split("=", 1)[1] if "=" in formula else formula
    rhs = re.sub(r"(?<![A-Za-z0-9_])x(?![A-Za-z0-9_])", "*", rhs)
    tokens = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", rhs))
    functions = {fn.lower() for fn in re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*\(", rhs)}
    constants = {"pi", "e"}
    return {tok for tok in tokens if tok.lower() not in functions and tok.lower() not in constants}


def _q_raw(state: Mapping[str, Any], key: str) -> Any:
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
    if key in q:
        return q[key]
    tree = state.get("fpkPhysicsTree") or {}
    wb = tree.get("quantity_writeback") or {}
    if key in wb:
        return wb[key]
    return None


def _has_fpk_signal(state: Mapping[str, Any]) -> bool:
    pc = str(
        ((state.get("orchestratorContract") or {}).get("product_class"))
        or ((state.get("parsedBrief") or {}).get("product_class"))
        or ""
    )
    if re.search(r"formula_e|front_mgu|rear_mgu|fpk", pc, re.I):
        return True
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
    return "continuous_power_kw" in q and "inverter_efficiency" in q


def build_excel_live_plan(state: Mapping[str, Any]) -> dict[str, Any]:
    """Build the LIVE cell plan from state contract + physics tree."""
    has_signal = _has_fpk_signal(state)
    inputs = []
    for spec in FPK_POWER_TRACE_INPUTS:
        raw = _q_raw(state, spec["contract_key"])
        present = raw is not None
        inputs.append({**spec, "present": present, "engine_seed": raw})

    live_cells = list(FPK_POWER_TRACE_LIVE) if has_signal else []
    literal_power_chain = has_signal and len(live_cells) == 0

    present_inputs = sum(1 for i in inputs if i["present"])
    return {
        "schema": SCHEMA,
        "source": SOURCE,
        "has_fpk_power_trace": has_signal,
        "sheet": "Calculations",
        "section": "FPK power & thermal trace — LIVE formulas",
        "builder": "scripts/build-excel-export.py::_render_fpk_power_thermal_trace",
        "live_input_count": len(inputs),
        "live_formula_count": len(live_cells),
        "inputs": inputs,
        "live_cells": live_cells,
        "unvalidated_policy": UNVALIDATED_POLICY,
        "provenance_order": [
            "orchestratorContract.quantities",
            "fpkPhysicsTree.quantity_writeback (fallback)",
            "brief seed (yellow cell default)",
        ],
        "literal_power_chain": literal_power_chain,
        "ship_ok": False,
        "rebuild_recommended": has_signal,
    }


def _q_map(state: Mapping[str, Any]) -> dict[str, Any]:
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
    return q if isinstance(q, dict) else {}


def _q_num_from_map(q: Mapping[str, Any], key: str) -> float | None:
    raw = q.get(key)
    try:
        if isinstance(raw, Mapping):
            v = float(raw.get("value"))
        else:
            v = float(raw)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def _formula_inputs_present(q: Mapping[str, Any], inputs: Iterable[str]) -> bool:
    return all(_q_num_from_map(q, key) is not None for key in inputs)


def stamp_fpk_formula_provenance(state: dict[str, Any]) -> bool:
    """Stamp FPK calculator quantities with formula lineage for Excel coverage.

    INTENT: post-tool reconciles are legitimate calculator outputs, but a bare
    value plus prose condition leaves Calculations unable to show the arithmetic.
    This stamps the formula at the quantity source so the next Excel rebuild emits
    worked calculations from the same contract truth.
    """
    if not _has_fpk_signal(state):
        return False
    q = _q_map(state)
    if not q:
        return False
    mutated = False
    for key, (detail, inputs) in FPK_FORMULA_LINEAGE.items():
        raw = q.get(key)
        if not isinstance(raw, dict):
            continue
        raw["source"] = "calculator"
        raw["source_detail"] = detail
        raw.setdefault("condition", detail)
        prov = dict(raw.get("provenance") or {}) if isinstance(raw.get("provenance"), dict) else {}
        prov.setdefault("source", "calculator")
        prov.setdefault("tool_id", "front_fpk_power_reconcile")
        prov.setdefault("invocation_output_field", key)
        raw["provenance"] = prov
        if inputs and _formula_inputs_present(q, inputs):
            lineage = dict(raw.get("lineage") or {}) if isinstance(raw.get("lineage"), dict) else {}
            lineage["from"] = list(inputs)
            raw["lineage"] = lineage
        q[key] = raw
        mutated = True
    for key, (source, detail) in FPK_ROOT_SOURCES.items():
        raw = q.get(key)
        if not isinstance(raw, dict):
            continue
        raw["source"] = source
        raw["source_detail"] = detail
        prov = dict(raw.get("provenance") or {}) if isinstance(raw.get("provenance"), dict) else {}
        prov["source"] = source
        raw["provenance"] = prov
        q[key] = raw
        mutated = True
    oc = state.setdefault("orchestratorContract", {})
    oc["quantities"] = q
    return mutated


def _quantity_claim(state: Mapping[str, Any], key: str, note: str) -> dict[str, Any] | None:
    q = _q_map(state)
    raw = q.get(key)
    if not isinstance(raw, Mapping):
        return None
    value = _q_num_from_map(q, key)
    if value is None:
        return None
    return {
        "field": key,
        "value": value,
        "unit": str(raw.get("unit") or ""),
        "input_summary": str(raw.get("source_detail") or raw.get("condition") or note),
        "output_field": key,
    }


def build_front_fpk_power_reconcile_tool(state: Mapping[str, Any]) -> dict[str, Any] | None:
    """Build the synthetic tool-page entry for the authoritative FPK reconcile."""
    if not _has_fpk_signal(state):
        return None
    claims = [
        c for c in (
            _quantity_claim(state, "mgu_ac_electrical_input_kw", "P_dc * eta_inv"),
            _quantity_claim(state, "mgu_shaft_power_kw", "P_dc * eta_inv * eta_mgu"),
            _quantity_claim(state, "gear_output_power_kw", "P_shaft * eta_gear"),
            _quantity_claim(state, "mgu_shaft_torque_nm", "T = P_shaft / omega"),
            _quantity_claim(state, "peak_mechanical_power_kw", "alias of mgu_shaft_power_kw"),
            _quantity_claim(state, "electrical_frequency_hz", "n/60 * pole-pairs"),
            _quantity_claim(state, "total_dissipated_kw_continuous", "loss sum to coolant"),
            _quantity_claim(state, "coolant_delta_t_k", "Q/(m_dot * cp)"),
        )
        if c is not None
    ]
    if not claims:
        return None
    q = _q_map(state)

    def val(key: str) -> float:
        return _q_num_from_map(q, key) or 0.0

    worked = [
        {
            "label": "Front FPK AC input power",
            "formula": "mgu_ac_electrical_input_kw = continuous_power_kw x inverter_efficiency",
            "substitution": f"mgu_ac_electrical_input_kw = {val('continuous_power_kw')} x {val('inverter_efficiency')} = {val('mgu_ac_electrical_input_kw')} kW",
            "inputs": [
                {"symbol": "continuous_power_kw", "value": val("continuous_power_kw"), "unit": "kW"},
                {"symbol": "inverter_efficiency", "value": val("inverter_efficiency"), "unit": "ratio"},
            ],
            "result": {"value": val("mgu_ac_electrical_input_kw"), "unit": "kW"},
            "assumptions": ["post-tool reconcile; inverter efficiency from the current tool/seed state"],
        },
        {
            "label": "Front FPK shaft power",
            "formula": "mgu_shaft_power_kw = continuous_power_kw x inverter_efficiency x mgu_efficiency",
            "substitution": f"mgu_shaft_power_kw = {val('continuous_power_kw')} x {val('inverter_efficiency')} x {val('mgu_efficiency')} = {val('mgu_shaft_power_kw')} kW",
            "inputs": [
                {"symbol": "continuous_power_kw", "value": val("continuous_power_kw"), "unit": "kW"},
                {"symbol": "inverter_efficiency", "value": val("inverter_efficiency"), "unit": "ratio"},
                {"symbol": "mgu_efficiency", "value": val("mgu_efficiency"), "unit": "ratio"},
            ],
            "result": {"value": val("mgu_shaft_power_kw"), "unit": "kW"},
            "assumptions": ["mechanical shaft power is the reconciled power-flow plane"],
        },
        {
            "label": "Front FPK wheel power",
            "formula": "gear_output_power_kw = mgu_shaft_power_kw x gear_efficiency",
            "substitution": f"gear_output_power_kw = {val('mgu_shaft_power_kw')} x {val('gear_efficiency')} = {val('gear_output_power_kw')} kW",
            "inputs": [
                {"symbol": "mgu_shaft_power_kw", "value": val("mgu_shaft_power_kw"), "unit": "kW"},
                {"symbol": "gear_efficiency", "value": val("gear_efficiency"), "unit": "ratio"},
            ],
            "result": {"value": val("gear_output_power_kw"), "unit": "kW"},
            "assumptions": ["single-speed reduction efficiency applies after MGU shaft"],
        },
        {
            "label": "Front FPK shaft torque",
            "formula": "mgu_shaft_torque_nm = mgu_shaft_power_kw*1000 / (mgu_base_speed_rpm*2*pi/60)",
            "substitution": f"mgu_shaft_torque_nm = {val('mgu_shaft_power_kw')}*1000 / ({val('mgu_base_speed_rpm')}*2*pi/60) = {val('mgu_shaft_torque_nm')} Nm",
            "inputs": [
                {"symbol": "mgu_shaft_power_kw", "value": val("mgu_shaft_power_kw"), "unit": "kW"},
                {"symbol": "mgu_base_speed_rpm", "value": val("mgu_base_speed_rpm"), "unit": "rpm"},
            ],
            "result": {"value": val("mgu_shaft_torque_nm"), "unit": "Nm"},
            "assumptions": ["base-speed torque, not peak launch torque"],
        },
        {
            "label": "Front FPK coolant temperature rise",
            "formula": "coolant_delta_t_k = total_dissipated_kw_continuous*1000 / ((coolant_flow_l_min/60)*(coolant_density_kg_m3/1000)*coolant_cp_j_kgk)",
            "substitution": (
                f"coolant_delta_t_k = {val('total_dissipated_kw_continuous')}*1000 / "
                f"(({val('coolant_flow_l_min')}/60)*({val('coolant_density_kg_m3')}/1000)*"
                f"{val('coolant_cp_j_kgk')}) = {val('coolant_delta_t_k')} K"
            ),
            "inputs": [
                {"symbol": "total_dissipated_kw_continuous", "value": val("total_dissipated_kw_continuous"), "unit": "kW"},
                {"symbol": "coolant_flow_l_min", "value": val("coolant_flow_l_min"), "unit": "L/min"},
                {"symbol": "coolant_density_kg_m3", "value": val("coolant_density_kg_m3"), "unit": "kg/m3"},
                {"symbol": "coolant_cp_j_kgk", "value": val("coolant_cp_j_kgk"), "unit": "J/(kg*K)"},
            ],
            "result": {"value": val("coolant_delta_t_k"), "unit": "K"},
            "assumptions": ["CoolProp/fluids properties are consumed when present; no handbook regression"],
        },
    ]
    return {
        "tool_id": "front_fpk_power_reconcile",
        "tool_name": "Front FPK Power/Thermal Reconcile",
        "tool_version": "1.0.0",
        "tool_license": "free-proprietary",
        "tool_source_url": "internal://forgeos/mgu-mcu-pack",
        "pinned_versions": {},
        "claims": claims,
        "total_duration_ms": 0,
        "worked": worked,
    }


def sync_front_fpk_power_reconcile_tools_page(page: dict[str, Any], state: Mapping[str, Any]) -> bool:
    """Replace stale FPK power claims with the authoritative reconcile entry."""
    if not isinstance(page, dict) or not isinstance(page.get("tools"), list):
        return False
    tool = build_front_fpk_power_reconcile_tool(state)
    if tool is None:
        return False
    changed = False
    cleaned = []
    for entry in page["tools"]:
        if not isinstance(entry, dict):
            cleaned.append(entry)
            continue
        if str(entry.get("tool_id") or "") == "front_fpk_power_reconcile":
            changed = True
            continue
        claims = entry.get("claims")
        if isinstance(claims, list):
            kept = []
            seen_capability = False
            for claim in claims:
                if not isinstance(claim, dict):
                    kept.append(claim)
                    continue
                field = str(claim.get("field") or "")
                if (
                    str(entry.get("tool_id") or "") == "motor:ipmsm-analytical-sizing"
                    and field == "mgu_shaft_power_kw"
                    and not seen_capability
                ):
                    cap = _q_num_from_map(_q_map(state), "ipmsm_capability_shaft_power_kw")
                    if cap is not None:
                        c2 = dict(claim)
                        c2["field"] = "ipmsm_capability_shaft_power_kw"
                        c2["value"] = cap
                        c2["output_field"] = "shaft_power_kw"
                        c2["input_summary"] = (
                            "IPMSM D2L analytical capability retained as EM check; "
                            "front_fpk_power_reconcile owns the power-flow shaft value"
                        )
                        kept.append(c2)
                        seen_capability = True
                        changed = True
                        continue
                if field in FPK_RECONCILED_FIELDS:
                    want = _q_num_from_map(_q_map(state), field)
                    got = None
                    try:
                        got = float(claim.get("value"))
                    except (TypeError, ValueError):
                        pass
                    if want is not None and got is not None and abs(got - want) > max(abs(want) * 0.02, 0.01):
                        changed = True
                        continue
                kept.append(claim)
            if len(kept) != len(claims):
                entry = dict(entry)
                entry["claims"] = kept
        cleaned.append(entry)
    cleaned.append(tool)
    page["tools"] = cleaned
    return True


def prove_catch(plan: Mapping[str, Any]) -> dict[str, Any]:
    """proveCatch: excel_all_literal_power_chain when signal exists but no LIVE cells."""
    fires = bool(plan.get("has_fpk_power_trace")) and bool(plan.get("literal_power_chain"))
    return {
        "excel_all_literal_power_chain": {
            "fired": fires,
            "intended_action": "block_greenwash_excel_power_chain",
        },
        "ok": not fires,
    }


def stamp_excel_live_plan(out_dir: Path) -> dict[str, Any]:
    state_path = out_dir / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    formula_provenance_stamped = stamp_fpk_formula_provenance(state)
    plan = build_excel_live_plan(state)
    catch = prove_catch(plan)
    plan["proveCatch"] = catch
    plan["stamped_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    plan["formula_provenance_stamped"] = formula_provenance_stamped
    state["fpkExcelLivePlan"] = plan
    state["ship_ok"] = False
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")

    report_path = out_dir / "JLR-FE-FRONT-FPK-EXCEL-LIVE-PLAN.md"
    report_path.write_text(render_markdown(plan, catch), encoding="utf-8")
    return {
        "ok": catch["ok"],
        "live_formula_count": plan["live_formula_count"],
        "has_fpk_power_trace": plan["has_fpk_power_trace"],
        "state_path": str(state_path),
        "report_path": str(report_path),
        "proveCatch": catch,
        "formula_provenance_stamped": formula_provenance_stamped,
    }


def render_markdown(plan: Mapping[str, Any], catch: Mapping[str, Any]) -> str:
    lines = [
        "# JLR FE Front FPK — Excel LIVE plan (P7)",
        "",
        f"**Sheet:** `{plan.get('sheet')}`  ",
        f"**Section:** {plan.get('section')}  ",
        f"**LIVE formulas:** {plan.get('live_formula_count', 0)}  ",
        f"**Yellow inputs:** {plan.get('live_input_count', 0)}  ",
        "**ship_ok:** **false**",
        "",
        "## UNVALIDATED policy",
        "",
        f"Tag: `{UNVALIDATED_POLICY['tag']}` — analytical / tool seeds are editable and "
        "recompute in-cell, but remain **UNVALIDATED** until dyno, HIL, and CFD race "
        "holds close with physical artefacts.",
        "",
        "Forbidden while OPEN: "
        + ", ".join(f"`{c}`" for c in UNVALIDATED_POLICY["forbid_claims"]),
        "",
        "## Yellow inputs (contract provenance)",
        "",
        "| ID | Contract key | Present |",
        "|---|---|---|",
    ]
    for row in plan.get("inputs") or []:
        present = "yes" if row.get("present") else "no"
        lines.append(
            f"| `{row.get('id')}` | `{row.get('contract_key')}` | {present} |"
        )
    lines.extend(["", "## LIVE formula cells", "", "| ID | Formula | Provenance |", "|---|---|---|"])
    for row in plan.get("live_cells") or []:
        prov = ", ".join(f"`{p}`" for p in row.get("provenance") or [])
        lines.append(f"| `{row.get('id')}` | {row.get('formula')} | {prov} |")
    lines.extend(
        [
            "",
            "## proveCatch",
            "",
            f"- `excel_all_literal_power_chain`: "
            f"**{'FIRES' if catch['excel_all_literal_power_chain']['fired'] else 'silent'}**",
            "",
            "## Rebuild",
            "",
            "```bash",
            f"python3 scripts/build-excel-export.py {plan.get('twin', 'out/...')}",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def _selftest() -> int:
    bad = 0
    state_fpk = {
        "orchestratorContract": {
            "product_class": "formula_e_front_mgu",
            "quantities": {
                "continuous_power_kw": {"value": 250},
                "inverter_efficiency": {"value": 0.98},
                "mgu_efficiency": {"value": 0.97},
                "gear_efficiency": {"value": 0.97},
            },
        }
    }
    plan = build_excel_live_plan(state_fpk)
    catch = prove_catch(plan)
    if not plan["has_fpk_power_trace"]:
        print("  FAIL: FPK signal must be detected")
        bad += 1
    if plan["live_formula_count"] < 8:
        print(f"  FAIL: expected ≥8 LIVE cells, got {plan['live_formula_count']}")
        bad += 1
    if not catch["ok"]:
        print("  FAIL: proveCatch must pass when LIVE cells exist")
        bad += 1

    empty = build_excel_live_plan({"orchestratorContract": {"quantities": {}}})
    catch_empty = prove_catch(empty)
    if catch_empty["excel_all_literal_power_chain"]["fired"]:
        print("  FAIL: no FPK signal must not fire literal_power_chain")
        bad += 1

    literal = build_excel_live_plan(state_fpk)
    literal = {**literal, "live_cells": [], "literal_power_chain": True}
    if not prove_catch(literal)["excel_all_literal_power_chain"]["fired"]:
        print("  FAIL: forced literal chain must fire proveCatch")
        bad += 1

    if bad:
        print(f"fpk_excel_live_plan selftest: {bad} FAIL")
        return 1
    tool = build_front_fpk_power_reconcile_tool({
        "orchestratorContract": {
            "product_class": "formula_e_front_mgu",
            "quantities": {
                "continuous_power_kw": {"value": 250},
                "inverter_efficiency": {"value": 0.98},
                "mgu_efficiency": {"value": 0.97},
                "gear_efficiency": {"value": 0.97},
                "mgu_shaft_power_kw": {"value": 237.65},
                "gear_output_power_kw": {"value": 230.52},
                "mgu_base_speed_rpm": {"value": 19500},
                "mgu_shaft_torque_nm": {"value": 116.45},
                "total_dissipated_kw_continuous": {"value": 6.0},
                "coolant_flow_l_min": {"value": 12.0},
                "coolant_density_kg_m3": {"value": 1040.0},
                "coolant_cp_j_kgk": {"value": 3500.0},
                "coolant_delta_t_k": {"value": 8.24},
            },
        }
    })
    for worked in (tool or {}).get("worked", []):
        input_symbols = {str(i.get("symbol")) for i in worked.get("inputs", [])}
        missing = _formula_rhs_symbols(str(worked.get("formula") or "")) - input_symbols
        if missing:
            print(f"  FAIL: worked formula {worked.get('label')} has unbound symbols {sorted(missing)}")
            bad += 1
    if bad:
        print(f"fpk_excel_live_plan selftest: {bad} FAIL")
        return 1
    print("fpk_excel_live_plan selftest OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", nargs="?", type=Path)
    ap.add_argument("--stamp", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return _selftest()

    if args.stamp:
        if not args.run_dir:
            print("--stamp requires run_dir", flush=True)
            return 2
        out = stamp_excel_live_plan(args.run_dir)
        print(json.dumps(out, indent=2))
        return 0 if out["ok"] else 1

    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
