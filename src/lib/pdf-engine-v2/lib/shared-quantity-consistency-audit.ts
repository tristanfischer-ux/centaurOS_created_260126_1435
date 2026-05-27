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
  // to dc_string_contactor_word + dc_power_cable_word + pcs_inverter_word only.

]

// ── Cross-domain modifier leak detection ─────────────────────────────────────

/**
 * IrrelevantModifierRule — a rule that says a modifier PATTERN must NOT appear
 * on words belonging to a given PART CLASS family.
 *
 * `part_class_pattern`    — matches word.id (or content_character.character_id).
 *                           e.g. /electrical_|resistor|contactor|inverter|fuse/
 * `forbidden_modifier`    — matches modifier value strings that are physically
 *                           meaningless on the given part class.
 * `severity`              — 'HIGH' triggers exit 24; 'MED' is logged but does not exit.
 * `example`               — human-readable example for error messages.
 *
 * Architecture: universal table — new part classes add rows, not code.
 * L39 [LOW] finding that motivated this: PN16 (fluid pressure nominal rating)
 * appeared on a precharge_resistor (electrical wirewound part). Gate 24
 * previously had no cross-domain pattern check — IRRELEVANT_MODIFIER_PATTERNS
 * fills that gap and makes it class-universal.
 */
export interface IrrelevantModifierRule {
  id: string
  part_class_pattern: RegExp
  forbidden_modifier: RegExp
  severity: 'HIGH' | 'MED'
  example: string
  /** Optional: only apply to these product class prefixes. Undefined = all. */
  class_scope?: string[]
}

/**
 * IRRELEVANT_MODIFIER_PATTERNS — cross-domain modifier leak detector.
 *
 * Each row says: "if a word whose id matches part_class_pattern carries a
 * modifier value matching forbidden_modifier, that is a physical impossibility
 * (copy-paste error, cross-module contamination, or LLM hallucination)."
 *
 * ADDING A NEW RULE: add a new entry. The audit walks all words and checks
 * every row. No other code changes required.
 */
