/**
 * scripts/lib/mass-attribution-stage.ts — Universal per-module mass
 * "consume + attribute" stage (ForgeOS task #38, 2026-06-03).
 *
 * WHAT THIS IS (and is NOT)
 * -------------------------
 * This stage is HONEST and NARROW. It does NOT compute masses, it does not
 * run a physics model, and it never fabricates a number. The "compute every
 * missing structural mass" treadmill is explicitly OUT OF SCOPE. This stage
 * only CONSUMES structural mass quantities the orchestrator/contract already
 * produced and ATTRIBUTES each one to its owning top-level module, then — only
 * when coverage is reasonably complete — SUMS them into a single
 * `total_system_mass_kg` quantity so gate-17 can render a verified mass-cap row.
 *
 * WHY IT EXISTS
 * -------------
 * Per-module structural mass is absent for most modules of most non-BESS
 * classes. That gap blocks two honest things:
 *   (1) the P3 BoM indicative material-cost floor — render-minimal-pdf.tsx's
 *       `deriveDefensibleModuleMassKg` reads a module's own derived_parameters
 *       for a genuine `*_mass_kg`; where one exists the floor lights up.
 *   (2) gate-17's verified Max-gross-mass row — the renderer reads
 *       orchestratorContract.quantities for an achieved system mass
 *       (total_system_mass_kg / in_container_mass_kg / ...); with none present
 *       the row renders honestly as UNVERIFIED ("—").
 * Some contracts ALREADY carry a structural mass under a per-module-shaped key
 * (e.g. the bioreactor's `vessel_mass_kg`, family='mass') but never surface it
 * on the OWNING module's `derived_parameters.module_mass_kg`, and never roll it
 * up. This stage closes exactly that plumbing gap — universally, by shape, with
 * no per-class hand-coding.
 *
 * ALGORITHM (4 steps)
 * -------------------
 *  1. Scan orchestratorContract.quantities for STRUCTURAL mass quantities:
 *     family === 'mass' AND key matches /_mass_kg$/i AND the key's distinctive
 *     token is NOT a process-mass word (substrate|product|biomass|co2|yield|
 *     reagent|media|consumed|theoretical|byproduct|...) AND value > 0.
 *     Namespaced "macro__foo_mass_kg" keys are accepted (the namespace is
 *     stripped before token extraction) but the bioreactor's process-mass keys
 *     all carry family='dimensionless' and are excluded by the family filter
 *     before the word filter even runs.
 *  2. Attribute each structural mass to its top-level module by TIGHT token
 *     match: take the quantity's distinctive non-generic token (len >= 4) and
 *     require it to appear as a token-boundary word in the module id, OR a
 *     sub_module id, OR a sub_module name_human. Conservative: a generic token
 *     (mass/system/total/assembly/...) never attributes; an ambiguous token
 *     that matches >1 module attributes to NONE. Write
 *     module.derived_parameters.module_mass_kg ONLY if the module has no
 *     existing per-module mass key (never overwrite, never duplicate).
 *  3. Sum the attributed structural masses.
 *  4. Emit `total_system_mass_kg` into orchestratorContract.quantities ONLY IF
 *     it is absent AND coverage is reasonably complete (structural mass
 *     attributed to >= ceil(60%) of the CAPITAL-BEARING modules). Otherwise DO
 *     NOT emit a total — an incomplete sum UNDERSTATES system mass and would
 *     mislead the gate-17 mass-cap PASS/FAIL, so gate-17 stays on its honest
 *     "unverified —" path. NEVER fabricate a mass.
 *
 * GATE-SAFETY (verified)
 * ----------------------
 *  - Writing `derived_parameters.module_mass_kg` is shape-safe: the bioreactor
 *    already carries `vessel_mass_kg` in derived_parameters without tripping a
 *    gate, and `module_mass_kg` is the same shape (a bare numeric kg).
 *  - Emitting `total_system_mass_kg` into quantities is safe for gate-12
 *    (numeric-claim-drift): that detector only considers COUNT-suffixed keys
 *    (`/_count$|_qty$|_quantity$|_number$|_num$|^count_/`) and `continue`s on
 *    everything else — a mass key is skipped. It is a NEW quantity, not a
 *    contradiction of any existing one.
 *  - The renderer's IS_AGGREGATE_METRIC_WORD filter already refuses to BoM-
 *    aggregate any *word* shaped like `*_mass_kg` / `total_*_kg`, so neither
 *    new key can leak into the BoM as a phantom priced line.
 *
 * NO-OP GUARANTEE
 * ---------------
 *  - Classes that already carry a system mass (`total_system_mass_kg` etc. — all
 *    BESS-shaped contracts in engineering-contract.ts do) skip the emit in
 *    step 4 (absent-only) and skip every module write in step 2 whose module
 *    already has a per-module mass key. The stage only ever WRITES where a key
 *    is missing — it never mutates an existing value.
 *
 * Pre-change mempalace search: "per-module mass attribution total_system_mass_kg
 *   gate-17 structural mass" — informed by MEMORY drawers
 *   forgeos_metric_map_triple_write_i12b + the gate-17 unverified-row work
 *   (commit b3b81245b, task #38/#39).
 */

