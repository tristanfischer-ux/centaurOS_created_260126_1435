# Engine fix plan — RAS exemplar, universal intent (2026-06-14)

**Framing.** The dashboard exposed that removing the curation crutch left the *universal* path
weaker than the hand-wired classes it replaced. This is the plan to fix the whole chain at the
root, in order, one stage at a time. Nothing here is curation — every fix is universal (no `if ras`).
Grounded in this run's own logs (`out/ras-briefexp`), not memory.

The chain, per `AIM-PIPELINE.md`: **brief → tools (select + create) → Blender → wiring/piping →
parts → loop → BoM → cost → 8 documents.**

---

## Stage 1 — Brief → detailed brief  ✅ DONE (this session)

- Built `brief-expander.ts` (U6): a reasoner turns the thin brief into the quantified engineering
  duty set + correct product/materials, universally. Verified on RAS/CO₂/SAF. Pushed.
- **Remaining (small):** cache the expansion per brief-hash so a given brief is deterministic
  (the 13,360 vs 3,340 m³/h turnover variance between runs).

---

## Stage 2 — Tools (the biggest hole)  ← START HERE

**What's wrong (from the logs):** the plan selected ~11, only **6 ran**. Three compounding causes.

| # | Root cause (evidence) | The fix (universal) |
|---|---|---|
| 2a | **Under-selection.** My prompt said "smallest set, 6-14" — still capping at 11. | Selection rule = **FULL COVERAGE, no number cap**: enumerate every duty + every principal equipment item + every electrical feeder/cable/transformer + every control loop/instrument, and select/create a tool for each. The count falls out of the plant — 30, 60, 100, whatever it needs. |
| 2b | **Catalogue lacks RAS-native tools.** No MBBR-biofilter, packed-column-degasser, O₂-cone, UV-dose tool in the 183-tool catalogue → selector grabbed `reactor:cstr-pfr-sizing` + `process:flash-separation` (chemical) → **crashed (exit 3)**. `fluids:pipe-sizing` (a right tool) also crashed. | **Tool-creation-on-the-fly** (the missing AIM piece): when no catalogue tool fits a duty, the engine generates a new validated sizing tool (Python), self-tests it, registers it — same growing-DB pattern as the plan/class bootstraps. Plus crash-robustness on the right tools. |
| 2c | **Duties not wired as tool inputs** (your point). | Each U6 duty is seeded as a contract key → wired as the tool's input. Verify every duty is *consumed* by a tool that sizes the equipment meeting it. |

**EXTERNAL PHYSICS-DATA RESOURCE (added 2026-07-11): The Well (Polymathic AI).** 15 TB of CC-BY-4.0 physics simulations (`pip install the_well`, streamable from HuggingFace) + pretrained baseline surrogates. Full plan: `docs/THE-WELL-ANVIL-PLAN.md`. What it means for Stage 2: (1) the natural-convection/thermal correlation constants in the catalogue tools can be CALIBRATED against the `rayleigh_benard` sweep (Ra 10⁶–10¹⁰, 1,750 trajectories) — a source-rule fix with citable provenance; (2) tool-creation-on-the-fly (2b) gains INDEPENDENT non-LLM validation fixtures — a generated thermal/fluid tool's self-test bounds come from real simulation statistics, not the LLM grading its own homework. HARD RULE: no ML surrogate on the authoritative sizing path (OOD-fragile, non-deterministic, breaks `basis` provenance); ML deps live in a separate `.venv-well/`, never the chain `.venv` (gate-37).

**Done when:** the tool list covers every duty + every equipment item, ~all selected tools run, and
each duty drives a sizing tool. Shown in the dashboard's Tools section.

---

## Stage 3 — Blender model  (appalling — a REGRESSION, not the architecture)

**Correction (Tristan, 2026-06-14):** the universal model was producing good results before — it is
NOT a "universal vs bespoke" problem. Something I changed this session **regressed** it. Prime
suspects to investigate when I reach this stage: the `place_all` footprint-grid reservation
(9660fc4ff) spreading equipment across a vast empty 50×86 m floor so everything renders tiny; the
per-module "ghost-everything-else" render style; or a scale bug shrinking the 3,340 m³ tank to a box.
**Do NOT blame "universal" — find the diff that broke it.**

**What's wrong:** the per-module renders are transparent ghost-boxes; the cover is a generic skid
with a *tiny* box where a 3,340 m³ tank belongs.

