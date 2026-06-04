# From hand-held to autonomous: the self-interrogation loop for unseen archetypes

*Post-mortem of the CO₂ capture + mineralisation build (2026-06-03). Tristan asked for an
8–9 dossier on a never-before-seen archetype, then for the questions he had to ask me — turned
into questions the engine should ask **itself** so it can do unseen archetypes autonomously.*

---

## 0. The one-sentence lesson

A faithful new archetype did not need one "add a class" step — it needed **seven wiring layers
and four quality passes**, and *every single one stayed silent until the next re-run or the next
question exposed it*. Autonomy is not "make the engine cleverer"; it is **make the engine ask
itself the questions a sharp human asks, and make each question a deterministic check that blocks
release until answered.**

---

## 1. What it actually took

In the order the gaps surfaced (this *is* the iteration tax — none of these announced themselves up front):

| # | Layer / pass | What was wrong | Symptom if skipped |
|---|---|---|---|
| 1 | **Classifier** | new class must have a specific signature; the regex is negation-blind ("not a HAPS" matched HAPS) | routed to a dead-end / wrong class |
| 2 | **Envelope** | CLASS_ALIASES + DETECTORS, non-null scale tier | envelope fails first (exit 7) |
| 3 | **Class-plan** | without one, the auto-planner pulls **off-topic tools** (spacecraft Δv, battery PyBaMM) | nonsense tools in a chemical plant |
| 4 | **Emitter completeness** | every sub-module needs ≥1 real priced part (gate 23) | sparse BoM → **cost undercounted £55k vs ~£485k real** |
| 5 | **Class-hazards** | no entry → the §Risk page returns `null` | a whole section silently vanishes |
| 6 | **CAD template** | no `<class>-9shot.py` → generic fallback | "coloured cubes in a glass box" |
| 7 | **Tool wiring** | right `id` + `applicable_to` + **input keys matching the python `.get()`** | tools skip, or "run" on silent default inputs |
| 8 | **Tool coverage** | 4 tools for a ~12-unit-operation process | thin, unconvincing engineering; "few tools" |
| 9 | **BoM reconciliation** | real parts must classify + reconcile + de-dupe modifiers | exit 10: cover ≠ table, mis-priced lines |
| 10 | **Cost sanity** | independent estimate before trusting the number | a 5–10× wrong cost shipped as "96 % under ceiling" |
| 11 | **Iterate-to-≥8** | read the rendered PDF, score every section, hold < 8 | ship a 6/10 as if it were done |

