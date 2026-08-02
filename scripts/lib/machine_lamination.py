#!/usr/bin/env python3
"""Lamination gauge + grade -> Steinmetz loss coefficients. UNIVERSAL.

⭐⭐ WHY THIS EXISTS (2026-08-02). `motor:loss-point` takes `steinmetz_kh` and
`steinmetz_ke` as inputs and defaults them to 0.02 and 1e-5 when the caller
supplies nothing. Nothing supplied anything. Every iron-loss figure in the FE
front FPK campaign therefore described a generic steel with a defaulted eddy
coefficient — while the machine's OWN material file (the one the FE deck already
loads to get its BH curve) carried the grade, the gauge, the resistivity and the
density all along:

    M400-50A, Wlam = 0.5 mm, rho = 4.6e-7 ohm.m, density = 7650 kg/m3

The classical eddy coefficient for that lamination is 1.17e-4, not 1e-5 — the
default understates the eddy term by ~12x. Eddy loss goes as GAUGE SQUARED and
as FREQUENCY SQUARED, so at a traction fundamental of 1300 Hz that single
unstated number moves the iron-loss answer more than any other input. At this
module's own comparison point (1.2 T, 1300 Hz) the defaulted coefficients give
60.4 W/kg against 342.6 W/kg derived — 5.7x. On the FE front FPK twin's OWN
measured field and mass the integrated totals are 993.6 W against 5869.8 W.

(An earlier draft of this note said "27 W/kg", which was the twin's contract
figure per kilogram at a DIFFERENT flux density and frequency — a mixed
comparison point, caught by Grok at the finish council. Quote the two numbers
from the same operating point or they mean nothing.)

THE RULE, not the data point: never accept a defaulted loss coefficient when the
lamination is knowable. Two independent routes, and they must agree:

  1. EDDY, from first principles. P_e = pi^2 * sigma * d^2 * f^2 * B^2 / (6*rho_m)
     per kilogram, i.e. ke = pi^2 * d^2 / (6 * rho_elec * rho_mass). Nothing
     empirical: conductivity, thickness, density.

  2. HYSTERESIS, calibrated to the grade's OWN guarantee. The EN 10106 / EN 10107
     designation IS the datasheet: M400-50A means "<=4.00 W/kg at 1.5 T, 50 Hz,
     0.50 mm thick". Subtract the computed eddy at that reference point and the
     remainder is the hysteresis term, so kh follows from the grade name.

Every coefficient then carries provenance back to a designation or a measured
material property, and a change of gauge or grade moves the loss answer by
itself. No table of per-machine constants.

Exit 48 when a caller asks for coefficients and the lamination is UNSTATED —
publishing a defaulted iron loss is the failure this module exists to prevent.

    machine_lamination.py --grade M400-50A --enforce
    machine_lamination.py --material-json <pyleecan machine.json> --enforce
    machine_lamination.py --selftest
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from dataclasses import dataclass, asdict

EXIT_UNSTATED_LAMINATION = 48

# EN 10106 (non-oriented, "A" suffix) guarantees specific loss at 1.5 T / 50 Hz.
# EN 10107 (grain-oriented, "N"/"S"/"P") guarantees it at 1.7 T / 50 Hz.
_GRADE_RE = re.compile(
    r"^\s*M\s*(\d{2,4})\s*[-_ ]?\s*(\d{2,3})\s*([A-Z])\s*$", re.IGNORECASE)
_ORIENTED_SUFFIXES = {"N", "S", "P"}

# Typical non-oriented electrical-steel constants, used ONLY when the material
# file does not state them. Both are weak levers next to gauge and grade.
DEFAULT_DENSITY_KG_M3 = 7650.0
DEFAULT_RESISTIVITY_OHM_M = 4.6e-7
DEFAULT_STEINMETZ_ALPHA = 1.8


class LaminationError(RuntimeError):
    """The lamination is not stated well enough to derive loss coefficients."""


@dataclass(frozen=True)
class LaminationSpec:
    """Everything needed to derive loss coefficients, with where it came from."""

    grade: str
    thickness_m: float
    resistivity_ohm_m: float
    density_kg_m3: float
    reference_loss_w_per_kg: float
    reference_flux_density_t: float
    reference_frequency_hz: float
    stacking_factor: float
    grain_oriented: bool
    provenance: str


@dataclass(frozen=True)
class SteinmetzCoefficients:
    """kh, ke, alpha with the arithmetic that produced them."""

    steinmetz_kh: float
    steinmetz_ke: float
    steinmetz_alpha: float
    eddy_at_reference_w_per_kg: float
    hysteresis_at_reference_w_per_kg: float
    reproduces_reference_w_per_kg: float
    lamination: LaminationSpec

    def specific_loss_w_per_kg(self, flux_density_t: float,
                               frequency_hz: float) -> float:
        """P_fe/kg = kh*f*B^alpha + ke*f^2*B^2 — the motor:loss-point model."""
        return (self.steinmetz_kh * frequency_hz
                * flux_density_t ** self.steinmetz_alpha
                + self.steinmetz_ke * frequency_hz ** 2 * flux_density_t ** 2)


def parse_grade(designation: str) -> tuple[float, float, bool]:
    """EN 10106 / EN 10107 designation -> (loss W/kg, thickness m, oriented).

    The designation is the datasheet: M400-50A is 4.00 W/kg at 1.5 T / 50 Hz on
    0.50 mm material. Parsing it is how a grade change moves the loss answer
    without anyone maintaining a table.
    """
    match = _GRADE_RE.match(str(designation or ""))
    if not match:
        raise LaminationError(
            f"{designation!r} is not an EN 10106/10107 designation "
            "(expected e.g. M400-50A, M270-35A, M120-27N)")
    loss_code, thickness_code, suffix = match.groups()
    loss_w_per_kg = int(loss_code) / 100.0
    thickness_m = int(thickness_code) / 100.0 * 1.0e-3
    return loss_w_per_kg, thickness_m, suffix.upper() in _ORIENTED_SUFFIXES


def lamination_from_grade(
    designation: str,
    *,
    resistivity_ohm_m: float = DEFAULT_RESISTIVITY_OHM_M,
    density_kg_m3: float = DEFAULT_DENSITY_KG_M3,
    stacking_factor: float = 0.95,
    provenance: str = "EN 10106/10107 designation",
) -> LaminationSpec:
    """Build a spec from the designation alone."""
    loss, thickness_m, oriented = parse_grade(designation)
    return LaminationSpec(
        grade=str(designation).strip().upper(),
        thickness_m=thickness_m,
        resistivity_ohm_m=float(resistivity_ohm_m),
        density_kg_m3=float(density_kg_m3),
        reference_loss_w_per_kg=loss,
        reference_flux_density_t=1.7 if oriented else 1.5,
        reference_frequency_hz=50.0,
        stacking_factor=float(stacking_factor),
        grain_oriented=oriented,
        provenance=provenance,
    )


def lamination_from_pyleecan_lamination(lam) -> LaminationSpec:
    """Read the machine's OWN material file — the data that was always there.

    This is the bridge that was missing. The FE deck already loads this object
    for its BH curve; the gauge, resistivity and density sit on the same
    material and were never carried to the loss tool.
    """
    material = getattr(lam, "mat_type", None)
    if material is None:
        raise LaminationError("lamination has no mat_type")
    name = getattr(material, "name", "") or ""
    magnetics = getattr(material, "mag", None)
    thickness_m = float(getattr(magnetics, "Wlam", 0.0) or 0.0)
    resistivity = float(
        getattr(getattr(material, "elec", None), "rho", 0.0) or 0.0)
    density = float(
        getattr(getattr(material, "struct", None), "rho", 0.0) or 0.0)
    spec = lamination_from_grade(
        name,
        resistivity_ohm_m=resistivity or DEFAULT_RESISTIVITY_OHM_M,
        density_kg_m3=density or DEFAULT_DENSITY_KG_M3,
        stacking_factor=float(getattr(lam, "Kf1", 0.95) or 0.95),
        provenance=f"pyleecan material {name!r} (grade designation) + "
                   f"{'stated' if thickness_m else 'designation'} Wlam"
                   f"{'' if resistivity else '; resistivity defaulted'}"
                   f"{'' if density else '; density defaulted'}",
    )
    if thickness_m > 0.0:
        stated_mm = thickness_m * 1.0e3
        designated_mm = spec.thickness_m * 1.0e3
        if abs(stated_mm - designated_mm) > 0.005:
            raise LaminationError(
                f"material {name!r} states Wlam = {stated_mm:.3f} mm but its "
                f"designation says {designated_mm:.3f} mm — the grade and the "
                "gauge disagree; one of them is wrong")
    return spec


def steinmetz_from_lamination(
    spec: LaminationSpec,
    *,
    alpha: float = DEFAULT_STEINMETZ_ALPHA,
) -> SteinmetzCoefficients:
    """Classical eddy from the gauge; hysteresis calibrated to the grade."""
    if spec.thickness_m <= 0.0 or spec.resistivity_ohm_m <= 0.0 \
            or spec.density_kg_m3 <= 0.0:
        raise LaminationError(
            "thickness, resistivity and density must all be positive to "
            f"derive loss coefficients (got {spec})")
    # ke = pi^2 d^2 / (6 rho_elec rho_mass)  -> W / (kg Hz^2 T^2)
    ke = (math.pi ** 2 * spec.thickness_m ** 2
          / (6.0 * spec.resistivity_ohm_m * spec.density_kg_m3))
    b_ref = spec.reference_flux_density_t
    f_ref = spec.reference_frequency_hz
    eddy_ref = ke * f_ref ** 2 * b_ref ** 2
    hysteresis_ref = spec.reference_loss_w_per_kg - eddy_ref
    if hysteresis_ref <= 0.0:
        raise LaminationError(
            f"grade {spec.grade} guarantees {spec.reference_loss_w_per_kg} W/kg "
            f"at {b_ref} T / {f_ref} Hz but the classical eddy term alone is "
            f"{eddy_ref:.3f} W/kg — the gauge and the grade are inconsistent")
    kh = hysteresis_ref / (f_ref * b_ref ** alpha)
    coefficients = SteinmetzCoefficients(
        steinmetz_kh=kh,
        steinmetz_ke=ke,
        steinmetz_alpha=alpha,
        eddy_at_reference_w_per_kg=eddy_ref,
        hysteresis_at_reference_w_per_kg=hysteresis_ref,
        reproduces_reference_w_per_kg=0.0,
        lamination=spec,
    )
    reproduced = coefficients.specific_loss_w_per_kg(b_ref, f_ref)
    return SteinmetzCoefficients(
        steinmetz_kh=kh,
        steinmetz_ke=ke,
        steinmetz_alpha=alpha,
        eddy_at_reference_w_per_kg=eddy_ref,
        hysteresis_at_reference_w_per_kg=hysteresis_ref,
        reproduces_reference_w_per_kg=reproduced,
        lamination=spec,
    )


def stator_iron_mass_kg(
    *,
    stator_outer_diameter_mm: float,
    stator_inner_diameter_mm: float,
    active_length_mm: float,
    slot_area_total_mm2: float,
    density_kg_m3: float = DEFAULT_DENSITY_KG_M3,
    stacking_factor: float = 0.95,
) -> float:
    """Stator core mass from the geometry that is already drawn.

    The other half of the iron-loss answer. `motor:loss-point` defaults
    `iron_mass_kg` to 5.0 and the FE front FPK twin never supplied it, so the
    campaign's iron loss described five generic kilograms. Mass is only a
    LINEAR lever (unlike gauge, which is quadratic), but a defaulted one is
    still a number nobody chose — and the annulus, the slots and the stack
    length are all already known to any deck that can draw the machine.

    Stacking factor matters: a 0.95 stack is 5% air, and charging loss to that
    air overstates it.
    """
    r_outer_m = stator_outer_diameter_mm / 2.0 * 1.0e-3
    r_inner_m = stator_inner_diameter_mm / 2.0 * 1.0e-3
    if r_outer_m <= r_inner_m or active_length_mm <= 0.0:
        raise LaminationError(
            "stator outer diameter must exceed the bore and the stack must "
            "have length")
    annulus_m2 = math.pi * (r_outer_m ** 2 - r_inner_m ** 2)
    slots_m2 = max(0.0, float(slot_area_total_mm2)) * 1.0e-6
    steel_m2 = annulus_m2 - slots_m2
    if steel_m2 <= 0.0:
        raise LaminationError(
            f"slot area {slot_area_total_mm2:.1f} mm2 exceeds the stator "
            f"annulus {annulus_m2 * 1e6:.1f} mm2 — the geometry is not buildable")
    return (steel_m2 * (active_length_mm * 1.0e-3)
            * float(density_kg_m3) * float(stacking_factor))


def loss_point_inputs(coefficients: SteinmetzCoefficients) -> dict:
    """The exact keys motor:loss-point reads, so the caller cannot mis-name."""
    return {
        "steinmetz_kh": coefficients.steinmetz_kh,
        "steinmetz_ke": coefficients.steinmetz_ke,
        "steinmetz_alpha": coefficients.steinmetz_alpha,
    }


def _enforcing() -> bool:
    return os.environ.get(
        "LAMINATION_ENFORCING", "1").strip().lower() not in {
            "0", "off", "false", "no", "shadow"}


def _selftest() -> int:
    checks: dict[str, bool] = {}
    spec = lamination_from_grade("M400-50A")
    checks["designation_parses_loss_and_gauge"] = (
        abs(spec.reference_loss_w_per_kg - 4.00) < 1e-12
        and abs(spec.thickness_m - 0.5e-3) < 1e-12
        and not spec.grain_oriented)
    checks["grain_oriented_references_1_7_t"] = (
        lamination_from_grade("M120-27N").reference_flux_density_t == 1.7)

    coefficients = steinmetz_from_lamination(spec)
    checks["reproduces_the_grade_guarantee"] = (
        abs(coefficients.reproduces_reference_w_per_kg
            - spec.reference_loss_w_per_kg) < 1e-9)

    # ⭐ proveCatch: the DEFAULTS motor:loss-point falls back to do NOT
    # reproduce this grade's own datasheet point. That is the whole finding.
    default_at_reference = (
        0.02 * 50.0 * 1.5 ** 1.8 + 1e-5 * 50.0 ** 2 * 1.5 ** 2)
    checks["defaults_do_not_reproduce_the_grade"] = (
        abs(default_at_reference - 4.00) > 0.5)

    # ⭐ proveCatch: eddy goes as GAUGE SQUARED. Halve the gauge, quarter the
    # eddy coefficient. If this ever stops holding, the derivation is empirical
    # rather than classical and the gauge has stopped being a real lever.
    thin = steinmetz_from_lamination(lamination_from_grade("M400-25A"))
    checks["eddy_scales_as_gauge_squared"] = (
        abs(thin.steinmetz_ke / coefficients.steinmetz_ke - 0.25) < 1e-9)

    # ⭐ proveCatch: at a traction fundamental the defaulted coefficients
    # understate this lamination badly. The number that made this worth doing.
    derived_1300 = coefficients.specific_loss_w_per_kg(1.2, 1300.0)
    defaulted_1300 = (0.02 * 1300.0 * 1.2 ** 1.8
                      + 1e-5 * 1300.0 ** 2 * 1.2 ** 2)
    checks["defaults_understate_at_traction_frequency"] = (
        derived_1300 / defaulted_1300 > 3.0)

    # A grade whose guarantee is thinner than its own classical eddy floor is
    # not physical and must be refused, not silently fitted with a negative kh.
    try:
        steinmetz_from_lamination(lamination_from_grade("M100-65A"))
        checks["refuses_impossible_grade_gauge_pair"] = False
    except LaminationError:
        checks["refuses_impossible_grade_gauge_pair"] = True

    try:
        parse_grade("mystery steel")
        checks["refuses_unstated_lamination"] = False
    except LaminationError:
        checks["refuses_unstated_lamination"] = True

    for name, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    print(f"\n  M400-50A -> kh={coefficients.steinmetz_kh:.5f} "
          f"ke={coefficients.steinmetz_ke:.3e} alpha={coefficients.steinmetz_alpha}")
    print(f"  at 1.2 T / 1300 Hz: derived {derived_1300:.1f} W/kg vs "
          f"defaulted {defaulted_1300:.1f} W/kg "
          f"({derived_1300 / defaulted_1300:.2f}x)")
    return 0 if all(checks.values()) else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--grade", help="EN 10106/10107 designation, e.g. M400-50A")
    parser.add_argument("--material-json",
                        help="pyleecan machine JSON; reads the STATOR lamination")
    parser.add_argument("--resistivity-ohm-m", type=float)
    parser.add_argument("--density-kg-m3", type=float)
    parser.add_argument("--flux-density-t", type=float, default=1.2)
    parser.add_argument("--frequency-hz", type=float, default=50.0)
    parser.add_argument("--enforce", action="store_true",
                        help=f"exit {EXIT_UNSTATED_LAMINATION} when the "
                             "lamination is not stated")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args(argv)

    if args.selftest:
        return _selftest()

    try:
        if args.material_json:
            from pyleecan.Functions.load import load  # noqa: PLC0415
            machine = load(str(args.material_json))
            spec = lamination_from_pyleecan_lamination(machine.stator)
        elif args.grade:
            overrides = {}
            if args.resistivity_ohm_m:
                overrides["resistivity_ohm_m"] = args.resistivity_ohm_m
            if args.density_kg_m3:
                overrides["density_kg_m3"] = args.density_kg_m3
            spec = lamination_from_grade(args.grade, **overrides)
        else:
            raise LaminationError(
                "no lamination stated — pass --grade or --material-json")
        coefficients = steinmetz_from_lamination(spec)
    except LaminationError as error:
        print(f"[lamination] UNSTATED/INVALID: {error}")
        if args.enforce and _enforcing():
            print(f"[lamination] BLOCKING — an iron-loss figure derived from "
                  f"defaulted coefficients describes a steel nobody chose "
                  f"(exit {EXIT_UNSTATED_LAMINATION})")
            return EXIT_UNSTATED_LAMINATION
        return 1

    payload = {
        **loss_point_inputs(coefficients),
        "specific_loss_w_per_kg": coefficients.specific_loss_w_per_kg(
            args.flux_density_t, args.frequency_hz),
        "evaluated_at": {"flux_density_t": args.flux_density_t,
                         "frequency_hz": args.frequency_hz},
        "eddy_at_reference_w_per_kg": coefficients.eddy_at_reference_w_per_kg,
        "hysteresis_at_reference_w_per_kg":
            coefficients.hysteresis_at_reference_w_per_kg,
        "reproduces_reference_w_per_kg":
            coefficients.reproduces_reference_w_per_kg,
        "lamination": asdict(spec),
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(f"[lamination] {spec.grade}  {spec.thickness_m * 1e3:.2f} mm  "
              f"rho={spec.resistivity_ohm_m:.3g} ohm.m  "
              f"{spec.density_kg_m3:.0f} kg/m3")
        print(f"[lamination] kh={coefficients.steinmetz_kh:.5f}  "
              f"ke={coefficients.steinmetz_ke:.4e}  "
              f"alpha={coefficients.steinmetz_alpha}")
        print(f"[lamination] reproduces the grade guarantee: "
              f"{coefficients.reproduces_reference_w_per_kg:.4f} W/kg vs "
              f"{spec.reference_loss_w_per_kg:.2f} guaranteed")
        print(f"[lamination] at {args.flux_density_t} T / {args.frequency_hz} Hz"
              f" -> {payload['specific_loss_w_per_kg']:.2f} W/kg")
        print(f"[lamination] provenance: {spec.provenance}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
