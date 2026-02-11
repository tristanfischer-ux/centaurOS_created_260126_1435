"""
Modal Premium Analysis Worker for ForgeOS Product X-Ray — Phase 4
=================================================================

Performs specialized engineering analyses available in the premium tier:
1. EMI/EMC shielding effectiveness estimation
2. Fatigue life estimation under cyclic loading
3. Simplified crash/impact analysis

These analyses use analytical/empirical methods rather than full simulation
to provide rapid engineering insight at reasonable compute cost.

Deploy:
    modal deploy modal_premium_worker.py

Container stack:
    Miniconda + CadQuery 2.4 + numpy + scipy + matplotlib
"""

import modal
import base64
import json
import math
import os
import tempfile

# ─── Container Image ──────────────────────────────────────────────────

premium_image = (
    modal.Image.from_registry("continuumio/miniconda3:24.7.1-0")
    .run_commands(
        "apt-get update -qq && apt-get install -y -qq libosmesa6 libgl1-mesa-glx libglu1-mesa && apt-get clean",
        "conda install -y -c conda-forge python=3.11 cadquery=2.4 "
        "matplotlib=3.8 numpy=1.26 scipy=1.12 Pillow -q",
        "conda clean -afy",
    )
    .pip_install("fastapi[standard]")
)

app = modal.App("forgeos-premium")


# ─── EMI/EMC Shielding Analysis ──────────────────────────────────────

EMI_MATERIALS = {
    "aluminum_6061": {"conductivity_S_m": 2.5e7, "permeability_rel": 1.0, "thickness_mm": 2.0},
    "steel_mild": {"conductivity_S_m": 6.99e6, "permeability_rel": 100.0, "thickness_mm": 1.5},
    "copper": {"conductivity_S_m": 5.96e7, "permeability_rel": 1.0, "thickness_mm": 1.0},
    "titanium": {"conductivity_S_m": 2.38e6, "permeability_rel": 1.0, "thickness_mm": 2.0},
    "carbon_fiber": {"conductivity_S_m": 1e4, "permeability_rel": 1.0, "thickness_mm": 3.0},
    # Non-conductive materials provide no EMI shielding
    "pla": {"conductivity_S_m": 0, "permeability_rel": 1.0, "thickness_mm": 0},
    "abs": {"conductivity_S_m": 0, "permeability_rel": 1.0, "thickness_mm": 0},
    "petg": {"conductivity_S_m": 0, "permeability_rel": 1.0, "thickness_mm": 0},
    "nylon": {"conductivity_S_m": 0, "permeability_rel": 1.0, "thickness_mm": 0},
    "default": {"conductivity_S_m": 0, "permeability_rel": 1.0, "thickness_mm": 0},
}


