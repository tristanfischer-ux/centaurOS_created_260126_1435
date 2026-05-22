/**
 * @file universal-grammar-gates.ts — Universal graph-invariant gates.
 *
 * Complements universal-arithmetic-gates.ts. Where arithmetic gates check
 * NUMERICAL relations between declared fields, grammar gates check
 * TOPOLOGICAL relations between sub-modules in the design graph.
 *
 * Same contract: each gate is field-presence guarded. They fire when the
 * relevant graph structure is declared; silent otherwise. Universal across
 * product classes.
 *
 * Gates:
 *   no_orphan_sub_modules      — every sub-module has ≥1 grammar_link (intra OR cross-module)
 *   no_dangling_references     — every grammar_link references a sub-module that exists
 *   sensor_has_receiver        — sensor sub-modules emit data to a controller
 *   controller_has_actuator    — controllers' commands reach an actuator
 *   power_topology_closes      — power-consuming modules have a path back to a source
 *   thermal_path_closes        — heat sources have a thermal_path to a sink
 *   declared_links_unique      — same (from, to, mechanism) triple appears at most once
 *
 * Tristan/Council 2026-05-14: orphans are REPAIRED downstream, not removed.
 */
import type { ModuleSpec, SubModuleSpec, GrammarLink, CrossModuleGrammarLink } from '../types/module-decomposition'
import type { GateResult } from './universal-arithmetic-gates'
import { getClassConnections, MECHANISM_TO_KIND, mechanismToKind, type ConnectionKind } from '../class-connections'

export interface GrammarGate {
  name: string
  description: string
  /**
   * Note (2026-05-16): productClass added so class-aware gates
   * (cross_module_required_links) can look up per-class requirements. Universal
   * gates ignore it.
   */
  evaluate: (modules: ModuleSpec[], crossLinks: CrossModuleGrammarLink[], productClass?: string) => GateResult
}

