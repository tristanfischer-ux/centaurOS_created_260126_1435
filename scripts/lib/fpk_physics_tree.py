#!/usr/bin/env python3
"""Front FPK — recursive first-principles physics tree (bottom-up).

INTENT (2026-07-29 Tristan): every FPK component must explode to subcomponents
until material / continuum leaves, each carrying electrical / magnetic /
thermal / fluid / mechanical / material / manufacturing physics. Build UP from
fundamentals; optimise later. Seeds allowed; silent gaps forbidden.

GOTCHA (FFF): every sub-sub-component has form-follows-function characteristics.
Nothing is random or decorative — geometry, materials, counts, and sizes are
deterministically calculated from budgets (see .cursor/rules/fpk-deterministic-fff.mdc).

DECISION: analytical handbook + contract scalars only. FEA / HIL / dyno /
supplier ICD replace. Never claim homologated.

Plan: docs/plans/JLR-FE-FRONT-FPK-PHYSICS-BOTTOM-UP-2026-07-29.md
Run: python3 scripts/lib/fpk_physics_tree.py --selftest
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from dataclasses import asdict, dataclass, field
from typing import Any, Mapping, Optional

try:
    from scripts.lib.fpk_bus_esl import build_fpk_esl_thermal
except ModuleNotFoundError:
    from fpk_bus_esl import build_fpk_esl_thermal


# ── Material handbook seeds (provenance: typical handbook; not lab-measured) ─

MATERIALS: dict[str, dict[str, Any]] = {
    "Cu_OFHC": {
        "name": "OFHC copper",
        "elements": "Cu ≥99.99%",
        "density_kg_m3": 8960.0,
        "electrical_conductivity_s_m": 5.8e7,
        "electrical_resistivity_ohm_m": 1.72e-8,
        "thermal_conductivity_w_mk": 401.0,
        "specific_heat_j_kgk": 385.0,
        "manufacturing": "drawn wire / extruded bus / stamped lug",
    },
    "Cu_ETP": {
        "name": "ETP copper (busbar)",
        "elements": "Cu ≥99.9%",
        "density_kg_m3": 8940.0,
        "electrical_conductivity_s_m": 5.6e7,
        "electrical_resistivity_ohm_m": 1.78e-8,
        "thermal_conductivity_w_mk": 390.0,
        "specific_heat_j_kgk": 385.0,
        "manufacturing": "extruded / CNC busbar",
    },
    "Al_6061_T6": {
        "name": "Aluminium 6061-T6",
        "elements": "Al-Mg-Si",
        "density_kg_m3": 2700.0,
        "electrical_conductivity_s_m": 2.5e7,
        "thermal_conductivity_w_mk": 167.0,
        "specific_heat_j_kgk": 896.0,
        "yield_mpa": 276.0,
        "manufacturing": "CNC billet / sand-cast + machine",
    },
    "Al_ADC12": {
        "name": "Al ADC12 cast",
        "elements": "Al-Si-Cu",
        "density_kg_m3": 2700.0,
        "thermal_conductivity_w_mk": 96.0,
        "specific_heat_j_kgk": 960.0,
        "manufacturing": "HPDC + machine (housing)",
    },
    "electrical_steel_M250_35A": {
        "name": "Non-oriented electrical steel M250-35A class",
        "elements": "Fe-Si (~3% Si)",
        "density_kg_m3": 7650.0,
        "lamination_thickness_mm": 0.35,
        "saturation_b_t": 1.8,
        "core_loss_w_kg_at_1t_400hz": 25.0,  # order-of-magnitude seed
        "manufacturing": "stamp / laser-cut laminations + stack + varnish",
    },
    "NdFeB_N42UH": {
        "name": "NdFeB N42UH-class (seed — supplier grade OPEN)",
        "elements": "Nd-Fe-B + Dy/Tb grain-boundary (UH)",
        "density_kg_m3": 7500.0,
        "br_t": 1.28,
        "hcj_ka_m": 2000.0,
        "max_temp_c": 180.0,
        "manufacturing": "sintered magnet + grind + coat (Ni-Cu-Ni); retain OPEN",
    },
    "SiC_die": {
        "name": "SiC MOSFET die",
        "elements": "SiC (4H)",
        "density_kg_m3": 3210.0,
        "thermal_conductivity_w_mk": 370.0,
        "manufacturing": "epitaxy + wafer fab + sinter-attach (supplier module)",
    },
    "AlN_substrate": {
        "name": "AlN DBC/AMB substrate",
        "elements": "AlN ceramic + Cu cladding",
        "density_kg_m3": 3260.0,
        "thermal_conductivity_w_mk": 170.0,
        "manufacturing": "AMB/DBC ceramic substrate (module OEM)",
    },
    "TIM_grease": {
        "name": "Thermal interface grease (seed)",
        "elements": "silicone + ceramic fillers",
        "thermal_conductivity_w_mk": 4.0,
        "thickness_mm": 0.1,
        "manufacturing": "dispensed TIM between module & cold plate",
    },
    "steel_4340": {
        "name": "Alloy steel 4340 class (shaft/gears seed)",
        "elements": "Fe-Ni-Cr-Mo",
        "density_kg_m3": 7850.0,
        "yield_mpa": 860.0,
        "manufacturing": "forge + CNC + case harden / grind",
    },
    "bearing_steel_100Cr6": {
        "name": "Bearing steel 100Cr6",
        "elements": "Fe-Cr-C",
        "density_kg_m3": 7800.0,
        "manufacturing": "precision race + balls (COTS)",
    },
    "PA66_GF30": {
        "name": "PA66 GF30",
        "elements": "polyamide + 30% glass",
        "density_kg_m3": 1350.0,
        "manufacturing": "injection mould (covers / cages)",
    },
    "FKM_seal": {
        "name": "FKM elastomer seal",
        "elements": "fluoroelastomer",
        "density_kg_m3": 1850.0,
        "manufacturing": "moulded lip seal (COTS)",
    },
    "enamel_polyimide": {
        "name": "Polyimide magnet-wire enamel (class H)",
        "elements": "polyimide",
        "density_kg_m3": 1420.0,
        "temp_class_c": 180.0,
        "manufacturing": "enamelled round/rectangular wire",
    },
    "film_cap_PP": {
        "name": "Metallised PP film capacitor dielectric",
        "elements": "PP + Al/Zn metallisation",
        "density_kg_m3": 910.0,
        "manufacturing": "wound/stacked film + potting (COTS bank)",
    },
    "FR4": {
        "name": "FR4 PCB laminate",
        "elements": "epoxy + glass weave + Cu foil",
        "density_kg_m3": 1850.0,
        "manufacturing": "multilayer PCB fab (supplier / forge draft)",
    },
    "EGW_50_50": {
        "name": "Ethylene-glycol/water 50/50 coolant",
        "elements": "C2H6O2 + H2O",
        "density_kg_m3": 1060.0,
        "specific_heat_j_kgk": 3500.0,
        "thermal_conductivity_w_mk": 0.4,
        "dynamic_viscosity_pa_s": 0.0025,
        "manufacturing": "vehicle coolant circuit (not fabricated part)",
    },
    "gear_oil_75W90": {
        "name": "Synthetic gear oil 75W-90 class",
        "elements": "PAO + additives",
        "density_kg_m3": 860.0,
        "specific_heat_j_kgk": 1900.0,
        "manufacturing": "filled charge",
    },
    "solder_sac305": {
        "name": "SAC305 solder",
        "elements": "Sn96.5 Ag3.0 Cu0.5",
        "density_kg_m3": 7370.0,
        "manufacturing": "reflow / selective solder",
    },
    "steel_10_9": {
        "name": "ISO property class 10.9 alloy steel",
        "elements": "quenched and tempered Fe-C alloy",
        "density_kg_m3": 7850.0,
        "yield_mpa": 900.0,
        "manufacturing": "cold headed + rolled thread + heat treatment",
    },
    "stainless_A2_70": {
        "name": "A2-70 stainless fastener steel",
        "elements": "Fe-Cr-Ni",
        "density_kg_m3": 7900.0,
        "yield_mpa": 450.0,
        "manufacturing": "cold headed + rolled thread",
    },
    "spring_steel_51CrV4": {
        "name": "51CrV4 spring steel",
        "elements": "Fe-Cr-V-C",
        "density_kg_m3": 7850.0,
        "yield_mpa": 1200.0,
        "manufacturing": "stamp/form + quench and temper",
    },
    "ePTFE_membrane": {
        "name": "Expanded PTFE vent membrane",
        "elements": "PTFE",
        "density_kg_m3": 500.0,
        "manufacturing": "expanded membrane laminated into moulded vent",
    },
    "conductive_elastomer": {
        "name": "Conductive silicone EMC elastomer",
        "elements": "silicone + Ag/Ni plated filler",
        "density_kg_m3": 2200.0,
        "manufacturing": "extruded or moulded gasket",
    },
    "PEEK": {
        "name": "PEEK engineering polymer",
        "elements": "polyether ether ketone",
        "density_kg_m3": 1320.0,
        "thermal_conductivity_w_mk": 0.25,
        "manufacturing": "injection mould / machine",
    },
}


DOMAINS = (
    "electrical",
    "magnetic",
    "thermal",
    "fluid",
    "mechanical",
    "material",
    "manufacturing",
)


def _num(q: Mapping[str, Any], *keys: str, default: float = 0.0) -> float:
    for k in keys:
        raw = q.get(k)
        if isinstance(raw, dict):
            raw = raw.get("value")
        try:
            v = float(raw)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        if math.isfinite(v) and v != 0:
            return v
    return default


@dataclass
class PhysicsNode:
    """One node in the recursive FPK tree."""

    id: str
    name: str
    parent_id: Optional[str]
    assembly: str  # cassette | mcu | motor | transmission
    kind: str  # assembly | part | subpart | material | fluid | process
    material_id: Optional[str] = None
    manufacturing: str = ""
    special_manufacture: bool = False
    domains: tuple[str, ...] = ()
    physics: dict[str, Any] = field(default_factory=dict)
    open_until: tuple[str, ...] = ()
    children: list[PhysicsNode] = field(default_factory=list)
    notes: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


def _mat(mid: str) -> dict[str, Any]:
    m = MATERIALS.get(mid)
    if not m:
        raise KeyError(f"unknown material {mid}")
    return m


def _leaf(
    pid: str,
    name: str,
    parent: str,
    assembly: str,
    material_id: str,
    domains: tuple[str, ...],
    physics: dict[str, Any],
    *,
    special: bool = False,
    open_until: tuple[str, ...] = (),
    notes: tuple[str, ...] = (),
    kind: str = "material",
) -> PhysicsNode:
    m = _mat(material_id)
    phys = {
        "material_name": m["name"],
        "elements": m.get("elements"),
        "density_kg_m3": m.get("density_kg_m3"),
        **{k: v for k, v in m.items() if k not in ("name", "elements", "manufacturing")},
        **physics,
    }
    return PhysicsNode(
        id=pid,
        name=name,
        parent_id=parent,
        assembly=assembly,
        kind=kind,
        material_id=material_id,
        manufacturing=m.get("manufacturing", ""),
        special_manufacture=special,
        domains=domains,
        physics=phys,
        open_until=open_until,
        notes=notes,
    )


def _si_unit_for_key(key: str) -> str:
    """Return a machine-readable SI unit hint for a physics scalar."""
    exact_units = {
        "rpm": "1/min",
        "br_t": "T",
        "airgap_b_seed_t": "T",
        "phase_separation_deg": "deg",
    }
    if key in exact_units:
        return exact_units[key]
    suffixes = (
        ("_kg_m3", "kg/m^3"),
        ("_s_m", "S/m"),
        ("_ohm_m", "ohm*m"),
        ("_w_mk", "W/(m*K)"),
        ("_j_kgk", "J/(kg*K)"),
        ("_pa_s", "Pa*s"),
        ("_w_m2k", "W/(m^2*K)"),
        ("_rad_s", "rad/s"),
        ("_m_s", "m/s"),
        ("_m2", "m^2"),
        ("_m3", "m^3"),
        ("_mm2", "mm^2"),
        ("_mm3", "mm^3"),
        ("_mm", "mm"),
        ("_kg", "kg"),
        ("_mpa", "MPa"),
        ("_ka_m", "kA/m"),
        ("_pa", "Pa"),
        ("_rpm", "1/min"),
        ("_hz", "Hz"),
        ("_ohm", "ohm"),
        ("_uf", "uF"),
        ("_nh", "nH"),
        ("_v", "V"),
        ("_a", "A"),
        ("_w", "W"),
        ("_kw", "kW"),
        ("_nm", "N*m"),
        ("_k", "K"),
        ("_c", "degC"),
    )
    for suffix, unit in suffixes:
        if key.endswith(suffix):
            return unit
    return "1"


def _stamp_physics_evidence(root: PhysicsNode) -> None:
    """Ensure every node, especially each leaf, carries deterministic evidence."""
    for node in flatten_tree(root):
        numeric_units = {
            key: _si_unit_for_key(key)
            for key, value in node.physics.items()
            if isinstance(value, (int, float)) and not isinstance(value, bool)
        }
        node.physics.setdefault("provenance", "ANALYTICAL_FROM_ASSUMED_GEOMETRY")
        node.physics.setdefault(
            "equation",
            node.physics.get("formula")
            or "x_leaf = f(parent load budget, assumed geometry, handbook material properties)",
        )
        node.physics.setdefault("si_units", numeric_units or {"dimensionless_state": "1"})
        node.physics.setdefault(
            "assumptions",
            [
                "Current orchestrator-contract duty point",
                "Geometry is an analytical seed until the named OPEN evidence replaces it",
                "No stochastic or decorative dimensions",
            ],
        )
        node.physics.setdefault(
            "uncertainty",
            {
                "class": "screening-level engineering seed",
                "bound": "not claimed as validation evidence",
                "closure": list(node.open_until) or ["drawing release / supplier confirmation"],
            },
        )


# ── Context from contract ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class FpkContext:
    v_dc: float
    i_ph_design: float
    i_ph_rms: float
    i_ph_max: float
    p_cont_kw: float
    p_shaft_kw: float
    inv_loss_kw: float
    cu_loss_w: float
    fe_loss_w: float
    eta_inv: float
    f_sw: float
    n_rpm: float
    t_nm: float
    pole_pairs: int
    # Slot count — needed for the SLOT-PASSING frequency that drives magnet
    # eddy loss (Zs*n/60 in the rotor frame, NOT the electrical p*n/60).
    n_slots: int
    d_gap_mm: float
    stack_mm: float
    stator_od_mm: float
    stator_id_mm: float
    coolant_lpm: float
    coolant_in_c: float
    gear_ratio: float
    planet_count: int
    ring_id_mm: float
    bay_mass_cap_kg: float


def context_from_quantities(q: Mapping[str, Any]) -> FpkContext:
    return FpkContext(
        v_dc=_num(q, "dc_bus_voltage_v", default=750.0),
        i_ph_design=_num(q, "phase_current_design_a", default=535.0),
        i_ph_rms=_num(q, "ac_rms_current_a", "sic_loss_ac_rms_current_a", default=381.0),
        i_ph_max=_num(q, "phase_current_max_a", default=477.0),
        p_cont_kw=_num(q, "continuous_power_kw", "mgu_ac_electrical_input_kw", default=250.0),
        p_shaft_kw=_num(q, "mgu_shaft_power_kw", default=244.0),
        inv_loss_kw=_num(q, "inverter_dissipated_kw", default=4.3),
        cu_loss_w=_num(q, "mgu_copper_loss_w", default=2180.0),
        fe_loss_w=_num(q, "mgu_iron_loss_w", default=136.0),
        eta_inv=_num(q, "inverter_efficiency", default=0.987),
        f_sw=_num(q, "switching_freq_hz", default=20000.0),
        n_rpm=_num(q, "mgu_base_speed_rpm", default=19500.0),
        t_nm=_num(q, "mgu_shaft_torque_nm", default=120.0),
        pole_pairs=int(_num(q, "pole_pairs", default=4.0)),
        n_slots=int(_num(q, "stator_slots", "fpk_stator_slots", default=24.0)),
        d_gap_mm=_num(q, "rotor_airgap_diameter_mm", "fpk_rotor_od_mm", default=122.0),
        stack_mm=_num(q, "stack_length_mm", default=98.0),
        stator_od_mm=_num(q, "fpk_stator_od_mm", default=165.0),
        stator_id_mm=_num(q, "fpk_stator_id_mm", default=123.4),
        coolant_lpm=_num(q, "coolant_flow_l_min", default=12.0),
        coolant_in_c=_num(q, "coolant_inlet_c", "assumed_coolant_inlet_c", default=60.0),
        gear_ratio=_num(q, "gear_ratio", default=8.0),
        planet_count=int(_num(q, "fpk_planet_count", default=3.0)),
        ring_id_mm=_num(q, "fpk_ring_id_mm", default=89.0),
        bay_mass_cap_kg=_num(q, "fpk_mass_cap_kg", "mgu_mcu_mass_cap_kg", default=32.0),
    )


# ── Builders per major part ───────────────────────────────────────────────────


def _build_stator_windings(ctx: FpkContext, parent: str) -> PhysicsNode:
    """Deepest EM example: coils → turns → wire → Cu + enamel."""
    slots = 3 * ctx.pole_pairs * 2  # q=2
    a_rms = 60000.0  # A/m electric loading seed
    d_m = ctx.d_gap_mm / 1000.0
    turns_ph = max(4, int(round((a_rms * math.pi * d_m) / (3.0 * max(ctx.i_ph_design, 1.0)))))
    coils = max(1, slots // 2)
    turns_coil = max(1, int(round(turns_ph * 3 / coils)))
    parallel = 2 if ctx.i_ph_design > 300 else 1
    j = 10.0  # A/mm²
    a_cu_mm2 = ctx.i_ph_design / (j * parallel)
    # rectangular hairpin-class seed if large; else round
    if a_cu_mm2 > 8.0:
        wire_kind = "rectangular_hairpin_seed"
        # approx square side
        side = math.sqrt(a_cu_mm2)
        wire_w = round(side * 1.15, 2)
        wire_h = round(side / 1.15, 2)
        wire_od = None
        a_geom = wire_w * wire_h
    else:
        wire_kind = "round_magnet_wire"
        wire_od = round(2.0 * math.sqrt(a_cu_mm2 / math.pi), 3)
        wire_w = wire_h = None
        a_geom = math.pi * (wire_od / 2.0) ** 2

    cu = _mat("Cu_OFHC")
    rho = cu["electrical_resistivity_ohm_m"]
    # mean turn length ≈ π·D_gap + 2·stack overhang seed
    mlt = math.pi * d_m + 2.0 * (0.015 + ctx.stack_mm / 1000.0 * 0.25)
    # total Cu length for 3 phases
    length_cu = 3.0 * turns_ph * mlt / max(parallel, 1)
    r_phase = rho * length_cu / max(a_geom * 1e-6, 1e-12)
    # I²R check vs tool copper loss (order)
    p_cu_calc = 3.0 * (ctx.i_ph_rms**2) * r_phase

    fill = 0.42
    tooth_area = max(1e-6, (math.pi / 4.0) * ((ctx.stator_od_mm**2 - ctx.stator_id_mm**2) * 1e-6) * 0.35)
    cu_vol = fill * tooth_area * (ctx.stack_mm / 1000.0)
    cu_mass = cu_vol * cu["density_kg_m3"]

    root = PhysicsNode(
        id="stator_windings",
        name="Stator Windings",
        parent_id=parent,
        assembly="motor",
        kind="part",
        manufacturing="vacuum impregnate / hairpin insert + weld (special)",
        special_manufacture=True,
        domains=("electrical", "thermal", "magnetic", "material", "manufacturing"),
        physics={
            "stator_slots": slots,
            "pole_pairs": ctx.pole_pairs,
            "slots_per_pole_per_phase": 2,
            "turns_per_phase": turns_ph,
            "turns_per_coil": turns_coil,
            "coil_count": coils,
            "parallel_paths": parallel,
            "phase_count": 3,
            "electric_loading_a_per_m": a_rms,
            "current_density_a_per_mm2": j,
            "conductor_area_mm2": round(a_geom, 3),
            "wire_kind": wire_kind,
            "wire_od_mm": wire_od,
            "wire_width_mm": wire_w,
            "wire_height_mm": wire_h,
            "mean_turn_length_m": round(mlt, 4),
            "phase_resistance_ohm_20c": round(r_phase, 5),
            "copper_loss_calc_w": round(p_cu_calc, 1),
            "copper_loss_tool_w": ctx.cu_loss_w,
            "copper_mass_kg": round(cu_mass, 3),
            "fill_factor": fill,
            "electrical_frequency_hz": round((ctx.n_rpm / 60.0) * ctx.pole_pairs, 1),
            "phase_current_design_a": ctx.i_ph_design,
            "phase_current_rms_a": ctx.i_ph_rms,
        },
        open_until=("FEA_em", "dyno_resistance", "hairpin_tooling"),
        notes=(
            "N_ph ≈ A·π·D/(3·I); R_ph from ρ·ℓ/A; compare I²R to motor:loss-point",
        ),
    )

    for ph in ("u", "v", "w"):
        coil = PhysicsNode(
            id=f"phase_coil_{ph}",
            name=f"Phase Coil {ph.upper()}",
            parent_id="stator_windings",
            assembly="motor",
            kind="subpart",
            domains=("electrical", "thermal", "magnetic"),
            physics={
                "turns": turns_ph,
                "parallel_paths": parallel,
                "current_a_rms": ctx.i_ph_rms,
                "resistance_ohm": round(r_phase, 5),
            },
        )
        turn = PhysicsNode(
            id=f"turn_{ph}",
            name=f"Turn geometry ({ph})",
            parent_id=coil.id,
            assembly="motor",
            kind="subpart",
            domains=("electrical", "material"),
            physics={
                "turns_per_coil": turns_coil,
                "mean_length_m": round(mlt, 4),
            },
        )
        strand = PhysicsNode(
            id=f"conductor_strand_{ph}",
            name=f"Conductor strand ({ph})",
            parent_id=turn.id,
            assembly="motor",
            kind="subpart",
            domains=("electrical", "thermal", "material", "manufacturing"),
            physics={
                "area_mm2": round(a_geom, 3),
                "j_a_per_mm2": j,
                "wire_kind": wire_kind,
            },
            special_manufacture=True,
        )
        strand.children = [
            _leaf(
                f"copper_core_{ph}",
                "Copper core",
                strand.id,
                "motor",
                "Cu_OFHC",
                ("electrical", "thermal", "material"),
                {
                    "cross_section_mm2": round(a_geom, 3),
                    "conductivity_used_s_m": cu["electrical_conductivity_s_m"],
                    "resistivity_ohm_m": rho,
                },
                special=True,
                notes=("Handbook σ at 20 °C; temperature rise raises R",),
            ),
            _leaf(
                f"enamel_{ph}",
                "Magnet-wire enamel",
                strand.id,
                "motor",
                "enamel_polyimide",
                ("thermal", "material", "manufacturing"),
                {"temp_class_c": 180.0, "build_mm": 0.05},
                kind="process",
            ),
        ]
        turn.children = [strand]
        coil.children = [turn]
        root.children.append(coil)

    root.children.append(
        PhysicsNode(
            id="slot_liner_wedge_set",
            name="Slot liner + wedge set",
            parent_id="stator_windings",
            assembly="motor",
            kind="subpart",
            manufacturing="Nomex/slot paper + GFRP wedge",
            domains=("electrical", "thermal", "manufacturing"),
            physics={"dielectric_role": "slot insulation", "count": slots},
            open_until=("insulation_system_cert",),
        )
    )
    root.children.append(
        PhysicsNode(
            id="phase_terminal_lugs",
            name="Phase terminal lugs",
            parent_id="stator_windings",
            assembly="motor",
            kind="subpart",
            material_id="Cu_ETP",
            manufacturing="brazed / welded Cu lugs",
            special_manufacture=True,
            domains=("electrical", "thermal", "material"),
            physics={"phases": 3, "current_a": ctx.i_ph_design},
        )
    )
    return root


def _build_magnets(ctx: FpkContext, parent: str) -> PhysicsNode:
    poles = 2 * ctx.pole_pairs
    m = _mat("NdFeB_N42UH")

    # ⭐⭐ A FIFTH MAGNET (2026-08-01). `thick = 3.0` was hardcoded here while
    # em_fia_front_kit_case built 8.85 mm, em_fia_demag_screen and
    # calculix_fia_magnet_pocket_screen built 7.00, and
    # em_pyleecan_analytic_crosscheck defaulted to 6.0. Five definitions of one
    # part, and THIS one feeds the BILL OF MATERIALS — so the BoM was describing
    # a magnet no analysis had ever solved. Take it from the shared rule.
    try:
        import sys as _sys
        _sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "motor-stack"))
        from em_fia_front_kit_case import solve_v_magnet_dimensions  # noqa: PLC0415

        thick, length_mm = solve_v_magnet_dimensions(
            rotor_inner_diameter_mm=ctx.d_gap_mm * 0.76,
            rotor_outer_diameter_mm=ctx.d_gap_mm)
        dim_source = "solve_v_magnet_dimensions (shared with the EM/demag/pocket screens)"
    except Exception:  # noqa: BLE001 — degrade LOUDLY, never silently diverge
        thick, length_mm = 3.0, 14.0
        dim_source = ("LOCAL FALLBACK — shared sizing unavailable; this BoM may "
                      "describe a DIFFERENT magnet from the analyses")

    # BARS, not poles: a V-magnet layout carries TWO bars per pole.
    bars = poles * 2
    vol_cm3 = bars * (thick / 10.0) * (length_mm / 10.0) * (ctx.stack_mm / 10.0)
    mass_kg = vol_cm3 * 7.5 / 1000.0

    # ⭐ AXIAL SEGMENTATION IS A SEPARATE QUANTITY FROM POLE COUNT, and the two
    # were conflated under the name "segments". Eddy loss scales with segment
    # width SQUARED: unsegmented gives ~39 kW on this machine, 4 segments 2.4 kW
    # (more than the copper loss), 8 segments 0.61 kW. It is a hard requirement
    # and it must reach the BoM as its own line item.
    try:
        _sys.path.insert(0, str(Path(__file__).resolve().parent))
        from machine_loss_bounds import magnet_eddy_bound  # noqa: PLC0415

        bound = magnet_eddy_bound(
            ac_flux_amplitude_t=0.0765, stator_slots=ctx.n_slots,
            speed_rpm=ctx.n_rpm,
            magnet_volume_m3=vol_cm3 * 1e-6,
            unsegmented_width_m=length_mm / 1000.0)
        axial_segments = bound.get("minimum_viable_segments")
        eddy_note = bound.get("verdict")
    except Exception:  # noqa: BLE001
        axial_segments, eddy_note = None, "eddy bound unavailable"
    root = PhysicsNode(
        id="permanent_magnet_set",
        name="Permanent Magnet Set",
        parent_id=parent,
        assembly="motor",
        kind="part",
        material_id="NdFeB_N42UH",
        manufacturing=m["manufacturing"],
        special_manufacture=True,
        domains=("magnetic", "thermal", "mechanical", "material", "manufacturing"),
        physics={
            "poles": poles,
            "bars": bars,
            "thickness_mm": round(thick, 3),
            "length_mm": round(length_mm, 3),
            "stack_mm": round(ctx.stack_mm, 2),
            "dimension_source": dim_source,
            "axial_segments_required": axial_segments,
            "axial_segmentation_note": eddy_note,
            "br_t": m["br_t"],
            "hcj_ka_m": m["hcj_ka_m"],
            "volume_cm3": round(vol_cm3, 2),
            "mass_kg": round(mass_kg, 3),
            "max_temp_c": m["max_temp_c"],
            "airgap_b_seed_t": 0.9,
            "rotor_speed_rpm": ctx.n_rpm,
            "peripheral_speed_m_s": round(math.pi * (ctx.d_gap_mm / 1000.0) * ctx.n_rpm / 60.0, 1),
        },
        open_until=("supplier_magnet_grade", "retention_sleeve_FEA", "demag_map"),
    )
    root.children = [
        _leaf(
            "magnet_segment_body",
            "Sintered magnet segment",
            root.id,
            "motor",
            "NdFeB_N42UH",
            ("magnetic", "thermal", "material"),
            {"count": bars, "thickness_mm": round(thick, 3),
             "length_mm": round(length_mm, 3),
             "axial_segments_required": axial_segments},
            special=True,
            open_until=("supplier_magnet_grade",),
        ),
        PhysicsNode(
            id="magnet_retention",
            name="Magnet retention (sleeve/bridge)",
            parent_id=root.id,
            assembly="motor",
            kind="subpart",
            manufacturing="carbon sleeve or IPM bridge (OPEN topology)",
            special_manufacture=True,
            domains=("mechanical", "magnetic", "manufacturing"),
            physics={
                "peripheral_speed_m_s": round(
                    math.pi * (ctx.d_gap_mm / 1000.0) * ctx.n_rpm / 60.0, 1
                ),
                "retention_mode": "OPEN — DEC-006",
            },
            open_until=("DEC-006_magnet_retention",),
        ),
        PhysicsNode(
            id="magnet_coating",
            name="Magnet coating",
            parent_id=root.id,
            assembly="motor",
            kind="process",
            manufacturing="Ni-Cu-Ni electroplate",
            domains=("material", "manufacturing"),
            physics={"purpose": "corrosion + handling"},
        ),
    ]
    return root


def _build_laminations(ctx: FpkContext, parent: str) -> PhysicsNode:
    m = _mat("electrical_steel_M250_35A")
    t_lam = m["lamination_thickness_mm"]
    n_lam = int(math.ceil(ctx.stack_mm / t_lam))
    area = (math.pi / 4.0) * ((ctx.stator_od_mm**2 - ctx.stator_id_mm**2) * 1e-6)
    vol = area * (ctx.stack_mm / 1000.0) * 0.96  # packing
    mass = vol * m["density_kg_m3"]
    f_elec = (ctx.n_rpm / 60.0) * ctx.pole_pairs
    # crude iron loss scale from seed W/kg
    p_fe = mass * m["core_loss_w_kg_at_1t_400hz"] * (f_elec / 400.0) ** 1.5 * (0.9**2)
    root = PhysicsNode(
        id="stator_laminations",
        name="Stator Laminations",
        parent_id=parent,
        assembly="motor",
        kind="part",
        material_id="electrical_steel_M250_35A",
        manufacturing=m["manufacturing"],
        special_manufacture=True,
        domains=("magnetic", "thermal", "electrical", "material", "manufacturing"),
        physics={
            "lamination_thickness_mm": t_lam,
            "lamination_count": n_lam,
            "stack_length_mm": ctx.stack_mm,
            "stator_od_mm": ctx.stator_od_mm,
            "stator_id_mm": ctx.stator_id_mm,
            "stack_mass_kg": round(mass, 3),
            "electrical_frequency_hz": round(f_elec, 1),
            "iron_loss_calc_w": round(p_fe, 1),
            "iron_loss_tool_w": ctx.fe_loss_w,
            "saturation_b_t": m["saturation_b_t"],
        },
        open_until=("FEA_core_loss", "lamination_grade_PO"),
    )
    root.children = [
        _leaf(
            "lamination_sheet",
            "Single lamination sheet",
            root.id,
            "motor",
            "electrical_steel_M250_35A",
            ("magnetic", "material", "manufacturing"),
            {"thickness_mm": t_lam, "count": n_lam},
            special=True,
        ),
        PhysicsNode(
            id="interlaminar_varnish",
            name="Interlaminar insulation varnish",
            parent_id=root.id,
            assembly="motor",
            kind="process",
            manufacturing="C5/C6 coating on electrical steel",
            domains=("electrical", "manufacturing"),
            physics={"purpose": "eddy-current break"},
        ),
    ]
    return root


def _build_cold_plate(
    ctx: FpkContext,
    parent: str,
    thermal: Mapping[str, Any],
) -> PhysicsNode:
    """INTENT: tree nodes consume the canonical P4 network, not duplicate maths."""
    hydraulics = thermal["channel_hydraulics"]
    network = thermal["thermal_network"]
    temperature = thermal["temperature_rise_k"]
    n_ch = int(hydraulics["channel_count"])
    dt = float(temperature["fluid_inlet_to_outlet"])
    r_tim = float(network["tim_rth_k_per_w"])

    root = PhysicsNode(
        id="mcu_cold_plate",
        name="MCU Cold Plate",
        parent_id=parent,
        assembly="mcu",
        kind="part",
        material_id="Al_6061_T6",
        manufacturing="CNC Al cold plate with milled channels + cover braze/friction stir",
        special_manufacture=True,
        domains=("thermal", "fluid", "mechanical", "material", "manufacturing"),
        physics={
            **dict(thermal),
            "heat_load_w": thermal["heat_load_w"],
            "coolant_flow_l_min": ctx.coolant_lpm,
            "coolant_inlet_c": ctx.coolant_in_c,
            "delta_t_fluid_k": dt,
            "outlet_c": round(ctx.coolant_in_c + dt, 2),
            "channel_count": n_ch,
            "channel_width_mm": hydraulics["channel_width_mm"],
            "channel_height_mm": hydraulics["channel_height_mm"],
            "hydraulic_diameter_mm": hydraulics["hydraulic_diameter_mm"],
            "mean_velocity_m_s": hydraulics["mean_velocity_m_s"],
            "reynolds": hydraulics["reynolds"],
            "nusselt": hydraulics["nusselt"],
            "h_conv_w_m2k": network["h_conv_w_m2k"],
            "r_conv_k_w": network["convection_rth_k_per_w"],
            "r_tim_k_w": r_tim,
            "why_geometry": (
                "Channels follow flow, target velocity, and MCU-bay footprint; "
                "TIM + Al land + convection form the analytical source-to-fluid network"
            ),
        },
        open_until=tuple(thermal["open_until"]),
    )
    root.children = [
        PhysicsNode(
            id="cold_plate_channels",
            name="Milled coolant channels",
            parent_id=root.id,
            assembly="mcu",
            kind="subpart",
            domains=("fluid", "thermal", "manufacturing"),
            physics={
                "count": n_ch,
                "width_mm": hydraulics["channel_width_mm"],
                "height_mm": hydraulics["channel_height_mm"],
                "dh_mm": hydraulics["hydraulic_diameter_mm"],
                "reynolds": hydraulics["reynolds"],
                "pressure_drop_pa": hydraulics["pressure_drop_pa"],
            },
            special_manufacture=True,
        ),
        PhysicsNode(
            id="cold_plate_cover",
            name="Cold plate cover",
            parent_id=root.id,
            assembly="mcu",
            kind="subpart",
            material_id="Al_6061_T6",
            manufacturing="friction-stir / braze cover",
            special_manufacture=True,
            domains=("mechanical", "fluid", "manufacturing"),
            physics={"seal": "metal joint + O-ring backup"},
        ),
        _leaf(
            "tim_layer",
            "TIM under modules",
            root.id,
            "mcu",
            "TIM_grease",
            ("thermal", "manufacturing"),
            {
                "r_th_k_w": r_tim,
                "thickness_mm": network["tim_thickness_mm"],
                "conductivity_w_mk": network["tim_conductivity_w_mk"],
            },
            kind="process",
        ),
        _leaf(
            "coolant_fluid",
            "EGW coolant in plate",
            root.id,
            "mcu",
            "EGW_50_50",
            ("fluid", "thermal", "material"),
            {"flow_l_min": ctx.coolant_lpm, "delta_t_k": dt},
            kind="fluid",
        ),
        PhysicsNode(
            id="coolant_port_in",
            name="Coolant Port In",
            parent_id=root.id,
            assembly="mcu",
            kind="part",
            material_id="Al_6061_T6",
            manufacturing="machined boss + O-ring face seal (ICD XYZ OPEN)",
            domains=("fluid", "mechanical", "manufacturing"),
            physics=dict(thermal["ports"][0]),
            open_until=("FIA_port_xyz",),
        ),
        PhysicsNode(
            id="coolant_port_out",
            name="Coolant Port Out",
            parent_id=root.id,
            assembly="mcu",
            kind="part",
            material_id="Al_6061_T6",
            manufacturing="machined boss + O-ring face seal (ICD XYZ OPEN)",
            domains=("fluid", "mechanical", "manufacturing"),
            physics=dict(thermal["ports"][1]),
            open_until=("FIA_port_xyz",),
        ),
    ]
    return root


def _build_dc_link(
    ctx: FpkContext,
    parent: str,
    bus_esl: Mapping[str, Any],
) -> PhysicsNode:
    dv = 0.02 * ctx.v_dc
    c_f = ctx.i_ph_design / (8.0 * ctx.f_sw * max(dv, 1.0))
    c_uf = c_f * 1e6
    each = 220.0
    n = max(4, int(math.ceil(c_uf / each)))
    # ripple current seed ~0.65·I_rms for 3ph PWM order-of-magnitude
    i_ripple = 0.65 * ctx.i_ph_rms
    esr_mohm = 0.8  # per cap seed
    root = PhysicsNode(
        id="dc_link_capacitor_bank",
        name="DC Link Capacitor Bank",
        parent_id=parent,
        assembly="mcu",
        kind="part",
        manufacturing="film capacitor bank on laminated bus (COTS cans + custom bus)",
        special_manufacture=True,
        domains=("electrical", "thermal", "material", "manufacturing"),
        physics={
            "v_dc_v": ctx.v_dc,
            "c_total_uf": round(c_uf, 1),
            "formula": "C≈I/(8·f_sw·ΔV) traction PWM",
            "delta_v_v": round(dv, 2),
            "f_sw_hz": ctx.f_sw,
            "cap_count": n,
            "cap_each_uf": each,
            "ripple_current_a_rms_seed": round(i_ripple, 1),
            "esr_each_mohm": esr_mohm,
            "esl_bus_nh_seed": bus_esl["esl_nh_nominal"],
            "esl_bus_nh_range": bus_esl["esl_nh_range"],
            "esl_provenance": bus_esl["provenance"],
            "i2r_bank_w": round(n * (i_ripple / n) ** 2 * (esr_mohm / 1000.0), 2),
            "why": "Supports DC voltage during PWM current pulses; sizing from ripple ΔV not 50 Hz grid formula",
        },
        open_until=("cap_ripple_datasheet", "bus_ESL_measurement"),
    )
    for i in range(n):
        root.children.append(
            PhysicsNode(
                id=f"dc_link_cap_{i+1}",
                name=f"DC-link film capacitor #{i+1}",
                parent_id=root.id,
                assembly="mcu",
                kind="subpart",
                material_id="film_cap_PP",
                manufacturing="metallised PP film wound can (COTS)",
                domains=("electrical", "thermal", "material"),
                physics={
                    "c_uf": each,
                    "v_rated_v": 900.0,
                    "share_ripple_a": round(i_ripple / n, 2),
                },
            )
        )
    root.children.append(
        _leaf(
            "dc_link_dielectric",
            "PP film dielectric",
            root.id,
            "mcu",
            "film_cap_PP",
            ("electrical", "material"),
            {"role": "energy storage dielectric"},
        )
    )
    discharge_target_v = 60.0
    discharge_time_s = 5.0
    discharge_r_ohm = -discharge_time_s / max(c_f, 1e-12) / math.log(
        discharge_target_v / ctx.v_dc
    )
    root.children.extend(
        [
            PhysicsNode(
                id="discharge_resistor",
                name="DC-link discharge resistor",
                parent_id=root.id,
                assembly="mcu",
                kind="subpart",
                manufacturing="COTS HV pulse resistor on insulated standoff",
                domains=("electrical", "thermal", "material"),
                physics={
                    "resistance_ohm": round(discharge_r_ohm, 1),
                    "initial_power_w": round(ctx.v_dc**2 / discharge_r_ohm, 1),
                    "safe_voltage_v": discharge_target_v,
                    "discharge_time_s": discharge_time_s,
                    "formula": "R = -t/(C*ln(V_safe/V_dc)); P0 = V_dc^2/R",
                },
                open_until=("safety_discharge_test", "resistor_pulse_datasheet"),
            ),
            PhysicsNode(
                id="dc_link_voltage_sense",
                name="DC-link voltage sense divider",
                parent_id=root.id,
                assembly="mcu",
                kind="subpart",
                material_id="FR4",
                manufacturing="series HV resistor ladder + isolated ADC",
                domains=("electrical", "thermal", "material"),
                physics={
                    "input_v": ctx.v_dc,
                    "adc_full_scale_v": 3.3,
                    "divider_ratio": round(3.3 / ctx.v_dc, 7),
                    "formula": "V_adc = V_dc*R_low/(R_high+R_low)",
                },
                open_until=("resistor_voltage_derating", "HIL_DEC-008"),
            ),
        ]
    )
    return root


def _build_busbars(
    ctx: FpkContext,
    parent: str,
    bus_esl: Mapping[str, Any],
) -> list[PhysicsNode]:
    cu = _mat("Cu_ETP")
    j = 5.0  # A/mm² bus seed
    a_dc = (ctx.p_cont_kw * 1000.0 / max(ctx.v_dc, 1.0)) / j  # DC current / j
    i_dc = ctx.p_cont_kw * 1000.0 / max(ctx.v_dc, 1.0)
    a_ph = ctx.i_ph_design / j
    # rectangular bar: thickness 3 mm → width
    t = 3.0
    w_dc = max(10.0, a_dc / t)
    w_ph = max(10.0, a_ph / t)
    nodes = []
    dc = PhysicsNode(
        id="hv_dc_busbar_link",
        name="HV DC Busbar Link (laminated)",
        parent_id=parent,
        assembly="mcu",
        kind="part",
        material_id="Cu_ETP",
        manufacturing="laminated +/− Cu sheets with dielectric; CNC / stamped",
        special_manufacture=True,
        domains=("electrical", "thermal", "magnetic", "material", "manufacturing"),
        physics={
            **dict(bus_esl),
            "v_dc_v": ctx.v_dc,
            "i_dc_a": round(i_dc, 1),
            "section_mm2": round(a_dc, 1),
            "thickness_mm": t,
            "width_mm": round(w_dc, 1),
            "j_a_per_mm2": j,
            "esl_target_nh": bus_esl["esl_nh_nominal"],
            "why_laminated": "Minimise commutation loop inductance between caps and SiC half-bridges",
        },
        open_until=tuple(bus_esl["open_until"]),
    )
    dc.children = [
        _leaf(
            "dc_bus_plus",
            "DC+ copper sheet",
            dc.id,
            "mcu",
            "Cu_ETP",
            ("electrical", "material"),
            {"width_mm": round(w_dc, 1), "thickness_mm": t},
            special=True,
        ),
        _leaf(
            "dc_bus_minus",
            "DC− copper sheet",
            dc.id,
            "mcu",
            "Cu_ETP",
            ("electrical", "material"),
            {"width_mm": round(w_dc, 1), "thickness_mm": t},
            special=True,
        ),
        PhysicsNode(
            id="dc_bus_dielectric",
            name="Bus dielectric laminate",
            parent_id=dc.id,
            assembly="mcu",
            kind="subpart",
            manufacturing="PI / Nomex laminate between +/−",
            domains=("electrical", "manufacturing"),
            physics={"creepage_role": "HV isolation", "v_dc_v": ctx.v_dc},
        ),
    ]
    nodes.append(dc)

    ac = PhysicsNode(
        id="ac_phase_busbar_pierce",
        name="AC Phase Busbar Pierce",
        parent_id=parent,
        assembly="mcu",
        kind="part",
        material_id="Cu_ETP",
        manufacturing="3× Cu bus pierce through cassette into stator terminals",
        special_manufacture=True,
        domains=("electrical", "thermal", "mechanical", "material", "manufacturing"),
        physics={
            "phases": 3,
            "i_ph_design_a": ctx.i_ph_design,
            "section_each_mm2": round(a_ph, 1),
            "thickness_mm": t,
            "width_mm": round(w_ph, 1),
            "j_a_per_mm2": j,
        },
        open_until=("pierce_seal_ICD",),
    )
    for ph in ("u", "v", "w"):
        ac.children.append(
            _leaf(
                f"ac_bus_{ph}",
                f"Phase {ph.upper()} busbar",
                ac.id,
                "mcu",
                "Cu_ETP",
                ("electrical", "thermal", "material"),
                {
                    "current_a": ctx.i_ph_design,
                    "section_mm2": round(a_ph, 1),
                    "resistivity_ohm_m": cu["electrical_resistivity_ohm_m"],
                },
                special=True,
            )
        )
    nodes.append(ac)
    return nodes


def _build_sic_stack(ctx: FpkContext, parent: str) -> PhysicsNode:
    # Loss split seed: 60% switching / 40% conduction at SiC traction
    p_sw = 0.6 * ctx.inv_loss_kw * 1000.0
    p_cond = 0.4 * ctx.inv_loss_kw * 1000.0
    modules = 3  # one per phase half-bridge package seed
    root = PhysicsNode(
        id="sic_power_module_stack",
        name="SiC Power Module Stack",
        parent_id=parent,
        assembly="mcu",
        kind="part",
        manufacturing="purchased SiC half-bridge / six-pack modules on cold plate",
        special_manufacture=False,
        domains=("electrical", "thermal", "magnetic", "material", "manufacturing"),
        physics={
            "module_count": modules,
            "topology": "3× half-bridge (or 1× six-pack)",
            "v_dc_v": ctx.v_dc,
            "i_ph_rms_a": ctx.i_ph_rms,
            "f_sw_hz": ctx.f_sw,
            "loss_on_modules_w": round(ctx.inv_loss_kw * 1000.0, 1),
            "switching_loss_w_seed": round(p_sw, 1),
            "conduction_loss_w_seed": round(p_cond, 1),
            "eta_inv": ctx.eta_inv,
        },
        open_until=("supplier_module_datasheet", "double_pulse_bench"),
    )
    for i in range(modules):
        mod = PhysicsNode(
            id=f"sic_half_bridge_{i+1}",
            name=f"SiC half-bridge module phase {i+1}",
            parent_id=root.id,
            assembly="mcu",
            kind="subpart",
            domains=("electrical", "thermal", "material"),
            physics={
                "switches": 2,
                "v_ds_max_v": 1200.0,
                "i_share_a": round(ctx.i_ph_rms, 1),
                "loss_share_w": round(ctx.inv_loss_kw * 1000.0 / modules, 1),
            },
            open_until=("supplier_module_datasheet",),
        )
        for sw in ("high_side", "low_side"):
            die = PhysicsNode(
                id=f"sic_die_{i+1}_{sw}",
                name=f"SiC MOSFET die ({sw})",
                parent_id=mod.id,
                assembly="mcu",
                kind="subpart",
                material_id="SiC_die",
                manufacturing="module OEM die attach",
                domains=("electrical", "thermal", "material"),
                physics={"role": sw, "technology": "SiC MOSFET"},
            )
            die.children = [
                _leaf(
                    f"sic_crystal_{i+1}_{sw}",
                    "SiC semiconductor",
                    die.id,
                    "mcu",
                    "SiC_die",
                    ("electrical", "thermal", "material"),
                    {},
                )
            ]
            mod.children.append(die)
        mod.children.append(
            _leaf(
                f"aln_substrate_{i+1}",
                "AlN power substrate",
                mod.id,
                "mcu",
                "AlN_substrate",
                ("thermal", "electrical", "material"),
                {},
            )
        )
        mod.children.append(
            PhysicsNode(
                id=f"module_baseplate_{i+1}",
                name="Module baseplate",
                parent_id=mod.id,
                assembly="mcu",
                kind="subpart",
                material_id="Al_6061_T6",
                manufacturing="module OEM Cu/Al baseplate",
                domains=("thermal", "mechanical"),
                physics={"mates_to": "mcu_cold_plate via TIM"},
            )
        )
        root.children.append(mod)
    return root


def _build_gate_drive_pcb(ctx: FpkContext, parent: str) -> PhysicsNode:
    """Channel-true board: 6 gate + 6 desat + isolators + supplies — not a SOIC stub."""
    channels = 6  # 3ph × HS/LS
    root = PhysicsNode(
        id="gate_driver_board",
        name="Gate Driver Board",
        parent_id=parent,
        assembly="mcu",
        kind="part",
        material_id="FR4",
        manufacturing="multilayer FR4; creepage for 750 V DC domain",
        special_manufacture=True,
        domains=("electrical", "thermal", "material", "manufacturing"),
        physics={
            "board_role": "traction_gate_drive",
            "gate_drive_channels_required": channels,
            "desat_channels_required": channels,
            "v_dc_v": ctx.v_dc,
            "f_sw_hz": ctx.f_sw,
            "implemented_channels_today": 0,
            "design_status": "FAIL — forge draft under-implements channels",
        },
        open_until=("HIL_DEC-008", "supplier_gerbers", "channel_implementation"),
    )
    root.children.append(
        _leaf(
            "gdb_fr4",
            "FR4 laminate stackup",
            root.id,
            "mcu",
            "FR4",
            ("electrical", "material", "manufacturing"),
            {"layers_seed": 6, "cu_oz_seed": 2},
            special=True,
        )
    )
    for i in range(channels):
        ch = PhysicsNode(
            id=f"gate_channel_{i+1}",
            name=f"Gate drive channel {i+1}",
            parent_id=root.id,
            assembly="mcu",
            kind="subpart",
            domains=("electrical", "thermal"),
            physics={
                "vgs_on_v": 15.0,
                "vgs_off_v": -3.0,
                "peak_gate_current_a_seed": 10.0,
                "desat_trip_v": 7.0,
            },
            open_until=("channel_implementation",),
        )
        ch.children = [
            PhysicsNode(
                id=f"gate_ic_{i+1}",
                name=f"Isolated gate driver IC #{i+1}",
                parent_id=ch.id,
                assembly="mcu",
                kind="subpart",
                manufacturing="COTS isolated gate driver",
                domains=("electrical",),
                physics={"isolation_v": 5e3, "role": "SiC gate"},
                open_until=("mpn_selection",),
            ),
            PhysicsNode(
                id=f"desat_{i+1}",
                name=f"Desaturation detect #{i+1}",
                parent_id=ch.id,
                assembly="mcu",
                kind="subpart",
                domains=("electrical",),
                physics={"protects": "short-circuit SiC"},
            ),
            PhysicsNode(
                id=f"isolated_dcdc_{i+1}",
                name=f"Isolated DC-DC for gate rails #{i+1}",
                parent_id=ch.id,
                assembly="mcu",
                kind="subpart",
                domains=("electrical", "thermal"),
                physics={"rails_v": "+15/−3", "power_w_seed": 2.0},
            ),
            PhysicsNode(
                id=f"isolator_{i+1}",
                name=f"Reinforced digital isolator #{i+1}",
                parent_id=ch.id,
                assembly="mcu",
                kind="subpart",
                manufacturing="COTS reinforced isolator",
                domains=("electrical", "material"),
                physics={
                    "working_voltage_v": ctx.v_dc,
                    "required_channels": 2,
                    "propagation_delay_ns_seed": 20.0,
                    "formula": "V_work >= V_dc; timing_skew << 1/f_sw",
                },
                open_until=("supplier_isolation_lifetime", "HIL_DEC-008"),
            ),
        ]
        root.children.append(ch)
    return root


def _build_control_pcb(ctx: FpkContext, parent: str) -> PhysicsNode:
    root = PhysicsNode(
        id="oem_inverter_control_board",
        name="OEM Inverter Control Board",
        parent_id=parent,
        assembly="mcu",
        kind="part",
        material_id="FR4",
        manufacturing="multilayer FR4 control PCB",
        special_manufacture=True,
        domains=("electrical", "thermal", "material", "manufacturing"),
        physics={
            "board_role": "traction_control",
            "phase_current_sense_required": 3,
            "resolver_channels_required": 1,
            "vehicle_can_required": 1,
            "mcu_class": "automotive real-time MCU (seed)",
            "pwm_outputs": 6,
            "f_sw_hz": ctx.f_sw,
            "design_status": "FAIL — roles unresolved in forge pipeline",
        },
        open_until=("HIL_DEC-008", "supplier_gerbers", "component_resolution"),
    )
    subs = [
        ("control_mcu", "Real-time MCU", {"cores": "lockstep seed", "adc_channels": 8}),
        ("current_sense_frontend", "Phase current sense front-end ×3", {"sensors": 3, "i_fs_a": ctx.i_ph_design}),
        ("resolver_excitation_demod", "Resolver excite + demod", {"f_excite_hz": 10000.0}),
        ("can_fd_transceiver", "CAN-FD transceiver", {"buses": 1}),
        ("hv_lv_isolation_barrier", "HV/LV digital isolation", {"v_dc_v": ctx.v_dc}),
        ("lv_buck_rails", "LV buck power rails", {"rails_v": "3v3/5v/1v2"}),
    ]
    root.children.append(
        _leaf(
            "ctrl_fr4",
            "FR4 laminate",
            root.id,
            "mcu",
            "FR4",
            ("material", "manufacturing"),
            {"layers_seed": 8},
            special=True,
        )
    )
    for sid, sname, phys in subs:
        root.children.append(
            PhysicsNode(
                id=sid,
                name=sname,
                parent_id=root.id,
                assembly="mcu",
                kind="subpart",
                domains=("electrical",),
                physics=phys,
                open_until=("mpn_selection", "HIL"),
            )
        )
    return root


def _build_motor_mech(ctx: FpkContext, parent: str) -> list[PhysicsNode]:
    omega = ctx.n_rpm * 2.0 * math.pi / 60.0
    shaft_od = max(18.0, 0.35 * math.sqrt(ctx.t_nm))
    # shaft shear stress seed τ = 16T/(πd³)
    d_m = shaft_od / 1000.0
    tau = (16.0 * ctx.t_nm) / (math.pi * max(d_m, 1e-6) ** 3) / 1e6  # MPa
    nodes: list[PhysicsNode] = []

    casing = PhysicsNode(
        id="motor_outer_casing",
        name="Motor Outer Casing",
        parent_id=parent,
        assembly="motor",
        kind="part",
        material_id="Al_ADC12",
        manufacturing="HPDC Al + machine",
        special_manufacture=True,
        domains=("mechanical", "thermal", "material", "manufacturing"),
        physics={"role": "structural + coolant jacket interface", "rotor_rpm": ctx.n_rpm},
    )
    casing.children = [
        _leaf(
            "casing_al",
            "Cast aluminium body",
            casing.id,
            "motor",
            "Al_ADC12",
            ("material", "thermal", "mechanical"),
            {},
            special=True,
        )
    ]
    nodes.append(casing)

    jacket = PhysicsNode(
        id="motor_cooling_jacket",
        name="Motor Cooling Jacket",
        parent_id=parent,
        assembly="motor",
        kind="part",
        material_id="Al_6061_T6",
        manufacturing="cast-in or pressed jacket channels around stator OD",
        special_manufacture=True,
        domains=("thermal", "fluid", "material", "manufacturing"),
        physics={
            "heat_from_stator_w": round(ctx.cu_loss_w + ctx.fe_loss_w, 1),
            "channel_count_seed": 8,
            "coolant": "EGW_50_50",
            "rotor_rpm": ctx.n_rpm,
        },
        open_until=("CFD_jacket",),
    )
    jacket.children = [
        PhysicsNode(
            id="jacket_channels",
            name="Jacket helical/axial channels",
            parent_id=jacket.id,
            assembly="motor",
            kind="subpart",
            domains=("fluid", "thermal"),
            physics={"count": 8, "fluid": "EGW"},
        ),
        _leaf(
            "jacket_coolant",
            "Jacket coolant",
            jacket.id,
            "motor",
            "EGW_50_50",
            ("fluid", "thermal"),
            {"heat_w": round(ctx.cu_loss_w + ctx.fe_loss_w, 1)},
            kind="fluid",
        ),
    ]
    nodes.append(jacket)

    rotor = PhysicsNode(
        id="hollow_rotor_barrel",
        name="Hollow Rotor Barrel",
        parent_id=parent,
        assembly="motor",
        kind="part",
        material_id="electrical_steel_M250_35A",
        manufacturing="laminated IPM rotor + magnet pockets",
        special_manufacture=True,
        domains=("magnetic", "mechanical", "thermal", "material", "manufacturing"),
        physics={
            "od_mm": ctx.d_gap_mm,
            "stack_mm": ctx.stack_mm,
            "rpm": ctx.n_rpm,
            "omega_rad_s": round(omega, 1),
            "tip_speed_m_s": round(math.pi * (ctx.d_gap_mm / 1000.0) * ctx.n_rpm / 60.0, 1),
            "torque_nm": ctx.t_nm,
        },
        open_until=("rotor_burst_FEA",),
    )
    nodes.append(rotor)

    shaft = PhysicsNode(
        id="motor_shaft",
        name="Motor Shaft",
        parent_id=parent,
        assembly="motor",
        kind="part",
        material_id="steel_4340",
        manufacturing="forge + CNC + grind journals",
        special_manufacture=True,
        domains=("mechanical", "material", "manufacturing"),
        physics={
            "od_mm": round(shaft_od, 2),
            "torque_nm": ctx.t_nm,
            "rpm": ctx.n_rpm,
            "shear_stress_mpa_seed": round(tau, 1),
            "hollow": True,
        },
        open_until=("shaft_fatigue",),
    )
    shaft.children = [
        _leaf(
            "shaft_steel",
            "Shaft alloy steel",
            shaft.id,
            "motor",
            "steel_4340",
            ("mechanical", "material"),
            {"od_mm": round(shaft_od, 2)},
            special=True,
        )
    ]
    nodes.append(shaft)

    for bid, bname in (("front_bearing", "Front Bearing"), ("rear_bearing", "Rear Bearing")):
        br = PhysicsNode(
            id=bid,
            name=bname,
            parent_id=parent,
            assembly="motor",
            kind="part",
            material_id="bearing_steel_100Cr6",
            manufacturing="COTS angular-contact / deep-groove",
            domains=("mechanical", "thermal", "material"),
            physics={
                "bore_mm": round(shaft_od + (2.0 if "front" in bid else 0.0), 1),
                "rpm": ctx.n_rpm,
                "dn_seed": round((shaft_od) * ctx.n_rpm, 0),
            },
            open_until=("supplier_L10",),
        )
        br.children = [
            _leaf(
                f"{bid}_steel",
                "Bearing steel races/balls",
                br.id,
                "motor",
                "bearing_steel_100Cr6",
                ("mechanical", "material"),
                {},
            )
        ]
        nodes.append(br)

    for eid, ename in (
        ("front_end_bell", "Front End Bell"),
        ("rear_end_bell", "Rear End Bell"),
        ("motor_cover", "Motor Cover"),
    ):
        nodes.append(
            PhysicsNode(
                id=eid,
                name=ename,
                parent_id=parent,
                assembly="motor",
                kind="part",
                material_id="Al_ADC12",
                manufacturing="cast/CNC Al cover",
                special_manufacture=True,
                domains=("mechanical", "material", "manufacturing"),
                physics={"role": "close volume + bearing seat"},
            )
        )

    for sid, sname, phys in (
        ("resolver", "Resolver", {"type": "VR resolver", "poles_seed": 4, "rpm": ctx.n_rpm}),
        ("encoder", "Encoder", {"type": "optional incremental/absolute", "rpm": ctx.n_rpm}),
        (
            "motor_power_terminals",
            "Motor Power Terminals",
            {"phases": 3, "i_a": ctx.i_ph_design, "mates": "ac_phase_busbar_pierce"},
        ),
    ):
        nodes.append(
            PhysicsNode(
                id=sid,
                name=sname,
                parent_id=parent,
                assembly="motor",
                kind="part",
                manufacturing="COTS / harness interface",
                domains=("electrical", "mechanical"),
                physics=phys,
                open_until=("supplier_ICD",),
            )
        )
    return nodes


def _build_transmission(ctx: FpkContext, parent: str) -> list[PhysicsNode]:
    i = max(2.5, ctx.gear_ratio)
    sun_z = 18
    ring_z = int(round(sun_z * (i - 1.0)))
    while (ring_z - sun_z) % max(ctx.planet_count, 1) != 0 and sun_z < 40:
        sun_z += 1
        ring_z = int(round(sun_z * (i - 1.0)))
    planet_z = max(8, int(round((ring_z - sun_z) / 2.0)))
    m_mod = ctx.ring_id_mm / max(ring_z, 1)
    # pitch line velocity & tooth bending seed (Lewis-ish)
    omega_out = (ctx.n_rpm / i) * 2 * math.pi / 60.0
    t_out = ctx.t_nm * i * 0.97  # η_gear seed
    nodes: list[PhysicsNode] = []

    for hid, hname in (
        ("gearbox_housing", "Gearbox Housing"),
        ("gearbox_cover", "Gearbox Cover"),
    ):
        nodes.append(
            PhysicsNode(
                id=hid,
                name=hname,
                parent_id=parent,
                assembly="transmission",
                kind="part",
                material_id="Al_ADC12",
                manufacturing="HPDC / CNC Al",
                special_manufacture=True,
                domains=("mechanical", "material", "manufacturing"),
                physics={"contains": "planetary + mini-diff + oil"},
            )
        )

    def gear_node(gid: str, gname: str, z: int, count: int = 1) -> PhysicsNode:
        n = PhysicsNode(
            id=gid,
            name=gname,
            parent_id=parent,
            assembly="transmission",
            kind="part",
            material_id="steel_4340",
            manufacturing="hob/shape + case harden + grind (special)",
            special_manufacture=True,
            domains=("mechanical", "material", "manufacturing"),
            physics={
                "teeth": z,
                "module_mm": round(m_mod, 3),
                "count": count,
                "input_rpm": ctx.n_rpm if gid == "sun_gear" else None,
                "gear_ratio": i,
                "torque_nm_seed": round(t_out if "output" in gid or gid == "ring_gear" else ctx.t_nm, 1),
            },
            open_until=("tooth_bending_FEA", "microgeometry"),
        )
        n.children = [
            _leaf(
                f"{gid}_steel",
                "Gear steel",
                n.id,
                "transmission",
                "steel_4340",
                ("mechanical", "material"),
                {"teeth": z, "module_mm": round(m_mod, 3)},
                special=True,
            )
        ]
        return n

    nodes.extend(
        [
            gear_node("sun_gear", "Sun Gear", sun_z),
            gear_node("planet_gears", "Planet Gears", planet_z, ctx.planet_count),
            gear_node("ring_gear", "Ring Gear", ring_z),
        ]
    )
    nodes.append(
        PhysicsNode(
            id="planet_carrier",
            name="Planet Carrier",
            parent_id=parent,
            assembly="transmission",
            kind="part",
            material_id="steel_4340",
            manufacturing="CNC / forge carrier",
            special_manufacture=True,
            domains=("mechanical", "material"),
            physics={"planets": ctx.planet_count, "output_rpm": round(ctx.n_rpm / i, 1)},
        )
    )
    for gid, gname in (
        ("pinion_gear", "Pinion Gear"),
        ("intermediate_shaft", "Intermediate Shaft"),
        ("differential_carrier", "Differential Carrier"),
        ("side_gears", "Side Gears"),
        ("output_gears", "Output Gears"),
        ("output_shaft_left", "Output Shaft Left"),
        ("output_shaft_right", "Output Shaft Right"),
        ("gearbox_bearings", "Gearbox Bearings"),
    ):
        nodes.append(
            PhysicsNode(
                id=gid,
                name=gname,
                parent_id=parent,
                assembly="transmission",
                kind="part",
                material_id="steel_4340" if "bearing" not in gid else "bearing_steel_100Cr6",
                manufacturing="CNC / COTS bearings",
                special_manufacture="bearing" not in gid,
                domains=("mechanical", "material", "manufacturing"),
                physics={
                    "omega_out_rad_s": round(omega_out, 2),
                    "torque_out_nm": round(t_out, 1),
                    "gear_ratio": i,
                },
                open_until=("diff_detail_design",) if "diff" in gid or "side" in gid else ("strength_check",),
            )
        )

    seals = PhysicsNode(
        id="oil_seals",
        name="Oil Seals",
        parent_id=parent,
        assembly="transmission",
        kind="part",
        material_id="FKM_seal",
        manufacturing="COTS lip seals ×6 seed",
        domains=("mechanical", "fluid", "material"),
        physics={"count": 6, "shaft_interfaces": "outputs + input"},
    )
    seals.children = [
        _leaf(
            "fkm_lip",
            "FKM lip elastomer",
            seals.id,
            "transmission",
            "FKM_seal",
            ("material", "mechanical"),
            {"count": 6},
        )
    ]
    nodes.append(seals)

    oil = PhysicsNode(
        id="gear_oil_charge",
        name="Gear Oil Charge",
        parent_id=parent,
        assembly="transmission",
        kind="part",
        material_id="gear_oil_75W90",
        manufacturing="fill",
        domains=("fluid", "thermal", "material"),
        physics={
            "volume_ml": round(max(80.0, 0.15 * (math.pi / 4.0) * (ctx.ring_id_mm**2) * 14.0 / 1000.0), 1),
            "lubrication": "splash/jet seed",
        },
    )
    oil.children = [
        _leaf(
            "oil_fluid",
            "Gear oil fluid",
            oil.id,
            "transmission",
            "gear_oil_75W90",
            ("fluid", "thermal", "material"),
            {},
            kind="fluid",
        )
    ]
    nodes.append(oil)
    return nodes


def _build_mcu_shell(ctx: FpkContext, parent: str) -> list[PhysicsNode]:
    nodes = []
    for pid, name in (
        ("inverter_housing", "Inverter Housing"),
        ("inverter_cover", "Inverter Cover"),
        ("hv_dc_connector", "HV DC Connector"),
        ("lv_signal_connector", "LV Signal Connector"),
    ):
        nodes.append(
            PhysicsNode(
                id=pid,
                name=name,
                parent_id=parent,
                assembly="mcu",
                kind="part",
                material_id="Al_ADC12" if "connector" not in pid else "PA66_GF30",
                manufacturing="CNC/cast Al or moulded connector shell",
                special_manufacture="connector" not in pid,
                domains=("mechanical", "electrical", "material", "manufacturing"),
                physics={
                    "v_dc_v": ctx.v_dc if "hv" in pid or "inverter" in pid else None,
                    "i_dc_a": round(ctx.p_cont_kw * 1000.0 / ctx.v_dc, 1)
                    if "hv" in pid
                    else None,
                },
                open_until=("connector_ICD",) if "connector" in pid else (),
            )
        )
    return nodes


def _build_cassette(ctx: FpkContext, parent: str) -> list[PhysicsNode]:
    nodes = []
    for pid, name in (
        ("traction_drive_housing", "Traction Drive Housing"),
        ("cassette_cover", "Cassette Cover"),
        ("mounting_ear_set", "Mounting Ear Set"),
        ("halfshaft_output_flange_pair", "Halfshaft Output Flange Pair"),
    ):
        nodes.append(
            PhysicsNode(
                id=pid,
                name=name,
                parent_id=parent,
                assembly="cassette",
                kind="part",
                material_id="Al_ADC12" if "flange" not in pid else "steel_4340",
                manufacturing="CNC / cast structural",
                special_manufacture=True,
                domains=("mechanical", "material", "manufacturing"),
                physics={
                    "bay_mass_cap_kg": ctx.bay_mass_cap_kg,
                    "torque_out_nm": round(ctx.t_nm * ctx.gear_ratio * 0.97, 1),
                },
                open_until=("structural_FEA",),
            )
        )
    return nodes


def _derived_node(
    pid: str,
    name: str,
    parent: str,
    assembly: str,
    material_id: Optional[str],
    domains: tuple[str, ...],
    formula: str,
    values: Mapping[str, Any],
    *,
    kind: str = "subpart",
    manufacturing: str = "",
    special: bool = False,
    open_until: tuple[str, ...] = (),
) -> PhysicsNode:
    """Create a deterministic FFF node with an explicit governing relation."""
    return PhysicsNode(
        id=pid,
        name=name,
        parent_id=parent,
        assembly=assembly,
        kind=kind,
        material_id=material_id,
        manufacturing=manufacturing
        or (MATERIALS[material_id]["manufacturing"] if material_id else ""),
        special_manufacture=special,
        domains=domains,
        physics={"formula": formula, **dict(values)},
        open_until=open_until,
    )


def _build_mcu_protection_and_sensing(ctx: FpkContext, parent: str) -> list[PhysicsNode]:
    """Add the safety and sensing leaves forced by HV and coolant physics."""
    coolant = MATERIALS["EGW_50_50"]
    mdot = ctx.coolant_lpm / 60000.0 * coolant["density_kg_m3"]
    outlet_c = ctx.coolant_in_c + ctx.inv_loss_kw * 1000.0 / max(
        mdot * coolant["specific_heat_j_kgk"], 1e-9
    )
    nodes = [
        _derived_node(
            "hvil_loop",
            "High-voltage interlock loop",
            parent,
            "mcu",
            "Cu_OFHC",
            ("electrical", "mechanical", "manufacturing"),
            "V_sense = I_sense*R_loop; open circuit commands torque inhibit",
            {"series_interfaces": 3, "sense_current_ma": 10.0},
            manufacturing="series low-voltage loop through every HV service connector",
            open_until=("vehicle_hvil_ICD", "HIL_DEC-008"),
        ),
        _derived_node(
            "coolant_inlet_ntc",
            "Coolant inlet NTC",
            parent,
            "mcu",
            None,
            ("electrical", "thermal", "fluid"),
            "1/T = 1/T0 + ln(R/R0)/B",
            {
                "temperature_c": ctx.coolant_in_c,
                "nominal_resistance_ohm": 10000.0,
                "beta_k_seed": 3950.0,
            },
            manufacturing="COTS sealed NTC in wetted boss",
            open_until=("sensor_mpn", "calibration"),
        ),
        _derived_node(
            "coolant_outlet_ntc",
            "Coolant outlet NTC",
            parent,
            "mcu",
            None,
            ("electrical", "thermal", "fluid"),
            "T_out = T_in + Q/(m_dot*c_p)",
            {
                "temperature_c": round(outlet_c, 2),
                "mass_flow_kg_s": round(mdot, 5),
                "heat_load_w": ctx.inv_loss_kw * 1000.0,
            },
            manufacturing="COTS sealed NTC in wetted boss",
            open_until=("sensor_mpn", "calibration"),
        ),
        _derived_node(
            "inverter_pressure_sensor",
            "Cold-plate pressure sensor",
            parent,
            "mcu",
            None,
            ("electrical", "fluid", "mechanical"),
            "DeltaP_measured = P_in - P_out",
            {"flow_l_min": ctx.coolant_lpm, "range_bar_seed": 3.0},
            manufacturing="COTS sealed pressure transducer",
            open_until=("pressure_drop_bench", "sensor_mpn"),
        ),
    ]
    nodes.extend(
        [
            _derived_node(
                "emc_gasket",
                "Inverter-cover EMC gasket",
                parent,
                "mcu",
                "conductive_elastomer",
                ("electrical", "mechanical", "material", "manufacturing"),
                "R_bond = rho_contact*perimeter/(compressed_width*thickness)",
                {"v_dc_v": ctx.v_dc, "compression_pct_seed": 25.0},
                open_until=("gasket_supplier_curve", "EMC_IP_test"),
            ),
            _derived_node(
                "module_baseplate_set",
                "Power-module baseplate set",
                parent,
                "mcu",
                "Al_6061_T6",
                ("thermal", "mechanical", "material", "manufacturing"),
                "R_cond = t/(k*A); sigma_warp from CTE mismatch and DeltaT",
                {"count": 3, "heat_load_w": ctx.inv_loss_kw * 1000.0},
                open_until=("module_supplier_stack", "thermomechanical_FEA"),
            ),
        ]
    )
    return nodes


def _build_motor_sensor_detail(ctx: FpkContext, parent: str) -> list[PhysicsNode]:
    """Resolve motor temperature, position and axial-control checklist leaves."""
    f_elec = ctx.n_rpm * ctx.pole_pairs / 60.0
    specs = [
        (
            "motor_resolver",
            "Motor resolver",
            "electrical_steel_M250_35A",
            "theta_e = pole_pairs*theta_m",
            {"rpm": ctx.n_rpm, "electrical_frequency_hz": round(f_elec, 1)},
            ("resolver_mpn", "HIL_DEC-008"),
        ),
        (
            "excitation_coil",
            "Resolver excitation coil",
            "Cu_OFHC",
            "V_exc = N*dPhi/dt",
            {"excitation_hz": 10000.0},
            ("resolver_mpn",),
        ),
        (
            "signal_coils",
            "Resolver sine/cosine coils",
            "Cu_OFHC",
            "V_sin proportional to sin(theta); V_cos proportional to cos(theta)",
            {"channels": 2, "phase_separation_deg": 90.0},
            ("resolver_mpn",),
        ),
        (
            "resolver_rotor",
            "Resolver reluctance rotor",
            "electrical_steel_M250_35A",
            "air-gap permeance Lambda(theta) modulates secondary voltage",
            {"rpm": ctx.n_rpm},
            ("resolver_mpn", "rotor_balance"),
        ),
        (
            "encoder_tone_wheel",
            "Encoder tone wheel",
            "steel_4340",
            "f_signal = n_rpm*N_teeth/60",
            {"tooth_count": 48, "signal_frequency_hz": round(ctx.n_rpm * 48 / 60, 1)},
            ("sensor_architecture", "balance_validation"),
        ),
        (
            "winding_ntc_1",
            "Winding NTC 1",
            None,
            "1/T = 1/T0 + ln(R/R0)/B",
            {"nominal_resistance_ohm": 10000.0, "temp_class_c": 180.0},
            ("sensor_mpn", "impregnation_validation"),
        ),
        (
            "winding_ntc_2",
            "Winding NTC 2",
            None,
            "1/T = 1/T0 + ln(R/R0)/B",
            {"nominal_resistance_ohm": 10000.0, "temp_class_c": 180.0},
            ("sensor_mpn", "impregnation_validation"),
        ),
        (
            "winding_ntc_3",
            "Winding NTC 3",
            None,
            "1/T = 1/T0 + ln(R/R0)/B",
            {
                "nominal_resistance_ohm": 10000.0,
                "temp_class_c": 180.0,
                "phase": "W",
                "provenance": "ANALYTICAL_FROM_ASSUMED_GEOMETRY",
            },
            ("sensor_mpn", "impregnation_validation"),
        ),
        (
            "inverter_module_ntc",
            "Inverter power-module NTC",
            None,
            "T_j ≈ T_ntc + P_loss * R_th_jc_to_ntc",
            {
                "nominal_resistance_ohm": 5000.0,
                "role": "SiC_module_baseplate_sense",
                "provenance": "ANALYTICAL_FROM_ASSUMED_GEOMETRY",
            },
            ("supplier_module_datasheet", "thermal_derating"),
        ),
        (
            "bearing_seat_set",
            "Bearing seat set",
            "Al_ADC12",
            "delta_interference = f(C3_clearance, DeltaT, CTE_Al-CTE_steel)",
            {"bearing_count": 2, "rpm": ctx.n_rpm},
            ("bearing_stack_tolerance", "thermal_fit_analysis"),
        ),
        (
            "bearing_cage_set",
            "Bearing cage set",
            "PA66_GF30",
            "DN = bearing_bore_mm*n_rpm",
            {"count": 2, "rpm": ctx.n_rpm},
            ("bearing_supplier_L10",),
        ),
        (
            "thrust_washer_front",
            "Front thrust washer",
            "bearing_steel_100Cr6",
            "p_bearing = F_axial/A_washer",
            {"shaft_torque_nm": ctx.t_nm},
            ("axial_load_case",),
        ),
        (
            "thrust_washer_rear",
            "Rear thrust washer",
            "bearing_steel_100Cr6",
            "p_bearing = F_axial/A_washer",
            {"shaft_torque_nm": ctx.t_nm},
            ("axial_load_case",),
        ),
    ]
    return [
        _derived_node(
            pid,
            name,
            parent,
            "motor",
            material,
            ("electrical", "magnetic", "mechanical", "thermal", "material"),
            formula,
            values,
            open_until=open_items,
        )
        for pid, name, material, formula, values, open_items in specs
    ]


def _build_transmission_detail(ctx: FpkContext, parent: str) -> list[PhysicsNode]:
    """Represent planetary support, mini-diff, lubrication and service physics."""
    t_out = ctx.t_nm * ctx.gear_ratio * 0.97
    r_mesh_m = max(ctx.ring_id_mm / 2000.0, 0.02)
    f_mesh_n = t_out / r_mesh_m
    specs = [
        ("mini_differential", "Mini differential", "steel_4340", "T_side = T_carrier/2", {"carrier_torque_nm": round(t_out, 1)}, ("diff_bias_requirement", "contact_FEA")),
        ("spider_cross_pin", "Differential spider cross-pin", "steel_4340", "tau = 4*F/(pi*d^2)", {"mesh_force_n": round(f_mesh_n / 2, 1)}, ("diff_load_spectrum", "fatigue_test")),
        ("cross_pin_retainer", "Cross-pin retainer", "spring_steel_51CrV4", "F_retainer > m*r*omega^2", {"carrier_rpm": round(ctx.n_rpm / ctx.gear_ratio, 1)}, ("retention_detail",)),
        ("diff_pinion_gear_set", "Differential pinion gear set", "steel_4340", "F_t = 2*T/(d_pitch*N_pinion)", {"count": 2, "torque_nm": round(t_out, 1)}, ("bevel_tooth_geometry", "contact_FEA")),
        ("spider_pinion_1", "Spider pinion 1", "steel_4340", "F_t = T/(r_pitch*N_pinion)", {"torque_share_nm": round(t_out / 2, 1)}, ("bevel_tooth_geometry",)),
        ("spider_pinion_2", "Spider pinion 2", "steel_4340", "F_t = T/(r_pitch*N_pinion)", {"torque_share_nm": round(t_out / 2, 1)}, ("bevel_tooth_geometry",)),
        ("side_gear_left", "Left side gear", "steel_4340", "tau_spline = 2*T/(N*h*L*d_pitch)", {"torque_nm": round(t_out / 2, 1)}, ("halfshaft_spline_ICD", "fatigue_test")),
        ("side_gear_right", "Right side gear", "steel_4340", "tau_spline = 2*T/(N*h*L*d_pitch)", {"torque_nm": round(t_out / 2, 1)}, ("halfshaft_spline_ICD", "fatigue_test")),
        ("differential_carrier_bearing", "Differential carrier bearing", "bearing_steel_100Cr6", "L10 = (C/P)^p*10^6", {"rpm": round(ctx.n_rpm / ctx.gear_ratio, 1)}, ("bearing_reaction_loads", "supplier_L10")),
        ("carrier_pin_set", "Planet carrier pin set", "steel_4340", "tau_pin = 4*F_mesh/(pi*d_pin^2)", {"count": ctx.planet_count, "mesh_force_n": round(f_mesh_n, 1)}, ("pin_diameter_detail", "fatigue_test")),
        ("planet_needle_bearing_set", "Planet needle-bearing set", "bearing_steel_100Cr6", "L10 = (C/P)^(10/3)*10^6", {"count": ctx.planet_count, "input_rpm": ctx.n_rpm}, ("planet_kinematics", "supplier_L10")),
        ("planet_thrust_washers", "Planet thrust-washer set", "bearing_steel_100Cr6", "PV = F_axial/A_washer * sliding_speed", {"count": 2 * ctx.planet_count}, ("planet_axial_load", "tribology_test")),
        ("input_spline", "Transmission input spline", "steel_4340", "tau_flank = 2*T/(N*h*L*d_pitch)", {"torque_nm": ctx.t_nm}, ("spline_ICD", "fatigue_test")),
        ("input_seal", "Transmission input seal", "FKM_seal", "PV_lip = p_contact*pi*d*n/60", {"input_rpm": ctx.n_rpm}, ("seal_supplier_curve",)),
        ("output_seal_left", "Left output seal", "FKM_seal", "PV_lip = p_contact*pi*d*n/60", {"output_rpm": round(ctx.n_rpm / ctx.gear_ratio, 1)}, ("seal_supplier_curve",)),
        ("output_seal_right", "Right output seal", "FKM_seal", "PV_lip = p_contact*pi*d*n/60", {"output_rpm": round(ctx.n_rpm / ctx.gear_ratio, 1)}, ("seal_supplier_curve",)),
        ("wear_sleeve_left", "Left seal wear sleeve", "bearing_steel_100Cr6", "PV_lip below supplier limit", {"output_rpm": round(ctx.n_rpm / ctx.gear_ratio, 1)}, ("surface_finish_release",)),
        ("wear_sleeve_right", "Right seal wear sleeve", "bearing_steel_100Cr6", "PV_lip below supplier limit", {"output_rpm": round(ctx.n_rpm / ctx.gear_ratio, 1)}, ("surface_finish_release",)),
        ("gearbox_breather", "Gearbox breather", "ePTFE_membrane", "DeltaP/P = DeltaT/T for sealed headspace", {"temperature_swing_k_seed": 100.0}, ("headspace_volume", "supplier_curve")),
        ("fill_plug", "Oil fill plug", "steel_10_9", "F_axial = DeltaP*A_sealed", {"proof_pressure_bar_seed": 2.0}, ("service_thread_ICD",)),
        ("drain_plug", "Oil drain plug", "steel_10_9", "F_axial = DeltaP*A_sealed", {"proof_pressure_bar_seed": 2.0}, ("service_thread_ICD",)),
        ("magnetic_drain_capture", "Magnetic wear-debris capture", "NdFeB_N42UH", "F proportional to B*grad(B)*particle_volume/mu0", {"br_t": MATERIALS["NdFeB_N42UH"]["br_t"]}, ("debris_capture_test",)),
        ("oil_baffle_plate", "Oil baffle plate", "Al_6061_T6", "P_windage proportional to rho*omega^3*r^5", {"output_rpm": round(ctx.n_rpm / ctx.gear_ratio, 1)}, ("oil_churn_CFD",)),
        ("oil_pickup_gallery", "Oil pickup gallery", "Al_ADC12", "A_gallery >= Q_oil/v_target", {"target_velocity_m_s_seed": 1.0}, ("oil_flow_requirement", "oil_churn_CFD")),
        ("mesh_screen", "Oil pickup mesh screen", "stainless_A2_70", "DeltaP = K*rho*v^2/2", {"mesh_micron_seed": 250.0}, ("debris_size_requirement", "flow_bench")),
        ("shim_set", "Transmission shim set", "bearing_steel_100Cr6", "shim = target_preload - tolerance_stack", {"bearing_interfaces": 3}, ("GD&T_stack", "assembly_trials")),
        ("circlip_set", "Transmission circlip set", "spring_steel_51CrV4", "sigma_ring from installed radial deflection", {"retained_interfaces": 3}, ("groove_detail",)),
        ("ring_scraper", "Ring-gear oil scraper", "Al_6061_T6", "Q_redirect proportional to wetted_width*tip_speed*oil_film_thickness", {"output_rpm": round(ctx.n_rpm / ctx.gear_ratio, 1)}, ("oil_churn_CFD",)),
        ("dowel_set", "Gearbox housing dowel set", "bearing_steel_100Cr6", "tau = 4*F_reaction/(N*pi*d^2)", {"count": 2, "reaction_force_n": round(f_mesh_n, 1)}, ("datum_scheme",)),
        ("additive_package", "Gear-oil additive package", "gear_oil_75W90", "treat_rate = f(contact_stress,scuffing_margin,oil_volume)", {"treat_rate_mass_pct_seed": 8.0}, ("oil_supplier_spec", "tribology_test")),
        ("housing_dowel_pins", "Housing alignment dowel pins", "bearing_steel_100Cr6", "tau = 4*F_reaction/(N*pi*d^2)", {"count": 2, "reaction_force_n": round(f_mesh_n, 1)}, ("datum_scheme",)),
        ("housing_gasket", "Gearbox housing gasket", "FKM_seal", "compression = (t_free-t_gland)/t_free", {"compression_pct_seed": 25.0}, ("sealant_strategy", "IP_test")),
        ("drive_gear", "Intermediate-shaft drive gear", "steel_4340", "F_t = 2*T/d_pitch", {"torque_nm": round(t_out, 1)}, ("second_stage_ratio", "tooth_contact_FEA")),
        ("oil_pump", "Gearbox scavenge / jet oil pump", "Al_6061_T6", "P_hyd = DeltaP*Q/eta_pump", {"pressure_bar_seed": 1.5, "flow_l_min_seed": 2.0}, ("lubrication_architecture", "flow_bench")),
        ("shim_pack", "Bearing preload shim pack", "bearing_steel_100Cr6", "t_shim = target_preload_deflection - tolerance_stack", {"interfaces": 3}, ("GD&T_stack", "assembly_trials")),
        ("spacer_ring", "Transmission spacer ring", "bearing_steel_100Cr6", "sigma_c = F_axial/A_ring", {"interfaces": 2}, ("axial_load_case",)),
        ("speed_tone_wheel", "Transmission speed tone wheel", "steel_4340", "f_signal = n_output*N_teeth/60", {"tooth_count": 48, "signal_frequency_hz": round(ctx.n_rpm / ctx.gear_ratio * 48 / 60, 1)}, ("sensor_mpn", "balance_validation")),
        ("planet_1", "Planet gear 1", "steel_4340", "F_t = T/(N_planet*r_sun)", {"index": 1, "torque_share_nm": round(ctx.t_nm / ctx.planet_count, 1)}, ("tooth_contact_FEA",)),
        ("planet_2", "Planet gear 2", "steel_4340", "F_t = T/(N_planet*r_sun)", {"index": 2, "torque_share_nm": round(ctx.t_nm / ctx.planet_count, 1)}, ("tooth_contact_FEA",)),
        ("planet_3", "Planet gear 3", "steel_4340", "F_t = T/(N_planet*r_sun)", {"index": 3, "torque_share_nm": round(ctx.t_nm / ctx.planet_count, 1)}, ("tooth_contact_FEA",)),
        ("front_plate", "Planet-carrier front plate", "steel_4340", "sigma_bend = M*c/I from planet-pin reactions", {"planet_count": ctx.planet_count}, ("carrier_FEA",)),
        ("rear_plate", "Planet-carrier rear plate", "steel_4340", "sigma_bend = M*c/I from planet-pin reactions", {"planet_count": ctx.planet_count}, ("carrier_FEA",)),
        ("pin_set", "Planet pin set", "steel_4340", "tau_pin = 4*F_mesh/(pi*d_pin^2)", {"count": ctx.planet_count, "mesh_force_n": round(f_mesh_n, 1)}, ("pin_diameter_detail", "fatigue_test")),
        ("oil_drillings", "Planet-pin oil drillings", "steel_4340", "DeltaP = f*L/D*rho*v^2/2", {"count": ctx.planet_count, "bore_mm_seed": 1.5}, ("lubrication_flow_requirement", "flow_bench")),
        ("cages", "Planet needle-bearing cages", "PA66_GF30", "DN = bearing_bore_mm*n_planet", {"count": ctx.planet_count}, ("bearing_supplier_L10", "oil_temperature_test")),
        ("retention_interface", "Ring-gear retention interface", "steel_4340", "tau_interface = T/(2*pi*r^2*L)", {"torque_nm": round(t_out, 1)}, ("retention_detail", "fatigue_test")),
    ]
    return [
        _derived_node(
            pid,
            name,
            parent,
            "transmission",
            material,
            ("mechanical", "fluid", "thermal", "material", "manufacturing"),
            formula,
            values,
            special=material in ("steel_4340", "Al_ADC12", "Al_6061_T6"),
            open_until=open_items,
        )
        for pid, name, material, formula, values, open_items in specs
    ]


def _build_joint_hardware(ctx: FpkContext, parent: str) -> list[PhysicsNode]:
    """Turn load paths into deterministic fastener, insert and process leaves."""
    t_out = ctx.t_nm * ctx.gear_ratio * 0.97
    joint_shear_n = t_out / max(ctx.ring_id_mm / 2000.0, 0.04)
    proof_pa = MATERIALS["steel_10_9"]["yield_mpa"] * 1e6
    preload_m6 = 0.70 * proof_pa * 20.1e-6
    preload_m8 = 0.70 * proof_pa * 36.6e-6
    housing_count = max(8, int(math.ceil(joint_shear_n / max(0.2 * preload_m8, 1.0))))
    bolt_specs = [
        ("busbar_bolt_set", "Busbar bolt set", 6, preload_m6, "contact pressure"),
        ("cold_plate_bolt_set", "Cold-plate bolt set", 10, preload_m6, "TIM pressure"),
        ("control_pcb_bolt_set", "Control PCB bolt set", 4, 0.25 * preload_m6, "modal restraint"),
        ("cover_bolt_set", "Cover bolt set", housing_count, preload_m8, "seal compression"),
        ("gate_driver_pcb_bolt_set", "Gate-driver PCB bolt set", 4, 0.25 * preload_m6, "modal restraint"),
        ("ground_lug_bolt", "Ground-lug bolt", 1, preload_m6, "bond pressure"),
        ("harness_clamp_bolt_set", "Harness-clamp bolt set", 6, 0.25 * preload_m6, "loom restraint"),
        ("housing_bolt_set", "Housing bolt set", housing_count, preload_m8, "torque reaction"),
        ("module_bolt_set", "Power-module bolt set", 12, 0.45 * preload_m6, "TIM pressure"),
        ("motor_gearbox_bolt_set", "Motor-to-gearbox bolt set", housing_count, preload_m8, "torque reaction"),
        ("output_bearing_retainer_bolts", "Bearing-retainer bolts", 8, preload_m6, "axial reaction"),
        ("sensor_bolt_set", "Sensor bolt set", 6, 0.20 * preload_m6, "air-gap retention"),
    ]
    nodes = [
        _derived_node(
            pid,
            name,
            parent,
            "cassette",
            "steel_10_9" if preload >= preload_m8 else "stainless_A2_70",
            ("mechanical", "material", "manufacturing"),
            "F_preload = 0.70*sigma_proof*A_t; T = K*F*d",
            {
                "count": count,
                "preload_each_n": round(preload, 0),
                "assembly_torque_nm": round(0.20 * preload * (0.008 if preload >= preload_m8 else 0.006), 1),
                "joint_role": role,
            },
            kind="part",
            open_until=("joint_FEA", "torque_friction_validation"),
        )
        for pid, name, count, preload, role in bolt_specs
    ]
    accessory_specs = [
        ("busbar_belleville_washer_set", "Busbar Belleville washer set", "spring_steel_51CrV4", 6),
        ("conical_spring_washers", "Conical spring washers", "spring_steel_51CrV4", 6),
        ("ground_bond_washer_set", "Ground-bond washer set", "spring_steel_51CrV4", 4),
        ("housing_flat_washer_set", "Housing flat-washer set", "steel_10_9", housing_count),
        ("insulating_washer_set", "Insulating washer set", "PEEK", 8),
        ("module_spring_washer_set", "Module spring-washer set", "spring_steel_51CrV4", 12),
        ("sealing_washer_set", "Sealing washer set", "FKM_seal", 2),
    ]
    nodes.extend(
        _derived_node(
            pid,
            name,
            parent,
            "cassette",
            material,
            ("mechanical", "material", "manufacturing"),
            "washer compliance and bearing pressure derive from parent preload",
            {"count": count},
            open_until=("joint_stack_release",),
        )
        for pid, name, material, count in accessory_specs
    )
    process_specs = [
        ("dowel_pin_motor_gearbox", "Motor-to-gearbox dowels", "bearing_steel_100Cr6", "tau = 4*F/(pi*d^2)", {"count": 2, "shear_load_n": round(joint_shear_n / 2, 1)}),
        ("location_dowels", "Cassette location dowels", "bearing_steel_100Cr6", "tau = 4*F/(N*pi*d^2)", {"count": 2, "shear_load_n": round(joint_shear_n / 2, 1)}),
        ("helicoil_housing_set", "Housing wire-thread insert set", "stainless_A2_70", "L_engage >= F_preload/(pi*d*tau_allow_Al)", {"count": housing_count, "engagement_diameters": 1.5}),
        ("helicoil_set", "General helicoil set", "stainless_A2_70", "L_engage >= F_preload/(pi*d*tau_allow_Al)", {"count": housing_count}),
        ("keylocking_insert_critical", "Critical key-locking inserts", "stainless_A2_70", "F_pullout > 1.5*F_service", {"count": 2}),
        ("torque_class_control", "Fastener torque-class control", None, "T = K*F_preload*d", {"joint_classes": 3}),
        ("tamper_witness_mark", "Torque witness mark", None, "continuity = binary post-assembly inspection state", {"joint_classes": "A/B"}),
        ("threadlocker", "Threadlocking process family", None, "grade = f(temperature,vibration,service torque)", {"selection": "joint-class controlled"}),
        ("threadlocker_medium", "Medium-strength threadlocker", None, "T_breakaway proportional to tau*pi*d*L*r", {"lap_shear_mpa_seed": 15.0}),
        ("threadlocker_high", "High-strength threadlocker", None, "T_breakaway proportional to tau*pi*d*L*r", {"lap_shear_mpa_seed": 25.0}),
    ]
    nodes.extend(
        _derived_node(
            pid,
            name,
            parent,
            "cassette",
            material,
            ("mechanical", "material", "manufacturing"),
            formula,
            values,
            kind="process" if material is None else "part",
            open_until=("assembly_control_plan",),
        )
        for pid, name, material, formula, values in process_specs
    )
    return nodes


def build_fpk_physics_tree(quantities: Mapping[str, Any]) -> PhysicsNode:
    """Full recursive tree for the front FPK."""
    ctx = context_from_quantities(quantities)
    bus_esl, cold_plate_thermal = build_fpk_esl_thermal(quantities)
    root = PhysicsNode(
        id="front_fpk",
        name="Front Powertrain Kit (unitised)",
        parent_id=None,
        assembly="cassette",
        kind="assembly",
        domains=("electrical", "magnetic", "thermal", "fluid", "mechanical", "material", "manufacturing"),
        physics={
            "v_dc_v": ctx.v_dc,
            "i_ph_design_a": ctx.i_ph_design,
            "i_ph_rms_a": ctx.i_ph_rms,
            "p_electrical_kw": ctx.p_cont_kw,
            "p_shaft_kw": ctx.p_shaft_kw,
            "inv_loss_kw": ctx.inv_loss_kw,
            "n_rpm": ctx.n_rpm,
            "t_nm": ctx.t_nm,
            "gear_ratio": ctx.gear_ratio,
            "mass_cap_kg": ctx.bay_mass_cap_kg,
            "method": "bottom-up first principles — analytical seeds",
        },
        open_until=("FIA_homologation", "HIL", "dyno", "supplier_gerbers"),
    )

    mcu = PhysicsNode(
        id="mcu_assembly",
        name="MCU / Traction Inverter Assembly",
        parent_id=root.id,
        assembly="mcu",
        kind="assembly",
        domains=("electrical", "thermal", "fluid", "material", "manufacturing"),
        physics={
            "v_dc_v": ctx.v_dc,
            "loss_kw": ctx.inv_loss_kw,
            "eta": ctx.eta_inv,
            "f_sw_hz": ctx.f_sw,
        },
    )
    mcu.children = (
        _build_mcu_shell(ctx, mcu.id)
        + [_build_cold_plate(ctx, mcu.id, cold_plate_thermal)]
        + [_build_sic_stack(ctx, mcu.id)]
        + [_build_dc_link(ctx, mcu.id, bus_esl)]
        + _build_busbars(ctx, mcu.id, bus_esl)
        + [_build_gate_drive_pcb(ctx, mcu.id)]
        + [_build_control_pcb(ctx, mcu.id)]
        + _build_mcu_protection_and_sensing(ctx, mcu.id)
    )

    motor = PhysicsNode(
        id="motor_assembly",
        name="IPMSM Motor Assembly",
        parent_id=root.id,
        assembly="motor",
        kind="assembly",
        domains=("electrical", "magnetic", "thermal", "fluid", "mechanical", "material"),
        physics={
            "pole_pairs": ctx.pole_pairs,
            "rpm": ctx.n_rpm,
            "torque_nm": ctx.t_nm,
            "shaft_power_kw": ctx.p_shaft_kw,
            "copper_loss_w": ctx.cu_loss_w,
            "iron_loss_w": ctx.fe_loss_w,
        },
    )
    motor.children = (
        [_build_stator_windings(ctx, motor.id)]
        + [_build_laminations(ctx, motor.id)]
        + [_build_magnets(ctx, motor.id)]
        + _build_motor_mech(ctx, motor.id)
        + _build_motor_sensor_detail(ctx, motor.id)
    )

    tx = PhysicsNode(
        id="transmission_assembly",
        name="Planetary + Mini-Diff Transmission",
        parent_id=root.id,
        assembly="transmission",
        kind="assembly",
        domains=("mechanical", "fluid", "thermal", "material"),
        physics={"gear_ratio": ctx.gear_ratio, "input_rpm": ctx.n_rpm},
    )
    tx.children = _build_transmission(ctx, tx.id) + _build_transmission_detail(ctx, tx.id)

    cassette = PhysicsNode(
        id="cassette_assembly",
        name="Unitised Cassette / Bay Interface",
        parent_id=root.id,
        assembly="cassette",
        kind="assembly",
        domains=("mechanical", "material", "manufacturing"),
        physics={"mass_cap_kg": ctx.bay_mass_cap_kg},
    )
    cassette.children = _build_cassette(ctx, cassette.id) + _build_joint_hardware(
        ctx, cassette.id
    )

    root.children = [cassette, mcu, motor, tx]
    _stamp_physics_evidence(root)
    return root


def flatten_tree(node: PhysicsNode) -> list[PhysicsNode]:
    out = [node]
    for c in node.children:
        out.extend(flatten_tree(c))
    return out


def coverage_report(root: PhysicsNode) -> dict[str, Any]:
    nodes = flatten_tree(root)
    leaves = [n for n in nodes if not n.children]
    with_phys = [n for n in nodes if n.physics]
    missing_domain = [
        n.id
        for n in nodes
        if n.kind in ("part", "subpart", "material") and not n.domains
    ]
    open_items: set[str] = set()
    for n in nodes:
        open_items.update(n.open_until)
    by_assembly: dict[str, int] = {}
    for n in nodes:
        by_assembly[n.assembly] = by_assembly.get(n.assembly, 0) + 1
    special = [n.id for n in nodes if n.special_manufacture]
    return {
        "node_count": len(nodes),
        "leaf_count": len(leaves),
        "nodes_with_physics": len(with_phys),
        "physics_coverage_pct": round(100.0 * len(with_phys) / max(len(nodes), 1), 1),
        "missing_domains": missing_domain,
        "open_until": sorted(open_items),
        "by_assembly": by_assembly,
        "special_manufacture_count": len(special),
        "special_manufacture_ids": special[:40],
        "material_ids_used": sorted(
            {n.material_id for n in nodes if n.material_id}
        ),
    }


def extract_quantity_writeback(root: PhysicsNode) -> dict[str, dict[str, Any]]:
    """Promote key leaf/part physics into contract-style quantities."""
    idx = {n.id: n for n in flatten_tree(root)}

    def q(value: Any, unit: str, detail: str, family: str = "dimensionless") -> dict[str, Any]:
        return {
            "value": value,
            "unit": unit,
            "family": family,
            "basis": "rated",
            "scope": "module",
            "source": "calculator",
            "source_detail": detail,
        }

    w = idx["stator_windings"].physics
    c = idx["dc_link_capacitor_bank"].physics
    cp = idx["mcu_cold_plate"].physics
    bus = idx["hv_dc_busbar_link"].physics
    out: dict[str, dict[str, Any]] = {
        "fpk_physics_tree_nodes": q(
            coverage_report(root)["node_count"], "", "recursive physics tree node count"
        ),
        "turns_per_phase": q(w["turns_per_phase"], "", "from winding tree N_ph≈A·π·D/(3·I)"),
        "winding_conductor_area_mm2": q(
            w["conductor_area_mm2"], "mm²", "from J=10 A/mm² × parallel paths", "area"
        ),
        "winding_phase_resistance_ohm": q(
            w["phase_resistance_ohm_20c"], "Ω", "ρ_Cu·ℓ/A at 20 °C", "dimensionless"
        ),
        "winding_copper_mass_kg": q(w["copper_mass_kg"], "kg", "fill×slot×stack×ρ", "mass"),
        "dc_link_capacitance_uf": q(c["c_total_uf"], "µF", c["formula"]),
        "dc_link_ripple_current_a": q(
            c["ripple_current_a_rms_seed"], "A", "≈0.65·I_rms PWM seed"
        ),
        "cold_plate_channel_count": q(cp["channel_count"], "", "parallel channels under modules"),
        "cold_plate_channel_width_mm": q(
            cp["channel_width_mm"], "mm", "from V̇/(n·v) @ 1.5 m/s", "length"
        ),
        "cold_plate_channel_height_mm": q(
            cp["channel_height_mm"], "mm", "aspect 4:1 channel seed", "length"
        ),
        "cold_plate_h_conv_w_m2k": q(
            cp["h_conv_w_m2k"],
            "W/(m²·K)",
            "laminar/Gnielinski transitional bracket on Dh; CFD OPEN",
        ),
        "cold_plate_delta_t_k": q(cp["delta_t_fluid_k"], "K", "Q/(ṁ·cp) on MCU loss"),
        "cold_plate_source_to_inlet_delta_t_k": q(
            cp["temperature_rise_k"]["source_interface_to_inlet"],
            "K",
            "TIM + Al land + convection + half fluid rise; ANALYTICAL only",
        ),
        "cold_plate_pressure_drop_pa": q(
            cp["channel_hydraulics"]["pressure_drop_pa"],
            "Pa",
            "Darcy-Weisbach channel + port minor losses; CFD/bench OPEN",
        ),
        "fpk_bus_esl_nominal_nh": q(
            bus["esl_nh_nominal"],
            "nH",
            "laminated partial inductance + explicit joints/terminals; ANALYTICAL",
        ),
        "fpk_bus_esl_low_nh": q(
            bus["esl_nh_range"][0],
            "nH",
            "lower analytical uncertainty bound",
        ),
        "fpk_bus_esl_high_nh": q(
            bus["esl_nh_range"][1],
            "nH",
            "upper analytical uncertainty bound",
        ),
        "gate_drive_channels_required": q(
            6, "", "3ph × HS/LS — must be implemented on GDB"
        ),
        "copper_electrical_conductivity_s_m": q(
            MATERIALS["Cu_OFHC"]["electrical_conductivity_s_m"],
            "S/m",
            "handbook OFHC Cu @ 20 °C",
        ),
        "ndfeb_br_t": q(MATERIALS["NdFeB_N42UH"]["br_t"], "T", "N42UH-class seed"),
        "fpk_physics_tree_ok": q(
            1.0,
            "",
            "1=recursive tree stamped; OPEN items remain for FEA/HIL/supplier",
        ),
    }
    return out


def render_checklist_md(root: PhysicsNode) -> str:
    cov = coverage_report(root)
    lines = [
        "# FPK recursive first-principles physics tree",
        "",
        f"**Nodes:** {cov['node_count']}  |  **Leaves:** {cov['leaf_count']}  |  "
        f"**Physics coverage:** {cov['physics_coverage_pct']}%",
        f"**Special manufacture nodes:** {cov['special_manufacture_count']}",
        f"**Materials used:** {', '.join(cov['material_ids_used'])}",
        "",
        "## OPEN until",
        "",
    ]
    for o in cov["open_until"]:
        lines.append(f"- `{o}`")
    lines.extend(["", "## Tree (indent = depth)", ""])

    peek_keys = (
        "turns_per_phase",
        "c_total_uf",
        "heat_load_w",
        "channel_width_mm",
        "gate_drive_channels_required",
        "br_t",
        "teeth",
        "phase_resistance_ohm_20c",
        "conductor_area_mm2",
        "i_ph_design_a",
        "density_kg_m3",
        "elements",
    )

    def walk(n: PhysicsNode, depth: int = 0) -> None:
        pad = "  " * depth
        mid = f" [{n.material_id}]" if n.material_id else ""
        dom = ",".join(n.domains[:4])
        peek_bits: list[str] = []
        for k in peek_keys:
            if k in n.physics and n.physics[k] is not None:
                peek_bits.append(f"{k}={n.physics[k]}")
            if len(peek_bits) >= 3:
                break
        peek = f" {{{'; '.join(peek_bits)}}}" if peek_bits else ""
        open_s = f" OPEN:{','.join(n.open_until[:2])}" if n.open_until else ""
        lines.append(f"{pad}- `{n.id}` {n.name}{mid} ({n.kind}; {dom}){peek}{open_s}")
        for c in n.children:
            walk(c, depth + 1)

    walk(root)
    lines.extend(["", "## Winding deep-dive (example of required depth)", ""])
    w = next(n for n in flatten_tree(root) if n.id == "stator_windings").physics
    lines.append(
        f"- slots={w['stator_slots']}, turns/phase=**{w['turns_per_phase']}**, "
        f"wire={w['wire_kind']}, area={w['conductor_area_mm2']} mm², "
        f"R_ph(20°C)={w['phase_resistance_ohm_20c']} Ω, "
        f"Cu mass={w['copper_mass_kg']} kg, "
        f"σ_Cu={MATERIALS['Cu_OFHC']['electrical_conductivity_s_m']:.2e} S/m"
    )
    lines.extend(["", "## Cold plate deep-dive", ""])
    cp = next(n for n in flatten_tree(root) if n.id == "mcu_cold_plate").physics
    lines.append(
        f"- Q={cp['heat_load_w']} W, ΔT={cp['delta_t_fluid_k']} K, "
        f"channels={cp['channel_count']} × {cp['channel_width_mm']}×{cp['channel_height_mm']} mm, "
        f"Dh={cp['hydraulic_diameter_mm']} mm, h≈{cp['h_conv_w_m2k']} W/m²K"
    )
    lines.append(f"- why: {cp['why_geometry']}")
    lines.extend([
        "",
        "## Honesty",
        "",
        "- Analytical / handbook seeds — **not** FEA, HIL, or FIA homologation.",
        "- PCB channel counts required are stated; forge pipeline still implements **0**.",
        "- Density / conductivity from MATERIALS handbook table with provenance.",
        "",
    ])
    return "\n".join(lines)


CHECKLIST_NODE_ALIASES: dict[str, str] = {
    "ac_phase_busbar": "ac_phase_busbar_pierce",
    "phase_u": "ac_bus_u",
    "phase_v": "ac_bus_v",
    "phase_w": "ac_bus_w",
    "aln_substrate_set": "aln_substrate_1",
    "half_bridge_u": "sic_half_bridge_1",
    "half_bridge_v": "sic_half_bridge_2",
    "half_bridge_w": "sic_half_bridge_3",
    "capacitor_element_1": "dc_link_cap_1",
    "capacitor_element_2": "dc_link_cap_2",
    "capacitor_element_3": "dc_link_cap_3",
    "capacitor_element_4": "dc_link_cap_4",
    "channel_1": "gate_channel_1",
    "channel_2": "gate_channel_2",
    "channel_3": "gate_channel_3",
    "channel_4": "gate_channel_4",
    "channel_5": "gate_channel_5",
    "channel_6": "gate_channel_6",
    "motor_encoder": "encoder",
    "mounting_ears": "mounting_ear_set",
    "output_flange_left": "halfshaft_output_flange_pair",
    "output_flange_right": "halfshaft_output_flange_pair",
    "oil_pickup": "oil_pickup_gallery",
    "baffle_set": "oil_baffle_plate",
    "baffles": "oil_baffle_plate",
    "helicoil_set": "helicoil_housing_set",
    "needle_bearing_set": "planet_needle_bearing_set",
    "needle_bearing": "planet_needle_bearing_set",
    "thrust_washer_set": "planet_thrust_washers",
    "cross_pin": "spider_cross_pin",
    "stator": "stator_laminations",
}


def _owner_for_checklist_path(path: str, assembly: str) -> str:
    text = f"{assembly}/{path}".lower()
    if "cool" in text or "oil" in text or "fluid" in text:
        return "Thermal & Fluids"
    if "mcu" in text or "gate" in text or "pcb" in text or "busbar" in text:
        return "Power Electronics & Controls"
    if "motor" in text or "stator" in text or "rotor" in text or "winding" in text:
        return "E-Machine"
    if "transmission" in text or "gear" in text or "differential" in text:
        return "Transmission & Driveline"
    if "fastener" in text or "cassette" in text or "housing" in text:
        return "Mechanical Integration"
    if "harness" in text or "connector" in text or "emc" in text:
        return "HV/LV Harness & EMC"
    return "FPK Systems Engineering"


def _contextual_alias(path: str, terminal: str) -> Optional[str]:
    """Resolve repeated local checklist names without inventing new identities."""
    parts = path.split("/")
    for token in reversed(parts[:-1]):
        if token.startswith("channel_") and terminal in ("isolator", "isolated_dcdc"):
            channel = token.removeprefix("channel_")
            return f"{terminal}_{channel}"
        if token.startswith("half_bridge_") and terminal in ("high_side_die", "low_side_die"):
            phase_to_number = {"u": "1", "v": "2", "w": "3"}
            phase = token.removeprefix("half_bridge_")
            number = phase_to_number.get(phase)
            if number:
                side = "high_side" if terminal == "high_side_die" else "low_side"
                return f"sic_die_{number}_{side}"
    return CHECKLIST_NODE_ALIASES.get(terminal)


def generate_checklist_disposition(
    root: PhysicsNode, checklist_parts: list[Mapping[str, Any]]
) -> dict[str, Any]:
    """Classify every council path without converting unresolved work into closure."""
    tree_nodes = {node.id: node for node in flatten_tree(root)}
    first_path_by_node: dict[str, str] = {}
    entries: list[dict[str, Any]] = []
    counts = {"mapped": 0, "duplicate": 0, "na": 0, "open": 0}

    for item in checklist_parts:
        path = str(item.get("path", "")).strip("/")
        terminal = path.rsplit("/", 1)[-1] if path else ""
        assembly = str(item.get("assembly", ""))
        target = terminal if terminal in tree_nodes else _contextual_alias(path, terminal)
        target = target if target in tree_nodes else None

        if target and target not in first_path_by_node and terminal == target:
            node = tree_nodes[target]
            disposition = "mapped"
            first_path_by_node[target] = path
            entry = {
                "path": path,
                "disposition": disposition,
                "tree_node_ids": [target],
                "evidence": {
                    "provenance": node.physics.get("provenance"),
                    "equation": node.physics.get("equation") or node.physics.get("formula"),
                    "si_units": node.physics.get("si_units"),
                },
            }
        elif target:
            canonical_path = first_path_by_node.setdefault(target, path)
            disposition = "duplicate"
            entry = {
                "path": path,
                "disposition": disposition,
                "canonical_path": canonical_path,
                "tree_node_ids": [target],
                "rationale": (
                    "Council path is a naming/prefix duplicate of the canonical "
                    "deterministic tree node; no second physical part is created."
                ),
            }
        else:
            disposition = "open"
            owner = _owner_for_checklist_path(path, assembly)
            must_derive = str(item.get("must_derive", "")).strip()
            open_until = str(item.get("open_until", "")).strip()
            entry = {
                "path": path,
                "disposition": disposition,
                "owner": owner,
                "rationale": (
                    "Not yet represented by a deterministic terminal tree node. "
                    f"Required derivation: {must_derive or 'define governing load/geometry relation'}. "
                    f"Closure evidence: {open_until or 'named analysis or supplier evidence'}."
                ),
            }
        counts[disposition] += 1
        entries.append(entry)

    classified = sum(counts.values())
    total = len(checklist_parts)
    return {
        "schema": "fpk-checklist-disposition/v1",
        "checklist_paths_total": total,
        "classified_paths": classified,
        "coverage_pct": round(100.0 * classified / max(total, 1), 1),
        "counts": counts,
        "ship_ok": False,
        "race_open_items_closed": 0,
        "honesty": (
            "Disposition coverage means every council path was triaged; it does not "
            "mean every part is designed or validated. OPEN remains OPEN."
        ),
        "entries": entries,
    }


def _selftest() -> None:
    q = {
        "dc_bus_voltage_v": 750,
        "phase_current_design_a": 535,
        "ac_rms_current_a": 381,
        "continuous_power_kw": 250,
        "mgu_shaft_power_kw": 244,
        "inverter_dissipated_kw": 4.3,
        "mgu_copper_loss_w": 2180,
        "mgu_iron_loss_w": 136,
        "inverter_efficiency": 0.987,
        "switching_freq_hz": 20000,
        "mgu_base_speed_rpm": 19500,
        "mgu_shaft_torque_nm": 120,
        "pole_pairs": 4,
        "rotor_airgap_diameter_mm": 122,
        "stack_length_mm": 98,
        "fpk_stator_od_mm": 165,
        "fpk_stator_id_mm": 123.4,
        "coolant_flow_l_min": 12,
        "coolant_inlet_c": 60,
        "gear_ratio": 8,
        "fpk_planet_count": 3,
        "fpk_ring_id_mm": 89,
        "fpk_mass_cap_kg": 32,
    }
    root = build_fpk_physics_tree(q)
    cov = coverage_report(root)
    assert cov["node_count"] >= 250, cov["node_count"]
    assert cov["physics_coverage_pct"] >= 95.0, cov
    assert not cov["missing_domains"], cov["missing_domains"]
    ids = {n.id for n in flatten_tree(root)}
    assert len(ids) == cov["node_count"], "physics node ids must be globally unique"
    for must in (
        "stator_windings",
        "copper_core_u",
        "enamel_u",
        "dc_link_capacitor_bank",
        "mcu_cold_plate",
        "cold_plate_channels",
        "sic_power_module_stack",
        "sic_die_1_high_side",
        "gate_driver_board",
        "gate_channel_1",
        "oem_inverter_control_board",
        "control_mcu",
        "permanent_magnet_set",
        "sun_gear",
        "hv_dc_busbar_link",
        "ac_phase_busbar_pierce",
        "busbar_bolt_set",
        "housing_bolt_set",
        "hvil_loop",
        "dc_link_voltage_sense",
        "winding_ntc_1",
        "mini_differential",
        "spider_cross_pin",
        "planet_needle_bearing_set",
        "gearbox_breather",
        "magnetic_drain_capture",
        "emc_gasket",
        "module_baseplate_set",
        "location_dowels",
        "planet_1",
        "planet_2",
        "planet_3",
        "oil_pump",
        "ring_scraper",
        "speed_tone_wheel",
        "oil_drillings",
    ):
        assert must in ids, must
    for leaf in (n for n in flatten_tree(root) if not n.children):
        assert leaf.physics["provenance"] in (
            "ANALYTICAL_FROM_ASSUMED_GEOMETRY",
            "PEER_LITERATURE",
        ), leaf.id
        assert leaf.physics["equation"], leaf.id
        assert leaf.physics["si_units"], leaf.id
        assert leaf.physics["assumptions"], leaf.id
        assert leaf.physics["uncertainty"], leaf.id
    w = next(n for n in flatten_tree(root) if n.id == "stator_windings").physics
    assert w["turns_per_phase"] >= 4
    assert w["conductor_area_mm2"] > 0
    assert w["phase_resistance_ohm_20c"] > 0
    cp = next(n for n in flatten_tree(root) if n.id == "mcu_cold_plate").physics
    assert cp["channel_count"] >= 4
    assert cp["delta_t_fluid_k"] > 0
    wb = extract_quantity_writeback(root)
    assert "turns_per_phase" in wb and "cold_plate_h_conv_w_m2k" in wb
    assert wb["fpk_bus_esl_low_nh"]["value"] < wb["fpk_bus_esl_nominal_nh"]["value"]
    assert wb["fpk_bus_esl_high_nh"]["value"] > wb["fpk_bus_esl_nominal_nh"]["value"]
    assert wb["cold_plate_source_to_inlet_delta_t_k"]["value"] > cp["delta_t_fluid_k"]
    md = render_checklist_md(root)
    assert "turns/phase" in md
    disposition = generate_checklist_disposition(
        root,
        [
            {"path": "mcu/hv_dc_busbar_link", "assembly": "mcu"},
            {"path": "front_fpk/mcu_assembly/ac_phase_busbar", "assembly": "mcu"},
            {
                "path": "front_fpk/transmission/unknown_race_item",
                "assembly": "transmission",
                "must_derive": "supplier geometry",
                "open_until": "supplier",
            },
        ],
    )
    assert disposition["coverage_pct"] == 100.0
    assert sum(disposition["counts"].values()) == disposition["checklist_paths_total"]
    assert disposition["counts"]["open"] == 1
    assert disposition["entries"][2]["owner"] == "Transmission & Driveline"
    assert disposition["ship_ok"] is False
    assert disposition["race_open_items_closed"] == 0
    json.dumps(root.to_dict())
    print(
        f"fpk_physics_tree selftest OK — nodes={cov['node_count']} "
        f"leaves={cov['leaf_count']} coverage={cov['physics_coverage_pct']}% "
        f"turns/ph={w['turns_per_phase']} "
        f"C={next(n for n in flatten_tree(root) if n.id=='dc_link_capacitor_bank').physics['c_total_uf']}µF"
    )


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    print("Usage: python3 scripts/lib/fpk_physics_tree.py --selftest")
    sys.exit(2)