export const IRRELEVANT_MODIFIER_PATTERNS: IrrelevantModifierRule[] = [
  // ── Fluid pressure ratings on electrical parts ──────────────────────────
  // "PN" = Pressure Nominal (DN/PN pipe rating system per EN 1333). PN16 = 16 bar.
  // This is physically meaningless on electrical resistors, contactors, fuses,
  // inverters, sensors, cables, or any electrical component.
  // L39 [LOW]: PN16 on precharge_resistor (wirewound 1.9 kV HS100).
  {
    id: 'irrelevant_pn_on_electrical',
    part_class_pattern: /resistor|contactor|inverter|fuse|relay|breaker|cable|busbar|connector|sensor|transducer|transformer|rectifier|bms|battery|cell|module|inverter|charger|switch|circuit_breaker|arc_flash|electrical|power_distribution|energy_conversion|control_compute/i,
    forbidden_modifier: /\bPN\s*\d+\b/i,
    severity: 'HIGH',
    example: 'PN16 (pipe nominal pressure 16 bar) on a precharge_resistor — fluid pressure ratings have no meaning on electrical wirewound parts',
    class_scope: undefined,  // universal — all classes
  },
  // ── Pressure/flow unit modifiers on electrical parts ────────────────────
  // "bar", "MPa", "kPa" as standalone units are fluid-domain quantities.
  // On electrical parts they indicate a copy-paste error from a fluid module.
  // Exclusion: "mbar" acceptable on weather/environmental sensors (ambient pressure).
  // Exclusion: regulatory modifiers may cite pressure test standards — exclude kind=regulatory.
  {
    id: 'irrelevant_bar_on_electrical',
    part_class_pattern: /resistor|contactor|inverter|fuse|relay|breaker|cable|busbar|connector|bms|battery|cell|module|charger|switch|circuit_breaker|arc_flash|electrical/i,
    // Match " bar" or "bar " but NOT "mbar" (millibar for env sensors) and NOT part of a word like "busbar"
    forbidden_modifier: /(?<!\w)(?:(?:\d+(?:\.\d+)?)\s*bar\b|(?:\d+(?:\.\d+)?)\s*MPa\b|(?:\d+(?:\.\d+)?)\s*kPa\b)/i,
    severity: 'HIGH',
    example: '16 bar pressure rating on a DC contactor — bar/MPa/kPa are fluid-domain pressure units with no meaning on electrical switchgear',
    class_scope: undefined,
  },
  // ── Fluid flow units on electrical parts ────────────────────────────────
  // gpm, lpm, L/min, m³/h are fluid transport quantities.
  // These appear on electrical words only via copy-paste from fluid modules.
  {
    id: 'irrelevant_flow_on_electrical',
    part_class_pattern: /resistor|contactor|fuse|relay|breaker|cable|busbar|connector|bms|battery|cell|module|charger|switch|circuit_breaker|arc_flash|inverter/i,
    forbidden_modifier: /\b\d+(?:\.\d+)?\s*(?:gpm|lpm|L\/min|l\/min|m³\/h|m3\/h)\b/i,
    severity: 'HIGH',
    example: '200 L/min flow rate on a DC circuit breaker — flow units belong to fluid transport modules, not electrical switchgear',
    class_scope: undefined,
  },
  // ── Electrical current ratings on fluid transport parts ─────────────────
  // Ampere (A) current ratings on pipes, valves, manifolds, pumps, or fluid
  // fittings indicate cross-module contamination. Exception: pump motor current
  // (typical "3A motor current") — but if the word_id is clearly a fluid fitting
  // or pipe component, a current modifier is wrong.
  {
    id: 'irrelevant_current_on_fluid',
    part_class_pattern: /pipe|valve|manifold|fitting|hose|tube|duct|nozzle|filter_housing|coolant_charge|glycol_charge|expansion_vessel|heat_exchanger/i,
    forbidden_modifier: /\b\d+(?:\.\d+)?\s*A\b(?!\s*(?:mbar|ambient|atm))/,
    severity: 'MED',
    example: '89 A current rating on a coolant manifold — current ratings belong to electrical components, not fluid transport parts',
    class_scope: undefined,
  },
  // ── Voltage ratings on fluid transport parts ────────────────────────────
  // Voltage (V/kV) on pipes, valves, manifolds, fluid transport parts.
  // Exception whitelist: contactor coil voltage is legitimate — but if the
  // word_id is clearly a fluid fitting (pipe, valve, manifold, hose), V is wrong.
  {
    id: 'irrelevant_voltage_on_fluid',
    part_class_pattern: /pipe|manifold|fitting|hose|tube|duct|nozzle|filter_housing|coolant_charge|glycol_charge|expansion_vessel/i,
    forbidden_modifier: /\b\d+(?:\.\d+)?\s*(?:kV|V\s*DC|V\s*AC)\b/i,
    severity: 'MED',
    example: '800 V DC on a coolant manifold — voltage ratings belong to electrical components, not fluid transport parts',
    class_scope: undefined,
  },
  // ── Frequency ratings on mechanical or fluid parts ───────────────────────
  // Hz, kHz, MHz on pipes, tanks, vessels, structural parts, or coolant words.
  {
    id: 'irrelevant_frequency_on_mechanical_fluid',
    part_class_pattern: /pipe|manifold|fitting|hose|vessel|tank|structural|floor|panel|enclosure_wall|coolant_charge|glycol_charge|expansion_vessel|bolt|weld/i,
    forbidden_modifier: /\b\d+(?:\.\d+)?\s*(?:Hz|kHz|MHz)\b/i,
    severity: 'MED',
    example: '50 Hz on a steel structural panel — frequency ratings belong to electrical/electronic parts',
    class_scope: undefined,
  },

  // ── Voltage-domain placement (L40 [MED] — universal class-killer, 2026-05-27) ──────────────────
  //
  // L40 finding: "Ritz RVT-11 (11kV/110V) placed inside AC distribution
  // sub-module operating at 400 V AC. The 11 kV step-up transformer is
  // external pad-mounted, so HV VTs belong in external switchgear, not
  // internal 400V panel."
  //
  // Two rules:
  //   A) Words emitting a voltage >= 1 kV (HV-rated) MUST NOT appear in
  //      LV sub_modules (operating at 400 V AC / 230 V AC / LV bus).
  //      These parts belong in external HV switchgear / pad-mounted gear.
  //   B) Words emitting a voltage < 690 V (LV-rated) MUST NOT appear in
  //      HV sub_modules (external pad-mount / MV switchgear).
  //
  // Sub-module pattern matching uses the sub_module id, so the match is
  // against the word.id (which typically embeds its sub-module context).
  // The gate also matches against the enclosing sub_module.id via the
  // runIrrelevantModifierAudit walker which passes wordId from w.id —
  // see the sub_module_id check in the finding's location field.
  //
  // NOTE: The part_class_pattern here matches BOTH the word ID AND must be
  // interpreted carefully — we match word IDs that contain LV distribution
  // context (e.g. ac_distribution_*, lv_*, 400v_*, internal_*) for rule A,
  // and hv_*/external_pad_* for rule B. The forbidden_modifier is the
  // voltage value on the word itself.
  //
  // Rule A: HV-rated words in LV sub-modules.
  {
    id: 'hv_word_in_lv_sub_module',
    // Matches word IDs that suggest an LV / internal-distribution context.
    // Patterns: lv_, low_voltage, 400v, 230v, internal_distribution,
    //   ac_distribution, mv_switchgear is NOT LV so we exclude mv_.
    part_class_pattern: /(?:^|_)(?:lv_|low_voltage|400v|230v|internal_distribution|ac_distribution|ac_panel|lv_panel|distribution_board)/i,
    // Matches any kV rating (1 kV and above): "11kV", "33 kV", "3.3kV", "0.69 kV"
    // Lower bound: values < 1.0 kV are LV (acceptable in LV sub-modules).
    // Upper bound: none (catches 11kV, 33kV, 132kV, etc.)
    forbidden_modifier: /\b(?:[1-9]\d*(?:\.\d+)?|0\.(?:69|7[0-9]|[89]\d*))\s*kV\b/i,
    severity: 'HIGH',
    example: 'Ritz RVT-11 (11kV rated) placed in ac_distribution sub-module operating at 400 V AC — 11 kV instrument transformers belong in external HV switchgear, not internal LV panel',
    class_scope: undefined,  // universal
  },
  // Rule B: LV-rated words in HV sub-modules.
  {
    id: 'lv_word_in_hv_sub_module',
    // Matches word IDs that suggest an HV / external switchgear context.
    part_class_pattern: /(?:^|_)(?:hv_|high_voltage|external_pad|mv_switchgear|pad_mounted|external_switchgear|medium_voltage|mv_)/i,
    // Matches any rating clearly in the LV range: up to 690 V (IEC LV threshold).
    // Patterns: "400 V AC", "230 V", "48 V DC", "24V", "690V".
    // Exclude kV values — those would be HV and shouldn't fire this rule.
    forbidden_modifier: /\b(?:[1-9]\d{0,2}|69\d)\s*V\s*(?:AC|DC|ac|dc|)\b(?!\s*\/\s*\d+\s*kV)/i,
    severity: 'MED',
    example: '400 V AC distribution relay placed inside hv_switchgear sub-module — LV control gear should not be inside HV switchgear word slots',
    class_scope: undefined,  // universal
  },
]

