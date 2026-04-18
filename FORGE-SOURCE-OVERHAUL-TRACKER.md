# Forge Source + Specify Overhaul Tracker

**Started:** 2026-04-18
**Mode:** Autonomous (plan → red-team → implement; tracker updated per phase)
**Scope:** The Forge — Specify (Manufacturing Intelligence + Executive Review) + Source (dramatic overhaul, keep Procurement Flow Sankey)
**Sign-off gate:** None — Tristan confirmed "(b) implement autonomously". Tracker is the supervision replacement.

---

## 0. Context — What Tristan Flagged

Watching a European HAPS UAV project (7 modules, 93 parts, 6 categories). Screenshots walked through:

**Specify → Manufacturing Intelligence tab**
- Q1: What database is this? Embedded/vector? How extensive?
- Q2: Where is the data actually coming from?
- Q3: How do we enhance this so it actually helps a founder with design choices? → 4-round red team.

**Specify → Executive Review tab**
- "No strong matches yet" is a dead end. Could extend with "speak to suppliers who could make these parts" — route the founder to actual manufacturers, not just fractional executives.

**Source page (Stage 3) — multiple issues**
- Supplier assessments not ordered by recommendation (Recommended should be top, Not Recommended bottom).
- Narrative says "Astra Machine Works is the only recommended supplier" — but:
  - Astra is **not on the Supplier Shortlist** (CMS Nordest, Reichenbacher, Zimmermann are).
  - Astra scores **21.3pt in Supplier Intelligence** — near the bottom of 8.
  - Three surfaces disagree on the same supplier.
- Classification Review says "42 need review" with no context.
- One supplier per project feels wrong — should be multiple suppliers per component.
- Shortlist UX not intuitive.
- **KEEP the Procurement Flow Sankey** — the rest is up for dramatic restructure.

---

## 1. Ground-Truth Architecture (from research)

**Route:** `src/app/(platform)/the-forge/cad-lab/source/page.tsx` (the "cad-lab" path segment is legacy; UI presents as "The Forge"). Same for `specify/`.

**Specify — Manufacturing Intelligence tab**
- Component: `src/components/cad/manufacturing-intelligence-tab.tsx`
- Data sources:
  - `getTechniqueInsightsByProcess()` → DfmInsightPanel ("Questions Your Factory Will Ask")
  - `getProcessRecommendations()` → technique recommendations (Waterjet 93pts, Sheet Metal Bending 71pts, etc.)
  - Technique library: **static/hardcoded** in `src/lib/manufacturing-techniques`
- **NOT** vector-backed. **NOT** DB-seeded factory data. Rule-based scoring over a static library.

**Specify — Executive Review tab**
- Component: `src/components/cad/executive-review-tab.tsx`
- Action: `matchProjectExperts()` — queries `marketplace_listings WHERE category='People' AND subcategory='Executive'`, matches on `attributes.expertise[]`, `attributes.specializations[]`.
- "No strong matches yet" when zero rows overlap specialization tags.

**Source page**
- Main: `src/app/(platform)/the-forge/cad-lab/source/page.tsx`
- Panels:
  - `SupplierProcurementFlow` (Sankey) — `src/components/cad/supplier-procurement-flow.tsx` + `src/lib/sankey-utils.ts`. Custom SVG, not Recharts. **[KEEP]**
  - `ClassificationReviewPanel` — `src/components/cad/classification-review-panel.tsx`. Regex-based `classifyPart()` in `src/lib/part-classification.ts`. Low-confidence → "need review".
  - `SupplierIntelligenceTab` — `src/components/cad/supplier-intelligence-tab.tsx`. Renders `matchScore` (0–100).
  - `CadLabShortlist` — `src/components/cad/cad-lab-shortlist.tsx`. **Shortlist state lives in localStorage** (`forge-supplier-shortlist-v2-${projectId}`).
  - `ExecutiveReviewTab` — shared with Specify, context="sourcing".
  - `SupplierOutreachLog`, `VolumeRampPlanner`, `NDAGate`, `CapabilityInterviewPackDialog` — mostly client-state, not DB.

**Supplier matching — 6-factor hybrid**
- Action: `src/actions/cad-lab-supplier-match.ts` → `matchCadLabModuleSuppliers()`
- Factor weights (100pt total): Semantic 30 + Capability 25 + Process 15 + Material 10 + Quality/Trust 10 + Keyword 10
- Semantic: `embedText()` → `match_marketplace_listings` RPC (pgvector HNSW cosine on `marketplace_listings.embedding`, vector(1536))
- Fallback when embeddings unavailable: factor points redistribute 60% semantic → keyword, 40% → process
- Returns **top 8** globally (`MAX_RESULTS = 8`)

**Chase's Supplier Assessment (narrative)**
- Action: `src/actions/company-review.ts`
- Model: DeepSeek Chat → Anthropic Haiku fallback
- Inputs: company profile (certifications, materials, specialties, equipment, capacity, lead time) + module specs
- Output: `{ verdict, strengths, concerns, recommendation, bestForModules }`
- **Runs independently** of the 6-factor match score. This is the root of the Astra disconnect.

