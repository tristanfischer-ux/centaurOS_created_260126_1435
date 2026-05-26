/**
 * @file lib/shared-quantity-consistency-audit.ts — Shared Quantity Consistency Audit (exit code 24)
 *
 * ARCHITECTURAL INVARIANT (2026-05-26, L38 class-killer A — universal fix):
 *
 *   Any physical quantity that spans multiple sub_modules in the same design
 *   must appear with ONE canonical value across all prose strings. Two distinct
 *   values for the same physical anchor (e.g. coolant chemistry, bus voltage,
 *   mass cap) is a physics contradiction — impossible in a real build and a
 *   signal that the emitter has diverged from the contract.
 *
 * This gate enforces the contract at the END of Phase 2: it walks every
 * modifier_character value string in every emitted word across every module,
 * collects all distinct normalised values for each known shared-quantity
 * ANCHOR (a short canonical keyword pattern), and fails with exit 24 if any
 * anchor maps to ≥2 distinct values.
 *
 * WHY EXIT CODE 24 (not a soft warning):
 *   L38 Physics Critic flagged HIGH: "water/glycol 80/20" (in
 *   environmental_interface::liquid_cooling) vs "50/50 EG/DI" (in
 *   mass_fluid_transport_process::coolant_loop) vs "EG/DI 80/20" (in the
 *   glycol_water_coolant_charge_word) — three different specifications for
 *   the same coolant loop. This is a PHYSICAL IMPOSSIBILITY and scored the
 *   eng_plausibility criterion down to 7/10 in L38. Gate 24 prevents any
 *   future recurrence across all 35 product classes.
 *
 * COVERAGE: universal — applies to ALL product classes. The anchor list
 *   (SHARED_QUANTITY_ANCHORS) is extensible; new product classes add their
 *   own anchors without changing any existing BESS logic.
 *
 * EXIT CODE 24 registered in CLAUDE.md chain exit codes table.
 *
 * Pre-change mempalace search: "shared-quantities coolant chemistry inconsistency
 *   cross-sub-module L38" → 3 drawers loaded.
 */

// ── Types (minimal — no circular import) ─────────────────────────────────────

interface ModifierChar {
  kind?: string
  value?: string
  unit?: string
}

interface WordLike {
  id?: string
  modifier_characters?: ModifierChar[]
}

interface SubModuleLike {
  id?: string
  words?: WordLike[]
}

interface DesignModuleLike {
  module?: string
  sub_modules?: SubModuleLike[]
}

// ── Anchor definitions ────────────────────────────────────────────────────────

/**
 * A SharedQuantityAnchor defines a physical quantity that should appear with
 * ONE canonical value across ALL sub_modules that mention it.
 *
 * `pattern`   — RegExp that matches the VALUE string of any modifier that
 *               mentions this quantity. The captured group(s) become the
 *               "normalised value" for comparison.
 * `normalize` — Optional transform applied to each match result to collapse
 *               trivially-different spellings (e.g. whitespace, case).
 * `label`     — Human-readable name for error messages.
 * `class_scope` — Optional: restrict check to these product_class prefixes.
 *                 Undefined = all classes.
 */
export interface SharedQuantityAnchor {
  id: string
  label: string
  /** Matches within a modifier value string. */
  pattern: RegExp
  /** Optional normaliser applied to each raw match string. */
  normalize?: (raw: string) => string
  /** If set, only applies to classes matching one of these prefixes. */
  class_scope?: string[]
}

/**
 * Registry of shared-quantity anchors.
 *
 * ADDING A NEW ANCHOR: add a new entry to this array. No other code changes
 * required. The gate walks the entire design tree and checks every value
 * string against every pattern.
 *
 * Naming convention: `sqanchor_<domain>_<property>`.
 */
