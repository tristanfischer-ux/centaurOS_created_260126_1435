/**
 * @file knowledge/class-reference-graph-db.ts — DB-first lookup for
 * K10 class reference graphs with baked-TS fallback + LLM discovery writeback.
 *
 * Closes the gap documented in CLAUDE.md "PDF Engine v2 corpus tables":
 *   `pretraining_extracted_specs` / class graph data was BAKED into TS files
 *   and had ZERO DB read paths. This module makes the chain a consumer of
 *   `~/.forge-truth/forge-truth.db` for graph data.
 *
 * API contract:
 *
 *   getClassReferenceGraphDBFirst(productClass)
 *     → Promise<ProductClassGraph | null>
 *
 * Behaviour:
 *   1. DB-first: query class_reference_graphs + JOIN nodes/edges from
 *      ~/.forge-truth/forge-truth.db. Reconstruct a ProductClassGraph.
 *   2. Baked fallback: if absent in DB (or DB unavailable), call
 *      ensureGraphsRegistered() + getClassReferenceGraph() from the TS registry.
 *   3. Returns null only if both DB and baked registry miss.
 *
 * Write-back-on-discovery (fire-and-forget, env-guarded):
 *   When a caller passes a `discoveredEdge` or `discoveredNode`, this module
 *   INSERTs it into class_graph_nodes / class_graph_edges with source='llm'
 *   and confidence=0.7. Set SKIP_LIBRARY_WRITEBACK=1 to disable entirely.
 *   All DB writes use retry-on-lock (up to 3 attempts, 50 ms back-off).
 *   The chain is NEVER blocked or thrown into — failures are warn-only.
 *
 * British spelling throughout.
 *
 * Pre-change mempalace search: class-reference-graph DB-first read → 0 drawers
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import type {
  ProductClassGraph,
  GraphNode,
  ConnectionEdge,
  ElectricalEnvelope,
  MechanicalEnvelope,
  FluidEnvelope,
} from '../../class-reference-graph.js'
import {
  ensureGraphsRegistered,
  getClassReferenceGraph,
} from '../../class-reference-graph.js'
import {
  dualSearch,
  type DualSearchHit,
} from '../retrieval/dual-search.js'

// ── Constants ──────────────────────────────────────────────────────────────────

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const LLM_SOURCE = 'llm'
const LLM_CONFIDENCE = 0.7
const MAX_RETRY = 3
const RETRY_DELAY_MS = 50

// ── Embedding (text-embedding-3-small, 1536-d, Float32LE BLOB) ───────────────
// MIRRORS library-writeback.ts:52-81 + specs-writeback.ts:56-85 + products-
// writeback.ts:55-84 EXACTLY (the `pretraining_extracted_*` f32le_blob
// convention) so a class graph is retrievable by the same hybrid (dual-search.ts)
// cosine query the moment it is bootstrapped or grown by writeback. Stored in a
// SIBLING table `class_graph_embeddings` keyed by graph_id (mirrors
// supplier_embeddings being a side table of companies) — the structural
// class_reference_graphs row stays untouched. Without this the class topology is
// search-INVISIBLE: a new/unseen class cannot find the closest existing topology
// to adapt, and writebackDiscoveredNode/Edge grow nodes/edges nobody can
// semantically reach (the audited 2026-06-04 methods EMBED + HYBRID gap).
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

/** sha256(embed_source) prefix — same idempotency convention as the corpus. */
function embedHashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

/** Embed one string → Float32LE Buffer, or null on any failure (graceful). */
async function embedText(text: string): Promise<Buffer | null> {
  if (!OPENAI_KEY) return null
  const src = (text || '').trim()
  if (!src) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: src.slice(0, 4096), model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    const vec = data.data?.[0]?.embedding
    if (!vec || vec.length !== EMBEDDING_DIMS) return null
    const buf = Buffer.alloc(EMBEDDING_DIMS * 4)
    for (let i = 0; i < EMBEDDING_DIMS; i++) buf.writeFloatLE(vec[i], i * 4)
    return buf
  } catch {
    return null
  }
}