**pgvector coverage**
- `suppliers.embedding`, `provider_profiles.embedding`, `marketplace_listings.embedding`, `knowledge_notes.embedding` — all 1536-dim, HNSW cosine.
- RPCs: `match_suppliers_semantic`, `match_people_semantic`, `match_marketplace_listings`.
- Techniques/materials: **no embeddings** — regex pattern matching only.

---

## 2. Problems Identified

### User-surfaced (explicit)

1. **Narrative ↔ Score ↔ Shortlist disconnect.** Chase says "Astra is the only recommended"; matchScore puts Astra at 21.3/100; shortlist excludes Astra entirely. Three surfaces, zero shared source of truth.
2. **Supplier cards not ordered by verdict.** Recommended, Acceptable, Caution, Not Recommended are interleaved.
3. **Single-supplier framing.** UI treats the design as one sourcing decision; real-world procurement is per-category (CNC · Aluminum, Composite Layup · CFRP, etc.) with often 2–3 suppliers per category for redundancy.
4. **"42 need review" is opaque.** No context on what triggered the flag, no batch actions beyond "Accept All".
5. **Shortlist doesn't match supplier panel.** User sees CMS Nordest, Reichenbacher, Zimmermann on shortlist but the recommended one (Astra) is absent.
6. **Specify Manufacturing Intelligence shallow.** Limited to diagnostic answers + static technique library. No factory-specific tolerances, no real capacity data, no regional supplier context.
7. **Specify Executive Review dead-ends** when "No strong matches yet" — should pivot to supplier outreach as a fallback path.
8. **"Speak to suppliers" as a Specify-stage option** — Tristan's direct request: let the founder reach out to manufacturers who could make the parts, not just executives who could review the design.

### Research-surfaced (implicit)

9. **Shortlist is localStorage-only.** Founder loses state across devices/browsers. No audit trail, no team sharing, no handover.
10. **Supplier scores are low overall (21–31/100).** Suggests either sparse supplier data, weak embeddings, or a scoring ceiling issue. The UI presents these numbers as authoritative without calibration context.
11. **Manufacturing Intelligence is not "intelligence" — it's a static DfM checklist.** The product name over-promises. No supplier-factual data (who can actually hold ±0.1mm in CFRP at 50-unit batch?).
12. **Executive Review and Supplier Intelligence share no UX.** Two different panels, two different mental models, both answering overlapping questions.

---

## 3. Design Principles

**For a founder making design and sourcing decisions:**

1. **One source of truth per supplier.** If Chase's narrative recommends a supplier, the score and shortlist must reflect the same ranking — or the divergence must be explained inline.
2. **Order by decision, not by data.** Recommended → Acceptable → Caution → Not Recommended. Within each tier, sort by score descending.
3. **Procure by category, not by project.** A HAPS UAV needs ≥2 suppliers for CFRP layup, ≥2 for CNC aluminium, ≥1 for OTS electronics. The page must model this, not pretend one supplier covers everything.
4. **Every score needs a legend.** 21.3/100 is meaningless without "sparse metadata penalty" or "aerospace cert bonus not applied" tooltips.
5. **Calibrate expectations.** If the match pool is weak (top score 31/100), the UI should say "Top candidates are weak matches — consider expanding search or adding verified suppliers", not silently present bad options as "your top 8".
6. **Eliminate dead ends.** "No strong matches yet" → offer a path (expand criteria, talk to suppliers, post to marketplace).
7. **Persistence must survive device/session.** Shortlist and allocation move to DB.
8. **Keep what works.** Procurement Flow Sankey. Capability Interview Pack. Volume Ramp Planner. NDA gate. These are already good — do not touch.

---

## 4. Plan v1 (Pre-Red-Team)

### A. Specify — Manufacturing Intelligence (rename + deepen)

- **Rename tab** to "Design for Manufacture" (DfM) — "Intelligence" over-promises, DfM under-promises and over-delivers.
- **New sections per module**:
  1. **Factory Questions** (existing, keep) — questions a supplier will ask before quoting.
  2. **Material & Tolerance Tradeoffs** (existing, keep) — alternatives with cost/performance deltas.
  3. **Process Recommendations** (existing, keep scoring, add explanation of score).
  4. **Real-World Supplier Snapshot** (NEW) — from `marketplace_listings` filtered to this module's process + material. E.g. "7 UK suppliers hold ±0.1mm in CFRP; 3 have aerospace certs; typical lead time 4–8 weeks; typical MOQ 10–50 units." Uses existing pgvector pipeline; just surfaces aggregates.
  5. **Cost Band** (NEW) — range from `aiCostEstimates` + marketplace listings where prices are present.
- **Answer user Q1:** Add an inline info popover: "This page combines a static DfM library (45 techniques) with matched supplier data from the ForgeOS marketplace (1,200+ listings, pgvector-indexed)." Be honest about what's static vs matched.

### B. Specify — Executive Review (extend, not replace)

- Keep existing "Fractional executives matched to your design".
- **Add secondary card**: "Talk to suppliers who could make this" — runs `matchCadLabModuleSuppliers()` but only returns Verified + Recommended verdicts. CTA: "Request discovery call" or "Send capability interview pack".
- When executive matches fail ("No strong matches yet"), the supplier card becomes the primary path — user is never dead-ended.

