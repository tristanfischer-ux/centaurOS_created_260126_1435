/**
 * scripts/lib/orchestrator/generic/bootstrap-class-graph.ts
 *
 * E6a — CLASS-REFERENCE-GRAPH BOOTSTRAP-ON-MISS (tracker #22).
 *
 * THE WALL THIS KILLS: the generic emitter derives its module skeleton from a
 * class-reference graph (DB-first via getClassReferenceGraphDBFirst, baked-TS
 * fallback). For a NOVEL class both miss and the emitter throws → chain exit 7
 * (out/holdout-tidal-kite-w0-chain.log). The error message's "bootstrap-on-miss"
 * referred to `ensureGraphRowForWriteback` in class-reference-graph-db.ts —
 * but that only creates an EMPTY shell row during the chain's K10 WRITEBACK
 * (which happens AFTER a successful design exists). Chicken-and-egg: the
 * emitter needs the graph BEFORE any design can be produced. This module is
 * the real bootstrap: Stage-0-harvest pattern (corpus + LLM → verify →
 * candidate → consume).
 *
 * PIPELINE (one call per novel slug per run):
 *   (0) reuse: newest VALID row in class_graph_candidates for this slug —
 *       re-runs are deterministic + free (growing-DB principle: DB-first).
 *   (a) corpus-first (read-only): nearest existing class graphs via the
 *       hybrid findSimilarClassGraphs + adjacent pretraining_products /
 *       pretraining_extracted_parts rows matched on slug tokens.
 *   (b) LLM harvest: ONE structured google/gemini-3.5-flash call (OpenRouter,
 *       max_tokens 150_000 per the repo token-budget rule) producing the graph
 *       in the EXACT ProductClassGraph shape the emitter consumes — nodes with
 *       functional roles + derived-parameter hints, edges with mechanisms.
 *   (c) deterministic validation (no LLM decides — G2): node count ∈ [6,16],
 *       exactly one principal, no duplicate node ids, every edge endpoint
 *       exists, required fields present. One retry with the validation errors
 *       fed back; then an HONEST structured failure (G3 — caller keeps exit 7).
 *   (d) G1 governance: the validated graph is stored in a NEW forge-truth.db
 *       table `class_graph_candidates` with status 'candidate' (CHECK
 *       constraint, better-sqlite3 BOUND parameters, slug validated against
 *       /^[a-z0-9_]{1,64}$/ — security item 18 pattern, NEVER interpolated).
 *       The RUN consumes the candidate it just made (in-memory pass-through);
 *       the stored row stays 'candidate' — NO auto-promotion to the canonical
 *       class_reference_graphs table.
 *
 * SCOPE GUARD: only reachable from the generic emitter's graph-miss path,
 * which itself is only reachable on the UNIVERSAL_GENERIC_EMITTER registry-
 * miss path — registered classes (graph always resolves) never get here.
 * Env-gated CLASS_GRAPH_BOOTSTRAP (default ON; set =0 to disable).
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

import type { BriefEnvelope, ParsedConstraints } from '../types'
import type {
  ProductClassGraph,
  GraphNode,
  ConnectionEdge,
  NodeRole,
} from '../../../../src/lib/pdf-engine-v2/class-reference-graph'
import {
  findSimilarClassGraphs,
  getClassReferenceGraphDBFirst,
} from '../../../../src/lib/pdf-engine-v2/lib/knowledge/class-reference-graph-db'
import { buildEnvelopeVector } from '../envelope-vector'
import {
  structuralCacheReuseEnabled,
  structuralCorpusNeighboursEnabled,
  tableHasQuarantineColumn,
  reusableCandidateWhereSql,
  ensureQuarantineColumn,
} from './structural-cache-policy'

// ── Constants ───────────────────────────────────────────────────────────────

const FORGE_TRUTH_DB = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const HARVEST_MODEL = 'google/gemini-3.5-flash'
const MAX_OUTPUT_TOKENS = 150_000 // repo rule: 150_000 everywhere in pdf-engine-v2
const BOOTSTRAP_SOURCE = `bootstrap-on-miss@v1:${HARVEST_MODEL}+corpus`
export const BOOTSTRAP_PROVENANCE = 'bootstrap-candidate@v1'

// Security item 18 pattern: the slug keys DB rows → validate at the boundary,
// bind every value, never string-interpolate.
const SLUG_RE = /^[a-z0-9_]{1,64}$/

const NODE_ROLES: ReadonlySet<string> = new Set<NodeRole>([
  'principal', 'subsystem', 'sensor', 'actuator',
  'communications', 'enclosure', 'safety', 'service',
])

// Closed GrammarMechanism vocabulary (module-decomposition.ts) — offered to the
// LLM; an off-list mechanism is kept (DB stores free text, downstream casts)
// but the prompt strongly steers to this list.
const MECHANISMS = [
  'mechanical_mount', 'pcb_mounting', 'cable_transit', 'fluid_routing', 'door_interlock',
  'voltage_taps', 'dc_busbar', 'ac_busbar', 'high_voltage_dc',
  'contactor_command', 'pre_charge_enable', 'imd_trip', 'sensor_feedback',
  'alarm_interlock', 'safety_isolation', 'manual_override', 'hmi_data',
  'can_bus', 'modbus_tcp', 'i2c_bus', 'spi_bus', 'rf_path', 'fibre_optic',
  'cooling_loop', 'refrigerant_line', 'air_duct',
] as const

// The 12 universal modules — preferred node ids where they fit, because the
// emitter's Tier-C component floor + corpus component union key on them.
const UNIVERSAL_MODULES = [
  'energy_storage_source', 'energy_conversion_transduction', 'structure_containment',
  'sensing_instrumentation', 'control_compute_communication', 'safety_protection',
  'environmental_interface', 'power_distribution', 'maintenance_serviceability',
  'actuation_kinematics', 'mass_fluid_transport_process', 'hmi_ergonomics',
] as const

const MIN_NODES = 6
const MAX_NODES = 16

// ── Public result types ─────────────────────────────────────────────────────

export interface ClassGraphBootstrapSuccess {
  ok: true
  graph: ProductClassGraph
  /** G4 provenance string the emitter surfaces. */
  provenance: typeof BOOTSTRAP_PROVENANCE
  candidate: { id: number; slug: string; version: number; status: string; reused: boolean }
  attempts: number
  corpus: { neighbour_graphs: string[]; adjacent_products: number; adjacent_parts: number }
  llm_cost_usd: number | null
}

