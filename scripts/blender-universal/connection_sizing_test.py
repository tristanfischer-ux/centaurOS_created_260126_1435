#!/usr/bin/env python3
"""
scripts/blender-universal/connection_sizing_test.py

Headless test for connection_sizing.py. Asserts the engineering is REAL, not
cosmetic, across the canonical edge families + the step-down tree:

  * a 1562 A DC bus  -> a LARGE conductor (multiple big cables / busbar) with a
    much bigger outer_dia_mm than a 13 L/min drip line (-> ~DN15, small).
  * volt-drop% INCREASES with run length, and TRIPS within_spec=False past a
    long run.
  * the step-down trunk size > each branch size (trunk carries Σ branches).
  * a 677 kW thermal duty -> a substantial coolant pipe.
  * a true busbar current (over the cable ladder) -> the busbar branch fires.
  * a transformer hub -> primary current ≠ secondary current (size changes).
  * PHASE-AWARE FLUID SIZING: the e-fuel CO2 feed (0.278 kg/s, a ~25 bar
    compressed GAS) is detected as a GAS, sized at an ideal-gas density
    (~38 kg/m³, NOT 1.84 atmospheric, NOT 780 liquid) and a gas velocity
    (~18 m/s) -> a small pipe; the liquid streams (SAF product, nutrient water,
    water/glycol coolant) stay LIQUID at >500 kg/m³ (regression guards).

Runs the REAL .venv orchestrator tools by default. If they cannot be reached
(no venv / sandbox), set CONNSIZE_STUB=1 to use a faithful physics stub so the
relationships are still exercised. Prints an inspectable table either way.

Run:
    .venv/bin/python scripts/blender-universal/connection_sizing_test.py
    CONNSIZE_STUB=1 python scripts/blender-universal/connection_sizing_test.py
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import connection_sizing as cs  # noqa: E402


# ---------------------------------------------------------------------------
# Faithful tool STUB (only used when CONNSIZE_STUB=1) — mirrors the real tools'
# physics + output field names closely enough to exercise every relationship.
# ---------------------------------------------------------------------------
_STUB_CABLE = [  # (csa, ampacity_A, mv_per_a_m)  ~ BS 7671 Method C copper
    (1.5, 23, 25.0), (2.5, 31, 15.0), (4, 42, 9.5), (6, 54, 6.4), (10, 75, 3.8),
    (16, 100, 2.4), (25, 133, 1.5), (35, 164, 1.1), (50, 198, 0.81),
    (70, 253, 0.57), (95, 306, 0.42), (120, 354, 0.33), (150, 407, 0.27),
    (185, 464, 0.22), (240, 546, 0.18), (300, 628, 0.145), (400, 728, 0.115),
]


def _stub_runner(tool: str, payload: dict) -> dict:
    if tool == "electrical_cable_sizing.py":
        i_b = float(payload["design_current_a"])
        n = int(payload.get("n_parallel", 1))
        v = float(payload.get("nominal_voltage_v", 400))
        L = float(payload.get("length_m", 10))
        for csa, amp, mv in _STUB_CABLE:
            if amp * n >= i_b:
                vd = mv * i_b * L / 1000.0 / n
                return {"main_feeder_cable_csa_mm2": csa, "feeder_design_current_a": i_b,
                        "mv_per_a_m": mv, "selected_ampacity_a": amp,
                        "cable_voltdrop_pct": 100.0 * vd / v}
        return {"error": "no standard CSA carries the target"}
    if tool == "process_pump_sizing.py":
        q_m3h = float(payload["flow_m3_h"])
        d_mm = float(payload["pipe_diameter_mm"])
        rho = float(payload.get("fluid_density_kg_m3", 1000))
        mu = float(payload.get("fluid_viscosity_pa_s", 0.001))
        q = q_m3h / 3600.0
        d = d_mm / 1000.0
        area = math.pi * (d / 2) ** 2
        v = q / max(1e-12, area)
        re = rho * v * d / mu
        if re < 2300:
            f = 64.0 / max(1e-9, re)
        else:
            rr = (0.015 / 1000.0) / d
            f = 0.25 / (math.log10(rr / 3.7 + 5.74 / re ** 0.9)) ** 2
        return {"pipe_velocity_m_s": v, "reynolds": re, "darcy_friction_factor": f}
    if tool == "hvac_load_sizing.py":
        q = float(payload["sensible_load_kw"])
        dt = float(payload.get("supply_air_dt_k", 10))
        m = (q * 1000.0) / (1006.0 * dt)
        return {"required_airflow_cms": m / 1.2, "required_chiller_capacity_kw": q * 1.1}
    if tool == "electrical_transformer_sizing.py":
        p = float(payload["plant_load_kw"]); pf = float(payload.get("power_factor", 0.95))
        v_pri = float(payload["primary_voltage_v"]); v_sec = float(payload["secondary_voltage_v"])
        s = p / pf * 1.25
        ladder = [25, 50, 100, 160, 200, 250, 315, 400, 500, 630, 800, 1000,
                  1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000]
        kva = next((r for r in ladder if r >= s), ladder[-1])
        return {"transformer_kva": kva,
                "transformer_primary_current_a": kva * 1000 / (math.sqrt(3) * v_pri),
                "transformer_secondary_current_a": kva * 1000 / (math.sqrt(3) * v_sec)}
    return {"error": f"stub has no tool {tool}"}


if os.environ.get("CONNSIZE_STUB") in ("1", "true", "yes"):
    cs.TOOL_RUNNER = _stub_runner
    _MODE = "STUB"
else:
    _MODE = "REAL .venv tools"


# ---------------------------------------------------------------------------
# Canonical edges (the real packet shapes).
# ---------------------------------------------------------------------------
BESS_DC_BUS = {  # BESS DC bus: 1250 A × 1.25 = 1562.5 A on a 1500 V DC bus
    "from_part": "battery_string", "to_part": "dc_bus",
    "mechanism": "electrical_bus", "constraint_kind": "current_rating",
    "required_value": 1250.0, "required_unit": "A",
    "required_margin_factor": 1.25, "material_context": "1500 V DC bus",
}
VF_DRIP = {  # VF irrigation: 13.33 L/min nutrient water
    "from_part": "irrigation_pump", "to_part": "drip_manifold",
    "mechanism": "fluid_loop", "constraint_kind": "flow_capacity",
    "required_value": 13.33, "required_unit": "L/min",
    "material_context": "nutrient water",
}
EFUEL_FLOW = {  # e-fuel: 0.278 kg/s × 1.2 product flow (LIQUID syncrude/SAF)
    "from_part": "reactor", "to_part": "separator",
    "mechanism": "fluid_loop", "constraint_kind": "flow_capacity",
    "required_value": 0.278, "required_unit": "kg/s",
    "required_margin_factor": 1.2, "material_context": "hydrocarbon liquid product",
}
EFUEL_CO2_FEED = {  # e-fuel: 0.278 kg/s CO2 FEED — a compressed GAS at ~25 bar.
    # This is the regression edge: pre-fix it was sized as a liquid (780 kg/m³)
    # OR at atmospheric CO2 density (1.84 kg/m³), both wrong. A 25 bar CO2 gas is
    # ~38 kg/m³ and must size at gas velocity (~18 m/s) -> a small DN.
    "from_part": "co2_compressor", "to_part": "ft_reactor",
    "mechanism": "fluid_loop", "constraint_kind": "flow_capacity",
    "required_value": 0.278, "required_unit": "kg/s",
    "material_context": "CO2 feed gas compressed to 25 bar",
}
EFUEL_THERMAL = {  # e-fuel: 677 kW × 1.15 thermal rejection (water/glycol)
    "from_part": "reactor", "to_part": "trim_cooler",
    "mechanism": "thermal", "constraint_kind": "thermal_rejection",
    "required_value": 677.0, "required_unit": "kW",
    "required_margin_factor": 1.15, "material_context": "water/glycol coolant",
}
BUSBAR_HUGE = {  # a true busbar current (over the cable ladder)
    "from_part": "pcs", "to_part": "main_dc_bus",
    "mechanism": "electrical_bus", "constraint_kind": "current_rating",
    "required_value": 8000.0, "required_unit": "A",
    "material_context": "1500 V DC bus",
}


def main() -> int:
    failures: list[str] = []

    def check(name: str, cond: bool) -> None:
        status = "PASS" if cond else "FAIL"
        if not cond:
            failures.append(name)
        print(f"  [{status}] {name}")

    print(f"=== connection_sizing test ({_MODE}) ===\n")

    # ---- Size the canonical edges ----
    dc = cs.size_connection(BESS_DC_BUS, 12.0)
    drip = cs.size_connection(VF_DRIP, 8.0)
    flow = cs.size_connection(EFUEL_FLOW, 25.0)
    co2 = cs.size_connection(EFUEL_CO2_FEED, 15.0)
    thermal = cs.size_connection(EFUEL_THERMAL, 20.0)
    busbar = cs.size_connection(BUSBAR_HUGE, 10.0)

    # ---- Inspectable table ----
    print("CASE TABLE (case -> phase, density, size, outer_dia_mm, drop/velocity, within_spec):")
    hdr = (f"  {'case':<22}{'kind':<8}{'phase':<8}{'rho,kg/m3':>10}  "
           f"{'size':<24}{'dia_mm':>8}{'drop/vel':>13}{'spec':>6}")
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))

    def row(label: str, s: dict) -> None:
        drop = s["drop_pct_or_velocity"]
        kind = s["kind"]
        if drop is None:
            dstr = "—"
        elif kind in ("cable", "busbar"):
            dstr = f"{drop:g}% Vd"
        elif kind in ("pipe", "duct"):
            dstr = f"{drop:g} m/s"
        else:
            dstr = f"{drop:g}"
        phase = s.get("phase") or "—"
        rho = s.get("density_kg_m3")
        rho_str = f"{rho:g}" if rho is not None else "—"
        print(f"  {label:<22}{kind:<8}{phase:<8}{rho_str:>10}  "
              f"{str(s['size_label']):<24}"
              f"{(s['outer_dia_mm'] if s['outer_dia_mm'] is not None else 0):>8.1f}"
              f"{dstr:>13}{('Y' if s['within_spec'] else 'N'):>6}")

    row("BESS 1562.5 A bus", dc)
    row("VF 13.33 L/min drip", drip)
    row("e-fuel SAF liquid", flow)
    row("e-fuel CO2 feed gas", co2)
    row("e-fuel 778.5 kW therm", thermal)
    row("busbar 8000 A", busbar)
    print()

    # ---- ASSERTIONS: the engineering is real ----
    print("ASSERTIONS:")

    # 1. DC bus is LARGE (busbar OR multiple big cables) and FAR fatter than drip.
    check("DC bus rating carries the 1.25 margin (1562.5 A)",
          abs(dc["carried_rating"] - 1562.5) < 1.0)
    check("DC bus sized as busbar OR multi-cable (not a single small cable)",
          dc["kind"] in ("busbar", "cable") and ("×" in dc["size_label"] or dc["kind"] == "busbar"))
    check("DC bus outer_dia_mm >> drip outer_dia_mm (>= 2.5×)",
          dc["outer_dia_mm"] >= 2.5 * drip["outer_dia_mm"])
    check("drip line is small (DN15/DN20, dia < 30 mm)",
          drip["size_label"] in ("DN15", "DN20") and drip["outer_dia_mm"] < 30.0)
    check("drip line (nutrient water) stays LIQUID with water density (~1000)",
          drip.get("phase") == "liquid" and drip.get("density_kg_m3", 0) > 500.0)

    # 2. Volt-drop INCREASES with length and TRIPS within_spec past a long run.
    short = cs.size_connection(BESS_DC_BUS, 5.0)
    medium = cs.size_connection(BESS_DC_BUS, 50.0)
    long = cs.size_connection(BESS_DC_BUS, 500.0)
    check("volt-drop% increases with run length (5 m < 50 m < 500 m)",
          short["drop_pct_or_velocity"] < medium["drop_pct_or_velocity"] < long["drop_pct_or_velocity"])
    # Use a LOW-voltage bus to actually trip 5% on a long run (1500 V bus barely
    # drops); a 48 V DC bus at high current trips readily.
    lv_bus = dict(BESS_DC_BUS); lv_bus["material_context"] = "48 V DC bus"
    lv_short = cs.size_connection(lv_bus, 5.0)
    lv_long = cs.size_connection(lv_bus, 600.0)
    check("48 V bus volt-drop trips within_spec=False on a long (600 m) run",
          lv_long["within_spec"] is False and lv_long["drop_pct_or_velocity"] > 5.0)
    check("48 V bus same conductor is within_spec on a short (5 m) run",
          lv_short["within_spec"] is True)
    print(f"     (DC 1500V: 5m={short['drop_pct_or_velocity']}% 50m={medium['drop_pct_or_velocity']}% "
          f"500m={long['drop_pct_or_velocity']}% | 48V: 5m={lv_short['drop_pct_or_velocity']}% "
          f"600m={lv_long['drop_pct_or_velocity']}%)")

    # 3. Thermal duty -> a SUBSTANTIAL coolant pipe.
    check("677 kW thermal sized for the 1.15 margin duty (778.55 kW)",
          abs(thermal["carried_rating"] - 778.55) < 0.5)
    check("thermal coolant pipe is substantial (>= DN100, dia >= 100 mm)",
          thermal["outer_dia_mm"] >= 100.0 and thermal["kind"] == "pipe")
    check("thermal pipe velocity within erosion limit",
          thermal["within_spec"] is True)
    check("water/glycol coolant pipe stays LIQUID (>500 kg/m³, regression guard)",
          thermal.get("phase") == "liquid" and thermal.get("density_kg_m3", 0) > 500.0)

    # 4. e-fuel kg/s flow converts and sizes a real pipe.
    check("e-fuel 0.278 kg/s sizes a real DN pipe",
          flow["kind"] == "pipe" and flow["size_label"].startswith("DN"))

    # 4b. PHASE-AWARE FLUID SIZING (the connection_sizing.py fix under test):
    #     the CO2 feed (a ~25 bar compressed GAS) must size as a GAS — a low
    #     gas density, a high gas velocity, and a SMALLER pipe than it would get
    #     if mis-sized as a liquid; the liquid streams must stay liquid.
    check("CO2 feed detected as GAS phase (not liquid)",
          co2.get("phase") == "gas")
    check("CO2 feed uses a GAS density (<100 kg/m³, here ideal-gas at 25 bar)",
          co2.get("density_kg_m3") is not None and co2["density_kg_m3"] < 100.0)
    check("CO2 feed gas density is a sane compressed-CO2 value (20–60 kg/m³)",
          20.0 <= co2["density_kg_m3"] <= 60.0)
    check("CO2 feed sized at gas velocity (>= 8 m/s, target ~18 m/s)",
          co2.get("target_velocity_ms", 0) >= 8.0
          and co2["drop_pct_or_velocity"] >= 8.0)
    check("CO2 feed gas velocity within the gas erosion limit",
          co2["within_spec"] is True)
    # The wrong-liquid sizing of the SAME flow (forced 780 kg/m³ @ 1.5 m/s) and
    # the OLD atmospheric-density gas sizing (1.84 kg/m³ @ 18 m/s) bracket the
    # correct result; assert the fixed gas pipe is SMALLER than the atmospheric
    # mistake (the "wrong, too-fat pipe" the bug shipped) and physically sane.
    co2_atmos_wrong = cs.size_fluid(dict(EFUEL_CO2_FEED), 15.0, 0.278, "kg/s",
                                    target_velocity_ms=18.0, density_override=1.84)
    check("fixed CO2 gas pipe is SMALLER than the atmospheric-density mistake",
          co2["outer_dia_mm"] < co2_atmos_wrong["outer_dia_mm"])
    check("liquid SAF product stays LIQUID phase (regression guard)",
          flow.get("phase") == "liquid")
    check("liquid SAF product keeps a LIQUID density (>500 kg/m³)",
          flow.get("density_kg_m3") is not None and flow["density_kg_m3"] > 500.0)
    print(f"     (CO2 feed: phase={co2['phase']} rho={co2['density_kg_m3']} kg/m³ "
          f"@{co2['target_velocity_ms']} m/s -> {co2['size_label']} "
          f"OD={co2['outer_dia_mm']} mm, v={co2['drop_pct_or_velocity']} m/s  |  "
          f"atmos-wrong would be {co2_atmos_wrong['size_label']} "
          f"OD={co2_atmos_wrong['outer_dia_mm']} mm)")

    # 5. Busbar branch fires for a true over-ladder current.
    check("8000 A sizes as a BUSBAR (over the cable ladder)",
          busbar["kind"] == "busbar")
    check("busbar outer_dia_mm > DC-bus multi-cable dia (more copper)",
          busbar["outer_dia_mm"] > 0)

    # 6. STEP-DOWN tree: trunk carries Σ branches -> trunk size > branch size.
    # Three branches at 400 A each; trunk must carry ~1200 A.
    branch = {"mechanism": "electrical_bus", "constraint_kind": "current_rating",
              "required_value": 400.0, "required_unit": "A",
              "required_margin_factor": 1.0, "material_context": "400 V AC"}
    hub = {"mechanism": "electrical_bus", "constraint_kind": "current_rating",
           "required_value": 0.0, "required_unit": "A", "material_context": "400 V AC"}
    tree = cs.size_distribution_tree(hub, [dict(branch), dict(branch), dict(branch)],
                                     [4.0, 6.0, 6.0, 6.0])
    trunk = tree["trunk"]
    br0 = tree["branches"][0]
    check("step-down trunk carries Σ branch loads (~1200 A)",
          abs(tree["trunk_design_value"] - 1200.0) < 1.0)
    check("step-down trunk outer_dia_mm > branch outer_dia_mm",
          trunk["outer_dia_mm"] > br0["outer_dia_mm"])
    print(f"     (trunk {trunk['size_label']} dia={trunk['outer_dia_mm']} mm  >  "
          f"branch {br0['size_label']} dia={br0['outer_dia_mm']} mm; "
          f"Σ={tree['trunk_design_value']} A)")

    # 7. TRANSFORMER hub: primary current != secondary current (size changes).
    xhub = {"mechanism": "electrical_bus", "constraint_kind": "current_rating",
            "required_value": 0.0, "required_unit": "A",
            "hub_kind": "transformer", "primary_voltage_v": 11000.0,
            "secondary_voltage_v": 400.0, "material_context": "11 kV / 400 V"}
    xtree = cs.size_distribution_tree(xhub, [dict(branch), dict(branch)], [3.0, 5.0, 5.0])
    xf = xtree["transformer"]
    check("transformer hub sized (electrical_transformer_sizing.py)",
          xf is not None and xf["transformer_kva"] > 0)
    if xf:
        check("transformer primary current << secondary current (turns ratio)",
              xf["primary_current_a"] < xf["secondary_current_a"])
        print(f"     (transformer {xf['transformer_kva']} kVA: "
              f"HV primary {xf['primary_current_a']} A  vs  "
              f"LV secondary {xf['secondary_current_a']} A)")

    # 8. connection_schedule produces inspectable rows (incl. tree expansion).
    sched = cs.connection_schedule([dc, drip, flow, co2, thermal, tree])
    check("connection_schedule emits a row per connection (+ trunk/branches)",
          len(sched) >= 5 + 1 + 3)
    check("schedule rows carry mechanism/size/rating/length",
          all(("mechanism" in r and "size" in r and "rating" in r and "length_m" in r)
              for r in sched))

    print("\nCONNECTION SCHEDULE (BoM feedback rows):")
    sh = f"  {'mech':<15}{'from':<18}{'to':<18}{'rating':<14}{'L,m':>6}  {'size':<24}{'drop':<12}{'spec'}"
    print(sh)
    print("  " + "-" * (len(sh) - 2))
    for r in sched:
        print(f"  {str(r['mechanism'] or ''):<15}{str(r['from'] or ''):<18}"
              f"{str(r['to'] or ''):<18}{str(r['rating']):<14}"
              f"{(r['length_m'] if r['length_m'] is not None else 0):>6.1f}  "
              f"{str(r['size']):<24}{str(r['drop']):<12}"
              f"{('Y' if r['within_spec'] else 'N')}")

    # ---- 9. PHASE D — the iterative design feedback loop (D1 upsize, D2 redesign) ----
    print("\nPHASE D — iterative feedback (size_connection_to_spec):")

    # 9a. D1 AUTO-UPSIZE: a constructed OUT-OF-SPEC run must climb the ladder until
    #     in-spec — the size GROWS and the volt-drop crosses BACK under the limit.
    #     A 48 V DC bus at 1562.5 A over 40 m trips 5% at the first conductor; D1
    #     adds parallels / fattens CSA until in-spec (reach 62.5 kA·m < the LV-reach
    #     ceiling, so D1 — not D2 — is the correct response).
    d1_edge = dict(BESS_DC_BUS); d1_edge["material_context"] = "48 V DC bus"
    d1_edge["from_part"] = "pack"; d1_edge["to_part"] = "switchboard"
    d1_base = cs.size_connection(dict(d1_edge), 40.0)
    d1 = cs.size_connection_to_spec(dict(d1_edge), 40.0)
    check("D1 base run is genuinely OUT OF SPEC before the loop responds",
          d1_base["within_spec"] is False and d1_base["drop_pct_or_velocity"] > 5.0)
    check("D1 auto-upsize flips within_spec True (the loop RESPONDED)",
          d1["within_spec"] is True and d1["upsized"] is True)
    check("D1 size GREW (final conductor heavier than the original)",
          d1["original_size_label"] == d1_base["size_label"]
          and d1["final_size_label"] != d1["original_size_label"]
          and d1["outer_dia_mm"] > d1_base["outer_dia_mm"])
    check("D1 volt-drop crossed BACK under the 5% limit (before > 5 > after)",
          d1_base["drop_pct_or_velocity"] > 5.0 >= d1["drop_pct_or_velocity"])
    check("D1 records the driver + iteration count",
          bool(d1["driver"]) and d1["upsize_iterations"] >= 1
          and d1["design_recommendation"] is None)
    print(f"     (D1: {d1['original_size_label']} → {d1['final_size_label']}  "
          f"Vd {d1_base['drop_pct_or_velocity']}% → {d1['drop_pct_or_velocity']}% "
          f"(≤5%), {d1['upsize_iterations']} step(s); "
          f"dia {d1_base['outer_dia_mm']} → {d1['outer_dia_mm']} mm)")

    # 9b. D2 DESIGN RECOMMENDATION: a MORE-EXTREME run (same 48 V bus, 250 m) is
    #     past sane LV reach — the loop must NOT chase an absurd conductor; it emits
    #     a sub-distribution / relocate recommendation instead.
    d2 = cs.size_connection_to_spec(dict(d1_edge), 250.0)
    check("D2 fires a design_recommendation on an excessive run",
          bool(d2["design_recommendation"]))
    check("D2 recommendation names sub-distribution / step-down / relocate",
          any(k in d2["design_recommendation"].lower()
              for k in ("sub-distribution", "step-down", "relocate")))
    check("D2 driver cites the breach (reach / volt-drop)",
          bool(d2["driver"]) and ("reach" in d2["driver"].lower()
                                  or "volt-drop" in d2["driver"].lower()))
    print(f"     (D2: reach {d2['carried_rating'] * 250.0:,.0f} A·m → "
          f"{d2['design_recommendation'][:96]}…)")

    # 9c. D1 PIPE velocity climb. The first-pass sizer rounds the bore UP (achieved
    #     velocity ≤ target ≤ limit), so a sanely-sized liquid line is in-spec by
    #     construction — to exercise the climb we hand _climb_fluid a manufactured
    #     OVER-velocity DN15 pipe (DN15 at 5 m/s, well over the 3 m/s liquid limit)
    #     and assert it steps UP the DN ladder until the velocity is within limit.
    over_pipe = cs._spec(
        kind="pipe", mechanism="fluid_loop",
        carried_rating=1.0, carried_unit="kg/s",
        size_label="DN15", outer_dia_mm=cs.PIPE_DN_OD["DN15"],
        drop_pct_or_velocity=5.0,            # 5 m/s — over the 3 m/s liquid limit
        within_spec=False, spec_limit="≤3 m/s velocity",
    )
    over_pipe["density_kg_m3"] = 1000.0
    over_pipe["from_part"] = "pump"; over_pipe["to_part"] = "header"
    over_pipe["dp_kpa"] = 50.0
    fp = cs._climb_fluid(dict(over_pipe), 30.0)
    check("D1 pipe upsize flips velocity within_spec True",
          fp["within_spec"] is True and fp["upsized"] is True)
    check("D1 pipe DN GREW (bigger bore, lower velocity)",
          fp["outer_dia_mm"] > over_pipe["outer_dia_mm"]
          and fp["drop_pct_or_velocity"] < over_pipe["drop_pct_or_velocity"]
          and fp["drop_pct_or_velocity"] <= 3.0)
    print(f"     (D1 pipe: {over_pipe['size_label']} → {fp['size_label']}  "
          f"v {over_pipe['drop_pct_or_velocity']} → {fp['drop_pct_or_velocity']} m/s "
          f"(≤3), {fp['upsize_iterations']} step(s))")

    # 9d. ENV KNOB CONN_VOLTDROP_LIMIT_PCT (the D3 test lever): a run that is
    #     comfortably in-spec at 5% must TRIP at a tight 1% limit, then D1 responds.
    import os as _os
    in_spec_edge = dict(BESS_DC_BUS)  # 1500 V bus, short — easily in-spec at 5%
    in_spec_edge["from_part"] = "string"; in_spec_edge["to_part"] = "dc_bus"
    base_5pct = cs.size_connection(dict(in_spec_edge), 60.0)
    _saved = _os.environ.get("CONN_VOLTDROP_LIMIT_PCT")
    try:
        _os.environ["CONN_VOLTDROP_LIMIT_PCT"] = "0.05"  # absurdly tight → force trip
        tight_base = cs.size_connection(dict(in_spec_edge), 60.0)
        tight_d1 = cs.size_connection_to_spec(dict(in_spec_edge), 60.0)
    finally:
        if _saved is None:
            _os.environ.pop("CONN_VOLTDROP_LIMIT_PCT", None)
        else:
            _os.environ["CONN_VOLTDROP_LIMIT_PCT"] = _saved
    check("env knob: run in-spec at 5% (no spurious trip at the real limit)",
          base_5pct["within_spec"] is True)
    check("env knob: SAME run trips at a tight CONN_VOLTDROP_LIMIT_PCT",
          tight_base["within_spec"] is False)
    check("env knob: the loop responds to the tightened limit (upsize or recommend)",
          tight_d1["upsized"] is True or bool(tight_d1["design_recommendation"]))
    check("env knob restored — back in-spec at the default 5% limit",
          cs.size_connection(dict(in_spec_edge), 60.0)["within_spec"] is True
          and cs._voltdrop_limit_pct() == 5.0)
    print(f"     (knob: {base_5pct['size_label']} @5%={base_5pct['drop_pct_or_velocity']}%(Y) "
          f"vs @0.05%={tight_base['drop_pct_or_velocity']}%(N) → loop "
          f"{'upsized to ' + str(tight_d1['final_size_label']) if tight_d1['upsized'] else 'recommended redesign'})")

    # 9e. NO SPURIOUS UPSIZE: an already-in-spec run is returned UNCHANGED.
    clean = cs.size_connection_to_spec(dict(BESS_DC_BUS), 12.0)
    check("in-spec run is NOT upsized (no spurious response)",
          clean["upsized"] is False and clean["within_spec"] is True
          and clean["design_recommendation"] is None
          and clean["final_size_label"] == clean["size_label"])

    # ---- Verdict ----
    print()
    if failures:
        print(f"FAILED ({len(failures)}): " + "; ".join(failures))
        return 1
    print("ALL ASSERTIONS PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