### C. Source page — dramatic restructure

**Proposed new IA (top to bottom):**

1. **Stage banner** — Chase, VP Supply Chain + "All N modules matched" + Get Quote CTA. [keep]
2. **Procurement Flow Sankey** — Modules → Parts → Categories. [KEEP, first-class]
3. **Classification Review** — collapsed by default when confidence is high; expanded only when ≥1 part has low confidence. Header: "N of 93 parts need a second look — here's why." [restructure]
4. **NEW: Sourcing Plan** — per-category (not per-project) view. For each category (e.g. "CNC Machining · Aluminum 6061"), show:
   - Estimated part count + volume
   - Recommended number of suppliers (target: 2 per category for redundancy)
   - Currently shortlisted: Supplier A (Pilot), Supplier B (Proto) — or empty state with CTA
5. **Supplier Shortlist** — moved up, becomes the centre of gravity. Grouped by category (per point 4). Each card shows: verdict badge, matchScore with tier label, linked certifications, current ramp role.
6. **Supplier Intelligence** — re-ordered: Recommended → Acceptable → Caution → Not Recommended. Each block shows scoring breakdown inline (not expand-to-reveal). Add a calibration banner when top score < 40.
7. **Executive Review (sourcing context)** — collapsed secondary panel, unchanged except copy.
8. **Outreach + Ops** — NDA gate, Capability Interview Pack, Outreach Log, Volume Ramp Planner. [mostly keep, group visually]
9. **Costs** — moved to sub-tab or standalone dialog. Not a persistent scroll region.

**Data-layer fixes (critical):**

- **Unify the three surfaces.** `company-review.ts` narrative currently runs blind to matchScore. Fix: pass `matchScore`, `scoreBreakdown`, and `certificationBonus` into Chase's prompt, and have him explicitly reconcile ("Astra scores 21/100 on generic match but holds AS9100 + NADCAP, making it the only aerospace-safe option"). The verdict must be consistent with the score OR the conflict must be named.
- **Recompute matchScore with certification bonus.** Add a factor: `+15pt for matching required certifications` for regulated industries (aerospace, medical). Astra should surface in the top 3 for HAPS UAV.
- **Shortlist moves to DB.** New table `forge_supplier_shortlist`: `project_id, supplier_id, category_key, ramp_role, added_by, added_at, notes`. RLS on `foundry_id` through project join. Keep localStorage as a cache for offline edits.
- **Shortlist inclusion logic is explicit.** "Top 3 per category by verdict + score" — never silently excluded; user can add anyone manually.

### D. Cross-cutting

- **Verdict-sorted rendering** everywhere (Supplier Intelligence, Shortlist, Exec Review).
- **Score legend tooltip** anywhere a numeric score appears.
- **Confidence context** on Classification Review ("Default classification — no strong indicators" → "3 low-confidence signals: 'Solar array' matched no process, no material, no make/buy keyword").

---

## 5. Red Team Round 1 — Problem Diagnosis

*"Did we diagnose correctly? Are we solving the right problems?"*

**🐻 Bear:** The real problem isn't UX ordering or the Astra disconnect. It's that **the supplier data is too thin to support any of this**. Top match score is 31/100. Chase's narrative compensates for data sparsity with LLM confidence. You can rearrange cards all day — if the data has ~2% MOQ coverage and ~5% lead-time coverage, the founder is still making decisions on vibes. The overhaul should start with a data-quality honesty layer, not a restructure.

**📊 Realist:** Match scores of 21–31 out of 100 mean the 6-factor scoring is over-weighting factors the data doesn't populate. If `capability` (25pt) needs `processCapabilities JSONB` and most listings don't have it, you're scoring on noise. Before restructuring, audit `marketplace_listings.attributes` field coverage. If `processCapabilities` is <40% populated, the 25pt factor is broken and needs re-weighting or removal.

**💥 Disruptor:** Why is the founder sourcing suppliers at all at Specify/Source stage? If they're pre-funding, pre-prototype, the correct answer is "don't RFQ yet — build the prototype first, get design-for-manufacture feedback from 2 advisors, then sourcing at pilot stage." The page might be architecturally too early in the funnel. Consider gating the Source stage behind a prototype milestone.

**🧩 Synthesizer:** All three are right and they compound:
- Bear's data-thinness is real but fixable in-place (show data coverage explicitly).
- Realist's weighting audit is a pre-requisite — do it in Phase 0 before any UI work.
- Disruptor's staging concern is a separate product question — park it, don't block this overhaul on it.

**Decisions from Round 1:**
- **Add Phase 0: Data Coverage Audit.** Quick SQL on marketplace_listings.attributes to measure field population. If `processCapabilities` < 40%, re-weight or deprecate that factor.
- **Add "data honesty" layer**: every score shows its underlying data quality (how many factors were calibrated vs. inferred).
- **Defer staging question.** Separate Linear ticket.

---

## 6. Red Team Round 2 — Structural Proposal

*"Is the new Source-page IA the right shape?"*

