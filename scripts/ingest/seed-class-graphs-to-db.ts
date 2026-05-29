#!/usr/bin/env -S npx tsx
/**
 * @file scripts/ingest/seed-class-graphs-to-db.ts
 *
 * Seeds the ~21 baked class-reference-graphs (TypeScript snapshots from
 * src/lib/pdf-engine-v2/class-reference-graphs/*.ts) into
 * ~/.forge-truth/forge-truth.db so they can later grow as a live DB.
 *
 * SAFETY: dry-run by default; no writes unless --write is passed explicitly.
 * This script is SEED-ONLY — does NOT change the chain read path. Zero-regression.
 *
 * Usage:
 *   npx tsx scripts/ingest/seed-class-graphs-to-db.ts            # dry-run (default)
 *   npx tsx scripts/ingest/seed-class-graphs-to-db.ts --dry-run  # explicit
 *   npx tsx scripts/ingest/seed-class-graphs-to-db.ts --write    # HUMAN ONLY
 *
 * Schema created in --write mode:
 *   class_reference_graphs  (id, product_class UNIQUE, display_name, source,
 *                             schema_version, scope_notes, created_at, updated_at)
 *   class_graph_nodes        (id, graph_id FK, class_id, role, required, display, created_at)
 *   class_graph_edges        (id, graph_id FK, from_class, to_class, protocol, mechanism,
 *                             required, direction, electrical_json, mechanical_json,
 *                             fluid_json, source_references_json, notes, confidence, created_at)
 *
 * British spelling throughout.
 * Pre-change mempalace search: class-reference-graph seed DB schema -> 0 drawers loaded
 */

import { resolve } from 'node:path'
import { homedir } from 'node:os'
import BetterSqlite3 from 'better-sqlite3'
import {
  ensureGraphsRegistered,
  CLASS_REFERENCE_GRAPHS,
} from '../../src/lib/pdf-engine-v2/class-reference-graph.js'
import type { ProductClassGraph } from '../../src/lib/pdf-engine-v2/class-reference-graph.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const SCHEMA_VERSION = '2026-05-18-k10-baked'
const SOURCE = 'baked_ts'

// ---------------------------------------------------------------------------
// DDL strings
// ---------------------------------------------------------------------------

const DDL_GRAPHS = `
CREATE TABLE IF NOT EXISTS class_reference_graphs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  product_class    TEXT    NOT NULL UNIQUE,
  display_name     TEXT    NOT NULL,
  source           TEXT    NOT NULL DEFAULT 'baked_ts',
  schema_version   TEXT    NOT NULL,
  scope_notes      TEXT,
  created_at       DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at       DATETIME NOT NULL DEFAULT (datetime('now'))
);`.trim()

const DDL_NODES = `
CREATE TABLE IF NOT EXISTS class_graph_nodes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_id   INTEGER NOT NULL REFERENCES class_reference_graphs(id) ON DELETE CASCADE,
  class_id   TEXT    NOT NULL,
  role       TEXT    NOT NULL,
  required   INTEGER NOT NULL DEFAULT 1,
  display    TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_class_graph_nodes_gid ON class_graph_nodes(graph_id);`.trim()

