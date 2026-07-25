"""PHANTM — stamped-and-stacked laminations for the actuator steel
(Tony 25 Jul: "this is the way nearly all macro transformers are made —
apparently it still works at this smaller scale". Beyond MIM/SMC, what bulk
routes are open at 100k/1M/10M+ per year?)

Deterministic screen of every candidate route against the ACTUAL part
geometry and the design's two hard couplings:
  - the 20 µm working gap (dF/dg ≈ −8%/µm): any edge/stack imperfection on
    the TOOTH TIPS acts like added gap;
  - flux diffusion already cleared SOLID parts for 1.5 ms pulses (§A.10), so
    laminations are magnetically unnecessary — but strictly harmless: the
    stack is allowed to be welded/bonded solid, no interlaminar insulation.

Key geometry (from the brief / Annexe A):
  translator: 1.549 × 1.55 × 12.5 mm, teeth 232 µm at 464 pitch, both faces
              → PRISMATIC along the 1.55 mm width ⇒ stack axis = width
  slot-section (×6): 1.16 × 0.465 × 1.708 mm, slots 232 wide × 155 deep
              → prismatic along 1.708 mm ⇒ stack axis = length
  bridge (×3): 0.348 × 1.162 × ≈3.1 mm plain bar (stampable trivially)

Run: ~/.venvs/phantm/bin/python lamination_route.py → out/lamination-route.json
"""
import json
import math
import os

GAP_UM = 20.0
DFDG_PCT_PER_UM = 8.0

# stamping practice: minimum feature vs strip thickness; edge die-roll band
RULES = {
    "progressive_stamping": {"min_feature_over_t": 1.0, "die_roll_pct_t": (5, 10)},
    "fine_blanking":        {"min_feature_over_t": 0.6, "die_roll_pct_t": (2, 5)},
    "photochemical_etch":   {"min_feature_over_t": 0.9, "die_roll_pct_t": (0, 2)},
}

PARTS = {
    "translator": {"stack_mm": 1.55, "min_feature_um": 232,
                   "tooth_faces_on_stamped_edge": True},
    "slot_section": {"stack_mm": 1.708, "min_feature_um": 155,
                     "tooth_faces_on_stamped_edge": True},
    "bridge": {"stack_mm": 1.162, "min_feature_um": 348,
               "tooth_faces_on_stamped_edge": False},
}


def screen(strip_um):
    t = strip_um / 1000.0
    rows = {}
    for pname, p in PARTS.items():
        n_lam = math.ceil(p["stack_mm"] / t)
        entry = {"laminations": n_lam}
        for proc, r in RULES.items():
            feat_ok = p["min_feature_um"] >= r["min_feature_over_t"] * strip_um
            roll_lo = r["die_roll_pct_t"][0] / 100 * strip_um
            roll_hi = r["die_roll_pct_t"][1] / 100 * strip_um
            entry[proc] = {
                "feature_ok": feat_ok,
                "tip_edge_um": [round(roll_lo, 1), round(roll_hi, 1)],
                "tip_edge_vs_gap_pct": round(100 * roll_hi / GAP_UM),
            }
        rows[pname] = entry
    return rows


