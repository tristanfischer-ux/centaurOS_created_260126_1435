/**
 * distributor-keyword-map.ts — Phase 4 corpus sweep target list (2026-05-18)
 *
 * Maps each of the 20 ComponentClass entries (component-classes.ts) to 1–2
 * distributor keywords plus the preferred distributor for that class. The
 * preference is informed by who actually wins on listing volume + manufacturer
 * coverage per Tristan's notes on the POC:
 *
 *   - Mouser is RECOM / Murata Power / Mean Well / TDK-Lambda heavy. Strong
 *     on integrated power modules, OEM converters, EMI filters, ferrites.
 *   - DigiKey is TI / Vicor / Infineon / Wolfspeed / Linear heavy. Strong on
 *     power semiconductors, MCUs, opamps, discrete MOSFETs/IGBTs and the
 *     long tail of MLCC / resistor / connector reels.
 *   - Both carry sensors, fasteners, fans, batteries — we run them in
 *     parallel and dedup on `(manufacturer, part_number)` at write time.
 *
 * The sweep visits EVERY (keyword, distributor) tuple where `enabled !== false`.
 * Each tuple ≈ 1 page-per-tick × 1000 records/keyword max. With Mouser +
 * DigiKey rate caps at ~1000 calls/day each, the full ~30-tuple-per-distributor
 * sweep takes ~3 days end-to-end (see ETA at the bottom of this file).
 *
 * Tooling: imported by `scripts/ingest-distributor-catalogue.ts --all-classes`.
 */

import type { ComponentClass } from '../src/lib/pdf-engine-v2/component-classes'

export type Distributor = 'mouser' | 'digikey'

export interface KeywordTarget {
  /** ComponentClass this keyword is mapped to. */
  componentClass: ComponentClass
  /** Distributor to query. */
  distributor: Distributor
  /** Search term passed to the distributor's keyword endpoint. */
  keyword: string
  /** Max pages (50 rec/page on Mouser, 50 rec/page on DigiKey). */
  maxPages: number
  /**
   * One-line rationale — recorded in the sweep-progress JSON so a human can
   * audit what we expected this keyword to return.
   */
  rationale: string
  /** Set false to skip without removing the entry. */
  enabled?: boolean
}

// ---------------------------------------------------------------------------
// Keyword map — 36 tuples across 20 component classes.
//
// One-line per row, sorted by componentClass for human grep-ability. Each
// row picks the distributor we believe yields the most useful catalogue for
// that class, then a secondary distributor where the second pass adds
// meaningfully different manufacturers.
// ---------------------------------------------------------------------------

