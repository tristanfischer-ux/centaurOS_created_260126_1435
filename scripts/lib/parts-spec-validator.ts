/**
 * Parts-spec validator (universal — runs for every chain, every class).
 *
 * Root cause it fixes: deterministic-emitter.ts emits `mod('form', ...)`
 * strings that pin a real industrial part by manufacturer + part-number AND
 * inline a claimed rating (e.g. "1500 A continuous / 1500 V DC HVDC"). Nothing
 * cross-checks the claimed rating against the manufacturer datasheet. So the
 * pipeline happily ships:
 *   - "Schaltbau C310 (1500 A continuous)"        ← real spec: 500 A continuous
 *   - "Pfannenberg CC 90.000, 50 kW @ 35°C"       ← real spec: 9 kW @ 35°C
 *   - "Bussmann 170M6810 (200 A)"                 ← real spec: 1250 A fuse
 *   - "LEM HASS 100-S (±300 A peak)"              ← real spec ok but bus peak exceeds it
 *
 * The validator parses every emitted form string with a Manufacturer + Part
 * regex, looks the part up in KNOWN_PART_AUTHORITATIVE, and reports any claim
 * that exceeds (or under-claims by ≥ 2×) the authoritative spec. Findings flow
 * into AUDIT-PARTS.md alongside the other gate reports.
 *
 * Universal: every class that pins a real industrial part is covered. New
 * parts get added to KNOWN_PART_AUTHORITATIVE once — every future chain
 * across every class benefits.
 *
 * Not a substitute for the parts library (pretraining_extracted_parts). The
 * library is for advisory candidate suggestion ("which contactors exist?").
 * The validator is for spec correctness ("does our claim about this part
 * match the manufacturer datasheet?"). Both can coexist; validator data is
 * curated, library data is scraped.
 */

import { readFileSync } from 'node:fs'

// ── AUTHORITATIVE PARTS TABLE ────────────────────────────────────────────────
// Source: manufacturer datasheets (verified entries cite source).
// Add new entries here as new parts are pinned by deterministic-emitter.ts.
// Pattern for entries:
//   - part_number_pattern: case-insensitive RegExp matching part number AS
//     emitted (so "C310", "iso685-D-B", "HASS 100-S" all match).
//   - Lowest-cost matching field wins (e.g. specifying just `rated_current_a`
//     skips voltage check unless `rated_voltage_dc_v` is also set).
//   - cooling_curve points are interpolated/snapped — closest ambient match
//     is the comparison baseline.
//
// Convention: if a part has rated_current_peak_a, the peak is the limit
// (LEM transducers saturate at peak); if it has both nominal + peak, the
// validator checks against the appropriate one based on the form text.
export interface AuthSpec {
  manufacturer: string
  part_number_pattern: RegExp
  category: string
  rated_current_a?: number
  rated_current_peak_a?: number
  rated_voltage_dc_v?: number
  rated_voltage_ac_v?: number
  rated_power_kw?: number
  cooling_curve?: Array<{ ambient_c: number; capacity_kw: number }>
  notes?: string
}