export interface ClassGraphBootstrapFailure {
  ok: false
  slug: string
  attempts: number
  stage: 'invalid-slug' | 'no-api-key' | 'llm-call' | 'validation' | 'candidate-store'
  validation_errors: string[]
  error: string
}

export type ClassGraphBootstrapResult = ClassGraphBootstrapSuccess | ClassGraphBootstrapFailure

// ── Deterministic validation (step c — G2: deterministic checks decide) ─────

export interface GraphValidation {
  ok: boolean
  errors: string[]
  graph?: ProductClassGraph
}

/**
 * Validate a raw harvested object into a ProductClassGraph. Pure + deterministic.
 * Checks (per tracker #22): node count ∈ [6,16]; no duplicate node ids; exactly
 * one 'principal' node; every node has a valid snake_case class id + closed-set
 * role + non-empty display; every edge endpoint exists; no duplicate edges;
 * mechanism present on every edge. `derived_parameter_hints` (string[]) is
 * preserved per node — extra field, harmless to the emitter, useful provenance.
 */
export function validateBootstrapGraph(raw: unknown, slug: string): GraphValidation {
  const errors: string[] = []
  const g = raw as Record<string, any>
  if (!g || typeof g !== 'object') return { ok: false, errors: ['graph is not an object'] }

  const displayName = typeof g.display_name === 'string' ? g.display_name.trim() : ''
  if (!displayName) errors.push('display_name missing or empty')

  const rawNodes: any[] = Array.isArray(g.nodes) ? g.nodes : []
  if (rawNodes.length < MIN_NODES || rawNodes.length > MAX_NODES) {
    errors.push(`node count ${rawNodes.length} outside [${MIN_NODES},${MAX_NODES}]`)
  }

  const nodes: GraphNode[] = []
  const nodeIds = new Set<string>()
  let principals = 0
  for (const [i, n] of rawNodes.entries()) {
    const cls = typeof n?.class === 'string' ? n.class.trim() : ''
    if (!SLUG_RE.test(cls)) { errors.push(`node[${i}].class "${cls}" must match /^[a-z0-9_]{1,64}$/`); continue }
    if (nodeIds.has(cls)) { errors.push(`duplicate node id "${cls}"`); continue }
    const role = typeof n?.role === 'string' ? n.role.trim() : ''
    if (!NODE_ROLES.has(role)) { errors.push(`node[${i}] "${cls}" role "${role}" not in {${[...NODE_ROLES].join(', ')}}`); continue }
    const display = typeof n?.display === 'string' ? n.display.trim() : ''
    if (!display) { errors.push(`node[${i}] "${cls}" display missing or empty`); continue }
    if (role === 'principal') principals++
    nodeIds.add(cls)
    const node: GraphNode & { derived_parameter_hints?: string[] } = {
      class: cls,
      role: role as NodeRole,
      required: n?.required !== false, // default true (the emitter treats required as confidence)
      display,
    }
    if (Array.isArray(n?.derived_parameter_hints)) {
      const hints = n.derived_parameter_hints.filter((h: unknown) => typeof h === 'string' && h).slice(0, 12)
      if (hints.length > 0) node.derived_parameter_hints = hints
    }
    nodes.push(node)
  }
  if (principals !== 1) errors.push(`exactly one node must have role 'principal' (got ${principals})`)

  const rawEdges: any[] = Array.isArray(g.edges) ? g.edges : []
  if (rawEdges.length === 0) errors.push('edges missing or empty')
  const edges: ConnectionEdge[] = []
  const edgeKeys = new Set<string>()
  for (const [i, e] of rawEdges.entries()) {
    const from = typeof e?.from_class === 'string' ? e.from_class.trim() : ''
    const to = typeof e?.to_class === 'string' ? e.to_class.trim() : ''
    if (!nodeIds.has(from)) { errors.push(`edge[${i}] from_class "${from}" is not a node`); continue }
    if (!nodeIds.has(to)) { errors.push(`edge[${i}] to_class "${to}" is not a node`); continue }
    const mechanism = typeof e?.mechanism === 'string' ? e.mechanism.trim() : ''
    if (!mechanism) { errors.push(`edge[${i}] ${from}->${to} mechanism missing`); continue }
    const key = `${from}|${to}|${mechanism}`
    if (edgeKeys.has(key)) { errors.push(`duplicate edge ${from}->${to} (${mechanism})`); continue }
    edgeKeys.add(key)
    edges.push({
      from_class: from,
      to_class: to,
      mechanism: mechanism as ConnectionEdge['mechanism'],
      required: e?.required !== false,
      direction: e?.direction === 'directional' ? 'directional' : 'mutual',
      notes: typeof e?.notes === 'string' ? e.notes.slice(0, 200) : undefined,
      source_references: [`llm:${BOOTSTRAP_SOURCE}`],
    })
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    errors: [],
    graph: {
      product_class: slug,
      display_name: displayName,
      scope_notes:
        (typeof g.scope_notes === 'string' ? g.scope_notes.slice(0, 600) : '') +
        ` [${BOOTSTRAP_PROVENANCE}: harvested on registry-miss, NOT human-reviewed]`,
      nodes,
      edges,
    },
  }
}