// ── Public result type ─────────────────────────────────────────────────────────

export interface MassAttribution {
  /** The structural mass quantity key consumed (e.g. 'vessel_mass_kg'). */
  quantity_key: string
  /** The value in kg. */
  mass_kg: number
  /** The distinctive token used to attribute (e.g. 'vessel'). */
  token: string
  /** The top-level module id it was attributed to. */
  module_id: string
  /** Where it matched: 'module_id' | 'sub_module_id' | 'sub_module_name'. */
  matched_on: 'module_id' | 'sub_module_id' | 'sub_module_name'
  /** True if module.derived_parameters.module_mass_kg was newly written. */
  wrote_module_key: boolean
}

export interface MassAttributionResult {
  /** Structural mass quantities discovered (family='mass', *_mass_kg, value>0, not process). */
  structural_masses_found: number
  /** Per-mass attribution records (only those that found a unique owning module). */
  attributions: MassAttribution[]
  /** Structural masses that found NO unique owning module (left un-attributed; never fabricated). */
  unattributed_keys: string[]
  /** Count of capital-bearing top-level modules (the coverage denominator). */
  capital_modules: number
  /** Count of capital-bearing modules that now carry a per-module structural mass. */
  modules_with_mass: number
  /** ceil(0.60 * capital_modules) — the coverage threshold for emitting a total. */
  coverage_threshold: number
  /** True if a NEW total_system_mass_kg was emitted into quantities. */
  total_emitted: boolean
  /** The emitted total value (kg), or null when not emitted. */
  total_system_mass_kg: number | null
  /** Why the total was / was not emitted (honest, human-readable). */
  total_reason: string
  /** True if the stage mutated nothing (full pre-existing coverage / no structural masses). */
  no_op: boolean
}

// ── Tunables / vocab ────────────────────────────────────────────────────────────

/**
 * PROCESS-mass words. A structural-mass key must NOT contain any of these as a
 * token — they denote consumables / throughput / yield, not the physical mass
 * of a built assembly. (The family==='mass' filter already excludes the
 * bioreactor's process masses, which are all family='dimensionless'; this is a
 * belt-and-braces second line so a mis-tagged family='mass' process quantity
 * still cannot be attributed as structure.)
 */
const PROCESS_MASS_WORDS = new Set([
  'substrate', 'product', 'biomass', 'co2', 'yield', 'reagent', 'media',
  'consumed', 'theoretical', 'byproduct', 'feedstock', 'effluent', 'permeate',
  'retentate', 'broth', 'titre', 'titer', 'protein', 'glucose', 'nutrient',
])

/**
 * GENERIC tokens that are too non-distinctive to safely attribute a mass to a
 * specific module. A structural-mass key whose only candidate token is one of
 * these is left un-attributed (we never guess). These are the words that recur
 * across every class' module ids / quantity names.
 */
const GENERIC_TOKENS = new Set([
  'mass', 'total', 'system', 'gross', 'net', 'empty', 'full', 'dry', 'wet',
  'assembly', 'module', 'modules', 'unit', 'units', 'structure', 'structural',
  'main', 'sub', 'aggregate', 'overall', 'base', 'core', 'whole', 'each',
  'transformer', // ambiguous aggregator artefact (mass_aggregator__transformer_mass_kg) — never own-attribute
])

/** The per-module key this stage writes. */
const MODULE_MASS_KEY = 'module_mass_kg'