export const KNOWN_PART_AUTHORITATIVE: AuthSpec[] = [
  // ── BESS DC switchgear ────────────────────────────────────────
  {
    manufacturer: 'Schaltbau',
    part_number_pattern: /^C310(?:[\s/].*)?$/i,
    category: 'hvdc_contactor',
    rated_current_a: 500,
    rated_voltage_dc_v: 1500,
    notes: 'Schaltbau C310 (datasheet): 350-500 A continuous, 1500 V DC, IEC 60947-2. Some variants list 350 A continuous; 500 A is the highest in the series. Anything > 500 A is wrong.',
  },
  {
    // Added 2026-05-24 BESS L17 fix — utility-BESS bus contactor at 1500-3000 A
    // continuous, 1500 V DC. C330 (stationary) covers MCS Level 2 + Level 3
    // per Schaltbau's market positioning: 2000 A @ 3×500 mm² terminals,
    // 3000 A @ 3×1000 mm² terminals, 15,000 A short-time 5 ms, IEC 60947-4-1
    // + UL 60947-4-1. Source: https://schaltbau.com/en/product/contactors/c330/.
    // Use the conservative 2000 A continuous figure as the authoritative
    // current (the 3000 A figure requires the larger terminal-cross-section
    // variant which the chain emitter does not pin).
    manufacturer: 'Schaltbau',
    part_number_pattern: /^C330(?:[\s/].*)?$/i,
    category: 'hvdc_contactor',
    rated_current_a: 2000,
    rated_voltage_dc_v: 1500,
    notes: 'Schaltbau C330 (datasheet): 2000 A continuous @ 3×500 mm² terminals (3000 A @ 3×1000 mm² terminals — variant-specific), 1500 V DC bi-directional, IEC 60947-4-1 + UL 60947-4-1, CE/UL/CCC certified. The Schaltbau MCS Level 2 (1500 V) + Level 3 (3000 A) reference part for utility BESS.',
  },
  {
    // Added 2026-05-24 BESS L17 fix — mobile-use sibling of C330. Same
    // current/voltage envelope, different mechanical mount + connector.
    manufacturer: 'Schaltbau',
    part_number_pattern: /^C830(?:[\s/].*)?$/i,
    category: 'hvdc_contactor',
    rated_current_a: 2000,
    rated_voltage_dc_v: 1500,
    notes: 'Schaltbau C830 (datasheet): 2000 A continuous, 1500 V DC bi-directional, mobile-use sibling of C330. IEC 60947-4-1 + UL 60947-4-1.',
  },
  {
    manufacturer: 'Gigavac',
    part_number_pattern: /^MX12(?:[\s/].*)?$/i,
    category: 'hvdc_contactor',
    rated_current_a: 500,
    rated_voltage_dc_v: 800,
    notes: 'Gigavac MX12 series: 350-500 A continuous, 800 V DC.',
  },
  // ── BESS DC fuses (Bussmann 170M family) ──────────────────────
  // 170M68xx subfamily: 1250 A fuses. Lower-current 170M variants exist.
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^170M68\d{2}$/i,
    category: 'dc_fuse',
    rated_current_a: 1250,
    rated_voltage_dc_v: 1100,
    notes: 'Bussmann 170M68xx (e.g. 170M6810): 1250 A semiconductor fuse, 1100 V DC, IEC 60269-4 + UL 248-13. Claiming 200 A on a 170M6810 is wrong — that is the 170M65xx subfamily.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^170M65\d{2}$/i,
    category: 'dc_fuse',
    rated_current_a: 200,
    rated_voltage_dc_v: 1100,
    notes: 'Bussmann 170M65xx: ~125-250 A semiconductor fuse, 1100 V DC.',
  },
  {
    // Added 2026-05-24 BESS L17 fix — Bussmann 170M1811 is the canonical
    // 200 A / 1000 V DC square-body semiconductor fuse, Size 000 DIN 43 620,
    // Class aR, IEC 60269-4 tested, UL Recognised (E125085.JFHR2). Used as
    // the rack-level DC fuse in utility BESS where rack peak is ~100-200 A.
    // Source: https://us.rs-online.com/product/bussmann-by-eaton/170m1811/74058756/
    // ("FUSE 200A 1000V DC 000FU/90 AR UR") + Eaton Bussmann technical data
    // 720014 (170M Series catalogue).
    //
    // BESS L21 (2026-05-25) note: although 170M1811 IS in fact rated 1000 V
    // DC per the IGBT-protection catalogue + RS Components, the standard
    // Eaton 720014 datasheet describes the 170M family primarily under its
    // 690 V AC / 700 V AC ratings. The PV-200ANH1 below is the EXPLICIT
    // DC-PV / battery-storage replacement — same 200 A / 1000 V DC envelope
    // but unambiguously DC on the canonical product page. This row stays
    // so legacy chains pinning 170M18xx still pass validation; new emissions
    // route through PV-200ANH1 / PV-XXXANH1 / PV-XXXANH2 below.
    manufacturer: 'Bussmann',
    part_number_pattern: /^170M18\d{2}$/i,
    category: 'dc_fuse',
    rated_current_a: 200,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann 170M18xx subfamily (e.g. 170M1811): 200 A class aR semiconductor fuse, Size 000 DIN 43 620, 1000 V DC, IEC 60269-4 + UL Recognised. NOTE: the canonical Eaton 720014 datasheet primarily lists 690 V AC / 700 V AC ratings for the 170M family — prefer Eaton Bussmann PV-200ANH1 for new BESS pins (unambiguously DC-PV per IEC 60269-6).',
  },
  // ── BESS L21 fix (2026-05-25): Eaton Bussmann PV-ANH series ───
  // The explicit DC-PV / battery-storage fuse line in the Bussmann
  // catalogue: 1000 V DC rating, NH1 body, Class gPV per IEC 60269-6
  // (gPV is the IEC class specifically for solar PV strings + battery
  // storage), UL Listed, CSA Certified, CE/RoHS, 50 kAIC interrupt.
  // The "PV-" prefix removes any AC-vs-DC ambiguity that surrounds the
  // 170M family on the standard datasheet. Universal across the
  // 80-630 A range — pattern matches PV-80ANH1, PV-100ANH1,
  // PV-125ANH1, PV-160ANH1, PV-200ANH1, PV-250ANH1, PV-315ANH1,
  // PV-400ANH1, PV-500ANH1, PV-630ANH1.
  // Source: Eaton product page https://www.eaton.com/us/en-us/skuPage.PV-200ANH1.html
  // + RS Components https://us.rs-online.com/product/bussmann-by-eaton/pv-200anh1/74058757/
  // + Wholesale Supply Group https://catalog.wholesalesupply.us/brand-eaton-bussmann/fuse-200a-1000v-dc-pv-size-1-dual-ind/sku-V3908-pv-200anh1
  // + Cooper Electric https://www.cooper-electric.com/product/detail/869495/bussmann-mfg-pv-200anh1.
  // Eaton Bussmann PV-NH series — one entry per variant so each variant
  // validates against its own current rating (NOT a family-max that
  // would let a wildly wrong claim pass). The variant current is
  // encoded in the part_number (PV-80ANH1 = 80 A, PV-200ANH1 = 200 A
  // etc.) so the rated_current_a is unambiguous per entry.
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-80A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 80,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-80ANH1: 80 A / 1000 V DC / NH1 / Class gPV per IEC 60269-6.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-100A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 100,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-100ANH1: 100 A / 1000 V DC / NH1 / Class gPV per IEC 60269-6.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-125A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 125,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-125ANH1: 125 A / 1000 V DC / NH1 / Class gPV per IEC 60269-6.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-160A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 160,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-160ANH1: 160 A / 1000 V DC / NH1 / Class gPV per IEC 60269-6.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-200A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 200,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-200ANH1: 200 A / 1000 V DC / NH1 / Class gPV per IEC 60269-6 / 50 kAIC / UL Listed + CSA + CE/RoHS. The EXPLICIT DC-PV variant — preferred over 170M family for new BESS chains. Source: https://www.eaton.com/us/en-us/skuPage.PV-200ANH1.html.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-250A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 250,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-250ANH1: 250 A / 1000 V DC / NH1 / Class gPV per IEC 60269-6.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-315A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 315,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-315ANH1: 315 A / 1000 V DC / NH1 / Class gPV per IEC 60269-6.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-400A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 400,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-400ANH2: 400 A / 1000 V DC / NH2 / Class gPV per IEC 60269-6.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-500A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 500,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-500ANH2: 500 A / 1000 V DC / NH2 / Class gPV per IEC 60269-6.',
  },
  {
    manufacturer: 'Eaton Bussmann',
    part_number_pattern: /^PV-630A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 630,
    rated_voltage_dc_v: 1000,
    notes: 'Eaton Bussmann PV-630ANH2: 630 A / 1000 V DC / NH2 / Class gPV per IEC 60269-6 (top of PV-NH family).',
  },
  // Manufacturer alias for the bare "Bussmann" prefix (some chains drop
  // the "Eaton" qualifier). Same pattern, one entry per current variant.
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-80A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 80,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-80ANH1 (alias for Eaton Bussmann — same part). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-100A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 100,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-100ANH1 (alias). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-125A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 125,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-125ANH1 (alias). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-160A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 160,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-160ANH1 (alias). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-200A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 200,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-200ANH1 (alias). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-250A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 250,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-250ANH1 (alias). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-315A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 315,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-315ANH1 (alias). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-400A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 400,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-400ANH2 (alias). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-500A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 500,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-500ANH2 (alias). See Eaton Bussmann entry.',
  },
  {
    manufacturer: 'Bussmann',
    part_number_pattern: /^PV-630A?NH[12]$/i,
    category: 'dc_pv_fuse',
    rated_current_a: 630,
    rated_voltage_dc_v: 1000,
    notes: 'Bussmann PV-630ANH2 (alias). See Eaton Bussmann entry.',
  },
  // ── BESS isolation monitor ────────────────────────────────────
  {
    manufacturer: 'Bender',
    part_number_pattern: /^iso685(?:[-_]?D)?(?:[-_]?B)?$/i,
    category: 'iso_monitor',
    rated_voltage_dc_v: 1000,
    notes: 'Bender iso685-D-B (datasheet): 1000 V DC, IEC 61557-8.',
  },
  // ── BESS current transducers (LEM HASS series) ────────────────
  // HASS series: rated current x specifies nominal (A); peak measuring range
  // is typically 3× nominal. Saturating beyond peak yields wrong current
  // measurement → wrong control loop → safety risk.
  {
    manufacturer: 'LEM',
    part_number_pattern: /^HASS\s*50-S/i,
    category: 'current_transducer',
    rated_current_a: 50,
    rated_current_peak_a: 150,
  },
  {
    manufacturer: 'LEM',
    part_number_pattern: /^HASS\s*100-S/i,
    category: 'current_transducer',
    rated_current_a: 100,
    rated_current_peak_a: 300,
  },
  {
    manufacturer: 'LEM',
    part_number_pattern: /^HASS\s*200-S/i,
    category: 'current_transducer',
    rated_current_a: 200,
    rated_current_peak_a: 600,
  },
  {
    manufacturer: 'LEM',
    part_number_pattern: /^HASS\s*300-S/i,
    category: 'current_transducer',
    rated_current_a: 300,
    rated_current_peak_a: 900,
  },
  // ── Chillers (Pfannenberg CC + EB series) ─────────────────────
  // Pfannenberg naming convention: "CC 90.000" → 9.0 kW nominal cooling.
  // Numeric is W × 1000 (so 90.000 = 90,000 W = 9 kW). At +35°C ambient
  // = nominal; at +50°C ambient typically ~40% derate.
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^CC[\s.-]*60\.000$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 6 },
      { ambient_c: 50, capacity_kw: 3.6 },
    ],
    notes: 'Pfannenberg CC 60.000: 6 kW @ 35°C ambient, ~3.6 kW @ 50°C (40% derate).',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^CC[\s.-]*90\.000$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 9 },
      { ambient_c: 50, capacity_kw: 5.4 },
    ],
    notes: 'Pfannenberg CC 90.000: 9 kW @ 35°C ambient. Anything > 9 kW @ 35°C is wrong — that is the CC 120.000 (12 kW) or higher.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^CC[\s.-]*120\.000$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 12 },
      { ambient_c: 50, capacity_kw: 7.2 },
    ],
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*60$/i,
    category: 'enclosure_cooler',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 0.6 },
      { ambient_c: 50, capacity_kw: 0.36 },
    ],
    notes: 'Pfannenberg EB 60 panel cooler: 600 W @ 35°C. Claiming 60 kW on an EB 60 was a 100× spec error caught Loop ~28.',
  },
  // ── Pfannenberg EB XT large packaged chillers (BESS-rated) ─────
  // Family: 9 units across 3 housing sizes, 36-150 kW cooling capacity,
  // R410A refrigerant, scroll compressor, microchannel condenser, EN 14511 +
  // AHRI 550/590 rated, AC 400 3~/50 Hz, outdoor IP54. Pfannenberg's
  // BESS-targeted large-chiller line. Added 2026-05-24 BESS L17 fix.
  // Source: https://www.pfannenberg.com/en-gb/liquid-cooling/eb-xt-36-150-kw/
  // and product pages (e.g. EB XT 600 WT = product 42146005001 = 59 kW).
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*400(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 36 },
      { ambient_c: 50, capacity_kw: 21.6 },
    ],
    notes: 'Pfannenberg EB XT 400 WT: 36 kW @ 35°C ambient.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*500(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 47 },
      { ambient_c: 50, capacity_kw: 28.2 },
    ],
    notes: 'Pfannenberg EB XT 500 WT: 47 kW @ 35°C ambient. The closest standard EB XT below 50 kW — the right pin for ~45-50 kW BESS thermal rejection.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*600(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 59 },
      { ambient_c: 50, capacity_kw: 35.4 },
    ],
    notes: 'Pfannenberg EB XT 600 WT: 59 kW @ 35°C ambient (product 42146005001). Closest EB XT above 50 kW — pick when thermal headroom is preferred over efficiency.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*700(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 69 },
      { ambient_c: 50, capacity_kw: 41.4 },
    ],
    notes: 'Pfannenberg EB XT 700 WT: 69 kW @ 35°C ambient.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*800(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 76 },
      { ambient_c: 50, capacity_kw: 45.6 },
    ],
    notes: 'Pfannenberg EB XT 800 WT: 76 kW @ 35°C ambient.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*900(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 86 },
      { ambient_c: 50, capacity_kw: 51.6 },
    ],
    notes: 'Pfannenberg EB XT 900 WT: 86 kW @ 35°C ambient.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*1000(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 92 },
      { ambient_c: 50, capacity_kw: 55.2 },
    ],
    notes: 'Pfannenberg EB XT 1000 WT: 92 kW @ 35°C ambient.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*1200(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 119 },
      { ambient_c: 50, capacity_kw: 71.4 },
    ],
    notes: 'Pfannenberg EB XT 1200 WT: 119 kW @ 35°C ambient.',
  },
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^EB[\s.-]*XT[\s.-]*1600(?:[\s.-]*WT)?$/i,
    category: 'liquid_chiller',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 148 },
      { ambient_c: 50, capacity_kw: 88.8 },
    ],
    notes: 'Pfannenberg EB XT 1600 WT: 148 kW @ 35°C ambient (top of EB XT range).',
  },
  // ── BESS AC switchgear (ABB Emax E2.2 family) ─────────────────
  // E2.2 frame variants: 800/1000/1250/1600/2000/2500 A.
  {
    manufacturer: 'ABB',
    part_number_pattern: /^Emax\s+E2\.2\s*2500(?:A)?/i,
    category: 'ac_breaker',
    rated_current_a: 2500,
    rated_voltage_ac_v: 690,
  },
  {
    manufacturer: 'ABB',
    part_number_pattern: /^Emax\s+E2\.2\s*2000(?:A)?/i,
    category: 'ac_breaker',
    rated_current_a: 2000,
    rated_voltage_ac_v: 690,
  },
  {
    manufacturer: 'ABB',
    part_number_pattern: /^Emax\s+E2\.2\s*1600(?:A)?/i,
    category: 'ac_breaker',
    rated_current_a: 1600,
    rated_voltage_ac_v: 690,
  },
  {
    manufacturer: 'ABB',
    part_number_pattern: /^Emax\s+E2\.2\s*1250(?:A)?/i,
    category: 'ac_breaker',
    rated_current_a: 1250,
    rated_voltage_ac_v: 690,
  },
  // ── BESS busbar lugs ──────────────────────────────────────────
  {
    manufacturer: 'Klauke',
    part_number_pattern: /^RKS\s*50-8$/i,
    category: 'crimp_lug',
    rated_current_a: 200,
    notes: 'Klauke RKS 50-8: 50 mm² M8 stud ring lug, 200 A continuous.',
  },
  {
    manufacturer: 'Klauke',
    part_number_pattern: /^RKS\s*70-8$/i,
    category: 'crimp_lug',
    rated_current_a: 280,
  },
  {
    manufacturer: 'Klauke',
    part_number_pattern: /^RKS\s*95-10$/i,
    category: 'crimp_lug',
    rated_current_a: 350,
  },
  // ── BESS L21 fix (2026-05-25): solderless DIN 46234 ring terminals ──
  // Klauke 16208 — 0.5-1.0 mm² M8 (8.4 mm) ring terminal, copper ETP
  // tin-plated, hard-soldered crimp area with grooved profile. The
  // correct part for 22 AWG (0.326 mm²) BESS voltage-sense leads — NOT
  // Klauke 16308 (1.5-2.5 mm², would produce an under-sized crimp
  // violating IPC-A-620). Source: Klauke catalogue page
  // https://www.klauke.com/gb/en/solderless-terminals-to-din-cu and
  // distributor confirmation https://www.cablectrix.com/Products/Klauke-un-insulated-ring-terminals/16208
  // (Cablectrix lists 16208 as DIN-46234 0.5-1mm² ring terminal with
  // d2 = 8.4 mm hole — the 0.5-1.0 mm² M8 variant).
  {
    manufacturer: 'Klauke',
    part_number_pattern: /^16208$/i,
    category: 'voltage_sense_ring_terminal',
    rated_current_a: 6,
    notes: 'Klauke 16208: 0.5-1.0 mm² M8 (8.4 mm) DIN 46234 solderless ring terminal, copper ETP tin-plated, ~6 A continuous. The correct ring terminal for 22 AWG (~0.33 mm²) BESS voltage-sense leads — sits at the lower edge of the 0.5-1.0 mm² barrel range for an IPC-A-620 compliant hex-die crimp. Distinct from Klauke 16308 (1.5-2.5 mm², would under-crimp a 22 AWG lead).',
  },
  {
    manufacturer: 'Klauke',
    part_number_pattern: /^16308$/i,
    category: 'voltage_sense_ring_terminal',
    rated_current_a: 20,
    notes: 'Klauke 16308: 1.5-2.5 mm² M8 (8.5 mm) DIN 46234 solderless ring terminal, copper ETP tin-plated, ~20 A continuous. Correct for 14-16 AWG conductors — NOT for 22 AWG (which under-crimps; use Klauke 16208 instead).',
  },
  // ── BESS L21 fix (2026-05-25): EMC grounding / bonding braid ──────
  // nVent ERIFLEX MBJ50-300-10 (catalog 556860) — 50 mm² tinned copper
  // grounding + bonding braid with integral pressed copper palms, 10.5 mm
  // hole for M10 stud, 250 A continuous ampacity, 300 mm centre-to-centre,
  // no separate crimp lugs required, vibration + fatigue resistant.
  // Canonical industry part for utility BESS chassis bonding.
  // Pattern matches MBJ50-100-10, MBJ50-150-10, MBJ50-200-10, MBJ50-300-10,
  // MBJ50-500-10, MBJ50-500-12, MBJ50-300-16 — full MBJ50 family.
  // Source: nVent product page https://www.nvent.com/en-us/eriflex/products/efsmbj50-300-10
  // + Cooper Electric https://www.cooper-electric.com/product/detail/1660484/erico-inc-556860
  // + datasheet PDF https://tlauk.net/document/42930/Eriflex_MBJ50-300-10_556860_Earth_Ground_Copper_Braid.pdf.
  {
    manufacturer: 'nVent ERIFLEX',
    part_number_pattern: /^MBJ50-(100|150|200|300|500)-(10|12|16)$/i,
    category: 'grounding_braid',
    rated_current_a: 250,
    notes: 'nVent ERIFLEX MBJ50 series (e.g. MBJ50-300-10 / cat 556860): 50 mm² tinned copper grounding + bonding braid, 250 A continuous, integral pressed copper palms with 10.5 mm (or 13 mm / 16.5 mm) hole, no separate crimp lugs required. The canonical BESS chassis-bond part — distinct from TE Connectivity 202K142-25 (heat-shrink boot, NOT a grounding braid).',
  },
  // Alias for "ERIFLEX" without the nVent prefix (some chains drop the
  // brand owner). Also covers Mersen-era MBJ pins (Mersen sold ERIFLEX
  // to nVent in 2018; many catalogues still list the legacy Mersen
  // manufacturer name).
  {
    manufacturer: 'ERIFLEX',
    part_number_pattern: /^MBJ50-(100|150|200|300|500)-(10|12|16)$/i,
    category: 'grounding_braid',
    rated_current_a: 250,
    notes: 'ERIFLEX MBJ50 (alias for nVent ERIFLEX MBJ50 — same family). See nVent ERIFLEX entry for spec details.',
  },
  // INTENTIONALLY NO Mersen MBJ50 alias entry — Mersen is also the
  // manufacturer of the BESS DC busbar (Mersen TCB-2000 series, 2000 A
  // tinned electrolytic copper), and adding a low-current MBJ50 entry
  // under the bare "Mersen" manufacturer would route the manufacturer-
  // only fallback path to the wrong family (treating a 2000 A busbar
  // claim as a 250 A grounding-braid over-claim). If a future chain
  // emits Mersen MBJ50-XXX-YY with an EXPLICIT part_number, the
  // pn-keyed lookup hits the nVent ERIFLEX entry above and validates
  // correctly. Without a part_number, the chain's claim is ambiguous —
  // could be a busbar or a grounding braid — and the validator
  // legitimately skips it (parts_unknown) rather than misattribute.
  // ── BESS L21 fix (2026-05-25): NTC thermistor bead probe ──────────
  // EPCOS / TDK B57703M0103G040 — 10 kΩ NTC bead probe with 45 mm
  // PTFE-insulated silver-plated nickel leads, -20…+125 °C operating
  // range, B25/100 = 3988 K ±1 %, 150 mW power dissipation, glass-
  // encapsulated bead. Canonical insulated-bead probe for utility BESS
  // busbar surface temperature sensing — the PTFE jacket provides the
  // galvanic isolation required so the bead can be bonded to the
  // busbar surface (and read by the BMS slave's isolated thermistor
  // input) without shorting to the cell power studs.
  // Source: TDK product page
  // https://product.tdk.com/en/search/sensor/ntc/ntc_assy/info?part_no=B57703M0103G040
  // + datasheet https://www.tdk-electronics.tdk.com/inf/50/db/ntc/NTC_Probe_ass_M703.pdf
  // + distributor (TME) https://www.tme.com/us/en-us/details/b57703m0103g040/temperature-sensors-ntc/epcos/.
  // No current / voltage check (NTC thermistor — temperature-only).
  {
    manufacturer: 'EPCOS / TDK',
    part_number_pattern: /^B57703M0\d{3}[GFA]0\d{2}$/i,
    category: 'ntc_thermistor_probe',
    notes: 'EPCOS / TDK B57703M series: 10 kΩ NTC bead probe with 45 mm PTFE-insulated silver-plated nickel leads, -20…+125 °C, B25/100 = 3988 K ±1 %, glass-encapsulated bead. PTFE-insulated leads provide the galvanic isolation required for BESS busbar-surface sensing.',
  },
  // Aliases for bare EPCOS / TDK prefix (some chains emit one but not both).
  {
    manufacturer: 'EPCOS',
    part_number_pattern: /^B57703M0\d{3}[GFA]0\d{2}$/i,
    category: 'ntc_thermistor_probe',
    notes: 'EPCOS B57703M (alias for EPCOS / TDK — same part family). See EPCOS / TDK entry for spec details.',
  },
  {
    manufacturer: 'TDK',
    part_number_pattern: /^B57703M0\d{3}[GFA]0\d{2}$/i,
    category: 'ntc_thermistor_probe',
    notes: 'TDK B57703M (alias for EPCOS / TDK — same part family). See EPCOS / TDK entry for spec details.',
  },
  // ── BESS L21 fix (2026-05-25): mis-pin SCREEN for TE Connectivity
  // 202K142-25 (heatshrink boot pinned as grounding braid). This is
  // primarily caught by gate 15 slot-mispin-detector, but listing it
  // here too means gate 13 surfaces the mis-attribution under a
  // proper "wrong PART CLASS" finding if the LLM tries to claim a
  // current rating on it. The 202K142-25 has NO copper conductor and
  // no current carrying capacity — any current claim on it is wrong.
  // Source: DigiKey listing
  // https://www.digikey.com/en/products/detail/te-connectivity-aerospace-defense-and-marine/202K142-25-0/2394220
  // ("HEATSHRINK BOOT SZ42 BLACK").
  {
    manufacturer: 'TE Connectivity',
    part_number_pattern: /^202K142-25(?:-\d+)?$/i,
    category: 'heatshrink_boot',
    rated_current_a: 0,
    notes: 'TE Connectivity / Raychem 202K142-25: heat-shrinkable moulded transition boot, size 42, polyolefin elastomer, ZERO current-carrying capacity. NOT a grounding braid — any current claim on this part is a mis-pin. Use nVent ERIFLEX MBJ50 series for grounding braids.',
  },
  {
    manufacturer: 'TE',
    part_number_pattern: /^202K142-25(?:-\d+)?$/i,
    category: 'heatshrink_boot',
    rated_current_a: 0,
    notes: 'TE (alias for TE Connectivity) 202K142-25: heat-shrinkable moulded transition boot. See TE Connectivity entry.',
  },
  // ── BESS L18 fix (2026-05-24): AC LCL output filter ──────────────
  // Schaffner FN6840 series — LCL filter for Active Front End motor drives
  // and active infeed converters. Same topology as utility BESS PCS. Family
  // covers the AFE/AIC LCL current range used by 250 kW – 2 MW PCS modules
  // (now part of TE Connectivity / Schaffner brand still produced).
  // The deterministic-emitter pins this part with a CALCULATED current
  // (continuous_power_kw → AC continuous × 1.25 safety factor, rounded up
  // to the next 100 A — matching how Schaffner catalogues stock the line).
  // Because the catalogue spans 250-2500 A, we do not pin a single
  // rated_current_a here — instead, we treat the FN6840 as a family-level
  // marker and rely on the sizing-vs-design audit (gate 14) to verify the
  // emitted rating matches the design's continuous AC current.
  // Source: https://www.schaffner.com/product/FN6840
  {
    manufacturer: 'Schaffner',
    part_number_pattern: /^FN6840(?:[\s/-].*)?$/i,
    category: 'lcl_filter_inductor',
    rated_voltage_ac_v: 690,
    notes: 'Schaffner FN6840 series: LCL filter for Active Front End motor drives / active infeed converters. Family-level pin — the deterministic-emitter computes the actual A rating from continuous_power_kw via the universal sizing rule; the parts validator therefore only checks the part TYPE is correct here, and gate 14 (sizing-vs-design audit) validates the current. Acquired by TE Connectivity 2026; family continues under the Schaffner brand.',
  },
  // ── BESS L18 fix (2026-05-24): deflagration vent panel ───────────
  // Rembe BESS.EGV-IAF — aluminium burst-disc-style deflagration vent panel
  // certified to both NFPA 68 (US) and EN 14797 (EU). Specifically marketed
  // by Rembe for utility-scale BESS containers. Replaces the previous
  // polycarbonate pin (polycarbonate is an impact-RESISTANT polymer that
  // does NOT rupture at the low pressures NFPA 68 requires for explosion
  // venting; the container would over-pressurise and fail structurally
  // before a polycarbonate panel would rupture).
  // Source: https://rembe.us/en-us/bess-explosion-safety/bess-egv-iaf
  {
    manufacturer: 'Rembe',
    part_number_pattern: /^BESS\.EGV-IAF$/i,
    category: 'deflagration_vent_panel',
    notes: 'Rembe BESS.EGV-IAF: aluminium deflagration vent panel for BESS roof installation, insulation on inside of panel facing BESS interior, vents deflagrations upward. Certified to NFPA 68 + EN 14797. The correct part type for a BESS explosion vent — distinct from polycarbonate (impact-resistant, will NOT rupture).',
  },
  // ── BESS L18 fix (2026-05-24): door position safety switch ───────
  // Eaton LS-S11S-ZB — IEC 60947-5-1 positive-opening safety position /
  // limit switch from the LS-Titan miniature DIN range. 1NO+1NC contacts,
  // IP66/IP67, 6 A AC-15 @ 230 V / 3 A DC-13 @ 24 V, screw terminals.
  // Replaces the LLM-emitted Eaton M22-DL-G (which is a panel-mount
  // illuminated PUSHBUTTON, not a door switch). The deterministic emitter
  // now pins this part on the door_position_switch slot in the structure_
  // containment ISO container shell sub-module so the downstream LLM no
  // longer has to invent one (and gets it wrong).
  // Source: https://www.eaton.com/us/en-us/skuPage.LS-S11-ZB.html +
  //  https://www.eaton.com/content/dam/eaton/products/industrialcontrols-drives-automation-sensors/sensors-and-limit-switches-v9-t5-ca8100011e.pdf
  {
    manufacturer: 'Eaton',
    part_number_pattern: /^LS-S11(?:S(?:[-\s/].*)?|[-\s/].*|)$/i,
    category: 'safety_limit_switch',
    rated_current_a: 6,
    rated_voltage_ac_v: 230,
    notes: 'Eaton LS-S11S-ZB: IEC 60947-5-1 positive-opening safety limit switch with 1NO+1NC contacts, IP66/IP67, 6 A AC-15 @ 230 V / 3 A DC-13 @ 24 V, screw terminals. The correct part type for a door position sensor — distinct from M22-DL-G (which is an illuminated panel-mount pushbutton from the IEC 22.5 mm RMQ-Titan family, NOT a limit switch).',
  },
  // ── BESS L18 fix (2026-05-24): HV cable gland ────────────────────
  // Hawke 501/421 (Universal) — dual-cert Exd + Exe single-seal compression
  // cable gland in nickel-plated brass, M16 → M75 entry threads available,
  // suitable for non-armoured HV power cables in Zone 1/21 and Zone 2/22
  // hazardous areas. Replaces the LLM-emitted Roxtec CF 16 (which is a
  // RECTANGULAR cable transit FRAME — wedge-and-module sealing for
  // through-wall cable runs, not a round threaded gland; cannot mate with
  // M63 enclosure entries).
  // Source: https://www.hubbell.com/hawke/en/products/501421-ex-d-ex-e-cable-gland/p/3913698
  // Pattern matches '501/421', '501/421/Universal', '501/421/UNIV', etc.
  {
    manufacturer: 'Hawke',
    part_number_pattern: /^501\/421(?:\/.*)?$/i,
    category: 'hv_cable_gland',
    rated_voltage_ac_v: 11000,
    notes: 'Hawke 501/421/Universal: dual-cert (Exd + Exe) compression-style HV cable gland, nickel-plated brass, M16-M75 entry threads, IEC 60079-0 + IEC 60079-1 + IEC 60079-7, BASEEFA + IECEx + ATEX certified, suitable for HV power cables (11 kV typical) in Zone 1/21 + Zone 2/22 hazardous areas. The correct part type for a round threaded HV gland — distinct from Roxtec CF 16 (which is a RECTANGULAR cable transit FRAME, not a round gland).',
  },
]

