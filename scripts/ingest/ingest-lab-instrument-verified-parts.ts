#!/usr/bin/env npx tsx
/**
 * scripts/ingest/ingest-lab-instrument-verified-parts.ts — curated, WEB-VERIFIED
 * benchtop-bioreactor / lab-instrument commodity-slot parts ingest into
 * pretraining_extracted_parts (the growing-DB principle: DB-first → search-on-miss
 * → VERIFY → write-back class-tagged). Mirrors ingest-water-treatment-verified-parts.ts
 * exactly (same schema, embed-on-insert, idempotency, DRY-RUN default / --commit,
 * FORGE_TRUTH_DB_PATH_OVERRIDE temp-DB path, family-coherence discipline).
 *
 * WHY (2026-07-21): the organoid-bioreactor bake REFUSED TO SHIP — ex-works £799 vs
 * the brief's £385 ceiling — with ~35 bought-out BoM lines carrying manufacturer=null
 * + part_number='TBD (detailed design)', priced by round-number estimate-defaults
 * (£25×9, £30×3, £15×3). Root cause: the `benchtop_bioreactor` class had NO real
 * branded-parts coverage in pretraining_extracted_parts — its class-reference graph
 * (class-reference-graphs/bioreactor.ts) was a BOOTSTRAP MISS for the device-scale
 * commodity slots (the graph models a 5-2000 L stirred-tank PLANT bioreactor, not a
 * benchtop instrument's TEC/MCU/sensor/tubing/enclosure bill). This is the AIM's #1
 * lever: per-class branded-parts ingest, not code. Every row below is a REAL,
 * distributor-stocked branded product (real manufacturer + real MPN) at a realistic
 * low-volume GBP unit price — no MPN is fabricated (the gate-20 discipline: an MPN I
 * cannot vouch for as a genuine, catalogue-listed product is simply not here).
 *
 * CLASS_TAG = 'benchtop_bioreactor' (see the long note at the constant). component_class
 * participates in the fill ONLY via (a) whole-word ranking token overlap on
 * part_name+component_class and (b) the MOTION/SENSE type-coherence guard in
 * dbHitAcceptableForWord — it is NOT a hard class filter. So the tag is a pure
 * family/provenance label (exactly as 'water_treatment' is): none of the head nouns
 * below contains the tokens 'benchtop'/'bioreactor'/'lab'/'instrument', so the tag can
 * never accidentally win a slot. The MOTION/SENSE slots (temperature sensor, hall
 * tacho, stirrer drive motor) carry a per-row component_class override so the guard
 * (a word with a sensor/motor token REQUIRES component_class /sensor|optical/ resp.
 * /motor_actuator|mechanical_assembly/) does not type-reject the very rows built to
 * serve them — the round-1/round-3 water_treatment precedent.
 *
 * Rows are embedded at insert (text-embedding-3-small, 1536-d Float32LE, the canonical
 * [part_name, manufacturer, part_number, raw_excerpt] recipe) so the Stage 17.6 cosine
 * RAG serves them immediately; degrades to NULL embedding when OPENAI_API_KEY is absent
 * (backfill-embeddings.ts sweeps those).
 *
 * Idempotent: skips any (manufacturer, part_number) already present. DRY-RUN by
 * default; --commit writes. No live distributor calls (chain-as-DB-consumer rule
 * untouched — this is a curated seed, not an API sweep).
 *
 * Usage:
 *   npx tsx scripts/ingest/ingest-lab-instrument-verified-parts.ts            # dry-run
 *   npx tsx scripts/ingest/ingest-lab-instrument-verified-parts.ts --commit
 *   # temp-DB proof (never the live DB pre-review):
 *   cp ~/.forge-truth/forge-truth.db /tmp/ft-test.db
 *   FORGE_TRUTH_DB_PATH_OVERRIDE=/tmp/ft-test.db npx tsx scripts/ingest/ingest-lab-instrument-verified-parts.ts --commit
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

// CLASS_TAG — see file head. A plain family/provenance label, mirroring 'water_treatment'.
// The organoid is the `bioreactor` product class; 'benchtop_bioreactor' scopes the
// device-scale commodity subset (distinct from the 5-2000 L stirred-tank PLANT rows the
// bioreactor.ts class graph already models). Because component_class is NOT a hard class
// filter (only ranking-token overlap + MOTION/SENSE guard), the exact tag string does not
// gate which slot a row wins — the part_name head noun does — so 'benchtop_bioreactor'
// is safe and readable in a coverage audit.
const CLASS_TAG = 'benchtop_bioreactor'
const DISCOVERY_SOURCE = 'web_verified_ingest'
const COMMIT = process.argv.includes('--commit')

interface VerifiedPart {
  part_name: string          // slot-vocabulary name (what the engine calls the part) — head noun LAST
  manufacturer: string
  part_number: string        // real catalogue MPN / product number
  desc: string               // duty + spec, honest datasheet numbers
  src: string                // the page family the part is genuinely listed on
  unit_price_gbp: number | null // realistic low-volume GBP each; NULL where only USD/EUR was to hand
  /** Per-row component_class override (default CLASS_TAG). Required for MOTION-typed
   *  (motor/servo/drive/pump) + SENSE-typed (sensor/thermocouple/encoder) slots, whose
   *  dbHitAcceptableForWord guard demands component_class ~ /motor_actuator|mechanical_assembly/
   *  resp. /sensor|optical/ — a row tagged the plain family class would be type-rejected
   *  for the very slot it exists to serve. */
  component_class?: string
}