const DDL_EDGES = `
CREATE TABLE IF NOT EXISTS class_graph_edges (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_id               INTEGER NOT NULL REFERENCES class_reference_graphs(id) ON DELETE CASCADE,
  from_class             TEXT    NOT NULL,
  to_class               TEXT    NOT NULL,
  protocol               TEXT,
  mechanism              TEXT,
  required               INTEGER NOT NULL DEFAULT 1,
  direction              TEXT    NOT NULL DEFAULT 'mutual',
  electrical_json        TEXT,
  mechanical_json        TEXT,
  fluid_json             TEXT,
  source_references_json TEXT,
  notes                  TEXT,
  confidence             REAL,
  created_at             DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_class_graph_edges_gid   ON class_graph_edges(graph_id);
CREATE INDEX IF NOT EXISTS idx_class_graph_edges_ft    ON class_graph_edges(graph_id, from_class, to_class);`.trim()

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function maybeJson(val: unknown): string | null {
  if (val === undefined || val === null) return null
  return JSON.stringify(val)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const writeMode = args.includes('--write')
  const dryRun = !writeMode

  console.log(`[seed-class-graphs] mode=${dryRun ? 'DRY-RUN (no writes)' : 'WRITE'}`)
  console.log(`[seed-class-graphs] DB: ${DB_PATH}`)
  console.log()

  // Load all graphs from the baked TypeScript registry.
  await ensureGraphsRegistered()
  const graphs: ProductClassGraph[] = Object.values(CLASS_REFERENCE_GRAPHS).sort(
    (a, b) => a.product_class.localeCompare(b.product_class),
  )

  const totalNodes = graphs.reduce((s, g) => s + g.nodes.length, 0)
  const totalEdges = graphs.reduce((s, g) => s + g.edges.length, 0)

  // -------------------------------------------------------------------------
  // DRY-RUN — print plan and DDL without opening the DB.
  // -------------------------------------------------------------------------
  if (dryRun) {
    console.log('=== DRY-RUN PLAN ===')
    console.log()
    console.log('Would execute CREATE TABLE IF NOT EXISTS for three tables:')
    console.log()
    console.log('--- class_reference_graphs ---')
    console.log(DDL_GRAPHS)
    console.log()
    console.log('--- class_graph_nodes ---')
    console.log(DDL_NODES)
    console.log()
    console.log('--- class_graph_edges ---')
    console.log(DDL_EDGES)
    console.log()
    console.log(`WOULD INSERT ${graphs.length} graph rows  (source='${SOURCE}', schema_version='${SCHEMA_VERSION}')`)
    console.log(`WOULD INSERT ${totalNodes} node rows`)
    console.log(`WOULD INSERT ${totalEdges} edge rows`)
    console.log()
    console.log('--- Per-graph breakdown ---')
    for (const g of graphs) {
      const reqEdges = g.edges.filter(e => e.required).length
      console.log(
        `  ${g.product_class.padEnd(38)}` +
        ` nodes=${String(g.nodes.length).padStart(2)}` +
        `  edges=${String(g.edges.length).padStart(2)}  (required=${reqEdges})`,
      )
    }
    console.log()
    console.log(`=== TOTALS: graphs=${graphs.length}  nodes=${totalNodes}  edges=${totalEdges} ===`)
    console.log()
    console.log('Re-run with --write to perform the actual seed (human only).')
    return
  }

  // -------------------------------------------------------------------------
  // WRITE MODE — human-only.
  // -------------------------------------------------------------------------
  const db = new BetterSqlite3(DB_PATH, { readonly: false })
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(DDL_GRAPHS)
  db.exec(DDL_NODES)
  db.exec(DDL_EDGES)

  const stmtInsertGraph = db.prepare(`
    INSERT OR IGNORE INTO class_reference_graphs
      (product_class, display_name, source, schema_version, scope_notes)
    VALUES (@product_class, @display_name, @source, @schema_version, @scope_notes)
  `)
  const stmtGetGraphId = db.prepare(
    `SELECT id FROM class_reference_graphs WHERE product_class = ?`,
  )
  const stmtInsertNode = db.prepare(`
    INSERT INTO class_graph_nodes (graph_id, class_id, role, required, display)
    VALUES (@graph_id, @class_id, @role, @required, @display)
  `)
  const stmtInsertEdge = db.prepare(`
    INSERT INTO class_graph_edges
      (graph_id, from_class, to_class, protocol, mechanism, required, direction,
       electrical_json, mechanical_json, fluid_json, source_references_json, notes, confidence)
    VALUES
      (@graph_id, @from_class, @to_class, @protocol, @mechanism, @required, @direction,
       @electrical_json, @mechanical_json, @fluid_json, @source_references_json, @notes, @confidence)
  `)

  const seedAll = db.transaction(() => {
    let insertedGraphs = 0
    let skippedGraphs = 0
    let insertedNodes = 0
    let insertedEdges = 0

    for (const g of graphs) {
      const res = stmtInsertGraph.run({
        product_class: g.product_class,
        display_name: g.display_name,
        source: SOURCE,
        schema_version: SCHEMA_VERSION,
        scope_notes: g.scope_notes ?? null,
      })
      if (res.changes === 0) {
        skippedGraphs++
        console.log(`  [skip] ${g.product_class} — already present`)
        continue
      }
      insertedGraphs++
      const row = stmtGetGraphId.get(g.product_class) as { id: number }
      const graphId = row.id

      for (const n of g.nodes) {
        stmtInsertNode.run({
          graph_id: graphId,
          class_id: n.class,
          role: n.role,
          required: n.required ? 1 : 0,
          display: n.display ?? null,
        })
        insertedNodes++
      }

      for (const e of g.edges) {
        stmtInsertEdge.run({
          graph_id: graphId,
          from_class: e.from_class,
          to_class: e.to_class,
          protocol: e.protocol ?? null,
          mechanism: e.mechanism ?? null,
          required: e.required ? 1 : 0,
          direction: e.direction ?? 'mutual',
          electrical_json: maybeJson(e.electrical),
          mechanical_json: maybeJson(e.mechanical),
          fluid_json: maybeJson(e.fluid),
          source_references_json: maybeJson(e.source_references),
          notes: e.notes ?? null,
          confidence: null,
        })
        insertedEdges++
      }

      console.log(
        `  [ok] ${g.product_class}  nodes=${g.nodes.length}  edges=${g.edges.length}`,
      )
    }

    return { insertedGraphs, skippedGraphs, insertedNodes, insertedEdges }
  })

  const result = seedAll()
  db.close()

  console.log()
  console.log(
    `[seed-class-graphs] DONE — inserted=${result.insertedGraphs}` +
    ` skipped=${result.skippedGraphs}` +
    ` nodes=${result.insertedNodes}` +
    ` edges=${result.insertedEdges}`,
  )
}

main().catch(err => {
  console.error('[seed-class-graphs] FATAL:', err)
  process.exit(1)
})