// ── PARSERS ──────────────────────────────────────────────────────────────────

interface ParsedPart {
  manufacturer: string
  part_number: string
}

/**
 * Parse "Manufacturer Part_Number" prefix from a form string.
 * Manufacturers can be one or two capitalised tokens (e.g. "Phoenix Contact",
 * "TE Connectivity"). Part numbers can include digits, dots, dashes, slashes.
 */
export function parseManufacturerAndPart(formText: string): ParsedPart | null {
  if (!formText) return null
  const trimmed = formText.trim()
  let m = trimmed.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)\s+([A-Za-z0-9][\w.-]*(?:\s+[A-Za-z0-9][\w.-]*){0,3})/)
  if (m) return { manufacturer: m[1].trim(), part_number: m[2].trim() }
  m = trimmed.match(/^([A-Z][A-Za-z]{2,}(?:[A-Z][A-Za-z]+)?)\s+([A-Za-z0-9][\w.-]*(?:\s+[A-Za-z0-9][\w.-]*){0,3})/)
  if (m) return { manufacturer: m[1].trim(), part_number: m[2].trim() }
  return null
}

/** Parse a number+unit string like "1500 A", "200 A", "9 kW". Returns the
 * numeric value, or null if the unit doesn't match. */
function parseValueWithUnit(raw: string, expectedUnit: 'A' | 'V' | 'kW' | 'MW'): number | null {
  if (typeof raw !== 'string') return null
  // Strip commas (thousands separators) before matching. Allow optional ± prefix.
  const cleaned = raw.replace(/,(?=\d{3}\b)/g, '')
  const re = new RegExp(`±?\\s*(\\d+(?:\\.\\d+)?)\\s*${expectedUnit}\\b`, 'i')
  const m = cleaned.match(re)
  if (!m) return null
  return parseFloat(m[1])
}

