/**
 * @file scripts/ingest/run-monthly-oem-scrape.ts — Monthly BESS OEM scrape stub.
 *
 * STUB — full implementation pending. This file scaffolds the monthly OEM
 * product-page scrape so the cron can fire it and the LOG output confirms
 * the job ran, even while individual scrapers are being built.
 *
 * WHY THIS EXISTS:
 * BESS industrial subsystems (PCS inverters, Sungrow batteries, ABB contactors,
 * Grundfos pumps, Beckhoff IPCs, Kidde suppression, Stat-X aerosol generators,
 * SMA inverters, GE LV5+ protection relays, Hitachi energy storage) are not
 * stocked by Mouser/Digi-Key/Farnell. The weekly component sweep (Mouser +
 * DigiKey keyword scan) misses them entirely. These parts need a separate
 * OEM-direct scraping pipeline writing to pretraining_extracted_parts.
 *
 * HOW TO USE (now — stub mode):
 *   npx tsx scripts/ingest/run-monthly-oem-scrape.ts
 *
 * Each OEM entry below logs a TODO with:
 *   - The vendor's product page URL
 *   - What data is available on that page
 *   - Manual-curation instructions for when a scraper isn't ready
 *
 * HOW TO EXTEND (when building a real scraper):
 *   1. Add a scrapeXxx() function for the OEM.
 *   2. Call it from the OEM_TARGETS loop where the TODO stub is.
 *   3. Write results to ~/.forge-truth/forge-truth.db via library-writeback.ts
 *      (already handles INSERT OR IGNORE on (manufacturer, part_number)).
 *
 * QUOTA NOTE: OEM direct websites have no rate limit (not an API). Use
 * reasonable delays (≥1 s between page fetches) to avoid triggering WAF.
 * Patchright (Playwright-based) is available for JS-rendered pages.
 *
 * British spelling throughout.
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// ── OEM target list ────────────────────────────────────────────────────────────

interface OemTarget {
  /** Canonical manufacturer name as it should appear in forge-truth.db */
  manufacturer: string
  /** Primary product catalogue page URL */
  url: string
  /** What SKUs/specs are typically listed on this page */
  dataAvailable: string
  /** Manual-curation instructions for operators */
  manualInstructions: string
  /** Whether a real scraper has been implemented yet */
  scraperReady: boolean
}

