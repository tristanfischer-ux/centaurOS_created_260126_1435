# BOM / Cost / Suppliers Integration Design

**Status:** DESIGN ONLY — no pipeline code changed  
**Author:** Claude Code (Sonnet 4.6), 2026-05-08  
**Replaces:** `stages/4-bom-cost.ts` (Stage 7 BOM + Stage 8a Cost) and `stages/5-suppliers.ts` (Stage 8b Suppliers)  
**New file:** `stages/4-bom-cost-suppliers.ts`  
**Target scores:** BOM ≥8, Cost ≥8, Suppliers ≥8 (currently ~4, ~3, ~3)

---

## Background: Why the Current Split Breaks

The existing pipeline has three stages that are causally coupled but temporally separated:

1. **Stage 4 `bom-cost.ts`:** LLM generates parts. Deterministic phase looks up Buy parts via Mouser + Digi-Key + Farnell (H1a/H1b/H1c). Cost is rolled up with an overhead multiplier regardless of whether Make parts have any real cost anchor.
2. **Stage 5 `suppliers.ts`:** Takes `state.parts` (all parts, no regime-awareness), runs semantic search over the Nightshift corpus, returns up to 5 suppliers per part. Regime (Make vs Buy) is not checked — Buy parts get corpus results that are meaningless for them.

**The logic bug:** When a part is `make_custom_fab` (i.e., `isPurchased = false`), Stage 4 computes cost from `computeFabricatedCost(massKg, material, process)` or a heuristic. Stage 5 then searches for a supplier for it. But the cost was never validated against what that supplier actually quotes — so the cost waterfall is built on an estimate that has no grounding in the supplier results. If the supplier comes back "we don't make this" or if no supplier is found, Stage 8a's cost figure is still accepted without adjustment.

**The Make/Buy fragmentation:** `classifyRegime()` in `lib/part-regime.ts` already encodes a 5-regime taxonomy (`buy_electronic`, `buy_mechanical_industrial`, `named_manufacturer_reseller`, `make_custom_fab`, `service_certification`). But the regime result (`regimeRouterResult`) is attached to `Part` and used in Stage 4's deterministic phase only for `buy_electronic` parts. Regimes `buy_mechanical_industrial` and `named_manufacturer_reseller` fall back to corpus (see `regime-router.ts` lines 44–47), not to their intended mechanical wholesaler or manufacturer-registry paths. Make parts get cost from a DB lookup that is completely independent of the supplier stage. This produces incoherent BOM/Cost/Suppliers triplets.

---

## 1. Data Model

### 1.1 New `IntegratedBomLine` type (replaces the current split)

