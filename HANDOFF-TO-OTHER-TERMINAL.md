# Handoff to the other terminal — 2026-06-06

This terminal ran the **CO₂-mineralisation dossier** session. **ALL of my work is COMMITTED** (15 commits, listed below) — nothing of mine is left uncommitted. The dirty working tree (4 modified + 440 untracked) is **NOT my work**: it predates this session or belongs to other workstreams (notably `report-compiler-prototype/`). It's all labelled below so you can decide what to do before merging. **There is no active merge/rebase or conflict** (checked: no `MERGE_HEAD`, no `UU/AA` markers) — the blocker is just the dirty tree.

---

## 1 · My commits (already in HEAD — do not redo)
```
0ff814ac9 style(renderer): restyle Engagement Plan to house palette + single call-to-action
a7dc5edb3 fix(bom): stop Phase-2 density-repair fabricating filler words (root fix)
c95f4f8f0 docs(co2): cost audit trail, dossier purpose, advisor engagement plan, HAPS scope + mockups
03fd84df8 fix(bom): strip-filler-words tool for placeholder-padded states (interim)
aa2a82dac chore(blender): co2 open-frame skid render
d7116ea26 test(harness): session invariants (lime, density, gate-18, compliance, dedup, advisor, exec)
38bb6b1c4 feat(renderer): co2 dossier rendering
2add6954f feat(chain): wire cost-basis + advisor-engagement stages
bc9964417 feat(advisor): Engagement Plan advisor-block generator
cd289f9ce fix(exec-summary): grammar defects + no-breach next-steps contradiction
1652e863f fix(audits): gate-18 distinct-quantity cluster splits + compliance unit-agnostic metric map
076abd11f fix(splitter): density-aware bin-packing restores sub-module density to ~2.0
ed21db00c feat(cost): material take-off + DOE/NETL cost-basis engine
54d0ec0bc feat(co2): dual-sink hydrated-lime carbonation reactor + engineering contract
```
Files I touched (all committed): `render-minimal-pdf.tsx`, `serial-design-chain-v2.tsx`, `regression-harness.tsx`, `submodule-splitter.ts`, `cross-page-numeric-consistency-audit.ts`, `brief-constraint-completeness-audit.ts`, `engineering-contract.ts`, `orchestrator/class-plans/co2-mineralisation.ts`, `orchestrator/emitters/co2-mineralisation.ts`, `src/lib/pdf-engine-v2/lib/{executive-summary,advisor-engagement}.ts`, `src/lib/pdf-engine-v2/radical/universal-repair.ts`, `scripts/lib/cost/*`, `scripts/blender-templates/*`, `scripts/{validate-advisor-engagement,strip-filler-words}.tsx`, + co2 docs/mockups. **If your branch also edits any of these, expect a real merge there; everything else is clean.**

## 2 · Uncommitted in the tree — NOT mine; your call

**Modified tracked (4)** — already modified before my session (prior-session / other-workstream). I deliberately left them:
- `scripts/lib/background-enrichment.ts`
- `scripts/lib/fictional-pn-audit.ts`
- `src/lib/pdf-engine-v2/lib/emitter-completion.ts`
- `next-env.d.ts`  ← Next.js auto-generated; safe to `git checkout -- next-env.d.ts`

**`report-compiler-prototype/` (418 untracked)** — a separate workstream, untouched by me.

**Other untracked (prior/other work — review):**
- briefs: `src/lib/pdf-engine-v2/briefs/{cgm,dac,haps-50m,humanoid,pemfc,vertical-farm-container}.md`, `briefs/custom/oxccu-saf-ptl-plant.{md,html}`, `briefs/thin-tests/`
- scripts: `co2_class4_capex.py`, `ingest/seed-bess-grid-parts.ts`, `lib/mpn-shape.ts`, `lib/verify-leg.test.tsx`, `run-class-iter.sh`, `run-vf-iter.sh`, `smoke-orchestrator-30-classes.tsx`
- `V6-WORKSTREAMS-AUDIT.md`

**Artefacts / data / temp — do NOT commit (gitignore candidates):**
- `out/` (run outputs — the bulk of the untracked count), `out-exp-a-launch.log`, `out/_co2_v8_reason_capture.json` (my read-only scorer-reason evidence)
- `forge-truth.db` (the database), `.claude/worktrees/`, `_t25b.ts`

