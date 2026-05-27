/**
 * @file lib/manufacturer-attribution-audit.ts -- Manufacturer Attribution Audit (exit code 27)
 *
 * ARCHITECTURAL INVARIANT (2026-05-27, L41-P gate 27 -- universal class-killer):
 *
 *   When a BoM word emits manufacturer=X and part_number=P, and P matches a
 *   pattern in MFR_PART_PATTERNS that maps to canonical_mfr=Y != X, the gate
 *   fails HIGH. The LLM emitter has ascribed the wrong manufacturer to a real
 *   industrial product line -- this is a credibility-killer in engineering reports.
 *
 * L40 [LOW] finding that motivated this:
 *   "Roxtec ICG/501-M25 actually manufactured by Hawke International, not Roxtec."
 *   Roxtec makes modular multi-cable transit FRAMES (CF/CM series); ICG (Integral
 *   Compression Gland) series is a Hawke International product line. Two distinct
 *   manufacturers with overlapping vocabulary in cable sealing caused the confusion.
 *
 * Algorithm:
 *   1. Walk state.design.modules[].sub_modules[].words[] for words with
 *      manufacturer + part_number modifiers.
 *   2. For each, match part_number against each MFR_PART_PATTERNS entry.
 *   3. If matched AND canonical_mfr != emitted manufacturer: HIGH finding.
 *   4. Output: [gate-27] word X emits manufacturer=Roxtec part_number=ICG/501-M25
 *      -- canonical mfr is Hawke International per MFR_PART_PATTERNS. Update
 *      emitter at <word_id>.
 *
 * Pre-change mempalace search: "manufacturer attribution wrong Roxtec Hawke ICG cable gland"
 *   -> 0 relevant drawers (new pattern class; Klauke/EPCOS NTC confusion in gotchas is
 *      about SIZE CLASS confusion, not manufacturer attribution).
 *
 * EXIT CODE 27 registered in CLAUDE.md chain exit codes table.
 */

// ── Minimal type surface ──────────────────────────────────────────────────────

export interface MfrAttributionModifier {
  kind?: string
  value?: string
  unit?: string
}

export interface MfrAttributionWord {
  id?: string
  modifier_characters?: MfrAttributionModifier[]
}

export interface MfrAttributionSubModule {
  id?: string
  words?: MfrAttributionWord[]
}

export interface MfrAttributionModule {
  module?: string
  sub_modules?: MfrAttributionSubModule[]
}

// ── MFR_PART_PATTERNS table ───────────────────────────────────────────────────

/**
 * MfrPartPattern -- defines a known manufacturer attribution confusion.
 *
 * pattern               -- RegExp matched against the part_number modifier value.
 *                          Match is case-insensitive.
 * canonical_mfr         -- The correct manufacturer name (authoritative).
 * alternates_known_wrong -- Manufacturer names an LLM commonly (wrongly) assigns
 *                           to this part-number family. The gate compares the
 *                           emitted manufacturer against each entry
 *                           (case-insensitive, partial match allowed).
 * notes                 -- Why this confusion exists; what distinguishes canonical
 *                           from the wrong attribution. Human-readable.
 */
export interface MfrPartPattern {
  id: string
  pattern: RegExp
  canonical_mfr: string
  alternates_known_wrong: string[]
  notes: string
}

/**
 * MFR_PART_PATTERNS -- seeded with known-confused manufacturer/PN families.
 *
 * ONLY ADD ENTRIES WHERE A DOCUMENTED CONFUSION EXISTS. Every entry needs a
 * defensible "confused with X because Y" reason in the notes field.
 *
 * Naming convention: mfr_<vendor_slug>_<product_family>.
 */
