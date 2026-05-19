/**
 * @file stages/4c-radical-cost-rollup.ts — Phase 3: Production Cost Rollup
 *
 * Lifts radical/demo/cost-rollup.ts to production. Walks the resolved
 * RadicalTree (from Phase 2 / state.resolvedRadicalTree) depth-first and
 * computes a CostSummary-shaped radicalCostSummary by applying assembly
 * markups at each level of the Radical hierarchy.
 *
 * Feature flag: RADICAL_PHASE_3_COSTROLLUP=true enables this path.
 *
 * Input:  state.resolvedRadicalTree (populated by Phase 2 / 4b-radical-resolution.ts)
 * Output: state.radicalCostSummary — same shape as state.costSummary (CostSummary)
 *
 * Assembly markups (matches demo/cost-rollup.ts rates):
 *   Character level:   +15% — PCB assembly / component integration
 *   Word level:        +20% — subsystem integration (wiring, test, commissioning)
 *   Sentence level:    +25% — system integration (container fit-out, commissioning)
 *   Paragraph level:   sum of sentences = BoM total (no additional markup)
 *
 * The existing state.costSummary from Stage 4 (refactor b, commit f4efbe22) is
 * UNCHANGED. radicalCostSummary coexists alongside it during the migration.
 * Phase 7 will eventually swap them. The renderer (Phase 5) consumes
 * radicalCostSummary when RADICAL_PHASE_3_COSTROLLUP=true, else costSummary.
 *
 * Shadow-mode diff: the diff between the two summaries is logged to console
 * for comparison purposes during migration.
 *
 * This stage is PURELY DETERMINISTIC — zero LLM calls. The determinism test
 * passes trivially (same input → same output, always).
 *
 * Strictly additive — existing Stage 4 BOM cost computation is UNCHANGED.
 */

import type { CostSummary } from '../types.js'
import type { ResolvedRadicalTree, ResolvedCompositionNode, ResolvedLeafAnnotation } from './4b-radical-resolution.js'

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * Check if Phase 3 Cost Rollup is enabled.
 * Must be set to exactly "true" (case-insensitive), "1", "yes", or "on".
 */