def calculate_shielding_effectiveness(
    material_key: str,
    frequencies_Hz: list[float] | None = None,
    wall_thickness_mm: float | None = None,
) -> dict:
    """
    Calculate EMI shielding effectiveness using the Schelkunoff model.

    SE = SE_absorption + SE_reflection + SE_re-reflection (dB)

    For planar shields:
    - SE_absorption = 8.686 * t / skin_depth
    - SE_reflection = 20*log10(eta_0 / (4 * eta_s))
    - SE_re-reflection ≈ 0 for thick shields

    @param material_key: Material identifier
    @param frequencies_Hz: Frequencies to evaluate (default: log range 10kHz to 10GHz)
    @param wall_thickness_mm: Override wall thickness
    @returns: Shielding effectiveness at each frequency
    """
    import numpy as np

    mat = EMI_MATERIALS.get(material_key, EMI_MATERIALS["default"])
    sigma = mat["conductivity_S_m"]
    mu_r = mat["permeability_rel"]
    t_mm = wall_thickness_mm if wall_thickness_mm is not None else mat["thickness_mm"]
    t_m = t_mm / 1000.0

    if sigma <= 0 or t_mm <= 0:
        return {
            "error": None,
            "material_key": material_key,
            "is_conductive": False,
            "shielding_data": [],
            "summary": "Non-conductive material provides no EMI shielding",
            "overall_rating": "none",
            "recommendation": "Add conductive coating or shielding gasket for EMI protection",
        }

    if frequencies_Hz is None:
        frequencies_Hz = np.logspace(4, 10, 20).tolist()  # 10kHz to 10GHz

    mu_0 = 4 * math.pi * 1e-7
    mu = mu_0 * mu_r
    eta_0 = 377.0  # Free space impedance (ohms)

    results = []
    for f in frequencies_Hz:
        omega = 2 * math.pi * f
        skin_depth = math.sqrt(2 / (omega * mu * sigma)) if omega * mu * sigma > 0 else float("inf")

        # Absorption loss
        se_abs = 8.686 * (t_m / skin_depth) if skin_depth > 0 else 0

        # Reflection loss
        eta_s = math.sqrt(omega * mu / (2 * sigma)) if sigma > 0 else eta_0
        se_ref = 20 * math.log10(eta_0 / (4 * eta_s)) if eta_s > 0 else 0

        se_total = se_abs + se_ref

        results.append({
            "frequency_Hz": f,
            "frequency_label": _format_frequency(f),
            "se_total_dB": round(se_total, 1),
            "se_absorption_dB": round(se_abs, 1),
            "se_reflection_dB": round(se_ref, 1),
            "skin_depth_mm": round(skin_depth * 1000, 4),
        })

    # Overall rating
    se_at_1GHz = next((r["se_total_dB"] for r in results if r["frequency_Hz"] >= 1e9), 0)
    if se_at_1GHz >= 60:
        rating = "excellent"
        recommendation = "Meets MIL-STD-461G requirements for most applications"
    elif se_at_1GHz >= 40:
        rating = "good"
        recommendation = "Adequate for commercial EMC compliance (FCC/CE)"
    elif se_at_1GHz >= 20:
        rating = "moderate"
        recommendation = "May need additional shielding for sensitive electronics"
    elif se_at_1GHz > 0:
        rating = "poor"
        recommendation = "Insufficient for most EMC requirements, add shielding"
    else:
        rating = "none"
        recommendation = "No shielding provided, use conductive enclosure"

    return {
        "error": None,
        "material_key": material_key,
        "is_conductive": True,
        "wall_thickness_mm": t_mm,
        "shielding_data": results,
        "se_at_1GHz_dB": se_at_1GHz,
        "overall_rating": rating,
        "recommendation": recommendation,
    }


def _format_frequency(hz: float) -> str:
    """Format frequency in human-readable units."""
    if hz >= 1e9:
        return f"{hz / 1e9:.1f} GHz"
    elif hz >= 1e6:
        return f"{hz / 1e6:.1f} MHz"
    elif hz >= 1e3:
        return f"{hz / 1e3:.1f} kHz"
    return f"{hz:.0f} Hz"


# ─── Fatigue Life Estimation ──────────────────────────────────────────

FATIGUE_MATERIALS = {
    "aluminum_6061": {"S_ut_MPa": 310, "S_e_MPa": 96.5, "b": -0.085, "c": -0.69, "sigma_f_prime_MPa": 560, "epsilon_f_prime": 0.32},
    "steel_mild": {"S_ut_MPa": 400, "S_e_MPa": 200, "b": -0.087, "c": -0.58, "sigma_f_prime_MPa": 700, "epsilon_f_prime": 0.25},
    "titanium": {"S_ut_MPa": 950, "S_e_MPa": 380, "b": -0.095, "c": -0.69, "sigma_f_prime_MPa": 1400, "epsilon_f_prime": 0.40},
    "pla": {"S_ut_MPa": 50, "S_e_MPa": 15, "b": -0.12, "c": -0.80, "sigma_f_prime_MPa": 80, "epsilon_f_prime": 0.10},
    "abs": {"S_ut_MPa": 40, "S_e_MPa": 12, "b": -0.12, "c": -0.80, "sigma_f_prime_MPa": 65, "epsilon_f_prime": 0.08},
    "nylon": {"S_ut_MPa": 70, "S_e_MPa": 25, "b": -0.10, "c": -0.70, "sigma_f_prime_MPa": 100, "epsilon_f_prime": 0.20},
    "carbon_fiber": {"S_ut_MPa": 600, "S_e_MPa": 240, "b": -0.05, "c": -0.50, "sigma_f_prime_MPa": 800, "epsilon_f_prime": 0.15},
    "default": {"S_ut_MPa": 50, "S_e_MPa": 15, "b": -0.12, "c": -0.80, "sigma_f_prime_MPa": 80, "epsilon_f_prime": 0.10},
}