export const MFR_PART_PATTERNS: MfrPartPattern[] = [
  // ── Cable sealing / cable glands ────────────────────────────────────────
  {
    id: 'mfr_hawke_icg_cable_gland',
    pattern: /^ICG[\s\/\-]/i,
    canonical_mfr: 'Hawke International',
    alternates_known_wrong: ['Roxtec', 'CMP Products', 'CMP', 'MCT Brattberg'],
    notes: [
      'ICG = "Integral Compression Gland" -- a Hawke International product line for',
      'Ex/IP-rated metal cable glands (IECEx / ATEX applications). Part numbers like',
      'ICG/501-M25, ICG/502, ICG/601. Roxtec makes modular multi-cable transit FRAMES',
      '(CF/CM series with rubber modules) -- a fundamentally different product type.',
      'CMP Products makes similar individual glands (BW, CW, E1W series) -- different PN prefix.',
      'LLM confusion: both Roxtec and Hawke appear in BESS / Ex-rated cable management.',
    ].join(' '),
  },
  {
    id: 'mfr_roxtec_cf_transit_frame',
    pattern: /^CF\s+\d+/i,
    canonical_mfr: 'Roxtec',
    alternates_known_wrong: ['Hawke International', 'Hawke', 'CMP', 'MCT Brattberg'],
    notes: [
      'CF series (CF 16, CF 32, CF 40, CF 60, CF 80) = Roxtec rectangular cable transit',
      'frames with modular rubber sealing inserts. Often incorrectly attributed to Hawke',
      '(who makes individual glands, not frames) or MCT Brattberg (who makes similar frames',
      'under a different PN system: MCT-E, MCT-S). The CF prefix is Roxtec-only.',
    ].join(' '),
  },
  {
    id: 'mfr_roxtec_cm_transit_frame',
    pattern: /^CM\s+\d+/i,
    canonical_mfr: 'Roxtec',
    alternates_known_wrong: ['Hawke International', 'Hawke', 'CMP'],
    notes: [
      'CM series = Roxtec circular pipe/cable transit sealing (CM 40, CM 50, CM 60).',
      'Same confusion vector as CF series. CM frames accept Roxtec RS modules.',
    ].join(' '),
  },
  // ── Terminal blocks / connectors ────────────────────────────────────────
  {
    id: 'mfr_wago_221_series',
    pattern: /^221\s*-\s*2/i,
    canonical_mfr: 'WAGO',
    alternates_known_wrong: ['Phoenix Contact', 'Weidmuller', 'Weidmüller', 'ABB'],
    notes: [
      '221-2xx = WAGO LEVER-NUTS 221 series (221-2101, 221-2201, 221-412, etc.).',
      'Phoenix Contact makes CLIPLINE-complete (PT / MPT series); Weidmuller makes',
      'PUSH IN (2059 / 2061 series). The 221-2xxx format is WAGO-specific.',
      'LLM confusion: all three brands appear prominently in terminal block applications.',
    ].join(' '),
  },
  {
    id: 'mfr_wago_2273_series',
    pattern: /^2273[\s\-]/i,
    canonical_mfr: 'WAGO',
    alternates_known_wrong: ['Phoenix Contact', 'Weidmuller'],
    notes: '2273 series = WAGO WAGO-COMPACT-SPLICING-CONNECTORS. WAGO-specific part number prefix.',
  },
  // ── Fuses / protection ──────────────────────────────────────────────────
  {
    id: 'mfr_bussmann_170m_fuse',
    pattern: /^170M[0-9]/i,
    canonical_mfr: 'Eaton Bussmann',
    alternates_known_wrong: ['Mersen', 'ABB', 'Siemens', 'Ferraz Shawmut'],
    notes: [
      '170M6xxx = Eaton Bussmann (formerly Cooper Bussmann) high-speed semiconductor',
      'fuse series (170M6810 = 700 A, 1000 V; 170M6813 = 1250 A, 1000 V). Mersen',
      '(formerly Ferraz Shawmut) makes the A50QS and 6.9URD series -- different prefix.',
      'The 170M prefix is Bussmann-specific. LLM confusion: both appear in DC bus / IGBT',
      'protection applications in BESS and drives.',
    ].join(' '),
  },
  // ── PLCs / industrial PCs ───────────────────────────────────────────────
  {
    id: 'mfr_siemens_simatic_hmi',
    pattern: /^6AV2[\d\-]/i,
    canonical_mfr: 'Siemens',
    alternates_known_wrong: ['Beckhoff', 'Weintek', 'Schneider Electric', 'Allen-Bradley'],
    notes: [
      '6AV2xxx = Siemens SIMATIC HMI (6AV2123, 6AV2124 = KTP panels; 6AV2132 = TP panels).',
      'Beckhoff uses CP-series (CP2607, CP2912). 6AV2 is a Siemens-specific SAP material number format.',
    ].join(' '),
  },
  {
    id: 'mfr_siemens_simatic_s7',
    pattern: /^6ES7\s*[\d\-]/i,
    canonical_mfr: 'Siemens',
    alternates_known_wrong: ['Beckhoff', 'Allen-Bradley', 'Rockwell', 'Schneider Electric'],
    notes: [
      '6ES7xxx = Siemens SIMATIC S7 PLC (S7-300, S7-400, S7-1200, S7-1500).',
      'Allen-Bradley uses 1756-xxx (ControlLogix) / 1769-xxx (CompactLogix). Beckhoff uses CX- / EK- series.',
    ].join(' '),
  },
  // ── Contactors for DC applications ──────────────────────────────────────
  {
    id: 'mfr_schaltbau_c310k_contactor',
    pattern: /^C3[12]\dK?\b/i,
    canonical_mfr: 'Schaltbau',
    alternates_known_wrong: ['TE Connectivity', 'Gigavac', 'Tyco Electronics', 'Kilovac'],
    notes: [
      'C310K, C311, C320 = Schaltbau high-voltage DC contactors (400-1500 V, up to 500 A).',
      'Used in BESS string isolation, EV powertrains. TE Connectivity / Tyco makes the',
      'EV200, LEV200, EVC500 series (also DC HV contactors). Gigavac makes GX / HX series.',
      'The C3xxK nomenclature is Schaltbau-specific.',
    ].join(' '),
  },
  // ── Disconnectors / manual motor starters ───────────────────────────────
  {
    id: 'mfr_abb_otdc_switch_disconnector',
    pattern: /^OTD[C]?\s*\d+/i,
    canonical_mfr: 'ABB',
    alternates_known_wrong: ['Schneider Electric', 'Eaton', 'Siemens', 'Socomec'],
    notes: [
      'OTDC / OTM = ABB manual motor starters and switch-disconnectors. OTDC is the',
      'DC-rated variant (OTDC16F4, OTDC25F4). Schneider uses VCC / TeSys GS series;',
      'Eaton uses PKM0-10 / NZM series. The OT/OTDC prefix is ABB-specific.',
    ].join(' '),
  },
  {
    id: 'mfr_abb_otm_motor_starter',
    pattern: /^OTM\s*\d+/i,
    canonical_mfr: 'ABB',
    alternates_known_wrong: ['Schneider Electric', 'Eaton', 'Siemens'],
    notes: 'OTM series = ABB manual motor starters / change-over switches. Same confusion vector as OTDC.',
  },
  // ── Current/voltage transformers ────────────────────────────────────────
  {
    id: 'mfr_lem_hass_transducer',
    pattern: /^(?:LEM\s+)?HASS?\s+\d+/i,
    canonical_mfr: 'LEM',
    alternates_known_wrong: ['Honeywell', 'Allegro', 'ABB', 'Broadcom'],
    notes: [
      'HASS 100-S, HASS 200-S, HAT 400-S = LEM (formerly LEM International SA) closed-loop',
      'Hall-effect current transducers for industrial / BESS string current sensing.',
      'Honeywell makes CSLA, CSLP series. Allegro makes ASC / ACS series. The HASS / HAT',
      'prefix used with LEM branding is LEM-specific.',
    ].join(' '),
  },
  {
    id: 'mfr_lem_hat_transducer',
    pattern: /^(?:LEM\s+)?HAT\s+\d+/i,
    canonical_mfr: 'LEM',
    alternates_known_wrong: ['Honeywell', 'Allegro', 'ABB'],
    notes: 'HAT series = LEM high-accuracy open-loop current transducers. Same confusion vector as HASS.',
  },
  {
    id: 'mfr_lem_lf_transducer',
    pattern: /^(?:LEM\s+)?LF\s+\d+/i,
    canonical_mfr: 'LEM',
    alternates_known_wrong: ['Honeywell', 'Allegro'],
    notes: 'LF series = LEM Ultrastab current transducers for ultra-high accuracy (<0.001% linearity).',
  },
  // ── Ritz RVT voltage transformers ───────────────────────────────────────
  {
    id: 'mfr_ritz_rvt_voltage_transformer',
    pattern: /^RVT[\s\-]/i,
    canonical_mfr: 'Ritz Instrument Transformers',
    alternates_known_wrong: ['ABB', 'Siemens', 'Schneider Electric', 'GE', 'Arteche'],
    notes: [
      'RVT-11, RVT-24, RVT-36 = Ritz Instrument Transformers (Germany) HV voltage',
      'transformers for 11-36 kV metering and protection. ABB makes IMB/NEX series;',
      'Siemens makes 4MA series; Arteche makes WVT series. The RVT prefix belongs to Ritz.',
    ].join(' '),
  },
]

