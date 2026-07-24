# PHANTM actuator — optimisation campaign plan (v1, 2026-07-24, from Tony's 24 Jul brief)

> Tony's 10-point list mapped to a phased FE campaign on the existing validated harness
> (native xfemm, ~1 s/solve; C-core gate before every batch). CAD dimensions are now
> declared SKETCHES (Tony 24 Jul) — the brief's numbers + our STL measurements rule;
> the 400 µm pole-spacing reading is RETRACTED (exact ⅓-pitch 386.7 µm stands).

## Phase 0 — re-frame targets (no FE; half a day)
- **New RF frame (Tony 24 Jul, ballpark pending Vlad):** fc ≈ 55 GHz assumption → λg ≈ 6.92 mm
  at 70 GHz → stroke ≥ 3.46 mm; 32 levels → **step 108 µm ⇒ tooth pitch 324 µm** (scenario S108)
  alongside the current **155 µm ⇒ pitch 465 µm** (scenario S155). All Phase-1 sweeps run on S155;
  S108 gets a feasibility pass in Phase 4.
- **New envelope:** the assembly must fit the TILE footprint — hex pitch **3.179 mm**
  (79 µm walls; may grow), not the 3.1 mm bore. Update fit checks + breadth ceilings.
  Keep a "walls thicken to 150 µm → pitch 3.25" variant in the table.
- **Objective function (Tony's words):** maximise detent AND step force per electrical
  drive power, at lowest moving mass; stack length soft; 5 V PSU is the preferred rail.
- Metrics recorded per variant: Fd (breakaway, 3 basins required), F_drive peak/path-min,
  MMF and P_elec at 2·Fd, translator mass, max |B| at tooth tips + core (saturation probes),
  stack length, fit margin vs 3.179 tile.

## Phase 1 — single-knob sweeps (S155 baseline; each ≤ 1 day of runs)
| # | Knob (Tony item) | Range | Watch |
|---|---|---|---|
| 1A | Tooth/slot duty (teeth narrower than 232.5 µm at fixed 465 pitch) | tooth 0.30–0.50 × pitch | fringing ↓ vs tip saturation ↑ (B probe at tips) |
| 1B | Slot depths, translator & stator INDEPENDENTLY | 0.5×–2× present | there may be an unreached optimum (Tony) |
| 1C | Slot taper | 0° / 5° / 10° | tip constriction vs manufacture |
| 1D | Teeth per pole | 2 / 3 / 4 / 5 | force ↑ vs stack length; per-pole force superposition check |
| 1E | Translator width (tooth-face to tooth-face) | −10…−40% | saturation onset; mass ↓ ⇒ Fd target ↓ (self-reinforcing) |
| 1F | Breadth (tooth length, transverse) | +0…+30% within 3.179 tile | force ≈ ∝ area; fit margin |
| 1G | Pole cross-section: uniform-A audit then ±scale | equalise, then ±25% | kill saturation hotspots first (Tony's order) |
| 1H | Coil: N × wire gauge grid at 5 V rail (−0.5 V driver) | N 15–60, Ø 40–80 µm | J ≤ rating, window fit, L/R, force per watt |
- 6 poles: **deferred by agreement** (last resort after geometry/electrics optimised).

## Phase 2 — interactions + re-centre (2–3 days)
- Factorial on the top-3 Phase-1 knobs (expected: duty × slot depth × breadth).
- Re-solve Pm\* (detent trim) and Ic\* on the winner; re-check 3 basins + registration trade.
- Deliverable: OPTIMISED SET vs FIXED SET table with the same §4.5 scorecard.

## Phase 3 — dynamics + the air-piston damper (Tony item 10; 1–2 days)
- Q of the translator resonance: fn ≈ 175 Hz (k = 200 N/m, m+reflector 0.165 g);
  c_crit = 0.363 N·s/m, target ζ ≈ 0.7 → c ≈ 0.25 N·s/m.
- Model the closed-front hex tube as a vented gas spring/dashpot (squeeze
  flow through a reflector hole or edge gap); solve vent area for ζ ≈ 0.5–0.8 across
  the stroke; check it doesn't slow the 2.5–4 ms step. Deliver: vent Ø (or edge-gap
  area) + sensitivity, into dynamics.py with guards.
- Bonus: revisit §4.4 capture — proper damping may delete the hold-then-release dance.

## Phase 4 — S108 scenario (32 levels; feasibility ballpark only, 1 day)
- Pitch 324 µm ⇒ teeth ≈ 162 µm (with 1A's optimal duty). Scaling pass on detent/drive
  (force ∝ modulated area; fringing worsens as gap/tooth grows) + micro-MIM feature check.
- Output: what 32-level steps COST in force and manufacture vs S155 — for the Tony/Vlad
  call once the real EM analysis fixes fc and λg.

## Phase 5 — report v5 + council
- Fold winners into report/Excel/verifier (same regime discipline); 2-round council
  (sol + grok-4.5 + glm/deepseek tabular seat); update supplier RFQ dimensions if changed.

## The glue-joint answer (Tony's 14:56 challenge — resolved, numbers)
Tony is right: the magnet cannot be monolithic — its seat adds ≥2 bonded faces in the
magnetic path. The claim is CORRECTED from "zero joints" to "zero joints in the
high-permeability yoke", and the accounting shows why the distinction matters:
- A joint in the STEEL yoke interrupts a µr≈2000 path: 2 µm of effective air ≈ +5% of
  the whole circuit reluctance (vs the 2×20 µm working gaps). Route B had two ⇒ ≈ +10%.
- The PM-seat joints sit IN SERIES WITH THE MAGNET, which is already ≈231 µm of
  air-equivalent (243 µm / µr 1.05): 2×2 µm adds **+1.7% on that branch** — and Pm\* is
  the assembly-time TRIM parameter, so the trim absorbs it entirely (solve Pm\* with
  +4 µm effective: shift is within the existing trim range).
- Net: monolithic pole still saves ≈10% circuit reluctance vs Route B; the unavoidable
  magnet joints are in the one place where µm-scale glue is nearly free. Mitigations
  recorded: ground seat faces, edge-only adhesive (squeeze-out <2 µm), or spring-clip
  metal contact.

## Standing corrections logged from Tony's 24 Jul email
- CAD = sketches; 400 µm spacing retracted; dimensions from brief + STL only.
- Tile pitch 3.179 mm (79 µm walls, may grow) supersedes 3.25 as the ENVELOPE number;
  3.1 mm bore unchanged as the RF aperture.
- fc ≈ 55–60 GHz design intent for the cell (our computed 53.56 GHz for the 3.10 mm
  bore is consistent with his 3.0–3.2 mm band); λg at 70 GHz ≈ 6.92 mm on his 55 GHz
  assumption vs our 6.65 mm at fc 53.56 — same ballpark, Vlad to fix.
- Step-size scenarios: S155 (current spec) and S108 (32 levels over λg/2 = 3.46 mm).
