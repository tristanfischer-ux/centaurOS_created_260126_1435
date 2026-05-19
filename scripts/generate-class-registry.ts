/**
 * @file generate-class-registry.ts — Organic class-registry generator for unknown
 * product classes. Task #87 follow-on to today's K10 extension (15-class
 * coverage). When a brief surfaces a class outside the curated registry the
 * engine currently degrades to a poor template; this script produces priors /
 * connections / standards / hazards / K10-graph fragment + cost-stack ratios
 * for a NEW class on demand and persists the result into a separate SQLite
 * table for human review.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DESIGN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Invocation:
 *   npx tsx scripts/generate-class-registry.ts <slug> [--brief=<path>]
 *
 * One Grok 4.3 call per class (~£1-2). Result is persisted to a NEW SQLite
 * table `auto_class_registry` at `~/.forge-truth/forge-truth.db` (alongside
 * the 30k-supplier table). Subsequent encounters with the same class hit the
 * cache instead of re-paying Grok.
 *
 * Output payload mirrors the shapes used by the curated baseline:
 *   - module taxonomy        — required / optional / forbidden subset of UNIVERSAL_MODULES
 *   - sub-module list        — 3-8 sub-modules per required module
 *   - cross-module edges     — typed (protocol / mechanism / envelopes)
 *   - applicable standards   — jurisdiction + code + scope
 *   - top 5 FMEA hazards
 *   - cost-stack ratios      — labour / overhead / margin / channel / install
 *
 * The result carries `provisional: true` semantics in the cached row plus
 * audit fields (model, prompt version, brief excerpt, generated_at,
 * human_reviewed: false).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROMOTION PATH (human review only — NOT auto-promoted)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A provisional entry in `auto_class_registry` becomes a curated entry by:
 *
 *   1. Engineer inspects the row.
 *   2. Engineer copies the JSON fragments into the four curated files:
 *      - src/lib/pdf-engine-v2/stages/class-module-priors.ts
 *        (CLASS_MODULE_PRIORS[slug] = { required, optional, forbidden })
 *      - src/lib/pdf-engine-v2/class-connections.ts
 *        (new ClassConnections entry)
 *      - src/lib/pdf-engine-v2/class-standards.ts
 *        (new ClassStandards entry)
 *      - src/lib/pdf-engine-v2/class-hazards.ts
 *        (new ClassHazards entry)
 *      - src/lib/pdf-engine-v2/class-reference-graphs/<slug>.ts
 *        (new ProductClassGraph + registerClassReferenceGraph call, plus a
 *         new dynamic import line in ensureGraphsRegistered)
 *      - src/lib/pdf-engine-v2/class-cost-structure.ts
 *        (COST_STACK[slug] = { ...ratios })
 *   3. Engineer marks the row reviewed/promoted.
 *   4. Engineer commits the curated additions on a single PR.
 *
 * This script DOES NOT and MUST NOT auto-promote — auto-promotion would
 * silently pollute the curated baseline with hallucinated taxonomy. Promotion
 * is a human gate.
 *
 * @author Tristan Fischer 2026-05-18 (task #87 dispatch)
 */

import Database from 'better-sqlite3'
import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import {
  callOpenRouter,
  type OpenRouterCallOutput,
} from '../src/lib/ai/openrouter.js'
import {
  UNIVERSAL_MODULES,
  type UniversalModule,
} from '../src/lib/pdf-engine-v2/types/module-decomposition.js'
import { CLASS_MODULE_PRIORS } from '../src/lib/pdf-engine-v2/stages/class-module-priors.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTO_CLASS_REGISTRY_DB_PATH = join(
  homedir(),
  '.forge-truth/forge-truth.db',
)

/**
 * Pin the generator prompt version so each row records which prompt produced
 * it. Bump this string whenever the prompt below changes so historical rows
 * are traceable to the prompt version that emitted them.
 */
export const GENERATOR_PROMPT_VERSION = '2026-05-18-v1'

/**
 * Default OpenRouter model. Grok 4.3 (`x-ai/grok-4.3`) is the spec'd model —
 * picked because it has strong industrial / hardware domain coverage and
 * emits clean JSON when asked. Cap is one Grok call per generation per the
 * dispatch cost constraint.
 */
export const GENERATOR_MODEL = 'x-ai/grok-4.3'