// ── Finding type ──────────────────────────────────────────────────────────────

export interface MfrAttributionFinding {
  severity: 'HIGH'
  location: string          // "module_id::sub_module_id::word_id"
  word_id: string
  emitted_manufacturer: string
  emitted_part_number: string
  canonical_mfr: string
  pattern_id: string
  notes: string
  message: string
}

// ── Main audit function ───────────────────────────────────────────────────────

export interface MfrAttributionAuditResult {
  passed: boolean
  findings: MfrAttributionFinding[]
  high_count: number
  words_checked: number
  error_message: string | null
  class_name: string
}

/**
 * Normalise a manufacturer string for comparison:
 * lowercase, collapse whitespace, strip punctuation except hyphens.
 */
function normaliseMfr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\- ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Check if `emitted` contains any token from `wrongName` (loose partial match).
 * Returns true if the emitted manufacturer should be flagged as wrong.
 */
function mfrMatchesWrong(emitted: string, wrongName: string): boolean {
  const en = normaliseMfr(emitted)
  const wn = normaliseMfr(wrongName)
  // Both directions — "Roxtec" in "Roxtec GmbH" AND "ABB" in "ABB Ltd"
  return en.includes(wn) || wn.includes(en)
}

/**
 * runManufacturerAttributionAudit
 *
 * Walks every word in every sub_module. For words that carry both a
 * manufacturer modifier and a part_number modifier, checks the PN against
 * every MFR_PART_PATTERNS entry. Flags HIGH when:
 *   - The PN matches the entry's pattern, AND
 *   - The emitted manufacturer matches one of alternates_known_wrong.
 *
 * @param modules  The design.modules array.
 * @param patterns Pattern registry -- defaults to MFR_PART_PATTERNS.
 * @param className Product class string.
 */
