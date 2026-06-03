/**
 * scripts/lib/orchestrator/generic/component-source.ts
 *
 * TIER-A COMPONENT SOURCE (wall-3 generic emitter, GENERIC-EMITTER-PLAN.md §3).
 *
 * The class-reference graph gives the generic emitter the MODULE skeleton (one
 * node per universal module). It does NOT carry the component-level detail a
 * real bill of materials needs — that lives in `pretraining_products.modules_json`
 * in ~/.forge-truth/forge-truth.db, the self-building corpus of real-product
 * decompositions (601 rows / 41 classes, e.g. 11 BESS products: Tesla Megapack 3,
 * Sungrow PowerTitan, CATL EnerC, …).
 *
 * `modules_json` shape (per product):
 *   [{ "module": "<UniversalModule>", "sub_modules": ["<component>", …] }, …]
 * where each `sub_modules[]` entry is a COMPONENT name (lfp_prismatic_cells,
 * silicon_carbide_inverter, dc_busbar_assembly, current_sensors, …) — exactly the
 * granularity the generic emitter needs for BoM-line words.
 *
 * `loadClassComponents` UNIONS those component lists across every product in the
 * class, keyed by universal module, so a sparse single product (Tesla alone gives
 * ~4-5 components/module — under the 5-word density floor) becomes a rich union
 * (5-15+/module) once all 11 BESS products are merged. This is the DB-first read
 * the CLAUDE.md "growing-DB" principle calls for (the table previously had NO
 * runtime reader — see the corpus-tables table in the project CLAUDE.md).
 *
 * Pure of the chain: a single readonly SQLite read, no LLM, no network. Returns
 * an empty map on any failure (missing DB, parse error) — the caller's Tier-C
 * floor then fills every module, so the emitter never depends on the DB existing.
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

function defaultDbPath(): string {
  return resolve(homedir(), '.forge-truth', 'forge-truth.db')
}

interface ModulesJsonEntry {
  module?: unknown
  sub_modules?: unknown
}

/**
 * Union the component (sub_module) names from every product in `className`,
 * keyed by universal module. Order-preserving, de-duplicated.
 *
 * @param className product class string (e.g. 'bess'); matched against
 *                  pretraining_products.product_class exactly, then by `LIKE
 *                  className%` if the exact match returns nothing (handles
 *                  'bess' vs 'bess-utility-scale' style drift).
 * @returns Map<UniversalModule, component-name[]>. Empty on any failure.
 */
export function loadClassComponents(
  className: string,
  dbPath: string = defaultDbPath(),
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const cls = String(className ?? '').trim().toLowerCase()
  if (!cls) return out
  if (!existsSync(dbPath)) return out

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 2000')

    let rows = db
      .prepare(
        `SELECT modules_json FROM pretraining_products
         WHERE LOWER(product_class) = ? AND modules_json IS NOT NULL AND modules_json != ''`,
      )
      .all(cls) as Array<{ modules_json: string }>

    if (rows.length === 0) {
      // Fallback: tolerate class-name drift (e.g. envelope 'bess' vs corpus
      // 'bess-utility-scale'). Anchor on a prefix so 'bess' never matches an
      // unrelated class that merely contains the substring.
      rows = db
        .prepare(
          `SELECT modules_json FROM pretraining_products
           WHERE LOWER(product_class) LIKE ? AND modules_json IS NOT NULL AND modules_json != ''`,
        )
        .all(`${cls}%`) as Array<{ modules_json: string }>
    }

    for (const r of rows) {
      let parsed: unknown
      try {
        parsed = JSON.parse(r.modules_json)
      } catch {
        continue
      }
      if (!Array.isArray(parsed)) continue
      for (const raw of parsed as ModulesJsonEntry[]) {
        const moduleKey = String(raw?.module ?? '').trim()
        if (!moduleKey) continue
        const subs = Array.isArray(raw?.sub_modules) ? raw.sub_modules : []
        const list = out.get(moduleKey) ?? []
        for (const s of subs) {
          const name = String(s ?? '').trim()
          if (name) list.push(name)
        }
        out.set(moduleKey, list)
      }
    }
  } catch {
    return new Map()
  } finally {
    try {
      db?.close()
    } catch {
      /* no-op */
    }
  }

  // De-duplicate each module's component list, preserving first-seen order so the
  // most-common (first product) components lead.
  for (const [k, v] of out) out.set(k, [...new Set(v)])
  return out
}
