# PLAN — Deterministic **and Correct** Generation for the BESS Design Dossier (Engine v2)

_v2 — post-council. Authored 2026-05-28. Drives TRACKER.md #228-230._
_Directive (Tristan, option 2): "make generation deterministic … detailed plan → council → revised plan → execute, autonomously."_
_Council (Gemini 3.1 Pro / Grok 4.3 / GLM-5.1 / Kimi K2.6) verdict on v1: direction sound, but `plan_is_sound:false` — six 2-seat holes + the deepest finding: **deterministic ≠ correct**. v2 folds all of it in._

---

## THE REFRAMED GOAL (council's deepest finding)

GLM + Kimi independently named the single biggest risk: **"deterministic wrongness" / "a reproducible lie."** Making the design byte-identical run-to-run will stabilise the council score — but if the pinned numbers/prices are *wrong* (laundered price estimates, over-mass design, conflated thermal figures), we get a **stable score on a wrong document**. So the goal is **deterministic AND engineering-correct**, verified by reconciliation gates, not determinism alone.

---

## 0. Root-cause map (verified in code by two agents 2026-05-28; council corrections folded)

**(I) Three post-emission LLM mutation layers corrupt part identity run-to-run** (the `part_realism` variance):

| # | Stage | File:line | Determinism | The hole |
|---|---|---|---|---|
| 1 | **Physics-Repair Loop** | `chain:3096-3128` → `radical/physics-repair.ts:406` (`add_word` 435-445, `replace_modifier` 452-465) | Gemini 3.1 Pro, temp 0, **no seed**; fires **conditionally** on critic HIGH / plausibility≤5 | **Bypasses `applyPatches()`** (comment :395) → no allowlist/MPN guard. `replace_modifier` on a non-existent kind silently **adds** it = the **Module-8 MPN smear**. Conditional firing (LLM critic trigger) is itself non-deterministic. |
| 2 | **Reviewer R1/R4/R4.5** | `applyReviewerPatches:585`, `add_word_to_sub_module:679-748`; sites :2904/:2962/:3027 | Grok/GLM/Qwen **ignore seed** | New-word branch pushes verbatim — **no allowlist** (allowlist only guards Phase-2 `applyPatches`). Accepts net-new `manufacturer`/`rating` → mismatched (mfr,MPN) pairs. |
| 3 | **Phase 2 repair** | `applyPatches:498`; allowlist :538-593; catch-all `cursor[last.key]=value` :824 | Flash-Lite temp 0 (Google→seed) = most deterministic | Allowlist validates `part_number` **only**; catch-all sets `manufacturer`/`rating`/`form`/**`quantity`** unguarded. |
| — | NL layer | `sentence-generator.ts:1101/1189` | **zero LLM calls** | Copies canonical numbers. **Already correct — leave alone.** |

> Council note (Kimi): both Physics-Repair **and** the reviewers have an `add_word` op — they are *different code paths*; A-phase addresses **both** (A1 = physics-repair path, A2 = reviewer path). Not a contradiction.
> Council note (GLM/Kimi): the "ignore seed" claim is real (seed isn't forwarded to those providers) but temp-0 non-determinism is also provider-side batching — **model-swap is not guaranteed to fix prose determinism**, so don't over-invest there (see E5).

**(II) Seven single-source-of-truth violations** (cross-page numeric contradiction):

| # | Quantity | Conflicting values | Delete (re-derivation/hardcode) | Canonical |
|---|---|---|---|---|
| 1 | Thermal | ~20 / 26.7 / 33.4 / 35.4 kW | emitter `:2536` hardcode; `:508` dup; contract `×1.5` `:720`; inverter-loss self-inconsistency (`15` vs formula `:663`=20) | **split** into distinct physical fields (Kimi) — see B1 |
| 2 | Usable energy | 2.5 / 2.65 / 2.69 MWh | "2.69" literal `chain:2446`; stale "2.65" | `usable_capacity_kwh`=2688 |
| 3 | Nameplate | 3.36 MWh | recompute `headline-deriver.ts:247` | `nameplate_capacity_kwh`=3360 |
| 4 | System mass | 29875 / 32175 / 34125 kg | Mass-Aggregator rendered authoritative vs contract `:738` | `in_container_mass_kg` / `system_mass_with_external_kg` |
| 5 | Transformer | 1000kVA / 1MVA / 1250kVA | emitter "Trihal 1000kVA/1 MVA" | `transformer_rating_kva`=1250 |
| 6 | Payload | brief cap 35000 vs ISO payload 26580; design **29875–32175 > 26580 = BREACH** | compliance uses wrong denominator | ISO-668 payload limit (hard gate — B4) |
| 7 | Standards | 0 / 7 / 3 / 118 | `render:2078` reads empty registry | one merged set `render:6426` |

**(III) Pricing never reads the DB.** iter-60 (155 lines): **0 cache hits**, 23 emitter-pinned, **127 curve estimates**, 2 LLM. Estimator never calls `lookupCached`. `oem_subsystem` ref=£10k → chiller + AC + **aspirating smoke detector** all £10k; `sensor` curves to £1. **132/155 lines carry only a generic name with no MPN** → can never key the cache. _Council: this is an **emitter contract violation**, not a data gap (C1)._

---

## 1. ANCHORS (non-negotiable — diff-check before every revision)

- **A1 — Emitter is the sole owner of part identity + quantity.** Only `deterministic-emitter.ts` may set/alter `content_character`, `part_number`, `manufacturer`, spec modifiers (`rating_*`, `capacity`, `dimension`, `form`, `material`, `regulatory`), **and `quantity`** (Gemini). No LLM stage may add or mutate these.
- **A2 — One canonical source per scalar.** One named contract field per quantity; cover/compliance/headline/prose/NL all **read** it via shared formatters; nothing recomputes, hardcodes, or independently rounds (GLM formatting contract).
- **A3 — BESS BoM 100% DB-pinned to *verified* rows.** Every line resolves to a real `(manufacturer, MPN, price)` with provenance `verified`. Curve estimator is a backstop for unsupported parts only, **bounded** (C5), and **never fires on a supported class** (gate).
- **A4 — Stay universal** (35 classes); backstop preserved for graceful degradation; no BESS-only hacks.
- **A5 — Determinism target (corrected):** the **structured-state hash over parts+numbers+prices** is byte-identical across two runs of the same brief (NOT the PDF bytes — Grok/Kimi). Prose wording may vary but may contain **only** numbers that trace to a canonical field (A6) and **only** emitter-pinned parts.
- **A6 — Every LLM-touched prose number must trace to a canonical contract field** (new; GLM/Kimi/Grok). The numeric equivalent of the MPN allowlist.
- **A7 — Deterministic AND correct.** Every canonical number is engineering-correct and reconciled (mass = Σ parts; energy = cells×Ah×V; payload ≤ ISO limit); every price is curated-real. No reproducible lies.
- **A8 — Emitter fails closed on unidentifiable parts** (new; council consensus). Every word carries a DB-resolving `(mfr, MPN)`; generic words only where the class explicitly whitelists them.
- **A9 — Every fix ships a regression invariant** (project rule #11).

---

## 2. PHASES (council fixes back-propagated into each block)

### PHASE A — Lock the design state against LLM part/spec mutation
_Kills the `part_realism` run-to-run variance + the Module-8 smear._
- **A1.** `physics-repair.ts:applyPhysicsRepairPatch` — **remove** `replace_modifier` on `part_number`/`manufacturer`/`rating_primary` and the `add_word_to_sub_module` branch (435-445). Restrict to `set_derived_parameter` + prose `edit_field` only.
- **A2.** `applyReviewerPatches:add_word_to_sub_module` (679-748) — apply the verified-parts allowlist + new-word-MPN reject. **Reject the new word entirely** (not just its MPN field — GLM) unless it carries a DB-matching `(mfr, MPN)`. No free-standing generic words from reviewers.
- **A3.** Extend both `applyPatches` catch-all (:824) and the reviewer merge to lock the full set: reject net-new/changed `manufacturer`, `rating_primary`, `form`, **`quantity`** on any emitter-pinned word. **Validate `(manufacturer, MPN)` as a composite key into the parts DB** — reject a valid-mfr + valid-MPN-from-a-different-row phantom pairing (GLM); add a unit test for that exact case.
- **A4.** Remove Physics-Repair's **conditional LLM trigger** (GLM/Kimi): make it unconditional with a no-op path, or delete it if Phase B makes its derived-param role redundant. No stochastic-critic branch.
- **A5. Numeric-claim guard (new; BLOCKER).** After reviewers and after Phase 2, extract every numeric literal from LLM-touched prose; each must match a canonical contract field within formatting tolerance; reject/flag unsourced numbers. New gate.

### PHASE B — Single-source **and correctness** of every number
- **B1.** Add canonical contract fields. **Thermal: do NOT collapse to one scalar** (Kimi) — emit distinct physical quantities (`cell_heat_generation_kw`, `hvac_design_load_kw`, `thermal_rejection_capacity_kw`, `standby_aux_loss_kw`); each prose site cites the *correct* one; fix the inverter-loss `15`-vs-`20` bug at `:663`. Confirm single fields for usable/nameplate energy, mass, transformer.
- **B2.** Delete each re-derivation/hardcode in §0(II) and replace with a read through **shared formatters** (`fmtPower`/`fmtMass`/`fmtEnergy`, pinned precision; extend existing `formatMassKg`); no `toFixed`/`Math.round`/unit-convert in consumers (GLM).
- **B3. Mass reconciliation (Gemini/GLM).** Mass-Aggregator defers to `in_container_mass_kg`; **add a hard gate: |Σ BoM part masses − canonical system mass| ≤ ε**, else fail.
- **B4. Payload — HARD gate, not disclose-only (unanimous).** Add gate: `system_mass ≤ container_payload_limit × safety_factor`. The current 29 875–32 175 kg vs 26 580 kg standard-40HC breach must be **resolved deterministically by the emitter**, not warned. **Tristan-confirmed 2026-05-28: option A — bespoke heavy-duty enclosure.** The emitter keeps the 2.5 MWh energy target and declares a **bespoke heavy-duty enclosure rated to the actual gross mass + on-site cell-install / heavy-haulage transport note** (the realistic utility-BESS answer — Megapack/EnerC/Sungrow are not standard-payload ISO units). The hard gate therefore checks mass against the **declared enclosure rating**, not the standard ISO-668 payload, and the dossier states the enclosure rating + transport method explicitly. NOT capacity-cut (would breach the energy brief), NOT silent standard-ISO claim.
- **B5.** One merged standards set (`mergeBriefAndClassStandards`); `standardsCount` and all sections cite it.

### PHASE C — DB-pin 100% of the BoM, **correctly**
- **C1. Emitter fails closed (BLOCKER; A8).** Change the emitter contract: every BoM word must carry `(manufacturer, MPN)` resolving to a DB row; generic words only where the class whitelists. Extends gate 23 from "≥1 MPN word per sub_module" to "every word identified." Retrofit the 132 BESS generics (Apollo, Pfannenberg, LEM, Mersen, etc., **real catalogue parts, never invented**) as the one-time migration.
- **C2. Ingest CURATED prices only, with provenance (BLOCKER; unanimous).** `distributor_cascade_cache` gets only `verified` rows `(mfr, MPN, price, source, date)`. **Tier (GLM):** safety-critical / ≥£500 / structural → curated datasheet price; commodity <£500 → flagged `estimate` in a **quarantine table** (`verified:false`), auto-queued for curation. **Never** promote a curve estimate to a canonical price. Ingest via `scripts/ingest/*` only (chain stays a pure DB consumer).
- **C3. Pricing Gateway (Gemini SRP).** A gateway node: cache-first → on-miss → estimator. The estimator has **no DB knowledge**.
- **C4. Deterministic price classifier (Kimi/GLM).** Replace the Flash-Lite class-classifier with a rule-based taxonomy (keyword + MPN-prefix; `component-classes.ts` is already keyword-driven — make it fully deterministic, no LLM). Decompose the £10k `oem_subsystem` class into sub-classes.
- **C5. Per-class price sanity bounds (BLOCKER; GLM/Kimi).** min/max per class; any backstop price outside bounds = hard reject + flag for DB-backfill. Universal.
- **C-gate.** Supported-class gate: **zero estimate-sourced lines** on BESS (A3).

### PHASE D — Deterministic repair path (the council's #1 hole)
- **D1 (BLOCKER; all 4).** Sizing/thermal/electrical repair must be **deterministic**: when a sizing gate (6/13/14/16) fails, the **emitter re-derives** the part from the failed constraint via its selection functions (`selectPfannenbergEbXt`-style), bounded re-emit (≤2). If it still fails → **hard error** (`PART_UNDERSIZED`), never an LLM swap. This replaces Physics-Repair's part-swap role removed in A1. **First action: verify whether Physics-Repair part-swaps even fire on current BESS** (`state.physicsRepair.iter_diagnostics` / `actions.jsonl`) — if they don't, D1 is build-time only and cheap.

### PHASE E — Prove convergence + harden
- **E1.** Determinism test: same brief ×2 → **byte-identical structured-state hash on parts+numbers+prices** (A5), exit-1 on diff.
- **E2. Gate audit (GLM/Kimi).** Document which gate catches which root cause; add the new gates (numeric-claim A5, composite (mfr,MPN) A3, mass-reconciliation B3, payload B4, price-sanity C5, zero-estimate-lines C-gate). Confirm **semantic** gates read structured state; rendered-text parsing (gate 3 layout, gate 11 cross-page) is allowed **only** as a render/layout backstop (push-back on Kimi's absolute "no gate parses text" — gate 11 legitimately does).
- **E3.** Regression invariants per fix (`scripts/regression-harness.tsx`).
- **E4.** End-to-end BESS run (all gates exit 0) → 4-seat council read. Expect `part_realism` jump + score stops swinging.
- **E5.** Council-seat determinism: note the seed limitation; **defer** model-swaps unless `presentation_quality` variance persists after A-D (Gemini/Kimi: it's the small axis).

---

## 3. Sequencing & verification
A (cheap, highest-leverage, no chain run) → C1+C2+C5 (raises `part_realism` level) → B (numbers) → D1 (verify-first, likely build-time) → E. Each phase = own commit(s) + invariant + (where it touches patch/merge logic) a coding-council-on-implementation. Cost monitor armed before the first chain run (E1/E4).

## 4. Council Remediation Log (finding → where resolved)
- Repair vacuum (all 4) → **D1**. · Numeric prose guard (GLM/Kimi/Grok) → **A5/A6**. · Price laundering (all 4) → **C2/A3**. · Price sanity bounds (GLM/Kimi) → **C5**. · Payload hard-fail (all 4) → **B4**. · Emitter fail-closed (consensus) → **C1/A8**. · Lock `quantity` (Gemini) → **A1/A3**. · Mass reconciliation (Gemini/GLM) → **B3**. · Composite (mfr,MPN) key (GLM) → **A3**. · Det. price classifier (Kimi/GLM) → **C4**. · Thermal split (Kimi) → **B1**. · Det. test on state-hash (Grok/Kimi) → **A5/E1**. · Conditional trigger (GLM/Kimi) → **A4**. · Gate audit (GLM/Kimi) → **E2**. · Formatting contract (GLM) → **B2**. · Pricing Gateway SRP (Gemini) → **C3**.

## 5. Product fork — RESOLVED (Tristan, 2026-05-28)
**B4 payload → option A: bespoke heavy-duty enclosure** + on-site/heavy-haulage transport note, keep 2.5 MWh energy. (Rejected: capacity-cut to fit standard ISO; multi-container split.) See B4.
