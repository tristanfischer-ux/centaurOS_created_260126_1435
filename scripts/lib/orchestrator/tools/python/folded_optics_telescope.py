#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/folded_optics_telescope.py

Folded-optics multiplier — TMA, Cassegrain, Korsch, Three-Mirror Anastigmat
configurations. Computes effective focal length, stowed length, MTF and mass.

Companies served: SuperSharp Space Systems (Cambridge UK), Polar Photonics,
Argotec (IT), space-telescope integrators.

Input:
    {
      "aperture_mm": 350.0,
      "num_fold_mirrors": 3,
      "primary_mirror_curvature_m": 1.5,
      "focal_length_m": 5.0,
      "config": "Cassegrain" | "TMA" | "Korsch" | "Ritchey_Chretien",
      "wavelength_nm": 550.0,
      "secondary_obscuration_pct": 25.0
    }

Output:
    effective_focal_length_m, stowed_length_mm, MTF_at_nyquist,
    mass_kg, primary_mirror_f_number, plate_scale_arcsec_per_um,
    _provenance.

Physics:
  Folded-optics multiplier: EFL = M_telephoto * physical_length
  TMA telephoto ratio typically 3-5x
  Diffraction MTF at nyquist:
    MTF_diffraction = 1 - (2/pi)(phi - sin(phi))
  where phi = arccos(nu / nu_cutoff)
  Mass scales as D^2.5 (Stahl 2010 fit for space telescope mirrors)

References:
- Korsch, D., "Reflective Optics", Academic Press 1991.
- Wilson, R.N., "Reflecting Telescope Optics II", Springer 1999.
- Stahl, H.P. et al., "Multivariable parametric cost model for ground and space
  telescopes", NASA TM-2010-216433, 2010.
- Smith, W.J., "Modern Optical Engineering", 4th ed., McGraw-Hill 2008.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


