#!/usr/bin/env -S npx tsx
/**
 * classify-pretraining-parts.tsx — Engine B (2026-05-18)
 *
 * Assigns a `component_class` (see component-classes.ts) to every row in
 * ~/.forge-truth/forge-truth.db `pretraining_extracted_parts`. Used as the
 * lookup corpus by the patched price estimator: when a BoM line matches a
 * known part name, we can read the class directly rather than re-classifying.
 *
 * Strategy: Flash-Lite, 50 parts per call, concurrency 8. ~9,080 / 50 = 182
 * calls × ~£0.0003 each = ~£0.06 total. Skips rows already classified.
 *
 * Usage:
 *   npx tsx scripts/classify-pretraining-parts.tsx [--limit N] [--reset]
 *
 * Notes:
 *   - Adds `component_class TEXT` column if missing (idempotent).
 *   - Truncates part_name to 120 chars in the prompt to keep batches small
 *     (drawer forgeos_gotchas_115d8319262232ae — Flash-Lite self-summarises
 *     on giant batches; 50 short rows is well under the threshold).
 *   - All 20 classes from component-classes.ts.
 */

import { readFileSync, existsSync, appendFileSync } from 'fs'
import { execFileSync } from 'child_process'
import Database from 'better-sqlite3'
import { homedir } from 'os'
import { join } from 'path'
import {
  COMPONENT_CLASS_ORDER,
  type ComponentClass,
} from '../src/lib/pdf-engine-v2/component-classes'

const DB_PATH = join(homedir(), '.forge-truth/forge-truth.db')
const COST_LOG = '/tmp/engine-b-cost.log'
const BATCH_SIZE = 50
const CONCURRENCY = 8
const MODEL = 'google/gemini-3.1-flash-lite-preview'

