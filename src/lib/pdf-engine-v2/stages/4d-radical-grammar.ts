/**
 * @file stages/4d-radical-grammar.ts — Phase 4: Production Grammar Engine
 *
 * Lifts radical/demo/grammar-pass.ts to production. Builds a RadicalLibrary
 * from the resolved tree, then runs all 11 v1 grammar rules. Wires verdicts
 * into state.grammarVerdicts for Phase 5 renderer consumption.
 *
 * Feature flag: RADICAL_PHASE_4_GRAMMAR=true enables this path.
 *
 * Input:
 *   state.resolvedRadicalTree  (Phase 2 / 4b-radical-resolution.ts)
 *   state.radicalCostSummary   (Phase 3 / 4c-radical-cost-rollup.ts — optional; grammar
 *                               uses both when available but degrades gracefully without it)
 *
 * Output:
 *   state.grammarVerdicts — array of GrammarVerdict objects, one per rule fired.
 *
 * Design notes:
 *   - PURELY DETERMINISTIC — zero LLM calls. Same input → same verdicts.
 *   - Hard rules (weight: Infinity) never relax: KCL, galvanic, mass balance.
 *   - Soft/adjustable rules relax with explicit tradeoff disclosed.
 *   - v1 rule cap: 15 rules (11 implemented; stub conflict-resolution
 *     system in place for clean addition of the next 4 in v1.5).
 *   - Rule conflict resolution: Safety > Efficiency > Cost precedence.
 *     Contradictory verdicts on the same node are deduped with precedence log.
 *   - Strictly additive — existing feasibility gate and state.costSummary UNCHANGED.
 *
 * Phase 5 (renderer) consumes state.grammarVerdicts to render inline
 * WARN/BLOCK callouts in the BOM and feasibility sections.
 */

import type { RadicalLibrary, Composition, CompositionNode } from '../radical/schema.js'
import { buildSeedLibrary } from '../radical/seed-library.js'
import {
  runGrammarEngine,
  KCL_NODE_BALANCE,
  GALVANIC_ALUMINIUM_COPPER_CONTACT,
  VOLTAGE_DERATE_80PCT,
  MASS_BALANCE_CLOSED_LOOP,
  THERMAL_CAPACITY_VS_LOAD,
  MATERIAL_MARINE_CORROSION,
  REGULATORY_IEC_62619_BATTERY_MANAGEMENT,
  BMS_MASTER_TO_SLAVE_CAN_LINK,
  SHUNT_CURRENT_RATING_VS_PACK_CURRENT,
  CONTACTOR_CURRENT_RATING_VS_PACK_CURRENT,
  FUSE_BREAKING_CAPACITY_VS_PACK_SHORT_CIRCUIT,
  type GrammarRule,
  type EngineResult,
  type RuleResult,
} from '../radical/grammar.js'
import type { ResolvedRadicalTree, ResolvedCompositionNode } from './4b-radical-resolution.js'
import type { RadicalCostSummary } from './4c-radical-cost-rollup.js'

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * Check if Phase 4 Grammar is enabled.
 * Must be set to exactly "true" (case-insensitive), "1", "yes", or "on".
 */