export const SHARED_QUANTITY_ANCHORS: SharedQuantityAnchor[] = [
  // ── Coolant chemistry (BESS / thermal-management product classes) ────────
  {
    id: 'sqanchor_coolant_glycol_ratio',
    label: 'coolant glycol/water mix ratio',
    // Matches patterns like: "50/50", "80/20", "30/70", "60/40"
    // within any string that also mentions glycol, EG/DI, MPG/DI, coolant, etc.
    // Strategy: extract the XX/YY ratio from strings containing a glycol keyword.
    // NOTE: EG and PG are NOT included bare (too short — matches "Megapack", "JPG",
    // "EPCOS", etc.) — use EG/DI, MPG/DI, EG:, PG: forms only to avoid false positives.
    pattern: /(\d{1,3}\/\d{1,3}).*(?:glycol|EG\/DI|MPG\/DI|coolant|antifreeze)|(?:glycol|EG\/DI|MPG\/DI|coolant|antifreeze).*(\d{1,3}\/\d{1,3})/i,
    normalize: (raw: string) => {
      // Extract first XX/YY pattern; normalise to "major/minor" in ascending order
      const m = raw.match(/(\d{1,3})\/(\d{1,3})/)
      if (!m) return raw.toLowerCase().trim()
      const a = parseInt(m[1], 10)
      const b = parseInt(m[2], 10)
      return `${Math.max(a, b)}/${Math.min(a, b)}`
    },
    class_scope: ['energy_storage', 'thermal', 'battery'],
  },
  {
    id: 'sqanchor_coolant_glycol_type',
    label: 'coolant glycol type (ethylene vs propylene)',
    // Distinguishes EG/ethylene-glycol from PG/propylene-glycol.
    // Catches "EG/DI", "ethylene glycol", "propylene glycol", "MPG/DI", "MEG".
    // NOTE: bare "EG", "PG", "MPG", "MEG" NOT included — too short and common in
    // part numbers / product names ("Megapack", "EGO", "PG&E"). Require the
    // full chem name or the /DI form which is unambiguous.
    pattern: /\b(ethylene[\s-]glycol|propylene[\s-]glycol|MPG\/DI|PG\/DI|EG\/DI|MEG\/DI)\b/i,
    normalize: (raw: string) => {
      const lower = raw.toLowerCase()
      if (lower.includes('propylene') || lower.includes('mpg/di') || lower.includes('pg/di')) {
        return 'propylene_glycol'
      }
      if (lower.includes('ethylene') || lower.includes('eg/di') || lower.includes('meg/di')) {
        return 'ethylene_glycol'
      }
      return lower.trim()
    },
    class_scope: ['energy_storage', 'thermal', 'battery'],
  },
  // NOTE (2026-05-26): DC bus voltage was removed from shared-quantity anchors.
  // A BESS legitimately has MULTIPLE distinct DC voltages: 1500 V main string bus,
  // 1000 V component ratings, 800 V sub-bus busbars, 24 V auxiliary/control supply.
  // These are DIFFERENT bus rails — having distinct values is EXPECTED PHYSICS,
  // not a contradiction. Flagging them as inconsistent would be a false positive.
  // If a future gate is needed for "main string bus voltage consistent across
  // main-bus-only components", add a targeted anchor with class_scope restricted
  // to dc_main_contactor_word + dc_power_cable_word + pcs_inverter_word only.

]

// ── Public API ────────────────────────────────────────────────────────────────

export interface AnchorViolation {
  anchor_id: string
  anchor_label: string
  /** The ≥2 distinct normalised values found for this anchor. */
  distinct_values: string[]
  /** Where each value was found: module::sub_module::word_id. */
  occurrences: Array<{
    location: string   // "module_id::sub_module_id::word_id"
    raw_value: string  // original modifier value string
    normalised: string // after anchor.normalize()
  }>
}

export interface SharedQuantityConsistencyAuditResult {
  passed: boolean
  /** Empty when passed = true. */
  violations: AnchorViolation[]
  /** Anchors checked (may be fewer than total if class_scope filtered some). */
  anchors_checked: number
  /** Total modifier value strings scanned. */
  modifier_values_scanned: number
  /** Error message for process.exit(24) + console.error. */
  error_message: string | null
  class_name: string
}

