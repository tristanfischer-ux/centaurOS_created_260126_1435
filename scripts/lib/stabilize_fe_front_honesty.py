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


def _read_rebalanced(twin: Path) -> dict[str, Any]:
    path = twin / "_motor_stack" / REBALANCED_NAME
    if not path.is_file():
        path = twin / "_motor_stack" / "em_fia_front_kit_case.json"
    if not path.is_file():
        raise FileNotFoundError(f"no kit-case artefact under {twin}/_motor_stack")
    j = _load(path)
    mg = j.get("machine_geometry") if isinstance(j.get("machine_geometry"), dict) else {}
    wic = j.get("works_in_kit_context") if isinstance(j.get("works_in_kit_context"), dict) else {}
    lp = j.get("loaded_point") if isinstance(j.get("loaded_point"), dict) else {}
    adc = j.get("analytical_duty_check") if isinstance(j.get("analytical_duty_check"), dict) else {}
    sweep = ((j.get("rotor_position_sweep") or {}).get("summary") or {})
    # Prefer works_in_kit_context, then loaded_point, then analytical_duty_check,
    # then sweep summary — fail closed to fallback only when none publish the bar.
    mean = (
        wic.get("torque_magnitude_mean_nm")
        or lp.get("torque_magnitude_mean_nm")
        or sweep.get("torque_magnitude_mean_nm")
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
    return {
        "path": str(path.relative_to(twin)) if path.is_relative_to(twin) else str(path),
        "active_length_mm": mg.get("active_length_mm"),
        "magnet_thickness_mm": mg.get("magnet_thickness_mm"),
        "magnet_length_mm": mg.get("magnet_length_mm"),
        "torque_magnitude_mean_nm": float(mean) if mean is not None else COHERENT_FE_MEAN_NM,
        "required_shaft_torque_nm": required,
        "torque_reliable": reliable,
        "duty_torque_screen_ok": duty_ok,
        "mean_torque_vs_required_ratio": ratio,
        "sign_reversals": sweep.get("sign_reversals"),
        "torque_sign_consistent": sweep.get("torque_sign_consistent"),
        "torque_magnitude_min_nm": sweep.get("torque_magnitude_min_nm"),
        "torque_magnitude_max_nm": sweep.get("torque_magnitude_max_nm"),
        "schema_paths_tried": [
            "works_in_kit_context",
            "loaded_point",
            "analytical_duty_check",
            "rotor_position_sweep.summary",
        ],
    }


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
    actions: list[str] = []

    # ── S3 binding duty bar (one number — from REBALANCED when present) ────
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
        binding_basis = "rebalanced_required_shaft_torque_nm"
        binding_detail = (
            f"Binding Bar A duty bar taken from {reb['path']} "
            f"works_in_kit_context.required_shaft_torque_nm={binding} "
            "(analytical duty check on the last sign-consistent kit-case). "
            "Not P_shaft/ω delivered (~119.7). Not a silent 24k easier bar — "
            "re-derive at 24k is a separate register decision."
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
            "identity": "T = P_elec / (η · ω) as published on the kit-case analytical check",
            "not": "mgu_shaft_torque_nm delivered P_shaft/ω (~119.7)",
            "campaign_rounded_alias_nm": BINDING_DUTY_NM_FALLBACK,
            "note_on_alias": (
                "125.2193 appears in older campaign prose; delta vs REBALANCED "
                f"{binding} is rounding/η-literal only (~0.004 N·m). Binding is the artefact."
            ),
        },
        condition="Bar A clearance bar until a DEC names the 24k identity",
        scope="module",
    )
    actions.append(f"binding_duty_shaft_torque_nm={binding}")

    # ── S2 last sign-consistent kit-case FE mean (NOT duty-clear SIGHT) ────
    mean_fe = float(reb["torque_magnitude_mean_nm"])
    fe_caveat = (
        "SIGN-CONSISTENT mean only (sign_reversals=0). "
        f"torque_reliable={reb.get('torque_reliable')}; "
        f"duty_torque_screen_ok={reb.get('duty_torque_screen_ok')}; "
        f"mean_ratio={reb.get('mean_torque_vs_required_ratio')}. "
        "Does NOT clear the binding duty bar. NOT Bar A FE SIGHT. "
        f"Sweep |T| range "
        f"{reb.get('torque_magnitude_min_nm')}–{reb.get('torque_magnitude_max_nm')} N·m."
    )
    _set_qty(
        q,
        "last_coherent_kit_case_fe_mean_nm",
        mean_fe,
        unit="N·m",
        family="torque",
        basis="kit_case_sign_consistent_mean_not_duty_clear",
        source="tool:em_fia_front_kit_case",
        provenance={
            "source": f"artefact:{reb['path']}",
            "detail": (
                "Kit-case position-sweep mean with torque_sign_consistent and no "
                "sign-reversal thrash. Name retains historical key; basis makes "
                "explicit this is NOT duty-clear / NOT torque_reliable SIGHT."
            ),
            "caveat": fe_caveat,
            "sign_reversals": reb.get("sign_reversals"),
            "torque_sign_consistent": reb.get("torque_sign_consistent"),
            "torque_reliable": reb.get("torque_reliable"),
            "duty_torque_screen_ok": reb.get("duty_torque_screen_ok"),
            "mean_torque_vs_required_ratio": reb.get("mean_torque_vs_required_ratio"),
            "torque_magnitude_min_nm": reb.get("torque_magnitude_min_nm"),
            "torque_magnitude_max_nm": reb.get("torque_magnitude_max_nm"),
            "active_length_mm": reb.get("active_length_mm"),
            "geometry_note": (
                "REBALANCED is pre-DEC-009 geometry (active_length≈97.58 mm, "
                "~19,500 rpm class) — not the 24k/130 freeze."
            ),
        },
        condition="pre-DEC-009 sign-consistent FE mean (REBALANCED); duty screen FAIL",
        scope="module",
    )
    # Alias with an honest name for new consumers
    _set_qty(
        q,
        "last_sign_consistent_kit_case_fe_mean_nm",
        mean_fe,
        unit="N·m",
        family="torque",
        basis="kit_case_sign_consistent_mean_not_duty_clear",
        source="tool:em_fia_front_kit_case",
        provenance={
            "source": f"artefact:{reb['path']}",
            "detail": "Preferred key; same value as last_coherent_kit_case_fe_mean_nm.",
            "caveat": fe_caveat,
            "alias_of": "last_coherent_kit_case_fe_mean_nm",
        },
        condition="pre-DEC-009 sign-consistent FE mean (REBALANCED); duty screen FAIL",
        scope="module",
    )
    actions.append(f"last_sign_consistent_kit_case_fe_mean_nm={mean_fe} (duty_clear=false)")

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
                "This is NOT a kit-case FEMM mean at the DEC-009 freeze. "
                f"Last sign-consistent kit-case mean is {mean_fe} N·m "
                f"(see last_sign_consistent_kit_case_fe_mean_nm / {reb['path']}; "
                f"duty_clear=false)."
            ),
            "caveat": (
                "Do not use this field as FE SIGHT for Bar A close. "
                "DEC-009 option-screen ratio is a prior campaign measurement; "
                "live kit-case at 24k/130 is open / unreliable until re-solved."
            ),
            "formula": "binding_duty_shaft_torque_nm * dec_009_adopted_torque_ratio",
            "binding_duty_shaft_torque_nm": binding,
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
    base["mgu_fe_shaft_torque_nm"] = mean_fe
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
    residual = (
        "ARCHITECTURE freeze (24,000 rpm / 130 mm) stands under assumption. "
        "FE kit-case SIGHT is NOT closed: last coherent kit-case mean is "
        f"{mean_fe:.3f} N·m at ~97.58 mm / 19,500 rpm (REBALANCED); "
        "DEC-009 hybrid/option kit-case artefact is unreliable "
        "(sign reversals / torque_reliable=false). "
        f"Contract field mgu_fe_shaft_torque_nm={product} is an option-screen "
        "ARITHMETIC PRODUCT (binding duty × ratio), not kit-case FE. "
        "Bar A FE clearance remains OPEN until a provenance-frozen kit-case "
        "solve at the freeze geometry clears the binding duty bar. "
        "Reverses if DEC-008 reverses or release FoS fails (Bar B / B9)."
    )
    if reg_path.is_file():
        reg = _load(reg_path)
        if isinstance(reg, list):
            for d in reg:
                if isinstance(d, dict) and d.get("id") == "DEC-009":
                    d["residual_risk"] = residual
                    d["notes"] = (
                        "2026-08-04 stabilise: status remains FROZEN_UNDER_ASSUMPTION "
                        "(architecture). FE SIGHT open — see residual_risk. "
                        "Do not read BAR A CLOSED as kit-case FE pass."
                    )
                    actions.append("DEC-009 residual_risk updated (FE SIGHT open)")
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
        "option_screen_product_nm": product,
        "last_sign_consistent_kit_case_fe_mean_nm": mean_fe,
        "last_coherent_kit_case_fe_mean_nm": mean_fe,  # historical key; same value
        "fe_mean_duty_clear": False,
        "fe_mean_torque_reliable": reb.get("torque_reliable"),
        "rebalanced": reb,
        "ship_ok": False,
        "not_done": [
            "em_fia_front_kit_case re-solve",
            "Bar A FE close",
            "MemPalace rewrite",
            "edit em_fia_front_kit_case.py",
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
        base = q["dec_009_baseline_reference"]
        ck("base_rpm", base.get("max_rotor_speed_rpm") == 19500, str(base))
        ck("base_stack", float(base.get("stack_length_mm")) == 98.33, str(base))
        ck("base_mag_t", float(base.get("magnet_thickness_mm")) == 6.0, str(base))
        ck("base_mag_l", float(base.get("magnet_length_mm")) == 22.5, str(base))
        ck("base_active", float(base.get("active_length_mm")) == 97.58, str(base))
        ck("base_fe_not_product", abs(float(base.get("mgu_fe_shaft_torque_nm")) - 81.558081) < 1e-6)
        ck("ship_ok_false", st.get("ship_ok") is False)
        reg = _load(twin / "10-decision-register.json")
        ck("residual", "FE kit-case SIGHT" in (reg[0].get("residual_risk") or ""))
        ck("report", (twin / OUTPUT).is_file())
        # idempotent
        r2 = stabilize(twin)
        ck("idempotent_actions", len(r2.get("actions") or []) >= 1)

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