function emptyResult(): GateResult {
  return { score: 0, passed: true, reasons: [], affected: [] }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface NodeRef { module: string; sub_module_id: string }
function nodeKey(r: NodeRef): string { return `${r.module}::${r.sub_module_id}` }

function allSubModuleRefs(modules: ModuleSpec[]): NodeRef[] {
  const refs: NodeRef[] = []
  for (const m of modules) {
    for (const sm of (m.sub_modules ?? [])) {
      refs.push({ module: m.module, sub_module_id: sm.id })
    }
  }
  return refs
}

function intraLinkPeers(m: ModuleSpec, sub_module_id: string): string[] {
  const peers = new Set<string>()
  // (2026-05-22 Tristan HAPS chain crash): some LLM repair patches emit
  // grammar_links as an OBJECT instead of an ARRAY (e.g. when "append" patch
  // creates a new field with a single object value). The `??` operator only
  // catches null/undefined — a non-array object passes through and the
  // for-of throws "object is not iterable". Defensive Array.isArray gate.
  const links = Array.isArray(m.grammar_links) ? m.grammar_links : []
  for (const link of links) {
    if (link.from_sub_module === sub_module_id) peers.add(link.to_sub_module)
    if (link.to_sub_module === sub_module_id) peers.add(link.from_sub_module)
  }
  return Array.from(peers)
}

function crossLinkPeers(modules: ModuleSpec[], crossLinks: CrossModuleGrammarLink[], mod: string): string[] {
  const peers = new Set<string>()
  const links = Array.isArray(crossLinks) ? crossLinks : []
  for (const cl of links) {
    if (cl.from_module === mod) peers.add(cl.to_module)
    if (cl.to_module === mod) peers.add(cl.from_module)
  }
  return Array.from(peers)
}

// ─── Gates ──────────────────────────────────────────────────────────────────

/** Every sub-module has at least one grammar_link (intra-module OR module-level cross-link). */
const noOrphanSubModulesGate: GrammarGate = {
  name: 'no_orphan_sub_modules',
  description: 'every sub-module participates in at least one grammar_link',
  evaluate(modules, crossLinks) {
    const orphans: string[] = []
    for (const m of modules) {
      const moduleHasCross = crossLinks.some(cl => cl.from_module === m.module || cl.to_module === m.module)
      for (const sm of (m.sub_modules ?? [])) {
        const intraPeers = intraLinkPeers(m, sm.id)
        if (intraPeers.length === 0 && !moduleHasCross) {
          orphans.push(`${m.module}::${sm.id}`)
        }
      }
    }
    if (orphans.length === 0) {
      return { score: 400, passed: true, reasons: [`grammar: no orphan sub-modules (${allSubModuleRefs(modules).length} total)`], affected: [] }
    }
    return {
      score: -200 * orphans.length,
      passed: false,
      reasons: [`grammar: ${orphans.length} orphan sub-module(s) with no grammar_links: ${orphans.slice(0, 8).join(', ')}${orphans.length > 8 ? ` ...+${orphans.length - 8}` : ''}`],
      affected: Array.from(new Set(orphans.map(o => o.split('::')[0]))),
    }
  },
}

/** Every grammar_link's from_sub_module / to_sub_module is a real sub-module id. */
const noDanglingReferencesGate: GrammarGate = {
  name: 'no_dangling_references',
  description: 'grammar_link from/to sub_module ids refer to sub-modules that exist',
  evaluate(modules, crossLinks) {
    const dangling: string[] = []
    for (const m of modules) {
      const ids = new Set((m.sub_modules ?? []).map(sm => sm.id))
      for (const link of (Array.isArray(m.grammar_links) ? m.grammar_links : [])) {
        if (!ids.has(link.from_sub_module)) dangling.push(`${m.module}: grammar_link.from_sub_module="${link.from_sub_module}" not declared`)
        if (!ids.has(link.to_sub_module)) dangling.push(`${m.module}: grammar_link.to_sub_module="${link.to_sub_module}" not declared`)
      }
    }
    const moduleKeys = new Set(modules.map(m => m.module))
    for (const cl of crossLinks) {
      // 2026-05-19: defend against malformed entries (undefined / null / missing
      // from_module) that earlier patch handlers may have admitted. Pairs with
      // the cross_link guard in radical/universal-repair.ts that now rejects
      // undefined-link appends at write time.
      if (cl == null || typeof cl !== 'object') continue
      if (!moduleKeys.has(cl.from_module)) dangling.push(`cross_link.from_module="${cl.from_module}" not in modules`)
      if (!moduleKeys.has(cl.to_module)) dangling.push(`cross_link.to_module="${cl.to_module}" not in modules`)
    }
    if (dangling.length === 0) {
      return { score: 400, passed: true, reasons: [`grammar: no dangling references`], affected: [] }
    }
    return {
      score: -300 * dangling.length,
      passed: false,
      reasons: [`grammar: ${dangling.length} dangling reference(s): ${dangling.slice(0, 5).join(' | ')}${dangling.length > 5 ? ` ...+${dangling.length - 5}` : ''}`],
      affected: [],
    }
  },
}

/** Sensor sub-modules (heuristic: name contains 'sensor' or function radical is sensing) must emit at least one outbound link (sensor_feedback or similar). Counts intra-module grammar_links OR cross-module link where the sensor's module is a from_module. */
const sensorHasReceiverGate: GrammarGate = {
  name: 'sensor_has_receiver',
  description: 'every sensor sub-module has at least one outbound grammar_link to a downstream consumer (intra OR cross-module)',
  evaluate(modules, crossLinks) {
    const sensorRegex = /sensor|sensing|probe|transducer|thermistor|encoder/i
    const missing: string[] = []
    for (const m of modules) {
      const moduleHasOutboundCross = (crossLinks ?? []).some(cl => cl.from_module === m.module)
      for (const sm of (m.sub_modules ?? [])) {
        const looksLikeSensor = sensorRegex.test(sm.name_human ?? sm.id) ||
          (sm.words ?? []).some((w: any) => sensorRegex.test(w.content_character?.name_human ?? w.id ?? ''))
        if (!looksLikeSensor) continue
        const outboundIntra = (m.grammar_links ?? []).some(l => l.from_sub_module === sm.id)
        if (outboundIntra) continue
        if (moduleHasOutboundCross) continue  // module-level cross-link covers this sub-module's role
        missing.push(`${m.module}::${sm.id}`)
      }
    }
    if (missing.length === 0) return { score: 250, passed: true, reasons: ['grammar: sensors have receivers'], affected: [] }
    return {
      score: -150 * missing.length,
      passed: false,
      reasons: [`grammar: ${missing.length} sensor sub-module(s) with no downstream consumer: ${missing.slice(0, 5).join(', ')}. FIX: add a grammar_link or cross_module_grammar_link from each one to its data-receiving controller.`],
      affected: Array.from(new Set(missing.map(m => m.split('::')[0]))),
    }
  },
}

/** Controller / EMS sub-modules must have at least one outbound link to an actuator / contactor / driver / switchgear. */
const controllerHasActuatorGate: GrammarGate = {
  name: 'controller_has_actuator',
  description: 'every controller sub-module commands at least one downstream actuator / contactor / driver (intra OR cross-module)',
  evaluate(modules, crossLinks) {
    const ctrlRegex = /controller|ems\b|bms_master|plc|cpu|mcu|fpga|gateway/i
    const missing: string[] = []
    for (const m of modules) {
      // Module-level evidence: does this module have any outbound cross-module link?
      // A cross-link from the controller's module to a downstream module is acceptable proof
      // that the controller commands an actuator in another module (e.g. iot_gateway in
      // control_compute_communication commanding LED drivers in environmental_interface).
      const moduleHasOutboundCross = (crossLinks ?? []).some(cl => cl.from_module === m.module)
      for (const sm of (m.sub_modules ?? [])) {
        const looksLikeController = ctrlRegex.test(sm.name_human ?? sm.id) ||
          (sm.words ?? []).some((w: any) => ctrlRegex.test(w.content_character?.name_human ?? w.id ?? ''))
        if (!looksLikeController) continue
        const intraOutbound = (m.grammar_links ?? []).some(l => l.from_sub_module === sm.id)
        if (intraOutbound || moduleHasOutboundCross) continue
        missing.push(`${m.module}::${sm.id}`)
      }
    }
    if (missing.length === 0) return { score: 250, passed: true, reasons: ['grammar: controllers have actuators'], affected: [] }
    return {
      score: -150 * missing.length,
      passed: false,
      reasons: [`grammar: ${missing.length} controller sub-module(s) with no commanded actuator: ${missing.slice(0, 5).join(', ')}. FIX: add an intra-module grammar_link FROM the controller sub-module to an actuator/contactor sub-module in the SAME module, OR add a cross_module_grammar_link FROM the controller's module to a downstream module that has the actuator.`],
      affected: Array.from(new Set(missing.map(m => m.split('::')[0]))),
    }
  },
}

/** Heat-source sub-modules (cells, inverter modules, motors) must have a thermal_path grammar_link to a sink. Counts intra-module thermal grammar_links OR cross-module thermal links from the heat source's module. */
const thermalPathClosesGate: GrammarGate = {
  name: 'thermal_path_closes',
  description: 'every heat-source sub-module has a thermal_path link to a sink (intra OR cross-module)',
  evaluate(modules, crossLinks) {
    const heatSourceRegex = /cell|igbt|inverter|compressor|motor|fpga|cpu|gpu|led/i
    const thermalMechRegex = /thermal|cooling|cold[_ ]plate|heatsink|radiator|coolant|hvac|heat_exchanger/i
    const missing: string[] = []
    for (const m of modules) {
      // Module-level: does the module have a thermal-related cross-link?
      const moduleHasThermalCross = (crossLinks ?? []).some(cl =>
        (cl.from_module === m.module || cl.to_module === m.module) && thermalMechRegex.test(cl.mechanism ?? ''),
      )
      for (const sm of (m.sub_modules ?? [])) {
        const isHeatSource = heatSourceRegex.test(sm.name_human ?? sm.id) ||
          (sm.words ?? []).some((w: any) => heatSourceRegex.test(w.content_character?.name_human ?? w.id ?? ''))
        if (!isHeatSource) continue
        const hasIntraThermal = (m.grammar_links ?? []).some(l =>
          (l.from_sub_module === sm.id || l.to_sub_module === sm.id) && thermalMechRegex.test(l.mechanism ?? ''),
        )
        if (hasIntraThermal) continue
        if (moduleHasThermalCross) continue  // module-level cross-link covers the sub-module
        missing.push(`${m.module}::${sm.id}`)
      }
    }
    if (missing.length === 0) return { score: 200, passed: true, reasons: ['grammar: heat-source thermal paths declared'], affected: [] }
    return {
      score: -100 * missing.length,
      passed: false,
      reasons: [`grammar: ${missing.length} heat-source sub-module(s) without thermal_path: ${missing.slice(0, 5).join(', ')}. FIX: add a cross_module_grammar_link from the heat source's module (e.g. energy_storage_source) to a cooling-providing module (e.g. environmental_interface or mass_fluid_transport_process) with mechanism="thermal_path" or "cooling".`],
      affected: Array.from(new Set(missing.map(m => m.split('::')[0]))),
    }
  },
}

/** Power-consuming modules (any module that imports current from power_distribution) must declare a cross_module_grammar_link to power_distribution OR a source. */
const powerTopologyClosesGate: GrammarGate = {
  name: 'power_topology_closes',
  description: 'every power-consuming module has a cross-module grammar_link to the power source',
  evaluate(modules, crossLinks) {
    // If neither power_distribution nor energy_storage_source exists, gate is silent
    const sourceModules = ['power_distribution', 'energy_storage_source']
    const hasSource = modules.some(m => sourceModules.includes(m.module))
    if (!hasSource) return emptyResult()

    // Heuristic: modules that mention current/voltage/power in derived_parameters consume power
    const consumesPower = (m: ModuleSpec): boolean => {
      const dp = m.derived_parameters ?? {}
      return Object.keys(dp).some(k => /power|current|voltage|kw\b|watt/i.test(k))
    }
    const sources = new Set(sourceModules)
    const missing: string[] = []
    for (const m of modules) {
      if (sources.has(m.module)) continue
      if (!consumesPower(m)) continue
      const hasCrossToSource = crossLinks.some(cl => {
        const involves = cl.from_module === m.module || cl.to_module === m.module
        const other = cl.from_module === m.module ? cl.to_module : cl.from_module
        return involves && sources.has(other)
      })
      if (!hasCrossToSource) missing.push(m.module)
    }
    if (missing.length === 0) return { score: 250, passed: true, reasons: ['grammar: power topology closes'], affected: [] }
    return {
      score: -100 * missing.length,
      passed: false,
      reasons: [`grammar: ${missing.length} power-consuming module(s) without cross-link to source: ${missing.join(', ')}`],
      affected: missing,
    }
  },
}

/**
 * Each sub-module should contain ≥5 specific component words (BoM-line equivalents).
 * Sub-modules below 5 words are flagged as under-detailed.
 *
 * Single-thin-module exception (2026-05-15): some sub-modules are legitimately
 * small (e.g. `emc_grounding_shield` is 3-4 small parts; forcing a 5th invites
 * invention). When EXACTLY ONE sub-module has 4 words, downgrade to a warning
 * rather than fail the gate. Two or more thin sub-modules, or any sub-module
 * with <4 words, still fails — that's a real density problem worth repairing.
 */
const subModuleWordDensityGate: GrammarGate = {
  name: 'sub_module_word_density',
  description: 'every sub-module has ≥5 words (≥4 with single-thin exception)',
  evaluate(modules) {
    const thin: Array<{ id: string; n: number }> = []
    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        const n = (sm.words ?? []).length
        if (n < 5) thin.push({ id: `${m.module}::${sm.id}`, n })
      }
    }
    if (thin.length === 0) return { score: 400, passed: true, reasons: ['grammar: all sub-modules have ≥5 words'], affected: [] }

    const singleThinException = thin.length === 1 && thin[0].n === 4
    if (singleThinException) {
      return {
        score: 100,  // positive — pass — but lower than full 400 so it's visible in reports
        passed: true,
        reasons: [`grammar: 1 sub-module is 4-word thin (${thin[0].id}); allowed under single-thin exception — some sub-modules are legitimately small and forcing a 5th word invites invention. ≥2 thin or <4 words still fails.`],
        affected: [],
      }
    }

    const desc = thin.map(t => `${t.id} (${t.n} words)`)
    return {
      score: -100 * thin.length,
      passed: false,
      reasons: [`grammar: ${thin.length} sub-module(s) UNDER-DENSE (<5 words; need 5-7 for a real BoM): ${desc.slice(0, 8).join(', ')}${desc.length > 8 ? ` ...+${desc.length - 8}` : ''}. FIX: emit add_word_to_sub_module patches with specific parts (manufacturer, part_number, dimensions, etc.) for each thin sub-module.`],
      affected: Array.from(new Set(thin.map(t => t.id.split('::')[0]))),
    }
  },
}