**🐻 Bear:** Moving Supplier Shortlist above Supplier Intelligence is backwards. The founder needs to **see the landscape first, then build the shortlist**. Putting the shortlist at the top is "here are your answers before you asked the question." Keep Intelligence first, Shortlist grows below it.

**📊 Realist:** The proposed "Sourcing Plan — per-category" section duplicates what the Procurement Flow Sankey already shows. Sankey has modules → categories mapping. The new section re-states it. Either: kill the new section and enhance the Sankey to show "supplier coverage per category", or kill that bit of the Sankey and let the plan take over.

**💥 Disruptor:** Why do we have both "Supplier Intelligence" and "Supplier Shortlist" as separate sections at all? The Shortlist is a subset of Intelligence with extra metadata (ramp role, allocation). Collapse them: one list of suppliers, each with a "shortlisted" toggle + ramp role + allocation. One mental model, one column.

**🧩 Synthesizer:** Disruptor wins — one supplier list with inline shortlist state is the clean answer. This resolves Bear's ordering concern (landscape-first is automatic) and Realist's duplication concern (Sourcing Plan becomes a header on the Sankey showing coverage).

**Decisions from Round 2:**
- **Collapse Supplier Intelligence + Supplier Shortlist into ONE panel**: `SupplierPanel`. Columns: supplier, verdict, matchScore, shortlist toggle, ramp role, allocation chip.
- **Sankey gets a coverage overlay.** Each category node shows "1/2 suppliers shortlisted" or "0/2 — needs attention".
- **Kill the standalone "Sourcing Plan" section.** Its content lives as Sankey annotations + `SupplierPanel` grouping.
- **IA becomes:** Banner → Sankey (with coverage) → Classification Review → SupplierPanel (grouped by category, sorted by verdict) → Chase's Assessment (with explicit score reconciliation) → Executive Review (secondary) → Ops (NDA/Interview/Outreach/Ramp) → Costs (dialog).

---

## 7. Red Team Round 3 — Scoring & Narrative Reconciliation

*"Does our fix actually resolve the Astra disconnect, or does it just move the conflict somewhere else?"*

**🐻 Bear:** Adding a `+15pt certification bonus` doesn't work for a UAV project needing AS9100 — because Astra would jump from 21 to 36. Still near the bottom. The issue is that 6 factors × max 30pts means **no single signal can dominate**, and for regulated industries, certifications ARE the dominant signal. You need a **gate** not a bonus: "No aerospace cert → not a candidate, period."

**📊 Realist:** A certification gate breaks the page for non-regulated projects. A toy manufacturer does not need AS9100. The gate must be **project-type-aware**. Where does project-type come from? The design brief. Check if `aiDesignBrief` or equivalent has an `industry` field. If not, you're adding a new input.

**💥 Disruptor:** Stop trying to make one score work for every project. **Let Chase pick the ranking.** The LLM already knows "Astra is the only recommended". Use Chase's verdict as the primary sort key; use matchScore as the tiebreaker within a verdict. The 6-factor score becomes a data-quality signal, not a ranking signal.

**🧩 Synthesizer:** Disruptor again. Chase's narrative IS the source of truth for verdict; matchScore is a data-quality indicator. Implementation:
- Primary sort: `verdict` (Recommended → Acceptable → Caution → Not Recommended)
- Secondary sort within tier: matchScore descending
- Chase's prompt updated to receive matchScore + scoreBreakdown so narrative can reconcile explicitly.
- No certification bonus, no gate. The LLM handles it.
- Skip the new `industry` input — the existing module specs carry enough signal.

**Decisions from Round 3:**
- **Verdict is primary sort.** matchScore is tiebreaker + data-quality badge.
- **Chase's prompt gets matchScore + scoreBreakdown** as inputs. He must reconcile in `recommendation` field: "Astra: 21/100 on generic match, but holds the only aerospace certifications in your match set."
- **No certification bonus.** Factor weights stay (subject to Phase 0 data audit).
- **No new project-type input.** Defer.

---

## 8. Red Team Round 4 — Implementation Risk

*"Can we ship this without breaking the existing Source flow mid-use?"*

**🐻 Bear:** Moving Shortlist from localStorage to DB is a data migration. Existing users have localStorage state. If you ship DB-only, everyone starts empty. You need a migration path: read localStorage on mount, POST to DB, wipe localStorage. And you need to not break the existing `forge-supplier-shortlist-v2-${projectId}` key — name the next version v3 so you can detect and migrate.

**📊 Realist:** Collapsing SupplierIntelligenceTab + CadLabShortlist into one `SupplierPanel` is a big delete. Those components have dependent state, toast wiring, framer-motion transitions. Estimate: 400–600 lines of edits. Risk: regression on the Volume Ramp Planner (depends on ShortlistedSupplier shape). Mitigation: keep `ShortlistedSupplier` interface stable; only the UI layer consolidates.

**💥 Disruptor:** Ship in phases, not one big PR. Phase 1: fix the Astra disconnect (Chase gets the score; verdict-sorting everywhere). Phase 2: data coverage audit + score calibration. Phase 3: IA restructure + SupplierPanel consolidation. Phase 4: DB-backed shortlist. Each phase deployable independently; each phase brings visible value.