/** Find the highest-confidence claimed current from modifier_characters.
 * Order: `rating_primary` > `capacity` (A units) > `dimension` (A units). */
function claimedCurrentFromModifiers(mods: Array<{ kind: string; value: string }>): { value: number; isPeak: boolean } | null {
  const ratingPrimary = mods.find((m) => m.kind === 'rating_primary')
  if (ratingPrimary) {
    const a = parseValueWithUnit(ratingPrimary.value, 'A')
    if (a != null) return { value: a, isPeak: /peak/i.test(ratingPrimary.value) }
  }
  const capacity = mods.find((m) => m.kind === 'capacity')
  if (capacity) {
    const a = parseValueWithUnit(capacity.value, 'A')
    if (a != null) return { value: a, isPeak: /peak/i.test(capacity.value) }
  }
  return null
}

/** Find claimed voltage from modifiers. */
function claimedVoltageFromModifiers(mods: Array<{ kind: string; value: string }>): number | null {
  const dim = mods.find((m) => m.kind === 'dimension' && /V\b/i.test(m.value))
  if (dim) {
    const v = parseValueWithUnit(dim.value, 'V')
    if (v != null) return v
  }
  const rp = mods.find((m) => m.kind === 'rating_primary' && /V\b/i.test(m.value))
  if (rp) {
    const v = parseValueWithUnit(rp.value, 'V')
    if (v != null) return v
  }
  return null
}