```typescript
/**
 * IntegratedBomLine — the unified unit of account for the integrated stage.
 *
 * This is NOT the same as the existing BomLine (which is a parent/child
 * assembly relationship with no cost data). IntegratedBomLine is a flat,
 * costed BOM row — one per part in the product. Assembly hierarchy is
 * preserved in the existing BomLine.childPartId / parentPartId schema and
 * is not changed.
 *
 * Naming: kept as BomLine in PipelineState for backwards-compat with PDF
 * renderer. Internally the integrated stage works in IntegratedBomLine and
 * converts at output.
 */
export interface IntegratedBomLine {
  // ── Identity ──────────────────────────────────────────────────────────
  id: string                      // stable UUID, generated on first run
  partNumber: string              // e.g. "batt-cell-001"
  name: string                    // human display name
  sourceModuleId: string          // which module this part belongs to
  quantity: number                // resolved from BomLine.quantity (qty realism applies)

  // ── Make / Buy classification ─────────────────────────────────────────
  /**
   * partRegime distinguishes the procurement route for each line.
   *
   * 'buy'  → off-the-shelf, sourced from an electronic or mechanical
   *          distributor. Distributor APIs are called for this line.
   *          Maps to existing regimes: buy_electronic,
   *          buy_mechanical_industrial, named_manufacturer_reseller.
   *
   * 'make' → custom-manufactured to spec. Supplier corpus is searched.
   *          Maps to existing regime: make_custom_fab.
   *
   * 'service' → certification / test service. Registry lookup (not yet
   *             built — treated as 'make' for supplier matching).
   */
  partRegime: 'buy' | 'make' | 'service'

  /** Sub-regime: preserved from classifyRegime() for routing granularity. */
  regime: 'buy_electronic' | 'buy_mechanical_industrial' | 'named_manufacturer_reseller' | 'make_custom_fab' | 'service_certification'

  // ── Physical ───────────────────────────────────────────────────────────
  massKg?: number
  process?: string                // e.g. "cnc_milling", "purchased_cots"
  material?: string               // e.g. "6061-T6", "cots"

  // ── Costing ───────────────────────────────────────────────────────────
  /**
   * costSource describes how unitCostGbp was derived.
   *
   * 'mouser' | 'farnell' | 'digikey' — live distributor quote (Buy only)
   * 'supplier'  — cost provided / estimated from a Make supplier shortlist
   * 'estimated' — LLM or heuristic estimate; no real quote obtained
   * 'database'  — Supabase material+process catalogue (Make only)
   */
  costSource: 'mouser' | 'farnell' | 'digikey' | 'supplier' | 'estimated' | 'database'
  unitCostGbp: number             // per-unit cost in GBP
  /** LLM-estimated Make cost before supplier shortlist is available. */
  makeCostEstimateGbp?: number

  // ── Buy-specific: distributor results ─────────────────────────────────
  /**
   * Present when partRegime === 'buy'. Populated in parallel by the three
   * distributor APIs. Exactly matches the existing DistributorResult shape
   * so the PDF renderer can display price breaks and datasheet links.
   */
  distributors?: Array<{
    source: 'mouser' | 'farnell' | 'digikey'
    mpn: string
    manufacturer: string
    description: string
    priceGBP: Array<{ qty: number; unitPriceGbp: number }>
    stockUK: number | null
    datasheetUrl: string | null
    productUrl: string
    fetchedAt: string
  }>
  /** Best distributor after applying best-price selection logic. */
  bestDistributor?: {
    source: 'mouser' | 'farnell' | 'digikey'
    sku: string
    unitPriceGbp: number
    stockUK: number | null
    datasheetUrl: string | null
    productUrl: string
  }

  // ── Make-specific: supplier shortlist ────────────────────────────────
  /**
   * Present when partRegime === 'make'. HARD REQUIREMENT: exactly 3 entries.
   * If the corpus returns fewer than 3 strong matches, the remainder are
   * padded with the next-best corpus hits, flagged with processMatch='unverified'.
   * If fewer than 3 hits at any confidence exist, the array is padded to length 3
   * with a sentinel entry (name='No further match found', score=0).
   * The PDF renderer must show all 3 rows so the reader sees the coverage gap.
   */
  suppliers?: Array<{
    name: string
    url: string
    reason: string
    score: number                 // cosine similarity [0,1]
    country?: string
    certifications?: string[]
    processes?: string[]
    companyId?: string
    domainTags?: string[]
    processMatch?: 'process+material' | 'process' | 'material' | 'unverified'
    datasheetSnippet?: {
      text: string
      sourceUrl: string
      relevance: number
    }
  }>

  // ── RL sub-task attribution ──────────────────────────────────────────
  /**
   * Which LLM sub-task produced this line. Enables RL to target one
   * sub-task without touching others.
   */
  llmSubTask: 'PROPOSE_PARTS' | 'CLASSIFY_MAKE_BUY' | 'ESTIMATE_MAKE_COST' | 'deterministic'

  // ── Audit ─────────────────────────────────────────────────────────────
  priceSource?: string            // same as existing (part as any).priceSource
  matchedMaterialCode?: string | null
  matchedProcessName?: string | null
  qtyDeterministic?: boolean
  qtyRule?: string
}
```

### 1.2 `CostWaterfall` (new — replaces CostBreakdown for the integrated stage)