/** The rolled-up system key this stage may emit. */
const TOTAL_KEY = 'total_system_mass_kg'

/**
 * Renderer mass keys that already satisfy gate-17 if present in quantities — if
 * ANY of these exists we never emit our own total (the class already has a
 * system mass; this stage stays a no-op on the total).
 */
const PREEXISTING_SYSTEM_MASS_KEYS = [
  TOTAL_KEY, 'system_mass_with_external_kg', 'in_container_mass_kg', 'total_mass_kg',
]

// ── Token helpers (keysMatch-style token-boundary discipline) ────────────────────

/** Split an id on '_' and whitespace into lowercase alphanumeric tokens. */
function tokenize(s: string): string[] {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
}

/**
 * Extract the distinctive token from a structural-mass quantity key.
 *  - Strip a leading "macro__" namespace if present.
 *  - Strip the trailing `_mass_kg`.
 *  - From the remaining tokens, pick the LAST non-generic token of len >= 4
 *    (the noun closest to `_mass_kg`, e.g. `vessel` from `vessel_mass_kg`,
 *    `bedplate` from `nacelle_bedplate_mass_kg`).
 * Returns null when no distinctive token survives (→ leave un-attributed).
 */
export function distinctiveMassToken(key: string): string | null {
  let k = key.toLowerCase()
  const ns = k.indexOf('__')
  if (ns >= 0) k = k.slice(ns + 2) // drop "macro__" namespace
  k = k.replace(/_mass_kg$/i, '')
  const toks = tokenize(k)
  // any process-mass word anywhere in the key disqualifies it as structural
  if (toks.some((t) => PROCESS_MASS_WORDS.has(t))) return null
  for (let i = toks.length - 1; i >= 0; i -= 1) {
    const t = toks[i]
    if (t.length >= 4 && !GENERIC_TOKENS.has(t)) return t
  }
  return null
}

/** Does `token` appear as a whole token-boundary word anywhere in `haystackTokens`? */
function tokenInList(token: string, haystackTokens: string[]): boolean {
  return haystackTokens.includes(token)
}

// ── Module match surface ─────────────────────────────────────────────────────────

interface ModuleMatchSurface {
  module_id: string
  module: any
  /** tokens of the module id */
  idTokens: string[]
  /** tokens of every sub_module id */
  subIdTokens: string[]
  /** tokens of every sub_module name_human */
  subNameTokens: string[]
}

function buildMatchSurface(m: any): ModuleMatchSurface | null {
  const moduleId = typeof m?.module === 'string' ? m.module : null
  if (!moduleId) return null
  const idTokens = tokenize(moduleId)
  const subIdTokens: string[] = []
  const subNameTokens: string[] = []
  for (const sm of Array.isArray(m?.sub_modules) ? m.sub_modules : []) {
    if (typeof sm?.id === 'string') subIdTokens.push(...tokenize(sm.id))
    if (typeof sm?.name_human === 'string') subNameTokens.push(...tokenize(sm.name_human))
  }
  return { module_id: moduleId, module: m, idTokens, subIdTokens, subNameTokens }
}

/**
 * Does this module own `token`? Returns the surface it matched on, in priority
 * order (module id > sub id > sub name), or null. Priority only affects the
 * reported `matched_on`; ownership is binary per module.
 */
function moduleOwnsToken(
  surface: ModuleMatchSurface,
  token: string,
): MassAttribution['matched_on'] | null {
  if (tokenInList(token, surface.idTokens)) return 'module_id'
  if (tokenInList(token, surface.subIdTokens)) return 'sub_module_id'
  if (tokenInList(token, surface.subNameTokens)) return 'sub_module_name'
  return null
}

// ── Per-module existing-mass probe ───────────────────────────────────────────────

/**
 * Does this module already carry a genuine per-module structural mass in its
 * derived_parameters? Mirrors render-minimal-pdf.tsx::deriveDefensibleModuleMassKg
 * (any `*_mass_kg` not a system/envelope/cap aggregate, value > 0). If so we
 * never overwrite — the stage only WRITES where a key is missing.
 */
