"""PHANTM actuator — derived geometry from the §2 baseline.

Everything here is deterministic arithmetic on params.py; no field physics.
Run directly for a human-readable dump:  python geometry.py
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from params import BASELINE, MM, PhantmParams


@dataclass
class GeometrySummary:
    tooth_pitch_mm: float
    n_slots_per_face: int
    translator_volume_mm3: float
    translator_mass_kg: float
    magnetic_gap_mm: float
    pole_tooth_count: int
    pole_centre_spacing_mm: float
    pole_phase_offsets_mm: list          # per-pole offset vs pole 0, modulo pitch
    pole_phase_error_mm: float           # worst |offset − ideal k·pitch/3|
    stator_axial_extent_mm: float
    usable_stroke_mm: float
    coil_turns_per_layer: int
    coil_layers: int
    coil_radial_build_mm: float
    coil_fits_window: bool
    coil_mean_turn_len_mm: float
    coil_wire_len_mm: float
    envelope_transverse_mm: float
    envelope_radial_mm: float
    bridge_span_check_mm: float          # 2·depth + 2·gap + translator width (must equal bridge length)


def tooth_pitch_mm(p: PhantmParams) -> float:
    t = p.translator
    return t.slot_width_mm + t.land_width_mm


def n_slots_per_face(p: PhantmParams) -> int:
    """Full slot periods that fit along the bar."""
    return int(math.floor(p.translator.length_mm / tooth_pitch_mm(p)))


def translator_mass_kg(p: PhantmParams) -> tuple[float, float]:
    """(mass_kg, net_volume_mm3): solid bar minus slot volume on both faces (§4.1)."""
    t = p.translator
    bar = t.width_toothed_mm * t.width_side_mm * t.length_mm
    slot = t.slot_depth_mm * t.slot_width_mm * t.width_side_mm
    net = bar - 2 * n_slots_per_face(p) * slot
    mass = net * MM**3 * p.materials.smc_density_kg_m3  # mm³ → m³
    return mass, net


def magnetic_gap_mm(p: PhantmParams) -> float:
    """§3: Wm = (slot-face separation − translator toothed width) / 2, per side."""
    return (p.slot_section.separation_mm - p.translator.width_toothed_mm) / 2.0


def pole_tooth_positions_mm(p: PhantmParams) -> list:
    """Tooth (land) start positions on one slot-section face, from its axial datum.

    Lands are the un-slotted strips: [0, w], [w+s, 2w+s], ... with the two slots
    inset slot_edge_inset from opposite long edges — for the baseline this yields
    3 teeth at exactly the translator tooth pitch.
    """
    ss = p.slot_section
    lands = []
    x = 0.0
    # face is [0, axial]; slots at [inset, inset+sw] and [axial-inset-sw, axial-inset]
    s1 = (ss.slot_edge_inset_mm, ss.slot_edge_inset_mm + ss.slot_width_mm)
    s2 = (ss.axial_mm - ss.slot_edge_inset_mm - ss.slot_width_mm,
          ss.axial_mm - ss.slot_edge_inset_mm)
    edges = [0.0, s1[0], s1[1], s2[0], s2[1], ss.axial_mm]
    for a, b in zip(edges[:-1], edges[1:]):
        if b - a > 1e-9 and not any(abs(a - s[0]) < 1e-9 for s in (s1, s2)):
            lands.append((a, b))
        x = b
    return lands


def pole_phasing(p: PhantmParams) -> tuple[float, list, float]:
    """(centre_spacing, per-pole tooth-phase offsets mod pitch, worst error vs ideal k/3)."""
    pitch = tooth_pitch_mm(p)
    spacing = p.slot_section.axial_mm + p.poles.inter_pole_gap_mm
    offsets, worst = [], 0.0
    for k in range(p.poles.n_poles):
        off = (k * spacing) % pitch
        offsets.append(off)
        ideal = (k * pitch / 3.0) % pitch
        err = min(abs(off - ideal), pitch - abs(off - ideal))
        worst = max(worst, err)
    return spacing, offsets, worst


def coil_fit(p: PhantmParams) -> tuple[int, int, float, bool, float, float]:
    """Fit Nc turns in the bridge-centre window.

    Window: axial length = centre flat length; radial build allowance = the 0.263 mm
    displacement (§2.2). Turns wind around the bridge cross-section
    (thickness_axial × width_transverse).
    Returns (turns_per_layer, layers, radial_build_mm, fits, mean_turn_len_mm, wire_len_mm).
    """
    b, c = p.bridge, p.coil
    od = c.wire_diameter_od_um / 1000.0  # µm → mm
    tpl = max(1, int(b.centre_flat_len_mm // od))
    layers = math.ceil(c.n_turns / tpl)
    build = layers * od
    fits = build <= b.displacement_mm + 1e-9
    # mean turn wraps the bridge cross-section, offset by half the built winding
    peri = 2 * (b.thickness_axial_mm + b.width_transverse_mm)
    mean_turn = peri + 2 * math.pi * (build / 2.0)
    wire_len = c.n_turns * mean_turn
    return tpl, layers, build, fits, mean_turn, wire_len


def stator_envelope_mm(p: PhantmParams) -> tuple[float, float]:
    """Cross-section perpendicular to the translator axis (the beam-facing footprint).

    Transverse: max(slot-section width, bridge width + 2·coil build).
    Radial: bridge radial span (slot-section outer faces coincide with its ends).
    Frame/bearing NOT included (unspecified in §2) — flagged in the scorecard.
    """
    _, _, build, _, _, _ = coil_fit(p)
    transverse = max(p.slot_section.transverse_mm,
                     p.bridge.width_transverse_mm + 2 * build)
    radial = p.bridge.length_radial_mm
    return transverse, radial


def stator_axial_extent_mm(p: PhantmParams) -> float:
    n, gap = p.poles.n_poles, p.poles.inter_pole_gap_mm
    return n * p.slot_section.axial_mm + (n - 1) * gap


def usable_stroke_mm(p: PhantmParams) -> float:
    """Travel keeping all three poles fully over the toothed region."""
    return p.translator.length_mm - stator_axial_extent_mm(p)


def bridge_span_check_mm(p: PhantmParams) -> float:
    return (2 * p.slot_section.depth_mm + 2 * magnetic_gap_mm(p)
            + p.translator.width_toothed_mm)


def summarise(p: PhantmParams = BASELINE) -> GeometrySummary:
    mass, vol = translator_mass_kg(p)
    spacing, offsets, worst = pole_phasing(p)
    tpl, layers, build, fits, mean_turn, wire_len = coil_fit(p)
    env_t, env_r = stator_envelope_mm(p)
    return GeometrySummary(
        tooth_pitch_mm=tooth_pitch_mm(p),
        n_slots_per_face=n_slots_per_face(p),
        translator_volume_mm3=vol,
        translator_mass_kg=mass,
        magnetic_gap_mm=magnetic_gap_mm(p),
        pole_tooth_count=len(pole_tooth_positions_mm(p)),
        pole_centre_spacing_mm=spacing,
        pole_phase_offsets_mm=offsets,
        pole_phase_error_mm=worst,
        stator_axial_extent_mm=stator_axial_extent_mm(p),
        usable_stroke_mm=usable_stroke_mm(p),
        coil_turns_per_layer=tpl,
        coil_layers=layers,
        coil_radial_build_mm=build,
        coil_fits_window=fits,
        coil_mean_turn_len_mm=mean_turn,
        coil_wire_len_mm=wire_len,
        envelope_transverse_mm=env_t,
        envelope_radial_mm=env_r,
        bridge_span_check_mm=bridge_span_check_mm(p),
    )


if __name__ == "__main__":
    s = summarise()
    print("PHANTM baseline derived geometry")
    print(f"  tooth pitch            {s.tooth_pitch_mm:.3f} mm")
    print(f"  slots per face         {s.n_slots_per_face}")
    print(f"  translator net volume  {s.translator_volume_mm3:.2f} mm³")
    print(f"  Mt (translator mass)   {s.translator_mass_kg*1e3:.4f} g")
    print(f"  Wm (gap per side)      {s.magnetic_gap_mm*1000:.1f} µm")
    print(f"  teeth per pole face    {s.pole_tooth_count}")
    print(f"  pole centre spacing    {s.pole_centre_spacing_mm:.3f} mm")
    print(f"  pole phase offsets     {[f'{o:.3f}' for o in s.pole_phase_offsets_mm]} mm (mod pitch)")
    print(f"  worst phase error      {s.pole_phase_error_mm*1000:.0f} µm vs ideal pitch/3")
    print(f"  stator axial extent    {s.stator_axial_extent_mm:.3f} mm")
    print(f"  usable stroke          {s.usable_stroke_mm:.2f} mm")
    print(f"  coil: {s.coil_turns_per_layer}/layer × {s.coil_layers} layers, build "
          f"{s.coil_radial_build_mm:.3f} mm, fits window: {s.coil_fits_window}")
    print(f"  coil wire length       {s.coil_wire_len_mm:.1f} mm")
    print(f"  stator envelope ⊥ axis {s.envelope_transverse_mm:.3f} × {s.envelope_radial_mm:.3f} mm")
    print(f"  bridge span check      {s.bridge_span_check_mm:.3f} mm (bridge length 2.634)")
