# Generic Emitter (Wall-3) — Plan

_Synthesised 2026-06-03 from a 3-seat code-grounded council (architecture / brief-fidelity-&-plausibility / feasibility-skeptic) + verification. This is the plan for the universal-engine's hardest piece: producing a good dossier for a product class the engine has never seen._

---

## TL;DR (read this first)

1. **The generic emitter is not optional — it's the only path for an unseen class.** The LLM-Generator fallback was deleted 2026-05-23. Today a class with no hand-written plan/emitter dies at `assembler.ts` → `exit 7` (no PDF). So wall-3 is load-bearing, not an optimisation.
2. **The bioreactor "design-quality" failure (#41) was MISDIAGNOSED.** It is **not** evidence that generic generation can't honour briefs. The bioreactor has a **1,150-line hand-written emitter** that baked the wrong architecture (multi-use 316L stainless, not single-use), and a **structure-lockout** that then *rejected* the reviewers' fixes — verified in the log: `REJECT [structure-locked] add_sub_module stainless_vessel.single_use_bag_interface` and `…impeller_drive.magnetic_coupling_drive`. The Physics Critic flagged the right problems; a frozen human structure blocked the corrections. The one **generic** mechanism that ran (the `emitter-completion` gap-filler) scored **part_realism 9/10**, wrote back 9 real manufacturers, and was honest (MPNs deferred, not hallucinated). BoM audit: HIGH=0 MED=0.
3. **The realistic target is ≥6-honest concept-stage, not ≥8.** Pure-generic ≥8-everywhere stays the **north star**; it is **not the next build**. The 9.28 BESS golden is manufactured by ~4,710 lines of coupled-physics sizing logic (132 hardcoded MPNs, 406 spec literals) that does **not** live in any growable DB and that an LLM cannot reliably originate one-shot. The 30 gates *reject* wrongness; they don't *author* correct sizing.
4. **Don't start the multi-session build until a 1-day de-risk experiment gives a measured number.** Force the BESS brief down the generic path (hand-emitter held out), council-score it, compare to 9.28. That converts the "existential unknown" into go / hybrid / pivot.

**One-line recommendation:** build **generic structure + LLM physics-refinement + the 30-gate floor, MVP-targeting ≥6-honest**, wire **the auto-promotion flywheel** next, make the **semantic self-audit the universal physics backstop** — and gate the whole thing behind the **BESS-golden de-risk experiment** below.

---

## 0. The corrected premise (why this is more tractable than feared)

| Stale belief (UNIVERSAL-ENGINE-PLAN.md north-star narrative) | Verified reality (code, this session) |
|---|---|
| Unseen class → LLM Generator → weak dossier | LLM fallback deleted (`serial-design-chain-v2.tsx:2777`); unseen class → **exit 7, no PDF**. Generic emitter is the only path. |
| Bioreactor 3/10 fidelity = generic can't honour briefs | Bioreactor ran a **hand-written emitter** (`emitters/bioreactor.ts`, 1150 lines) + **structure-lockout blocked the fixes**. Not a generic-path result at all. |
| Generic parts will be fictional (gate-20 risk) | The class-agnostic gap-filler already emits **real** DB-first parts (9/10 part_realism) and **defers** unknown MPNs honestly. |
| The class-reference graph encodes "what a BESS should contain" | The BESS graph is **26 nodes / 14 fields** — a skeleton. The 9.28 lives in the **emitter's sizing code**, not the graph. |

**Implication:** much of wall-3 already exists and works (gap-filler, 30 gates, DB-first parts, the assembler seam). The genuinely-new work is (a) a structure deriver, (b) a brief-architecture enforcement layer, (c) relaxing the over-rigid lockout, (d) the auto-promotion flywheel.

---

## 1. DE-RISK FIRST — run before any multi-session commit

### Experiment A — BESS-golden holdout (≈1 day, binary outcome)
**Question:** can a generic emitter (DB structure + LLM sizing + 30 gates) get within reach of the 9.28 hand-built BESS golden **without** the 4,710-line BESS emitter?

1. Hold the BESS emitter out; force the BESS brief down the generic path (structure from the 26-node `bess-utility-scale` graph, gap-filler for parts, LLM refinement for sizing, all 30 gates active).
2. Run the real council + Physics Critic on the generic output (a warm BESS state exists).
3. Compare to the 9.28 golden, section by section.

**Decision rule:**
- **≥ 8.0 all sections → GO pure-generic.** (Confidence: low.)
- **6.0–7.9, fidelity ≥6, zero HIGH gate findings → GO hybrid, target ≥6-honest.** The realistic win; MVP validated. (Confidence: moderate-high.)
- **< 6 OR any HIGH engineering finding → PIVOT to class-family sizing plug-ins first**, then generic-structure on top. (Confidence this is where it lands: moderate.)

### Experiment B — remove the structure-lockout, re-run bioreactor (≈hours, cheap)
Allow reviewer `add_sub_module` / structure edits **when the Physics Critic flags a brief violation**. Re-run the bioreactor. **If fidelity jumps 3 → 6+**, the bioreactor "failure" was a lockout bug, not a generation ceiling — and **#41 is largely fixed for free**. This is the single cheapest high-information experiment available and should run **first**.

---

## 2. Target & scope

**MVP deliverable:** _an unseen class produces a structurally-complete, honestly-costed, brief-compliant, gate-passing dossier that scores **≥6**, with every unfilled detail explicitly marked "concept-stage / detailed-design TBD" rather than hallucinated._

Why ≥6-honest beats chasing ≥8: a £180k dossier that is structurally right, real-part, honestly-costed, and *says* "impeller sizing is concept-stage" is **sellable and trustworthy**. One that fakes 9.28-grade precision and is silently wrong on coupled physics is a **liability** (cf. the £3,233/kW wind turbine that got called a success). For "any industrial product," honest concept-stage **is** the correct product, and it's reachable now.

---

## 3. Architecture (where it plugs in + how it's built)

**Seam:** `assembler.ts` section 4 (today `return {ok:false}` → exit 7) becomes a registry **miss-fallback**, behind `UNIVERSAL_GENERIC_EMITTER` (default OFF first, like every wall). The 35 registered classes hit §1–3 and never reach it → **zero regression surface**. Output type is already `DeterministicDesign`; `finalise()` + the whole downstream pipeline (Phase-2 narrator, 31 gates, Engine-B/C pricing, render) run class-agnostically and are inherited for free.

**Structure (DB-first → graph-confirmed → taxonomy-floor):**
- **Tier A** — `pretraining_products.modules_json` (601 real products, keyed to the 12 universal modules): fuzzy-match the class → union the nearest products' module/sub-module trees (majority vote).
- **Tier B** — class-reference-graph nodes (`required` modules) + edges (cross-module grammar/coupling links), via `getClassReferenceGraphDBFirst`. Add any `required:true` node missing from Tier A; emit `cross_module_grammar_links` from edges.
- **Tier C** — generic functional taxonomy (the 12 universal modules) walked from `parsedBrief.constraints` + the auto-planner's `feeds_into` graph (every tool that produces a quantity implies its owning module).

**Words with real MPNs (gate-20-safe by construction):** emit a `manufacturer`+`part_number` **only if that pair returns `found:true` from `lookupCached`** — the same cascade gate-20 runs post-render, so the gate cannot fail on emitter-authored words. Source = `pretraining_extracted_parts` **frequency-ranked** (surfaces real recurring ABB/Siemens/Schneider MPNs over masked internal numbers). No real MPN → emit the word **without** mfr/MPN + `mod('part_number','specify at detailed design')`. Guarantee gate-23's "≥1 MPN word per sub-module" by widening the part search **sub-module → module → functional-radical**; drop the sub-module only as a last resort.

**Specs/quantities → modifiers:** map `contract.quantities` (from wall-4 + auto-planner tool outputs) onto `mod()` exactly as the BESS emitter does; `regulatory` from `pretraining_extracted_standards` filtered by jurisdiction (gate-19). **Quantities are never invented** — same invariant as the hand emitter.

---

## 4. Quality layer (so the output honours the brief + is plausible)

The fidelity failure's root cause: **the brief's architecture has no structured home, so nothing can enforce it.** "Single-use bag," "magnetic coupling," "micro-sparger" survive parsing only as free text in `additional_constraints[]`; `target_material` is one scalar that captured "316L stainless" and dropped "polyethylene bag," baking the contradiction in. Fix in three coupled pieces (all generic):

1. **Schema slot** — add a structured `architecture` block to `StructuredBriefJSON.constraints` (`types.ts`): `consumable_strategy: single_use|reusable|hybrid`, `stated_mechanisms[]{function, mechanism, forbids[]}`, `wetted_path_material` (split from structural `target_material` — grep every consumer first, additive only), `topology_assertions[]`. The parser already extracts these phrases; this re-targets them into typed, enum-normalised slots.
2. **Design contract** — fold `architecture.*` into each builder's returned contract as hard `design_assertions[]` + surface them as imperatives at the top of `brief_summary` ("MUST use magnetic coupling; MUST NOT use direct-drive/mechanical-seal; wetted path is single-use polyethylene"). The bioreactor block's hardcoded `'direct-drive, mechanical seal'` becomes a **branch on `stated_mechanisms`**, not a constant.
3. **Hard pre-render gate — `brief-architecture-fidelity-audit.ts` (exit 32, deterministic):** for each assertion: single-use ⇒ flag reusable-only signatures (CIP/SIP/electropolished-316L-as-wetted); each `forbids[]` term in any word/macro/narrative ⇒ HIGH; each required mechanism absent ⇒ HIGH. Would have hard-failed this bioreactor run on all three before any PDF.

**Plausibility — a generic `PLAUSIBILITY_BANDS` table (data, not per-class code):** keyed by `(quantity|ratio, process_regime)` → `{plausible, hard_fail, unit}`. Hard-gate the physically-impossible (vvm > 3; **source-vs-sink power balance > 5×** — the universal one, catches the 1.4 kW jacket + 20 kW TCU; derate breach) via `plausibility-bounds-audit.ts` (exit 33); soft-**clamp** the merely-suboptimal at emit time + log. Generalises the existing gate-8 thermal-derate idea from "chiller ambient" to "any power balance."

**And — relax the structure-lockout** (the #41 root cause): when the Physics Critic flags a **brief-fidelity** violation, permit reviewer `add_sub_module`/structure edits. Structure should be emitter-owned for *determinism*, not frozen against *correctness*.

---

## 5. The flywheel (the "grows" half — makes the tax sub-linear)

Wire the **dead** `writebackDiscoveredNode/Edge` (`class-reference-graph-db.ts:400/442`, zero callers today). First unseen instance of a class → generic. It scores ≥6 and a council/self-audit blesses it → promote its validated structure (sub-module tree + sizing slots) to a `class_reference` DB row. Second instance → reads the promoted template → scores higher. Pay once per class, automatically, on first sight. This is the growing-DB principle applied to the **design layer**, not just parts. (Caveat: promotion of *sizing logic* is still unsolved — you can promote the tree; the physics still leans on the LLM-refinement layer.)

---

## 6. Safety backstop (what makes generic *safe*, not just *running*)

**Biggest risk: silent confident-wrongness on coupled physics for an unseen class.** Crashes exit 7 loudly; the danger is a dossier that passes all 30 gates (which were built from **BESS-shaped** failure modes) yet is physically wrong in a way no gate encodes — the bioreactor's 20 kW-on-1.4 kW only reached MED. As we generalise, the gates' BESS-shaped coverage becomes the ceiling on trust.

**Mitigation (the correct investment regardless of which alternative wins):** make the **semantic self-audit (gate 31) the universal physics backstop** — an LLM-judge asking "does this design's physics close?" for *any* class — and gate flywheel-promotion (§5) on it. That, not a bigger emitter, is what makes generic trustworthy.

---

## 7. Build phases (smallest first; all gated behind §1 de-risk)

| Phase | What | Size | Notes |
|---|---|---|---|
| **0** | Wire `buildContract` miss → `buildMinimalContract` (wall-4) | tiny | the emitter needs *some* `contract.quantities`; today novel = `{}` |
| **1** | `generic/derive-skeleton.ts` — pure `(class, brief, graph, autoPlan) → modules[]` | small | DB rows injected → unit-testable like `composeToolGraph`; invariant: skeleton ⊇ hand graph for the 21 known classes |
| **2** | `generic/pick-verified-part.ts` — the gate-20 firewall (`lookupCached`-gated) | small | the single most important new file; makes the emitter gate-20-safe by construction |
| **3** | `generic/generic-emitter.ts` — walk skeleton, call Phase-2, map quantities→modifiers | medium | extract `cc/word/mod/makeSubModule/synthesizeRadSyntax` into shared `emitter-primitives.ts` (no duplication); register in `assembler.ts §4` behind `UNIVERSAL_GENERIC_EMITTER` |
| **Q** | Quality layer (§4): architecture schema slot + exit-32 gate + plausibility bands + lockout relax | medium | independently valuable — fixes #41 + every class's fidelity, ship even if pure-generic pivots |
| **4** | Wire `writebackDiscoveredNode/Edge` flywheel (§5) | small | last — only improves, never blocks |

Reuses: the assembler registry + `finalise()`, `getClassReferenceGraphDBFirst`, `lookupCached`, `composeToolGraph` (live), the emitter primitives, `DeterministicDesign`, all 31 gates, narrator, pricing, the `pretraining_*` tables.

---

## 8. Risks (consolidated)

1. **gate-20 ⊥ gate-23 deadlock** — every sub-module needs an MPN word, every MPN must be real; thin-coverage class may have neither. _Mitigate:_ widen part search sub→module→radical before dropping a slot (Phase 2).
2. **Silent confident-wrongness on coupled physics** — gates are BESS-shaped. _Mitigate:_ self-audit as universal physics judge (§6); honest concept-stage banner.
3. **Parser doesn't fill the `architecture` slot** — a gate guarding an empty slot is theatre. _Mitigate:_ meta-coverage check (null architecture + mechanism keywords in free text ⇒ MED) + RL-tune the parser on the 10-brief set with architecture completeness as a metric.
4. **Taxonomy/slug drift across the 4 DB vocabularies** — joins silently return empty. _Mitigate:_ centralise on `resolveClassGraphSlug`; invariant that each known class's skeleton is non-empty.
5. **`target_material` overload** is load-bearing across price-bands/BoM/contract. _Mitigate:_ additive `wetted_path_material`, never repurpose `target_material`; grep all consumers first.

---

## 9. Honest verdict

- **Generic ≥8 universally, near-term: NO** (high confidence). The 9.28 is coded coupled-physics, not growable data; LLMs can't originate it reliably one-shot; gates reject, they don't author.
- **Generic ≥6-honest universally, gate-passing, real-part, honestly-costed, near-term: YES** (moderate-high confidence). The components exist and partly shipped in the bioreactor run; the gap is (i) relaxing the structure-lockout and (ii) wiring the auto-promotion flywheel.

**Sequence:** Experiment B (lockout, hours) → Experiment A (BESS-golden, 1 day) → if hybrid: Phase 0 → Q → 1 → 2 → 3 → 4. Pure-generic-≥8 stays the north star; ≥6-honest is the next build.