export const KEYWORD_MAP: KeywordTarget[] = [
  // electronic_ic — TI / ST / NXP / Microchip live on DigiKey first
  { componentClass: 'electronic_ic', distributor: 'digikey', keyword: 'microcontroller',           maxPages: 20, rationale: 'MCU long tail (STM32, RP2040, MSP430, PIC, RA, K-series).' },
  { componentClass: 'electronic_ic', distributor: 'mouser',  keyword: 'op amp',                    maxPages: 20, rationale: 'OpAmp catalog — TI, ADI, ON, ST, Microchip overlap.' },

  // electronic_passive — reel parts; DigiKey first, Mouser secondary
  { componentClass: 'electronic_passive', distributor: 'digikey', keyword: 'MLCC capacitor',       maxPages: 20, rationale: 'Murata / TDK / Samsung / KEMET / Yageo MLCC reels.' },
  { componentClass: 'electronic_passive', distributor: 'mouser',  keyword: 'chip resistor',        maxPages: 20, rationale: 'Yageo / Panasonic / Vishay / KOA / Bourns resistor reels.' },

  // electronic_discrete — DigiKey strong on Infineon / Vishay / ON
  { componentClass: 'electronic_discrete', distributor: 'digikey', keyword: 'MOSFET transistor',   maxPages: 20, rationale: 'Discrete MOSFETs (Infineon, Vishay, ON, Toshiba, Nexperia).' },
  { componentClass: 'electronic_discrete', distributor: 'mouser',  keyword: 'schottky diode',      maxPages: 15, rationale: 'Schottky / TVS / Zener diode catalog.' },

  // electronic_pcb — neither distributor really stocks bare PCB; we proxy
  // via "PCB development board" + "PCB assembly" so the corpus at least has
  // *some* anchor rows for the dev-kit-ish products. Low pages.
  { componentClass: 'electronic_pcb', distributor: 'mouser',  keyword: 'development board',        maxPages: 10, rationale: 'Eval / dev boards are PCB-anchor proxies for Engine C.' },
  { componentClass: 'electronic_pcb', distributor: 'digikey', keyword: 'evaluation board',         maxPages: 10, rationale: 'Reference designs / eval kits — populated PCB anchors.' },

  // electronic_connector — both carry Molex / TE / JST / Hirose
  { componentClass: 'electronic_connector', distributor: 'digikey', keyword: 'header connector',   maxPages: 20, rationale: 'PCB headers, JST PH/XH, Molex Pico/Mini, board-to-board.' },
  { componentClass: 'electronic_connector', distributor: 'mouser',  keyword: 'M12 connector',      maxPages: 15, rationale: 'M12 industrial — Phoenix, Binder, TE, Amphenol.' },

  // electronic_cable — fewer SKUs but pricing matters for industrial systems
  { componentClass: 'electronic_cable',  distributor: 'mouser',  keyword: 'cable assembly',        maxPages: 15, rationale: 'Pre-assembled harnesses, USB / Ethernet / power.' },
  { componentClass: 'electronic_cable',  distributor: 'digikey', keyword: 'ribbon cable',          maxPages: 10, rationale: 'IDC / flat ribbon — 3M, Amphenol, Wurth.' },

  // electronic_power_module — RECOM-heavy → Mouser primary
  { componentClass: 'electronic_power_module', distributor: 'mouser',  keyword: 'DC-DC converter module', maxPages: 25, rationale: 'RECOM / TDK-Lambda / Murata Power / Mean Well concentrated.' },
  { componentClass: 'electronic_power_module', distributor: 'digikey', keyword: 'IGBT module',     maxPages: 20, rationale: 'Wolfspeed / Infineon SiC + IGBT power modules.' },

  // sensor — both strong; spread by sub-domain
  { componentClass: 'sensor', distributor: 'digikey', keyword: 'temperature sensor',               maxPages: 20, rationale: 'Thermistors, RTDs, IC temp sensors (TI, Analog, Maxim).' },
  { componentClass: 'sensor', distributor: 'mouser',  keyword: 'pressure sensor',                  maxPages: 20, rationale: 'Honeywell / Bosch / TE / NXP pressure modules.' },
  { componentClass: 'sensor', distributor: 'mouser',  keyword: 'hall effect sensor',               maxPages: 10, rationale: 'Allegro / Infineon / Melexis hall sensors.' },

  // motor_actuator — Mouser strong on Nidec / Portescap / Pololu, DigiKey on Trinamic
  { componentClass: 'motor_actuator', distributor: 'mouser',  keyword: 'BLDC motor',               maxPages: 15, rationale: 'BLDC + brush motors — Nidec, Portescap, Maxon.' },
  { componentClass: 'motor_actuator', distributor: 'digikey', keyword: 'stepper motor',            maxPages: 15, rationale: 'NEMA / 28BYJ stepper plus Trinamic drivers.' },
  { componentClass: 'motor_actuator', distributor: 'mouser',  keyword: 'solenoid actuator',        maxPages: 10, rationale: 'Solenoid / linear actuators — Magnet-Schultz, Ledex.' },

  // magnetic — transformers, large inductors
  { componentClass: 'magnetic', distributor: 'mouser',  keyword: 'power inductor',                 maxPages: 15, rationale: 'Wurth / Coilcraft / Vishay power inductors >10uH.' },
  { componentClass: 'magnetic', distributor: 'digikey', keyword: 'transformer',                    maxPages: 15, rationale: 'Pulse / Coilcraft / Wurth / Bourns transformers.' },

  // optical — LEDs + photodiodes + small displays
  { componentClass: 'optical', distributor: 'mouser',  keyword: 'LED indicator',                   maxPages: 15, rationale: 'Indicator + power LEDs (Cree, Lumileds, Lite-On, Kingbright).' },
  { componentClass: 'optical', distributor: 'digikey', keyword: 'photodiode',                      maxPages: 10, rationale: 'Photodiodes + phototransistors (Vishay, ON, Hamamatsu).' },
  { componentClass: 'optical', distributor: 'mouser',  keyword: 'OLED display',                    maxPages: 8,  rationale: 'Small displays for control panels (Newhaven, Densitron, Solomon).' },

  // structural_metal — distributors don't really stock raw weldments but
  // *do* stock enclosures + brackets in volume.
  { componentClass: 'structural_metal', distributor: 'mouser',  keyword: 'metal enclosure',        maxPages: 15, rationale: 'Hammond, Bud, Bopla metal enclosures.' },
  { componentClass: 'structural_metal', distributor: 'digikey', keyword: 'din rail bracket',       maxPages: 10, rationale: 'DIN-rail mounts, brackets — Phoenix, Bopla.' },

  // structural_polymer — same caveat
  { componentClass: 'structural_polymer', distributor: 'digikey', keyword: 'plastic enclosure',    maxPages: 15, rationale: 'ABS / polycarbonate enclosures — Hammond, Bud, OKW.' },
  { componentClass: 'structural_polymer', distributor: 'mouser',  keyword: 'plastic standoff',     maxPages: 10, rationale: 'Nylon / polymer standoffs + spacers.' },

  // mechanical_fastener — both stock Keystone, Wurth, Bivar
  { componentClass: 'mechanical_fastener', distributor: 'digikey', keyword: 'machine screw',       maxPages: 15, rationale: 'M2 / M2.5 / M3 / M4 machine screws (Keystone, Wurth, Bivar).' },
  { componentClass: 'mechanical_fastener', distributor: 'mouser',  keyword: 'panel mount screw',   maxPages: 8,  rationale: 'Captive / panel-mount fasteners.' },

  // mechanical_assembly — fans, bearings, gears, hinges
  { componentClass: 'mechanical_assembly', distributor: 'mouser',  keyword: 'cooling fan',         maxPages: 15, rationale: 'Sunon / Delta / Nidec / NMB axial + blower fans.' },
  { componentClass: 'mechanical_assembly', distributor: 'digikey', keyword: 'panel hinge',         maxPages: 8,  rationale: 'Hinges + latches — Southco, Essentra, Sugatsune.' },

  // battery_cell — Mouser carries 18650/21700 + supercaps
  { componentClass: 'battery_cell', distributor: 'mouser',  keyword: 'lithium ion battery',        maxPages: 15, rationale: 'Cells + packs — Panasonic, Sony, Murata, Saft.' },
  { componentClass: 'battery_cell', distributor: 'digikey', keyword: 'supercapacitor',             maxPages: 10, rationale: 'EDLCs from Maxwell, Murata, Eaton, Cornell-Dubilier.' },

  // thermal — heatsinks + TIM + fans (fans already in assembly, so split)
  { componentClass: 'thermal', distributor: 'mouser',  keyword: 'heatsink',                        maxPages: 15, rationale: 'Aavid, Wakefield, Fischer, Ohmite heatsinks.' },
  { componentClass: 'thermal', distributor: 'digikey', keyword: 'thermal interface',               maxPages: 10, rationale: 'Bergquist, Laird, Henkel TIMs + pads.' },

  // fluid_path — distributors rarely stock pipes, but DO stock valves / flow sensors
  { componentClass: 'fluid_path', distributor: 'digikey', keyword: 'solenoid valve',               maxPages: 10, rationale: 'Solenoid / proportional valves (Asco, Parker, Burkert).' },
  { componentClass: 'fluid_path', distributor: 'mouser',  keyword: 'flow sensor',                  maxPages: 8,  rationale: 'Flow sensors — Sensirion, IST, Honeywell.' },

  // safety_consumable — fuses, breakers, suppressors
  { componentClass: 'safety_consumable', distributor: 'mouser',  keyword: 'fuse',                  maxPages: 15, rationale: 'Littelfuse / Bel / Schurter / Eaton fuse catalog.' },
  { componentClass: 'safety_consumable', distributor: 'digikey', keyword: 'circuit breaker',       maxPages: 10, rationale: 'MCBs / hydraulic breakers (Carling, ETA, E-T-A, Schurter).' },

  // oem_subsystem — already done page 0-19 for "DC-DC converter" on Mouser
  // (POC). Add a second keyword + DigiKey side; existing dedup catches overlaps.
  { componentClass: 'oem_subsystem', distributor: 'mouser',  keyword: 'AC-DC power supply',        maxPages: 20, rationale: 'PSUs — Mean Well, TDK-Lambda, Vicor, XP Power.' },
  { componentClass: 'oem_subsystem', distributor: 'digikey', keyword: 'isolated DC-DC converter',  maxPages: 20, rationale: 'Isolated brick converters — Vicor, RECOM, TDK-Lambda.' },

  // ── BESS-adjacent additions 2026-05-25 (Stage 10.5 enablement) ─────────────
  // These classes live on Mouser/DigiKey and extend Stage 10.5 library
  // candidates for BESS-class industrial components. Grid-scale PCS inverters
  // (Sungrow SC1000UD-MV etc.) do NOT appear on Mouser/DigiKey — those are
  // covered by the manual seed in scripts/seed-bess-oem-library.ts.

  // Smaller grid-tie inverters (sub-100 kW) DO appear on Mouser/DigiKey
  { componentClass: 'oem_subsystem', distributor: 'mouser',  keyword: 'grid-tie inverter',         maxPages: 12, rationale: 'Sub-100 kW string + hybrid inverters (SMA SB, Fronius, Growatt, Huawei) — BESS AC-coupling.' },

  // BMS protection ICs (distributor-stocked BMS slave silicon)
  { componentClass: 'electronic_ic', distributor: 'digikey', keyword: 'battery management system IC', maxPages: 12, rationale: 'BMS cell-monitor ICs — Analog Devices ADBMS, TI BQ7960x, Renesas, Maxim.' },

  // Industrial PLCs (Allen-Bradley, Siemens S7, Beckhoff IO modules via DigiKey)
  { componentClass: 'oem_subsystem', distributor: 'digikey', keyword: 'industrial PLC',            maxPages: 10, rationale: 'Programmable logic controllers — Allen-Bradley MicroLogix, Siemens LOGO!, Phoenix Contact.' },

  // Industrial cabinet fans (ebm-papst / Mechatronics / Sanyo Denki)
  { componentClass: 'mechanical_assembly', distributor: 'mouser', keyword: 'industrial cabinet fan', maxPages: 12, rationale: 'Cabinet / enclosure fans for BESS and inverter thermal management — ebm-papst A3G, Mechatronics, Sanyo Denki.' },

  // DIN rail PSU 24 V (Mean Well / Phoenix Contact / Wago / Murr)
  { componentClass: 'oem_subsystem', distributor: 'mouser',  keyword: 'DIN rail power supply 24V', maxPages: 12, rationale: 'DIN-rail 24 V PSUs for BESS controls auxiliary power — Mean Well DRP/SDR, Phoenix Contact QUINT, Wago.' },
  { componentClass: 'oem_subsystem', distributor: 'digikey', keyword: 'DIN rail power supply',     maxPages: 10, rationale: 'DIN rail PSU DigiKey coverage — TDK-Lambda, Murr, Puls, Bel.' },

  // Industrial PCs (Beckhoff CX, Advantech UNO, IEI, Kontron)
  { componentClass: 'oem_subsystem', distributor: 'mouser',  keyword: 'industrial PC embedded',    maxPages: 10, rationale: 'Fanless embedded PCs for BESS EMS/SCADA — Beckhoff CX, Kontron, IEI, Advantech.' },

  // Thermal interface pads (Henkel / Laird / Bergquist — BESS cell thermal management)
  { componentClass: 'thermal', distributor: 'digikey', keyword: 'thermal interface pad',           maxPages: 12, rationale: 'Thermal interface material pads for BESS cell-to-cooler contact — Laird Tflex, Bergquist GP3000, Henkel Bergquist.' },

  // Battery fuses (Mersen / Bussmann / Littelfuse — BESS string protection)
  { componentClass: 'safety_consumable', distributor: 'digikey', keyword: 'battery fuse',          maxPages: 12, rationale: 'High-current battery/DC string fuses — Mersen NH gPV, Bussmann 170M, Littelfuse KLK/KLS — BESS string protection.' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function filterTargets(filter: {
  classes?: string[]
  distributor?: Distributor
}): KeywordTarget[] {
  return KEYWORD_MAP.filter((t) => {
    if (t.enabled === false) return false
    if (filter.classes && filter.classes.length > 0 && !filter.classes.includes(t.componentClass)) return false
    if (filter.distributor && t.distributor !== filter.distributor) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// ETA math (informational — not enforced):
//
//   Per distributor cap   ≈ 1000 API calls/day
//   Mouser tuples         = 19  × ~15 pages avg = ~285 calls
//   DigiKey tuples        = 17  × ~14 pages avg = ~240 calls
//   Both under one day's free quota — full sweep should finish in ~2 days
//   wall-clock with the 300 ms polite delay + occasional 429 back-offs.
// ---------------------------------------------------------------------------