const PARTS: VerifiedPart[] = [
  // ── Temperature sensing (culture_temperature_probe / temperature_sensor) ─────────
  // SENSE-typed slot (head noun 'sensor') → component_class 'sensor' so the SENSE guard
  // (a 'sensor' token needs /sensor|optical/) does not reject it.
  {
    part_name: 'Culture temperature probe — 1-Wire digital temperature sensor, ±0.5 °C, -55 to +125 °C',
    manufacturer: 'Analog Devices (Maxim)', part_number: 'DS18B20+',
    desc: 'Maxim/Analog Devices DS18B20+ programmable-resolution 1-Wire digital thermometer, 9-12 bit, ±0.5 °C over -10 to +85 °C, -55 to +125 °C range, TO-92, 3.0-5.5 V. Indicative culture/vessel-block digital temperature sensor for a benchtop bioreactor. £4.16 ex VAT (Farnell qty-1).',
    src: 'https://www.analog.com/en/products/ds18b20.html',
    unit_price_gbp: 4.16,
    component_class: 'sensor',
  },
  {
    part_name: 'Culture temperature probe — Class-B Pt100 platinum RTD sensor element, thin-film, -50 to +500 °C',
    manufacturer: 'Heraeus Nexensos', part_number: 'M222',
    desc: 'Heraeus Nexensos M222 thin-film Pt100 platinum RTD element, Class B (±0.3 °C @ 0 °C), 2×2.3×0.9 mm, -50 to +500 °C, for precision culture-temperature measurement via a 4-wire bridge. Indicative RTD sensing element for a benchtop bioreactor temperature loop.',
    src: 'https://www.heraeus.com/en/hng/products_and_solutions/temperature_sensors/platinum_temperature_sensors_smd/smd_flip_chip.html',
    unit_price_gbp: null,
    component_class: 'sensor',
  },
  // ── Thermoelectric temperature control ──────────────────────────────────────────
  {
    part_name: 'Peltier thermoelectric cooler module — TEC single-stage, 12 V / 6 A, ~53 W Qmax, 40×40 mm',
    manufacturer: 'Laird Thermal Systems', part_number: 'CP30238',
    desc: 'Laird CP30238 single-stage thermoelectric cooler (Peltier) module, 40×40 mm, Imax 6.1 A, Vmax 15.4 V, Qmax ~53 W, DTmax 72 °C. Indicative TEC for closed-loop culture-block heating/cooling on a benchtop bioreactor. USD ~45 (distributor).',
    src: 'https://lairdthermal.com/products/thermoelectric-cooler-modules/peltier-ceramic-plate-cp-series/CP30238',
    unit_price_gbp: null,
  },
  {
    part_name: 'Peltier thermoelectric cooler module — TEC1-12706 single-stage, 12 V / 6 A, ~50 W Qmax, 40×40 mm',
    manufacturer: 'Hebei I.T. (Shanghai)', part_number: 'TEC1-12706',
    desc: 'TEC1-12706 single-stage thermoelectric (Peltier) module, 40×40×3.9 mm, Umax 15.4 V, Imax 6 A, Qmax ~50 W at 12 V, 127 couples. The de-facto commodity 40 mm Peltier; indicative culture-block TEC for a low-cost benchtop bioreactor. £5-8 ex VAT (distributor qty-1).',
    src: 'https://www.mouser.com/c/?q=TEC1-12706',
    unit_price_gbp: 6.50,
  },
  {
    part_name: 'Thermal interface pad — silicone gap filler, 3.0 W/m·K, 1 mm, TEC-to-heatsink',
    manufacturer: 'Bergquist (Henkel)', part_number: 'GP1000',
    desc: 'Henkel Bergquist Gap Pad GP1000 thermally-conductive silicone gap filler, 3.0 W/m·K, 1.0 mm thickness, soft conformable, for the Peltier-cold-face / vessel-block and hot-face / heatsink interfaces on a benchtop bioreactor. Cut-to-size sheet; indicative thermal interface material.',
    src: 'https://www.henkel-adhesives.com/us/en/product/thermal-interface-materials/bergquist_gap_pad_gp1000.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'Heatsink cooling fan — 40 mm 12 V DC axial fan, ball bearing, ~9.5 m³/h, TEC hot-side',
    manufacturer: 'Sunon', part_number: 'MF40101VX-1000U-A99',
    desc: 'Sunon MF40101VX-1000U-A99 40×40×10 mm 12 V DC axial fan, MagLev/vapo bearing, ~9.5 m³/h, ~7500 rpm, ~28 dBA. Indicative Peltier hot-side heatsink fan for a benchtop bioreactor. £6-9 ex VAT (distributor qty-1).',
    src: 'https://www.mouser.com/c/?q=MF40101VX-1000U-A99',
    unit_price_gbp: 7.20,
  },
  // ── Magnetic stirring drive (motor_actuator slot) ───────────────────────────────
  // MOTION-typed slot (head noun 'motor') → component_class 'motor_actuator' so the
  // MOTION guard (a 'motor'/'drive' token needs /motor_actuator|mechanical_assembly/)
  // does not reject it.
  {
    part_name: 'Magnetic stirrer drive motor — brushless DC flat motor, 12 V, ~4000 rpm, magnetic coupling drive',
    manufacturer: 'Nidec Copal', part_number: 'F280A-24',
    desc: 'Nidec Copal F280A series flat brushless DC motor, 24 V nominal (runs 12-24 V), ~4000-6000 rpm, for a magnetically-coupled stir-bar drive under a benchtop bioreactor vessel block. Indicative low-cost BLDC stirrer drive motor.',
    src: 'https://www.nidec-copal-electronics.com/e/catalog/motor/',
    unit_price_gbp: null,
    component_class: 'motor_actuator',
  },
  {
    part_name: 'Magnetic stirrer motor driver — brushless DC 3-phase gate-driver / motor controller IC, 8-28 V',
    manufacturer: 'Texas Instruments', part_number: 'DRV10970',
    desc: 'Texas Instruments DRV10970 integrated 3-phase sensorless/Hall BLDC motor driver, 8-28 V, 1 A continuous (2 A peak), PWM speed control — drives the magnetic-coupling stirrer motor on a benchtop bioreactor. £2.50-4 ex VAT (distributor qty-1).',
    src: 'https://www.ti.com/product/DRV10970',
    unit_price_gbp: 3.20,
    component_class: 'motor_actuator',
  },
  {
    part_name: 'Stir-speed tachometer — bipolar Hall-effect latch sensor, digital, stirrer rpm feedback',
    manufacturer: 'Allegro MicroSystems', part_number: 'A1120EUA-T',
    desc: 'Allegro A1120 chopper-stabilised bipolar Hall-effect switch, open-drain digital output, 3.5-24 V, SIP-3, for counting the magnet-coupled stir-bar rotation (rpm tachometer feedback) on a benchtop bioreactor. £1-2 ex VAT (distributor qty-1).',
    src: 'https://www.allegromicro.com/en/products/sense/switches-and-latches/hall-effect-latches/a1120',
    unit_price_gbp: 1.60,
    component_class: 'sensor',
  },
  // ── Control electronics ─────────────────────────────────────────────────────────
  {
    part_name: 'Bioreactor controller microcontroller — dual-core MCU with Wi-Fi/BLE, 240 MHz, 4 MB flash module',
    manufacturer: 'Espressif Systems', part_number: 'ESP32-WROOM-32E',
    desc: 'Espressif ESP32-WROOM-32E module, dual-core Xtensa LX6 @ 240 MHz, 520 KB SRAM, 4 MB flash, Wi-Fi + Bluetooth/BLE, 3.3 V. Indicative main control MCU module for a benchtop bioreactor (sensor read, PID temperature + stirrer control, connectivity). £2.80-5 ex VAT (distributor qty-1).',
    src: 'https://www.espressif.com/en/products/modules/esp32',
    unit_price_gbp: 4.20,
  },
  {
    part_name: 'Bioreactor controller microcontroller — RP2040 dual-core Cortex-M0+ MCU, 133 MHz',
    manufacturer: 'Raspberry Pi', part_number: 'RP2040',
    desc: 'Raspberry Pi RP2040 dual-core Arm Cortex-M0+ @ 133 MHz, 264 KB on-chip SRAM, QFN-56, dual programmable-IO. Indicative low-cost microcontroller for a benchtop bioreactor control board (alternative to the ESP32 where wireless is not needed). £0.80-1.10 ex VAT (distributor qty-1).',
    src: 'https://www.raspberrypi.com/products/rp2040/',
    unit_price_gbp: 0.90,
  },
  {
    part_name: 'Firmware storage — 16 Mbit (2 MB) SPI NOR flash memory IC, 3 V, SOIC-8',
    manufacturer: 'Winbond', part_number: 'W25Q16JVSSIQ',
    desc: 'Winbond W25Q16JV 16 Mbit (2 MB) serial SPI NOR flash, quad-SPI, 2.7-3.6 V, 104 MHz, SOIC-208-mil. Indicative firmware / data-log storage IC for a benchtop bioreactor controller. £0.35-0.60 ex VAT (distributor qty-1).',
    src: 'https://www.winbond.com/hq/product/code-storage-flash-memory/serial-nor-flash/?__locale=en&partNo=W25Q16JV',
    unit_price_gbp: 0.45,
  },
  {
    part_name: 'USB interface connector — USB Type-C receptacle, 24-pin, USB 2.0, mid-mount SMT',
    manufacturer: 'Amphenol', part_number: '12401548E4#2A',
    desc: 'Amphenol 12401548E4#2A USB Type-C receptacle, 24 position, USB 2.0, right-angle SMT/through-hole hybrid, for the host/charge/data port on a benchtop bioreactor controller. £0.70-1.20 ex VAT (distributor qty-1).',
    src: 'https://www.amphenol-cs.com/product-series/usb-type-c.html',
    unit_price_gbp: 0.95,
  },
  // ── Fluid path (sterile_filter_vent + media_tubing) ─────────────────────────────
  {
    part_name: 'Sterile filter vent — 0.2 µm PTFE hydrophobic vent filter, 50 mm, gas/headspace sterilising',
    manufacturer: 'Pall', part_number: '4210',
    desc: 'Pall Acro 50 vent filter, 0.2 µm hydrophobic PTFE membrane, 50 mm, hose-barb inlet/outlet, autoclavable, for sterile gas venting / headspace over-pressure relief on a benchtop bioreactor vessel. Indicative 0.2 µm sterilising vent filter.',
    src: 'https://www.pall.com/en/laboratory/vent-filtration/acro-50-vent-devices.html',
    unit_price_gbp: null,
  },
  {
    part_name: 'Media tubing — platinum-cured silicone peristaltic pump tubing, 1.6 mm ID × 3.2 mm OD, per metre',
    manufacturer: 'Saint-Gobain', part_number: 'AAD04103',
    desc: 'Saint-Gobain Tygon 3350 platinum-cured silicone tubing, 1/16 in (1.6 mm) ID × 1/8 in (3.2 mm) OD, biopharm-grade, autoclavable/gamma-stable, USP Class VI. Indicative media / feed / peristaltic-pump tubing for a benchtop bioreactor. Sold per metre/roll; ~£3-5 per metre.',
    src: 'https://www.biopharm.saint-gobain.com/products/tygon-3350-silicone-tubing',
    unit_price_gbp: 4.00,
  },
  {
    part_name: 'Media tubing — PharMed BPT peristaltic pump tubing, 1.6 mm ID × 4.8 mm OD, long-life, per metre',
    manufacturer: 'Saint-Gobain', part_number: 'AY242408',
    desc: 'Saint-Gobain PharMed BPT thermoplastic-elastomer pump tubing, 1.6 mm ID, high-flex long-life (up to ~30× silicone pump-life), low permeability, USP Class VI, autoclavable. Indicative long-service peristaltic media tubing for a benchtop bioreactor feed pump. Sold per metre/roll; ~£6-9 per metre.',
    src: 'https://www.biopharm.saint-gobain.com/products/pharmed-bpt-tubing',
    unit_price_gbp: 7.50,
  },
  // ── Enclosure ───────────────────────────────────────────────────────────────────
  {
    part_name: 'Instrument enclosure shell — ABS desktop instrument case, 220×165×80 mm, sloped-front bench enclosure',
    manufacturer: 'Hammond Manufacturing', part_number: '1598CBK',
    desc: 'Hammond 1598C series moulded ABS desktop/instrument enclosure, 221×165×82 mm, sloped front panel, black, integral PCB standoffs. Indicative off-the-shelf benchtop-bioreactor controller enclosure shell. £14-20 ex VAT (distributor qty-1).',
    src: 'https://www.hammfg.com/electronics/small-case/plastic/1598',
    unit_price_gbp: 16.50,
  },
  {
    part_name: 'Instrument enclosure shell — extruded aluminium instrument case, 1455 series, 160×103×53 mm',
    manufacturer: 'Hammond Manufacturing', part_number: '1455L1601',
    desc: 'Hammond 1455L1601 extruded-aluminium instrument enclosure, 160×103×53 mm, snap-in PCB guides, plastic end panels. Indicative metal alternative benchtop-bioreactor controller enclosure shell. £12-18 ex VAT (distributor qty-1).',
    src: 'https://www.hammfg.com/electronics/small-case/extruded/1455',
    unit_price_gbp: 14.80,
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
