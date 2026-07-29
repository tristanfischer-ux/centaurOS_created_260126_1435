#!/usr/bin/env python3
"""Analytical front-FPK laminated-bus ESL and cold-plate thermal network.

INTENT: establish deterministic, inspectable electrical and thermal seeds from
the settled MCU bay and inverter duty. These are screening calculations only;
3D extraction, CFD, supplier thermal data, and physical tests remain OPEN.

Run: python3 scripts/lib/fpk_bus_esl.py --selftest
"""
from __future__ import annotations

import json
import math
import sys
from typing import Any, Mapping, Sequence

try:
    from scripts.lib.fpk_concentric_geometry import geometry_from_quantities
except ModuleNotFoundError:
    from fpk_concentric_geometry import geometry_from_quantities


MU_0_H_PER_M = 4.0e-7 * math.pi
CU_ETP_CONDUCTIVITY_S_M = 5.6e7
CU_ETP_RESISTIVITY_OHM_M = 1.78e-8
EGW_DENSITY_KG_M3 = 1060.0
EGW_CP_J_KGK = 3500.0
EGW_CONDUCTIVITY_W_MK = 0.4
EGW_VISCOSITY_PA_S = 0.0025
AL_6061_CONDUCTIVITY_W_MK = 167.0
TIM_CONDUCTIVITY_W_MK = 4.0
PROVENANCE = "ANALYTICAL_FROM_ASSUMED_GEOMETRY"


def _num(
    quantities: Mapping[str, Any],
    *keys: str,
    default: float,
) -> float:
    for key in keys:
        raw = quantities.get(key)
        if isinstance(raw, Mapping):
            raw = raw.get("value")
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if math.isfinite(value) and value > 0.0:
            return value
    return default


def _round_range(low: float, high: float, digits: int = 2) -> list[float]:
    return [round(low, digits), round(high, digits)]


