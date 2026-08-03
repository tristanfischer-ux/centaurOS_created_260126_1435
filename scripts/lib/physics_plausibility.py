#!/usr/bin/env python3
"""DETERMINISTIC physics-plausibility checks — no LLM in any decision path.

⭐⭐ WHY THIS EXISTS (Tristan 2026-08-03, standing rule): "all of the checks need
to be written into code and not rely on the LLM to actually figure things out,
because the LLM is completely unreliable. It needs to be deterministic."

The FE front FPK ship gate was blocked by THREE findings from `x-ai/grok-4.5`
running as the semantic self-audit:

    [physics_fidelity] physically implausible motor losses/efficiency claim
    [physics_fidelity] Physically implausible coolant flow velocity
    [physics_fidelity] Motor shaft power sized ~244 kW vs 350 kW hardware class

Every one is arithmetic on numbers the contract already holds. An LLM was being
asked to do division. Worse, its verdict BINDS ships (blocking_defects bind even
though the score is advisory), so a model that flakes run-to-run could clear or
block a dossier at random — the determinism treadmill already recorded for LLM
HIGHs. These checks compute the same physics in Python, so the answer is the same
every run and the reason is inspectable.

This does NOT remove the LLM audit — it removes the LLM from the DECISION. The
model may still surface a concern nobody coded yet; when it does, the fix is to
add a check here, not to trust the model.

Usage:
    physics_plausibility.py --twin <dir> [--enforce]   # exit 45 when enforcing
    physics_plausibility.py --selftest
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

EXIT_IMPLAUSIBLE = 45

# ── Physical bounds. Each is a published engineering norm, not a tuned constant.
# EFFICIENCY CEILING: a production IPMSM traction machine peaks around 96-97%;
# 98% is the outer edge claimed by the very best large industrial machines. A
# small high-speed vehicle traction motor claiming >97.5% has almost certainly
# under-counted a loss term, which is exactly what a defaulted iron loss does.
IPMSM_EFFICIENCY_CEILING = 0.975
# COOLANT VELOCITY: below ~0.5 m/s a liquid loop silts and stratifies; above
# ~4 m/s erosion-corrosion and pressure drop dominate. Standard water/glycol
# design practice keeps 0.6-3.0 m/s, so flag outside 0.5-4.0.
COOLANT_V_MIN_MS, COOLANT_V_MAX_MS = 0.5, 4.0
# SHAFT POWER vs DECLARED CLASS: a machine that delivers less than 85% of the
# power class it is sold as is mis-declared, not merely derated.
SHAFT_POWER_CLASS_FLOOR = 0.85
# IRON LOSS: hysteresis goes as f and eddy loss as f², so above a few hundred Hz
# core loss stops being a rounding error. On a loaded PM traction machine at rated
# torque, iron loss typically runs 20-60% of copper loss; the FE front deck sits at
# 1300 Hz electrical (19,500 rpm, 8 poles) on 0.5 mm laminations. A figure below
# 15% of copper at that frequency is not a well-designed core, it is a DEFAULTED
# Steinmetz coefficient — the exact fault this campaign already measured, where a
# defaulted ke of 1e-5 gave 993.6 W against 1.169e-4 derived from the M400-50A
# grade. Under-counted core loss inflates efficiency AND under-sizes the coolant.
IRON_LOSS_MIN_FRACTION_OF_COPPER = 0.15
IRON_LOSS_FREQ_THRESHOLD_HZ = 400.0
# Two independent thermal screens of one machine should land within a screening
# tolerance of each other. 15 K is generous for a screen-vs-screen comparison and
# still catches a missing resistance term, which shows up as tens of kelvin.
SCREEN_TEMP_COHERENCE_K = 15.0


def _q(state: dict, key: str):
    """A contract quantity's numeric value, or None."""
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
    v = q.get(key)
    if isinstance(v, dict):
        v = v.get("value")
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _port_bore_mm(state: dict, run_dir: Path | None):
    """Smallest coolant-port flow bore in mm, from the parts manifest.

    The manifest carries the port's OUTER envelope; the flow bore is the inner
    diameter. Taking the smaller of the two cross-section dimensions and applying
    a wall allowance is the honest reading — and it is stated, not hidden, so a
    reader can see the assumption rather than an invented number.
    """
    if run_dir is None:
        return None
    try:
        man = json.loads((run_dir / "parts-manifest.json").read_text())
    except Exception:  # noqa: BLE001
        return None
    bores = []
    for p in man.get("parts") or []:
        if "coolant port" not in str(p.get("name") or "").lower():
            continue
        d = p.get("dims_mm") or {}
        cross = [float(d.get(k) or 0.0) for k in ("w", "d", "h")]
        cross = sorted(x for x in cross if x > 0)
        if len(cross) >= 2:
            # outer across-flats minus a nominal 2x5 mm wall/boss allowance
            bores.append(max(cross[0] - 10.0, 1.0))
    return min(bores) if bores else None