// ── (a) Corpus-first material (read-only) ───────────────────────────────────

interface CorpusMaterial {
  neighbourSummaries: string
  neighbourSlugs: string[]
  productLines: string[]
  partLines: string[]
}

function slugTokens(slug: string): string[] {
  return slug.split('_').filter(t => t.length >= 4)
}

/** Read-only adjacent-class material from forge-truth.db. Never throws. */
async function gatherCorpusMaterial(slug: string, brief: ParsedConstraints): Promise<CorpusMaterial> {
  const out: CorpusMaterial = { neighbourSummaries: '', neighbourSlugs: [], productLines: [], partLines: [] }

  // Nearest existing class graphs (hybrid lexical+semantic; degrades gracefully).
  // COLD measurement: STRUCTURAL_CORPUS_NEIGHBOURS=0 skips this — neighbour graphs
  // from unrelated plant classes (BESS, electrolyser) poisoned consumer_electronics.
  if (structuralCorpusNeighboursEnabled()) {
    try {
      const desc = String(brief.product_description ?? '').slice(0, 1000) || slug.replace(/_/g, ' ')
      const similar = await findSimilarClassGraphs(desc, 3, { excludeClass: slug })
      const summaries: string[] = []
      for (const s of similar) {
        const full = await getClassReferenceGraphDBFirst(s.product_class)
        if (!full) continue
        out.neighbourSlugs.push(s.product_class)
        const nodeList = full.nodes.map(n => `${n.class}(${n.role}${n.required ? '' : ',optional'})`).join(', ')
        const edgeList = full.edges.slice(0, 12).map(e => `${e.from_class}->${e.to_class}[${e.mechanism ?? e.protocol ?? '?'}]`).join(', ')
        summaries.push(`NEIGHBOUR GRAPH "${s.product_class}" (${full.display_name}):\n  nodes: ${nodeList}\n  edges (sample): ${edgeList}`)
      }
      out.neighbourSummaries = summaries.join('\n')
    } catch (err) {
      console.warn(`[bootstrap-class-graph] neighbour-graph lookup failed: ${(err as Error).message}`)
    }
  } else {
    console.error('[bootstrap-class-graph] STRUCTURAL_CORPUS_NEIGHBOURS disabled — no neighbour graphs in harvest')
  }

  // Adjacent products + parts by slug-token match (read-only).
  if (existsSync(FORGE_TRUTH_DB)) {
    let db: Database.Database | null = null
    try {
      db = new Database(FORGE_TRUTH_DB, { readonly: true })
      db.pragma('busy_timeout = 2000')
      const stmtProducts = db.prepare(
        `SELECT product_name, product_class, modules_json FROM pretraining_products
         WHERE (LOWER(product_class) LIKE ? OR LOWER(product_name) LIKE ?) AND modules_json IS NOT NULL
         LIMIT 4`,
      )
      const stmtParts = db.prepare(
        `SELECT part_name, module_assignment FROM pretraining_extracted_parts
         WHERE LOWER(part_name) LIKE ? AND part_name IS NOT NULL
         LIMIT 8`,
      )
      const seenProducts = new Set<string>()
      const seenParts = new Set<string>()
      for (const tok of slugTokens(slug)) {
        const like = `%${tok}%`
        for (const r of stmtProducts.all(like, like) as Array<{ product_name: string; product_class: string; modules_json: string }>) {
          if (seenProducts.has(r.product_name) || seenProducts.size >= 8) continue
          seenProducts.add(r.product_name)
          let moduleKeys = ''
          try {
            const parsed = JSON.parse(r.modules_json)
            if (Array.isArray(parsed)) moduleKeys = parsed.map((m: any) => m?.module).filter(Boolean).join(', ')
          } catch { /* ignore */ }
          out.productLines.push(`- ${r.product_name} (class ${r.product_class}; modules: ${moduleKeys || 'n/a'})`)
        }
        for (const r of stmtParts.all(like) as Array<{ part_name: string; module_assignment: string | null }>) {
          const key = r.part_name.toLowerCase()
          if (seenParts.has(key) || seenParts.size >= 20) continue
          seenParts.add(key)
          out.partLines.push(`- ${r.part_name}${r.module_assignment ? ` (module: ${r.module_assignment})` : ''}`)
        }
      }
    } catch (err) {
      console.warn(`[bootstrap-class-graph] corpus read failed: ${(err as Error).message}`)
    } finally {
      try { db?.close() } catch { /* no-op */ }
    }
  }

  return out
}

