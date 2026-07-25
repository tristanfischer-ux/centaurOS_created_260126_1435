"""PHANTM — claims register (the spine of report v6, Tristan 25 Jul).

Every load-bearing assumption in the programme, with its hardening STATUS,
its EVIDENCE artefact, and the OWNER of any residual risk. This is
"hardening assumptions with facts and testing" made auditable: a reader (or
a bid) can see at a glance what is proven, what is tested, and what remains
an open gate.

Status vocabulary (fixed):
  PROVEN-calc   closed-form physics, recomputed by the verifier every run
  PROVEN-FE     nonlinear finite-element result (validated harness)
  MEASURED      measured from Tony's delivered artefacts (STL forensics)
  TESTED        executable artefact compiled + run under CI gates (firmware)
  RED-TEAMED    survived a named adversarial council attack
  ESTIMATE      honest band, hardens with external returns (cost)
Residual: "closed" or the named open gate / external input + its owner.

Consistency rules enforced here (and pinned by verify_report.py):
  - every claim carries evidence; no empty cells
  - every status from the vocabulary
  - counts written to claims-register.json for the verifier to pin

Run: ~/.venvs/phantm/bin/python claims.py → out/claims-register.json
NOTE: §-references use the PRE-restructure numbering; report.py's
restructure pass renumbers them with the rest of the document.
"""
import json
import os

STATUSES = {"PROVEN-calc", "PROVEN-FE", "MEASURED", "TESTED", "RED-TEAMED",
            "ESTIMATE"}