/**
 * Word modifier richness gate (Tristan directive 2026-05-16 — anti-hallucination
 * recalibration after iter-59 BESS audit). Floors are now:
 *
 *   ENGINEERED words (has manufacturer OR part_number):  ≥4 modifiers
 *   COMMODITY words (name matches commodity pattern):    ≥3 modifiers
 *   UNCLASSIFIED words:                                  ≥4 modifiers
 *
 * Why this changed (iter-59 audit, 244 BESS words sampled): the previous ≥5
 * floor on EVERY word forced the LLM to invent manufacturer/part_number on
 * commodity items (earth bars, copper cables, brass studs, generic insulation
 * tape) that genuinely don't have meaningful SKUs. ~30-40% hallucination rate
 * on engineered-part SKUs was directly traceable to this gate's pressure.
 *
 * COMMODITY pattern recognition: anything whose word name matches generic
 * hardware ("earth bar", "earth cable", "brass stud", "equipotential link",
 * "spring nut", "bracket", "washer", "screw", "bolt", "gland", "fitting",
 * "lug", "terminal block", "wire ferrule", "sleeve", "gasket", "seal", "foam
 * gasket", "label", "decal", "paint", "coating", "tape" without specific
 * vendor prefix, "mineral wool", "rockwool", etc.) needs only qty + material
 * + dimensions = 3 modifiers, since the part is bought as a commodity from
 * any distributor by spec. Forcing more invites hallucination.
 *
 * ENGINEERED items (cells, semis, drives, controllers, sensors, valves,
 * pumps, compressors, motors, contactors, fuses, displays, antennas) keep
 * the meaningful procurement bar at ≥4 with explicit mfr+pn expected.
 */