```typescript
/**
 * CostWaterfall is the structured output of the WRITE_COST_NARRATIVE sub-task.
 * It is a superset of the existing CostBreakdown and is backwards-compatible
 * (the PDF renderer reads both; CostBreakdown is kept on PipelineState for
 * existing PDF sections that render it).
 */
export interface CostWaterfall {
  // ── Totals ────────────────────────────────────────────────────────────
  rawBomCostGbp: number           // sum of (unitCostGbp × quantity) for all lines
  buyLinesTotalGbp: number        // Buy lines only
  makeLinesTotalGbp: number       // Make lines only
  overheadMultiplier: number      // domain-specific (from DOMAIN_OVERHEAD)
  assemblyCostGbp: number         // rawBomCost × (overheadMultiplier - 1)
  nreTotalGbp: number             // from nre-from-regulatory.ts
  unitTotalGbp: number            // (rawBomCost × overheadMultiplier) + amortised NRE
  ceilingGbp: number | null       // from designBrief.constraints.unitCostCeilingGbp

  // ── Waterfall steps (for PDF renderer) ───────────────────────────────
  waterfallSteps: Array<{
    label: string                 // e.g. "Buy parts (distributor-quoted)"
    gbp: number
    pctOfTotal: number
    source: 'buy_distributor' | 'buy_estimated' | 'make_supplier' | 'make_estimated' | 'overhead' | 'nre'
  }>

  // ── Per-module breakdown ──────────────────────────────────────────────
  perModule: Array<{
    moduleId: string
    moduleName: string
    totalGbp: number
    buyGbp: number
    makeGbp: number
    lineCount: number
  }>

  // ── Cost narrative (WRITE_COST_NARRATIVE sub-task output) ─────────────
  /**
   * The LLM-written prose for the Cost Waterfall section of the PDF.
   * Written AFTER the Buy/Make costs are resolved — not before — so it
   * can reference real distributor prices and real supplier estimates.
   */
  narrativeMarkdown: string

  // ── Data quality ──────────────────────────────────────────────────────
  /** Fraction of total BOM cost that is distributor-quoted (not estimated). */
  quotedCostFraction: number
  /** True if unitTotalGbp exceeds ceilingGbp. */
  exceedsCeiling: boolean
  gapPct: number | null           // (unitTotal - ceiling) / ceiling × 100
}
```

### 1.3 Relationship to existing types

| Existing field | Disposition |
|---|---|
| `PipelineState.parts: Part[]` | **Superseded** by `IntegratedBomLine[]` internally; still emitted at output for PDF renderer backwards-compat. The integrated stage copies relevant fields into `Part` shape at output. |
| `PipelineState.bomLines: BomLine[]` | **Kept unchanged.** Assembly hierarchy (parent/child) is orthogonal to costing. `BomLine.quantity` is still the source of truth for qty. |
| `PipelineState.costBreakdown: CostBreakdown` | **Superseded** by `CostWaterfall`. `CostBreakdown` is populated at output by mapping `CostWaterfall` fields for PDF renderer backwards-compat. |
| `PipelineState.suppliers: SupplierMatch[]` | **Superseded.** `IntegratedBomLine.suppliers` is the new source of truth for Make-part suppliers. At output the stage still populates `state.suppliers` (one `SupplierMatch` per Make BomLine) for PDF renderer backwards-compat. |
| `Part.regime` / `Part.regimeRouterResult` | **Preserved.** Populated from `IntegratedBomLine.regime` and `bestDistributor` / `suppliers` at output. |

---

## 2. Pipeline Stage Signature

### 2.1 Function signature

```typescript
// File: stages/4-bom-cost-suppliers.ts

export interface BomCostSuppliersInput {
  modules: Module[]
  designBrief: DesignBrief | null
  classification: {
    productClass: string
    technologyDomains: string[]
    hazardDomains: string[]
    manufacturingArchetype: string
  }
  // Passed from orchestrator (already loaded in index.ts)
  grounding?: GroundingData
  // From extractSpecs()
  productSpecs?: ProductSpecs
  // Optional overrides
  domain?: string
  ceilingGbp?: number
  trainingDataDossier?: string
  batchSize?: number
}

export interface BomCostSuppliersOutput {
  /** All BOM lines, costed and supplier-matched. */
  bomLines: IntegratedBomLine[]
  /** Structured cost waterfall for PDF rendering. */
  costWaterfall: CostWaterfall

  /**
   * Three PDF section payloads — each is a standalone string block that
   * the PDF renderer drops into the BOM, Cost, and Suppliers sections
   * respectively. Keeping them separate preserves the 3-section PDF
   * structure while allowing the integrated stage to write them from
   * a single coherent data view.
   */
  sectionBom: string              // markdown for BOM section
  sectionCost: string             // markdown for Cost Waterfall section
  sectionSuppliers: string        // markdown for Suppliers section

  /** Backwards-compat: populated from IntegratedBomLine[] for existing PDF renderer. */
  parts: Part[]
  costBreakdown: CostBreakdown
  supplierMatches: SupplierMatch[]
}

export async function runBomCostSuppliers(
  input: BomCostSuppliersInput,
): Promise<StageResult<BomCostSuppliersOutput>>
```