// ── (b) LLM harvest — ONE structured call per attempt ───────────────────────

function buildHarvestPrompt(
  slug: string,
  brief: ParsedConstraints,
  envelope: BriefEnvelope,
  corpus: CorpusMaterial,
  priorErrors: string[],
): string {
  const desc = String(brief.product_description ?? '').slice(0, 5000)
  const vector = buildEnvelopeVector(brief)
  const vectorLines = [
    ...vector.capacities.map(q => `- capacity ${q.key}: ${q.raw.value} ${q.raw.unit} (${q.source})`),
    ...vector.physical_dims.map(q => `- dimension ${q.key}: ${q.raw.value} ${q.raw.unit} (${q.source})`),
    ...(vector.mass ? [`- mass: ${vector.mass.raw.value} ${vector.mass.raw.unit} (${vector.mass.source})`] : []),
    `- mobility_class: ${vector.mobility_class}`,
    `- medium: ${vector.environment.medium}`,
  ].join('\n')

  return (
    `You are a senior systems engineer decomposing a NOVEL product class into a class-reference graph ` +
    `for a deterministic engineering-design pipeline. The pipeline has never seen this class; your graph ` +
    `becomes its module skeleton (one design module per node) and its connectivity prior (one grammar ` +
    `link per edge). Be physically faithful to THIS product — do not force it into the nearest familiar archetype.\n\n` +
    `PRODUCT CLASS SLUG: "${slug}"\n` +
    `ENVELOPE: scale_tier=${envelope.scale_tier}, voltage_tier=${envelope.voltage_tier}, form_factor=${envelope.form_factor}\n\n` +
    `BRIEF:\n${desc}\n\n` +
    `ENVELOPE VECTOR (deterministic extraction from the brief):\n${vectorLines}\n\n` +
    (corpus.neighbourSummaries
      ? `NEAREST EXISTING CLASS GRAPHS (structural priors — adapt, do not copy; this product's physics differ):\n${corpus.neighbourSummaries}\n\n`
      : '') +
    (corpus.productLines.length > 0
      ? `ADJACENT REAL PRODUCTS IN THE CORPUS:\n${corpus.productLines.join('\n')}\n\n`
      : '') +
    (corpus.partLines.length > 0
      ? `ADJACENT REAL PARTS IN THE CORPUS:\n${corpus.partLines.join('\n')}\n\n`
      : '') +
    `OUTPUT RULES (validated deterministically — violations are rejected):\n` +
    `1. ${MIN_NODES}-${MAX_NODES} nodes. EXACTLY ONE node has role "principal" (the dominant energy/function module).\n` +
    `2. node.class is a snake_case id matching /^[a-z0-9_]{1,64}$/. PREFER these universal module ids where they ` +
    `genuinely fit (the pipeline's component library keys on them): ${UNIVERSAL_MODULES.join(', ')}. ` +
    `Add class-specific nodes (snake_case) only for subsystems the universal set cannot express.\n` +
    `3. node.role ∈ {principal, subsystem, sensor, actuator, communications, enclosure, safety, service}.\n` +
    `4. node.display = short human-readable label naming the REAL hardware (like "Generator (PMSG direct-drive) + AC-DC-AC inverter").\n` +
    `5. node.derived_parameter_hints = 2-6 snake_case quantity names an engineer would size this module by (e.g. rated_power_kw, tether_length_m).\n` +
    `6. Every edge's from_class/to_class MUST be node ids from YOUR node list. No duplicate edges.\n` +
    `7. edge.mechanism — STRONGLY prefer one of: ${MECHANISMS.join(', ')}. direction: "mutual" or "directional".\n` +
    `8. required: true for mission-critical nodes/edges, false for optional ones.\n` +
    (priorErrors.length > 0
      ? `\nYOUR PREVIOUS ATTEMPT FAILED DETERMINISTIC VALIDATION. Fix EVERY error:\n${priorErrors.map(e => `- ${e}`).join('\n')}\n`
      : '') +
    `\nReturn STRICT JSON only (no markdown fence, no commentary):\n` +
    `{"display_name": "<class display name>", "scope_notes": "<2-4 sentences: what is in/out of scope>", ` +
    `"nodes": [{"class": "...", "role": "...", "required": true, "display": "...", "derived_parameter_hints": ["..."]}], ` +
    `"edges": [{"from_class": "...", "to_class": "...", "mechanism": "...", "required": true, "direction": "mutual", "notes": "<=200 chars"}]}`
  )
}