const COMMODITY_PATTERNS: RegExp[] = [
  /\bearth\s+(bar|cable|stud|link|strap|braid)\b/i,
  /\bequipotential\s+link\b/i,
  /\b(busbar|bus\s+bar)\b(?!\s+module|\s+assembly)/i,    // bare busbar = commodity; busbar module/assembly = engineered
  /\b(spring\s+nut|t-?nut|cage\s+nut|washer|spacer)\b/i,
  /\b(machine\s+screw|hex\s+bolt|stud\s+bolt|set\s+screw|threaded\s+rod)\b/i,
  /\b(cable\s+gland|conduit\s+fitting|compression\s+fitting|tube\s+fitting)\b(?!\s*\(\s*hawke|\s*\(\s*roxtec)/i,
  /\b(crimp\s+lug|ring\s+terminal|spade\s+terminal|ferrule|wire\s+sleeve|heat\s+shrink)\b/i,
  /\b(gasket|o-ring|seal|foam\s+strip|epdm\s+seal)\b(?!\s+module)/i,
  /\b(label|decal|warning\s+sticker|nameplate)\b/i,
  /\b(paint|coating\s+primer|topcoat)\b/i,
  /\b(mineral\s+wool|ceramic\s+wool|fibreglass\s+blanket|insulation\s+(?:wool|blanket|board|foam))\b/i,
  /\b(insulation\s+tape|vapor\s+tape|barrier\s+tape|sealing\s+tape)\b/i,
  /\b(cable\s+tray|trunking|raceway|conduit\s+(?:pipe|fitting))\b/i,
  /\b(corner\s+bracket|mounting\s+bracket|angle\s+bracket|gusset)\b/i,
]
function isCommodityWord(w: any): boolean {
  const name = String(
    w?.name_human ??
    w?.content_character?.name_human ??
    w?.id ??
    ''
  ).toLowerCase()
  if (!name) return false
  return COMMODITY_PATTERNS.some(rx => rx.test(name))
}
function hasManufacturerOrPartNumber(w: any): boolean {
  const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
  return mods.some((m: any) => {
    const k = normaliseKind(String(m?.kind ?? ''))
    return k === 'manufacturer' || k === 'part_number'
  })
}
const wordModifierRichnessGate: GrammarGate = {
  name: 'word_modifier_richness',
  description: 'engineered words ≥4 modifiers, commodity words ≥3 (Tristan 2026-05-16 anti-hallucination recalibration)',
  evaluate(modules) {
    const thin: string[] = []
    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          const mods0 = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
          const n = mods0.length
          const commodity = isCommodityWord(w)
          const engineered = hasManufacturerOrPartNumber(w)
          // Commodity items: 3 is enough (qty + material + dimensions).
          // Engineered items (with mfr or pn): need 4 (qty + mfr + pn + rating).
          // Unclassified: default to 4 (same as engineered — strict).
          const floor = commodity && !engineered ? 3 : 4
          if (n < floor) {
            const tag = commodity ? '[commodity]' : (engineered ? '[engineered]' : '')
            thin.push(`${m.module}::${sm.id}::${w.id ?? w.content_character?.character_id ?? '?'} ${tag} (${n} mods, need ≥${floor})`)
          }
        }
      }
    }
    if (thin.length === 0) return { score: 400, passed: true, reasons: ['grammar: all words meet the modifier-richness floor (4 for engineered, 3 for commodity)'], affected: [] }
    return {
      score: -50 * thin.length,
      passed: false,
      reasons: [`grammar: ${thin.length} word(s) UNDER-SPECIFIED (commodity floor: qty+material+dimensions=3; engineered floor: qty+manufacturer+part_number+rating=4): ${thin.slice(0, 6).join(', ')}${thin.length > 6 ? ` ...+${thin.length - 6}` : ''}. FIX (engineered): add manufacturer + part_number + material + rating. FIX (commodity): add material + dimensions if missing. DO NOT invent manufacturer/part_number on commodity items just to clear the count — leave them off; the gate accepts ≥3 for commodities.`],
      affected: Array.from(new Set(thin.map(t => t.split('::')[0]))),
    }
  },
}

/** A (from_sub_module, to_sub_module, mechanism) triple should not appear twice in the same module. */
const declaredLinksUniqueGate: GrammarGate = {
  name: 'declared_links_unique',
  description: 'no duplicate grammar_links (same from/to/mechanism triple within a module)',
  evaluate(modules) {
    const dupes: string[] = []
    for (const m of modules) {
      const seen = new Set<string>()
      for (const link of (Array.isArray(m.grammar_links) ? m.grammar_links : [])) {
        const key = `${link.from_sub_module}::${link.to_sub_module}::${link.mechanism}`
        const rev = `${link.to_sub_module}::${link.from_sub_module}::${link.mechanism}`
        if (seen.has(key) || seen.has(rev)) {
          dupes.push(`${m.module}: ${key}`)
        }
        seen.add(key)
      }
    }
    if (dupes.length === 0) return { score: 200, passed: true, reasons: ['grammar: no duplicate links'], affected: [] }
    return {
      score: -50 * dupes.length,
      passed: false,
      reasons: [`grammar: ${dupes.length} duplicate link(s): ${dupes.slice(0, 5).join(' | ')}`],
      affected: Array.from(new Set(dupes.map(d => d.split(':')[0]))),
    }
  },
}

/**
 * Phase A (2026-05-15): every concrete component named in a module's
 * overview_paragraph_en must also exist as a word.id (or word.name_human) in
 * at least one of that module's sub_modules. The BoM is built by aggregating
 * sub-module words, so anything named in the overview but absent from the
 * sub-modules is invisible to procurement. Soft gate (score-only, no FIX hint
 * since the LLM should fix it via add_word_to_sub_module).
 *
 * Approach: extract candidate "concrete part" tokens from the overview prose
 * by looking for snake_case ids, alphanumeric part_numbers, and capitalised
 * multi-word phrases. For each candidate, check whether ANY word in the
 * module's sub-modules names it (case-insensitive substring match on word.id,
 * word.name_human, modifier_characters.value).
 */