## 3 · To unblock your merge
Pick one:
- **`git stash -u`** → merge → **`git stash pop`** (sets the whole dirty tree aside, simplest), OR
- commit *your* work by **explicit path** (never `git add -A` — it'd sweep up `report-compiler-prototype/`, `out/`, `forge-truth.db`), OR
- add the artefacts to `.gitignore` (`out/`, `*.log`, `forge-truth.db`, `.claude/worktrees/`, `_t25b.ts`) so they stop dirtying the tree.

---

## 4 · Universal fix for `design_modules` (~7.0–7.3) & `grammar_language` (~7.0–7.5) — diagnosis for your run

**ROOT CAUSE:** The deterministic-emitter / orchestrator chain path (the default Generator replacement) produces **ZERO LLM narrative prose** — every module/sub-module narrative is 100% deterministic-template, which the multimodal scorer reads as robotic/repetitive/false-precision/word-salad. **Universal**: any class on this path gets template-only prose. CO₂ exposes it worst (duplicate-ID modules, chemical formulae, raw solver constants).

**Two decisive evidence points:**
1. `out/co2-mineralisation-2sink-v8/log.txt:88` → `sub-module prose pre-fill: rewrote 26/26 sub-modules (LLM english_sentence dropped words; deterministic prose covers all)` — the LLM `english_sentence` is **discarded for all 26 sub-modules**.
2. `module-paragraph-llm.ts` (Piece 1F, fills `overview_paragraph_en`) is **never invoked in `scripts/serial-design-chain-v2.tsx`** → 11/13 module overviews empty → render falls back to a mechanical concat.

**What the scorer penalises** (verbatim, calibrated Claude-Opus + Qwen3-VL pair — REAL, not noise): robotic phrasing + **verbatim duplication** (module paragraph === concat of its sub-module sentences in 9/13 modules); **false precision** (`4.8035 m³`, `396.62 W/m³`, `0.2346 m`, 16-digit `k2so4_loop_equilibrium_K=61,621,006,169,164,950`, degenerate `P=0` worked step); **word-salad headings** ("7.1 Energy Conversion Transduction Chemical Reaction Chemical Sensing **Etc**"); **cross-module sentence bleed**; **lower-case formulae** (`k2so4`, `caco3`); **117× `(additional: £X)` + 117× `(part …)` BoM-dump fragments** in prose; 20× robotic "…N components" openers. NB the prose faithfully echoes the contract — the contract itself holds raw un-rounded solver output + **contradictory keys** (`absorber_column_diameter_m=0.3` AND `absorber_diameter_m=0.2346`).

**Generation root (file:line):** `src/lib/pdf-engine-v2/radical/sentence-generator.ts:429` `generateSubmoduleSentence` (templates; fires because `english_sentence=''` from `scripts/lib/orchestrator/emitters/co2-mineralisation.ts:83` + `scripts/lib/deterministic-emitter.ts:263`); concat at `sentence-generator.ts:~758/880`; render cascade `scripts/render-minimal-pdf.tsx:8714-8718` (`overview_paragraph_en || paragraph_en_llm || paragraph_en || module_brief` → mechanical concat wins).

**Fixes (ranked, universal):**
- **FIX 1 (the real cure):** wire `module-paragraph-llm.ts` (Piece 1F) back into `serial-design-chain-v2.tsx`, AFTER the emitter + modifier-mutating stages, BEFORE `buildNaturalLanguageLayer()`. Ground it in frozen `orchestratorContract.quantities`; instruct: use only those numbers, round ≤3 sig figs, mention each sub-module once, no `(additional)`/`(part)` fragments, no repetition. ⚠️ **CRITICAL:** the word-coverage check that triggers the deterministic pre-fill (which DISCARDED the LLM prose at log.txt:88) must be **relaxed or run AFTER narration**, or the narration is thrown away again — this is the silent defeater.
- **FIX 2 (cheap, do regardless):** deterministic `clean_prose()` passes in `render-minimal-pdf.tsx` (precedent `fix_quantity_prefix()`): round prose/worked-calc numbers ≤3 sig figs; strip `(additional:£X)`+`(part …)` from narrative; collapse doubled-ID headings + drop trailing "Etc"; format formulae (co2→CO₂, caco3→CaCO₃, k2so4→K₂SO₄); suppress `P=0` degenerate steps.
- **FIX 3:** de-dup module-overview vs sub-module-body when `paragraph_en` fallback === sub-module concat (render a real 2–3-sentence module summary instead).
- **FIX 4:** normalise `orchestratorContract.quantities` at emit time (dedupe contradictory keys; store display-rounded alongside full-precision).
- **Priority:** FIX 2 → FIX 1 → fold in 3 + 4.

**Validate cross-class (prove universal):** re-score CO₂ + BESS + wind + one unseen chemistry class (DAC/SMR). Metric: `design_modules ≥ 8` AND `grammar ≥ 8` on the **Claude+Qwen calibrated pair** (ignore lone Gemini-3.1-pro flake). Plus greps: `0× "(additional:"` in prose, 0 duplicate paragraphs, no ≥4-decimal numbers in prose, no "Etc" headings, no lower-case formulae. Add a regression-harness invariant (no `(additional:` in narrative; module ≠ verbatim sub-module concat).

**Evidence:** `out/_co2_v8_reason_capture.json` (verbatim per-model critiques).
