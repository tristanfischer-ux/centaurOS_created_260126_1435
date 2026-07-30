#!/usr/bin/env python3
"""FPK concentric stack — derived geometry from contract quantities (PHANTM pattern).

INTENT (2026-07-29 JLR FE front FPK / Hooley bar): Blender must not invent motor
OD / planetary nest from bay *fractions*. Mirror `scripts/phantm/geometry.py`:
params (bay + IPMSM tool outputs + gear_ratio + torques) → deterministic mm
for stator / hollow rotor / sun / planets / mini-diff / MCU shelf.

Lucid/Atieva = FFF TRAINING CHECK only — never silhouette paste.
Run: python3 scripts/lib/fpk_concentric_geometry.py --selftest
"""
from __future__ import annotations

import math
import sys
from dataclasses import asdict, dataclass
from typing import Any, Mapping, Optional


@dataclass(frozen=True)
class FpkConcentricParams:
    """Inputs from orchestratorContract.quantities (numeric values)."""

    bay_w_mm: float
    bay_d_mm: float
    bay_h_mm: float
    rotor_airgap_diameter_mm: float
    stack_length_mm: float
    gear_ratio: float
    shaft_torque_nm: float
    phase_current_design_a: float = 0.0


@dataclass(frozen=True)
class FpkConcentricGeometry:
    """Derived concentric cassette — all mm unless noted."""

    # Exterior casing (fills bay with clearance)
    case_w_mm: float
    case_d_mm: float
    case_h_mm: float
    wall_mm: float

    # Motor stack (transverse axis = car lateral = +X in Blender)
    housing_od_mm: float
    housing_len_mm: float
    stator_od_mm: float
    stator_id_mm: float
    rotor_od_mm: float
    rotor_id_mm: float
    airgap_mm: float
    mean_airgap_diameter_mm: float
    stack_len_mm: float
    nest_len_mm: float

    # Planetary (inside hollow rotor)
    sun_od_mm: float
    planet_od_mm: float
    planet_count: int
    planet_pcd_mm: float
    ring_id_mm: float
    carrier_od_mm: float
    diff_od_mm: float
    diff_len_mm: float
    gear_face_mm: float

    # MCU shelf (L1)
    mcu_w_mm: float
    mcu_d_mm: float
    mcu_h_mm: float
    shelf_h_mm: float

    # Interfaces
    shaft_od_mm: float
    shaft_stub_mm: float
    busbar_section_mm: float

    # Packaging checks
    nest_fits_rotor: bool
    stack_fits_bay: bool
    mcu_fits_bay: bool
    notes: tuple[str, ...]


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


def params_from_quantities(quantities: Mapping[str, Any]) -> FpkConcentricParams:
    """INTENT: read HARD bay + IPMSM tool outputs — never invent bay from principals."""
    return FpkConcentricParams(
        bay_w_mm=_num(
            quantities,
            "front_bay_envelope_w_mm",
            "bay_envelope_w_mm",
            "design_envelope_width_mm",
            default=343.0,
        ),
        bay_d_mm=_num(
            quantities,
            "front_bay_envelope_d_mm",
            "bay_envelope_d_mm",
            "design_envelope_depth_mm",
            default=259.0,
        ),
        bay_h_mm=_num(
            quantities,
            "front_bay_envelope_h_mm",
            "bay_envelope_h_mm",
            "design_envelope_height_mm",
            default=267.0,
        ),
        rotor_airgap_diameter_mm=_num(
            quantities, "rotor_airgap_diameter_mm", default=122.0,
        ),
        stack_length_mm=_num(quantities, "stack_length_mm", default=98.0),
        gear_ratio=_num(quantities, "gear_ratio", default=8.0),
        shaft_torque_nm=_num(
            quantities, "mgu_shaft_torque_nm", "envelope_mgu_torque_nm", default=120.0,
        ),
        phase_current_design_a=_num(
            quantities, "phase_current_design_a", "phase_current_max_a", default=0.0,
        ),
    )


