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

// ── Constants ──────────────────────────────────────────────────────────────────

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const LLM_SOURCE = 'llm'
const LLM_CONFIDENCE = 0.7
const MAX_RETRY = 3
const RETRY_DELAY_MS = 50

// ── Module-scoped DB handle ───────────────────────────────────────────────────

let _db: Database.Database | null | undefined = undefined
let _warnedMissing = false

// Prepared statement handles (set once on first open)
let _stmtGetGraph: Database.Statement | null = null
let _stmtGetNodes: Database.Statement | null = null
let _stmtGetEdges: Database.Statement | null = null
let _stmtInsertNode: Database.Statement | null = null
let _stmtInsertEdge: Database.Statement | null = null

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
      const graphRow = _stmtGetGraph.get(productClass) as GraphRow | undefined
      if (!graphRow) return // class not in DB at all; nothing to attach to

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
      const graphRow = _stmtGetGraph.get(productClass) as GraphRow | undefined
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

  // ── 1. DB-first ──────────────────────────────────────────────────────────
  if (db && _stmtGetGraph && _stmtGetNodes && _stmtGetEdges) {
    try {
      const graphRow = _stmtGetGraph.get(productClass) as GraphRow | undefined

      if (graphRow) {
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
            product_class: productClass,
            hit: 'db',
            nodes: graph.nodes.length,
            edges: graph.edges.length,
          })}`,
        )
        return graph
      }
    } catch (err) {
      console.warn(
        `[class-reference-graph-db] DB lookup failed for "${productClass}": ${(err as Error).message} — falling back to baked`,
      )
    }
  }

  // ── 2. Baked fallback ─────────────────────────────────────────────────────
  try {
    await ensureGraphsRegistered()
  } catch (err) {
    console.warn(
      `[class-reference-graph-db] ensureGraphsRegistered failed: ${(err as Error).message}`,
    )
  }

  const baked = getClassReferenceGraph(productClass)
  if (baked) {
    console.error(
      `[class-reference-graph-db] ${JSON.stringify({
        product_class: productClass,
        hit: 'baked',
        nodes: baked.nodes.length,
        edges: baked.edges.length,
      })}`,
    )
    return baked
  }

  console.error(
    `[class-reference-graph-db] ${JSON.stringify({ product_class: productClass, hit: 'miss' })}`,
  )
  return null
}

/** Test-only reset hook — clears the module-scoped DB handle. */
export function _resetForTests(): void {
  if (_db) {
    try { _db.close() } catch { /* no-op */ }
  }
  _db = undefined
  _stmtGetGraph = null
  _stmtGetNodes = null
  _stmtGetEdges = null
  _stmtInsertNode = null
  _stmtInsertEdge = null
  _warnedMissing = false
}