/**
 * Curated classes the engine already covers. Used for the "alias check" step
 * before a generation runs — if the requested slug matches one of these
 * (directly or via synonym), the generator returns the existing slug as alias
 * instead of paying Grok.
 *
 * Kept in lockstep with K10_CLASS_ALIASES in
 * src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts; if you add a
 * curated class there, mirror it here (or refactor both to read a single
 * registry — out of scope for this dispatch).
 */
export const KNOWN_CLASS_SYNONYMS: Readonly<Record<string, string>> = {
  // BESS
  bess: 'bess-utility-scale',
  battery_energy_storage: 'bess-utility-scale',
  battery_storage: 'bess-utility-scale',
  energy_storage: 'bess-utility-scale',
  utility_storage: 'bess-utility-scale',
  // PV
  pv_module: 'pv_module_residential',
  solar_module: 'pv_module_residential',
  solar_panel: 'pv_module_residential',
  pv_panel: 'pv_module_residential',
  photovoltaic_module: 'pv_module_residential',
  pv_inverter: 'pv_string_inverter',
  solar_inverter: 'pv_string_inverter',
  // EV
  ev_charger: 'dc_fast_ev_charger',
  dc_charger: 'dc_fast_ev_charger',
  // Heat pump
  heat_pump: 'heat-pump-residential',
  thermal_system: 'heat-pump-residential',
  commercial_heat_pump: 'heat-pump-commercial',
  industrial_heat_pump: 'heat-pump-commercial',
  // Robotics / industrial
  robot_arm: 'industrial_robot_arm',
  industrial_robot: 'industrial_robot_arm',
  '3d_printer': 'industrial_3d_printer',
  metal_3d_printer: 'industrial_3d_printer',
  // Energy / power
  fuel_cell: 'fuel_cell_power_module',
  hydrogen_electrolyser: 'hydrogen_electrolyser',
  electrolyzer: 'hydrogen_electrolyser',
  vfd: 'vfd-motor-drive',
  motor_drive: 'vfd-motor-drive',
  // Wind
  wind_turbine: 'wind_turbine_small',
  small_wind: 'wind_turbine_small',
  // AUV
  auv: 'auv-subsea',
  autonomous_underwater_vehicle: 'auv-subsea',
  uuv: 'auv-subsea',
  // Misc curated
  insulin_pump: 'insulin_pump',
  vehicle_battery: 'vehicle_battery_pack',
  ev_battery: 'vehicle_battery_pack',
  traction_battery: 'vehicle_battery_pack',
}

// ---------------------------------------------------------------------------
// Types — the structured payload Grok must emit
// ---------------------------------------------------------------------------

export interface AutoCostStackRatios {
  assembly_labour_factor: number
  factory_overhead_factor: number
  manufacturer_margin_factor: number
  channel_markup_factor: number
  installation_cost_factor: number
  notes: string
}

export interface AutoSubModule {
  /** Stable id (snake_case, no spaces). */
  id: string
  /** Short human label. */
  display: string
  /** One-sentence physical role. */
  role: string
}

export interface AutoModuleEntry {
  /** UniversalModule key — must be one of the 12. */
  module: UniversalModule
  /** required | optional | not_applicable. */
  applicability: 'required' | 'optional' | 'not_applicable'
  /** 3-8 sub-modules for required modules; may be empty otherwise. */
  sub_modules: AutoSubModule[]
}

export type AutoConnectionKind =
  | 'electrical'
  | 'thermal'
  | 'control'
  | 'mechanical'
  | 'safety'
  | 'fluid'
  | 'data'
  | 'service'

export interface AutoConnection {
  from_class: UniversalModule
  to_class: UniversalModule
  kind: AutoConnectionKind
  /** Specific protocol or mechanism (open enum — e.g. CANopen, dc_busbar, refrigerant_loop). */
  mechanism: string
  required: boolean
  notes: string
  electrical?: {
    voltage_nominal_v?: number
    current_max_a?: number
    ac_or_dc?: 'AC' | 'DC' | 'either'
  }
  fluid?: {
    medium?: string
    pressure_max_bar?: number
    flow_max_lpm?: number
  }
}

export interface AutoStandard {
  code: string
  title: string
  jurisdiction: 'UK' | 'EU' | 'US' | 'global' | 'ISO' | 'IEC' | 'industry'
  category: string
  mandatory: boolean
  applies_because: string
}

export interface AutoHazard {
  code: string
  title: string
  category:
    | 'thermal'
    | 'electrical'
    | 'mechanical'
    | 'chemical'
    | 'biological'
    | 'software'
    | 'cybersecurity'
    | 'data_protection'
    | 'environmental'
    | 'operational'
    | 'human_factors'
    | 'radiation'
  severity_pre: 1 | 2 | 3 | 4 | 5
  likelihood_pre: 1 | 2 | 3 | 4 | 5
  detectability: 1 | 2 | 3 | 4 | 5
  mechanism: string
  common_mitigations: string[]
}