const DP_MASS_EXCLUDE = /(system|brief|cap|envelope|payload|budget|breach|gross|container|max)/i
function moduleHasStructuralMass(m: any): boolean {
  const dp = m?.derived_parameters
  if (!dp || typeof dp !== 'object') return false
  for (const [k, raw] of Object.entries(dp)) {
    if (!/_mass_kg$/i.test(k)) continue
    if (DP_MASS_EXCLUDE.test(k)) continue
    const v = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(v) && v > 0) return true
  }
  return false
}

/**
 * Is this top-level module CAPITAL-BEARING (a physical, mass-having assembly)?
 * Used only as the coverage DENOMINATOR for the "emit a total?" decision — a
 * conservative heuristic, never used to write anything. Documentation-only /
 * compliance / regulatory / certification modules carry no structural mass by
 * nature and would unfairly drag the coverage ratio down, so they are excluded.
 */
const NON_CAPITAL_MODULE_RE = /(regulator|complian|certif|cgmp|gmp|fda|documentation|standards?|quality_assurance|qa_qc|software|firmware|control_software|labelling|labeling|paperwork|audit_trail)/i
function isCapitalBearingModule(m: any): boolean {
  const id = typeof m?.module === 'string' ? m.module : ''
  return !NON_CAPITAL_MODULE_RE.test(id)
}

// ── Quantity-shape helpers (quantities is a dict: key → {value, family, ...}) ─────

function isStructuralMassQuantity(key: string, entry: any): boolean {
  if (!entry || typeof entry !== 'object') return false
  if (entry.family !== 'mass') return false
  if (!/_mass_kg$/i.test(key)) return false
  const v = typeof entry.value === 'number' ? entry.value : Number(entry.value)
  if (!Number.isFinite(v) || v <= 0) return false
  // process-mass guard (token-level) lives in distinctiveMassToken; require a
  // distinctive structural token to exist at all.
  return distinctiveMassToken(key) != null
}

// ── Main stage ───────────────────────────────────────────────────────────────────

/**
 * Run the universal mass consume+attribute stage. MUTATES IN PLACE:
 *   - writes module.derived_parameters.module_mass_kg on owning modules that
 *     lack any per-module structural mass, and
 *   - (conditionally) writes quantities[total_system_mass_kg].
 * Returns a result describing exactly what it did (for logAction + tests).
 *
 * @param modules     state.moduleDecomposition.modules (mutated in place)
 * @param quantities  state.orchestratorContract.quantities — a dict keyed by
 *                     quantity key (mutated in place). Pass `null`/missing → no-op.
 */
