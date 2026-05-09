# 3-LLM Design Council: Hybrid Module Decomposition Architecture
**Date:** 2026-05-09  
**Council Seats:** Grok-4.3 (x-ai), Gemini-3.1-Pro-Preview (Google), DeepSeek-V4-Pro  
**Topic:** Proposed hybrid architecture for ForgeOS PDF Engine v2 BOM/Supplier grounding  
**Goal:** Achieve ≥8/10 across all 12 sections and all 10 baseline projects

---

## Architecture Under Review

The proposed hybrid architecture adds three schema fields per expected_part (`mpn`, `manufacturer`, `part_class`) and routes by class:

- `electronic_cots` → Mouser/Digi-Key/Farnell APIs
- `power_cots` → Mouser industrial / RS Components (not yet integrated)
- `structural_fabricated` → Protolabs API (not yet integrated)
- `oem_direct` → LLM-in-loop with transparency banner (~30% of BOM)

Cross-check ensemble: 3-4 reasoning LLMs at 32K tokens in parallel; consensus parts go to deterministic search.

---

## Question 1: Is the four-class taxonomy the right partition?

### Grok-4.3 verdict
**Taxonomy is WRONG — mixing sourcing mechanism with part physics creates ambiguous buckets.** `power_cots` overlaps with both `electronic_cots` (on the distributor side) and `oem_direct` (high-power tier). `structural_fabricated` hides a real split between low-volume CNC/sheet (Protolabs-like) and high-volume contract manufacturing.

Grok proposes reclassifying by *sourcing interface type* not *part type*:
1. Distributor API (Mouser, Digi-Key, RS, McMaster-Carr)
2. Instant-quote contract manufacturer (Protolabs, Xometry)
3. Direct OEM / regional distributor sales teams (battery cells, inverters, fire panels)
4. No digital interface (castings, custom magnetics, specialist fabricators)

Missing classes flagged: **fasteners/adhesives/seals/thermal materials** (McMaster-Carr APIs exist), **raw stock and semi-finished** (aluminium plate, copper busbar).

**Hidden assumption flagged:** The LLM will classify `part_class` correctly on the first pass. It won't, especially on edge cases that dominate industrial BOMs.

### Gemini-3.1-Pro verdict
**Taxonomy is FLAWED. `electronic_cots` and `power_cots` are mechanically useless as a split** if both route to the same Mouser/Farnell APIs. The critical missing class is **Mechanical/Hardware COTS** — DIN rails, IP67 seals, fasteners, cabling. These are not structural_fabricated and not electronics.

Gemini's corrected five-class taxonomy:
1. `cots_electronics` — semiconductor, passive, active board-level (Digi-Key, Mouser, Farnell)
2. `cots_mechanical` — standardised non-electrical hardware (McMaster-Carr, Grainger, Misumi)
3. `structural_fabricated` — custom machined/stamped/printed parts (Protolabs, Xometry)
4. `oem_subsystem` — high-level integrated assemblies: PCS inverters, LFP cell blocks, gimbals
5. `software_ip` — MCU RTOS licenses, CV models, cloud dashboard fees (LLM estimate or excluded)

Drop `power_cots`, merge into `cots_electronics` or `oem_subsystem` by integration level. Add `cots_mechanical`. Add `software_ip` as a fifth class.

### DeepSeek-V4-Pro verdict
**Taxonomy missing one key category: `mechanical_cots`.** Without it, standard fasteners, bearings, extrusions, heat sinks, generic enclosures either route incorrectly to Protolabs or fall back to hallucination.

DeepSeek's corrected five-class taxonomy:
1. `electronic_cots` — semiconductor/passive/connector (Mouser/Digi-Key/Farnell)
2. `power_cots` — high-current/power modules (RS, industrial Mouser)
3. `mechanical_cots` — standard off-the-shelf hardware (McMaster-Carr, Misumi, Grainger)
4. `structural_fabricated` — custom manufactured metal/plastic (Protolabs/Xometry)
5. `oem_direct` — large-scale proprietary/OEM with no catalogue

**Key principle (challenged assumption):** The taxonomy should be driven by available deterministic data sources, not by an abstract engineering ontology.

### Q1 Consensus — HIGH confidence
**The four-class taxonomy is wrong.** All three models independently arrived at the same verdict: `mechanical_cots` is the most critical missing class (McMaster-Carr/Misumi/Grainger APIs exist and are high-volume). Gemini additionally flagged `software_ip` as worth adding, though DeepSeek and Grok did not raise it. The split of `electronic_cots` vs `power_cots` is questionable — only DeepSeek retained it; Grok and Gemini recommend collapsing it. The taxonomy should be restructured as five classes:

| Class | Routes to |
|---|---|
| `electronic_cots` | Mouser, Digi-Key, Farnell |
| `mechanical_cots` | McMaster-Carr, Misumi, Grainger |
| `structural_fabricated` | Protolabs, Xometry |
| `oem_subsystem` | Supplier graph / LLM |
| `software_ip` | LLM estimate or exclude |

