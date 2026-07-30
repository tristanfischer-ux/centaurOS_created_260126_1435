#!/usr/bin/env python3
"""Front FPK — part ontology + first-principles physics seeds (PHANTM bar).

INTENT (2026-07-29 Tristan): a HoT-grade FPK is not a shelf+blob. Every MCU /
motor / transmission cover, board, winding, magnet, gear, bearing, seal needs
an identity AND a first-principles quantity (turns, C_dc, teeth, …) before
optimisation. This module is the SOURCE checklist + seed maths.

DECISION: analytical seeds only — FEA / dyno / supplier ICD replace. Never claim
homologated. Lucid = FFF training check only.

Run: python3 scripts/lib/fpk_first_principles.py --selftest
"""
from __future__ import annotations

import math
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Mapping, Optional


# ── Part ontology (Tristan list + concentric FPK grammar) ─────────────────────
# assembly → ordered part ids. Covers + housings explicit — "cover on everything".

FPK_MCU_PARTS: list[tuple[str, str]] = [
    ("inverter_housing", "Inverter Housing"),
    ("inverter_cover", "Inverter Cover"),
    ("mcu_cold_plate", "Mcu Cold Plate"),  # alias of existing seat
    ("sic_power_module_stack", "SiC Power Module Stack"),
    ("dc_link_capacitor_bank", "DC Link Capacitor Bank"),
    ("hv_dc_busbar_link", "Hv DC Busbar Link"),
    ("ac_phase_busbar_pierce", "Ac Phase Busbar Pierce"),
    ("gate_driver_board", "Gate Driver Board"),
    ("oem_inverter_control_board", "Oem Inverter Control Board"),
    ("hv_dc_connector", "Hv DC Connector"),
    ("lv_signal_connector", "Lv Signal Connector"),
    ("coolant_port_in", "Coolant Port In"),
    ("coolant_port_out", "Coolant Port Out"),
]

FPK_MOTOR_PARTS: list[tuple[str, str]] = [
    ("motor_outer_casing", "Motor Outer Casing"),
    ("motor_cooling_jacket", "Motor Cooling Jacket"),
    ("stator_laminations", "Stator Laminations"),
    ("stator_windings", "Stator Windings"),
    ("permanent_magnet_set", "Permanent Magnet Set"),
    ("hollow_rotor_barrel", "Hollow Rotor Barrel"),
    ("motor_shaft", "Motor Shaft"),
    ("front_bearing", "Front Bearing"),
    ("rear_bearing", "Rear Bearing"),
    ("front_end_bell", "Front End Bell"),
    ("rear_end_bell", "Rear End Bell"),
    ("resolver", "Resolver"),
    ("encoder", "Encoder"),
    ("motor_power_terminals", "Motor Power Terminals"),
    ("motor_cover", "Motor Cover"),
]

FPK_TRANSMISSION_PARTS: list[tuple[str, str]] = [
    ("gearbox_housing", "Gearbox Housing"),
    ("gearbox_cover", "Gearbox Cover"),
    ("sun_gear", "Sun Gear"),
    ("planet_gears", "Planet Gears"),
    ("ring_gear", "Ring Gear"),
    ("planet_carrier", "Planet Carrier"),
    ("pinion_gear", "Pinion Gear"),
    ("intermediate_shaft", "Intermediate Shaft"),
    ("differential_carrier", "Differential Carrier"),
    ("side_gears", "Side Gears"),
    ("output_gears", "Output Gears"),
    ("output_shaft_left", "Output Shaft Left"),
    ("output_shaft_right", "Output Shaft Right"),
    ("gearbox_bearings", "Gearbox Bearings"),
    ("oil_seals", "Oil Seals"),
    ("gear_oil_charge", "Gear Oil Charge"),
]

FPK_CASSETTE_PARTS: list[tuple[str, str]] = [
    ("traction_drive_housing", "Traction Drive Housing"),
    ("cassette_cover", "Cassette Cover"),
    ("mounting_ear_set", "Mounting Ear Set"),
    ("halfshaft_output_flange_pair", "Halfshaft Output Flange Pair"),
]