def derive_bus_esl(quantities: Mapping[str, Any]) -> dict[str, Any]:
    """Derive commutation-loop ESL from laminated Cu conductor/return geometry.

    @param quantities Contract quantities including bay, current, voltage, and
        switching frequency.
    @returns JSON-ready analytical ESL evidence with uncertainty and hand check.
    """
    geometry = geometry_from_quantities(quantities)
    i_dc_a = (
        _num(quantities, "continuous_power_kw", default=250.0)
        * 1000.0
        / _num(quantities, "dc_bus_voltage_v", default=750.0)
    )
    current_density_a_mm2 = 5.0
    thickness_mm = 3.0
    section_mm2 = i_dc_a / current_density_a_mm2
    width_mm = max(10.0, section_mm2 / thickness_mm)

    # The cap-to-half-bridge path is constrained to the settled MCU footprint.
    length_mm = max(35.0, min(0.58 * geometry.mcu_w_mm, 95.0))
    dielectric_mm = max(
        0.35,
        _num(quantities, "fpk_bus_dielectric_mm", default=0.5),
    )
    conductor_spacing_mm = thickness_mm + dielectric_mm
    rise_time_ns = _num(
        quantities,
        "sic_voltage_edge_rise_time_ns",
        "gate_edge_rise_time_ns",
        default=50.0,
    )
    equivalent_frequency_hz = 1.0 / (math.pi * rise_time_ns * 1.0e-9)
    switching_frequency_hz = _num(
        quantities,
        "switching_freq_hz",
        default=20_000.0,
    )
    skin_depth_m = math.sqrt(
        2.0
        / (
            2.0
            * math.pi
            * equivalent_frequency_hz
            * MU_0_H_PER_M
            * CU_ETP_CONDUCTIVITY_S_M
        )
    )

    length_m = length_mm / 1000.0
    width_m = width_mm / 1000.0
    dielectric_m = dielectric_mm / 1000.0
    # Wide parallel-plate PEEC/field-energy term: opposing currents cancel the
    # far field, so the dominant external energy lies in the dielectric gap.
    laminated_external_nh = (
        MU_0_H_PER_M * length_m * dielectric_m / width_m * 1.0e9
    )
    # High-frequency internal contribution on the two facing Cu surfaces.
    skin_internal_nh = (
        MU_0_H_PER_M * length_m * skin_depth_m / width_m * 1.0e9
    )
    # Geometry-free parasitics are explicit estimates, not hidden in a target.
    joint_each_nh = 0.65
    joint_count = 2
    cap_terminal_effective_nh = 2.1
    sic_terminal_effective_nh = 1.0
    terminal_total_nh = (
        joint_count * joint_each_nh
        + cap_terminal_effective_nh
        + sic_terminal_effective_nh
    )
    nominal_nh = laminated_external_nh + skin_internal_nh + terminal_total_nh

    # A transmission-line hand check computes L = Z0 * delay with the wide
    # parallel-plate approximations; a 25% fringing allowance prevents false
    # precision at the finite-width edges.
    relative_permittivity = 3.4
    c_m_s = 299_792_458.0
    z0_ohm = (
        376.730313668
        * dielectric_m
        / (width_m * math.sqrt(relative_permittivity))
    )
    propagation_delay_s = length_m * math.sqrt(relative_permittivity) / c_m_s
    hand_check_bus_nh = z0_ohm * propagation_delay_s * 1.0e9 * 1.25
    hand_check_total_nh = hand_check_bus_nh + terminal_total_nh

    lower_nh = 0.65 * nominal_nh
    upper_nh = 1.55 * nominal_nh
    return {
        "provenance": PROVENANCE,
        "validation_status": "ANALYTICAL_ONLY",
        "measured": False,
        "material": {
            "grade": "Cu-ETP",
            "conductivity_s_m_at_20c": CU_ETP_CONDUCTIVITY_S_M,
            "resistivity_ohm_m_at_20c": CU_ETP_RESISTIVITY_OHM_M,
            "basis": "typical handbook value; no supplier curve claimed",
        },
        "operating_point": {
            "dc_current_a": round(i_dc_a, 2),
            "dc_bus_voltage_v": _num(
                quantities,
                "dc_bus_voltage_v",
                default=750.0,
            ),
            "switching_frequency_hz": switching_frequency_hz,
        },
        "conductor_geometry_mm": {
            "length": round(length_mm, 2),
            "width": round(width_mm, 2),
            "thickness": thickness_mm,
            "section_mm2": round(section_mm2, 2),
            "source": "fpk_concentric_geometry MCU width + 5 A/mm^2 current seed",
        },
        "return_geometry_mm": {
            "length": round(length_mm, 2),
            "width": round(width_mm, 2),
            "thickness": thickness_mm,
            "dielectric_gap": round(dielectric_mm, 3),
            "centre_spacing": round(conductor_spacing_mm, 3),
            "current_direction": "opposing DC return in laminated overlap",
        },
        "edge_rate_assumption": {
            "voltage_rise_time_ns": round(rise_time_ns, 2),
            "equivalent_frequency_hz": round(equivalent_frequency_hz, 1),
            "formula": "f_edge = 1/(pi*t_r)",
            "status": "assumed until double-pulse waveform",
        },
        "skin_proximity_note": (
            f"At f_edge the Cu skin depth is {skin_depth_m * 1e6:.1f} um. "
            "Opposing laminated currents crowd onto facing surfaces (proximity effect), "
            "reducing external field but increasing local AC resistance; the ESL range "
            "includes finite-width/fringing uncertainty."
        ),
        "joint_terminal_inductance_nh": {
            "joint_count": joint_count,
            "joint_each_estimate": joint_each_nh,
            "capacitor_terminal_effective": cap_terminal_effective_nh,
            "sic_module_terminal_effective": sic_terminal_effective_nh,
            "total": round(terminal_total_nh, 2),
            "status": "estimate; terminal drawing and 3D extraction OPEN",
        },
        "component_breakdown_nh": {
            "laminated_external": round(laminated_external_nh, 3),
            "skin_internal": round(skin_internal_nh, 3),
            "joints_and_terminals": round(terminal_total_nh, 3),
        },
        "esl_nh_nominal": round(nominal_nh, 2),
        "esl_nh_range": _round_range(lower_nh, upper_nh),
        "extraction_method": {
            "primary": (
                "Analytical partial-inductance/field-energy sum: "
                "L_bus = mu0*l*gap/width + high-frequency internal term; "
                "then add explicit joint, capacitor-terminal, and SiC-terminal estimates."
            ),
            "hand_check": (
                "Transmission-line hand check: Z0 for a wide parallel plate multiplied "
                "by dielectric propagation delay, with 25% finite-width fringing allowance."
            ),
            "hand_check_total_nh": round(hand_check_total_nh, 2),
        },
        "uncertainty": {
            "range_nh": _round_range(lower_nh, upper_nh),
            "confidence": "screening",
            "drivers": [
                "terminal current-spreading geometry",
                "joint overlap and fastener placement",
                "finite-width proximity/fringing",
                "actual SiC voltage edge rate",
            ],
        },
        "validity_domain": (
            "Laminated, overlapping Cu-ETP DC+/DC- sheets; width/gap ratio > 10; "
            "frequency represented by 20 kHz switching and assumed voltage edge."
        ),
        "limiting_case_check": {
            "zero_gap_bus_nh": round(terminal_total_nh, 2),
            "interpretation": (
                "As dielectric gap tends to zero, analytical sheet inductance tends "
                "to zero while unavoidable joints/terminals remain."
            ),
        },
        "open_until": [
            "bus_3D_inductance",
            "double_pulse_bus_ESL_measurement",
            "supplier_terminal_geometry",
        ],
    }