// ── Class-graph slug resolution (single source of truth) ─────────────────────
// The chain emits an ENGINE product_class (e.g. `wind_turbine`, `h2_electrolyser`,
// `ev_charger`) that frequently differs from the GRAPH slug the row is keyed on
// (`wind_turbine_small`, `hydrogen_electrolyser`, `dc_fast_ev_charger`).
// Historically each caller carried its own drifted copy of this map (the chain's
// inline K10 ALIASES, generate-class-registry's KNOWN_CLASS_SYNONYMS,
// enrich-state's hyphenated variant) — so `wind_turbine`/`h2_electrolyser`
// resolved in SOME callers and not others, and the K10 writeback wrote to the
// UN-aliased slug (a silent no-op, so aliased classes never grew their graph).
// This is the canonical resolver: every read AND every writeback in this module
// goes through it, so a class can never read from one slug and write to another.
// (2026-05-31 — fixes the wind/h2 "NO_GRAPH" + evcharger phantom-writeback bugs.)
const CLASS_GRAPH_ALIASES: Readonly<Record<string, string>> = {
  // BESS
  bess: 'bess-utility-scale',
  battery_energy_storage: 'bess-utility-scale',
  battery_storage: 'bess-utility-scale',
  energy_storage: 'bess-utility-scale',
  utility_storage: 'bess-utility-scale',
  residential_ess: 'bess-utility-scale',
  // Wind — chain emits `wind_turbine`, graph row is `wind_turbine_small`
  wind_turbine: 'wind_turbine_small',
  small_wind: 'wind_turbine_small',
  windmill: 'wind_turbine_small',
  onshore_wind: 'wind_turbine_small',
  offshore_wind: 'wind_turbine_small',
  hawt: 'wind_turbine_small',
  vawt: 'wind_turbine_small',
  // Hydrogen — chain emits `h2_electrolyser`, graph row is `hydrogen_electrolyser`
  h2_electrolyser: 'hydrogen_electrolyser',
  h2_electrolyzer: 'hydrogen_electrolyser',
  electrolyzer: 'hydrogen_electrolyser',
  electrolyser: 'hydrogen_electrolyser',
  // EV charging
  ev_charger: 'dc_fast_ev_charger',
  'ev-charger': 'dc_fast_ev_charger',
  dc_charger: 'dc_fast_ev_charger',
  // Heat pump
  heat_pump: 'heat-pump-residential',
  'heat-pump': 'heat-pump-residential',
  heatpump: 'heat-pump-residential',
  mini_split_heatpump: 'heat-pump-residential',
  thermal_system: 'heat-pump-residential',
  commercial_heatpump: 'heat-pump-commercial',
  commercial_heat_pump: 'heat-pump-commercial',
  industrial_heat_pump: 'heat-pump-commercial',
  // PV
  pv_module: 'pv_module_residential',
  solar_module: 'pv_module_residential',
  solar_panel: 'pv_module_residential',
  pv_panel: 'pv_module_residential',
  photovoltaic_module: 'pv_module_residential',
  pv_inverter: 'pv_string_inverter',
  solar_inverter: 'pv_string_inverter',
  // Vehicle battery
  vehicle_battery: 'vehicle_battery_pack',
  traction_battery: 'vehicle_battery_pack',
  traction_battery_pack: 'vehicle_battery_pack',
  ev_battery: 'vehicle_battery_pack',
  // VFD / motor drive
  vfd: 'vfd-motor-drive',
  motor_drive: 'vfd-motor-drive',
  // AUV
  auv: 'auv-subsea',
  autonomous_underwater_vehicle: 'auv-subsea',
  uuv: 'auv-subsea',
  // Robotics / additive
  robot_arm: 'industrial_robot_arm',
  industrial_robot: 'industrial_robot_arm',
  '3d_printer': 'industrial_3d_printer',
  metal_3d_printer: 'industrial_3d_printer',
  agv: 'automated_guided_vehicle_agv',
  amr: 'autonomous_mobile_robot_amr',
  // Misc
  fuel_cell: 'fuel_cell_power_module',
  drone: 'consumer_cinematography_drone',
  'vertical-farm': 'vertical_farm',
}

/**
 * Resolve an engine product_class slug to its canonical class-graph slug.
 * Lower-cases + trims, returns the alias target if known, else the slug itself
 * (so direct-match classes and genuinely-new classes pass through unchanged).
 * Exported so non-DB callers (e.g. the chain K10 site) can resolve identically
 * and never drift from this map again.
 */