/** Find claimed cooling/power from modifiers (capacity with kW or MW units). */
function claimedPowerKwFromModifiers(mods: Array<{ kind: string; value: string }>): number | null {
  for (const kind of ['rating_primary', 'capacity']) {
    const m = mods.find((x) => x.kind === kind && /(kW|MW)\b/i.test(x.value))
    if (m) {
      const kw = parseValueWithUnit(m.value, 'kW')
      if (kw != null) return kw
      const mw = parseValueWithUnit(m.value, 'MW')
      if (mw != null) return mw * 1000
    }
  }
  return null
}

/** Pull ambient temp out of form / capacity / regulatory modifier values. */
function claimedAmbientFromModifiers(mods: Array<{ kind: string; value: string }>): number | null {
  for (const m of mods) {
    const match = String(m.value).match(/@\s*\+?(\d+(?:\.\d+)?)\s*°\s*C/i)
    if (match) return parseFloat(match[1])
  }
  return null
}

/** Resolve part_number for a word. Prefer explicit `part_number` modifier;
 * fall back to parsing `form` modifier or content_character.character_id. */
function resolvePartNumber(word: any, mfr: string): string | null {
  const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  const pn = mods.find((m) => m.kind === 'part_number')
  if (pn && typeof pn.value === 'string' && pn.value.trim()) return pn.value.trim()
  // Fall back: scan form modifier for "<Manufacturer> <PartNum>" pattern.
  const form = mods.find((m) => m.kind === 'form')
  if (form && typeof form.value === 'string') {
    const re = new RegExp(`^${mfr}\\s+([A-Za-z0-9][\\w.-]*(?:\\s+[A-Za-z0-9][\\w.-]*){0,3})`, 'i')
    const m = form.value.match(re)
    if (m) return m[1].trim()
  }
  // Last-resort: scan name_human for the same pattern.
  if (typeof word?.name_human === 'string') {
    const re = new RegExp(`${mfr}\\s+([A-Za-z0-9][\\w.-]*(?:\\s+[A-Za-z0-9][\\w.-]*){0,3})`, 'i')
    const m = word.name_human.match(re)
    if (m) return m[1].trim()
  }
  return null
}