def evaluate(state: dict, run_dir: Path | None = None) -> dict:
    """Every check. Returns {findings: [...], ok: bool} — pure, no I/O beyond the
    manifest read, no model call, same answer every run."""
    findings: list[dict] = []

    def flag(check, severity, issue, evidence):
        findings.append({"check": check, "severity": severity,
                         "issue": issue, "evidence": evidence})

    # ── 1. SHAFT POWER vs DECLARED HARDWARE CLASS ─────────────────────────────
    shaft_kw = _q(state, "mgu_shaft_power_kw") or _q(state, "peak_mechanical_power_kw")
    class_kw = (_q(state, "front_hardware_power_class_kw")
                or _q(state, "traction_motor_power_kw"))
    if shaft_kw and class_kw and class_kw > 0:
        ratio = shaft_kw / class_kw
        if ratio < SHAFT_POWER_CLASS_FLOOR:
            flag("shaft_power_vs_class", "high",
                 f"machine delivers {shaft_kw:.1f} kW at the shaft but is declared a "
                 f"{class_kw:.0f} kW class unit ({ratio:.0%} of the label)",
                 f"mgu_shaft_power_kw={shaft_kw} vs class {class_kw} "
                 f"(floor {SHAFT_POWER_CLASS_FLOOR:.0%})")

    # ── 2. MACHINE EFFICIENCY CEILING ─────────────────────────────────────────
    eff = _q(state, "mgu_efficiency")
    if eff and eff > IPMSM_EFFICIENCY_CEILING:
        flag("efficiency_ceiling", "high",
             f"claimed machine efficiency {eff:.3%} exceeds the {IPMSM_EFFICIENCY_CEILING:.1%} "
             "ceiling for a vehicle IPMSM — a loss term is missing or under-counted",
             f"mgu_efficiency={eff}")

    # ── 3. IRON LOSS vs COPPER LOSS AT FREQUENCY ──────────────────────────────
    # The specific defect this catches: defaulted Steinmetz coefficients make iron
    # loss vanish, which inflates efficiency and under-sizes the cooling.
    iron = _q(state, "mgu_iron_loss_w")
    copper = _q(state, "mgu_copper_loss_w")
    rpm = _q(state, "max_rotor_speed_rpm") or _q(state, "mgu_base_speed_rpm")
    poles = _q(state, "pole_count") or _q(state, "mgu_pole_count") or 8.0
    freq = (rpm / 60.0) * (poles / 2.0) if rpm else None
    if iron is not None and copper and copper > 0 and freq and freq >= IRON_LOSS_FREQ_THRESHOLD_HZ:
        frac = iron / copper
        if frac < IRON_LOSS_MIN_FRACTION_OF_COPPER:
            flag("iron_loss_defaulted", "high",
                 f"iron loss {iron:.0f} W is {frac:.1%} of copper loss {copper:.0f} W at "
                 f"{freq:.0f} Hz — at this frequency that is not physical; the Steinmetz "
                 "coefficients were defaulted rather than derived from the lamination",
                 f"iron={iron} copper={copper} f={freq:.0f} Hz "
                 f"(floor {IRON_LOSS_MIN_FRACTION_OF_COPPER:.0%})")

    # ── 4. COOLANT FLOW VELOCITY ──────────────────────────────────────────────
    lpm = _q(state, "coolant_flow_l_min") or _q(state, "coolant_flow_lpm")
    bore = _port_bore_mm(state, run_dir)
    if lpm and bore and bore > 0:
        area = math.pi * (bore / 2000.0) ** 2
        vel = (lpm / 60.0 / 1000.0) / area
        if not (COOLANT_V_MIN_MS <= vel <= COOLANT_V_MAX_MS):
            flag("coolant_velocity", "high" if vel > COOLANT_V_MAX_MS else "med",
                 f"coolant velocity {vel:.2f} m/s at {lpm:.0f} L/min through a "
                 f"{bore:.0f} mm bore is outside the {COOLANT_V_MIN_MS}-{COOLANT_V_MAX_MS} m/s "
                 "design band (silting below, erosion and pressure drop above)",
                 f"flow={lpm} L/min bore={bore:.0f} mm v={vel:.2f} m/s")

    # ── 5. LOSS/EFFICIENCY SELF-CONSISTENCY ───────────────────────────────────
    # Efficiency and the loss tally must describe the SAME machine.
    if eff and shaft_kw and iron is not None and copper is not None:
        losses = iron + copper + (_q(state, "mgu_magnet_loss_w") or 0.0)
        implied = (shaft_kw * 1000.0) / (shaft_kw * 1000.0 + losses) if losses >= 0 else None
        if implied and abs(implied - eff) > 0.005:
            flag("efficiency_loss_mismatch", "med",
                 f"stated efficiency {eff:.4f} disagrees with the loss tally "
                 f"({implied:.4f} from {losses:.0f} W over {shaft_kw:.1f} kW)",
                 f"iron={iron} copper={copper} shaft_kw={shaft_kw}")

    # ── 6. TWO SCREENS MUST NOT DISAGREE ABOUT THE SAME TEMPERATURE ───────────
    # ⭐⭐ (2026-08-03) Re-running the cooling screens on the corrected iron loss
    # made them contradict each other: the LUMPED screen reported winding/magnet
    # 159.3 °C and a MAGNET BREACH, the NETWORK screen 82.9 °C and coupled_ok
    # True — 76 K apart on one twin with identical losses. Cause: the network
    # screen's thermal path is the CONVECTIVE FILM ALONE (h ~38 kW/m²K,
    # R=0.000378 K/W). It has no conduction term from the winding through slot
    # liner, impregnation and stator iron to the jacket wall, and those dominate —
    # the lumped screen's 0.01 K/W is 23x larger and is the credible screening
    # value. A screen that names a WINDING temperature while modelling only the
    # coolant film is asserting the winding sits on the jacket wall.
    # Two artefacts disagreeing this far is always a defect in one of them, and a
    # dossier carrying both is indefensible whichever is right.
    if run_dir is not None:
        _screens = {}
        for _n, _path in (("lumped", "analytical_fia_cooling_thermal_screen.json"),
                          ("network", "analytical_fia_cooling_network_screen.json")):
            try:
                _d = json.loads((run_dir / "_motor_stack" / _path).read_text())
                _screens[_n] = (_d.get("screening_results") or {})
            except Exception:  # noqa: BLE001
                continue
        if len(_screens) == 2:
            for _part in ("winding", "magnet", "module"):
                _key = f"maximum_{_part}_temperature_c"
                _a = _screens["lumped"].get(_key)
                _b = _screens["network"].get(_key)
                try:
                    _a, _b = float(_a), float(_b)
                except (TypeError, ValueError):
                    continue
                if abs(_a - _b) > SCREEN_TEMP_COHERENCE_K:
                    flag("screen_temperature_disagreement", "high",
                         f"the lumped and network cooling screens disagree about the "
                         f"{_part} temperature by {abs(_a - _b):.1f} K "
                         f"({_a:.1f} vs {_b:.1f} °C) — one of them is wrong, and a "
                         "dossier carrying both is indefensible",
                         f"lumped={_a:.1f} network={_b:.1f} "
                         f"(tolerance {SCREEN_TEMP_COHERENCE_K} K)")

    return {"findings": findings,
            "ok": not any(f["severity"] == "high" for f in findings),
            "checked": 6}


