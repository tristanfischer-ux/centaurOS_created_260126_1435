#!/usr/bin/env npx tsx
/**
 * scripts/ingest/ingest-lab-instrument-verified-parts-2.ts — ROUND 2 of the curated,
 * WEB-VERIFIED benchtop-bioreactor / lab-instrument commodity-slot parts ingest into
 * pretraining_extracted_parts. Sibling of ingest-lab-instrument-verified-parts.ts —
 * SAME schema, embed-on-insert, idempotency, DRY-RUN default / --commit,
 * FORGE_TRUTH_DB_PATH_OVERRIDE temp-DB path, per-row component_class override, and the
 * family-coherence discipline. Round 1 (17 rows) is already committed to the live DB;
 * this file adds only the RESIDUAL organoid-bioreactor slots round 1 did not fill.
 *
 * WHY (2026-07-21): the organoid-bioreactor Bill-of-Materials tab still scored 6.9/10
 * because ~11/35 lines were catalogue electronic/mechanical parts with NO resolved MPN
 * — the council-H10 fault ('bespoke fabrication to drawing' is invalid for a CATALOGUE
 * part). Round 1 covered temperature sensing, TEC, stir DRIVE motor + driver + a Hall
 * tacho, control electronics, tubing, vents and enclosure — but left four residual
 * device-scale commodity slots genuinely unfilled in the benchtop_bioreactor family:
 *   • the DOSING PERISTALTIC PUMP itself (round 1 has the stir motor + tubing but NO
 *     pump head/unit; a prior fix stripped this line's fake tubing SKU so it is now
 *     honest-UNRESOLVED and needs a REAL small OEM dosing pump MPN — a Pioreactor-class
 *     benchtop bioreactor uses a Kamoer);
 *   • the PCB MOUNTING STANDOFF (offender 'Pcb Mounting Standoff');
 *   • the FRONT-PANEL CONNECTOR / USB PORT (offender 'Front Panel Connector Ports' —
 *     round 1's Amphenol 12401548E4#2A is a BOARD-mount USB-C receptacle, not a
 *     panel-mount front-panel PORT; this adds a real IP67 panel-mount pass-through);
 *   • a second-source STIR-SPEED / RPM SENSOR (offender 'Stir Tachometer Sense' — round
 *     1's Allegro A1120 Hall latch covers it; these are an optical + a 2nd-source Hall
 *     alternative so the RAG has ≥2 in-family candidates for the slot).
 *
 * Every row below is a REAL, distributor-stocked branded product (real manufacturer +
 * real MPN) at a realistic low-volume GBP unit price — no MPN is fabricated (gate-20
 * discipline: an MPN I cannot vouch for as a genuine, catalogue-listed product is simply
 * not here). Where I am less-than-HIGH confidence on the exact configured price the price
 * is NULL and the desc says so (never a guessed number).
 *
 * CLASS_TAG = 'benchtop_bioreactor' (a plain family/provenance label, mirroring round 1
 * + 'water_treatment'). component_class is NOT a hard class filter — only ranking-token
 * overlap + the MOTION/SENSE type-coherence guard in dbHitAcceptableForWord. The pump
 * rows (head noun 'pump', a MOTION slot) carry component_class 'motor_actuator' and the
 * rpm-sensor rows (head noun 'sensor', a SENSE slot) carry 'sensor', so the guard does
 * not type-reject the very rows built to serve them — the round-1 precedent.
 *
 * Rows are embedded at insert (text-embedding-3-small, 1536-d Float32LE, the canonical
 * [part_name, manufacturer, part_number, raw_excerpt] recipe); degrades to NULL embedding
 * when OPENAI_API_KEY is absent (backfill-embeddings.ts sweeps those).
 *
 * Idempotent: skips any (manufacturer, part_number) already present. DRY-RUN by default;
 * --commit writes. No live distributor calls (chain-as-DB-consumer rule untouched).
 *
 * Usage:
 *   npx tsx scripts/ingest/ingest-lab-instrument-verified-parts-2.ts            # dry-run
 *   npx tsx scripts/ingest/ingest-lab-instrument-verified-parts-2.ts --commit
 *   # temp-DB proof (never the live DB pre-review):
 *   cp ~/.forge-truth/forge-truth.db /tmp/ft-test-r2.db
 *   FORGE_TRUTH_DB_PATH_OVERRIDE=/tmp/ft-test-r2.db npx tsx scripts/ingest/ingest-lab-instrument-verified-parts-2.ts --commit
 *
 * British spelling throughout.
 */