def _nusselt_number(reynolds: float, prandtl: float) -> tuple[float, str]:
    laminar_nu = 4.36
    friction_4000 = (0.79 * math.log(4000.0) - 1.64) ** -2
    turbulent_4000 = (
        (friction_4000 / 8.0) * (4000.0 - 1000.0) * prandtl
        / (
            1.0
            + 12.7
            * math.sqrt(friction_4000 / 8.0)
            * (prandtl ** (2.0 / 3.0) - 1.0)
        )
    )
    if reynolds <= 2300.0:
        return laminar_nu, "fully-developed laminar constant-heat-flux"
    if reynolds < 4000.0:
        blend = (reynolds - 2300.0) / 1700.0
        return (
            laminar_nu + blend * (turbulent_4000 - laminar_nu),
            "linear transitional bracket between laminar and Gnielinski@Re=4000",
        )
    friction = (0.79 * math.log(reynolds) - 1.64) ** -2
    nu = (
        (friction / 8.0) * (reynolds - 1000.0) * prandtl
        / (
            1.0
            + 12.7
            * math.sqrt(friction / 8.0)
            * (prandtl ** (2.0 / 3.0) - 1.0)
        )
    )
    return nu, "Gnielinski turbulent internal-flow correlation"


def _friction_factor(reynolds: float) -> float:
    if reynolds <= 2300.0:
        return 64.0 / max(reynolds, 1.0)
    turbulent = 0.3164 * reynolds**-0.25
    if reynolds >= 4000.0:
        return turbulent
    laminar = 64.0 / reynolds
    blend = (reynolds - 2300.0) / 1700.0
    return laminar + blend * (turbulent - laminar)