const moduleProseSubsetOfSubModulesGate: GrammarGate = {
  name: 'module_prose_subset_of_sub_modules',
  description: 'every concrete component named in overview_paragraph_en must exist as a word in some sub-module',
  evaluate(modules) {
    const violations: string[] = []
    for (const m of modules) {
      const overview = (m.overview_paragraph_en ?? '').trim()
      if (overview.length < 100) continue  // too short to extract reliably

      // Build the haystack of known component names + modifier values from the
      // module's sub-modules.
      const haystack: string[] = []
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          if (w.id) haystack.push(String(w.id).toLowerCase())
          if (w.content_character?.character_id) haystack.push(String(w.content_character.character_id).toLowerCase())
          if (w.content_character?.name_human) haystack.push(String(w.content_character.name_human).toLowerCase())
          for (const mc of (Array.isArray(w.modifier_characters) ? w.modifier_characters : [])) {
            const v = String(mc.value ?? '').toLowerCase()
            if (v.length >= 3) haystack.push(v)
          }
        }
      }
      const haystackStr = haystack.join(' | ')

      // Candidate concrete-noun tokens from overview prose.
      const text = overview.toLowerCase()
      const candidates = new Set<string>()
      // snake_case identifiers
      for (const tok of text.match(/[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}/g) ?? []) candidates.add(tok)
      // alphanumeric part_number patterns (uppercase mix)
      for (const tok of overview.match(/\b[A-Z]{2,}[-_][A-Z0-9-]{3,}\b/g) ?? []) candidates.add(tok.toLowerCase())
      for (const tok of overview.match(/\b[A-Z][A-Z0-9]{3,}\b/g) ?? []) {
        // Skip common acronyms / units
        if (tok.length <= 3) continue
        if (/^(IEC|UKCA|WRAS|RoHS|PWM|MOSFET|MCCB|CAN|SCADA|BMS|EMS|HVAC|DC|AC|LV|HV|kW|kWh|MW|MWh|EFR)$/i.test(tok)) continue
        candidates.add(tok.toLowerCase())
      }
      // Drop generic stop-words that snuck in via snake_case (module ids etc.)
      const STOP = new Set(['energy_storage_source','energy_conversion_transduction','structure_containment','sensing_instrumentation','control_compute_communication','safety_protection','environmental_interface','power_distribution','maintenance_serviceability','actuation_kinematics','mass_fluid_transport_process','hmi_ergonomics'])
      // Common acronyms / metrics / standards / units / refrigerants / product-class
      // identifiers that show up in overview prose but are NOT discrete procurement
      // components. A real BoM line is a *thing you order*, not a unit or standard.
      const NON_PROCUREMENT = new Set([
        // Performance metrics / units
        'ppfd','dli','cop','scop','seer','eer','hspf','rsfp','cri','cct','par','npbi','psi','rpm','kpa','mpa','bar','kw','kwh','mw','mwh','wh','va','kva','mva','dba','rh','dpf','soc','soh','dod','cct','rpm','psig',
        // Refrigerants (these ARE procurement items technically, but rarely a
        // standalone BoM line — usually rolled into the system charge mass).
        'r290','r410a','r32','r454b','r744','r1234yf','r134a','r1233zd','co2',
        // Ingress + EMC + safety standards
        'ip54','ip55','ip65','ip66','ip67','ip68','ip69k','nema1','nema3','nema4','nema12','iec','ukca','rohs','reach','wee','wras','brcgs','iso','ansi','astm','en','bs','ul','csa','fcc','vde','nfpa','atex','sil','cat',
        // Standard suffixes that show up alone
        'ds','rev','rohs','reach','vp','rmw','rms','dc','ac','lv','hv','mv','lvds','rfid','rfi','emi','emc','hmi','plc','vfd','vsd','ups','psu','pcb','pcba','adc','dac','rtd','ntc','mosfet','igbt','fet','bjt','mcu','cpu','gpu','fpga','asic','sram','dram','ddr','ssd','hdd','rj45','m12','m8','m5','m6','m4','m3',
        // Protocols + physical-layer interfaces (these are properties of a chip,
        // not discrete BoM lines). 2026-05-19: heatpump retry stuck on rs-485.
        'rs-485','rs485','rs-232','rs232','rs-422','rs422','i2c','spi','uart','can','canopen','can_bus','modbus','modbus_tcp','modbus-rtu','modbus_rtu','profibus','profinet','ethercat','bacnet','knx','dali','dmx','ssh','tls','https','mqtt','opc_ua','opc-ua','ble','wifi','wi-fi','zigbee','lora','lorawan','4g','5g','nb-iot','lte-m',
        // Product-class names / pipeline ids
        'bess','vf','cgm','haps','auv','drone','heatpump','ev',
        // Generic position descriptors that won't be component names
        'lhs','rhs','dwg','rev','spec','doc','ts','vat','vatable','tba','tbd','tbc',
      ])

      // Pre-compute a punctuation-stripped haystack so candidates like
      // "rs-485" still match a word.id like "rs485_transceiver" (2026-05-19
      // heatpump retry was stuck on this normalisation gap).
      const haystackNorm = haystackStr.replace(/[-_\s]/g, '')

      const missing: string[] = []
      for (const c of candidates) {
        if (STOP.has(c)) continue
        if (NON_PROCUREMENT.has(c)) continue
        if (c.length < 4) continue
        // Skip pure-numeric tokens (years, dimensions in the wrong format, etc.)
        if (/^\d+$/.test(c)) continue
        // Skip acronym-shaped tokens: ≤5 chars all letters (likely an acronym).
        // Genuine part numbers have a digit or dash.
        if (c.length <= 5 && /^[a-z]+$/.test(c)) continue
        const cNorm = c.replace(/[-_\s]/g, '')
        if (haystackStr.includes(c) || haystackNorm.includes(cNorm)) continue
        missing.push(c)
      }
      if (missing.length > 0) {
        violations.push(`${m.module}: overview mentions ${missing.length} concrete component${missing.length === 1 ? '' : 's'} not present in any sub-module word — ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` ...+${missing.length - 5}` : ''}`)
      }
    }
    if (violations.length === 0) {
      return { score: 200, passed: true, reasons: ['grammar: module overviews are subsets of their sub-modules (BoM-complete)'], affected: [] }
    }
    return {
      score: -30 * violations.reduce((a, v) => a + parseInt((v.match(/(\d+) concrete/) ?? ['','0'])[1], 10), 0),
      passed: false,
      reasons: [
        `grammar: ${violations.length} module(s) name components in overview that are absent from sub-modules (procurement gap): ${violations.slice(0, 3).join(' | ')}${violations.length > 3 ? ` ...+${violations.length - 3}` : ''}. FIX: emit add_word_to_sub_module patches to add the missing components as words (with full modifier_characters) to the appropriate sub-module — OR rephrase the overview to remove the orphan mention.`,
      ],
      affected: Array.from(new Set(violations.map(v => v.split(':')[0]))),
    }
  },
}