import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

// FORGE_TRUTH_DB_PATH_OVERRIDE lets a calibration harness point --commit at a TEMP
// COPY of forge-truth.db instead of the live one (mechanical, not by convention).
const DB_PATH = process.env.FORGE_TRUTH_DB_PATH_OVERRIDE || resolve(homedir(), '.forge-truth', 'forge-truth.db')

// CLASS_TAG — plain family/provenance label, identical to round 1.
const CLASS_TAG = 'benchtop_bioreactor'
const DISCOVERY_SOURCE = 'web_verified_ingest'
const COMMIT = process.argv.includes('--commit')

interface VerifiedPart {
  part_name: string          // slot-vocabulary name (head noun LAST)
  manufacturer: string
  part_number: string        // real catalogue MPN / product number
  desc: string               // duty + spec + honest confidence note
  src: string                // the page family the part is genuinely listed on
  unit_price_gbp: number | null // realistic low-volume GBP each; NULL where not HIGH-confidence
  /** Per-row component_class override (default CLASS_TAG). Required for MOTION-typed
   *  (pump/motor/drive) + SENSE-typed (sensor) slots — the round-1 precedent. */
  component_class?: string
}

const PARTS: VerifiedPart[] = [
  // ── Dosing peristaltic pump (motor_actuator slot — the named offender) ────────────
  // MOTION-typed slot (head noun 'pump') → component_class 'motor_actuator' so the
  // MOTION guard (a 'pump'/'motor'/'drive' token needs /motor_actuator|mechanical_assembly/)
  // does not reject it. This is the pump HEAD/UNIT round 1 lacked — a real small OEM
  // dosing/metering peristaltic pump as used in a Pioreactor-class benchtop bioreactor.
  {
    part_name: 'Dosing peristaltic pump — micro stepper-driven metering peristaltic pump, 12/24 V DC, 5-340 mL/min',
    manufacturer: 'Kamoer', part_number: 'KDS',
    desc: 'Kamoer KDS micro peristaltic dosing/metering pump, NEMA-14 stepper drive, 12/24 V DC, adjustable 5-340 mL/min via microstepping, autoclave-free platinum-silicone tube path, the de-facto OEM benchtop-bioreactor / aquarium-dosing / analytical dosing pump (Pioreactor-class instruments use a Kamoer). Real product family, distributor-stocked (Kamoer direct + Amazon + Alibaba). ~£45 each qty-1 (multiple ~$50 listings) — HIGH confidence on the ~£40-55 band.',
    src: 'https://www.kamoer.com/us/product/index.html?categoryProductId=4',
    unit_price_gbp: 45.00,
    component_class: 'motor_actuator',
  },
  {
    part_name: 'Dosing peristaltic pump — ultra-compact OEM peristaltic pump, 12/24 V DC / stepper, up to 270 mL/min',
    manufacturer: 'Welco', part_number: 'WPX1',
    desc: 'Welco (WELCO Co., Ltd., Japan) WPX1 ultra-compact OEM peristaltic pump, WP1000-series head, 12/24 V DC low/high-speed / stepper / brushless motor options, up to 270 mL/min, autoclavable PSU cassette variants (WPM2) to 80 °C, multiple tube-fitting configurations (W4/WM3/WM4/J8/J4). Real OEM pump line (a fully-configured example WPX1-P2.4M2-W6-B is a genuine distributor listing). Base line MPN used; exact configured unit price is ordering-code dependent and only USD listings were to hand → price left NULL (MODERATE confidence on price, HIGH on the product).',
    src: 'https://www.welco.net/product/wpx1.html',
    unit_price_gbp: null,
    component_class: 'motor_actuator',
  },
  // ── PCB mounting standoff (mechanical slot — the named offender) ──────────────────
  {
    part_name: 'PCB mounting standoff — M3 brass hex female-female spacer, 6 mm, board mounting',
    manufacturer: 'Wurth Elektronik', part_number: '970060354',
    desc: 'Würth Elektronik WA-SBRII 970060354 brass hex spacer/standoff, M3 female-female thread, 6 mm body length, nickel-plated brass, for mounting the controller PCB inside the instrument enclosure on a benchtop bioreactor. Real distributor-stocked part (Mouser / DigiKey / Newark / Utmel). ~£0.55 each qty-1 (HIGH confidence).',
    src: 'https://www.mouser.com/c/electromechanical/hardware/standoffs-spacers/?m=Wurth+Elektronik',
    unit_price_gbp: 0.55,
    component_class: 'mechanical',
  },
  // ── Front-panel connector / USB port (electronic_pcb slot — the named offender) ───
  {
    part_name: 'Front-panel USB port — panel-mount USB Type-B pass-through receptacle, IP67, front-panel connector',
    manufacturer: 'Amphenol', part_number: 'MUSB-D511-00',
    desc: 'Amphenol ICC (Commercial Products) MUSB-D511-00 ruggedised panel-mount USB 2.0 Type-B receptacle, vertical single-port through-hole, IP67 (dust-tight / waterproof) mated + unmated, for the host/service front-panel port on a benchtop-bioreactor controller enclosure. Real distributor-stocked part (DigiKey 2567127 / Newark / TTI). ~£9.50 each qty-1 (HIGH confidence).',
    src: 'https://www.digikey.com/en/products/detail/amphenol-cs-commercial-products/MUSB-D511-00/2567127',
    unit_price_gbp: 9.50,
    component_class: 'electronic_pcb',
  },
  // ── Stir-speed / rpm sensing (sensor slot — 2nd + 3rd source for the offender) ────
  // SENSE-typed slot (head noun 'sensor') → component_class 'sensor'. Round 1's Allegro
  // A1120 Hall latch already covers the slot; these give the RAG in-family alternatives.
  {
    part_name: 'Stir-speed sensor — reflective optical object sensor, Photologic output, rpm index pickup',
    manufacturer: 'TT Electronics/Optek', part_number: 'OPB715Z',
    desc: 'TT Electronics/Optek OPB715Z reflective optical sensor, GaAlAs LED + Photologic photo-IC, panel-mount plastic housing shielding stray light, ~12.7 mm reflective sensing distance, TTL totem-pole / open-collector output. Indicative optical rpm/index pickup for the magnet-coupled stir-bar on a benchtop bioreactor (a reflective mark on the rotating coupling). Real distributor-stocked part (DigiKey 1637057 / Mouser). ~£4.20 each qty-1 (HIGH confidence).',
    src: 'https://www.digikey.com/en/products/detail/tt-electronics-optek-technology/OPB715Z/1637057',
    unit_price_gbp: 4.20,
    component_class: 'sensor',
  },
  {
    part_name: 'Stir-speed sensor — unipolar Hall-effect switch, TO-92, 3.5-24 V, rpm tachometer pickup',
    manufacturer: 'Melexis', part_number: 'US5881LUA-AAA-000-BU',
    desc: 'Melexis US5881LUA-AAA-000-BU unipolar Hall-effect switch, CMOS with dynamic offset cancellation + open-drain output, TO-92 flat 3-lead, 3.5-24 V, for counting the magnet-coupled stir-bar rotation (rpm tachometer feedback) on a benchtop bioreactor — a second-source alternative to the round-1 Allegro A1120. Real distributor-stocked part (DigiKey 431876 / Melexis). ~£0.85 each qty-1 (HIGH confidence).',
    src: 'https://www.digikey.com/product-detail/en/US5881LUA-AAA-000-BU/US5881LUA-AAA-000-BU-ND/431876',
    unit_price_gbp: 0.85,
    component_class: 'sensor',
  },
]

