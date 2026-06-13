# Plan — Super-Brief → Universal Physics Engine (retire the curated classes)

**Directive (Tristan, 2026-06-12):** Get away from curated per-class models. The physics engine, given the right brief, should do *everything* from pure physics / chemistry / maths. It is fine to augment the founder brief at the front into a **super-brief** — and **that** is where the archetype distinctions are made, ONCE, not scattered across 50 downstream class models.

---

## 1. Where we actually are (the evidence, not opinion)

- **Universal STRUCTURE is already solved.** Experiment A (2026-06-03) forced a BESS brief down the class-agnostic generic emitter with the 4,710-line hand emitter *held out*: brief-fidelity **8/10**, part-realism **8/10**, honesty **9/10**, and **every** structural/quality gate passed (gate-20, 23, layout, BoM-reconciliation, jurisdiction, mis-pin, drift, cross-page…). Today the **RAS run** — a never-seen archetype — produced a complete **9.5 MB dossier** through the same generic emitter and shipped it via render-and-flag.
- **The LONE wall is engineering-plausibility SIZING.** Exp A scored plausibility **3/10**. The RAS run today came out at **£34,357 installed** for a plant that should be **~£8M** (200× under) with a **6-line** bill of materials (a real RAS has 100+). The auto-planner reported **"202 unmet outputs"** — it composed the right tools but did not know *how to size a RAS*. The structure is right; the numbers are wrong.
- **Curated classes are the wrong substrate regardless.** A registered emitter bakes ONE archetype (a "residential AI node" brief routed to the edge_ai emitter → a 1U rack server, fidelity 3/10 — the brief never reshapes the hand emitter) and **bit-rots** (a May "BESS-quality" emitter scores ~7.6 against today's gates). ~50 of them, each ~1,800–2,800 lines, each a standing liability.

**Conclusion:** the engine is already ~80% universal. The missing 20% is SIZING, and the curated classes mostly exist to paper over it. The prior plan was *per-class-family sizing plug-ins* (code). The directive supersedes that correctly: **make the sizing knowledge DATA in the super-brief, not downstream code.**

---

## 2. Target architecture — one pipeline, knowledge enters once

```
Founder brief
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  AUGMENTATION → SUPER-BRIEF   (the ONLY archetype-aware step) │
│  source: LLM engineering knowledge + Stage-0 reference        │
│          harvest + the growing forge-truth KB                 │
│  emits a structured super-brief carrying:                     │
│    1. ENGINEERING DECOMPOSITION — the module / sub-system     │
│       skeleton (what unit operations this plant has)          │
│    2. SIZING BASIS — governing equations + scale drivers +    │
│       how-many / what-rating / what-dimension rules           │
│    3. SCALE + COST ANCHORS — reference scale, £/output band   │
│    4. STANDARDS / HAZARDS / JURISDICTION                      │
└─────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  UNIVERSAL PHYSICS ENGINE   (archetype-AGNOSTIC, no `if class`)│
│   • Auto-planner: tools from the decomposition + sizing basis │
│   • Universal sizing: tools COMPUTE from the super-brief's     │
│     governing equations           ◄── the wall, fixed HERE    │
│   • Generic emitter: structure from the decomposition         │
│   • Generic gates / CAD / cost: keyed on the super-brief's     │
│     standards + scale, not per-class tables                   │
└─────────────────────────────────────────────────────────────┘
   │
   ▼
Dossier  (8 drawings, design-to-budget, render-and-flag — all already universal)
```

The super-brief is **data**, generated per run. It replaces, in one stroke, the per-class **envelope + contract + class-plan + emitter + reference-graph** *and* the proposed per-class-family sizing plug-ins.

---

## 3. The crux — the SIZING BASIS (this is what makes it real)

This single move turns the £34k RAS into an £8M RAS and makes "the physics engine does everything" true.

The augmentation emits the governing equations + scale heuristics that the universal sizing tool executes. For the RAS that means the super-brief carries, e.g.:

| Quantity | Governing relation (the LLM knows these; Stage-0 grounds the anchors) |
|---|---|
| standing biomass | tank_volume × 60 kg/m³ |
| daily feed | biomass × ~1.3 %/day |
| ammonia (TAN) load | feed × ~4 % |
| oxygen demand | feed × 0.5 kg O₂/kg |
| biofilter media volume | TAN_load ÷ ~350 g·m⁻³·day⁻¹ |
| recirculation flow | tank_volume × 4 turnovers/h |
| heating duty | makeup_flow × ΔT(10→26.4 °C) × cp + fabric loss |
| **cost anchor** | **~£40k per annual tonne** (reference 204 t/yr ≈ £8M) |

- **The LLM elicits the relationships** (general engineering knowledge), **Stage-0 harvest + the KB ground the anchors** (real reference designs, real £/tonne).
- **The universal sizing executor** is `scripts/lib/orchestrator/generic/sizing.ts :: applyFamilySizing` — today a **NO-OP**. It becomes the engine that runs the super-brief's equations, setting realistic quantities + ratings + **dimensions** *before* parts are grounded.
- **It also fixes the grounding-vs-plausibility trade-off** (Exp A's irreducible tension): with each slot's scale/rating in the super-brief, part-grounding becomes **scale-aware** — pick a 1 MW power stack for a 1 MW slot, not a real-but-tiny SiC MOSFET.

---

## 4. Migration — retire 50 classes without losing quality

1. **Schema** — define the super-brief (decomposition + sizing-basis + anchors + standards) as a typed structure on `state`.
2. **Augmentation** — upgrade the existing **U5 brief-augmentation** step into the super-brief generator (LLM + Stage-0 + KB). Kill its current process-plant default bias (it fills unmapped classes with stainless-vessel defaults).
3. **Universal sizing** — implement `applyFamilySizing` to execute the super-brief's governing equations. **First worked example: fix the RAS £34k → ~£8M.** This proves the crux on the hardest case.
4. **Hold-out validation** — for each curated class, run it through super-brief→universal with the hand emitter held out (the Exp A harness already exists: `EXP_A_HOLDOUT_CLASS`), council the result vs the hand-built golden. When universal matches/beats it, **delete the curated class.**
5. **Family by family** — battery-systems, thermal-systems, process-plants, aero/space, machines. One super-brief sizing basis covers a family's physics; validate the members, then delete their per-class code.
6. **Universalise the gates / CAD / cost** — convert the remaining BESS-shaped per-class tables (cost bands, known-parts, standards-by-class) to super-brief-keyed / output-family-keyed. Gate-32 (independent cost-sanity, output-family-keyed) is the template that already exists.

---

## 5. The hard problems (named honestly, not hidden)

1. **Sizing *verification*, not just elicitation.** An LLM will happily emit a wrong equation, producing a confidently-wrong dossier. The guard is grounding (Stage-0 reference designs) + the existing **self-audit + independent cost-sanity gates** (now render-and-flag, so a bad number ships *flagged*, not silently). The super-brief must show its working so the gates can check it.
2. **Decomposition completeness.** The generic emitter needs a complete module/connection skeleton (today a ~180-line baked reference graph per class). The augmentation must reliably enumerate the unit operations; Stage-0 cross-checks against real reference designs so nothing is missed.
3. **~30 gates carry BESS-shaped assumptions** (cost floors, known-part tables, per-rack denominators). They must read the super-brief's standards/scale rather than hardcoded class tables — otherwise they false-fire on every non-BESS archetype (we already see this; render-and-flag contains the damage but the calibration work is real).
4. **Bit-rot inverts from liability to asset.** Because the super-brief is regenerated each run, a newly-added gate is satisfied by the *next* run automatically — there is no fleet of 50 emitters to re-validate. This is a major maintenance win, not just an architectural nicety.

---

## 6. Phasing

- **P0 — prove the crux (now).** Fix the RAS sizing through the super-brief: stand up the sizing-basis for one archetype, wire `applyFamilySizing` to execute it, and turn the £34k / 6-line RAS into an ~£8M / 100+-line RAS through the *pure universal path*. One archetype, end-to-end, no curated class.
- **P1 — augmentation = super-brief generator.** LLM + Stage-0 + KB produce the full super-brief; universal sizing consumes it. Re-prove on RAS + CO₂ + e-fuel (CO₂/e-fuel currently use hand classes — hold them out and match).
- **P2 — hold-out-validate 3 representatives** (a process plant, a battery system, a machine). Deprecate each when the universal path matches the golden on a council.
- **P3 — family-by-family deprecation** + universalise the gates / CAD / cost tables.
- **P4 — delete the per-class code.** The engine is then one physics engine + one super-brief generator. New archetype = a good brief. No wiring.

---

## 7. What this is NOT
- Not "remove the gates" — the gates stay; they become super-brief-keyed and mostly render-and-flag.
- Not "the LLM guesses everything" — the LLM elicits *governing equations*, which deterministic tools execute and gates verify. Physics computes; the LLM supplies the recipe + the engineering knowledge that used to live in 50 code files.
- Not a rewrite — the universal substrate (auto-planner, generic emitter, build_universal_scene CAD, render-and-flag, design-to-budget) already exists and is proven. This plan finishes the **one** missing piece (sizing from the super-brief) and then *deletes* code rather than adding it.

**Bottom line:** the structure problem is solved. Pour the archetype knowledge into the super-brief, make the universal sizing execute it, validate by holding out each hand class until the universal path wins, then delete the hand classes. The end state is a physics engine that designs anything from a good brief.