### 2.2 Orchestrator changes (index.ts)

Replace:
```typescript
const bomResult = await runBomCost(state.modules, state.dimensionSheet, { ... })
// ...
const supplierResult = await runSuppliers(state.parts, { ... })
```

With:
```typescript
const integratedResult = await runBomCostSuppliers({
  modules: state.modules,
  designBrief: state.research?.designBrief ?? null,
  classification,
  grounding: groundingData ?? undefined,
  productSpecs,
  domain: options?.domain || state.research.industryDomain,
  ceilingGbp: options?.ceilingGbp,
  trainingDataDossier: trainingDossier || options?.trainingDataDossier,
})
trackStage('bom_cost_suppliers', integratedResult)
if (integratedResult.ok && integratedResult.data) {
  const d = integratedResult.data
  state.parts = d.parts                    // backwards compat
  state.bomLines = d.bomLines.map(toCoreBomLine)  // strip IntegratedBomLine extras
  state.costBreakdown = d.costBreakdown    // backwards compat
  state.suppliers = d.supplierMatches      // backwards compat
  ;(state as any).costWaterfall = d.costWaterfall
  ;(state as any).integratedBomLines = d.bomLines
}
```

### 2.3 Deprecated PipelineState fields (do NOT remove until PDF renderer is updated)

| Field | Becomes | When to remove |
|---|---|---|
| `state.parts` | `integratedBomLines` (internal) | After PDF renderer reads `integratedBomLines` |
| `state.costBreakdown` | `state.costWaterfall` | After PDF renderer reads `costWaterfall` |
| `state.suppliers` | `integratedBomLine.suppliers` (per Make line) | After PDF renderer reads per-line suppliers |

---

## 3. Prompt Structure (RL Hygiene)

The integrated stage calls the LLM once with a **sectioned prompt**. Each section is delimited by `<!-- SUBTASK: <name> -->` markers so the RL framework can:

1. Vary one sub-task prompt without touching the others.
2. Attribute quality scores to individual sub-tasks.
3. Run ablation experiments (e.g., CLASSIFY_MAKE_BUY with and without regime rules).

### 3.1 Sub-task definitions

```
<!-- SUBTASK: PROPOSE_PARTS -->
Given the product modules below, generate a complete BOM.
For each part provide: partNumber, name, sourceModuleId, process, material, massKg, isPurchased.
Use ONLY material codes and process names from the grounding catalogues.
Do not include parts already listed in deterministicParts.
[modules block]
[grounding block]
[deterministicParts exclusion block]
<!-- END SUBTASK: PROPOSE_PARTS -->

<!-- SUBTASK: CLASSIFY_MAKE_BUY -->
For EACH part from PROPOSE_PARTS, classify it as 'buy' or 'make'.
Rules:
  - ICs, passives, connectors, sensors (COTS), standard fasteners → buy
  - Custom housings, machined brackets, formed sheet, welded frames, PCB assemblies
    (custom layout), wiring harnesses → make
  - Named manufacturer products (CATL, Danfoss, Sungrow…) → buy
Output: partNumber, partRegime ('buy'|'make'), regimeReason (one sentence)
<!-- END SUBTASK: CLASSIFY_MAKE_BUY -->

<!-- SUBTASK: ESTIMATE_MAKE_COST -->
For EACH part classified as 'make' in CLASSIFY_MAKE_BUY, estimate the per-unit
cost in GBP at the given batch size.
Base the estimate on: material cost (catalogue), process setup amortised over
batch, typical labour rate for the process.
Output: partNumber, makeCostEstimateGbp, estimateConfidence ('high'|'medium'|'low'),
        estimateReasoning (one sentence)
This estimate is superseded if a supplier quote is later obtained.
<!-- END SUBTASK: ESTIMATE_MAKE_COST -->

<!-- SUBTASK: WRITE_COST_NARRATIVE -->
Given the resolved costWaterfall object (provided after Buy/Make cost resolution),
write the prose for the Cost Waterfall section of the engineering report.
The narrative MUST:
  - State the total per-unit cost and whether it is within the target ceiling
  - Break down Buy vs Make vs overhead contributions
  - Name the single highest-cost line and its source
  - Note the quotedCostFraction (fraction of BOM cost that is distributor-quoted)
  - Identify the top cost-reduction opportunity
Output: narrativeMarkdown (3–5 paragraphs, no headers, British English)
<!-- END SUBTASK: WRITE_COST_NARRATIVE -->
```

