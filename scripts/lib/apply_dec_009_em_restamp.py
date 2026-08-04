#!/usr/bin/env python3
"""Apply DEC-009 (24,000 rpm / 130 mm stack) to a live twin — restamp, don't invent.

⭐ UNIVERSAL companion to DEC-008 (2026-08-03). DEC-009 freezes max_rotor_speed_rpm
and stack_length_mm. Without a restamp the twin stayed at 19,500 / 98.33 mm while
the decision register claimed 1.069× torque.

This restamp:
  1. Requires DEC-008 thermal path (intermittent duty) — applies it if missing.
  2. Reads the measured option row from dec_em1_option_screen (24k/130) — torque
     ratio and FoS are MEASURED inputs, not re-solved here.
  3. Writes max_rotor_speed_rpm=24000, stack_length_mm=130 with DEC-009 provenance.
  4. Scales stator_iron_mass_kg with stack; stamps option iron_loss_w.
  5. Stamps magnet/winding temps to vignette thermal at the adopted option (99.4 °C
     under DEC-008 duty) and updates cooling-screen JSON.
  6. Stamps adopted FE mean torque = required × 1.069 with clear provenance that
     the ratio is from the option screen FE campaign, not a fresh FEMM run.
  7. Does NOT mint ship_ok. Does NOT close Bar B.

Usage:
  apply_dec_009_em_restamp.py --twin <dir>
  apply_dec_009_em_restamp.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from apply_dec_008_duty_restamp import (  # noqa: E402
    OUTPUT as DEC008_OUT,
    apply_dec_008,
)
from dec_em1_option_screen import evaluate as evaluate_em1  # noqa: E402

# Import is_applied helper from frozen dispatcher would cycle — duplicate thin check
def _dec008_ok(twin: Path) -> bool:
    st_path = twin / "state.json"
    if not st_path.is_file():
        return False
    st = json.loads(st_path.read_text(encoding="utf-8"))
    q = ((st.get("orchestratorContract") or {}).get("quantities") or {})
    cp = q.get("continuous_power_kw") if isinstance(q, dict) else None
    basis = str((cp or {}).get("basis") or "").lower() if isinstance(cp, dict) else ""
    return basis in ("intermittent_peak", "intermittent", "peak") and (twin / DEC008_OUT).is_file()


# ⭐ ONE blanking rule, shared (Sol, finish council 2026-08-03). DEC-009 had its
# own hand-rolled winding blanking and then re-asserted the green thermal flags
# a few lines later, so a screen could say the winding temperature is unknown AND
# that all temperatures are below their limits. Two decisions, one rule.
from apply_dec_008_duty_restamp import _blank_winding  # noqa: E402

SCHEMA = "forgeos.fpk.dec_009_em_restamp/v1"
OUTPUT = "_motor_stack/dec_009_em_restamp.json"
ADOPTED_RPM = 24000.0
ADOPTED_STACK_MM = 130.0


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _qmap(state: dict) -> dict:
    oc = state.get("orchestratorContract")
    if isinstance(oc, Mapping):
        q = oc.get("quantities")
        if isinstance(q, dict):
            return q
    return {}


def _fqty(q: dict, key: str) -> Optional[float]:
    raw = q.get(key)
    try:
        return float(raw.get("value") if isinstance(raw, dict) else raw)
    except (TypeError, ValueError, AttributeError):
        return None


def is_applied(twin: Path) -> bool:
    twin = Path(twin)
    if not (twin / OUTPUT).is_file():
        return False
    st_path = twin / "state.json"
    if not st_path.is_file():
        return False
    q = _qmap(json.loads(st_path.read_text(encoding="utf-8")))
    rpm = _fqty(q, "max_rotor_speed_rpm")
    stack = _fqty(q, "stack_length_mm")
    return (
        rpm is not None and abs(rpm - ADOPTED_RPM) < 1.0
        and stack is not None and abs(stack - ADOPTED_STACK_MM) < 0.05
    )


def _set_qty(q: dict, key: str, value: float, **meta: Any) -> None:
    prev = q.get(key) if isinstance(q.get(key), dict) else {}
    out = dict(prev) if prev else {}
    out["value"] = value
    out.update(meta)
    q[key] = out


def apply_dec_009(twin_dir: Path) -> dict[str, Any]:
    twin_dir = Path(twin_dir).resolve()
    # ⭐ Twin writes need an OPEN stage (Terminal 2026-08-04 twin_write_guard).
    from twin_write_guard import assert_stage_open  # noqa: PLC0415
    assert_stage_open(twin_dir, "apply_dec_009_em_restamp")
    state_path = twin_dir / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("ship_ok") is True:
        raise RuntimeError("refusing to restamp: ship_ok is true")

    # DEC-009 depends on DEC-008 thermal path
    if not _dec008_ok(twin_dir):
        apply_dec_008(twin_dir)
        state = json.loads(state_path.read_text(encoding="utf-8"))

    q = _qmap(state)
    if not q:
        raise RuntimeError("no quantities")

    grid = evaluate_em1(state)
    if grid is None:
        raise RuntimeError("dec_em1_option_screen.evaluate returned None — missing inputs")
    adopted = None
    for row in grid.get("options") or []:
        if abs(float(row.get("rpm") or 0) - ADOPTED_RPM) < 1 and abs(
            float(row.get("stack_mm") or 0) - ADOPTED_STACK_MM
        ) < 0.05:
            adopted = row
            break
    if adopted is None:
        raise RuntimeError("option 24,000/130 not in dec_em1 grid")

    before = {
        "max_rotor_speed_rpm": _fqty(q, "max_rotor_speed_rpm"),
        "stack_length_mm": _fqty(q, "stack_length_mm"),
        "mgu_iron_loss_w": _fqty(q, "mgu_iron_loss_w"),
        "mgu_magnet_temp_c": _fqty(q, "mgu_magnet_temp_c"),
        "mgu_fe_shaft_torque_nm": _fqty(q, "mgu_fe_shaft_torque_nm"),
        "stator_iron_mass_kg": _fqty(q, "stator_iron_mass_kg"),
    }

    base_stack = before["stack_length_mm"] or 98.33
    base_mass = before["stator_iron_mass_kg"]
    mass_scale = ADOPTED_STACK_MM / base_stack if base_stack else 1.0

    # Retain baseline lineage
    # ⭐ FIRST WRITE WINS — the third instance of this bug in one module family
    # (Sol, guards council 2026-08-03). Every rerun overwrote the baseline with
    # the already-restamped values, erasing the 19,500 rpm / 98.33 mm record the
    # decision needs to be auditable. A retry is normal caller behaviour.
    if isinstance(q.get("dec_009_baseline_reference"), dict):
        pass  # already captured on the first application; never overwrite
    else:
        q["dec_009_baseline_reference"] = {
            "max_rotor_speed_rpm": before["max_rotor_speed_rpm"],
            "stack_length_mm": before["stack_length_mm"],
            "mgu_iron_loss_w": before["mgu_iron_loss_w"],
            "mgu_magnet_temp_c": before["mgu_magnet_temp_c"],
            "mgu_fe_shaft_torque_nm": before["mgu_fe_shaft_torque_nm"],
            "stator_iron_mass_kg": before["stator_iron_mass_kg"],
            "note": "Pre-DEC-009 baseline retained for audit; not the design freeze.",
        }

    prov = {
        "source": "decision:DEC-009+tool:dec_em1_option_screen",
        "tool_id": "dec_em1_option_screen",
        "detail": (
            f"Adopted option {adopted.get('option')}: rpm={ADOPTED_RPM}, stack={ADOPTED_STACK_MM} mm, "
            f"torque_ratio={adopted.get('torque_ratio')} "
            f"(PRIOR option-screen FE campaign — not live kit-case mean), "
            f"rotor_fos={adopted.get('rotor_fos')} (PRIOR CalculiX campaign), "
            f"iron_loss_w={adopted.get('iron_loss_w')} (M400-50A scaled), "
            f"magnet_c_vignette={adopted.get('magnet_c_vignette')} under DEC-008 duty."
        ),
        "caveat": (
            "Torque ratio and FoS are measured inputs from prior FE/CalculiX campaigns, "
            "not re-solved in this restamp. Iron loss scales with f and stack mass. "
            "mgu_fe_shaft_torque_nm written below is an ARITHMETIC PRODUCT "
            "(duty_required × ratio), basis option_screen_product_not_kit_case_fe — "
            "never treat it as kit-case FE SIGHT. "
            "Reverses if DEC-008 reverses or release FoS fails (Bar B / B9)."
        ),
    }

    _set_qty(
        q, "max_rotor_speed_rpm", ADOPTED_RPM,
        unit="rpm", family="speed", basis="dec_009_freeze",
        source="decision:DEC-009",
        source_detail="DEC-009 freezes design max rotor speed at 24,000 rpm",
        provenance=prov,
    )
    if "mgu_base_speed_rpm" in q:
        _set_qty(
            q, "mgu_base_speed_rpm", ADOPTED_RPM,
            unit="rpm", family="speed", basis="dec_009_freeze",
            source="decision:DEC-009", provenance=prov,
        )
    _set_qty(
        q, "stack_length_mm", ADOPTED_STACK_MM,
        unit="mm", family="length", basis="dec_009_freeze",
        source="decision:DEC-009",
        source_detail="DEC-009 freezes active stack length at 130 mm",
        provenance=prov,
    )
    if base_mass is not None:
        _set_qty(
            q, "stator_iron_mass_kg", round(base_mass * mass_scale, 4),
            unit="kg", family="mass", basis="scaled_with_stack_dec_009",
            source="decision:DEC-009",
            provenance={**prov, "mass_scale": mass_scale, "baseline_mass_kg": base_mass},
        )

    iron_w = float(adopted["iron_loss_w"])
    _set_qty(
        q, "mgu_iron_loss_w", iron_w,
        unit="W", family="power", basis="screening_estimate_dec_009",
        source="tool:dec_em1_option_screen",
        condition=f"DEC-009 {ADOPTED_RPM:g} rpm / {ADOPTED_STACK_MM:g} mm, M400-50A scaled",
        provenance=prov,
        uncertainty_pct=40,
    )

    # Torque: adopted mean from measured ratio × duty required
    # Prefer EM required if present else recompute from 125.22 class
    em_path = twin_dir / "_motor_stack" / "em_fia_front_kit_case.json"
    required = None
    if em_path.is_file():
        em = json.loads(em_path.read_text(encoding="utf-8"))
        emw = em.get("works_in_kit_context") or {}
        try:
            required = float(emw.get("required_shaft_torque_nm"))
        except (TypeError, ValueError):
            required = None
    if required is None:
        required = 125.2193
    ratio = float(adopted["torque_ratio"])
    adopted_mean_t = round(required * ratio, 6)
    _set_qty(
        q, "mgu_fe_shaft_torque_nm", adopted_mean_t,
        unit="N·m", family="torque", basis="option_screen_product_not_kit_case_fe",
        source="decision:DEC-009",
        condition=(
            "ARITHMETIC: duty_required × option-screen torque_ratio — "
            "NOT a kit-case FEMM mean at the DEC-009 freeze"
        ),
        provenance={
            **prov,
            "required_shaft_torque_nm": required,
            "torque_ratio": ratio,
            "baseline_fe_mean_nm": before["mgu_fe_shaft_torque_nm"],
            "honesty": (
                "Grok stabilise 2026-08-04: never present this as live kit-case FE. "
                "See last_coherent_kit_case_fe_mean_nm when present."
            ),
        },
    )
    # Also stamp ratio for consumers
    q["dec_009_adopted_torque_ratio"] = {
        "value": ratio,
        "basis": "measured_fe_option_screen_prior_campaign",
        "source": "decision:DEC-009",
        "provenance": prov,
    }
    q["dec_009_adopted_rotor_fos"] = {
        "value": float(adopted["rotor_fos"]),
        "basis": "measured_calculix_option_screen",
        "source": "decision:DEC-009",
        "provenance": prov,
    }

    # Thermal under DEC-008 vignette at adopted option
    mag_c = float(adopted.get("magnet_c_vignette") or adopted.get("magnet_c_continuous"))
    limit = 150.0
    # ⭐⭐ TWO WRITE PATHS, ONE DEFECT (found by re-running after fixing the other
    # one — the state still read 99.4 °C because this quantity loop re-set what
    # apply_dec_008 had just blanked). `mgu_winding_temp_c` is NOT the magnet
    # temperature; see the long note in apply_dec_008_duty_restamp.py. Only the
    # magnet is restamped here; the winding stays deliberately absent until it is
    # derived at this operating point or measured on a dyno.
    # ⭐ THE PROXY MUST FOLLOW THE OPERATING POINT (Sol, guards council
    # 2026-08-03). DEC-008 stored magnet_path_proxy_c at ITS magnet temperature;
    # DEC-009 then moved the magnet without updating it, so the winding quantity
    # advertised a proxy from a configuration that no longer applies. Refresh it
    # alongside, or drop it — never leave it pointing at the old point.
    _wind = q.get("mgu_winding_temp_c")
    if isinstance(_wind, dict) and "magnet_path_proxy_c" in _wind:
        _wind["magnet_path_proxy_c"] = mag_c
        _wind["condition"] = (
            "DEC-008 intermittent duty + DEC-009 adopted option. The winding "
            "temperature is NOT derived at this operating point and is not equal "
            "to the magnet temperature; magnet_path_proxy_c is the magnet figure "
            "at THIS point, kept for reference only.")
        q["mgu_winding_temp_c"] = _wind

    for key in ("mgu_magnet_temp_c",):
        prev = q.get(key) if isinstance(q.get(key), dict) else {}
        out = dict(prev) if prev else {"unit": "°C", "family": "temperature"}
        if "value" in out and "continuous_reference_pre_dec009" not in out:
            out["continuous_reference_pre_dec009"] = out.get("value")
        out["value"] = mag_c
        out["basis"] = "screen_dec_008_plus_dec_009"
        out["condition"] = (
            f"DEC-008 intermittent duty + DEC-009 {ADOPTED_RPM:g}/{ADOPTED_STACK_MM:g} mm option; "
            f"vignette magnet screen"
        )
        out["provenance"] = prov
        q[key] = out

    # Cooling JSON patch
    stack = twin_dir / "_motor_stack"
    for name, keys in (
        ("analytical_fia_cooling_thermal_screen.json",
         ("maximum_magnet_temperature_c", "maximum_winding_temperature_c",
          "calculated_magnet_temperature_c", "calculated_winding_temperature_c")),
        ("analytical_fia_cooling_network_screen.json",
         ("maximum_magnet_temperature_c", "maximum_winding_temperature_c")),
    ):
        path = stack / name
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        scr = data.setdefault("screening_results", {})
        for k in keys:
            if k in scr and f"pre_dec009_{k}" not in scr:
                scr[f"pre_dec009_{k}"] = scr[k]
            # ⭐⭐ Same defect as apply_dec_008 (Sol, finish council 2026-08-03):
            # this loop wrote the MAGNET vignette value into the winding maxima
            # as well, so both read 99.4 °C. The winding sits above the magnet by
            # the copper loss across the slot resistance. Blank it rather than
            # proxy it — an absent number forces a consumer to handle the gap.
            if "winding" in k:
                continue  # handled by _blank_winding below — never proxied
            scr[k] = mag_c
        if "magnet_below_screen_limit" in scr:
            scr["magnet_below_screen_limit"] = mag_c <= limit
        if "temperature_screen_ok" in scr:
            scr["temperature_screen_ok"] = mag_c <= limit
        if "all_temperatures_below_screen_limits" in scr:
            scr["all_temperatures_below_screen_limits"] = mag_c <= limit
        # LAST WORD: unknown beats green. The magnet-side logic above may set the
        # aggregate flag; this clears it again because the winding term in that
        # aggregate is not available at this operating point.
        _blank_winding(scr)
        data["dec_009_restamp"] = {"applied_at": _iso(), "magnet_c": mag_c}
        _atomic_write(path, json.dumps(data, indent=2) + "\n")

    # Persist option screen
    _atomic_write(stack / "dec_em1_option_screen.json", json.dumps(grid, indent=2) + "\n")

    state["orchestratorContract"]["quantities"] = q
    state["dec_009_em_restamp"] = {
        "applied_at": _iso(),
        "schema": SCHEMA,
        "rpm": ADOPTED_RPM,
        "stack_mm": ADOPTED_STACK_MM,
        "torque_ratio": ratio,
        "adopted_mean_torque_nm": adopted_mean_t,
        "magnet_c_vignette": mag_c,
        "iron_loss_w": iron_w,
        "ship_ok_untouched": True,
    }
    _atomic_write(state_path, json.dumps(state, indent=2) + "\n")

    report = {
        "schema": SCHEMA,
        "applied_at": _iso(),
        "twin": str(twin_dir),
        "decision": "DEC-009",
        "adopted_option": adopted,
        "before": before,
        "after": {
            "max_rotor_speed_rpm": ADOPTED_RPM,
            "stack_length_mm": ADOPTED_STACK_MM,
            "mgu_iron_loss_w": iron_w,
            "mgu_magnet_temp_c": mag_c,
            "mgu_fe_shaft_torque_nm": adopted_mean_t,
            "torque_ratio": ratio,
        },
        "ship_ok": state.get("ship_ok"),
        "note": "Depends on DEC-008. ship_ok remains false. Bar B untouched.",
    }
    _atomic_write(twin_dir / OUTPUT, json.dumps(report, indent=2) + "\n")
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

    with tempfile.TemporaryDirectory(prefix="dec009-") as raw:
        twin = Path(raw)
        (twin / "_motor_stack").mkdir()
        state = {
            "ship_ok": False,
            "orchestratorContract": {
                "quantities": {
                    "continuous_power_kw": {"value": 250, "basis": "continuous"},
                    "duty_regen_time_s": {"value": 24},
                    "duty_motoring_time_s": {"value": 76},
                    "mgu_iron_loss_w": {"value": 6035.1},
                    "mgu_copper_loss_w": {"value": 2180.49},
                    "magnet_temp_limit_c": {"value": 150},
                    "coolant_inlet_c": {"value": 60},
                    "coolant_flow_l_min": {"value": 12},
                    "coolant_cp_j_kgk": {"value": 3503},
                    "coolant_density_kg_m3": {"value": 1040.49},
                    "inverter_dissipated_kw": {"value": 4.318},
                    "mgu_magnet_temp_c": {"value": 159.35},
                    "mgu_winding_temp_c": {"value": 159.35},
                    "max_rotor_speed_rpm": {"value": 19500},
                    "mgu_base_speed_rpm": {"value": 19500},
                    "stack_length_mm": {"value": 98.33},
                    "stator_iron_mass_kg": {"value": 6.6218},
                    "stator_tooth_flux_t": {"value": 1.7994},
                    "stator_yoke_flux_t": {"value": 2.1036},
                    "mgu_fe_shaft_torque_nm": {"value": 81.558},
                    "lamination_grade": {"value": "M400-50A"},
                }
            },
        }
        (twin / "state.json").write_text(json.dumps(state, indent=2) + "\n")
        for name in (
            "analytical_fia_cooling_thermal_screen.json",
            "analytical_fia_cooling_network_screen.json",
        ):
            (twin / "_motor_stack" / name).write_text(json.dumps({
                "screening_results": {
                    "maximum_magnet_temperature_c": 159.35,
                    "maximum_winding_temperature_c": 159.35,
                    "calculated_magnet_temperature_c": 159.35,
                    "calculated_winding_temperature_c": 159.35,
                    "magnet_below_screen_limit": False,
                    "temperature_screen_ok": False,
                }
            }) + "\n")
        (twin / "_motor_stack" / "em_fia_front_kit_case.json").write_text(json.dumps({
            "works_in_kit_context": {"required_shaft_torque_nm": 125.214912}
        }) + "\n")

        rep = apply_dec_009(twin)
        ck("is_applied", is_applied(twin), "not applied")
        st = json.loads((twin / "state.json").read_text())
        q = st["orchestratorContract"]["quantities"]
        ck("rpm", abs(float(q["max_rotor_speed_rpm"]["value"]) - 24000) < 1, str(q["max_rotor_speed_rpm"]))
        ck("stack", abs(float(q["stack_length_mm"]["value"]) - 130) < 0.05, str(q["stack_length_mm"]))
        ck("magnet_near_99", abs(float(q["mgu_magnet_temp_c"]["value"]) - 99.4) < 1.0,
           str(q["mgu_magnet_temp_c"]["value"]))
        ck("torque_above_required",
           float(q["mgu_fe_shaft_torque_nm"]["value"]) > 125.0,
           str(q["mgu_fe_shaft_torque_nm"]["value"]))
        ck("ratio", abs(float(q["dec_009_adopted_torque_ratio"]["value"]) - 1.069) < 0.001, "")
        ck("ship_ok_false", st.get("ship_ok") is False, "")
        ck("dec008_also", _dec008_ok(twin), "DEC-008 should auto-apply")
        ck("idempotent", is_applied(twin) and apply_dec_009(twin) is not None, "")
        fe_row = q.get("mgu_fe_shaft_torque_nm") or {}
        ck(
            "fe_torque_honest_basis",
            str(fe_row.get("basis") or "") == "option_screen_product_not_kit_case_fe",
            str(fe_row.get("basis")),
        )

        st["ship_ok"] = True
        (twin / "state.json").write_text(json.dumps(st, indent=2) + "\n")
        try:
            apply_dec_009(twin)
            ck("refuse_ship_ok", False, "allowed ship_ok true")
        except RuntimeError as e:
            ck("refuse_ship_ok", "ship_ok" in str(e).lower(), str(e))

    if fails:
        print("apply_dec_009_em_restamp selftest FAIL:")
        for f in fails:
            print(" ", f)
        return 1
    print("apply_dec_009_em_restamp selftest: OK")
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
    rep = apply_dec_009(args.twin)
    print(json.dumps({
        "ok": True,
        "rpm": rep["after"]["max_rotor_speed_rpm"],
        "stack_mm": rep["after"]["stack_length_mm"],
        "torque_ratio": rep["after"]["torque_ratio"],
        "magnet_c": rep["after"]["mgu_magnet_temp_c"],
        "mean_torque_nm": rep["after"]["mgu_fe_shaft_torque_nm"],
        "ship_ok": rep["ship_ok"],
        "report": str(Path(args.twin) / OUTPUT),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
