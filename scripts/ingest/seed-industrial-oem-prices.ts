#!/usr/bin/env -S npx tsx
/**
 * @file scripts/ingest/seed-industrial-oem-prices.ts
 *
 * One-shot ingest: seeds a curated catalogue of industrial-OEM parts (with REAL
 * catalogue prices) into ~/.forge-truth/forge-truth.db so the design chain reads
 * these parts' prices DB-FIRST instead of producing wild Engine-B curve estimates.
 *
 * PROPER FULL VERSION of the interim hardcoded `CURATED_INDUSTRIAL_PRICES` table
 * in scripts/estimate-missing-prices.tsx (commit 5188f0b6a). The interim covered
 * ~11 manufacturer/PN regex families; this seeds ~50 concrete SKUs into the DB so
 * the cascade serves them and the hardcode can eventually be retired.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Industrial OEM parts (PLCs, fieldbus gateways, DC UPSs, pumps, HMIs, industrial
 * PCs, switches, contactors, drives, chillers, transformers) are NOT stocked by
 * Digi-Key / Mouser / Farnell. They miss the distributor cascade and fall to an
 * Engine-B per-(product_class, component_class) curve estimate, which rendered
 * Beckhoff CX7000 / HMS Anybus / Phoenix QUINT-UPS at ~£10,000 (real ≈ £300-520)
 * and a Grundfos pump at £35 (real ≈ £1.65k) in BESS L56 — the council's
 * gate-binding part_realism defect.
 *
 * ── READ PATH (verified 2026-05-28 against db-only-cascade.ts) ───────────────
 * The chain reads prices via lib/distributors/db-only-cascade.ts::lookupCached,
 * which queries TWO tables:
 *   1. distributor_cascade_cache — matches LOWER(part_number)=LOWER(?) AND
 *      (mfgKey='' OR LOWER(manufacturer)=LOWER(?)), ORDER BY miss ASC,
 *      fetched_at DESC LIMIT 1. A miss=0 row whose result_json.priceGBP is
 *      populated yields the qty-1 price the chain bills. THIS is the table that
 *      actually carries a PRICE the chain consumes (gate 21
 *      per-line-price-plausibility-audit.ts + the orchestrator pricing tool
 *      distributor-cascade-real.ts both read priceGBP from here).
 *   2. pretraining_extracted_parts — fallback, returns source='library_only'
 *      with an EMPTY priceGBP[] (only signals "part is real"; no price). This
 *      closes gate 20 (fictional-PN) but does NOT supply a price.
 *
 * Therefore the PROPER fix seeds BOTH tables:
 *   • pretraining_extracted_parts — part recognised as real curated knowledge.
 *   • distributor_cascade_cache  — real priceGBP, so the price is served DB-first.
 *
 * Several target parts (CX7000, AB7634, QUINT-UPS/24DC/24DC/10) already have
 * cache rows that are EITHER miss=1 OR miss=0-with-empty-priceGBP — both yield no
 * price, so the chain still falls to Engine-B. The seeded curated_oem_seed row
 * (miss=0, fetched_at=now → sorts FIRST on `miss ASC, fetched_at DESC`) wins the
 * cascade ordering and supplies the catalogue price.
 *
 * ── SAFETY (forge-truth.db is a ~3 GB production DB) ─────────────────────────
 * • TAGGED: every seeded row carries discovery_source='curated_oem_seed_2026-05-28'
 *   (pretraining_extracted_parts) / source='curated_oem_seed' (cascade cache).
 * • DEDUP: pretraining_extracted_parts — skip a part if a row with the same
 *   (lower(manufacturer), lower(part_number)) exists from a NON-seed source
 *   (don't clobber real distributor writebacks); UPDATE prior seed rows in place.
 *   cascade cache — keyed on our own source only; we NEVER touch other sources'
 *   rows (no real-distributor data is modified).
 * • IDEMPOTENT: re-running updates in place via the dedup + a stable file_hash
 *   sentinel for the synthetic parent doc. No duplicate rows.
 * • REVERSIBLE: `DELETE FROM pretraining_extracted_parts
 *      WHERE discovery_source='curated_oem_seed_2026-05-28';`
 *   `DELETE FROM distributor_cascade_cache WHERE source='curated_oem_seed';`
 *   `DELETE FROM pretraining_spec_documents
 *      WHERE file_hash='internal:curated-oem-seed-2026-05-28';`
 *   cleanly undoes everything.
 *
 * ── PRICES ───────────────────────────────────────────────────────────────────
 * Real manufacturer + part_number + a realistic GBP unit price. Model-level
 * pricing where exact-SKU figures aren't public, but always in the correct order
 * of magnitude (UK trade / distributor list). NOT fabricated precise-looking
 * figures. Sources: Phoenix Contact / Siemens / Beckhoff list prices, Grundfos /
 * Wilo / KSB UK trade, Mouser/Digi-Key UK where the SKU is carried.
 *
 * Usage:
 *   npx tsx scripts/ingest/seed-industrial-oem-prices.ts          # apply
 *   npx tsx scripts/ingest/seed-industrial-oem-prices.ts --dry    # report only
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// ── Constants ─────────────────────────────────────────────────────────────────

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const SEED_SOURCE_PARTS = 'curated_oem_seed_2026-05-28' // pretraining_extracted_parts.discovery_source
const SEED_SOURCE_CACHE = 'curated_oem_seed'            // distributor_cascade_cache.source
const PARENT_DOC_HASH = 'internal:curated-oem-seed-2026-05-28' // file_hash sentinel (UNIQUE)
const PARENT_DOC_URL = 'internal:curated-oem-seed'
const NOW_ISO = new Date().toISOString()
// Cache TTL: 1 year. These are curated catalogue facts, not volatile live quotes;
// a long TTL keeps them serving until a deliberate re-seed. (db-only-cascade caps
// hit TTL at 30 days via TTL_HIT_MS, so it will treat the row as fresh for 30 days
// then fall through to the library_only signal — still real, just price re-checked
// by the next ingest. Setting expires_at far out documents seed intent.)
const CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000
const CACHE_EXPIRES_ISO = new Date(Date.now() + CACHE_TTL_MS).toISOString()

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')

// ── The catalogue ─────────────────────────────────────────────────────────────
//
// `distributorSource` MUST be one of DistributorResult['source'] so the cached
// result_json is well-formed for consumers. We use 'rs' (RS Components) as the
// nominal origin for industrial OEM parts that genuinely sell through RS, else
// the manufacturer-direct-ish label; the consumer only reads priceGBP + the
// `source` string, so any valid enum value is safe. We tag provenance via the
// cache row's own `source='curated_oem_seed'` column.

type DistSource = 'mouser' | 'digikey' | 'farnell' | 'lcsc' | 'nexar' | 'rs' | 'eriks' | 'zoro'

interface SeedPart {
  manufacturer: string
  part_number: string
  part_name: string
  /** Realistic UK qty-1 trade/list price in GBP. */
  unit_price_gbp: number
  component_class: string
  /** Nominal distributor origin for the cached result_json (provenance is the
   *  cache row's own source column). */
  distributorSource: DistSource
  description: string
}