### 3.2 Parsing

The LLM returns a single JSON object with four keys matching the sub-task names:

```json
{
  "PROPOSE_PARTS": { "parts": [...] },
  "CLASSIFY_MAKE_BUY": { "classifications": [...] },
  "ESTIMATE_MAKE_COST": { "estimates": [...] },
  "WRITE_COST_NARRATIVE": { "narrativeMarkdown": "..." }
}
```

`parseJsonFromLlm` (existing `lib/llm-json.ts`) handles extraction. Each sub-task result is validated independently — if `ESTIMATE_MAKE_COST` fails to parse, the stage falls back to the existing `computeFabricatedCost()` path without failing the whole stage.

### 3.3 Sub-task RL targeting

The STAGE-RL-MANIFEST should be extended with:

```
bom_cost_suppliers/PROPOSE_PARTS        → targets: BOM completeness, coverage
bom_cost_suppliers/CLASSIFY_MAKE_BUY    → targets: Make/Buy accuracy
bom_cost_suppliers/ESTIMATE_MAKE_COST   → targets: Cost accuracy for Make parts
bom_cost_suppliers/WRITE_COST_NARRATIVE → targets: Cost section prose quality
```

---

## 4. Distributor API Integration

### 4.1 The three distributors

| Distributor | Status | Auth | Notes |
|---|---|---|---|
| **Mouser** | Live (`lib/distributors/mouser.ts`) | `MOUSER_API_KEY` | Env var |
| **Digi-Key** | Live (`lib/distributors/digikey.ts`) | `DIGIKEY_CLIENT_ID` + `DIGIKEY_CLIENT_SECRET` | OAuth2 |
| **Farnell / Element14** | Live (`lib/distributors/farnell.ts`) | `FARNELL_API_KEY` | Query param |

**Note on the current "two vs three" confusion:** The `lib/distributors/index.ts` aggregator already queries all three (Mouser + Digi-Key + Farnell) in parallel via `findSkuForPart()`. However, Stage 4's deterministic phase only calls Digi-Key directly (via `bom-builder.ts` / `regime-router.ts`); Stage 5 (suppliers) never calls distributors at all. The design brief asked for a third API because the existing caller code only wired two paths. The solution is to route all Buy parts through the existing `findSkuForPart()` aggregator, which calls all three in parallel.

**The existing aggregator IS the three-distributor solution.** No new distributor adapter is needed. The integration fix is to call `findSkuForPart()` for every Buy line, not just for `buy_electronic` parts with a matched MPN.

**Proposed note on Digi-Key specifically:** Digi-Key has the broadest catalogue coverage for UK-addressable parts (estimated 12M+ SKUs vs Mouser's ~6M and Farnell's ~0.5M), has the most reliable OAuth2 client-credentials flow, and returns structured price breaks natively. It is the recommended primary for parts where Mouser and Farnell return no match.

### 4.2 Where API calls happen in the new stage flow