def estimate_fatigue_life(
    material_key: str,
    max_stress_MPa: float,
    min_stress_MPa: float = 0.0,
    stress_concentration_factor: float = 1.5,
    surface_factor: float = 0.8,
    reliability_factor: float = 0.897,  # 90% reliability
) -> dict:
    """
    Estimate fatigue life using the Basquin-Coffin-Manson equation with
    Goodman mean stress correction.

    @param material_key: Material identifier
    @param max_stress_MPa: Maximum cyclic stress
    @param min_stress_MPa: Minimum cyclic stress (0 for zero-to-max loading)
    @param stress_concentration_factor: Kt (geometric stress concentration)
    @param surface_factor: Surface finish correction factor
    @param reliability_factor: Reliability correction factor
    @returns: Fatigue life estimation
    """
    import numpy as np

    mat = FATIGUE_MATERIALS.get(material_key, FATIGUE_MATERIALS["default"])

    # Stress parameters
    sigma_max = max_stress_MPa * stress_concentration_factor
    sigma_min = min_stress_MPa * stress_concentration_factor
    sigma_a = (sigma_max - sigma_min) / 2  # Stress amplitude
    sigma_m = (sigma_max + sigma_min) / 2  # Mean stress
    R_ratio = sigma_min / sigma_max if sigma_max != 0 else 0

    # Corrected endurance limit
    S_e = mat["S_e_MPa"] * surface_factor * reliability_factor

    # Goodman mean stress correction
    S_ut = mat["S_ut_MPa"]
    if sigma_m >= S_ut:
        return {
            "error": None,
            "cycles_to_failure": 0,
            "life_category": "immediate_failure",
            "description": "Mean stress exceeds ultimate tensile strength",
            "safety_factor": 0,
        }

    # Equivalent fully-reversed stress (Goodman)
    sigma_ar = sigma_a / (1 - sigma_m / S_ut) if S_ut > sigma_m else float("inf")

    # Check infinite life
    if sigma_ar <= S_e:
        return {
            "error": None,
            "cycles_to_failure": float("inf"),
            "cycles_to_failure_label": "> 10^6 (infinite life)",
            "life_category": "infinite",
            "description": "Stress is below endurance limit — infinite fatigue life expected",
            "safety_factor": round(S_e / sigma_ar, 2),
            "endurance_limit_MPa": round(S_e, 1),
            "equivalent_stress_MPa": round(sigma_ar, 1),
            "stress_amplitude_MPa": round(sigma_a, 1),
            "mean_stress_MPa": round(sigma_m, 1),
            "R_ratio": round(R_ratio, 3),
        }

    # Finite life — Basquin equation: sigma_a = sigma_f' * (2*Nf)^b
    sigma_f_prime = mat["sigma_f_prime_MPa"]
    b = mat["b"]

    # Solve for Nf: Nf = 0.5 * (sigma_ar / sigma_f')^(1/b)
    if sigma_f_prime > 0 and b != 0:
        Nf = 0.5 * (sigma_ar / sigma_f_prime) ** (1 / b)
        Nf = max(Nf, 1)  # At least 1 cycle
    else:
        Nf = 1

    # Categorize life
    if Nf < 1e3:
        category = "low_cycle"
        desc = "Low cycle fatigue — significant plastic deformation expected"
    elif Nf < 1e5:
        category = "medium_cycle"
        desc = "Medium cycle fatigue — redesign recommended"
    elif Nf < 1e6:
        category = "high_cycle"
        desc = "High cycle fatigue — adequate for most applications"
    else:
        category = "very_high_cycle"
        desc = "Very high cycle fatigue — excellent fatigue performance"

    return {
        "error": None,
        "cycles_to_failure": round(Nf),
        "cycles_to_failure_label": f"{Nf:.2e}" if Nf >= 1e4 else str(round(Nf)),
        "life_category": category,
        "description": desc,
        "safety_factor": round(S_e / sigma_ar, 2) if sigma_ar > 0 else 0,
        "endurance_limit_MPa": round(S_e, 1),
        "equivalent_stress_MPa": round(sigma_ar, 1),
        "stress_amplitude_MPa": round(sigma_a, 1),
        "mean_stress_MPa": round(sigma_m, 1),
        "R_ratio": round(R_ratio, 3),
    }