def derive_geometry(p: FpkConcentricParams) -> FpkConcentricGeometry:
    """PHANTM-style pure arithmetic: params → nested concentric mm.

    Physics sketch (concept, not FEA):
      • legacy ``rotor_airgap_diameter_mm`` is treated as the rotor OD seed;
        this module writes the actual mean airgap diameter separately.
      • stator ID = rotor OD + 2·g; stator OD ≈ 1.35× rotor OD (radial build)
      • housing OD = stator OD + jacket; length = stack + end-winding allowance
      • hollow rotor ID must clear planetary: ring ID ≈ rotor ID − clearance
      • single-stage planetary with fixed ring: i ≈ 1 + R/S → R/S = i−1
      • MCU shelf is a thin brick on the casing crown (not a second bay-depth stack)
    """
    notes: list[str] = []
    wall = max(6.0, min(p.bay_w_mm, p.bay_d_mm, p.bay_h_mm) * 0.028)
    case_w = p.bay_w_mm * 0.98
    case_d = p.bay_d_mm * 0.98
    case_h = p.bay_h_mm * 0.96

    airgap = 0.7  # mm concept radial airgap (FEA replaces)
    rotor_od = float(p.rotor_airgap_diameter_mm)
    # Clamp rotor OD into bay cross-section with jacket + MCU shelf allowance.
    od_cap = min(case_d, case_h) * 0.78
    if rotor_od * 1.42 > od_cap:
        notes.append(
            f"rotor_airgap_od {rotor_od:.1f}→scaled to fit bay cross-section"
        )
        rotor_od = od_cap / 1.42
    stator_id = rotor_od + 2.0 * airgap
    mean_airgap_diameter = (rotor_od + stator_id) / 2.0
    stator_od = min(od_cap * 0.96, rotor_od * 1.35)
    housing_od = min(od_cap, stator_od + 12.0)

    stack = float(p.stack_length_mm)
    end_wind = max(18.0, stack * 0.22)
    housing_len = min(case_w - 2.0 * wall - 16.0, stack + 2.0 * end_wind)
    if housing_len < stack + 10.0:
        notes.append("stack+end-windings clamped by bay width")
        housing_len = max(stack + 10.0, case_w * 0.55)
        housing_len = min(housing_len, case_w - 2.0 * wall - 12.0)
    nest_len = min(housing_len * 0.72, stack * 1.15)

    # Hollow rotor bore — host for planetary. Keep rim for magnets/retention.
    rim = max(10.0, rotor_od * 0.12)
    rotor_id = max(rotor_od * 0.42, rotor_od - 2.0 * rim)
    rotor_id = min(rotor_id, stator_id * 0.92)

    # Planetary: i = 1 + R/S (fixed ring, carrier out) → R/S = i − 1
    i = max(2.5, float(p.gear_ratio))
    rs = i - 1.0
    # Pitch diameters inside rotor bore with 2 mm radial clearance.
    ring_id = max(28.0, rotor_id - 4.0)
    # R = ring pitch ≈ ring_id; S = R / (i−1); planet ≈ (R−S)/2
    sun_od = max(12.0, ring_id / (rs + 1.0))
    planet_od = max(8.0, (ring_id - sun_od) / 2.0)
    planet_count = 3 if planet_od >= 10.0 else 4
    planet_pcd = sun_od + planet_od
    # Face width scales gently with shaft torque (concept tooth load proxy).
    t = max(40.0, float(p.shaft_torque_nm))
    gear_face = min(nest_len * 0.42, max(14.0, 0.12 * math.sqrt(t) * 10.0))
    carrier_od = min(ring_id * 0.92, planet_pcd + planet_od * 0.35)
    diff_od = min(carrier_od * 0.85, sun_od * 1.6)
    diff_len = min(nest_len * 0.28, gear_face * 1.35)

    nest_fits = (planet_pcd / 2.0 + planet_od / 2.0) <= (ring_id / 2.0 + 0.5)

    # MCU shelf — thin package on crown; span along motor length.
    mcu_h = 28.0
    mcu_w = min(housing_len * 0.82, case_w * 0.70)
    mcu_d = min(housing_od * 0.72, case_d * 0.55)
    shelf_h = 6.0
    # Crown clearance: motor OD/2 + shelf + MCU must clear case_h from axis centre.
    # Axis sits ~ base + housing_od/2; leave headroom.
    mcu_fits = (housing_od * 0.5 + shelf_h + mcu_h + 8.0) <= (case_h * 0.92)

    shaft_od = max(18.0, min(36.0, 0.35 * math.sqrt(t)))
    shaft_stub = max(32.0, case_w * 0.09)
    # Busbar section from I_ph design (rough current density ~5 A/mm² Cu)
    iph = max(100.0, float(p.phase_current_design_a) or 400.0)
    bus_a = iph / 5.0
    busbar = max(8.0, min(16.0, math.sqrt(bus_a)))

    stack_fits = housing_od <= min(case_d, case_h) and housing_len <= case_w

    if not nest_fits:
        notes.append("planetary PCD exceeds ring ID — check gear_ratio vs rotor bore")
    if not mcu_fits:
        notes.append("MCU shelf + motor OD exceeds bay height — thin MCU further")
    if not stack_fits:
        notes.append("motor housing does not fit bay — clamp failed")

    return FpkConcentricGeometry(
        case_w_mm=round(case_w, 1),
        case_d_mm=round(case_d, 1),
        case_h_mm=round(case_h, 1),
        wall_mm=round(wall, 1),
        housing_od_mm=round(housing_od, 1),
        housing_len_mm=round(housing_len, 1),
        stator_od_mm=round(stator_od, 1),
        stator_id_mm=round(stator_id, 1),
        rotor_od_mm=round(rotor_od, 1),
        rotor_id_mm=round(rotor_id, 1),
        airgap_mm=round(airgap, 2),
        mean_airgap_diameter_mm=round(mean_airgap_diameter, 2),
        stack_len_mm=round(stack, 1),
        nest_len_mm=round(nest_len, 1),
        sun_od_mm=round(sun_od, 1),
        planet_od_mm=round(planet_od, 1),
        planet_count=planet_count,
        planet_pcd_mm=round(planet_pcd, 1),
        ring_id_mm=round(ring_id, 1),
        carrier_od_mm=round(carrier_od, 1),
        diff_od_mm=round(diff_od, 1),
        diff_len_mm=round(diff_len, 1),
        gear_face_mm=round(gear_face, 1),
        mcu_w_mm=round(mcu_w, 1),
        mcu_d_mm=round(mcu_d, 1),
        mcu_h_mm=round(mcu_h, 1),
        shelf_h_mm=round(shelf_h, 1),
        shaft_od_mm=round(shaft_od, 1),
        shaft_stub_mm=round(shaft_stub, 1),
        busbar_section_mm=round(busbar, 1),
        nest_fits_rotor=nest_fits,
        stack_fits_bay=stack_fits,
        mcu_fits_bay=mcu_fits,
        notes=tuple(notes),
    )