```
Phase 1: Deterministic BOM (unchanged from current bom-builder.ts)
Phase 2: LLM generates remaining parts (PROPOSE_PARTS sub-task)
Phase 3: Classify each part Make/Buy (CLASSIFY_MAKE_BUY sub-task)
Phase 4a: For Buy parts → findSkuForPart() in parallel (all three distributors)
Phase 4b: For Make parts → ESTIMATE_MAKE_COST sub-task + corpus supplier search in parallel
Phase 5: Aggregate costs → build CostWaterfall
Phase 6: WRITE_COST_NARRATIVE sub-task (has full cost view now)
Phase 7: Emit three section payloads (sectionBom, sectionCost, sectionSuppliers)
```

Phases 4a and 4b run in parallel with `Promise.all()`. The stage does not wait for Buy API calls before starting Make corpus search.

### 4.3 Best-price selection logic

Applied in the existing `findSkuForPart()` aggregator (`lib/distributors/index.ts`), which already sorts by:
1. In-stock (UK warehouse stock > 0) first
2. Then by qty=1 unit price ascending

No change to the aggregator. The integrated stage reads `result.best` and `result.alternates` directly.

Additional filter applied **before** accepting the best result:
- `best.stockUK === null || best.stockUK > 0` — reject out-of-stock results if an in-stock alternative exists
- Minimum order quantity check: if the MOQ (lowest `priceGBP[0].qty`) exceeds the brief's `batchSize`, flag the line with `costSource: 'estimated'` and use the heuristic instead (the distributor price is not applicable at the required volume)

### 4.4 Fallback chain when APIs fail or return no match

```
1. findSkuForPart() → aggregated best result
2. No distributor match → heuristicCotsCost(part.name) [existing function]
3. heuristicCotsCost fallback → LLM's estimatedUnitCostGbp from PROPOSE_PARTS
4. All fail → costSource: 'estimated', unitCostGbp: 0 (flagged in PDF)
```

`costSource` is set to the distributor name when a live quote is obtained, `'estimated'` otherwise. The quotedCostFraction in `CostWaterfall` exposes this to the scoring rubric.

---

## 5. Supplier Corpus Integration

### 5.1 Corpus path

The Nightshift corpus is accessed via `lib/local-corpus.ts`. The primary database is:
```
~/Library/Application Support/com.fractionalforge.nightshift/nightshift.db
```
13,771 suppliers with 1536-dim embeddings (`text-embedding-3-small`). Page-chunk snippets are in the secondary corpus at `~/Developer/Forge-Capital/nightshift/crawler/corpus.db`.

The integrated stage reuses the existing `semanticSupplierSearch()` and `embedBatch()` functions from `lib/local-corpus.ts` and `stages/5-suppliers.ts`. No new corpus query infrastructure is needed.

### 5.2 Three-suppliers-per-Make-line enforcement (HARD REQUIREMENT)

The current Stage 5 returns up to 5 suppliers per part, with no minimum. The new stage enforces exactly 3 per Make BOM line:

```typescript
function enforceThreeSuppliers(
  hits: LocalSupplier[],
  requiredCount = 3,
): LocalSupplier[] {
  if (hits.length >= requiredCount) return hits.slice(0, requiredCount)

  // Pad with sentinel entries to reach exactly 3
  const padded = [...hits]
  while (padded.length < requiredCount) {
    padded.push({
      name: 'No further supplier match found',
      website: '',
      description: 'The Nightshift corpus returned fewer than 3 capable suppliers for this part.',
      country: null,
      city: null,
      certifications: [],
      processCapabilities: [],
      similarity: 0,
      companyId: undefined,
    })
  }
  return padded
}
```

The sentinel entries render in the PDF with a distinct warning style (e.g., amber background) so the reader sees that coverage is incomplete. The supplier count is included in the scoring rubric check.

### 5.3 Supplier ranking

Ranking follows the existing logic in `stages/5-suppliers.ts` with one addition:

| Priority | Factor | Implementation |
|---|---|---|
| 1 | Semantic similarity (cosine) | `cosine(partEmbedding, supplierEmbedding)` |
| 2 | Domain tag intersection | `tagIntersectionBoost()` from `lib/domain-tags.ts` |
| 3 | Process+material verification | C4 check via `lib/reverse-indexes.ts` — promotes `process+material` over `unverified` |
| 4 | UK/EU country (new) | Boost × 1.05 if `country` is 'GB', 'IE', 'DE', 'NL', 'FR', 'SE' |
| 5 | Minimum order quantity signal | If `processCapabilities[].minOrderQty` exists and exceeds brief `batchSize`, demote by × 0.9 |