export function runMassAttributionStage(
  modules: any[],
  quantities: Record<string, any> | null | undefined,
): MassAttributionResult {
  const result: MassAttributionResult = {
    structural_masses_found: 0,
    attributions: [],
    unattributed_keys: [],
    capital_modules: 0,
    modules_with_mass: 0,
    coverage_threshold: 0,
    total_emitted: false,
    total_system_mass_kg: null,
    total_reason: '',
    no_op: true,
  }

  const mods = Array.isArray(modules) ? modules : []
  const q = quantities && typeof quantities === 'object' ? quantities : null

  // Build match surfaces once.
  const surfaces: ModuleMatchSurface[] = []
  for (const m of mods) {
    const s = buildMatchSurface(m)
    if (s) surfaces.push(s)
  }

  // ── Step 1: scan for structural mass quantities ────────────────────────────
  const structural: Array<{ key: string; value: number; token: string }> = []
  if (q) {
    for (const [key, entry] of Object.entries(q)) {
      if (!isStructuralMassQuantity(key, entry)) continue
      const token = distinctiveMassToken(key)
      if (!token) continue
      const value = typeof entry.value === 'number' ? entry.value : Number(entry.value)
      structural.push({ key, value, token })
    }
  }
  result.structural_masses_found = structural.length

  // ── Step 2: attribute each structural mass to a UNIQUE owning module ────────
  for (const sm of structural) {
    const owners: Array<{ surface: ModuleMatchSurface; matched_on: MassAttribution['matched_on'] }> = []
    for (const surface of surfaces) {
      const matched = moduleOwnsToken(surface, sm.token)
      if (matched) owners.push({ surface, matched_on: matched })
    }
    if (owners.length !== 1) {
      // 0 owners → no home; >1 owners → ambiguous. Never guess. Leave the mass
      // un-attributed (it still lives in quantities; we just don't pin it to a
      // module, and it will NOT count toward coverage).
      result.unattributed_keys.push(sm.key)
      continue
    }
    const { surface, matched_on } = owners[0]
    const alreadyHas = moduleHasStructuralMass(surface.module)
    let wrote = false
    if (!alreadyHas) {
      const dp = surface.module.derived_parameters ?? (surface.module.derived_parameters = {})
      if (dp[MODULE_MASS_KEY] == null) {
        dp[MODULE_MASS_KEY] = sm.value
        wrote = true
        result.no_op = false
      }
    }
    result.attributions.push({
      quantity_key: sm.key,
      mass_kg: sm.value,
      token: sm.token,
      module_id: surface.module_id,
      matched_on,
      wrote_module_key: wrote,
    })
  }

  // ── Step 3 + 4: coverage + conditional total ───────────────────────────────
  const capitalSurfaces = surfaces.filter((s) => isCapitalBearingModule(s.module))
  result.capital_modules = capitalSurfaces.length

  // A capital module "has a structural mass" if it carried one already OR this
  // stage just attributed one to it.
  const attributedModuleIds = new Set(
    result.attributions.map((a) => a.module_id),
  )
  let modulesWithMass = 0
  for (const s of capitalSurfaces) {
    if (moduleHasStructuralMass(s.module) || attributedModuleIds.has(s.module_id)) {
      modulesWithMass += 1
    }
  }
  result.modules_with_mass = modulesWithMass

  const threshold = capitalSurfaces.length > 0 ? Math.ceil(0.6 * capitalSurfaces.length) : 0
  result.coverage_threshold = threshold

  // Sum the structural masses we have a confident home for (the attributed
  // ones). This is the honest system-mass estimate; an UN-attributed mass is
  // not summed (we are not certain it is structural-for-this-system), but its
  // presence does not block — coverage is judged on capital-module count.
  const attributedSum = result.attributions.reduce((acc, a) => acc + a.mass_kg, 0)

  // Does the class already carry a renderer-visible system mass? If so, NO-OP.
  const preexistingSystemKey = q
    ? PREEXISTING_SYSTEM_MASS_KEYS.find((k) => {
        const e = q[k]
        const v = e && typeof e === 'object' ? (typeof e.value === 'number' ? e.value : Number(e.value)) : NaN
        return Number.isFinite(v) && v > 0
      })
    : undefined

  if (preexistingSystemKey) {
    result.total_reason = `not emitted — class already carries '${preexistingSystemKey}' (no-op; gate-17 already has a verified mass)`
  } else if (!q) {
    result.total_reason = 'not emitted — no orchestratorContract.quantities to write into'
  } else if (capitalSurfaces.length === 0) {
    result.total_reason = 'not emitted — no capital-bearing modules to judge coverage'
  } else if (modulesWithMass < threshold) {
    result.total_reason =
      `not emitted — structural mass covers ${modulesWithMass}/${capitalSurfaces.length} capital modules ` +
      `(< ceil(60%) = ${threshold}); an incomplete sum would UNDERSTATE system mass and mislead the ` +
      `gate-17 mass-cap PASS/FAIL, so gate-17 stays on its honest "unverified —" path`
  } else if (attributedSum <= 0) {
    result.total_reason = 'not emitted — coverage met but attributed structural sum is 0 (nothing to total)'
  } else {
    // Coverage is reasonably complete AND no pre-existing total → emit.
    q[TOTAL_KEY] = {
      value: attributedSum,
      unit: 'kg',
      family: 'mass',
      basis: 'gross_takeoff',
      scope: 'system',
      source: 'calculator',
      source_detail:
        `Σ of ${result.attributions.length} attributed per-module structural mass ` +
        `quantit${result.attributions.length === 1 ? 'y' : 'ies'} ` +
        `(${result.attributions.map((a) => a.quantity_key).join(' + ')}); ` +
        `coverage ${modulesWithMass}/${capitalSurfaces.length} capital modules. ` +
        `Universal mass-attribution stage — consumes existing structural masses, never fabricates.`,
    }
    result.total_emitted = true
    result.total_system_mass_kg = attributedSum
    result.no_op = false
    result.total_reason =
      `emitted total_system_mass_kg=${attributedSum} kg — coverage ${modulesWithMass}/${capitalSurfaces.length} ` +
      `capital modules >= ${threshold} (ceil 60%); Σ of attributed structural masses`
  }

  return result
}