// ── Embedding (canonical recipe: text-embedding-3-small, 1536-d Float32LE) ─────────
function loadOpenAiKey(): string | null {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  try {
    const env = readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf-8')
    const m = env.match(/^OPENAI_API_KEY="?([^"\n]+)"?/m)
    return m ? m[1] : null
  } catch { return null }
}

async function embedText(text: string, apiKey: string): Promise<Buffer | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000), dimensions: 1536 }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { data?: Array<{ embedding?: number[] }> }
    const vec = j?.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length !== 1536) return null
    const buf = Buffer.alloc(vec.length * 4)
    vec.forEach((v, i) => buf.writeFloatLE(v, i * 4))
    return buf
  } catch { return null }
}

const embedHashOf = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32)

function getIngestDocId(db: Database.Database): number {
  const row = db.prepare(
    `SELECT id FROM pretraining_spec_documents WHERE source_type = ? ORDER BY id ASC LIMIT 1`,
  ).get(DISCOVERY_SOURCE) as { id: number } | undefined
  if (row?.id) return row.id
  const r = db.prepare(
    `INSERT INTO pretraining_spec_documents (source_type, document_type, extraction_status)
     VALUES (?, 'curated_web_verified_seed', 'done')`,
  ).run(DISCOVERY_SOURCE)
  return Number(r.lastInsertRowid)
}

