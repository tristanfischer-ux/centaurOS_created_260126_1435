#!/usr/bin/env python3
"""FPK coolant/channel physics via installed CoolProp + fluids + ht libraries.

INTENT: Stop treating handbook EGW constants as the Anvil thermal path when
CoolProp/fluids/ht are already in `.venv` and Layer-1 tested. Call the real
libraries; fall back to handbook only if import/PropsSI fails, with provenance.

Run: python3 scripts/lib/fpk_physics_engines.py --selftest
"""
from __future__ import annotations

import json
import math
import sys
from typing import Any, Mapping


HANDBOOK_EGW_50 = {
    "density_kg_m3": 1060.0,
    "cp_j_kgk": 3500.0,
    "conductivity_w_mk": 0.4,
    "viscosity_pa_s": 0.0025,
    "provenance": "HANDBOOK_FALLBACK",
    "fluid_code": "EGW_50_50_handbook",
}


def coolprop_egw_props(temperature_c: float = 60.0) -> dict[str, Any]:
    """50/50 ethylene-glycol/water properties from CoolProp INCOMP::MEG[0.50]."""
    try:
        import CoolProp.CoolProp as CP
    except ImportError as e:
        out = dict(HANDBOOK_EGW_50)
        out["error"] = f"CoolProp_missing: {e}"
        out["engine_used"] = False
        return out

    fluid = "INCOMP::MEG[0.50]"
    t_k = float(temperature_c) + 273.15
    p_pa = 101325.0
    out: dict[str, Any] = {
        "fluid_code": "water_glycol_50_MEG",
        "coolprop_fluid": fluid,
        "temperature_c": float(temperature_c),
        "pressure_pa": p_pa,
        "engine": "CoolProp",
        "engine_used": True,
        "provenance": "LIBRARY_COOLPROP",
    }
    try:
        out["density_kg_m3"] = float(CP.PropsSI("D", "T", t_k, "P", p_pa, fluid))
        out["cp_j_kgk"] = float(CP.PropsSI("C", "T", t_k, "P", p_pa, fluid))
        out["conductivity_w_mk"] = float(CP.PropsSI("L", "T", t_k, "P", p_pa, fluid))
        out["viscosity_pa_s"] = float(CP.PropsSI("V", "T", t_k, "P", p_pa, fluid))
        out["prandtl"] = (
            out["cp_j_kgk"] * out["viscosity_pa_s"] / out["conductivity_w_mk"]
            if out["conductivity_w_mk"] > 0
            else None
        )
    except Exception as e:
        out = dict(HANDBOOK_EGW_50)
        out["error"] = f"CoolProp_PropsSI_failed: {e}"
        out["engine_used"] = False
        out["attempted_fluid"] = fluid
    return out


def fluids_channel_pressure_drop(
    *,
    flow_l_min: float,
    density_kg_m3: float,
    viscosity_pa_s: float,
    diameter_m: float,
    length_m: float,
    roughness_m: float = 1.5e-6,
    minor_loss_k: float = 1.5,
) -> dict[str, Any]:
    """Darcy–Weisbach ΔP via `fluids` friction factor (not hand-rolled f)."""
    area = math.pi * (diameter_m**2) / 4.0
    q_m3_s = (flow_l_min / 60.0) / 1000.0
    if area <= 0 or q_m3_s <= 0:
        return {"engine_used": False, "error": "non_positive_flow_or_area"}
    v = q_m3_s / area
    re = density_kg_m3 * v * diameter_m / max(viscosity_pa_s, 1e-12)
    try:
        from fluids import friction  # type: ignore

        # Swamee–Jain / Colebrook via fluids
        f = float(friction.friction_factor(Re=re, eD=roughness_m / diameter_m))
        engine = "fluids.friction_factor"
        used = True
    except Exception as e:
        # Blasius laminar/turbulent fallback
        f = 64.0 / re if re < 2300 else 0.3164 * re ** (-0.25)
        engine = f"handbook_blasius_fallback:{e}"
        used = False
    dp_friction = f * (length_m / diameter_m) * 0.5 * density_kg_m3 * v * v
    dp_minor = minor_loss_k * 0.5 * density_kg_m3 * v * v
    return {
        "engine": engine,
        "engine_used": used,
        "provenance": "LIBRARY_FLUIDS" if used else "HANDBOOK_FALLBACK",
        "velocity_m_s": v,
        "reynolds": re,
        "friction_factor": f,
        "pressure_drop_friction_pa": dp_friction,
        "pressure_drop_minor_pa": dp_minor,
        "pressure_drop_pa": dp_friction + dp_minor,
        "flow_regime": "laminar" if re < 2300 else "turbulent",
    }


