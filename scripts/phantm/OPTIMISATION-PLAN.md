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

---

# EXTENSION v1.1 (same day, Tristan): manufacturing-variant tournament + outputs spec

## Phase M — design variants for CHEAP MANUFACTURE (runs alongside Phase 1)

The sweeps above optimise Tony's topology. Cheap-and-easy may be a DIFFERENT
construction. Each variant below gets a fast feasibility FE + a DFM score, and a
KILL/KEEP gate; keepers enter the Phase-2 optimiser. Scored on: parts count,
joints in the flux path, process cost class, assembly steps (especially anything
gauged like the 20 µm gap), and tolerance exposure (dF/dg).

| V | Variant | The manufacturing win | The physics question to settle |
|---|---|---|---|
| V1 | Tony topology, monolithic MIM pole (baseline) | fewest yoke joints | Phase 1–2 output |
| V2 | **Relaxed gap 40–50 µm, force recovered by breadth + duty + N52 + registration** | deletes the gauged-assembly step — the single most expensive operation | how much force the levers really recover (FE says gap alone: −8%/µm) |
| V3 | **Etched-lamination stack** — translator + poles from photo-etched Fe-Si sheets, stacked | planar etch = cents/part at volume, ±25 µm, 155–232 µm teeth are EASY in etch (Precision Micro route); bonus: laminations kill the eddy question | stacking tolerance across the gap faces; interlaminar bonding in the flux path |
| V4 | **Single-sided teeth** — teeth on one translator face only, C-pole | halves tooth features + one working gap to set, not two | net radial side-pull on the guide (was balanced); force/mass ratio |
| V5 | **Round grooved-rod translator** — annular grooves on a turned rod, ring poles | the translator becomes a SCREW-MACHINE part (pennies); guide tube = bearing; axisymmetric | FEMM axisymmetric model (native support); detent from annular teeth; reflector mounting |
| V6 | **Stamped/fine-blanked poles** from strip, progressive die | automotive-relay economics at 100k+/yr | fine-blank feature floor vs 155 µm slots; burr control at the gap faces |
| V7 | PCB-winding stator (coils as copper traces) | no wound coils at all | expect KILL: 36–100 A-turns in PCB copper = resistance blow-up — kill with numbers, on record |
| V8 | **Shared stator rail** — one long stator strip drives a ROW of translators | pole steel + coil formers amortised across cells | magnetic crosstalk between adjacent cells; per-cell force uniformity |
| V9 | Insert-moulded bonded-NdFeB magnet (magnet moulded into the pole) | deletes magnet insertion + both seat joints | Br ≈ 0.7 T ⇒ force ≈ ×0.29 — probably KILL for 5 g, quantify honestly |
| V10 | One-piece translator + reflector-standoff (single MIM/moulding) | deletes the reflector assembly step | mass + non-magnetic standoff region in one tool |

Tournament order: V2, V3, V5 first (biggest cost deltas), then V4/V8, then V6/V10; V7/V9
are kill-with-numbers entries so the record shows they were considered.

## Outputs + layout (how every result lands)

1. **One running scoreboard** — `out/opt/SCOREBOARD.md`, one row per variant/sweep point,
   SAME columns always: `Variant | Knob setting | Fd mN (basins) | Drive peak/path-min mN |
   P_elec @2Fd W | Moving mass mg | Stack mm | Fit margin vs 3.179 tile | B_max tip/core T |
   Parts | Flux joints | Process class | VERDICT keep/kill + one-line why`.
2. **Per-sweep figure sheet** — `out/opt/fig-opt-<knob>.png`: metric-vs-knob curves with
   saturation flags and the baseline marked; every figure SIGHTed before it ships.
3. **Per-sweep JSON artefact** — `out/opt/<knob>.json`; the deterministic verifier reads
   the scoreboard numbers FROM the artefacts (same no-drift discipline as the report).
4. **Phase gates** — at each phase end: scoreboard snapshot + a 5-line decision note
   (what won, what died, why) appended to this plan; Tristan sees keep/kill calls, not raw logs.
5. **Final deliverable** — report v5 gains §12 "Optimisation campaign" (scoreboard +
   winner drawings + updated 3D render), Excel gains the winner's parameter set as a new
   input column, council review before it goes to Tony. Same zip pipeline.