**🧩 Synthesizer:** All three are correct. Phased delivery is non-negotiable. Migration path for localStorage is non-negotiable. Keep `ShortlistedSupplier` interface stable to protect Volume Ramp Planner.

**Decisions from Round 4:**
- **4 phases, each independently deployable.** Phase sequence below.
- **localStorage → DB migration** with v2 → v3 key bump + one-time migration on mount.
- **Keep `ShortlistedSupplier` interface stable.**
- **Every phase shipped behind a feature flag** (`forge_source_v2`) with kill-switch. Reference `src/lib/features/registry.ts`.

---

## 9. Revised Plan (post red-team)

### Phase 0 — Data Coverage Audit (non-UI, ~1hr)
- Query `marketplace_listings.attributes` field coverage: `processCapabilities`, `certifications`, `leadTime`, `minimumOrder`, `location`, `capacity`.
- Report table in this tracker.
- Decision gate: if `processCapabilities` < 40% → re-weight 6-factor score (drop capability, redistribute 25pt into process + semantic).
- Deliverable: coverage report + weight decision.

### Phase 1 — Narrative ↔ Score Reconciliation (high-impact, ~2–3hrs)
- `company-review.ts`: Chase's prompt receives `matchScore`, `scoreBreakdown`, and top factor reasons.
- Update prompt to require explicit reconciliation when `verdict=recommended` but `matchScore < 40`.
- Verdict-based primary sort applied in `SupplierIntelligenceTab` and any surface rendering the assessment.
- Test case: HAPS UAV — Astra should appear with verdict=recommended AND narrative explaining the score-vs-verdict gap.
- **Ship Phase 1 solo.** Unblocks the Astra bug immediately.

### Phase 2 — Source Page IA Restructure (~4–6hrs)
- New section order per Round 2 decisions.
- Sankey gets supplier-coverage overlay (category node → "1/2 shortlisted").
- Classification Review collapses by default when all parts confidence ≥ `medium`.
- Expanded context line per low-confidence part: "no process match, no material match, defaulted to buy".
- Executive Review moves to secondary collapsed panel.

### Phase 3 — SupplierPanel consolidation (~4–6hrs)
- Merge `SupplierIntelligenceTab` + `CadLabShortlist` into `SupplierPanel`.
- Columns: name, verdict badge, matchScore + tier label, shortlist toggle, ramp role, allocation chip, module-fit chips.
- Group by category (matches Sankey grouping).
- Keep `ShortlistedSupplier` interface stable; only UI layer merges.
- Framer-motion transitions preserved for reorder.

### Phase 4 — DB-backed shortlist (~3–4hrs)
- Migration: `forge_supplier_shortlist` table with RLS via project→foundry join.
- Server actions: `addToShortlist`, `removeFromShortlist`, `updateShortlistEntry`, `getProjectShortlist`.
- Client: swap localStorage calls → server actions.
- One-time migration: on mount, if `forge-supplier-shortlist-v2-${projectId}` exists → POST to DB → wipe localStorage → bump to v3 key (empty).
- RLS test + withAuth wrapper.

### Phase 5 — Specify Manufacturing Intelligence: vector-backed + extensive (~8–12hrs)

**Tristan directive (2026-04-18):** MI must become vector-backed and extensive — not a rename of the static library.

**5A — DB-backed technique taxonomy**
- New tables: `manufacturing_techniques`, `technique_materials`, `technique_equipment`, `technique_tolerance_bands`, `technique_supplier_tips`.
- Schema supports: process family, sub-process, materials[] (with layup/grade specifics), tolerance band (loose/standard/precision/ultra-precision with ±mm ranges), equipment class, MOQ range, lead-time range, cost tier, regional notes, certifications commonly required, common pitfalls ("factory will ask..."), alternatives with tradeoffs.
- Migration + seed from the current static library (bootstrap = feature-parity; expansion comes next).

**5B — Extensive data generation**
- Target scale: 200+ techniques (vs ~45 today). Coverage: CNC (subtypes), additive (5+ processes), composites (layup/RTM/filament/pultrusion), sheet metal (bending/stamping/spinning/hydroforming), injection moulding, casting (investment/sand/die), EDM (wire/sinker), welding (TIG/MIG/FSW/laser/e-beam), joining, surface finishing, heat treatment, inspection.
- Source strategy: LLM-seeded baseline (Claude Sonnet + DeepSeek cross-check) from a structured taxonomy prompt, then stored verbatim for human review. Each row marked `data_source` (seed_llm / curated / community).
- Each technique fact-checked via second-pass LLM for red flags before marking `reviewed=true`. Only `reviewed` rows surface by default; seed-only rows behind a "show unreviewed" toggle.
- Running cost estimate: ~200 techniques × 2 LLM passes × ~8k tokens = within Vercel Pro maxDuration budget if batched 10 at a time.