// ── Violation type for cross-domain checks ────────────────────────────────────

export interface IrrelevantModifierViolation {
  rule_id: string
  severity: 'HIGH' | 'MED'
  location: string  // "module_id::sub_module_id::word_id[modifier_kind]"
  word_id: string
  modifier_kind: string
  modifier_value: string
  example: string
}

/**
 * runIrrelevantModifierAudit — walks every word's modifier_characters and
 * checks all IRRELEVANT_MODIFIER_PATTERNS rules.
 *
 * Called in the same gate 24 invocation as runSharedQuantityConsistencyAudit.
 * HIGH findings are accumulated into the shared exit-24 decision.
 *
 * @param modules   The design.modules array
 * @param className Product class string (e.g. 'energy_storage/utility_containerised')
 * @param rules     Rule registry — defaults to IRRELEVANT_MODIFIER_PATTERNS
 */
export function runIrrelevantModifierAudit(
  modules: DesignModuleLike[],
  className: string,
  rules: IrrelevantModifierRule[] = IRRELEVANT_MODIFIER_PATTERNS,
): {
  violations: IrrelevantModifierViolation[]
  high_count: number
  med_count: number
  passed: boolean
  error_message: string | null
} {
  const classLower = className.toLowerCase()
  const violations: IrrelevantModifierViolation[] = []

  // Filter rules to those applicable to this product class.
  const applicableRules = rules.filter((r) => {
    if (!r.class_scope) return true
    return r.class_scope.some((s) => classLower.includes(s.toLowerCase()))
  })

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

        // Skip regulatory modifiers — they cite standards which may look like
        // pressure/frequency specs (e.g. "BS EN 1333 PN16") but are not leaks.
        const nonRegulatoryMods = mods.filter((mc) => mc?.kind !== 'regulatory')

        for (const mc of nonRegulatoryMods) {
          const rawValue = String(mc?.value ?? '')
          if (!rawValue) continue

          for (const rule of applicableRules) {
            // Only check if word id matches the part class pattern
            if (!rule.part_class_pattern.test(wordId)) continue
            // Only flag if the forbidden modifier pattern matches the value
            if (!rule.forbidden_modifier.test(rawValue)) continue

            violations.push({
              rule_id: rule.id,
              severity: rule.severity,
              location: `${moduleId}::${subModuleId}::${wordId}[${mc.kind ?? '?'}]`,
              word_id: wordId,
              modifier_kind: mc.kind ?? '?',
              modifier_value: rawValue,
              example: rule.example,
            })
          }
        }
      }
    }
  }

  const highCount = violations.filter((v) => v.severity === 'HIGH').length
  const medCount = violations.filter((v) => v.severity === 'MED').length
  const passed = highCount === 0

  let errorMessage: string | null = null
  if (!passed) {
    const lines = [
      `[Gate 24 / exit 24] Cross-domain modifier leak FAIL — class: ${className}`,
      `${highCount} HIGH violation(s), ${medCount} MED violation(s):`,
    ]
    for (const v of violations.filter((vv) => vv.severity === 'HIGH').slice(0, 10)) {
      lines.push(`  ${v.rule_id} @ ${v.location}: value="${v.modifier_value}"`)
      lines.push(`    Example: ${v.example}`)
    }
    if (medCount > 0) {
      lines.push(`  + ${medCount} MED violation(s) (see full violations list)`)
    }
    lines.push('')
    lines.push('Fix: remove cross-domain modifiers from the listed word IDs.')
    lines.push('Root cause: copy-paste from a fluid/mechanical sub-module into an')
    lines.push('electrical sub-module, or LLM hallucination of domain-wrong modifiers.')
    errorMessage = lines.join('\n')
  }

  return { violations, high_count: highCount, med_count: medCount, passed, error_message: errorMessage }
}

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