# ─── Crash / Impact Analysis ─────────────────────────────────────────

IMPACT_MATERIALS = {
    "pla": {"energy_absorption_J_cm3": 3.5, "fracture_strain": 0.04, "impact_strength_kJ_m2": 5.0},
    "abs": {"energy_absorption_J_cm3": 8.0, "fracture_strain": 0.10, "impact_strength_kJ_m2": 20.0},
    "petg": {"energy_absorption_J_cm3": 6.0, "fracture_strain": 0.08, "impact_strength_kJ_m2": 8.0},
    "nylon": {"energy_absorption_J_cm3": 15.0, "fracture_strain": 0.30, "impact_strength_kJ_m2": 50.0},
    "aluminum_6061": {"energy_absorption_J_cm3": 50.0, "fracture_strain": 0.12, "impact_strength_kJ_m2": 150.0},
    "steel_mild": {"energy_absorption_J_cm3": 100.0, "fracture_strain": 0.25, "impact_strength_kJ_m2": 200.0},
    "titanium": {"energy_absorption_J_cm3": 80.0, "fracture_strain": 0.10, "impact_strength_kJ_m2": 180.0},
    "carbon_fiber": {"energy_absorption_J_cm3": 20.0, "fracture_strain": 0.015, "impact_strength_kJ_m2": 30.0},
    "default": {"energy_absorption_J_cm3": 3.5, "fracture_strain": 0.04, "impact_strength_kJ_m2": 5.0},
}


def estimate_impact_resistance(
    material_key: str,
    mass_kg: float,
    volume_mm3: float,
    impact_velocity_m_s: float = 5.0,
    drop_height_m: float | None = None,
) -> dict:
    """
    Estimate crash/impact resistance using energy-based methods.

    Compares kinetic energy of impact with material's energy absorption capacity.

    @param material_key: Material identifier
    @param mass_kg: Part mass in kg
    @param volume_mm3: Part volume in mm³
    @param impact_velocity_m_s: Impact velocity (or computed from drop height)
    @param drop_height_m: Drop height in meters (alternative to velocity)
    @returns: Impact resistance assessment
    """
    mat = IMPACT_MATERIALS.get(material_key, IMPACT_MATERIALS["default"])

    # Compute impact velocity from drop height if given
    if drop_height_m is not None:
        impact_velocity_m_s = math.sqrt(2 * 9.81 * drop_height_m)

    # Kinetic energy of impact
    KE_J = 0.5 * mass_kg * impact_velocity_m_s ** 2

    # Material energy absorption capacity
    volume_cm3 = volume_mm3 / 1000.0
    energy_capacity_J = mat["energy_absorption_J_cm3"] * volume_cm3

    # Safety factor
    sf = energy_capacity_J / KE_J if KE_J > 0 else float("inf")

    # Rating
    if sf >= 3.0:
        rating = "excellent"
        desc = "Part can absorb impact energy with large safety margin"
    elif sf >= 1.5:
        rating = "adequate"
        desc = "Part can absorb impact energy with moderate safety margin"
    elif sf >= 1.0:
        rating = "marginal"
        desc = "Impact energy approaches material capacity — risk of damage"
    else:
        rating = "insufficient"
        desc = "Impact energy exceeds material capacity — part will likely fracture"

    return {
        "error": None,
        "impact_velocity_m_s": round(impact_velocity_m_s, 2),
        "kinetic_energy_J": round(KE_J, 3),
        "energy_absorption_capacity_J": round(energy_capacity_J, 3),
        "safety_factor": round(sf, 2),
        "impact_strength_kJ_m2": mat["impact_strength_kJ_m2"],
        "fracture_strain": mat["fracture_strain"],
        "rating": rating,
        "description": desc,
        "material_key": material_key,
    }


# ─── Visualization ────────────────────────────────────────────────────