def derive_cold_plate_thermal(
    quantities: Mapping[str, Any],
) -> dict[str, Any]:
    """Derive a steady-state cold-plate hydraulic and thermal resistance network.

    @param quantities Contract quantities including inverter loss, coolant flow,
        inlet temperature, and settled MCU geometry.
    @returns JSON-ready analytical thermal/hydraulic evidence.
    """
    geometry = geometry_from_quantities(quantities)
    heat_load_w = _num(
        quantities,
        "total_inverter_loss_kw",
        "inverter_dissipated_kw",
        default=4.3,
    ) * 1000.0
    flow_l_min = _num(quantities, "coolant_flow_l_min", default=12.0)
    inlet_c = _num(
        quantities,
        "coolant_inlet_c",
        "assumed_coolant_inlet_c",
        default=60.0,
    )
    volume_flow_m3_s = flow_l_min / 60_000.0
    mass_flow_kg_s = volume_flow_m3_s * EGW_DENSITY_KG_M3
    fluid_delta_k = heat_load_w / (mass_flow_kg_s * EGW_CP_J_KGK)

    channel_count = 8
    target_velocity_m_s = 3.5
    channel_area_m2 = (
        volume_flow_m3_s / channel_count / target_velocity_m_s
    )
    channel_height_m = math.sqrt(channel_area_m2 / 4.0)
    channel_width_m = 4.0 * channel_height_m
    hydraulic_diameter_m = (
        2.0
        * channel_width_m
        * channel_height_m
        / (channel_width_m + channel_height_m)
    )
    reynolds = (
        EGW_DENSITY_KG_M3
        * target_velocity_m_s
        * hydraulic_diameter_m
        / EGW_VISCOSITY_PA_S
    )
    prandtl = (
        EGW_CP_J_KGK
        * EGW_VISCOSITY_PA_S
        / EGW_CONDUCTIVITY_W_MK
    )
    nusselt, correlation = _nusselt_number(reynolds, prandtl)
    h_conv_w_m2k = (
        nusselt
        * EGW_CONDUCTIVITY_W_MK
        / hydraulic_diameter_m
    )

    channel_length_m = max(
        0.07,
        min(geometry.mcu_w_mm * 0.82 / 1000.0, 0.16),
    )
    wetted_area_m2 = (
        channel_count
        * 2.0
        * (channel_width_m + channel_height_m)
        * channel_length_m
    )
    friction = _friction_factor(reynolds)
    port_minor_loss_k = 3.0
    dynamic_pressure_pa = (
        0.5 * EGW_DENSITY_KG_M3 * target_velocity_m_s**2
    )
    channel_pressure_drop_pa = (
        friction * channel_length_m / hydraulic_diameter_m * dynamic_pressure_pa
    )
    total_pressure_drop_pa = (
        channel_pressure_drop_pa + port_minor_loss_k * dynamic_pressure_pa
    )

    plate_contact_area_m2 = (
        max(70.0, geometry.mcu_w_mm * 0.75)
        * max(55.0, geometry.mcu_d_mm * 0.75)
        / 1.0e6
    )
    tim_thickness_m = 0.1e-3
    plate_land_m = 3.0e-3
    r_tim_k_w = (
        tim_thickness_m
        / (TIM_CONDUCTIVITY_W_MK * plate_contact_area_m2)
    )
    r_plate_k_w = (
        plate_land_m
        / (AL_6061_CONDUCTIVITY_W_MK * plate_contact_area_m2)
    )
    r_conv_k_w = 1.0 / (h_conv_w_m2k * wetted_area_m2)
    source_to_mean_fluid_rth_k_w = r_tim_k_w + r_plate_k_w + r_conv_k_w
    source_to_mean_fluid_delta_k = (
        heat_load_w * source_to_mean_fluid_rth_k_w
    )
    source_to_inlet_delta_k = (
        source_to_mean_fluid_delta_k + 0.5 * fluid_delta_k
    )
    outlet_c = inlet_c + fluid_delta_k

    port_velocity_m_s = 2.5
    port_bore_m = math.sqrt(
        4.0 * volume_flow_m3_s / (math.pi * port_velocity_m_s)
    )
    uncertainty_low_k = 0.65 * source_to_inlet_delta_k
    uncertainty_high_k = 1.55 * source_to_inlet_delta_k
    half_flow_delta_k = 2.0 * fluid_delta_k
    return {
        "provenance": PROVENANCE,
        "validation_status": "ANALYTICAL_ONLY",
        "measured": False,
        "heat_load_w": round(heat_load_w, 1),
        "heat_load_basis": (
            "total_inverter_loss_kw/inverter_dissipated_kw seed; no supplier "
            "loss or thermal-resistance curve invented"
        ),
        "operating_point": {
            "coolant": "50/50 ethylene-glycol/water handbook seed",
            "flow_l_min": round(flow_l_min, 2),
            "inlet_c": round(inlet_c, 2),
            "density_kg_m3": EGW_DENSITY_KG_M3,
            "specific_heat_j_kgk": EGW_CP_J_KGK,
            "dynamic_viscosity_pa_s": EGW_VISCOSITY_PA_S,
        },
        "plate_geometry_mm": {
            "footprint_width": round(geometry.mcu_w_mm, 2),
            "footprint_depth": round(geometry.mcu_d_mm, 2),
            "channel_length": round(channel_length_m * 1000.0, 2),
            "contact_area_mm2": round(plate_contact_area_m2 * 1.0e6, 1),
            "source": "fpk_concentric_geometry MCU bay",
        },
        "channel_hydraulics": {
            "channel_count": channel_count,
            "channel_width_mm": round(channel_width_m * 1000.0, 3),
            "channel_height_mm": round(channel_height_m * 1000.0, 3),
            "hydraulic_diameter_mm": round(
                hydraulic_diameter_m * 1000.0,
                3,
            ),
            "mean_velocity_m_s": target_velocity_m_s,
            "reynolds": round(reynolds, 1),
            "prandtl": round(prandtl, 2),
            "nusselt": round(nusselt, 2),
            "correlation": correlation,
            "friction_factor": round(friction, 5),
            "channel_pressure_drop_pa": round(channel_pressure_drop_pa, 1),
            "minor_loss_k": port_minor_loss_k,
            "pressure_drop_pa": round(total_pressure_drop_pa, 1),
            "equations": [
                "Dh = 2*w*h/(w+h)",
                "Re = rho*v*Dh/mu",
                "DeltaP = (f*L/Dh + sum(K))*rho*v^2/2",
            ],
        },
        "thermal_network": {
            "tim_thickness_mm": tim_thickness_m * 1000.0,
            "tim_conductivity_w_mk": TIM_CONDUCTIVITY_W_MK,
            "tim_rth_k_per_w": round(r_tim_k_w, 6),
            "al_land_thickness_mm": plate_land_m * 1000.0,
            "al_land_rth_k_per_w": round(r_plate_k_w, 6),
            "h_conv_w_m2k": round(h_conv_w_m2k, 1),
            "wetted_area_m2": round(wetted_area_m2, 6),
            "convection_rth_k_per_w": round(r_conv_k_w, 6),
            "source_interface_to_mean_fluid_rth_k_per_w": round(
                source_to_mean_fluid_rth_k_w,
                6,
            ),
            "equation": (
                "R_source-fluid = t_TIM/(k_TIM*A_contact) + "
                "t_Al/(k_Al*A_contact) + 1/(h*A_wet)"
            ),
            "junction_excluded": (
                "Semiconductor junction-to-case Rth requires selected module "
                "supplier evidence and is not invented here."
            ),
        },
        "temperature_rise_k": {
            "fluid_inlet_to_outlet": round(fluid_delta_k, 2),
            "source_interface_to_mean_fluid": round(
                source_to_mean_fluid_delta_k,
                2,
            ),
            "source_interface_to_inlet": round(source_to_inlet_delta_k, 2),
            "uncertainty_range_source_to_inlet": _round_range(
                uncertainty_low_k,
                uncertainty_high_k,
            ),
            "note": (
                "This network ends at the module source interface. Junction "
                "temperature is not calculated without supplier junction-to-case Rth."
            ),
        },
        "outlet_c_estimate": round(outlet_c, 2),
        "ports": [
            {
                "id": "coolant_port_in",
                "role": "inlet",
                "analytical_bore_mm": round(port_bore_m * 1000.0, 2),
                "design_flow_l_min": round(flow_l_min, 2),
                "xyz": "OPEN — FIA/JLR vehicle ICD",
            },
            {
                "id": "coolant_port_out",
                "role": "outlet",
                "analytical_bore_mm": round(port_bore_m * 1000.0, 2),
                "design_flow_l_min": round(flow_l_min, 2),
                "xyz": "OPEN — FIA/JLR vehicle ICD",
            },
        ],
        "uncertainty": {
            "source_to_inlet_delta_k": _round_range(
                uncertainty_low_k,
                uncertainty_high_k,
            ),
            "confidence": "screening",
            "drivers": [
                "transitional-flow heat-transfer correlation",
                "TIM bond-line thickness and voiding",
                "channel manifold maldistribution",
                "inverter loss seed and coolant properties at temperature",
            ],
        },
        "validity_domain": (
            "Steady, single-phase 50/50 EGW, 8–16 L/min, assumed uniform "
            "heat flux and equal channel distribution; no boiling or manifold CFD."
        ),
        "limiting_case_check": {
            "half_flow_fluid_delta_k": round(half_flow_delta_k, 2),
            "interpretation": "At half flow, Q/(m_dot*cp) doubles as required.",
        },
        "open_until": [
            "CFD_cold_plate",
            "pressure_drop_bench",
            "supplier_module_Rth",
            "FIA_port_xyz",
        ],
    }