/** Resolve manufacturer for a word. Prefer explicit `manufacturer` modifier;
 * fall back to scanning the form modifier. */
function resolveManufacturer(word: any): string | null {
  const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  const mfr = mods.find((m) => m.kind === 'manufacturer')
  if (mfr && typeof mfr.value === 'string' && mfr.value.trim()) return mfr.value.trim()
  // Fall back: scan form modifier prefix.
  const form = mods.find((m) => m.kind === 'form')
  if (form && typeof form.value === 'string') {
    const parsed = parseManufacturerAndPart(form.value)
    if (parsed) return parsed.manufacturer
  }
  return null
}

// ── VALIDATOR ────────────────────────────────────────────────────────────────

export interface PartsValidationFinding {
  word_id: string
  module_id: string
  sub_module_id: string
  manufacturer: string
  part_number: string
  field: 'current_a' | 'voltage_v' | 'cooling_kw'
  claimed: number
  authoritative: number
  ratio: number
  severity: 'HIGH' | 'MED' | 'LOW'
  explanation: string
  source_form: string
}

export interface PartsValidationResult {
  findings: PartsValidationFinding[]
  parts_checked: number
  parts_unknown: number
  parts_known_no_check: number
}

function findAuth(parsed: ParsedPart): AuthSpec | null {
  return (
    KNOWN_PART_AUTHORITATIVE.find(
      (p) =>
        p.manufacturer.toLowerCase() === parsed.manufacturer.toLowerCase() &&
        p.part_number_pattern.test(parsed.part_number),
    ) ?? null
  )
}

