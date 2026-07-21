# Design Identity + Scale Lock — stop noun-collision class drift

**Date:** 2026-07-20  
**Audience:** Terminal (Claude Code) — execute; Cursor advises  
**Constraint:** UNIVERSAL only. No `if organoid` / per-product branches. Gold products are proveCatch fixtures, never paste targets.

---

## The failure mode (Tristan’s “heater” example)

The classifier often gets the **product roughly right** (desktop instrument / benchtop bioreactor). Downstream stages then re-identify the design from **shared nouns**:

| Shared noun | Benchtop meaning | Plant meaning that leaks in |
|---|---|---|
| heater | cartridge / film / TEC block, watts | RAS tank heater, ASHP, kW process heat |
| cartridge | heater element | cartridge *filter* pressure vessel |
| vessel | 20 mL culture vial | 3 m³ process tank |
| pump | peristaltic µl/min | DN25 process pump |
| filter | optical / inline micron | underdrain / backwash skid |

Keyword relevance + corpus RAG + word-explode treat “heater” as a retrieval key into fish-farm / chemical-plant templates. The dossier stays *mostly* a desktop product with **big leftovers** of another technology. That is class drift, not a one-off BoM bug.

**Existing partial nets (keep; not enough alone):**

| Net | What it does | Gap |
|---|---|---|
| Gate 34 domain markers | Marine / irrigation / hydroponic / refrigeration / AM | No **scale-of-heater** family; shadow by default |
| `demoteLiquidThermalPlantAtAirCooledScale` | Demotes plant anatomy on watt-scale | **Late** — plant words already emitted; demote ≠ never retrieve |
| F1c `isDeviceScaleProduct` | Suppresses £10k+ plant cost anchors | Cost only |
| F1a / process_plant_vessel bind | Flags pressure-filter leak on device-scale | Detect after emission; doesn’t stop tool/RAG pick |
| Relevance-sweep EXCLUDES signal | Soft advice to LLM | Keyword YES still wins |

---

## Strengthening principle

> **Pin physical identity once from the brief. Never re-infer product type or scale from a part noun.**

Nouns are overloaded. **Envelope + power + working volume + form factor** are not. Every retrieval, tool pick, and word-expand must be gated by that pinned identity.

```
brief parse
  → design_identity (immutable)
  → tools / RAG / class-graph / emitters / Blender
       each asks: does this candidate’s declared scale+domain fit identity?
  → gate 34+ scale family (detect leftovers that slipped)
```

---

## Layer 0 — `design_identity` contract (SOURCE pin)

**When:** immediately after envelope detection / before tool plan + Stage 1.7 emission.  
**Where (hooks):**

- Emit: `scripts/lib/orchestrator/envelope.ts` + write onto `state.designIdentity` in `serial-design-chain-v2.tsx`
- Consume: relevance-sweep, bootstrap-tool-plan, generic-emitter, universal-contract-sizing, enrich-state-with-reference-anchor, build_universal_scene

**Schema (universal, signal-keyed):**

```ts
type DesignScaleTier =
  | 'handheld'      // <~0.02 m³, hand-held
  | 'benchtop'      // <1 m³, lab instrument / kit
  | 'cabinet'       // rack/cabinet, still site-power LV
  | 'plant'         // process plant / building / multi-m³
  | 'field'         // erected outdoors / farm

interface DesignIdentity {
  product_class: string           // classifier slug (advisory)
  scale_tier: DesignScaleTier     // AUTHORITATIVE — from dims/power/volume
  form_factor: string
  // HARD pins from brief (null only if truly absent):
  enclosure_volume_m3?: number
  max_edge_mm?: number
  peak_electrical_power_w?: number
  working_volume_ml?: number
  // Coarse technology family from envelope+brief duties — NOT from BoM nouns:
  primary_domains: Array<
    | 'lab_electronics' | 'lab_optics' | 'lab_thermal' | 'lab_fluid_micro'
    | 'bioprocess_lab' | 'power_electronics' | 'energy_storage'
    | 'process_chemical' | 'aquaculture' | 'hvac_building' | 'marine_vehicle'
    | …
  >
  identity_locked: true
  basis: string                   // which brief fields forced the tier
}
```

**Derivation (same signals as `isWattScaleInstrument` / `isDeviceScaleProduct` — one shared helper):**

```ts
// INTENT: Single SOURCE for "is this a lab device vs a plant?"
// Never derive from word names like "heater".
export function deriveDesignScaleTier(c: ParsedConstraints, env: BriefEnvelope): DesignScaleTier
```