export function isPhase3CostRollupEnabled(): boolean {
  const raw = (process.env.RADICAL_PHASE_3_COSTROLLUP ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// Assembly markup rates (mirrors demo/cost-rollup.ts)
// ---------------------------------------------------------------------------

/** PCB assembly / component integration — applied at character level */
const CHARACTER_ASSEMBLY_MARKUP = 0.15

/** Subsystem integration (wiring, test, commissioning) — applied at word level */
const WORD_ASSEMBLY_MARKUP = 0.20

/** System integration (container fit-out, commissioning) — applied at sentence level */
const SENTENCE_ASSEMBLY_MARKUP = 0.25

// ---------------------------------------------------------------------------
// Internal types for the tree-walking result
// ---------------------------------------------------------------------------

interface RadicalLeafCost {
  archetypeId: string
  label: string
  qty: number
  unitPriceGbp: number | null
  lineTotal: number
  verificationGrade: string
  source: string
}

interface CharacterCost {
  characterId: string
  label: string
  leaves: RadicalLeafCost[]
  partsCost: number           // sum of leaf line totals
  afterCharacterMarkup: number // partsCost × (1 + CHARACTER_ASSEMBLY_MARKUP)
  characterMarkupGbp: number  // partsCost × CHARACTER_ASSEMBLY_MARKUP
}

interface WordCost {
  wordId: string
  label: string
  characters: CharacterCost[]
  characterSubtotal: number    // sum of afterCharacterMarkup from each character
  wordMarkupGbp: number        // characterSubtotal × WORD_ASSEMBLY_MARKUP
  wordTotal: number            // characterSubtotal × (1 + WORD_ASSEMBLY_MARKUP)
}

interface SentenceCost {
  sentenceId: string
  label: string
  words: WordCost[]
  wordSubtotal: number         // sum of wordTotal from each word
  sentenceMarkupGbp: number    // wordSubtotal × SENTENCE_ASSEMBLY_MARKUP
  sentenceTotal: number        // wordSubtotal × (1 + SENTENCE_ASSEMBLY_MARKUP)
}

interface ParagraphCost {
  sentences: SentenceCost[]
  bomTotal: number             // sum of sentenceTotal (paragraph total = BoM total)
}

/** Extended CostSummary with Radical-specific hierarchy metadata */
export interface RadicalCostSummary extends CostSummary {
  /** Full paragraph hierarchy for renderer consumption */
  radicalHierarchy: ParagraphCost
  /** When and how this summary was computed */
  radicalMeta: {
    computed_at: string
    character_markup_pct: number
    word_markup_pct: number
    sentence_markup_pct: number
    total_leaves: number
    priced_leaves: number
    unpriced_leaves: number
  }
}

// ---------------------------------------------------------------------------
// Tree-walking algorithm
// ---------------------------------------------------------------------------

/**
 * Determine whether a node in the ResolvedRadicalTree is a leaf.
 * Leaves are nodes with no children.
 */
function isLeafNode(node: ResolvedCompositionNode): boolean {
  return !node.children || node.children.length === 0
}

/**
 * Collect all resolved leaf annotations from the entire tree.
 * Used to build the flat leaf-cost list for topDrivers.
 */
function collectAllLeafCosts(root: ResolvedCompositionNode): RadicalLeafCost[] {
  const results: RadicalLeafCost[] = []

  function walk(node: ResolvedCompositionNode): void {
    if (isLeafNode(node)) {
      const res = node.resolution
      const unitPrice = res?.unit_price_gbp ?? null
      const qty = res?.qty ?? node.quantity
      const lineTotal = unitPrice !== null ? unitPrice * qty : 0
      results.push({
        archetypeId: node.archetypeId,
        label: node.archetypeId.replace(/_/g, ' '),
        qty,
        unitPriceGbp: unitPrice,
        lineTotal,
        verificationGrade: res?.verification_grade ?? 'data_gap',
        source: res?.source ?? 'unknown',
      })
    } else {
      for (const child of node.children) {
        walk(child as ResolvedCompositionNode)
      }
    }
  }

  walk(root)
  return results
}

/**
 * Walk a character-level node and compute its cost.
 *
 * In the RadicalTree hierarchy:
 *   - Sentence nodes (top level) → Word nodes → Character nodes → Leaf nodes
 *
 * A character-level node is one level above leaves.
 * We compute the sum of leaf line totals and apply the character markup.
 */
function computeCharacterCost(node: ResolvedCompositionNode): CharacterCost {
  const leaves: RadicalLeafCost[] = []

  // Collect all leaf descendants of this character node
  function walkLeaves(n: ResolvedCompositionNode): void {
    if (isLeafNode(n)) {
      const res = n.resolution
      const unitPrice = res?.unit_price_gbp ?? null
      const qty = res?.qty ?? n.quantity
      const lineTotal = unitPrice !== null ? unitPrice * qty : 0
      leaves.push({
        archetypeId: n.archetypeId,
        label: n.archetypeId.replace(/_/g, ' '),
        qty,
        unitPriceGbp: unitPrice,
        lineTotal,
        verificationGrade: res?.verification_grade ?? 'data_gap',
        source: res?.source ?? 'unknown',
      })
    } else {
      for (const child of n.children) {
        walkLeaves(child as ResolvedCompositionNode)
      }
    }
  }
  walkLeaves(node)

  const partsCost = leaves.reduce((sum, l) => sum + l.lineTotal, 0)
  const characterMarkupGbp = partsCost * CHARACTER_ASSEMBLY_MARKUP
  const afterCharacterMarkup = partsCost + characterMarkupGbp

  return {
    characterId: node.archetypeId,
    label: node.archetypeId.replace(/_/g, ' '),
    leaves,
    partsCost,
    afterCharacterMarkup,
    characterMarkupGbp,
  }
}

/**
 * Walk a word-level node and compute its cost.
 * A word node is two levels above leaves (word → character → leaf).
 */
function computeWordCost(node: ResolvedCompositionNode): WordCost {
  // Each direct child of a word node is a character node
  const characters: CharacterCost[] = []

  for (const child of node.children) {
    const charNode = child as ResolvedCompositionNode
    characters.push(computeCharacterCost(charNode))
  }

  const characterSubtotal = characters.reduce((sum, c) => sum + c.afterCharacterMarkup, 0)
  const wordMarkupGbp = characterSubtotal * WORD_ASSEMBLY_MARKUP
  const wordTotal = characterSubtotal + wordMarkupGbp

  return {
    wordId: node.archetypeId,
    label: node.archetypeId.replace(/_/g, ' '),
    characters,
    characterSubtotal,
    wordMarkupGbp,
    wordTotal,
  }
}

/**
 * Walk a sentence-level node and compute its cost.
 * A sentence node is three levels above leaves (sentence → word → character → leaf).
 */
function computeSentenceCost(node: ResolvedCompositionNode): SentenceCost {
  const words: WordCost[] = []

  for (const child of node.children) {
    const wordNode = child as ResolvedCompositionNode
    words.push(computeWordCost(wordNode))
  }

  const wordSubtotal = words.reduce((sum, w) => sum + w.wordTotal, 0)
  const sentenceMarkupGbp = wordSubtotal * SENTENCE_ASSEMBLY_MARKUP
  const sentenceTotal = wordSubtotal + sentenceMarkupGbp

  return {
    sentenceId: node.archetypeId,
    label: node.archetypeId.replace(/_/g, ' '),
    words,
    wordSubtotal,
    sentenceMarkupGbp,
    sentenceTotal,
  }
}

/**
 * Walk the entire tree from paragraph level.
 *
 * IMPORTANT: The RadicalTree root IS the paragraph level.
 * Its direct children are sentences.
 * Each sentence's children are words.
 * Each word's children are characters (or leaves if the tree is shallow).
 * Each character's children are leaves (radicals resolved to parts).
 *
 * For shallow trees (e.g. 2-level: root → leaves), we treat every immediate
 * child of root as a "sentence" with a single flat word containing leaves.
 * This makes the walkable regardless of how deep the LLM built the tree.
 */
function walkParagraph(root: ResolvedCompositionNode): ParagraphCost {
  const sentences: SentenceCost[] = []

  // Determine the depth of the tree to decide how to walk it
  // Inspect the first path to understand actual nesting
  function detectDepth(node: ResolvedCompositionNode, depth = 0): number {
    if (isLeafNode(node)) return depth
    let maxChild = depth
    for (const child of node.children) {
      const d = detectDepth(child as ResolvedCompositionNode, depth + 1)
      if (d > maxChild) maxChild = d
    }
    return maxChild
  }

  const treeDepth = detectDepth(root)

  if (treeDepth >= 3) {
    // Full 4-level tree: paragraph → sentence → word → character → leaf
    // Root's children are sentences
    for (const child of root.children) {
      const sentenceNode = child as ResolvedCompositionNode
      sentences.push(computeSentenceCost(sentenceNode))
    }
  } else if (treeDepth === 2) {
    // 3-level tree: paragraph → sentence → word/character → leaf
    // Treat each child of root as a sentence, each of its children as a word
    for (const child of root.children) {
      const sentenceNode = child as ResolvedCompositionNode
      // Compute as sentence with characters directly, no word intermediary
      const words: WordCost[] = [{
        wordId: sentenceNode.archetypeId + '_word',
        label: sentenceNode.archetypeId.replace(/_/g, ' '),
        characters: sentenceNode.children.map(c => computeCharacterCost(c as ResolvedCompositionNode)),
        characterSubtotal: 0, // filled below
        wordMarkupGbp: 0,
        wordTotal: 0,
      }]
      const charSubtotal = words[0].characters.reduce((s, c) => s + c.afterCharacterMarkup, 0)
      words[0].characterSubtotal = charSubtotal
      words[0].wordMarkupGbp = charSubtotal * WORD_ASSEMBLY_MARKUP
      words[0].wordTotal = charSubtotal * (1 + WORD_ASSEMBLY_MARKUP)

      const wordSubtotal = words.reduce((s, w) => s + w.wordTotal, 0)
      const sentenceMarkupGbp = wordSubtotal * SENTENCE_ASSEMBLY_MARKUP
      sentences.push({
        sentenceId: sentenceNode.archetypeId,
        label: sentenceNode.archetypeId.replace(/_/g, ' '),
        words,
        wordSubtotal,
        sentenceMarkupGbp,
        sentenceTotal: wordSubtotal * (1 + SENTENCE_ASSEMBLY_MARKUP),
      })
    }
  } else {
    // Very shallow or flat tree: treat root's children as leaves directly.
    // Wrap everything in a single synthetic sentence.
    const allLeaves = collectAllLeafCosts(root)
    const flatWord: WordCost = {
      wordId: 'flat_word',
      label: 'System',
      characters: [{
        characterId: 'flat_character',
        label: 'Components',
        leaves: allLeaves,
        partsCost: allLeaves.reduce((s, l) => s + l.lineTotal, 0),
        afterCharacterMarkup: 0,
        characterMarkupGbp: 0,
      }],
      characterSubtotal: 0,
      wordMarkupGbp: 0,
      wordTotal: 0,
    }
    const partsCost = flatWord.characters[0].partsCost
    flatWord.characters[0].characterMarkupGbp = partsCost * CHARACTER_ASSEMBLY_MARKUP
    flatWord.characters[0].afterCharacterMarkup = partsCost * (1 + CHARACTER_ASSEMBLY_MARKUP)
    flatWord.characterSubtotal = flatWord.characters[0].afterCharacterMarkup
    flatWord.wordMarkupGbp = flatWord.characterSubtotal * WORD_ASSEMBLY_MARKUP
    flatWord.wordTotal = flatWord.characterSubtotal * (1 + WORD_ASSEMBLY_MARKUP)

    const wordSubtotal = flatWord.wordTotal
    const sentenceMarkupGbp = wordSubtotal * SENTENCE_ASSEMBLY_MARKUP
    sentences.push({
      sentenceId: root.archetypeId + '_system',
      label: root.archetypeId.replace(/_/g, ' '),
      words: [flatWord],
      wordSubtotal,
      sentenceMarkupGbp,
      sentenceTotal: wordSubtotal * (1 + SENTENCE_ASSEMBLY_MARKUP),
    })
  }

  const bomTotal = sentences.reduce((sum, s) => sum + s.sentenceTotal, 0)

  return { sentences, bomTotal }
}

// ---------------------------------------------------------------------------
// Main production cost rollup function
// ---------------------------------------------------------------------------

/**
 * Compute a RadicalCostSummary by walking the resolved tree.
 *
 * @param resolvedTree   Phase 2 output (state.resolvedRadicalTree)
 * @param ceilingCost    Brief cost ceiling in GBP (or null)
 * @returns              RadicalCostSummary — same shape as CostSummary + hierarchy metadata
 */
export function runRadicalCostRollup(
  resolvedTree: ResolvedRadicalTree,
  ceilingCost: number | null = null,
): RadicalCostSummary {
  console.log('[Phase3/cost-rollup] Starting Radical Phase 3 cost rollup...')

  const root = resolvedTree.composition.root as ResolvedCompositionNode

  // ── Step 1: Walk the tree ──────────────────────────────────────────────────
  const paragraph = walkParagraph(root)

  // ── Step 2: Build byModule (byParagraph→sentences→words→characters) ────────
  //
  // CostSummary.byModule is Record<moduleId, { moduleName, rawGbp, pctOfBom }>
  // We map sentences → module entries. rawGbp = sentenceTotal (already includes
  // markup — it's the fully-loaded sentence cost, not the raw BOM sub-total).
  // This matches how the demo treats word-level totals as the per-module cost.

  const byModule: CostSummary['byModule'] = {}
  for (const sentence of paragraph.sentences) {
    byModule[sentence.sentenceId] = {
      moduleName: sentence.label,
      rawGbp: sentence.sentenceTotal,
      pctOfBom: paragraph.bomTotal > 0
        ? (sentence.sentenceTotal / paragraph.bomTotal) * 100
        : 0,
    }
  }

  // ── Step 3: Top cost drivers ───────────────────────────────────────────────
  //
  // Walk all leaves and find the top 5 by lineTotal (absolute contribution).
  // A leaf's contribution = lineTotal propagated through all markups.
  // For simplicity (and consistency with the demo), we use raw lineTotal as
  // the basis — the markup is shared overhead, not attributable to a single leaf.

  const allLeaves = collectAllLeafCosts(root)
  const pricedLeaves = allLeaves.filter(l => l.lineTotal > 0)
  const unpricedLeaves = allLeaves.filter(l => l.lineTotal === 0)

  // Bug P2-10 fix (2026-05-11): unpriced OEM subsystems (PCS inverter,
  // cooling module, fire suppression, transformer …) realistically dwarf
  // the line items in the priced bucket — silently excluding them from
  // top-cost-drivers misleads the reader. Estimate from a typical-list
  // table per archetype so they appear with a "[unpriced — needs quote]"
  // label and a plausible figure derived from vendor catalog typicals.
  // The figures here are conservative midpoints; they DO NOT change
  // bomTotal / finalUnitCost — they only enrich the top-driver list.
  const TYPICAL_OEM_LIST_GBP: Record<string, number> = {
    'power_converter': 95000,
    'lfp_prismatic_cell': 60,        // per cell — qty multiplied below
    'liquid_cooling_system': 35000,
    'transformer': 22000,
    'fire_suppression_system': 18000,
    'pressure_vessel': 18000,
    'ems_controller': 18000,
    'switchboard_enclosure': 3500,
    'steel_door': 1200,
    'compressor_unit': 1100,
  }
  const unpricedWithEstimate = unpricedLeaves
    .map(l => {
      const typical = TYPICAL_OEM_LIST_GBP[l.archetypeId]
      if (typeof typical !== 'number') return null
      const lineTotal = typical * l.qty
      return {
        archetypeId: l.archetypeId,
        label: l.label,
        qty: l.qty,
        lineTotal,
        verificationGrade: l.verificationGrade,
        source: l.source,
      }
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)

  // Build the combined ranking — priced items use real lineTotal, unpriced
  // items use the typical estimate. The label is suffixed with
  // "[unpriced — needs quote]" so the reader can tell.
  const combinedDrivers = [
    ...pricedLeaves.map(l => ({ ...l, isUnpricedEstimate: false })),
    ...unpricedWithEstimate.map(l => ({ ...l, isUnpricedEstimate: true })),
  ]
  const sortedDrivers = combinedDrivers.sort((a, b) => b.lineTotal - a.lineTotal)
  const top5 = sortedDrivers.slice(0, 5)

  const topDrivers: CostSummary['topDrivers'] = top5.map(leaf => ({
    partName: leaf.isUnpricedEstimate
      ? `${leaf.label} [unpriced — needs quote]`
      : leaf.label,
    pct: paragraph.bomTotal > 0 ? (leaf.lineTotal / paragraph.bomTotal) * 100 : 0,
    totalGbp: leaf.lineTotal,
    costSource: leaf.isUnpricedEstimate ? 'unpriced_typical' : leaf.verificationGrade,
  }))

  // ── Step 4: Compute CostSummary-compatible fields ──────────────────────────

  // finalUnitCost = bomTotal (markups already baked in via the rollup)
  // We do NOT apply an additional overheadMultiplier — the markups ARE the overhead.
  const finalUnitCost = paragraph.bomTotal

  // assemblyCost = sum of all markups applied at each level
  // = bomTotal − raw parts total (the unmarkup'd leaf line total sum)
  const rawPartsCostTotal = allLeaves.reduce((sum, l) => sum + l.lineTotal, 0)
  const assemblyCost = finalUnitCost - rawPartsCostTotal

  // overheadMultiplier: derived as finalUnitCost / rawPartsCostTotal
  // (blended effective multiplier from all three markup levels)
  const overheadMultiplier = rawPartsCostTotal > 0
    ? finalUnitCost / rawPartsCostTotal
    : 1.0

  // NRE not computed at this phase — set to 0 (Phase 5 renderer can extend this)
  const nreTotal = 0

  const varianceVsCeiling = ceilingCost !== null ? ceilingCost - finalUnitCost : null
  const isOverBudget = ceilingCost !== null ? finalUnitCost > ceilingCost : false
  const overBudgetPct = isOverBudget && ceilingCost !== null
    ? ((finalUnitCost - ceilingCost) / ceilingCost) * 100
    : null

  // Cost split by grade
  const buyDistributorGbp = pricedLeaves
    .filter(l => l.verificationGrade === 'verified')
    .reduce((sum, l) => sum + l.lineTotal, 0)
  const buyEstimatedGbp = pricedLeaves
    // Bug P1-8 fix (2026-05-11): include the new grade_c (vendor-catalog
    // resolved with manufacturer + lead time) alongside grade_d/estimated
    // in the buy-estimated bucket — neither is distributor-verified.
    .filter(l =>
      l.verificationGrade === 'estimated'
      || l.verificationGrade === 'grade_c'
      || l.verificationGrade === 'grade_d'
    )
    .reduce((sum, l) => sum + l.lineTotal, 0)
  const makeEstimatedGbp = pricedLeaves
    .filter(l => l.verificationGrade === 'stub')
    .reduce((sum, l) => sum + l.lineTotal, 0)
  const quotedCostFraction = rawPartsCostTotal > 0 ? buyDistributorGbp / rawPartsCostTotal : 0

  // ── Step 5: Logging ─────────────────────────────────────────────────────────

  console.log(
    `[Phase3/cost-rollup] BoM total (with markups): £${finalUnitCost.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  )
  console.log(
    `[Phase3/cost-rollup] Raw parts total: £${rawPartsCostTotal.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}, ` +
    `Assembly/overhead: £${assemblyCost.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}, ` +
    `Effective multiplier: ×${overheadMultiplier.toFixed(3)}`
  )
  console.log(`[Phase3/cost-rollup] Priced leaves: ${pricedLeaves.length}, Unpriced: ${unpricedLeaves.length}`)
  console.log(
    `[Phase3/cost-rollup] Top driver: "${topDrivers[0]?.partName}" — ` +
    `£${topDrivers[0]?.totalGbp?.toLocaleString('en-GB', { maximumFractionDigits: 0 }) ?? '0'} ` +
    `(${topDrivers[0]?.pct?.toFixed(1) ?? '0'}% of BoM total)`
  )

  if (ceilingCost !== null) {
    console.log(
      `[Phase3/cost-rollup] vs ceiling £${ceilingCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}: ` +
      `${isOverBudget ? `OVER by ${overBudgetPct?.toFixed(1)}%` : `within budget (variance: £${varianceVsCeiling?.toLocaleString('en-GB', { maximumFractionDigits: 0 })})`}`
    )
  }

  return {
    // ── CostSummary fields ──
    bomTotal: finalUnitCost,           // bomTotal in CostSummary = fully-loaded radical BoM total
    assemblyCost,
    finalUnitCost,
    overheadMultiplier,
    nreTotal,
    ceilingCost,
    varianceVsCeiling,
    isOverBudget,
    byModule,
    topDrivers,
    buyDistributorGbp,
    buyEstimatedGbp,
    makeEstimatedGbp,
    quotedCostFraction,
    overBudgetPct,

    // ── Radical-specific extensions ──
    radicalHierarchy: paragraph,
    radicalMeta: {
      computed_at: new Date().toISOString(),
      character_markup_pct: CHARACTER_ASSEMBLY_MARKUP * 100,
      word_markup_pct: WORD_ASSEMBLY_MARKUP * 100,
      sentence_markup_pct: SENTENCE_ASSEMBLY_MARKUP * 100,
      total_leaves: allLeaves.length,
      priced_leaves: pricedLeaves.length,
      unpriced_leaves: unpricedLeaves.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Shadow-mode diff logger
// ---------------------------------------------------------------------------

/**
 * Log the diff between radicalCostSummary and the existing costSummary.
 * Called by the pipeline when both are present, for migration shadow comparison.
 *
 * @param radicalSummary   Phase 3 output
 * @param legacySummary    Existing Stage 4 costSummary
 */
export function logCostSummaryDiff(
  radicalSummary: RadicalCostSummary,
  legacySummary: CostSummary,
): void {
  const rTotal = radicalSummary.finalUnitCost
  const lTotal = legacySummary.finalUnitCost
  const diffGbp = rTotal - lTotal
  const diffPct = lTotal > 0 ? (diffGbp / lTotal) * 100 : 0

  console.log('\n[Phase3/shadow-diff] ─── Cost Summary Diff ────────────────────────────')
  console.log(`[Phase3/shadow-diff] Radical (Phase 3): £${rTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
  console.log(`[Phase3/shadow-diff] Legacy (Stage 4):  £${lTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
  console.log(`[Phase3/shadow-diff] Diff: £${Math.abs(diffGbp).toLocaleString('en-GB', { maximumFractionDigits: 0 })} (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%)`)

  // Raw BoM comparison (before overhead)
  const rRaw = radicalSummary.bomTotal - radicalSummary.assemblyCost
  const lRaw = legacySummary.bomTotal
  const rawDiffPct = lRaw > 0 ? ((rRaw - lRaw) / lRaw) * 100 : 0
  console.log(
    `[Phase3/shadow-diff] Raw parts: Radical £${rRaw.toLocaleString('en-GB', { maximumFractionDigits: 0 })} vs Legacy £${lRaw.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ` +
    `(${rawDiffPct >= 0 ? '+' : ''}${rawDiffPct.toFixed(2)}%)`
  )

  // Top driver alignment
  const rTop = radicalSummary.topDrivers[0]
  const lTop = legacySummary.topDrivers[0]
  if (rTop && lTop) {
    const topMatch = rTop.partName.toLowerCase().includes(lTop.partName.toLowerCase().split(' ')[0])
    console.log(
      `[Phase3/shadow-diff] Top driver: Radical "${rTop.partName}" vs Legacy "${lTop.partName}" — ` +
      `${topMatch ? 'ALIGNED' : 'DIVERGED'}`
    )
  }

  console.log('[Phase3/shadow-diff] ────────────────────────────────────────────────────\n')
}
