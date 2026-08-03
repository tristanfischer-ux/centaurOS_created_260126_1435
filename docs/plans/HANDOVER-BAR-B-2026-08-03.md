# Handover — Bar B, FE Front FPK

**Written 2026-08-03 by Claude Code for the next agent (Grok Build).**
**Twin:** `out/formula-e-front-mgu-20260729-1432/` · branch `oxccu-efuel`
**Reviewed after by:** Claude Code (parent session) — expect the verification in §6.

---

## 1. Read this first — what Bar B is, and what it is NOT

**Bar B is race / homologation. It closes with MEASURED evidence: dyno maps, HIL
runs, supplier Gerbers, chassis coordinates, flow benches. It does not close in
software, and it never closes by writing a better estimate.**

Ten holds, all OPEN, all blocking `ship_ok`:

| class | count | meaning |
|---|---|---|
| `ASSUMED_CONCEPT` | 3 | educated guess + screening evidence; replace when real data lands |
| `NEEDS_HARDWARE` | 5 | the model is ready; a physical artefact is still required |
| `NEEDS_PARTNER_INPUT` | 2 | must NOT be invented (chassis XYZ, supplier Gerbers) |

`ship_ok` is **false** and must stay false. `BAR_B_LIST_FILLED_UNDER_ASSUMPTIONS_NOT_HOMOLOGATED`
means the list is complete, not that anything is homologated.

### The hard stops — non-negotiable

- **Never invent** chassis XYZ, supplier Gerbers, dyno CSV, HIL results or measured
  ESL. A fabricated coordinate is worse than an empty field because it ships.
- **Never mint `ship_ok`**, `CLEARED`, or `homologated` from a software screen.
- **Never set `torque_reliable = true`** without a map-correlation policy.
- If you cannot close a hold honestly, **improve the ASK** — that is the work.

---

## 2. Where Bar A got to (context you need, not work to redo)

Bar A is **CLOSED** as of 2026-08-03 against its own six criteria. Two decisions
did it, both recorded in `10-decision-register.json` and both **reversible**:

- **DEC-008 — duty re-frozen as INTERMITTENT (24 s regen in every 100 s).** The
  contract asserted both `continuous_power_kw = 250 basis=continuous` AND that
  vignette; they are mutually exclusive, and the Gen3 front unit is regen-only so
  a 100% duty describes something the car never does. Magnet 159.3 °C (breach) →
  **83.8 °C**.
- **DEC-009 — DEC-EM-1 resolved: 24,000 rpm / 130 mm stack.** Torque **1.069×**
  required (was 0.651×), magnet 99.4 °C vs a 150 °C limit, rotor screening FoS
  **1.740**.

**Do not re-open these.** If Bar B data contradicts them they reverse — that is
the point of a named decision — but reversing needs the DATA, not an opinion.

### Live state you should not have to rediscover

| | |
|---|---|
| Torque | required **125.2193 N·m**, delivered 81.558 at baseline; 1.069× under DEC-009 |
| Iron loss | **6035 W**, `basis: screening_estimate`, range **3.9–8.5 kW** |
| Thermal screens | agree to **0.1 K** (they disagreed by 76 K until 2026-08-03) |
| Drawing gates | **23/23 pass**; render/GA/SLD coverage 100% |
| PCB | **2 routed boards**, DRC 0 violations, fitness 7.6/10, `NOT_FABRICATION_READY` |
| Falsifiability | **0 of 169** checks unfalsifiable |

⚠ The torque denominator has a trap: `mgu_shaft_torque_nm = 119.7` is torque **at**
the 244.49 kW shaft power. The DUTY requirement is **125.2193 N·m**. Dividing by
119.7 flatters the result to 0.681×. Every solver artefact uses 125.2193.

---

## 3. THE WORK — what to actually do

The register (`JLR-FE-FRONT-FPK-BAR-B-READINESS.json`) was restamped 2026-08-03
and is currently accurate. Each row carries a `replace_with` field. **Today those
are one-liners. The job is to turn each into an ask a supplier or test engineer
can act on without a follow-up question.**

### 3.1 Primary task — make every ask executable

For each of the ten rows, produce: **what artefact, in what format, measured under
what conditions, and what it unblocks.**

Worked example of the standard to hit — `BARB-DYNO` currently says *"Calibrated
dyno torque/η/thermal map at revision-matched assembly"*. That is not yet an ask.
It should specify: the speed/torque grid and its resolution; the coolant inlet
temperature and flow the map must be run at (60 °C, 12 L/min — the twin's A-COOL
assumption); that a **calorimetric loss split** is wanted, not just shaft torque,
because that is what collapses the 3.9–8.5 kW iron-loss range; the file format;
and that it closes BARB-DYNO **and** narrows BARB-DUTY-CYCLE.

Rows where this matters most, in order:

1. **BARB-DUTY-CYCLE** — the highest-value ask in the pack. A team lap CSV either
   confirms DEC-008 or reverses it, and DEC-009 depends on DEC-008. Specify the
   channels needed (time, speed, front-axle regen power or current, brake
   pressure), the sampling rate, and how many laps.
2. **BARB-DYNO** — as above; also settles the iron-loss range.
3. **BARB-FLOW-BENCH** — this is now the calibration source for the two-source
   thermal chain's screening constants (`slot_to_iron_k_per_w = 0.006`,
   `iron_to_jacket_k_per_w = 0.0077` in
   `scripts/motor-stack/analytical_fia_cooling_network_screen.py`). Specify the
   pressure-flow curve range and the temperature instrumentation.
4. **BARB-ICD-XYZ** and **BARB-GERBERS** — partner input. State precisely what is
   needed and, equally, what we already have so the partner is not asked twice.

### 3.2 Secondary — a register-freshness guard

The register was **three days stale and wrong in six of ten rows** when I found
it: torque 194 N·m (actually 78.4), rotor FoS 3.442 (actually 2.635),
`coupled_ok: true` (actually false), module 71 °C (actually 117 °C), and PCB
`disposition: None` when two routed boards exist. It was simultaneously
understating the thermal problem and denying the PCB work existed.

Build a deterministic check that fails when the register's
`result_under_assumption` values diverge from the twin's live artefacts. Follow
the pattern in `scripts/lib/physics_plausibility.py`: pure arithmetic, a
`--selftest` with proveCatch in both directions, registered in
`.husky/pre-commit` and `scripts/verify-engine-guards.sh`.

### 3.3 Do NOT do

- Do not re-run the chain or re-render Blender. Nothing here needs it.
- Do not touch Bar A. It is closed and the decisions are recorded.
- Do not "improve" the iron-loss number. It is a screening estimate with a stated
  range and the range closes on Bar B data, not on a better model.

---

## 4. Traps this campaign has already paid for

These cost real time. Do not re-pay them.

1. **RE-RUN THE SCREEN; NEVER READ ITS ARTEFACT AS CURRENT STATE.** Four
   instances, two of them mine in a single day. I reported gear-oil as
   "REGRESSED" from a file written against `gear_face = 14.0 mm` when the live
   twin carries 19.2. Re-running cleared it. Use
   `.venv/bin/python scripts/motor-stack/<screen>.py --twin <dir>` — `ijson` is
   not in system python.
2. **A GREEN CHECK THAT CANNOT GO RED.** Three defects shared this shape: a check
   comparing a limit to itself, a check reading a quantity nobody re-ran, and a
   guard whose test exercised one filename of two. Run
   `scripts/lib/check_falsifiability_audit.py --twin <dir>` after touching checks.
3. **TWO STORES, CONSUMER READS THE EMPTY ONE.** Four instances — parts-manifest
   vs ontology map, `state.suppliers` vs `partVerifications`, `pcb-stage.json` vs
   `state.pcb`, measured flux/mass in `_motor_stack` never reaching the contract.
   When something reads empty, check the producer's own artefact before believing
   it.
4. **THE THREE-WAY GUARD SQUEEZE.** Any contract quantity is constrained by
   `_qty_is_brief_only_identity`, `provenance_sourceless` and `calc_coverage` at
   once. `source='brief'` means REQUIREMENT, not achievement. The corner that
   satisfies all three is `source='tool:x'` **plus** `provenance: {tool_id: 'x'}`.
5. **"MY SELFTEST PASSES" IS NOT A LICENCE TO PUSH.** The last defect of
   2026-08-03 appeared only where two individually-correct changes met, in a
   third module's fixture. Run `bash scripts/verify-engine-guards.sh` — ~5 minutes,
   and it is the only thing that sees cross-module interactions.

---

## 5. Definition of done for this handover

- [ ] All ten `replace_with` fields are executable asks (artefact · format ·
      conditions · what it unblocks)
- [ ] Register-freshness check exists, with proveCatch both ways, registered in
      pre-commit and verify-engine-guards
- [ ] `bash scripts/verify-engine-guards.sh` passes
- [ ] `node scripts/check-typecheck-baseline.mjs` passes
- [ ] `ship_ok` still **false**; no hold moved to closed without measured evidence
- [ ] Nothing invented — every new number traces to an artefact or is labelled an
      assumption

---

## 6. How this will be reviewed

The parent session will verify rather than read the write-up. Expect exactly this,
because a claimed close-out has three possible causes and only one is good — the
defect was fixed, the detector was weakened, or the offender was excluded:

1. Confirm the files you say you changed are actually modified.
2. Re-run every selftest and headline metric independently.
3. Confirm named items became **honest** rather than **vanished**.
4. **Feed any detector you touched its original adversarial input** and confirm it
   still fires. This is the step that catches a weakened detector; nothing else
   does.
5. Run a negative control — legitimate cases must stay silent.
6. Check nothing was marked closed that should stay open.

State your results with the commands that produced them, and leave the work
uncommitted unless Tristan asks otherwise.