/**
 * Phase D (2026-05-15): every word in a sub-module MUST be named in that
 * sub-module's `english_sentence` (the LLM-emitted single-sentence form). The
 * renderer prefers `english_sentence` when it covers all words; otherwise
 * falls back to a deterministic paragraph builder. Either way, the LLM should
 * be writing prose that names every word — readers consult the prose, BoM
 * consults the words. Without this gate the prose silently drops 1-4 words
 * per sub-module while the BoM still carries them — invisible inconsistency.
 *
 * iter-47 BESS case study: 5/5 sub-modules in `safety_protection` dropped 1+
 * word; thermal_runaway_detection mentioned 1 of 5 words. The gate now flags
 * this so Phase 2 repair can rewrite the english_sentence.
 */
const subModuleProseCoversWordsGate: GrammarGate = {
  name: 'sub_module_prose_covers_words',
  description: 'every word in a sub-module appears (by name_human) in the sub-module\'s english_sentence',
  evaluate(modules) {
    const violations: string[] = []
    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        const prose = (sm.english_sentence ?? '').trim().toLowerCase()
        if (!prose) continue  // separate gate handles missing prose; this only checks coverage
        const words = sm.words ?? []
        if (words.length === 0) continue
        const missing: string[] = []
        for (const w of words) {
          const candidates: string[] = [
            w.content_character?.name_human ?? '',
            w.name_human ?? '',
          ].filter(s => s.length > 0).map(s => s.toLowerCase())
          const present = candidates.some(c => prose.includes(c))
          if (!present) {
            missing.push((w.content_character?.name_human ?? w.name_human ?? w.id ?? '?'))
          }
        }
        if (missing.length > 0) {
          violations.push(`${m.module}::${sm.id} prose drops ${missing.length}/${words.length} words: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` ...+${missing.length - 3}` : ''}`)
        }
      }
    }
    if (violations.length === 0) {
      return { score: 300, passed: true, reasons: ['grammar: every sub-module prose covers all its words'], affected: [] }
    }
    return {
      score: -80 * violations.length,
      passed: false,
      reasons: [
        `grammar: ${violations.length} sub-module(s) have prose that drops at least one word — the BoM-grade prose must name every word so the BoM table and the prose match: ${violations.slice(0, 4).join(' | ')}${violations.length > 4 ? ` ...+${violations.length - 4}` : ''}. FIX: emit an edit_sub_module_field patch on the offending sub-module\'s english_sentence (or paragraph_en) that names every word in words[] by its name_human, weaving the modifiers naturally.`,
      ],
      affected: Array.from(new Set(violations.map(v => v.split('::')[0]))),
    }
  },
}

/**
 * Modifier consistency gate (Tristan / Test 3 directive 2026-05-15).
 *
 * Each component (WordSpec) must have AT MOST ONE modifier_character per
 * normalised kind. iter-47 BESS revealed components carrying BOTH:
 *   - mass: "4.8 kg" AND mass: "5.3 kg"
 *   - part_number: "CB-314Ah" AND part_number: "CB-314Ah-A-50"
 *   - rating_primary: "314 Ah" AND rating_primary: "314 Ah at 0.5 C"
 *
 * The merge logic in applyReviewerPatches dedupes on EXACT (kind,value) pairs
 * but not on (kind) — so different-value duplicates accumulate and the BoM
 * cannot pick one canonical value. This gate names them so the repair LLM
 * collapses each kind to a single value per component.
 *
 * Kind normalisation: lowercase + strip trailing 's' so "dimension" and
 * "dimensions" merge. Singular/plural drift was a real iter-47 bug.
 */
const SINGULAR_KINDS = new Set(['dimension', 'rating', 'regulatory_standard'])
export function normaliseKind(k: string): string {
  const lower = String(k ?? '').toLowerCase().trim()
  if (!lower) return ''
  // strip trailing 's' for known offenders
  if (lower.endsWith('s') && (SINGULAR_KINDS.has(lower.slice(0, -1)) || lower === 'dimensions' || lower === 'ratings')) {
    return lower.slice(0, -1)
  }
  return lower
}

/**
 * Modifier VALUE normaliser — collapses cosmetic-only differences so the gate
 * doesn't fire on `600x800x250 mm` vs `600×800×250 mm`, `IP65` vs `IP65
 * protection`, etc. iter-53 VF had 51 such cosmetic violations.
 *
 * Strips:
 *   - case (lowercased)
 *   - Unicode `×` → ASCII `x`
 *   - collapsed whitespace
 *   - trailing noise tokens that just restate the rating (protection, protected,
 *     rated, rating, compliant, class, grade)
 *
 * Does NOT collapse legitimate spec differences — `M20` vs `M20 × 1.5 mm cable`
 * remain different (the gate continues to flag these as real conflicts the
 * design needs to reconcile).
 */
const TRAILING_NOISE_RX = /\s+(protection|protected|rated|rating|compliant|class|grade)\s*$/i
export function normaliseModifierValue(value: string): string {
  let v = String(value ?? '').toLowerCase().trim()
  if (!v) return ''
  v = v.replace(/×/g, 'x')           // 600×800 → 600x800
  v = v.replace(/\s+/g, ' ')         // collapse internal whitespace
  // Strip up to 2 trailing noise tokens ("IP65 protection rated" → "ip65")
  for (let i = 0; i < 2; i++) {
    const stripped = v.replace(TRAILING_NOISE_RX, '').trim()
    if (stripped === v) break
    v = stripped
  }
  return v
}