const OEM_TARGETS: OemTarget[] = [
  {
    manufacturer: 'Sungrow',
    url: 'https://www.sungrowpower.com/products',
    dataAvailable: 'BESS PCS (SH/SC series), string inverters, HV battery system specs, model numbers, rated power, voltage range',
    manualInstructions: 'Navigate to Products > Energy Storage > Battery Storage Systems. For each product, record: model_number, rated_power_kw, dc_voltage_range_v, efficiency_pct, datasheet_url. Insert into pretraining_extracted_parts with manufacturer="Sungrow", discovery_source="oem:sungrow".',
    scraperReady: false,
  },
  {
    manufacturer: 'ABB',
    url: 'https://new.abb.com/products/electrification/energy-storage',
    dataAvailable: 'ABB BESS systems, MV switchgear, contactors, protection relays, MVX series specs',
    manualInstructions: 'Navigate to Products > Energy Storage. Record: model_number, rated_power_kw, container_footprint, certifications. For switchgear/contactors: rated_current_a, rated_voltage_v, poles.',
    scraperReady: false,
  },
  {
    manufacturer: 'Grundfos',
    url: 'https://product.grundfos.com/catalogue/pump/cm',
    dataAvailable: 'CM/CME series circulator pumps — flow_m3h, head_m, power_kw, inlet/outlet diameter',
    manualInstructions: 'Navigate to Industrial Pumps > Multistage Centrifugal. For CM/CME models used in BESS cooling loops: record part_number (e.g. CM5-4 A-R-A-E-AQQE), flow_m3h, max_head_m, power_kw, DN_size. Prices on request — leave price_estimate_gbp NULL.',
    scraperReady: false,
  },
  {
    manufacturer: 'Beckhoff',
    url: 'https://www.beckhoff.com/en-gb/products/ipc/',
    dataAvailable: 'CX/IPC series industrial computers — CPU, RAM, storage, OS, I/O modules, EtherCAT terminals',
    manualInstructions: 'Navigate to Products > Industrial PC > Embedded PC. For CX series (CX2040/CX5120/CX9020): record part_number, cpu_model, ram_gb, storage_gb, os, certifications. Check UK configurator for GBP pricing.',
    scraperReady: false,
  },
  {
    manufacturer: 'Kidde',
    url: 'https://kidde-fenwal.com/products/fire-suppression-systems/',
    dataAvailable: 'FM-200 / Novec 1230 suppression systems — cylinder sizes, agent weight, nozzle coverage, certifications',
    manualInstructions: 'Navigate to Products > Clean Agent Systems. For BESS applications: record model_number, agent_type (HFC-227ea or FK-5-1-12), cylinder_capacity_kg, discharge_time_s, listed_standards (UL 2166, FM 5600, EN 15004). No public GBP pricing — leave NULL.',
    scraperReady: false,
  },
  {
    manufacturer: 'Stat-X',
    url: 'https://www.stat-x.com/products/',
    dataAvailable: 'Aerosol-based suppression generators — activation temp, coverage_volume_m3, weight_kg, generator dimensions',
    manualInstructions: 'Navigate to Products > Stat-X Generators. Record: model_number (e.g. Stat-X 250E), activation_temp_c, coverage_volume_m3, generator_weight_kg, certifications (UL 2775, FM). These are the primary fire suppression for BESS containers.',
    scraperReady: false,
  },
  {
    manufacturer: 'SMA',
    url: 'https://www.sma-uk.com/products/battery-inverters/',
    dataAvailable: 'Sunny Island / Sunny Tripower Storage — rated_power_kw, dc_voltage_range_v, ac_voltage_v, efficiency_pct, grid_tie_standard',
    manualInstructions: 'Navigate to Products > Battery Inverters. For SI 8.0H/SI 6.0H and STP Storage: record model_number, rated_power_kw, dc_voltage_min/max_v, ac_output_voltage_v, efficiency_pct, standards_citation (G99, G100). GBP pricing from SMA UK distributor network.',
    scraperReady: false,
  },
  {
    manufacturer: 'GE Grid Solutions',
    url: 'https://www.gegridsolutions.com/multilin/catalog/LV5.htm',
    dataAvailable: 'LV5+ feeder protection relay — rated_current_a, rated_voltage_v, protection_functions, communication_protocols, dimensions',
    manualInstructions: 'Navigate to LV5+ product page. Record: model_number (LV5+), ct_primary_a options (5A/1A secondary), rated_voltage_v (100-240 V AC), protection_functions (50/51/67/27/59/81/78), dimensions_mm, weight_kg, certifications (IEC 60255, CE). Pricing from GE distributor network.',
    scraperReady: false,
  },
  {
    manufacturer: 'Hitachi Energy',
    url: 'https://www.hitachienergy.com/products-and-solutions/energy-storage/',
    dataAvailable: 'TeraCool / Modular BESS — container_size_mwh, power_mw, cycle_life, round_trip_efficiency_pct, cooling_type, certifications',
    manualInstructions: 'Navigate to Energy Storage > Grid-Scale. Record: product_family, energy_mwh per container, power_mw per container, round_trip_efficiency_pct, cycle_life, operating_temp_range_c, certifications (IEC 62933, UL 9540, IEC 61000). Pricing on request — leave NULL.',
    scraperReady: false,
  },
  {
    manufacturer: 'Pfannenberg',
    url: 'https://www.pfannenberg.com/en/products/thermal-management/cooling-units/',
    dataAvailable: 'EB XT / DTS series liquid chillers — cooling_capacity_kw at various ambient temps, refrigerant type, connections, certifications',
    manualInstructions: 'Navigate to Products > Thermal Management > Cooling Units > Liquid Cooling. For EB XT 500 WT / EB XT 700 WT: record model_number, cooling_capacity_kw at 35C and 50C ambient (from product datasheet curve), refrigerant (R452A), inlet/outlet connection_dn, weight_kg, certifications (CE, UL). GBP pricing from Pfannenberg UK distributor.',
    scraperReady: false,
  },
]

// ── Main ───────────────────────────────────────────────────────────────────────

const FORGE_TRUTH_DIR = resolve(homedir(), '.forge-truth')
const LOG_FILE = resolve(FORGE_TRUTH_DIR, `ingest-monthly-oem-${new Date().toISOString().slice(0, 10)}.log`)

function log(msg: string): void {
  const line = `[monthly-oem] ${msg}`
  console.log(line)
  try {
    if (!existsSync(FORGE_TRUTH_DIR)) mkdirSync(FORGE_TRUTH_DIR, { recursive: true })
    appendFileSync(LOG_FILE, line + '\n', 'utf-8')
  } catch {
    // Non-fatal logging failure
  }
}

async function main(): Promise<void> {
  log(`Starting monthly OEM scrape — ${new Date().toISOString()}`)
  log(`Log file: ${LOG_FILE}`)
  log(`OEM targets: ${OEM_TARGETS.length}`)
  log('')

  let scraperReadyCount = 0
  let stubCount = 0

  for (const target of OEM_TARGETS) {
    if (target.scraperReady) {
      scraperReadyCount += 1
      log(`[READY] ${target.manufacturer} — scraper implemented, would run now`)
      // TODO: call scrapeXxx(target) here when implemented
    } else {
      stubCount += 1
      log(`[TODO] ${target.manufacturer}`)
      log(`  URL: ${target.url}`)
      log(`  Data available: ${target.dataAvailable}`)
      log(`  Manual curation: ${target.manualInstructions}`)
      log('')
    }
  }

  log('')
  log(`Summary: ${scraperReadyCount} scrapers ready (ran), ${stubCount} stubs (TODO)`)
  log(`Full manual-curation instructions logged above and to ${LOG_FILE}`)
  log('Next step: implement scrapeXxx() functions for each OEM above, or perform manual curation.')
}

main().catch((err) => {
  console.error(`[monthly-oem] fatal error: ${(err as Error).message}`)
  process.exit(1)
})
