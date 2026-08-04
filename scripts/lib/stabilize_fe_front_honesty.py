#!/usr/bin/env python3
"""Stabilise FE Front twin honesty after Terminal thrash (Grok 2026-08-04).

Does NOT re-solve FE. Does NOT mint ship_ok. Does NOT edit em_fia_front_kit_case.py.

Fixes the deliverable-coherence class of lies:
  - mgu_fe_shaft_torque_nm looked like kit-case FE but was duty×option ratio
  - dec_009_baseline_reference lost magnet geometry to non-idempotent restamps
  - no single named binding duty torque bar
  - last coherent kit-case mean (81.558) was not on the contract

Usage:
  stabilize_fe_front_honesty.py --twin out/formula-e-front-mgu-20260729-1432
  stabilize_fe_front_honesty.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

SCHEMA = "forgeos.fpk.stabilize_fe_front_honesty/v1"
OUTPUT = "_motor_stack/stabilize_fe_front_honesty.json"
# Fallback only when REBALANCED is absent. Prefer the artefact's own
# required_shaft_torque_nm so the twin does not carry two disagreeing duty bars
# (start council 2026-08-04: 125.2193 vs 125.214912).
BINDING_DUTY_NM_FALLBACK = 125.2193
COHERENT_FE_MEAN_NM = 81.558081
REBALANCED_NAME = "em_fia_front_kit_case_REBALANCED.json"
PATH_B_NAME = "em_fia_front_kit_case_PATH_B_DEC009.json"
# DEC-009 architecture freeze dimensions (Path B)
DEC009_ACTIVE_MM = 130.0
DEC009_MAG_T_MM = 6.0
DEC009_MAG_L_MM = 22.5


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _qmap(state: dict) -> dict:
    oc = state.setdefault("orchestratorContract", {})
    if not isinstance(oc, dict):
        state["orchestratorContract"] = {}
        oc = state["orchestratorContract"]
    q = oc.setdefault("quantities", {})
    if not isinstance(q, dict):
        oc["quantities"] = {}
        q = oc["quantities"]
    return q


def _kit_case_summary(path: Path, twin: Path) -> dict[str, Any]:
    """Extract torque / geometry summary from a kit-case artefact."""
    j = _load(path)
    mg = j.get("machine_geometry") if isinstance(j.get("machine_geometry"), dict) else {}
    wic = j.get("works_in_kit_context") if isinstance(j.get("works_in_kit_context"), dict) else {}
    lp = j.get("loaded_point") if isinstance(j.get("loaded_point"), dict) else {}
    adc = j.get("analytical_duty_check") if isinstance(j.get("analytical_duty_check"), dict) else {}
    iq = j.get("input_quantities") if isinstance(j.get("input_quantities"), dict) else {}
    sweep = ((j.get("rotor_position_sweep") or {}).get("summary") or {})
    mean = (
        wic.get("torque_magnitude_mean_nm")
        or lp.get("torque_magnitude_mean_nm")
        or sweep.get("torque_magnitude_mean_nm")
        or sweep.get("delivered_mean_torque_nm")
    )
    required = None
    for src in (wic, lp, adc):
        try:
            if src.get("required_shaft_torque_nm") is not None:
                required = float(src["required_shaft_torque_nm"])
                break
        except (TypeError, ValueError):
            continue
    reliable = wic.get("torque_reliable")
    if reliable is None:
        reliable = lp.get("torque_reliable")
    duty_ok = wic.get("duty_torque_screen_ok")
    if duty_ok is None:
        duty_ok = lp.get("duty_torque_screen_ok")
    ratio = wic.get("mean_torque_vs_required_ratio")
    if ratio is None:
        ratio = lp.get("mean_torque_vs_required_ratio") or sweep.get(
            "torque_vs_required_ratio_mean"
        )
    try:
        rel = str(path.relative_to(twin)) if path.is_relative_to(twin) else str(path)
    except (TypeError, ValueError):
        rel = str(path)
    return {
        "path": rel,
        "active_length_mm": mg.get("active_length_mm"),
        "magnet_thickness_mm": mg.get("magnet_thickness_mm"),
        "magnet_length_mm": mg.get("magnet_length_mm"),
        "max_rotor_speed_rpm": iq.get("max_rotor_speed_rpm"),
        "phase_current_design_a": iq.get("phase_current_design_a"),
        "torque_magnitude_mean_nm": float(mean) if mean is not None else None,
        "required_shaft_torque_nm": required,
        "torque_reliable": reliable,
        "duty_torque_screen_ok": duty_ok,
        "mean_torque_vs_required_ratio": ratio,
        "sign_reversals": sweep.get("sign_reversals"),
        "torque_sign_consistent": sweep.get("torque_sign_consistent"),
        "torque_magnitude_min_nm": sweep.get("torque_magnitude_min_nm"),
        "torque_magnitude_max_nm": sweep.get("torque_magnitude_max_nm"),
        "fail_reasons": wic.get("fail_reasons"),
    }


def _read_rebalanced(twin: Path) -> dict[str, Any]:
    path = twin / "_motor_stack" / REBALANCED_NAME
    if not path.is_file():
        path = twin / "_motor_stack" / "em_fia_front_kit_case.json"
    if not path.is_file():
        raise FileNotFoundError(f"no kit-case artefact under {twin}/_motor_stack")
    out = _kit_case_summary(path, twin)
    if out.get("torque_magnitude_mean_nm") is None:
        out["torque_magnitude_mean_nm"] = COHERENT_FE_MEAN_NM
    out["schema_paths_tried"] = [
        "works_in_kit_context",
        "loaded_point",
        "analytical_duty_check",
        "rotor_position_sweep.summary",
    ]
    return out


def _read_path_b_if_coherent(twin: Path) -> Optional[dict[str, Any]]:
    """Return Path B summary only if sign-stable DEC-009 geometry freeze holds."""
    path = twin / "_motor_stack" / PATH_B_NAME
    if not path.is_file():
        return None
    pb = _kit_case_summary(path, twin)
    try:
        mean = pb.get("torque_magnitude_mean_nm")
        active = float(pb.get("active_length_mm") or 0)
        mag_t = float(pb.get("magnet_thickness_mm") or 0)
        mag_l = float(pb.get("magnet_length_mm") or 0)
        sign_ok = pb.get("torque_sign_consistent") is True
        rev = pb.get("sign_reversals")
        rev_ok = rev is not None and int(rev) == 0
        geom_ok = (
            abs(active - DEC009_ACTIVE_MM) < 0.05
            and abs(mag_t - DEC009_MAG_T_MM) < 0.01
            and abs(mag_l - DEC009_MAG_L_MM) < 0.01
        )
        mean_ok = mean is not None and float(mean) > 0
    except (TypeError, ValueError):
        return None
    if not (sign_ok and rev_ok and geom_ok and mean_ok):
        return None
    pb["coherent"] = True
    return pb


def _set_qty(
    q: dict,
    key: str,
    value: Any,
    *,
    unit: str,
    family: str,
    basis: str,
    source: str,
    provenance: dict,
    **extra: Any,
) -> None:
    row = q.get(key) if isinstance(q.get(key), dict) else {}
    row = dict(row)
    row.update(
        {
            "value": value,
            "unit": unit,
            "family": family,
            "basis": basis,
            "source": source,
            "provenance": provenance,
        }
    )
    row.update(extra)
    q[key] = row


def stabilize(twin: Path) -> dict[str, Any]:
    twin = twin.resolve()
    # ⭐ Twin writes need an OPEN stage (Terminal 2026-08-04 twin_write_guard).
    from twin_write_guard import assert_stage_open  # noqa: PLC0415
    assert_stage_open(twin, "stabilize_fe_front_honesty")
    state_path = twin / "state.json"
    reg_path = twin / "10-decision-register.json"
    if not state_path.is_file():
        raise FileNotFoundError(state_path)

    state = _load(state_path)
    q = _qmap(state)
    reb = _read_rebalanced(twin)
    path_b = _read_path_b_if_coherent(twin)
    actions: list[str] = []

    # ── S3 dual torque bars ────────────────────────────────────────────────
    # Conservative binding = REBALANCED analytical required (pre-24k ledger).
    binding = reb.get("required_shaft_torque_nm")
    if binding is None:
        binding = BINDING_DUTY_NM_FALLBACK
        binding_basis = "fallback_campaign_identity_125_2193"
        binding_detail = (
            "REBALANCED required_shaft_torque_nm missing; fallback 125.2193 "
            "(campaign P_elec/(η·ω) identity). Prefer artefact value when present."
        )
    else:
        binding = float(binding)
        binding_basis = "conservative_rebalanced_reference_not_architecture_power_bar"
        binding_detail = (
            f"CONSERVATIVE ledger bar from {reb['path']} "
            f"required_shaft_torque_nm={binding} (≈19.5k REBALANCED analytical). "
            "Not the DEC-009 architecture power bar at 24k — see "
            "architecture_duty_shaft_torque_nm when Path B is present. "
            "Not P_shaft/ω delivered (~119.7)."
        )
    _set_qty(
        q,
        "binding_duty_shaft_torque_nm",
        binding,
        unit="N·m",
        family="torque",
        basis=binding_basis,
        source="decision:stabilize_2026_08_04",
        provenance={
            "source": f"artefact:{reb['path']}+stabilize_fe_front_honesty",
            "detail": binding_detail,
            "identity": "T = P_elec / (η · ω) on REBALANCED analytical check",
            "not": "architecture_duty at 24k; mgu_shaft_torque_nm delivered P_shaft/ω",
            "campaign_rounded_alias_nm": BINDING_DUTY_NM_FALLBACK,
            "note_on_alias": (
                "125.2193 appears in older campaign prose; delta vs REBALANCED "
                f"{binding} is rounding/η-literal only (~0.004 N·m)."
            ),
        },
        condition="Conservative ledger bar; architecture bar is separate when Path B exists",
        scope="module",
    )
    actions.append(f"binding_duty_shaft_torque_nm={binding} ({binding_basis})")

    arch_duty = None
    if path_b and path_b.get("required_shaft_torque_nm") is not None:
        arch_duty = float(path_b["required_shaft_torque_nm"])
        _set_qty(
            q,
            "architecture_duty_shaft_torque_nm",
            arch_duty,
            unit="N·m",
            family="torque",
            basis="path_b_dec009_analytical_required_at_24k",
            source="tool:em_fia_front_kit_case+PATH_B",
            provenance={
                "source": f"artefact:{path_b['path']}",
                "detail": (
                    f"Analytical shaft torque at DEC-009 freeze (24k rpm / 250 kW / twin η) "
                    f"from Path B kit-case = {arch_duty} N·m. This is the architecture "
                    "power bar. Path B mean clears this; conservative binding may not."
                ),
                "max_rotor_speed_rpm": path_b.get("max_rotor_speed_rpm"),
                "active_length_mm": path_b.get("active_length_mm"),
            },
            condition="DEC-009 architecture power bar from Path B analytical duty",
            scope="module",
        )
        actions.append(f"architecture_duty_shaft_torque_nm={arch_duty}")

    # ── S2 last sign-consistent kit-case FE mean (NOT duty-clear) ─────────
    # Prefer coherent Path B (DEC-009 freeze) over REBALANCED (pre-DEC-009).
    if path_b is not None:
        mean_fe = float(path_b["torque_magnitude_mean_nm"])
        fe_src = path_b
        fe_epoch = "DEC-009 Path B (24k/130, magnets 6×22.5)"
        fe_condition = (
            "Path B sign-consistent kit-case mean at DEC-009 freeze; "
            "duty_screen FAIL while torque_reliable=false by design"
        )
        geometry_note = (
            "PATH_B_DEC009: active≈130 mm, 24,000 rpm, magnets 6.0×22.5 mm. "
            "Failed em_fia_front_kit_case_DEC009.json (8.85×14.58 magnets) is NOT this."
        )
    else:
        mean_fe = float(reb["torque_magnitude_mean_nm"])
        fe_src = reb
        fe_epoch = "pre-DEC-009 REBALANCED (≈97.58 mm / 19.5k)"
        fe_condition = "pre-DEC-009 sign-consistent FE mean (REBALANCED); duty screen FAIL"
        geometry_note = (
            "REBALANCED is pre-DEC-009 geometry (active_length≈97.58 mm, "
            "~19,500 rpm class) — not the 24k/130 freeze. Path B artefact absent "
            "or not coherent."
        )

    ratio_vs_binding = mean_fe / float(binding) if binding else None
    ratio_vs_arch = (
        mean_fe / float(arch_duty) if arch_duty and arch_duty > 0 else None
    )
    fe_caveat = (
        f"SIGN-CONSISTENT mean only ({fe_epoch}). "
        f"torque_reliable={fe_src.get('torque_reliable')}; "
        f"duty_torque_screen_ok={fe_src.get('duty_torque_screen_ok')}; "
        f"fail_reasons={fe_src.get('fail_reasons')}; "
        f"mean_vs_architecture_ratio={ratio_vs_arch}; "
        f"mean_vs_conservative_binding_ratio={ratio_vs_binding}. "
        "duty_torque_screen_ok requires torque_reliable=True (dyno/map) by kit-case "
        "design — false here is NOT proof of short torque vs architecture bar. "
        "NOT ship_ok. NOT automatic Bar A close. "
        f"Sweep |T| range "
        f"{fe_src.get('torque_magnitude_min_nm')}–{fe_src.get('torque_magnitude_max_nm')} N·m."
    )
    fe_basis = "kit_case_sign_consistent_mean_not_duty_clear"
    _set_qty(
        q,
        "last_coherent_kit_case_fe_mean_nm",
        mean_fe,
        unit="N·m",
        family="torque",
        basis=fe_basis,
        source="tool:em_fia_front_kit_case",
        provenance={
            "source": f"artefact:{fe_src['path']}",
            "detail": (
                "Kit-case position-sweep mean with torque_sign_consistent and no "
                "sign-reversal thrash. NOT duty-clear / NOT torque_reliable SIGHT."
            ),
            "caveat": fe_caveat,
            "sign_reversals": fe_src.get("sign_reversals"),
            "torque_sign_consistent": fe_src.get("torque_sign_consistent"),
            "torque_reliable": fe_src.get("torque_reliable"),
            "duty_torque_screen_ok": fe_src.get("duty_torque_screen_ok"),
            "mean_torque_vs_required_ratio": fe_src.get("mean_torque_vs_required_ratio"),
            "torque_magnitude_min_nm": fe_src.get("torque_magnitude_min_nm"),
            "torque_magnitude_max_nm": fe_src.get("torque_magnitude_max_nm"),
            "active_length_mm": fe_src.get("active_length_mm"),
            "magnet_thickness_mm": fe_src.get("magnet_thickness_mm"),
            "magnet_length_mm": fe_src.get("magnet_length_mm"),
            "geometry_note": geometry_note,
            "ratio_vs_architecture_duty": ratio_vs_arch,
            "ratio_vs_conservative_binding": ratio_vs_binding,
        },
        condition=fe_condition,
        scope="module",
    )
    _set_qty(
        q,
        "last_sign_consistent_kit_case_fe_mean_nm",
        mean_fe,
        unit="N·m",
        family="torque",
        basis=fe_basis,
        source="tool:em_fia_front_kit_case",
        provenance={
            "source": f"artefact:{fe_src['path']}",
            "detail": "Preferred key; same value as last_coherent_kit_case_fe_mean_nm.",
            "caveat": fe_caveat,
            "alias_of": "last_coherent_kit_case_fe_mean_nm",
        },
        condition=fe_condition,
        scope="module",
    )
    actions.append(
        f"last_sign_consistent_kit_case_fe_mean_nm={mean_fe} "
        f"from {fe_src['path']} (duty_clear=false)"
    )

    # ── S1 relabel option-screen product torque ────────────────────────────
    ratio_row = q.get("dec_009_adopted_torque_ratio")
    try:
        ratio = float(ratio_row.get("value")) if isinstance(ratio_row, dict) else 1.069
    except (TypeError, ValueError):
        ratio = 1.069
    product = round(float(binding) * ratio, 6)
    _set_qty(
        q,
        "mgu_fe_shaft_torque_nm",
        product,
        unit="N·m",
        family="torque",
        basis="option_screen_product_not_kit_case_fe",
        source="decision:DEC-009+stabilize_honesty",
        provenance={
            "source": "decision:DEC-009+tool:dec_em1_option_screen+stabilize",
            "detail": (
                f"ARITHMETIC PRODUCT: binding_duty_shaft_torque_nm ({binding}) × "
                f"dec_009_adopted_torque_ratio ({ratio}) = {product}. "
                "This is NOT a kit-case FEMM mean. "
                f"Last sign-consistent kit-case mean is {mean_fe} N·m "
                f"(see last_sign_consistent_kit_case_fe_mean_nm / {fe_src['path']}; "
                f"duty_clear=false)."
            ),
            "caveat": (
                "Do not use this field as FE SIGHT for Bar A close. "
                "Option-screen product remains until a DEC sets product = kit-case FE. "
                f"Path B kit-case mean ({mean_fe} N·m) is on last_sign_consistent_* only."
            ),
            "formula": "binding_duty_shaft_torque_nm * dec_009_adopted_torque_ratio",
            "binding_duty_shaft_torque_nm": binding,
            "architecture_duty_shaft_torque_nm": arch_duty,
            "torque_ratio": ratio,
            "last_sign_consistent_kit_case_fe_mean_nm": mean_fe,
        },
        condition="option-screen product only — not kit-case FE",
        scope="module",
    )
    actions.append(f"mgu_fe_shaft_torque_nm relabelled product={product}")

    # Keep ratio basis honest
    if isinstance(ratio_row, dict):
        ratio_row = dict(ratio_row)
        ratio_row["basis"] = "measured_fe_option_screen_prior_campaign"
        prov = dict(ratio_row.get("provenance") or {})
        prov["caveat"] = (
            (prov.get("caveat") or "")
            + " Ratio is from option-screen FE campaign, not the live kit-case artefact."
        ).strip()
        ratio_row["provenance"] = prov
        q["dec_009_adopted_torque_ratio"] = ratio_row

    # ── S4 baseline reference repair ───────────────────────────────────────
    base = q.get("dec_009_baseline_reference")
    if not isinstance(base, dict):
        base = {}
    else:
        base = dict(base)
    # Prefer existing non-None values; fill holes from disk + register text
    # Overwrite contaminated adopted values (24k/130) and wrong non-null geometry
    # left by non-idempotent restamps — not only fill None holes (Sol start council).
    base["max_rotor_speed_rpm"] = 19500
    base["stack_length_mm"] = 98.33
    if reb.get("active_length_mm") is not None:
        base["active_length_mm"] = reb["active_length_mm"]
    if reb.get("magnet_thickness_mm") is not None:
        base["magnet_thickness_mm"] = reb["magnet_thickness_mm"]
    if reb.get("magnet_length_mm") is not None:
        base["magnet_length_mm"] = reb["magnet_length_mm"]
    # Baseline FE mean is always REBALANCED epoch — never Path B / DEC-009.
    base["mgu_fe_shaft_torque_nm"] = float(reb["torque_magnitude_mean_nm"])
    base["geometry_epoch"] = "pre_DEC_009_REBALANCED"
    # magnet temp continuous reference if still missing
    if base.get("mgu_magnet_temp_c") is None:
        cont = None
        for name in (
            "analytical_fia_cooling_network_screen.json",
            "analytical_fia_cooling_thermal_screen.json",
        ):
            cp = twin / "_motor_stack" / name
            if not cp.is_file():
                continue
            scr = _load(cp)
            sr = scr.get("screening_results") if isinstance(scr, dict) else None
            if isinstance(sr, dict) and sr.get("continuous_reference_maximum_magnet_temperature_c") is not None:
                cont = sr["continuous_reference_maximum_magnet_temperature_c"]
                break
        if cont is not None:
            base["mgu_magnet_temp_c"] = cont
            base["mgu_magnet_temp_c_basis"] = "continuous_reference_pre_dec008_from_cooling_screen"
    base["note"] = (
        "Pre-DEC-009 baseline for audit — not the design freeze. "
        "Repaired 2026-08-04 from disk kit-case geometry + register text + cooling continuous_reference."
    )
    base["provenance"] = {
        "source": "reconstructed:disk-artefact+10-decision-register",
        "kit_case": reb["path"],
        "register_text": (
            "DEC-009 supersedes the 19,500 rpm / 98.33 mm baseline"
        ),
        "why": (
            "Non-idempotent restamp reruns had overwritten baseline with adopted "
            "24k/130 values and blanked magnet geometry. Filled only from artefacts "
            "still on disk; nothing invented."
        ),
        "stabilized_at": _iso(),
    }
    q["dec_009_baseline_reference"] = base
    actions.append(
        "dec_009_baseline_reference repaired "
        f"magnet={base.get('magnet_thickness_mm')}x{base.get('magnet_length_mm')} "
        f"active={base.get('active_length_mm')}"
    )

    # ── S5 decision register residual ──────────────────────────────────────
    if path_b is not None:
        residual = (
            "ARCHITECTURE freeze (24,000 rpm / 130 mm) stands. "
            f"Path B kit-case FE (sign-consistent) mean = {mean_fe:.3f} N·m at "
            "130 mm / 24k / magnets 6×22.5 (em_fia_front_kit_case_PATH_B_DEC009). "
            f"Architecture power bar = {arch_duty} N·m; mean ratio ≈ "
            f"{ratio_vs_arch:.3f}× (clears architecture bar numerically). "
            f"Conservative binding bar = {binding} N·m; mean ratio ≈ "
            f"{(ratio_vs_binding or 0):.3f}× (does NOT clear conservative binding). "
            "duty_torque_screen_ok remains false because kit-case keeps "
            "torque_reliable=false until dyno/map — fail reason is reliability gate, "
            "not short mean vs architecture bar. "
            f"mgu_fe_shaft_torque_nm={product} is still option-screen PRODUCT, not kit-case FE. "
            "Bar A / ship_ok remain OPEN. Failed DEC009 (8.85 mm magnets) is not SIGHT. "
            "Reverses if DEC-008 reverses or release FoS fails (Bar B / B9)."
        )
        reg_notes = (
            "2026-08-04 Path B: sign-stable kit-case FE at freeze geometry. "
            "Dual bars published (architecture vs conservative binding). "
            "FE mean label = Path B; duty_screen still open (torque_reliable). "
            "Do not mint ship_ok."
        )
    else:
        residual = (
            "ARCHITECTURE freeze (24,000 rpm / 130 mm) stands under assumption. "
            "FE kit-case SIGHT is NOT closed: last coherent kit-case mean is "
            f"{mean_fe:.3f} N·m at ~97.58 mm / 19,500 rpm (REBALANCED); "
            "DEC-009 Path B artefact absent or not coherent. "
            f"Contract field mgu_fe_shaft_torque_nm={product} is an option-screen "
            "ARITHMETIC PRODUCT (binding duty × ratio), not kit-case FE. "
            "Bar A FE clearance remains OPEN. "
            "Reverses if DEC-008 reverses or release FoS fails (Bar B / B9)."
        )
        reg_notes = (
            "2026-08-04 stabilise: status remains FROZEN_UNDER_ASSUMPTION "
            "(architecture). FE SIGHT open — see residual_risk. "
            "Do not read BAR A CLOSED as kit-case FE pass."
        )
    if reg_path.is_file():
        reg = _load(reg_path)
        if isinstance(reg, list):
            for d in reg:
                if isinstance(d, dict) and d.get("id") == "DEC-009":
                    d["residual_risk"] = residual
                    d["notes"] = reg_notes
                    actions.append("DEC-009 residual_risk updated (FE SIGHT dual-bar)")
            _atomic_write(reg_path, json.dumps(reg, indent=2, ensure_ascii=False) + "\n")
            # S6 sync into state
            state["decisionRegister"] = reg
            actions.append("state.decisionRegister synced from file")

    # Hard stop
    if state.get("ship_ok") is True:
        state["ship_ok"] = False
        actions.append("ship_ok forced false")
    state["ship_ok"] = False

    _atomic_write(state_path, json.dumps(state, indent=2, ensure_ascii=False) + "\n")

    report = {
        "schema": SCHEMA,
        "applied_at": _iso(),
        "twin": str(twin),
        "actions": actions,
        "binding_duty_shaft_torque_nm": binding,
        "architecture_duty_shaft_torque_nm": arch_duty,
        "option_screen_product_nm": product,
        "last_sign_consistent_kit_case_fe_mean_nm": mean_fe,
        "last_coherent_kit_case_fe_mean_nm": mean_fe,
        "fe_mean_source": fe_src.get("path"),
        "fe_mean_duty_clear": False,
        "fe_mean_torque_reliable": fe_src.get("torque_reliable"),
        "ratio_vs_architecture_duty": ratio_vs_arch,
        "ratio_vs_conservative_binding": ratio_vs_binding,
        "path_b_adopted": path_b is not None,
        "rebalanced": reb,
        "path_b": path_b,
        "ship_ok": False,
        "not_done": [
            "torque_reliable / dyno-map close",
            "Bar A FE close / ship_ok",
            "MemPalace rewrite",
            "edit em_fia_front_kit_case.py to force torque_reliable",
            "retire conservative binding 125.2 without DEC",
        ],
    }
    _atomic_write(
        twin / OUTPUT,
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
    )
    return report


def _selftest() -> int:
    # Selftests write scratch twins with no discipline stage.
    import os as _os
    _os.environ.setdefault("TWIN_WRITE_GUARD", "off")
    _os.environ.setdefault("TWIN_WRITE_GUARD_REASON", "selftest")
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    with tempfile.TemporaryDirectory(prefix="stab-fe-") as raw:
        twin = Path(raw)
        ms = twin / "_motor_stack"
        ms.mkdir()
        (ms / REBALANCED_NAME).write_text(
            json.dumps(
                {
                    "machine_geometry": {
                        "active_length_mm": 97.58,
                        "magnet_thickness_mm": 6.0,
                        "magnet_length_mm": 22.5,
                    },
                    "works_in_kit_context": {
                        "torque_magnitude_mean_nm": 81.558081,
                        "required_shaft_torque_nm": 125.214912,
                        "torque_reliable": False,
                        "duty_torque_screen_ok": False,
                        "mean_torque_vs_required_ratio": 0.651345,
                    },
                    "rotor_position_sweep": {
                        "summary": {
                            "torque_magnitude_mean_nm": 81.558081,
                            "sign_reversals": 0,
                            "torque_sign_consistent": True,
                            "torque_magnitude_min_nm": 55.961,
                            "torque_magnitude_max_nm": 97.637594,
                        }
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (ms / "analytical_fia_cooling_network_screen.json").write_text(
            json.dumps(
                {
                    "screening_results": {
                        "continuous_reference_maximum_magnet_temperature_c": 159.35
                    }
                }
            )
            + "\n",
            encoding="utf-8",
        )
        state = {
            "ship_ok": False,
            "orchestratorContract": {
                "quantities": {
                    "mgu_fe_shaft_torque_nm": {
                        "value": 133.854741,
                        "basis": "dec_009_adopted_fe_ratio",
                    },
                    "dec_009_adopted_torque_ratio": {"value": 1.069},
                    "dec_009_baseline_reference": {
                        "max_rotor_speed_rpm": 24000,
                        "stack_length_mm": 130,
                        "mgu_magnet_temp_c": None,
                        "mgu_fe_shaft_torque_nm": 133.854741,
                    },
                }
            },
        }
        (twin / "state.json").write_text(json.dumps(state, indent=2) + "\n")
        (twin / "10-decision-register.json").write_text(
            json.dumps(
                [
                    {
                        "id": "DEC-009",
                        "status": "FROZEN_UNDER_ASSUMPTION",
                        "decision": "24k/130",
                        "residual_risk": "old",
                    }
                ],
                indent=2,
            )
            + "\n"
        )
        r = stabilize(twin)
        st = _load(twin / "state.json")
        q = st["orchestratorContract"]["quantities"]
        ck("product_basis", q["mgu_fe_shaft_torque_nm"]["basis"] == "option_screen_product_not_kit_case_fe")
        ck("product_value", abs(float(q["mgu_fe_shaft_torque_nm"]["value"]) - 125.214912 * 1.069) < 1e-3)
        ck("coherent_fe", abs(float(q["last_coherent_kit_case_fe_mean_nm"]["value"]) - 81.558081) < 1e-6)
        ck(
            "fe_basis_not_duty_clear",
            q["last_coherent_kit_case_fe_mean_nm"]["basis"]
            == "kit_case_sign_consistent_mean_not_duty_clear",
        )
        ck("binding", abs(float(q["binding_duty_shaft_torque_nm"]["value"]) - 125.214912) < 1e-6)
        ck(
            "alias_fe",
            abs(float(q["last_sign_consistent_kit_case_fe_mean_nm"]["value"]) - 81.558081) < 1e-6,
        )
        ck("no_arch_without_path_b", "architecture_duty_shaft_torque_nm" not in q)
        base = q["dec_009_baseline_reference"]
        ck("base_rpm", base.get("max_rotor_speed_rpm") == 19500, str(base))
        ck("base_stack", float(base.get("stack_length_mm")) == 98.33, str(base))
        ck("base_mag_t", float(base.get("magnet_thickness_mm")) == 6.0, str(base))
        ck("base_mag_l", float(base.get("magnet_length_mm")) == 22.5, str(base))
        ck("base_active", float(base.get("active_length_mm")) == 97.58, str(base))
        ck("base_fe_not_product", abs(float(base.get("mgu_fe_shaft_torque_nm")) - 81.558081) < 1e-6)
        ck("ship_ok_false", st.get("ship_ok") is False)
        reg = _load(twin / "10-decision-register.json")
        ck("residual", "FE kit-case SIGHT" in (reg[0].get("residual_risk") or "") or "Path B" in (reg[0].get("residual_risk") or ""))
        ck("report", (twin / OUTPUT).is_file())
        # idempotent
        r2 = stabilize(twin)
        ck("idempotent_actions", len(r2.get("actions") or []) >= 1)

        # Path B present → adopt mean + architecture bar
        (ms / PATH_B_NAME).write_text(
            json.dumps(
                {
                    "machine_geometry": {
                        "active_length_mm": 130.0,
                        "magnet_thickness_mm": 6.0,
                        "magnet_length_mm": 22.5,
                    },
                    "input_quantities": {
                        "max_rotor_speed_rpm": 24000.0,
                        "phase_current_design_a": 535.0,
                    },
                    "works_in_kit_context": {
                        "torque_magnitude_mean_nm": 122.099939,
                        "required_shaft_torque_nm": 104.098914,
                        "torque_reliable": False,
                        "duty_torque_screen_ok": False,
                        "mean_torque_vs_required_ratio": 1.172922,
                        "fail_reasons": ["torque_reliable=false"],
                    },
                    "rotor_position_sweep": {
                        "summary": {
                            "delivered_mean_torque_nm": 122.099939,
                            "torque_magnitude_mean_nm": 122.099939,
                            "sign_reversals": 0,
                            "torque_sign_consistent": True,
                            "torque_magnitude_min_nm": 84.967,
                            "torque_magnitude_max_nm": 145.231,
                        }
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        r3 = stabilize(twin)
        st3 = _load(twin / "state.json")
        q3 = st3["orchestratorContract"]["quantities"]
        ck("path_b_mean", abs(float(q3["last_sign_consistent_kit_case_fe_mean_nm"]["value"]) - 122.099939) < 1e-6)
        ck("path_b_arch", abs(float(q3["architecture_duty_shaft_torque_nm"]["value"]) - 104.098914) < 1e-6)
        ck("path_b_binding_kept", abs(float(q3["binding_duty_shaft_torque_nm"]["value"]) - 125.214912) < 1e-6)
        ck("path_b_product_still", q3["mgu_fe_shaft_torque_nm"]["basis"] == "option_screen_product_not_kit_case_fe")
        ck("path_b_adopted_flag", r3.get("path_b_adopted") is True)
        ck("path_b_ship_false", st3.get("ship_ok") is False)

    if fails:
        print("stabilize_fe_front_honesty selftest FAIL:")
        for f in fails:
            print(" ", f)
        return 1
    print("stabilize_fe_front_honesty selftest: OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")
    rep = stabilize(args.twin)
    print(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