const OPENROUTER_KEY = (() => {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  // Source from the repo's .env.local — same as serial-design-chain-v2.
  const envLocal = join(process.cwd(), '.env.local')
  if (existsSync(envLocal)) {
    const content = readFileSync(envLocal, 'utf-8')
    const m = content.match(/^OPENROUTER_API_KEY="?([^\s"]+)"?/m)
    if (m) return m[1]
  }
  try {
    return execFileSync('zsh', ['-ic', 'echo $OPENROUTER_API_KEY'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()

if (!OPENROUTER_KEY) {
  console.error('[classify] OPENROUTER_API_KEY not found')
  process.exit(1)
}

interface PartRow {
  id: number
  part_name: string
  manufacturer: string | null
  part_number: string | null
  module_assignment: string | null
}

interface ClassifyResult {
  part_id: number
  component_class: ComponentClass | 'unknown'
}

function logCost(line: string) {
  appendFileSync(COST_LOG, `${new Date().toISOString()} | ${line}\n`)
}

async function classifyBatch(rows: PartRow[]): Promise<ClassifyResult[]> {
  const classList = COMPONENT_CLASS_ORDER.join(', ')
  const partsJson = rows
    .map((r) => {
      const parts = [
        `id=${r.id}`,
        `name="${(r.part_name || '').replace(/"/g, "'").slice(0, 120)}"`,
      ]
      if (r.manufacturer) parts.push(`mfr="${r.manufacturer.slice(0, 40)}"`)
      if (r.part_number) parts.push(`pn="${r.part_number.slice(0, 40)}"`)
      if (r.module_assignment) parts.push(`module=${r.module_assignment}`)
      return `  - { ${parts.join(', ')} }`
    })
    .join('\n')

  const prompt = `Classify each hardware part below into ONE of these 20 component classes:
${classList}

Class guidance:
- electronic_ic: SoCs, MCUs, ASICs, FPGAs, dedicated chips
- electronic_passive: resistors, capacitors, MLCCs, small inductors, ferrites
- electronic_discrete: diodes, MOSFETs, BJTs, TVS
- electronic_pcb: bare PCB or PCBA assembly
- electronic_connector: headers, USB-C, M12, RJ45, Molex/JST
- electronic_cable: cable assembly, harness, ribbon, coax
- electronic_power_module: SiC/IGBT modules, integrated power stages
- sensor: thermistor, Hall, IMU, pressure, LiDAR, encoder
- motor_actuator: BLDC, stepper, servo, solenoid, linear actuator
- magnetic: transformers, large inductors (>100uH), motor magnets
- optical: LEDs, photodiodes, displays, lenses
- structural_metal: chassis, brackets, sheet metal, weldments
- structural_polymer: injection-moulded plastics, gaskets, housings (tooled)
- mechanical_fastener: bolts, nuts, washers, pins, springs
- mechanical_assembly: hinges, bearings, gears, fans, pumps
- battery_cell: li-ion cells, lead-acid, supercaps
- thermal: heatsinks, cold plates, fans, TIM, heat exchangers
- fluid_path: pipes, valves, manifolds, fittings, hoses
- safety_consumable: fuses, breakers, MCBs, fire-suppression cartridges
- oem_subsystem: pre-built modules — inverter, PSU, GPU board, compressor, BMS mainboard, full pump unit, full HMI panel

PARTS:
${partsJson}

Return ONLY a JSON array of objects, one per part, in the same order:
[{"part_id":<id>,"component_class":"<one of the 20 classes, or 'unknown'>"}, ...]
No prose, no markdown.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://fractionalforge.com',
      'X-Title': 'ForgeOS Engine B classifier',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  })
  if (!res.ok) {
    console.error(`[classify] HTTP ${res.status}`)
    return []
  }
  const j: any = await res.json()
  const text: string = j.choices?.[0]?.message?.content ?? ''
  // Find the first JSON array (Flash-Lite sometimes adds chatter).
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) {
    console.error('[classify] no JSON array in response:', text.slice(0, 200))
    return []
  }
  let parsed: any
  try {
    parsed = JSON.parse(m[0])
  } catch (err) {
    console.error('[classify] JSON parse failed:', err)
    return []
  }
  if (!Array.isArray(parsed)) return []
  const valid = new Set<string>(COMPONENT_CLASS_ORDER as string[])
  valid.add('unknown')
  return parsed
    .map((r: any) => {
      const id = Number(r.part_id ?? r.id)
      const cls = String(r.component_class ?? '').trim()
      if (!Number.isFinite(id) || !valid.has(cls)) return null
      return { part_id: id, component_class: cls as ComponentClass | 'unknown' }
    })
    .filter((r): r is ClassifyResult => r !== null)
}

async function main() {
  const args = process.argv.slice(2)
  const limit = (() => {
    const i = args.indexOf('--limit')
    if (i >= 0 && args[i + 1]) return parseInt(args[i + 1], 10)
    return null
  })()
  const reset = args.includes('--reset')

  if (!existsSync(DB_PATH)) {
    console.error(`[classify] DB not found: ${DB_PATH}`)
    process.exit(1)
  }
  const db = new Database(DB_PATH)

  // 1) Ensure column exists (idempotent).
  const cols = db.prepare("PRAGMA table_info(pretraining_extracted_parts)").all() as any[]
  const hasCol = cols.some((c) => c.name === 'component_class')
  if (!hasCol) {
    console.log('[classify] adding component_class column')
    db.exec('ALTER TABLE pretraining_extracted_parts ADD COLUMN component_class TEXT')
  }
  if (reset) {
    console.log('[classify] --reset: clearing component_class')
    db.exec('UPDATE pretraining_extracted_parts SET component_class = NULL')
  }

  // 2) Select rows still missing component_class.
  const sqlSelect = `
    SELECT id, part_name, manufacturer, part_number, module_assignment
    FROM pretraining_extracted_parts
    WHERE component_class IS NULL
      AND part_name IS NOT NULL AND length(part_name) > 1
    ${limit ? `LIMIT ${limit}` : ''}
  `
  const rows = db.prepare(sqlSelect).all() as PartRow[]
  console.log(`[classify] ${rows.length} parts to classify`)
  if (rows.length === 0) {
    console.log('[classify] nothing to do')
    db.close()
    return
  }

  // 3) Batch + run with concurrency.
  const batches: PartRow[][] = []
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE))
  }
  console.log(`[classify] ${batches.length} batches x ${BATCH_SIZE} parts, concurrency ${CONCURRENCY}`)

  const updateStmt = db.prepare('UPDATE pretraining_extracted_parts SET component_class = ? WHERE id = ?')

  let done = 0
  let updated = 0
  let totalCostUsd = 0
  await new Promise<void>((resolveAll) => {
    let inFlight = 0
    let nextIdx = 0

    const tick = async () => {
      while (inFlight < CONCURRENCY && nextIdx < batches.length) {
        const batch = batches[nextIdx++]
        inFlight += 1
        ;(async () => {
          const t0 = Date.now()
          const results = await classifyBatch(batch).catch(() => [])
          const writeMany = db.transaction((items: ClassifyResult[]) => {
            for (const r of items) {
              updateStmt.run(r.component_class, r.part_id)
              updated += 1
            }
          })
          writeMany(results)
          done += 1
          // Rough cost estimate: Flash-Lite ~£0.0003 per batch of ~50 parts.
          totalCostUsd += 0.0004
          if (done % 5 === 0 || done === batches.length) {
            const ms = Date.now() - t0
            console.log(
              `  [classify] ${done}/${batches.length} batches | ${updated} parts classified | ${ms} ms last batch`,
            )
          }
          inFlight -= 1
          if (done === batches.length) resolveAll()
          else tick()
        })()
      }
    }
    tick()
  })

  // 4) Top-3 classes by count
  const top = db.prepare(`
    SELECT component_class AS c, COUNT(*) AS n
    FROM pretraining_extracted_parts
    WHERE component_class IS NOT NULL
    GROUP BY component_class
    ORDER BY n DESC
    LIMIT 5
  `).all() as any[]
  console.log('[classify] top classes:')
  for (const r of top) console.log(`  ${r.c}: ${r.n}`)
  const unknown = db.prepare(
    "SELECT COUNT(*) AS n FROM pretraining_extracted_parts WHERE component_class = 'unknown'",
  ).get() as any
  const total = db.prepare(
    "SELECT COUNT(*) AS n FROM pretraining_extracted_parts WHERE component_class IS NOT NULL",
  ).get() as any
  console.log(`[classify] classified ${total.n} total (${unknown.n} unknown)`)

  const costGbp = totalCostUsd * 0.78
  logCost(
    `classify-pretraining-parts | ${batches.length} batches, ${updated} parts updated | est GBP ${costGbp.toFixed(3)}`,
  )
  console.log(`[classify] estimated cost: GBP ${costGbp.toFixed(3)}`)

  db.close()
}

main().catch((err) => {
  console.error('[classify] fatal:', err)
  process.exit(1)
})