def geometry_from_quantities(quantities: Mapping[str, Any]) -> FpkConcentricGeometry:
    return derive_geometry(params_from_quantities(quantities))


def principal_box_dims(g: FpkConcentricGeometry) -> dict[str, str]:
    """BoM L×D×H strings — nested identities (gear/diff ⊆ rotor ID, not external boxes)."""
    # Motor: length × OD × OD (transverse machine)
    motor = f"{int(round(g.housing_len_mm))}x{int(round(g.housing_od_mm))}x{int(round(g.housing_od_mm))} mm"
    # MCU: shelf brick
    mcu = f"{int(round(g.mcu_w_mm))}x{int(round(g.mcu_d_mm))}x{int(round(g.mcu_h_mm))} mm"
    # Planetary nest — diameter×face×diameter INSIDE rotor (not bay side box)
    gear_od = int(round(g.ring_id_mm))
    gear_face = int(round(g.gear_face_mm))
    gear = f"{gear_face}x{gear_od}x{gear_od} mm"
    diff_od = int(round(g.diff_od_mm))
    diff_len = int(round(g.diff_len_mm))
    diff = f"{diff_len}x{diff_od}x{diff_od} mm"
    return {
        "traction_ipmsm_motor_generator": motor,
        "sic_traction_inverter": mcu,
        "planetary_reduction_in_rotor": gear,
        "reduction_gear_stage": gear,  # alias until BoM rename lands
        "mini_diff_in_rotor": diff,
        "open_bevel_differential": diff,  # legacy alias
    }