Rules of thumb (encode + selftest, not a class table):

- `enclosure_volume_m3 < 1` AND (`peak_W ≤ 120` OR `working_volume_ml ≤ 500`) → `benchtop` (or `handheld` if max edge ≤ 155 mm)
- Multi-m³ / building footprint / nameplate kW–MW → `plant` / `field`
- Classifier slug may *suggest* domain; **scale_tier wins** on conflict

**Immutability:** after lock, no stage may change `scale_tier` because a tool or word said “heater”. Only a brief rewrite (Stage 2.6) may re-lock.

**proveCatch:** fixture brief with 20 mL + 35 W + “heater” in text → `scale_tier=benchtop`, never `plant`.

---

## Layer 1 — Hard scale veto on tools (prevent, not demote)

**Problem:** relevance-sweep is LLM YES/NO on shared words. Soft EXCLUDES is not enough.

**Fix:**

1. **Tag every tool** with declared `scale_tiers: DesignScaleTier[]` and optional `domains[]` in the tool registry (`scripts/lib/orchestrator/tools/*.ts` + `types.ts` Tool interface).

2. **Hard filter before the LLM sweep** in `relevance-sweep.ts` / `bootstrap-tool-plan.ts`:

```ts
// DECISION: Hard veto beats keyword YES.
// A plant-only heater/RAS/process tool must be invisible to benchtop identity.
if (!tool.scale_tiers.includes(identity.scale_tier)) {
  verdict = { relevant: false, reason: 'scale_tier_mismatch', source: 'hard_veto' }
  continue  // do not even ask the LLM
}
```

3. Extend the sweep prompt with an explicit line (backup, not the only gate):

> This product’s LOCKED scale_tier is benchtop (enclosure &lt; 1 m³, ≤120 W).  
> A tool that sizes fish-farm heaters, DN pipe, skids, kW chillers, or building HVAC is ALWAYS NO — even if the brief contains the word “heater”.

4. Wire the same veto into `orchestrate.ts` `toolLeaksWrongDomain` path (already runs applicable_to + gate-34 check — add scale).

**proveCatch:**

- Benchtop identity + catalogue containing `aquaculture`/`process` heater tools → 0 of those in `relevant[]`
- Plant RAS identity → lab cartridge-heater micro tools excluded

**Starter scale tags (examples — complete by tool author, not by product):**

| Tool family | scale_tiers |
|---|---|
| pressure-vessel plant / backwash / underdrain | `plant`, `field` |
| irrigation / RAS tank heat | `plant`, `field` |
| lab Peltier / cartridge thermal duty | `handheld`, `benchtop` |
| building HVAC load | `cabinet`+ only when application is space-conditioning; never benchtop bioprocess |

---

## Layer 2 — Scale-gated corpus / class-graph / RAG

**Problem:** Stage 17.6 + class-reference graphs retrieve “heater” neighbours from industrial corpora.

**Fix (universal):**

- Every corpus / graph edge / pretraining part row that is used for *suggestion* must carry `scale_tier` or a computable proxy (unit price band, typical envelope, power).
- Query path: `dualSearch` / library candidates **AND** `candidate.scale_tier ∈ identity.compatible_tiers`.
- Class-reference graphs: split or tag modules as `lab_*` vs `plant_*`; benchtop never unions plant module groups for noun “heater”.

**Hooks:** `scripts/lib/orchestrator/generic/generic-emitter.ts` (graph union), Stage 17.6 RAG, `enrich-state-with-reference-anchor.tsx` (already suppresses £10k+ — extend to **reject** plant anatomy templates, not only price).

**proveCatch:** device-scale state must not receive reference anchors or graph modules whose basis is aquaculture/process-heater plant.

---

## Layer 3 — Homonym-safe word expand (emitter)

**Problem:** `cartridge_heater` exploded into pressure-filter plant anatomy (council H1). Demotion cleans some leftovers; expand still starts wrong.

**Fix:**

1. Word / character templates declare `allowed_scale_tiers` + `role` (thermal_actuator vs filtration_cartridge).
2. Explode / skeleton floors in `derive-skeleton.ts` + `universal-contract-sizing.ts` take `design_identity` first:

```ts
// GOTCHA: "cartridge" + "heater" must NEVER select cartridge-filter plant template
// when identity.scale_tier ∈ {handheld, benchtop}.
if (isLabScale(identity) && /heater/i.test(characterId)) {
  useLabThermalActuatorTemplate()  // film / cartridge element / TEC — not skid
}
```

