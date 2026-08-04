#!/usr/bin/env python3
"""DC-link capacitor concept screen (W2.1) — ranges, not a BOM.

Analytical design-space only. No MPN, no lifetime claim, no committed volume.
ship_ok stays false. Writes twin _motor_stack JSON + optional state stamp under
open stage when --write-twin is set.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
OUT_NAME = "dc_link_capacitor_concept_screen.json"


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_twin_inputs(twin: Path) -> dict[str, float]:
    q = json.loads((twin / "state.json").read_text())["orchestratorContract"]["quantities"]

    def g(key: str, default: float) -> float:
        row = q.get(key)
        if isinstance(row, dict) and row.get("value") is not None:
            return float(row["value"])
        return float(default)

    return {
        "v_dc": g("dc_bus_voltage_v", 750.0),
        "i_ph_rms": g("phase_current_design_a", 535.0),
        "p_elec_kw": g("front_regen_electrical_cap_kw", 250.0),
        "eta_inv": g("inverter_efficiency", 0.98766),
    }


def screen(inp: dict[str, float]) -> dict[str, Any]:
    """Ripple / energy sizing with sensitivity band — not a single part.

    Model (order-of-magnitude, documented):
      I_dc ≈ P / V_dc
      C_min ≈ I_dc / (2 π f_sw ΔV) for first-order bus ripple (conservative envelope)
    PWM class is an ASSUMPTION range (not measured).
    """
    v = inp["v_dc"]
    p_w = inp["p_elec_kw"] * 1000.0
    i_dc = p_w / max(v, 1.0)

    # Assumption table (explicit)
    assumptions = {
        "dc_bus_voltage_v": {"value": v, "status": "twin_seed", "source": "state.dc_bus_voltage_v"},
        "electrical_power_kw": {"value": inp["p_elec_kw"], "status": "twin_seed"},
        "phase_current_design_a_rms": {"value": inp["i_ph_rms"], "status": "twin_seed"},
        "pwm_switching_frequency_khz": {
            "low": 8.0,
            "nom": 12.0,
            "high": 20.0,
            "status": "ASSUMED_CONCEPT_range",
            "note": "Not measured; FE SiC class typically 8–20 kHz. Sensitivity only.",
        },
        "allowable_bus_ripple_fraction": {
            "low": 0.01,
            "nom": 0.02,
            "high": 0.05,
            "status": "ASSUMED_CONCEPT_range",
            "note": "ΔV/V targets 1–5% for concept envelope — not a supplier limit.",
        },
        "film_cap_energy_density_j_per_cm3": {
            "low": 0.5,
            "nom": 1.0,
            "high": 1.5,
            "status": "ASSUMED_CONCEPT_class",
            "note": "Order-of-magnitude film bank packing — not a datasheet.",
        },
    }

    def c_min(f_hz: float, dv_frac: float) -> float:
        dv = max(v * dv_frac, 1.0)
        # C = I / (2 π f ΔV)  [F]
        return i_dc / (2.0 * math.pi * f_hz * dv)

    cases = []
    for f_khz in (8.0, 12.0, 20.0):
        for dv_frac in (0.01, 0.02, 0.05):
            c_f = c_min(f_khz * 1e3, dv_frac)
            c_uF = c_f * 1e6
            # Energy ½CV²
            e_j = 0.5 * c_f * v * v
            vol_cm3 = {
                "low": e_j / 1.5,
                "nom": e_j / 1.0,
                "high": e_j / 0.5,
            }
            cases.append(
                {
                    "f_sw_khz": f_khz,
                    "dv_frac": dv_frac,
                    "c_min_uF": round(c_uF, 1),
                    "energy_j": round(e_j, 2),
                    "volume_cm3_band": {k: round(v, 1) for k, v in vol_cm3.items()},
                }
            )

    # Summary envelope across cases
    c_vals = [c["c_min_uF"] for c in cases]
    vol_noms = [c["volume_cm3_band"]["nom"] for c in cases]
    # RMS ripple current order: ~0.5–0.7 × I_dc for three-phase (coarse)
    i_ripple_rms = {
        "low": round(0.45 * i_dc, 1),
        "nom": round(0.55 * i_dc, 1),
        "high": round(0.70 * i_dc, 1),
        "unit": "A_rms",
        "status": "ASSUMED_CONCEPT_order_of_magnitude",
    }
    esl_budget_nh = {
        "target_band": [3.0, 15.0],
        "seed_from_packaging_screen_nh": 6.39,
        "status": "OPEN_measured_double_pulse",
        "note": "Matches inverter packaging ESL seed; measurement is Bar B DOUBLE-PULSE.",
    }

    return {
        "schema": "forgeos.fpk.dc_link_capacitor_concept_screen/v1",
        "status": "PARTIAL_ANALYTICAL_SCREEN",
        "ship_ok": False,
        "evidence_class": "twin_bound_analytical_design_space",
        "ran_at": _iso(),
        "inputs": inp,
        "derived": {
            "i_dc_a": round(i_dc, 2),
            "formula_c_min": "C_min = I_dc / (2·π·f_sw·ΔV), ΔV = dv_frac·V_dc",
        },
        "assumptions": assumptions,
        "sensitivity_cases": cases,
        "envelope": {
            "c_min_uF": {"min": round(min(c_vals), 1), "max": round(max(c_vals), 1)},
            "volume_cm3_nom_band": {
                "min": round(min(vol_noms), 1),
                "max": round(max(vol_noms), 1),
            },
            "i_ripple_rms_a": i_ripple_rms,
            "esl_nh": esl_budget_nh,
        },
        "explicitly_not_claimed": [
            "supplier_MPN",
            "committed_volume_or_CAD_box",
            "capacitor_lifetime_hours",
            "qualified_ripple_current_datasheet",
            "measured_ESL",
            "ship_ok",
            "Bar_B_closed",
        ],
        "partner_ask_stub": {
            "artefact": "SiC module MPN + preferred film capacitor class datasheets + laminated bus STEP",
            "unblocks": "BARB-SIC-MODULE, BARB-DOUBLE-PULSE, packaging freeze",
            "already_have": "This analytical envelope + packaging ESL seed",
        },
        "release_statement": (
            "Concept design-space only. Numbers are sensitivity envelopes under "
            "named PWM/ripple assumptions. No capacitor is selected. ship_ok false."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        r = screen({"v_dc": 750.0, "i_ph_rms": 535.0, "p_elec_kw": 250.0, "eta_inv": 0.99})
        assert r["ship_ok"] is False
        assert r["envelope"]["c_min_uF"]["min"] > 0
        assert "supplier_MPN" in r["explicitly_not_claimed"]
        print("dc_link_capacitor_concept_screen selftest: OK")
        return 0

    twin = args.twin.resolve()
    rep = screen(_load_twin_inputs(twin))
    rep["source_twin"] = str(twin)
    out = twin / "_motor_stack" / OUT_NAME
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rep, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"wrote": str(out), "c_uF_band": rep["envelope"]["c_min_uF"], "ship_ok": False}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