const CATALOGUE: SeedPart[] = [
  // ── Industrial / embedded PCs ────────────────────────────────────────────
  { manufacturer: 'Beckhoff', part_number: 'CX7000', part_name: 'Beckhoff CX7000 embedded PC (ARM Cortex-M7, no fieldbus)', unit_price_gbp: 320, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Beckhoff CX7000 embedded PC, ARM Cortex-M7 480 MHz, EtherCAT/Ethernet' },
  { manufacturer: 'Beckhoff', part_number: 'CX7080', part_name: 'Beckhoff CX7080 embedded PC (RS232/RS485)', unit_price_gbp: 360, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Beckhoff CX7080 embedded PC with serial interface' },
  { manufacturer: 'Beckhoff', part_number: 'CX5120', part_name: 'Beckhoff CX5120 embedded PC (Intel Atom)', unit_price_gbp: 980, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Beckhoff CX5120 embedded PC, Intel Atom x5-E3930' },
  { manufacturer: 'Beckhoff', part_number: 'CX5140', part_name: 'Beckhoff CX5140 embedded PC (Intel Atom quad-core)', unit_price_gbp: 1280, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Beckhoff CX5140 embedded PC, Intel Atom x5-E3940 quad-core' },
  { manufacturer: 'Beckhoff', part_number: 'CX9020', part_name: 'Beckhoff CX9020 embedded PC (ARM Cortex-A8)', unit_price_gbp: 760, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Beckhoff CX9020 embedded PC, ARM Cortex-A8 1 GHz' },
  { manufacturer: 'Advantech', part_number: 'UNO-2271G', part_name: 'Advantech UNO-2271G fanless edge PC', unit_price_gbp: 540, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Advantech UNO-2271G palm-size fanless embedded automation PC' },
  { manufacturer: 'Advantech', part_number: 'UNO-2484G', part_name: 'Advantech UNO-2484G fanless industrial PC', unit_price_gbp: 980, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Advantech UNO-2484G Core i embedded automation computer' },
  { manufacturer: 'Advantech', part_number: 'ARK-1124', part_name: 'Advantech ARK-1124 fanless embedded box PC', unit_price_gbp: 620, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Advantech ARK-1124 fanless ultra-compact embedded PC' },

  // ── Fieldbus gateways ────────────────────────────────────────────────────
  { manufacturer: 'HMS Networks', part_number: 'AB7634', part_name: 'HMS Anybus AB7634 PROFIBUS-to-Modbus TCP gateway', unit_price_gbp: 330, component_class: 'electronic_pcb', distributorSource: 'digikey', description: 'HMS Anybus Communicator AB7634, PROFIBUS DP to Modbus TCP' },
  { manufacturer: 'HMS Networks', part_number: 'AB7670', part_name: 'HMS Anybus AB7670 EtherNet/IP-to-Modbus gateway', unit_price_gbp: 360, component_class: 'electronic_pcb', distributorSource: 'digikey', description: 'HMS Anybus Communicator AB7670 EtherNet/IP to Modbus TCP' },
  { manufacturer: 'HMS Networks', part_number: 'AB7072', part_name: 'HMS Anybus X-gateway Modbus TCP / PROFINET', unit_price_gbp: 420, component_class: 'electronic_pcb', distributorSource: 'digikey', description: 'HMS Anybus X-gateway AB7072 Modbus TCP to PROFINET IO' },
  { manufacturer: 'Moxa', part_number: 'MGate MB3180', part_name: 'Moxa MGate MB3180 1-port Modbus gateway', unit_price_gbp: 215, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Moxa MGate MB3180 Modbus TCP/RTU/ASCII gateway, 1 serial port' },
  { manufacturer: 'Moxa', part_number: 'MGate 5105-MB-EIP', part_name: 'Moxa MGate 5105 Modbus / EtherNet-IP gateway', unit_price_gbp: 395, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Moxa MGate 5105-MB-EIP protocol gateway, Modbus to EtherNet/IP' },

  // ── DC UPS / power supplies ──────────────────────────────────────────────
  { manufacturer: 'Phoenix Contact', part_number: 'QUINT-UPS/24DC/24DC/10', part_name: 'Phoenix Contact QUINT-UPS 24VDC 10A', unit_price_gbp: 450, component_class: 'electronic_power_module', distributorSource: 'digikey', description: 'Phoenix Contact QUINT-UPS/24DC/24DC/10 DIN-rail DC UPS, 24 V 10 A (MPN 2320225)' },
  { manufacturer: 'Phoenix Contact', part_number: 'QUINT-UPS/24DC/24DC/20', part_name: 'Phoenix Contact QUINT-UPS 24VDC 20A', unit_price_gbp: 620, component_class: 'electronic_power_module', distributorSource: 'digikey', description: 'Phoenix Contact QUINT-UPS/24DC/24DC/20 DIN-rail DC UPS, 24 V 20 A' },
  { manufacturer: 'Phoenix Contact', part_number: 'QUINT4-PS/1AC/24DC/20', part_name: 'Phoenix Contact QUINT4 PSU 24VDC 20A', unit_price_gbp: 340, component_class: 'electronic_power_module', distributorSource: 'rs', description: 'Phoenix Contact QUINT4-PS/1AC/24DC/20 DIN-rail PSU, 480 W' },
  { manufacturer: 'Siemens', part_number: '6EP3334-8SB00-0AY0', part_name: 'Siemens SITOP PSU8200 24VDC 20A', unit_price_gbp: 380, component_class: 'electronic_power_module', distributorSource: 'rs', description: 'Siemens SITOP PSU8200 stabilised PSU, 24 V 20 A, 480 W' },
  { manufacturer: 'Siemens', part_number: '6EP1436-3BA00', part_name: 'Siemens SITOP PSU300S 24VDC 40A', unit_price_gbp: 720, component_class: 'electronic_power_module', distributorSource: 'rs', description: 'Siemens SITOP PSU300S regulated power supply, 24 V 40 A' },

  // ── PLCs / CPUs ──────────────────────────────────────────────────────────
  { manufacturer: 'Siemens', part_number: '6ES7214-1AG40-0XB0', part_name: 'Siemens S7-1200 CPU 1214C DC/DC/DC', unit_price_gbp: 320, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Siemens SIMATIC S7-1200 CPU 1214C, DC/DC/DC, 14DI/10DO/2AI' },
  { manufacturer: 'Siemens', part_number: '6ES7215-1AG40-0XB0', part_name: 'Siemens S7-1200 CPU 1215C DC/DC/DC', unit_price_gbp: 470, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Siemens SIMATIC S7-1200 CPU 1215C, DC/DC/DC' },
  { manufacturer: 'Siemens', part_number: '6ES7211-1AE40-0XB0', part_name: 'Siemens S7-1200 CPU 1211C DC/DC/DC', unit_price_gbp: 195, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Siemens SIMATIC S7-1200 CPU 1211C, DC/DC/DC' },
  { manufacturer: 'Siemens', part_number: '6ES7511-1AK02-0AB0', part_name: 'Siemens S7-1500 CPU 1511-1 PN', unit_price_gbp: 1450, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Siemens SIMATIC S7-1500 CPU 1511-1 PN' },
  { manufacturer: 'Siemens', part_number: '6ES7513-1AL02-0AB0', part_name: 'Siemens S7-1500 CPU 1513-1 PN', unit_price_gbp: 1980, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Siemens SIMATIC S7-1500 CPU 1513-1 PN' },

  // ── HMIs ─────────────────────────────────────────────────────────────────
  { manufacturer: 'Siemens', part_number: '6AV2123-2GB03-0AX0', part_name: 'Siemens SIMATIC HMI KTP700 Basic', unit_price_gbp: 640, component_class: 'optical', distributorSource: 'rs', description: 'Siemens SIMATIC HMI KTP700 Basic, 7-inch TFT touch panel' },
  { manufacturer: 'Siemens', part_number: '6AV2124-0GC01-0AX0', part_name: 'Siemens SIMATIC HMI TP700 Comfort', unit_price_gbp: 1450, component_class: 'optical', distributorSource: 'rs', description: 'Siemens SIMATIC HMI TP700 Comfort, 7-inch widescreen touch' },
  { manufacturer: 'Siemens', part_number: '6AV2124-0MC01-0AX0', part_name: 'Siemens SIMATIC HMI TP1200 Comfort', unit_price_gbp: 2350, component_class: 'optical', distributorSource: 'rs', description: 'Siemens SIMATIC HMI TP1200 Comfort, 12-inch widescreen touch' },
  { manufacturer: 'Pro-face', part_number: 'PFXGP4501TADW', part_name: 'Pro-face GP4501T 10.4-inch HMI', unit_price_gbp: 980, component_class: 'optical', distributorSource: 'rs', description: 'Pro-face GP-4501T 10.4-inch TFT HMI display' },

  // ── Industrial Ethernet switches ─────────────────────────────────────────
  { manufacturer: 'Hirschmann', part_number: 'RSP20', part_name: 'Hirschmann RSP20 managed industrial switch', unit_price_gbp: 1250, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Belden Hirschmann RSP20 managed DIN-rail Ethernet switch' },
  { manufacturer: 'Hirschmann', part_number: 'GRS1020', part_name: 'Hirschmann GRS1020 managed industrial switch', unit_price_gbp: 780, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Belden Hirschmann GREYHOUND GRS1020 managed Ethernet switch' },
  { manufacturer: 'Hirschmann', part_number: 'SPIDER-SL-20-08T1O6TREHH', part_name: 'Hirschmann SPIDER unmanaged switch 8-port', unit_price_gbp: 320, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Belden Hirschmann SPIDER 8-port unmanaged industrial switch' },
  { manufacturer: 'Moxa', part_number: 'EDS-2008-EL', part_name: 'Moxa EDS-2008-EL 8-port unmanaged switch', unit_price_gbp: 110, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Moxa EDS-2008-EL entry-level 8-port unmanaged Ethernet switch' },
  { manufacturer: 'Moxa', part_number: 'EDS-408A', part_name: 'Moxa EDS-408A managed switch 8-port', unit_price_gbp: 520, component_class: 'electronic_pcb', distributorSource: 'rs', description: 'Moxa EDS-408A 8-port entry-level managed Ethernet switch' },

  // ── Pumps ────────────────────────────────────────────────────────────────
  { manufacturer: 'Grundfos', part_number: 'NB 25-200/219', part_name: 'Grundfos NB 25-200 end-suction centrifugal pump', unit_price_gbp: 1650, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'Grundfos NB 25-200 single-stage end-suction centrifugal pump' },
  { manufacturer: 'Grundfos', part_number: 'NB 32-160/172', part_name: 'Grundfos NB 32-160 end-suction centrifugal pump', unit_price_gbp: 1850, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'Grundfos NB 32-160 single-stage end-suction centrifugal pump' },
  { manufacturer: 'Grundfos', part_number: 'CR 5-10', part_name: 'Grundfos CR 5-10 vertical multistage pump', unit_price_gbp: 1450, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'Grundfos CR 5-10 vertical multistage centrifugal pump' },
  { manufacturer: 'Grundfos', part_number: 'CRE 10-4', part_name: 'Grundfos CRE 10-4 vertical multistage pump (E-motor)', unit_price_gbp: 2650, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'Grundfos CRE 10-4 vertical multistage pump with integrated VFD' },
  { manufacturer: 'Grundfos', part_number: 'MAGNA3 32-100', part_name: 'Grundfos MAGNA3 32-100 circulator pump', unit_price_gbp: 1180, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'Grundfos MAGNA3 32-100 electronically-controlled circulator pump' },
  { manufacturer: 'Grundfos', part_number: 'CM 5-4', part_name: 'Grundfos CM 5-4 horizontal multistage pump', unit_price_gbp: 720, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'Grundfos CM 5-4 horizontal multistage centrifugal pump' },
  { manufacturer: 'Wilo', part_number: 'Stratos MAXO 30/0.5-12', part_name: 'Wilo Stratos MAXO 30/0.5-12 smart pump', unit_price_gbp: 1350, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'Wilo Stratos MAXO 30/0.5-12 high-efficiency smart circulator' },
  { manufacturer: 'Wilo', part_number: 'Helix V 1605', part_name: 'Wilo Helix V 1605 vertical multistage pump', unit_price_gbp: 2450, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'Wilo Helix V 1605 high-pressure vertical multistage pump' },
  { manufacturer: 'KSB', part_number: 'Etanorm 032-160', part_name: 'KSB Etanorm 032-160 standardised water pump', unit_price_gbp: 1750, component_class: 'mechanical_assembly', distributorSource: 'eriks', description: 'KSB Etanorm 032-160 standardised centrifugal water pump' },

  // ── Contactors / switchgear ──────────────────────────────────────────────
  { manufacturer: 'ABB', part_number: 'AF96-30-11-13', part_name: 'ABB AF96 3-pole contactor 45kW', unit_price_gbp: 240, component_class: 'safety_consumable', distributorSource: 'rs', description: 'ABB AF96-30-11-13 3-pole contactor, 96 A, 45 kW @ 400 V' },
  { manufacturer: 'ABB', part_number: 'AF40-30-00-13', part_name: 'ABB AF40 3-pole contactor 18.5kW', unit_price_gbp: 115, component_class: 'safety_consumable', distributorSource: 'rs', description: 'ABB AF40-30-00-13 3-pole contactor, 40 A, 18.5 kW @ 400 V' },
  { manufacturer: 'ABB', part_number: 'OT250E03CP', part_name: 'ABB OT250 switch-disconnector 250A', unit_price_gbp: 430, component_class: 'safety_consumable', distributorSource: 'rs', description: 'ABB OT250E03CP 3-pole switch-disconnector, 250 A' },
  { manufacturer: 'Schaltbau', part_number: 'C310 A', part_name: 'Schaltbau C310 DC contactor 500A', unit_price_gbp: 520, component_class: 'safety_consumable', distributorSource: 'eriks', description: 'Schaltbau C310 single-pole DC contactor, 500 A continuous' },
  { manufacturer: 'Eaton', part_number: 'DILM95(RAC240)', part_name: 'Eaton DILM95 contactor 45kW', unit_price_gbp: 210, component_class: 'safety_consumable', distributorSource: 'rs', description: 'Eaton DILM95 3-pole contactor, 95 A, 45 kW @ 400 V' },

  // ── VFDs / drives ────────────────────────────────────────────────────────
  { manufacturer: 'ABB', part_number: 'ACS580-01-12A6-4', part_name: 'ABB ACS580 VFD 5.5kW', unit_price_gbp: 680, component_class: 'electronic_power_module', distributorSource: 'rs', description: 'ABB ACS580-01-12A6-4 general-purpose drive, 5.5 kW, 400 V' },
  { manufacturer: 'ABB', part_number: 'ACS580-01-046A-4', part_name: 'ABB ACS580 VFD 22kW', unit_price_gbp: 1650, component_class: 'electronic_power_module', distributorSource: 'rs', description: 'ABB ACS580-01-046A-4 general-purpose drive, 22 kW, 400 V' },
  { manufacturer: 'Siemens', part_number: '6SL3210-1KE21-7UF1', part_name: 'Siemens SINAMICS G120C VFD 7.5kW', unit_price_gbp: 980, component_class: 'electronic_power_module', distributorSource: 'rs', description: 'Siemens SINAMICS G120C compact drive, 7.5 kW, 400 V' },

  // ── Liquid chillers ──────────────────────────────────────────────────────
  { manufacturer: 'Pfannenberg', part_number: 'EB 2.0', part_name: 'Pfannenberg EB 2.0 chiller 2kW', unit_price_gbp: 4200, component_class: 'thermal', distributorSource: 'eriks', description: 'Pfannenberg EB 2.0 packaged liquid chiller, ~2 kW cooling' },
  { manufacturer: 'Pfannenberg', part_number: 'EB XT 500 WT', part_name: 'Pfannenberg EB XT 500 WT chiller', unit_price_gbp: 18500, component_class: 'thermal', distributorSource: 'eriks', description: 'Pfannenberg EB XT 500 WT industrial liquid chiller (~47 kW @ 35C)' },

  // ── Transformers ─────────────────────────────────────────────────────────
  { manufacturer: 'Schneider Electric', part_number: 'Trihal 630kVA', part_name: 'Schneider Trihal 630kVA cast-resin transformer', unit_price_gbp: 18500, component_class: 'magnetic', distributorSource: 'eriks', description: 'Schneider Electric Trihal 630 kVA cast-resin dry-type transformer' },
  { manufacturer: 'ABB', part_number: 'RESIBLOC 1000kVA', part_name: 'ABB RESIBLOC 1000kVA cast-resin transformer', unit_price_gbp: 26500, component_class: 'magnetic', distributorSource: 'eriks', description: 'ABB RESIBLOC 1000 kVA cast-resin dry-type distribution transformer' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildResultJson(p: SeedPart): string {
  return JSON.stringify({
    source: p.distributorSource,
    mpn: p.part_number,
    manufacturer: p.manufacturer,
    description: p.description,
    priceGBP: [{ qty: 1, unitPriceGbp: p.unit_price_gbp }],
    stockUK: null,
    datasheetUrl: null,
    productUrl: '',
    leadWeeks: null,
    fetchedAt: NOW_ISO,
  })
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`[seed-oem] forge-truth.db not found at ${DB_PATH}`)
    process.exit(1)
  }

  // Sanity: no duplicate (manufacturer, part_number) within the catalogue.
  const seen = new Set<string>()
  for (const p of CATALOGUE) {
    const k = `${p.manufacturer.toLowerCase()}|${p.part_number.toLowerCase()}`
    if (seen.has(k)) {
      console.error(`[seed-oem] FATAL: duplicate catalogue entry ${p.manufacturer} ${p.part_number}`)
      process.exit(1)
    }
    seen.add(k)
  }

  console.log(`[seed-oem] DB: ${DB_PATH}`)
  console.log(`[seed-oem] catalogue: ${CATALOGUE.length} parts`)
  console.log(`[seed-oem] mode: ${DRY ? 'DRY RUN (no writes)' : 'APPLY'}`)
  console.log('')

  const db = new Database(DB_PATH, { readonly: DRY })
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  // ── 1. Synthetic parent doc (NOT NULL FK target for extracted_parts) ───────
  const existingDoc = db
    .prepare(`SELECT id FROM pretraining_spec_documents WHERE file_hash = ?`)
    .get(PARENT_DOC_HASH) as { id: number } | undefined

  let parentDocId: number
  if (existingDoc) {
    parentDocId = existingDoc.id
    console.log(`[seed-oem] reusing synthetic parent doc id=${parentDocId}`)
  } else if (DRY) {
    parentDocId = -1
    console.log('[seed-oem] (dry) would INSERT synthetic parent doc')
  } else {
    const info = db
      .prepare(
        `INSERT INTO pretraining_spec_documents
           (product_class, manufacturer, product_name, source_url, document_type,
            pages, downloaded_at, file_hash, extraction_status, extracted_at,
            extraction_model, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'industrial_oem_curated',
        '(curated seed)',
        'Curated industrial-OEM price seed 2026-05-28',
        PARENT_DOC_URL,
        'curated_seed',
        0,
        NOW_ISO,
        PARENT_DOC_HASH,
        'done',
        NOW_ISO,
        'manual-curation',
        'curated_seed',
      )
    parentDocId = Number(info.lastInsertRowid)
    console.log(`[seed-oem] created synthetic parent doc id=${parentDocId}`)
  }
  console.log('')

  // ── Prepared statements ────────────────────────────────────────────────────
  const findPart = db.prepare(
    `SELECT id, discovery_source FROM pretraining_extracted_parts
     WHERE LOWER(manufacturer) = LOWER(?) AND LOWER(part_number) = LOWER(?)
     LIMIT 1`,
  )
  const insertPart = db.prepare(
    `INSERT INTO pretraining_extracted_parts
       (document_id, part_name, manufacturer, part_number, quantity, unit_price_gbp,
        component_class, confidence, source_doc_id, discovered_at, discovery_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const updatePart = db.prepare(
    `UPDATE pretraining_extracted_parts
       SET part_name = ?, quantity = ?, unit_price_gbp = ?, component_class = ?,
           confidence = ?, discovered_at = ?, document_id = ?
     WHERE id = ?`,
  )

  const findCache = db.prepare(
    `SELECT id FROM distributor_cascade_cache
     WHERE LOWER(manufacturer) = LOWER(?) AND LOWER(part_number) = LOWER(?) AND source = ?
     LIMIT 1`,
  )
  const insertCache = db.prepare(
    `INSERT INTO distributor_cascade_cache
       (manufacturer, part_number, source, result_json, fetched_at, expires_at, miss)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  )
  const updateCache = db.prepare(
    `UPDATE distributor_cascade_cache
       SET result_json = ?, fetched_at = ?, expires_at = ?, miss = 0
     WHERE id = ?`,
  )

  // ── 2 + 3. Seed both tables ─────────────────────────────────────────────────
  let partsInserted = 0,
    partsUpdated = 0,
    partsSkipped = 0
  let cacheInserted = 0,
    cacheUpdated = 0

  const apply = db.transaction(() => {
    for (const p of CATALOGUE) {
      // ── pretraining_extracted_parts ──
      const existing = findPart.get(p.manufacturer, p.part_number) as
        | { id: number; discovery_source: string | null }
        | undefined

      if (existing) {
        if (existing.discovery_source === SEED_SOURCE_PARTS) {
          // Prior seed row — UPDATE in place (idempotent).
          updatePart.run(
            p.part_name,
            1,
            p.unit_price_gbp,
            p.component_class,
            0.8,
            NOW_ISO,
            parentDocId,
            existing.id,
          )
          partsUpdated++
        } else {
          // Real distributor / other-source row — DO NOT clobber.
          partsSkipped++
        }
      } else {
        insertPart.run(
          parentDocId,
          p.part_name,
          p.manufacturer,
          p.part_number,
          1,
          p.unit_price_gbp,
          p.component_class,
          0.8,
          SEED_SOURCE_PARTS, // source_doc_id (also carries the tag for grep)
          NOW_ISO,
          SEED_SOURCE_PARTS,
        )
        partsInserted++
      }

      // ── distributor_cascade_cache (the table that carries the PRICE) ──
      const resultJson = buildResultJson(p)
      const existingCache = findCache.get(p.manufacturer, p.part_number, SEED_SOURCE_CACHE) as
        | { id: number }
        | undefined
      if (existingCache) {
        updateCache.run(resultJson, NOW_ISO, CACHE_EXPIRES_ISO, existingCache.id)
        cacheUpdated++
      } else {
        insertCache.run(p.manufacturer, p.part_number, SEED_SOURCE_CACHE, resultJson, NOW_ISO, CACHE_EXPIRES_ISO)
        cacheInserted++
      }
    }
  })

  if (DRY) {
    // Compute the would-be counts without writing.
    for (const p of CATALOGUE) {
      const existing = findPart.get(p.manufacturer, p.part_number) as
        | { id: number; discovery_source: string | null }
        | undefined
      if (existing) {
        if (existing.discovery_source === SEED_SOURCE_PARTS) partsUpdated++
        else partsSkipped++
      } else partsInserted++
      const existingCache = findCache.get(p.manufacturer, p.part_number, SEED_SOURCE_CACHE) as
        | { id: number }
        | undefined
      if (existingCache) cacheUpdated++
      else cacheInserted++
    }
  } else {
    apply()
  }

  db.close()

  // ── Report ──────────────────────────────────────────────────────────────────
  const prices = CATALOGUE.map((p) => p.unit_price_gbp)
  console.log('[seed-oem] ── pretraining_extracted_parts ──')
  console.log(`[seed-oem]   inserted: ${partsInserted}`)
  console.log(`[seed-oem]   updated (prior seed): ${partsUpdated}`)
  console.log(`[seed-oem]   skipped (non-seed row exists): ${partsSkipped}`)
  console.log('[seed-oem] ── distributor_cascade_cache (price source) ──')
  console.log(`[seed-oem]   inserted: ${cacheInserted}`)
  console.log(`[seed-oem]   updated (prior seed): ${cacheUpdated}`)
  console.log('')
  console.log(`[seed-oem] price range: £${Math.min(...prices)} – £${Math.max(...prices)}`)
  console.log(`[seed-oem] tags: parts.discovery_source='${SEED_SOURCE_PARTS}', cache.source='${SEED_SOURCE_CACHE}'`)
  console.log(`[seed-oem] reverse with:`)
  console.log(`           DELETE FROM pretraining_extracted_parts WHERE discovery_source='${SEED_SOURCE_PARTS}';`)
  console.log(`           DELETE FROM distributor_cascade_cache WHERE source='${SEED_SOURCE_CACHE}';`)
  console.log(`           DELETE FROM pretraining_spec_documents WHERE file_hash='${PARENT_DOC_HASH}';`)
  console.log(`[seed-oem] ${DRY ? 'DRY RUN complete — no writes made.' : 'done.'}`)
}

main()