Score formula (applied after semantic similarity, before taking top-3):
```
adjusted = similarity × tagBoost × (procOk || matOk ? 1.02 : 1.0) × ukBoost × moqPenalty
```

### 5.4 Make-cost from supplier (when available)

The initial Make cost estimate comes from `ESTIMATE_MAKE_COST` (LLM sub-task). This is labelled `costSource: 'supplier'` only if a matched supplier's `processCapabilities` confirms they perform the required process at the required material — in which case the estimate is considered supplier-verified (not a pure LLM guess).

True supplier-quoted costs (from an RFQ) are out of scope for the automated stage — the PDF section should note that costs are estimates pending supplier quotes for Make parts.

---

## 6. Migration Plan

### 6.1 Build alongside existing stages

1. Create `stages/4-bom-cost-suppliers.ts` (new file).
2. Import and re-export the new types from `types.ts` (`IntegratedBomLine`, `CostWaterfall`).
3. Keep `stages/4-bom-cost.ts` and `stages/5-suppliers.ts` untouched.
4. In `index.ts`, add a feature flag:
   ```typescript
   const USE_INTEGRATED_STAGE = process.env.USE_INTEGRATED_STAGE === 'true'
   ```
   When `false` (default), the existing stages run. When `true`, the integrated stage runs.
5. Run baseline scoring with `USE_INTEGRATED_STAGE=false` to confirm no regression.
6. Run with `USE_INTEGRATED_STAGE=true` and compare scores.

### 6.2 Cut-over

1. When integrated stage passes baseline scoring on ≥8/10 for BOM, Cost, Suppliers across all 10 baseline briefs:
   - Remove the `USE_INTEGRATED_STAGE` flag.
   - Replace the two-stage call in `index.ts` with the single integrated call.
2. Keep `stages/4-bom-cost.ts` and `stages/5-suppliers.ts` for 1 sprint before deletion (rollback window).
3. Delete old files after the next full baseline run confirms no regression.

### 6.3 Estimated lines of code

| Component | Added | Removed (after cut-over) |
|---|---|---|
| `stages/4-bom-cost-suppliers.ts` | ~400 lines | — |
| `types.ts` additions | ~120 lines | — |
| `index.ts` changes | ~30 lines changed | — |
| `stages/4-bom-cost.ts` | — | ~815 lines deleted |
| `stages/5-suppliers.ts` | — | ~333 lines deleted |
| **Net** | **~550 lines net new** | **~1,148 lines removed after cut-over** |

### 6.4 Estimated wall-clock effort

| Task | Sonnet hours |
|---|---|
| Write `stages/4-bom-cost-suppliers.ts` | 2–3 |
| Update `types.ts` (IntegratedBomLine, CostWaterfall) | 0.5 |
| Update `index.ts` orchestrator + feature flag | 0.5 |
| Update PDF renderer to consume `costWaterfall` and per-line suppliers | 2–3 |
| Baseline scoring validation (10 briefs × 3 sections) | 1–2 |
| Cut-over + delete old stages | 0.5 |
| **Total** | **6–9 Sonnet hours** |

---

## 7. Open Questions for Tristan

### Q1 — Third distributor: Digi-Key is already wired

The `lib/distributors/index.ts` aggregator already calls Mouser + Digi-Key + Farnell in parallel. The "two API" impression came from Stage 4's deterministic phase only wiring Digi-Key directly. The integrated design routes all Buy parts through the existing three-way aggregator. **No new distributor adapter is needed.** Confirm this resolves the "third API" requirement, or specify a fourth if coverage gaps exist (e.g., LCSC for low-cost Asian components, RS Components for industrial parts, Newark for US parts available in UK).

### Q2 — Make-cost estimation: LLM estimate vs defer to supplier quote

For Make parts, the `ESTIMATE_MAKE_COST` sub-task produces an LLM estimate from process + material before supplier search runs. Two options:

