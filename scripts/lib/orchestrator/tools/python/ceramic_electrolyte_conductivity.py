#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/ceramic_electrolyte_conductivity.py

Solid-state electrolyte ionic conductivity model (LLZO, Li-S, LiPON).

Input:
    {
      "material": "LLZO",        // LLZO | LiPON | sulfide | LATP | LISICON
      "temperature_c": 25,
      "grain_boundary_pct": 30
    }

Output:
    {
      "ionic_conductivity_s_cm": ...,
      "activation_energy_ev": ...,
      "conductivity_at_25c_s_cm": ...,
      ...
    }

Physics (Knauth 2009; Bachman et al. 2016):
- Arrhenius: σ(T) = σ_0 × exp(-Ea / kT).
- Bulk vs grain-boundary: σ_eff = (1 - f_GB)·σ_bulk + f_GB·σ_GB.
- LLZO (Li_7 La_3 Zr_2 O_12) cubic phase: σ ≈ 1e-3 S/cm at 25°C.
- Sulfide LPSCl: σ ≈ 1e-2 S/cm at 25°C (highest).
- LiPON thin-film: σ ≈ 3e-6 S/cm (lowest among practical solid electrolytes).

References:
- Knauth (2009) "Inorganic solid Li ion conductors: An overview," Solid
  State Ionics 180, 911.
- Bachman et al. (2016) "Inorganic Solid-State Electrolytes for Lithium
  Batteries," Chem. Rev. 116, 140.
- Murugan, Thangadurai, Weppner (2007) "Fast lithium ion conduction in
  garnet-type Li7La3Zr2O12," Angew. Chem. Int. Ed. 46, 7778.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "ceramic_electrolyte_conductivity (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Knauth (2009) Solid State Ionics 180 911; Bachman et al. (2016) Chem. Rev. 116 140",
    "physics_basis": "Arrhenius ionic conductivity σ(T) = σ_0 × exp(-Ea/kT); grain-boundary impedance mix.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

K_BOLTZ_EV_K = 8.617e-5  # eV/K

# Material parameters: (σ_0_bulk_s_cm, Ea_bulk_eV, σ_0_GB_s_cm, Ea_GB_eV)
MATERIALS = {
    "llzo":     (5.0,  0.30, 1.0,  0.50),  # cubic Li7La3Zr2O12
    "lipon":    (0.05, 0.55, 0.05, 0.55),  # amorphous thin-film
    "sulfide":  (200.0, 0.20, 50.0, 0.30), # Li10GeP2S12 / LPSCl
    "latp":     (5.0,  0.35, 1.0,  0.65),  # Li1.3Al0.3Ti1.7(PO4)3
    "lisicon":  (1.0,  0.40, 0.5,  0.55),  # Li14Zn(GeO4)4 framework
    "argyrodite": (200.0, 0.22, 50.0, 0.32),  # Li6PS5Cl class
}


def compute(payload: dict) -> dict:
    material = str(payload.get("material", "LLZO")).lower()
    T_c = float(payload.get("temperature_c", 25.0))
    f_gb_pct = float(payload.get("grain_boundary_pct", 30.0))

    if material not in MATERIALS:
        material = "llzo"

    sigma0_bulk, Ea_bulk, sigma0_gb, Ea_gb = MATERIALS[material]
    T_k = T_c + 273.15

    sigma_bulk = sigma0_bulk * math.exp(-Ea_bulk / (K_BOLTZ_EV_K * T_k))
    sigma_gb = sigma0_gb * math.exp(-Ea_gb / (K_BOLTZ_EV_K * T_k))

    # Effective conductivity: series mix of bulk + grain boundary
    # σ_eff = 1 / ((1-f)/σ_bulk + f/σ_GB)
    f_gb = f_gb_pct / 100.0
    if f_gb > 0:
        sigma_eff = 1.0 / ((1 - f_gb) / max(1e-30, sigma_bulk) + f_gb / max(1e-30, sigma_gb))
    else:
        sigma_eff = sigma_bulk

    # Conductivity at 25°C for reference
    T_25_k = 298.15
    sigma_bulk_25 = sigma0_bulk * math.exp(-Ea_bulk / (K_BOLTZ_EV_K * T_25_k))
    sigma_eff_25 = sigma_bulk_25  # bulk only at reference

    # Apparent activation energy (combined)
    if sigma_bulk > 1e-30 and sigma_gb > 1e-30:
        Ea_apparent = Ea_bulk * (1 - f_gb) + Ea_gb * f_gb
    else:
        Ea_apparent = Ea_bulk

    # Resistance area: ASR (Ω·cm²) at a given thickness
    thickness_um = 100  # typical solid electrolyte film
    thickness_cm = thickness_um * 1e-4
    ASR_ohm_cm2 = thickness_cm / max(1e-30, sigma_eff)

    return {
        "material": material,
        "temperature_c": T_c,
        "grain_boundary_pct": f_gb_pct,
        "ionic_conductivity_s_cm": float(f"{sigma_eff:.3e}"),
        "ionic_conductivity_bulk_s_cm": float(f"{sigma_bulk:.3e}"),
        "ionic_conductivity_gb_s_cm": float(f"{sigma_gb:.3e}"),
        "ionic_conductivity_at_25c_s_cm": float(f"{sigma_eff_25:.3e}"),
        "activation_energy_ev": round(Ea_bulk, 3),
        "activation_energy_gb_ev": round(Ea_gb, 3),
        "activation_energy_apparent_ev": round(Ea_apparent, 3),
        "ASR_at_100um_ohm_cm2": round(ASR_ohm_cm2, 2),
        "conductivity_pre_exponent_bulk_s_cm": sigma0_bulk,
        "competitive_with_liquid_electrolyte": sigma_eff > 1e-3,
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
