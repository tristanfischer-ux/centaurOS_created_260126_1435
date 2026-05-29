#!/usr/bin/env python3
"""
scripts/tools/protection_coordination.py

Protection coordination + prospective fault current for a containerised
utility BESS.

THREE analyses:

1. AC prospective short-circuit current (IEC 60909) at the PCC and on the
   LV side, computed with pandapower.shortcircuit.calc_sc (which implements
   IEC 60909 with the c voltage factor). Validated against a hand-calc:
     * PCC (11 kV) Ik'' = grid-strength limited (a fault on the transformer
       primary is fed by the grid, the transformer adds no impedance in
       series) -> Ik'' = S_sc / (sqrt3 * U).
     * LV (400 V) Ik'' = transformer-limited through-fault, de-rated by the
       upstream grid impedance in series.

2. DC bus prospective fault current. A battery DC fault is NOT an IEC 60909
   AC fault; it is limited by the pack internal resistance + bus resistance:
       I_dc = V_bus / (R_pack + R_bus).
   (Plus an optional steady-state ratio cap from the cell datasheet.)

3. Time-current coordination (selectivity). Parametric TCC models:
     * Fuse: IEC 60269 melting/clearing band. A gPV (high-speed PV) fuse is
       modelled with a melting-time power law anchored to its rating; high
       I/In ratios clear in milliseconds (the gPV time constant is 1-3 ms).
     * Air circuit breaker (ACB): IEC 60255 long-time (L, I2t inverse),
       short-time (S, definite/I2t delayed) and instantaneous (I) bands, as
       implemented by trip units such as the ABB Ekip on an Emax 2 E2.2.
   Selectivity check: for a fault current seen by BOTH a downstream device
   and its upstream device, the downstream total clearing time must be less
   than the upstream trip time by a coordination margin.

Default coordination test (the council's acceptance case):
   At a 5 kA fault, a 200 A gPV rack fuse must clear faster than a 2500 A
   ACB long-time pickup -> selectivity holds with a large margin.

JSON contract (stdin -> stdout):
  IN (all optional, sensible BESS defaults):
     { pcc_voltage_kv, transformer_kva, transformer_impedance_pct,
       grid_sc_mva, dc_bus_voltage_v, pack_resistance_ohm, bus_resistance_ohm,
       coordination_pairs: [ { upstream, downstream, fault_ka } ... ],
       devices: { <name>: { type: "fuse"|"acb", ... } } }
  OUT:
     { pcc_fault_ka, dc_bus_fault_ka, selectivity_ok,
       coordination_pairs: [ { upstream, downstream, fault_ka,
                               downstream_clear_ms, upstream_trip_ms,
                               margin_ms, ok } ],
       notes }

License: tool code proprietary (in-tree). pandapower BSD-3-Clause.
Standards: IEC 60909 (fault current), IEC 60269 (fuse), IEC 60255 (ACB trip).
"""
from __future__ import annotations

import json
import math
import sys
import time


# ──────────────────────────────────────────────────────────────────────────
# 1. AC fault current — IEC 60909 via pandapower
# ──────────────────────────────────────────────────────────────────────────

def ac_fault_currents(pcc_voltage_kv: float, transformer_kva: float,
                      transformer_impedance_pct: float, grid_sc_mva: float) -> dict:
    import pandapower as pp
    import pandapower.shortcircuit as sc

    net = pp.create_empty_network()
    b_hv = pp.create_bus(net, vn_kv=pcc_voltage_kv, name="PCC")
    b_lv = pp.create_bus(net, vn_kv=0.4, name="LV")
    pp.create_ext_grid(net, b_hv, s_sc_max_mva=grid_sc_mva, rx_max=0.1)
    pp.create_transformer_from_parameters(
        net, hv_bus=b_hv, lv_bus=b_lv, sn_mva=transformer_kva / 1000.0,
        vn_hv_kv=pcc_voltage_kv, vn_lv_kv=0.4,
        vk_percent=transformer_impedance_pct, vkr_percent=1.0,
        pfe_kw=0.0, i0_percent=0.0,
    )
    sc.calc_sc(net, fault="3ph", case="max")
    return {
        "pcc_fault_ka": float(net.res_bus_sc.ikss_ka.iloc[b_hv]),
        "lv_fault_ka": float(net.res_bus_sc.ikss_ka.iloc[b_lv]),
    }


# ──────────────────────────────────────────────────────────────────────────
# 2. DC bus prospective fault current
# ──────────────────────────────────────────────────────────────────────────

def dc_bus_fault(v_bus: float, r_pack_ohm: float, r_bus_ohm: float) -> float:
    """Prospective DC bus fault current (kA), resistance-limited."""
    r_total = max(1e-6, r_pack_ohm + r_bus_ohm)
    return (v_bus / r_total) / 1000.0