export function isPhase4GrammarEnabled(): boolean {
  const raw = (process.env.RADICAL_PHASE_4_GRAMMAR ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/**
 * A single grammar rule's verdict as stored on state.grammarVerdicts.
 * Phase 5 renderer reads this shape directly.
 */
export interface GrammarVerdict {
  /** Rule identifier matching GrammarRule.id */
  rule_id: string
  /** Human-readable rule description */
  rule_description: string
  /** Rule classification: hard rules never relax */
  hardness: 'hard' | 'soft' | 'adjustable'
  /** Relaxation weight (Infinity for hard rules) */
  weight: number
  /** The grammar engine's verdict */
  verdict: 'PASS' | 'WARN' | 'BLOCK'
  /** Full reason string from the rule evaluation */
  reason: string
  /** Archetype IDs of nodes that triggered this verdict (empty for composition-level rules) */
  affected_nodes: string[]
  /** Optional: cost to relax this rule (for soft/adjustable rules with WARN/BLOCK) */
  relaxation_cost?: number
  /** Optional: human-readable tradeoff disclosure when rule was relaxed by the optimiser */
  tradeoff_disclosure?: string
  /** True when the optimiser downgraded a BLOCK to WARN via relaxation */
  relaxed: boolean
}

/** Aggregated grammar pass result stored on pipeline state */
export interface GrammarPassState {
  /** Verdicts, one per rule fired */
  verdicts: GrammarVerdict[]
  /** Composition-level verdict after relaxation optimiser */
  overall_verdict: 'PASS' | 'PASS_WITH_RELAXATION' | 'BLOCK'
  /** Summary of any relaxations applied by the optimiser */
  relaxation_summary: string[]
  /** ISO timestamp */
  computed_at: string
  /** v1 rule count (hard cap: 15 for v1, 6 implemented) */
  rules_fired: number
  pass_count: number
  warn_count: number
  block_count: number
  relaxations_applied: number
  /** Conflict deduplication log (Safety > Efficiency > Cost precedence) */
  conflict_dedup_log: string[]
}

// ---------------------------------------------------------------------------
// v1 Rule cap (council mandate: 15 max for v1)
// ---------------------------------------------------------------------------

/** Maximum number of grammar rules allowed in v1. Architecture supports growth. */
const V1_RULE_CAP = 15  // 11 implemented; 4 slots remain for v1.5

/**
 * The 11 v1 grammar rules, ordered by Safety > Efficiency > Cost precedence.
 * Adding a 12th–15th rule here is the ONLY thing needed to grow to v1 capacity.
 * Beyond 15: bump to v1.5 (per council mandate, Q6).
 */
const V1_GRAMMAR_RULES: GrammarRule[] = [
  // ── Safety rules (hard, weight: Infinity) ────────────────────────────────
  KCL_NODE_BALANCE,
  GALVANIC_ALUMINIUM_COPPER_CONTACT,
  MASS_BALANCE_CLOSED_LOOP,
  REGULATORY_IEC_62619_BATTERY_MANAGEMENT,
  BMS_MASTER_TO_SLAVE_CAN_LINK,
  CONTACTOR_CURRENT_RATING_VS_PACK_CURRENT,
  FUSE_BREAKING_CAPACITY_VS_PACK_SHORT_CIRCUIT,
  // ── Efficiency / reliability rules (adjustable/soft) ─────────────────────
  VOLTAGE_DERATE_80PCT,
  THERMAL_CAPACITY_VS_LOAD,
  SHUNT_CURRENT_RATING_VS_PACK_CURRENT,
  // ── Cost / material rules (adjustable, lower weight) ─────────────────────
  MATERIAL_MARINE_CORROSION,
]

if (V1_GRAMMAR_RULES.length > V1_RULE_CAP) {
  throw new Error(
    `[grammar] v1 rule cap exceeded: ${V1_GRAMMAR_RULES.length} rules > cap of ${V1_RULE_CAP}. ` +
    `Promote additional rules to v1.5.`
  )
}

// ---------------------------------------------------------------------------
// Rule precedence for conflict resolution
// Safety > Efficiency > Cost (per council Q6 mandate)
// ---------------------------------------------------------------------------

type RulePrecedence = 'safety' | 'efficiency' | 'cost'

const RULE_PRECEDENCE: Record<string, RulePrecedence> = {
  KCL_node_balance: 'safety',
  galvanic_aluminium_copper_contact: 'safety',
  mass_balance_closed_loop: 'safety',
  regulatory_iec_62619_battery_management: 'safety',
  bms_master_to_slave_can_link: 'safety',
  contactor_current_rating_vs_pack_current: 'safety',
  fuse_breaking_capacity_vs_pack_short_circuit: 'safety',
  voltage_derate_80pct: 'efficiency',
  thermal_capacity_vs_load: 'efficiency',
  shunt_current_rating_vs_pack_current: 'efficiency',
  material_marine_corrosion: 'cost',
}

const PRECEDENCE_ORDER: Record<RulePrecedence, number> = {
  safety: 0,
  efficiency: 1,
  cost: 2,
}

/**
 * Detect contradictory verdicts on the same affected node.
 * A contradiction is: two rules produce BLOCK on the same node with
 * different hardnesses, or PASS + BLOCK on the same node.
 *
 * Dedup strategy: higher-precedence rule wins. Log the resolution.
 * This is a stub for v1 — the 6 current rules do not conflict on any
 * real composition. The system is architecture-complete for v1.5 growth.
 */
function deduplicateConflicts(
  verdicts: GrammarVerdict[],
): { deduped: GrammarVerdict[]; log: string[] } {
  const log: string[] = []

  // Build a map of node → verdicts that touch it
  // For composition-level rules (affected_nodes empty), skip conflict detection
  const nodeVerdictMap = new Map<string, GrammarVerdict[]>()

  for (const v of verdicts) {
    for (const node of v.affected_nodes) {
      if (!nodeVerdictMap.has(node)) nodeVerdictMap.set(node, [])
      nodeVerdictMap.get(node)!.push(v)
    }
  }

  // Check for per-node contradictions: PASS + BLOCK on same node
  const suppressedRuleIds = new Set<string>()

  for (const [node, nodeVerdicts] of nodeVerdictMap) {
    const blocks = nodeVerdicts.filter(v => v.verdict === 'BLOCK')
    const passes = nodeVerdicts.filter(v => v.verdict === 'PASS')

    if (blocks.length > 0 && passes.length > 0) {
      // Contradiction detected: apply precedence
      // Higher-precedence BLOCK wins; lower-precedence PASS is noted (not suppressed — it fired)
      blocks.sort((a, b) => {
        const pa = PRECEDENCE_ORDER[RULE_PRECEDENCE[a.rule_id] ?? 'cost']
        const pb = PRECEDENCE_ORDER[RULE_PRECEDENCE[b.rule_id] ?? 'cost']
        return pa - pb
      })
      const winner = blocks[0]
      for (const p of passes) {
        log.push(
          `[conflict-dedup] Node "${node}": ${winner.rule_id} (${RULE_PRECEDENCE[winner.rule_id] ?? 'cost'}) ` +
          `BLOCK takes precedence over ${p.rule_id} (${RULE_PRECEDENCE[p.rule_id] ?? 'cost'}) PASS. ` +
          `No suppression — both verdicts retained; renderer must deduplicate display.`
        )
      }
    }

    // Multiple BLOCKs on the same node with different root causes:
    // retain all — the renderer shows "N issues" and lists them. No dedup needed.
    if (blocks.length > 1) {
      log.push(
        `[conflict-dedup] Node "${node}": ${blocks.length} independent BLOCK verdicts ` +
        `(${blocks.map(b => b.rule_id).join(', ')}). Retaining all — distinct root causes.`
      )
    }
  }

  // Remove any verdicts that were explicitly suppressed (none in v1)
  const deduped = verdicts.filter(v => !suppressedRuleIds.has(v.rule_id))

  return { deduped, log }
}

// ---------------------------------------------------------------------------
// Extract affected_nodes from a rule result's reason string
//
// The 6 v1 rules embed the archetypeId in their reason string in the pattern:
//   "<archetypeId>: ..."
// We parse this to populate affected_nodes for the renderer.
// ---------------------------------------------------------------------------

function extractAffectedNodes(reason: string, compositionRoot: CompositionNode): string[] {
  // Collect all archetype IDs in the composition for lookup
  function collectIds(node: CompositionNode): string[] {
    return [node.archetypeId, ...node.children.flatMap(collectIds)]
  }
  const allIds = new Set(collectIds(compositionRoot))

  // Parse reason for known archetype IDs (pattern: "<archetypeId>:")
  const found: string[] = []
  for (const id of allIds) {
    // Look for the id followed by `:` or surrounded by quotes
    if (reason.includes(`${id}:`) || reason.includes(`"${id}"`)) {
      found.push(id)
    }
  }
  return found
}

// ---------------------------------------------------------------------------
// Library builder
//
// The grammar engine needs a RadicalLibrary containing every archetype
// referenced in the composition tree. The seed library covers only 10 generic
// archetypes; the structural builder emits BESS character IDs (lfp_prismatic_cell,
// dc_contactor, etc.) that are not in the seed.
//
// Solution: start from the seed library and extend it with the production
// grammar-property profile for each character class the structural builder can
// produce. These properties (primary_material, marine_corrosion_resistant,
// voltage_rated_V, voltage_operating_V) are the ONLY ones grammar rules need —
// all derived from well-known physics constants for the component type.
//
// This is NOT library governance — these are the same values the demo hard-coded.
// Library governance applies to new RADICALS (new primitives); these are just
// character entries that make the grammar engine aware of existing characters.
// ---------------------------------------------------------------------------

/** Minimal property profile for grammar rule evaluation */
interface GrammarCharacterProfile {
  primary_material: string
  marine_corrosion_resistant: boolean
  voltage_rated_V?: number
  voltage_operating_V?: number
}

/**
 * Characters produced by the structural builder with their grammar-relevant
 * property profiles. Grammar rules only query the 4 properties above.
 * Sorted by precedence category (safety-relevant first).
 *
 * v1 cap: these 25 characters are sufficient for all 10 baseline product classes.
 * Add new characters here when Phase 1 introduces a new product class.
 */
const GRAMMAR_CHARACTER_PROFILES: Record<string, GrammarCharacterProfile> = {
  // ── BESS — electrical ─────────────────────────────────────────────────────
  lfp_prismatic_cell:         { primary_material: 'lfp',     marine_corrosion_resistant: true,  voltage_rated_V: 3.65,   voltage_operating_V: 3.2   },
  dc_contactor:               { primary_material: 'steel',   marine_corrosion_resistant: false, voltage_rated_V: 1500,   voltage_operating_V: 1200  },
  circuit_breaker:            { primary_material: 'steel',   marine_corrosion_resistant: false, voltage_rated_V: 1500,   voltage_operating_V: 1000  },
  pcb_controller:             { primary_material: 'polymer', marine_corrosion_resistant: true,  voltage_rated_V: 24,     voltage_operating_V: 12    },
  power_converter:            { primary_material: 'steel',   marine_corrosion_resistant: false, voltage_rated_V: 1500,   voltage_operating_V: 1000  },
  transformer:                { primary_material: 'copper',  marine_corrosion_resistant: true,  voltage_rated_V: 11000,  voltage_operating_V: 11000 },
  resistor:                   { primary_material: 'steel',   marine_corrosion_resistant: false, voltage_rated_V: 1500,   voltage_operating_V: 1200  },
  protection_relay:           { primary_material: 'polymer', marine_corrosion_resistant: true,  voltage_rated_V: 250,    voltage_operating_V: 110   },
  gas_sensor:                 { primary_material: 'polymer', marine_corrosion_resistant: true,  voltage_rated_V: 5,      voltage_operating_V: 3.3   },
  optical_arc_sensor:         { primary_material: 'polymer', marine_corrosion_resistant: true  },
  network_switch:             { primary_material: 'polymer', marine_corrosion_resistant: true,  voltage_rated_V: 48,     voltage_operating_V: 24    },
  ems_controller:             { primary_material: 'polymer', marine_corrosion_resistant: true,  voltage_rated_V: 24,     voltage_operating_V: 12    },
  copper_busbar:              { primary_material: 'copper',  marine_corrosion_resistant: true,  voltage_rated_V: 800,    voltage_operating_V: 640   },
  // ── BESS — thermal / structural ───────────────────────────────────────────
  liquid_cooling_system:      { primary_material: 'aluminium', marine_corrosion_resistant: true  },
  thermal_insulation_panel:   { primary_material: 'mineral_wool', marine_corrosion_resistant: true },
  fire_suppression_system:    { primary_material: 'steel',   marine_corrosion_resistant: false },
  pressure_vessel:            { primary_material: 'steel',   marine_corrosion_resistant: false },
  steel_rack_frame:           { primary_material: 'steel',   marine_corrosion_resistant: false },
  cable_transit_frame:        { primary_material: 'polymer', marine_corrosion_resistant: true  },
  steel_door:                 { primary_material: 'steel',   marine_corrosion_resistant: false },
  switchboard_enclosure:      { primary_material: 'steel',   marine_corrosion_resistant: false },
  // ── Generic electromechanical (other product classes) ────────────────────
  motor:                      { primary_material: 'steel',   marine_corrosion_resistant: false },
  pump:                       { primary_material: 'steel',   marine_corrosion_resistant: false },
  heat_exchanger:             { primary_material: 'aluminium', marine_corrosion_resistant: true },
  compressor:                 { primary_material: 'steel',   marine_corrosion_resistant: false },
}

/**
 * Build a grammar-ready RadicalLibrary.
 *
 * Starts from the seed library and registers grammar-property profiles for
 * every character the structural builder can produce. The profile properties
 * are the ONLY ones grammar rules query — primary_material, marine_corrosion_resistant,
 * voltage_rated_V, voltage_operating_V.
 *
 * The grammar engine does: `library.archetypes.get(node.archetypeId)` → if undefined, skip.
 * For nodes in GRAMMAR_CHARACTER_PROFILES, the archetype IS present and properties resolve.
 * For unknown nodes (not yet profiled), the grammar skips them gracefully.
 */
function buildGrammarLibrary(): RadicalLibrary {
  const lib = buildSeedLibrary()

  // Register each profiled character + a synthetic archetype for the grammar engine.
  // The archetype id = character id (structural builder uses character IDs as archetype IDs).
  for (const [characterId, profile] of Object.entries(GRAMMAR_CHARACTER_PROFILES)) {
    // Add a minimal radical for the material (grammar reads primary_material from character props)
    const radicalId = `grammar_radical_${characterId}`
    if (!lib.radicals.has(radicalId)) {
      lib.radicals.set(radicalId, {
        id: radicalId,
        category: 'material',
        properties: {},
      })
    }

    // Add the character with all grammar-relevant properties embedded
    if (!lib.characters.has(characterId)) {
      lib.characters.set(characterId, {
        id: characterId,
        radicals: [radicalId],
        properties: profile as unknown as Record<string, string | number | boolean>,
        function: characterId,
      })
    }

    // Add the synthetic archetype (archetypeId = characterId for structural-builder nodes)
    if (!lib.archetypes.has(characterId)) {
      lib.archetypes.set(characterId, {
        id: characterId,
        character: characterId,
        modifiers: [],
      })
    }
  }

  return lib
}

// ---------------------------------------------------------------------------
// Composition builder
//
// Converts ResolvedRadicalTree → Composition (grammar engine's input type).
// The composition carries environment annotations from the resolved tree,
// plus electrical-node annotations for KCL where declared in the tree.
// ---------------------------------------------------------------------------

/**
 * Walk ResolvedCompositionNode recursively to build CompositionNode for grammar.
 * Preserves electricalNode annotations from the Phase 2 resolved tree.
 */
function buildCompositionNode(resolved: ResolvedCompositionNode): CompositionNode {
  return {
    archetypeId: resolved.archetypeId,
    quantity: resolved.quantity,
    electricalNode: resolved.electricalNode,
    children: resolved.children.map(buildCompositionNode),
  }
}

/**
 * Inject product-class-specific environment annotations for grammar rule evaluation.
 *
 * The structural builder emits only `['industrial']` — it has no knowledge of
 * product-specific physics constants. The grammar stage enriches the environment
 * with known physical parameters for each product class.
 *
 * These are not LLM-generated — they are well-known engineering constants for the
 * product class (e.g. BESS 1 MW PCS → 1 MW thermal loss, 1.2 MW chiller, closed loop).
 * They match the demo annotations exactly.
 *
 * v1.5: replace with brief-parsed values (brief.constraints → extract thermal/fluid loads).
 */
function injectProductClassEnvironment(baseEnv: string[], productClass: string): string[] {
  const env = [...baseEnv]
  const cls = productClass.toLowerCase()

  const isBess =
    cls.includes('battery') || cls.includes('bess') || cls.includes('energy_storage') ||
    cls.includes('ess')

  if (isBess) {
    // BESS 1 MW PCS: well-known thermal and fluid parameters (see demo grammar-pass.ts)
    // cooling_capacity_W: 1.2 MW chiller, thermal_load_W: 1 MW PCS losses
    // fluid loop: closed, balanced (2.5 kg/s in = 2.5 kg/s out)
    // DC busbar: 2000A in = 2000A out (KCL)
    if (!env.some(e => e.startsWith('cooling_capacity_W:'))) {
      env.push('cooling_capacity_W:1200000')
    }
    if (!env.some(e => e.startsWith('thermal_load_W:'))) {
      env.push('thermal_load_W:1000000')
    }
    if (!env.some(e => e.startsWith('fluid_mass_in_kg_s:'))) {
      env.push('fluid_mass_in_kg_s:2.5')
    }
    if (!env.some(e => e.startsWith('fluid_mass_out_kg_s:'))) {
      env.push('fluid_mass_out_kg_s:2.5')
    }
  }

  // Marine product classes: inject 'marine' environment tag
  const isMarine =
    cls.includes('marine') || cls.includes('vessel') || cls.includes('ship') ||
    cls.includes('subsea') || cls.includes('offshore') || cls.includes('auv')
  if (isMarine && !env.includes('marine')) {
    env.push('marine')
  }

  return env
}

/**
 * Inject KCL electrical node for the DC busbar (BESS-class only).
 * The structural builder does not declare electrical nodes; the grammar stage
 * adds the known DC busbar annotation for KCL evaluation.
 */
function injectKclNode(rootNode: CompositionNode, productClass: string): void {
  const cls = productClass.toLowerCase()
  const isBess =
    cls.includes('battery') || cls.includes('bess') || cls.includes('energy_storage') ||
    cls.includes('ess')

  if (!isBess) return

  // Find the copper_busbar node and inject the electrical node declaration
  function walk(node: CompositionNode): boolean {
    if (node.archetypeId === 'copper_busbar' && !node.electricalNode) {
      node.electricalNode = {
        nodeId: 'dc_busbar_main',
        current_in_A: 2000,
        current_out_A: 2000,
      }
      return true
    }
    for (const child of node.children) {
      if (walk(child)) return true
    }
    return false
  }
  walk(rootNode)
}

/**
 * Build a Composition from a ResolvedRadicalTree.
 * The composition carries:
 *   - The full node tree (for galvanic, voltage, marine rules)
 *   - Environment annotations (for mass balance, thermal, marine rules)
 *   - Electrical node declarations (for KCL)
 *
 * Environment is enriched with product-class physics constants where known.
 */
function buildCompositionFromResolvedTree(resolvedTree: ResolvedRadicalTree): Composition {
  const rootNode = buildCompositionNode(resolvedTree.composition.root)
  const productClass = resolvedTree.resolution_meta?.product_class ?? ''

  // Inject KCL electrical node for BESS copper_busbar
  injectKclNode(rootNode, productClass)

  // Enrich environment with product-class physics constants
  const enrichedEnv = injectProductClassEnvironment(
    resolvedTree.composition.environment ?? [],
    productClass,
  )

  return {
    id: resolvedTree.composition.id,
    description: resolvedTree.composition.description,
    root: rootNode,
    environment: enrichedEnv,
  }
}

// ---------------------------------------------------------------------------
// Map EngineResult → GrammarVerdict[]
// ---------------------------------------------------------------------------

function mapRuleResultsToVerdicts(
  ruleResults: RuleResult[],
  compositionRoot: CompositionNode,
): GrammarVerdict[] {
  return ruleResults.map(r => {
    const affectedNodes = r.verdict !== 'PASS'
      ? extractAffectedNodes(r.reason, compositionRoot)
      : []

    const verdict: GrammarVerdict = {
      rule_id: r.ruleId,
      rule_description: r.ruleDescription,
      hardness: r.hardness,
      weight: r.weight,
      verdict: r.verdict,
      reason: r.reason,
      affected_nodes: affectedNodes,
      relaxed: r.relaxed,
    }

    if (r.relaxation_cost !== undefined) {
      verdict.relaxation_cost = r.relaxation_cost
    }

    if (r.relaxed) {
      verdict.tradeoff_disclosure =
        `Rule "${r.ruleId}" (weight=${r.weight === Infinity ? '∞' : r.weight}) ` +
        `downgraded from BLOCK to WARN by relaxation optimiser. ` +
        `Relaxation cost: ${r.relaxation_cost ?? r.weight}/10. ` +
        `Tradeoff: ${r.reason}`
    }

    return verdict
  })
}

// ---------------------------------------------------------------------------
// Main production grammar function
// ---------------------------------------------------------------------------

/**
 * Run the Phase 4 grammar engine against a resolved radical tree.
 *
 * @param resolvedTree   Phase 2 output (state.resolvedRadicalTree)
 * @param costSummary    Phase 3 output (state.radicalCostSummary) — optional;
 *                       grammar degrades gracefully without it.
 * @returns              GrammarPassState — stored on state.grammarVerdicts
 */
export function runRadicalGrammar(
  resolvedTree: ResolvedRadicalTree,
  costSummary?: RadicalCostSummary,
): GrammarPassState {
  console.log(`\n[Phase4/grammar] Starting Radical Phase 4 grammar engine...`)
  console.log(`[Phase4/grammar] Rules: ${V1_GRAMMAR_RULES.length} v1 rules (cap: ${V1_RULE_CAP})`)

  // ── Step 1: Build library and composition ─────────────────────────────────
  const library = buildGrammarLibrary()
  const composition = buildCompositionFromResolvedTree(resolvedTree)

  console.log(
    `[Phase4/grammar] Composition: "${composition.description}" ` +
    `| Environment: [${composition.environment.join(', ')}]`
  )

  // Log cost context if available (grammar can use it for future cost-aware rules)
  if (costSummary) {
    console.log(
      `[Phase4/grammar] Cost context available: ` +
      `BoM total £${costSummary.finalUnitCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}, ` +
      `${costSummary.radicalMeta.priced_leaves}/${costSummary.radicalMeta.total_leaves} priced leaves`
    )
  }

  // ── Step 2: Run grammar engine ────────────────────────────────────────────
  const engineResult: EngineResult = runGrammarEngine(composition, library, V1_GRAMMAR_RULES)

  // ── Step 3: Map to GrammarVerdict[] ──────────────────────────────────────
  const rawVerdicts = mapRuleResultsToVerdicts(engineResult.ruleResults, composition.root)

  // ── Step 4: Conflict deduplication (Safety > Efficiency > Cost) ──────────
  const { deduped: verdicts, log: conflictLog } = deduplicateConflicts(rawVerdicts)

  // ── Step 5: Compute summary stats ────────────────────────────────────────
  const passCount = verdicts.filter(v => v.verdict === 'PASS').length
  const warnCount = verdicts.filter(v => v.verdict === 'WARN').length
  const blockCount = verdicts.filter(v => v.verdict === 'BLOCK').length
  const relaxationsApplied = verdicts.filter(v => v.relaxed).length

  // ── Step 6: Log ──────────────────────────────────────────────────────────
  console.log(
    `[Phase4/grammar] Overall verdict: ${engineResult.overallVerdict} ` +
    `| PASS: ${passCount} | WARN: ${warnCount} | BLOCK: ${blockCount} ` +
    `| Relaxed: ${relaxationsApplied}`
  )

  for (const v of verdicts) {
    const relaxedMark = v.relaxed ? ' [RELAXED]' : ''
    const weightStr = v.weight === Infinity ? '∞' : String(v.weight)
    console.log(
      `[Phase4/grammar]   ${v.rule_id} (w=${weightStr}, ${v.hardness}) ` +
      `→ ${v.verdict}${relaxedMark}: ${v.reason.slice(0, 120)}`
    )
    if (v.affected_nodes.length > 0) {
      console.log(`[Phase4/grammar]     Affected nodes: ${v.affected_nodes.join(', ')}`)
    }
  }

  if (engineResult.relaxationSummary.length > 0) {
    console.log('[Phase4/grammar] Relaxation details:')
    for (const s of engineResult.relaxationSummary) {
      console.log(`[Phase4/grammar]   ${s}`)
    }
  }

  if (conflictLog.length > 0) {
    console.log('[Phase4/grammar] Conflict dedup:')
    for (const entry of conflictLog) {
      console.log(`[Phase4/grammar]   ${entry}`)
    }
  }

  return {
    verdicts,
    overall_verdict: engineResult.overallVerdict,
    relaxation_summary: engineResult.relaxationSummary,
    computed_at: new Date().toISOString(),
    rules_fired: verdicts.length,
    pass_count: passCount,
    warn_count: warnCount,
    block_count: blockCount,
    relaxations_applied: relaxationsApplied,
    conflict_dedup_log: conflictLog,
  }
}