| Root cause | The fix |
|---|---|
| Universal render draws equipment as faint transparent boxes, wrong scale. | Real geometry at **real scale** — a 3,340 m³ tank is a large cylinder, not a box; carry the studio lighting/materials the cover has but the modules lack. |
| "Ghost everything except this module" per-module style looks terrible. | Drop it; render each module as a proper isolated view with real geometry, or drop per-module renders entirely. |
| Cover doesn't reflect the actual plant. | Cover = the real 10-tank facility, not a generic skid. |
| Your #3: Blender should be the **single source** the drawings derive from. | Blender exports `topology-reconciliation.json` (node → the N real placed units) — see Stage 4. |

---

## Stage 4 + 8 — Wiring/piping + the 8 engineering documents

**What's wrong:** drawings read **two divergent sources** (qty-expanded manifest vs collapsed
topology) so they disagree; GA has components on top of each other + a giant block for P-102;
block-flow units sit behind each other; the **panel schedule fakes a uniform 97.1 kW** on every
circuit (it divided the total by 7); the single-line reads **0.0 A**.

| Root cause | The fix |
|---|---|
| Two sources (manifest vs topology) → P&ID/GA disagree. | **Single source:** `build_universal_scene.py` writes `topology-reconciliation.json`; every drawing reads it (#122). |
| "×10 bank" label, not N explicit symbols. | **Everything explicit** — draw each of the N tanks/connections (#123). |
| No real electrical sizing → fake-uniform loads, 0.0 A. | Real per-feeder loads from the Stage-2 electrical tools → real panel schedule + single-line currents. |
| GA overlap + block-flow occlusion. | Fix the layout: spacing/no-overlap (the spatial rule) + ordered non-occluding block-flow. |

---

## Stage 6 + 7 — Bill of materials + costing

**What's wrong:** real parts (main breaker NSX1600N, Siemens PLC, ABB REF615 relay, SMO254 piping)
are **dropped** by the 110-entry verified-parts allowlist; the 42 BoM rows have **no pricing**; the
£6 M cost stack is fixed **ratios** off a `raw_materials` number from a *different* path than the
rows → rows and headline don't connect.

| Root cause | The fix |
|---|---|
| Allowlist DROPS any part not pre-verified → thin BoM. | **Grow the allowlist:** verify the part exists (distributor/DB) → add → keep. Drop only the genuinely fictional (growing-DB write-back, the principle already in the repo). |
| BoM rows carry no price. | Price every row: **DB-first → online → educated guess**, with the basis shown. |
| Cost stack base ≠ the visible rows. | One source: cost-stack `raw_materials` = Σ priced BoM rows; ratios apply on top, so the £6 M headline traces back to the rows. |

---

## Stage 5 — The loop (ties it together)

Once tools/Blender/parts are real and dense, the existing settle-loop (parts + Blender → re-size →
until accurate) finally bites — today it's immaterial because the topology is too thin to change
anything. Verify it moves the numbers once Stages 2–4 land.

---

## Execution order (signed off 2026-06-14)

**THE LOOP is the spine** — tools → Blender → drawings, round and round **≥3 times**, THEN the BoM.

1. **Tools** — full-coverage selection (NO number cap) + tool-creation-on-the-fly (each generated
   tool **generates + passes its own self-test before use — assume broken until proven**) +
   crash-robustness + every brief duty wired as a tool input.
2. **Blender** — find + fix the regression; real geometry at real scale.
3. **Drawings** — single source (`topology-reconciliation.json`) + everything explicit + real
   electrical loads + fix overlap.
4. **LOOP 1→2→3, at least 3×.** Read **each engineering document critically** — "does this make
   sense?" Blender reveals layout / pipe-run lengths / wiring / HVAC; the drawings reveal design
   gaps. Every "this doesn't make sense" **discovers the next tool or change → back to step 1.**
   Repeat until it settles (≥3 passes).
5. **BoM + cost** — only after the loop settles: grow the allowlist (verify→add) + price every row
   (DB-first → educated guess → live lookups as a background job) + reconcile the cost stack to the rows.

After each pass I re-run RAS and show you the dashboard.

## Signed-off decisions (2026-06-14)
- **Tool-creation-on-the-fly: YES.** Each generated tool **generates its own self-test and must PASS
  it before being used** — assume it is broken; never assume it works. Stored as `candidate`.
- **Pricing:** database-first → educated guess → **live distributor lookups as a background ingest
  job** (keeps the chain quota-safe).
- **Order:** tools → Blender → drawings, **looped ≥3×**, then BoM. The loop is the spine; the
  engineering documents are **feedback that discovers new tools**, not just output.