export function runManufacturerAttributionAudit(
  modules: MfrAttributionModule[],
  patterns: MfrPartPattern[] = MFR_PART_PATTERNS,
  className = 'unknown',
): MfrAttributionAuditResult {
  const findings: MfrAttributionFinding[] = []
  let wordsChecked = 0

  const safeMods = Array.isArray(modules) ? modules : []

  for (const m of safeMods) {
    const moduleId = String(m?.module ?? 'unknown_module')
    const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []

    for (const sm of subs) {
      const subModuleId = String(sm?.id ?? 'unknown_sub_module')
      const words = Array.isArray(sm?.words) ? sm.words : []

      for (const w of words) {
        const wordId = String(w?.id ?? 'unknown_word')
        const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []

        // Extract manufacturer and part_number modifiers.
        let manufacturer = ''
        let partNumber = ''

        for (const mc of mods) {
          const kind = String(mc?.kind ?? '').toLowerCase().replace(/[\s_-]/g, '')
          const val = String(mc?.value ?? '').trim()
          if (!val) continue
          if (kind === 'manufacturer' || kind === 'mfr' || kind === 'brand') {
            manufacturer = val
          }
          if (kind === 'partnumber' || kind === 'part_number' || kind === 'pn' || kind === 'mpn') {
            partNumber = val
          }
        }

        // Only check words that have BOTH manufacturer and part_number.
        if (!manufacturer || !partNumber) continue
        wordsChecked++

        for (const entry of patterns) {
          // Does the part number match this pattern?
          if (!entry.pattern.test(partNumber)) continue

          // Does the emitted manufacturer match one of the known-wrong attributions?
          const wrongMatch = entry.alternates_known_wrong.find((alt) =>
            mfrMatchesWrong(manufacturer, alt)
          )
          if (!wrongMatch) continue

          const location = `${moduleId}::${subModuleId}::${wordId}`
          const message = [
            `[gate-27] word ${wordId} emits manufacturer="${manufacturer}"`,
            ` part_number="${partNumber}" --`,
            ` canonical mfr is "${entry.canonical_mfr}" per MFR_PART_PATTERNS[${entry.id}].`,
            ` Update emitter at deterministic-emitter.ts (search for word_id "${wordId}").`,
          ].join('')

          findings.push({
            severity: 'HIGH',
            location,
            word_id: wordId,
            emitted_manufacturer: manufacturer,
            emitted_part_number: partNumber,
            canonical_mfr: entry.canonical_mfr,
            pattern_id: entry.id,
            notes: entry.notes,
            message,
          })

          // Only report once per word (first matching pattern wins to avoid duplicate findings).
          break
        }
      }
    }
  }

  const passed = findings.length === 0

  let errorMessage: string | null = null
  if (!passed) {
    const lines = [
      `[Gate 27 / exit 27] Manufacturer attribution audit FAIL -- class: ${className}`,
      `${findings.length} HIGH finding(s) (emitted manufacturer != canonical per MFR_PART_PATTERNS):`,
    ]
    for (const f of findings.slice(0, 10)) {
      lines.push(`  @ ${f.location}: ${f.message}`)
    }
    if (findings.length > 10) {
      lines.push(`  ... and ${findings.length - 10} more.`)
    }
    lines.push('')
    lines.push('Fix: update deterministic-emitter.ts to emit the canonical manufacturer name')
    lines.push('from MFR_PART_PATTERNS. E.g. ICG/501-M25 -> manufacturer="Hawke International".')
    errorMessage = lines.join('\n')
  }

  return {
    passed,
    findings,
    high_count: findings.length,
    words_checked: wordsChecked,
    error_message: errorMessage,
    class_name: className,
  }
}
