/**
 * @file reverse-indexes.ts — in-memory process→companies and material→companies
 *                            indexes built from nightshift.db at call time.
 *
 * Scope (D1 + D2 MVP):
 *   - process_name   → [companyIds]   (D1)
 *   - material_name  → [companyIds]   (D2)
 *
 * Built lazily on first call by scanning:
 *   - companies.process_capabilities_json (JSON array of {process_name, materials_worked})
 *
 * ~27k companies × ~3 processes avg = ~80k entries. In-memory build takes
 * ~1.5 s on M1. Result cached for the life of the process.
 *
 * No writes to nightshift.db — builds a sibling Map in Node heap.
 *
 * Used by Stage 5 as a keyword-based broadening step when semantic search
 * misses a well-known process/material (e.g. the LLM names a part with
 * "turning + 6061-T6" but no supplier's description mentions those words;
 * reverse index finds the ~500 companies that claim to do it).
 */

import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const NIGHTSHIFT_DB = join(
  homedir(),
  'Library/Application Support/com.fractionalforge.nightshift/nightshift.db',
)

interface IndexCache {
  processToCompanies: Map<string, Set<string>>
  materialToCompanies: Map<string, Set<string>>
  built: boolean
  buildMs: number
}

let _cache: IndexCache | null = null

/**
 * Normalise a process / material name for lookup. Lowercase, strip
 * punctuation, collapse whitespace. A search for "CNC Milling" hits
 * a supplier claiming "cnc_milling" or "CNC milling" alike.
 */
function normaliseKey(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tryOpenDb(): Database.Database | null {
  try {
    if (!existsSync(NIGHTSHIFT_DB)) return null
    const db = new Database(NIGHTSHIFT_DB, { readonly: true, fileMustExist: true })
    db.pragma('query_only = true')
    return db
  } catch {
    return null
  }
}

/**
 * Build the reverse indexes in-memory. Fast enough to call at pipeline
 * start but cached so subsequent calls are free.
 */
export function buildReverseIndexes(): IndexCache | null {
  if (_cache) return _cache
  const start = Date.now()
  const db = tryOpenDb()
  if (!db) {
    console.log('[reverse-indexes] nightshift.db not found, indexes unavailable')
    return null
  }

  const processToCompanies = new Map<string, Set<string>>()
  const materialToCompanies = new Map<string, Set<string>>()

  type Row = { id: string; process_capabilities_json: string | null }
  const rows = db.prepare(
    'SELECT id, process_capabilities_json FROM companies WHERE process_capabilities_json IS NOT NULL',
  ).all() as Row[]

  let entryCount = 0
  for (const row of rows) {
    if (!row.process_capabilities_json) continue
    let parsed: any
    try { parsed = JSON.parse(row.process_capabilities_json) } catch { continue }
    if (!Array.isArray(parsed)) continue
    for (const cap of parsed) {
      if (!cap || typeof cap !== 'object') continue
      // Process index
      const procKey = normaliseKey(cap.process_name)
      if (procKey) {
        let set = processToCompanies.get(procKey)
        if (!set) { set = new Set(); processToCompanies.set(procKey, set) }
        set.add(row.id)
        entryCount++
      }
      // Material index — materials_worked is an array per capability.
      if (Array.isArray(cap.materials_worked)) {
        for (const m of cap.materials_worked) {
          const matKey = normaliseKey(m)
          if (!matKey) continue
          let set = materialToCompanies.get(matKey)
          if (!set) { set = new Set(); materialToCompanies.set(matKey, set) }
          set.add(row.id)
          entryCount++
        }
      }
    }
  }

  db.close()

  const buildMs = Date.now() - start
  console.log(
    `[reverse-indexes] built ${processToCompanies.size} process keys + ${materialToCompanies.size} material keys, ${entryCount} entries, ${buildMs}ms`,
  )

  _cache = {
    processToCompanies,
    materialToCompanies,
    built: true,
    buildMs,
  }
  return _cache
}

export function isReverseIndexAvailable(): boolean {
  return buildReverseIndexes() !== null
}

/**
 * Find companies offering the given process. Matches exact + substring
 * (LLM-generated names often don't match supplier-claimed names verbatim,
 * so "cnc turning" should hit "cnc_turning" and "swiss turning" hits "turning").
 *
 * @returns up to `maxResults` company IDs, or empty array.
 */
export function companiesByProcess(processName: string, maxResults: number = 500): string[] {
  const cache = buildReverseIndexes()
  if (!cache) return []
  const key = normaliseKey(processName)
  if (!key) return []
  const found = new Set<string>()

  // Exact hit
  const exact = cache.processToCompanies.get(key)
  if (exact) {
    for (const id of exact) {
      found.add(id)
      if (found.size >= maxResults) return Array.from(found)
    }
  }

  // Substring hit both ways — but only for keys >= 4 chars to avoid
  // catastrophic fan-out on "cnc".
  if (key.length >= 4) {
    for (const [otherKey, set] of cache.processToCompanies.entries()) {
      if (otherKey === key) continue
      if (otherKey.includes(key) || key.includes(otherKey)) {
        for (const id of set) {
          found.add(id)
          if (found.size >= maxResults) return Array.from(found)
        }
      }
    }
  }

  return Array.from(found)
}

/**
 * Find companies working with the given material. Same substring logic
 * as companiesByProcess — "6061-T6" hits "aluminum 6061" and "6061" alike.
 */
export function companiesByMaterial(materialName: string, maxResults: number = 500): string[] {
  const cache = buildReverseIndexes()
  if (!cache) return []
  const key = normaliseKey(materialName)
  if (!key) return []
  const found = new Set<string>()

  const exact = cache.materialToCompanies.get(key)
  if (exact) {
    for (const id of exact) {
      found.add(id)
      if (found.size >= maxResults) return Array.from(found)
    }
  }

  if (key.length >= 4) {
    for (const [otherKey, set] of cache.materialToCompanies.entries()) {
      if (otherKey === key) continue
      if (otherKey.includes(key) || key.includes(otherKey)) {
        for (const id of set) {
          found.add(id)
          if (found.size >= maxResults) return Array.from(found)
        }
      }
    }
  }

  return Array.from(found)
}

/**
 * Diagnostic: stats about the indexes for pipeline startup log.
 */
export function getReverseIndexStats(): {
  available: boolean
  processKeys: number
  materialKeys: number
  buildMs: number
} {
  const cache = buildReverseIndexes()
  if (!cache) return { available: false, processKeys: 0, materialKeys: 0, buildMs: 0 }
  return {
    available: true,
    processKeys: cache.processToCompanies.size,
    materialKeys: cache.materialToCompanies.size,
    buildMs: cache.buildMs,
  }
}