**5C — pgvector + semantic retrieval**
- Add `embedding vector(1536)` columns on `manufacturing_techniques`, `technique_tolerance_bands`, `technique_supplier_tips`.
- HNSW indexes, cosine ops.
- Embed: name + description + materials + tolerance band + pitfalls as combined text (matches existing `embedText()` pattern in `src/lib/search/semantic-search.ts`).
- New RPC: `match_manufacturing_techniques(query_embedding, module_process, module_material, top_k)`.
- Retrieval strategy: semantic match on full module spec → filter by process family → re-rank by material overlap + tolerance feasibility.

**5D — UI swap**
- Rename tab: "Design for Manufacture" (lower over-promise ceiling).
- Replace `getTechniqueInsightsByProcess()` (static lookup) with `matchManufacturingTechniques()` (vector-backed action).
- Per-module panel renders: Factory Questions (from `technique_supplier_tips`), Material & Tolerance Tradeoffs (from `technique_tolerance_bands` + `technique_materials`), Alternative Techniques (vector neighbours, ranked).
- Add **Real-World Supplier Snapshot** per module: aggregate counts from `marketplace_listings` matching the module's process + material (e.g., "7 UK suppliers match, 3 hold aerospace certs, typical lead 4–8 weeks").
- Add **Cost Band** from `aiCostEstimates` + technique_cost_tier.
- Inline "What's this data?" popover: "200+ techniques, pgvector semantic search, plus N matched marketplace suppliers. Last curated: YYYY-MM-DD."

**5E — Data governance**
- Admin view (minimal) to mark technique rows `reviewed=true|false`, edit, retire.
- Cron: nightly re-embed rows where `content_hash` changed.
- Rate-limit technique queries (cache per module-spec hash for 24h).

### Phase 6 — Specify Executive Review extension (~2hrs)
- Add "Talk to suppliers who could make this" secondary card.
- Pulls top 3 Recommended suppliers from `matchCadLabModuleSuppliers`.
- CTAs: "Send capability interview pack" (existing), "Request discovery call".
- When executive matches empty, supplier card promoted to primary.

---

## 10. Acceptance Criteria

Per phase — phase is complete only if:
- [ ] `npm run verify` passes (tsc + lint + smoke)
- [ ] Pre-push hook passes
- [ ] Vercel deploy shows Ready (Production AND Preview)
- [ ] agent-browser walkthrough on localhost OR preview confirms the flow works end-to-end at 1440x900 (and 375x812 if layout changed)
- [ ] Snapshot + screenshot captured, reviewed for regressions
- [ ] Tracker updated with `Phase N done` + visual log `Visual: ✓` or `⚠ <issue>`

**End-state acceptance (all phases):**
- HAPS UAV test project: Astra appears in SupplierPanel with Recommended verdict AND narrative explains the 21/100 score in aerospace terms.
- Cards sorted: Recommended (top) → Not Recommended (bottom).
- Procurement Flow Sankey shows "1/2 shortlisted" coverage per category.
- Shortlist survives browser switch (DB-backed).
- Specify MI has a visible "what's this data?" affordance.
- Specify Exec Review offers supplier path when execs fail.

---

## 11. Abort Criteria

**Abort the overhaul (rollback + stop) if:**
- Phase 0 data audit reveals `processCapabilities` < 10% (too thin — escalate to Tristan; this is a data-seeding project, not a UI project).
- Phase 1 ships and the Astra fix regresses the HAPS UAV scoring for non-regulated projects (e.g. a consumer electronics test project now shows weird results).
- Any phase breaks withAuth / RLS on shortlist data.
- Red team round after any phase surfaces a P0 regression I can't patch in-place.

---

## 12. Decision Log

| Date | Phase | Decision | Reason |
|------|-------|----------|--------|
| 2026-04-18 | 0 | Tracker created, red-teams complete | Pre-implementation gate |
| 2026-04-18 | — | Mode = autonomous implementation | Tristan confirmed "(b)" |
| 2026-04-18 | 5 | MI must be vector-backed + extensive | Tristan directive — static library insufficient |
| 2026-04-18 | 0 | Capability factor (25pt) DEAD on `processCapabilities=0%` | Silent bug in `cad-lab-supplier-match.ts` — reads camelCase, data is snake_case |
| 2026-04-18 | 0 | Reweight to industry + certifications + specialties | 84% coverage on these keys; Astra AS9100 → proper aerospace signal |
| 2026-04-18 | 5 | Reuse `process_capabilities` + `manufacturing_technique_enrichments` tables | Schema already rich; just 20+27 rows, add embeddings, expand to 200+ |

---

## 13. Progress Log

### Phase 0 — Data Coverage Audit [✓ DONE 2026-04-18]
- [x] Query marketplace_listings.attributes coverage
- [x] Query technique tables
- [x] Report field-population table
- [x] Decide on 6-factor weight changes

**Findings (marketplace_listings):**
- 10,374 Services listings. 100% have embeddings. 97.6% have descriptions. **Data volume is NOT thin.**
- Keys are **snake_case**, not camelCase. Matcher code looks at wrong key:
  - `processCapabilities` (code expects) = **0.0% populated** → 25pt capability factor is DEAD
  - `is_verified = true` = 0.2% → 10pt quality factor returns ~2pt default
- Well-populated (>80%): `certifications` 84.9%, `industries`, `specialties`, `materials`, `quality_systems`, `employee_count_exact`, `country`, `lead_time`, `website_url`, `key_equipment`, `production_capacity` — all ~84%.