PROVENANCE = {
    "tool_name": "folded_optics_telescope (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Korsch (1991) 'Reflective Optics' Academic Press; "
        "Wilson (1999) 'Reflecting Telescope Optics II' Springer; "
        "Stahl et al. (2010) NASA TM-2010-216433 'Multivariable parametric "
        "cost model for ground and space telescopes'; "
        "Smith (2008) 'Modern Optical Engineering' 4th ed. McGraw-Hill."
    ),
    "physics_basis": (
        "Cassegrain/TMA folded-optics geometry. Diffraction-limited MTF "
        "from circular aperture with central obscuration. Mass scaling "
        "from Stahl 2010 NASA telescope cost model (D^2.5)."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "STAHL_MASS_COEFF": {
            "source": "Stahl 2010 NASA TM-2010-216433 — M = 21 * D^2.5 [kg, m]",
            "confidence": "textbook",
        },
        "TELEPHOTO_RATIO": {
            "source": "Korsch ch.5 — Cassegrain typical 2-4x; TMA 3-5x; Korsch 4-7x",
            "confidence": "industry_typical",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Telephoto ratio = EFL / physical_length_of_telescope_tube
TELEPHOTO_RATIO = {
    "Cassegrain": 3.0,
    "TMA":         4.0,
    "Korsch":      5.5,
    "Ritchey_Chretien": 3.5,
    "Folded_Schmidt":   2.5,
}

# Mirror count by configuration
NUM_MIRRORS = {
    "Cassegrain":       2,
    "TMA":              3,
    "Korsch":           3,
    "Ritchey_Chretien": 2,
    "Folded_Schmidt":   2,
}


def compute(payload: dict) -> dict:
    aperture_mm = float(payload.get("aperture_mm", 350.0))
    num_fold = int(payload.get("num_fold_mirrors", 3))
    R_primary = float(payload.get("primary_mirror_curvature_m", 1.5))
    focal_length_m = float(payload.get("focal_length_m", 5.0))
    config = str(payload.get("config", "Cassegrain"))
    wavelength_nm = float(payload.get("wavelength_nm", 550.0))
    obscuration_pct = float(payload.get("secondary_obscuration_pct", 25.0))

    if config not in TELEPHOTO_RATIO:
        # Default to Cassegrain
        config = "Cassegrain"

    aperture_m = aperture_mm / 1000.0
    telephoto = TELEPHOTO_RATIO[config]

    # Physical length of telescope tube
    physical_length_m = focal_length_m / telephoto
    stowed_length_mm = physical_length_m * 1000.0

    # F-number of primary mirror (assuming R_primary = 2 * f_primary)
    f_primary_m = R_primary / 2.0
    f_primary_number = f_primary_m / aperture_m

    # Plate scale at focus (arcsec / um)
    plate_scale_arcsec_per_mm = 206265.0 / (focal_length_m * 1000.0)
    plate_scale_arcsec_per_um = plate_scale_arcsec_per_mm / 1000.0

    # Diffraction limit at lambda
    lambda_m = wavelength_nm * 1e-9
    airy_disk_first_zero_urad = 1.22 * lambda_m / aperture_m  # rad
    airy_disk_first_zero_arcsec = airy_disk_first_zero_urad * (180.0 / math.pi) * 3600.0

    # MTF cutoff frequency: nu_cut = D / (lambda * F)
    # At a detector of pixel p_um, Nyquist = 1/(2*p_um) cycles/mm
    nyquist_pixel_size_um = float(payload.get("nyquist_pixel_size_um", 6.0))
    nyquist_cycles_per_mm = 1.0 / (2.0 * nyquist_pixel_size_um * 1e-3)
    f_number = focal_length_m / aperture_m
    nu_cutoff_cycles_per_mm = 1.0 / (wavelength_nm * 1e-6 * f_number)

    # Normalised frequency
    nu_norm = min(0.999, nyquist_cycles_per_mm / nu_cutoff_cycles_per_mm)
    # Unobstructed MTF
    phi = math.acos(nu_norm)
    mtf_unobscured = (2.0 / math.pi) * (phi - math.sin(phi) * math.cos(phi))
    # Obscuration penalty (small angular obscuration epsilon)
    epsilon = obscuration_pct / 100.0
    obscuration_factor = 1.0 - (epsilon ** 2) * 1.5  # simplified
    mtf_at_nyquist = mtf_unobscured * max(0.0, obscuration_factor)

    # Mass scaling (Stahl 2010, NASA TM-2010-216433)
    # M = 21 * D^2.5 [kg, m] for primary mirror
    mass_primary = 21.0 * aperture_m ** 2.5
    # Plus secondary + structure + fold mirrors
    mass_secondary = mass_primary * 0.15
    mass_structure = mass_primary * 1.2
    mass_fold = num_fold * 2.0 * aperture_m ** 2 * 5.0  # 5 kg/m^2 fold mirrors
    mass_total_kg = mass_primary + mass_secondary + mass_structure + mass_fold

    # Effective focal length (same as f, but with telephoto multiplier)
    effective_focal_length_m = focal_length_m

    stowed_r = round(stowed_length_mm, 1)
    f_num_r = round(f_number, 2)
    f_prim_r = round(f_primary_number, 2)
    ps_arcsec_mm_r = round(plate_scale_arcsec_per_mm, 4)
    # Round to 4 dp so ps_mm / 1000 evaluates within 0.5% of the stated result.
    ps_arcsec_um_r = round(plate_scale_arcsec_per_um, 4)
    airy_r = round(airy_disk_first_zero_arcsec, 3)

    worked = [
        worked_calc(
            label="Stowed (physical) tube length",
            formula="L_stow = f / telephoto_ratio x 1000",
            values={"f": (focal_length_m, "m"), "telephoto_ratio": (telephoto, "")},
            result=stowed_r, result_unit="mm",
            assumptions=[
                f"telephoto ratio for {config} from Korsch (1991) Table 5.1; x 1000 converts m to mm",
            ],
        ),
        worked_calc(
            label="System f-number",
            formula="f_num = f / D",
            values={"f": (focal_length_m, "m"), "D": (aperture_m, "m")},
            result=f_num_r, result_unit="",
            assumptions=["D = aperture_mm / 1000"],
        ),
        worked_calc(
            label="Primary mirror focal length",
            formula="f_prim = R_primary / 2",
            values={"R_primary": (R_primary, "m")},
            result=round(f_primary_m, 4), result_unit="m",
            assumptions=["f = R / 2 for spherical mirror (paraxial)"],
        ),
        worked_calc(
            label="Primary mirror f-number",
            formula="f_num_prim = f_prim / D",
            values={"f_prim": (round(f_primary_m, 4), "m"), "D": (aperture_m, "m")},
            result=f_prim_r, result_unit="",
            assumptions=[],
        ),
        worked_calc(
            label="Plate scale",
            formula="ps_mm = 206265 / (f x 1000)",
            values={"f": (focal_length_m, "m")},
            result=ps_arcsec_mm_r, result_unit="arcsec/mm",
            assumptions=["206265 arcsec per radian; f in mm = f_m x 1000"],
        ),
        worked_calc(
            label="Plate scale per micron",
            formula="ps_um = ps_mm / 1000",
            values={"ps_mm": (ps_arcsec_mm_r, "arcsec/mm")},
            result=ps_arcsec_um_r, result_unit="arcsec/um",
            assumptions=["1 mm = 1000 um"],
        ),
        worked_calc(
            label="Airy disk first zero (angular resolution)",
            formula="theta_arcsec = 1.22 x lambda_m / D_m x 206265",
            values={
                "lambda_m": (round(lambda_m, 11), "m"),
                "D_m": (aperture_m, "m"),
            },
            result=airy_r, result_unit="arcsec",
            assumptions=[
                "lambda_m = wavelength_nm x 1e-9; D_m = aperture_mm / 1000; "
                "x 206265 converts radians to arcseconds",
            ],
        ),
    ]

    return {
        "aperture_mm": aperture_mm,
        "num_fold_mirrors": num_fold,
        "config": config,
        "wavelength_nm": wavelength_nm,
        "secondary_obscuration_pct": obscuration_pct,
        "physical_focal_length_m": focal_length_m,
        "effective_focal_length_m": effective_focal_length_m,
        "telephoto_ratio": telephoto,
        "stowed_length_mm": stowed_r,
        "f_number_system": f_num_r,
        "primary_mirror_f_number": f_prim_r,
        "plate_scale_arcsec_per_um": ps_arcsec_um_r,  # 4 dp: self-consistent with ps_mm / 1000
        "airy_disk_first_zero_arcsec": airy_r,
        "nu_cutoff_cycles_per_mm": round(nu_cutoff_cycles_per_mm, 2),
        "nyquist_cycles_per_mm": round(nyquist_cycles_per_mm, 2),
        "MTF_at_nyquist": round(mtf_at_nyquist, 3),
        "MTF_at_nyquist_unobscured": round(mtf_unobscured, 3),
        "mass_primary_kg": round(mass_primary, 2),
        "mass_total_kg": round(mass_total_kg, 1),
        "num_mirrors_config": NUM_MIRRORS.get(config, 2),
        "worked": worked,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