const modifierConsistencyGate: GrammarGate = {
  name: 'modifier_consistency',
  description: 'each component has at most one modifier_character per normalised kind (no duplicate-kind with conflicting values)',
  evaluate(modules) {
    const violations: string[] = []
    for (const m of modules) {
      for (const sm of (m.sub_modules ?? [])) {
        for (const w of (sm.words ?? [])) {
          // Map normalised-kind → Set<normalised-value> AND a parallel raw map
          // so the violation message shows the raw values (more useful for the
          // repair LLM than seeing the normalised forms).
          const byKindNorm = new Map<string, Set<string>>()
          const byKindRaw = new Map<string, Set<string>>()
          for (const mc of (Array.isArray(w.modifier_characters) ? w.modifier_characters : [])) {
            const k = normaliseKind(String(mc.kind ?? ''))
            if (!k) continue
            const raw = String(mc.value ?? '').trim()
            const norm = normaliseModifierValue(raw)
            if (!byKindNorm.has(k)) { byKindNorm.set(k, new Set()); byKindRaw.set(k, new Set()) }
            byKindNorm.get(k)!.add(norm)
            byKindRaw.get(k)!.add(raw)
          }
          for (const [k, vs] of byKindNorm) {
            if (vs.size > 1) {
              const wid = (w as any).id ?? '?'
              const rawSet = byKindRaw.get(k)!
              const dup = Array.from(rawSet).map(v => JSON.stringify(v)).join(' AND ')
              violations.push(`${m.module}::${sm.id}::${wid} has ${vs.size} conflicting "${k}" values: ${dup}`)
            }
          }
        }
      }
    }
    if (violations.length === 0) {
      return { score: 250, passed: true, reasons: ['grammar: components carry one value per modifier kind'], affected: [] }
    }
    return {
      score: -40 * violations.length,
      passed: false,
      reasons: [
        `grammar: ${violations.length} component(s) carry duplicate-kind modifiers with conflicting values — BoM cannot pick a canonical value: ${violations.slice(0, 4).join(' | ')}${violations.length > 4 ? ` ...+${violations.length - 4}` : ''}. FIX: emit edit_sub_module_field patches to reduce each duplicate kind to a single value per component (or use add_word_to_sub_module with the SAME id to merge — but only ONE value per kind survives).`,
      ],
      affected: Array.from(new Set(violations.map(v => v.split('::')[0]))),
    }
  },
}

/**
 * Spatial position completeness gate (Tristan directive 2026-05-16). For every
 * intra-module grammar_link with a mechanism that implies physical placement
 * (mechanical_mount, thermal_contact, thermal_path, cooling_loop, dc_busbar,
 * coolant_supply), require either:
 *   1. an explicit `position` attribute on the link ("below", "above",
 *      "underneath", "on_top_of", "behind", "in_front_of", "alongside",
 *      "adjacent", "wrapped_around"), OR
 *   2. the `detail` string mentions spatial language.
 *
 * iter-60b BESS audit revealed the engine emits "cold plate thermal_contact
 * cell_string" but never declares whether the cold plate is ABOVE or BELOW
 * the cells. The reader can't draw the layout from the data. This gate forces
 * the LLM to commit to a spatial relationship.
 *
 * Counts only intra-module links — cross-module links use coarser spatial
 * granularity (module-to-module routing) which is handled separately.
 */
const SPATIAL_MECHANISMS: ReadonlySet<string> = new Set([
  'mechanical_mount', 'thermal_contact', 'thermal_path', 'cooling_loop',
  'coolant_supply', 'coolant_return', 'dc_busbar', 'ac_busbar', 'cable_routing',
  'pipe_run', 'manifold_run', 'duct_run', 'mount', 'support',
])
const SPATIAL_KEYWORDS_RX = /\b(below|above|underneath|under|on\s+top|beside|alongside|adjacent|behind|in\s+front|wrapped|sits\s+(?:on|under|beneath)|mounts\s+(?:on|to|under|above|below)|attached\s+(?:to|above|below)|nested|stacked|surrounds|encloses|inside|outside|floor|ceiling|wall|rear|front|left|right|m\d+\s+fasteners?)\b/i
const spatialPositionCompleteGate: GrammarGate = {
  name: 'spatial_position_complete',
  description: 'every grammar_link with a placement-implying mechanism declares position (above/below/beside) or has spatial detail',
  evaluate(modules) {
    const missing: string[] = []
    for (const m of modules) {
      for (const gl of (Array.isArray(m.grammar_links) ? m.grammar_links : [])) {
        const mech = String((gl as any).mechanism ?? '').toLowerCase()
        if (!SPATIAL_MECHANISMS.has(mech)) continue
        const pos = String((gl as any).position ?? '').trim()
        const detail = String((gl as any).detail ?? '').trim()
        const hasPosition = pos.length > 0
        const detailHasSpatial = detail.length > 0 && SPATIAL_KEYWORDS_RX.test(detail)
        if (!hasPosition && !detailHasSpatial) {
          missing.push(`${m.module}::${(gl as any).from_sub_module}→${(gl as any).to_sub_module} [${mech}]`)
        }
      }
    }
    if (missing.length === 0) {
      return { score: 250, passed: true, reasons: ['grammar: every placement-implying link declares a spatial relationship (position or detail prose)'], affected: [] }
    }
    return {
      score: -40 * missing.length,
      passed: false,
      reasons: [`grammar: ${missing.length} link(s) missing spatial position — reader cannot draw the layout: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` ...+${missing.length - 6}` : ''}. FIX: emit edit_field patches adding a "position" attribute ("below", "above", "alongside", etc.) OR rewrite the link "detail" to include spatial language (e.g. "the cold plate sits BENEATH each cell module, attached via M6 fasteners").`],
      affected: Array.from(new Set(missing.map(m => m.split('::')[0]))),
    }
  },
}