def ht_nusselt_tube(
    *,
    reynolds: float,
    prandtl: float,
    diameter_m: float,
    length_m: float,
    conductivity_w_mk: float,
    roughness_m: float = 1.5e-6,
) -> dict[str, Any]:
    """Convective h from `ht.conv_internal.Nu_conv_internal` when available."""
    try:
        from ht.conv_internal import Nu_conv_internal  # type: ignore

        e_d = roughness_m / max(diameter_m, 1e-12)
        # x = axial length for entry-length methods; Di = hydraulic diameter
        nu = float(
            Nu_conv_internal(
                Re=float(reynolds),
                Pr=float(prandtl),
                eD=float(e_d),
                Di=float(diameter_m),
                x=float(length_m),
            )
        )
        corr = "ht.conv_internal.Nu_conv_internal"
        used = True
    except Exception as e:
        if reynolds < 2300:
            nu = 3.66
            corr = f"handbook_Nu_laminar_fd:{e}"
        else:
            nu = 0.023 * (reynolds**0.8) * (prandtl**0.4)
            corr = f"handbook_dittus_boelter:{e}"
        used = False
    h = nu * conductivity_w_mk / max(diameter_m, 1e-12)
    return {
        "engine": corr,
        "engine_used": used,
        "provenance": "LIBRARY_HT" if used else "HANDBOOK_FALLBACK",
        "nusselt": nu,
        "h_conv_w_m2k": h,
        "correlation": corr,
    }


def derive_coolant_and_channel(
    quantities: Mapping[str, Any],
    *,
    channel_hydraulic_diameter_m: float,
    channel_length_m: float,
    channel_count: int = 6,
    flow_l_min: float | None = None,
    inlet_c: float | None = None,
) -> dict[str, Any]:
    """One call: CoolProp props + fluids ΔP + ht Nu for FPK cold-plate channels."""

    def _q(key: str, default: float) -> float:
        raw = quantities.get(key)
        if isinstance(raw, Mapping):
            raw = raw.get("value")
        try:
            v = float(raw)
            return v if math.isfinite(v) and v > 0 else default
        except (TypeError, ValueError):
            return default

    flow = float(flow_l_min if flow_l_min is not None else _q("coolant_flow_l_min", 12.0))
    tin = float(inlet_c if inlet_c is not None else _q("coolant_inlet_c", 60.0))
    props = coolprop_egw_props(tin)
    flow_per = flow / max(int(channel_count), 1)
    hyd = fluids_channel_pressure_drop(
        flow_l_min=flow_per,
        density_kg_m3=float(props["density_kg_m3"]),
        viscosity_pa_s=float(props["viscosity_pa_s"]),
        diameter_m=channel_hydraulic_diameter_m,
        length_m=channel_length_m,
    )
    pr = props.get("prandtl")
    if not pr:
        pr = (
            float(props["cp_j_kgk"])
            * float(props["viscosity_pa_s"])
            / float(props["conductivity_w_mk"])
        )
    conv = ht_nusselt_tube(
        reynolds=float(hyd["reynolds"]),
        prandtl=float(pr),
        diameter_m=channel_hydraulic_diameter_m,
        length_m=channel_length_m,
        conductivity_w_mk=float(props["conductivity_w_mk"]),
    )
    engines_used = {
        "coolprop": bool(props.get("engine_used")),
        "fluids": bool(hyd.get("engine_used")),
        "ht": bool(conv.get("engine_used")),
    }
    return {
        "schema": "fpk_physics_engines/v1",
        "coolant": props,
        "channel_hydraulics_library": hyd,
        "convection_library": conv,
        "engines_used": engines_used,
        "all_libraries_used": all(engines_used.values()),
        "flow_l_min_total": flow,
        "flow_l_min_per_channel": flow_per,
        "channel_count": channel_count,
    }


def _selftest() -> None:
    props = coolprop_egw_props(60.0)
    assert props.get("density_kg_m3", 0) > 900
    assert props.get("cp_j_kgk", 0) > 2000
    # Prefer real CoolProp on this machine
    assert props.get("engine_used") is True, props
    hyd = fluids_channel_pressure_drop(
        flow_l_min=2.0,
        density_kg_m3=float(props["density_kg_m3"]),
        viscosity_pa_s=float(props["viscosity_pa_s"]),
        diameter_m=0.003,
        length_m=0.12,
    )
    assert hyd["pressure_drop_pa"] > 0
    assert hyd.get("engine_used") is True, hyd
    conv = ht_nusselt_tube(
        reynolds=float(hyd["reynolds"]),
        prandtl=float(props["prandtl"] or 10),
        diameter_m=0.003,
        length_m=0.12,
        conductivity_w_mk=float(props["conductivity_w_mk"]),
    )
    assert conv["h_conv_w_m2k"] > 0
    assert conv.get("engine_used") is True, conv
    bundle = derive_coolant_and_channel(
        {"coolant_flow_l_min": 12, "coolant_inlet_c": 60},
        channel_hydraulic_diameter_m=0.003,
        channel_length_m=0.12,
        channel_count=6,
    )
    assert bundle["all_libraries_used"] is True, bundle["engines_used"]
    print(
        "fpk_physics_engines --selftest OK — "
        f"CoolProp ρ={props['density_kg_m3']:.1f} cp={props['cp_j_kgk']:.0f} "
        f"fluids ΔP={hyd['pressure_drop_pa']:.0f} Pa ht h={conv['h_conv_w_m2k']:.0f} W/m²K"
    )


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        raise SystemExit(0)
    print(json.dumps(coolprop_egw_props(60.0), indent=2))
