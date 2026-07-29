#!/usr/bin/env python3
"""Universal Excel closure blocks — DVP&R, operating-point matrix, interface ICD.

INTENT (2026-07-29 SOL): morning-review value is closure/traceability, not new
tabs. Assemblers are PURE (state → rows) so build-excel-export.py only renders.
Keyed on contract/tool/topology signals — never a product-class branch.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _qval(quantities: dict, key: str) -> Optional[float]:
    raw = quantities.get(key)
    if isinstance(raw, dict):
        v = raw.get("value")
    else:
        v = raw
    try:
        n = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return n if n == n else None  # NaN guard


def _qty_map(state: dict) -> Dict[str, Any]:
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = ((state.get(ck) or {}).get("quantities") or {})
        if isinstance(qs, dict) and qs:
            return qs
    return {}


def _method_for_axis(axis: str) -> str:
    a = (axis or "").lower()
    if a == "brief":
        return "Document vs contract quantity"
    if a == "physics":
        return "Tier-0 worked-calc / tool closure"
    if a == "realisation":
        return "BoM / PCB / drawing artefact check"
    if a == "hold":
        return "Customer / FE / dyno freeze"
    return "Review"


def _evidence_tier(axis: str, status: str, provenance: str) -> str:
    blob = f"{axis} {status} {provenance}".lower()
    if "dyno" in blob or "hil" in blob:
        return "dyno/HIL (pending)" if status != "PASS" else "dyno/HIL"
    if "fe" in blob or "finite" in blob:
        return "FE (pending)" if status != "PASS" else "FE"
    if axis == "physics" or "tool:" in blob or "worked" in blob:
        return "analytical (Tier-0)"
    if axis == "brief":
        return "document"
    if axis == "realisation":
        return "artefact"
    return "assumption"


def _owner_for_row(claim: str, decisions: List[dict]) -> str:
    cl = (claim or "").lower()
    for d in decisions:
        freezes = d.get("freezes") or []
        if isinstance(freezes, str):
            freezes = [freezes]
        blob = " ".join(
            [str(d.get("decision") or ""), str(d.get("evidence") or "")]
            + [str(f) for f in freezes]
        ).lower()
        tokens = [t for t in cl.replace("_", " ").split() if len(t) > 3]
        if tokens and sum(1 for t in tokens if t in blob) >= min(2, len(tokens)):
            return str(d.get("owner") or "Engineering")
    if "rotor" in cl or "magnet" in cl or "winding" in cl:
        return "Mechanical / EM lead"
    if "voltage" in cl or "current" in cl or "inverter" in cl or "vdc" in cl:
        return "Power electronics lead"
    if "coolant" in cl or "thermal" in cl or "temp" in cl:
        return "Thermal lead"
    if "mass" in cl or "cost" in cl:
        return "Chief engineer"
    return "Systems lead"


def _next_action(status: str, hardness: str) -> str:
    st = (status or "").upper()
    hard = (hardness or "").upper()
    if st == "PASS":
        return "—"
    if st == "OPEN" or st == "UNVERIFIED":
        if hard == "HARD":
            return "Supply evidence or freeze assumption in Decision Register"
        return "Track — soft until customer input"
    if st == "FAIL":
        return "Resolve at source rule / re-run tools; do not greenwash"
    return "Review"


def assemble_dvpr_rows(
    verification_rows: List[dict],
    state: Optional[dict] = None,
) -> List[dict]:
    """Build DVP&R closure rows from the governing verification spine (+ Decision Register owners)."""
    state = state or {}
    decisions = [
        d for d in (state.get("decisionRegister") or [])
        if isinstance(d, dict)
    ]
    out: List[dict] = []
    for i, raw in enumerate(verification_rows or [], start=1):
        if not isinstance(raw, dict):
            continue
        axis = str(raw.get("axis") or "")
        claim = str(raw.get("claim") or "")
        status = str(raw.get("status") or "UNVERIFIED")
        hardness = str(raw.get("hardness") or "SOFT")
        provenance = str(raw.get("provenance") or "")
        req_id = f"VR-{i:03d}"
        out.append({
            "requirement_id": req_id,
            "claim": claim,
            "method": _method_for_axis(axis),
            "evidence_tier": _evidence_tier(axis, status, provenance),
            "owner": _owner_for_row(claim, decisions),
            "evidence_reference": provenance or "—",
            "status": status,
            "hardness": hardness,
            "next_action": _next_action(status, hardness),
        })
    return out


def has_operating_point_signal(state: dict) -> bool:
    q = _qty_map(state)
    torque = _qval(q, "mgu_shaft_torque_nm")
    iph = _qval(q, "phase_current_max_a")
    cont = _qval(q, "continuous_power_kw")
    peak = _qval(q, "rear_axle_electrical_power_kw") or _qval(q, "traction_motor_power_kw")
    return bool(
        (torque and torque > 0)
        or (iph and iph >= 50)
        or (cont and cont > 0 and peak and peak > 0)
    )


def assemble_operating_point_rows(state: dict) -> List[dict]:
    """Critical operating-point matrix from contract quantities (tool writebacks).

    Universal: fires when shaft-torque / phase-current / traction power signals exist.
    Never invents dyno maps — one row per design condition we actually closed.
    """
    if not has_operating_point_signal(state):
        return []
    q = _qty_map(state)
    coolant = _qval(q, "coolant_inlet_c") or _qval(q, "assumed_coolant_inlet_c")
    wind = _qval(q, "mgu_winding_temp_c")
    mag = _qval(q, "mgu_magnet_temp_c")
    wind_lim = _qval(q, "winding_temp_limit_c")
    mag_lim = _qval(q, "magnet_temp_limit_c")
    rotor_m = _qval(q, "rotor_stress_margin")
    rotor_min = _qval(q, "rotor_stress_margin_min")
    inv_eta = _qval(q, "inverter_efficiency")
    mgu_eta = _qval(q, "mgu_efficiency")
    flow = _qval(q, "coolant_flow_l_min")

    def temp_status() -> str:
        bits = []
        if wind is not None and wind_lim is not None:
            bits.append("PASS" if wind <= wind_lim else "FAIL")
        if mag is not None and mag_lim is not None:
            bits.append("PASS" if mag <= mag_lim else "FAIL")
        if rotor_m is not None and rotor_min is not None:
            bits.append("HOLD" if rotor_m < rotor_min else "PASS")
        if not bits:
            return "UNVERIFIED"
        if "FAIL" in bits:
            return "FAIL"
        if "HOLD" in bits:
            return "HOLD"
        return "PASS"

    rows: List[dict] = []
    cont = _qval(q, "continuous_power_kw")
    if cont:
        cu = _qval(q, "mgu_copper_loss_w") or 0.0
        fe = _qval(q, "mgu_iron_loss_w") or 0.0
        loss_kw = (cu + fe) / 1000.0
        # Inverter dissipation ≈ continuous × (1 − η) when η present
        if inv_eta and 0 < inv_eta < 1:
            loss_kw += cont * (1.0 - inv_eta)
        rows.append({
            "condition": "Continuous design duty",
            "duration_share": "race-mean / loss tools",
            "speed_rpm": _qval(q, "mgu_base_speed_rpm"),
            "torque_nm": _qval(q, "mgu_shaft_torque_nm"),
            "vdc_v": _qval(q, "dc_bus_voltage_v"),
            "phase_a_rms": _qval(q, "ac_rms_current_a"),
            "electrical_kw": cont,
            "shaft_kw": _qval(q, "mgu_shaft_power_kw"),
            "loss_kw": round(loss_kw, 3),
            "efficiency": round((inv_eta or 1) * (mgu_eta or 1), 4) if (inv_eta or mgu_eta) else None,
            "coolant_c": coolant,
            "coolant_flow_l_min": flow,
            "winding_c": wind,
            "magnet_c": mag,
            "margin_status": temp_status(),
            "source": "contract ← motor:loss-point + inverter:sic-loss + motor:thermal-lumped",
        })

    peak = _qval(q, "rear_axle_electrical_power_kw") or _qval(q, "traction_motor_power_kw")
    if peak and (not cont or abs(peak - cont) > 1e-6):
        rows.append({
            "condition": "Peak electrical (nameplate)",
            "duration_share": "transient / FIA rear cap",
            "speed_rpm": _qval(q, "mgu_base_speed_rpm"),
            "torque_nm": _qval(q, "envelope_mgu_torque_nm") or _qval(q, "mgu_shaft_torque_nm"),
            "vdc_v": _qval(q, "assumed_vdc_min_v") or _qval(q, "v_dc_min_v"),
            "phase_a_rms": _qval(q, "phase_current_max_a"),
            "electrical_kw": peak,
            "shaft_kw": _qval(q, "envelope_electrical_power_kw"),
            "loss_kw": None,
            "efficiency": inv_eta,
            "coolant_c": coolant,
            "coolant_flow_l_min": flow,
            "winding_c": wind,
            "magnet_c": mag,
            "margin_status": "nameplate — thermal not re-solved at peak",
            "source": "contract ← rear_axle_electrical_power_kw + inverter:current-voltage-envelope",
        })

    mot_s = _qval(q, "duty_motoring_time_s")
    reg_s = _qval(q, "duty_regen_time_s")
    if mot_s is not None or reg_s is not None:
        total = (mot_s or 0) + (reg_s or 0)
        share = (
            f"mot {mot_s:g}s / regen {reg_s:g}s"
            if total
            else "duty vignette"
        )
        rows.append({
            "condition": "Illustrative duty vignette (net energy)",
            "duration_share": share,
            "speed_rpm": None,
            "torque_nm": None,
            "vdc_v": _qval(q, "dc_bus_voltage_v"),
            "phase_a_rms": None,
            "electrical_kw": None,
            "shaft_kw": None,
            "loss_kw": _qval(q, "duty_loss_energy_kwh"),
            "efficiency": None,
            "coolant_c": coolant,
            "coolant_flow_l_min": flow,
            "winding_c": wind,
            "magnet_c": mag,
            "margin_status": (
                f"E_net={_qval(q, 'duty_net_electrical_energy_kwh')} kWh"
                if _qval(q, "duty_net_electrical_energy_kwh") is not None
                else "UNVERIFIED"
            ),
            "source": "contract ← powertrain:duty-cycle-energy (replace with track logs)",
        })
    return rows


def assemble_interface_control_rows(state: dict) -> List[dict]:
    """Vehicle-boundary ICD rows from contract topology + rating quantities."""
    contract = state.get("orchestratorContract") or state.get("engineeringContract") or {}
    edges = contract.get("topology") if isinstance(contract, dict) else None
    if not isinstance(edges, list) or not edges:
        return []
    q = _qty_map(state)
    decisions = [
        d for d in (state.get("decisionRegister") or [])
        if isinstance(d, dict)
    ]
    rows: List[dict] = []
    for i, e in enumerate(edges, start=1):
        if not isinstance(e, dict):
            continue
        mech = str(e.get("mechanism") or "")
        kind = str(e.get("constraint_kind") or "")
        frm = str(e.get("from_part") or "")
        to = str(e.get("to_part") or "")
        req = e.get("required_value")
        unit = str(e.get("required_unit") or "")
        domain = "HV electrical" if "electrical" in mech else (
            "Coolant" if "fluid" in mech else mech or "interface"
        )
        # Nominal from matching contract quantities when available
        nominal = None
        limit = req
        if "voltage" in kind:
            nominal = _qval(q, "dc_bus_voltage_v")
            limit = _qval(q, "assumed_vdc_max_v") or _qval(q, "v_dc_max_v") or req
            unit = unit or "V"
        elif "current" in kind:
            nominal = _qval(q, "ac_rms_current_a")
            limit = _qval(q, "phase_current_max_a") or req
            unit = unit or "A"
        elif "flow" in kind:
            nominal = _qval(q, "coolant_flow_l_min")
            limit = req
            unit = unit or "L/min"

        status = "OPEN"
        if limit is not None and nominal is not None:
            try:
                status = "PASS" if float(nominal) <= float(limit) * 1.001 else "FAIL"
            except (TypeError, ValueError):
                status = "UNVERIFIED"
        elif limit is not None:
            status = "SPECIFIED — mate not proven"

        owner = "Power electronics lead" if "electrical" in mech else (
            "Thermal lead" if "fluid" in mech else "Systems lead"
        )
        for d in decisions:
            if any(tok in str(d.get("decision") or "").lower()
                   for tok in ("coolant", "phase current", "vdc", "voltage")):
                if ("fluid" in mech and "coolant" in str(d.get("decision") or "").lower()) or (
                    "electrical" in mech and "current" in str(d.get("decision") or "").lower()
                ):
                    owner = str(d.get("owner") or owner)
                    break

        rows.append({
            "interface_id": f"IF-{i:03d}",
            "domain": domain,
            "from_part": frm,
            "to_part": to,
            "nominal": nominal,
            "limit": limit,
            "unit": unit,
            "medium": mech.replace("_", " "),
            "connector": "TBD — OEM / vehicle ICD",
            "responsibility": f"Vehicle ↔ pack ({owner})",
            "status": status,
            "source": f"topology:{frm}→{to} · {kind}",
        })
    return rows


def _selftest() -> None:
    state = {
        "decisionRegister": [{
            "id": "DEC-001",
            "decision": "Peak phase current / SiC die class",
            "owner": "Power electronics lead",
            "freezes": ["phase_current_max_a"],
            "evidence": "tool:inverter",
        }],
        "orchestratorContract": {
            "quantities": {
                "continuous_power_kw": {"value": 250},
                "rear_axle_electrical_power_kw": {"value": 350},
                "mgu_base_speed_rpm": {"value": 40000},
                "mgu_shaft_torque_nm": {"value": 77},
                "dc_bus_voltage_v": {"value": 750},
                "assumed_vdc_min_v": {"value": 600},
                "assumed_vdc_max_v": {"value": 900},
                "phase_current_max_a": {"value": 530},
                "ac_rms_current_a": {"value": 272},
                "mgu_winding_temp_c": {"value": 71},
                "mgu_magnet_temp_c": {"value": 86},
                "winding_temp_limit_c": {"value": 180},
                "magnet_temp_limit_c": {"value": 150},
                "rotor_stress_margin": {"value": 1.443},
                "rotor_stress_margin_min": {"value": 1.5},
                "inverter_efficiency": {"value": 0.99},
                "mgu_efficiency": {"value": 0.99},
                "coolant_inlet_c": {"value": 55},
                "coolant_flow_l_min": {"value": 15},
                "mgu_copper_loss_w": {"value": 1100},
                "mgu_iron_loss_w": {"value": 280},
                "duty_motoring_time_s": {"value": 76},
                "duty_regen_time_s": {"value": 24},
                "duty_net_electrical_energy_kwh": {"value": 1.32},
            },
            "topology": [
                {
                    "from_part": "hv_battery_dc_bus",
                    "to_part": "rear_mcu_inverter",
                    "mechanism": "electrical_bus",
                    "constraint_kind": "voltage_rating",
                    "required_value": 900,
                    "required_unit": "V",
                },
                {
                    "from_part": "coolant_loop",
                    "to_part": "rear_mgu_mcu_cold_plates",
                    "mechanism": "fluid_loop",
                    "constraint_kind": "flow_capacity",
                    "required_value": 15,
                    "required_unit": "L/min",
                },
            ],
        },
    }
    vrows = [
        {"axis": "physics", "claim": "rotor stress margin", "status": "FAIL",
         "hardness": "HARD", "provenance": "tool:motor:rotor-centrifugal-stress"},
        {"axis": "brief", "claim": "assumed_vdc_min_v", "status": "PASS",
         "hardness": "HARD", "provenance": "contract assumed_vdc_min_v"},
    ]
    dvpr = assemble_dvpr_rows(vrows, state)
    assert len(dvpr) == 2, dvpr
    assert dvpr[0]["next_action"] != "—", "FAIL must demand action"
    assert dvpr[1]["next_action"] == "—"
    assert "analytical" in dvpr[0]["evidence_tier"]
    assert "Power electronics" in dvpr[0]["owner"] or "Mechanical" in dvpr[0]["owner"]

    assert has_operating_point_signal(state)
    op = assemble_operating_point_rows(state)
    assert len(op) >= 2, op
    assert any(r["condition"].startswith("Continuous") for r in op)
    assert any("Peak" in r["condition"] for r in op)
    assert any(r.get("margin_status") == "HOLD" for r in op), "rotor margin < min → HOLD"

    icd = assemble_interface_control_rows(state)
    assert len(icd) == 2, icd
    assert icd[0]["interface_id"] == "IF-001"
    assert icd[0]["domain"] == "HV electrical"

    # Plant with no traction signal → empty OP matrix
    plant = {"orchestratorContract": {"quantities": {"enclosure_volume_m3": {"value": 40}}}}
    assert assemble_operating_point_rows(plant) == []
    print("excel_closure_blocks --selftest OK")


if __name__ == "__main__":
    _selftest()