/**
 * Cross-module-required-links gate (Tristan directive 2026-05-16). For each
 * product class, class-connections.ts declares the physically required
 * connections between modules (e.g. BESS energy_storage_source MUST connect
 * to control_compute_communication for BMS↔EMS communication). The gate
 * checks every required pair is present in cross_module_grammar_links with
 * a mechanism of the right KIND (electrical/thermal/control/etc.).
 *
 * iter-60b BESS audit revealed missing ESM↔control, ESM↔sensing, ESM↔structure,
 * ESM↔maintenance links — the engine had the modules but didn't connect them.
 *
 * Class-aware: silent when no productClass passed or no registry entry.
 */
const crossModuleRequiredLinksGate: GrammarGate = {
  name: 'cross_module_required_links',
  description: 'every product-class-required cross-module connection is present with an appropriate mechanism kind',
  evaluate(modules, crossLinks, productClass) {
    if (!productClass) return emptyResult()
    const block = getClassConnections(productClass)
    if (block.connections.length === 0) return emptyResult()

    // Build a lookup of declared links: pair-key → set of KINDS observed.
    // Uses `mechanismToKind` (exact map + substring fallback) instead of
    // direct `MECHANISM_TO_KIND[]` lookup — pre-2026-05-19 the strict lookup
    // silently dropped 78% of LLM-emitted links because the reviewers used
    // natural-English mechanism names not in the strict map.
    const declared = new Map<string, Set<ConnectionKind>>()
    const addToDeclared = (a: string, b: string, mech: string) => {
      const kind = mechanismToKind(mech)
      if (!kind) return
      const k1 = `${a}<->${b}`, k2 = `${b}<->${a}`
      for (const k of [k1, k2]) {
        if (!declared.has(k)) declared.set(k, new Set())
        declared.get(k)!.add(kind)
      }
    }
    for (const cl of crossLinks ?? []) {
      const fm = String((cl as any).from_module ?? '')
      const tm = String((cl as any).to_module ?? '')
      const mech = String((cl as any).mechanism ?? '')
      if (!fm || !tm || !mech) continue
      addToDeclared(fm, tm, mech)
    }
    // Also count INTRA-module links where the two endpoints span different modules
    // (cross_module_grammar_links is the right place but reviewers sometimes put
    // module-to-module links inside a module's grammar_links by mistake — accept).
    for (const m of modules ?? []) {
      for (const gl of (Array.isArray(m.grammar_links) ? m.grammar_links : [])) {
        const fm = String((gl as any).from_module ?? m.module)
        const tm = String((gl as any).to_module ?? m.module)
        const mech = String((gl as any).mechanism ?? '')
        if (fm !== tm && mech) addToDeclared(fm, tm, mech)
      }
    }

    // 2026-05-20 iter-8 council fix (I): cross-class bleed guard. A required
    // connection that references a module which doesn't exist in the actual
    // design must NOT fire as a missing-link failure — that's a class-
    // connections registry bug (e.g. VF had a bogus "energy_storage_source"
    // edge inherited from BESS terminology). Build the set of modules
    // actually emitted, and skip required-edges whose endpoints are absent.
    const emittedModuleIds = new Set<string>((modules ?? []).map((m: any) => String(m?.module ?? '')).filter(Boolean))
    const missing: string[] = []
    const skipped_registry_bugs: string[] = []
    for (const req of block.connections) {
      if (!emittedModuleIds.has(req.module_a) || !emittedModuleIds.has(req.module_b)) {
        skipped_registry_bugs.push(`${req.module_a} ↔ ${req.module_b} (not in design — class-connections registry references a module the chain didn't emit)`)
        continue
      }
      const key = `${req.module_a}<->${req.module_b}`
      const kinds = declared.get(key)
      if (!kinds || !kinds.has(req.kind)) {
        missing.push(`${req.module_a} ↔ ${req.module_b} [${req.kind}] — ${req.applies_because}`)
      }
    }
    if (skipped_registry_bugs.length > 0) {
      console.error(`[grammar] cross_module_required_links: skipped ${skipped_registry_bugs.length} registry bug(s) for ${block.display_name}: ${skipped_registry_bugs.slice(0, 3).join(' | ')}`)
    }

    if (missing.length === 0) {
      return { score: 300, passed: true, reasons: [`grammar: all ${block.connections.length} required cross-module connections for ${block.display_name} are present`], affected: [] }
    }
    return {
      score: -60 * missing.length,
      passed: false,
      reasons: [`grammar: ${missing.length} required cross-module connection${missing.length === 1 ? '' : 's'} MISSING for ${block.display_name}: ${missing.slice(0, 4).join(' | ')}${missing.length > 4 ? ` ...+${missing.length - 4}` : ''}. FIX: emit add_cross_link patches with the right module_a, module_b, mechanism (any mechanism in the corresponding kind — e.g. for control kind use can_bus / modbus / contactor_command), and a detail explaining the connection.`],
      affected: Array.from(new Set(missing.flatMap(m => m.split(' ↔ ').slice(0, 2).map(s => s.split(' ')[0])))),
    }
  },
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const UNIVERSAL_GRAMMAR_GATES: GrammarGate[] = [
  noOrphanSubModulesGate,
  noDanglingReferencesGate,
  sensorHasReceiverGate,
  controllerHasActuatorGate,
  thermalPathClosesGate,
  powerTopologyClosesGate,
  declaredLinksUniqueGate,
  subModuleWordDensityGate,
  wordModifierRichnessGate,
  moduleProseSubsetOfSubModulesGate,
  subModuleProseCoversWordsGate,
  modifierConsistencyGate,
  spatialPositionCompleteGate,
  crossModuleRequiredLinksGate,
]

export function runGrammarGates(
  modules: ModuleSpec[],
  crossLinks: CrossModuleGrammarLink[],
  productClass?: string,
): {
  total_score: number
  fired: number
  passed: number
  failed: number
  results: Array<GateResult & { name: string }>
} {
  const results = UNIVERSAL_GRAMMAR_GATES.map(g => ({ name: g.name, ...g.evaluate(modules, crossLinks ?? [], productClass) }))
  const fired = results.filter(r => r.score !== 0 || r.reasons.length > 0).length
  const passed = results.filter(r => r.passed && r.score > 0).length
  const failed = results.filter(r => !r.passed).length
  const total = results.reduce((a, r) => a + r.score, 0)
  return { total_score: total, fired, passed, failed, results }
}