`power_cots` should be absorbed into `electronic_cots` (low-power) or `oem_subsystem` (high-power) based on integration level, with routing determined by which API actually has catalogue coverage.

---

## Question 2: Is the 3-4 LLM cross-check ensemble worth £5-15/baseline?

### Grok-4.3 verdict
**Not worth it.** A single strong model with tight schema constraints plus deterministic post-filtering against partial search results delivers most hallucination reduction at 20-30% of the cost. Running four weaker models in parallel amplifies mediocre consensus rather than surfacing genuinely hard-to-detect omissions. The claimed 60-70% reduction in LLM BOM calls assumes near-perfect classification; real misclassification eats most of that gain.

### Gemini-3.1-Pro verdict
**Absolutely not. Do not build this ensemble.** The Entity Resolution Problem makes it an anti-pattern: LLM-1 extracts "M3x10mm Socket Head Cap Screw", LLM-2 extracts "10mm M3 Bolt", LLM-3 extracts "Metric Steel Fastener M3". The consensus engine fails to reconcile these, falsely triggering LLM-in-loop fallback for perfectly valid components.

Gemini's counterproposal: spend the £5-15 budget on **downstream verification** — hit the distributor API, and on zero-match or wild price anomaly, use a fast cheap LLM call to retry with a mutated query string. Single LLM with explicit transparency banners is correct.

### DeepSeek-V4-Pro verdict
**Low value relative to alternatives.** The deterministic search step already acts as a hallucination filter — a hallucinated MPN returns no API results, triggering fallback. The ensemble's primary benefit is more reliable `part_class` assignment, but a single LLM with per-part confidence scores (logprobs) and a conservative "if uncertain, treat as oem_direct" rule achieves similar safety at a fraction of the cost. The 32K token context appears oversized for module decomposition.

Key point: the **irreducible OEM tier (30%) will dominate the quality ceiling** regardless of ensemble quality. Spending £50-150 on improving OEM data coverage yields far greater score uplift.

### Q2 Consensus — HIGH confidence
**The ensemble is not worth the spend.** Unanimous verdict across all three seats. Single-LLM with logprobs-based confidence scoring + conservative OEM-direct fallback is the correct architecture. Entity resolution problems make multi-LLM consensus actively harmful for BOM extraction. Redirect that £5-15/baseline budget to the oem_subsystem data layer.

The API zero-match feedback loop (single LLM → API call → zero match → retry with cheap LLM mutation) is a better hallucination guard than ensemble voting.

---

## Question 3: Highest-leverage next move after hybrid lands?

### Grok-4.3 verdict
**Build a lightweight supplier-relationship + quote archive layer for oem_direct BEFORE chasing more API integrations.** Protolabs and RS Components each move the needle on less than 15% of parts; they are pleasant but marginal. The irreducible 30% is where actual product cost and lead-time data lives. Capturing partial historical quotes and approved-vendor lists compounds faster than another deterministic endpoint.

**Hidden assumption flagged:** The dominant failure mode may be *inaccurate classification and scoping by the initial LLM decomposition* rather than missing catalogue data. Fix the classification problem first.

### Gemini-3.1-Pro verdict
**Build a RAG-backed Supplier Graph for the oem_subsystem tier first.** Protolabs only solves ~10% of BOM (enclosures/brackets). RS Components is redundant coverage over Farnell/Mouser. The oem_subsystem tier contains the bulk of industrial BOM cost and it needs specialist scraping of ThomasNet, GlobalSources, Alibaba industrial tier, and OEM spec sheets (CATL, Danfoss, ABB). Then build Xometry/Protolabs second (deterministic pricing impresses judging bodies). Ignore RS Components until v3.

### DeepSeek-V4-Pro verdict
**Two-track approach:**
1. **Immediate tactical:** Integrate RS Components + Protolabs + McMaster-Carr. This lifts API-searchable BOM share from ~20% to 50-60%, directly cutting the hallucination-prone space.
2. **Strategic:** Convert the irreducible oem_direct tier into a curated reference database — top 200-300 OEM items (battery cells, standard inverter models, fire panels, CGM sensors) across the 10 baseline industries with verified MPNs, typical lead times, and average pricing from past quotes, industry reports, and manufacturer datasheets.

**Challenged assumption:** The framing treats the "irreducible" OEM tier as immutable. Industry-specific reference data, even if manually curated, can fundamentally change the grounding landscape.

### Q3 Consensus — MODERATE confidence (split on sequencing)

All three agree that the oem_subsystem/oem_direct tier is the strategic prize and the highest-leverage play long-term. They split on immediate sequencing:

- **Grok + Gemini:** Build the oem supplier graph/database FIRST, before API integrations
- **DeepSeek:** Do API integrations first (RS + Protolabs + McMaster-Carr) to lift the 20% → 50-60% coverage floor, then tackle the oem database