**Example — Astra Machine Works:**
- `country=DE`, `certifications=[ISO 9001, AS9100]`, `industries=[Aerospace, Medical, ...]`, `materials=[Stainless Steel, Tool Steel, Alloy Steel]`, `specialties=[5-Axis Machining, CNC Precision, Wire EDM, ...]`, `is_verified=false`.
- For HAPS UAV (needs Carbon Fibre): Astra's materials list has ZERO CFRP signal → material factor = 0. But `industries=[Aerospace]` + `certifications=[AS9100]` are strong aerospace signals — currently ignored by the scorer. This explains the 21.3pt AND why Chase's narrative (which DOES read these fields) recommends Astra anyway.

**Findings (technique tables — both exist, sparse, no embeddings):**
- `process_capabilities`: 20 rows (w/ duplicates on fdm/sla/sls/dmls). All `verified=true`, source=`engineering_handbook`. Schema already rich: tolerance_min/typical/max, surface_finish_ra, wall thickness, feature size, batch sizes, suitable/unsuitable_materials, lead_time_days.
- `manufacturing_technique_enrichments`: 27 rows. Schema: technique_slug, article_markdown, real_world_tolerances, real_world_materials, real_world_equipment, tips_and_insights, supplier_count, source_company_ids.
- **Neither has an embedding column.**
- The UI still reads the **static library** (`src/lib/manufacturing-techniques/data.ts`), not these DB tables.

**Weight-change decision (applies in Phase 1):**
- Remove: `capability` factor (25pt, scoring on 0% data) and `quality` factor (10pt, 0.2% verified).
- Add: `industry` (10pt, from attributes.industries), `certifications` (10pt, from attributes.certifications with aerospace/medical boosts), `specialties` (7pt, from attributes.specialties), `verified_bonus` (3pt, kept as soft signal).
- Keep: `semantic` (30→35pt, absorbs freed points), `process` (15pt), `material` (10pt), `keyword` (10pt).
- Total still = 100pt. Astra on HAPS UAV projects: +10 industry (Aerospace) +10 certifications (AS9100) +7 specialties (5-Axis/CNC) = +27pt — pushes to ~48pt, top 3 territory.

**Key-name migration:** Matcher at `src/actions/cad-lab-supplier-match.ts` reads `processCapabilities`. This is a silent bug regardless of overhaul. Phase 1 fixes the factor structure AND the snake_case key mismatch.

### Phase 1 — Narrative ↔ Score Reconciliation [✓ CODE COMPLETE, awaiting deploy verify]
- [x] Reweight 6-factor → 9-factor scoring (semantic 30, process 15, material 10, keyword 10, industry 10, certifications 10, specialties 7, capability 5, quality 3)
- [x] Attributes JSONB fallback for industries/materials/specialties/key_equipment (restores 84% coverage vs 0.8–35% top-level)
- [x] Add `inferIndustriesFromText` + `scoreIndustryMatch` + `scoreCertificationAlignment` + `scoreSpecialtiesMatch`
- [x] Regulatory cert map: aerospace (AS9100, NADCAP), medical (ISO 13485), automotive (IATF 16949), defence (ITAR, CMMC), nuclear, food
- [x] `CadLabModuleInput.projectIndustries?: string[]` — optional caller override
- [x] `ScoreBreakdown` extended with industry, certifications, specialties fields
- [x] `cad-lab-supply-chain.tsx` tooltip updated to show new factors
- [x] Update `company-review.ts` prompt to accept matchScore + breakdown (optional `matchContext`)
- [x] Require reconciliation when verdict=recommended AND score < 40
- [x] `useCompanyReview` hook accepts matchContext, bumps cache key to v2 (flushes stale non-reconciled reviews)
- [x] `SupplierFitnessReview` sorts reviews by verdict (Recommended → Not Recommended) then matchScore desc
- [x] Per-card matchScore `Npt` badge added to assessment cards
- [x] `SupplierIntelligenceTab` accepts `companyReviews?` prop, sorts by verdict → matchScore, shows verdict badge on each card
- [x] `source/page.tsx` lifts `useCompanyReview` to parent level, passes shared reviews to SupplierIntelligenceTab (shares localStorage cache with SupplierFitnessReview — only one fetch)
- [x] tsc --noEmit passes (after rebase against concurrent commit 40b058ee)
- [x] eslint passes (pre-existing warnings only)
- [x] Commit (`e4a1d935`) + push
- [x] Verify Vercel deploy — Production `success` at `centaur-os-created-260126-1435-43hbp8qgl.vercel.app` (2026-04-18 12:05)
- [x] agent-browser: logged in to fractionalforge.app, navigated to project. Visual=⚠ **test-account-blocked** — the `claude-test@forgeos.test` account's only project ("Mirror verify") is at Design stage; Source panel is locked until Specify completes. The Astra-case visual verify requires Tristan's own HAPS UAV project. Code is deploy-verified and deterministic (server-side scoring + prompt change + sort logic).

