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

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// ── LIVE-DB SPEC FALLBACK (Module 6 — growing-DB principle 2026-05-26) ──────
// When a part is NOT in KNOWN_PART_AUTHORITATIVE, attempt a SYNCHRONOUS
// DB query against ~/.forge-truth/forge-truth.db pretraining_extracted_specs.
// This gives the validator automatic coverage of the 15,027-row spec DB without
// requiring a new KNOWN_PART_AUTHORITATIVE entry for every part.
//
// Only the spec_key→rated_current_a, rated_voltage_dc_v, rated_power_kw,
// rated_current_a are used (numeric values parsed from spec_value+spec_unit).
// Full async web-search fallback happens at the Engineering Lock Gate (step 3.5)
// before validation; by the time the validator runs (gate 13) the DB should
// already have entries for any part the lock gate looked up.
//
// Uses better-sqlite3 directly (synchronous — matches the validator's sync API).
// Fails gracefully if DB unavailable or the spec key isn't found.
let _dbSpec: import('better-sqlite3').Database | null | undefined = undefined
let _stmtSpecLookup: import('better-sqlite3').Statement | null = null
let _dbSpecWarnedMissing = false

function _getSpecDb(): import('better-sqlite3').Database | null {
  if (_dbSpec !== undefined) return _dbSpec
  if (process.env.SKIP_LIBRARY_WRITEBACK === '1' || process.env.NODE_ENV === 'test') {
    _dbSpec = null
    return null
  }
  try {
    const dbPath = resolve(homedir(), '.forge-truth', 'forge-truth.db')
    if (!existsSync(dbPath)) {
      _dbSpec = null
      return null
    }
    // Dynamic require keeps the import optional (CI without better-sqlite3)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })
    db.pragma('journal_mode = WAL')
    _stmtSpecLookup = db.prepare(`
      SELECT s.spec_key, s.spec_value, s.spec_unit
      FROM pretraining_extracted_specs s
      JOIN pretraining_spec_documents d ON s.document_id = d.id
      WHERE LOWER(s.spec_key) = LOWER(?)
        AND (
          LOWER(COALESCE(d.manufacturer,'')) LIKE LOWER('%' || ? || '%')
          OR LOWER(COALESCE(d.product_name,'')) LIKE LOWER('%' || ? || '%')
        )
      ORDER BY
        CASE d.source_type
          WHEN 'datasheet' THEN 0
          WHEN 'manufacturer' THEN 1
          ELSE 2
        END ASC
      LIMIT 1
    `)
    _dbSpec = db
    return db
  } catch {
    if (!_dbSpecWarnedMissing) {
      console.warn('[parts-spec-validator] DB fallback init failed — using KNOWN_PART_AUTHORITATIVE only')
      _dbSpecWarnedMissing = true
    }
    _dbSpec = null
    return null
  }
}

/**
 * Synchronous DB lookup for a spec value.
 * Returns the numeric value or null if not found / unparseable.
 * Called ONLY when the part is not in KNOWN_PART_AUTHORITATIVE.
 */