def generate_emi_plot(results: dict) -> str | None:
    """Generate EMI shielding effectiveness frequency response plot."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    import tempfile

    data = results.get("shielding_data", [])
    if not data:
        return None

    fig, ax = plt.subplots(figsize=(8, 5))

    freqs = [d["frequency_Hz"] for d in data]
    se_total = [d["se_total_dB"] for d in data]
    se_abs = [d["se_absorption_dB"] for d in data]
    se_ref = [d["se_reflection_dB"] for d in data]

    ax.semilogx(freqs, se_total, "o-", color="#FF4500", linewidth=2, label="Total SE", markersize=4)
    ax.semilogx(freqs, se_abs, "--", color="#3B82F6", linewidth=1.5, label="Absorption", alpha=0.7)
    ax.semilogx(freqs, se_ref, "--", color="#10B981", linewidth=1.5, label="Reflection", alpha=0.7)

    # Reference lines
    ax.axhline(y=60, color="#94a3b8", linestyle=":", linewidth=1, alpha=0.5)
    ax.text(freqs[0], 62, "MIL-STD (60 dB)", fontsize=8, color="#94a3b8")
    ax.axhline(y=20, color="#94a3b8", linestyle=":", linewidth=1, alpha=0.5)
    ax.text(freqs[0], 22, "FCC/CE (20 dB)", fontsize=8, color="#94a3b8")

    ax.set_xlabel("Frequency (Hz)", fontsize=10)
    ax.set_ylabel("Shielding Effectiveness (dB)", fontsize=10)
    ax.set_title(f"EMI Shielding: {results.get('overall_rating', 'N/A').upper()}", fontsize=12, fontweight="bold")
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        fig.savefig(f.name, dpi=150, bbox_inches="tight")
        plt.close(fig)
        with open(f.name, "rb") as img:
            return base64.b64encode(img.read()).decode("ascii")


# ─── Combined Premium Analysis Endpoint ──────────────────────────────

@app.function(
    image=premium_image,
    timeout=120,
    memory=2048,
    cpu=1.0,
)
def run_premium_analysis(
    analysis_type: str,
    module_id: str,
    material_key: str = "pla",
    params: dict | None = None,
) -> dict:
    """
    Runs a premium analysis based on type.

    @param analysis_type: "emi", "fatigue", or "impact"
    @param module_id: Module identifier
    @param material_key: Material key
    @param params: Analysis-specific parameters
    @returns: Analysis results
    """
    params = params or {}

    if analysis_type == "emi":
        results = calculate_shielding_effectiveness(
            material_key,
            frequencies_Hz=params.get("frequencies_Hz"),
            wall_thickness_mm=params.get("wall_thickness_mm"),
        )
        emi_plot = generate_emi_plot(results) if results.get("is_conductive") else None
        results["visualization_b64"] = emi_plot
        return results

    elif analysis_type == "fatigue":
        return estimate_fatigue_life(
            material_key,
            max_stress_MPa=params.get("max_stress_MPa", 20.0),
            min_stress_MPa=params.get("min_stress_MPa", 0.0),
            stress_concentration_factor=params.get("Kt", 1.5),
            surface_factor=params.get("surface_factor", 0.8),
        )

    elif analysis_type == "impact":
        return estimate_impact_resistance(
            material_key,
            mass_kg=params.get("mass_kg", 0.1),
            volume_mm3=params.get("volume_mm3", 50000),
            impact_velocity_m_s=params.get("impact_velocity_m_s", 5.0),
            drop_height_m=params.get("drop_height_m"),
        )

    else:
        return {"error": f"Unknown analysis type: {analysis_type}"}


@app.function(
    image=premium_image,
    timeout=180,
    memory=2048,
    cpu=1.0,
)
@modal.web_endpoint(method="POST")
def run_premium_endpoint(item: dict) -> dict:
    """
    HTTP endpoint for premium analyses.

    POST body:
    {
        "analysis_type": "emi" | "fatigue" | "impact",
        "module_id": "module-123",
        "material_key": "aluminum_6061",
        "params": { ... analysis-specific ... }
    }
    """
    analysis_type = item.get("analysis_type")
    module_id = item.get("module_id", "unknown")
    material_key = item.get("material_key", "pla")
    params = item.get("params", {})

    if not analysis_type:
        return {"error": "analysis_type is required (emi, fatigue, or impact)"}

    try:
        return run_premium_analysis.remote(analysis_type, module_id, material_key, params)
    except Exception as e:
        return {"error": f"Premium analysis failed: {str(e)[:500]}"}


if __name__ == "__main__":
    print("Premium analysis worker ready.")
    print("Deploy with: modal deploy modal_premium_worker.py")
    print("Supports: EMI/EMC shielding, fatigue life, impact resistance")
