#!/usr/bin/env python3
"""INTENT: Build a SIGHT digest of the FE front FPK twin for adversarial council.

Reads live twin artefacts (not chat claims) into `_redteam_digest_v2.json`
for `fe-front-redteam-council.py`. Cap size; prefer numbers.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

ROOT = Path(__file__).resolve().parents[1]
TWIN = ROOT / "out/formula-e-front-mgu-20260729-1432"
OUT = TWIN / "_redteam_digest_v2.json"


def _load(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def _qty_map(state: Mapping[str, Any]) -> dict[str, Any]:
    oc = state.get("orchestratorContract") or {}
    qs = oc.get("quantities") if isinstance(oc, Mapping) else None
    if not isinstance(qs, Mapping):
        return {}
    out: dict[str, Any] = {}
    for k, v in qs.items():
        if isinstance(v, Mapping) and "value" in v:
            out[k] = v.get("value")
        else:
            out[k] = v
    return out


# INTENT (F-PROC-1): never strip unfavourable EM / oil / loss fields from the
# council digest — peak-alone greenwash hid behind a sanitised keep-list.
_MM_SLIM_KEYS = (
    "status",
    "ship_ok",
    "ok",
    "verdict",
    "duty_torque_screen_ok",
    "torque_reliable",
    "torque_magnitude_mean_nm",
    "mean_torque_vs_required_ratio",
    "loaded_torque_magnitude_nm",
    "required_shaft_torque_nm",
    "duty_screen_fail_reasons",
    "coupled_screen_ok",
    "nest_fits_rotor",
    "screening_fos_vs_yield",
    "maximum_module_temperature_c",
    "maximum_winding_temperature_c",
    "pressure_drop_kpa",
    "loaded_torque_nm",
    "required_torque_nm",
    "cornering_pickup_ok",
    "pickup_gallery_adequate",
    "jet_pressure_required_kpa",
    "copper_loss_w",
    "iron_loss_w",
    "inverter_loss_w",
    "motor_loss_w",
    "total_loss_w",
    "architectureBlockers",
    "architecture_blockers_open",
)


def _slim_mapping(v: Mapping[str, Any]) -> dict[str, Any]:
    slim: dict[str, Any] = {
        sk: v[sk] for sk in _MM_SLIM_KEYS if sk in v
    }
    twin = v.get("twin_bound_case")
    if isinstance(twin, Mapping):
        twin_slim = {sk: twin[sk] for sk in _MM_SLIM_KEYS if sk in twin}
        pos = twin.get("position_sweep")
        if isinstance(pos, Mapping):
            twin_slim["position_sweep"] = {
                pk: pos[pk]
                for pk in (
                    "n_positions",
                    "torque_magnitude_mean_nm",
                    "torque_vs_required_ratio_mean",
                    "torque_vs_required_ratio_min",
                    "torque_vs_required_ratio_max",
                )
                if pk in pos
            }
        if twin_slim:
            slim["twin_bound_case"] = twin_slim
    return slim


def _slice_mm(mm: Optional[Mapping[str, Any]]) -> dict[str, Any]:
    if not isinstance(mm, Mapping):
        return {}
    # GOTCHA: stamp writes an envelope { motorMultiphysics, architectureBlockers, … }.
    # Unfavourable fields live on the inner object — unwrap before slimming.
    envelope_blockers = mm.get("architectureBlockers")
    if isinstance(mm.get("motorMultiphysics"), Mapping):
        inner = dict(mm["motorMultiphysics"])
        if envelope_blockers is not None:
            inner["architectureBlockers"] = envelope_blockers
        mm = inner
    keep = [
        "ship_ok",
        "homologation",
        "architecture",
        "architectureBlockers",
        "architecture_blockers_open_count",
        "electromagnetic",
        "thermal",
        "structural",
        "gears",
        "cooling",
        "hardwareHolds",
        "assumptionBasedDesign",
        "bar_b_readiness",
        "reviewStatus",
        "required_checks",
        "fia_duty",
        "honesty",
    ]
    out: dict[str, Any] = {}
    for k in keep:
        if k not in mm:
            continue
        val = mm[k]
        if k == "required_checks" and isinstance(val, Mapping):
            out[k] = {
                ck: _slim_mapping(cv) if isinstance(cv, Mapping) else cv
                for ck, cv in val.items()
            }
        elif isinstance(val, list):
            out[k] = val
        elif isinstance(val, Mapping):
            slim = _slim_mapping(val)
            out[k] = slim if slim else val
        else:
            out[k] = val
    # common nested status fields not already kept
    for k, v in mm.items():
        if k in out:
            continue
        if isinstance(v, Mapping) and any(
            x in v for x in ("status", "ship_ok", "ok", "verdict", "screening_results",
                             "duty_torque_screen_ok", "twin_bound_case")
        ):
            slim = _slim_mapping(v)
            if slim:
                out[k] = slim
    return out


def _independent_arithmetic(q: Mapping[str, Any]) -> dict[str, Any]:
    """Deterministic skeptic checks the council must not be trusted alone for."""
    p_kw = float(q.get("front_regen_electrical_cap_kw") or q.get("front_regen_cap_kw") or 250)
    rpm = float(q.get("max_rotor_speed_rpm") or 19500)
    ratio = float(q.get("overall_reduction_ratio") or q.get("gear_ratio") or 8.0)
    omega = rpm * 2.0 * math.pi / 60.0
    t_shaft_ideal = (p_kw * 1000.0) / omega if omega > 0 else None
    # If electrical→shaft η assumed ~0.95, shaft power lower
    t_shaft_at_095 = (p_kw * 0.95 * 1000.0) / omega if omega > 0 else None
    return {
        "p_electrical_kw": p_kw,
        "rpm": rpm,
        "omega_rad_s": round(omega, 4) if omega else None,
        "t_shaft_ideal_nm_at_full_electrical": round(t_shaft_ideal, 3) if t_shaft_ideal else None,
        "t_shaft_nm_if_eta_shaft_0_95": round(t_shaft_at_095, 3) if t_shaft_at_095 else None,
        "overall_ratio_seed": ratio,
        "note": (
            "Compare claimed EM loaded torque (~207 N·m) and required (~125 N·m) "
            "against these first-principles shafts. Mismatch → FATAL arithmetic."
        ),
    }


def build() -> dict[str, Any]:
    state = _load(TWIN / "state.json") or {}
    mm = _load(TWIN / "motor-multiphysics.json") or {}
    assume = _load(TWIN / "JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.json") or {}
    barb = _load(TWIN / "JLR-FE-FRONT-FPK-BAR-B-READINESS.json") or {}
    q = _qty_map(state)

    pack = sorted(
        TWIN.glob("*-formula-e-front-mgu-design-pack"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    latest_pack = pack[0].name if pack else None
    renders = []
    if pack:
        rdir = pack[0] / "renders"
        if rdir.is_dir():
            renders = sorted(p.name for p in rdir.glob("*.png"))

    email_path = ROOT / "docs/plans/JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md"
    email_excerpt = ""
    if email_path.exists():
        email_excerpt = email_path.read_text()[:2500]
    jack_xlsx = TWIN / "JLR-FE-FRONT-FPK-ASSUMPTIONS-FOR-JACK.xlsx"
    stack = TWIN / "_motor_stack"
    stack_artefacts = sorted(p.name for p in stack.glob("*.json")) if stack.is_dir() else []

    digest = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "twin": str(TWIN),
        "revision": state.get("revision") or state.get("dossierRevision"),
        "product_class": (
            (state.get("parsedBrief") or {}).get("product_class")
            or (state.get("moduleDecomposition") or {}).get("product_class")
        ),
        "ship": {
            "ship_ok": (state.get("ship") or {}).get("ok")
            if isinstance(state.get("ship"), Mapping)
            else state.get("ship_ok"),
            "homologationHonesty": state.get("homologationHonesty"),
        },
        "pcb": {
            "disposition": (state.get("pcb") or {}).get("disposition"),
            "pipeline_ok": ((state.get("pcb") or {}).get("pipeline") or {}).get("ok")
            if isinstance((state.get("pcb") or {}).get("pipeline"), Mapping)
            else None,
            "supplierGerbers": (state.get("pcb") or {}).get("supplierGerbers"),
            "hilPresent": (state.get("pcb") or {}).get("hilPresent"),
            "forgeDraftOnly": (state.get("pcb") or {}).get("forgeDraftOnly"),
        },
        "interfaceIcd": state.get("interfaceIcd")
        or ((state.get("fpk") or {}).get("interfaceIcd") if isinstance(state.get("fpk"), Mapping) else None),
        "quantities_seed": {
            k: q.get(k)
            for k in (
                "front_regen_electrical_cap_kw",
                "max_rotor_speed_rpm",
                "dc_bus_voltage_v",
                "coolant_inlet_temp_c",
                "coolant_flow_lpm",
                "overall_reduction_ratio",
                "gear_ratio",
                "package_width_mm",
                "package_depth_mm",
                "package_height_mm",
                "dry_mass_kg",
                "inverter_dissipated_kw",
            )
            if k in q or True
        },
        "independent_arithmetic": _independent_arithmetic(q),
        "motor_multiphysics_slice": _slice_mm(mm if isinstance(mm, Mapping) else {}),
        "assumption_based_design": assume,
        "bar_b_readiness": barb,
        "latest_blender_pack": latest_pack,
        "blender_renders_present": renders,
        "motor_stack_json_artefacts": stack_artefacts[:40],
        "jack_fill_in_xlsx": {
            "path": str(jack_xlsx) if jack_xlsx.is_file() else None,
            "present": jack_xlsx.is_file(),
            "bytes": jack_xlsx.stat().st_size if jack_xlsx.is_file() else 0,
            "sheets_expected": [
                "Instructions",
                "Assumptions (fill)",
                "Results (context)",
                "Asks (fill)",
            ],
        },
        "jack_email_excerpt_secondary": email_excerpt,
        "operator_concerns": [
            "PROCESS: identity lock across EM / gears / cooling / Blender mm?",
            "GREENWASH: results-under-assumptions / Bar B filled → race-ready?",
            "EM arithmetic: 250 kW ↔ T=P/ω ↔ rpm ↔ peak vs mean vs torque_reliable",
            "Thermal process: loss → network → OpenFOAM Δp — units / fantasy temps?",
            "Gears/oil: FoS≈1.2 theatre; cornering_ok=False buried?",
            "Structure/dynamics: CalculiX / Ross mislabeled as retention proof?",
            "PCB/HIL/Gerbers — any false PASS? forgeDraftOnly respected?",
            "Blender morphology vs Lucid training check; cutaway clay honesty",
            "Excel LIVE formulas vs pasted literals on power/thermal",
            "Interfaces XYZ types-only — invented millimetres?",
            "Mass 32 kg aspiration vs CAD roll-up",
            "ship_ok / homologationHonesty must stay NOT_HOMOLOGATED",
            "Assumption→ask loop: can Jack overwrite freezes via xlsx?",
            "Jack email secondary — only if process-critical overclaim",
        ],
        "excel_notes": {
            "prior_council_formula_coverage_pct_sample": {
                "Calculations": 21.5,
                "Brief": 8.9,
                "Engineering Analysis": 11.4,
            },
            "require_check": "FPK power/thermal LIVE trace must exist; bare literals FAIL",
        },
    }
    # prune null quantity keys noise
    digest["quantities_seed"] = {
        k: v for k, v in (digest["quantities_seed"] or {}).items() if v is not None
    }
    return digest


def main() -> int:
    digest = build()
    OUT.write_text(json.dumps(digest, indent=2) + "\n")
    print(f"wrote {OUT} keys={list(digest.keys())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