def all_fpk_parts() -> list[tuple[str, str, str]]:
    """(assembly, id, name_human)."""
    out: list[tuple[str, str, str]] = []
    for pid, name in FPK_MCU_PARTS:
        out.append(("mcu", pid, name))
    for pid, name in FPK_MOTOR_PARTS:
        out.append(("motor", pid, name))
    for pid, name in FPK_TRANSMISSION_PARTS:
        out.append(("transmission", pid, name))
    for pid, name in FPK_CASSETTE_PARTS:
        out.append(("cassette", pid, name))
    return out


def _num(q: Mapping[str, Any], *keys: str, default: float = 0.0) -> float:
    for k in keys:
        raw = q.get(k)
        if isinstance(raw, dict):
            raw = raw.get("value")
        try:
            v = float(raw)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        if math.isfinite(v) and v > 0:
            return v
    return default


@dataclass(frozen=True)
class FpkPhysicsSeeds:
    """First-principles seeds — analytical, replace with FEA/dyno."""

    # EM
    pole_pairs: int
    stator_slots: int
    slots_per_pole_per_phase: float
    turns_per_phase: int
    turns_per_coil: int
    parallel_paths: int
    conductor_od_mm: float
    copper_fill_factor: float
    winding_copper_mass_kg: float
    magnet_segments: int
    magnet_grade: str
    magnet_br_t: float
    magnet_volume_cm3: float
    magnet_mass_kg: float
    airgap_b_t: float
    electric_loading_a_per_m: float
    electrical_frequency_hz: float
    current_density_a_per_mm2: float

    # Inverter
    switching_freq_hz: float
    dc_link_capacitance_uf: float
    dc_link_cap_count: int
    dc_link_cap_each_uf: float
    busbar_section_mm: float
    sic_module_count: int
    phase_current_design_a: float

    # Mechanical motor
    shaft_od_mm: float
    front_bearing_bore_mm: float
    rear_bearing_bore_mm: float
    jacket_channel_count: int

    # Transmission
    gear_ratio: float
    sun_teeth: int
    planet_teeth: int
    ring_teeth: int
    planet_count: int
    gear_module_mm: float
    gear_face_mm: float
    oil_volume_ml: float
    seal_count: int

    notes: tuple[str, ...] = field(default_factory=tuple)
    open_until: tuple[str, ...] = field(default_factory=tuple)