def evaluate_cfd_open_gate(
    open_until: Sequence[str],
    *,
    requested_ship_ok: bool,
) -> dict[str, Any]:
    """Fail closed when the mandatory cold-plate CFD hold is still OPEN.

    @param open_until Current evidence holds.
    @param requested_ship_ok Upstream requested ship disposition.
    @returns Gate verdict; an OPEN CFD hold always forces ship_ok false.
    """
    blocking_open = sorted(
        item for item in open_until if item == "CFD_cold_plate"
    )
    ship_ok = bool(requested_ship_ok and not blocking_open)
    return {
        "gate": "cfd_open_propagates_to_ship_ok",
        "requested_ship_ok": bool(requested_ship_ok),
        "blocking_open": blocking_open,
        "proveCatch_fired": bool(requested_ship_ok and blocking_open),
        "ship_ok": ship_ok,
        "action": (
            "BLOCK_SHIP_AND_ROUTE_TO_CFD"
            if blocking_open
            else "ALLOW_OTHER_SHIP_GATES_TO_DECIDE"
        ),
        "route": "thermal/CFD_cold_plate",
    }


def build_fpk_esl_thermal(
    quantities: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build both analytical P4 evidence records from one contract revision.

    @param quantities Current orchestrator contract quantities.
    @returns Tuple of (bus ESL evidence, cold-plate evidence).
    """
    return derive_bus_esl(quantities), derive_cold_plate_thermal(quantities)


def render_esl_thermal_markdown(
    bus: Mapping[str, Any],
    thermal: Mapping[str, Any],
    gate: Mapping[str, Any],
) -> str:
    """Render the twin's auditable P4 engineering note.

    @param bus Analytical bus ESL record.
    @param thermal Analytical cold-plate record.
    @param gate CFD OPEN fail-closed verdict.
    @returns Markdown with methods, numbers, uncertainty, and OPEN evidence.
    """
    bus_range = bus["esl_nh_range"]
    temperature = thermal["temperature_rise_k"]
    hydraulics = thermal["channel_hydraulics"]
    network = thermal["thermal_network"]
    ports = thermal["ports"]
    return "\n".join(
        [
            "# JLR FE Front FPK — Bus ESL + Cold-Plate Thermal Network",
            "",
            "## Evidence status",
            "",
            f"- Provenance: `{PROVENANCE}`",
            "- Validation: **ANALYTICAL ONLY — NEVER measured**",
            "- Supplier curves: none invented; module junction-to-case Rth remains OPEN.",
            f"- CFD gate: `{gate['action']}`; `ship_ok={str(gate['ship_ok']).lower()}`",
            "",
            "## Laminated DC bus ESL",
            "",
            f"- Result: **{bus['esl_nh_nominal']:.2f} nH nominal; "
            f"{bus_range[0]:.2f}–{bus_range[1]:.2f} nH uncertainty range**.",
            f"- Cu: {bus['material']['grade']}; "
            f"σ={bus['material']['conductivity_s_m_at_20c']:.3g} S/m.",
            f"- Conductor + return geometry: `{json.dumps(bus['conductor_geometry_mm'])}` / "
            f"`{json.dumps(bus['return_geometry_mm'])}`.",
            f"- Edge assumption: `{json.dumps(bus['edge_rate_assumption'])}`.",
            f"- Skin/proximity: {bus['skin_proximity_note']}",
            f"- Joint + terminal estimate: "
            f"{bus['joint_terminal_inductance_nh']['total']:.2f} nH.",
            f"- Extraction: {bus['extraction_method']['primary']}",
            f"- Second hand check: {bus['extraction_method']['hand_check']} "
            f"→ {bus['extraction_method']['hand_check_total_nh']:.2f} nH total.",
            f"- OPEN: {', '.join(bus['open_until'])}.",
            "",
            "## Cold-plate thermal/hydraulic network",
            "",
            f"- Heat load: **{thermal['heat_load_w']:.0f} W** from the inverter-loss seed.",
            f"- Fluid rise: **{temperature['fluid_inlet_to_outlet']:.2f} K**; "
            f"source interface-to-inlet rise: **"
            f"{temperature['source_interface_to_inlet']:.2f} K** "
            f"(range {temperature['uncertainty_range_source_to_inlet'][0]:.2f}–"
            f"{temperature['uncertainty_range_source_to_inlet'][1]:.2f} K).",
            f"- Channels: {hydraulics['channel_count']} × "
            f"{hydraulics['channel_width_mm']:.3f}×"
            f"{hydraulics['channel_height_mm']:.3f} mm; "
            f"Re={hydraulics['reynolds']:.0f}; "
            f"ΔP≈{hydraulics['pressure_drop_pa']:.0f} Pa.",
            f"- TIM: {network['tim_thickness_mm']:.3f} mm at "
            f"{network['tim_conductivity_w_mk']:.1f} W/(m·K); "
            f"Rth={network['tim_rth_k_per_w']:.6f} K/W.",
            f"- Network: {network['equation']}",
            f"- Ports: inlet/outlet analytical bore "
            f"{ports[0]['analytical_bore_mm']:.2f} mm at "
            f"{ports[0]['design_flow_l_min']:.2f} L/min; XYZ remains OPEN.",
            f"- OPEN: {', '.join(thermal['open_until'])}.",
            "",
            "## proveCatch",
            "",
            f"`CFD_cold_plate OPEN + requested_ship_ok=true` → "
            f"`proveCatch_fired={str(gate['proveCatch_fired']).lower()}` → "
            f"`ship_ok={str(gate['ship_ok']).lower()}`.",
            "",
        ]
    )


def _selftest() -> None:
    quantities = {
        "front_bay_envelope_w_mm": 343.0,
        "front_bay_envelope_d_mm": 259.0,
        "front_bay_envelope_h_mm": 267.0,
        "rotor_airgap_diameter_mm": 121.98,
        "stack_length_mm": 97.58,
        "gear_ratio": 8.0,
        "mgu_shaft_torque_nm": 119.7,
        "phase_current_design_a": 535.0,
        "dc_bus_voltage_v": 750.0,
        "continuous_power_kw": 250.0,
        "switching_freq_hz": 20_000.0,
        "inverter_dissipated_kw": 4.3,
        "coolant_flow_l_min": 12.0,
        "coolant_inlet_c": 60.0,
    }
    bus, thermal = build_fpk_esl_thermal(quantities)
    assert bus["provenance"] == PROVENANCE
    assert bus["measured"] is False
    assert bus["esl_nh_range"][0] < bus["esl_nh_nominal"]
    assert bus["esl_nh_range"][1] > bus["esl_nh_nominal"]
    assert bus["joint_terminal_inductance_nh"]["total"] > 0.0
    assert "skin" in bus["skin_proximity_note"].lower()
    assert thermal["heat_load_w"] == 4300.0
    assert thermal["channel_hydraulics"]["pressure_drop_pa"] > 0.0
    assert thermal["thermal_network"]["tim_rth_k_per_w"] > 0.0
    assert "CFD_cold_plate" in thermal["open_until"]

    # proveCatch: the known-bad request to ship with CFD OPEN must fire and block.
    caught = evaluate_cfd_open_gate(
        thermal["open_until"],
        requested_ship_ok=True,
    )
    assert caught["proveCatch_fired"] is True
    assert caught["ship_ok"] is False
    assert caught["action"] == "BLOCK_SHIP_AND_ROUTE_TO_CFD"
    report = render_esl_thermal_markdown(bus, thermal, caught)
    assert "NEVER measured" in report
    assert "ship_ok=false" in report
    clean = evaluate_cfd_open_gate(
        ("pressure_drop_bench",),
        requested_ship_ok=True,
    )
    assert clean["proveCatch_fired"] is False
    assert clean["ship_ok"] is True
    print("fpk_bus_esl --selftest OK")
    print(
        json.dumps(
            {
                "ESL_nH": bus["esl_nh_nominal"],
                "ESL_nH_range": bus["esl_nh_range"],
                "cold_plate_source_to_inlet_delta_K": thermal[
                    "temperature_rise_k"
                ]["source_interface_to_inlet"],
                "cold_plate_fluid_delta_K": thermal["temperature_rise_k"][
                    "fluid_inlet_to_outlet"
                ],
                "proveCatch": caught,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        raise SystemExit(0)
    print("Usage: python3 scripts/lib/fpk_bus_esl.py --selftest")
    raise SystemExit(2)