3. Keep demotion as **backstop**, not primary defence.

**proveCatch:** frozen 2150-style word list — zero `process_plant_vessel` children under any `*heater*` character on benchtop identity (already partially gated; make expand the SOURCE).

---

## Layer 4 — Gate 34 `PLANT_SCALE` marker family (detect leftovers)

Extend `tool-archetype-coherence-audit.ts` (and word-domain coherence) with a **scale** family, suppressed only when `design_identity.scale_tier ∈ {plant, field}`:

| Marker examples | Why |
|---|---|
| `\bDN\s*25\b`, `\bDN\s*[4-9]\d\b` | Process pipe on a lab kit |
| `400\s*V\s*3` / `25\s*kVA` incomer | Plant electrical on 35 W device |
| `backwash`, `underdrain`, `air scour`, `skid frame` | Filter-plant anatomy |
| `working volume` in m³ when brief was mL | Scale unit collision |
| `£/m³` / multi-kW chiller prose on watt-scale | Cost/thermal plant leftover |

On `handheld`/`benchtop`: any of these in worked-calcs, contract quantities, **or BoM word names** → HIGH → route to Layer 1/3 SOURCE (not “re-spec the heater”).

**Enforce** when ready (`TOOL_ARCHETYPE_ENFORCING` or a dedicated `SCALE_COHERENCE_ENFORCING`) — shadow first with proveCatch on 2150.

Mirror the inverse lightly: plant products emitting “1206 chip resistor as tank heater” is a different gate (slot-mispin) — don’t conflate.

---

## Layer 5 — Early halt if identity contradicts design (G0.5+)

If after tools/contract the design’s **achieved** envelope/power/volume disagree with locked identity by &gt; order-of-magnitude (e.g. brief 20 mL, contract culture vessel 3.1 m³):

- Hard fail / brief-rewrite — same spirit as G0.5 scale mismatch
- Do **not** “average” plant leftovers into the dossier

**Hook:** Stage 7.5 reconciliation + F1b geometry emitter (metre-scale part → size from working volume).

---

## Why the engine keeps missing this (so the fix sticks)

1. **Product class ≠ technology identity.** Slug can be right while every noun-driven stage behaves like a fish farm.  
2. **Demotion is apology, not prevention.** Plant templates still enter via tools/RAG/explode.  
3. **Gate 34 is domain-flavoured, not scale-flavoured.** Seawater ≠ “big heater”.  
4. **LLM relevance treats shared words as evidence.** Hard veto must precede the model.  
5. **Scoring can still look fine** while leftovers remain — bind scale leaks into ships (Pillar 1 process_plant_vessel is the pattern; extend to PLANT_SCALE markers).

---

## Sequencing for Terminal (fits macro punchlist)

| Order | Item | Punchlist / gate |
|---|---|---|
| 1 | Shared `deriveDesignScaleTier` + `state.designIdentity` lock | New S/F identity row |
| 2 | Tool `scale_tiers` + hard veto before relevance-sweep | Strengthens G34 prevent layer |
| 3 | Homonym-safe heater/vessel/pump explode on lab scale | F1a SOURCE completion |
| 4 | PLANT_SCALE markers + word-domain bind → ships | Extends Pillar 1 / G34 |
| 5 | Corpus/RAG scale filter | DB/grow-loop adjacent |
| 6 | G0.5+ achieved-vs-identity halt | F1b/F1d companion |

Do **not** add `if product_class == bioreactor`. A 35 W open colorimeter with a “heater” mention must get the same veto as a benchtop bioreactor.

---

## Acceptance (fixture-based, universal)

On frozen `out/organoid-bioreactor-20260719-2150/` (and any future benchtop+heater brief):

1. `state.designIdentity.scale_tier` ∈ `{handheld, benchtop}`  
2. Tool plan contains **zero** plant/RAS/process-heater tools  
3. Zero `process_plant_vessel` / PLANT_SCALE marker words in BoM  
4. proveCatch unit tests: keyword “heater” in brief does **not** flip scale_tier or admit plant tools  
5. A real plant brief (aquaculture RAS / chemical) still admits plant heater tools (inverse proveCatch)

---

## One-line doctrine for every future fix

**If the only bridge between this candidate and the brief is a shared English word, it is the wrong candidate.** Scale + domain must agree with the locked identity first.