function collectWords(state: any): Array<{ word: any; module_id: string; sub_module_id: string }> {
  const out: Array<{ word: any; module_id: string; sub_module_id: string }> = []
  const modules =
    state?.moduleDecomposition?.modules ??
    state?.module_decomposition?.modules ??
    state?.modules ??
    []
  for (const m of modules) {
    const mid = String(m?.module ?? m?.id ?? m?.module_id ?? 'unknown')
    const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : Array.isArray(m?.submodules) ? m.submodules : []
    for (const sm of subs) {
      const sid = String(sm?.id ?? sm?.sub_module_id ?? sm?.name ?? 'unknown')
      const wordArrays = [sm?.words, sm?.components, sm?.parts, sm?.items]
      for (const wa of wordArrays) {
        if (!Array.isArray(wa)) continue
        for (const w of wa) {
          if (w && typeof w === 'object') out.push({ word: w, module_id: mid, sub_module_id: sid })
        }
      }
    }
  }
  return out
}

/** Build a synthetic display string for the source_form field of findings.
 * Combines manufacturer + part_number + the modifiers that carry the claim. */
function synthesiseFormDisplay(word: any, mfr: string, pn: string): string {
  const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  const interesting = mods.filter((m) =>
    ['rating_primary', 'capacity', 'dimension', 'form', 'regulatory'].includes(m.kind),
  )
  const parts = interesting.map((m) => m.value).filter((v): v is string => typeof v === 'string')
  return `${mfr} ${pn} (${parts.join(' / ')})`.trim()
}

export function validateEmittedParts(state: any): PartsValidationResult {
  const findings: PartsValidationFinding[] = []
  let parts_checked = 0
  let parts_unknown = 0
  let parts_known_no_check = 0

  const all = collectWords(state)
  for (const entry of all) {
    const word = entry.word
    const mfr = resolveManufacturer(word)
    if (!mfr) continue
    const pn = resolvePartNumber(word, mfr)
    const wordId = String(word?.id ?? word?.content_character?.character_id ?? 'unknown')

    // Find authoritative entry. Strategy:
    //   1. If PN explicitly extracted and matches a regex → use that entry
    //      (exact match — never a false positive).
    //   2. If PN extracted but DOESN'T match any authoritative regex →
    //      treat as unknown variant (skip). Manufacturer-only fallback is
    //      WRONG here because the PN tells us this is a different product
    //      line (e.g. Gigavac P115 ≠ Gigavac MX12; ABB E2.2 2500 ≠ E2.2 1250).
    //   3. If PN missing entirely (downstream extraction failed) AND the
    //      manufacturer has authoritative entries → check whether the
    //      claimed current falls within the RANGE of available variants.
    //      A multi-product manufacturer like ABB has entries spanning
    //      Emax E2.2 1250 A, 1600 A, 2000 A, 2500 A. A claim of 2500 A
    //      WITHOUT a part_number could be any of those — accept if it's
    //      within the family range. Only flag if it exceeds the LARGEST
    //      variant (genuinely out of range). Previously fell back to the
    //      LOWEST variant which generated false positives for higher-
    //      rated metering CTs, breakers in a different sub-family, etc.
    let auth: AuthSpec | null = null
    if (pn) {
      auth = findAuth({ manufacturer: mfr, part_number: pn })
      if (!auth) {
        // Known manufacturer, unknown PN — skip rather than misattribute.
        parts_unknown += 1
        continue
      }
    } else {
      const sameMfr = KNOWN_PART_AUTHORITATIVE.filter(
        (p) => p.manufacturer.toLowerCase() === mfr.toLowerCase(),
      )
      if (sameMfr.length > 0) {
        // Range check: if any variant covers the claimed current within
        // its [0.5×, 1.5×] band, treat the claim as plausibly that variant
        // and skip (no PN means we can't be certain which). Only fall
        // through to flag when the claim exceeds the manufacturer's
        // entire known range by ≥1.5×.
        const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
          ? word.modifier_characters
          : []
        const claimedAObj = claimedCurrentFromModifiers(mods)
        const claimedA = claimedAObj?.value ?? null
        if (claimedA != null) {
          const maxKnownA = sameMfr.reduce((m, p) => {
            const a = p.rated_current_a ?? p.rated_current_peak_a ?? 0
            return a > m ? a : m
          }, 0)
          if (maxKnownA > 0 && claimedA <= maxKnownA * 1.5) {
            // In range — likely a higher-rated variant we haven't added to
            // KNOWN_PART_AUTHORITATIVE yet. Skip rather than false-flag.
            parts_unknown += 1
            continue
          }
        }
        // Genuinely out of range OR no claim to check — flag against the
        // LARGEST variant (most permissive) so over-claims are still caught
        // but we don't falsely flag mid-range claims as over-spec for the
        // smallest variant.
        auth = sameMfr.reduce((best, curr) => {
          const bestA = best.rated_current_a ?? 0
          const currA = curr.rated_current_a ?? 0
          return currA > bestA ? curr : best
        })
      }
    }
    if (!auth) {
      parts_unknown += 1
      continue
    }
    parts_checked += 1
    const pnDisplay = pn ?? '<no-part-number>'
    const sourceForm = synthesiseFormDisplay(word, mfr, pnDisplay)
    let didCheck = false

    const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
      ? word.modifier_characters
      : []

    // ── Current check (continuous or peak) ───────────────────
    const claimedAObj = claimedCurrentFromModifiers(mods)
    if (claimedAObj) {
      const claimedA = claimedAObj.value
      const isPeak = claimedAObj.isPeak
      const authA =
        isPeak && auth.rated_current_peak_a != null ? auth.rated_current_peak_a : auth.rated_current_a
      if (authA != null) {
        didCheck = true
        const ratio = claimedA / authA
        if (ratio > 1.05) {
          findings.push({
            word_id: wordId,
            module_id: entry.module_id,
            sub_module_id: entry.sub_module_id,
            manufacturer: auth.manufacturer,
            part_number: pnDisplay,
            field: 'current_a',
            claimed: claimedA,
            authoritative: authA,
            ratio,
            severity: ratio > 1.5 ? 'HIGH' : 'MED',
            explanation:
              `${auth.manufacturer} ${pnDisplay} claimed ${claimedA} A${isPeak ? ' peak' : ' continuous'} ` +
              `but authoritative spec is ${authA} A (${ratio.toFixed(2)}× over).` +
              (auth.notes ? ` ${auth.notes}` : ''),
            source_form: sourceForm,
          })
        } else if (ratio < 0.5 && claimedA > 10) {
          findings.push({
            word_id: wordId,
            module_id: entry.module_id,
            sub_module_id: entry.sub_module_id,
            manufacturer: auth.manufacturer,
            part_number: pnDisplay,
            field: 'current_a',
            claimed: claimedA,
            authoritative: authA,
            ratio,
            severity: 'LOW',
            explanation:
              `${auth.manufacturer} ${pnDisplay} claimed ${claimedA} A but authoritative spec is ${authA} A ` +
              `(${ratio.toFixed(2)}× under — part oversized for application; either wrong part number or cost overstated).` +
              (auth.notes ? ` ${auth.notes}` : ''),
            source_form: sourceForm,
          })
        }
      }
    }

    // ── Voltage check ────────────────────────────────────────
    const claimedV = claimedVoltageFromModifiers(mods)
    if (claimedV != null) {
      const authV = auth.rated_voltage_dc_v ?? auth.rated_voltage_ac_v
      if (authV != null) {
        didCheck = true
        const ratio = claimedV / authV
        if (ratio > 1.05) {
          findings.push({
            word_id: wordId,
            module_id: entry.module_id,
            sub_module_id: entry.sub_module_id,
            manufacturer: auth.manufacturer,
            part_number: pnDisplay,
            field: 'voltage_v',
            claimed: claimedV,
            authoritative: authV,
            ratio,
            severity: ratio > 1.5 ? 'HIGH' : 'MED',
            explanation:
              `${auth.manufacturer} ${pnDisplay} claimed ${claimedV} V but authoritative spec is ${authV} V ` +
              `(${ratio.toFixed(2)}× over).` + (auth.notes ? ` ${auth.notes}` : ''),
            source_form: sourceForm,
          })
        }
      }
    }

    // ── Cooling capacity check (ambient-aware) ───────────────
    const claimedKw = claimedPowerKwFromModifiers(mods)
    const claimedAmbient = claimedAmbientFromModifiers(mods)
    if (claimedKw != null && Array.isArray(auth.cooling_curve) && auth.cooling_curve.length > 0) {
      const ambient = claimedAmbient ?? 35
      const closest = auth.cooling_curve.reduce((best, curr) =>
        Math.abs(curr.ambient_c - ambient) < Math.abs(best.ambient_c - ambient) ? curr : best,
      )
      const authKw = closest.capacity_kw
      didCheck = true
      const ratio = claimedKw / authKw
      if (ratio > 1.10) {
        findings.push({
          word_id: wordId,
          module_id: entry.module_id,
          sub_module_id: entry.sub_module_id,
          manufacturer: auth.manufacturer,
          part_number: pnDisplay,
          field: 'cooling_kw',
          claimed: claimedKw,
          authoritative: authKw,
          ratio,
          severity: ratio > 1.5 ? 'HIGH' : 'MED',
          explanation:
            `${auth.manufacturer} ${pnDisplay} claimed ${claimedKw} kW @ ${ambient}°C ambient ` +
            `but authoritative spec is ${authKw} kW @ ${closest.ambient_c}°C (${ratio.toFixed(2)}× over).` +
            (auth.notes ? ` ${auth.notes}` : ''),
          source_form: sourceForm,
        })
      }
    }

    if (!didCheck) parts_known_no_check += 1
  }

  return { findings, parts_checked, parts_unknown, parts_known_no_check }
}

