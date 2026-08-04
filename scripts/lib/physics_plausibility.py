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
    # ⭐⭐ DUTY-TO-DUTY, NOT DUTY-TO-ENVELOPE (Cursor R4/R5 + council, 2026-08-04).
    # This compared mgu_shaft_power_kw — a DUTY figure — against
    # front_hardware_power_class_kw, which the brief defines as the SURVIVABILITY
    # ENVELOPE ("HW nameplate class (press) — NOT continuous duty; SiC/EM envelope
    # sizing"). On the FE front twin that read 244.5 kW against 350 kW and cried
    # "70% of the label" for months. It is the same delivered-versus-required
    # category error as S12, one level up, and it cost real time: it sent me
    # hunting a 40% inverter down-rate that would have UNDER-sized the envelope
    # the brief says must survive 350 kW.
    #
    # A machine is legitimately built to survive more than its duty. Compare a
    # duty against a DUTY bound, and only fall back to the class figure when no
    # duty bound is stated — saying so in the evidence either way.
    shaft_kw = _q(state, "mgu_shaft_power_kw") or _q(state, "peak_mechanical_power_kw")
    duty_kw = (_q(state, "front_regen_electrical_cap_kw")
               or _q(state, "continuous_power_kw"))
    class_kw = (_q(state, "front_hardware_power_class_kw")
                or _q(state, "traction_motor_power_kw"))
    bound_kw, bound_name, is_duty = (
        (duty_kw, "duty cap", True) if duty_kw else (class_kw, "hardware class", False))
    if shaft_kw and bound_kw and bound_kw > 0:
        ratio = shaft_kw / bound_kw
        if ratio < SHAFT_POWER_CLASS_FLOOR:
            flag("shaft_power_vs_class", "high" if is_duty else "medium",
                 f"machine delivers {shaft_kw:.1f} kW at the shaft against a "
                 f"{bound_kw:.0f} kW {bound_name} ({ratio:.0%})"
                 + ("" if is_duty else
                    " — compared against the ENVELOPE because no duty cap is stated, "
                    "which is a weaker test: a machine may legitimately survive more "
                    "than its duty"),
                 f"mgu_shaft_power_kw={shaft_kw} vs {bound_name} {bound_kw} "
                 f"(floor {SHAFT_POWER_CLASS_FLOOR:.0%})"
                 + (f"; hardware class {class_kw} kW is the survivability envelope and "
                    f"is deliberately NOT the comparand" if is_duty and class_kw else ""))

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

    # ── 7. A CONTINUOUS RATING CANNOT COEXIST WITH A SUB-UNITY DUTY CYCLE ─────
    # ⭐⭐ (2026-08-03, DeepSeek side-channel put this first and was right.) The FE
    # front contract carries BOTH `continuous_power_kw = 250, basis=continuous,
    # source=brief` AND a duty vignette of `duty_regen_time_s = 24` in a 100 s
    # window — a 24% duty. Those are mutually exclusive statements about the same
    # machine, and which one is true decides whether the design has a thermal
    # problem at all:
    #     screened as CONTINUOUS -> 8216 W steady -> magnet 159.3 C, BREACH
    #     the design's own 24% ->  1972 W average -> winding 96.9 C, no breach
    #                              (single-burst adiabatic bound ~146 C)
    # The thermal screens took the continuous reading, which is the conservative
    # one — but conservative against an assumption the contract itself contradicts
    # is not the same as correct. The front unit's Gen3 role is REGEN ONLY, which
    # makes a 100% duty physically odd.
    # This does NOT pick a side: the vignette is labelled "illustrative — replace
    # with lap logs", so neither figure is authoritative. It refuses to let a
    # dossier carry both silently.
    dur_regen = _q(state, "duty_regen_time_s")
    dur_motor = _q(state, "duty_motoring_time_s")
    cont_kw = _q(state, "continuous_power_kw")
    # ⭐ DEC-008 restamp (2026-08-03): when continuous_power_kw.basis is explicitly
    # intermittent_peak (or peak/intermittent), the contradiction is RESOLVED by a
    # named decision — do not keep firing as if both claims were still live.
    # basis absent or "continuous" still means the old dual claim.
    _cp_raw = ((state.get("orchestratorContract") or {}).get("quantities") or {}).get(
        "continuous_power_kw")
    _cp_basis = ""
    if isinstance(_cp_raw, dict):
        _cp_basis = str(_cp_raw.get("basis") or "").strip().lower()
    _basis_is_continuous = _cp_basis in ("", "continuous", "cont", "steady", "rated_continuous")
    if dur_regen and dur_motor and cont_kw and _basis_is_continuous:
        window = dur_regen + dur_motor
        duty = dur_regen / window if window > 0 else 1.0
        if duty < 0.9:
            flag("duty_basis_contradiction", "high",
                 f"the contract rates {cont_kw:g} kW as CONTINUOUS while its own duty "
                 f"vignette runs {dur_regen:g} s in {window:g} s ({duty:.0%} duty) — "
                 "both cannot describe this machine, and the thermal answer differs "
                 "by roughly 60 K between them",
                 f"continuous_power_kw={cont_kw} basis=continuous vs "
                 f"duty_regen_time_s={dur_regen}/{window} s")

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

    # ⭐⭐ WINDING AND MAGNET CANNOT BE THE SAME TEMPERATURE (Sol, finish council
    # 2026-08-03). On the live twin `mgu_winding_temp_c` and `mgu_magnet_temp_c`
    # both read 99.4 °C, because the DEC-008/DEC-009 restamps assign the MAGNET
    # screen value to both under a comment calling it a "same path proxy". They
    # are not the same quantity: copper loss is dissipated IN the winding, and
    # the twin's own thermal screen carries a non-zero magnet-to-winding
    # resistance (0.05 K/W), so the winding must sit ABOVE the magnet. Publishing
    # them equal hands a reader checking insulation-class margin (class H, 180 °C)
    # a number that describes a different part of the machine.
    #
    # Arithmetic, not judgement: two temperatures joined by a non-zero thermal
    # resistance with a non-zero loss between them cannot be equal. Exact
    # equality is the signal — a proxy that was COPIED, not computed.
    _t_wind = _q(state, "mgu_winding_temp_c")
    _t_mag = _q(state, "mgu_magnet_temp_c")
    _cu = _q(state, "mgu_copper_loss_w")
    # ⭐ SEVERITY FOLLOWS THE EVIDENCE (Sol, guards council 2026-08-03). Exact
    # equality plus copper loss is strong, but coarse or rounded telemetry can
    # legitimately report both temperatures at the same precision. When the twin
    # also states a non-zero magnet-to-winding resistance the equality is
    # genuinely impossible and the finding is HIGH; without that resistance on
    # record it is still worth reporting, at MEDIUM, as something to check.
    # ⭐ SEVERITY DOWNGRADED TO MEDIUM (Sol, raised twice, guards council
    # 2026-08-03). A stated branch resistance shows the nodes are separated; it
    # does NOT prove the temperatures must differ by any particular amount,
    # because copper heat leaves by several paths and a coarse or rounded
    # telemetry source can legitimately report both at one precision. A HIGH
    # gates a release, so a finding that cannot fully establish impossibility
    # must not carry one — a false HIGH on an honest twin costs more than a
    # MEDIUM that gets read. The equality is still always reported.
    _r_mw = _q(state, "magnet_to_winding_k_per_w")
    if _t_wind and _t_mag and _cu and _cu > 0 and _t_wind == _t_mag:
        flag("winding_equals_magnet_temperature", "medium",
             f"winding and magnet temperatures are both exactly {_t_wind:.2f} °C "
             f"while {_cu:.0f} W of copper loss is dissipated in the winding — a "
             "copied proxy, not a computed temperature. Insulation-class margin "
             "cannot be read from it",
             f"mgu_winding_temp_c={_t_wind} mgu_magnet_temp_c={_t_mag} "
             f"mgu_copper_loss_w={_cu}")

    return {"findings": findings,
            "ok": not any(f["severity"] == "high" for f in findings),
            "checked": 8}


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
    for need in ("efficiency_ceiling", "iron_loss_defaulted"):
        ck(f"proveCatch.{need}", need in got,
           f"the live FE numbers did not trip {need} (got {sorted(got)})")

    # ⭐ DUTY-VS-ENVELOPE. 244.49 kW against the 250 kW DUTY cap is 97.8% and must
    # be silent; the same shaft power against the 350 kW ENVELOPE used to fire
    # HIGH and was wrong to.
    ck("duty_comparison.silent_when_shaft_meets_the_duty_cap",
       "shaft_power_vs_class" not in {f["check"] for f in evaluate(
           st(mgu_shaft_power_kw=244.49, front_regen_electrical_cap_kw=250,
              front_hardware_power_class_kw=350))["findings"]},
       "244.5 kW against a 250 kW duty cap (97.8%) was flagged")
    # …and a genuine duty shortfall must still fire, HIGH.
    _short = [f for f in evaluate(st(mgu_shaft_power_kw=180.0,
                                     front_regen_electrical_cap_kw=250))["findings"]
              if f["check"] == "shaft_power_vs_class"]
    ck("duty_comparison.fires_on_a_real_duty_shortfall",
       _short and _short[0]["severity"] == "high",
       "180 kW against a 250 kW duty cap did not fire HIGH")
    # With NO duty cap stated it falls back to the envelope, at MEDIUM, and says so.
    _env = [f for f in evaluate(st(mgu_shaft_power_kw=244.49,
                                   front_hardware_power_class_kw=350))["findings"]
            if f["check"] == "shaft_power_vs_class"]
    ck("duty_comparison.envelope_fallback_is_medium_and_disclosed",
       _env and _env[0]["severity"] == "medium" and "ENVELOPE" in _env[0]["issue"],
       "the envelope fallback did not downgrade or did not disclose itself")

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

    # ⭐⭐ proveCatch (Sol, finish council 2026-08-03): the live twin's copied
    # winding temperature. Both quantities read 99.4 °C with 2180 W of copper
    # loss on record — physically impossible, and it shipped.
    ck("proveCatch.winding_equals_magnet_caught",
       "winding_equals_magnet_temperature" in {
           f["check"] for f in evaluate(st(mgu_winding_temp_c=99.4,
                                           mgu_magnet_temp_c=99.4,
                                           mgu_copper_loss_w=2180.49))["findings"]},
       "identical winding and magnet temperatures with copper loss did not fire")
    # NEGATIVE CONTROL — a genuinely computed pair, winding above magnet as the
    # physics requires, must stay silent or every honest twin fails.
    ck("negative_control.winding_above_magnet_silent",
       "winding_equals_magnet_temperature" not in {
           f["check"] for f in evaluate(st(mgu_winding_temp_c=112.7,
                                           mgu_magnet_temp_c=99.4,
                                           mgu_copper_loss_w=2180.49))["findings"]},
       "a correctly computed winding/magnet pair was flagged")
    # No copper loss on record -> abstain, do not guess.
    ck("no_copper_loss_abstains",
       "winding_equals_magnet_temperature" not in {
           f["check"] for f in evaluate(st(mgu_winding_temp_c=99.4,
                                           mgu_magnet_temp_c=99.4))["findings"]},
       "the check fired without any loss on record to justify a delta")

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

    # ⭐ proveCatch: a continuous rating beside a sub-unity duty must be flagged;
    # a genuinely continuous machine (no vignette, or ~100% duty) must not be.
    contra = st(continuous_power_kw=250, duty_regen_time_s=24, duty_motoring_time_s=76)
    ck("proveCatch.duty_basis_contradiction_caught",
       "duty_basis_contradiction" in {f["check"] for f in evaluate(contra)["findings"]},
       "a 24% duty beside a CONTINUOUS rating was not flagged")
    full = st(continuous_power_kw=250, duty_regen_time_s=99, duty_motoring_time_s=1)
    ck("near_100pct_duty_is_not_flagged",
       "duty_basis_contradiction" not in {f["check"] for f in evaluate(full)["findings"]},
       "a ~99% duty was wrongly called a contradiction")
    # ⭐ proveCatch DEC-008: intermittent_peak basis must NOT flag.
    dec008 = {"orchestratorContract": {"quantities": {
        "continuous_power_kw": {"value": 250, "basis": "intermittent_peak"},
        "duty_regen_time_s": {"value": 24},
        "duty_motoring_time_s": {"value": 76},
    }}}
    ck("proveCatch.dec_008_intermittent_basis_silent",
       "duty_basis_contradiction" not in {f["check"] for f in evaluate(dec008)["findings"]},
       "DEC-008 intermittent_peak basis was still flagged as continuous contradiction")

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