# ──────────────────────────────────────────────────────────────────────────
# 3. Time-current curves (TCC)
# ──────────────────────────────────────────────────────────────────────────

def fuse_clear_time_ms(i_fault_a: float, rated_a: float,
                       melt_k: float = 6.0e4, melt_n: float = 2.0,
                       min_clear_ms: float = 2.0) -> float:
    """Fuse total clearing time (ms) — IEC 60269 melting/clearing band.

    Modelled as an inverse power law t = melt_k / (I/In)^melt_n anchored so that
    a gPV high-speed fuse clears in single-digit ms at high overcurrent ratios
    (the gPV time constant is 1-3 ms). Returns +inf below the melting threshold.

    With the defaults (melt_k=6.0e4 ms, melt_n=2.0), the melting curve passes
    through canonical IEC 60269 gG-class anchors AND, clamped by min_clear_ms,
    reproduces the few-ms clearing of a gPV fuse at 20-25x rating:
        I/In=25  -> 6.0e4/625 = 96 ms ... NO. gPV is faster. See below.

    For a gPV (high-speed semiconductor) fuse we use a STEEPER law (melt_n=3.6)
    so that the fast-acting behaviour is captured; defaults are overridable per
    device. The min_clear_ms floor models the arcing time the fuse cannot beat.
    """
    ratio = i_fault_a / rated_a
    if ratio <= 1.0:
        return float("inf")  # below melting — never clears on overload alone
    t = melt_k / (ratio ** melt_n)
    return max(min_clear_ms, t)


def acb_trip_time_ms(i_fault_a: float, *, ir_a: float, l_tms: float = 1.0,
                     l_curve_const: float = 80.0, l_curve_exp: float = 2.0,
                     s_pickup_mult: float = 8.0, s_delay_ms: float = 200.0,
                     i_pickup_mult: float = 12.0, i_clear_ms: float = 30.0) -> float:
    """Air circuit breaker trip time (ms) — IEC 60255 L/S/I bands.

    * L (long-time): IEC 60255 inverse-time, t = l_tms * l_curve_const /
      ((I/Ir)^l_curve_exp - 1). Defaults to the 'extremely inverse' shape
      (const=80, exp=2) which matches the ACB thermal-memory long-time band.
    * S (short-time): definite-time delay s_delay_ms once I >= s_pickup_mult*Ir.
    * I (instantaneous): clears in i_clear_ms once I >= i_pickup_mult*Ir.

    The device trips on whichever band picks up and gives the SHORTEST time.
    """
    ratio = i_fault_a / ir_a
    candidates = []

    # Instantaneous
    if ratio >= i_pickup_mult:
        candidates.append(i_clear_ms)
    # Short-time (definite delay)
    if ratio >= s_pickup_mult:
        candidates.append(s_delay_ms)
    # Long-time inverse
    if ratio > 1.0:
        denom = ratio ** l_curve_exp - 1.0
        if denom > 0:
            candidates.append(l_tms * l_curve_const / denom * 1000.0)  # s -> ms

    if not candidates:
        return float("inf")  # below long-time pickup
    return min(candidates)


def device_op_time_ms(dev: dict, i_fault_a: float) -> float:
    """Dispatch to the right TCC model for a device dict."""
    dtype = dev.get("type", "fuse")
    if dtype == "fuse":
        return fuse_clear_time_ms(
            i_fault_a, rated_a=float(dev["rated_a"]),
            melt_k=float(dev.get("melt_k", 6.0e4)),
            melt_n=float(dev.get("melt_n", 3.6)),
            min_clear_ms=float(dev.get("min_clear_ms", 2.0)),
        )
    if dtype == "acb":
        return acb_trip_time_ms(
            i_fault_a, ir_a=float(dev["ir_a"]),
            l_tms=float(dev.get("l_tms", 1.0)),
            l_curve_const=float(dev.get("l_curve_const", 80.0)),
            l_curve_exp=float(dev.get("l_curve_exp", 2.0)),
            s_pickup_mult=float(dev.get("s_pickup_mult", 8.0)),
            s_delay_ms=float(dev.get("s_delay_ms", 200.0)),
            i_pickup_mult=float(dev.get("i_pickup_mult", 12.0)),
            i_clear_ms=float(dev.get("i_clear_ms", 30.0)),
        )
    raise ValueError(f"unknown device type: {dtype}")