Layers 1–7 are *structural* (the class doesn't exist faithfully without them). 8–11 are *quality
passes* (the class exists but isn't yet good). **Both are mandatory for an 8–9 report.**

---

## 2. The questions you asked — and the gap each exposed

Every one of these was a gap the engine *should have caught itself*:

| Your question | The gap it exposed | The self-question it implies |
|---|---|---|
| "can it do other sectors? what's good / bad / remains" | no map of which layers exist vs are inert | **Which of my layers are wired for THIS archetype, and which are missing or dead code?** |
| "Can it make a [satellite]?" | a class can route to a dead-end emitter | **Is this archetype classified to a *real* emitter + plan, or a stub / wrong class?** |
| "tools for spacecraft and batteries… get all sections over 8" | off-topic tools + no self-scoring | **Are the tools on-topic? Have I read my own output and scored every section?** |
| "the pdf did not show the tools appendix and other things" | sections render `null` silently | **Does every expected section actually render with real content?** |
| "the CAD looks poor / mermaid odd / few tools" | placeholder visuals + shallow tool graph | **Do the visuals depict the real product? Is the tool graph deep?** |
| "the cost seems very high" | no independent cost reality check | **Did I estimate the headline £/unit myself and compare?** |
| "I'd expect 10 tools at least" | tool count not tied to process complexity | **Does the tool count match the number of unit operations / subsystems?** |
| "why didn't it automatically pick these tools" | selection is hand-wired, not design-driven | **Did the engine do this automatically — and if not, what universal rule would have?** |

The throughline: **a human kept supplying the engineering judgment the engine lacked.** The job now is to
encode that judgment.

---

## 3. The self-interrogation loop (the deliverable)

This is the loop the engine should run **before releasing any dossier for any archetype, seen or unseen.**
Each question has a *machine answer* (how it's checked without a human) and a *fix path*. Many already exist
as deterministic gates; the ones marked **NEW** are the catches this session revealed that are not yet automatic.

### A — Does it EXIST as a real design?
- **A1. Is the archetype classified to a registered emitter + class-plan?** → check the registries resolve; if the auto-planner fired, did it compose ≥1 on-topic tool? *Fix:* add classifier signature + envelope + emitter/plan.
- **A2. Does every expected section render with real content (no silent `null`)?** → enumerate the renderer's pages; assert each returns non-null for this state. Today only some are guarded (Risk via the new `fully_wired_class_has_risk_hazards` invariant). **NEW: a universal "no section silently empty" audit.**
- **A3. Does every sub-module carry ≥1 real part?** → gate 23 (already deterministic).

### B — Is the ENGINEERING faithful?
- **B1. Are the tools on-topic?** → every selected tool's domain must intersect the design's domains; flag a delta-v tool in a chemical plant. **NEW: a tool-domain-coherence check.**
- **B2. Is the tool count proportional to the unit operations?** → count distinct sub-systems in the decomposition; if tools ≪ sub-systems, under-covered. CO₂ had ~12 unit operations and 4 tools. **NEW: a tool-coverage-ratio check.**
- **B3. Do the tools run on REAL inputs, not silent defaults?** → assert each tool step's `input_from_contract` keys match the tool's declared input keys, and the output differs from the all-defaults run. **NEW: an input-key-match + non-default-output check.**
- **B4. Did I independently estimate the headline £/output-unit and does the dossier match within ~2×?** → compute £/kW, £/(t·day), £/m² etc. against an industry band per output family; flag > 2× either direction. The £55k undercount *and* a prior £3,233/kW wind turnover both slipped because this wasn't automatic. **NEW: an independent-cost-sanity gate** (the single highest-value addition).
- **B5. Do the visuals depict the real product?** → the CAD must resolve to a class-specific template, not the generic fallback; the tools-flow graph must have ≥1 real dependency edge. Partly checkable (template resolution; `tools_flow_has_feeds_into_edges`). **NEW: assert non-generic CAD template.**

### C — Is it HONEST?
- **C1. Real part numbers (gate 20), specs within datasheet (gate 13), sized for load (gate 14), right type (gate 15).** *(already deterministic)*
- **C2. Honest tool provenance** — no tool credited for a quantity it cannot compute (cantera ≠ "capture efficiency"; those became `engineering_estimate` design parameters). **NEW: provenance-capability check** (a tool's claimed output key must be in its declared output set).
- **C3. Cover reconciles with the BoM table (gate 10 B-3); cross-page numbers agree (gate 18); standards match jurisdiction (gate 19).** *(already deterministic)*

### D — Is it ≥8 EVERYWHERE?
- **D1. Read the rendered PDF; council-score all 12 sections; the floor is 8 on EVERY section, not the average.** *(the `iterate-to-release.sh` gate)*
- **D2. Iterate on the lowest section's *root cause*, and distinguish STRUCTURAL misses (missing wiring — re-running won't help) from stochastic ones (re-run helps).** A persistent low section across iterations = a wiring gap, not bad luck.

### E — Is it UNIVERSAL? (THE AIM)
- **E1. Did the engine do A–D automatically, or did I hand-wire it?**
- **E2. For each hand-wire, what universal rule would have made it automatic?** (e.g. the tool selection below.)
- **E3. Convert the catch into a gate/invariant so the *next* archetype gets it for free.** Every fix this session that didn't add an invariant is a future regression.

---

## 4. The one change that subsumes half of Section B: feature-conditional completeness outputs

The auto-planner (`composeToolGraph`) already selects tools by *the physics the design needs*, by
backward-chaining over declared tool I/O. It is sound. It under-selects for one reason: its entire
notion of "what a design must produce" is **three keys** —
`total_system_mass_kg`, `cost_estimate_gbp`, `transport_cost_gbp` — kept tiny on purpose to avoid
over-selecting. So it would pick ~3 tools for CO₂, not 17.

The 17 tools came from engineering judgment: *a stirred reactor needs agitator-power sizing; a
flammable amine inventory needs fire-suppression; a corrosive wetted path needs cathodic-protection
sizing; any plant needs a lifecycle-CO₂ balance.* Encode that as a **feature → required-output map**,
derived from the design's own sub-modules and materials:

```
reactor / agitated vessel sub-module      ⇒ require agitator_power_w, vessel wall+mass
flammable material in BoM/hazards         ⇒ require fire_agent_mass_kg
corrosive/wetted material                 ⇒ require cp_protection_current_a
rotating equipment (pump/fan/compressor)  ⇒ require sound_power_dba
thermal duty between two streams          ⇒ require heat_transfer_kw
any plant                                 ⇒ require lifecycle_co2_t
```

These are *conditional on features the design actually has*, so they pull the right completeness
tools for **any** class without the cross-domain over-selection the tiny set was guarding against.
The hand-built 17-tool plan is the benchmark **and** the seed data for these rules. This single
change turns B1/B2/B3 from "a human noticed" into "the planner self-composed."

---

## 5. The release contract

> **An archetype is releasable when, and only when, A1–A3 pass (it exists), B1–B5 pass (it's
> faithful), C1–C3 pass (it's honest), and D1 scores ≥ 8 on every section — and every hand-wire
> required to get there has been converted into a gate or invariant (E3) so the next archetype
> inherits it.**

Today the engine enforces A3, C1, C3, and D1. The gap to autonomy is the **NEW** checks above —
chiefly **B4 (independent cost sanity)** and the **feature-conditional completeness planner (§4)**.
Build those two and roughly half the questions Tristan asked this session stop needing a human.

---

## 6. Where every improvement is tracked — and what the NEXT archetype inherits for free

**Tristan's question (2026-06-04): "are you keeping track of all the improvements and why so we can do new archetypes more easily?"** Yes — in five places: (1) **MemPalace drawers** — one per non-obvious gotcha with the *why* (search `forgeos` wing); (2) **regression-harness invariants** — the mechanical guards (each fix that could regress); (3) **commit messages** — the change + rationale; (4) **the handover** + `CURRENT-SUMMARY.md`; (5) **this doc** — the human-readable playbook.

**But the real "easier" isn't the docs — it's that most fixes are now UNIVERSAL, so the next archetype never hits the gotcha.** Below, every dimension this build surfaced, tagged **[U]** = universal (inherited automatically) or **[C]** = class-specific (still per-archetype work).

### Presentation (render)
- **[U] Per-sub-module BoM tables** — `allMods.find(m=>m.module===id)` dropped tables for duplicate module-ids → **positional resolution**. (The duplicate-module-id is a RECURRING root: it also broke cost reconciliation + the Physics-Critic `where` path. Prefer positional/token resolution over find-by-id/blind-index everywhere.)
- **[U] No mid-sentence truncation** — `clip()`/`slice()` caps cut sentences; react-pdf wraps, so caps must be generous. Two independent sources (risk + brief compliance table).
- **[U] Meta-finding filter** — the Physics Critic emits non-physical pipeline/data findings ("the design JSON is truncated") that must NEVER render as customer risks (`META_FINDING_RE`/`isPhysicalRisk`), in the register AND module annotations.
- **[U] Sourcing = procurement** — show a **main contractor** (EPC/lead-integrator role) + **key subcontractors** grouped by scope, each with a profile + real contact (website + enquiry route, never fabricated phone/email) — not a manufacturer-by-role table or bare counts. **[C]** the per-OEM profile/website map is curated class data.

### Cost
- **[U] Emitter list_price pins persist on early-return** — a fully-priced (dense) BoM hit `targets===0` → early-return BEFORE the foot-of-main write → all pins lost → cost undercounted (£21,923 vs £855k). Audit every early-return in a state-mutating script.
- **[U] Single source of truth for ex-works** — `costStack` persisted once; cover + feasibility + cost-sanity quote ONE figure.
- **[U] Independent cost-sanity gate (32)** — £/output-unit vs ex-works industry bands; catches under- AND over-counting on unseen classes.
- **[C→U PENDING] Cost-stack MODEL must be class-aware** — a bespoke engineered-to-order plant needs an **EPC stack** (equipment → engineering → installation → commissioning → contractor margin), NOT the consumer-product "channel markup → channel list price" model. Drive off annual production volume (low = EPC, high = product). This is the current `bom`-section drag.

### Engineering fidelity — the corrective principle (Tristan's strongest directive)
- **[U] Never ship a part the engine knows is wrong.** A gate/critic that FLAGS but doesn't FIX/BLOCK is a coherence failure. Physics-Critic **enforcement (gate 33, block)** + **auto-correct (Phase 2, LLM re-spec + re-check ≤2 passes)**. Generalise: any actionable fault (sizing/material/jurisdiction/pricing/missing-section) is auto-corrected or blocked, never surfaced as an unresolved defect.
- **[U] Locate parts by tokens, accept both `where`-path forms** (`/N` and `[N]`) — the live Critic uses bracket form (gate-33 was silently never firing) and the index resolves to the wrong part when module names duplicate.
- **[U] Components sized from tool loads** — transformer/boiler/feeder from `orchestratorContract.quantities`, not arbitrary defaults (auto-correct + Physics Critic enforce this).

### Jurisdiction & evaluation
- **[U] Standards match the brief's jurisdiction** (gate 19) — tool NAMES + narrative must not hard-cite a foreign code (ASME=US, PED/BS EN 13445=UK). Cite the code in the jurisdiction-aware compliance layer, keep tool names neutral.
- **[U] The council scorer** — per-section page subsets (large PDFs no longer HTTP-400), ≥2-model requirement (a single model's uniform 10.00 can NEVER PASS again), Claude routed via OpenRouter not the dead direct Anthropic key.

### Emitter
- **[C] Every sub-module needs a parts list proportional to scope** (≥4 priced), not gate-23's bare ≥1 — class-specific emitter work; a BoM-density check is the universal guard.

**Net for the next archetype:** the **[U]** items above (the large majority) now fire/render/score correctly with zero per-class work. What remains genuinely per-archetype: the 6–7 wiring layers (§1), the curated OEM/profile data, and the emitter parts density. Close the cost-stack model + the feature-conditional planner (§4) and that per-archetype surface shrinks again.