def derive_physics(quantities: Mapping[str, Any]) -> FpkPhysicsSeeds:
    """Seed maths from contract / tool quantities (no FEA).

    EM path (concept IPMSM):
      T ≈ (π/2)·Bg·A·D²·L·kw  (already used upstream for D,L)
      slots = 3 · pole_pairs · q   (q = 2 integer-slot)
      turns from electric loading: A ≈ (3·N_ph·I) / (π·D) → N_ph
      magnets: 2·pole_pairs segments (V-shaped IPM pair per pole later)

    Inverter DC link (3-ph PWM ripple seed, NOT grid 50 Hz formula):
      C ≈ I_ph / (8 · f_sw · ΔV) with ΔV = 2% of Vdc
    """
    notes: list[str] = []
    open_until = (
        "dyno_correlation",
        "supplier_magnet_grade",
        "FEA_em_thermal",
        "supplier_bearing_life",
        "gear_microgeometry",
    )

    d_mm = _num(quantities, "rotor_airgap_diameter_mm", "fpk_rotor_od_mm", default=122.0)
    stack_mm = _num(quantities, "stack_length_mm", "fpk_housing_len_mm", default=98.0)
    t_nm = _num(quantities, "mgu_shaft_torque_nm", default=120.0)
    n_rpm = _num(quantities, "mgu_base_speed_rpm", "max_rotor_speed_rpm", default=19500.0)
    i_ph = _num(quantities, "phase_current_design_a", "phase_current_max_a", default=535.0)
    v_dc = _num(quantities, "dc_bus_voltage_v", "assumed_vdc_nom_v", default=750.0)
    gear_ratio = _num(quantities, "gear_ratio", default=8.0)
    planet_count = int(_num(quantities, "fpk_planet_count", default=3.0))
    ring_id = _num(quantities, "fpk_ring_id_mm", default=89.0)
    gear_face = _num(quantities, "fpk_gear_face_mm", default=14.0)
    if gear_face < 10:
        gear_face = max(14.0, stack_mm * 0.15)

    pole_pairs = int(_num(quantities, "pole_pairs", default=4.0))
    q_spp = 2.0  # slots/pole/phase — integer-slot seed
    slots = int(3 * pole_pairs * q_spp)
    bg = _num(quantities, "airgap_b_t", default=0.9)
    a_rms = _num(quantities, "electric_loading_a_per_m", default=60000.0)
    d_m = d_mm / 1000.0
    # A ≈ 3·N_ph·I_rms / (π·D)  →  N_ph ≈ A·π·D / (3·I)
    turns_ph = max(4, int(round((a_rms * math.pi * d_m) / (3.0 * max(i_ph, 1.0)))))
    # coils ≈ slots/2 for double-layer; turns/coil
    coils = max(1, slots // 2)
    turns_coil = max(1, int(round(turns_ph * 3 / coils)))  # 3 phases share coil set rough
    parallel = 2 if i_ph > 300 else 1
    # conductor from J ≈ 8–12 A/mm² peak race; use 10
    j = 10.0
    a_cu = i_ph / (j * parallel)
    cond_od = max(0.8, min(4.0, 2.0 * math.sqrt(a_cu / math.pi)))
    fill = 0.42
    # copper volume ≈ fill × slot area × stack; slot area rough (stator build)
    stator_od = _num(quantities, "fpk_stator_od_mm", default=d_mm * 1.35)
    stator_id = _num(quantities, "fpk_stator_id_mm", default=d_mm + 1.4)
    tooth_area = max(1e-6, (math.pi / 4.0) * ((stator_od**2 - stator_id**2) * 1e-6) * 0.35)
    cu_vol_m3 = fill * tooth_area * (stack_mm / 1000.0)
    cu_mass = cu_vol_m3 * 8960.0

    magnet_segments = 2 * pole_pairs  # one V-pair per pole seed
    br = 1.28  # NdFeB N42UH-class remnant (seed)
    # magnet volume: rim band ~3 mm thick × 60% of stack × pole arc
    mag_thick = 3.0
    mag_vol_cm3 = (
        math.pi * (d_mm / 10.0) * (mag_thick / 10.0) * (stack_mm / 10.0) * 0.55
    )
    mag_mass = mag_vol_cm3 * 7.5 / 1000.0  # ~7.5 g/cm³
    f_elec = (n_rpm / 60.0) * pole_pairs

    # Traction DC-link (PWM): C = I / (8 f_sw ΔV)
    f_sw = 20000.0
    dv = 0.02 * v_dc
    c_f = i_ph / (8.0 * f_sw * max(dv, 1.0))
    c_uf = c_f * 1e6
    cap_each = 220.0  # µF film/electrolytic class seed
    cap_n = max(4, int(math.ceil(c_uf / cap_each)))
    bus = max(8.0, min(16.0, math.sqrt(i_ph / 5.0)))

    shaft = _num(quantities, "fpk_shaft_od_mm", default=max(18.0, 0.35 * math.sqrt(t_nm)))
    brg_f = max(12.0, shaft + 2.0)
    brg_r = max(12.0, shaft)

    # Planetary teeth: i ≈ 1 + R/S → R/S = i−1; pick even sun teeth
    i = max(2.5, gear_ratio)
    sun_z = 18
    ring_z = int(round(sun_z * (i - 1.0)))
    # ensure ring − sun divisible by planet count for assembly
    while (ring_z - sun_z) % max(planet_count, 1) != 0 and sun_z < 40:
        sun_z += 1
        ring_z = int(round(sun_z * (i - 1.0)))
    planet_z = max(8, int(round((ring_z - sun_z) / 2.0)))
    # module from pitch diameter ≈ ring_id
    m_mod = ring_id / max(ring_z, 1)
    oil_ml = max(80.0, 0.15 * (math.pi / 4.0) * (ring_id**2) * gear_face / 1000.0)

    notes.append(
        f"turns_per_phase from A·π·D/(3·I): A={a_rms:.0f} A/m, D={d_mm:.1f} mm, I={i_ph:.0f} A"
    )
    notes.append(
        f"DC-link C=I/(8·fsw·ΔV): {c_uf:.0f} µF @ fsw={f_sw:.0f} Hz, ΔV={dv:.1f} V"
    )
    notes.append(
        f"planetary teeth S/P/R={sun_z}/{planet_z}/{ring_z} for i≈{i:.2f} (assembly check)"
    )

    return FpkPhysicsSeeds(
        pole_pairs=pole_pairs,
        stator_slots=slots,
        slots_per_pole_per_phase=q_spp,
        turns_per_phase=turns_ph,
        turns_per_coil=turns_coil,
        parallel_paths=parallel,
        conductor_od_mm=round(cond_od, 2),
        copper_fill_factor=fill,
        winding_copper_mass_kg=round(cu_mass, 3),
        magnet_segments=magnet_segments,
        magnet_grade="NdFeB-N42UH-class (seed — supplier OPEN)",
        magnet_br_t=br,
        magnet_volume_cm3=round(mag_vol_cm3, 2),
        magnet_mass_kg=round(mag_mass, 3),
        airgap_b_t=bg,
        electric_loading_a_per_m=a_rms,
        electrical_frequency_hz=round(f_elec, 1),
        current_density_a_per_mm2=j,
        switching_freq_hz=f_sw,
        dc_link_capacitance_uf=round(c_uf, 1),
        dc_link_cap_count=cap_n,
        dc_link_cap_each_uf=cap_each,
        busbar_section_mm=round(bus, 1),
        sic_module_count=3,  # 3-ph half-bridge seed (or 6-pack)
        phase_current_design_a=i_ph,
        shaft_od_mm=round(shaft, 1),
        front_bearing_bore_mm=round(brg_f, 1),
        rear_bearing_bore_mm=round(brg_r, 1),
        jacket_channel_count=8,
        gear_ratio=gear_ratio,
        sun_teeth=sun_z,
        planet_teeth=planet_z,
        ring_teeth=ring_z,
        planet_count=planet_count,
        gear_module_mm=round(m_mod, 3),
        gear_face_mm=round(gear_face, 1),
        oil_volume_ml=round(oil_ml, 1),
        seal_count=6,
        notes=tuple(notes),
        open_until=open_until,
    )


def physics_quantity_writeback(p: FpkPhysicsSeeds) -> dict[str, dict[str, Any]]:
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

    return {
        "pole_pairs": q(p.pole_pairs, "", "IPMSM pole-pairs seed (tool/default)"),
        "stator_slots": q(p.stator_slots, "", f"3·p·q with q={p.slots_per_pole_per_phase}"),
        "turns_per_phase": q(
            p.turns_per_phase, "",
            "N_ph ≈ A·π·D/(3·I) from electric loading (FEA replaces)",
        ),
        "turns_per_coil": q(p.turns_per_coil, "", "double-layer coil seed from slots"),
        "winding_parallel_paths": q(p.parallel_paths, "", "parallel paths for phase current"),
        "winding_conductor_od_mm": q(p.conductor_od_mm, "mm", f"from J={p.current_density_a_per_mm2} A/mm²", "length"),
        "winding_copper_fill_factor": q(p.copper_fill_factor, "", "slot copper fill seed"),
        "winding_copper_mass_kg": q(p.winding_copper_mass_kg, "kg", "fill×slot area×stack×ρ_Cu", "mass"),
        "magnet_segments": q(p.magnet_segments, "", "2·pole_pairs V-pair seed"),
        "magnet_br_t": q(p.magnet_br_t, "T", p.magnet_grade, "dimensionless"),
        "magnet_volume_cm3": q(p.magnet_volume_cm3, "cm³", "rim-band volume seed", "volume"),
        "magnet_mass_kg": q(p.magnet_mass_kg, "kg", "NdFeB density seed", "mass"),
        "airgap_b_t": q(p.airgap_b_t, "T", "air-gap flux density seed"),
        "electric_loading_a_per_m": q(p.electric_loading_a_per_m, "A/m", "electric loading seed"),
        "electrical_frequency_hz": q(p.electrical_frequency_hz, "Hz", "f = n/60 · pole_pairs"),
        "switching_freq_hz": q(p.switching_freq_hz, "Hz", "SiC PWM seed"),
        "dc_link_capacitance_uf": q(
            p.dc_link_capacitance_uf, "µF",
            "traction C≈I/(8·fsw·ΔV) — NOT grid 50 Hz formula",
        ),
        "dc_link_cap_count": q(p.dc_link_cap_count, "", f"×{p.dc_link_cap_each_uf} µF each"),
        "sic_module_count": q(p.sic_module_count, "", "3-ph power module stack seed"),
        "sun_teeth": q(p.sun_teeth, "", "planetary sun tooth count"),
        "planet_teeth": q(p.planet_teeth, "", "planet tooth count"),
        "ring_teeth": q(p.ring_teeth, "", "ring tooth count"),
        "gear_module_mm": q(p.gear_module_mm, "mm", "m = d_ring / z_ring", "length"),
        "gear_oil_volume_ml": q(p.oil_volume_ml, "ml", "splash/jet charge seed", "volume"),
        "front_bearing_bore_mm": q(p.front_bearing_bore_mm, "mm", "from shaft OD", "length"),
        "rear_bearing_bore_mm": q(p.rear_bearing_bore_mm, "mm", "from shaft OD", "length"),
        "fpk_parts_physics_ok": q(
            1.0, "",
            "1=first-principles seeds stamped; OPEN: " + ",".join(p.open_until),
        ),
    }


def part_engineering_basis(part_id: str, p: FpkPhysicsSeeds) -> str:
    """Human-readable engineering string for BoM form/sizing_basis."""
    table = {
        "stator_windings": (
            f"{p.stator_slots} slots, {p.turns_per_phase} turns/phase, "
            f"{p.parallel_paths} parallel, conductor Ø{p.conductor_od_mm} mm, "
            f"Cu≈{p.winding_copper_mass_kg} kg, fill={p.copper_fill_factor}"
        ),
        "stator_laminations": (
            f"{p.stator_slots}-slot stack, pole_pairs={p.pole_pairs}, "
            f"f_elec≈{p.electrical_frequency_hz} Hz"
        ),
        "permanent_magnet_set": (
            f"{p.magnet_segments} segments, {p.magnet_grade}, Br≈{p.magnet_br_t} T, "
            f"V≈{p.magnet_volume_cm3} cm³, m≈{p.magnet_mass_kg} kg — retention OPEN (DEC-006)"
        ),
        "hollow_rotor_barrel": (
            f"hosts planetary nest; tip-speed / hoop from rotor tools — retention OPEN"
        ),
        "dc_link_capacitor_bank": (
            f"C_total≈{p.dc_link_capacitance_uf} µF = {p.dc_link_cap_count}×"
            f"{p.dc_link_cap_each_uf} µF; f_sw={p.switching_freq_hz:.0f} Hz"
        ),
        "sic_power_module_stack": (
            f"{p.sic_module_count}-ph SiC stack, I_ph,design={p.phase_current_design_a:.0f} A"
        ),
        "ac_phase_busbar_pierce": (
            f"3× Cu busbars, section≈{p.busbar_section_mm} mm (≈5 A/mm² seed)"
        ),
        "hv_dc_busbar_link": f"HV DC bus section seed ≈{p.busbar_section_mm} mm",
        "sun_gear": f"Z={p.sun_teeth}, m={p.gear_module_mm} mm, face={p.gear_face_mm} mm",
        "planet_gears": (
            f"{p.planet_count}× Z={p.planet_teeth}, m={p.gear_module_mm} mm"
        ),
        "ring_gear": f"Z={p.ring_teeth}, m={p.gear_module_mm} mm (fixed ring seed)",
        "front_bearing": f"bore≈{p.front_bearing_bore_mm} mm (life calc OPEN)",
        "rear_bearing": f"bore≈{p.rear_bearing_bore_mm} mm (life calc OPEN)",
        "motor_shaft": f"OD≈{p.shaft_od_mm} mm from torque class",
        "gear_oil_charge": f"≈{p.oil_volume_ml} ml seed charge",
        "oil_seals": f"{p.seal_count} seals (shaft + cover)",
        "motor_cooling_jacket": f"{p.jacket_channel_count} channel seed",
        "gate_driver_board": "SiC gate drive + desat — HIL OPEN (DEC-008)",
        "oem_inverter_control_board": "OEM control PCB — supplier Gerbers OPEN (DEC-009)",
    }
    return table.get(
        part_id,
        "Concept identity — first-principles seed; FEA/dyno/supplier replace",
    )


def bom_word(part_id: str, name: str, assembly: str, p: FpkPhysicsSeeds) -> dict[str, Any]:
    basis = part_engineering_basis(part_id, p)
    return {
        "id": part_id,
        "name_human": name,
        "content_character": {"character_id": part_id, "name_human": name},
        "modifier_characters": [
            {"kind": "quantity", "value": "×1", "unit": ""},
            {"kind": "form", "value": f"{name} — {assembly} assembly", "unit": ""},
            {"kind": "sizing_basis", "value": basis, "unit": ""},
            {
                "kind": "lifecycle",
                "value": (
                    "Concept first-principles seed — FEA/dyno/supplier ICD replace; "
                    "NOT homologated"
                ),
                "unit": "",
            },
            {"kind": "installation", "value": f"FPK concentric cassette / {assembly}", "unit": ""},
        ],
    }


def completeness_report(
    existing_ids: set[str],
) -> dict[str, Any]:
    """Gap report vs Tristan ontology."""
    aliases = {
        "mgu_cold_plate": "mcu_cold_plate",
        "mcu_cold_plate": "mgu_cold_plate",
        "traction_ipmsm_motor_generator": "motor_outer_casing",  # parent present ≠ explode
    }
    missing: list[dict[str, str]] = []
    present: list[str] = []
    for asm, pid, name in all_fpk_parts():
        hit = pid in existing_ids or aliases.get(pid, "") in existing_ids
        # parent principals count as partial for casing
        if pid == "motor_outer_casing" and "traction_ipmsm_motor_generator" in existing_ids:
            present.append(pid)
            continue
        if pid == "inverter_housing" and "sic_traction_inverter" in existing_ids:
            present.append(pid)
            continue
        if hit:
            present.append(pid)
        else:
            missing.append({"assembly": asm, "id": pid, "name": name})
    total = len(all_fpk_parts())
    return {
        "total": total,
        "present": len(present),
        "missing": len(missing),
        "coverage_pct": round(100.0 * len(present) / max(total, 1), 1),
        "missing_parts": missing,
        "present_ids": sorted(present),
    }


def _selftest() -> None:
    q = {
        "rotor_airgap_diameter_mm": 121.98,
        "stack_length_mm": 97.58,
        "mgu_shaft_torque_nm": 119.7,
        "mgu_base_speed_rpm": 19500,
        "phase_current_design_a": 535,
        "dc_bus_voltage_v": 750,
        "gear_ratio": 8.0,
        "fpk_planet_count": 3,
        "fpk_ring_id_mm": 88.7,
        "fpk_stator_od_mm": 164.7,
        "fpk_stator_id_mm": 123.4,
    }
    p = derive_physics(q)
    assert p.stator_slots == 24  # 3*4*2
    assert p.turns_per_phase >= 4
    assert p.magnet_segments == 8
    assert p.dc_link_capacitance_uf > 100
    assert p.sun_teeth > 0 and p.ring_teeth > p.sun_teeth
    assert (p.ring_teeth - p.sun_teeth) % p.planet_count == 0
    wb = physics_quantity_writeback(p)
    assert "turns_per_phase" in wb and "dc_link_capacitance_uf" in wb
    parts = all_fpk_parts()
    assert len(parts) >= 40
    # Tristan MCU list coverage by id family
    need = {
        "inverter_cover", "oem_inverter_control_board", "gate_driver_board",
        "dc_link_capacitor_bank", "hv_dc_busbar_link", "sic_power_module_stack",
        "mcu_cold_plate", "inverter_housing", "hv_dc_connector",
        "lv_signal_connector", "coolant_port_in", "coolant_port_out",
        "motor_outer_casing", "motor_cooling_jacket", "stator_laminations",
        "stator_windings", "hollow_rotor_barrel", "motor_shaft",
        "front_bearing", "resolver", "encoder", "rear_bearing", "rear_end_bell",
        "motor_power_terminals", "gearbox_housing", "gearbox_bearings",
        "sun_gear", "planet_gears", "differential_carrier", "side_gears",
        "output_gears", "output_shaft_left", "oil_seals", "gearbox_cover",
    }
    ids = {pid for _, pid, _ in parts}
    missing = need - ids
    assert not missing, missing
    print("fpk_first_principles --selftest OK")
    print(
        f"  slots={p.stator_slots} turns/ph={p.turns_per_phase} "
        f"mag={p.magnet_segments} C={p.dc_link_capacitance_uf}µF "
        f"S/P/R={p.sun_teeth}/{p.planet_teeth}/{p.ring_teeth} "
        f"parts={len(parts)}"
    )


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    if len(sys.argv) > 1:
        import json
        from pathlib import Path

        state = json.loads(Path(sys.argv[1]).read_text())
        cq = (state.get("orchestratorContract") or {}).get("quantities") or {}
        p = derive_physics(cq)
        print(json.dumps({"physics": asdict(p), "writeback": physics_quantity_writeback(p)}, indent=2))
    else:
        _selftest()