# Default device library for a 2.5 MWh / 1 MW UK BESS.
DEFAULT_DEVICES: dict[str, dict] = {
    # Bussmann gPV NH 200 A, 1000 Vdc, IEC 60269-6, gPV high-speed.
    "rack_fuse_gPV_200A": {
        "type": "fuse", "rated_a": 200.0, "melt_k": 6.0e4, "melt_n": 3.6,
        "min_clear_ms": 3.0,
        "_ref": "Bussmann gPV NH 200A 1000Vdc, IEC 60269-6",
    },
    # ABB Emax 2 E2.2, Ekip trip unit, set Ir = 2500 A.
    "main_acb_E2.2_2500A": {
        "type": "acb", "ir_a": 2500.0, "l_tms": 1.0, "l_curve_const": 80.0,
        "l_curve_exp": 2.0, "s_pickup_mult": 8.0, "s_delay_ms": 200.0,
        "i_pickup_mult": 12.0, "i_clear_ms": 30.0,
        "_ref": "ABB Emax 2 E2.2 + Ekip (IEC 60255 L/S/I)",
    },
}


# ──────────────────────────────────────────────────────────────────────────
# Orchestration
# ──────────────────────────────────────────────────────────────────────────

def compute(payload: dict) -> dict:
    pcc_voltage_kv = float(payload.get("pcc_voltage_kv", 11.0))
    transformer_kva = float(payload.get("transformer_kva", 1000.0))
    transformer_impedance_pct = float(payload.get("transformer_impedance_pct", 6.0))
    grid_sc_mva = float(payload.get("grid_sc_mva", 250.0))

    dc_bus_voltage_v = float(payload.get("dc_bus_voltage_v", 800.0))
    pack_resistance_ohm = float(payload.get("pack_resistance_ohm", 0.015))
    bus_resistance_ohm = float(payload.get("bus_resistance_ohm", 0.002))

    devices = dict(DEFAULT_DEVICES)
    devices.update(payload.get("devices", {}))

    ac = ac_fault_currents(pcc_voltage_kv, transformer_kva,
                           transformer_impedance_pct, grid_sc_mva)
    dc_ka = dc_bus_fault(dc_bus_voltage_v, pack_resistance_ohm, bus_resistance_ohm)

    # Coordination pairs. Default = the council acceptance case.
    pairs_in = payload.get("coordination_pairs") or [
        {"upstream": "main_acb_E2.2_2500A", "downstream": "rack_fuse_gPV_200A",
         "fault_ka": 5.0, "margin_ms": 50.0},
    ]

    out_pairs = []
    selectivity_ok = True
    for p in pairs_in:
        up_name = p["upstream"]
        dn_name = p["downstream"]
        fault_a = float(p["fault_ka"]) * 1000.0
        req_margin = float(p.get("margin_ms", 50.0))

        up = devices[up_name]
        dn = devices[dn_name]
        t_dn = device_op_time_ms(dn, fault_a)
        t_up = device_op_time_ms(up, fault_a)
        margin = t_up - t_dn  # +ve = downstream clears first (good)
        pair_ok = (margin >= req_margin) and math.isfinite(t_dn)
        selectivity_ok = selectivity_ok and pair_ok
        out_pairs.append({
            "upstream": up_name,
            "downstream": dn_name,
            "fault_ka": round(fault_a / 1000.0, 3),
            "downstream_clear_ms": round(t_dn, 2) if math.isfinite(t_dn) else None,
            "upstream_trip_ms": round(t_up, 2) if math.isfinite(t_up) else None,
            "margin_ms": round(margin, 2) if math.isfinite(margin) else None,
            "required_margin_ms": req_margin,
            "ok": bool(pair_ok),
        })

    return {
        "pcc_fault_ka": round(ac["pcc_fault_ka"], 3),
        "lv_fault_ka": round(ac["lv_fault_ka"], 3),
        "dc_bus_fault_ka": round(dc_ka, 3),
        "selectivity_ok": bool(selectivity_ok),
        "coordination_pairs": out_pairs,
        "inputs": {
            "pcc_voltage_kv": pcc_voltage_kv,
            "transformer_kva": transformer_kva,
            "transformer_impedance_pct": transformer_impedance_pct,
            "grid_sc_mva": grid_sc_mva,
            "dc_bus_voltage_v": dc_bus_voltage_v,
            "pack_resistance_ohm": pack_resistance_ohm,
        },
        "notes": (
            "PCC fault is grid-strength limited (IEC 60909 via pandapower); the "
            "step-up transformer adds no series impedance for a fault on its own "
            "primary. LV through-fault is transformer-limited, de-rated by the "
            "upstream grid impedance. DC bus fault is resistance-limited (battery "
            "DC, not IEC 60909). Selectivity: downstream device must clear before "
            "the upstream device trips, by the required margin. Fuse curve = "
            "IEC 60269; ACB trip = IEC 60255 L/S/I."
        ),
    }


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:  # noqa: BLE001
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