function lookupSpecFromDb(
  manufacturer: string,
  partNumber: string,
  specKey: string,
): number | null {
  const db = _getSpecDb()
  if (!db || !_stmtSpecLookup) return null
  try {
    const row = _stmtSpecLookup.get(specKey, manufacturer, partNumber) as
      | { spec_key: string; spec_value: string; spec_unit: string }
      | undefined
    if (!row || !row.spec_value) return null
    const n = parseFloat(row.spec_value.replace(/[^0-9.\-]/g, ''))
    return isNaN(n) ? null : n
  } catch {
    return null
  }
}

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
  rated_flow_lpm?: number  // L35 fix: added for hydraulic parts (coolant pumps, etc.)
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
    notes: 'Gigavac MX12 series: 350-500 A continuous, 800 V DC. WARNING: unsuitable for 250S LFP packs (max charge 912.5 V > 800 V rated) — use Schaltbau C310K/500 (1,500 V DC) instead.',
  },
  // L33 council SAFETY BLOCKER FIX (2026-05-26): TE EV200HAANA actual
  // rated voltage is 900 V DC — NOT 1500 V. Sub-agent S (commit 056ce0aad)
  // hallucinated "1500 V". Confirmed 900 V max from:
  // https://www.onlinecomponents.com/en/productdetail/te-connectivity-kilovac-brand/ev200haana-11634568.html
  // ("Maximum DC Voltage Rating: 900 V").
  // This entry is kept so gate 13 CATCHES any re-emission of EV200HAANA and
  // flags it as insufficient for 250S LFP (912.5 V string > 900 V rated).
  // NOT to be used as the per-rack contactor — use C310K/500 below instead.
  {
    manufacturer: 'TE Connectivity',
    part_number_pattern: /^EV200HAANA$/i,
    category: 'hvdc_contactor',
    rated_current_a: 500,
    rated_voltage_dc_v: 900,
    notes: 'TE Connectivity EV200HAANA: 500 A continuous, 900 V DC max (NOT 1500 V — sub-agent S hallucinated 1500 V in commit 056ce0aad; L33 council caught as safety blocker). Source: https://www.onlinecomponents.com/en/productdetail/te-connectivity-kilovac-brand/ev200haana-11634568.html ("Maximum DC Voltage Rating: 900 V"). UNSUITABLE for 250S LFP packs (912.5 V string > 900 V rating). Use Schaltbau C310K/500 instead.',
  },
  // L33 SAFETY FIX: Schaltbau C310K/500 — per-rack contactor for 250S LFP
  // strings (max charge 912.5 V). Replaces TE EV200HAANA which is 900 V max.
  //
  // Datasheet: https://2024.schaltbau.com/media/c310_en.pdf
  // (Schaltbau GmbH C2215/2407/0, document reference page 5,
  //  "Specifications – Version «K» for Ue = 1,500 V DC")
  // Verbatim rated-voltage line:
  //   "Rated operational voltage Ue: 1,000 V @ PD3 / 1,500 V @ PD2"
  // Verbatim rated-current line:
  //   "Conv. thermal current Ith: 500 A (2x 150 mm²) @ Ta = 40°C"
  //   (or "400 A (240 mm²) @ Ta = 70°C")
  // Standards: IEC 60947-4-1 / UL 60947-4-1 / GB/T 14048.4
  // Approvals: CE, CCC (China), EAC (Russia/EAEU), UL, UKCA
  //
  // Variant disambiguation (critical — C310 family has three voltage classes):
  //   C310K = 1,500 V DC @ PD2 — THIS variant. "K" = large arc chamber.
  //   C310A = 1,000 V DC     — insufficient for 912.5 V with engineering margin.
  //   C310S = 60 V DC        — low-voltage version only.
  // NOT the C310/300 (300 A continuous) — insufficient for per-rack peak at
  //   larger stack configurations. C310K/500 is the 500 A variant.
  // NOT the C330 — that is the 2,000 A main bus contactor (separate role).
  {
    manufacturer: 'Schaltbau',
    part_number_pattern: /^C310K\/500(?:[\s-].*)?$/i,
    category: 'hvdc_contactor',
    rated_current_a: 500,
    rated_voltage_dc_v: 1500,
    notes: 'Schaltbau C310K/500: 500 A continuous (2×150 mm² / 40°C), 1,500 V DC bi-directional @ PD2, IEC/UL 60947-4-1, GB/T 14048.4. CE/UL/CCC/UKCA approved. Canonical per-rack contactor for 250S LFP packs (912.5 V max charge) per L33 safety fix. Datasheet: https://2024.schaltbau.com/media/c310_en.pdf page 5.',
  },
  // Schaltbau C310K/150 — precharge contactor for 250S LFP strings.
  // Same K-variant (1,500 V DC @ PD2); lower current class for precharge
  // duty (~10-50 A through current-limiting resistor). L33 fix: replaced the
  // bare 800 V emission on dc_precharge_contactor_word.
  // Source: https://2024.schaltbau.com/media/c310_en.pdf page 5.
  {
    manufacturer: 'Schaltbau',
    part_number_pattern: /^C310K\/150(?:[\s/].*)?$/i,
    category: 'hvdc_contactor',
    rated_current_a: 150,
    rated_voltage_dc_v: 1500,
    notes: 'Schaltbau C310K/150: 150 A continuous (50 mm² / 40°C), 1,500 V DC bi-directional @ PD2, IEC/UL 60947-4-1. Used as dc_precharge_contactor on 250S LFP strings (precharge duty ~10-50 A). NOT C310K/500 (500 A — that is the per-rack main contactor). Datasheet: https://2024.schaltbau.com/media/c310_en.pdf.',
  },
  // L35 council SAFETY BLOCKER FIX (2026-05-26): ABB OT200E03P actual
  // rated voltage is 600 V DC (AC-rated OT family with limited DC use).
  // Sub-agent class-killer #3g (commit ef3b2e466) emitted OT200E03P on the
  // rack DC isolator slot — insufficient for the 250S LFP string's 900 V
  // max charge. This entry catches any re-emission of OT200E03P/OT250E03P/
  // OT100E03P and flags it as undersized for ≥800 V DC service.
  // Use OTDC{N}E02P below instead (ABB's dedicated DC-switch family).
  {
    manufacturer: 'ABB',
    part_number_pattern: /^OT\d+E03P$/i,
    category: 'dc_disconnect',
    rated_current_a: 200,
    rated_voltage_dc_v: 600,
    notes: 'ABB OT_E03P family (AC-rated, limited DC use): 600 V DC max. UNSUITABLE for 250S LFP packs (912.5 V string > 600 V rating). Use OTDC_E02P (1000 V) or higher OTDC_EV22 (1500 V) for DC-dedicated isolation. Source: ABB OT/OETL/OTDC/OTM catalogue, library.e.abb.com.',
  },
  // L35 SAFETY FIX: ABB OTDC200E02P — DC-dedicated disconnect for rack
  // isolation. 200 A continuous, 1000 V DC, IEC 60947-3 DC-21B, IP65,
  // direct-mount handle (P suffix). Family OTDC100/160/200/250 all share
  // 1000 V DC rating; the higher OTDC_EV22 variants provide 1500 V DC.
  //
  // Datasheet: https://library.e.abb.com/public/9c3426d8764d4c4aa6852ef4b7f753cc/1SCC301021C0202_TC_OTDC_OTDCP.pdf
  // Verbatim rated-voltage line (100…250 A range table):
  //   "OTDC200E02 | OTDC200E11 | OTDC200E22 ... Ue [V DC] 1000"
  // (E33 variant column also at 1000 V DC; EV22 variant at 1500 V DC.)
  // Standards: IEC 60947-3 DC-21B utilization category.
  //
  // Variant disambiguation:
  //   OTDC_E02 / E02P = 1000 V DC, basic / direct-mount handle (THIS variant).
  //   OTDC_EV22       = 1500 V DC, higher voltage class.
  //   OT_E03P         = AC family with 600 V DC limit — UNSAFE for BESS.
  {
    manufacturer: 'ABB',
    part_number_pattern: /^OTDC\d+E(?:02|11|22|33)P?$/i,
    category: 'dc_disconnect',
    rated_current_a: 250,
    rated_voltage_dc_v: 1000,
    notes: 'ABB OTDC_E02P family (DC-dedicated disconnect): 1000 V DC, IEC 60947-3 DC-21B, IP65, direct-mount handle. Available 100/160/200/250 A current variants. EV22 variants extend to 1500 V DC. Canonical replacement for OT_E03P (600 V) on BESS rack isolators. Datasheet: https://library.e.abb.com/public/9c3426d8764d4c4aa6852ef4b7f753cc/1SCC301021C0202_TC_OTDC_OTDCP.pdf.',
  },
  // ── BESS thermal: coolant circulation pumps ──────────────────
  // L35 fix (2026-05-26): pin Grundfos NB 65-250/245 BQQE on cooling_pump_word
  // to prevent reviewer-LLM PIN STAMP substitution. Prior chain runs had
  // reviewers stamp "MAGNA3 32-60" (a 200 L/min wet-rotor heating circulator)
  // onto the slot — physically impossible at the claimed 900 L/min.
  // The deterministic-emitter now explicitly emits NB 65-250/245 BQQE; this
  // entry catches any MAGNA3 family re-emission as a wrong-spec overclaim.
  {
    manufacturer: 'Grundfos',
    part_number_pattern: /^MAGNA3\s+\d+-\d+$/i,
    category: 'circulator_pump',
    rated_flow_lpm: 200,
    notes: 'Grundfos MAGNA3 family (small wet-rotor heating circulator): max ~200 L/min at zero head. UNSUITABLE for BESS coolant circulation at 900 L/min — physically cannot deliver. Use Grundfos NB 65-250/245 BQQE (end-suction centrifugal, ~900 L/min @ ~30 m head). Source: grundfos.com MAGNA3 product datasheet.',
  },
  {
    manufacturer: 'Grundfos',
    part_number_pattern: /^NB\s+65-250\/\d+\s+BQQE$/i,
    category: 'centrifugal_pump',
    rated_flow_lpm: 900,
    notes: 'Grundfos NB 65-250/245 BQQE (end-suction centrifugal pump, EN 12162): 900 L/min nominal @ ~30 m head, water-glycol compatible. Canonical coolant circulator for utility BESS thermal-management loops (~15 racks × 60 L/min per cold plate = 900 L/min system total). Validated in L30 council (commit cbcc23755). Source: grundfos.com NB-NBE family product page.',
  },
  // ── Grundfos TPE 50-180 (L38 class-killer B correct sizing, 2026-05-26) ─────
  // Correct pump for a BESS with ~34 kW thermal load (hardware-selectors.ts
  // selectCoolantPumpFor(): 34.45 kW → 68 L/min required → 85 L/min with 1.25×
  // safety factor → TPE 50-180 at 280 L/min nominal, 25 m head, 1.1 kW motor).
  // Replaces the legacy NB 65-250/245 BQQE (900 L/min) which was 13× over-spec.
  // Datasheet: https://product.grundfos.com/TPE-50-180-2
  // (Grundfos TPE 50-180/2-S A-F-A-BAQE: in-line centrifugal, DN50, PN16,
  //  propylene/ethylene glycol solutions compatible, EC motor IE5, IP54/IP55,
  //  EN 12162 / EN 809, 3-phase 400 V 50 Hz, ~1.1 kW shaft power.)
  {
    manufacturer: 'Grundfos',
    part_number_pattern: /^TPE\s+50-180/i,
    category: 'centrifugal_pump',
    rated_flow_lpm: 280,
    notes: 'Grundfos TPE 50-180/2-S A-F-A-BAQE (in-line centrifugal, EN 12162): 280 L/min nominal @ 25 m head, ~1.1 kW EC motor (IE5), DN50 flanged, PN16, propylene-glycol rated. Correct size for BESS thermal loads of ~25-45 kW (L38 selectCoolantPumpFor() result; replaces legacy oversized NB 65-250 at 900 L/min). Datasheet: https://product.grundfos.com/TPE-50-180-2',
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
  // ── Pfannenberg DTT top-mounted enclosure cooling units ─────────
  // BESS L23 council #3: DTT 6201 was emitted as "20 kW HVAC backup" — a 10×
  // overclaim. The DTT series are DIN-rail-mount top-of-enclosure air coolers,
  // NOT packaged liquid chillers. The model number encodes BTU/h × 0.293 W:
  //   DTT 1201 ≈ 350 W, DTT 2201 ≈ 640 W, DTT 3201 ≈ 940 W, DTT 6201 ≈ 2 kW
  // Source: https://www.pfannenbergusa.com/product/thermal-management/cooling-units/dtt-top-mount/dtt-6201
  // (rated 6826 BTU/h = 2.0 kW @ Δ35°C; ~0.8 kW at +50°C ambient, +35°C internal)
  // Adding to KNOWN_PART_AUTHORITATIVE so gate 13 catches a "20 kW" claim as
  // HIGH (20 kW / 2 kW = 10× overclaim >> 1.5× gate threshold). Gate 16 will
  // also use the cooling_curve once the DTT word is collected by the hvac_backup
  // CHILLER_PATTERN extension (BESS L23 council #3 fix).
  {
    manufacturer: 'Pfannenberg',
    part_number_pattern: /^DTT[\s.-]*6201$/i,
    category: 'enclosure_cooler',
    cooling_curve: [
      { ambient_c: 35, capacity_kw: 2.0 },
      { ambient_c: 50, capacity_kw: 0.8 },
    ],
    notes: 'Pfannenberg DTT 6201 top-mounted enclosure cooler: 2.0 kW @ Δ35°C (6826 BTU/h). 0.8 kW at 50°C ambient. NOT a packaged liquid chiller — any claim ≥3 kW is wrong.',
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
  // ── L28 council fix (2026-05-25): EBM-Papst W2E200-HK38-01 enclosure fan ─
  // AC axial fan with wall ring, 225×225×80 mm, 230 VAC 50/60 Hz,
  // 880-1000 m³/h free-air flow, 83 W shaft power, IP44, ball bearing.
  // Catalogued by ebm-papst for BESS and inverter cabinet forced-air cooling.
  // Mouser MPN W2E200-HK38-01, UK list price £133.78 (qty-1), 226 UK stock
  // (fetched 2026-05-25). Farnell stocks variant W2E200-CH86-70 at £253.78.
  // Pinning the MPN in deterministic-emitter.ts forces the distributor
  // cascade to use the cached £133.78 instead of Engine B's ~£21 estimate
  // (thermal class, ref £28 × ~0.75 volume multiplier at BESS volume).
  // This entry gates gate 13 so any claimed airflow or rated-voltage outside
  // the datasheet range is flagged HIGH.
  // Source: Mouser https://www.mouser.co.uk/ProductDetail/ebm-papst/W2E200-HK38-01
  //         ebm-papst datasheet https://www.ebmpapst.com/en/products/axial-fans/w2e200/
  {
    manufacturer: 'ebm-papst',
    part_number_pattern: /^W2E200-HK38-01$/i,
    category: 'axial_enclosure_fan',
    rated_voltage_ac_v: 230,
    notes: 'ebm-papst W2E200-HK38-01: AC axial fan with wall ring, 225×225×80 mm, 230 VAC 50/60 Hz, 880-1000 m³/h free-air flow, IP44, ball bearing, 83 W shaft power. Standard enclosure ventilation fan for BESS containers and inverter cabinets. Any claim > 1000 m³/h airflow or > 110 W is outside the datasheet envelope. Mouser list £133.78 (qty-1).',
  },
  {
    manufacturer: 'EBM-Papst',
    part_number_pattern: /^W2E200-HK38-01$/i,
    category: 'axial_enclosure_fan',
    rated_voltage_ac_v: 230,
    notes: 'EBM-Papst W2E200-HK38-01 (alias — same part, capitalisation variant). See ebm-papst entry.',
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

  // ── Hawke ICG/501-M25 LV cable gland (L40 attribution fix 2026-05-27) ──────
  // ICG series = Hawke International (NOT Roxtec). Roxtec makes rectangular
  // multi-cable transit frames (CF/CM series); the ICG/501 is an individual
  // threaded compression cable gland with M-thread entries (M20–M63).
  // NOTE: datasheet URL from ehawke.com + hubbell.com/hawke was unreachable
  // from sub-agent network during L41-Q fix session (hawke.com TLS cert
  // altname invalid; hubbell.com ICG product pages return 404). Sub-agent P's
  // manufacturer-attribution-audit gate 27 will catch remaining Roxtec
  // attributions at runtime. Manual entry left without rated_voltage_ac_v
  // because the LV ICG/501-M25 is used on ≤1 kV DC circuits (no AC voltage
  // claim needed for gate 13 spec-claim correctness).
  {
    manufacturer: 'Hawke International',
    part_number_pattern: /^ICG\/501(?:-M\d+)?$/i,
    category: 'lv_cable_gland',
    notes: 'Hawke International ICG/501 series: individual cable transit gland, nickel-plated brass, M-thread entry (M20–M63 variants), IP68, single-compression, for 13–18 mm cable OD. Used for DC isolator feed cables in BESS rack enclosures. NOT Roxtec (Roxtec = rectangular multi-cable transit frames CF/CM series). Datasheet: https://www.ehawke.com/ (canonical domain; redirects to hubbell.com/hawke/en — product-level URL unreachable as of 2026-05-27 from sub-agent environment).',
  },

  // ── BESS OEM subsystems (manual seed 2026-05-25) ────────────────────────
  // Added to enable gate 13 spec-claim validation for the 5 most engineering-
  // critical BESS subsystems seeded into pretraining_extracted_parts by
  // scripts/seed-bess-oem-library.ts. Source: manufacturer datasheets.
  //
  // 1. Sungrow SC1000UD-MV (1 MW PCS inverter)
  //    Source: https://www.sungrowpower.com/product/sc1000ud-mv
  //    Datasheet: 1000 kW continuous / 1100 kW peak, 1500 V DC max input,
  //    690 V AC 3-phase output, IEC 62109-1/-2, CE.
  {
    manufacturer: 'Sungrow',
    part_number_pattern: /^SC1000UD-MV$/i,
    category: 'pcs_inverter',
    rated_power_kw: 1000,
    rated_voltage_dc_v: 1500,
    rated_voltage_ac_v: 690,
    notes: 'Sungrow SC1000UD-MV: 1000 kW continuous / 1100 kW peak bidirectional PCS inverter, 1500 V DC max input, 690 V AC 3-phase output, IEC 62109-1/-2, CE. Grid-scale BESS primary conversion stage. Claiming >1100 kW on this model is wrong; claiming >1500 V DC is wrong. Source: https://www.sungrowpower.com/product/sc1000ud-mv',
  },
  // Alias — deterministic-emitter may emit without the -MV suffix.
  {
    manufacturer: 'Sungrow',
    part_number_pattern: /^SC1000UD$/i,
    category: 'pcs_inverter',
    rated_power_kw: 1000,
    rated_voltage_dc_v: 1500,
    rated_voltage_ac_v: 690,
    notes: 'Sungrow SC1000UD (alias — same product as SC1000UD-MV). See SC1000UD-MV entry.',
  },
  {
    manufacturer: 'Sungrow',
    part_number_pattern: /^SC2000UD-MV$/i,
    category: 'pcs_inverter',
    rated_power_kw: 2000,
    rated_voltage_dc_v: 1500,
    rated_voltage_ac_v: 690,
    notes: 'Sungrow SC2000UD-MV: 2000 kW continuous bidirectional PCS inverter, 1500 V DC max, 690 V AC. Source: https://www.sungrowpower.com/product/sc2000ud-mv',
  },

  // 2. Grundfos CR 32-2 A-F-A-E-HQQE (BESS thermal-loop circulation pump)
  //    Source: https://product.grundfos.com/CR-32-2
  //    Datasheet: 32 m³/h nominal flow, 24 m head at nominal duty point,
  //    2.2 kW motor shaft power, 3-phase 400 V 50 Hz, HQQE seal.
  //    Note: rated_power_kw field used as motor shaft power proxy.
  {
    manufacturer: 'Grundfos',
    part_number_pattern: /^CR[\s.-]*32-2[\s.-]*A-F-A-E-HQQE$/i,
    category: 'circulation_pump',
    rated_power_kw: 2.2,
    notes: 'Grundfos CR 32-2 A-F-A-E-HQQE: vertical multi-stage centrifugal pump, 32 m³/h nominal flow, 24 m head at nominal duty, 2.2 kW motor shaft power, 3-phase 400 V 50 Hz, HQQE mechanical seal. Claiming >15 kW on this model is wrong (that is CR 32-8 territory). Source: https://product.grundfos.com/CR-32-2',
  },
  // Generic Grundfos CR 32 family pattern (emitter may omit full variant suffix)
  {
    manufacturer: 'Grundfos',
    part_number_pattern: /^CR[\s.-]*32-[1-5](?:\s+.*)?$/i,
    category: 'circulation_pump',
    rated_power_kw: 5.5,   // conservative upper bound for CR 32-1 to CR 32-5 family
    notes: 'Grundfos CR 32-N family (1 to 5 stages): 2.2–5.5 kW motor range at nominal duty, 32 m³/h class. Any claim >30 kW on a CR 32-N is wrong (max in-family is ~7.5 kW for CR 32-7). Source: https://product.grundfos.com/CR-32',
  },

  // 3. Beckhoff CX2030-0125 (BESS EMS / SCADA embedded PC)
  //    Source: https://www.beckhoff.com/en-us/products/ipc/embedded-pcs/cx2030/
  //    Datasheet: Intel Atom E3940 4-core 1.6 GHz, 8 GB RAM, fanless,
  //    DIN-rail mount, -25 to +60 °C operating range.
  //    No power/current spec needed — rated_power_kw used as max power draw proxy.
  {
    manufacturer: 'Beckhoff',
    part_number_pattern: /^CX2030-0125$/i,
    category: 'industrial_pc',
    rated_power_kw: 0.015,   // ~12-15 W max TDP fanless, datasheet-typical for Atom E39xx
    notes: 'Beckhoff CX2030-0125: Intel Atom E3940 (4-core 1.6 GHz), 8 GB RAM, fanless DIN-rail embedded PC. Max TDP ~12-15 W. Claiming >50 W on this model is wrong (it has no active cooling). Used for BESS EMS / SCADA controller duty. Source: https://www.beckhoff.com/en-us/products/ipc/embedded-pcs/cx2030/',
  },
  {
    manufacturer: 'Beckhoff',
    part_number_pattern: /^CX2042-0150$/i,
    category: 'industrial_pc',
    rated_power_kw: 0.030,   // Core i5-7300U TDP ~25-30 W
    notes: 'Beckhoff CX2042-0150: Intel Core i5-7300U (2-core 2.6 GHz), 16 GB RAM DDR4, fanless, PCIe expansion. TDP ~25-30 W. Source: https://www.beckhoff.com/en-us/products/ipc/embedded-pcs/cx2042/',
  },

  // 4. Kidde ECARO-25 IndustryShield (BESS clean-agent fire suppression)
  //    Source: https://www.kidde.com/home-safety/en/us/products/fire-safety-products/fire-suppression-systems/ecaro-25/
  //    Datasheet: HFC-227ea (FM-200) agent, UL 2127, NFPA 2001, EN 15004-5,
  //    FM 5600. Room volumes 50-1500 m³.
  //    No electrical rating — notes field describes validated design parameter.
  {
    manufacturer: 'Kidde',
    part_number_pattern: /^ECARO-25[\s-]?IndustryShield$/i,
    category: 'fire_suppression_system',
    notes: 'Kidde ECARO-25 IndustryShield: HFC-227ea (FM-200) clean agent fire suppression, room volumes 50-1500 m³, UL 2127, NFPA 2001, EN 15004-5, FM 5600. Correct type for BESS enclosure fire suppression per UL 9540A / NFPA 855. Any claim that this system covers >1500 m³ unassisted is wrong — larger volumes require multi-cylinder manifolded systems. Source: https://www.kidde.com/home-safety/en/us/products/fire-safety-products/fire-suppression-systems/ecaro-25/',
  },
  // Alias — emitter may emit just "ECARO-25"
  {
    manufacturer: 'Kidde',
    part_number_pattern: /^ECARO-25$/i,
    category: 'fire_suppression_system',
    notes: 'Kidde ECARO-25: HFC-227ea (FM-200) clean agent system. See ECARO-25 IndustryShield entry for full spec.',
  },

  // 5. Stat-X T16450ES (aerosol fire suppression generator — BESS cabinet)
  //    Source: https://www.statx.com/products/generators/t16450es
  //    Datasheet: 450 g condensed aerosol charge, electrical activation,
  //    UL Listed, FM Approved, NFPA 2010. Cabinet-level BESS fire protection.
  {
    manufacturer: 'Stat-X',
    part_number_pattern: /^T16450ES$/i,
    category: 'aerosol_fire_suppression',
    notes: 'Stat-X T16450ES: condensed aerosol fire suppression generator, 450 g charge, electrical activation, UL Listed, FM Approved, NFPA 2010. BESS rack-level fire protection per NFPA 855 Section 15.6. Claiming >900 g charge on a T16450ES is wrong (that is T16900ES territory). Source: https://www.statx.com/products/generators/t16450es',
  },

  // ── Universal process-plant I&C catalogue (added 2026-06-06) ──────────────
  // Entries added for the _universal-instrumentation.ts emitter so gate-13
  // can validate claimed ratings against manufacturer datasheets. All MPNs
  // verified against manufacturer catalogues; rated_pressure_max_bar /
  // rated_temp_max_c filled where gate-13 spec validation is meaningful.

  // Emerson Rosemount 3051CD — gauge/differential pressure transmitter
  // Datasheet: Rosemount 3051C series, 4–20 mA HART, range 0–250 bar,
  // –40 to +85 °C electronics, 316L/316SST wetted, ATEX II 2G.
  // Source: emerson.com/en-us/catalog/rosemount-3051-pressure-transmitter
  {
    manufacturer: 'Emerson',
    part_number_pattern: /^Rosemount\s+3051(?:C?D?[A-Z]?)?$/i,
    category: 'pressure_transmitter',
    notes: 'Emerson Rosemount 3051CD: coplanar gauge/differential pressure transmitter, 4–20 mA HART, process range 0.025 inH2O to 3626 psi (0–250 bar), –40 to +85 °C electronics, 316L wetted. ATEX II 2G, SIL 2/3. Any pressure claim > 250 bar is outside the standard process range; use 3051CA (absolute) or a higher-rated transmitter. Source: emerson.com/en-us/catalog/rosemount-3051.',
  },
  // Alias for the short form used in co2-mineralisation emitter
  {
    manufacturer: 'Emerson',
    part_number_pattern: /^Rosemount\s+3051$/i,
    category: 'pressure_transmitter',
    notes: 'Emerson Rosemount 3051 (short-form alias): see Rosemount 3051CD entry for full spec.',
  },

  // Endress+Hauser Cerabar PMP71 — gauge pressure transmitter, ceramic/metallic
  // Datasheet: PMP71 up to 400 bar, –40 to +150 °C process, 4–20 mA HART.
  // Source: endress.com/en/field-instruments-overview/pressure/Cerabar-PMP71
  {
    manufacturer: 'Endress+Hauser',
    part_number_pattern: /^Cerabar\s+PMP71$/i,
    category: 'pressure_transmitter',
    notes: 'Endress+Hauser Cerabar PMP71: ceramic or metallic measuring cell gauge pressure transmitter, 4–20 mA HART, process range to 400 bar, temperature –40 to +150 °C, ATEX II 2G Ex ia. Any claim > 400 bar is outside the catalogue range.',
  },

  // Endress+Hauser iTHERM TM411 — compact temperature head transmitter with Pt100
  // Datasheet: TM411, –50 to +250 °C (standard) / to +600 °C (high-temp), 4–20 mA.
  // Source: endress.com/en/field-instruments-overview/temperature/TM411
  {
    manufacturer: 'Endress+Hauser',
    part_number_pattern: /^iTHERM\s+TM411$/i,
    category: 'temperature_transmitter',
    notes: 'Endress+Hauser iTHERM TM411: compact 4–20 mA HART head transmitter for Pt100/Pt1000/thermocouple, –50 to +600 °C (variant-dependent), 16-bit resolution, ATEX II 2G Ex ia. Claiming >600 °C for the standard process variant is wrong.',
  },

  // Endress+Hauser Promag W 400 — electromagnetic flow transmitter
  // Datasheet: W 400 electromagnetic flowmeter, DN10–DN1200, 4–20 mA HART / PROFIBUS PA.
  // Source: endress.com/en/field-instruments-overview/flow/Promag-W-400
  {
    manufacturer: 'Endress+Hauser',
    part_number_pattern: /^Promag\s+W\s+400$/i,
    category: 'electromagnetic_flow_transmitter',
    notes: 'Endress+Hauser Promag W 400: electromagnetic flow transmitter, DN10–DN1200, 4–20 mA HART + PROFIBUS PA, max process pressure 40 bar (PN40), –20 to +150 °C fluid, 316L/316Ti liner. Any claim > 40 bar process pressure is wrong for the standard version. Suitable for aqueous and slurry streams. ATEX II 2G.',
  },

  // Endress+Hauser Promass Q 300 — Coriolis mass flow transmitter
  // Datasheet: Promass Q 300, dual bent-tube Coriolis, DN4–DN200, up to 200 bar.
  // Source: endress.com/en/field-instruments-overview/flow/Promass-Q-300
  {
    manufacturer: 'Endress+Hauser',
    part_number_pattern: /^Promass\s+Q\s+300$/i,
    category: 'coriolis_mass_flow_transmitter',
    notes: 'Endress+Hauser Promass Q 300: dual bent-tube Coriolis mass flow transmitter, DN4–DN200, max 200 bar, –200 to +350 °C, accuracy ±0.05% mass flow. Any claim > 200 bar or > 350 °C is outside the catalogue envelope.',
  },

  // Endress+Hauser Micropilot FMR62 — 80 GHz radar level transmitter
  // Datasheet: FMR62, 0.1–120 m range, –40 to +250 °C process, PN40, ATEX II 1G.
  // Source: endress.com/en/field-instruments-overview/level/Micropilot-FMR62
  {
    manufacturer: 'Endress+Hauser',
    part_number_pattern: /^Micropilot\s+FMR62$/i,
    category: 'radar_level_transmitter',
    notes: 'Endress+Hauser Micropilot FMR62: 80 GHz free-space radar level transmitter, range 0.1–120 m, –40 to +250 °C process temperature, max 40 bar (PN40), 4–20 mA HART / PROFIBUS PA, ATEX II 1G Ex ia. SIL 2. Any range claim > 120 m or pressure > 40 bar is wrong.',
  },

  // VEGA VEGAFLEX 83 — guided-wave radar level transmitter
  // Datasheet: VEGAFLEX 83, range to 75 m, –196 to +450 °C, up to 160 bar.
  // Source: vega.com/en-gb/products/product-catalog/level/guided-radar-tdr/VEGAFLEX-83
  {
    manufacturer: 'VEGA',
    part_number_pattern: /^VEGAFLEX\s+83$/i,
    category: 'guided_wave_radar_level_transmitter',
    notes: 'VEGA VEGAFLEX 83: guided-wave (TDR) radar level transmitter, range to 75 m, –196 to +450 °C, up to 160 bar, 4–20 mA HART / PROFIBUS PA. ATEX Zone 0/20. Claiming > 160 bar or > 75 m range is wrong. Best used on reactors, separators, and standpipes where free-space radar antennas cannot be used.',
  },

  // Endress+Hauser Liquiline CM442 — multiparameter transmitter (pH + conductivity)
  // Datasheet: CM442, dual-channel, Memosens digital sensors, 4–20 mA HART.
  // Source: endress.com/en/field-instruments-overview/liquid-analysis/Liquiline-CM442
  {
    manufacturer: 'Endress+Hauser',
    part_number_pattern: /^Liquiline\s+CM442$/i,
    category: 'ph_conductivity_transmitter',
    notes: 'Endress+Hauser Liquiline CM442: dual-channel multiparameter transmitter for pH, ORP, conductivity, turbidity, etc., via Memosens digital sensors. Two 4–20 mA outputs, HART. No pressure or current rating — gate-13 only checks category correctness for this entry.',
  },

  // Dräger Polytron 8700 — fixed electrochemical/catalytic gas transmitter
  // Datasheet: Polytron 8700, H2 / CO / HC selectable, ATEX II 1G Ex ia,
  // 4–20 mA output, IP66. Range 0–100% LEL (catalytic) or 0–4000 ppm (EC).
  // Source: draeger.com/en_uk/Safety/Fixed-Gas-Detection/Polytron-8700
  {
    manufacturer: 'Dräger',
    part_number_pattern: /^Polytron\s+8700$/i,
    category: 'fixed_gas_detector',
    notes: 'Dräger Polytron 8700: fixed electrochemical (CO, H2S, NH3, etc.) or catalytic bead (flammable HC/H2) gas transmitter. 4–20 mA + relay, IP66, ATEX II 1G Ex ia, EN 60079-29-1 certified. Selectable sensor head for H2 / CO / LCH4 / LEL. No electrical current rating — category correctness is the validation here. Source: draeger.com.',
  },

  // ABB EL3060 Uras26 — extractive multi-component NDIR gas analyser
  // Datasheet: EL3060 analyser system with Uras26 infrared detector,
  // measures CO2, CO, CH4, N2O, SO2, NO simultaneously. QAL1 certified.
  // Source: abb.com/en/continuous-gas-analyzers/el3060
  {
    manufacturer: 'ABB',
    part_number_pattern: /^EL3060\s+Uras26$/i,
    category: 'process_gas_analyser',
    notes: 'ABB EL3060 Uras26: extractive multi-component NDIR gas analyser system. Measures CO2, CO, CH4, N2O, SO2, NO and O2 (with paramagnetic detector). EN 15267-3 QAL1 certified for CEMs applications. ATEX II 2G available. Typical UK list price ~£9,500 for process-grade configuration. Source: abb.com/en/continuous-gas-analyzers/el3060.',
  },

  // Emerson Fisher GX + DVC6200 — globe/rotary control valve + digital positioner
  // Datasheet: Fisher GX Control Valve, ASME B16.34, PN40; DVC6200 HART positioner.
  // Source: emerson.com/en-us/automation/fisher/control-valves/gx-control-valve
  {
    manufacturer: 'Emerson Fisher',
    part_number_pattern: /^GX\s*\+\s*DVC6200$/i,
    category: 'control_valve',
    notes: 'Emerson Fisher GX globe/rotary control valve body (ASME B16.34, rated to PN16–PN160 depending on trim) with Fisher DVC6200 HART digital positioner. Any process pressure claim > 160 bar is outside the standard PN160 body rating. SIL 3 capable with redundant positioner. Source: emerson.com/en-us/automation/fisher.',
  },

  // Spelsberg 81040001 — polycarbonate field junction box
  // Datasheet: TK PC 1809-6-t, 180×110×90 mm, polycarbonate, IP65, M20 knockouts.
  // Source: spelsberg.com/en-gb/products/product-overview/junction-boxes/81040001
  {
    manufacturer: 'Spelsberg',
    part_number_pattern: /^81040001$/i,
    category: 'field_junction_box',
    notes: 'Spelsberg 81040001 (TK PC 1809-6-t): polycarbonate IP65 junction box, 180×110×90 mm, 6×M20 knock-outs, grey lid, DIN-rail compatible. No electrical rating — no current passes through the enclosure. Category: IP65 field cable marshalling enclosure.',
  },

  // Siemens 6ES7155-6AU01-0CN0 — ET 200SP HA IM 155-6 PN/2 interface module
  // Datasheet: SIMATIC ET 200SP HA, 32–512 I/O channels, PROFINET, –40 to +70 °C.
  // Source: siemens.com/global/en/products/automation/simatic-s7/et-200sp.html
  {
    manufacturer: 'Siemens',
    part_number_pattern: /^6ES7155-6AU01-0CN0$/i,
    category: 'remote_io_interface_module',
    notes: 'Siemens SIMATIC ET 200SP HA IM 155-6 PN/2 (6ES7155-6AU01-0CN0): high-availability remote I/O interface module, 2×PROFINET ports, ring topology, 32–512 I/O channels, –40 to +70 °C, IP20 (cabinet mount). No electrical current rating — the module routes digital signals only.',
  },

  // Siemens 6ES7131-6BH01-0BA0 — ET 200SP digital input card (DI 16×24 V DC)
  // Source: siemens.com SIMATIC ET 200SP DI 16×24VDC HF
  {
    manufacturer: 'Siemens',
    part_number_pattern: /^6ES7131-6BH01-0BA0$/i,
    category: 'digital_io_card',
    notes: 'Siemens ET 200SP DI 16×24 V DC HF (6ES7131-6BH01-0BA0): 16-channel digital input card, 24 V DC, high-feature diagnostics, ISOMAX galvanic isolation. No current rating — digital signal only (10 mA typical input current). Source: siemens.com.',
  },

  // Siemens 6ES7134-6GF00-0AA1 — ET 200SP analogue input card (AI 8×I 2/4-wire)
  // Source: siemens.com SIMATIC ET 200SP AI 8xI 2/4-wire HF
  {
    manufacturer: 'Siemens',
    part_number_pattern: /^6ES7134-6GF00-0AA1$/i,
    category: 'analogue_io_card',
    notes: 'Siemens ET 200SP AI 8×I 2/4-wire HF (6ES7134-6GF00-0AA1): 8-channel 4–20 mA analogue input card, 16-bit resolution, diagnostics, –10 V to +10 V or 0–20 mA / 4–20 mA. No current rating — accepts 4–20 mA process signals. Source: siemens.com.',
  },

  // Siemens 6AV2124-0QC02-0AX1 — SIMATIC HMI TP1500 Comfort 15-inch touch panel
  // Source: siemens.com/global/en/products/automation/simatic-hmi/panels/tp1500-comfort.html
  {
    manufacturer: 'Siemens',
    part_number_pattern: /^6AV2124-0QC02-0AX1$/i,
    category: 'hmi_panel',
    notes: 'Siemens SIMATIC TP1500 Comfort (6AV2124-0QC02-0AX1): 15-inch widescreen TFT industrial HMI, multi-touch, PROFINET/MPI, USB, CF/SD slot, 24 V DC, IP65 front. 24 V DC supply. Any claim of >30 V input is wrong.',
  },

  // Siemens SCALANCE XC208 — managed industrial PROFINET switch
  // Datasheet: SCALANCE XC208, 8×10/100 Mbit/s, ring (MRP), –40 to +70 °C.
  // Source: siemens.com/global/en/products/automation/industrial-communication/scalance-x/xc-200.html
  {
    manufacturer: 'Siemens',
    part_number_pattern: /^SCALANCE\s+XC208$/i,
    category: 'profinet_switch',
    notes: 'Siemens SCALANCE XC208: managed 8-port 100 Mbit/s industrial Ethernet switch, PROFINET conformance Class C, ring redundancy (MRP), –40 to +70 °C, DIN-rail. No electrical current or voltage rating — signal switching only (24 V DC supply).',
  },

  // ABB ACS580-01 — general-purpose VFD ≤15 kW (pumps / agitators / fans)
  // Datasheet: ACS580-01, 380–480 V AC, 0.75–55 kW (01 frame to R7), IP55, STO SIL 2.
  // Source: abb.com/drives/en/products/acs580
  {
    manufacturer: 'ABB',
    part_number_pattern: /^ACS580-01$/i,
    category: 'variable_frequency_drive',
    rated_voltage_ac_v: 480,
    rated_power_kw: 55,
    notes: 'ABB ACS580-01: general-purpose VFD, 380–480 V AC, 0.75–55 kW (01 frame series), IP55, STO SIL 2, EN 61800-3 C2, Modbus/EtherNet-IP. Claiming >55 kW on the -01 frame is wrong (use ACS880-07 for higher power). Source: abb.com/drives.',
  },

  // ABB ACS880-07 — industrial VFD, 15–250 kW wall/floor (compressors / large motors)
  // Datasheet: ACS880-07, 380–690 V AC, 15–250 kW, IP55, DTC, STO SIL 3.
  // Source: abb.com/drives/en/products/acs880
  {
    manufacturer: 'ABB',
    part_number_pattern: /^ACS880-07$/i,
    category: 'variable_frequency_drive',
    rated_voltage_ac_v: 690,
    rated_power_kw: 250,
    notes: 'ABB ACS880-07: industrial VFD, 380–690 V AC, 15–250 kW (wall/floor-mount 07 frame), IP55, DTC motor control, STO SIL 3, ABB Ability connected. Claiming >250 kW on the -07 frame is wrong (use ACS880-17 cabinet drive for >250 kW). Source: abb.com/drives.',
  },

  // ABB MNS Form-4 — low-voltage motor control centre
  // Datasheet: MNS Form-4, withdrawable units, IEC 61439-2, Ue 690 V AC max, Icw 50 kA.
  // Source: abb.com/en/products/sace-mns-low-voltage-motor-control-centres
  {
    manufacturer: 'ABB',
    part_number_pattern: /^MNS\s+Form-4(?:\s+motor\s+control\s+centre\s+[-—]\s+configured)?$/i,
    category: 'motor_control_centre',
    rated_voltage_ac_v: 690,
    rated_current_a: 6300,
    notes: 'ABB MNS Form-4 motor control centre: withdrawable-unit MCC to IEC 61439-2, rated Ue ≤ 690 V AC, Icw 50 kA/1 s, Form-4 full compartmentalisation. Any claim of >690 V input or >6300 A busbar is wrong for the standard MNS range (use MNS IS for higher short-circuit). Source: abb.com SACE MNS catalogue.',
  },

  // Eaton 93PM — online double-conversion UPS, 10–200 kVA
  // Datasheet: 93PM, 10–200 kVA, 3-phase in/out, 480 V or 400 V, IEC 62040-3 Class 1.
  // Source: eaton.com/us/en-us/catalog/backup-power-ups-surge-it-power-distribution/93pm.html
  {
    manufacturer: 'Eaton',
    part_number_pattern: /^93PM$/i,
    category: 'uninterruptible_power_supply',
    rated_voltage_ac_v: 480,
    rated_power_kw: 200,
    notes: 'Eaton 93PM: online double-conversion UPS, 10–200 kVA, 3-phase in/single or 3-phase out, 480 V or 400 V, IEC 62040-3 VFI Class 1, NFPA 70 compliant. Any claim >200 kVA for a single 93PM chassis is wrong (multiple units in parallel cover higher loads). Source: eaton.com.',
  },

  // Rittal VX25 8284.500 — large floor-standing enclosure for marshalling
  // Datasheet: VX25 8284.500, 600 W×2000 H×600 D mm, steel, IP55/IP66 with kit, RAL7035.
  // Source: rittal.com/com_en/products/product/VX25-8284500
  {
    manufacturer: 'Rittal',
    part_number_pattern: /^VX25\s+8284\.500$/i,
    category: 'marshalling_cabinet',
    notes: 'Rittal VX25 8284.500: floor-standing steel enclosure, 600 W×2000 H×600 D mm, IP55 with standard kit, IP66 with optional kit, RAL7035, bayed, DIN-rail mountable, multiple cable entry options. No electrical rating — passive enclosure. Source: rittal.com VX25 series.',
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
        // Module 6 (2026-05-26): fall through to live DB lookup before skipping.
        // The DB has 15,027 spec rows. If the part is in there (from the
        // Engineering Lock Gate's writeback pass), build a synthetic AuthSpec
        // for the claimed spec keys. KNOWN_PART_AUTHORITATIVE remains the
        // manual override layer for high-confidence curated entries.
        const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
          ? word.modifier_characters
          : []
        const claimedAObj = claimedCurrentFromModifiers(mods)
        const claimedV = claimedVoltageFromModifiers(mods)
        const claimedKw = claimedPowerKwFromModifiers(mods)

        let dbFallbackUsed = false
        if (claimedAObj != null) {
          const dbA = lookupSpecFromDb(mfr, pn, 'rated_current_a')
            ?? lookupSpecFromDb(mfr, pn, 'rated_current_continuous_a')
          if (dbA != null && dbA > 0) {
            auth = {
              manufacturer: mfr,
              part_number_pattern: new RegExp(pn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
              category: 'db_fallback',
              rated_current_a: dbA,
              notes: `DB-fallback spec (pretraining_extracted_specs): rated_current_a=${dbA}A`,
            }
            dbFallbackUsed = true
          }
        }
        if (!dbFallbackUsed && claimedV != null) {
          const dbV = lookupSpecFromDb(mfr, pn, 'rated_voltage_dc_v')
            ?? lookupSpecFromDb(mfr, pn, 'rated_voltage_v')
            ?? lookupSpecFromDb(mfr, pn, 'max_dc_voltage_v')
          if (dbV != null && dbV > 0) {
            auth = {
              manufacturer: mfr,
              part_number_pattern: new RegExp(pn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
              category: 'db_fallback',
              rated_voltage_dc_v: dbV,
              notes: `DB-fallback spec (pretraining_extracted_specs): rated_voltage_dc_v=${dbV}V`,
            }
            dbFallbackUsed = true
          }
        }
        if (!dbFallbackUsed && claimedKw != null) {
          const dbKw = lookupSpecFromDb(mfr, pn, 'rated_power_kw')
            ?? lookupSpecFromDb(mfr, pn, 'rated_cooling_kw')
            ?? lookupSpecFromDb(mfr, pn, 'rated_thermal_kw')
          if (dbKw != null && dbKw > 0) {
            auth = {
              manufacturer: mfr,
              part_number_pattern: new RegExp(pn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
              category: 'db_fallback',
              rated_power_kw: dbKw,
              notes: `DB-fallback spec (pretraining_extracted_specs): rated_power_kw=${dbKw}kW`,
            }
            dbFallbackUsed = true
          }
        }

        if (!auth) {
          // Not in KNOWN_PART_AUTHORITATIVE AND not in DB — skip rather than misattribute.
          parts_unknown += 1
          continue
        }
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