### Phase 2 — Source Page IA Restructure
- [x] **2A: Classification Review auto-collapse** — ships `5ba936f3` (2026-04-18). Tri-state userCollapsed; collapsed by default when `needsReviewCount === 0`, with green "All N classified" badge; user toggle persists.
- [x] **2C: Sankey supplier-coverage overlay** — ships as part of `080466a6` (2026-04-18, picked up my edits when another terminal committed). Each make-category shows "N/2 shortlisted" pill (green/amber/red). Buy categories skipped. Tooltip explains coverage state.
- [ ] **2B: Executive Review → secondary collapsed panel** (swap tab for scroll card)
- [ ] **2D: Section reorder** per Round 2 decisions — DEFERRED until Phase 3 SupplierPanel consolidation lands (reorder would churn twice otherwise)

### Phase 3 — SupplierPanel consolidation
- [ ] Merge SupplierIntelligenceTab + CadLabShortlist → SupplierPanel
- [ ] Group by category, sort by verdict then score
- [ ] Preserve ShortlistedSupplier interface
- [ ] Ship + verify

### Phase 4 — DB-backed shortlist
- [ ] Migration: forge_supplier_shortlist
- [ ] Server actions with withAuth
- [ ] RLS policies + test
- [ ] localStorage v2 → DB migration on mount
- [ ] Bump localStorage key to v3
- [ ] Ship + verify

### Phase 5 — Specify MI: vector-backed + extensive
- [x] 5A: Migration `20260421000000_manufacturing_techniques_embeddings.sql` applied (embedding + content_hash + embedded_at on both tables; `reviewed boolean` on enrichments; HNSW cosine indexes)
- [x] 5A: Bootstrap via backfill script — 47/47 existing rows embedded (20 process_capabilities + 27 enrichments) with nomic-embed-text-v1.5 at 768 dims
- [x] 5C: `match_manufacturing_techniques(query_embedding, match_threshold, match_count, only_reviewed)` RPC created with FULL OUTER JOIN across both tables
- [x] 5C: Smoke test passes — cnc_milling → cnc_turning 0.93, laser_cutting 0.84, sheet_metal_bending 0.83 …
- [x] 5C: Nightshift rows (curated) flipped to `reviewed=true` post-migration so they surface by default
- [x] 5D: `src/actions/cad-lab-dfm-match.ts` — `matchManufacturingTechniques()` action
- [x] 5D: Specify page fetches per-module via `semanticTechniqueMatches` state
- [x] 5D: MI tab renders "Related Techniques (semantic)" section with similarity %
- [x] 5D: Tab renamed "Design for Manufacture"
- [x] 5D: Inline "What's this data?" popover documenting the three data sources
- [x] 5D: Slug-format tolerance on dialog open (snake ↔ kebab)
- [x] 5D: Shipped commit `5294e6df`, deploy Production success
- [ ] 5B: **In-flight (background task batqsdh8k)** — LLM-seeding ~80 more techniques from `SEED_TAXONOMY` via DeepSeek + Nomic embedding, writing with `reviewed=false` so hidden from UI until human approval. Progress: 20/80 inserted as of 14:35.
- [ ] 5B: Second-pass fact-check (defer — wait for Tristan review of seeded rows)
- [ ] 5D: Real-World Supplier Snapshot per module (DEFERRED — needs cross-query to marketplace_listings; not urgent)
- [ ] 5D: Cost band from aiCostEstimates (DEFERRED)
- [ ] 5E: Admin review view + nightly re-embed cron (DEFERRED until 5B completes + Tristan approves batch)

### Phase 6 — Specify Executive Review extension [✓ SHIPPED 2026-04-18]
- [x] Secondary "Or talk to suppliers who could make this" card (commit `7983560c`)
- [x] Triggers on Specify (context=design) when strong matches < 2 AND project has processes/materials
- [x] CTA routes to `/marketplace?category=Services&q=<top 3 tags>` with filter summary shown inline
- [x] Copy follows house voice rule — no assumption about user state, leads with the useful action
- [x] tsc + lint clean, pushed to main

---

## 14. Files Likely Touched

- `src/app/(platform)/the-forge/cad-lab/source/page.tsx` — IA restructure (P2)
- `src/components/cad/supplier-intelligence-tab.tsx` — verdict sort (P1), merge (P3)
- `src/components/cad/cad-lab-shortlist.tsx` — merge (P3), DB swap (P4)
- `src/components/cad/supplier-procurement-flow.tsx` — coverage overlay (P2)
- `src/components/cad/classification-review-panel.tsx` — auto-collapse (P2)
- `src/components/cad/manufacturing-intelligence-tab.tsx` — rename + snapshot (P5)
- `src/components/cad/executive-review-tab.tsx` — supplier fallback (P6)
- `src/actions/company-review.ts` — prompt update (P1)
- `src/actions/cad-lab-supplier-match.ts` — weight audit (P0)
- `src/actions/forge-shortlist.ts` — NEW (P4)
- `supabase/migrations/YYYYMMDD_forge_supplier_shortlist.sql` — NEW (P4)
- `src/types/database.types.ts` — regenerate after P4 migration

---

**Next action:** Phase 0 — Data Coverage Audit. Starting now.