# (claim, status, evidence, residual)
ROWS = [
    ("The as-briefed actuator cannot reach its detent target — ×15 short at any magnet size",
     "PROVEN-FE", "pm-ic-sweeps.json; §3.1", "closed"),
    ("The fixed design (gap 20 µm + bridge/magnet ×1.5) meets Fd and 2·Fd in-model",
     "PROVEN-FE", "fixed-design.json; §4",
     "2D + registration-specific — 3D FE or a prototype force curve before tooling (us)"),
    ("The 20 µm working gap is an ASSEMBLED clearance, industrially normal — not a moulded tolerance",
     "RED-TEAMED", "§0.4 push-back + §6 evidence rows (VCM/watch/HDD lines)",
     "gap 20-vs-30 ruling is Tony's (30 µm passes at 7.7 g with 1.5× looser tolerance)"),
    ("Translator mass 0.1577 g and every geometry number in the brief reconcile",
     "PROVEN-calc", "§8.1, verifier-recomputed every run", "closed"),
    ("Coil R = 0.552 Ω, L = 0.60 µH, τ = 1.1 µs; 1 V limits drive — the full 2·Fd point needs ≈1.9 V",
     "PROVEN-FE", "§8.5 + femm-five-numbers.json", "closed"),
    ("Registration choice trades ≈23% detent for step uniformity (7.72 vs 5.95 mN)",
     "PROVEN-FE", "f3-registration-check.json; §4 F3",
     "the knob is Tony's; every detent figure quoted with its registration"),
    ("The pole is an open horseshoe — in-situ winding possible; each glue joint costs ≈5–15% detent",
     "RED-TEAMED", "§0.8 retraction + re-analysis; §5.2 Route A/B",
     "Route A (monolithic) recommended; winder cycle-time quote decides (RFQ)"),
    ("No laminations needed for 1.5 ms DC pulses — flux diffusion clears the pulse",
     "PROVEN-calc", "§0.10 flux-diffusion estimate",
     "OPEN GATE: margin <10× on the thickest path — transient eddy FE before tooling (us)"),
    ("Interior across-flats 3.10 mm is THE RF dimension; fc = 53.56 GHz, λc = 5.598 mm",
     "MEASURED", "STL forensics + validated eigensolver; §9.2",
     "metallised-cell λc + loss budget confirmation (Vlad)"),
    ("Full-2π coverage from ≈57.4–58.0 GHz upward; usable travel (cell depth − short stack) binds",
     "PROVEN-calc", "hexcell.json band table; §9.2", "closed in-model"),
    ("Wall thickness is NOT an RF dimension — thicken OUTWARD freely; interior is the held dimension",
     "RED-TEAMED", "wall-proof.json 3-leg proof + grok-4.5 8-attack pass; §9.9",
     "array pitch growth budget (grating/scan headroom) is Vlad's"),
    ("The Ø0.15 mm air-piston vent captures the step at every hold ≥3 ms, both drive sets",
     "PROVEN-FE", "damper.json / damper-balanced.json scheme tables; §10.3",
     "OPEN GATE: vent window is narrow (Ø0.20 fails) — vent tolerance sweep (us)"),
    ("The optimised detents cannot be stepped single-coil; DUAL pull-and-cancel steps them",
     "PROVEN-FE", "opt dynamics curves + damper ODE; §10.2 + §10.3",
     "OPEN GATE: demagnetisation FE — cancel-coil reverse MMF vs the magnet knee BLOCKS dual drive (us)"),
    ("BALANCED set delivers 14.6/11.0 g margins at 37 mJ/step (MAX-FORCE: 19.1/14.3 g at 83 mJ)",
     "PROVEN-FE", "opt-sweeps-3/4.json; §10.2",
     "same 3D-FE/prototype residual as the fixed design (us)"),
    ("Gap-40 is DEAD: breakaway looked fine but the detent has a single basin (no step capture)",
     "PROVEN-FE", "opt-recentre.json basin counts; §10.1b kill row", "closed — kill on the record"),
    ("Unipolar drive suffices ONLY for the original design; optimised sets need a full H-bridge per coil",
     "PROVEN-calc", "§9.5b ledger (matrix/phase-pair killed on body diodes)", "closed"),
    ("The tile firmware sequences hold-then-release stepping with the demag gate compiled OUT",
     "TESTED", "phantm_fw.c + test_fw.c, both configs compile -Werror and pass, CI-gated; §9.5c",
     "reference-level only; BSP + real-board bring-up outstanding (us)"),
    ("Rail voltage IS the current control (0.60 Ω path: 1.07 V step / 2.0 V full)",
     "PROVEN-calc", "drive-electronics.json; §9.5", "closed"),
    ("At hold the aperture draws ZERO current — electromagnetically silent (the LPI property)",
     "PROVEN-calc", "drive-electronics.json idle 0 W; §9.8",
     "OPEN REQUIREMENT: driver-EMC layout rule must be specified, not assumed (us)"),
    ("The damper vent hole leaks ≤ −58 dB (17× below its own cutoff; Bethe (d/λ)⁴)",
     "PROVEN-calc", "§9.8, verifier-recomputed", "closed"),
    ("Cell fabrication ladder: print+plate (prototype) → electroform (reference) → moulding (volume)",
     "RED-TEAMED", "§9.7 ledger, 16 options, kills on record",
     "two-half moulding bond-seam RF check (Vlad)"),
    ("The toothed parts can ONLY be micro-MIM at this scale (pressed SMC floor 0.8–1.7 mm)",
     "PROVEN-calc", "vendor capability data; §5", "closed"),
    ("Unit cost lands at $0.10–0.25 at ≈10 M/yr — process- and gap-setting-dominated",
     "ESTIMATE", "§5 cost stack; raw materials $0.0014/unit (§5)",
     "hardens with the Annexe A–D RFQ returns (Tristan sends)"),
    ("The 20–30 g hold ambition is reachable via the force ladder (two groups / N52 / registration)",
     "PROVEN-FE", "§0.3 ladder + campaign stacks; §10",
     "vibration envelope decides hold-vs-shock sizing (Tony)"),
]


def build():
    assert all(len(r) == 4 and all(str(x).strip() for x in r) for r in ROWS), \
        "claims register: empty cell"
    assert all(r[1] in STATUSES for r in ROWS), "claims register: bad status"
    counts = {}
    for _, st, _, _ in ROWS:
        counts[st] = counts.get(st, 0) + 1
    open_rows = [r[0] for r in ROWS if "OPEN" in r[3]]
    external_rows = [r[0] for r in ROWS if any(k in r[3] for k in ("Vlad", "Tony", "Tristan"))]
    out = {"rows": [dict(claim=c, status=s, evidence=e, residual=r)
                    for c, s, e, r in ROWS],
           "counts": counts, "total": len(ROWS),
           "open_gates": len(open_rows), "external_inputs": len(external_rows)}
    path = os.path.join(os.path.dirname(__file__), "out", "claims-register.json")
    json.dump(out, open(path, "w"), indent=1)
    print(f"claims register: {len(ROWS)} claims, {counts}, "
          f"{len(open_rows)} open gates, {len(external_rows)} external inputs")
    return out


if __name__ == "__main__":
    build()