interface HarvestOutcome {
  parsed: unknown | null
  costUsd: number | null
  error: string | null
}

async function harvestGraphViaLLM(prompt: string): Promise<HarvestOutcome> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return { parsed: null, costUsd: null, error: 'OPENROUTER_API_KEY not set' }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS E6a class-graph bootstrap',
      },
      body: JSON.stringify({
        model: HARVEST_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) return { parsed: null, costUsd: null, error: `OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }
    const j: any = await res.json()
    const costUsd = typeof j?.usage?.cost === 'number' ? j.usage.cost : null
    const rawContent = j?.choices?.[0]?.message?.content
    if (!rawContent || typeof rawContent !== 'string') {
      return { parsed: null, costUsd, error: `empty completion (finish_reason=${j?.choices?.[0]?.finish_reason ?? '?'})` }
    }
    let cleaned = rawContent.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    const a = cleaned.indexOf('{')
    const b = cleaned.lastIndexOf('}')
    if (a === -1 || b === -1) return { parsed: null, costUsd, error: 'no JSON object in completion' }
    try {
      return { parsed: JSON.parse(cleaned.slice(a, b + 1)), costUsd, error: null }
    } catch (err) {
      return { parsed: null, costUsd, error: `JSON parse failed: ${(err as Error).message}` }
    }
  } catch (err) {
    return { parsed: null, costUsd: null, error: `OpenRouter call failed: ${(err as Error).message}` }
  }
}

// ── (d) G1 candidate store — class_graph_candidates ─────────────────────────

function openCandidateDb(dbPath: string = FORGE_TRUTH_DB): Database.Database {
  const db = new Database(dbPath, { timeout: 30_000 })
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 3000')
  db.exec(`CREATE TABLE IF NOT EXISTS class_graph_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  graph_json TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','shadow','approved')),
  UNIQUE(slug, version)
);`)
  ensureQuarantineColumn(db, 'class_graph_candidates')
  return db
}

/** Boundary validation BEFORE any DB use (security item 18 pattern). */
/** `<class>__<8hex of application>` — see the note in bootstrapClassGraph. Falls back to
 *  the bare class when the envelope carries no application, which preserves the old
 *  behaviour rather than inventing a key. */
export function scopeSlugByApplication(baseSlug: string, application?: string): string {
  const app = String(application ?? '').trim().toLowerCase()
  if (!app) return baseSlug
  const fp = createHash('sha1').update(app).digest('hex').slice(0, 8)
  return `${baseSlug}__${fp}`
}

export function assertCandidateSlug(slug: string): void {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(`[bootstrap-class-graph] candidate-store input rejected: ${JSON.stringify({
      error: 'candidate_store_input_rejected',
      field: 'slug',
      rule: 'must match /^[a-z0-9_]{1,64}$/',
      value: String(slug).slice(0, 120),
    })}`)
  }
}

interface CandidateRow { id: number; slug: string; version: number; graph_json: string; status: string }

/** Newest stored candidate for a slug (any status), or null. Read-only. */
export function latestCandidate(slug: string, dbPath: string = FORGE_TRUTH_DB): CandidateRow | null {
  assertCandidateSlug(slug)
  // COLD / quarantine policy (2026-07-27) — see structural-cache-policy.ts
  if (!structuralCacheReuseEnabled()) {
    console.error('[bootstrap-class-graph] STRUCTURAL_CACHE_REUSE disabled — skipping candidate reuse (cold miss path)')
    return null
  }
  if (!existsSync(dbPath)) return null
  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 2000')
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='class_graph_candidates'`).get()
    if (!exists) return null
    const qCol = tableHasQuarantineColumn(db, 'class_graph_candidates')
    const qSql = reusableCandidateWhereSql(qCol)
    return (db.prepare(
      `SELECT id, slug, version, graph_json, status FROM class_graph_candidates
       WHERE slug = ? ${qSql} ORDER BY version DESC LIMIT 1`,
    ).get(slug) as CandidateRow | undefined) ?? null
  } catch (err) {
    console.warn(`[bootstrap-class-graph] latestCandidate read failed: ${(err as Error).message}`)
    return null
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }
}