/**
 * Run the shared-quantity consistency audit against the design's module tree.
 *
 * Scans every modifier_character value string in every word in every
 * sub_module. For each known anchor, collects all matching occurrences and
 * their normalised values. Fails (exit 24) if any anchor has ≥2 distinct
 * normalised values.
 *
 * @param modules     The design.modules array (state.moduleDecomposition or
 *                    equivalent post-emitter structure)
 * @param className   Product class string (e.g. 'energy_storage/utility_containerised')
 * @param anchors     Anchor registry — defaults to SHARED_QUANTITY_ANCHORS.
 *                    Override for testing.
 */
export function runSharedQuantityConsistencyAudit(
  modules: DesignModuleLike[],
  className: string,
  anchors: SharedQuantityAnchor[] = SHARED_QUANTITY_ANCHORS,
): SharedQuantityConsistencyAuditResult {
  const classLower = className.toLowerCase()

  // Filter anchors to those applicable to this class.
  const applicableAnchors = anchors.filter((a) => {
    if (!a.class_scope) return true
    return a.class_scope.some((scope) => classLower.includes(scope.toLowerCase()))
  })

  // Per-anchor accumulator: anchor_id → Map<normalised_value, occurrence[]>
  const anchorHits = new Map<
    string,
    Map<string, Array<{ location: string; raw_value: string; normalised: string }>>
  >()
  for (const anchor of applicableAnchors) {
    anchorHits.set(anchor.id, new Map())
  }

  let modifierValuesScanned = 0

  const safeMods = Array.isArray(modules) ? modules : []

  for (const m of safeMods) {
    const moduleId = String(m?.module ?? 'unknown_module')
    const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []

    for (const sm of subs) {
      const subModuleId = String(sm?.id ?? 'unknown_sub_module')
      const words = Array.isArray(sm?.words) ? sm.words : []

      for (const w of words) {
        const wordId = String(w?.id ?? 'unknown_word')
        const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []

        for (const mc of mods) {
          const rawValue = String(mc?.value ?? '')
          modifierValuesScanned++

          for (const anchor of applicableAnchors) {
            if (!anchor.pattern.test(rawValue)) continue

            const normalised = anchor.normalize ? anchor.normalize(rawValue) : rawValue.toLowerCase().trim()
            const location = `${moduleId}::${subModuleId}::${wordId}[${mc.kind ?? '?'}]`

            const valMap = anchorHits.get(anchor.id)!
            if (!valMap.has(normalised)) {
              valMap.set(normalised, [])
            }
            valMap.get(normalised)!.push({ location, raw_value: rawValue, normalised })
          }
        }
      }
    }
  }

  // Collect violations — anchors with ≥2 distinct normalised values.
  const violations: AnchorViolation[] = []

  for (const anchor of applicableAnchors) {
    const valMap = anchorHits.get(anchor.id)!
    if (valMap.size <= 1) continue  // 0 or 1 distinct values = PASS

    const distinctValues = Array.from(valMap.keys())
    const occurrences = Array.from(valMap.values()).flat()

    violations.push({
      anchor_id: anchor.id,
      anchor_label: anchor.label,
      distinct_values: distinctValues,
      occurrences,
    })
  }

  const passed = violations.length === 0

  let errorMessage: string | null = null
  if (!passed) {
    const lines = [
      `[Gate 24 / exit 24] Shared-quantity consistency FAIL — class: ${className}`,
      `${violations.length} anchor(s) with contradictory values:`,
    ]
    for (const v of violations) {
      lines.push(`  ANCHOR ${v.anchor_id} (${v.anchor_label}):`)
      for (const dv of v.distinct_values) {
        const locs = v.occurrences.filter((o) => o.normalised === dv).map((o) => o.location)
        lines.push(`    "${dv}" at: ${locs.join(', ')}`)
      }
    }
    lines.push('')
    lines.push('Fix: ensure all sub_module emitters read from contract.shared_quantities,')
    lines.push('not from hardcoded strings. See scripts/lib/engineering-contract.ts')
    lines.push('buildBessArchetypeContract() shared_quantities block.')
    errorMessage = lines.join('\n')
  }

  return {
    passed,
    violations,
    anchors_checked: applicableAnchors.length,
    modifier_values_scanned: modifierValuesScanned,
    error_message: errorMessage,
    class_name: className,
  }
}