- **Option A (proposed):** Use the LLM estimate for cost waterfall aggregation, label it `costSource: 'estimated'`, note in the narrative that costs are pending supplier RFQ. This keeps the cost waterfall populated and avoids a blank Cost section.
- **Option B:** Leave Make costs as £0 until a supplier quote is obtained (requires an asynchronous RFQ flow, which does not exist). Cost waterfall shows a partial total with a prominent note. Risk: the cost total is meaningfully wrong.

Option A is recommended. Please confirm, or specify a minimum confidence threshold below which the cost should be shown as a range rather than a point estimate.

### Q3 — Buy part not found at any distributor

Currently the fallback is `heuristicCotsCost(part.name)` which returns a keyword-matched estimate. Options:

- **Option A (proposed):** Accept the heuristic, set `costSource: 'estimated'`, flag in PDF. No change to existing behaviour.
- **Option B:** Classify the part as Make (corpus search instead of distributor) when no distributor has a match. Risk: a COTS IC that's genuinely unavailable (discontinued) is not actually makeable.
- **Option C:** Skip the line from cost aggregation and show it as "cost unknown" in the BOM. Risk: underestimates total cost.

Option A is recommended. Please confirm.

### Q4 — Make part has fewer than 3 capable suppliers in corpus

The three-supplier hard requirement means the stage pads to 3 with sentinel entries. Three sub-questions:

- Should the sentinel entries trigger a pipeline warning (not failure) visible in the scoring dashboard?
- Should the stage retry with a looser embedding threshold (e.g., reduce `0.25` to `0.15`) before padding with sentinels?
- Should Brave Search be used as a last-resort fallback to find suppliers not in the Nightshift corpus (current Stage 5 behaviour for parts with no corpus hit)?

**Proposed:** yes to all three (retry at 0.15 first, then Brave fallback, then sentinel if Brave returns <3 commercial results, always warn in scoring dashboard). Confirm this is acceptable, or specify a different minimum threshold.

---

## Appendix A — Current scoring baseline (for comparison)

From `BASELINE-10-ANALYSIS.md` and council-scorer output. Scores are /10.

| Section | Current avg | Target |
|---|---|---|
| BOM | 4–5 | ≥8 |
| Cost Waterfall | 3–4 | ≥8 |
| Suppliers | 3–4 | ≥8 |

Root cause traced to: Make parts entering cost waterfall with heuristic estimates not validated against suppliers; Buy parts sometimes missing SKU; supplier results not filtered to Make-only parts.

## Appendix B — Files read during design

- `src/lib/pdf-engine-v2/types.ts` — `Part`, `BomLine`, `CostBreakdown`, `SupplierMatch`, `PipelineState`
- `src/lib/pdf-engine-v2/stages/4-bom-cost.ts` — full stage, `runBomCost()`, `heuristicCotsCost()`, `computeFabricatedCost()`
- `src/lib/pdf-engine-v2/stages/5-suppliers.ts` — full stage, `runSuppliers()`, `toSupplierMatch()`, `embedBatch()`
- `src/lib/pdf-engine-v2/lib/distributors/index.ts` — `findSkuForPart()`, `AggregateResult`
- `src/lib/pdf-engine-v2/lib/distributors/mouser.ts` — `DistributorResult`, `lookupSkuMouser()`
- `src/lib/pdf-engine-v2/lib/distributors/digikey.ts` — `lookupSkuDigikey()`
- `src/lib/pdf-engine-v2/lib/distributors/farnell.ts` — `lookupSkuFarnell()`
- `src/lib/pdf-engine-v2/lib/part-regime.ts` — `classifyRegime()`, regime taxonomy
- `src/lib/pdf-engine-v2/lib/regime-router.ts` — `routePartLookup()`, `routeElectronic()`
- `src/lib/pdf-engine-v2/lib/local-corpus.ts` — `semanticSupplierSearch()`, corpus path
- `src/lib/pdf-engine-v2/cost-model.ts` — `calculateCost()`, `DOMAIN_OVERHEAD`
- `src/lib/pdf-engine-v2/index.ts` — orchestrator, stage wiring