/** INSERT a new candidate row (status 'candidate', version = MAX+1, atomic). */
export function storeCandidate(slug: string, graph: ProductClassGraph, dbPath: string = FORGE_TRUTH_DB): { id: number; version: number; status: string } {
  assertCandidateSlug(slug)
  let db: Database.Database | null = null
  try {
    db = openCandidateDb(dbPath)
    const info = db.prepare(
      `INSERT INTO class_graph_candidates (slug, version, graph_json, source, status)
       VALUES (@slug,
               COALESCE((SELECT MAX(version) FROM class_graph_candidates WHERE slug = @slug), 0) + 1,
               @graphJson, @source, 'candidate')`,
    ).run({ slug, graphJson: JSON.stringify(graph), source: BOOTSTRAP_SOURCE })
    const row = db.prepare(
      `SELECT id, version, status FROM class_graph_candidates WHERE rowid = ?`,
    ).get(info.lastInsertRowid) as { id: number; version: number; status: string }
    return row
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }
}

// ── Main entry ──────────────────────────────────────────────────────────────

/**
 * Bootstrap a class-reference graph for a NOVEL slug. The returned graph is an
 * in-memory pass-through for THIS run; the stored row stays status 'candidate'
 * (G1 — promotion to class_reference_graphs is a separate, human/shadow-gated
 * step). Never writes to the canonical class_reference_graphs table.
 */