def main():
    screens = {f"strip_{s}um": screen(s) for s in (100, 150, 200, 350)}
    for s, sc in screens.items():
        tr = sc["translator"]
        print(f"  {s}: translator {tr['laminations']} laminations; "
              f"stamping feature_ok={tr['progressive_stamping']['feature_ok']}, "
              f"die-roll {tr['progressive_stamping']['tip_edge_um']} µm "
              f"({tr['progressive_stamping']['tip_edge_vs_gap_pct']}% of the 20 µm gap); "
              f"fine-blank roll {tr['fine_blanking']['tip_edge_um']} µm; "
              f"etch {tr['photochemical_etch']['tip_edge_um']} µm")

    # the coupling that decides it: tip-edge condition acts like added gap.
    # worst-tolerable tip-edge budget if we cap force loss at 10%:
    tip_budget_um = 10.0 / DFDG_PCT_PER_UM
    # stack registration (in-die interlock class): ±10 µm lateral — lateral
    # scatter does NOT open the gap directly (gap is normal to the stamped
    # edge) but ragged tip lines shade the modulation; treated as second-order.

    options = [
        dict(option="Pressed/sintered SMC (the brief's assumption)",
             verdict="KILL (already on record)",
             why="published minimum-section floor 0.8–1.7 mm vs 232 µm teeth — cannot form the parts"),
        dict(option="Micro-MIM Fe-3%Si (current co-lead)",
             verdict="KEEP — prototype-to-volume lead",
             why="±10 µm, <100 µm walls published; crisp moulded tooth tips (no edge-roll issue); "
                 "Annexe A RFQs already out for feasibility"),
        dict(option="Progressive stamping + in-die interlocked stacking (Tony's push)",
             verdict="KEEP — VOLUME CO-LEAD CANDIDATE ≥1M/yr, gated (council-hardened)",
             why="the motor/transformer industry's proven 10M+/yr route; teeth are PRISMATIC so "
                 "the geometry is genuinely stampable (translator ≈8 laminations of 0.20 mm; "
                 "sections ≈12 of 0.15). GATES (council-hardened, sol+grok): the WHOLE "
                 "shear-edge profile — roll + burnish + fracture taper + BURR — plus stack "
                 "registration scallop and anneal distortion act on the gap-facing tooth "
                 "surface (die-roll alone is 10–20 µm at 0.20 mm strip = 50–100% of the "
                 "gap); a rounded/measured-edge FE variant + a SUPPLIER COUPON decide, "
                 "never generic feature rules; interlocks/welds must sit OUTSIDE active "
                 "flux sections; anneal sequence qualified dimensionally (not assumed); "
                 "non-oriented FeSi with RD/TD anisotropy in the FE"),
        dict(option="Fine blanking + stacking",
             verdict="KEEP — the gate-friendly stamping variant",
             why="die-roll 2–5% of t (4–10 µm at 0.20 strip) halves the tip-edge problem and "
                 "handles the 155 µm section slots at 0.6×t; slower/costlier than progressive "
                 "but same stack economics at 1–10M/yr"),
        dict(option="Photochemical etch + stacking (Precision Micro class)",
             verdict="KEEP — cleanest edges, mid-volume",
             why="10 µm-class features, near-zero edge roll, no work-hardening (no anneal "
                 "distortion risk); per-sheet economics beat lasers to ≈1M/yr; already a "
                 "named supplier (§23-adjacent, Precision Micro row)"),
        dict(option="Electroforming NiFe (Tony's option 3)",
             verdict="viable NICHE — material physics caps it",
             why="resolution is superb, but 80/20 permalloy saturates at ≈0.8 T vs our "
                 "1.0–1.15 T working flux (FAILS); 45–50% Ni (Bsat ≈1.5 T) clears it with "
                 "margin but lower µ than annealed FeSi at these fields is a re-solve; "
                 "deposition thickness 0.35–1.5 mm is days-per-batch territory — 100k–1M/yr "
                 "at precision prices, not the 10M/yr cost point"),
        dict(option="Laser / femtosecond cutting + anneal",
             verdict="KEEP — prototype/bridge volumes only",
             why="perfect for Prototype-A coupons and first hundreds; HAZ demands the same "
                 "anneal; per-part seconds never reach 10M/yr economics"),
        dict(option="Cold coining / precision forming",
             verdict="viable for the BRIDGE only",
             why="plain 0.348 × 1.162 bar coins trivially; toothed parts would still need a "
                 "finishing operation that reintroduces the tolerance problem"),
    ]

    out = {
        "screens": screens,
        "tip_edge_budget_um_at_10pct_force": tip_budget_um,
        "magnetics_notes": [
            "laminations are magnetically UNNECESSARY (flux diffusion clears solid parts "
            "for 1.5 ms pulses, §A.10) but harmless — so the stack may be welded/bonded "
            "SOLID with no interlaminar insulation: cheapest possible stack",
            "stack factor ≈0.95–0.98 without insulation → few-% force penalty via area",
            "electrical-steel strip (non-oriented, Bsat ≈1.9–2.0 T) matches or beats "
            "MIM Fe-3%Si (which carries sinter porosity); anneal after stamping mandatory",
            "80/20 permalloy electroform Bsat ≈0.8 T < our 1.0–1.15 T bridge flux — "
            "material, not process, rules that variant out",
        ],
        "options": options,
        "council": {"sol": "SOUND-WITH-CORRECTIONS", "grok": "CONFIRMED-WITH-CAVEATS", "key": "1.25 µm tip budget is fair as mean-force sensitivity but ALARMIST as a kill criterion — the Pm trim absorbs static mean loss; reproducibility, ripple and positional error are the real limits; stamp is RFQ-worthy candidate, not default co-lead, until the coupon gates close"},
        "verdict": "PLAUSIBLE AND WORTH THE RFQ — Tony's transformer instinct holds at "
                   "this scale because the toothed geometry is PRISMATIC (a stack of "
                   "identical 2D profiles). Stamped-and-stacked becomes the VOLUME CO-LEAD "
                   "with micro-MIM, gated on the tooth-tip edge condition (die-roll ~50–100% "
                   "of the 20 µm gap at practical strip) and anneal distortion. Fine "
                   "blanking or etch+stack are the gate-friendly variants. Electroforming "
                   "is materials-limited to ≥45%Ni alloys and mid volumes.",
    }
    path = os.path.join(os.path.dirname(__file__), "out", "lamination-route.json")
    json.dump(out, open(path, "w"), indent=1)
    print(f"  tip-edge budget at 10% force loss: {tip_budget_um:.2f} µm vs "
          f"die-roll 10–20 µm (stamping) / 4–10 (fine-blank) / 0–4 (etch)")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
