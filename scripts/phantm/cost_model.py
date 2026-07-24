"""PHANTM actuator — manufacture + cost model to the USD 0.10 target (§7).

Structure of the answer (confidence per line):
  * Materials are NEGLIGIBLE (<1 ¢ total — HIGH confidence, computed below).
  * The $0.10 target is entirely a PROCESS/VOLUME question: SMC net-shape
    pressing, micro-coil winding, magnet insertion + magnetisation, and —
    dominant — assembly to the working-gap tolerance. (Shape: HIGH confidence;
    absolute per-step costs: LOW confidence — industry-band estimates, not
    quotes.)
  * The FIXED design's 20 µm gap makes tolerance THE cost driver: FE variant
    data gives dF/dg ≈ −8 %/µm near 20–40 µm, so ±5 µm assembly scatter swings
    force ±40 % — priced as a yield/precision penalty vs the 77.5 µm baseline.

Run:  ~/.venvs/phantm/bin/python cost_model.py
"""

from __future__ import annotations

import json
import os

import geometry as geo
from params import BASELINE

OUT = os.path.join(os.path.dirname(__file__), "out")

# material prices, USD/kg (2026 industrial bands)
PRICE = {"smc": 6.0, "ndfeb": 90.0, "cu": 12.0}

# per-unit process cost bands (USD) by annual volume tier — industry estimates
# for fully-automated production of comparable micro-mechatronic parts
PROCESS_BANDS = {
    # tier:            (pressed SMC set, 3 micro-coils, 3 magnets ins+mag, assembly+test)
    "1M/yr":   ((0.030, 0.060), (0.060, 0.150), (0.020, 0.050), (0.080, 0.250)),
    "10M/yr":  ((0.010, 0.025), (0.030, 0.070), (0.010, 0.025), (0.040, 0.120)),
    "100M/yr": ((0.004, 0.012), (0.015, 0.040), (0.005, 0.012), (0.020, 0.060)),
}
# gap-tolerance penalty multiplier on assembly+test (yield + precision stations)
GAP_PENALTY = {"baseline_77um": 1.0, "fixed_20um": 1.8}


def material_masses():
    p = BASELINE
    s = geo.summarise(p)
    mm3 = 1e-9  # mm³ → m³... masses via density kg/m³ × mm³ × 1e-9
    rho_smc = p.materials.smc_density_kg_m3
    # slot-sections: 6 per actuator
    ss = p.slot_section
    v_ss = ss.axial_mm * ss.depth_mm * ss.transverse_mm \
        - 2 * (ss.slot_width_mm * ss.slot_depth_mm * ss.transverse_mm)
    # bridges: 3
    b = BASELINE.bridge
    v_br = b.thickness_axial_mm * b.width_transverse_mm * b.length_radial_mm
    m_smc = (s.translator_volume_mm3 + 6 * v_ss + 3 * v_br) * mm3 * rho_smc
    # magnets (fixed design Pm = 0.137 mm, 1.5× bridge section)
    a_pm = b.thickness_axial_mm * b.width_transverse_mm * 1.5
    m_pm = 3 * (a_pm * 0.137) * mm3 * 7500.0
    # copper: 3 coils × ~63 mm of 50 µm wire
    m_cu = 3 * (8960.0 * 63e-3 * 3.1416 * (25e-6) ** 2)
    return m_smc, m_pm, m_cu


def main():
    m_smc, m_pm, m_cu = material_masses()
    mat_usd = (m_smc * PRICE["smc"] + m_pm * PRICE["ndfeb"] + m_cu * PRICE["cu"])
    print(f"materials: SMC {m_smc*1e3:.3f} g, NdFeB {m_pm*1e6:.1f} mg, Cu {m_cu*1e6:.1f} mg "
          f"→ ${mat_usd:.4f}/unit (negligible)")
    rows = {}
    for tier, bands in PROCESS_BANDS.items():
        for design, pen in GAP_PENALTY.items():
            lo = mat_usd + sum(b[0] for b in bands[:-1]) + bands[-1][0] * pen
            hi = mat_usd + sum(b[1] for b in bands[:-1]) + bands[-1][1] * pen
            rows[f"{tier}:{design}"] = (round(lo, 3), round(hi, 3))
            print(f"{tier:8s} {design:15s}: ${lo:.3f} – ${hi:.3f}"
                  + ("   ← meets $0.10" if lo <= 0.10 else ""))
    verdict = {
        "materials_usd": round(mat_usd, 5),
        "cost_bands_usd": rows,
        "meets_0p10": {
            "baseline_77um": "at ≥100M/yr (low end of band); marginal at 10M/yr",
            "fixed_20um": "only at ≥100M/yr and only at the optimistic end — "
                          "the 20 µm gap's assembly precision is the cost risk",
        },
        "dominant_cost": "assembly + test (gap setting), then micro-coil winding",
        "tolerance_sensitivity": "dF/dg ≈ −8 %/µm at 20–40 µm gap (FE variants) → "
                                 "±5 µm scatter = ±40 % force; needs active gap set "
                                 "or ±1–2 µm fixturing",
        "confidence": {"materials": "high", "process_bands": "low (estimates, not quotes)",
                       "shape_of_conclusion": "high"},
    }
    with open(os.path.join(OUT, "cost.json"), "w") as f:
        json.dump(verdict, f, indent=2)
    print("wrote out/cost.json")


if __name__ == "__main__":
    main()