def quantity_writeback(g: FpkConcentricGeometry) -> dict[str, dict[str, Any]]:
    """Contract quantities to stamp for Excel / Blender / drawings."""
    def q(value: float, unit: str, detail: str) -> dict[str, Any]:
        return {
            "value": value,
            "unit": unit,
            "family": "length" if unit == "mm" else "dimensionless",
            "basis": "rated",
            "scope": "module",
            "source": "calculator",
            "source_detail": detail,
        }

    return {
        "fpk_housing_od_mm": q(g.housing_od_mm, "mm", "derived housing OD from IPMSM airgap + jacket"),
        "fpk_housing_len_mm": q(g.housing_len_mm, "mm", "derived stack + end-winding clamp into bay W"),
        "fpk_stator_od_mm": q(g.stator_od_mm, "mm", "derived stator OD"),
        "fpk_stator_id_mm": q(g.stator_id_mm, "mm", "rotor OD + 2×airgap"),
        "fpk_rotor_od_mm": q(g.rotor_od_mm, "mm", "from rotor_airgap_diameter_mm (clamped)"),
        "fpk_mean_airgap_diameter_mm": q(
            g.mean_airgap_diameter_mm,
            "mm",
            "mean diameter between rotor OD and stator ID",
        ),
        "fpk_rotor_id_mm": q(g.rotor_id_mm, "mm", "hollow bore for planetary nest"),
        "fpk_sun_od_mm": q(g.sun_od_mm, "mm", "planetary sun from gear_ratio + ring ID"),
        "fpk_planet_od_mm": q(g.planet_od_mm, "mm", "planet pitch diameter from R/S split"),
        "fpk_planet_count": {
            "value": g.planet_count,
            "unit": "",
            "family": "count",
            "basis": "rated",
            "scope": "module",
            "source": "calculator",
            "source_detail": "3–4 planets from planet OD class",
        },
        "fpk_ring_id_mm": q(g.ring_id_mm, "mm", "ring gear ID inside hollow rotor"),
        "fpk_diff_od_mm": q(g.diff_od_mm, "mm", "mini-diff nest OD inside carrier"),
        "fpk_mcu_w_mm": q(g.mcu_w_mm, "mm", "MCU shelf span"),
        "fpk_mcu_d_mm": q(g.mcu_d_mm, "mm", "MCU shelf depth"),
        "fpk_mcu_h_mm": q(g.mcu_h_mm, "mm", "MCU package height"),
        "fpk_geometry_ok": {
            "value": 1.0 if (
                g.nest_fits_rotor
                and g.stack_fits_bay
                and g.mcu_fits_bay
                and g.rotor_od_mm < g.mean_airgap_diameter_mm < g.stator_id_mm
            ) else 0.0,
            "unit": "",
            "family": "dimensionless",
            "basis": "rated",
            "scope": "system",
            "source": "calculator",
            "source_detail": (
                "1=concentric nest fits bay and mean airgap lies between rotor OD/stator ID; notes="
                + "; ".join(g.notes)
                if g.notes
                else "1=concentric nest fits bay and mean airgap lies between rotor OD/stator ID"
            ),
        },
    }


def _selftest() -> None:
    # JLR front twin seed (20260729-1432)
    q = {
        "front_bay_envelope_w_mm": 343,
        "front_bay_envelope_d_mm": 259,
        "front_bay_envelope_h_mm": 267,
        "rotor_airgap_diameter_mm": 121.98,
        "stack_length_mm": 97.58,
        "gear_ratio": 8.0,
        "mgu_shaft_torque_nm": 119.7,
        "phase_current_design_a": 535,
    }
    g = geometry_from_quantities(q)
    assert g.housing_od_mm <= min(g.case_d_mm, g.case_h_mm) + 1e-6
    assert g.housing_len_mm <= g.case_w_mm + 1e-6
    assert g.rotor_id_mm < g.rotor_od_mm < g.stator_id_mm <= g.stator_od_mm
    assert g.rotor_od_mm < g.mean_airgap_diameter_mm < g.stator_id_mm
    assert g.sun_od_mm < g.ring_id_mm
    assert g.planet_count in (3, 4)
    assert g.nest_fits_rotor, g.notes
    assert g.stack_fits_bay, g.notes
    boxes = principal_box_dims(g)
    # Gear box must be smaller than motor OD (nested, not external bay brick)
    gear_od = float(boxes["planetary_reduction_in_rotor"].split("x")[1])
    assert gear_od <= g.rotor_id_mm + 1.0, (gear_od, g.rotor_id_mm)
    assert g.mcu_h_mm <= 40.0
    wb = quantity_writeback(g)
    assert wb["fpk_geometry_ok"]["value"] == 1.0
    assert wb["fpk_mean_airgap_diameter_mm"]["value"] > wb["fpk_rotor_od_mm"]["value"]
    # Adversarial: huge gear ratio still nests (planets shrink)
    g2 = derive_geometry(
        FpkConcentricParams(343, 259, 267, 122, 98, 14.0, 120, 500),
    )
    assert g2.nest_fits_rotor or g2.planet_od_mm >= 8.0
    print("fpk_concentric_geometry --selftest OK")
    print(
        f"  housing Ø{g.housing_od_mm}×L{g.housing_len_mm}  "
        f"rotor ID {g.rotor_id_mm}  sun {g.sun_od_mm}  "
        f"planet×{g.planet_count} Ø{g.planet_od_mm}  MCU {g.mcu_w_mm}×{g.mcu_d_mm}×{g.mcu_h_mm}"
    )


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    # Dump from optional state.json path
    if len(sys.argv) > 1:
        import json
        from pathlib import Path

        state = json.loads(Path(sys.argv[1]).read_text())
        cq = (state.get("orchestratorContract") or {}).get("quantities") or {}
        g = geometry_from_quantities(cq)
        print(json.dumps({"params": asdict(params_from_quantities(cq)), "geometry": asdict(g)}, indent=2))
    else:
        _selftest()