export interface AutoClassPayload {
  /** Canonical slug for the class. */
  product_class: string
  /** Human display name. */
  display_name: string
  /** Free-form scope notes (what is in / out). */
  scope_notes: string
  /** Module taxonomy. */
  modules: AutoModuleEntry[]
  /** Cross-module typed connections. */
  connections: AutoConnection[]
  /** Applicable regulatory standards. */
  standards: AutoStandard[]
  /** Top 5 FMEA hazards. */
  hazards: AutoHazard[]
  /** Cost-stack ratios. */
  cost_stack: AutoCostStackRatios
  /** Generator's own confidence + caveats. */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  caveats: string[]
}

export interface GeneratorResult {
  ok: true
  /** True when this was a known class (alias resolution); no LLM was called. */
  alias: false
  payload: AutoClassPayload
  /** Audit fields. */
  audit: {
    generator_model: string
    generator_prompt_version: string
    generated_at: string
    brief_excerpt: string
    input_tokens: number
    output_tokens: number
    estimated_cost_gbp: number
  }
}

export interface AliasResult {
  ok: true
  alias: true
  /** Canonical slug returned to the caller. */
  resolved_slug: string
  reason: string
}

export interface GeneratorFailure {
  ok: false
  error: string
  retriable: boolean
}

export type GeneratorOutput = GeneratorResult | AliasResult | GeneratorFailure

// ---------------------------------------------------------------------------
// SQLite — schema, open, idempotent migration
// ---------------------------------------------------------------------------

/**
 * Schema for `auto_class_registry`. Columns:
 *   slug                       — TEXT PRIMARY KEY (the unknown class slug)
 *   display_name               — TEXT
 *   payload_json               — TEXT (the full AutoClassPayload as JSON)
 *   generator_model            — TEXT
 *   generator_prompt_version   — TEXT
 *   generated_at               — TEXT (ISO-8601)
 *   brief_excerpt              — TEXT (first ~4 KB of the brief that triggered the gen)
 *   input_tokens               — INTEGER
 *   output_tokens              — INTEGER
 *   estimated_cost_gbp         — REAL
 *   human_reviewed             — INTEGER (0 = unreviewed, 1 = reviewed)
 *   reviewer_notes             — TEXT (nullable)
 *   promoted_at                — TEXT (nullable; ISO-8601)
 *   promoted_to_files          — TEXT (nullable; comma-separated file paths)
 *
 * Idempotent — CREATE TABLE IF NOT EXISTS. Safe to call on every open.
 */