export async function bootstrapClassGraph(
  rawSlug: string,
  brief: ParsedConstraints,
  envelope: BriefEnvelope,
): Promise<ClassGraphBootstrapResult> {
  // Normalise hyphens (genericEnvelope hyphenates non-minted novel slugs) to
  // the candidate-store alphabet, then validate at the boundary.
  // FUNCTION-SCOPED SLUG (2026-07-27). The candidate store is keyed on the class slug
  // alone, so the FIRST product in a class permanently defines the module skeleton for
  // every later product in it. Observed live: a benchtop battery cell cycler classified
  // `consumer_electronics` reused candidate_id=13 (9 nodes / 15 edges, reused=true) that
  // had been bootstrapped for a microgravity RPM appliance, and inherited an
  // actuation_kinematics module with a 2-axis gimbal "to time-average gravity", a
  // mass_fluid_transport_process module with a perfusion pump, and fluorescence imaging.
  // The skeleton critic scored it 1/10 and called it unrecoverable.
  //
  // This directly contradicts the engine's own AIM — universal, any/unknown archetype.
  // A class is a SHAPE hint, not a design: two products that share a class can be
  // functionally unrelated. Scoping the stored graph by the envelope's own `application`
  // means a functionally different product bootstraps its OWN graph, while a genuine
  // re-run of the same product still reuses and stays deterministic (the reason the
  // store exists).
  const slug = String(rawSlug ?? '').trim().toLowerCase().replace(/-/g, '_')
  // Scope only the STORE KEY, never `slug` itself: `slug` also becomes the graph's own
  // product_class (below) and is what validation checks, so rewriting it would leak a
  // hashed name into the graph's semantics and into any downstream class lookup.
  const storeKey = scopeSlugByApplication(slug, envelope?.application)
  if (!SLUG_RE.test(slug) || !SLUG_RE.test(storeKey)) {
    return { ok: false, slug, attempts: 0, stage: 'invalid-slug', validation_errors: [], error: `slug "${rawSlug}" does not sanitise to /^[a-z0-9_]{1,64}$/` }
  }

  // (0) Reuse: a previously stored candidate makes re-runs free + deterministic.
  const prior = latestCandidate(storeKey)
  if (prior) {
    try {
      const v = validateBootstrapGraph(JSON.parse(prior.graph_json), slug)
      if (v.ok && v.graph) {
        console.error(
          `[bootstrap-class-graph] REUSING stored candidate slug=${slug} version=${prior.version} status=${prior.status} (no LLM call)`,
        )
        return {
          ok: true, graph: v.graph, provenance: BOOTSTRAP_PROVENANCE,
          candidate: { id: prior.id, slug, version: prior.version, status: prior.status, reused: true },
          attempts: 0, corpus: { neighbour_graphs: [], adjacent_products: 0, adjacent_parts: 0 }, llm_cost_usd: null,
        }
      }
      console.warn(`[bootstrap-class-graph] stored candidate v${prior.version} for ${slug} fails current validation (${v.errors.length} errors) — re-harvesting`)
    } catch { /* corrupt row — re-harvest */ }
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, slug, attempts: 0, stage: 'no-api-key', validation_errors: [], error: 'OPENROUTER_API_KEY not set — cannot harvest' }
  }

  // (a) Corpus-first material.
  const corpus = await gatherCorpusMaterial(slug, brief)
  console.error(
    `[bootstrap-class-graph] corpus material for ${slug}: neighbour_graphs=[${corpus.neighbourSlugs.join(', ') || 'none'}], ` +
    `adjacent_products=${corpus.productLines.length}, adjacent_parts=${corpus.partLines.length}`,
  )

  // (b)+(c) Harvest → validate, one retry with the errors fed back.
  let attempts = 0
  let totalCost = 0
  let lastErrors: string[] = []
  let lastError = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt
    const prompt = buildHarvestPrompt(slug, brief, envelope, corpus, lastErrors)
    const outcome = await harvestGraphViaLLM(prompt)
    if (outcome.costUsd) totalCost += outcome.costUsd
    if (!outcome.parsed) {
      lastError = outcome.error ?? 'unknown harvest failure'
      console.warn(`[bootstrap-class-graph] attempt ${attempt} LLM harvest failed: ${lastError}`)
      lastErrors = []
      continue
    }
    const v = validateBootstrapGraph(outcome.parsed, slug)
    if (!v.ok || !v.graph) {
      lastErrors = v.errors
      lastError = `deterministic validation failed (${v.errors.length} errors)`
      console.warn(`[bootstrap-class-graph] attempt ${attempt} validation failed:\n  ${v.errors.join('\n  ')}`)
      continue
    }

    // (d) G1 candidate store — row stays 'candidate'; the run consumes in-memory.
    let candidate: { id: number; version: number; status: string }
    try {
      candidate = storeCandidate(storeKey, v.graph)
    } catch (err) {
      return {
        ok: false, slug, attempts, stage: 'candidate-store', validation_errors: [],
        error: `graph validated but candidate-store insert failed: ${(err as Error).message}`,
      }
    }
    console.error(
      `[bootstrap-class-graph] BOOTSTRAPPED slug=${slug} nodes=${v.graph.nodes.length} edges=${v.graph.edges.length} ` +
      `candidate_id=${candidate.id} version=${candidate.version} status=${candidate.status} ` +
      `attempts=${attempts} cost_usd=${totalCost.toFixed(4)} (stored as CANDIDATE only — no auto-promotion)`,
    )
    return {
      ok: true, graph: v.graph, provenance: BOOTSTRAP_PROVENANCE,
      candidate: { id: candidate.id, slug, version: candidate.version, status: candidate.status, reused: false },
      attempts,
      corpus: { neighbour_graphs: corpus.neighbourSlugs, adjacent_products: corpus.productLines.length, adjacent_parts: corpus.partLines.length },
      llm_cost_usd: totalCost > 0 ? totalCost : null,
    }
  }

  // G3: honest structured failure — the caller keeps the exit-7 hard fail.
  return {
    ok: false, slug, attempts,
    stage: lastErrors.length > 0 ? 'validation' : 'llm-call',
    validation_errors: lastErrors,
    error: lastError || 'harvest exhausted both attempts',
  }
}