**Synthesised recommendation:** The tactical integrations (RS Components for `power_cots`, McMaster-Carr for `mechanical_cots`) can run in parallel with the oem_subsystem database build if staffed. They are not mutually exclusive and McMaster-Carr in particular is a high-value quick win (standard fasteners appear in every BOM). Protolabs is lower priority. The oem_subsystem database — even 200-300 curated entries with verified MPNs and price ranges from datasheets — is the strategic differentiator.

---

## What the Council Disagrees On

### Split 1: `power_cots` as a distinct class
- **Grok:** Collapse it — it's an API routing fiction
- **Gemini:** Collapse it into `cots_electronics` or `oem_subsystem`
- **DeepSeek:** Keep it, routes to RS + industrial Mouser

**Assessment:** DeepSeek's position is defensible if RS Components integration is built. Grok and Gemini's critique holds until then. Pragmatic call: keep `power_cots` as a class but treat it as `oem_subsystem` in the router until RS is integrated.

### Split 2: Q3 sequencing — API integrations vs oem database first
- **Grok + Gemini:** oem supplier graph first
- **DeepSeek:** API integrations first (faster coverage lift)

**Assessment:** Both tracks have merit. If one engineer is available, follow DeepSeek's ordering (McMaster-Carr first — it's the quickest win). If parallel capacity exists, do both.

### Split 3: `software_ip` as a class
- **Gemini:** Yes, add it as class 5
- **Grok + DeepSeek:** Did not raise it

**Assessment:** Relevant for CGM wearables and drone firmware but niche. Add it as a `software_ip` class with LLM-only routing and a clear "excluded from physical BOM cost" note. Low effort, future-proofs the schema.

---

## Surprising Suggestions

1. **Grok: The root failure may be classification quality, not data coverage.** The ensemble was proposed to improve BOM enumeration, but if the underlying Module Decomposition prompt misclassifies parts (which it will on industrial edge cases), all downstream routing is wrong regardless of how many LLMs vote. Fixing the classification prompt with real-world calibration examples may be higher leverage than either the ensemble or API integrations. This was not in the original architecture brief.

2. **Gemini: McMaster-Carr API exists and is high-coverage for mechanical COTS.** The original brief focused on Mouser/Digi-Key/Farnell for electronics and Protolabs for fabrication but completely missed the mechanical COTS ecosystem. McMaster-Carr (US) and Misumi (global) have usable APIs and cover the fasteners/bearings/seals that appear in every single industrial product BOM.

3. **Gemini: Entity Resolution Problem makes ensemble voting an anti-pattern.** The argument is not just "too expensive" — it's that multi-LLM BOM voting will produce incompatible part descriptions that the reconciler cannot merge, causing MORE fallback to LLM-in-loop than a single-LLM approach. This is a qualitative flaw in the ensemble proposal, not just a cost objection.

4. **DeepSeek: 32K token context is oversized for Module Decomposition.** The task does not require a 32K window. Trimming to a smaller context frees budget for the data grounding calls that actually move the score.

---

## Final Synthesised Recommendation

### Architecture verdict: PROCEED with hybrid, but fix the taxonomy first

The hybrid direction (deterministic APIs for known-catalogue parts, LLM-in-loop with transparency for the rest) is the right call. The four-class taxonomy is wrong and should be corrected before implementation.

**Recommended taxonomy (five classes):**
1. `electronic_cots` — Mouser, Digi-Key, Farnell
2. `mechanical_cots` — McMaster-Carr, Misumi, Grainger *(new — critical)*
3. `structural_fabricated` — Protolabs, Xometry
4. `oem_subsystem` — curated supplier database + LLM fallback *(replaces oem_direct)*
5. `software_ip` — LLM estimation, excluded from physical BOM cost

**Drop `power_cots` as a distinct class.** Route high-current electronics to `electronic_cots` (if distributor API covers it) or `oem_subsystem` (if not). Revisit after RS Components integration.

### Ensemble verdict: DO NOT BUILD

Single-LLM with logprobs confidence + conservative oem_subsystem fallback + API zero-match retry loop is strictly better. Redirect the £5-15/baseline budget to oem data layer.

### Next move ranking (post-hybrid):
1. **McMaster-Carr API for `mechanical_cots`** — covers fasteners/bearings/seals across all 10 baseline products, high coverage, available API, quick win
2. **Curated oem_subsystem reference database** — 200-300 entries, verified MPNs + price ranges from datasheets, covers the bulk of BOM cost for BESS/heat pump/EV charger products
3. **RS Components for `power_cots`** — mid-priority, unlocks the power_cots class properly
4. **Protolabs for `structural_fabricated`** — deterministic pricing is impressive but addresses a smaller BOM fraction than 1-3
5. **Classification prompt calibration** — add real-world edge-case examples to Module Decomposition prompt to reduce misclassification before it pollutes API routing

---

*Council run: 2026-05-09. Models: x-ai/grok-4.3, google/gemini-3.1-pro-preview, deepseek/deepseek-v4-pro. Synthesis by Claude Sonnet 4.6.*