const AUTO_CLASS_REGISTRY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS auto_class_registry (
    slug                     TEXT PRIMARY KEY,
    display_name             TEXT,
    payload_json             TEXT NOT NULL,
    generator_model          TEXT NOT NULL,
    generator_prompt_version TEXT NOT NULL,
    generated_at             TEXT NOT NULL,
    brief_excerpt            TEXT,
    input_tokens             INTEGER,
    output_tokens            INTEGER,
    estimated_cost_gbp       REAL,
    human_reviewed           INTEGER NOT NULL DEFAULT 0,
    reviewer_notes           TEXT,
    promoted_at              TEXT,
    promoted_to_files        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_auto_class_registry_reviewed
    ON auto_class_registry(human_reviewed);
`

export function openAutoClassRegistryDb(): Database.Database {
  const db = new Database(AUTO_CLASS_REGISTRY_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(AUTO_CLASS_REGISTRY_SCHEMA)
  return db
}

/**
 * Look up a class in the cache. Returns the payload (and audit fields) if a
 * row exists for the slug. Returns null otherwise. Pure read — no writes.
 */
export function loadCachedPayload(
  db: Database.Database,
  slug: string,
): GeneratorResult | null {
  const row = db
    .prepare(
      `SELECT slug, display_name, payload_json, generator_model,
              generator_prompt_version, generated_at, brief_excerpt,
              input_tokens, output_tokens, estimated_cost_gbp
       FROM auto_class_registry WHERE slug = ?`,
    )
    .get(slug) as
    | {
        slug: string
        display_name: string | null
        payload_json: string
        generator_model: string
        generator_prompt_version: string
        generated_at: string
        brief_excerpt: string | null
        input_tokens: number | null
        output_tokens: number | null
        estimated_cost_gbp: number | null
      }
    | undefined
  if (!row) return null
  let payload: AutoClassPayload
  try {
    payload = JSON.parse(row.payload_json) as AutoClassPayload
  } catch (err) {
    console.warn(
      `[generate-class-registry] cached row for ${slug} has invalid JSON; ignoring cache (${
        err instanceof Error ? err.message : String(err)
      })`,
    )
    return null
  }
  return {
    ok: true,
    alias: false,
    payload,
    audit: {
      generator_model: row.generator_model,
      generator_prompt_version: row.generator_prompt_version,
      generated_at: row.generated_at,
      brief_excerpt: row.brief_excerpt ?? '',
      input_tokens: row.input_tokens ?? 0,
      output_tokens: row.output_tokens ?? 0,
      estimated_cost_gbp: row.estimated_cost_gbp ?? 0,
    },
  }
}

/**
 * Persist a generated payload. Idempotent (REPLACE on slug). Stamps audit
 * fields. Always marks human_reviewed = 0 — promotion is a human gate.
 */
export function persistPayload(
  db: Database.Database,
  slug: string,
  payload: AutoClassPayload,
  audit: GeneratorResult['audit'],
): void {
  db.prepare(
    `INSERT OR REPLACE INTO auto_class_registry
      (slug, display_name, payload_json, generator_model,
       generator_prompt_version, generated_at, brief_excerpt,
       input_tokens, output_tokens, estimated_cost_gbp,
       human_reviewed, reviewer_notes, promoted_at, promoted_to_files)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL)`,
  ).run(
    slug,
    payload.display_name,
    JSON.stringify(payload),
    audit.generator_model,
    audit.generator_prompt_version,
    audit.generated_at,
    audit.brief_excerpt,
    audit.input_tokens,
    audit.output_tokens,
    audit.estimated_cost_gbp,
  )
}

// ---------------------------------------------------------------------------
// Alias resolution — short-circuit known classes before paying Grok
// ---------------------------------------------------------------------------

/**
 * Return the canonical curated slug if the requested slug matches one we
 * already have (directly or via the synonym table). Returns null otherwise
 * (caller proceeds to LLM generation).
 *
 * Match is case-insensitive after normalising separators. Also checks
 * CLASS_MODULE_PRIORS keys (the in-code module-prior registry) so anything
 * already in the curated module-prior table is considered "known".
 */
export function resolveKnownAlias(requestedSlug: string): {
  resolved: string
  reason: string
} | null {
  const norm = requestedSlug.trim().toLowerCase().replace(/-/g, '_')
  // 1. Direct hit in CLASS_MODULE_PRIORS.
  if (norm in CLASS_MODULE_PRIORS) {
    return {
      resolved: norm,
      reason: `Direct match in CLASS_MODULE_PRIORS (curated module-prior registry).`,
    }
  }
  // 2. Synonym table — many user-typed slugs alias to a curated one.
  if (norm in KNOWN_CLASS_SYNONYMS) {
    const canonical = KNOWN_CLASS_SYNONYMS[norm]
    return {
      resolved: canonical,
      reason: `Synonym of curated class "${canonical}" (KNOWN_CLASS_SYNONYMS lookup).`,
    }
  }
  // 3. Direct hit on the synonym table values — caller already passed a
  // canonical curated slug.
  const values = Object.values(KNOWN_CLASS_SYNONYMS) as string[]
  if (values.includes(norm) || values.includes(requestedSlug.trim())) {
    return {
      resolved: norm,
      reason: `Slug is already a canonical curated class.`,
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const UNIVERSAL_MODULES_LIST = UNIVERSAL_MODULES.join(', ')

function buildSystemPrompt(): string {
  return [
    'You are an engineering-product-class analyst for ForgeOS. Given a product',
    'class slug and a brief excerpt, you emit a STRUCTURED JSON object describing',
    "the class's module taxonomy, sub-modules, cross-module connections,",
    'applicable standards, top FMEA hazards, and a cost-stack ratio set.',
    '',
    'YOU MUST emit ONE JSON object, NO markdown fences, NO commentary.',
    '',
    'TAXONOMY CONSTRAINTS:',
    `  - The 12 UNIVERSAL_MODULES are: ${UNIVERSAL_MODULES_LIST}.`,
    '  - Every entry in modules[] MUST use one of those 12 keys verbatim.',
    '  - For each module, set applicability to "required", "optional", or',
    '    "not_applicable" based on whether the product class needs it.',
    "  - For every 'required' module, emit 3-8 sub-modules (id snake_case,",
    '    display human-readable, role 1-sentence). For optional modules,',
    '    sub_modules may be a 0-3 list. For not_applicable, sub_modules MUST be [].',
    '',
    'CROSS-MODULE CONNECTIONS:',
    '  - Each connections[] entry has from_class + to_class (UniversalModule keys),',
    '    kind (one of: electrical, thermal, control, mechanical, safety, fluid, data, service),',
    '    mechanism (specific protocol/mechanism string — e.g. "dc_busbar",',
    '    "CANopen", "refrigerant_loop", "mechanical_mount"), required (boolean),',
    '    and a notes prose sentence.',
    '  - Include electrical / fluid envelope blocks where applicable.',
    '  - Aim for 5-12 connections — enough to cover the physically required edges.',
    '',
    'STANDARDS:',
    '  - 4-10 mandatory market-access standards. Each entry: code (canonical short',
    '    code, e.g. "IEC 62619"), title (full standard name), jurisdiction (UK/EU/',
    '    US/global/ISO/IEC/industry), category (cell_safety, system_safety,',
    '    electrical, emc, radio, environmental, transport, lifecycle, quality_management,',
    '    functional_safety, software, usability, risk_management, data_protection,',
    '    sector_specific), mandatory (boolean), applies_because (1-sentence).',
    '',
    'HAZARDS:',
    "  - EXACTLY 5 top FMEA entries. Each: code (e.g. 'THR-01'), title, category",
    '    (thermal/electrical/mechanical/chemical/biological/software/cybersecurity/',
    '    data_protection/environmental/operational/human_factors/radiation),',
    '    severity_pre (1-5), likelihood_pre (1-5), detectability (1-5, higher = harder',
    '    to detect), mechanism (1-sentence), common_mitigations (string[] of 2-5).',
    '',
    'COST STACK RATIOS — calibrate to the archetype:',
    '  - assembly_labour_factor: 0.05-0.30 fraction of raw materials.',
    '  - factory_overhead_factor: 0.10-0.25 fraction of (raw + labour).',
    '  - manufacturer_margin_factor: 0.15-0.60 fraction of factory COGS.',
    '  - channel_markup_factor: 0 (direct/EPC) to 0.55 (regulated retail).',
    '  - installation_cost_factor: 0 (consumer) to 0.80 (civils + EPC).',
    '  - notes: 1-sentence calibration rationale.',
    '  - The compound multiplier raw to installed should be 1.2x to 5x. State the',
    '    rationale in notes.',
    '',
    'CONFIDENCE & CAVEATS:',
    '  - confidence: HIGH / MEDIUM / LOW based on how well-established the class is',
    '    in industry datasheets, standards, and the engineer community.',
    '  - caveats: short list of "needs human review" items (e.g. "exact UN transport',
    '    code depends on chemistry; verify before procurement").',
    '',
    'Return a SINGLE JSON object matching this TypeScript shape:',
    '',
    'interface AutoClassPayload {',
    '  product_class: string',
    '  display_name: string',
    '  scope_notes: string',
    "  modules: Array<{ module: UniversalModule, applicability: 'required'|'optional'|'not_applicable', sub_modules: Array<{ id: string, display: string, role: string }> }>",
    "  connections: Array<{ from_class: UniversalModule, to_class: UniversalModule, kind: 'electrical'|'thermal'|'control'|'mechanical'|'safety'|'fluid'|'data'|'service', mechanism: string, required: boolean, notes: string, electrical?: {...}, fluid?: {...} }>",
    '  standards: Array<{ code, title, jurisdiction, category, mandatory, applies_because }>',
    '  hazards: Array<{ code, title, category, severity_pre, likelihood_pre, detectability, mechanism, common_mitigations: string[] }>',
    '  cost_stack: { assembly_labour_factor, factory_overhead_factor, manufacturer_margin_factor, channel_markup_factor, installation_cost_factor, notes }',
    "  confidence: 'HIGH'|'MEDIUM'|'LOW'",
    '  caveats: string[]',
    '}',
  ].join('\n')
}

function buildUserPrompt(slug: string, briefExcerpt: string): string {
  const truncated = briefExcerpt.slice(0, 4000)
  return [
    `PRODUCT CLASS SLUG: ${slug}`,
    '',
    'BRIEF EXCERPT:',
    truncated || '(no brief provided)',
    '',
    'Emit the AutoClassPayload JSON object now. NO markdown fences.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Validation — every structural rule the Grok payload must satisfy
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  /** Compound cost-stack multiplier raw to installed ASP. */
  cost_stack_multiplier: number
}

export function validatePayload(p: AutoClassPayload): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // --- module taxonomy ---
  if (!Array.isArray(p.modules) || p.modules.length === 0) {
    errors.push('modules[] empty or missing')
  } else {
    const seen = new Set<string>()
    for (const m of p.modules) {
      if (!UNIVERSAL_MODULES.includes(m.module as UniversalModule)) {
        errors.push(`modules[].module "${m.module}" is not a UniversalModule`)
      }
      if (seen.has(m.module)) {
        errors.push(`modules[].module "${m.module}" duplicated`)
      }
      seen.add(m.module)
      if (!['required', 'optional', 'not_applicable'].includes(m.applicability)) {
        errors.push(`modules[].applicability "${m.applicability}" invalid for ${m.module}`)
      }
      if (m.applicability === 'required') {
        if (!Array.isArray(m.sub_modules) || m.sub_modules.length < 3 || m.sub_modules.length > 8) {
          warnings.push(
            `module ${m.module} required but has ${m.sub_modules?.length ?? 0} sub-modules (expected 3-8)`,
          )
        }
      } else if (m.applicability === 'not_applicable') {
        if (Array.isArray(m.sub_modules) && m.sub_modules.length > 0) {
          warnings.push(`module ${m.module} not_applicable but has ${m.sub_modules.length} sub-modules`)
        }
      }
    }
    if (seen.size < UNIVERSAL_MODULES.length) {
      const missing = UNIVERSAL_MODULES.filter(u => !seen.has(u))
      warnings.push(`modules[] does not enumerate every UniversalModule (missing: ${missing.join(', ')})`)
    }
  }

  // --- connections ---
  if (!Array.isArray(p.connections) || p.connections.length < 3) {
    errors.push(`connections[] too short (have ${p.connections?.length ?? 0}, need >=3)`)
  } else {
    for (const c of p.connections) {
      if (!UNIVERSAL_MODULES.includes(c.from_class as UniversalModule)) {
        errors.push(`connections[].from_class "${c.from_class}" not a UniversalModule`)
      }
      if (!UNIVERSAL_MODULES.includes(c.to_class as UniversalModule)) {
        errors.push(`connections[].to_class "${c.to_class}" not a UniversalModule`)
      }
      if (!['electrical', 'thermal', 'control', 'mechanical', 'safety', 'fluid', 'data', 'service'].includes(c.kind)) {
        errors.push(`connections[].kind "${c.kind}" invalid`)
      }
      if (!c.mechanism || typeof c.mechanism !== 'string') {
        errors.push(`connections[] entry missing mechanism (${c.from_class}->${c.to_class})`)
      }
    }
  }

  // --- standards ---
  if (!Array.isArray(p.standards) || p.standards.length < 3) {
    warnings.push(`standards[] short (have ${p.standards?.length ?? 0}, expected >=3)`)
  }

  // --- hazards: exactly 5 ---
  if (!Array.isArray(p.hazards) || p.hazards.length !== 5) {
    errors.push(`hazards[] must be exactly 5 entries (have ${p.hazards?.length ?? 0})`)
  } else {
    for (const h of p.hazards) {
      if (![1, 2, 3, 4, 5].includes(h.severity_pre)) {
        errors.push(`hazard ${h.code} severity_pre out of range (got ${h.severity_pre})`)
      }
      if (![1, 2, 3, 4, 5].includes(h.likelihood_pre)) {
        errors.push(`hazard ${h.code} likelihood_pre out of range (got ${h.likelihood_pre})`)
      }
      if (![1, 2, 3, 4, 5].includes(h.detectability)) {
        errors.push(`hazard ${h.code} detectability out of range (got ${h.detectability})`)
      }
      if (!Array.isArray(h.common_mitigations) || h.common_mitigations.length < 2) {
        warnings.push(`hazard ${h.code} has <2 mitigations`)
      }
    }
  }

  // --- cost-stack: sane multiplier ---
  let multiplier = 1.0
  if (
    p.cost_stack &&
    typeof p.cost_stack.assembly_labour_factor === 'number' &&
    typeof p.cost_stack.factory_overhead_factor === 'number' &&
    typeof p.cost_stack.manufacturer_margin_factor === 'number' &&
    typeof p.cost_stack.channel_markup_factor === 'number' &&
    typeof p.cost_stack.installation_cost_factor === 'number'
  ) {
    const r = p.cost_stack
    const afterLabour = 1 + r.assembly_labour_factor
    const afterOverhead = afterLabour * (1 + r.factory_overhead_factor)
    const afterMargin = afterOverhead * (1 + r.manufacturer_margin_factor)
    const afterChannel = afterMargin * (1 + r.channel_markup_factor)
    multiplier = afterChannel * (1 + r.installation_cost_factor)
    if (multiplier < 1.0) {
      errors.push(`cost-stack multiplier ${multiplier.toFixed(3)} < 1.0 (one factor must be negative)`)
    } else if (multiplier > 8) {
      warnings.push(`cost-stack multiplier ${multiplier.toFixed(3)} >5 — sanity-check ratios`)
    }
    if (r.assembly_labour_factor < 0 || r.assembly_labour_factor > 0.5) {
      warnings.push(`assembly_labour_factor ${r.assembly_labour_factor} out of expected 0-0.5`)
    }
    if (r.manufacturer_margin_factor < 0 || r.manufacturer_margin_factor > 0.8) {
      warnings.push(`manufacturer_margin_factor ${r.manufacturer_margin_factor} out of expected 0-0.8`)
    }
    if (r.installation_cost_factor < 0 || r.installation_cost_factor > 1) {
      warnings.push(`installation_cost_factor ${r.installation_cost_factor} out of expected 0-1`)
    }
  } else {
    errors.push('cost_stack incomplete or missing required factor fields')
  }

  // --- confidence ---
  if (!['HIGH', 'MEDIUM', 'LOW'].includes(p.confidence)) {
    warnings.push(`confidence "${p.confidence}" not in HIGH/MEDIUM/LOW`)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    cost_stack_multiplier: multiplier,
  }
}

// ---------------------------------------------------------------------------
// Cost estimate — Grok 4.3 pricing as of 2026-05-18.
// ---------------------------------------------------------------------------

/**
 * Rough cost in GBP for a single Grok 4.3 call.
 * Pricing reference (OpenRouter): ~$3 / 1M input, ~$15 / 1M output. We use
 * GBP at 0.79 conversion for headline figures.
 */
function estimateCostGbp(inputTokens: number, outputTokens: number): number {
  const inputUsd = (inputTokens / 1_000_000) * 3.0
  const outputUsd = (outputTokens / 1_000_000) * 15.0
  const gbp = (inputUsd + outputUsd) * 0.79
  return Number(gbp.toFixed(4))
}

// ---------------------------------------------------------------------------
// JSON extraction — tolerate fences and stray prose
// ---------------------------------------------------------------------------

function extractJsonObject(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '')
  const firstBrace = s.indexOf('{')
  if (firstBrace > 0) s = s.slice(firstBrace)
  const lastBrace = s.lastIndexOf('}')
  if (lastBrace > 0 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1)
  return s
}

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Brief excerpt to pass to the LLM. Optional but improves quality. */
  briefExcerpt?: string
  /** Pass an open DB handle to share connections (test harness). */
  db?: Database.Database
  /** If true, bypass cache and force a fresh LLM call. */
  forceRefresh?: boolean
}

/**
 * Generate (or alias-resolve) an auto class registry entry for `slug`.
 *
 * Behaviour:
 *   1. If slug resolves to a known curated class -> return AliasResult, no LLM call.
 *   2. Else if a cached payload exists and forceRefresh is false -> return cached.
 *   3. Else: call Grok 4.3, validate, persist, return.
 *
 * Cost cap: ONE Grok call per generation. Caller controls the outer cost
 * envelope (test harness multiplies x class count).
 */
export async function generateClassRegistryEntry(
  slug: string,
  opts: GenerateOptions = {},
): Promise<GeneratorOutput> {
  const normSlug = slug.trim().toLowerCase().replace(/-/g, '_')

  // Step 1 — alias resolution.
  const alias = resolveKnownAlias(normSlug)
  if (alias) {
    return {
      ok: true,
      alias: true,
      resolved_slug: alias.resolved,
      reason: alias.reason,
    }
  }

  // Step 2 — open DB + cache check.
  const db = opts.db ?? openAutoClassRegistryDb()
  const ownsDb = !opts.db
  try {
    if (!opts.forceRefresh) {
      const cached = loadCachedPayload(db, normSlug)
      if (cached) {
        console.error(
          `[generate-class-registry] cache hit for ${normSlug} (model=${cached.audit.generator_model})`,
        )
        return cached
      }
    }

    // Step 3 — call Grok 4.3.
    const briefExcerpt = (opts.briefExcerpt ?? '').slice(0, 4000)
    const system = buildSystemPrompt()
    const user = buildUserPrompt(normSlug, briefExcerpt)

    console.error(`[generate-class-registry] calling ${GENERATOR_MODEL} for ${normSlug}...`)
    const llmResult: OpenRouterCallOutput = await callOpenRouter({
      model: GENERATOR_MODEL,
      system,
      prompt: user,
      maxTokens: 16000,
      timeoutMs: 180_000,
    })

    if (!llmResult.ok) {
      return {
        ok: false,
        error: `LLM call failed: ${llmResult.error}`,
        retriable: llmResult.retriable,
      }
    }

    const jsonText = extractJsonObject(llmResult.text)
    let payload: AutoClassPayload
    try {
      payload = JSON.parse(jsonText) as AutoClassPayload
    } catch (err) {
      return {
        ok: false,
        error: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}. First 300 chars: ${jsonText.slice(0, 300)}`,
        retriable: true,
      }
    }

    // Override product_class to caller's slug — Grok sometimes invents its
    // own canonical slug.
    payload.product_class = normSlug

    const v = validatePayload(payload)
    if (!v.ok) {
      console.warn(
        `[generate-class-registry] validation FAILED for ${normSlug}: ${v.errors.join(' | ')}`,
      )
      return {
        ok: false,
        error: `validation failed: ${v.errors.join('; ')}`,
        retriable: true,
      }
    }
    if (v.warnings.length > 0) {
      console.warn(
        `[generate-class-registry] ${normSlug} validation warnings: ${v.warnings.join(' | ')}`,
      )
    }

    const audit: GeneratorResult['audit'] = {
      generator_model: GENERATOR_MODEL,
      generator_prompt_version: GENERATOR_PROMPT_VERSION,
      generated_at: new Date().toISOString(),
      brief_excerpt: briefExcerpt,
      input_tokens: llmResult.inputTokens,
      output_tokens: llmResult.outputTokens,
      estimated_cost_gbp: estimateCostGbp(llmResult.inputTokens, llmResult.outputTokens),
    }

    persistPayload(db, normSlug, payload, audit)
    console.error(
      `[generate-class-registry] persisted ${normSlug} (in=${llmResult.inputTokens}, out=${llmResult.outputTokens}, cost=GBP${audit.estimated_cost_gbp.toFixed(3)}, multiplier=${v.cost_stack_multiplier.toFixed(2)}x)`,
    )

    return {
      ok: true,
      alias: false,
      payload,
      audit,
    }
  } finally {
    if (ownsDb) db.close()
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.error('Usage: npx tsx scripts/generate-class-registry.ts <slug> [--brief=<path>] [--force]')
    console.error('')
    console.error('  <slug>         The unknown product class slug (e.g. tidal_turbine)')
    console.error('  --brief=<path> Path to a text file containing the brief excerpt')
    console.error('  --force        Bypass cache and force a fresh LLM call')
    process.exit(args.length === 0 ? 1 : 0)
  }
  const slug = args[0]
  const briefArg = args.find(a => a.startsWith('--brief='))
  const force = args.includes('--force')
  let briefExcerpt = ''
  if (briefArg) {
    const path = briefArg.slice('--brief='.length)
    if (!existsSync(path)) {
      console.error(`[generate-class-registry] brief path not found: ${path}`)
      process.exit(1)
    }
    briefExcerpt = readFileSync(path, 'utf-8')
  }
  const out = await generateClassRegistryEntry(slug, {
    briefExcerpt,
    forceRefresh: force,
  })
  if (!out.ok) {
    console.error(`[generate-class-registry] FAILED: ${out.error}`)
    process.exit(2)
  }
  if (out.alias) {
    console.log(
      JSON.stringify({ alias: true, resolved_slug: out.resolved_slug, reason: out.reason }, null, 2),
    )
    return
  }
  console.log(
    JSON.stringify({ alias: false, audit: out.audit, payload: out.payload }, null, 2),
  )
}

const isDirectInvocation = (() => {
  try {
    const argvFile = process.argv[1] ?? ''
    return argvFile.endsWith('generate-class-registry.ts') || argvFile.endsWith('generate-class-registry.tsx')
  } catch {
    return false
  }
})()
if (isDirectInvocation) {
  main().catch(err => {
    console.error('[generate-class-registry] FATAL:', err)
    process.exit(99)
  })
}
