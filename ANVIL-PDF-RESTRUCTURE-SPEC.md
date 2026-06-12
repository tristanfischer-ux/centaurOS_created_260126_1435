# Anvil dossier restructure — Part 1 (Engineering) + Part 2 (Build)

*Build spec, grounded in the real 123-page CO2 dossier (`out/co2-caspar-fix3/chain-v2.pdf`). Replaces the thin Part-2 mockup — Part 2's depth already exists; the work is reorganising + reframing, not rebuilding.*

---

## STATUS (2026-06-08) — read before acting on this spec

The target structure is now **largely shipped**, but **NOT** the way §2 item 4 describes. Read this first:

- ✅ **Part 1/2/3 framing DONE** — `PartDividerPage` + a part-grouped Table of Contents (commit `8be0d7512`). The three parts were already contiguous blocks; the dividers just frame them. Part 1 = engineering; Part 2 = build (modules); Part 3 = reference & procurement (consolidated masters).
- ✅ **Part 1 consolidation** — `EngineeringBasisPage` (commit `3ad6ffb92`): process flow + mass/energy balance + verdict, at the front.
- ✅ **Increments 3 & 4 mostly pre-existing** — per-sub-module supplier/specialist briefs (`1e862071d`), Master BoM (`afd93fe42`), consolidated Engagement Plan w/ questions (`EngagementPlanPage`, §13).
- ❌ **"Increment 2" (pull worked-calcs OUT of §6) is DEAD — do NOT execute it.** Tristan's **2026-06-04** decision: the per-sub-module worked-calcs + BoM tables **STAY** inside the module sections as in-context grounding; consolidated masters are **ADDITIVE, never replacements**. Moving them would undo `build #22` + the 2026-06-05 de-dup. The Part-1 consolidation is the additive front summary, not a move.
- ⚠️ **OPEN** — Tristan's model wants Part 2's modules to carry **supplier advice + expert questions in-context**. They currently render as a tight *pointer* ("Validate with: [roles] — full questions in §13") because the **2026-06-05 hybrid refactor** moved the full cards to §13 to protect the multimodal scorer's per-module page scores. Expanding the inline detail = reversing that scorer decision; needs Tristan's call (scorer cost vs his in-context preference).

---

## 0. The architecture

1. **Website** — the interactive feasibility session (the copilot). Prototype: `FEASIBILITY-COPILOT-MOCKUP.html`. This is where the engineer iterates the physics with option-picks + free text, fast and deterministic.
2. **PDF** — generated when the engineer is happy. Split into **Part 1 (engineering)** and **Part 2 (build)**, plus a **consolidated back matter**.

The Part-1 *content* is the same engineering the website copilot works on; the PDF is the static, complete record of it.

---

## 1. Where the 123 pages go today

| § | Section | Pages | ~count | Goes to |
|---|---|---|---|---|
| 1 | Brief & requirements | 4–5 | 2 | Part 1 |
| 2 | Brief provenance | 6–9 | 4 | Back matter (reference) |
| 3 | Brief compliance & trade-offs | 10–11 | 2 | Part 1 |
| 4 | How the whole plant works | 12–16 | 5 | Part 1 |
| 5 | Cost summary | 17–18 | 2 | Part 1 (economics) |
| **6** | **Modules & sub-modules** | **19–77** | **59** | **SPLIT — calcs → Part 1; equipment/BoM/sourcing/advisors → Part 2** |
| 7 | Risk & integration | 78–81 | 4 | Part 2 (end) |
| 8 | Bill of materials | 82–87 | 6 | Back matter (consolidated master) |
| 9 | Cost methodology | 88–89 | 2 | Back matter |
| 10 | Sourcing & procurement (+ specialists) | 90–112 | 23 | SPLIT — inline per sub-module in Part 2; consolidated master in back matter |
| A/B | Sources, tools used | 113–123 | 11 | Back matter (reference) |

**The core problem:** §6 (59 pages) interleaves the *engineering calculations* with the *equipment, parts and sourcing*, one module at a time. The physics is scattered — exactly Caspar's "the information is very spread out." The restructure pulls the engineering out and forward.

---

## 2. Target structure

### PART 1 — ENGINEERING ("does it work")
Everything needed to judge feasibility, consolidated up front:

1. **Brief & target** — what we're making, the hard numbers (from §1).
2. **Process flow diagram** — one consolidated block-flow of the whole plant. **NEW: the engine does not produce a single flow diagram today** — needs a BFD assembler from the module topology + a renderer. (Prototype shape: the diagram in `FEASIBILITY-COPILOT-MOCKUP.html`.)
3. **Mass & energy balance** — one consolidated stream table (flow / T / P / phase / composition) + a duty balance. **NEW: currently scattered across §6** — needs a consolidated stream+duty assembler.
4. **Engineering calculations — by unit operation** — all the worked maths. **CONSOLIDATE: pull the worked-calcs currently rendered per-module in §6 and in the §B tools appendix into one ordered section.**
5. **Feasibility verdict** — feasible / with-caveats / not, the decisive variable, and the honest low-confidence 20% routed to an expert. **NEW framing.**
6. **Economics** — levelised cost, net carbon, payback (from §5 + §9 headline).

→ ~15–25 pages once consolidated (the engineering extracted from §6's 59).

### PART 2 — HOW TO BUILD IT
A **sub-module-by-sub-module walkthrough**. Each sub-module is a self-contained block carrying **four things together**:

- **(a) what it is** — the design intent (from §6 narrative)
- **(b) its bill of materials** — the parts (from §6 per-sub-module BoM); commodity named, bespoke flagged `sourced via FF`
- **(c) its suppliers** — commodity = named/order-direct; bespoke = type + spec, sourced via FF (from §10 / per-module sourcing)
- **(d) the advisors/specialists** — the type of expert + the questions they answer for *this* sub-module (from the engagement-plan content)

**No worked calculations in Part 2** — they moved to Part 1. Part 2 is build, not physics.

Then: **Risk & integration** (from §7).

### BACK MATTER — consolidated masters + reference
The "act on it" views + references. (Answers the repeat question: **yes**, the same way the BoM is consolidated at the end.)

- **Consolidated full bill of materials** — the order-from master (from §8).
- **Consolidated sourcing & procurement list** — the supplier/fabricator master + RFQ pack (consolidated from the per-sub-module suppliers).
- **Consolidated advisor / specialist roster** — who to bring in, deduplicated. **NEW consolidation** (parallel to the BoM/supplier masters).
- **Cost methodology** (from §9).
- **Sources & references** (App A); **Tools used** (App B); **Brief provenance** (§2).

---

## 3. The principle that keeps it from bloating — "explain inline, act at the end"

The repeats are deliberate and serve **different jobs**:
- **Inline** (per sub-module, Part 2) = the **explanation** — brief + contextual: "this sub-module needs *this kind* of supplier and *this kind* of advisor, and why."
- **Consolidated** (back matter) = the **action** — the single deduplicated list a buyer procures against, we run as an RFQ, and source the people from.

**Rule: keep the inline version brief; make the end version the full actionable master; never print the full cards twice.** This is also how the page count comes *down* — today's 123 pages carry verbatim duplication that this split removes.

---

## 4. The business model is in the structure

- **Commodity parts** — named, order-direct (no value in withholding; credibility in showing).
- **Bespoke makers** (fabricators/EPC) **+ advisors** — type + spec inline; the **consolidated supplier + advisor masters are what Fractional Forge sources, vets and runs as an RFQ** — the revenue layer. The back-matter masters are, literally, the sourcing deliverable.

---

## 5. Implementation notes (engine)

Renderer: `scripts/render-minimal-pdf.tsx` (the monolith). This is mostly **section re-ordering + consolidation**, not new physics.

- **New for Part 1:** (i) a consolidated process-flow-diagram generator (BFD from `moduleDecomposition` topology); (ii) a consolidated stream + duty table; (iii) move the worked-calc rendering out of the per-module loop into one Part-1 engineering section. These three are the real new work.
- **Part 2:** reorder so each sub-module block renders {intent, BoM, suppliers, advisors} together — the per-sub-module BoM (already rendered) + the sourcing-brief content (`src/lib/pdf-engine-v2/lib/sourcing-brief.ts`, already built) + the advisor briefs (already built) integrated into one block; strip the worked-calcs from it.
- **Back matter:** the consolidated BoM (§8) + sourcing (§10) largely exist; add a **consolidated advisor roster** (new) by aggregating the per-sub-module advisor briefs.
- **Page budget:** target a *reduction* from 123pp via the inline-brief / consolidated-master split.

---

## 6. Open decisions

1. Exact Part-1 length target (how much calc detail inline vs an appendix).
2. The consolidated flow diagram + stream table: derive from design topology + tool outputs (data exists; needs the assembler).
3. Whether brief provenance (§2) + tools (§B) sit in back matter or a separate appendix bundle.
4. Build sequencing: Part 1 consolidation first (the new value), then the Part 2 re-order, then the back-matter advisor roster. A mockup-protocol gap-audit before code.