// ── CLI ENTRYPOINT ───────────────────────────────────────────────────────────
// Usage: npx tsx scripts/lib/parts-spec-validator.ts <statePath> [outMdPath]
// Exit code 13 on any HIGH-severity finding (reserved alongside 10/11).

function severitySort(a: PartsValidationFinding, b: PartsValidationFinding): number {
  const order = { HIGH: 0, MED: 1, LOW: 2 }
  return order[a.severity] - order[b.severity]
}

function renderMarkdown(result: PartsValidationResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Parts-Spec Validator — ${statePath}`)
  lines.push('')
  lines.push(
    `**${result.parts_checked} pinned parts checked** against authoritative spec table ` +
      `(${KNOWN_PART_AUTHORITATIVE.length} entries). ` +
      `${result.parts_unknown} parts not in authoritative table (no validation). ` +
      `${result.parts_known_no_check} parts known but no spec-claim found to check.`,
  )
  lines.push('')
  if (result.findings.length === 0) {
    lines.push('✅ **PASS** — no claim mismatches detected.')
    return lines.join('\n')
  }
  const sorted = [...result.findings].sort(severitySort)
  const high = sorted.filter((f) => f.severity === 'HIGH')
  const med = sorted.filter((f) => f.severity === 'MED')
  const low = sorted.filter((f) => f.severity === 'LOW')
  lines.push(
    `❌ **FAIL** — ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED, ${low.length} LOW.`,
  )
  lines.push('')
  for (const f of sorted) {
    lines.push(
      `## [${f.severity}] ${f.manufacturer} ${f.part_number} — ${f.field}`,
    )
    lines.push(`- **Module:** ${f.module_id} → ${f.sub_module_id}`)
    lines.push(`- **Word ID:** ${f.word_id}`)
    lines.push(`- **Claimed:** ${f.claimed}`)
    lines.push(`- **Authoritative:** ${f.authoritative}`)
    lines.push(`- **Ratio:** ${f.ratio.toFixed(2)}×`)
    lines.push(`- **Reason:** ${f.explanation}`)
    lines.push(`- **Source form:** "${f.source_form}"`)
    lines.push('')
  }
  return lines.join('\n')
}

// CLI main: invoked when run as `npx tsx scripts/lib/parts-spec-validator.ts ...`.
// Detection uses argv[1] basename match — works under both CJS and ESM tsx.
const argv1 = process.argv[1] ?? ''
const isMain = /parts-spec-validator\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: parts-spec-validator <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(`[parts-validator] failed to read ${statePath}: ${(err as Error).message}`)
    process.exit(1)
  }
  const result = validateEmittedParts(state)
  const md = renderMarkdown(result, statePath)
  if (outMdPath) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[parts-validator] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  // Exit 13 on any HIGH finding (reserved alongside 10 BoM, 11 layout).
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0) {
    console.error(`[parts-validator] FAIL: ${high.length} HIGH-severity finding(s)`)
    process.exit(13)
  }
  console.log(
    `[parts-validator] PASS: ${result.parts_checked} parts checked, ${result.findings.length} findings (${result.findings.filter((f) => f.severity === 'MED').length} MED, ${result.findings.filter((f) => f.severity === 'LOW').length} LOW)`,
  )
}