def _selftest() -> int:
    fails: list[str] = []

    def ck(name, ok, detail=""):
        if not ok:
            fails.append(f"{name}: {detail}")

    def st(**q):
        return {"orchestratorContract": {"quantities": {k: {"value": v} for k, v in q.items()}}}

    # ⭐ proveCatch 1: the FE front twin's own numbers must reproduce the three
    # findings the LLM raised — that is the whole point of replacing it.
    fe = st(mgu_shaft_power_kw=244.49, front_hardware_power_class_kw=350,
            mgu_efficiency=0.99018, mgu_iron_loss_w=135.56,
            mgu_copper_loss_w=2180.49, max_rotor_speed_rpm=19500)
    got = {f["check"] for f in evaluate(fe)["findings"]}
    for need in ("shaft_power_vs_class", "efficiency_ceiling", "iron_loss_defaulted"):
        ck(f"proveCatch.{need}", need in got,
           f"the live FE numbers did not trip {need} (got {sorted(got)})")

    # ⭐ proveCatch 2: a healthy machine must NOT trip anything.
    good = st(mgu_shaft_power_kw=340.0, front_hardware_power_class_kw=350,
              mgu_efficiency=0.962, mgu_iron_loss_w=1800.0,
              mgu_copper_loss_w=9000.0, max_rotor_speed_rpm=12000)
    ck("healthy_machine_is_silent", evaluate(good)["ok"],
       f"a plausible machine was flagged: {evaluate(good)['findings']}")

    # ⭐ proveCatch 3: iron-loss check must ABSTAIN at low frequency, where a small
    # iron loss IS physical — a check that fires everywhere is not a check.
    lowf = st(mgu_iron_loss_w=5.0, mgu_copper_loss_w=1000.0, max_rotor_speed_rpm=300)
    ck("iron_loss_abstains_at_low_frequency",
       "iron_loss_defaulted" not in {f["check"] for f in evaluate(lowf)["findings"]},
       "iron-loss check fired at low frequency where a small iron loss is physical")

    # ⭐ proveCatch 4: missing inputs must abstain, never invent a verdict.
    ck("empty_state_abstains", evaluate({})["ok"] and not evaluate({})["findings"],
       "an empty state produced findings out of nothing")

    # ⭐⭐ proveCatch (2026-08-03): the exact contradiction the corrected iron loss
    # exposed — the lumped screen said 159.3 °C winding, the network screen 82.9 °C,
    # on ONE twin with identical losses. If this stops firing, a screen with a
    # missing resistance term is silently agreeing with one that has it.
    import tempfile as _tf
    _td = Path(_tf.mkdtemp()); (_td / "_motor_stack").mkdir()
    (_td / "_motor_stack" / "analytical_fia_cooling_thermal_screen.json").write_text(
        json.dumps({"screening_results": {"maximum_winding_temperature_c": 159.3}}))
    (_td / "_motor_stack" / "analytical_fia_cooling_network_screen.json").write_text(
        json.dumps({"screening_results": {"maximum_winding_temperature_c": 82.9}}))
    ck("proveCatch.screens_disagreeing_is_caught",
       "screen_temperature_disagreement" in {f["check"] for f in evaluate({}, _td)["findings"]},
       "a 76 K disagreement between two thermal screens was not flagged")
    # …and two screens that AGREE must stay silent.
    _td2 = Path(_tf.mkdtemp()); (_td2 / "_motor_stack").mkdir()
    for _f in ("analytical_fia_cooling_thermal_screen.json",
               "analytical_fia_cooling_network_screen.json"):
        (_td2 / "_motor_stack" / _f).write_text(
            json.dumps({"screening_results": {"maximum_winding_temperature_c": 120.0}}))
    ck("agreeing_screens_stay_silent",
       "screen_temperature_disagreement" not in {f["check"] for f in evaluate({}, _td2)["findings"]},
       "two screens within tolerance were flagged as disagreeing")

    # Determinism: same input, same answer, twice.
    ck("deterministic", json.dumps(evaluate(fe), sort_keys=True)
       == json.dumps(evaluate(fe), sort_keys=True), "two runs disagreed")

    for f in fails:
        print(f"  FAIL {f}")
    print("physics_plausibility selftest: OK" if not fails
          else f"FAIL physics_plausibility selftest ({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--enforce", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")
    state = json.loads((args.twin / "state.json").read_text())
    res = evaluate(state, args.twin)
    for f in res["findings"]:
        print(f"  [{f['severity'].upper()}] {f['check']}: {f['issue']}")
        print(f"        evidence: {f['evidence']}")
    (args.twin / "physics-plausibility.json").write_text(json.dumps(res, indent=2))
    print(f"[physics-plausibility] {len(res['findings'])} finding(s); ok={res['ok']}")
    if args.enforce and not res["ok"]:
        return EXIT_IMPLAUSIBLE
    return 0


if __name__ == "__main__":
    sys.exit(main())