async function main(): Promise<void> {
  if (!existsSync(DB_PATH)) { console.error(`DB not found: ${DB_PATH}`); process.exit(1) }
  const db = new Database(DB_PATH, { readonly: !COMMIT })
  db.pragma('busy_timeout = 4000')
  if (COMMIT) db.pragma('journal_mode = WAL')

  const apiKey = loadOpenAiKey()
  if (!apiKey) console.error('[ingest] OPENAI_API_KEY not found — rows will carry NULL embeddings (backfill-embeddings.ts sweeps those)')

  const existsStmt = db.prepare(
    `SELECT id FROM pretraining_extracted_parts
     WHERE LOWER(manufacturer) = LOWER(?) AND LOWER(part_number) = LOWER(?) LIMIT 1`,
  )

  let inserted = 0; let skipped = 0
  const docId = COMMIT ? getIngestDocId(db) : -1
  const insertStmt = COMMIT ? db.prepare(
    `INSERT INTO pretraining_extracted_parts
       (document_id, part_name, manufacturer, part_number, module_assignment,
        sub_module_assignment, raw_excerpt, confidence, unit_price_gbp,
        component_class, embedding, embed_hash, source_doc_id, discovered_at, discovery_source)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ) : null

  for (const p of PARTS) {
    const dup = existsStmt.get(p.manufacturer, p.part_number) as { id: number } | undefined
    const excerpt = JSON.stringify({ desc: p.desc, src: p.src }).slice(0, 1024)
    if (dup) { skipped++; console.log(`  = exists (id ${dup.id}): ${p.manufacturer} ${p.part_number}`); continue }
    if (!COMMIT) { inserted++; console.log(`  + would insert: ${p.manufacturer} ${p.part_number} — ${p.part_name}`); continue }
    const embedSource = [p.part_name.slice(0, 256), p.manufacturer, p.part_number, excerpt].filter(Boolean).join(' ')
    const embedding = apiKey ? await embedText(embedSource, apiKey) : null
    const r = insertStmt!.run(
      docId, p.part_name.slice(0, 256), p.manufacturer, p.part_number,
      excerpt, 0.9 /* web-verified: real distributor-stocked branded part */, p.unit_price_gbp,
      p.component_class ?? CLASS_TAG, embedding, embedding ? embedHashOf(embedSource) : null,
      p.src, new Date().toISOString(), DISCOVERY_SOURCE,
    )
    inserted++
    console.log(`  + inserted id ${r.lastInsertRowid}${embedding ? ' [embedded]' : ' [no embedding]'}: ${p.manufacturer} ${p.part_number} — ${p.part_name}`)
  }

  console.log(`\n[ingest] ${COMMIT ? 'COMMITTED' : 'DRY-RUN'}: ${inserted} insert(s), ${skipped} already present, class '${CLASS_TAG}', doc source_type '${DISCOVERY_SOURCE}'.`)
  db.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