export function resolveClassGraphSlug(raw: string): string {
  const key = String(raw ?? '').trim().toLowerCase()
  return CLASS_GRAPH_ALIASES[key] ?? key
}

function humaniseSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

// ── Module-scoped DB handle ───────────────────────────────────────────────────

let _db: Database.Database | null | undefined = undefined
let _warnedMissing = false

// Prepared statement handles (set once on first open)
let _stmtGetGraph: Database.Statement | null = null
let _stmtGetNodes: Database.Statement | null = null
let _stmtGetEdges: Database.Statement | null = null
let _stmtInsertNode: Database.Statement | null = null
let _stmtInsertEdge: Database.Statement | null = null
let _stmtBootstrapGraph: Database.Statement | null = null
let _stmtUpsertEmbedding: Database.Statement | null = null
let _stmtGetGraphById: Database.Statement | null = null

function getDb(): Database.Database | null {
  if (_db !== undefined) return _db

  if (process.env.NODE_ENV === 'test') {
    _db = null
    return null
  }

  try {
    if (!existsSync(DB_PATH)) {
      if (!_warnedMissing) {
        console.warn(`[class-reference-graph-db] forge-truth.db not found at ${DB_PATH} — DB reads disabled`)
        _warnedMissing = true
      }
      _db = null
      return null
    }

    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 3000')

    _stmtGetGraph = db.prepare(`
      SELECT id, product_class, display_name, scope_notes
      FROM class_reference_graphs
      WHERE product_class = ?
      LIMIT 1
    `)

    _stmtGetGraphById = db.prepare(`
      SELECT id, product_class, display_name, scope_notes
      FROM class_reference_graphs
      WHERE id = ?
      LIMIT 1
    `)

    _stmtGetNodes = db.prepare(`
      SELECT class_id, role, required, display
      FROM class_graph_nodes
      WHERE graph_id = ?
      ORDER BY id
    `)

    _stmtGetEdges = db.prepare(`
      SELECT from_class, to_class, protocol, mechanism, required, direction,
             electrical_json, mechanical_json, fluid_json,
             source_references_json, notes, confidence
      FROM class_graph_edges
      WHERE graph_id = ?
      ORDER BY id
    `)

    _stmtInsertNode = db.prepare(`
      INSERT INTO class_graph_nodes
        (graph_id, class_id, role, required, display)
      VALUES (?, ?, ?, ?, ?)
    `)

    _stmtInsertEdge = db.prepare(`
      INSERT INTO class_graph_edges
        (graph_id, from_class, to_class, protocol, mechanism, required,
         direction, electrical_json, mechanical_json, fluid_json,
         source_references_json, notes, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Bootstrap a class_reference_graphs row for a never-seen class so the
    // "growing DB" loop can start from the first run. INSERT OR IGNORE makes it
    // concurrency-safe under parallel fire-and-forget writebacks (product_class
    // is UNIQUE). schema_version is NOT NULL with no default, so set it here.
    _stmtBootstrapGraph = db.prepare(`
      INSERT OR IGNORE INTO class_reference_graphs
        (product_class, display_name, source, schema_version, scope_notes)
      VALUES (?, ?, 'llm_bootstrap', 'bootstrap-v1', ?)
    `)

    // Sibling embedding table keyed by graph_id (mirrors supplier_embeddings ↔
    // companies). One row per graph; embedding is a 1536-d Float32LE BLOB (the
    // pretraining_extracted_* convention). embed_hash makes the (re)embed
    // idempotent — skip the network call when the topology text is unchanged.
    // CREATE … IF NOT EXISTS so this self-provisions on first open (no migration
    // file needed; matches how supplier_embeddings / investor_embeddings were
    // created out-of-band).
    db.exec(`
      CREATE TABLE IF NOT EXISTS class_graph_embeddings (
        graph_id   INTEGER PRIMARY KEY REFERENCES class_reference_graphs(id) ON DELETE CASCADE,
        embedding  BLOB    NOT NULL,
        embed_hash TEXT    NOT NULL,
        model      TEXT    NOT NULL,
        dims       INTEGER NOT NULL,
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `)

    _stmtUpsertEmbedding = db.prepare(`
      INSERT INTO class_graph_embeddings
        (graph_id, embedding, embed_hash, model, dims, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(graph_id) DO UPDATE SET
        embedding  = excluded.embedding,
        embed_hash = excluded.embed_hash,
        model      = excluded.model,
        dims       = excluded.dims,
        updated_at = datetime('now')
    `)

    _db = db
    return db
  } catch (err) {
    if (!_warnedMissing) {
      console.warn(`[class-reference-graph-db] DB init failed: ${(err as Error).message} — reads disabled`)
      _warnedMissing = true
    }
    _db = null
    return null
  }
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface GraphRow {
  id: number
  product_class: string
  display_name: string
  scope_notes: string | null
}

interface NodeRow {
  class_id: string
  role: string
  required: number
  display: string | null
}

interface EdgeRow {
  from_class: string
  to_class: string
  protocol: string | null
  mechanism: string | null
  required: number
  direction: string | null
  electrical_json: string | null
  mechanical_json: string | null
  fluid_json: string | null
  source_references_json: string | null
  notes: string | null
  confidence: number | null
}

// ── Reconstruction helpers ────────────────────────────────────────────────────

function parseJsonSafe<T>(raw: string | null): T | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function reconstructNode(row: NodeRow): GraphNode {
  return {
    class: row.class_id,
    role: row.role as GraphNode['role'],
    required: row.required === 1,
    display: row.display ?? undefined,
  }
}

function reconstructEdge(row: EdgeRow): ConnectionEdge {
  return {
    from_class: row.from_class,
    to_class: row.to_class,
    protocol: row.protocol ?? undefined,
    mechanism: (row.mechanism as ConnectionEdge['mechanism']) ?? undefined,
    required: row.required === 1,
    direction: (row.direction ?? 'mutual') as 'mutual' | 'directional',
    electrical: parseJsonSafe<ElectricalEnvelope>(row.electrical_json),
    mechanical: parseJsonSafe<MechanicalEnvelope>(row.mechanical_json),
    fluid: parseJsonSafe<FluidEnvelope>(row.fluid_json),
    source_references: parseJsonSafe<string[]>(row.source_references_json),
    notes: row.notes ?? undefined,
  }
}

// ── Embed-text recipe + (re)embed-on-write ────────────────────────────────────

/**
 * Render a class reference graph as the canonical embed-text — the TOPOLOGY as
 * a string, so a query like "CO2 capture and mineralisation plant" lands near
 * the graphs whose nodes/edges describe the same physical machine.
 *
 *   display_name + scope_notes
 *   + every node's `class_id` and `role`
 *   + every edge's `from_class → to_class` and its `mechanism` (the physical
 *     connection — dc_busbar / cooling_loop / can_bus / …)
 *
 * Space-joined, deduped-by-construction in source order. This is the SAME text
 * the lexical arm of findSimilarClassGraphs searches over (display_name +
 * scope_notes), so query↔index align: the lexical arm catches an exact class
 * token, the semantic arm catches a synonymous topology.
 */
function buildGraphEmbedSource(
  graph: { display_name: string; scope_notes?: string | null },
  nodes: NodeRow[],
  edges: EdgeRow[],
): string {
  const parts: string[] = []
  if (graph.display_name) parts.push(graph.display_name)
  if (graph.scope_notes) parts.push(graph.scope_notes)
  for (const n of nodes) {
    parts.push(n.class_id)
    if (n.role) parts.push(n.role)
  }
  for (const e of edges) {
    parts.push(`${e.from_class} ${e.to_class}`)
    if (e.mechanism) parts.push(e.mechanism)
  }
  return parts.filter(Boolean).join(' ').slice(0, 4096)
}

/**
 * (Re)embed a single graph by id and UPSERT it into class_graph_embeddings.
 * Idempotent: skips the network call when the topology text hash is unchanged
 * (the same embed_hash already stored). Fire-and-forget friendly — never throws.
 * Returns 'embedded' | 'unchanged' | 'skipped' | 'failed' for the backfill
 * harness to count; callers that don't care can ignore it.
 *
 * Called after writebackDiscoveredNode/Edge mutate the graph and after the
 * bootstrap row is created, so the embedding always reflects the CURRENT
 * topology — the "(re)embed whenever the graph mutates" guarantee.
 */
async function reembedGraph(
  graphId: number,
): Promise<'embedded' | 'unchanged' | 'skipped' | 'failed'> {
  const db = getDb()
  if (!db || !_stmtGetGraphById || !_stmtGetNodes || !_stmtGetEdges || !_stmtUpsertEmbedding) {
    return 'skipped'
  }
  try {
    const graphRow = _stmtGetGraphById.get(graphId) as GraphRow | undefined
    if (!graphRow) return 'skipped'
    const nodeRows = _stmtGetNodes.all(graphId) as NodeRow[]
    const edgeRows = _stmtGetEdges.all(graphId) as EdgeRow[]
    const embedSource = buildGraphEmbedSource(graphRow, nodeRows, edgeRows)
    if (!embedSource) return 'skipped'
    const newHash = embedHashOf(embedSource)

    // Idempotency: if the stored hash already matches this topology text, the
    // vector is current — no network call.
    const existing = db
      .prepare(`SELECT embed_hash FROM class_graph_embeddings WHERE graph_id = ?`)
      .get(graphId) as { embed_hash: string } | undefined
    if (existing && existing.embed_hash === newHash) return 'unchanged'

    const embedding = await embedText(embedSource)
    if (!embedding) return 'failed' // no key / non-200 / wrong dims — graceful

    await retryWrite(() => {
      _stmtUpsertEmbedding!.run(graphId, embedding, newHash, EMBEDDING_MODEL, EMBEDDING_DIMS)
    }, `embed:graph:${graphId}`)
    return 'embedded'
  } catch (err) {
    console.warn(`[class-reference-graph-db] reembedGraph(${graphId}) failed: ${(err as Error).message}`)
    return 'failed'
  }
}

// ── Retry-on-lock write helper ────────────────────────────────────────────────

async function retryWrite(fn: () => void, tag: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      fn()
      return
    } catch (err) {
      const msg = (err as Error).message ?? ''
      const isLock = msg.includes('SQLITE_BUSY') || msg.includes('database is locked')
      if (!isLock || attempt === MAX_RETRY) {
        console.warn(`[class-reference-graph-db] write failed (${tag}, attempt ${attempt}): ${msg}`)
        return
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt))
    }
  }
}

// ── Get-or-bootstrap a graph row for write-back ───────────────────────────────
// Resolves the slug to its canonical graph slug, returns the existing row, or —
// for a genuinely-new class never seen before — INSERT OR IGNOREs a bootstrap
// row so the class starts growing its reference graph from the very first run
// ("generate on the fly → add to a DB → read it back next time", Tristan
// 2026-05-31). This is what lets a brand-new class become DB-grounded after one
// sighting instead of re-deriving from scratch every time. Concurrency-safe:
// parallel fire-and-forget writebacks for the same new class collapse onto one
// row via the product_class UNIQUE constraint. Disabled by SKIP_GRAPH_BOOTSTRAP=1
// (and by SKIP_LIBRARY_WRITEBACK=1 upstream, which short-circuits the writeback
// entirely). The bootstrapped graph only feeds the SOFT non-fatal K10 validator,
// so a slightly-imperfect first seed can never hard-break a run.
function ensureGraphRowForWriteback(rawSlug: string): GraphRow | null {
  if (!_stmtGetGraph) return null
  const slug = resolveClassGraphSlug(rawSlug)
  let row = _stmtGetGraph.get(slug) as GraphRow | undefined
  if (row) return row // existing (possibly alias-resolved) class — grow it in place
  if (process.env.SKIP_GRAPH_BOOTSTRAP === '1' || !_stmtBootstrapGraph) return null
  try {
    _stmtBootstrapGraph.run(
      slug,
      humaniseSlug(slug),
      'auto-bootstrapped from chain discovery on first sighting of this class',
    )
    row = _stmtGetGraph.get(slug) as GraphRow | undefined
    if (row) {
      console.error(
        `[class-reference-graph-db] bootstrapped new class graph class=${slug} source=llm_bootstrap (was unseen — now grows DB-first)`,
      )
    }
    return row ?? null
  } catch (err) {
    console.warn(`[class-reference-graph-db] bootstrap insert failed for "${slug}": ${(err as Error).message}`)
    return null
  }
}

// ── Public: discovered edge/node write-back ───────────────────────────────────

export interface DiscoveredNode {
  class_id: string
  role?: string
  required?: boolean
  display?: string
}

export interface DiscoveredEdge {
  from_class: string
  to_class: string
  protocol?: string
  mechanism?: string
  required?: boolean
  direction?: 'mutual' | 'directional'
  electrical?: ElectricalEnvelope
  mechanical?: MechanicalEnvelope
  fluid?: FluidEnvelope
  notes?: string
}

/**
 * Fire-and-forget write-back of a newly discovered node for a product class.
 * Disabled when SKIP_LIBRARY_WRITEBACK=1. Never throws or blocks the chain.
 */
export function writebackDiscoveredNode(
  productClass: string,
  node: DiscoveredNode,
): void {
  if (process.env.SKIP_LIBRARY_WRITEBACK === '1') return

  // Kick off async, never await — chain must not block
  void (async () => {
    const db = getDb()
    if (!db || !_stmtGetGraph || !_stmtInsertNode) return

    try {
      const graphRow = ensureGraphRowForWriteback(productClass)
      if (!graphRow) return // bootstrap disabled or insert failed; nothing to attach to

      // Guard: check if node already exists (coarse dedup by class_id)
      const existingCount = (db.prepare(
        `SELECT COUNT(*) as n FROM class_graph_nodes WHERE graph_id=? AND class_id=?`
      ).get(graphRow.id, node.class_id) as { n: number }).n
      if (existingCount > 0) return

      await retryWrite(() => {
        _stmtInsertNode!.run(
          graphRow.id,
          node.class_id,
          node.role ?? 'subsystem',
          node.required !== false ? 1 : 0,
          node.display ?? null,
        )
      }, `node:${productClass}:${node.class_id}`)

      console.error(`[class-reference-graph-db] wrote node source=llm class=${productClass} node=${node.class_id}`)

      // (Re)embed the graph so the grown topology is immediately semantically
      // searchable (the EMBED-on-write guarantee). Idempotent on the hash.
      await reembedGraph(graphRow.id)
    } catch (err) {
      console.warn(`[class-reference-graph-db] writebackDiscoveredNode failed: ${(err as Error).message}`)
    }
  })()
}

/**
 * Fire-and-forget write-back of a newly discovered edge for a product class.
 * Disabled when SKIP_LIBRARY_WRITEBACK=1. Never throws or blocks the chain.
 */
export function writebackDiscoveredEdge(
  productClass: string,
  edge: DiscoveredEdge,
): void {
  if (process.env.SKIP_LIBRARY_WRITEBACK === '1') return

  void (async () => {
    const db = getDb()
    if (!db || !_stmtGetGraph || !_stmtInsertEdge) return

    try {
      const graphRow = ensureGraphRowForWriteback(productClass)
      if (!graphRow) return

      // Guard: dedup by (from_class, to_class, protocol) — avoid duplicate edges
      const existingCount = (db.prepare(
        `SELECT COUNT(*) as n FROM class_graph_edges
         WHERE graph_id=? AND from_class=? AND to_class=?
           AND (? IS NULL OR protocol=?)`
      ).get(
        graphRow.id,
        edge.from_class,
        edge.to_class,
        edge.protocol ?? null,
        edge.protocol ?? null,
      ) as { n: number }).n
      if (existingCount > 0) return

      await retryWrite(() => {
        _stmtInsertEdge!.run(
          graphRow.id,
          edge.from_class,
          edge.to_class,
          edge.protocol ?? null,
          edge.mechanism ?? null,
          edge.required !== false ? 1 : 0,
          edge.direction ?? 'mutual',
          edge.electrical ? JSON.stringify(edge.electrical) : null,
          edge.mechanical ? JSON.stringify(edge.mechanical) : null,
          edge.fluid ? JSON.stringify(edge.fluid) : null,
          JSON.stringify([`${LLM_SOURCE}:discovery`]),
          edge.notes ?? null,
          LLM_CONFIDENCE,
        )
      }, `edge:${productClass}:${edge.from_class}->${edge.to_class}`)

      console.error(`[class-reference-graph-db] wrote edge source=llm class=${productClass} ${edge.from_class}->${edge.to_class}`)

      // (Re)embed the graph so the grown topology is immediately semantically
      // searchable (the EMBED-on-write guarantee). Idempotent on the hash.
      await reembedGraph(graphRow.id)
    } catch (err) {
      console.warn(`[class-reference-graph-db] writebackDiscoveredEdge failed: ${(err as Error).message}`)
    }
  })()
}

// ── Primary public API ────────────────────────────────────────────────────────

/**
 * DB-first lookup of a K10 class reference graph.
 *
 * 1. Queries class_reference_graphs + JOIN nodes/edges from forge-truth.db.
 * 2. Falls back to the baked in-memory TS registry via getClassReferenceGraph().
 * 3. Returns null only if both miss.
 *
 * Never throws. Logs warnings on DB errors.
 *
 * @param productClass  Canonical product class slug (e.g. 'bess-utility-scale',
 *                      'energy_storage' also resolved via baked ALIASES fallback).
 */
export async function getClassReferenceGraphDBFirst(
  productClass: string,
): Promise<ProductClassGraph | null> {
  const db = getDb()

  // Candidate slugs: the raw slug first (exact match always wins so the 24
  // canonical rows + direct-match classes are untouched), then the alias-resolved
  // graph slug. Dedup so a direct-match class (resolved === raw) is tried once.
  const raw = String(productClass ?? '').trim().toLowerCase()
  const resolved = resolveClassGraphSlug(raw)
  const candidates = resolved === raw ? [raw] : [raw, resolved]

  // ── 1. DB-first (try each candidate) ──────────────────────────────────────
  if (db && _stmtGetGraph && _stmtGetNodes && _stmtGetEdges) {
    for (const slug of candidates) {
      try {
        const graphRow = _stmtGetGraph.get(slug) as GraphRow | undefined
        if (!graphRow) continue

        const nodeRows = _stmtGetNodes.all(graphRow.id) as NodeRow[]
        const edgeRows = _stmtGetEdges.all(graphRow.id) as EdgeRow[]

        const graph: ProductClassGraph = {
          product_class: graphRow.product_class,
          display_name: graphRow.display_name,
          scope_notes: graphRow.scope_notes ?? undefined,
          nodes: nodeRows.map(reconstructNode),
          edges: edgeRows.map(reconstructEdge),
        }

        console.error(
          `[class-reference-graph-db] ${JSON.stringify({
            product_class: raw,
            resolved_to: slug,
            hit: 'db',
            nodes: graph.nodes.length,
            edges: graph.edges.length,
          })}`,
        )
        return graph
      } catch (err) {
        console.warn(
          `[class-reference-graph-db] DB lookup failed for "${slug}": ${(err as Error).message} — falling back to baked`,
        )
      }
    }
  }

  // ── 2. Baked fallback (try each candidate) ────────────────────────────────
  try {
    await ensureGraphsRegistered()
  } catch (err) {
    console.warn(
      `[class-reference-graph-db] ensureGraphsRegistered failed: ${(err as Error).message}`,
    )
  }

  for (const slug of candidates) {
    const baked = getClassReferenceGraph(slug)
    if (baked) {
      console.error(
        `[class-reference-graph-db] ${JSON.stringify({
          product_class: raw,
          resolved_to: slug,
          hit: 'baked',
          nodes: baked.nodes.length,
          edges: baked.edges.length,
        })}`,
      )
      return baked
    }
  }

  console.error(
    `[class-reference-graph-db] ${JSON.stringify({ product_class: raw, hit: 'miss' })}`,
  )
  return null
}

// ── Public: HYBRID semantic read — nearest existing class graphs ──────────────

export interface SimilarClassGraph {
  /** Canonical product_class slug of the matched graph row. */
  product_class: string
  display_name: string
  scope_notes?: string
  /** 0-based rank in the lexical (LIKE) arm, or null if it did not appear. */
  lexical_rank: number | null
  /** 0-based rank in the semantic (cosine) arm, or null if it did not appear. */
  semantic_rank: number | null
  /** Fused Reciprocal Rank Fusion score (higher = closer). */
  rrf_score: number
}

interface GraphLexicalRow {
  id: number
  product_class: string
  display_name: string
  scope_notes: string | null
}

/**
 * HYBRID DB-first search for the class graphs closest to a free-text class
 * description — the read the auto-harvest uses to seed an UNSEEN class from its
 * nearest neighbour ("CO2 capture and mineralisation plant" → the bioreactor /
 * dac / fluid-processing graphs whose topology it can adapt instead of deriving
 * from scratch).
 *
 * Lexical arm: LIKE over `display_name` + `scope_notes` (catches an exact class
 * token). Semantic arm: cosine over the `class_graph_embeddings` BLOB joined to
 * the graph row by graph_id (catches a synonymous topology the LIKE misses).
 * RRF-fused via the shared `dualSearch` — the SAME substrate suppliers + parts
 * use, so the fusion behaviour is identical across stores.
 *
 * Never throws: a missing DB, an un-embedded corpus, or a missing OPENAI key all
 * degrade to lexical-only (or empty) with the dualSearch diagnostic. Excludes
 * `excludeClass` (the unseen class itself, if a bootstrap row already exists) so
 * a class never returns itself as its own nearest neighbour.
 */
export async function findSimilarClassGraphs(
  text: string,
  k: number = 5,
  opts: { excludeClass?: string; dbPath?: string; queryEmbedding?: number[] | null } = {},
): Promise<SimilarClassGraph[]> {
  const query = String(text ?? '').trim()
  if (!query) return []

  const where = opts.excludeClass
    ? `product_class <> '${String(opts.excludeClass).replace(/'/g, "''")}'`
    : undefined

  let result
  try {
    result = await dualSearch<GraphLexicalRow>({
      table: 'class_reference_graphs',
      idColumn: 'id',
      lexicalCols: ['display_name', 'scope_notes'],
      selectCols: ['product_class'],
      embedding: {
        table: 'class_graph_embeddings',
        column: 'embedding',
        format: 'f32le_blob',
        joinColumn: 'graph_id',
      },
      queryText: query,
      queryEmbedding: opts.queryEmbedding ?? undefined,
      k,
      where,
      dbPath: opts.dbPath,
    })
  } catch (err) {
    console.warn(`[class-reference-graph-db] findSimilarClassGraphs failed: ${(err as Error).message}`)
    return []
  }

  return result.hits.map((h: DualSearchHit<GraphLexicalRow>) => ({
    product_class: String(h.row.product_class ?? ''),
    display_name: String(h.row.display_name ?? ''),
    scope_notes: h.row.scope_notes == null ? undefined : String(h.row.scope_notes),
    lexical_rank: h.lexical_rank,
    semantic_rank: h.semantic_rank,
    rrf_score: h.rrf_score,
  }))
}

// ── Public: backfill / explicit (re)embed (for the scheduled sweep + tests) ──

/** (Re)embed the graph for one product_class slug (alias-resolved). Returns the
 *  reembedGraph outcome. Used by the backfill + the verify harness. */
export async function reembedClassGraph(
  productClass: string,
): Promise<'embedded' | 'unchanged' | 'skipped' | 'failed' | 'no-row'> {
  const db = getDb()
  if (!db || !_stmtGetGraph) return 'skipped'
  const slug = resolveClassGraphSlug(productClass)
  const row = (_stmtGetGraph.get(slug) ?? _stmtGetGraph.get(String(productClass).trim().toLowerCase())) as
    | GraphRow
    | undefined
  if (!row) return 'no-row'
  return reembedGraph(row.id)
}

/**
 * (Re)embed EVERY graph in class_reference_graphs (the backfill). Idempotent —
 * graphs whose topology text is unchanged are skipped without a network call.
 * Returns a per-outcome tally. Safe to schedule as a belt-and-braces sweep, the
 * same role scripts/ingest/backfill-embeddings.ts plays for parts/specs.
 */
export async function reembedAllGraphs(): Promise<{
  total: number
  embedded: number
  unchanged: number
  skipped: number
  failed: number
}> {
  const db = getDb()
  const tally = { total: 0, embedded: 0, unchanged: 0, skipped: 0, failed: 0 }
  if (!db) return tally
  const ids = (db.prepare(`SELECT id FROM class_reference_graphs ORDER BY id`).all() as Array<{ id: number }>).map(
    (r) => r.id,
  )
  tally.total = ids.length
  for (const id of ids) {
    const outcome = await reembedGraph(id)
    tally[outcome] += 1
  }
  return tally
}

/** Test-only reset hook — clears the module-scoped DB handle. */
export function _resetForTests(): void {
  if (_db) {
    try { _db.close() } catch { /* no-op */ }
  }
  _db = undefined
  _stmtGetGraph = null
  _stmtGetGraphById = null
  _stmtGetNodes = null
  _stmtGetEdges = null
  _stmtInsertNode = null
  _stmtInsertEdge = null
  _stmtBootstrapGraph = null
  _stmtUpsertEmbedding = null
  _warnedMissing = false
}
