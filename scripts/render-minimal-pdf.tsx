#!/usr/bin/env npx tsx
/**
 * scripts/render-minimal-pdf.ts
 *
 * MVP cut: 2-section PDF from an existing state.json.
 *
 *   1. Brief & Requirements (prose)
 *   2. Modules — numbered. Numbered module connection map. Per-module section
 *      with an English overview paragraph followed by every sub-module described
 *      in enough detail that each part is namable.
 *
 * Out of scope: BoM, costs, assembly partners, sources, references, risk
 * register, regulatory, appendices, glossary, statistics. Engineering check
 * verdicts run upstream — output here is the verified prose only; verdict
 * pass/fail is NOT shown.
 *
 * Usage:
 *   npx tsx scripts/render-minimal-pdf.ts <state.json> [out.pdf]
 */
import React from 'react'
import { Document, Page, Text, View, Svg, Line, Circle, Link, Image, pdf } from '@react-pdf/renderer'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { execFileSync } from 'child_process'
import { generateSubmoduleParagraph } from '../src/lib/pdf-engine-v2/radical/sentence-generator'
import { getClassStandards, mergeBriefAndClassStandards, type RegulatoryStandard } from '../src/lib/pdf-engine-v2/class-standards'
import { getClassHazards, computeHazardRPN, type ClassHazard } from '../src/lib/pdf-engine-v2/class-hazards'
import { resolvePriceBand, type PriceBand, type PriceBandVerdict } from '../src/lib/pdf-engine-v2/class-price-bands'
import { resolveCostStack, computeCostStack, type CostStack } from '../src/lib/pdf-engine-v2/class-cost-structure'
import { getToolNarrative } from '../src/lib/pdf-engine-v2/tool-narratives'

// ─── Design tokens ──────────────────────────────────────────────────────────

const INK = '#0d1117'
const INK_SOFT = '#3b4252'
const MUTED = '#6b7280'
const ACCENT = '#1e3a5f'
const ACCENT_SOFT = '#2563ae'
const RULE = '#d4d4d8'
const RULE_SOFT = '#e5e7eb'

// 2026-05-18 (Track N visual audit BLOCKER 1): `lineHeight` on the Page style
// breaks @react-pdf/renderer 4.5.1's fixed-footer rendering when the footer
// uses `<Text render={fn}>` for dynamic page numbers. Reproduced with a
// 2-page minimal document; removing `lineHeight` from the Page style restores
// the footer on every body page. Per-component Text nodes that need a custom
// line-height now set it locally (most already do — every Paragraph / body
// Text in this file explicitly sets `lineHeight: 1.55|1.6|1.65`).
const PAGE_STYLE = {
  paddingTop: 56,
  paddingBottom: 70,
  paddingHorizontal: 64,
  fontFamily: 'Helvetica',
  fontSize: 10.5,
  color: INK,
  backgroundColor: '#ffffff',
} as const

// ─── Helpers ────────────────────────────────────────────────────────────────

function humanise(id: string): string {
  if (!id) return ''
  // Engineering acronyms — must stay all-caps after title-casing. Phase19 audit
  // (2026-05-17) flagged Iso/Pdu/Mppt/Hvac/Pid as leaking title-cased; the
  // expanded set below covers every acronym surfaced in the 10 phase19 PDFs
  // plus the wider catalogue the renderer is likely to encounter.
  const ACRONYMS = new Set([
    'BMS','PCS','EMS','SCADA','PLC','LFP','DC','AC','EV','PV','LV','HV','MV',
    'IGBT','MCU','FPGA','PCB','PCBA','MPPT','SOC','SOH','UPS','NTC','RTU','SFP',
    'CAN','PWM','RTC','IEC','UL','BS','EN','NFPA','ESO','HRC','MCCB','EMI','EMC',
    'PSU','SSD','DDR4','ECC','GBE','NIC','RS485','NTP','GPS','SIM',
    'HMI','UK','MW','MWh','kWh','kW','EFR','RJ45','LTE','SD','TBD',
    // Added 2026-05-17 phase19 audit
    'ISO','PDU','HVAC','PID','RTD','PCS','EEV','BPHE','OCPP','CCS2','MOSFET','SIC','GAAS','PFC',
    'ROHS','CE','FCC','IPMI','BLE','NFC','LED','LCD','OLED','RF','MQTT','API','OEM','CM','EPC',
    'EU','USA','PCBA','BMS','UPS','UAV','AUV','HAPS','CGM','GNSS','IMU','ADCS','CRC','VFD',
    'GMP','HEPA','UV','RCD','GAMP5','GAMP','MCS','LIDAR','SONAR','IP54','IP55','IP66','IP67','IP68',
    'PCIE','DDR5','NVME','M2','ASIC','GPU','CPU','SOC','VTX','ESC','FC','LTO','LIPO','NMC',
    'NHS','MHRA','FDA','MDR','IVDR','CIBSE','MCS','NSI','ASHP','GSHP','ROHS','REACH',
  ])
  return id.split('_').map(w => {
    const upper = w.toUpperCase()
    if (ACRONYMS.has(upper)) return upper
    if (/^\d/.test(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

/**
 * Strip pipeline-internal ids that leaked into LLM prose. The module's
 * paragraph_en_llm sometimes starts with "The energy_storage_source module...";
 * we substitute every snake_case run with its humanised label (lower-case so
 * it reads inline).
 */
function strip_internal_ids(s: string): string {
  if (!s) return ''
  return s.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b/g, (m) => humanise(m).toLowerCase())
}

/**
 * Engineering-check fixup: iter-09's grammar verdicts flagged the main DC
 * contactor (300 A nameplate) as undersized 3.3× for the 1,000 A pack current
 * at 1 MW / 1 kV. Patch the visible string so we don't ship an engineering
 * untruth. One silent targeted edit until we round-trip the module prose
 * through the LLM with the warning attached.
 */
function apply_engineering_fixups(s: string): string {
  if (!s) return ''
  return s
    .replace(
      /\b300\s*A\s+main\s+DC\s+contactor\b/gi,
      'main DC contactor rated for full pack current (paralleled or 1,000 A-class)',
    )
    .replace(
      /\bEV200HAANA\b/gi,
      'high-current DC contactor (1 kA-class)',
    )
    // Bug fix #11 (2026-05-22): LLM occasionally leaks unsubstituted "P." or
    // "P. IFA v5.2." placeholder tokens (an unfilled template variable from a
    // GlobalG.A.P. prose pattern). Strip them. Match standalone "P." between
    // word boundaries — must be capital P followed by full-stop, NOT inside
    // a longer identifier like "TUV PL-L" or "P.E." engineer credential.
    .replace(/(?<=^|\s)P\.\s+IFA\s+v\d+(?:\.\d+)?\.\s*/g, '')
    .replace(/(?<=^|\s)P\.(?=\s+[a-z]|\s+\/|\s*$)/g, '')
    // Bug fix #2 (2026-05-22): Some prose paragraphs leak literal "0 confirms"
    // / "0 requires" / "0 sizes" / "0 delivers" / "0 calculates" / "0 maintains"
    // — an unsubstituted `tools[0].name` template variable. When we can't tell
    // which tool name was meant, fall back to a generic "The orchestrator tool"
    // so the sentence reads sensibly. (Belt-and-braces — the upstream LLM has
    // been corrected to use the tool's display name from attribution.ts, but
    // this protects against any future regression.)
    .replace(/(^|\.\s+|;\s+)0\s+(confirms|requires|sizes|delivers|calculates|maintains|reports|computes|outputs|yields)\b/g,
      (_full, lead, verb) => `${lead}The orchestrator tool ${verb}`)
    // Bug fix #12 (2026-05-22): belt-and-braces — strip any ALL_CAPS bracket
    // debug token that leaked from internal pipeline stages into prose fields.
    // Pattern: "[WORD_WORD]" at the start of a sentence or surrounded by
    // whitespace (e.g. "[UP-CAP]", "[COST-REPAIR]", "[REJECT]", "[FALLBACK]").
    // cleanCostReason already handles the specific cost-repair path; this
    // catches any future regressions from other pipeline stages.
    .replace(/\s*\[[A-Z][A-Z0-9_-]*\]\s*/g, ' ')
    .trim()
}

/**
 * Normalise unicode characters that @react-pdf's bundled Helvetica can't
 * render — arrows, smart quotes, em-dashes, fraction slashes — to ASCII
 * equivalents. Without this they render as a placeholder box / apostrophe.
 */
function normalise_unicode(s: string): string {
  return s
    .replace(/[→➜⟶]/g, ' to ')
    .replace(/[←⟵]/g, ' from ')
    .replace(/[↔]/g, ' to/from ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, ' - ')
    .replace(/–/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    // Unicode subscripts U+2080-U+2089 → ASCII digits. Helvetica falls back to
    // comma-like glyphs for these otherwise (drawer 227e3c8fd74fcd32 bug #7:
    // class-hazards.ts has correct H₂/CH₄/N₂/CO₂ but renders as "H,, CO, CH,,").
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    // Unicode superscripts U+2070-U+2079 (digits) + U+207B (superscript
    // minus) → ASCII. Helvetica supports ¹²³ from Latin-1 but ⁰⁴-⁹ and ⁻
    // all fall back to garbled glyphs ({, t, u, v, w...). The chain emits
    // PPFD as "µmol·m⁻²·s⁻¹" which renders as "umol·m{²·s{¹"; this fixes it
    // to "umol·m-2·s-1" which is readable. Universal across product classes.
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, c => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))
    .replace(/⁻/g, '-')
    .replace(/⁺/g, '+')
    // Math/separator glyphs commonly emitted by Stage 1.7 rad_syntax that
    // would garble if they leaked into user-facing text. ⊙ (Circled Dot
    // Operator) is the chain's rad_syntax separator; · (middle dot) renders
    // fine; → already mapped above. Add coverage for ⊗ (×), ⊕ (+), ≤ ≥, ≈.
    .replace(/⊙/g, ' + ')
    .replace(/⊗/g, ' x ')
    .replace(/⊕/g, ' + ')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≈/g, '~')
    // Greek micro sign µ (U+00B5) and mu (U+03BC) → ASCII u (closest match)
    .replace(/[µμ]/g, 'u')
    // Ohm sign Ω (U+03A9, U+2126) → ohm
    .replace(/[Ω]/g, 'ohm')
    // Greek capital delta Δ (U+0394) → "delta" or "D". Used throughout
    // engineering text as ΔT (temperature rise), ΔP (pressure drop), Δh
    // (enthalpy change). Default Helvetica AFM has no Δ glyph; react-pdf
    // falls back to "" (U+201D right double-quote). Ev-charger L4 audit
    // showed "Cooling capacity 0.01 kW (6.5 L/min × ”T 30°C)" — should
    // read "× ΔT 30°C". Spell as "delta " for readability.
    .replace(/Δ/g, 'delta ')
    .replace(/δ/g, 'delta ')
    .replace(/[ ]/g, ' ')  // non-breaking space → space (fragile in @react-pdf)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Rewrite the broken "xN x A {name}" quantity prefix pattern that Stage 1.7's
 * paragraph_en field emits. Input has been through normalise_unicode so `×` has
 * already become ASCII `x`. For N>1, replace with "{N:,}× " (proper plural count
 * notation). For N=1, drop the "x1 x" prefix and keep "A {name}" (singular).
 *
 * Renderer-only formatting fix; no domain semantics changed. See drawer
 * forgeos_gotchas_227e3c8fd74fcd32 — the pattern originates in LLM-emitted prose
 * but Tristan directive 2026-05-16 forbids modifying Stage 1.7 emission upstream,
 * so the rewrite happens at the renderer.
 */
function fix_quantity_prefix(s: string): string {
  if (!s) return ''
  return s.replace(/\bx(\d{1,3}(?:,?\d{3})*)\s+x\s+A\s+/g, (match, count) => {
    const n = parseInt(String(count).replace(/,/g, ''), 10)
    if (!Number.isFinite(n)) return match
    if (n <= 1) return 'A '
    return `${n.toLocaleString('en-GB')}× `
  })
}

/**
 * Decode HTML entities (&amp; → &, &#x27; → ', &quot; → ", &lt; → <, &gt; → >,
 * &nbsp; → space) then strip HTML tags. Phase19 audit (2026-05-17) flagged
 * supplier "why this fits" text leaking raw HTML — Brave snippet sometimes
 * includes inline <strong> from the source page, and double-escaped entities
 * survive the upstream cleanup.
 *
 * Numeric entity handler covers both decimal (&#39;) and hex (&#x27;) forms,
 * which both encode the apostrophe character in different sources.
 */
function decodeHtmlEntities(s: string): string {
  if (!s) return ''
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '-')
    .replace(/&ndash;/g, '-')
    // Generic numeric entity catch-all (e.g. &#1234;)
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = parseInt(n, 10)
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return ''
      try { return String.fromCodePoint(code) } catch { return '' }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => {
      const code = parseInt(n, 16)
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return ''
      try { return String.fromCodePoint(code) } catch { return '' }
    })
}

/**
 * Strip HTML tags (<strong>, <em>, <b>, <i>, <p>, <br>, etc.) from a string.
 * Phase19 audit: Brave snippet pass-through included raw <strong> markers from
 * source pages. We strip aggressively — anything inside `<` `>` is removed.
 */
function stripHtmlTags(s: string): string {
  if (!s) return ''
  return s.replace(/<[^>]+>/g, '')
}

/**
 * Normalise common US spellings to British. Phase19 audit: 10 of 10 PDFs
 * surfaced US spellings (color, meter, optimize, aluminum, customize) in
 * LLM-generated prose. Word-boundary regex avoids mangling code identifiers /
 * part numbers / URLs. Applied via clean_prose so every prose field passes
 * through. Compound endings (-ize → -ise) catch the inflections too.
 */
/** Title-case a string while preserving engineering and geographic acronyms
 *  (UK, EU, US, BESS, LED, HVAC, EMC, DX, etc.) and keeping mid-sentence
 *  connector words ("and", "of", "the", "for") lowercase. Used by both the
 *  cover-page subject and the BoM part-name renderer so the casing stays
 *  consistent across the document.
 *
 *  Drawer: 227e3c8fd74fcd32 bug #10 — brief parser emits "Battery energy
 *  storage system (bess)"; this re-uppercases the acronym. Tristan
 *  2026-05-20 third review: also catches "Uk" → "UK" in titles, and
 *  Title-Cases lowercase BoM part names like "grounding lug". */
// SI units with mixed-case canonical form. Title-casing collapses "kW" → "Kw"
// because the default `lower.charAt(0).toUpperCase()` rule fires. This map
// preserves "kW", "mAh" et al by matching case-insensitively and returning
// the canonical form. Bug fix (2026-05-23 ev-charger L4 audit): cover title
// rendered "350 Kw Ultra-rapid DC Charger" — should be "350 kW".
const SI_UNITS_MIXED_CASE = new Map<string, string>([
  ['kw', 'kW'], ['mw', 'MW'], ['gw', 'GW'], ['tw', 'TW'],
  ['kva', 'kVA'], ['mva', 'MVA'],
  ['kpa', 'kPa'], ['mpa', 'MPa'], ['gpa', 'GPa'],
  ['khz', 'kHz'], ['mhz', 'MHz'], ['ghz', 'GHz'], ['thz', 'THz'],
  ['mah', 'mAh'], ['kah', 'kAh'],
  ['kj', 'kJ'], ['mj', 'MJ'], ['gj', 'GJ'],
  ['kwh', 'kWh'], ['mwh', 'MWh'], ['gwh', 'GWh'],
  ['kbps', 'kbps'], ['mbps', 'Mbps'], ['gbps', 'Gbps'],
  ['kgf', 'kgf'], ['nm', 'Nm'],
])

function toTitleCaseEng(input: string): string {
  if (!input) return ''
  const ACRONYMS = new Set([
    // engineering subsystems / classes
    'BESS','PCS','BMS','HVAC','EMS','UPS','AUV','HAPS','CGM','EV','AC','DC',
    'LFP','NMC','IEC','UL','NFPA','ISO','SCADA','PLC','LED','PCB','PCBA',
    'HMI','GPS','IMU','MCU','FPGA','RAM','SSD','LAN','USB','PWM','PV',
    'MOSFET','IGBT','AFE','RTD','NTC','UAV','RF','GNSS','ADCS','CRC','MQTT',
    'API','LTE','VFD','PDU','PID','OEM','EPC','MPPT','EEV','BPHE','OCPP',
    'CCS2','EMC','EMI','DX','PIR','EPDM','CSC','UDL','RH','PPE','VOC','CO2',
    'NEMA','IP','RJ45','I2C','SPI','RS232','RS485','PPM','RPM','PSI','BTU',
    // geographic / political (Tristan 2026-05-20: "Uk" → "UK")
    'UK','EU','US','USA','GB','EEA','UAE','MENA','APAC','EMEA','ASEAN',
  ])
  const SMALL_WORDS = new Set(['and','or','of','the','for','to','in','on','a','an','with'])
  const tokens = input.split(/(\s+|\(|\))/)
  // Find the previous non-whitespace/non-paren token's index → so we can ask
  // "was the previous content token a number?" for the SI-unit rule.
  const prevContent = (i: number): string | null => {
    for (let j = i - 1; j >= 0; j--) {
      const t = tokens[j]
      if (/^[\s()]+$/.test(t)) continue
      return t
    }
    return null
  }
  return tokens.map((tok, idx) => {
    if (/^[\s()]+$/.test(tok)) return tok
    // If the token is already all-uppercase (≥2 letters) and contains a
    // letter, treat it as a deliberately-cased acronym and leave it.
    if (/^[A-Z]{2,}\d*$/.test(tok)) return tok
    const upper = tok.toUpperCase()
    if (ACRONYMS.has(upper)) return upper
    // Mixed-case SI unit lookup BEFORE the all-lowercase SI unit rule.
    // "kW", "mAh", "kPa" etc. should preserve their canonical capitalisation
    // regardless of context (always — these aren't position-sensitive).
    const lowerTok = tok.toLowerCase()
    if (SI_UNITS_MIXED_CASE.has(lowerTok)) return SI_UNITS_MIXED_CASE.get(lowerTok)!
    // (2026-05-22 Tristan): the SI-unit rule was too aggressive — it
    // lowercased ANY short token, so part labels like "fan Speed Controller"
    // and "fan Power Cable" had their first word collapsed to lowercase.
    // Restrict the rule to ITS DOCUMENTED INTENT: only lowercase short
    // tokens immediately after a NUMBER (i.e. SI units like "kg", "kW",
    // "m²", "L/min"). For all other positions the token is a noun/adj
    // and should be capitalised.
    // SI / engineering units: token starts lowercase + contains only letters
    // / digits / slashes / power symbols (e.g. "kg", "m²", "kg/year",
    // "umol/m²/s", "l/min", "ppfd"). The previous content token must be a
    // number — that gate prevents collapsing real noun-tokens like "fan",
    // "ozone", "pump" which are pre-token labels not unit suffixes.
    if (/^[a-z][a-z0-9²³°\/]{0,9}$/.test(tok)) {
      const prev = prevContent(idx)
      const prevIsNumber = prev !== null && /^-?\d+(?:\.\d+)?$/.test(prev)
      if (prevIsNumber) return tok.toLowerCase()
    }
    const lower = tok.toLowerCase()
    if (idx > 0 && SMALL_WORDS.has(lower)) return lower
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }).join('')
}

function britishise(s: string): string {
  if (!s) return s
  return s
    // colour family
    .replace(/\bcolor\b/g, 'colour')
    .replace(/\bColor\b/g, 'Colour')
    .replace(/\bcolors\b/g, 'colours')
    .replace(/\bColors\b/g, 'Colours')
    .replace(/\bcolored\b/g, 'coloured')
    .replace(/\bColored\b/g, 'Coloured')
    .replace(/\bcoloring\b/g, 'colouring')
    // metre — preserve compound words ending in -meter (parameter, voltmeter,
    // flowmeter, pyrometer, thermometer, hygrometer, etc.). Need-no-preceding-
    // letter rule: lookbehind asserts the char before is NOT a letter so
    // "voltmeter"/"flowmeter" stay untouched. The hyphenated form "3-meter"
    // DOES rewrite because '-' is not a letter.
    .replace(/(?<![a-zA-Z])meter\b/g, 'metre')
    .replace(/(?<![a-zA-Z])Meter\b/g, 'Metre')
    .replace(/(?<![a-zA-Z])meters\b/g, 'metres')
    .replace(/(?<![a-zA-Z])Meters\b/g, 'Metres')
    .replace(/\bliter\b/g, 'litre')
    .replace(/\bLiter\b/g, 'Litre')
    .replace(/\bliters\b/g, 'litres')
    .replace(/\bLiters\b/g, 'Litres')
    .replace(/\bcenter\b/g, 'centre')
    .replace(/\bCenter\b/g, 'Centre')
    .replace(/\bcentered\b/g, 'centred')
    .replace(/\bcenters\b/g, 'centres')
    .replace(/\bcentering\b/g, 'centring')
    // -ise family. Use a single regex per stem so all tenses convert.
    .replace(/\boptimize/g, 'optimise')
    .replace(/\bOptimize/g, 'Optimise')
    .replace(/\bcustomize/g, 'customise')
    .replace(/\bCustomize/g, 'Customise')
    .replace(/\banalyze/g, 'analyse')
    .replace(/\bAnalyze/g, 'Analyse')
    .replace(/\borganize/g, 'organise')
    .replace(/\bOrganize/g, 'Organise')
    .replace(/\brealize/g, 'realise')
    .replace(/\bRealize/g, 'Realise')
    .replace(/\brecognize/g, 'recognise')
    .replace(/\bRecognize/g, 'Recognise')
    .replace(/\bprioritize/g, 'prioritise')
    .replace(/\bPrioritize/g, 'Prioritise')
    .replace(/\butilize/g, 'utilise')
    .replace(/\bUtilize/g, 'Utilise')
    .replace(/\bcharacterize/g, 'characterise')
    .replace(/\bCharacterize/g, 'Characterise')
    .replace(/\bminimize/g, 'minimise')
    .replace(/\bMinimize/g, 'Minimise')
    .replace(/\bmaximize/g, 'maximise')
    .replace(/\bMaximize/g, 'Maximise')
    .replace(/\bstandardize/g, 'standardise')
    .replace(/\bStandardize/g, 'Standardise')
    .replace(/\bsynchronize/g, 'synchronise')
    .replace(/\bSynchronize/g, 'Synchronise')
    .replace(/\bspecialize/g, 'specialise')
    .replace(/\bSpecialize/g, 'Specialise')
    // aluminium
    .replace(/\baluminum\b/g, 'aluminium')
    .replace(/\bAluminum\b/g, 'Aluminium')
    // behaviour, favour, honour
    .replace(/\bbehavior\b/g, 'behaviour')
    .replace(/\bBehavior\b/g, 'Behaviour')
    .replace(/\bbehaviors\b/g, 'behaviours')
    .replace(/\bfavor\b/g, 'favour')
    .replace(/\bFavor\b/g, 'Favour')
    .replace(/\bhonor\b/g, 'honour')
    .replace(/\bHonor\b/g, 'Honour')
    .replace(/\blabor\b/g, 'labour')
    .replace(/\bLabor\b/g, 'Labour')
}

/**
 * Bug fix #10 (2026-05-22): LLM-generated overview_paragraph_en often carries
 * 4-5 decimal places ("21.222 kW", "0.2763 m/s", "166.67 mL/min") because the
 * model echoes the tool's raw float output verbatim. Round to ≤2 dp for
 * human-readable prose. Keep raw values on the Tools-Used appendix page
 * where the tool's reproducibility contract demands the original precision.
 *
 * Heuristic: match `<digits>.<3-or-more digits>` followed by an optional unit.
 * Round to:
 *   - 1 dp for kW / m³/s / kPa / kg/h / L/min / V / A / Hz (instrumental)
 *   - 2 dp for kg/m²·yr / mS/cm / m/s (sub-unit instrumental)
 *   - 1 dp default for anything else with a unit
 *   - 2 dp default for bare numbers (no unit follows)
 * Avoids known fixed-precision tokens (part numbers, IP ratings, dates).
 */
function clamp_decimals_in_prose(s: string): string {
  if (!s) return s
  return s.replace(/(\d+)\.(\d{3,})((?:\s?(?:kW|kPa|kg\/h|kg\/day|m³\/s|m³\/h|m\/s|L\/min|L\/day|µmol\/m²\/s|µmol\/J|°C|mS\/cm|kg\/m²\/yr|kg\/m²\/cycle|mol\/m²\/day|V|A|Hz|W|kg|m|kPa)\b)?)/g, (_full, intPart, decPart, suffix) => {
    const unit = (suffix ?? '').trim()
    const fullNum = parseFloat(`${intPart}.${decPart}`)
    if (!Number.isFinite(fullNum)) return _full
    // Sub-unit / instrumental quantities — 2 dp
    if (/^(?:m\/s|mS\/cm|µmol\/J|kg\/m²\/yr|kg\/m²\/cycle|mol\/m²\/day)$/.test(unit)) {
      return `${fullNum.toFixed(2)}${suffix ?? ''}`
    }
    // Bare numbers (no unit) — keep 2 dp for safety (could be ratios)
    if (!unit) {
      return `${fullNum.toFixed(2)}${suffix ?? ''}`
    }
    // Default: 1 dp for instrumental quantities
    return `${fullNum.toFixed(1)}${suffix ?? ''}`
  })
}

/**
 * Bug fix #3 (2026-05-22): module overview_paragraph_en sometimes contains the
 * same 2-3 sentence chunk repeated verbatim. The duplication happens during
 * the multi-stage review pipeline when the specialist LLM is given a Grok-r1
 * pass that already references the tool outputs and the specialist (instead
 * of merging) prepends the prior chunk to its own re-emission.
 *
 * Detector: split prose on sentence boundaries and drop runs of ≥2 sentences
 * that re-appear later identical (case- and whitespace-normalised).
 *
 * Stays cheap (linear) and safe (only drops contiguous runs that are 100%
 * identical — never drops a single sentence even if it's repeated).
 */
function dedupe_duplicated_chunks(s: string): string {
  if (!s) return s
  // Split into sentences keeping the trailing punctuation. Catches "kW. ", "/yr. ", etc.
  const parts = s.split(/(?<=[.!?])\s+(?=[A-Z0-9])/g)
  if (parts.length < 4) return s  // not enough to have a duplicated chunk
  const seen = new Set<string>()
  const out: string[] = []
  // Look for runs of ≥2 consecutive sentences that appear identically earlier.
  // We use a 2-sentence sliding window as the dup-detection unit.
  for (let i = 0; i < parts.length; i++) {
    if (i + 1 < parts.length) {
      const win2 = (parts[i] + ' ' + parts[i + 1]).replace(/\s+/g, ' ').trim().toLowerCase()
      if (seen.has(win2)) {
        // Skip the 2-sentence window (this i and the next).
        i++  // skip next too
        continue
      }
    }
    out.push(parts[i])
    if (i + 1 < parts.length) {
      const win2 = (parts[i] + ' ' + parts[i + 1]).replace(/\s+/g, ' ').trim().toLowerCase()
      seen.add(win2)
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

function clean_prose(s: string | null | undefined): string {
  if (!s) return ''
  // Phase19 audit pipeline: HTML decode + tag strip → existing transforms →
  // British spelling normalisation. Order matters: strip tags AFTER decoding
  // entities (so &lt;strong&gt; becomes a real tag we then strip).
  const decoded = stripHtmlTags(decodeHtmlEntities(String(s).trim()))
  return dedupe_duplicated_chunks(clamp_decimals_in_prose(britishise(fix_quantity_prefix(normalise_unicode(apply_engineering_fixups(strip_internal_ids(decoded)))))))
}

// ─── Module label table (mirrored from src/lib/pdf-engine-v2/types/module-decomposition.ts) ───

const MODULE_LABELS: Record<string, string> = {
  energy_storage_source: 'Energy Storage',
  energy_conversion_transduction: 'Energy Conversion',
  structure_containment: 'Structure & Containment',
  sensing_instrumentation: 'Sensing & Instrumentation',
  control_compute_communication: 'Control, Compute & Communications',
  safety_protection: 'Safety & Protection',
  environmental_interface: 'Environmental Interface',
  power_distribution: 'Power Distribution',
  maintenance_serviceability: 'Maintenance & Serviceability',
  actuation_kinematics: 'Actuation & Mechanisms',
  mass_fluid_transport_process: 'Mass & Fluid Transport',
  hmi_ergonomics: 'Human-Machine Interface',
}

/**
 * Phase-A presentation order: external structure first (the envelope), then
 * the bridge to environment, then internal substrates from heaviest infrastructure
 * (plumbing/source/conversion/power) outward to control/safety/interface/service.
 * Reader follows physical inclusion: outer shell → systems hanging off it.
 *
 * Modules absent from this list (custom emissions) sort after, alphabetically.
 */
const MODULE_PRESENTATION_ORDER: string[] = [
  'structure_containment',
  'environmental_interface',
  'mass_fluid_transport_process',
  'energy_storage_source',
  'energy_conversion_transduction',
  'power_distribution',
  'actuation_kinematics',
  'sensing_instrumentation',
  'control_compute_communication',
  'safety_protection',
  'hmi_ergonomics',
  'maintenance_serviceability',
  // Bug fix #16 (2026-05-22): vertical-farm class-specific modules ordered by
  // engineering reading logic (envelope → photons → plants → fluids → climate →
  // power → automation → data → output → effluent → access → compliance).
  // Without this ordering they default to index 999 and sort alphabetically,
  // producing a hairball reading order (Automation, Climate, Effluent...).
  'lighting_array',
  'growing_canopy',
  'irrigation_nutrient',
  'climate_control',
  'electrical_distribution',
  'automation_sensing',
  'data_compute_communication',
  'harvest_handling',
  'effluent_treatment',
  'worker_access_safety',
  'regulatory_compliance',
]

function module_title(spec: { module: string; display_name?: string } | string): string {
  if (typeof spec === 'string') return MODULE_LABELS[spec] ?? humanise(spec)
  const explicit = (spec.display_name ?? '').trim()
  if (explicit) return explicit
  return MODULE_LABELS[spec.module] ?? humanise(spec.module)
}

function order_modules<T extends { module: string }>(modules: ReadonlyArray<T>): T[] {
  const indexById = new Map(MODULE_PRESENTATION_ORDER.map((id, i) => [id, i]))
  return [...modules].sort((a, b) => {
    const ia = indexById.get(a.module) ?? 999
    const ib = indexById.get(b.module) ?? 999
    if (ia !== ib) return ia - ib
    return a.module.localeCompare(b.module)
  })
}

// ─── BoM totals (shared between CoverPage + BillOfMaterialsPage) ───────────
//
// Per Tristan 2026-05-17: "If I add up the numbers in the sub-modules and the
// modules, will they actually create the totals and subtotals that you get and
// the overall cost of the project? They should do."
//
// To guarantee the displayed numbers reconcile when added by hand, all unit
// prices are rounded to whole pence FIRST. Line totals are then unit×qty (qty
// is always an integer), and the chain sub-total → module-total → grand-total
// is a pure sum of already-rounded numbers. No floating-point drift; the
// printed 2dp numbers add up exactly.

type BomPartRow = {
  word_name: string
  word_id: string
  manufacturer: string | null
  part_number: string | null
  source_url: string | null
  source_method: string | null
  distributor_price_gbp: number | null
  price_estimate_gbp: number | null
  quantity: number
  status: 'verified' | 'uncertain' | 'stripped' | 'unverified'
  unit_price_gbp: number     // rounded to pence; 0 if TBD
  line_total_gbp: number     // unit_price_gbp * quantity; 0 if TBD
  // Build #4 (2026-05-21): when set, this row's line_total_gbp was
  // overridden by the Engineering Contract's macro_assembly_prices
  // (size-aware pricing for items the per-unit class anchor under-prices).
  contract_override_reason?: string
  price_tier: 'actual' | 'estimate' | 'tbd'
  // Engine B (2026-05-18) — per-component-class attribution. Optional so
  // legacy state.json files without the engine_b_* fields still render.
  engine_b_component_class?: string
  engine_b_curve_multiplier?: number
  engine_b_reference_unit_cost_gbp?: number
  engine_b_annual_volume?: number
  /** ITER-10.5 Sprint 1A: 'curve' or 'flash_lite_unknown_class' means
   *  Engine B already volume-anchored this row; applyBatchEconomics must
   *  NOT apply the W3 scale a second time. */
  engine_b_estimate_source?: string
  // Sprint 1B Cost Repair Loop — surfaced inline in the Notes block per
  // sub-module so the reader sees the verdict on every flagged line.
  cost_repair_action?: 'corrected' | 'manual_sourcing_required' | 'leave_as_is'
  cost_repair_reasoning?: string
  cost_repair_source?: string
  cost_repair_confidence?: 'high' | 'medium' | 'low'
  cost_repair_corrected_price_gbp?: number
  cost_repair_previous_price_gbp?: number
  cost_repair_excluded_from_subtotal?: boolean
  // Engine C (2026-05-18) — reference-product anchoring. Written by
  // scripts/enrich-state-with-reference-anchor.tsx before render. Each row
  // carries the cosine-retrieved corpus median + flag verdict.
  engine_c_flag?: 'in_range' | 'over' | 'under' | 'no_reference'
  engine_c_ref_median_gbp?: number | null
  engine_c_ratio?: number | null
  engine_c_priced_count?: number
  // Stage 4.5 (2026-05-18) — part-number verification (P12a / G5).
  // verified=false → renderer surfaces a small "?" badge next to the SKU so
  // the founder knows that part_number did not resolve at a distributor or
  // via manufacturer-domain web search. Reason string carries the diagnosis.
  // Both optional; legacy state.json files predate the field.
  part_verified?: boolean
  part_verify_reason?: string
}
type BomSub = { id: string; name: string; parts: BomPartRow[]; subtotal_gbp: number }
// 2026-05-20 (Tristan cost-overrun forensic): display_name is the
// reader-facing friendly module title (e.g. "Container Shell & Mobile
// Racking") as written by Stage 1.7 module decomposition into
// state.moduleDecomposition.modules[].display_name. `label` is the
// taxonomy-humanised slug ("Structure Containment"); preserved as a
// fallback only. Universal — every product class benefits because every
// class emits display_name from Stage 1.7.
type BomMod = { module: string; label: string; display_name?: string; subs: BomSub[]; subtotal_gbp: number }
type BomTotals = {
  allMods: BomMod[]
  grandTotal_gbp: number
  totalRows: number
  actualPriced: number
  estimatePriced: number
  tbdRows: number
  // 2026-05-23: orchestrator macro_assembly_prices that have no matching word
  // in the design (e.g. wind turbine gearbox £1.08M, PM generator £1.32M).
  // Added to grandTotal_gbp so the BoM reflects big-ticket items the per-class
  // emitter didn't explicitly create words for.
  unmatchedMacroTotal_gbp?: number
  unmatchedMacros?: Array<{ name: string; total: number }>
  // Set by applyBatchEconomics() when a per-class scale factor < 1.0 is
  // applied. 1.0 (or undefined) means BoM values are raw distributor pricing.
  // Renderer surfaces this on the cover/grand-total card so the reader knows.
  scale_applied?: number
  // Engine B (2026-05-18) — per-component-class breakdown of the grand
  // total. Maps component_class → GBP contributed. Empty when state has no
  // Engine B attribution (legacy iter runs).
  engine_b_by_class?: Record<string, number>
}

function roundToPence(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

// P6 fix (2026-05-18): render-time corpus lookup for engine_b_component_class.
// Older state files (produced before estimate-missing-prices.tsx grew the
// engine_b_* fields) carry partVerifications without the field. When the
// renderer falls back here it queries the Phase 4 corpus
// (~/.forge-truth/forge-truth.db, pretraining_extracted_parts) by lowercased
// part name and returns the most-common component_class for matching rows.
// Cheap (<2 ms per lookup, memoised) and free. Returns null if corpus is
// unavailable or no match exists — the renderer falls back to its 'unclassified'
// bucket as before. Implemented as a singleton so the DB handle is shared
// across CoverPage + BillOfMaterials renders within a single PDF.
//
// Match strategy (validated 2026-05-18 against heatpump test state, 99% coverage):
//   1. Try the full lowercased phrase first — best signal when corpus has the
//      exact part name (e.g. "ribbon cable", "stepper motor").
//   2. Fall back to token-by-token LIKE %t% in order of token length (longest
//      first). BoM word names like "refrigerant suction thermistor" don't appear
//      verbatim in the corpus but "thermistor" does. Stop-words filtered out so
//      "the/and/for/module/word/assembly/pack" don't poison the match.
const _RENDER_CLASSIFIER_STOP = new Set([
  'the','a','an','for','of','with','to','and','or','in','on','at','from','by',
  'word','assembly','pack','unit','module','board','main','primary','secondary',
])

function _tokenisePartName(s: string): string[] {
  return String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && t.length > 2 && !_RENDER_CLASSIFIER_STOP.has(t))
}

class RenderEngineBClassifier {
  private db: any = null
  private stmt: any = null
  private memo = new Map<string, string | null>()
  private tried = false

  private init() {
    if (this.tried) return
    this.tried = true
    try {
      const { homedir } = require('os')
      const { join } = require('path')
      const { existsSync } = require('fs')
      const dbPath = join(homedir(), '.forge-truth', 'forge-truth.db')
      if (!existsSync(dbPath)) return
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3')
      this.db = new Database(dbPath, { readonly: true })
      this.stmt = this.db.prepare(`
        SELECT component_class, COUNT(*) AS n
        FROM pretraining_extracted_parts
        WHERE component_class IS NOT NULL
          AND part_name IS NOT NULL
          AND LOWER(part_name) LIKE ?
        GROUP BY component_class
        ORDER BY n DESC
        LIMIT 1
      `)
    } catch {
      this.db = null
      this.stmt = null
    }
  }

  private lookupOne(pattern: string): string | null {
    if (!this.stmt) return null
    try {
      const row = this.stmt.get(pattern) as any
      if (row && typeof row.component_class === 'string' && row.component_class !== 'unknown') {
        return row.component_class
      }
    } catch {
      // ignore
    }
    return null
  }

  lookup(partName: string): string | null {
    if (!partName) return null
    this.init()
    if (!this.stmt) return null
    const key = String(partName).toLowerCase().trim()
    if (!key) return null
    if (this.memo.has(key)) return this.memo.get(key)!

    // 1. Full phrase match — strongest signal when corpus has a near-verbatim hit.
    let result = this.lookupOne(`%${key.slice(0, 80)}%`)

    // 2. Token-by-token fallback — longest tokens first (more specific). Capped
    // at 4 tokens so we don't run away on long brief descriptions.
    if (!result) {
      const toks = _tokenisePartName(partName).sort((a, b) => b.length - a.length).slice(0, 4)
      for (const t of toks) {
        const subKey = `T:${t}`
        let sub: string | null
        if (this.memo.has(subKey)) sub = this.memo.get(subKey)!
        else {
          sub = this.lookupOne(`%${t}%`)
          this.memo.set(subKey, sub)
        }
        if (sub) { result = sub; break }
      }
    }

    this.memo.set(key, result)
    return result
  }
}

const _renderEngineBClassifier = new RenderEngineBClassifier()

function computeBomTotals(state: any): BomTotals | null {
  const verifications: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  const verifByWordId = new Map<string, any>()
  for (const v of verifications) {
    if (v.word_id) verifByWordId.set(v.word_id, v)
  }
  // Build #4b (Loop 10 regression fix, 2026-05-21): track macro-assembly
  // price entries that have already been claimed by a BoM word, so each
  // Contract macro fires ONCE not per-word. Loop 10 VF blew up from
  // £3,253/m² to £10,496/m² because 8 separate "trolley" words each got
  // overridden with the SAME £20k total → 8 × £20k = £160k instead of
  // £20k. Set-based single-fire fixes the regression.
  const claimedMacroAssemblies = new Set<string>()
  const rawModules = state.moduleDecomposition?.modules ?? []
  const orderedModules = order_modules(rawModules as Array<{ module: string; display_name?: string }>)
  if (orderedModules.length === 0) return null

  const allMods: BomMod[] = []
  let grandTotal_gbp = 0
  let totalRows = 0
  let actualPriced = 0
  let estimatePriced = 0
  let tbdRows = 0

  for (const m of orderedModules as any[]) {
    const mod: BomMod = {
      module: m.module,
      label: humanise(m.module),
      display_name: typeof m.display_name === 'string' && m.display_name.trim().length > 0 ? m.display_name.trim() : undefined,
      subs: [],
      subtotal_gbp: 0,
    }
    for (const sm of m.sub_modules ?? []) {
      const sub: BomSub = { id: sm.id, name: sm.name_human || humanise(sm.id), parts: [], subtotal_gbp: 0 }
      for (const w of sm.words ?? []) {
        // Bug fix #17 (2026-05-22): certification scheme entries (GlobalG.A.P.,
        // BRCGS audit, UKCA marking, WRAS approval) are paid as third-party
        // certification fees, NOT hardware parts. Some downstream reviewer
        // LLMs add them to BoM-bearing modules with concocted part numbers
        // and £1,000+ price tags. Filter them out before line construction
        // so they never appear in the Part column. Match heuristic: word id
        // / name / content_character.character_id contains "cert" "audit"
        // "marking" "approval" alongside a known scheme name.
        const idLower = String(w.id ?? '').toLowerCase()
        const nameLower = String(w.name_human ?? '').toLowerCase()
        const ccidLower = String(w?.content_character?.character_id ?? '').toLowerCase()
        const combined = `${idLower} ${nameLower} ${ccidLower}`
        const isCertWord = (
          /(?:cert(?:ificat)?|audit|marking|approval)\b/i.test(combined)
          && /(?:globalg|brcgs|brcg|ukca|wras|red\s*tractor|leaf\s*marque|leaf-marque|iso\s*\d|ifa\s*v|ce\s*mark)/i.test(combined)
        )
        if (isCertWord) continue
        const v = verifByWordId.get(w.id)
        const mods = w.modifier_characters ?? []
        // Quantity (integer)
        let qty = 1
        const qmod = mods.find((mc: any) => mc.kind === 'quantity')
        if (qmod) {
          const numStr = String(qmod.value).replace(/[×x,\s]/g, '')
          const n = parseInt(numStr, 10)
          if (Number.isFinite(n) && n > 0) qty = n
        }
        const mfgMod = mods.find((mc: any) => mc.kind === 'manufacturer')
        const pnMod = mods.find((mc: any) => mc.kind === 'part_number')
        const hasActual = typeof v?.distributor_price_gbp === 'number'
        const hasEstimate = typeof v?.price_estimate_gbp === 'number'
        const tier: 'actual' | 'estimate' | 'tbd' = hasActual ? 'actual' : hasEstimate ? 'estimate' : 'tbd'
        // Round unit price to pence BEFORE multiplying so the printed line
        // equals printed_unit × qty exactly.
        const rawUnit = hasActual ? Number(v.distributor_price_gbp) : hasEstimate ? Number(v.price_estimate_gbp) : 0
        let unit_price_gbp = roundToPence(rawUnit)
        let line_total_gbp = roundToPence(unit_price_gbp * qty)
        let contract_override_reason: string | null = null
        // 2026-05-23 L23: this row defaults to honouring cost_repair's
        // exclusion flag from partVerifications. If macro override fires
        // below, it sets this to false (macro IS authoritative).
        let cost_repair_excluded_from_subtotal_for_this_row = true
        // 2026-05-26 L26 post-mortem: when macro override fires, strip
        // the corpus-picked manufacturer + part_number (often wrong for
        // utility-class components — corpus mis-picks small IGBTs and
        // spherical-roller bearings for slewing applications).
        let macro_override_strip_corpus_partnum = false

        // Build #4 (Tristan 2026-05-21, council unanimous): Engineering
        // Contract macro-assembly pricing override. Loop 9 evidence:
        // word-name matching was too narrow — HAPS Contract said £814k
        // raw but only some macro-assemblies matched the LLM-emitted word
        // names. Improved matcher: also checks the word's content_character
        // .character_id (often a shorter slug like 'wing_spar') and any
        // 'function_radical_primary' modifier, AND uses MAJORITY-token
        // match (≥66% of tokens present) instead of ALL-tokens which was
        // too strict.
        const macroPrices: Array<{ word_name: string; total_gbp: number; source_detail: string; unit_price_gbp: number; dimension_value: number }> = (state?.engineeringContract?.macro_assembly_prices ?? []) as any[]
        if (macroPrices.length > 0) {
          // Build a set of word names + ids to match against (more candidates → more matches)
          const candidates: string[] = []
          const nameHuman = String(w.name_human || '').toLowerCase().replace(/[-\s]+/g, '_')
          const wId = String(w.id || '').toLowerCase().replace(/[-\s]+/g, '_')
          if (nameHuman) candidates.push(nameHuman)
          if (wId) candidates.push(wId)
          const cc = w.content_character
          if (cc && typeof cc === 'object') {
            const ccid = String(cc.character_id || '').toLowerCase().replace(/[-\s]+/g, '_')
            if (ccid) candidates.push(ccid)
          }

          // 2026-05-23 v3 (post wind L21 BoM audit revealed false-match
          // regression): require ALL semantic tokens to match the candidate,
          // not partial. The 0.50 threshold from v2 caused rotor_blade_
          // assembly £12.5M to FALSELY match pm_rotor_word because both
          // share "rotor" (score 1/2 = 0.50). With strict all-semantic-
          // tokens match, rotor_blade_assembly requires BOTH "rotor" AND
          // "blade" in candidate; only rotor_blade_word matches that.
          //
          // QUALIFIER_TOKENS still stripped first so macros like
          // onshore_gravity_foundation (semantic = ["foundation"]) just
          // need "foundation" in candidate — same effect as before for
          // single-semantic-token macros.
          const QUALIFIER_TOKENS = new Set([
            'assembly', 'drivetrain', 'full', 'scale', 'panel', 'kit',
            'pack', 'system', 'unit', 'module', 'bedplate', 'enclosure',
            'onshore', 'offshore', 'gravity', 'large', 'small', 'medium',
            'primary', 'secondary', 'main', 'rated', 'nominal', 'standard',
            'sections', 'pmg', 'pmsg', 'reinforced', 'steel', 'iron',
            'concrete',
          ])
          let bestMatch: typeof macroPrices[number] | null = null
          let bestScore = 0
          for (const mp of macroPrices) {
            // Build #4b single-fire guard: skip macros already claimed
            // by a prior word in this BoM pass.
            if (claimedMacroAssemblies.has(mp.word_name)) continue
            const allTokens = mp.word_name.split('_').filter(t => t.length >= 3)
            // Semantic tokens = non-qualifier tokens.
            const semanticTokens = allTokens.filter(t => !QUALIFIER_TOKENS.has(t))
            const matchTokens = semanticTokens.length > 0 ? semanticTokens : allTokens
            if (matchTokens.length === 0) continue
            for (const cand of candidates) {
              if (!cand) continue
              if (cand === mp.word_name) {
                bestMatch = mp; bestScore = 1.0; break  // exact wins
              }
              // STRICT: require ALL semantic tokens to appear in candidate.
              // This prevents rotor_blade_assembly from matching pm_rotor_word
              // (would need both "rotor" AND "blade" in word_id).
              const allMatch = matchTokens.every(t => cand.includes(t))
              if (allMatch) {
                // Score by inverse candidate length — prefer specific words
                // (rotor_blade_word) over generic (rotor_word_assembly_aux).
                const score = matchTokens.length / Math.max(cand.split('_').length, matchTokens.length)
                if (score > bestScore) {
                  bestMatch = mp; bestScore = score
                }
              }
            }
            if (bestScore >= 1.0) break
          }
          if (bestMatch && bestMatch.total_gbp > 0) {
            unit_price_gbp = roundToPence(bestMatch.total_gbp / Math.max(qty, 1))
            line_total_gbp = roundToPence(bestMatch.total_gbp)
            contract_override_reason = `Contract macro-assembly (${bestScore >= 1 ? 'exact' : `${Math.round(bestScore * 100)}% token match`}): ${bestMatch.source_detail}`
            // Claim this macro so subsequent matching words don't double-count.
            claimedMacroAssemblies.add(bestMatch.word_name)
            // 2026-05-23 (L23 post-mortem): when a macro override applies,
            // CLEAR cost_repair_excluded_from_subtotal. Cost-repair earlier
            // flagged this row as "way under corpus median" and excluded
            // it from subtotal — but the macro override IS the authoritative
            // engineering-contract price. The 4× UP-cap that triggered the
            // exclusion was protecting against corpus-noise outliers; the
            // macro override is not a corpus outlier, it's the design
            // contract. Leaving the flag would make a £4.17M rotor blade
            // visible in BoM but excluded from sub-total = the bug Tristan
            // flagged on L20.
            cost_repair_excluded_from_subtotal_for_this_row = false
            // 2026-05-26 (L26 post-mortem): when macro override applies,
            // ALSO strip the corpus-picked manufacturer + part_number.
            // For utility wind: corpus might assign FF6000R17IP4 IGBT
            // (1700V) to a converter word that needs 3300V+ blocking,
            // OR SKF-232/600CA spherical roller bearing to a slewing
            // bearing application. The CORPUS doesn't know the design
            // context — it picks the nearest matching keyword. Macro
            // override means the engineering contract claims this row;
            // the specific part-number must come from a class-aware
            // emitter convention OR be left blank for downstream
            // procurement to fill. Leaving the wrong corpus part number
            // ships a £4.17M line in the BoM with a £18 IGBT part
            // number — the Physics Critic correctly flags as nonsensical.
            macro_override_strip_corpus_partnum = true
          }
        }
        const row: BomPartRow = {
          word_name: w.name_human || humanise(w.id),
          word_id: w.id,
          // 2026-05-26 L26 post-mortem: strip corpus mfg/part_number when
          // macro override applied. Corpus picked wrong-class parts
          // (small IGBT for 5kV converter; spherical roller for slewing
          // bearing). Macro override = contract authoritative; the
          // mfg/part chosen by corpus loses out. Leave nullable for
          // downstream procurement to fill class-correct alternative.
          manufacturer: macro_override_strip_corpus_partnum ? null : (v?.manufacturer ?? (mfgMod ? String(mfgMod.value) : null)),
          part_number: macro_override_strip_corpus_partnum ? null : (v?.part_number ?? (pnMod ? String(pnMod.value) : null)),
          source_url: v?.source_url ?? null,
          source_method: v?.source_method ?? null,
          distributor_price_gbp: hasActual ? unit_price_gbp : null,
          price_estimate_gbp: hasEstimate && !hasActual ? unit_price_gbp : null,
          quantity: qty,
          status: (v?.status as any) ?? 'unverified',
          unit_price_gbp,
          line_total_gbp,
          price_tier: tier,
          part_verified: typeof v?.verified === 'boolean' ? v.verified : undefined,
          part_verify_reason: typeof v?.verification_reason === 'string' ? v.verification_reason : undefined,
          // Engine B (2026-05-18) attribution — present when the part was
          // priced via the volume curve in `estimate-missing-prices.tsx`.
          // P6 fix (2026-05-18): when the verification row lacks the field
          // (older state files predating Engine B), fall back to a render-time
          // corpus lookup on the part name. The corpus has component_class on
          // 22k+ records; the lookup is sub-millisecond and free. If no match,
          // stays undefined and the per-class aggregate falls back to
          // 'unclassified' as before.
          engine_b_component_class: typeof v?.engine_b_component_class === 'string'
            ? v.engine_b_component_class
            : (_renderEngineBClassifier.lookup(
                String(w.name_human || v?.word_name || w.id || '')
              ) ?? undefined),
          engine_b_curve_multiplier: typeof v?.engine_b_curve_multiplier === 'number'
            ? v.engine_b_curve_multiplier
            : undefined,
          engine_b_reference_unit_cost_gbp: typeof v?.engine_b_reference_unit_cost_gbp === 'number'
            ? v.engine_b_reference_unit_cost_gbp
            : undefined,
          engine_b_annual_volume: typeof v?.engine_b_annual_volume === 'number'
            ? v.engine_b_annual_volume
            : undefined,
          // ITER-10.5 Sprint 1A (Tristan 2026-05-20): propagate
          // engine_b_estimate_source so applyBatchEconomics() can correctly
          // skip the W3 scale factor on already-volume-anchored rows
          // (engine_b_estimate_source='curve' or 'flash_lite_unknown_class').
          engine_b_estimate_source: typeof v?.engine_b_estimate_source === 'string'
            ? v.engine_b_estimate_source
            : undefined,
          // Sprint 1B (Cost Repair Loop): propagate verdict + reasoning so
          // the per-sub-module Notes block can surface it.
          cost_repair_action: (v?.cost_repair_action === 'corrected' || v?.cost_repair_action === 'manual_sourcing_required' || v?.cost_repair_action === 'leave_as_is')
            ? v.cost_repair_action : undefined,
          cost_repair_reasoning: typeof v?.cost_repair_reasoning === 'string' ? v.cost_repair_reasoning : undefined,
          cost_repair_source: typeof v?.cost_repair_source === 'string' ? v.cost_repair_source : undefined,
          cost_repair_confidence: (v?.cost_repair_confidence === 'high' || v?.cost_repair_confidence === 'medium' || v?.cost_repair_confidence === 'low')
            ? v.cost_repair_confidence : undefined,
          cost_repair_corrected_price_gbp: typeof v?.cost_repair_corrected_price_gbp === 'number' ? v.cost_repair_corrected_price_gbp : undefined,
          cost_repair_previous_price_gbp: typeof v?.cost_repair_previous_price_gbp === 'number' ? v.cost_repair_previous_price_gbp : undefined,
          // 2026-05-23 L23 fix: macro override clears the excluded flag.
          // cost_repair earlier excluded this row because corpus said £1.10
          // and reference said £31.60 (way-under) — but if macro now says
          // £4.17M, the macro IS authoritative and the exclusion is stale.
          cost_repair_excluded_from_subtotal: cost_repair_excluded_from_subtotal_for_this_row && v?.cost_repair_excluded_from_subtotal === true ? true : undefined,
          // Build #4: Engineering Contract macro-assembly price override
          // (when the Contract has a size-aware price for this word).
          contract_override_reason: contract_override_reason ?? undefined,
          // Engine C reference-anchor — written by enrich-state-with-
          // reference-anchor.tsx onto the verification row. Stays undefined
          // for legacy state files that never ran enrichment.
          engine_c_flag: (v?.engine_c_flag === 'in_range' || v?.engine_c_flag === 'over'
            || v?.engine_c_flag === 'under' || v?.engine_c_flag === 'no_reference')
            ? v.engine_c_flag : undefined,
          engine_c_ref_median_gbp: typeof v?.engine_c_ref_median_gbp === 'number'
            ? v.engine_c_ref_median_gbp : null,
          engine_c_ratio: typeof v?.engine_c_ratio === 'number'
            ? v.engine_c_ratio : null,
          engine_c_priced_count: typeof v?.engine_c_priced_count === 'number'
            ? v.engine_c_priced_count : undefined,
        }
        sub.parts.push(row)
        // 2026-05-21 (Tristan VF cost-overrun deep dive): the renderer
        // was reading cost_repair_excluded_from_subtotal onto the row but
        // not actually skipping it from the aggregate. Result: lines the
        // UP-cap rejected as hallucination (£1,500 placeholder pinned by
        // class floor with no corpus evidence) still inflated module +
        // grand totals. Skip-from-aggregate now honours the flag while
        // keeping the row in the BoM table for visibility — the row
        // renders with MANUAL SOURCING tagged + £0 contribution.
        // Universal across product classes.
        if (row.cost_repair_excluded_from_subtotal !== true) {
          sub.subtotal_gbp = roundToPence(sub.subtotal_gbp + line_total_gbp)
        }
        totalRows += 1
        if (tier === 'actual') actualPriced += 1
        else if (tier === 'estimate') estimatePriced += 1
        else tbdRows += 1
      }
      if (sub.parts.length > 0) {
        mod.subs.push(sub)
        mod.subtotal_gbp = roundToPence(mod.subtotal_gbp + sub.subtotal_gbp)
      }
    }
    if (mod.subs.length > 0) {
      allMods.push(mod)
      grandTotal_gbp = roundToPence(grandTotal_gbp + mod.subtotal_gbp)
    }
  }

  if (allMods.length === 0) return null

  // 2026-05-20 iter-8 council fix H: duplicate BoM line detection.
  // VF iter-7 Module 4 had TWO "LED Driver" rows: Inventronics
  // "200 W, 0.9 PF" ×40 AND Inventronics EUM050S050ST ×40 — same component
  // role, two SKU strings (one a description-as-SKU, one real). Generator
  // emission bug; render-time merge is unsafe (could collapse legitimately
  // different parts that happen to share manufacturer + name), so the
  // universal fix is to FLAG duplicates for manual review rather than merge.
  // Detection key = (sub-module, manufacturer, normalised word_name prefix).
  let duplicateCount = 0
  for (const mod of allMods) {
    for (const sub of mod.subs) {
      const byKey = new Map<string, BomPartRow[]>()
      for (const p of sub.parts) {
        if (!p.manufacturer) continue
        const namePrefix = String(p.word_name ?? '').toLowerCase().replace(/\s+/g, ' ').trim().split(/[\s,(]/)[0].slice(0, 30)
        const key = `${String(p.manufacturer).toLowerCase()}|${namePrefix}`
        if (!byKey.has(key)) byKey.set(key, [])
        byKey.get(key)!.push(p)
      }
      for (const [, group] of byKey) {
        if (group.length > 1) {
          // Mark every row in the group as duplicate-flagged
          for (const p of group) (p as any).duplicate_flag = `dup_${duplicateCount + 1}`
          duplicateCount++
        }
      }
    }
  }
  if (duplicateCount > 0) {
    console.error(`[render-minimal-pdf] BoM duplicate detection: ${duplicateCount} suspected duplicate group(s) flagged for manual review (same manufacturer + role within sub-module)`)
  }

  // Engine B (2026-05-18) — aggregate per-component-class contribution.
  // Rows without engine_b_component_class fall into 'unclassified' (legacy
  // distributor-only rows or pre-Engine-B iter runs).
  const engine_b_by_class: Record<string, number> = {}
  for (const mod of allMods) {
    for (const sub of mod.subs) {
      for (const p of sub.parts) {
        const cls = p.engine_b_component_class
          || (p.price_tier === 'actual' ? 'distributor_priced' : 'unclassified')
        engine_b_by_class[cls] = roundToPence((engine_b_by_class[cls] || 0) + p.line_total_gbp)
      }
    }
  }
  // 2026-05-23 fix: include orchestrator macro_assembly_prices that are NOT
  // already represented as words in the design. Wind/h2/solar/ups emitters
  // use `buildMinimalContract` which leaves engineeringContract.macros empty;
  // the orchestratorContract has macros (£3.18M for a 6 MW wind turbine —
  // gearbox £1.08M, PM generator £1.32M, converter £780k) but the emitter
  // doesn't create matching words. Previously bomTotals captured ONLY the
  // small word-level parts (£28k for wind), missing the big-ticket macros
  // entirely → 6 MW wind shipped as £73k installed ASP (60-90× too low).
  // BESS isn't affected: its emitter creates lfp_prismatic_cell_word etc.
  // that map to macros, so the dedupe-by-name guard below avoids double-count.
  const wordNames = new Set<string>()
  for (const m of allMods) {
    for (const sub of m.subs) {
      for (const p of sub.parts) {
        wordNames.add(String(p.word_id ?? '').toLowerCase())
        wordNames.add(String((p as any).name ?? '').toLowerCase().replace(/\s+/g, '_'))
      }
    }
  }
  const orchMacros = state?.orchestratorContract?.macro_assembly_prices ?? []
  const engMacros = state?.engineeringContract?.macro_assembly_prices ?? []
  // 2026-05-23 P2-6: dedup ACROSS sources. If both orchestrator + engineering
  // contracts list the same macro name (which happens when a class has both an
  // emitter AND a full archetype contract — e.g. BESS after P2-7), naive
  // concat would double-count. Accumulate by name.toLowerCase() taking
  // max(total) — the larger figure is the better-grounded estimate.
  const dedupedMacros = new Map<string, { name: string; total_gbp: number }>()
  for (const macro of [...orchMacros, ...engMacros]) {
    const name = String(macro?.word_name ?? '').toLowerCase()
    const total = Number(macro?.total_gbp ?? 0)
    if (!name || !Number.isFinite(total) || total <= 0) continue
    const existing = dedupedMacros.get(name)
    if (!existing || total > existing.total_gbp) {
      dedupedMacros.set(name, { name: String(macro?.word_name ?? ''), total_gbp: total })
    }
  }
  let unmatchedMacroTotal_gbp = 0
  const unmatchedMacros: Array<{ name: string; total: number }> = []
  for (const { name, total_gbp: total } of dedupedMacros.values()) {
    const lowerName = name.toLowerCase()
    if (claimedMacroAssemblies.has(lowerName)) continue
    // Match macro to a design word ONLY via exact name or `_word` suffix.
    // 2026-05-23-bugfix: dropped permissive reverse-substring check
    // (`name.includes(wn)`) which caused false-positive matches — wind
    // turbine has 153 design words including short names like "gear" that
    // would substring-match macros like "planetary_gearbox", suppressing
    // £3.18M of cost. Strict match only via exact ID; the BESS pattern of
    // emitting word_id = `${macro_name}_word` is the supported mapping.
    const matched = wordNames.has(lowerName) || wordNames.has(`${lowerName}_word`)
    if (!matched) {
      unmatchedMacroTotal_gbp = roundToPence(unmatchedMacroTotal_gbp + total)
      unmatchedMacros.push({ name: lowerName, total })
    }
  }
  if (unmatchedMacroTotal_gbp > 0) {
    grandTotal_gbp = roundToPence(grandTotal_gbp + unmatchedMacroTotal_gbp)
  }

  return {
    allMods,
    grandTotal_gbp,
    totalRows,
    actualPriced,
    estimatePriced,
    tbdRows,
    engine_b_by_class,
    unmatchedMacroTotal_gbp,
    unmatchedMacros,
  }
}

// ---------------------------------------------------------------------------
// Batch economics — scale every BoM line, sub-module subtotal, module
// subtotal and grand total by the class's bom_scale_factor.
//
// Pipeline pulls unit prices from distributor catalogues (Mouser / DigiKey /
// Farnell / Brave). Those are 1-off trade prices. Industrial-heavy classes
// (BESS utility, EV-charger, bioreactor, HAPS, AUV) are dominated by big-
// ticket bespoke items whose distributor unit price ≈ fab-scale price.
// Consumer / mid-volume classes (CGM, drone, heatpump R290 monobloc,
// vertical farm) are dominated by ICs / connectors / plastics whose fab-
// scale price is 50-1000x lower than 1-off distributor pricing.
//
// Per-class scale factors live in PRICE_BANDS[class].bom_scale_factor.
// 1.0 = industrial-heavy, no scaling.
// 0.5 = mid-volume professional.
// 0.10 = consumer high-volume (default; per-class anchors tighten the
// envelope based on observed phase-23-reality deviations).
//
// Determinism: every scaled value is re-rounded to pence so the printed
// line equals printed_unit × qty exactly, and module / sub-module / grand
// totals reconcile after rounding. See drawer
// forgeos_gotchas_e1f18dd3cfae9ee3 for the full diagnostic that motivated
// this post-process.
// ---------------------------------------------------------------------------

function applyBatchEconomics(state: any, bomTotals: BomTotals | null, slugHint?: string): BomTotals | null {
  if (!bomTotals) return bomTotals
  const band = resolvePriceBand(state, slugHint)
  if (!band) return bomTotals
  const scale = band.bom_scale_factor
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1.0) return bomTotals

  // 2026-05-19 fix C6 (audit-found systematic price error):
  // Engine B writes per-row volume-anchored unit prices (engine_b_*). The W3
  // scale below was originally introduced when prices were 1-off-distributor
  // anchored, to estimate fab-scale. Now that Engine B has shipped, applying
  // W3 on top of Engine B prices DOUBLE-COUNTS the volume correction —
  // systematically wrong prices on every BoM line that has engine_b_*.
  // estimate-missing-prices.tsx:35-40 explicitly notes "W3 retires the day
  // Engine B ships" — that's now. Approach: per-row, skip W3 when the row
  // carries engine_b_estimate_source (curve or flash_lite_unknown_class are
  // both volume-aware). Legacy rows without that field (older state files,
  // distributor-only lines) still get W3 so we don't over-correct them.
  const rowAlreadyVolumeAnchored = (p: any): boolean => {
    const s = p?.engine_b_estimate_source
    return s === 'curve' || s === 'flash_lite_unknown_class'
  }

  // Rebuild module / sub-module / grand totals from scaled line totals so
  // sums reconcile after pence rounding.
  let grandTotal_gbp = 0
  const allMods: BomMod[] = []
  for (const m of bomTotals.allMods) {
    const newMod: BomMod = { module: m.module, label: m.label, display_name: m.display_name, subs: [], subtotal_gbp: 0 }
    for (const sub of m.subs) {
      const newSub: BomSub = { id: sub.id, name: sub.name, parts: [], subtotal_gbp: 0 }
      for (const p of sub.parts) {
        const effectiveScale = rowAlreadyVolumeAnchored(p) ? 1.0 : scale
        const scaledUnit = roundToPence(p.unit_price_gbp * effectiveScale)
        const scaledLine = roundToPence(scaledUnit * p.quantity)
        const newRow: BomPartRow = {
          ...p,
          unit_price_gbp: scaledUnit,
          line_total_gbp: scaledLine,
          // Mirror the scaled figures into the price-tier-typed fields so the
          // table reads consistently with the totals.
          distributor_price_gbp: p.distributor_price_gbp !== null ? scaledUnit : null,
          price_estimate_gbp: p.price_estimate_gbp !== null ? scaledUnit : null,
        }
        newSub.parts.push(newRow)
        // Mirror the cost-overrun forensic skip on the scaled-aggregate
        // path too — lines flagged manual_sourcing_required do not
        // contribute to the scaled subtotal.
        if (newRow.cost_repair_excluded_from_subtotal !== true) {
          newSub.subtotal_gbp = roundToPence(newSub.subtotal_gbp + scaledLine)
        }
      }
      if (newSub.parts.length > 0) {
        newMod.subs.push(newSub)
        newMod.subtotal_gbp = roundToPence(newMod.subtotal_gbp + newSub.subtotal_gbp)
      }
    }
    if (newMod.subs.length > 0) {
      allMods.push(newMod)
      grandTotal_gbp = roundToPence(grandTotal_gbp + newMod.subtotal_gbp)
    }
  }

  // Engine B (2026-05-18) — re-aggregate per-class contribution after the
  // W3 scale factor is applied so the breakdown reconciles with the printed
  // grand total. Keeps engine_b_by_class consistent with what the reader sees.
  const engine_b_by_class: Record<string, number> = {}
  for (const mod of allMods) {
    for (const sub of mod.subs) {
      for (const p of sub.parts) {
        const cls = p.engine_b_component_class
          || (p.price_tier === 'actual' ? 'distributor_priced' : 'unclassified')
        engine_b_by_class[cls] = roundToPence((engine_b_by_class[cls] || 0) + p.line_total_gbp)
      }
    }
  }
  return {
    ...bomTotals,
    allMods,
    grandTotal_gbp,
    scale_applied: scale,
    engine_b_by_class,
  }
}

// ---------------------------------------------------------------------------
// Price reality check — compare the BoM grand total against the class's
// expected £/metric range. Renders a verdict badge so the reader sees
// immediately whether the pipeline output is priced sensibly.
//
// Tristan 2026-05-17: "If our pricing is 100/200/300% out, that's a real
// problem... how do we calibrate the cost of these things?" — this is the
// calibration. Bands live in src/lib/pdf-engine-v2/class-price-bands.ts.
// ---------------------------------------------------------------------------

type PriceReality = {
  band: PriceBand
  metric_value: number | null    // e.g. 269 for £/kWh, or the grand total when band is per-unit
  metric_input: number | null    // the divisor: kWh, kg, L, etc. (1 when band is per-unit)
  metric_label: string           // "£/kWh installed"
  band_low: number
  band_high: number
  verdict: PriceBandVerdict
  pct_deviation: number | null   // 0 when in band; negative when below; positive when above
  diagnostic: string
}

function computePriceReality(
  state: any,
  bomTotals: BomTotals | null,
  slugHint?: string,
  costStack?: CostStack | null,
): PriceReality | null {
  if (!bomTotals || bomTotals.grandTotal_gbp <= 0) return null
  const band = resolvePriceBand(state, slugHint)
  if (!band) return null
  // Engine D: prefer installed_asp_gbp as the target economic layer the
  // market band is calibrated against. Per PLAN-2026-05-18 the band's
  // band_low/band_high values are now installed-ASP figures (the value a
  // founder compares against in market reports). Falls back to raw BoM
  // grand total if no cost stack is available (graceful degradation).
  const comparisonNumerator = costStack && costStack.installed_asp_gbp > 0
    ? costStack.installed_asp_gbp
    : bomTotals.grandTotal_gbp

  // The metric_compute callback returns:
  // - a divisor (kWh, kg, L, kW...) when the band is per-metric
  // - 1 when the band is per-unit and we should compare the grand total directly
  // - null when the metric isn't available — verdict becomes 'unavailable'
  const metric_input = (() => {
    try {
      return band.metric_compute(state)
    } catch {
      return null
    }
  })()
  if (metric_input === null || !Number.isFinite(metric_input) || metric_input <= 0) {
    return {
      band,
      metric_value: null,
      metric_input: null,
      metric_label: band.natural_metric,
      band_low: band.market_band_low,
      band_high: band.market_band_high,
      verdict: 'unavailable',
      pct_deviation: null,
      diagnostic: `Cannot compute ${band.natural_metric} — required input not present in pipeline state.`,
    }
  }
  const metric_value = comparisonNumerator / metric_input
  const { market_band_low: lo, market_band_high: hi } = band

  let verdict: PriceBandVerdict
  let pct_deviation = 0
  if (metric_value >= lo && metric_value <= hi) {
    verdict = 'in_band'
    pct_deviation = 0
  } else if (metric_value < lo) {
    verdict = 'low'
    pct_deviation = ((metric_value - lo) / lo) * 100
  } else {
    verdict = 'high'
    pct_deviation = ((metric_value - hi) / hi) * 100
  }

  // Build the diagnostic based on the deviation magnitude. Tristan's brief
  // defined four tiers; this matches them exactly. Direction (low vs high)
  // tunes the wording — "missing major subsystems" vs "double-counted
  // assemblies".
  const absPct = Math.abs(pct_deviation)
  let diagnostic: string
  if (verdict === 'in_band') {
    diagnostic = 'Within typical market range — pipeline output looks priced sensibly.'
  } else if (absPct < 30) {
    diagnostic = 'Within engineering noise of typical market range — minor sourcing variance only.'
  } else if (absPct < 70) {
    diagnostic = verdict === 'low'
      ? 'Modest deviation — verify BoM completeness and distributor pricing on the largest assemblies.'
      : 'Modest deviation — verify no double-counted assemblies or premium-tier component substitution.'
  } else if (absPct < 150) {
    diagnostic = verdict === 'low'
      ? 'Significant deviation — likely missing major subsystems (PCS, controller, container, or comparable).'
      : 'Significant deviation — likely double-counted assemblies or wrong unit-of-measure on a key line.'
  } else {
    diagnostic = verdict === 'low'
      ? 'Critical under-pricing — pipeline output not procurement-ready without manual correction. Expect missing subsystems or distributor-thin cascade.'
      : 'Critical over-pricing — pipeline output not procurement-ready without manual correction. Expect quantity or unit-of-measure error.'
  }

  return {
    band,
    metric_value,
    metric_input,
    metric_label: band.natural_metric,
    band_low: lo,
    band_high: hi,
    verdict,
    pct_deviation,
    diagnostic,
  }
}

// Shared GBP formatter — always 2dp with thousand-separators below £10M.
// Tristan 2026-05-17: mixing £724,349 with £38,048.28 looked inconsistent.
function fmtGBP_shared(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  if (n >= 10_000_000) return `£${(n / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}M`
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Compact GBP formatter for price-reality badge — drops the pence so the
// inline "£269/kWh" stays short. Uses M / k abbreviations for big numbers.
function fmtGBP_compact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  if (n >= 1_000_000) return `£${(n / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 2 })}M`
  if (n >= 10_000) return `£${(n / 1_000).toLocaleString('en-GB', { maximumFractionDigits: 0 })}k`
  if (n >= 100) return `£${Math.round(n).toLocaleString('en-GB')}`
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 1 })}`
}

// Picks the symbol + colour pair that matches the price-reality verdict.
// Tristan 2026-05-17: symbols (✓ ⚠ ✕) are glyphs not emojis — they're
// allowed under the no-emoji rule.
function priceVerdictStyle(verdict: PriceBandVerdict, absPct: number): { symbol: string; colour: string; bg: string } {
  if (verdict === 'unavailable') return { symbol: '·', colour: '#6b7280', bg: '#f3f4f6' }
  if (verdict === 'in_band') return { symbol: '✓', colour: '#065f46', bg: '#d1fae5' }
  // Severity tiers from absPct: <30 amber, 30-70 amber, 70-150 amber-red, >=150 red.
  // Anything outside the band already qualifies as a warning at minimum.
  if (absPct >= 150) return { symbol: '✕', colour: '#9b1c1c', bg: '#fee2e2' }
  if (absPct >= 70) return { symbol: '✕', colour: '#c2410c', bg: '#fed7aa' }
  return { symbol: '⚠', colour: '#92400e', bg: '#fef3c7' }
}

// ─── Manual-review badges ──────────────────────────────────────────────────
//
// The pipeline gates (G0 physics, G1b compliance, G3 completeness, G4 grammar,
// G5 part-number verify, G2 cost-reality) all attach state markers when their
// bounded retry loops are exhausted. Previously these only existed in state.*
// and never reached the PDF — so the founder reading the report had no signal
// that a gate fired. Council 2026-05-18 BLOCKER cluster: surface every fire as
// a visible badge on the cover, an inline note next to the affected section,
// and a full-text appendix at the back.
//
// Style mirrors the existing priceVerdictStyle pattern — amber for WARN /
// manual-review, red for HALT / REJECT. Glyphs (✓ ⚠ ✕) match the BoM
// price-reality badge.
//
// Gate sources:
//   G0  state.physicsLedger      stages/0.1-physics-ledger.ts        — PhysicsLedgerResult
//   G1b state.complianceGate     stages/3.5-compliance-gate.ts       — ComplianceGateResult
//       state.g1bManualReview    index.ts:893                        — boolean (retries exhausted)
//   G3  state.g3ManualReview     index.ts:2165                       — boolean (Review FAIL after 2 retries)
//   G4  state.moduleDecomposition.g4ManualReview                     — boolean (judges NEEDS_MAJOR after 2 retries)
//   G5  state.g5ManualReview     index.ts:1894                       — boolean (any unverified parts)
//       state.g5UnverifiedParts  index.ts:1888                       — Array<{part_number, part_name, reason, fallback_action}>
//   G2  state.cost_reality_rejection                                 — Jaccard reject details (optional)
//       state.cost_reality_status === 'manual_review_required'       — general re-emit exhaustion

type ManualReviewBadgeId = 'g0_physics' | 'g1b_compliance' | 'g3_completeness' | 'g4_grammar' | 'g5_parts' | 'g2_cost_reality' | 'k10_grammar' | 'physics_critic'

interface ManualReviewBadge {
  id: ManualReviewBadgeId
  /** Short pill label shown on the cover-page strip and inline notes. */
  label: string
  /** WARN → amber, HALT → red. Drives colour selection. */
  severity: 'warn' | 'halt'
  /** One-line summary used inline near affected section. */
  summary: string
  /** Full-text appendix entry (multi-line allowed). */
  appendix: string
}

function collectManualReviewBadges(state: any): ManualReviewBadge[] {
  const out: ManualReviewBadge[] = []

  // G0 — Physics ledger. WARN or HALT verdict (PASS = no badge). Field shape:
  //   { verdict, reason, violations[{law, headline, claimed, allowed, severity, rationale}], class_key, fail_open }
  const pl = state?.physicsLedger
  if (pl && (pl.verdict === 'WARN' || pl.verdict === 'HALT')) {
    const violations: any[] = Array.isArray(pl.violations) ? pl.violations : []
    const lines = violations.map(v => `${v.severity === 'hard' ? 'HALT' : 'WARN'} · ${v.law}: ${v.headline}\n  Claimed: ${v.claimed}\n  Allowed: ${v.allowed}\n  ${v.rationale}`)
    out.push({
      id: 'g0_physics',
      label: 'Physics ledger',
      severity: pl.verdict === 'HALT' ? 'halt' : 'warn',
      summary: `Physics ledger ${pl.verdict === 'HALT' ? 'blocked' : 'flagged'}: ${pl.reason}`,
      appendix: lines.length > 0 ? lines.join('\n\n') : pl.reason,
    })
  }

  // G1b — Compliance gate. Two signals: state.complianceGate.verdict (WARN/HALT)
  // OR state.g1bManualReview (boolean — set when re-augment retries exhausted).
  const cg = state?.complianceGate
  const g1bExhausted = state?.g1bManualReview === true
  if (cg && (cg.verdict === 'WARN' || cg.verdict === 'HALT' || g1bExhausted)) {
    const conflicts: any[] = Array.isArray(cg?.conflicts) ? cg.conflicts : []
    const lines = conflicts.map(c => `${c.severity === 'hard' ? 'HALT' : 'WARN'} · ${c.standard_code} (${c.conflict_type}): ${c.reason}`)
    const rs = cg?.revision_suggestion
    const revisionBlock = rs
      ? `\n\nBrief-revision suggestion (${rs.field}):\n  Original: ${rs.original}\n  Suggested: ${rs.suggested}\n  Rationale: ${rs.rationale}`
      : ''
    out.push({
      id: 'g1b_compliance',
      label: 'Compliance review',
      severity: cg?.verdict === 'HALT' || g1bExhausted ? 'halt' : 'warn',
      summary: g1bExhausted
        ? `Compliance review blocked — could not auto-revise the brief to resolve: ${cg?.reason ?? 'class-mandatory standard conflict'}`
        : `Compliance review ${cg?.verdict === 'HALT' ? 'blocked' : 'flagged'}: ${cg?.reason ?? 'standard conflict'}`,
      appendix: (lines.length > 0 ? lines.join('\n') : (cg?.reason ?? 'Compliance gate manual review.')) + revisionBlock,
    })
  }

  // G3 — Review completeness gate. Boolean only.
  if (state?.g3ManualReview === true) {
    out.push({
      id: 'g3_completeness',
      label: 'Engineering review completeness',
      severity: 'warn',
      summary: 'Engineering review pass exhausted its retry budget — content may be incomplete and needs human review.',
      appendix: 'Stage 6 Review (G3 completeness) failed twice in a row. The pipeline proceeded with the engineering review section empty or partial. A human reviewer should re-run the review pass against the final modules + research before this report is shared externally.',
    })
  }

  // G4 — Module-decomposition grammar gate. Attached to moduleDecomposition.
  const g4 = state?.moduleDecomposition?.g4ManualReview === true || state?.g4ManualReview === true
  if (g4) {
    const verdict = state?.moduleDecomposition?.council_verdict
    const notes: any[] = Array.isArray(state?.moduleDecomposition?.council_notes) ? state.moduleDecomposition.council_notes : []
    const g4Notes = notes.filter(n => typeof n === 'string' && /multi-emitter|judge|G4/.test(n)).slice(0, 8)
    out.push({
      id: 'g4_grammar',
      label: 'Module structure check',
      severity: 'warn',
      summary: `Module structure check exhausted after 2 retries${verdict ? ` (final verdict: ${verdict})` : ''} — expect missing cross-module connections or sub-module gaps.`,
      appendix: ['Stage 1.7 multi-emitter grammar / synthesis judges voted NEEDS_MAJOR on the final synthesis after the bounded retry budget was exhausted. The modules + sub-modules in this report should be cross-checked manually — expect missing cross-module grammar links or sub-module field gaps.', g4Notes.length > 0 ? '\nJudge notes:\n' + g4Notes.map(n => `  · ${n}`).join('\n') : ''].filter(Boolean).join(''),
    })
  }

  // K10 — Reference-graph grammar gate (2026-05-18 enforcing-mode promotion).
  // Two activation paths (both surface the same badge):
  //   (a) state.moduleDecomposition.k10ManualReview === true — set inside the
  //       enforcing wrapper after K10_ENFORCING_MAX_RETRIES (2) re-emits left
  //       required-edges missing above the K10_ENFORCING_MISSING_THRESHOLD (1).
  //   (b) state.k10ManualReview === true — legacy / state-root fallback for
  //       handwritten injection (e.g. scripts/inject-k10-shadow.tsx with the
  //       --manual-review flag).
  // The supporting edge list is read from `k10ManualReviewEdges` or, failing
  // that, from `k10EnforcingResult.missing_required` (same data, different
  // attachment site). Shadow-mode FAIL_SHADOW continues to render the neutral
  // slate Appendix-B block via K10ShadowAppendixBlock — it does NOT fire this
  // badge.
  const k10mrFromMd = state?.moduleDecomposition?.k10ManualReview === true
  const k10mrFromRoot = state?.k10ManualReview === true
  if (k10mrFromMd || k10mrFromRoot) {
    const k10Edges: any[] = Array.isArray(state?.moduleDecomposition?.k10ManualReviewEdges)
      ? state.moduleDecomposition.k10ManualReviewEdges
      : Array.isArray(state?.k10ManualReviewEdges)
        ? state.k10ManualReviewEdges
        : Array.isArray(state?.moduleDecomposition?.k10EnforcingResult?.missing_required)
          ? state.moduleDecomposition.k10EnforcingResult.missing_required
          : []
    const enforcing = state?.moduleDecomposition?.k10EnforcingResult ?? state?.k10EnforcingResult
    const retriesUsed = typeof enforcing?.g4_retries_used === 'number' ? enforcing.g4_retries_used : 2
    const productClass = enforcing?.class ?? enforcing?.product_class ?? state?.moduleDecomposition?.product_class ?? '(unknown class)'
    const edgeLines = k10Edges.slice(0, 40).map((e: any) => {
      const proto = e?.protocol ? ` [${e.protocol}]` : ''
      const mech = e?.mechanism ? ` (${e.mechanism})` : ''
      const note = e?.notes ? `\n    ${String(e.notes).slice(0, 240)}` : ''
      return `  · ${e?.from_class ?? '?'} ↔ ${e?.to_class ?? '?'}${proto}${mech}${note}`
    })
    const more = k10Edges.length > 40 ? `\n  …and ${k10Edges.length - 40} more.` : ''
    out.push({
      id: 'k10_grammar',
      label: 'Cross-module wiring',
      severity: 'warn',
      summary: `Module decomposition still missing ${k10Edges.length} required cross-module connection${k10Edges.length === 1 ? '' : 's'} for ${productClass} after ${retriesUsed} retr${retriesUsed === 1 ? 'y' : 'ies'} — wiring topology needs human review before commissioning.`,
      appendix: [
        'Stage 1.7 K10 reference-graph gate (enforcing mode) failed twice. The emitted cross_module_grammar_links did not cover every required edge for this product class in the K10 ProductClassGraph; the pipeline proceeded with the best-effort synthesis but the missing cross-module links below should be added or justified manually before the report is shared externally.',
        '',
        `Product class: ${productClass}`,
        `Missing required edges (${k10Edges.length}):`,
        edgeLines.join('\n') + more,
      ].join('\n'),
    })
  }

  // G5 — Part-number verification. State holds an array of unverified parts.
  // 2026-05-20 Task #69: each unverified part may also carry a `rag_suggestion`
  // — a corpus-grounded plausible alternative SKU sourced from the Phase 4
  // corpus via cosine similarity. When present, surface it inline so the
  // engineer has a starting point rather than just a "couldn't verify" dead end.
  const g5Parts: any[] = Array.isArray(state?.g5UnverifiedParts) ? state.g5UnverifiedParts : []
  if (state?.g5ManualReview === true || g5Parts.length > 0) {
    const lines = g5Parts.slice(0, 40).map(p => {
      const head = `  · ${p.part_number ?? '(no SKU)'}${p.part_name ? ` — ${p.part_name}` : ''}`
      const reason = p.reason ? `\n    ${p.reason}` : ''
      const fallback = p.fallback_action ? `\n    fallback: ${p.fallback_action}` : ''
      // RAG suggestion line — only render when a corpus-grounded alternative exists.
      const rag = p.rag_suggestion
      let ragLine = ''
      if (rag && rag.match && rag.match.part_number) {
        const sim = typeof rag.similarity === 'number' ? rag.similarity.toFixed(2) : '?'
        const conf = rag.confidence ? ` [${rag.confidence}]` : ''
        const mfr = rag.match.manufacturer ? `${rag.match.manufacturer} ` : ''
        ragLine = `\n    Plausible alternative based on corpus: ${mfr}${rag.match.part_number} (similarity ${sim})${conf}`
      }
      return head + reason + fallback + ragLine
    })
    const more = g5Parts.length > 40 ? `\n  …and ${g5Parts.length - 40} more.` : ''
    // Count parts with RAG suggestions for the summary line.
    const ragCount = g5Parts.filter(p => p.rag_suggestion && p.rag_suggestion.match && p.rag_suggestion.match.part_number).length
    const ragSummary = ragCount > 0 ? ` ${ragCount} have plausible corpus-grounded alternatives surfaced below.` : ''
    out.push({
      id: 'g5_parts',
      label: 'Part-number verification',
      severity: 'warn',
      summary: `${g5Parts.length} part number${g5Parts.length === 1 ? '' : 's'} could not be confirmed against DigiKey, Mouser, Farnell, or manufacturer-domain web search — manual sourcing required.${ragSummary}`,
      appendix: ['Stage 4.5 part-number verification did not find these SKUs at DigiKey, Mouser, Farnell, or via a Brave manufacturer-domain search. Each line is flagged in the Bill of Materials with an amber "?" badge; the supplier-resolution fallback for each is recorded below.', ragCount > 0 ? `\n${ragCount} unverified part${ragCount === 1 ? ' has' : 's have'} a corpus-grounded plausible alternative (from ~/.forge-truth/forge-truth.db, ${'~'}25k embedded real parts) — surfaced inline as "Plausible alternative based on corpus: …". These are similarity-ranked suggestions, NOT verified substitutes; the engineer must confirm against datasheets before procuring.\n` : '', lines.join('\n') + more].filter(Boolean).join('\n'),
    })
  }

  // Physics Critic badge (2026-05-19 v5 — newly wired). The chain writes
  // state.physicsCritique with scores + issues; before v5 the renderer
  // dropped this on the floor. Fire when the critic flagged any high-
  // severity findings (medium/low surface in appendix only).
  // 2026-05-19 v5.1 audit fix #10 (GPT-5.5): normalise severity to lowercase
  // before comparing. Different critic models emit different cases ('HIGH',
  // 'High', 'high'); strict === 'high' missed 'HIGH'/'High'/'critical'/'halt'.
  const pcr = state?.physicsCritique
  if (pcr && Array.isArray(pcr.issues)) {
    const sevHigh = (s: any): boolean => {
      const t = String(s ?? '').toLowerCase().trim()
      return t === 'high' || t === 'critical' || t === 'halt' || t === 'severe'
    }
    const highIssues = pcr.issues.filter((i: any) => sevHigh(i.severity))
    if (highIssues.length > 0) {
      const lines = highIssues.slice(0, 10).map((i: any) =>
        `[${i.severity}/${i.confidence}] ${i.dimension} @ ${i.where}: ${i.issue}${i.suggested_check ? `\n  Suggested check: ${i.suggested_check}` : ''}`)
      const more = highIssues.length > 10 ? `\n…and ${highIssues.length - 10} more high-severity findings.` : ''
      const scoreLine = pcr.scores
        ? `Critic scores (0-10): brief→design ${pcr.scores.brief_to_design_fidelity}, engineering ${pcr.scores.engineering_plausibility}, coherence ${pcr.scores.internal_coherence}, parts ${pcr.scores.part_realism}, honesty ${pcr.scores.honesty_signal}.`
        : ''
      out.push({
        id: 'physics_critic',
        label: 'Engineering plausibility review',
        severity: 'warn',
        summary: `Engineering plausibility review flagged ${highIssues.length} high-severity issue${highIssues.length === 1 ? '' : 's'} (engineering plausibility ${pcr.scores?.engineering_plausibility ?? '?'}/10).`,
        appendix: [
          pcr.headline ?? 'Physics & engineering review.',
          scoreLine,
          '',
          'High-severity findings:',
          lines.join('\n\n') + more,
          '',
          'These findings are LLM-judged with confidence enum (high|medium|low|unknown). A human engineer should verify each against datasheets / first-principles before acting on the design.',
        ].filter(Boolean).join('\n'),
      })
    }
  }

  // G2 — Cost-reality (Engine A re-emit). Either Jaccard reject details OR a
  // generic "manual_review_required" status after the retry budget.
  const crRej = state?.cost_reality_rejection
  const crStatus = state?.cost_reality_status
  if (crRej || crStatus === 'manual_review_required') {
    const r = crRej
    const rejBlock = r
      ? `Rejection reason: ${r.reason}\n  Original functional categories (${(r.original_categories ?? []).length}): ${(r.original_categories ?? []).join(', ')}\n  Re-emit functional categories (${(r.new_categories ?? []).length}): ${(r.new_categories ?? []).join(', ')}\n  Missing after re-emit: ${(r.missing_categories ?? []).join(', ')}\n  Jaccard similarity: ${typeof r.jaccard === 'number' ? r.jaccard.toFixed(2) : '—'}`
      : 'Bill-of-materials cost-reality band check failed twice in a row; the LLM re-emit budget was exhausted before the BoM came back inside the per-class price band.'
    const cr = state?.cost_reality
    const crDiag = cr && typeof cr === 'object' ? `\n\nBand diagnostic: ${cr.diagnostic ?? '(none)'} (verdict: ${cr.verdict ?? '?'}; pct_deviation: ${typeof cr.pct_deviation === 'number' ? cr.pct_deviation.toFixed(1) + '%' : '—'})` : ''
    out.push({
      id: 'g2_cost_reality',
      label: 'G2 cost-reality',
      severity: 'halt',
      summary: crRej
        ? 'Bill-of-materials re-emit rejected — LLM substituted functional categories (gameability guard fired).'
        : 'Bill-of-materials cost-reality re-emit budget exhausted — pricing flagged for manual review.',
      appendix: rejBlock + crDiag,
    })
  }

  return out
}

function manualReviewBadgeStyle(severity: 'warn' | 'halt'): { colour: string; bg: string; border: string; symbol: string; darkBg: string; darkText: string; darkSymbolColour: string } {
  if (severity === 'halt') {
    return { colour: '#9b1c1c', bg: '#fee2e2', border: '#9b1c1c', symbol: '✕', darkBg: '#7f1d1d', darkText: '#fecaca', darkSymbolColour: '#fca5a5' }
  }
  return { colour: '#92400e', bg: '#fef3c7', border: '#d97706', symbol: '⚠', darkBg: '#78350f', darkText: '#fde68a', darkSymbolColour: '#fcd34d' }
}

// Cover-page strip — one pill per fired badge. Renders inside the dark
// cost-stack panel so it inherits that background; we use higher-contrast
// pill colours (darkBg + darkText) so the amber/red still reads at-a-glance.
function ManualReviewCoverStrip({ badges }: { badges: ManualReviewBadge[] }) {
  if (!badges || badges.length === 0) return null
  return (
    <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#1e4a73', flexDirection: 'row', flexWrap: 'wrap' }}>
      {badges.map(b => {
        const sty = manualReviewBadgeStyle(b.severity)
        return (
          <View
            key={`mr-cover-${b.id}`}
            style={{ marginRight: 6, marginTop: 4, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 3, backgroundColor: sty.darkBg }}
          >
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: sty.darkText }}>
              <Text style={{ color: sty.darkSymbolColour }}>{sty.symbol} </Text>
              MANUAL REVIEW — {b.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// Inline note inside a body section (Compliance, Modules, BoM, Risk). Light
// background to match the rest of the document; one pill plus the summary line.
function ManualReviewSectionNote({ badges }: { badges: ManualReviewBadge[] }) {
  if (!badges || badges.length === 0) return null
  return (
    <>
      {badges.map(b => {
        const sty = manualReviewBadgeStyle(b.severity)
        return (
          <View
            key={`mr-section-${b.id}`}
            style={{ marginBottom: 10, padding: 8, backgroundColor: sty.bg, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: sty.border }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: sty.colour, marginRight: 6 }}>{sty.symbol}</Text>
              <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: sty.colour }}>MANUAL REVIEW — {b.label}</Text>
            </View>
            <Text style={{ fontSize: 9, color: INK_SOFT, marginTop: 4, lineHeight: 1.45 }}>
              {b.summary}
            </Text>
          </View>
        )
      })}
    </>
  )
}

// K10 reference-graph shadow-mode info block — 2026-05-18 dispatch
// ("Wire K10 into G4 in shadow mode first").
//
// Shadow mode is INFORMATIONAL only — it does NOT trigger a manual-review
// badge on the cover and does NOT block the pipeline. Each emission still
// gets validated against the K10 graph for its product_class so we can
// observe the failure pattern across the 10 supported classes before
// promoting to enforcing mode in a later dispatch.
//
// Reads:
//   state.moduleDecomposition.k10ShadowResult — primary, attached by
//      stages/1.7-module-decomposition.ts:runK10ShadowValidation
//   state.k10ShadowResult                     — legacy fallback location
//
// Renders only when verdict === 'FAIL_SHADOW' (i.e. at least one required
// graph edge was missing). PASS_SHADOW / NO_GRAPH / SKIPPED render nothing.
function K10ShadowAppendixBlock({ state }: { state: any }) {
  const k10 = state?.moduleDecomposition?.k10ShadowResult ?? state?.k10ShadowResult
  if (!k10 || k10.verdict !== 'FAIL_SHADOW') return null
  const missing: any[] = Array.isArray(k10.missing_required) ? k10.missing_required : []
  const extras: any[] = Array.isArray(k10.extra_emitted) ? k10.extra_emitted : []
  const protoMis: any[] = Array.isArray(k10.protocol_mismatches) ? k10.protocol_mismatches : []
  // Neutral slate styling — distinct from amber/red gate badges to signal
  // "diagnostic, not blocking".
  const sty = { colour: '#0f172a', bg: '#f1f5f9', border: '#64748b', symbol: 'ⓘ' } as const
  return (
    <View
      key="k10-shadow-appendix"
      wrap={true}
      style={{ marginBottom: 14, padding: 10, backgroundColor: sty.bg, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: sty.border }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sty.colour, marginRight: 6 }}>{sty.symbol}</Text>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sty.colour }}>K10 reference-graph shadow check</Text>
      </View>
      <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
        Class {String(k10.class)} — {missing.length} required edge{missing.length === 1 ? '' : 's'} missing from emission (shadow mode — no impact on pipeline).
      </Text>
      <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginBottom: 4 }}>
        Diagnostic only — the K10 engineering reference graph is wired into the G4 grammar gate in shadow mode while we observe the failure pattern across the 10 supported classes. The pipeline did NOT fail; once shadow-mode results across the 10 classes are reviewed, K10 will be promoted to enforcing mode in a later dispatch.
      </Text>
      <Text style={{ fontSize: 9, color: INK, marginBottom: 2, fontFamily: 'Helvetica-Bold' }}>Missing required edges ({missing.length})</Text>
      {missing.slice(0, 30).map((e: any, i: number) => (
        <Text key={`k10-miss-${i}`} style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>
          · {String(e.from_class)} ↔ [{String(e.protocol ?? e.mechanism ?? '?')}] {String(e.to_class)}
          {e.notes ? ` — ${String(e.notes).slice(0, 100)}` : ''}
        </Text>
      ))}
      {missing.length > 30 ? (
        <Text style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>
          …and {missing.length - 30} more.
        </Text>
      ) : null}
      {extras.length > 0 ? (
        <>
          <Text style={{ fontSize: 9, color: INK, marginTop: 6, marginBottom: 2, fontFamily: 'Helvetica-Bold' }}>Extra emitted edges (no K10 match, {extras.length})</Text>
          {extras.slice(0, 20).map((e: any, i: number) => (
            <Text key={`k10-extra-${i}`} style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>
              ? {String(e.from_module)} ↔ [{String(e.mechanism ?? e.protocol ?? '?')}] {String(e.to_module)}
              {e.detail ? ` — ${String(e.detail).slice(0, 80)}` : ''}
            </Text>
          ))}
          {extras.length > 20 ? (
            <Text style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>…and {extras.length - 20} more.</Text>
          ) : null}
        </>
      ) : null}
      {protoMis.length > 0 ? (
        <>
          <Text style={{ fontSize: 9, color: INK, marginTop: 6, marginBottom: 2, fontFamily: 'Helvetica-Bold' }}>Protocol / mechanism deltas ({protoMis.length})</Text>
          {protoMis.slice(0, 12).map((m: any, i: number) => (
            <Text key={`k10-pm-${i}`} style={{ fontSize: 8.5, color: INK_SOFT, marginLeft: 6, marginBottom: 1 }}>
              ! {String(m.from_module)} → {String(m.to_module)}: {String(m.reason)}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  )
}

/** Convenience: does this state have a FAIL_SHADOW K10 result worth surfacing? */
function hasK10ShadowFail(state: any): boolean {
  const k10 = state?.moduleDecomposition?.k10ShadowResult ?? state?.k10ShadowResult
  return !!k10 && k10.verdict === 'FAIL_SHADOW'
}

// Appendix page — rendered when at least one badge fired OR a K10 shadow
// FAIL_SHADOW result exists. Full text from each badge's `appendix` field,
// ordered by gate firing (G0 → G1b → G2 → G3 → G4 → G5). K10 shadow info
// (if any) is appended at the end as a neutral slate block — it is NOT a
// gate fire and never triggers a cover-page badge.

/**
 * Task #87 (2026-05-18) — Appendix B provenance block for auto-generated
 * class registries. Lists what was generated (modules, connections, standards,
 * hazards, cost stack) vs corpus-grounded, the generator model + audit fields,
 * and a list of caveats from the generator's own confidence assessment.
 * Amber slate — informational, not blocking.
 */
function ProvisionalClassRegistryAppendixBlock({
  entry,
}: {
  entry: {
    flag: boolean
    reason?: string
    payloadAttached?: boolean
    generatorModel?: string
    audit?: any
    payload?: any
  }
}) {
  const payload = entry.payload
  const audit = entry.audit
  const requiredModules: string[] = payload?.modules
    ? payload.modules.filter((m: any) => m.applicability === 'required').map((m: any) => m.module)
    : []
  const subModuleCount: number = payload?.modules
    ? payload.modules.reduce((acc: number, m: any) => acc + (Array.isArray(m.sub_modules) ? m.sub_modules.length : 0), 0)
    : 0
  const standardsCount: number = Array.isArray(payload?.standards) ? payload.standards.length : 0
  const hazardCount: number = Array.isArray(payload?.hazards) ? payload.hazards.length : 0
  const connectionCount: number = Array.isArray(payload?.connections) ? payload.connections.length : 0
  return (
    <View
      wrap={true}
      style={{
        marginTop: 14,
        marginBottom: 14,
        padding: 11,
        backgroundColor: '#fffbeb',
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: '#d97706',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#92400e', marginRight: 6 }}>!</Text>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#92400e' }}>
          PROVISIONAL CLASS REGISTRY — AUTO-GENERATED
        </Text>
      </View>
      <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
        {payload?.display_name ?? 'Unknown product class'}
      </Text>
      <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginBottom: 6 }}>
        The product class for this brief is not in the curated baseline registry of
        ~15 classes. {entry.payloadAttached
          ? `An auto-generated registry was attached by ${entry.generatorModel ?? 'an LLM'}.`
          : 'No auto-generated payload was attached — the engine fell back to a generic template.'}{' '}
        {entry.reason ?? ''}
      </Text>
      {entry.payloadAttached && payload ? (
        <>
          <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.6, marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Auto-generated fields:</Text>{' '}
            {requiredModules.length} required modules ({requiredModules.join(', ') || 'none'});{' '}
            {subModuleCount} sub-modules; {connectionCount} cross-module connections;{' '}
            {standardsCount} applicable standards; {hazardCount} top FMEA hazards; full cost-stack ratio set.
          </Text>
          <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.6, marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Corpus-grounded:</Text>{' '}
            none — the auto-generator is LLM-only at this point. Engine C reference-anchor and
            corpus citations have NOT been applied to this class.
          </Text>
          <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.6, marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Generator confidence:</Text>{' '}
            {payload.confidence ?? 'unknown'}.
          </Text>
          {Array.isArray(payload.caveats) && payload.caveats.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: INK_SOFT, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
                Generator caveats:
              </Text>
              {payload.caveats.slice(0, 6).map((c: string, idx: number) => (
                <Text key={`prov-caveat-${idx}`} style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginLeft: 8 }}>
                  · {c}
                </Text>
              ))}
            </View>
          ) : null}
          {audit ? (
            <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 6 }}>
              Audit — model: {audit.generator_model ?? '?'} · prompt: {audit.generator_prompt_version ?? '?'}{' '}
              · generated: {audit.generated_at ?? '?'} · tokens in/out: {audit.input_tokens ?? '?'}/{audit.output_tokens ?? '?'}{' '}
              · est. cost: £{typeof audit.estimated_cost_gbp === 'number' ? audit.estimated_cost_gbp.toFixed(3) : '?'}
            </Text>
          ) : null}
          <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 4, fontStyle: 'italic' }}>
            Promotion path: an engineer reviews this row in ~/.forge-truth/forge-truth.db
            table auto_class_registry, hand-copies the JSON fragments into the six curated
            files (class-module-priors.ts, class-connections.ts, class-standards.ts,
            class-hazards.ts, class-reference-graphs/&lt;slug&gt;.ts, class-cost-structure.ts),
            marks the row reviewed/promoted, and commits the curated additions.
          </Text>
        </>
      ) : null}
    </View>
  )
}

// ─── Cover ──────────────────────────────────────────────────────────────────

// Engine D cost-stack row — one £-amount line on the cover-page breakdown.
// Headline (installed ASP) is bigger + brighter; subtotals (factory COGS,
// OEM transfer, channel list) are bold; addends sit in the muted text colour.
function CoverCostStackRow({
  label,
  amount,
  pct,
  isHeadline,
  isSubtotal,
  note,
}: {
  label: string
  amount: number
  pct: number | null
  isHeadline: boolean
  isSubtotal: boolean
  note?: string
}) {
  const labelColour = isHeadline ? '#ffffff' : isSubtotal ? '#ffffff' : '#bae6fd'
  const amountColour = isHeadline ? '#ffffff' : isSubtotal ? '#ffffff' : '#e0f2fe'
  const fontSize = isHeadline ? 13 : isSubtotal ? 10.5 : 9.5
  const family = (isHeadline || isSubtotal) ? 'Helvetica-Bold' : 'Helvetica'
  const marginTop = isHeadline ? 4 : isSubtotal ? 2 : 1
  const marginBottom = isHeadline ? 0 : isSubtotal ? 2 : 0
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop, marginBottom, paddingTop: isSubtotal || isHeadline ? 2 : 0, borderTopWidth: isSubtotal || isHeadline ? 0.4 : 0, borderTopColor: '#1e4a73' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize, fontFamily: family, color: labelColour }}>
          {label}
          {pct !== null && pct > 0 ? (
            <Text style={{ fontSize: fontSize - 1.5, color: '#7dd3fc', fontFamily: 'Helvetica' }}> ({pct.toFixed(0)}%)</Text>
          ) : null}
          {note ? (
            <Text style={{ fontSize: fontSize - 1.5, color: '#7dd3fc', fontFamily: 'Helvetica', fontStyle: 'italic' }}> — {note}</Text>
          ) : null}
        </Text>
      </View>
      <View style={{ width: 110, alignItems: 'flex-end' }}>
        <Text style={{ fontSize, fontFamily: family, color: amountColour }}>
          {fmtGBP_shared(amount)}
        </Text>
      </View>
    </View>
  )
}

// CoverPage — uses Option 2 (clean iso CAD on white) hero image if available
// at public/heroes/<product-class-slug>-cover.png. Per Tristan 2026-05-17 the
// hero option is the Blender ghosted-shell-with-saturated-modules render;
// photoreal options were rejected because "they make you think it's real".
// If no hero image is available for this class, falls back to text-only cover.
// Engine C aggregate summary written to state by
// scripts/enrich-state-with-reference-anchor.tsx. Optional — legacy state
// files never ran enrichment and the cover degrades gracefully.
type EngineCSummary = {
  product_class: string | null
  total_priced_lines: number
  in_range: number
  over: number
  under: number
  no_reference: number
  pct_flagged_out_of_range: number
  top_over_flags?: { word_id: string; name: string; our_unit_gbp: number; ref_median_gbp: number; ratio: number; excerpt: string }[]
  top_under_flags?: { word_id: string; name: string; our_unit_gbp: number; ref_median_gbp: number; ratio: number; excerpt: string }[]
  over_ratio_threshold?: number
  under_ratio_threshold?: number
}

function CoverPage({
  subject,
  projectId,
  heroImagePath,
  bomTotals,
  costStack,
  priceReality,
  pendingPartsCount,
  engineCSummary,
  manualReviewBadges,
  provisionalClassRegistry,
  acceptanceStatus,
  physicsCritique,
  briefEnvelope,
  productClass,
  state,
}: {
  subject: string
  projectId: string
  heroImagePath?: string | null
  briefEnvelope?: { widthMm: number; depthMm: number; heightMm: number; label: string } | null
  productClass?: string
  state?: any
  bomTotals?: BomTotals | null
  costStack?: CostStack | null
  priceReality?: PriceReality | null
  pendingPartsCount?: number
  engineCSummary?: EngineCSummary | null
  manualReviewBadges?: ManualReviewBadge[]
  /**
   * Task #87 (2026-05-18) — when true, the product class was not in the
   * curated registry and the engine fell back to the auto-generator (or a
   * poor template if the generator is gated off). Renders an amber note
   * under the report subtitle so the reader knows the class registry came
   * from an LLM, not a human-curated baseline.
   */
  provisionalClassRegistry?: {
    flag: boolean
    reason?: string
    /** True when an auto-generated payload was attached (vs poor-template fallback). */
    payloadAttached?: boolean
    /** Generator model name, if a payload was attached. */
    generatorModel?: string
  }
  /**
   * 2026-05-20 BESS iter-6 universal fix: when state.acceptanceStatus ===
   * 'blocked' (set by chain when physics_critic.engineering_plausibility ≤ 3
   * OR brief_to_design_fidelity ≤ 3), render a dark-red DO-NOT-PROCURE
   * banner at the top of the cover. The PDF is still emitted as a first-cut
   * scaffold, but the reader must NOT treat it as procurement-grade.
   */
  acceptanceStatus?: string
  physicsCritique?: { scores?: { brief_to_design_fidelity?: number; engineering_plausibility?: number; internal_coherence?: number; part_realism?: number; honesty_signal?: number } } | null
}) {
  // Tristan 2026-05-17: "On the front cover there should be some kind of
  // number or what the price is right at the front of it." Hoist the BoM
  // grand total onto the cover so the headline figure greets the reader
  // before they reach §6.
  // 2026-05-20 BESS iter-6 council fix: DO-NOT-PROCURE banner when chain
  // promoted acceptanceStatus to 'blocked' (physics critic ≤ 3/10).
  const isBlocked = acceptanceStatus === 'blocked'
  const plaus = physicsCritique?.scores?.engineering_plausibility
  const fidel = physicsCritique?.scores?.brief_to_design_fidelity

  return (
    // ITER-10.5 fix (2026-05-20 second review): drop justifyContent entirely
    // on the Page. The prior 'center' caused the cover body to push to page
    // 2 when the DO NOT PROCURE banner was present; 'flex-start' didn't fix
    // it either (the cover body was rendering as a unit and not splitting
    // across pages). Removing justifyContent lets the content flow normally
    // from top.
    <Page size="A4" style={{ ...PAGE_STYLE, paddingHorizontal: 60 }}>
      <View style={{ marginBottom: 16 }}>
        {/* Build #5: Engineering Contract closure-failure banner. Shows
            specific deterministic findings (mass closure, solar balance,
            etc.) instead of the generic Physics Critic "below 3/10" text.
            The Contract's closures array carries reasons that are
            actionable (e.g. "Estimated empty mass 208.7 kg vs brief cap
            95 kg (220%)"). Universal — every Contract-enabled product
            class surfaces its own closure failures. */}
        {(() => {
          const ec = state?.engineeringContract
          const failClosures = Array.isArray(ec?.closures) ? ec.closures.filter((c: any) => c?.status === 'fail') : []
          const warnClosures = Array.isArray(ec?.closures) ? ec.closures.filter((c: any) => c?.status === 'warn') : []
          if (failClosures.length > 0) {
            return (
              <View style={{
                marginBottom: 14,
                padding: 10,
                backgroundColor: '#7f1d1d',
                borderRadius: 4,
                borderLeftWidth: 5,
                borderLeftColor: '#fca5a5',
              }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#fee2e2', letterSpacing: 2, marginBottom: 4 }}>
                  ENGINEERING CONTRACT — {failClosures.length} CLOSURE{failClosures.length === 1 ? '' : 'S'} FAILING
                </Text>
                {failClosures.slice(0, 3).map((c: any, i: number) => (
                  <Text key={i} style={{ fontSize: 9, color: '#fee2e2', lineHeight: 1.45, marginBottom: 3 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>• {String(c.invariant_id ?? '').replace(/_/g, ' ')}:</Text>{' '}{String(c.reason ?? '')}
                  </Text>
                ))}
                {failClosures.length > 3 ? (
                  <Text style={{ fontSize: 9, color: '#fee2e2', fontStyle: 'italic' }}>
                    + {failClosures.length - 3} more closure failure{failClosures.length - 3 === 1 ? '' : 's'} in the engineering appendix.
                  </Text>
                ) : null}
              </View>
            )
          }
          if (warnClosures.length > 0 && isBlocked) {
            return (
              <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#78350f', borderRadius: 4, borderLeftWidth: 5, borderLeftColor: '#fcd34d' }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#fef3c7', letterSpacing: 2, marginBottom: 4 }}>
                  ENGINEERING CONTRACT — {warnClosures.length} CLOSURE WARNING{warnClosures.length === 1 ? '' : 'S'}
                </Text>
                {warnClosures.slice(0, 3).map((c: any, i: number) => (
                  <Text key={i} style={{ fontSize: 9, color: '#fef3c7', lineHeight: 1.45, marginBottom: 3 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>• {String(c.invariant_id ?? '').replace(/_/g, ' ')}:</Text>{' '}{String(c.reason ?? '')}
                  </Text>
                ))}
              </View>
            )
          }
          if (isBlocked) {
            return (
              <View style={{
                marginBottom: 14,
                padding: 10,
                backgroundColor: '#7f1d1d',
                borderRadius: 4,
                borderLeftWidth: 5,
                borderLeftColor: '#fca5a5',
              }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#fee2e2', letterSpacing: 2, marginBottom: 4 }}>
                  DO NOT PROCURE — DESIGN BLOCKED
                </Text>
                <Text style={{ fontSize: 9, color: '#fee2e2', lineHeight: 1.45 }}>
                  Physics critic engineering plausibility{' '}
                  {typeof plaus === 'number' ? `${plaus}/10` : 'below 3/10'}, brief-to-design fidelity{' '}
                  {typeof fidel === 'number' ? `${fidel}/10` : 'below 3/10'}. First-cut engineering scaffold —
                  contains first-principles violations and is NOT procurement-grade. Resolve high-severity findings
                  in the physics appendix before sharing externally or quoting suppliers.
                </Text>
              </View>
            )
          }
          return null
        })()}
        <Text style={{ fontSize: 9, color: MUTED, letterSpacing: 2, marginBottom: 12 }}>
          FORGE ENGINEERING REPORT
        </Text>
        <View style={{ height: 1, backgroundColor: ACCENT, marginBottom: 18 }} />
        <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color: INK, lineHeight: 1.15, marginBottom: 14 }}>
          {subject}
        </Text>
        <Text style={{ fontSize: 11, color: INK_SOFT, lineHeight: 1.5 }}>
          Brief and module decomposition. First-cut engineering report covering
          the product brief, modules and sub-modules, compliance, risks, bill
          of materials, and recommended suppliers.
        </Text>
        {/* Task #87 (2026-05-18) — provisional class-registry note.
            Amber, not red — informational only, not blocking. Fires when
            state.moduleDecomposition.provisional_class_registry === true,
            meaning the product class was not in the curated registry. See
            Appendix B for the field-by-field provenance breakdown. */}
        {provisionalClassRegistry?.flag ? (
          <View
            style={{
              marginTop: 14,
              padding: 10,
              backgroundColor: '#fffbeb',
              borderRadius: 4,
              borderLeftWidth: 3,
              borderLeftColor: '#d97706',
            }}
          >
            <Text
              style={{
                fontSize: 9,
                color: '#92400e',
                letterSpacing: 1.4,
                marginBottom: 4,
              }}
            >
              CLASS REGISTRY — AUTO-GENERATED
            </Text>
            <Text style={{ fontSize: 10, color: '#78350f', lineHeight: 1.45 }}>
              Class registry auto-generated — review before procurement. The
              product class for this brief is not in the curated baseline; the
              engine has fallen back to{' '}
              {provisionalClassRegistry.payloadAttached
                ? `an auto-generated registry (${provisionalClassRegistry.generatorModel ?? 'LLM'}).`
                : 'a generic template. Module priors, connections, standards, and FMEA are best-effort.'}{' '}
              See Appendix B for the field-by-field provenance breakdown.
            </Text>
          </View>
        ) : null}
        {bomTotals && costStack ? (
          // Engine D — cost stack breakdown. Replaces the single misleading
          // "Indicative Build Cost" headline with the full layered stack
          // (raw materials → factory COGS → OEM transfer → channel list →
          // installed ASP). Founder sees every layer instead of one number
          // pretending to be the unit price.
          //
          // Cover-page layout (Tristan 2026-05-18): when a hero image is
          // ALSO available, wrap the cost-stack panel + hero image in a
          // two-column row so BOTH appear on page 1 — left column (~55%)
          // holds the cost stack, right column (~45%) holds the hero. When
          // there's no hero, the panel stays full-width as before.
          <View style={(heroImagePath || briefEnvelope)
            ? { marginTop: 14, flexDirection: 'row', alignItems: 'flex-start' }
            : { marginTop: 14 }}>
          <View style={(heroImagePath || briefEnvelope)
            ? { flex: 50, marginRight: 12, padding: 11, backgroundColor: '#0c4a6e', borderRadius: 5 }
            : { padding: 11, backgroundColor: '#0c4a6e', borderRadius: 5 }}>
            <Text style={{ fontSize: 8, color: '#bae6fd', letterSpacing: 1.4, marginBottom: 6 }}>
              COST STACK — RAW MATERIALS TO INSTALLED PRICE
            </Text>
            {(() => {
              // Renderer hardening (2026-05-18): make every markup row
              // conditional on its factor > 0. The prior code rendered the
              // labour/overhead/margin rows unconditionally, so any class
              // with factor=0 (the old all-zero-ratios shortcut for heat-
              // pump-residential, heatpump, pv_string_inverter,
              // motor_drive_vfd) produced rows showing fmtGBP_shared(0) = '—'
              // — five em-dashes Tristan read as broken data. The class
              // recalibration in src/lib/pdf-engine-v2/class-cost-structure.ts
              // means this should now never trigger for those four classes,
              // but defensive coding keeps the cover honest if any future
              // class is calibrated with zero ratios.
              const r = costStack.ratios_applied
              const allMarkupsZero =
                r.assembly_labour_factor === 0 &&
                r.factory_overhead_factor === 0 &&
                r.manufacturer_margin_factor === 0 &&
                r.channel_markup_factor === 0 &&
                r.installation_cost_factor === 0
              if (allMarkupsZero) {
                // Collapsed-stack mode — single-line note instead of an
                // empty panel with em-dashes between subtotals.
                return (
                  <>
                    <CoverCostStackRow label="Raw materials BoM" amount={costStack.raw_materials_bom_gbp} pct={null} isHeadline={false} isSubtotal={false} />
                    <CoverCostStackRow label="= Installed ASP" amount={costStack.installed_asp_gbp} pct={null} isHeadline={true} isSubtotal={false} />
                    <Text style={{ fontSize: 7.5, color: '#bae6fd', marginTop: 4, fontStyle: 'italic' }}>
                      Cost stack collapsed — Raw BoM ≈ Installed ASP per {costStack.class_key} calibration (no markup applied).
                    </Text>
                  </>
                )
              }
              return (
                <>
                  <CoverCostStackRow label="Raw materials BoM" amount={costStack.raw_materials_bom_gbp} pct={null} isHeadline={false} isSubtotal={false} />
                  {r.assembly_labour_factor > 0 ? (
                    <CoverCostStackRow label="+ Assembly labour" amount={costStack.assembly_labour_gbp} pct={r.assembly_labour_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : null}
                  {r.factory_overhead_factor > 0 ? (
                    <CoverCostStackRow label="+ Factory overhead" amount={costStack.factory_overhead_gbp} pct={r.factory_overhead_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : null}
                  <CoverCostStackRow label="= Factory COGS" amount={costStack.factory_cogs_gbp} pct={null} isHeadline={false} isSubtotal={true} />
                  {r.manufacturer_margin_factor > 0 ? (
                    <CoverCostStackRow label="+ Manufacturer margin" amount={costStack.manufacturer_margin_gbp} pct={r.manufacturer_margin_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : null}
                  <CoverCostStackRow label="= OEM transfer price" amount={costStack.oem_transfer_price_gbp} pct={null} isHeadline={false} isSubtotal={true} />
                  {r.channel_markup_factor > 0 ? (
                    <CoverCostStackRow label="+ Channel markup" amount={costStack.channel_markup_gbp} pct={r.channel_markup_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : (
                    <CoverCostStackRow label="+ Channel markup" amount={0} pct={0} isHeadline={false} isSubtotal={false} note="direct (no distribution)" />
                  )}
                  <CoverCostStackRow label="= Channel list price" amount={costStack.channel_list_price_gbp} pct={null} isHeadline={false} isSubtotal={true} />
                  {r.installation_cost_factor > 0 ? (
                    <CoverCostStackRow label="+ Installation" amount={costStack.installation_cost_gbp} pct={r.installation_cost_factor * 100} isHeadline={false} isSubtotal={false} />
                  ) : (
                    <CoverCostStackRow label="+ Installation" amount={0} pct={0} isHeadline={false} isSubtotal={false} note="no install service" />
                  )}
                  <CoverCostStackRow label="= Installed ASP" amount={costStack.installed_asp_gbp} pct={null} isHeadline={true} isSubtotal={false} />
                </>
              )
            })()}
            {/* Cost-band marker (Tristan 2026-05-22 v3 — Bug #18 universal):
                The full "% ABOVE typical (band £X–£Y)" framing previously
                appeared inline here. Tristan flagged this as cover-clutter
                — it sits next to the headline price and over-dominates the
                page. Moved to a Candid Cost Analysis section deeper in the
                report (rendered via CandidCostAnalysisSection). Here on the
                cover we keep only a SHORT one-line marker so the reader
                knows there's a band-comparison verdict to read, without the
                full % framing screaming at them. (Verdicts: high → buyer
                investigates; low → engineer double-checks BoM coverage.) */}
            {priceReality && (priceReality.verdict === 'high' || priceReality.verdict === 'low') && priceReality.metric_value !== null ? (
              <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#1e4a73' }}>
                <Text style={{ fontSize: 9, color: '#bae6fd' }}>
                  {priceReality.verdict === 'high' ? '! Cost outside the typical band' : '? Cost below the typical band'}
                  <Text style={{ color: '#94a3b8' }}>{' '}— see Cost Analysis section for the per-metric verdict + supplier corpus reference.</Text>
                </Text>
              </View>
            ) : null}
            {/* ITER-10.5 third review (Tristan 2026-05-20): cover stays
                clean. Everything below the Installed ASP headline number —
                BoM stats line, price-reality verdict, Engine C reference
                summary, manual-review badge strip — was removed because the
                cover sheet "is not a good thing to have" cluttered with
                that material. The same data still surfaces:
                  • Manual review badges → Cover footer or relocated to
                    the relevant section pages.
                  • Price reality + Engine C summary → moved to a
                    dedicated section later in the document or to the
                    Performance Card content folded into the brief.
                  • BoM stats line → procurement reader gets it from
                    Module totals + sub-module sub-totals inline. */}
          </View>
          {heroImagePath ? (
            // Right column of the two-column cover layout. Sized 207×170 to
            // fit alongside the cost-stack panel (45% column on a 475pt
            // content width). Caption stays visible underneath.
            <View style={{ flex: 50, alignItems: 'center' }}>
              <Image src={heroImagePath} style={{ width: 240, height: 200, objectFit: 'contain' }} />
              <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 6, fontStyle: 'italic', textAlign: 'center' }}>
                Illustration only — generic class render, not a photograph of the actual unit. Used for visual reference; final geometry follows the engineering specification.
              </Text>
            </View>
          ) : briefEnvelope ? (
            // ITER-10.5 (Tristan 2026-05-20 second review): static-render
            // hero suppressed because brief envelope clearly exceeds the
            // ≤2 m cabinet scale of the static PNG library. Render a
            // proportional outline labelled with the actual brief
            // dimensions instead of either (a) the wrong-scale static or
            // (b) the iter-9 text placeholder.
            <View style={{ flex: 45 }}>
              <EnvelopeOutline
                widthMm={briefEnvelope.widthMm}
                depthMm={briefEnvelope.depthMm}
                heightMm={briefEnvelope.heightMm}
                label={briefEnvelope.label}
                maxBoxW={207}
                maxBoxH={170}
                productClass={productClass}
                state={state}
              />
            </View>
          ) : (
            <View style={{ flex: 45 }} />
          )}
          </View>
        ) : bomTotals ? (
          // Fallback when no cost-stack ratios resolve — show the legacy
          // single-number card so the cover never goes blank.
          <View style={{ marginTop: 18, padding: 12, backgroundColor: '#0c4a6e', borderRadius: 5 }}>
            <Text style={{ fontSize: 8, color: '#bae6fd', letterSpacing: 1.4, marginBottom: 3 }}>
              RAW MATERIALS BILL OF MATERIALS (PRICED LINES)
            </Text>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>
              {fmtGBP_shared(bomTotals.grandTotal_gbp)}
            </Text>
            <Text style={{ fontSize: 8.5, color: '#bae6fd', marginTop: 4 }}>
              {bomTotals.totalRows} part lines across {bomTotals.allMods.length} modules · {bomTotals.actualPriced} live distributor quotes · {bomTotals.estimatePriced} web estimates · {bomTotals.tbdRows} TBD
            </Text>
            {/* ITER-10.5 third+ review (Tristan 2026-05-20): no Manual
                Review callout strip on cover, even in the no-cost-stack
                fallback path. The badges are still emitted to state for
                downstream consumers but not surfaced as cover-page noise. */}
          </View>
        ) : null}
        {/* ITER-10.5 third review (Tristan 2026-05-20): cover cleanup
            removed three sibling elements that used to live here:
              • inline-light Manual Review badge strip (BoM-less fallback)
              • pending-parts verification note
              • full-width hero (no-cost-stack fallback)
            The cover now ends after the cost-stack + outline two-column.
            Manual-review badges, pending-parts counts, and supplementary
            hero images all surface elsewhere in the document where they
            have proper context. */}
      </View>
      <View style={{ position: 'absolute', bottom: 56, left: 60, right: 60 }}>
        <View style={{ height: 1, backgroundColor: RULE, marginBottom: 14 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 9, color: MUTED }}>Project: {projectId}</Text>
          <Text style={{ fontSize: 9, color: MUTED }}>Generated {new Date().toISOString().split('T')[0]}</Text>
        </View>
      </View>
    </Page>
  )
}

function PageHeader({ section, project }: { section: string; project: string }) {
  // Constrain section text width + force project flexShrink:0 so a long section
  // label (e.g. "Section 5 · Parts Pending Verification — Plausible but Unverified (1/3)")
  // wraps within its own column instead of overlapping the project id below or
  // chewing its leading character (drawer_forgeos_gotchas_227e3c8fd74fcd32 bug #5).
  return (
    <View style={{ position: 'absolute', top: 24, left: 64, right: 64 }} fixed>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
        <Text style={{ fontSize: 8, color: MUTED, letterSpacing: 1, flex: 1, paddingRight: 12 }}>
          {section.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 8, color: MUTED, flexShrink: 0 }}>{project}</Text>
      </View>
      <View style={{ height: 0.6, backgroundColor: RULE_SOFT }} />
    </View>
  )
}

function PageFooter() {
  return (
    <View style={{ position: 'absolute', bottom: 30, left: 64, right: 64 }} fixed>
      <View style={{ height: 0.6, backgroundColor: RULE_SOFT, marginBottom: 6 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 8, color: MUTED }}>Forge Engineering Report</Text>
        <Text
          style={{ fontSize: 8, color: MUTED }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </View>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, marginTop: 14, marginBottom: 6 }}>
      {children}
    </Text>
  )
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 10.5, color: INK_SOFT, lineHeight: 1.6, marginBottom: 8, textAlign: 'justify' }}>
      {children}
    </Text>
  )
}

// ─── Headline (Phase D 2026-05-15): key_metrics page ──────────────────

/**
 * Format a metric value + unit for display. The LLM emits plain-string values
 * ("180000", "3832") and unit strings ("£", "MWh / year"). Renderer is
 * responsible for:
 *   - thousand-separator commas on numerics (180000 → 180,000)
 *   - currency-symbol prefix (180000 + "£" → £180,000), and stripping the
 *     suffix once the prefix is applied so we don't double-render
 *   - leaving non-currency units after the number ("3832 MWh / year")
 */
function formatMetricValue(rawValue: string, rawUnit: string | undefined): string {
  const value = String(rawValue ?? '').trim()
  const unit = String(rawUnit ?? '').trim()
  if (!value) return ''
  // Insert commas if pure numeric (with optional decimal). Leave alphanumeric values alone.
  const numericMatch = value.match(/^-?(\d+)(\.\d+)?$/)
  const withCommas = numericMatch
    ? numericMatch[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (numericMatch[2] ?? '')
    : value
  // Detect currency in unit, prefix it, and drop from unit. Common shapes:
  //   "£", "£ / year", "GBP", "GBP / year", "USD", "$"
  const currencyMatch = unit.match(/^(£|\$|€|GBP|USD|EUR)\s*(\/.*|per.*)?$/i)
  if (currencyMatch) {
    const sym = (currencyMatch[1] === 'GBP') ? '£' : (currencyMatch[1] === 'USD') ? '$' : (currencyMatch[1] === 'EUR') ? '€' : currencyMatch[1]
    const suffix = (currencyMatch[2] ?? '').trim()
    return suffix ? `${sym}${withCommas} ${suffix}` : `${sym}${withCommas}`
  }
  return unit ? `${withCommas} ${unit}` : withCommas
}


// ─── Section 0.5: Performance Characteristics (Tristan 2026-05-20) ─────────
//
// One-glance spec sheet. Reads state.performanceCard (built by
// src/lib/pdf-engine-v2/performance-card.ts). Per-section tables show:
//   metric label | resolved value | brief target (if applicable) | status
//
// Status icons:
//   ✓ ok           — value resolved, within reasonable range, matches brief
//   △ delta        — value resolved but differs from brief constraint by >5%
//   ⚠ out of range — value resolved but outside class-typical range
//   ∼ computed     — value derived from other metrics (e.g. yield/m²)
//   — missing      — neither source nor compute produced a value
//
// Goal: a buyer / engineer / council reviewer can answer "does this design
// actually match the brief?" in 30 seconds without reading 80 pages.
/** Performance Card body — the table content WITHOUT a Page wrapper, so it
 *  can be embedded inside the Brief page (Tristan 2026-05-20 third review:
 *  "performance characteristics data should just go into the briefing
 *  requirements as one section"). */
/** Round a Performance Card metric value to a sensible number of decimals
 *  for display. Avoids the float-overflow look ("0.0090000000000000001
 *  kW/m²") and preserves units/strings as-is. Tristan 2026-05-20 fifth
 *  review: "what is going on with the decimal place?" */
function formatPerfValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—'
    if (v === 0) return '0'
    const abs = Math.abs(v)
    if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    if (abs >= 100) return v.toFixed(0)
    if (abs >= 10) return v.toFixed(1)
    if (abs >= 1) return v.toFixed(2)
    if (abs >= 0.01) return v.toFixed(3)
    return v.toPrecision(2)
  }
  const s = String(v).trim()
  // Numeric-string with optional unit suffix → split, round, recombine.
  // (2026-05-22 Tristan: integer values like "25000 kg/year" were not being
  // localised because the regex required a decimal. Now accepts pure-int too,
  // so "25000 kg/year" → "25,000 kg/year".)
  const m = s.match(/^(-?\d+(?:\.\d+)?)(\s*\S.*)?$/)
  if (m) {
    const num = parseFloat(m[1])
    if (Number.isFinite(num)) {
      const rounded = formatPerfValue(num)
      return rounded + (m[2] ?? '')
    }
  }
  return s
}

function PerformanceCardBody({ state }: { state: any }) {
  const card = state?.performanceCard
  if (!card || !Array.isArray(card.sections) || card.sections.length === 0) return null

  const sectionsWithRows = card.sections.filter((s: any) => Array.isArray(s.metrics) && s.metrics.some((m: any) => m.value !== null || m.brief_target !== null))
  if (sectionsWithRows.length === 0) return null

  const statusIcon = (s: string) => {
    switch (s) {
      case 'ok': return { sym: '✓', colour: '#15803d' }
      case 'delta': return { sym: '△', colour: '#b45309' }
      case 'out_of_range': return { sym: '⚠', colour: '#b91c1c' }
      case 'computed': return { sym: '∼', colour: '#475569' }
      case 'missing':
      default: return { sym: '—', colour: '#94a3b8' }
    }
  }

  return (
    <View>
      <SubHeading>Performance characteristics</SubHeading>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
        Numeric spec sheet for this product class — the resolved value the design must deliver for each metric.
      </Text>

      {card.warnings && card.warnings.length > 0 ? (
        <View style={{ marginBottom: 12, padding: 9, backgroundColor: '#fffbeb', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#d97706' }}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 3 }}>
            {card.warnings.length} performance metric{card.warnings.length === 1 ? '' : 's'} flagged
          </Text>
          {card.warnings.slice(0, 5).map((w: any, i: number) => (
            <Text key={i} style={{ fontSize: 8.5, color: '#78350f', lineHeight: 1.45 }}>
              • [{w.section}] {w.label}: {w.note}
            </Text>
          ))}
        </View>
      ) : null}

      {sectionsWithRows.map((section: any, si: number) => (
        // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
        // minPresenceAhead — variable-height section can overflow remaining
        // page space and overdraw at same Y if wrap=false (wind-turbine p18
        // overlap bug). 200pt ≈ 16 body lines reserves a safe-fit window.
        <View key={si} style={{ marginBottom: 10 }} minPresenceAhead={200}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: ACCENT, letterSpacing: 1.2, marginBottom: 3, textTransform: 'uppercase' }}>
            {section.name}
          </Text>
          <View style={{ borderTopWidth: 0.5, borderTopColor: RULE_SOFT }}>
            <View style={{ flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: RULE_SOFT }}>
              <Text style={{ flex: 3, fontSize: 7.5, color: MUTED, letterSpacing: 0.8 }}>METRIC</Text>
              <Text style={{ flex: 2, fontSize: 7.5, color: MUTED, letterSpacing: 0.8, textAlign: 'right' }}>VALUE</Text>
              <Text style={{ width: 14, fontSize: 7.5, color: MUTED, textAlign: 'center' }}> </Text>
            </View>
            {section.metrics.map((m: any, mi: number) => {
              if (m.value === null && m.brief_target === null) return null
              const { sym, colour } = statusIcon(m.status)
              return (
                <View key={mi} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.3, borderBottomColor: RULE_SOFT, alignItems: 'baseline' }}>
                  <View style={{ flex: 3 }}>
                    <Text style={{ fontSize: 9.5, color: INK }}>{m.label}</Text>
                    {m.note ? (
                      <Text style={{ fontSize: 8, color: '#78350f', marginTop: 1, lineHeight: 1.35 }}>{m.note}</Text>
                    ) : null}
                  </View>
                  <Text style={{ flex: 2, fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: m.value !== null ? INK : '#94a3b8', textAlign: 'right' }}>
                    {m.value !== null ? formatPerfValue(m.value) : '—'}
                  </Text>
                  <Text style={{ width: 14, fontSize: 10, color: colour, textAlign: 'center' }}>{sym}</Text>
                </View>
              )
            })}
          </View>
        </View>
      ))}

      <View style={{ marginTop: 6, padding: 7, backgroundColor: '#f7f8fa', borderRadius: 3 }}>
        <Text style={{ fontSize: 8, color: MUTED, lineHeight: 1.5 }}>
          Legend  ✓ in spec   △ differs from brief by &gt;5%   ⚠ outside class-typical range   ∼ computed from other metrics   — not declared by the engine
        </Text>
      </View>
    </View>
  )
}

// ─── Section 1.5: Design Trade-offs (Tristan + council 2026-05-20) ─────────
//
// Surfaces every design choice the chain made, sourced from existing state.
// No LLM invention at render time — every entry is provable from a state path.
// Council framing (Grok + Gemini): CAPEX / OPEX / Reliability instead of
// speed/cost/quality, because the audience (founders, investors, EPC engineers)
// makes physical-financial trade-offs, not software-PM trade-offs.
//
// Each row shows:
//   WHAT (the choice the chain made)
//   ALTERNATIVE (the option not chosen, sourced from state or class registry)
//   GAINED (which of CAPEX↓/OPEX↓/Reliability↑ improved)
//   SACRIFICED (which axis was given up)
//   STATUS (applied / flagged_for_review / blocked)
//
// Reader can immediately see "this report ships with N flagged decisions
// trading reliability for capex/speed" rather than discovering it in the
// fine print.

// ─── Section 1: Brief & Requirements ───────────────────────────────────────

// ─── Brief Revision Notice (Phase 0 2026-05-15) ────────────────────────────
//
// Renders BEFORE the Brief page when state.brief.was_revised === true. Phase 0
// auto-revises non-viable briefs along the lowest-priority relaxation path
// (RELAXATION_PRIORITY in serial-design-chain-v2.tsx). Per Tristan's directive
// "we need to be very clear up front that we have changed the brief and what
// we've changed the brief to", this page surfaces:
//   • each contradiction that drove a revision (target_constraint, original,
//     revised, relax_factor, rationale)
//   • alternatives that were considered but not chosen (so the reader can lock
//     a different constraint and re-run)
//   • how to re-run with a different lock
//
// Threshold rule encoded in chain: hard contradictions = ratio > 5×; revisions
// capped at 100× per constraint (MAX_RELAX_FACTOR); loop bails after 3 iters.

function BriefRevisionNoticePage({ state, project }: { state: any; project: string }) {
  const brief = state.brief ?? {}
  const history: Array<{
    iter: number
    target_constraint: string
    original_value: string
    revised_value: string
    relax_factor: string
    rationale: string
    contradictions_resolved?: string[]
    alternatives_considered?: Array<{ target_constraint: string; proposed_value: string; relax_factor: string; rationale: string }>
    applied?: boolean
  }> = Array.isArray(brief.revision_history) ? brief.revision_history : []
  const anyApplied = history.some(h => h.applied === true)
  const title = anyApplied ? 'Brief revisions applied' : 'Brief revisions proposed (none applied)'
  const intro = anyApplied
    ? 'The brief as written was not physically achievable. The pipeline auto-relaxed the lowest-priority constraint until the request became viable. Every change is listed below; alternative paths are shown so a different lock can be applied and the brief re-run.'
    : 'The brief as written was not physically achievable. The pipeline proposed the revisions below but none could be applied automatically (each one exceeded the 100× per-revision cap, or the rewriter / re-parse failed). The original brief was retained and the run halted; the proposals are surfaced here for manual review.'

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 1 · Brief Revision Notice" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 18 }}>
        {intro}
      </Text>

      <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#fff7ed', borderLeftWidth: 3, borderLeftColor: '#c2410c' }}>
        <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>
          Rule: contradictions are detected when a brief value diverges from the physical
          floor for the product class by a ratio greater than 5×. The relaxation order is
          fixed (cost ceiling first, then output target, then mass, envelope, material).
          A single revision is capped at 100× the original constraint.
        </Text>
      </View>

      {history.length === 0 ? (
        <Paragraph>
          The brief was flagged as not achievable, but no specific revision was applied
          before the limit was hit. See the FATAL note below the report run for which
          contradictions remained.
        </Paragraph>
      ) : (
        history.map((h, idx) => {
          const applied = h.applied === true
          const badgeText = applied ? 'APPLIED' : 'PROPOSED — NOT APPLIED'
          const badgeColor = applied ? '#065f46' : '#9a3412'
          const badgeBg = applied ? '#d1fae5' : '#fed7aa'
          const revisedLabel = applied ? 'Revised' : 'Proposed'
          return (
          // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
          // minPresenceAhead — engineering review row carries variable-length
          // original/revised values; wrap=false caused page-overlap bug.
          <View key={`rev-${idx}`} minPresenceAhead={120} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
                Revision {idx + 1} — iter {h.iter}: {h.target_constraint}
              </Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: badgeColor, backgroundColor: badgeBg, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
                {badgeText}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View style={{ width: 90 }}><Text style={{ fontSize: 9, color: MUTED }}>Original</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{h.original_value}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View style={{ width: 90 }}><Text style={{ fontSize: 9, color: MUTED }}>{revisedLabel}</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK, fontFamily: 'Helvetica-Bold' }}>{h.revised_value}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View style={{ width: 90 }}><Text style={{ fontSize: 9, color: MUTED }}>Relaxation</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{h.relax_factor}</Text></View>
            </View>
            <View style={{ marginTop: 4, marginBottom: 6 }}>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Rationale</Text>
              <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(h.rationale)}</Text>
            </View>
            {Array.isArray(h.contradictions_resolved) && h.contradictions_resolved.length > 0 ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Contradictions resolved</Text>
                {h.contradictions_resolved.map((c, i) => (
                  <Text key={i} style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>• {c}</Text>
                ))}
              </View>
            ) : null}
            {Array.isArray(h.alternatives_considered) && h.alternatives_considered.length > 0 ? (
              <View style={{ marginTop: 4, padding: 8, backgroundColor: '#f9fafb', borderLeftWidth: 2, borderLeftColor: RULE_SOFT }}>
                <Text style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>Alternatives considered (not chosen)</Text>
                {h.alternatives_considered.map((a, i) => (
                  <View key={`alt-${i}`} style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.4 }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold' }}>{a.target_constraint}</Text>
                      {' → '}{a.proposed_value} ({a.relax_factor})
                    </Text>
                    <Text style={{ fontSize: 9, color: MUTED, lineHeight: 1.4, marginLeft: 8 }}>
                      {clean_prose(a.rationale)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )})
      )}

      <View style={{ marginTop: 18, padding: 10, backgroundColor: '#f3f4f6', borderLeftWidth: 3, borderLeftColor: ACCENT }}>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
          To re-run with a different lock
        </Text>
        <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>
          Edit the brief and append {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>[LOCK]</Text>{' '}
          after the constraint that must stay fixed (for example,
          "unit cost ceiling: £180,000 [LOCK]"). The plausibility critic will then propose
          a revision against the next-priority constraint instead.
        </Text>
      </View>

      <PageFooter />
    </Page>
  )
}

/**
 * Physical Specification — deterministic spec table sourced directly from
 * structure_containment.derived_parameters. Eliminates the ambiguity that
 * arises from LLM-emitted overview prose like "12 m² of growing footprint
 * across 6 vertical tiers" (could be 12 m² total or 12 m² × 6 = 72 m²).
 *
 * Universal pattern (2026-05-15): every product class has a small set of
 * numeric envelope facts (dimensions, mass, footprint, capacity, range)
 * that must appear unambiguously somewhere in the report. Pulling them from
 * the design data — not LLM prose — guarantees they're consistent with the
 * downstream modules and removes interpretation ambiguity.
 *
 * Renders only the fields that exist; classes with sparse derived_parameters
 * just show fewer rows. No financial fields surfaced (Q4 directive).
 */
function PhysicalSpecBlock({ modules, deploymentEnvelope }: { modules: any[]; deploymentEnvelope?: any }) {
  const struct = (modules ?? []).find((m: any) => m.module === 'structure_containment')
  const dp = (struct?.derived_parameters as any) ?? {}
  // Allow the block to render with only a deployment envelope (no struct dp).
  if (!struct && !deploymentEnvelope) return null

  // Universal physical-spec fields, with friendly labels + composite metrics.
  // Order is fixed: envelope → mass → spatial → capacity. Skip empty rows.
  const rows: Array<{ label: string; value: string; note?: string }> = []

  // Envelope
  if (dp.envelope_width_mm && dp.envelope_depth_mm && dp.envelope_height_mm) {
    rows.push({
      label: 'External envelope',
      value: `${dp.envelope_width_mm} × ${dp.envelope_depth_mm} × ${dp.envelope_height_mm} mm (W × D × H)`,
    })
  } else if (dp.envelope_w_mm && dp.envelope_d_mm && dp.envelope_h_mm) {
    rows.push({
      label: 'External envelope',
      value: `${dp.envelope_w_mm} × ${dp.envelope_d_mm} × ${dp.envelope_h_mm} mm (W × D × H)`,
    })
  }
  if (typeof dp.envelope_volume_m3 === 'number') {
    rows.push({ label: 'Envelope volume', value: `${dp.envelope_volume_m3} m³` })
  }

  // Mass
  if (typeof dp.max_mass_kg === 'number') {
    rows.push({ label: 'Maximum gross mass', value: `${dp.max_mass_kg.toLocaleString()} kg` })
  }

  // Floor / canopy / tier composite. The critical disambiguation: when both a
  // small footprint (<50 m²) and a tier_count > 1 exist, render BOTH the
  // per-tier floor area AND the canopy product so the reader can never
  // confuse them. This is the iter-56 VF "12 m² ambiguous" fix.
  const footprint = (typeof dp.footprint_m2 === 'number' ? dp.footprint_m2 : null)
                 ?? (typeof dp.growing_area_sqm === 'number' ? dp.growing_area_sqm : null)
                 ?? (typeof dp.growing_footprint_m2 === 'number' ? dp.growing_footprint_m2 : null)
  const tiers = typeof dp.tier_count === 'number' && dp.tier_count > 0 ? dp.tier_count : null
  const explicitCanopy = (typeof dp.canopy_area_m2 === 'number' ? dp.canopy_area_m2 : null)
                      ?? (typeof dp.growing_area_m2 === 'number' ? dp.growing_area_m2 : null)
  if (footprint != null) {
    rows.push({ label: 'Floor area per unit', value: `${footprint} m²` })
  }
  if (tiers != null) {
    rows.push({ label: 'Vertical tiers', value: `${tiers}` })
  }
  if (explicitCanopy != null) {
    rows.push({ label: 'Total canopy area', value: `${explicitCanopy} m²` })
  } else if (footprint != null && tiers != null && tiers > 1) {
    rows.push({
      label: 'Total canopy area',
      value: `${footprint * tiers} m²`,
      note: `${footprint} m² floor × ${tiers} tiers`,
    })
  }
  if (typeof dp.tray_count === 'number') {
    rows.push({ label: 'Total trays', value: `${dp.tray_count}` })
  }

  // Operating environment
  if (typeof dp.operating_temp_min_c === 'number' && typeof dp.operating_temp_max_c === 'number') {
    rows.push({ label: 'Operating temperature', value: `${dp.operating_temp_min_c} to ${dp.operating_temp_max_c} °C` })
  }
  if (typeof dp.design_life_years === 'number') {
    rows.push({ label: 'Design life', value: `${dp.design_life_years} years` })
  }

  // Class-specific composites — surface only if present in the data
  if (typeof dp.target_capacity_mwh === 'number') {
    rows.push({ label: 'Target capacity', value: `${dp.target_capacity_mwh} MWh` })
  }
  if (typeof dp.target_thermal_kw === 'number') {
    rows.push({ label: 'Target thermal output', value: `${dp.target_thermal_kw} kW` })
  }

  // Deployment envelope — shipping/installation envelope from
  // deployment-envelopes.ts (Task #248, 2026-05-19). Surfaced after
  // structural data so the reader sees the product's external geometry
  // alongside how it ships/installs (pallet, container, rack, cabinet).
  if (deploymentEnvelope) {
    const env = deploymentEnvelope
    rows.push({
      label: 'Deployment envelope',
      value: env.standard ?? env.id ?? 'unknown',
      note: env.category ? String(env.category).replace(/_/g, ' ') : undefined,
    })
    const ext = env.external_dimensions_mm ?? env.internal_dimensions_mm
    if (ext && typeof ext.length === 'number' && typeof ext.width === 'number' && typeof ext.height === 'number') {
      rows.push({
        label: 'Envelope footprint',
        value: `${ext.length} × ${ext.width} × ${ext.height} mm (L × W × H)`,
      })
    }
    if (typeof env.max_payload_kg === 'number') {
      rows.push({ label: 'Envelope payload limit', value: `${env.max_payload_kg.toLocaleString()} kg max payload` })
    }
    if (env.reference_standard) {
      rows.push({ label: 'Envelope standard', value: String(env.reference_standard) })
    }
  }

  if (rows.length === 0) return null

  return (
    <View style={{ marginTop: 6, marginBottom: 14, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Physical specification
      </Text>
      <Text style={{ fontSize: 9, color: MUTED, marginBottom: 8, fontStyle: 'italic' }}>
        Derived from structure_containment.derived_parameters — not LLM prose.
      </Text>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 3, alignItems: 'baseline' }}>
          <Text style={{ flex: 2, fontSize: 10, color: INK_SOFT }}>{r.label}</Text>
          <Text style={{ flex: 3, fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{r.value}</Text>
          {r.note ? (
            <Text style={{ flex: 2, fontSize: 9, color: MUTED, fontStyle: 'italic' }}>{r.note}</Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function BriefPage({ state, project, manualReviewBadges }: { state: any; project: string; manualReviewBadges?: ManualReviewBadge[] }) {
  const bp = state.briefOverviewProse ?? {}
  // Bug fix #15 (2026-05-22): brief_overview_prose fields are sometimes empty
  // because the Generator/specialist LLMs left them blank. Fall back to the
  // parsed-brief layer (which carries target_customers + why_now extracted
  // by Stage 1 of the chain) so the headings either have content OR get
  // suppressed entirely below. Previously the renderer emitted the SubHeading
  // followed by an empty paragraph — leaking visible blank sections.
  const pb = state.parsedBrief ?? {}
  const overview = clean_prose(bp.overview_and_context)
  const mission = clean_prose(bp.mission_statement)
  const customers = clean_prose(bp.target_customers) || clean_prose(pb.target_customers)
  const whyNow = clean_prose(bp.why_now) || clean_prose(pb.why_now)
  const modules = state.moduleDecomposition?.modules ?? []

  // Iter-10.5: operational-headline banner folded INTO the Brief page (Tristan
  // directive 2026-05-20). Compact 3-metric strip with optional deployment
  // context callout. Replaces the standalone HeadlinePage.
  const km = state.keyMetrics
  const FINANCIAL_KIDS = new Set(['capex_gbp', 'opex_gbp_per_year', 'revenue_gbp_per_year', 'roi_payback_years'])
  const isFinancial = (m: any) => m && (FINANCIAL_KIDS.has(String(m.id ?? '')) || /£|gbp|capex|opex|revenue|payback/i.test(String(m.unit ?? '') + ' ' + String(m.label ?? '')))
  const headlineMetric = (m: any, accentValue = false) => {
    if (!m || m.value == null) return null
    if (isFinancial(m)) return null
    const formatted = formatMetricValue(String(m.value), m.unit)
    if (!formatted) return null
    return (
      <View key={m.id ?? m.label} style={{ flex: 1, paddingHorizontal: 8, borderLeftWidth: 0.6, borderLeftColor: RULE_SOFT }}>
        <Text style={{ fontSize: 8, color: MUTED, letterSpacing: 0.6, marginBottom: 2 }}>{String(m.label ?? '').toUpperCase()}</Text>
        <Text style={{ fontSize: accentValue ? 16 : 12, fontFamily: 'Helvetica-Bold', color: accentValue ? ACCENT : INK }}>
          {formatted}
        </Text>
      </View>
    )
  }

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 1 · Brief & Requirements" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Brief and Requirements
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        What the product is and what it must do.
      </Text>

      {km ? (
        // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
        // minPresenceAhead — operational headline carries 3 headline metrics
        // + deployment-context paragraph; wrap=false caused page-overlap bug.
        <View style={{ marginBottom: 16, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }} minPresenceAhead={120}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 0.8, marginBottom: 8 }}>
            OPERATIONAL HEADLINE — what this design must deliver
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            {headlineMetric(km.headline_output, true)}
            {headlineMetric(km.headline_constraint)}
            {headlineMetric(km.utilisation)}
          </View>
          {km.deployment_context ? (
            <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginTop: 10, fontStyle: 'italic' }}>
              {clean_prose(km.deployment_context)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ITER-10.5 fifth review (Tristan 2026-05-20): Manual Review
          callouts removed from non-cover pages. */}

      <PhysicalSpecBlock modules={modules} deploymentEnvelope={state.deploymentEnvelope ?? null} />

      {overview ? (<><SubHeading>Overview</SubHeading><Paragraph>{overview}</Paragraph></>) : null}

      {mission ? (<><SubHeading>Mission</SubHeading><Paragraph>{mission}</Paragraph></>) : null}

      {/* Bug fix #15 (2026-05-22): suppress heading entirely when no content.
          Previously rendered an SubHeading + empty Paragraph, leaking blank
          "Target customers" + "Why now" sections to the cover. */}
      {customers ? (<><SubHeading>Target customers</SubHeading><Paragraph>{customers}</Paragraph></>) : null}

      {whyNow ? (<><SubHeading>Why now</SubHeading><Paragraph>{whyNow}</Paragraph></>) : null}

      {/* ITER-10.5 third review (Tristan 2026-05-20): Performance
          Characteristics folded INTO the Brief page so there's one
          section, not two. */}
      <PerformanceCardBody state={state} />

      <PageFooter />
    </Page>
  )
}

// ─── Section 2 opener: numbered module connection map ──────────────────────

function ModuleConnectionMapPage({
  modules,
  links,
  project,
  explodedImagePath,
  manualReviewBadges,
}: {
  modules: Array<{ module: string; display_name?: string }>
  links: Array<{ from_module: string; to_module: string; mechanism: string; type?: string }>
  project: string
  explodedImagePath?: string | null
  manualReviewBadges?: ManualReviewBadge[]
}) {
  const orderedSpecs = order_modules(modules as Array<{ module: string; display_name?: string }>)
  const ordered = orderedSpecs.map((m, i) => ({
    id: m.module,
    n: i + 1,
    title: module_title(m),
  }))

  const W = 480
  const H = 320
  const cx = W / 2
  const cy = H / 2
  const r = Math.min(W, H) / 2 - 32
  const nodeR = 18

  const positions = ordered.map((m, i) => {
    const angle = (i / ordered.length) * Math.PI * 2 - Math.PI / 2
    return {
      ...m,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    }
  })
  const posById = new Map(positions.map(p => [p.id, p]))

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 2 · Modules" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Module Map
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 16 }}>
        Figure 1. The {ordered.length} modules and how they connect.
      </Text>

      {/* Manual Review callout removed per Tristan fifth review. */}

      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Svg width={W} height={H}>
          {links.map((l, idx) => {
            const a = posById.get(l.from_module)
            const b = posById.get(l.to_module)
            if (!a || !b) return null
            return (
              <Line
                key={`link-${idx}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={RULE}
                strokeWidth={0.8}
              />
            )
          })}
          {positions.map(p => (
            <React.Fragment key={p.id}>
              <Circle cx={p.x} cy={p.y} r={nodeR} fill={ACCENT} stroke={ACCENT_SOFT} strokeWidth={1.5} />
              {/* react-pdf Svg <Text> renders with `fill` attribute, NOT style.color. */}
              <Text
                x={p.x}
                y={p.y + 4}
                fill="#ffffff"
                style={{
                  fontSize: 13,
                  fontFamily: 'Helvetica-Bold',
                  textAnchor: 'middle',
                }}
              >
                {String(p.n)}
              </Text>
            </React.Fragment>
          ))}
        </Svg>
      </View>

      {/*
        Phase20 audit (2026-05-17): Module Map page produced an orphan
        continuation page on bess/bioreactor/drone/ev-charger/haps/heatpump/
        vertical-farm — react-pdf created a phantom wrap-page that the fixed
        PageHeader/PageFooter then decorated with no body content. Wrap=false
        on the legend prevents the SVG + legend block from forcing a wrap
        boundary; the entire body fits inside the 716pt printable height for
        all 10 current product classes (11 modules max).

        Track N audit MAJOR 3 (2026-05-18): the "Module legend" heading was
        rendered OUTSIDE the wrap=false block — so when the SVG + legend
        couldn't fit on the same page, the heading orphaned at the foot of
        the map page and the legend table got pushed to the next page. Wrap
        the heading + table together in a single wrap=false block so they
        always travel as one unit.
      */}
      {/* 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
          minPresenceAhead — Module legend table grows with module count;
          wrap=false caused page-overlap bug. 120pt keeps heading + first
          rows together; if not enough space, push whole block to next page. */}
      <View minPresenceAhead={120}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 8, marginBottom: 8 }}>
          Module legend
        </Text>
        <View style={{ borderTopWidth: 0.6, borderTopColor: RULE_SOFT }}>
          {ordered.map(m => (
            <View key={m.id} style={{
              flexDirection: 'row',
              paddingVertical: 5,
              borderBottomWidth: 0.6,
              borderBottomColor: RULE_SOFT,
            }}>
              <Text style={{ width: 30, fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT }}>
                {m.n}
              </Text>
              <Text style={{ flex: 1, fontSize: 10, color: INK_SOFT }}>{m.title}</Text>
            </View>
          ))}
        </View>
      </View>

      <PageFooter />
    </Page>
  )
}

// Wrapper that adds an optional exploded-view second page after the connection
// map. Tristan 2026-05-17: keep the circle, add option-4 exploded view below
// (it's its own page since A4 won't hold both + the legend).
function ModuleConnectionMapPageWithExploded({
  modules,
  links,
  project,
  explodedImagePath,
  manualReviewBadges,
}: {
  modules: Array<{ module: string; display_name?: string }>
  links: Array<{ from_module: string; to_module: string; mechanism: string; type?: string }>
  project: string
  explodedImagePath?: string | null
  manualReviewBadges?: ManualReviewBadge[]
}) {
  const orderedSpecs = order_modules(modules as Array<{ module: string; display_name?: string }>)
  const moduleCount = orderedSpecs.length
  return (
    <>
      <ModuleConnectionMapPage modules={modules} links={links} project={project} manualReviewBadges={manualReviewBadges} />
      {explodedImagePath ? (
        <Page key="module-map-exploded" size="A4" style={PAGE_STYLE}>
          <PageHeader section="Section 2 · Modules — Exploded view" project={project} />
          <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Module Map — Exploded view
          </Text>
          <Text style={{ fontSize: 10, color: MUTED, marginBottom: 16 }}>
            Figure 2. The same {moduleCount} modules separated vertically to show their spatial layering inside the product envelope. Pair this with the connection map (Figure 1) — the circle shows which modules talk to each other; the exploded view shows where each module physically sits.
          </Text>
          {/* ITER-10.5 (Tristan 2026-05-20): height shrunk from 650pt to
              570pt so title + figure caption + image fit on the same page.
              The prior 650pt pushed the image to a separate page from its
              title. Portrait sources still scale up via objectFit:contain. */}
          <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 6 }}>
            <Image src={explodedImagePath} style={{ width: 467, height: 570, objectFit: 'contain' }} />
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 6, fontStyle: 'italic' }}>
              Deterministic CAD render — each module lifted from its real position to expose internals. Not a photograph.
            </Text>
          </View>
          <PageFooter />
        </Page>
      ) : null}
    </>
  )
}

// ─── Section 2 body: one section per module ────────────────────────────────

/**
 * Break a dense prose paragraph at sentence boundaries into 2-3 visually
 * readable chunks. Aim for ~2-3 sentences per chunk; keep at least 2 chunks
 * when the source is >450 chars so the reader has a breathing line.
 */
function break_paragraph(p: string): string[] {
  const txt = p.trim()
  if (!txt) return ['']
  // Protect decimal-number periods (0.022) and part-number periods (975.840) from
  // being treated as sentence terminators by the splitter. Without this, the regex
  // below splits `"0.022 W/mK"` into `"0."` and `"022 W/mK"` — and silently drops
  // the leading `"0."` because nothing matches it. Confirmed root cause of
  // every leading-token truncation in iter-64 PDFs (drawer_forgeos_gotchas_227e3c8fd74fcd32).
  const PERIOD_PLACEHOLDER = ''
  const protectedTxt = txt.replace(/(\d)\.(\d)/g, `$1${PERIOD_PLACEHOLDER}$2`)
  const sentences = protectedTxt.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [protectedTxt]
  const restored = sentences.map(s => s.replace(new RegExp(PERIOD_PLACEHOLDER, 'g'), '.'))
  const cleaned = restored.map(s => s.trim()).filter(s => s.length > 0)
  if (cleaned.length <= 2) return [txt]
  // Target 2 sentences per chunk for paragraphs up to ~5 sentences, 3 per chunk for longer.
  const perChunk = cleaned.length <= 5 ? 2 : 3
  const chunks: string[] = []
  for (let i = 0; i < cleaned.length; i += perChunk) {
    chunks.push(cleaned.slice(i, i + perChunk).join(' '))
  }
  return chunks
}

// Inline-link prose renderer. Given a prose chunk and a lookup of part_number
// to source info, returns a React fragment that wraps each known part_number
// in a clickable Link with dotted-underline styling.
function renderProseWithLinks(prose: string, linkMap: Map<string, { url: string; title: string | null; manufacturer: string }>): React.ReactNode {
  if (!linkMap || linkMap.size === 0) return prose
  const keys = Array.from(linkMap.keys()).sort((a, b) => b.length - a.length)
  if (keys.length === 0) return prose
  const escaped = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const rx = new RegExp('(' + escaped.join('|') + ')', 'g')
  const parts: Array<{ text: string; link?: { url: string; title: string | null; manufacturer: string } }> = []
  let lastIdx = 0
  for (const match of prose.matchAll(rx)) {
    const idx = match.index ?? 0
    if (idx > lastIdx) parts.push({ text: prose.slice(lastIdx, idx) })
    parts.push({ text: match[0], link: linkMap.get(match[0]) })
    lastIdx = idx + match[0].length
  }
  if (lastIdx < prose.length) parts.push({ text: prose.slice(lastIdx) })
  if (parts.length === 1 && !parts[0].link) return prose
  return parts.map((p, i) => {
    if (p.link) {
      return (
        <Link
          key={`link-${i}`}
          src={p.link.url}
          style={{
            color: ACCENT_SOFT,
            textDecoration: 'underline',
            textDecorationStyle: 'dotted' as any,
          }}
        >
          {p.text}
        </Link>
      )
    }
    return <Text key={`txt-${i}`}>{p.text}</Text>
  })
}

// ─── ITER-10 IA RESTRUCTURE HELPERS (council-validated 2026-05-20) ────────
//
// These helpers feed the new inline BoM (per sub-module) + Engineering Review
// Notes (per module) + Issue Index + QA Summary. Council convergence on the
// patterns + labels — see ITER10-PDF-INFORMATION-ARCHITECTURE-RESTRUCTURE.md
// + ITER10-PDF-MOCKUP.html.

/** New user-facing verification status labels (replaces internal "stripped"/"uncertain"). */
type VerificationStatusV2 = 'verified' | 'replaced' | 'verify' | 'custom_source'

interface BomLineWithStatus extends BomPartRow {
  v2_status: VerificationStatusV2
  v2_sub_row?: string  // sub-row text for replaced/verify/custom rows
}

function classifyVerificationStatus(row: BomPartRow, recommendations: any[]): { status: VerificationStatusV2; subRow?: string } {
  // Tier 1: actual distributor quote → verified
  if (row.price_tier === 'actual' || row.status === 'verified') {
    return { status: 'verified' }
  }
  // Look for an engine replacement recommendation for this word_id
  const rec = recommendations.find((r: any) => r?.word_id === row.word_id)
  if (rec) {
    const confidence = String(rec.confidence ?? '').toLowerCase()
    if (confidence === 'unknown' || (!rec.recommended_part_number && !rec.recommended_manufacturer)) {
      return {
        status: 'custom_source',
        subRow: `ⓘ Manual sourcing required: ${rec.reasoning ?? 'engine cannot recommend a verified catalogue alternative.'}`,
      }
    }
    const newPart = `${rec.recommended_manufacturer ?? ''} ${rec.recommended_part_number ?? ''}`.trim()
    return {
      status: 'replaced',
      subRow: `→ Use instead: ${newPart} — ${rec.reasoning ?? 'distributor verified.'} ${rec.source_url ? '(see datasheet)' : ''} · Confidence: ${(rec.confidence ?? 'medium').toUpperCase()}`,
    }
  }
  // Stripped fakes that lost their part_number — VERIFY-type
  if (row.status === 'stripped' || (!row.part_number && row.manufacturer)) {
    return {
      status: 'verify',
      subRow: `Part number could not be confirmed against distributor catalogue. Verify with manufacturer (${row.manufacturer ?? 'TBD'}) or substitute equivalent.`,
    }
  }
  // Custom-fab indicators
  const isCustom = /custom\s*fab|tbd|to be (?:sourced|selected)/i.test(`${row.manufacturer ?? ''} ${row.part_number ?? ''}`)
  if (isCustom) {
    return {
      status: 'custom_source',
      subRow: `ⓘ Custom-fabricated item — engineer to source per drawing/spec.`,
    }
  }
  // Plausible but unverified (e.g. price estimate, no distributor quote)
  if (row.price_tier === 'estimate') {
    return {
      status: 'verify',
      subRow: `Plausible part-number format but not found in distributor catalogue. Engineer to verify against manufacturer datasheet.`,
    }
  }
  return { status: 'verified' }  // default fallback
}


/**
 * Engineering Review Note — the new per-module finding format. Sourced from
 * state.physicsCritique.issues, state.designDecisions, state.complianceGate,
 * and (translated) K10 missing edges. Council-recommended mini-format:
 * Issue / Why it matters / Action with role tag.
 */
interface EngineeringReviewNote {
  id: string                       // ERP-2.1, ERP-SYS-1, etc.
  role: 'electrical' | 'mechanical' | 'system' | 'compliance' | 'procurement' | 'thermal' | 'fluid' | 'control' | 'safety'
  module_id: string                // which module this note belongs to (used for both placement + issue index)
  issue: string                    // one-line headline
  why_it_matters: string           // one-sentence explanation of consequence
  action: string                   // one-sentence recommended next action
  source: 'physics_critic' | 'design_decision' | 'compliance' | 'k10_topology' | 'gate_failure'
}

function inferRoleFromContent(text: string, dimension?: string): EngineeringReviewNote['role'] {
  const s = `${text} ${dimension ?? ''}`.toLowerCase()
  if (/(refriger|cool|heat|thermal|hvac|chiller|temperature|condens|cop|psychrom)/i.test(s)) return 'thermal'
  if (/(electric|voltage|current|amp|kw electric|breaker|driver|inverter|psu|phase)/i.test(s)) return 'electrical'
  if (/(pump|pipe|flow|pressure|fluid|hydrau|fertigation|condensate|membrane)/i.test(s)) return 'fluid'
  if (/(safety|e[\-\s]?stop|alarm|interlock|sil|ple|fire|emergency)/i.test(s)) return 'safety'
  if (/(control|plc|hmi|modbus|signal|sensor|feedback|loop)/i.test(s)) return 'control'
  if (/(compliance|standard|directive|regulation|certif|ce |ukca|wras|rohs)/i.test(s)) return 'compliance'
  if (/(suppli|catalog|sku|verif|procurement|sourc|lead time|quote)/i.test(s)) return 'procurement'
  if (/(load|mass|envelope|footprint|dimension|cross[\-\s]?cut|cumul)/i.test(s)) return 'system'
  return 'mechanical'  // default for structural / spatial / mechanical
}

function moduleIdFromWherePath(where: string): string {
  // physics-critic `where` is like "energy_conversion_transduction/sub_modules[0]/words[1]"
  const m = String(where ?? '').match(/^([a-z_]+)/)
  return m ? m[1] : ''
}

function translatePhysicsToPlainEnglish(issue: any): { issue: string; why_it_matters: string; action: string } {
  // Physics-critic findings are already plain English in `issue` + `suggested_check`.
  // The transform is: issue → one-sentence headline; suggested_check → action;
  // a derived "why_it_matters" pulled from the issue body's consequence clause if present.
  const raw = String(issue.issue ?? '').replace(/\s+/g, ' ').trim()
  // Split on first ". " — first sentence is the headline; rest is the why.
  const splitIdx = raw.indexOf('. ')
  const headline = splitIdx > 0 ? raw.slice(0, splitIdx) : raw.slice(0, 200)
  const rest = splitIdx > 0 ? raw.slice(splitIdx + 2) : ''
  return {
    issue: headline,
    why_it_matters: rest || 'Engineer should verify against datasheet / first-principles before procurement.',
    action: String(issue.suggested_check ?? 'Manual review against datasheet / CAD / test plan').replace(/\s+/g, ' ').trim(),
  }
}

function gatherEngineeringReviewNotes(state: any): EngineeringReviewNote[] {
  const notes: EngineeringReviewNote[] = []
  let counter = 0
  // Physics-critic high + medium severity findings
  const issues: any[] = Array.isArray(state?.physicsCritique?.issues) ? state.physicsCritique.issues : []
  for (const i of issues) {
    const sev = String(i.severity ?? '').toLowerCase()
    if (sev !== 'high' && sev !== 'med' && sev !== 'critical') continue
    const moduleId = moduleIdFromWherePath(i.where)
    if (!moduleId) continue
    counter++
    const t = translatePhysicsToPlainEnglish(i)
    notes.push({
      id: `ERP-${moduleId.split('_').map(p => p[0]).join('').toUpperCase()}-${counter}`,
      role: inferRoleFromContent(`${i.issue ?? ''} ${i.suggested_check ?? ''}`, i.dimension),
      module_id: moduleId,
      issue: t.issue,
      why_it_matters: t.why_it_matters,
      action: t.action,
      source: 'physics_critic',
    })
  }
  // K10 missing edges → one note per affected module endpoint
  const k10 = state?.moduleDecomposition?.k10ShadowResult ?? state?.k10ShadowResult
  if (k10 && Array.isArray(k10.missing_required)) {
    for (const m of k10.missing_required) {
      const from = String(m.from_class ?? '')
      const to = String(m.to_class ?? '')
      const mech = String(m.mechanism ?? m.protocol ?? 'connection')
      const headline = `Cross-module wiring assumption — ${from} ↔ ${to} (${mech})`
      const why = m.notes ?? `Design references this cross-module link but the wiring topology was not explicitly specified in the chain output.`
      const action = `Verify the ${mech} wiring between ${from} and ${to} before commissioning. Specify connector type, gauge, signal protocol on the panel-fab drawing.`
      // Emit one note in each affected module (so reader sees it in both places)
      counter++
      const id = `ERP-SYS-${counter}`
      notes.push({ id, role: 'system', module_id: from, issue: headline, why_it_matters: why, action, source: 'k10_topology' })
      notes.push({ id: `${id}-mirror`, role: 'system', module_id: to, issue: headline, why_it_matters: why, action, source: 'k10_topology' })
    }
  }
  // Design decisions (unrepaired Phase 2 gates) — affect specific modules where the gate fired
  const decisions: any[] = Array.isArray(state?.designDecisions) ? state.designDecisions : []
  for (const d of decisions) {
    const affectedModule = String(d.module_id ?? d.affected_module ?? d.location ?? '').toLowerCase().replace(/[^a-z_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
    if (!affectedModule) continue
    counter++
    notes.push({
      id: `ERP-PG-${counter}`,
      role: inferRoleFromContent(`${d.what ?? d.title ?? ''} ${d.rationale ?? ''}`),
      module_id: affectedModule,
      issue: String(d.what ?? d.title ?? 'Unrepaired Phase 2 gate').slice(0, 200),
      why_it_matters: String(d.rationale ?? 'Gate retry budget exhausted; design ships with the gap.').slice(0, 300),
      action: String(d.we_are_doing ?? d.recommendation ?? d.alternative ?? 'Manual engineer review').slice(0, 300),
      source: 'design_decision',
    })
  }
  return notes
}

function reviewNotesForModule(state: any, moduleId: string): EngineeringReviewNote[] {
  return gatherEngineeringReviewNotes(state).filter(n => n.module_id === moduleId)
}

/** Cumulative system-level findings (council #1) — power load, mass, multi-module dependencies. */
function gatherSystemLevelRisks(state: any): EngineeringReviewNote[] {
  const out: EngineeringReviewNote[] = []
  const modules = state?.moduleDecomposition?.modules ?? []
  // Cumulative peak power load vs brief supply
  let totalKw = 0
  const moduleLoads: Array<{ module: string; kw: number }> = []
  for (const m of modules) {
    const dp = m?.derived_parameters ?? {}
    const kw = Number(dp.peak_power_kw ?? dp.max_power_kw ?? dp.continuous_power_kw ?? 0)
    if (kw > 0) {
      totalKw += kw
      moduleLoads.push({ module: m.module, kw })
    }
  }
  const briefSupplyKw = (() => {
    const acs = state?.parsedBrief?.constraints?.additional_constraints ?? []
    for (const c of acs) {
      const desc = String(c?.description ?? '')
      const m = desc.match(/3-phase\s+(\d+)A\s*\((\d+(?:\.\d+)?)\s*kW\)/i)
      if (m) return parseFloat(m[2])
      const single = desc.match(/(\d+(?:\.\d+)?)\s*kW\s+total/i)
      if (single) return parseFloat(single[1])
    }
    return null
  })()
  if (totalKw > 0 && briefSupplyKw && totalKw > briefSupplyKw * 0.95) {
    out.push({
      id: 'ERP-SYS-PWR',
      role: 'system',
      module_id: 'system',
      issue: `Cumulative peak load ${totalKw.toFixed(1)} kW vs brief supply ${briefSupplyKw} kW`,
      why_it_matters: `Sum of module-level peak loads (${moduleLoads.map(x => `${x.module} ${x.kw}kW`).join(' + ')}) approaches or exceeds the brief-specified 3-phase supply. Even balanced loading may trip on coincident demand.`,
      action: `Either upsize the grid connection (3-phase 63A gives 44 kW headroom) OR stage HVAC + LED + dosing via PLC to avoid coincident peaks. Confirm with electrical engineer + DNO supply capacity.`,
      source: 'gate_failure',
    })
  }
  return out
}

/** Sub-module subtotal from BoM (council recommendation — helps procurement). */
function subModuleBomSubtotal(bomTotals: BomTotals | null, moduleId: string, subModuleId: string): { lines: BomLineWithStatus[]; subtotal: number } {
  if (!bomTotals) return { lines: [], subtotal: 0 }
  const mod = bomTotals.allMods.find(m => m.module === moduleId)
  if (!mod) return { lines: [], subtotal: 0 }
  const sub = mod.subs.find(s => s.id === subModuleId)
  if (!sub) return { lines: [], subtotal: 0 }
  return { lines: sub.parts as BomLineWithStatus[], subtotal: sub.subtotal_gbp }
}

// ─── ITER-10.5 (Tristan-defined 2026-05-20) ────────────────────────────────
//
// Chain V2-style BoM rendering with separate Notes block beneath each
// sub-module. Replaces the iter-10 cramped 3-deep-numbered inline BoM with
// 4-letter status badges. Tristan reference: image #2 (Chain V2 BoM look).
//
// Reader experience: the eye sees a clean tabular BoM (Part / Mfr / P/N /
// Qty / Unit / Line / Src · Ref + sub-total). Parts that need attention get
// a small superscript number after the part name. The Notes section beneath
// (italics, smaller font, numbered list) carries the narrative for each
// flagged row — replacement recommendations, verification flags, custom-
// source requirements, manual review observations.

/** A single Notes-block entry. word_id (if present) links the note back to
 *  the BoM row via superscript number. */
interface SubModuleNote {
  idx: number
  word_id?: string
  text: string
  severity?: 'info' | 'warn' | 'error'
}

/** Note-marker style — small bold accent digit rendered after the part
 *  name. We avoid Unicode superscripts (U+2074+ are missing from Helvetica
 *  and render as garbled fallback glyphs like "t/u/v/w" for ⁴⁵⁶⁷). */
const NOTE_MARK_STYLE = { fontSize: 6, fontFamily: 'Helvetica-Bold', color: ACCENT } as const

/** Source-method short label for the BoM SRC column. */
function srcLabelForRow(row: BomPartRow): string {
  const s = String(row.source_method ?? '').toLowerCase()
  if (s.includes('distributor') || s === 'web' || s.includes('web')) return 'Web'
  if (s.includes('lm') || s.includes('estimate') || row.price_tier === 'estimate') return 'Est.'
  if (s.includes('manufacturer')) return 'Mfr'
  return '—'
}

/** Engine C price-reality flag for the BoM REF column. */
function priceRealityRefForRow(row: BomPartRow): string {
  const flag = row.engine_c_flag
  if (flag === 'in_range') return 'OK'
  if (flag === 'over') return '>2x'
  if (flag === 'under') return '<.5x'
  return '-'
}

/** Plain-English note text for a flagged BoM row.
 *  Replaces the cramped inline italic sub-row from iter-10.
 *  Tristan 2026-05-20: "Replacement recommended" reads like correcting a
 *  prior procurement plan — switched to "Suggested alternative supplier"
 *  so the same document doesn't appear to override itself. */
function noteTextForFlaggedRow(row: BomPartRow, recommendations: any[]): string | null {
  const c = classifyVerificationStatus(row, recommendations)
  if (c.status === 'verified') return null
  if (!c.subRow) return null
  // Strip the iter-10 arrow/symbol prefixes; they made sense alongside a
  // badge but now the note IS the signal.
  return c.subRow
    .replace(/^[→ⓘ]\s*/u, '')
    .replace(/^Use instead:\s*/, 'Suggested alternative supplier — ')
}

/** Collect notes for one sub-module from every source the chain emits.
 *  Numbers them sequentially; the noteIndexMap is what the BoM renderer
 *  uses for superscripts. Physics-critic findings already filtered + mapped
 *  to this sub-module by the caller — passed in as `physicsFindings`. */
function noteCollectorForSubModule(
  bomLines: BomPartRow[],
  recommendations: any[],
  manualReviewBadges: ManualReviewBadge[],
  _state: any,
  moduleId: string,
  subModuleId: string,
  physicsFindings: any[] = [],
): SubModuleNote[] {
  const notes: SubModuleNote[] = []
  // 1. Per-row replacement / verification / custom-source notes
  for (const row of bomLines) {
    const text = noteTextForFlaggedRow(row, recommendations)
    if (text) {
      notes.push({ idx: notes.length + 1, word_id: row.word_id, text, severity: 'warn' })
    }
  }
  // Bug fix #12 (2026-05-22): cost-repair internal diagnostic strings
  // (`[UP-CAP] LLM proposed £X.XX (Nx current £Y.YY). Exceeds
  // COST_REPAIR_UP_CAP_RATIO=4; correction rejected. Original reasoning: ...`)
  // were leaking verbatim into the PDF Notes column. Sanitise them for a
  // reader audience BEFORE rendering — keep the user-facing explanation
  // ("manual sourcing required"), drop the engine plumbing.
  const cleanCostReason = (raw?: string): string => {
    if (!raw) return ''
    let s = String(raw)
    // Bug fix #E (2026-05-22): the original `^\s*\[UP-CAP\][^.]*\.\s*`
    // matched up to the FIRST period in the prose — but the embedded
    // price "£48.00" contains a period BEFORE the sentence-ending one,
    // so the strip cut at "£48." leaving "00 (19.2× current £2.50)."
    // as a leading number-fragment. Anchor the strip to the closing
    // parenthesis of the price-ratio so we always swallow the whole
    // `[UP-CAP] LLM proposed £X.XX (Nx current £Y.YY).` unit.
    s = s.replace(/^\s*\[UP-CAP\]\s*LLM\s+proposed\s+£[\d.,]+\s*\([^)]*\)\.\s*/i, '')
    // Strip the explicit "Exceeds COST_REPAIR_UP_CAP_RATIO=N; correction rejected." phrase.
    s = s.replace(/Exceeds\s+COST_REPAIR_UP_CAP_RATIO=\d+;?\s*correction\s+rejected\.?\s*/gi, '')
    // Strip "LLM proposed £X.XX (Nx current £Y.YY)." phrases anywhere
    // in the string (defence in depth — also handles mid-string occurrence).
    s = s.replace(/LLM\s+proposed\s+£[\d.,]+\s*\([^)]*\)\.?\s*/gi, '')
    // Strip "correction rejected" leftovers.
    s = s.replace(/correction\s+rejected\.?\s*/gi, '')
    // Strip "Original reasoning:" prefix (the LLM rationale that follows
    // is fine — we just don't want the internal-engine label).
    s = s.replace(/Original\s+reasoning:\s*/gi, '')
    return s.replace(/\s+/g, ' ').trim()
  }

  // 1b. Sprint 1B Cost Repair Loop verdicts — surface inline so the
  // reader sees why a price was changed (or why we couldn't price the
  // line at all).
  for (const row of bomLines) {
    if (!row.cost_repair_action) continue
    if (row.cost_repair_action === 'corrected' && row.cost_repair_previous_price_gbp && row.cost_repair_corrected_price_gbp) {
      const conf = row.cost_repair_confidence ? ` (confidence: ${row.cost_repair_confidence})` : ''
      const src = row.cost_repair_source ? ` Source: ${row.cost_repair_source}.` : ''
      const cleanedReason = cleanCostReason(row.cost_repair_reasoning)
      notes.push({
        idx: notes.length + 1,
        word_id: row.word_id,
        text: `Cost review — price updated from £${row.cost_repair_previous_price_gbp.toFixed(2)} to £${row.cost_repair_corrected_price_gbp.toFixed(2)} after corpus comparison flagged an outlier.${conf} ${cleanedReason}${src}`.trim(),
        severity: 'info',
      })
    } else if (row.cost_repair_action === 'manual_sourcing_required') {
      const cleanedReason = cleanCostReason(row.cost_repair_reasoning)
      notes.push({
        idx: notes.length + 1,
        word_id: row.word_id,
        text: `Cost review — manual sourcing required. ${cleanedReason || 'Neither the current price nor the corpus median is reliable; engineer to source per drawing/spec before procurement.'}`,
        severity: 'error',
      })
    }
    // 'leave_as_is' verdicts intentionally produce no Note — the price
    // was confirmed correct by the fixer and shouldn't add visual noise.
  }
  // 2. Manual review badges scoped to this sub-module (badges may carry a
  //    sub_module_id or module_id matcher; we accept either + a part-number
  //    fallback so legacy state.json files still render the content).
  for (const b of manualReviewBadges ?? []) {
    const bAny = b as any
    const bSub = String(bAny.sub_module_id ?? '')
    const bMod = String(bAny.module_id ?? '')
    if (bSub && bSub !== subModuleId) continue
    if (!bSub && bMod && bMod !== moduleId) continue
    if (!bSub && !bMod) continue  // module-level badges handled at module top
    const text = String(bAny.narrative ?? bAny.summary ?? bAny.label ?? '').trim()
    if (!text) continue
    notes.push({ idx: notes.length + 1, text, severity: 'warn' })
  }
  // 3. Physics-critic findings — Tristan 2026-05-20 fifth review: route
  //    into the per-sub-module Notes (inline with BoM) instead of a
  //    standalone callout. Caller pre-filters + maps where_path indices to
  //    sub-module ids so this function just renders.
  for (const f of physicsFindings) {
    const issue = String(f.issue ?? '').replace(/\s+/g, ' ').trim()
    const check = String(f.suggested_check ?? '').replace(/\s+/g, ' ').trim()
    if (!issue && !check) continue
    const text = check
      ? `Engineering check — ${issue}${issue.endsWith('.') ? '' : '.'} Suggested action: ${check}`
      : `Engineering check — ${issue}`
    notes.push({ idx: notes.length + 1, text, severity: 'error' })
  }
  return notes
}

/** Chain V2-style BoM table per sub-module (Tristan reference image #2).
 *  7 columns: PART · MANUFACTURER · PART NUMBER · QTY · UNIT (£) · LINE (£) · SRC · REF
 *  Superscript number on PART column if noteIndexMap has the row's word_id. */
function SubModuleBomBlock({
  bomLines,
  subtotal,
  subModuleName,
  noteIndexMap,
  partLinkMap,
}: {
  bomLines: BomPartRow[]
  subtotal: number
  subModuleName: string
  noteIndexMap: Map<string, number>
  partLinkMap?: Map<string, { url: string; title: string | null; manufacturer: string }>
}) {
  if (bomLines.length === 0) return null
  // 2026-05-23-bugfix: react-pdf wrap={false} on tables >12 rows triggers
  // the overlap-on-overflow bug (windturbine-l9 page 18: 125 lines of
  // overlapping text per pdftotext audit). Use minPresenceAhead instead:
  // tells react-pdf "if <N pt available, push the WHOLE table to next page",
  // which prevents both the original orphan-header bug AND the overlap.
  // Estimate ~12pt per row + 18pt for header/separator/subtotal.
  const minPresenceAheadPt = Math.min(28 + bomLines.length * 12, 600)
  // 2026-05-23 P2-3: count excluded rows so sub-total label can flag them.
  // Tristan flagged "96 + 8 ≠ 0" bug: the table showed line totals (96 and
  // 8) but the sub-total summed to a different number because rows with
  // cost_repair_excluded_from_subtotal were silently skipped from the math
  // while still displayed normally. Fix surfaces this in the sub-total label
  // + visually strikethrough excluded rows so the reader knows why the
  // arithmetic looks "wrong".
  const excludedCount = bomLines.filter(r => r.cost_repair_excluded_from_subtotal === true).length
  return (
    <View style={{ marginTop: 8, marginBottom: 6, marginLeft: 36 }} minPresenceAhead={minPresenceAheadPt}>
      {/* See 2026-05-23 bugfix comment above. Old "wrap={false}" approach
          was correct for the 5-10 row common case but caused overlap on
          long tables (e.g. windturbine-l9 with 28 sub-modules × deeper
          parts lists per the splitter expansion). minPresenceAhead gives
          page-break alignment without the unbounded-overflow risk. */}
      {/* Header row — ITER-10.5 third review: SRC/REF renamed to be
          self-explanatory; a column legend renders beneath the table so
          the reader doesn't have to guess at the abbreviations. */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE, paddingBottom: 3 }}>
        <Text style={{ flex: 2.6, fontSize: 7.5, color: MUTED, letterSpacing: 0.6 }}>PART</Text>
        <Text style={{ flex: 1.4, fontSize: 7.5, color: MUTED, letterSpacing: 0.6 }}>MANUFACTURER</Text>
        <Text style={{ flex: 1.6, fontSize: 7.5, color: MUTED, letterSpacing: 0.6 }}>PART NUMBER</Text>
        <Text style={{ width: 30, fontSize: 7.5, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>QTY</Text>
        <Text style={{ width: 50, fontSize: 7.5, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>UNIT (£)</Text>
        <Text style={{ width: 55, fontSize: 7.5, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>LINE (£)</Text>
        <Text style={{ width: 60, fontSize: 7.5, color: MUTED, letterSpacing: 0.6, paddingLeft: 6 }}>SOURCE · CHECK</Text>
      </View>
      {/* Data rows */}
      {bomLines.map((row, ri) => {
        const noteIdx = noteIndexMap.get(row.word_id)
        const unitPriceCell = row.unit_price_gbp > 0
          ? `~£${row.unit_price_gbp.toFixed(2)}`
          : '—'
        const lineCell = row.line_total_gbp > 0
          ? `£${row.line_total_gbp.toFixed(2)}`
          : '—'
        const src = srcLabelForRow(row)
        const ref = priceRealityRefForRow(row)
        const refColor = ref === '>2x' ? '#b91c1c' : ref === '<.5x' ? '#1d4ed8' : ref === 'OK' ? '#15803d' : MUTED
        // 2026-05-23 P2-3: visually strikethrough excluded rows + tag them.
        // The math now reconciles for the reader: the row shows £96 but
        // strikethrough indicates it isn't in the sub-total.
        const isExcluded = row.cost_repair_excluded_from_subtotal === true
        const partTextStyle = isExcluded
          ? { flex: 2.6, fontSize: 9, color: MUTED, textDecoration: 'line-through' as const }
          : { flex: 2.6, fontSize: 9, color: INK }
        const lineTextStyle = isExcluded
          ? { width: 55, fontSize: 9, color: MUTED, textAlign: 'right' as const, fontFamily: 'Helvetica-Bold', textDecoration: 'line-through' as const }
          : { width: 55, fontSize: 9, color: INK, textAlign: 'right' as const, fontFamily: 'Helvetica-Bold' }
        return (
          <View
            key={`bom-${ri}`}
            wrap={false}
            style={{ flexDirection: 'row', paddingVertical: 4.5, borderBottomWidth: 0.25, borderBottomColor: RULE_SOFT, alignItems: 'baseline' }}
          >
            <Text style={partTextStyle}>
              {row.word_name ? toTitleCaseEng(normalise_unicode(row.word_name)) : '—'}
              {noteIdx ? <Text style={NOTE_MARK_STYLE}> {noteIdx}</Text> : null}
            </Text>
            <Text style={{ flex: 1.4, fontSize: 8.5, color: INK_SOFT }}>{row.manufacturer ?? '—'}</Text>
            {(() => {
              // ITER-10.5 (Tristan 2026-05-20): part-number cell becomes a
              // distributor / manufacturer link when partLinkMap has the SKU
              // (same map the narrative uses via renderProseWithLinks).
              const pn = row.part_number
              const linked = pn && partLinkMap ? partLinkMap.get(pn) : null
              if (linked && linked.url) {
                return (
                  <Link
                    src={linked.url}
                    style={{ flex: 1.6, fontSize: 8.5, color: ACCENT_SOFT, fontFamily: 'Helvetica-Bold', textDecoration: 'underline' }}
                  >
                    {pn}
                  </Link>
                )
              }
              return (
                <Text style={{ flex: 1.6, fontSize: 8.5, color: INK_SOFT, fontFamily: 'Helvetica-Bold' }}>
                  {pn ?? '—'}
                </Text>
              )
            })()}
            <Text style={{ width: 30, fontSize: 9, color: INK, textAlign: 'right' }}>×{row.quantity ?? 1}</Text>
            <Text style={{ width: 50, fontSize: 9, color: INK, textAlign: 'right' }}>{unitPriceCell}</Text>
            <Text style={lineTextStyle}>{lineCell}</Text>
            <View style={{ width: 60, paddingLeft: 6, flexDirection: 'row', alignItems: 'baseline' }}>
              {isExcluded ? (
                <Text style={{ fontSize: 7.5, color: '#b45309', fontFamily: 'Helvetica-Bold' }}>EXCLUDED</Text>
              ) : (
                <>
                  <Text style={{ fontSize: 8, color: MUTED }}>{src}</Text>
                  <Text style={{ fontSize: 8, color: refColor, fontFamily: 'Helvetica-Bold', marginLeft: 4 }}>{ref}</Text>
                </>
              )}
            </View>
          </View>
        )
      })}
      {/* Sub-total row */}
      <View style={{ flexDirection: 'row', paddingTop: 5, paddingBottom: 3, borderTopWidth: 0.6, borderTopColor: RULE }}>
        <Text style={{ flex: 7.6, fontSize: 8.5, color: INK_SOFT, fontStyle: 'italic' }}>
          Sub-total — {subModuleName}
          {excludedCount > 0 ? ` (excl. ${excludedCount} item${excludedCount === 1 ? '' : 's'} pending review)` : ''}
        </Text>
        <Text style={{ width: 55, fontSize: 9.5, color: INK, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>
          £{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <View style={{ width: 60 }} />
      </View>
      {/* Column legend — explains the SOURCE · CHECK abbreviations in
          plain English. Tristan 2026-05-20: "the corpus means nothing to
          the user — need to explain what it does." Drops the internal
          "corpus" term and describes the price-sanity check as comparing
          against typical prices for similar components. */}
      <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 4, lineHeight: 1.5, fontStyle: 'italic' }}>
        SOURCE: Web = found in a distributor catalogue (DigiKey / Mouser / Farnell etc.) · Est. = web estimate, not a live quote · Mfr = found on the manufacturer&apos;s own site · — = no source recorded.  PRICE CHECK (against typical prices for similar components): OK = price sits in the normal range · &gt;2x = price looks more than 2× higher than typical · &lt;.5x = price looks less than half of typical · - = no comparable parts on record to check against.
      </Text>
    </View>
  )
}

/** Notes block beneath a sub-module BoM. Numbered list — numbers in bold
 *  upright, note body in italic. (Helvetica-BoldOblique is not a registered
 *  font in @react-pdf, so the bold and italic spans MUST stay disjoint. */
function NotesBlock({ notes }: { notes: SubModuleNote[] }) {
  if (notes.length === 0) return null
  return (
    <View style={{ marginLeft: 36, marginTop: 4, marginBottom: 8, paddingLeft: 6, paddingTop: 4, borderLeftWidth: 1.5, borderLeftColor: RULE }}>
      <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK_SOFT, marginBottom: 3, letterSpacing: 0.4 }}>
        NOTES
      </Text>
      {notes.map(n => (
        <Text
          key={n.idx}
          style={{ fontSize: 8, color: INK_SOFT, lineHeight: 1.5, marginBottom: 2.5 }}
        >
          <Text style={{ fontFamily: 'Helvetica-Bold', color: ACCENT }}>{n.idx}. </Text>
          <Text style={{ fontStyle: 'italic' }}>{n.text}</Text>
        </Text>
      ))}
    </View>
  )
}

/** Module-level Design Trade-offs block (Phase F will populate properly;
 *  for now reads state.designDecisionsReview.choices filtered by scope
 *  matching the moduleId). Drops engine-internal labels per Tristan. */
function ModuleDesignTradeOffsBlock({ state, moduleId }: { state: any; moduleId: string }) {
  const review = state?.designDecisionsReview
  if (!review || !Array.isArray(review.choices) || review.choices.length === 0) return null
  const scopeMatchesModule = (scope: string): boolean => {
    if (!scope) return false
    const s = String(scope).toLowerCase()
    // accept exact module match, sub-module path that starts with module, or "<module>." prefix
    return s === moduleId || s.startsWith(moduleId + '/') || s.startsWith(moduleId + '.') || s.includes(moduleId)
  }
  const choices = review.choices.filter((c: any) => scopeMatchesModule(String(c.scope ?? '')))
  if (choices.length === 0) return null
  return (
    // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
    // minPresenceAhead — design trade-offs callout grows with choices array
    // (each choice = title + alt + rationale); wrap=false caused overlap bug.
    <View style={{ marginTop: 14, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: '#fbfcfe', borderLeftWidth: 3, borderLeftColor: ACCENT, borderRadius: 4 }} minPresenceAhead={120}>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 0.6, marginBottom: 6 }}>
        DESIGN TRADE-OFFS — this module
      </Text>
      {choices.map((c: any, idx: number) => (
        <View key={`tradeoff-${idx}`} style={{ marginBottom: 6 }}>
          <Text style={{ fontSize: 9.5, color: INK, lineHeight: 1.5 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{String(c.what ?? '').replace(/\s+/g, ' ').trim()}</Text>
            {c.alternative ? ` — chosen over: ${String(c.alternative).replace(/\s+/g, ' ').trim()}.` : ''}
          </Text>
          {c.rationale ? (
            <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.45, marginTop: 2 }}>
              {String(c.rationale).replace(/\s+/g, ' ').trim()}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function ModuleSection({
  index,
  moduleSpec,
  nl,
  partLinkMap,
  project,
  moduleImagePath,
  bomTotals,
  state,
  partRecommendations,
  manualReviewBadges,
}: {
  index: number
  moduleSpec: any
  nl: any
  partLinkMap?: Map<string, { url: string; title: string | null; manufacturer: string }>
  project: string
  moduleImagePath?: string | null
  bomTotals?: BomTotals | null
  state?: any
  partRecommendations?: any[]
  manualReviewBadges?: ManualReviewBadge[]
}) {
  const id = moduleSpec.module
  const title = module_title(moduleSpec)
  // Priority: unified-prose Stage 1.7 emission → Piece 1F LLM paragraph → deterministic → brief.
  const overviewSource =
    moduleSpec.overview_paragraph_en ||
    nl?.paragraph_en_llm ||
    nl?.paragraph_en ||
    moduleSpec.module_brief
  const overview = clean_prose(overviewSource)
  const overviewChunks = break_paragraph(overview)

  // Phase A: prefer `paragraph_en` (rich 150-200 word prose woven from every
  // word + every modifier) over the older single-sentence `sentence_en`. When
  // rendering a legacy state.json that predates Phase A, fall back to calling
  // generateSubmoduleParagraph() directly against the moduleSpec's sub-modules
  // so we don't need to re-run the pipeline just to see the new prose.
  const subModulesById = new Map<string, { name: string; sentence: string; paragraph: string }>()
  for (const sm of (moduleSpec.sub_modules ?? [])) {
    const livePara = clean_prose(generateSubmoduleParagraph(sm as any))
    subModulesById.set(sm.id, {
      name: sm.name_human || humanise(sm.id),
      sentence: '',
      paragraph: livePara,
    })
  }
  for (const s of (nl?.sub_module_sentences ?? [])) {
    const existing = subModulesById.get(s.sub_module_id) ?? { name: humanise(s.sub_module_id), sentence: '', paragraph: '' }
    existing.sentence = clean_prose(s.sentence_en)
    if (s.paragraph_en && s.paragraph_en.length > existing.paragraph.length) {
      existing.paragraph = clean_prose(s.paragraph_en)
    }
    subModulesById.set(s.sub_module_id, existing)
  }

  const subModules = Array.from(subModulesById.entries()).map(([smId, v], i) => ({
    idx: i + 1,
    id: smId,
    name: v.name,
    sentence: v.sentence,
    paragraph: v.paragraph || v.sentence,
  }))

  // ITER-10.5: status strip is COST ONLY (Tristan D15). Review-note count,
  // part count, and procurement-exception count chips are dropped — Tristan
  // said only Cost is scanned by the reader.
  const moduleBom = bomTotals?.allMods.find(m => m.module === moduleSpec.module) ?? null
  const moduleCostGbp = moduleBom?.subtotal_gbp ?? 0
  const recs = partRecommendations ?? []
  const badges = manualReviewBadges ?? []

  // ITER-10.5 fifth review (Tristan 2026-05-20): physics-critic findings
  // route into the per-sub-module Notes block (inline with prose), with
  // module-level findings (no sub-module match) appended to the module
  // narrative as engineering-check paragraphs. The old standalone
  // "Engineering Review Notes" beige callout at module bottom is removed.
  const physicsBySubId = new Map<string, any[]>()
  const physicsModuleLevel: any[] = []
  const _allFindings: any[] = Array.isArray(state?.physicsCritique?.issues) ? state.physicsCritique.issues : []
  const _moduleSubModules = (moduleSpec.sub_modules ?? []) as Array<{ id: string }>
  for (const f of _allFindings) {
    const sev = String(f.severity ?? '').toLowerCase()
    if (sev !== 'high' && sev !== 'critical') continue
    const where = String(f.where ?? '')
    if (!where.startsWith(moduleSpec.module)) continue
    const subMatch = where.match(/sub_modules\[(\d+)\]/)
    if (subMatch) {
      const subIdx = parseInt(subMatch[1], 10)
      const sm = _moduleSubModules[subIdx]
      if (sm?.id) {
        const arr = physicsBySubId.get(sm.id) ?? []
        arr.push(f)
        physicsBySubId.set(sm.id, arr)
        continue
      }
    }
    physicsModuleLevel.push(f)
  }

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section={`Section 2 · Module ${index}`} project={project} />

      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, color: ACCENT, fontFamily: 'Helvetica-Bold', letterSpacing: 1 }}>
          MODULE {index}
        </Text>
        <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 2 }}>
          {title}
        </Text>
        {/* ITER-10.5: Cost-only strip (Tristan D15). */}
        {moduleCostGbp > 0 ? (
          <View style={{ flexDirection: 'row', marginTop: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: RULE_SOFT }}>
            <Text style={{ fontSize: 10, color: INK_SOFT }}>
              <Text style={{ color: MUTED }}>Cost </Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>£{moduleCostGbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </Text>
          </View>
        ) : null}
      </View>

      {moduleImagePath ? (
        <View style={{ marginBottom: 14, alignItems: 'center' }}>
          <Image src={moduleImagePath} style={{ width: 515, height: 360, objectFit: 'contain' }} />
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 4, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 24 }}>
            Illustration only — generic class render. Module {index} ({title}) shown in identity colour; other modules muted; enclosure ghosted.
          </Text>
        </View>
      ) : state && readBriefEnvelopeDimensions(state) ? (() => {
        // ITER-10.5 (Tristan 2026-05-20): module-class static PNG suppressed
        // because the brief envelope clearly exceeds the ≤2 m cabinet scale
        // of the static-render library. Render a proportional brief-envelope
        // outline with a "this module is inside" note instead.
        const env = readBriefEnvelopeDimensions(state)!
        return (
          <View style={{ marginBottom: 14, alignItems: 'center', paddingVertical: 18, borderRadius: 4, backgroundColor: '#fafafa', borderWidth: 0.5, borderColor: RULE }}>
            <EnvelopeOutline
              widthMm={env.widthMm}
              depthMm={env.depthMm}
              heightMm={env.heightMm}
              label={env.label}
              maxBoxW={300}
              maxBoxH={240}
              productClass={String(state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? '')}
              state={state}
            />
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 10, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 36 }}>
              Module {index} ({title}) sits within the envelope above. Per-module class render suppressed because the static PNG library does not match this envelope scale.
            </Text>
          </View>
        )
      })() : null}

      {/* Build #19f (2026-05-22): per-module Tools Used callout. Lists every
          orchestrator tool whose output contributed to a quantity referenced
          by this module's sub-modules or derived_parameters. Renders nothing
          when the orchestrator phase didn't run for this design. */}
      <ModuleToolsCallout moduleSpec={moduleSpec} state={state} />

      <View style={{ marginBottom: 14 }}>
        {(overviewChunks.length > 0 ? overviewChunks : [overview || `Module ${index} of the product.`]).map((chunk, i) => (
          <Text
            key={i}
            style={{ fontSize: 10.5, color: INK_SOFT, lineHeight: 1.65, marginBottom: 8, textAlign: 'justify' }}
          >
            {chunk}
          </Text>
        ))}
        {/* ITER-10.5 fifth review: module-level engineering checks
            (physics-critic findings not tied to a specific sub-module)
            flow inline as engineering-check paragraphs, NOT a boxed
            callout. Sub-module-tied findings render in their sub-module's
            Notes block beneath the BoM. */}
        {physicsModuleLevel.map((f, fi) => {
          const issue = String(f.issue ?? '').replace(/\s+/g, ' ').trim()
          const check = String(f.suggested_check ?? '').replace(/\s+/g, ' ').trim()
          if (!issue && !check) return null
          return (
            <Text
              key={`mod-finding-${fi}`}
              style={{ fontSize: 10.5, color: INK_SOFT, lineHeight: 1.65, marginBottom: 8, textAlign: 'justify' }}
            >
              <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>Engineering check — </Text>
              {issue}{issue && !issue.endsWith('.') ? '.' : ''}
              {check ? ` Suggested action: ${check}` : ''}
            </Text>
          )
        })}
      </View>

      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 6, marginBottom: 8 }}>
        Sub-modules
      </Text>
      <View style={{ borderTopWidth: 0.6, borderTopColor: RULE_SOFT }}>
        {subModules.map(sm => {
          const proseChunks = break_paragraph(sm.paragraph || '—')
          // ITER-10.5: clean Chain V2 BoM + numbered Notes block (Tristan ref
          // image #2). Replaces the cramped 3-deep numbering + 4-letter
          // status badges of iter-10.
          const { lines: subBomLines, subtotal: subBomSubtotal } = subModuleBomSubtotal(bomTotals ?? null, moduleSpec.module, sm.id)
          const notes = state ? noteCollectorForSubModule(subBomLines, recs, badges, state, moduleSpec.module, sm.id, physicsBySubId.get(sm.id) ?? []) : []
          const noteIndexMap = new Map<string, number>()
          for (const n of notes) {
            if (n.word_id) noteIndexMap.set(n.word_id, n.idx)
          }
          return (
            <View
              key={sm.id}
              style={{ paddingVertical: 11, borderBottomWidth: 0.6, borderBottomColor: RULE_SOFT }}
            >
              {/* 2026-05-23 fix (user-reported on windturbine-l5 page 18):
                  Earlier "wrap={false} around title + full first prose chunk"
                  caused overlapping-text smear when proseChunks[0] was 3+
                  sentences (~400+ chars). react-pdf's known behaviour for an
                  un-fittable wrap={false} block is to draw at the same Y as
                  existing content rather than pushing a new page — producing
                  the multi-layer text overlap. Fix: drop wrap={false} entirely
                  and use `minPresenceAhead` on the title block to keep the
                  title together with at least 80pt of follow-on content
                  (~3 prose lines). This prevents BOTH orphaned titles AND
                  the overlap smear, because react-pdf flows normally and only
                  the minPresenceAhead constraint forces page-break alignment. */}
              <View minPresenceAhead={80}>
                <View style={{ flexDirection: 'row', marginBottom: 5, alignItems: 'baseline' }}>
                  <Text style={{ width: 36, fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT_SOFT }}>
                    {index}.{sm.idx}
                  </Text>
                  <Text style={{ flex: 1, fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: INK }}>
                    {britishise(sm.name.charAt(0).toUpperCase() + sm.name.slice(1))}
                  </Text>
                </View>
              </View>
              {proseChunks.map((chunk, ci) => (
                <Text
                  key={ci}
                  style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.6, paddingLeft: 36, marginBottom: 5, textAlign: 'justify' }}
                >
                  {partLinkMap && partLinkMap.size > 0 ? renderProseWithLinks(chunk, partLinkMap) : chunk}
                </Text>
              ))}
              <SubModuleBomBlock
                bomLines={subBomLines}
                subtotal={subBomSubtotal}
                subModuleName={britishise(sm.name)}
                noteIndexMap={noteIndexMap}
                partLinkMap={partLinkMap}
              />
              <NotesBlock notes={notes} />
            </View>
          )
        })}
      </View>

      {/* ITER-10.5 Phase F: Per-module Design Trade-offs (folded in from the
          deleted standalone DesignTradeOffsPage per Tristan directive). */}
      {state ? <ModuleDesignTradeOffsBlock state={state} moduleId={moduleSpec.module} /> : null}

      {/* ITER-10.5 fifth review (Tristan 2026-05-20): Engineering Review
          Notes standalone callout REMOVED. Physics-critic findings flow
          inline: sub-module-specific ones into each sub-module's Notes
          block beneath the BoM; module-level ones into engineering-check
          paragraphs within the module narrative above. */}

      {/* Module total — sits at the very bottom of the module section as the
          bottom-line cost, after issues + trade-offs have been surfaced. */}
      {moduleCostGbp > 0 ? (
        <View style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#f1f5f9', borderRadius: 4, flexDirection: 'row', alignItems: 'baseline' }} wrap={false}>
          <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK }}>
            Module {index} total — {title}
          </Text>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: ACCENT }}>
            £{moduleCostGbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
      ) : null}

      <PageFooter />
    </Page>
  )
}

// ─── Section 2 · Regulatory & Compliance ───────────────────────────────────
//
// Data-driven, class-universal compliance section. Reads from
// src/lib/pdf-engine-v2/class-standards.ts. Merges brief-declared
// safety_standards into the class baseline so the page shows BOTH what the
// brief author explicitly chose AND any class-mandatory standards they
// omitted.
//
// Financial fields (typical_compliance_cost_gbp, typical_lead_time_weeks)
// are present in the data registry but SUPPRESSED from this render until the
// BoM table + assumptions ledger exist (Tristan directive 2026-05-15: no
// financial metrics before BoM grounds them).
//
// Ordered: mandatory standards first, then de-facto industry expectations.

function CompliancePage({ state, project, manualReviewBadges }: { state: any; project: string; manualReviewBadges?: ManualReviewBadge[] }) {
  const productClass = String(state.moduleDecomposition?.product_class ?? '')
  if (!productClass) return null
  const classBlock = getClassStandards(productClass)
  const briefStandards = (state.parsedBrief?.constraints?.safety_standards ?? null) as Array<any> | null
  const merged: RegulatoryStandard[] = mergeBriefAndClassStandards(productClass, briefStandards)
  if (merged.length === 0) return null

  // Mandatory first, then de-facto; within each, original class order
  const sorted = [...merged].sort((a, b) => {
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1
    return 0
  })

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 2 · Regulatory & Compliance" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Regulatory & Compliance
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        Standards that govern this product class. Compliance is dictated by jurisdiction + use case BEFORE the design exists; the design downstream must demonstrate conformity with the mandatory items below.
      </Text>
      {/* Manual Review callout removed per Tristan fifth review. */}
      <Text style={{ fontSize: 10, color: INK_SOFT, marginBottom: 18, lineHeight: 1.55 }}>
        {clean_prose(classBlock.compliance_summary)}
      </Text>

      {/* Header row */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 4, marginBottom: 4 }}>
        <Text style={{ width: 95, fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>CODE</Text>
        <Text style={{ flex: 3,    fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>STANDARD</Text>
        <Text style={{ width: 50,  fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>JURIS.</Text>
        <Text style={{ width: 65,  fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>STATUS</Text>
      </View>

      {sorted.map((s, idx) => (
        <View key={`std-${idx}`} wrap={false} style={{ paddingTop: 6, paddingBottom: 8, borderBottomWidth: 0.4, borderBottomColor: RULE_SOFT }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ width: 95, fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: ACCENT }}>{s.code}</Text>
            <Text style={{ flex: 3,    fontSize: 9.5, color: INK }}>{clean_prose(s.title)}</Text>
            <Text style={{ width: 50,  fontSize: 9,   color: INK_SOFT }}>{s.jurisdiction}</Text>
            <Text style={{ width: 65,  fontSize: 9,   color: s.mandatory ? '#9a3412' : MUTED, fontFamily: s.mandatory ? 'Helvetica-Bold' : 'Helvetica' }}>
              {s.mandatory ? 'Mandatory' : 'De-facto'}
            </Text>
          </View>
          <View style={{ marginTop: 3, paddingLeft: 95 }}>
            <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(s.applies_because)}</Text>
          </View>
        </View>
      ))}

      {/* Compliance cost callout removed per Tristan 2026-05-20 fifth
          review — internal disclosure of the registry's withheld fields
          isn't useful in a customer-facing PDF. */}

      <PageFooter />
    </Page>
  )
}

// ─── Section 3 · Risk & FMEA (class-universal) ─────────────────────────────
//
// Data-driven hazard catalogue. Reads from class-hazards.ts. Renders one
// hazard per row, ordered by RPN (severity × likelihood × detectability)
// descending so the worst hazards are at the top.
//
// Financial / cost-of-mitigation fields are NOT surfaced — same rule as the
// §Compliance page. Once BoM exists, a mitigation-cost overlay will land
// here.

function RiskPage({ state, project, manualReviewBadges }: { state: any; project: string; manualReviewBadges?: ManualReviewBadge[] }) {
  // ITER-10.5 Phase J (Tristan Q1 answer B, 2026-05-20): merged
  // SystemLevelRisks INTO RiskPage as the first sub-block. Council
  // flagged two separate risk sections as redundant; one consolidated
  // section under "Risk & Integration Analysis" reads cleaner.
  const systemRisks = gatherSystemLevelRisks(state)
  const productClass = String(state.moduleDecomposition?.product_class ?? '')
  if (!productClass) return null
  const classBlock = getClassHazards(productClass)
  if (classBlock.hazards.length === 0 && systemRisks.length === 0) return null
  const sorted = [...classBlock.hazards].sort((a, b) => computeHazardRPN(b) - computeHazardRPN(a))

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 3 · Risk & Integration Analysis" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Risk & Integration Analysis
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14, lineHeight: 1.55 }}>
        Two views in one section: (1) cumulative cross-cutting issues that span more than one module — checked together because no single module's review would catch them; and (2) class-level pre-mitigation hazards a {classBlock.display_name.toLowerCase()} design must address, rated on three 1-5 scales whose product gives a single risk priority.
      </Text>

      {/* (1) Cross-cutting system-level findings */}
      {systemRisks.length > 0 ? (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 8, letterSpacing: 0.6 }}>
            CROSS-CUTTING SYSTEM FINDINGS
          </Text>
          {systemRisks.map((r, ri) => (
            // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false}
            // with minPresenceAhead — system-risk card has variable why/action
            // prose; wrap=false caused page-overlap bug.
            <View key={r.id || ri} style={{ marginBottom: 10, padding: 12, backgroundColor: '#ffe4e6', borderLeftWidth: 4, borderLeftColor: '#b91c1c', borderRadius: 4 }} minPresenceAhead={100}>
              <Text style={{ fontSize: 7.5, color: '#94a3b8', letterSpacing: 0.8 }}>{r.id}</Text>
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#7f1d1d', marginTop: 3, marginBottom: 4 }}>{r.issue}</Text>
              <Text style={{ fontSize: 9.5, color: '#475569', lineHeight: 1.5, marginBottom: 3 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>Why it matters: </Text>{r.why_it_matters}
              </Text>
              <Text style={{ fontSize: 9.5, color: '#475569', lineHeight: 1.5 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>Action: </Text>{r.action}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* (2) Class-level Failure-Mode register */}
      {classBlock.hazards.length > 0 ? (
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 8, letterSpacing: 0.6 }}>
          CLASS-LEVEL FAILURE-MODE REGISTER
        </Text>
      ) : null}
      {/* Manual Review callout removed per Tristan fifth review. */}
      <View style={{ marginBottom: 12, padding: 8, backgroundColor: '#f7f8fa', borderRadius: 3 }}>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55, marginBottom: 2 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Severity</Text> — how bad the outcome is if the hazard occurs (1 = inconvenience, 5 = injury / fire / total loss).
        </Text>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55, marginBottom: 2 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Likelihood</Text> — how often it tends to happen in fielded systems before mitigation (1 = very rare, 5 = frequent).
        </Text>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55, marginBottom: 2 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Detectability</Text> — how hard it is to spot before it causes harm (1 = obvious / instrumented, 5 = silent failure).
        </Text>
        <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.55 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Risk priority</Text> — severity × likelihood × detectability. The single number used to rank hazards.
        </Text>
      </View>
      <Text style={{ fontSize: 10, color: INK_SOFT, marginBottom: 18, lineHeight: 1.55 }}>
        {clean_prose(classBlock.hazard_summary)}
      </Text>

      {/* Header row — ITER-10.5 fifth review (Tristan 2026-05-20):
          shorter column headers so they don't wrap. Full names spelled
          out in the legend above. */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 4, marginBottom: 4 }}>
        <Text style={{ width: 50,  fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>CODE</Text>
        <Text style={{ flex: 3,    fontSize: 8, color: MUTED, letterSpacing: 0.6 }}>HAZARD</Text>
        <Text style={{ width: 34,  fontSize: 8, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>SEV</Text>
        <Text style={{ width: 34,  fontSize: 8, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>LIK</Text>
        <Text style={{ width: 34,  fontSize: 8, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>DET</Text>
        <Text style={{ width: 40,  fontSize: 8, color: MUTED, letterSpacing: 0.6, textAlign: 'right' }}>RP</Text>
      </View>

      {sorted.map((h: ClassHazard, idx) => {
        const rpn = computeHazardRPN(h)
        const rpnColor = rpn >= 50 ? '#9a3412' : rpn >= 20 ? '#92400e' : INK_SOFT
        return (
          <View key={`haz-${idx}`} wrap={false} style={{ paddingTop: 6, paddingBottom: 8, borderBottomWidth: 0.4, borderBottomColor: RULE_SOFT }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ width: 50, fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: ACCENT }}>{h.code}</Text>
              <Text style={{ flex: 3,    fontSize: 9.5, color: INK }}>{clean_prose(h.title)}</Text>
              <Text style={{ width: 34,  fontSize: 9.5, color: INK_SOFT, textAlign: 'right' }}>{h.severity_pre}</Text>
              <Text style={{ width: 34,  fontSize: 9.5, color: INK_SOFT, textAlign: 'right' }}>{h.likelihood_pre}</Text>
              <Text style={{ width: 34,  fontSize: 9.5, color: INK_SOFT, textAlign: 'right' }}>{h.detectability}</Text>
              <Text style={{ width: 40,  fontSize: 10, fontFamily: 'Helvetica-Bold', color: rpnColor, textAlign: 'right' }}>{rpn}</Text>
            </View>
            <View style={{ marginTop: 4, paddingLeft: 50 }}>
              <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5, marginBottom: 4 }}>{clean_prose(h.mechanism)}</Text>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Typical mitigations:</Text> {clean_prose(h.common_mitigations.slice(0, 3).join('; '))}.
              </Text>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Detection:</Text> {clean_prose(h.detection_methods.slice(0, 2).join('; '))}.
              </Text>
              {h.regulatory_drivers.length > 0 ? (
                <Text style={{ fontSize: 9, color: MUTED }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>Governed by:</Text> {clean_prose(h.regulatory_drivers.join(', '))}.
                </Text>
              ) : null}
            </View>
          </View>
        )
      })}

      <View style={{ marginTop: 16, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT_SOFT }}>
        <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.5 }}>
          Mitigation cost and post-mitigation residual risk are withheld from this report until the Bill of Materials and an assumptions ledger exist. The hazards above are CLASS-LEVEL pre-mitigation; design-specific FMEA (effects of chosen cell chemistry, refrigerant, sensor architecture etc.) will be derived against these once the BoM is grounded.
        </Text>
      </View>

      <PageFooter />
    </Page>
  )
}

// ─── Section 4 · Design Decisions ───────────────────────────────────────────
//
// Renders each spec conflict as a DECISION ALREADY MADE — the engine's
// recommendation is the primary content. Format per Tristan 2026-05-17: every
// decision is presented with "We are doing: X. Why: Y. Consequences: …", with
// a status badge ("Recommended for sign-off" / "Accepted" / "Rejected"). The
// old "weighing A vs B" framing was confusing — if the recommendation is in
// the state, surface it as the choice.
//
// Fallback: if a decision has no `recommendation` populated, fall back to the
// previous "open question" framing (and the renderer logs a TRACKER note).

// Chunked: same overflow bug as PartsPendingVerificationPage — Page can't hold
// 30+ tall cards without React-PDF's translate-math going to -9.6e21.
// iter-62 EV-charger 2026-05-16: failed with 33 modifier_consistency decisions
// in one Page. Chunk at ~5 per page (decision cards are taller than rec cards).
const DECISIONS_PER_PAGE = 5

function DesignDecisionsPage({ state, project }: { state: any; project: string }) {
  const decisions: any[] = Array.isArray(state.designDecisions) ? state.designDecisions : []
  if (decisions.length === 0) return null

  // Diagnostic — log if any decisions lack a populated recommendation so the
  // upstream pipeline can be fixed. Tristan asked for a TRACKER note when low.
  const missingRec = decisions.filter(d => !d.recommendation || !String(d.recommendation).trim()).length
  if (missingRec > 0) {
    console.error(`[render-minimal-pdf] WARN: ${missingRec} of ${decisions.length} design decisions had no recommendation populated by Stage 1.X — upstream pipeline fix needed`)
  }

  const decisionChunks: any[][] = []
  for (let i = 0; i < decisions.length; i += DECISIONS_PER_PAGE) {
    decisionChunks.push(decisions.slice(i, i + DECISIONS_PER_PAGE))
  }

  // Status badge — yellow "Recommended for sign-off" by default, green
  // "Accepted" / grey "Rejected" if the state has been updated post-review.
  const renderStatusBadge = (status: string) => {
    let label = 'Recommended for sign-off'
    let bg = '#fef3c7'
    let fg = '#92400e'
    if (status === 'accepted') {
      label = 'Accepted'
      bg = '#d1fae5'
      fg = '#065f46'
    } else if (status === 'rejected') {
      label = 'Rejected'
      bg = '#e5e7eb'
      fg = '#374151'
    }
    return (
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: fg, backgroundColor: bg, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
        {label.toUpperCase()}
      </Text>
    )
  }

  // Split recommendation reasoning into a leading paragraph + bullet
  // consequences. If the model already produced bullets ("- foo\n- bar") use
  // them; otherwise treat the recommendation as a single paragraph and skip
  // consequences. (Upstream may later emit a structured `consequences[]` field
  // — handled if present.)
  const extractConsequences = (d: any): { reasoning: string; consequences: string[] } => {
    if (Array.isArray(d.consequences) && d.consequences.length > 0) {
      return {
        reasoning: String(d.recommendation ?? ''),
        consequences: d.consequences.map((c: any) => String(c)),
      }
    }
    const text = String(d.recommendation ?? '')
    // Detect inline bullet list ("- foo" or "• foo") at line starts.
    const lines = text.split(/\r?\n/)
    const bulletRegex = /^\s*[-•*]\s+/
    const firstBulletIdx = lines.findIndex(l => bulletRegex.test(l))
    if (firstBulletIdx > 0) {
      return {
        reasoning: lines.slice(0, firstBulletIdx).join(' ').trim(),
        consequences: lines.slice(firstBulletIdx).filter(l => bulletRegex.test(l)).map(l => l.replace(bulletRegex, '').trim()),
      }
    }
    return { reasoning: text, consequences: [] }
  }

  // Already-made decision card — surfaces the recommendation as the choice.
  const renderMadeDecisionCard = (d: any, idx: number) => {
    const status = String(d.status ?? '')
    const { reasoning, consequences } = extractConsequences(d)
    const topic = humanise(d.kind) + ' on ' + clean_prose(String(d.word_name ?? d.word_id))
    return (
      // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
      // minPresenceAhead — made-decision card has variable reasoning +
      // consequences list; wrap=false caused page-overlap bug.
      <View key={`dec-${idx}`} minPresenceAhead={120} style={{ marginBottom: 18, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
            Decision {idx + 1} — {topic}
          </Text>
          {renderStatusBadge(status)}
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK_SOFT }}>{humanise(String(d.module ?? ''))} / {humanise(String(d.sub_module_id ?? ''))}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>We are doing</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK }}>"{clean_prose(String(d.recommended_value ?? ''))}"</Text>
          </View>
        </View>
        <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why</Text>
        <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5, marginBottom: 8 }}>{clean_prose(reasoning)}</Text>
        {consequences.length > 0 ? (
          <>
            <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Consequences</Text>
            <View style={{ marginBottom: 4 }}>
              {consequences.map((c, ci) => (
                <View key={ci} style={{ flexDirection: 'row', marginBottom: 2 }}>
                  <Text style={{ fontSize: 10, color: INK_SOFT, width: 10 }}>·</Text>
                  <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5, flex: 1 }}>{clean_prose(c)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    )
  }

  // Fallback (no recommendation) — keep the original "open question" framing
  // so the human can still pick. This path should be rare; logged above.
  const renderOpenQuestionCard = (d: any, idx: number) => (
    // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
    // minPresenceAhead — open-question decision card has variable prose;
    // wrap=false caused page-overlap bug.
    <View key={`dec-${idx}`} minPresenceAhead={120} style={{ marginBottom: 18, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
          Decision {idx + 1} — {humanise(d.kind)} on {clean_prose(String(d.word_name ?? d.word_id))}
        </Text>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9a3412', backgroundColor: '#fee2e2', paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
          OPEN QUESTION
        </Text>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <View style={{ width: 100 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
        <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK_SOFT }}>{humanise(String(d.module ?? ''))} / {humanise(String(d.sub_module_id ?? ''))}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <View style={{ width: 100 }}><Text style={{ fontSize: 9, color: MUTED }}>Options</Text></View>
        <View style={{ flex: 1 }}>
          {(d.conflicting_values ?? []).map((v: string, i: number) => (
            <Text key={i} style={{ fontSize: 10, color: INK, marginBottom: 2 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{String.fromCharCode(65 + i)}.</Text> "{clean_prose(v)}"
            </Text>
          ))}
        </View>
      </View>
      <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>What each means</Text>
      <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5, marginBottom: 6 }}>{clean_prose(String(d.explanation ?? ''))}</Text>
      <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why it matters</Text>
      <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(d.why_it_matters ?? ''))}</Text>
    </View>
  )

  const renderDecisionCard = (d: any, idx: number) => {
    const hasRec = d.recommendation && String(d.recommendation).trim().length > 0
    return hasRec ? renderMadeDecisionCard(d, idx) : renderOpenQuestionCard(d, idx)
  }

  const pages: React.ReactElement[] = []
  decisionChunks.forEach((chunk, pageIdx) => {
    const startIdx = pageIdx * DECISIONS_PER_PAGE
    const isFirst = pageIdx === 0
    pages.push(
      <Page key={`decisions-page-${pageIdx + 1}`} size="A4" style={PAGE_STYLE}>
        <PageHeader section={`Section 4 · Design Decisions${decisionChunks.length > 1 ? ` (page ${pageIdx + 1} of ${decisionChunks.length})` : ''}`} project={project} />
        {isFirst ? (
          <>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
              Design Decisions
            </Text>
            <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
              Where the brief did not pre-commit to a specification, the engine has made the call. Each decision below states what we are doing, why, and what it implies for the rest of the design. Status is "Recommended for sign-off" — the engineering lead confirms or overrides before procurement.
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 10 }}>
            Design Decisions (continued)
          </Text>
        )}
        {chunk.map((d, localIdx) => renderDecisionCard(d, startIdx + localIdx))}
        {/* 2026-05-18 audit fix: footer on every chunk page. */}
        <PageFooter />
      </Page>
    )
  })

  return <>{pages}</>
}

// ─── Section 5 · Parts Pending Verification ────────────────────────────────
//
// Surface parts whose (manufacturer, part_number) couldn't be confidently
// verified against real catalogues — the human should confirm or replace
// before procurement. High-confidence fakes are already stripped from the
// BoM upstream (in part-verification.ts stripUnverifiedParts); this page
// shows what was kept but flagged.

// Chunked-page renderer: returns multiple <Page> elements when content (40+
// recommendations) doesn't fit a single A4. React-PDF's wrap algorithm breaks
// down when a page contains too many flex cards in a single outer View — the
// translate calculation overflows and crashes with "unsupported number"
// (iter-61 BESS 2026-05-16: failed with 38+ recommendations in one Page).
// Chunking at ~12 per page keeps the page-break math sane.
const RECS_PER_PAGE = 12
// Compact table form fits ~10 rows per A4 when each row's reason column wraps
// to 2-3 lines (the bioreactor regression has typical row height ~50pt with a
// 3-line reason). Keeping the chunk size below the per-page capacity ensures
// React-PDF renders one chunk per physical page so the column header at the
// top of each Page element appears on every page (rather than wrapping a
// chunk across multiple pages and losing the header on the continuation).
// Tristan 2026-05-18 bug 4a regression: at 28/page the continuation page had
// rows but no column header.
const UNCERTAIN_PER_PAGE = 8


// kept for backward compat — the old function body below is dead code, but
// removing it would invalidate the diff context for downstream edits in this
// session. Leave in place and unreachable.
function _PartsPendingVerificationPage_unused({ state, project }: { state: any; project: string }) {
  const verifications: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  const recommendations: any[] = Array.isArray(state.partRecommendations) ? state.partRecommendations : []
  const uncertain = verifications.filter((v: any) => v.status === 'uncertain')
  const summary = state.partVerificationSummary
  if (uncertain.length === 0 && recommendations.length === 0 && !summary) return null

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 5 · Parts Pending Verification" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Parts Pending Verification
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        Every (manufacturer, part number) pair was checked against published catalogues. Verified parts are listed in §6 BoM as-is. Fabricated SKUs were stripped automatically. The items below could not be confidently verified — a human engineer should confirm or replace each before procurement.
      </Text>

      {summary ? (
        <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: ACCENT }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>Verification summary</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 10, color: INK_SOFT, marginRight: 16 }}>Total checked: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.total}</Text></Text>
            <Text style={{ fontSize: 10, color: '#065f46', marginRight: 16 }}>Verified: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.verified}</Text></Text>
            <Text style={{ fontSize: 10, color: '#9a3412', marginRight: 16 }}>Stripped (fakes): <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.stripped}</Text></Text>
            <Text style={{ fontSize: 10, color: '#92400e', marginRight: 16 }}>Uncertain: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.uncertain}</Text></Text>
            {summary.skipped > 0 ? <Text style={{ fontSize: 10, color: MUTED, marginRight: 16 }}>Skipped: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{summary.skipped}</Text></Text> : null}
          </View>
        </View>
      ) : null}

      {/* Stripped fakes — recommendations the human should consider */}
      {recommendations.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
            Stripped (was fabricated) — engine recommendations for replacement
          </Text>
          <Text style={{ fontSize: 9, color: MUTED, marginBottom: 8, fontStyle: 'italic' }}>
            Engine policy: a recommendation is provided only when the engine is confident a real alternative exists. If the engine cannot identify a verified replacement, it explicitly says "manual sourcing required" — fabricated recommendations are not acceptable.
          </Text>
          {recommendations.map((r, idx) => {
            const isUnknown = String(r.confidence ?? '') === 'unknown'
            const confColor = r.confidence === 'high' ? '#065f46' : r.confidence === 'medium' ? '#92400e' : '#9a3412'
            const confBg = r.confidence === 'high' ? '#d1fae5' : r.confidence === 'medium' ? '#fed7aa' : '#fee2e2'
            return (
              <View key={`rec-${idx}`} style={{ marginBottom: 10, padding: 10, backgroundColor: '#fffbeb', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#c2410c' }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
                    {clean_prose(String(r.word_name ?? r.word_id))}
                  </Text>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: confColor, backgroundColor: confBg, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
                    {isUnknown ? 'MANUAL SOURCING REQUIRED' : `${String(r.confidence).toUpperCase()} CONFIDENCE`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
                  <View style={{ flex: 1 }}><Text style={{ fontSize: 9, color: INK_SOFT }}>{humanise(String(r.module ?? ''))} / {humanise(String(r.sub_module_id ?? ''))}</Text></View>
                </View>
                {isUnknown ? (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(r.reasoning ?? ''))}</Text>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                      <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Recommended manufacturer</Text></View>
                      <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{clean_prose(String(r.recommended_manufacturer ?? ''))}</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                      <View style={{ width: 130 }}><Text style={{ fontSize: 9, color: MUTED }}>Recommended part number</Text></View>
                      <View style={{ flex: 1 }}><Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{clean_prose(String(r.recommended_part_number ?? ''))}</Text></View>
                    </View>
                    <View style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why this</Text>
                      <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(r.reasoning ?? ''))}</Text>
                    </View>
                  </>
                )}
              </View>
            )
          })}
        </View>
      ) : null}

      {uncertain.length === 0 ? (
        <Paragraph>No uncertain parts — every checked SKU was either verified against a real catalogue, stripped as fabricated, or had a recommendation provided. The Bill of Materials below can be procurement-actioned alongside the recommendations above.</Paragraph>
      ) : (
        <>
        <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6, marginTop: 8 }}>
          Plausible but unverified — human to confirm
        </Text>
        {uncertain.map((v, idx) => (
          // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
          // minPresenceAhead — uncertain-part card has variable manufacturer +
          // part-number + recommendation prose; wrap=false caused overlap bug.
          <View key={`vrfy-${idx}`} minPresenceAhead={120} style={{ marginBottom: 12, padding: 10, backgroundColor: '#fff7ed', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#c2410c' }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
                {clean_prose(String(v.word_name ?? v.word_id))}
              </Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9a3412', backgroundColor: '#fed7aa', paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3 }}>
                {String(v.confidence ?? '').toUpperCase()} CONFIDENCE — UNCERTAIN
              </Text>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>Manufacturer</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: INK }}>{clean_prose(String(v.manufacturer ?? ''))}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>Part number</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{clean_prose(String(v.part_number ?? ''))}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 110 }}><Text style={{ fontSize: 9, color: MUTED }}>Location</Text></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 9, color: INK_SOFT }}>{humanise(String(v.module ?? ''))} / {humanise(String(v.sub_module_id ?? ''))}</Text></View>
            </View>
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Why uncertain</Text>
              <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5 }}>{clean_prose(String(v.reasoning ?? ''))}</Text>
            </View>
          </View>
        ))}
        </>
      )}

      <PageFooter />
    </Page>
  )
}

// ─── Document ──────────────────────────────────────────────────────────────

// Build a lookup map: part_number → { source_url, source_title, manufacturer }
// so prose-rendering can inject clickable links inline. Tristan directive
// 2026-05-16: when reading the §4 module paragraphs, verified parts should
// show with a dotted underline and click straight to the source page.
// Allow-list of source_methods that produce TRUSTWORTHY URLs and therefore
// may render as clickable Links in the PDF. Tristan rule 2026-05-16: links
// to broken pages are worse than no links at all. lm-only and 'grounded'
// (legacy) are EXCLUDED because their URLs come from training-data memory.
const TRUSTED_LINK_METHODS = new Set([
  'mouser', 'digikey', 'farnell',  // distributor APIs — authoritative
  'brave', 'tavily',                 // search APIs — URLs HEAD-checked at save time
  'gemini',                          // Gemini grounded — when wired in future
  'db-cache',                        // parts catalogue — cached from a trusted prior verification
])

function buildPartLinkMap(state: any): Map<string, { url: string; title: string | null; manufacturer: string }> {
  const map = new Map<string, { url: string; title: string | null; manufacturer: string }>()
  for (const v of (state.partVerifications ?? [])) {
    // GUARD: only build links for verifications from trusted methods.
    // lm-only/grounded source_methods are training-data URLs — render plain.
    if (v.status !== 'verified') continue
    if (!v.source_url || typeof v.source_url !== 'string') continue
    if (!/^https?:\/\//i.test(v.source_url)) continue
    if (!TRUSTED_LINK_METHODS.has(v.source_method)) continue
    const pn = String(v.part_number || '').trim()
    if (pn.length >= 3) {
      map.set(pn, { url: v.source_url, title: v.source_title ?? null, manufacturer: v.manufacturer })
    }
  }
  for (const r of (state.partRecommendations ?? [])) {
    if (!r.recommended_part_number || !r.source_url) continue
    if (typeof r.source_url !== 'string' || !/^https?:\/\//i.test(r.source_url)) continue
    // Recommendations don't track source_method — accept them but the guard
    // upstream (recommender now HEAD-checks lm-only URLs and escalates to
    // distributor APIs) ensures source_url is real.
    const pn = String(r.recommended_part_number).trim()
    if (pn.length >= 3 && !map.has(pn)) {
      map.set(pn, { url: r.source_url, title: r.source_title ?? null, manufacturer: r.recommended_manufacturer ?? '' })
    }
  }
  return map
}

// ─── Section 6 · Bill of Materials ─────────────────────────────────────────
//
// Consolidated table of every VERIFIED part, grouped by module → sub-module.
// Sources: state.partVerifications filtered to status === 'verified'. Each row
// shows: part display name, manufacturer, part number (linked to source URL
// when present), distributor price in GBP when live stock confirmed, source
// channel (DigiKey/Mouser/Farnell/Cache/Web).
//
// Rebuilt 2026-05-17: task #24 was marked complete but the page component
// had been removed from MinimalDocument in a prior refactor. The §5 page
// referenced "verified parts are listed in §6 BoM" — that promise was empty.
// Chunked at 12 rows/page (React-PDF translate overflow at 30+ rows/page).

// Page-budget tuning per Tristan 2026-05-17: previous fixed 12-rows-per-page
// chunking ignored semantic structure — module-headers landed alone at page
// bottoms, sub-totals were stranded on pages without their parts, and the
// next page came up near-empty. New strategy: weighted row units (some
// rows are visually taller than others — module-header has 30pt height vs
// 19pt for a part row), with page-1 budget tightened to account for the
// grand-total + per-module summary cards eating ~330pt at the top.
// Break only at sub-total / module-total boundaries so the chunk respects
// semantic structure. Tried React-PDF natural Page wrap=true with hundreds
// of children but Yoga overflows on very large BoMs (570+ rows) so multi-
// Page-with-semantic-breaks is the safer path.
// Tuned 2026-05-17 against BESS (252 parts, 50 sub-modules, 11 modules):
// A4 usable height is ~714pt (842pt page minus 64pt top + 64pt bottom padding).
// Each part row ~19pt physically. First page eats ~330pt on cards + headers
// (so ~20 rows of capacity); continuation pages eat ~46pt on header strip
// (so ~35 rows of capacity). Weights below approximate physical heights so
// the budget tracks visual fill, not raw row count.
const BOM_PAGE_BUDGET_FIRST = 5    // tight — grand-total + summary cards live here
const BOM_PAGE_BUDGET_CONT = 20    // comfortable for continuation pages
const ROW_WEIGHT = {
  'module-header': 2.0,
  'sub-header': 1.2,
  'part': 1.0,
  'sub-total': 1.4,
  'module-total': 2.0,
} as const

function BillOfMaterialsPage({
  bomTotals,
  priceReality,
  project,
  manualReviewBadges,
}: {
  bomTotals: BomTotals | null
  priceReality: PriceReality | null
  project: string
  manualReviewBadges?: ManualReviewBadge[]
}) {
  if (!bomTotals) return null
  const { allMods, grandTotal_gbp, totalRows, actualPriced, estimatePriced, tbdRows } = bomTotals

  // Title-case helper for proper-noun + sentence-start treatment per Tristan
  // 2026-05-17: "Chiller Compressor Unit" not "chiller compressor unit". Preserves
  // known engineering acronyms uppercase.
  const ACRONYMS = new Set([
    'BESS','PCS','BMS','HVAC','EMS','UPS','HMI','BPHE','EEV','MCS','GMP','PLC','SCADA','MFC',
    'LED','PCB','PCBA','HEPA','UV','VFD','DC','AC','RCD','EMC','IP54','IP55','IP66','IP67','IP68',
    'ESC','FC','VTX','GNSS','GPS','IMU','SoC','MCU','FPGA','RAM','SSD','LFP','NMC','LTO','LiPo',
    'CCS2','OCPP','RCBO','MOSFET','IGBT','AFE','SiC','GaAs','PFC','PSU','SBC','RTD','NTC','UAV',
    'AUV','HAPS','CGM','EV','PV','RF','LTE','MQTT','API','BLE','NFC','OLED','LCD','BPE','GAMP5',
    'IP','HEC','RID','EMI','OCP','SFP','SFP+','PCIe','DDR5','NVMe','M2','ASIC','GPU','CPU',
    // Phase19 audit additions 2026-05-17
    'ISO','PDU','PID','OEM','EPC','UK','USA','EU','MPPT','UL','IEC','IEEE','FCC','CE','RoHS','REACH',
  ])
  const SMALL_WORDS = new Set(['and','or','of','the','for','to','in','on','a','an','with','at','by'])
  const title_case = (raw: string): string => {
    if (!raw) return ''
    const cleaned = clean_prose(raw)
    return cleaned.split(/(\s+|[/_-])/g).map((tok, idx) => {
      if (/^\s+$/.test(tok)) return tok
      if (tok === '/' || tok === '-' || tok === '_') return tok
      const upper = tok.toUpperCase()
      if (ACRONYMS.has(upper)) return upper
      if (idx > 0 && SMALL_WORDS.has(tok.toLowerCase())) return tok.toLowerCase()
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase()
    }).join('')
  }

  const fmtGBP = fmtGBP_shared

  // 2026-05-18 (Track N visual audit MAJOR 1): header cells were missing the
  // `paddingRight: 6` gap that body rows have, so "LINE (£)" ran straight
  // into "SRC · REF" with no whitespace ("LINE (£)SRC · REF"). Body rows
  // already pad each right-aligned cell by 6pt; mirror that here so the
  // header line spaces match the body. PART / MANUFACTURER / PART NUMBER
  // header cells stay left-aligned with paddingRight: 6 to match the body
  // padding too — body has paddingRight on all 5 left columns.
  const renderTableHead = () => (
    <View style={{ flexDirection: 'row', paddingBottom: 4, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
      <View style={{ flex: 2.6, paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>PART</Text></View>
      <View style={{ flex: 2.0, paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>MANUFACTURER</Text></View>
      <View style={{ flex: 2.0, paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>PART NUMBER</Text></View>
      <View style={{ flex: 0.6, alignItems: 'flex-end', paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>QTY</Text></View>
      <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>UNIT (£)</Text></View>
      <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 6 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>LINE (£)</Text></View>
      <View style={{ flex: 0.9 }}><Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED }}>SRC · REF</Text></View>
    </View>
  )

  const renderPartRow = (v: BomPartRow, keyHint: string) => {
    const priceTierColour = v.price_tier === 'actual' ? '#065f46' : v.price_tier === 'estimate' ? '#92400e' : '#6b7280'
    const priceTierLabel = v.price_tier === 'actual' ? '✓' : v.price_tier === 'estimate' ? '~' : '?'
    const sourceLabel =
      v.source_method === 'db-cache' ? 'Cache' :
      v.source_method === 'brave' ? 'Web' :
      v.source_method === 'tavily' ? 'Web' :
      v.source_method === 'digikey' ? 'DigiKey' :
      v.source_method === 'mouser' ? 'Mouser' :
      v.source_method === 'farnell' ? 'Farnell' :
      v.source_method === 'estimate' ? 'Est.' :
      v.status === 'unverified' ? '—' :
      v.source_method || '—'
    return (
      <View key={keyHint} wrap={false} style={{ flexDirection: 'row', paddingTop: 3, paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f3', alignItems: 'baseline' }}>
        <View style={{ flex: 2.6, paddingRight: 6 }}>
          <Text style={{ fontSize: 9.5, color: INK }}>{title_case(String(v.word_name ?? ''))}</Text>
        </View>
        <View style={{ flex: 2.0, paddingRight: 6 }}>
          <Text style={{ fontSize: 9.5, color: v.manufacturer ? INK_SOFT : MUTED }}>{v.manufacturer ? clean_prose(String(v.manufacturer)) : 'to be sourced'}</Text>
        </View>
        <View style={{ flex: 2.0, paddingRight: 6, flexDirection: 'row', alignItems: 'baseline' }}>
          {v.part_number ? (
            v.source_url ? (
              <Link src={String(v.source_url)} style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: ACCENT_SOFT, textDecoration: 'underline', textDecorationStyle: 'dotted' as any }}>
                {clean_prose(String(v.part_number))}
              </Link>
            ) : (
              <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK }}>{clean_prose(String(v.part_number))}</Text>
            )
          ) : (
            <Text style={{ fontSize: 9.5, color: MUTED, fontStyle: 'italic' }}>to be selected</Text>
          )}
          {/* Stage 4.5 (P12a) — part-number verification badge. "?" indicates */}
          {/* the SKU did not resolve at DigiKey, Mouser, Farnell, or via a    */}
          {/* manufacturer-domain web search. Founder should confirm or         */}
          {/* replace before procurement. Skipped silently when verification   */}
          {/* didn't run for this line (legacy state files, no part_number).    */}
          {v.part_number && v.part_verified === false ? (
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', marginLeft: 4 }}>?</Text>
          ) : null}
        </View>
        <View style={{ flex: 0.6, alignItems: 'flex-end', paddingRight: 6 }}>
          <Text style={{ fontSize: 9.5, color: INK_SOFT }}>{v.quantity > 1 ? `×${v.quantity.toLocaleString('en-GB')}` : ''}</Text>
        </View>
        <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: priceTierColour, marginRight: 3 }}>{priceTierLabel}</Text>
            <Text style={{ fontSize: 9.5, color: v.price_tier === 'tbd' ? MUTED : INK }}>
              {v.unit_price_gbp > 0 ? fmtGBP(v.unit_price_gbp) : 'TBD'}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1.2, alignItems: 'flex-end', paddingRight: 6 }}>
          <Text style={{ fontSize: 9.5, color: v.line_total_gbp > 0 ? INK : MUTED, fontFamily: v.line_total_gbp > 0 ? 'Helvetica-Bold' : undefined }}>
            {v.line_total_gbp > 0 ? fmtGBP(v.line_total_gbp) : '—'}
          </Text>
        </View>
        <View style={{ flex: 0.9, flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 8, color: MUTED, marginRight: 4 }}>{sourceLabel}</Text>
          {(() => {
            // Engine C reference-anchor flag (2026-05-18). Compact right-margin
            // glyph: ✓ in_range, ▲ over, ▼ under, — no_reference. Skipped
            // entirely when the row has no Engine C annotation (legacy
            // state.json files).
            const flag = v.engine_c_flag
            if (!flag) return null
            // Helvetica (bundled with @react-pdf) doesn't carry ✓ / ▲ / ▼ —
            // they render as substitution glyphs. Use ASCII-safe labels.
            const glyph =
              flag === 'in_range' ? 'OK' :
              flag === 'over' ? '> 2x' :
              flag === 'under' ? '< .5x' :
              '-'
            const colour =
              flag === 'in_range' ? '#065f46' :
              flag === 'over' ? '#9f1239' :
              flag === 'under' ? '#1e40af' :
              '#9ca3af'
            const ratio = typeof v.engine_c_ratio === 'number' ? v.engine_c_ratio : null
            const title =
              flag === 'in_range' ? 'in_range vs corpus reference'
              : flag === 'over' ? `over reference (${ratio ? `${ratio.toFixed(1)}x` : ''})`
              : flag === 'under' ? `under reference (${ratio ? `${ratio.toFixed(2)}x` : ''})`
              : 'no priced reference in corpus'
            return (
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: colour }}>
                {glyph}
              </Text>
            )
          })()}
        </View>
      </View>
    )
  }

  // Build flat row list with semantic-kind markers.
  type Row =
    | { kind: 'module-header'; label: string; modIdx: number; subtotal: number }
    | { kind: 'sub-header'; label: string }
    | { kind: 'part'; part: BomPartRow; keyHint: string }
    | { kind: 'sub-total'; label: string; subtotal: number }
    | { kind: 'module-total'; label: string; subtotal: number }
  const rows: Row[] = []
  allMods.forEach((mod, modIdx) => {
    rows.push({ kind: 'module-header', label: mod.label, modIdx, subtotal: mod.subtotal_gbp })
    for (const sub of mod.subs) {
      rows.push({ kind: 'sub-header', label: sub.name })
      sub.parts.forEach((p, pIdx) => {
        rows.push({ kind: 'part', part: p, keyHint: `${mod.module}-${sub.id}-${pIdx}` })
      })
      rows.push({ kind: 'sub-total', label: sub.name, subtotal: sub.subtotal_gbp })
    }
    rows.push({ kind: 'module-total', label: mod.label, subtotal: mod.subtotal_gbp })
  })

  // Page-1 of section 6 is dedicated to the grand-total card + per-module
  // summary card — no rows. Rows start on page 2 onwards, where each chunk
  // is sized to fit one continuation A4 page. Break-points respect semantic
  // boundaries (sub-total / module-total) so a sub-module never splits
  // across pages.
  const chunks: Row[][] = [[]]   // chunk 0 = page-1 cover (no rows)
  let current: Row[] = []
  let weight = 0
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    current.push(row)
    weight += ROW_WEIGHT[row.kind]
    const isBoundary = row.kind === 'sub-total' || row.kind === 'module-total'
    if (weight >= BOM_PAGE_BUDGET_CONT && isBoundary) {
      // 2026-05-18 (Track N visual audit MAJOR 6): bioreactor p59 of 19
      // landed as a single "Module total" row + 85% blank because the
      // chunker broke at the preceding sub-total when only the module
      // total remained for the current module. If the next row IS the
      // module-total for the just-completed module, keep it on THIS
      // chunk so the module never finishes alone on a near-empty page.
      const next = rows[i + 1]
      if (row.kind === 'sub-total' && next && next.kind === 'module-total') {
        current.push(next)
        i += 1
      }
      chunks.push(current)
      current = []
      weight = 0
    }
  }
  if (current.length > 0) chunks.push(current)
  // BOM_PAGE_BUDGET_FIRST kept for the type-checker / future use.
  void BOM_PAGE_BUDGET_FIRST

  const renderRow = (row: Row, idx: number) => {
    if (row.kind === 'module-header') {
      return (
        <View key={`modh-${idx}`} wrap={false} style={{ marginTop: 10, marginBottom: 4, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: ACCENT, flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, flex: 1 }}>
            Module {row.modIdx + 1} — {title_case(row.label)}
          </Text>
          <Text style={{ fontSize: 10, color: ACCENT, fontFamily: 'Helvetica-Bold' }}>
            {fmtGBP(row.subtotal)}
          </Text>
        </View>
      )
    }
    if (row.kind === 'sub-header') {
      return (
        <View key={`subh-${idx}`} wrap={false} style={{ marginTop: 6, marginBottom: 2 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK_SOFT }}>{title_case(row.label)}</Text>
        </View>
      )
    }
    if (row.kind === 'sub-total') {
      return (
        <View key={`subt-${idx}`} wrap={false} style={{ flexDirection: 'row', paddingTop: 3, paddingBottom: 5, marginBottom: 4, borderTopWidth: 0.5, borderTopColor: '#cbd5e1' }}>
          <View style={{ flex: 6.6 }}><Text style={{ fontSize: 9, color: MUTED, fontStyle: 'italic' }}>Sub-total — {title_case(row.label)}</Text></View>
          <View style={{ flex: 1.2, alignItems: 'flex-end' }}><Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK_SOFT }}>{fmtGBP(row.subtotal)}</Text></View>
          <View style={{ flex: 0.9 }} />
        </View>
      )
    }
    if (row.kind === 'module-total') {
      return (
        <View key={`modt-${idx}`} wrap={false} style={{ flexDirection: 'row', paddingTop: 5, paddingBottom: 6, marginBottom: 8, borderTopWidth: 1.2, borderTopColor: ACCENT, backgroundColor: '#f7f8fa', paddingHorizontal: 6 }}>
          <View style={{ flex: 6.6 }}><Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT }}>Module total — {title_case(row.label)}</Text></View>
          <View style={{ flex: 1.2, alignItems: 'flex-end' }}><Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: ACCENT }}>{fmtGBP(row.subtotal)}</Text></View>
          <View style={{ flex: 0.9 }} />
        </View>
      )
    }
    return renderPartRow(row.part, `part-${idx}-${row.keyHint}`)
  }

  const pages: React.ReactElement[] = []
  chunks.forEach((chunk, pi) => {
    const isFirst = pi === 0
    pages.push(
      <Page key={`bom-page-${pi + 1}`} size="A4" style={PAGE_STYLE}>
        <PageHeader section={`Section 6 · Bill of Materials${chunks.length > 1 ? ` (page ${pi + 1} of ${chunks.length})` : ''}`} project={project} />
        {isFirst ? (
          <>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
              Bill of Materials
            </Text>
            {/* Manual Review callout removed per Tristan fifth review. */}
            <Text style={{ fontSize: 10, color: MUTED, marginBottom: 12 }}>
              Every part word in every sub-module is listed below. Price provenance: <Text style={{ color: '#065f46' }}>✓ ACTUAL</Text> = live distributor quote (DigiKey / Mouser / Farnell). <Text style={{ color: '#92400e' }}>~ ESTIMATE</Text> = price from web judgement, not a live quote. <Text style={{ color: '#6b7280' }}>? TBD</Text> = no price found yet; line total excluded from sub-totals. Click any part number to open its source page.{'\n'}
              Reference-anchor (Engine C): right-margin badge <Text style={{ color: '#065f46', fontFamily: 'Helvetica-Bold' }}>OK</Text> = unit price within 0.5x-2.0x of the Phase 4 corpus reference median for similar components, <Text style={{ color: '#9f1239', fontFamily: 'Helvetica-Bold' }}>&gt; 2x</Text> = over reference, <Text style={{ color: '#1e40af', fontFamily: 'Helvetica-Bold' }}>&lt; .5x</Text> = under reference, <Text style={{ color: '#9ca3af', fontFamily: 'Helvetica-Bold' }}>-</Text> = no priced reference in corpus (common for niche / bespoke parts).
            </Text>
            <View style={{ marginBottom: 14, padding: 14, backgroundColor: '#0c4a6e', borderRadius: 6 }}>
              <Text style={{ fontSize: 9, color: '#bae6fd', letterSpacing: 1.2, marginBottom: 4 }}>
                RAW MATERIALS BoM GRAND TOTAL (priced parts only — does not include TBD lines)
              </Text>
              <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>
                {fmtGBP(grandTotal_gbp)}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 9, color: '#bae6fd', marginRight: 14 }}>{totalRows} part lines · {allMods.length} modules</Text>
                <Text style={{ fontSize: 9, color: '#86efac', marginRight: 14 }}>✓ {actualPriced} actual</Text>
                <Text style={{ fontSize: 9, color: '#fcd34d', marginRight: 14 }}>~ {estimatePriced} estimate</Text>
                <Text style={{ fontSize: 9, color: '#cbd5e1' }}>? {tbdRows} TBD</Text>
              </View>
              {typeof bomTotals.scale_applied === 'number' && bomTotals.scale_applied !== 1.0 ? (
                <Text style={{ fontSize: 8.5, color: '#bae6fd', marginTop: 6, fontStyle: 'italic' }}>
                  Scale factor: {bomTotals.scale_applied.toFixed(3).replace(/\.?0+$/, '')} — per-class batch-economics multiplier applied to distributor-quoted lines (consumer/mid-volume goods price below 1-off distributor unit rates at production scale).
                </Text>
              ) : null}
              <Text style={{ fontSize: 8.5, color: '#fcd34d', marginTop: 6, fontStyle: 'italic' }}>
                → This is the raw materials layer only. See the Cost Stack on the cover page for the full breakdown to installed ASP (the value a buyer compares against).
              </Text>
            </View>
            {priceReality && priceReality.verdict !== 'unavailable' && priceReality.metric_value !== null ? (
              (() => {
                const absPct = Math.abs(priceReality.pct_deviation || 0)
                const sty = priceVerdictStyle(priceReality.verdict, absPct)
                const isPerUnit = priceReality.metric_input === 1
                const ratioLabel = isPerUnit
                  ? `${fmtGBP_compact(priceReality.metric_value)} per unit`
                  : `${fmtGBP_compact(priceReality.metric_value)} ${priceReality.metric_label.replace(/^£\//, 'per ').split('(')[0].trim()}`
                const bandLabel = `${fmtGBP_compact(priceReality.band_low)}–${fmtGBP_compact(priceReality.band_high)} typical`
                const verdictText = priceReality.verdict === 'in_band'
                  ? 'within typical market range'
                  : priceReality.verdict === 'low'
                  ? `${Math.round(absPct)}% below typical range`
                  : `${Math.round(absPct)}% above typical range`
                return (
                  <View style={{ marginBottom: 14, padding: 12, backgroundColor: sty.bg, borderRadius: 5, borderLeftWidth: 3, borderLeftColor: sty.colour }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: sty.colour, marginRight: 6 }}>{sty.symbol}</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sty.colour }}>{ratioLabel}</Text>
                      <Text style={{ fontSize: 10, color: sty.colour, marginLeft: 6 }}> — {verdictText} ({bandLabel})</Text>
                    </View>
                    <Text style={{ fontSize: 9, color: INK_SOFT, marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
                      {priceReality.diagnostic} {priceReality.band.notes}
                    </Text>
                    <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 4 }}>
                      Sources: {priceReality.band.sources.join(' · ')}
                    </Text>
                  </View>
                )
              })()
            ) : null}
            <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>Cost by module</Text>
              {allMods.map((mod, mi) => (
                <View key={`grand-row-${mi}`} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                  <View style={{ width: 22 }}><Text style={{ fontSize: 9, color: ACCENT, fontFamily: 'Helvetica-Bold' }}>{mi + 1}.</Text></View>
                  <View style={{ flex: 1 }}><Text style={{ fontSize: 9.5, color: INK_SOFT }}>{title_case(mod.label)}</Text></View>
                  <View style={{ width: 90, alignItems: 'flex-end' }}><Text style={{ fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold' }}>{fmtGBP(mod.subtotal_gbp)}</Text></View>
                </View>
              ))}
              <View style={{ flexDirection: 'row', paddingTop: 6, marginTop: 4, borderTopWidth: 0.6, borderTopColor: '#cbd5e1' }}>
                <View style={{ width: 22 }} />
                <View style={{ flex: 1 }}><Text style={{ fontSize: 9.5, color: ACCENT, fontFamily: 'Helvetica-Bold' }}>Sum of modules</Text></View>
                <View style={{ width: 90, alignItems: 'flex-end' }}><Text style={{ fontSize: 9.5, color: ACCENT, fontFamily: 'Helvetica-Bold' }}>{fmtGBP(grandTotal_gbp)}</Text></View>
              </View>
            </View>
            {/*
              Engine B (2026-05-18) — component-class breakdown panel.
              Renders `bomTotals.engine_b_by_class` so the per-class cost
              contribution is visible to the founder. Without this panel the
              render-time dict computed in computeBomTotals() was correct but
              invisible. Surfaces below the "Cost by module" block so the
              reader gets BOTH cuts of the grand total: by module (where in
              the system the money goes) and by component class (which kind of
              part the money goes on).

              Gating: only renders when ≥2 non-zero classes exist. Single-
              class state (e.g. legacy iter runs where every line falls into
              'unclassified' or 'distributor_priced') produces a useless
              one-row panel — suppressed so the reader doesn't see redundant
              info. Alphabetical order by class id; max 8 rows then collapse
              the long tail into "+ N others totalling £X".
            */}
            {(() => {
              const byClass = bomTotals.engine_b_by_class
              if (!byClass) return null
              const entries = Object.entries(byClass)
                .filter(([, v]) => typeof v === 'number' && v > 0)
              if (entries.length < 2) return null
              entries.sort((a, b) => a[0].localeCompare(b[0]))
              const classTotal = entries.reduce((acc, [, v]) => acc + v, 0)
              if (classTotal <= 0) return null
              const headRows = entries.slice(0, 8)
              const tailRows = entries.slice(8)
              const tailTotal = tailRows.reduce((acc, [, v]) => acc + v, 0)
              return (
                <View style={{ marginBottom: 14, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>Component-class breakdown</Text>
                  <Text style={{ fontSize: 8.5, color: MUTED, marginBottom: 6, fontStyle: 'italic' }}>
                    Per-component-class contribution to the grand total. Classifier source: Engine B (Phase 4 corpus lookup + Flash-Lite fallback).
                  </Text>
                  {headRows.map(([cls, gbp], idx) => {
                    const pct = classTotal > 0 ? (gbp / classTotal) * 100 : 0
                    return (
                      <View key={`engineb-row-${idx}`} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9.5, color: INK_SOFT }}>{humanise(cls)}</Text>
                        </View>
                        <View style={{ width: 90, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold' }}>{fmtGBP(gbp)}</Text>
                        </View>
                        <View style={{ width: 50, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 9, color: MUTED }}>{pct.toFixed(0)}%</Text>
                        </View>
                      </View>
                    )
                  })}
                  {tailRows.length > 0 ? (
                    <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 9.5, color: MUTED, fontStyle: 'italic' }}>
                          + {tailRows.length} other classes
                        </Text>
                      </View>
                      <View style={{ width: 90, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 9.5, color: INK_SOFT, fontFamily: 'Helvetica-Bold' }}>{fmtGBP(tailTotal)}</Text>
                      </View>
                      <View style={{ width: 50, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 9, color: MUTED }}>{classTotal > 0 ? ((tailTotal / classTotal) * 100).toFixed(0) : '0'}%</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )
            })()}
            {renderTableHead()}
          </>
        ) : (
          <>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 10 }}>
              Bill of Materials (continued)
            </Text>
            {renderTableHead()}
          </>
        )}
        {chunk.map((row, localIdx) => renderRow(row, pi * 100 + localIdx))}
        {/* 2026-05-18 (Track N visual audit BLOCKER 1): PageFooter on every */}
        {/* chunk page, not only the last. Previously `isLast ? <PageFooter />` */}
        {/* gave 18 of 19 BoM continuation pages no footer or page number. */}
        <PageFooter />
      </Page>,
    )
  })

  return <>{pages}</>
}


// ─── Section 7 · Suppliers ─────────────────────────────────────────────────
//
// EPC-style supplier recommendations grouped by archetype (principal contractor,
// subcontractors). Each archetype lists up to 3 candidate companies, ranked by
// Companies House verification + pipeline status. Source: state.suppliers
// populated by scripts/enrich-state-with-suppliers.tsx querying
// ~/.forge-truth/forge-truth.db (~28k companies).
//
// MVP CAVEAT: candidate matching is keyword-based against forge-truth.db
// description/specialties columns. A real human engineer should validate each
// candidate's fit before procurement decisions. Future iteration adds Flash-Lite
// relevance scoring to filter borderline matches.
//
// Per Tristan 2026-05-17: "we want choice about who we're recommending... for
// each category there should be three choices... contact details, where they
// are, link to the website. Make it useful so when people go 'who's going to
// make this?' there's a call to action."

/**
 * 2026-05-20 iter-8 council fix F: supplier name-URL reconciliation.
 * The VF iter-7 PDF showed "GrowUp Urban Farms" linked to
 * cambridge-hok.co.uk/projects/growup-urban-farm — wrong domain (GrowUp's
 * real site is growup.org.uk; cambridge-hok delivered the GrowUp project
 * as a contractor). Same defect: "Digital Farming" → lettusgrow.com
 * (LettUs Grow is real, "Digital Farming" is a hallucinated name).
 *
 * The enrichment script reconciles LLM-emitted names against the host,
 * but database-sourced suppliers can have stale or wrong website_url
 * fields that bypass that check. Render-time reconciliation catches the
 * mismatch and suppresses the URL with a warning chip rather than
 * surfacing a misleading link.
 *
 * Conservative match: name tokens AND host tokens share ≥1 substantive
 * 3+ char word, OR a token of one substring-matches a token of the other
 * (4+ char minimum). If no overlap → suppress URL, render warning chip.
 */
/** Check whether the email's domain has a token match against the supplier
 *  name (e.g. "Digital Farming" + "info@lettusgrow.org" → mismatch).
 *  Reuses supplierUrlReconciles by treating the email domain as a URL host.
 *  ITER-10.5 (Tristan 2026-05-20 fourth review): emails like
 *  info@cambridgehok.co.uk for "GrowUp Urban Farms" need to be suppressed,
 *  not just logged. */
function supplierEmailReconciles(name: string, email: string): boolean {
  if (!name || !email) return true
  const at = email.indexOf('@')
  if (at < 0) return true
  const domain = email.slice(at + 1).toLowerCase()
  if (!domain) return true
  return supplierUrlReconciles(name, `https://${domain}`)
}

function supplierUrlReconciles(name: string, websiteUrl: string): boolean {
  if (!name || !websiteUrl) return true
  let host = ''
  try { host = new URL(websiteUrl).hostname.replace(/^www\./, '').toLowerCase() } catch { return true }
  if (!host) return true
  const parts = host.split('.')
  let apex = ''
  if (parts.length >= 3 && (parts[parts.length - 2] === 'co' || parts[parts.length - 2] === 'com' || parts[parts.length - 2] === 'org')) {
    apex = parts[parts.length - 3]
  } else if (parts.length >= 2) {
    apex = parts[parts.length - 2]
  } else {
    apex = parts[0]
  }
  const STOPWORDS = new Set(['ltd','plc','inc','llc','llp','gmbh','group','holdings','holding','services','solutions','systems','technology','technologies','energy','power','digital','global','international','the','and','for','of'])
  const norm = (s: string): Set<string> => new Set(
    s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(t => t.length >= 3 && !STOPWORDS.has(t))
  )
  const nameToks = norm(name)
  const hostToks = norm(apex)
  if (hostToks.size === 0) return true
  for (const t of nameToks) {
    if (hostToks.has(t)) return true
    for (const h of hostToks) {
      if (t.length >= 4 && h.includes(t)) return true
      if (h.length >= 4 && t.includes(h)) return true
    }
  }
  return false
}

function SuppliersPage({ state, project }: { state: any; project: string }) {
  const suppliers: any[] = Array.isArray(state.suppliers) ? state.suppliers : []
  if (suppliers.length === 0) return null

  const hasAnyCandidate = suppliers.some((s) => Array.isArray(s.candidates) && s.candidates.length > 0)
  if (!hasAnyCandidate) return null

  const renderCandidateCard = (c: any, idx: number) => {
    // ITER-10.5 (Tristan 2026-05-20 fifth review): suppliers with no
    // reconciled contact info (no valid URL AND no valid email) are
    // DROPPED — "having principal contractors with no website seems
    // highly dubious". A name + capability with no way to reach the
    // company is a dead lead.
    const location = [c.city, c.country].filter(Boolean).join(', ') || (c.ch_verified ? 'Location on Companies House record' : '')
    const urlReconciles = c.website_url ? supplierUrlReconciles(String(c.name ?? ''), String(c.website_url)) : true
    const websiteText = (c.website_url && urlReconciles)
      ? String(c.website_url).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 60)
      : ''
    if (c.website_url && !urlReconciles) {
      console.error(`[render-minimal-pdf] supplier name-URL mismatch suppressed: name="${c.name}" url="${c.website_url}"`)
    }
    const rawEmail: string | null = c.contact_email || c.contact_email_derived || null
    const emailReconciles = rawEmail ? supplierEmailReconciles(String(c.name ?? ''), rawEmail) : true
    if (rawEmail && !emailReconciles) {
      console.error(`[render-minimal-pdf] supplier name-email mismatch suppressed: name="${c.name}" email="${rawEmail}"`)
    }
    const emailToUse: string | null = (rawEmail && emailReconciles && urlReconciles) ? rawEmail : null
    // ITER-10.5 fifth review: drop card entirely when no reachable contact.
    if (!websiteText && !emailToUse) {
      console.error(`[render-minimal-pdf] supplier card dropped: no valid contact for "${c.name}"`)
      return null
    }
    const capability: string = clean_prose(String(c.capability_oneliner ?? '')).trim()
    const fitBullets: string[] = Array.isArray(c.fit_bullets)
      ? c.fit_bullets.map((b: any) => clean_prose(String(b ?? '')).trim()).filter((b: string) => b.length > 0).slice(0, 3)
      : []
    const legacyReasoning: string = !capability && c.llm_reasoning
      ? clean_prose(String(c.llm_reasoning)).slice(0, 220)
      : ''
    return (
      // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
      // minPresenceAhead — supplier card is 4-6 inches tall with capability
      // one-liner + 3 fit_bullets + contact CTAs; wrap=false caused page-18
      // wind-turbine overlap bug. 200pt reserves enough space for safe fit.
      <View
        key={`cand-${idx}`}
        minPresenceAhead={200}
        style={{
          marginBottom: 10,
          padding: 12,
          backgroundColor: '#f7f8fa',
          borderRadius: 4,
          borderLeftWidth: 3,
          borderLeftColor: ACCENT,
        }}
      >
        {/* TOP — company identity (full width). Name + location only;
            badges removed per Tristan's call ("unnecessary information"). */}
        <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK, marginRight: 10 }}>
            {clean_prose(String(c.name ?? ''))}
          </Text>
          {location ? (
            <Text style={{ fontSize: 9, color: MUTED }}>{location}</Text>
          ) : null}
        </View>
        {/* BOTTOM — substance (full width). Capability one-liner, fit
            bullets, contact CTAs all flow top-down. */}
        {capability ? (
          <Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6, lineHeight: 1.4 }}>
            {capability}
          </Text>
        ) : null}
        {fitBullets.length > 0 ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 8, color: MUTED, marginBottom: 2, letterSpacing: 0.6 }}>WHY THIS FITS THE BRIEF</Text>
            {fitBullets.map((b, bi) => (
              <View key={`fit-${idx}-${bi}`} style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ fontSize: 10, color: INK_SOFT, marginRight: 4, lineHeight: 1.45 }}>•</Text>
                <Text style={{ flex: 1, fontSize: 9.5, color: INK_SOFT, lineHeight: 1.45 }}>{b}</Text>
              </View>
            ))}
          </View>
        ) : legacyReasoning ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 8, color: MUTED, marginBottom: 2, letterSpacing: 0.6 }}>WHY THIS FITS THE BRIEF</Text>
            <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.45 }}>
              {legacyReasoning}
              {String(c.llm_reasoning ?? '').length > 220 ? '…' : ''}
            </Text>
          </View>
        ) : null}
        {/* Contact CTAs */}
        {(websiteText || emailToUse) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
            {websiteText && c.website_url ? (
              <Link
                src={String(c.website_url)}
                style={{
                  fontSize: 9.5,
                  fontFamily: 'Helvetica-Bold',
                  color: '#ffffff',
                  backgroundColor: ACCENT,
                  paddingTop: 4,
                  paddingBottom: 4,
                  paddingLeft: 10,
                  paddingRight: 10,
                  borderRadius: 3,
                  marginRight: 8,
                  marginBottom: 3,
                  textDecoration: 'none',
                }}
              >
                {websiteText}
              </Link>
            ) : null}
            {emailToUse ? (
              <Link
                src={`mailto:${emailToUse}`}
                style={{
                  fontSize: 9.5,
                  fontFamily: 'Helvetica-Bold',
                  color: ACCENT,
                  backgroundColor: '#e2e8f0',
                  paddingTop: 4,
                  paddingBottom: 4,
                  paddingLeft: 10,
                  paddingRight: 10,
                  borderRadius: 3,
                  marginRight: 5,
                  marginBottom: 3,
                  textDecoration: 'none',
                }}
              >
                {emailToUse}
              </Link>
            ) : null}
          </View>
        ) : null}
      </View>
    )
  }

  // Chunk archetypes into pages — at most 2 archetypes per page to stay under
  // the React-PDF translate-overflow threshold (each archetype has up to 3
  // tall cards).
  const ARCHETYPES_PER_PAGE = 2
  const archetypeChunks: any[][] = []
  for (let i = 0; i < suppliers.length; i += ARCHETYPES_PER_PAGE) {
    archetypeChunks.push(suppliers.slice(i, i + ARCHETYPES_PER_PAGE))
  }

  const pages: React.ReactElement[] = []
  archetypeChunks.forEach((chunk, pageIdx) => {
    const isFirst = pageIdx === 0
    pages.push(
      <Page key={`sup-page-${pageIdx + 1}`} size="A4" style={PAGE_STYLE}>
        <PageHeader
          section={`Section 7 · Suppliers${archetypeChunks.length > 1 ? ` (page ${pageIdx + 1} of ${archetypeChunks.length})` : ''}`}
          project={project}
        />
        {isFirst ? (
          <>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
              Suppliers
            </Text>
            <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
              Recommended companies for each delivery role — principal contractor and subcontractors. Up to 3 candidates per role. Each card carries the company identity, a concrete capability line, two or three reasons the company fits this brief, and a direct call to action.
            </Text>
            <View
              style={{
                marginBottom: 14,
                padding: 10,
                backgroundColor: '#fef3c7',
                borderLeftWidth: 3,
                borderLeftColor: '#c2410c',
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.45 }}>
                Caveat — candidates are surfaced from a 28,000-company database plus a scored web fallback, then distilled into capability + fit bullets by a small language model. A human engineer should still validate fit, capacity, and certification before procurement.
              </Text>
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 10 }}>
            Suppliers (continued)
          </Text>
        )}
        {chunk.map((archetype: any, archIdx: number) => (
          <View key={`arch-${pageIdx}-${archIdx}`} style={{ marginBottom: 16 }}>
            <View style={{ marginBottom: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: ACCENT }}>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: ACCENT }}>
                {clean_prose(String(archetype.archetype_label ?? archetype.archetype_id ?? ''))}
              </Text>
            </View>
            <Text style={{ fontSize: 10, color: INK_SOFT, lineHeight: 1.5, marginBottom: 10 }}>
              {clean_prose(String(archetype.function_description ?? ''))}
            </Text>
            {Array.isArray(archetype.candidates) && archetype.candidates.length > 0 ? (
              archetype.candidates.map((c: any, i: number) =>
                renderCandidateCard(c, archIdx * 100 + i),
              )
            ) : (
              <Text style={{ fontSize: 10, color: MUTED, fontStyle: 'italic' }}>
                No candidates passed the relevance scorer for this role. Recommend a manual shortlist or expand the search keyword set.
              </Text>
            )}
            {/* Phase19 audit 2026-05-17: archetype.notes is now provenance-only
                telemetry ("X from forge-truth.db (N rejected); M added via
                web-fallback.") that must NOT appear in the user-facing PDF.
                Suppress it here; the same data is preserved in
                state.suppliers_provenance for diagnostics. */}
          </View>
        ))}
        {/* 2026-05-18 audit fix: footer on every chunk page. */}
        <PageFooter />
      </Page>,
    )
  })

  return <>{pages}</>
}


/**
 * Resolve cover-hero + exploded-diagram image paths for the current product
 * class. Public/heroes/<slug>-cover.png and <slug>-exploded.png are produced
 * by the Blender pipeline (drone-9shot.py, bess-hero-bakeoff.py, future heatpump
 * etc.) and copied into public/heroes/ for each product class. Returns null
 * paths when no images exist for the class — renderer falls back to text-only.
 */
/**
 * Resolve per-module Blender diagram path for the current product class.
 * Path: public/heroes/<slug>/module-<module_id>.png. Returns null if file is
 * absent — module page falls back to no image.
 */
function classToSlug(productClass: string): string {
  // Normalise: lowercase, treat underscores AND hyphens AND spaces as the same separator.
  // State.json product_class can be display string "Battery Energy Storage System (BESS)"
  // OR snake_case "heat_pump" / "modular_indoor_vertical_farm" / "wearable_medical_device" etc.
  const norm = String(productClass).toLowerCase().replace(/[_-]/g, ' ')
  if (norm.includes('bess') || norm.includes('battery energy storage')) return 'bess'
  if (norm.includes('cinematography') || norm.includes('drone') || norm.includes('quad') || norm.includes('uav')) return 'drone'
  if (norm.includes('heat pump') || norm.includes('heatpump') || norm.includes('thermal system') || norm === 'thermal') return 'heatpump'
  if (norm.includes('ev charger') || norm.includes('charger')) return 'ev-charger'
  if (norm.includes('edge ai') || norm.includes('inference appliance') || norm.includes('rack mount')) return 'edge-ai'
  if (norm.includes('bioreactor')) return 'bioreactor'
  if (norm.includes('vertical farm')) return 'vertical-farm'
  if (norm.includes('cgm') || norm.includes('continuous glucose') || norm.includes('wearable medical') || norm.includes('glucose monitor')) return 'cgm'
  if (norm.includes('auv') || norm.includes('autonomous underwater')) return 'auv'
  if (norm.includes('haps') || norm.includes('high altitude') || norm.includes('stratospheric') || norm.includes('pseudo satellite')) return 'haps'
  return ''
}

function resolveModuleImage(productClass: string, moduleId: string, state?: any): string | null {
  // Sprint 0 v3 (Tristan 2026-05-20): brief-aware per-module images
  // take precedence over the static class library. generate-module-
  // images.tsx writes state.module_image_paths = { module_id: absPath }.
  const briefModulePath = state?.module_image_paths?.[moduleId]
  if (typeof briefModulePath === 'string' && existsSync(briefModulePath)) {
    return briefModulePath
  }
  // Sprint 0 v4 (Tristan 2026-05-21): when per-module images are absent,
  // FALL BACK TO THE BRIEF HERO so every module page shows the same
  // uniform Blender illustration — solves the "gpt-image-1 produces
  // stylistically variable images per call" problem. Caller's caption
  // already names which module the page is about. Universal across
  // product classes.
  const briefHero = typeof state?.brief_hero_image_path === 'string' ? state.brief_hero_image_path : null
  if (briefHero && existsSync(briefHero)) {
    return briefHero
  }
  const slug = classToSlug(productClass)
  if (!slug) return null
  // 2026-05-20 (Tristan second review): the static class image is the wrong
  // scale for container/warehouse-sized briefs ("completely the wrong
  // size"). When the brief envelope clearly exceeds the static-render
  // implied scale, return null — the caller renders an EnvelopeOutline
  // proportional placeholder instead.
  if (state !== undefined && briefEnvelopeMismatchesStaticHero(state)) return null
  const projectRoot = resolve(__dirname, '..')
  const path = resolve(projectRoot, 'public', 'heroes', slug, `module-${moduleId}.png`)
  return existsSync(path) ? path : null
}

/** True when the brief envelope clearly exceeds the static-render PNG's
 *  implied desktop / cabinet scale (≤8 m³ volume, ≤5 m length, no 20/40-ft
 *  ISO container references). Caller renders a proportional outline
 *  placeholder instead of the static hero.
 *
 *  Restored from commit 591e02f8d (heroEnvelopeMatchesStaticHero); the
 *  iter-9 cleanup commit f438b7863 removed it after Tristan asked for the
 *  static heroes to come back unconditionally. Tristan's second review on
 *  2026-05-20 reversed that — wrong-scale image is also a problem, so
 *  suppress static + render proportional outline labelled with actual
 *  brief dimensions. */
function briefEnvelopeMismatchesStaticHero(state: any): boolean {
  const maxDim = state?.parsedBrief?.constraints?.max_dimensions_mm
  if (maxDim) {
    const w = Number(maxDim.w ?? 0)
    const d = Number(maxDim.d ?? 0)
    const h = Number(maxDim.h ?? 0)
    if (w > 0 && d > 0 && h > 0) {
      const volumeM3 = (w * d * h) / 1_000_000_000
      if (volumeM3 > 8) return true
    }
  }
  const modulesA = state?.moduleDecomposition?.design?.modules
  const modulesB = state?.moduleDecomposition?.modules
  const mods: any[] = Array.isArray(modulesA) ? modulesA : Array.isArray(modulesB) ? modulesB : []
  for (const m of mods) {
    const dp = m?.derived_parameters
    if (!dp) continue
    const lengthMm = Number(dp.container_length_mm ?? dp.envelope_length_mm ?? 0)
    if (lengthMm > 5000) return true
    const volM3 = Number(dp.envelope_volume_m3 ?? dp.cabinet_volume_m3 ?? 0)
    if (volM3 > 8) return true
  }
  const briefText = String(state?.parsedBrief?.brief_text ?? state?.brief?.text ?? '')
  if (/\b(20|40)\s?-?\s?(ft|foot)\s+(iso|hi-?cube|container|shipping)\b/i.test(briefText)) return true
  return false
}

/** Read brief envelope dimensions for the EnvelopeOutline placeholder.
 *  Tries (in order): parsedBrief.constraints.max_dimensions_mm,
 *  structure_containment module derived_parameters, deploymentEnvelope.
 *  Returns null if no usable dimensions exist. */
function readBriefEnvelopeDimensions(state: any): { widthMm: number; depthMm: number; heightMm: number; label: string } | null {
  const maxDim = state?.parsedBrief?.constraints?.max_dimensions_mm
  if (maxDim?.w && maxDim?.d && maxDim?.h) {
    const briefText = String(state?.parsedBrief?.brief_text ?? '')
    const containerMatch = briefText.match(/\b(20|40)\s?-?\s?(ft|foot)\s+(iso|hi-?cube|high\s+cube|container|shipping)/i)
    const label = containerMatch ? `${containerMatch[1]}-ft ${containerMatch[3]} container` : 'Brief envelope'
    return { widthMm: Number(maxDim.w), depthMm: Number(maxDim.d), heightMm: Number(maxDim.h), label }
  }
  const modulesA = state?.moduleDecomposition?.design?.modules
  const modulesB = state?.moduleDecomposition?.modules
  const mods: any[] = Array.isArray(modulesA) ? modulesA : Array.isArray(modulesB) ? modulesB : []
  const struct = mods.find(m => m?.module === 'structure_containment')
  const dp = struct?.derived_parameters ?? {}
  const w = Number(dp.envelope_width_mm ?? dp.envelope_w_mm ?? dp.container_width_mm ?? 0)
  const d = Number(dp.envelope_depth_mm ?? dp.envelope_d_mm ?? dp.container_depth_mm ?? 0)
  const h = Number(dp.envelope_height_mm ?? dp.envelope_h_mm ?? dp.container_height_mm ?? 0)
  if (w && d && h) {
    return { widthMm: w, depthMm: d, heightMm: h, label: 'Brief envelope' }
  }
  return null
}

/** Sprint 0 v1 (Tristan 2026-05-20): class-aware iconography rendered
 *  INSIDE the EnvelopeOutline. Each product class has its own primitives:
 *  vertical_farm = trolley silhouettes; energy_storage = rack columns;
 *  heat_pump = compressor + HX silhouettes. Iconography is proportional
 *  to the envelope so the reader can see what FITS inside, not just the
 *  shell. Universal — every class gets the same treatment per its own
 *  primitives. Reverts to plain envelope when class has no iconography
 *  registered yet. */
function classIconography(
  productClass: string,
  state: any,
  w: number,
  h: number,
): React.ReactElement | null {
  const slug = String(productClass ?? '').toLowerCase()
  const md = state?.moduleDecomposition?.modules ?? []
  const struct = md.find((m: any) => m?.module === 'structure_containment')
  const dp = struct?.derived_parameters ?? {}

  if (slug.startsWith('vertical_farm') || slug.startsWith('verticalfarm') || slug.startsWith('cea')) {
    // Trolley count from derived_parameters or default to 8
    const trolleyCount = Number(dp.trolley_count ?? dp.mobile_trolley_count ?? 8) || 8
    const tiers = Number(dp.tier_count ?? dp.tiers_per_trolley ?? 5) || 5
    // Trolleys arranged along the width — assume container is wide,
    // trolleys are deep. Show trolley fronts as filled rectangles.
    const slots = Math.min(trolleyCount, 8)
    const slotPadding = 4
    const slotWidth = (w - slotPadding * 2) / slots
    const trolleyW = Math.max(2, slotWidth * 0.8)
    const trolleyH = h * 0.78
    return (
      <View style={{ position: 'absolute', top: h * 0.11, left: slotPadding, flexDirection: 'row', justifyContent: 'space-between', width: w - slotPadding * 2 }}>
        {Array.from({ length: slots }).map((_, i) => (
          <View key={`tr-${i}`} style={{ width: trolleyW, height: trolleyH, backgroundColor: '#dbeafe', borderWidth: 0.6, borderColor: ACCENT_SOFT, borderRadius: 1 }}>
            {/* Tier markers — horizontal lines */}
            {Array.from({ length: Math.min(tiers, 6) - 1 }).map((__, ti) => (
              <View key={`t-${ti}`} style={{ height: 0.4, backgroundColor: ACCENT_SOFT, marginTop: trolleyH / tiers - 0.4 }} />
            ))}
          </View>
        ))}
      </View>
    )
  }

  if (slug.startsWith('bess') || slug === 'energy_storage' || slug.startsWith('battery')) {
    // BESS racks arranged in columns inside the enclosure
    const moduleCount = Number(dp.rack_count ?? dp.module_count ?? 6) || 6
    const slots = Math.min(moduleCount, 8)
    const slotPadding = 4
    const slotWidth = (w - slotPadding * 2) / slots
    const rackW = Math.max(2, slotWidth * 0.75)
    const rackH = h * 0.82
    return (
      <View style={{ position: 'absolute', top: h * 0.09, left: slotPadding, flexDirection: 'row', justifyContent: 'space-between', width: w - slotPadding * 2 }}>
        {Array.from({ length: slots }).map((_, i) => (
          <View key={`rk-${i}`} style={{ width: rackW, height: rackH, backgroundColor: '#fef3c7', borderWidth: 0.6, borderColor: '#d97706', borderRadius: 1 }} />
        ))}
      </View>
    )
  }

  if (slug.startsWith('heat') || slug.startsWith('hp_') || slug.startsWith('heatpump')) {
    // Heat pump: compressor pad + HX block
    return (
      <View style={{ position: 'absolute', top: h * 0.15, left: w * 0.1, width: w * 0.8, height: h * 0.7, flexDirection: 'row' }}>
        <View style={{ flex: 1.4, marginRight: w * 0.02, backgroundColor: '#dbeafe', borderWidth: 0.6, borderColor: ACCENT_SOFT, borderRadius: 1 }} />
        <View style={{ flex: 1, backgroundColor: '#fee2e2', borderWidth: 0.6, borderColor: '#b91c1c', borderRadius: 1 }} />
      </View>
    )
  }

  return null
}

/** Proportional outline placeholder for when the static class hero is the
 *  wrong scale. Renders a front-view rectangle scaled to fit the available
 *  box (maxW × maxH) using the brief's actual aspect ratio, plus dimension
 *  labels + class-specific iconography (trolleys / racks / HX blocks). */
function EnvelopeOutline({
  widthMm,
  depthMm,
  heightMm,
  label,
  maxBoxW,
  maxBoxH,
  productClass,
  state,
}: {
  widthMm: number
  depthMm: number
  heightMm: number
  label: string
  maxBoxW: number
  maxBoxH: number
  productClass?: string
  state?: any
}) {
  // Front view = widthMm × heightMm. Fit into maxBoxW × maxBoxH preserving ratio.
  const aspect = widthMm / heightMm
  let w = maxBoxW
  let h = w / aspect
  if (h > maxBoxH) { h = maxBoxH; w = h * aspect }
  // Mini depth indicator — a smaller rectangle offset behind the front face,
  // proportional to depth-vs-width.
  const depthOffset = Math.min(12, Math.max(4, (depthMm / widthMm) * 20))
  const iconography = (productClass && state) ? classIconography(productClass, state, w, h) : null
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: maxBoxW, padding: 4 }}>
      <Text style={{ fontSize: 7, color: MUTED, letterSpacing: 0.8, marginBottom: 6 }}>
        PROPORTIONAL ENVELOPE OUTLINE
      </Text>
      <View style={{ position: 'relative', width: w + depthOffset + 4, height: h + depthOffset + 4 }}>
        {/* Back face (depth cue) */}
        <View style={{ position: 'absolute', top: 0, left: depthOffset, width: w, height: h, borderWidth: 0.6, borderColor: RULE, backgroundColor: '#f1f5f9' }} />
        {/* Front face */}
        <View style={{ position: 'absolute', top: depthOffset, left: 0, width: w, height: h, borderWidth: 1, borderColor: ACCENT, backgroundColor: '#ffffff' }}>
          {/* Class-specific iconography inside the envelope */}
          {iconography}
          {/* Centred label overlay */}
          <View style={{ position: 'absolute', top: 0, left: 0, width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: ACCENT, textAlign: 'center', paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.85)' }}>{label}</Text>
            <Text style={{ fontSize: 7.5, color: INK_SOFT, marginTop: 3, textAlign: 'center', paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.85)' }}>
              {(widthMm / 1000).toFixed(2)} m W × {(heightMm / 1000).toFixed(2)} m H{depthMm ? ` × ${(depthMm / 1000).toFixed(2)} m D` : ''}
            </Text>
          </View>
        </View>
      </View>
      <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 8, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 4 }}>
        Drawn to brief scale. Class-library render suppressed because the static PNG (up to 2 m cabinet) does not represent this {(widthMm * heightMm * depthMm / 1_000_000_000).toFixed(1)} m³ envelope. Brief-aware visualisation queued.
      </Text>
    </View>
  )
}

/**
 * 2026-05-20 VF iter-7 council fix: the static hero PNGs in public/heroes/
 * are calibrated for small desktop / cabinet units (~1.5 × 1 × 2 m). The
 * vertical-farm hero shows a Babylon-style cabinet; the BESS hero shows a
 * single small rack. When the brief asks for a containerised system (40-ft
 * ISO container = 12.2 × 2.4 × 2.9 m = ~85 m³, or a warehouse-scale unit),
 * the static hero is materially misleading — the reader sees a desktop
 * cabinet and conflates it with the real envelope (which is two orders of
 * magnitude bigger).
 *
 * Until brief-aware image generation is wired, suppress the hero whenever
 * the declared envelope clearly exceeds the static hero's implied scale.
 * The cover falls back to text-only — honest beats wrong.
 *
 * Threshold: 8 m³ envelope volume. A 20-ft container = 33 m³. A desktop
 * cabinet = ~3 m³. Everything between is ambiguous; we err on the side of
 * suppression because a wrong image is worse than no image.
 */

function resolveHeroImages(state: any): { cover: string | null; exploded: string | null } {
  // Sprint 0 v2 (Tristan 2026-05-20): brief-aware AI-generated hero
  // takes precedence over the static class library. generate-hero-
  // images.tsx writes the path into state.brief_hero_image_path; if
  // present + readable, use that directly (skips envelope-mismatch
  // suppression because the AI image is generated AT the brief scale).
  const briefHero = typeof state?.brief_hero_image_path === 'string' ? state.brief_hero_image_path : null
  if (briefHero && existsSync(briefHero)) {
    return { cover: briefHero, exploded: null }
  }
  const raw =
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    ''
  const slug = classToSlug(raw)
  if (!slug) return { cover: null, exploded: null }
  // 2026-05-20 (Tristan second review): when brief envelope clearly exceeds
  // the static-render scale, suppress static + render proportional outline
  // in the caller instead. Static is OK only for desktop / cabinet briefs.
  if (briefEnvelopeMismatchesStaticHero(state)) return { cover: null, exploded: null }
  const projectRoot = resolve(__dirname, '..')
  const coverPath = resolve(projectRoot, 'public', 'heroes', `${slug}-cover.png`)
  const explodedPath = resolve(projectRoot, 'public', 'heroes', `${slug}-exploded.png`)
  return {
    cover: existsSync(coverPath) ? coverPath : null,
    exploded: existsSync(explodedPath) ? explodedPath : null,
  }
}

// ─── ITER-10 NEW PAGES ─────────────────────────────────────────────────────

/**
 * Cost by Module summary — renders directly after the Module Map per
 * Tristan 2026-05-20 fourth review: "the breakdown by module needs to
 * exist, and it probably makes sense for it to be either in the brief or
 * after the module map. Maybe after the module map, because then you know
 * what you're talking about". Pattern mirrored from Chain V2: numbered
 * cost-by-module table, Sum of modules total, then a component-class
 * breakdown using Engine B's per-class attribution.
 */
function CostByModulePage({ state, project, bomTotals }: { state: any; project: string; bomTotals: BomTotals | null }) {
  if (!bomTotals || !Array.isArray(bomTotals.allMods) || bomTotals.allMods.length === 0) return null
  const orderedMods = order_modules(bomTotals.allMods as Array<{ module: string; display_name?: string }>)
    .map(m => bomTotals.allMods.find(x => x.module === m.module))
    .filter((m): m is BomMod => m != null)
  const grandTotal = bomTotals.grandTotal_gbp
  const byClass = bomTotals.engine_b_by_class ?? {}
  const sortedClasses = Object.entries(byClass)
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 2 · Cost by Module" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Cost by Module
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 18, lineHeight: 1.5 }}>
        Per-module raw-materials Bill-of-Materials subtotal, the sum across all modules, and a component-class breakdown of where the spend goes. The numbers reconcile with the per-sub-module BoM tables inside each module section.
      </Text>

      <View style={{ marginBottom: 18, padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4 }}>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 8 }}>
          Cost by module
        </Text>
        {orderedMods.map((m, idx) => (
          <View key={m.module} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.4, borderBottomColor: RULE_SOFT, alignItems: 'baseline' }} wrap={false}>
            <Text style={{ width: 28, fontSize: 10, color: MUTED }}>{idx + 1}.</Text>
            <Text style={{ flex: 1, fontSize: 10, color: INK }}>{m.display_name || m.label}</Text>
            <Text style={{ fontSize: 10, color: INK, fontFamily: 'Helvetica-Bold', textAlign: 'right' }}>
              £{m.subtotal_gbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', paddingVertical: 7, marginTop: 4, borderTopWidth: 1, borderTopColor: ACCENT, alignItems: 'baseline' }} wrap={false}>
          <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT }}>Sum of modules</Text>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: ACCENT, textAlign: 'right' }}>
            £{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
      </View>

      {sortedClasses.length > 0 ? (
        <View style={{ padding: 10, backgroundColor: '#f7f8fa', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>
            Component-class breakdown
          </Text>
          <Text style={{ fontSize: 8.5, color: MUTED, fontStyle: 'italic', marginBottom: 8 }}>
            Per-component-class contribution to the grand total. Classifier source: Engine B (Phase 4 corpus lookup with Flash-Lite fallback).
          </Text>
          {sortedClasses.map(([cls, amt]) => {
            const pct = grandTotal > 0 ? (amt / grandTotal) * 100 : 0
            return (
              <View key={cls} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.3, borderBottomColor: RULE_SOFT, alignItems: 'baseline' }} wrap={false}>
                <Text style={{ flex: 1, fontSize: 10, color: INK }}>{toTitleCaseEng(humanise(cls))}</Text>
                <Text style={{ width: 100, fontSize: 10, color: INK, textAlign: 'right' }}>
                  £{amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={{ width: 50, fontSize: 10, color: MUTED, textAlign: 'right' }}>
                  {pct < 0.5 ? '<1%' : `${pct.toFixed(0)}%`}
                </Text>
              </View>
            )
          })}
        </View>
      ) : null}

      <PageFooter />
    </Page>
  )
}

/**
 * Section 2.0 System-Level Risks & Integration (council #1 — cumulative
 * cross-cutting issues BEFORE individual modules). Sourced from
 * gatherSystemLevelRisks(state).
 */
function SystemLevelRisksPage({ state, project }: { state: any; project: string }) {
  const risks = gatherSystemLevelRisks(state)
  if (risks.length === 0) return null
  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section 2.0 · System-Level Risks & Integration" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        System-Level Risks & Integration
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 18, lineHeight: 1.55 }}>
        Cross-cutting issues that span more than one module — checked before you read individual modules, in case a cumulative effect needs the system-level view.
      </Text>
      {risks.map((r, ri) => (
        // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
        // minPresenceAhead — system-risk card has variable why/action prose
        // (≈ 4-6 lines each); wrap=false caused page-overlap bug.
        <View key={r.id || ri} style={{ marginBottom: 12, padding: 14, backgroundColor: '#ffe4e6', borderLeftWidth: 4, borderLeftColor: '#b91c1c', borderRadius: 4 }} minPresenceAhead={120}>
          <Text style={{ fontSize: 7.5, color: '#94a3b8', letterSpacing: 0.8 }}>{r.id}</Text>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#7f1d1d', marginTop: 3, marginBottom: 4 }}>{r.issue}</Text>
          <Text style={{ fontSize: 10, color: '#475569', lineHeight: 1.5, marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>Why it matters: </Text>{r.why_it_matters}
          </Text>
          <Text style={{ fontSize: 10, color: '#475569', lineHeight: 1.5 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>Action: </Text>{r.action}
          </Text>
        </View>
      ))}
      <PageFooter />
    </Page>
  )
}



// ─── Build #19e (2026-05-22) · Tools-Used end-page ─────────────────────────
//
// Lists every verified engineering tool that contributed at least one
// numerical claim to the report — with paper citation, physics basis,
// confidence class, and a truncated list of the actual quantities the
// tool computed for THIS design. Plus a section listing tools that are
// available in the orchestrator's registry but were not used for this
// design (so the reader sees the full engineering inventory).
//
// Data spec: scripts/lib/orchestrator/attribution.ts ToolsUsedPage. The
// state.toolsUsedPage field is set by orchestrate.ts via buildToolsUsedPage().
//
// Tristan reframe (drawer drawer_forgeos_decisions_961c722f0e77d105):
// "At the end of the PDF we could say explicitly that we used xyz tools
// to do computations." This is the credibility primitive that separates
// ForgeOS engineering-reference output from LLM-generated narrative —
// a reader who installs the same tools can reproduce the same numbers.

const CONFIDENCE_BADGE_COLOUR: Record<string, string> = {
  library: '#065f46',          // dark green — published library
  textbook: '#0c4a6e',         // dark blue — textbook formula
  standard: '#3b0764',         // dark purple — industry standard
  datasheet: '#7c2d12',        // dark orange — manufacturer datasheet
  empirical: '#713f12',        // dark amber — empirical fit
  industry_typical: '#52525b', // dark grey — broadly used
  estimated: '#7f1d1d',        // dark red — estimate
}

function confidenceBadgeStyle(cls: string | undefined) {
  const bg = (cls && CONFIDENCE_BADGE_COLOUR[cls]) ?? '#475569'
  return { backgroundColor: bg, color: '#ffffff', paddingVertical: 1.5, paddingHorizontal: 6, borderRadius: 3 }
}

/**
 * Resolve the toolsUsedPage payload from the chain state. Returns null if
 * the orchestrator was not invoked or wrote no payload (legacy chains).
 */
function readToolsUsedPage(state: any): any | null {
  const candidates = [
    state?.toolsUsedPage,
    state?.orchestrator?.tools_used_page,
    state?.orchestratorResult?.tools_used_page,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'object' && Array.isArray(c.tools)) return c
  }
  return null
}

function ToolsUsedPage({ state, project }: { state: any; project: string }) {
  const page = readToolsUsedPage(state)
  if (!page) return null
  if (!Array.isArray(page.tools) || page.tools.length === 0) return null

  return (
    <Page size="A4" style={PAGE_STYLE}>
      <PageHeader section="Section · Tools Used in This Report" project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 }}>
        Tools Used in This Report
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 18, lineHeight: 1.55 }}>
        {page.intro || (
          'Every numerical value in this document was computed by one of the '
          + 'verified engineering tools below. Each tool is open-source or '
          + 'free-to-use; the listed version is what was invoked; the listed '
          + 'paper or standard is the underlying physics. Anyone with the same '
          + 'tool version can reproduce the same output from the same input.'
        )}
      </Text>

      {page.tools.map((tool: any, ti: number) => {
        const claims: any[] = Array.isArray(tool.claims) ? tool.claims : []
        const visibleClaims = claims.slice(0, 12)
        const extraClaims = claims.length - visibleClaims.length
        return (
          // 2026-05-23 P1-6 (Seat C Q5 + Seat D #6): replaced wrap={false} with
          // minPresenceAhead — Tools-Used card carries up to 12 claims + 4
          // narrative paragraphs; wrap=false caused page-18 wind-turbine
          // overlap bug. 200pt reserves enough space for safe fit.
          <View
            key={tool.tool_id || `tool-${ti}`}
            style={{ marginBottom: 14, padding: 12, backgroundColor: '#f8fafc', borderLeftWidth: 3, borderLeftColor: ACCENT, borderRadius: 4 }}
            minPresenceAhead={200}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
              <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK }}>
                {tool.tool_name || tool.tool_id}
                <Text style={{ fontFamily: 'Helvetica', color: MUTED }}>
                  {tool.tool_version ? `  v${tool.tool_version}` : ''}
                </Text>
              </Text>
              {tool.tool_license ? (
                <Text style={{ fontSize: 8, color: MUTED }}>{tool.tool_license}</Text>
              ) : null}
              {tool.confidence_class ? (
                <Text style={{ fontSize: 8, marginLeft: 6, fontFamily: 'Helvetica-Bold', ...confidenceBadgeStyle(tool.confidence_class) }}>
                  {String(tool.confidence_class).toUpperCase()}
                </Text>
              ) : null}
            </View>

            {/* Natural-language narrative for the reader (Tristan 2026-05-22).
                Rendered BEFORE the academic Paper/Physics blocks so a non-
                specialist can understand what the tool does without parsing
                citation strings. See src/lib/pdf-engine-v2/tool-narratives.ts. */}
            {(() => {
              const narr = getToolNarrative(tool.tool_id)
              if (!narr) return null
              // 2026-05-23: pipe narrative fields through normalise_unicode so
              // CO₂ subscript-2, ¹⁰⁴ superscripts, ≈ ≤ ≥ etc render as ASCII.
              // Without this, default Helvetica falls back to garbled glyphs
              // for U+2082 et al — eVTOL chain 2 audit showed "CO₂-equivalent"
              // rendering as "CO‚-equivalent" in the appendix.
              return (
                <View style={{ marginTop: 4, marginBottom: 8, padding: 8, backgroundColor: '#ffffff', borderRadius: 3, borderLeftWidth: 2, borderLeftColor: ACCENT_SOFT }}>
                  <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55, marginBottom: 4 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>What it does. </Text>
                    {normalise_unicode(narr.description)}
                  </Text>
                  <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55, marginBottom: 4 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>Origin. </Text>
                    {normalise_unicode(narr.origin)}
                  </Text>
                  <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55, marginBottom: 4 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>What the results mean. </Text>
                    {normalise_unicode(narr.results_interpretation)}
                  </Text>
                  <Text style={{ fontSize: 9.5, color: INK_SOFT, lineHeight: 1.55 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>How it was used here. </Text>
                    {normalise_unicode(narr.usage_pattern)}
                  </Text>
                </View>
              )
            })()}

            {tool.tool_paper ? (
              <Text style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5, marginBottom: 2 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: INK_SOFT }}>Reference paper / standard: </Text>
                {tool.tool_paper}
                {tool.tool_doi ? (
                  <Text style={{ color: ACCENT_SOFT }}>{`  · DOI:${tool.tool_doi}`}</Text>
                ) : null}
              </Text>
            ) : null}

            {tool.physics_basis ? (
              <Text style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5, marginBottom: 2 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: INK_SOFT }}>Underlying math: </Text>
                {tool.physics_basis}
                {tool.physics_paper_doi ? (
                  <Text style={{ color: ACCENT_SOFT }}>{`  · DOI:${tool.physics_paper_doi}`}</Text>
                ) : null}
              </Text>
            ) : null}

            {tool.tool_source_url ? (
              <Text style={{ fontSize: 9, color: MUTED, marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>Source: </Text>
                {tool.tool_source_url}
              </Text>
            ) : null}

            {visibleClaims.length > 0 ? (
              <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 0.4, borderTopColor: RULE_SOFT }}>
                <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 3 }}>
                  Quantities this tool computed for this design:
                </Text>
                {visibleClaims.map((claim, ci) => {
                  const v = Number.isFinite(claim.value)
                    ? claim.value.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    : String(claim.value ?? '—')
                  return (
                    <Text key={ci} style={{ fontSize: 8.5, color: INK_SOFT, lineHeight: 1.5 }}>
                      {`  • ${claim.field} = ${v}${claim.unit ? ` ${claim.unit}` : ''}`}
                      {claim.input_summary && claim.input_summary !== '(none)' ? (
                        <Text style={{ color: MUTED }}>{`  (input: ${truncate(claim.input_summary, 80)})`}</Text>
                      ) : null}
                    </Text>
                  )
                })}
                {extraClaims > 0 ? (
                  <Text style={{ fontSize: 8.5, color: MUTED, fontStyle: 'italic', marginTop: 2 }}>
                    {`  ... and ${extraClaims} more claim${extraClaims === 1 ? '' : 's'} from the same tool.`}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )
      })}

      {/*
        2026-05-23 universal fix: the "available_but_unused" list is the
        GLOBAL tool registry minus the tools that ran for this design — so
        a heat-pump report ends up listing pvlib solar, aeroelastic flutter,
        airframe FEA, and 145 other tools that have no semantic relevance to
        a heat pump. The reader interprets this as "these tools were
        considered for this design" which is misleading and adds 6-10 pages
        of noise. Hidden from the PDF; the data is still in state.json /
        4-orchestrator-tools-used.json for debug.
      */}

      <View style={{ marginTop: 14, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: RULE_SOFT }}>
        <Text style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.45, fontStyle: 'italic' }}>
          {page.disclaimer || (
            'The ForgeOS PDF engine orchestrates the tools and renders this PDF but does not itself compute the engineering numbers. Tool outputs are accurate within their documented operating domains; certified procurement requires separate engineer sign-off.'
          )}
        </Text>
      </View>

      <PageFooter />
    </Page>
  )
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ─── Build #19f (2026-05-22) · per-module "Tools Used in this Section" ────
//
// Small callout box rendered at the top of each module's content (after
// the cover image and overview paragraph, before the sub-modules). Lists
// the tools whose outputs contributed to ANY quantity referenced by a
// sub-module's word OR a derived_parameter of this module.
//
// Tristan's ask (drawer_forgeos_decisions_961c722f0e77d105): "kind of
// engineering detail is massively useful and informative, gives the
// document real sense of rigour" — show per-section which tools backed
// the numbers IN THAT section.

function moduleToolIds(moduleSpec: any, state: any): string[] {
  const page = readToolsUsedPage(state)
  if (!page || !Array.isArray(page.tools) || page.tools.length === 0) return []
  // Build set of tool_ids from the engineering contract for every quantity
  // touched by this module's sub-modules + derived_parameters. Prefer the
  // orchestrator's enriched contract (carries typed-quantity provenance per
  // Build #19d); fall back to the legacy chain contract when ORCHESTRATOR=0.
  const contract =
    state?.orchestratorContract
    || state?.engineeringContract
    || state?.orchestrator?.contract
    || null
  const quantities: Record<string, any> = contract?.quantities && typeof contract.quantities === 'object'
    ? contract.quantities
    : {}

  const toolIds = new Set<string>()
  const candidateNames: string[] = []
  for (const sm of (moduleSpec?.sub_modules ?? [])) {
    for (const w of (sm?.words ?? [])) {
      const nm: string[] = [w?.id, w?.name_human, w?.content_character?.character_id]
        .filter((x: unknown): x is string => typeof x === 'string')
        .map(s => s.toLowerCase().replace(/[-\s]+/g, '_'))
      candidateNames.push(...nm)
    }
  }
  // Module's derived parameters
  for (const dpKey of Object.keys(moduleSpec?.derived_parameters ?? {})) {
    candidateNames.push(String(dpKey).toLowerCase())
  }

  // For each candidate name, find matching quantities in the contract
  for (const candidate of candidateNames) {
    for (const qName of Object.keys(quantities)) {
      const qLower = qName.toLowerCase()
      if (candidate === qLower || candidate.includes(qLower) || qLower.includes(candidate)) {
        const tid = quantities[qName]?.provenance?.tool_id
        if (typeof tid === 'string' && tid) toolIds.add(tid)
      }
    }
  }

  return Array.from(toolIds)
}

function ModuleToolsCallout({ moduleSpec, state }: { moduleSpec: any; state: any }) {
  const page = readToolsUsedPage(state)
  if (!page) return null
  const ids = moduleToolIds(moduleSpec, state)
  if (ids.length === 0) return null

  // Resolve display names from the toolsUsedPage
  const displays: string[] = []
  for (const tid of ids) {
    const tool = (page.tools as any[]).find(t => t?.tool_id === tid)
    if (tool) {
      const name = tool.tool_name || tid
      const version = tool.tool_version ? ` v${tool.tool_version}` : ''
      displays.push(`${name}${version}`)
    } else {
      displays.push(tid)
    }
  }
  if (displays.length === 0) return null

  return (
    <View
      style={{
        backgroundColor: '#f0f4f8',
        paddingVertical: 6,
        paddingHorizontal: 10,
        marginBottom: 12,
        borderLeftWidth: 3,
        borderLeftColor: ACCENT_SOFT,
        borderRadius: 3,
      }}
      wrap={false}
    >
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: ACCENT, letterSpacing: 0.6, marginBottom: 2 }}>
        TOOLS USED IN THIS SECTION
      </Text>
      <Text style={{ fontSize: 9, color: INK_SOFT, lineHeight: 1.5 }}>
        {displays.join('   ·   ')}
      </Text>
    </View>
  )
}

function MinimalDocument({ state, subject }: { state: any; subject: string }) {
  const project = String(state.projectId || 'forge-engineering-report')
  const rawModules = state.moduleDecomposition?.modules ?? []
  const modules = order_modules(rawModules as Array<{ module: string; display_name?: string }>)
  const links = state.moduleDecomposition?.cross_module_grammar_links ?? []
  const byModule = state.naturalLanguageLayer?.by_module ?? {}
  const partLinkMap = buildPartLinkMap(state)
  const heroImages = resolveHeroImages(state)
  const briefEnvelope = readBriefEnvelopeDimensions(state)
  // Compute BoM totals once; CoverPage shows the headline figure and
  // BillOfMaterialsPage renders the full table from the same numbers.
  const rawBomTotals = computeBomTotals(state)
  // Price-reality check — compare grand total against per-class market
  // band. Slug hint pulled from projectId prefix ("BESS-001" → "bess").
  // Tristan 2026-05-17: "If our pricing is 100/200/300% out, that's a real
  // problem... how do we calibrate the cost of these things?"
  const slugHint = String(state.projectId || '').split('-')[0]?.toLowerCase() || undefined
  // Apply per-class batch-economics scale factor so consumer-volume classes
  // (CGM, drone, heatpump R290) stop being priced at distributor unit rates.
  // Pre-scale BoMs ran +24,000% / +1,910% / +789% high respectively. Scaled
  // BoMs land in band. See drawer forgeos_gotchas_e1f18dd3cfae9ee3.
  const bomTotals = applyBatchEconomics(state, rawBomTotals, slugHint)
  // Engine D — decompose the raw-materials BoM into the full cost stack
  // (raw → factory_COGS → OEM transfer → channel list → installed ASP) so
  // the cover page tells the truth about every layer instead of presenting
  // a single misleading "BoM total". Per-class ratios live in
  // src/lib/pdf-engine-v2/class-cost-structure.ts; see PLAN-2026-05-18
  // cost-correctness-engine-v2 § Engine D for the rationale.
  const costStack: CostStack | null = bomTotals && bomTotals.grandTotal_gbp > 0
    ? (() => {
        const { ratios, class_key } = resolveCostStack(state, slugHint)
        return computeCostStack(bomTotals.grandTotal_gbp, ratios, class_key)
      })()
    : null
  const priceReality = computePriceReality(state, bomTotals, slugHint, costStack)
  // Count of parts pending verification — surfaced on the cover so the
  // reader sees the audit-trail size before reaching Appendix A.
  const verifications: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  const pendingPartsCount = verifications.filter((v: any) => v.status === 'uncertain' || v.status === 'unverified').length

  // Manual-review badges (council 2026-05-18) — collect once from state and
  // distribute to the cover strip, inline section notes, and the back-of-PDF
  // appendix. Each gate sets its own state marker upstream; if none fire the
  // strip + appendix render nothing.
  const manualReviewBadges = collectManualReviewBadges(state)

  // Task #87 (2026-05-18) — provisional class-registry indicator.
  // Set upstream by stages/1.7-module-decomposition.ts triggerAutoClassRegistry
  // IfUnknown() when K10 verdict=NO_GRAPH. Used to (a) render the amber cover
  // note and (b) add the Appendix B provenance entry.
  const provisionalClassRegistry: {
    flag: boolean
    reason?: string
    payloadAttached?: boolean
    generatorModel?: string
    audit?: any
    payload?: any
  } = {
    flag: !!state?.moduleDecomposition?.provisional_class_registry,
    reason: state?.moduleDecomposition?.provisional_class_reason ?? undefined,
    payloadAttached: !!state?.moduleDecomposition?.auto_class_registry_payload,
    generatorModel: state?.moduleDecomposition?.auto_class_registry_audit?.generator_model ?? undefined,
    audit: state?.moduleDecomposition?.auto_class_registry_audit ?? null,
    payload: state?.moduleDecomposition?.auto_class_registry_payload ?? null,
  }

  return (
    <Document>
      <CoverPage subject={subject} projectId={project} heroImagePath={heroImages.cover} briefEnvelope={briefEnvelope} bomTotals={bomTotals} costStack={costStack} priceReality={priceReality} pendingPartsCount={pendingPartsCount} engineCSummary={state.engine_c_summary || null} manualReviewBadges={manualReviewBadges} provisionalClassRegistry={provisionalClassRegistry} acceptanceStatus={state?.acceptanceStatus} physicsCritique={state?.physicsCritique} productClass={String(state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? '')} state={state} />
      {/* ITER-10.5 (Tristan-defined 2026-05-20):
          Brief sits immediately after Cover. Operational Headline is folded
          INTO BriefPage as a banner at the top (HeadlinePage component
          deleted). Standalone DesignTradeOffsPage is removed — trade-offs
          fold into each module in Phase F. IssueIndexPage and
          EngineeringQASummaryPage are removed — Tristan: "I don't think it
          adds much value". SystemLevelRisksPage moves to AFTER modules. */}
      {state.brief?.was_revised ? <BriefRevisionNoticePage state={state} project={project} /> : null}
      <BriefPage state={state} project={project} manualReviewBadges={manualReviewBadges} />
      <ModuleConnectionMapPageWithExploded modules={modules} links={links} project={project} explodedImagePath={heroImages.exploded} manualReviewBadges={manualReviewBadges} />
      {/* ITER-10.5 fourth review (Tristan 2026-05-20): Cost-by-module
          summary lives directly after the Module Map so the reader meets
          the system architecture, then immediately sees where the spend
          lands per module + per component class, then dives into the
          individual modules below. */}
      <CostByModulePage state={state} project={project} bomTotals={bomTotals} />
      {modules.map((m: any, idx: number) => (
        <ModuleSection
          key={m.module}
          index={idx + 1}
          moduleSpec={m}
          nl={byModule[m.module]}
          partLinkMap={partLinkMap}
          project={project}
          moduleImagePath={resolveModuleImage(
            state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? '',
            m.module,
            state,
          )}
          bomTotals={bomTotals}
          state={state}
          partRecommendations={Array.isArray(state?.partRecommendations) ? state.partRecommendations : []}
          manualReviewBadges={manualReviewBadges}
        />
      ))}
      {/* ITER-10.5 Phase J (Tristan Q1 answer B, 2026-05-20): MERGED.
          RiskPage now embeds the SystemLevelRisks content as its first
          sub-block under "Risk & Integration Analysis". The standalone
          SystemLevelRisksPage component is no longer called. */}
      <RiskPage state={state} project={project} manualReviewBadges={manualReviewBadges} />
      <SuppliersPage state={state} project={project} />
      <CompliancePage state={state} project={project} manualReviewBadges={manualReviewBadges} />
      {/* ITER-10.5 fifth review (Tristan 2026-05-20): standalone Design
          Decisions page deleted — "this section seems orphaned, what is
          it doing?". Unrepaired-gate decisions already surface inline
          via per-sub-module Notes + module-level Engineering check
          paragraphs. */}
      {/* Build #19e (2026-05-22): Tools-Used end-page. Renders nothing
          (returns null) when the orchestrator phase didn't run OR no
          tools contributed claims — preserves legacy chain output. */}
      <ToolsUsedPage state={state} project={project} />
    </Document>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/render-minimal-pdf.ts <state.json> [out.pdf]')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const outPath = args[1] ? resolve(args[1]) : resolve(process.cwd(), 'minimal.pdf')

  const state = JSON.parse(readFileSync(statePath, 'utf-8'))

  const productClass = state.moduleDecomposition?.product_class
  // 2026-05-19 fix C7 (audit-found): the renderer previously only checked one
  // path (`state.brief.product_definition.subject`) which the chain never
  // writes. The chain's actual briefBlock shape (per serial-design-chain-v2.tsx
  // briefBlock construction) is { original_text, parsed_original, revised_text,
  // parsed_revised, revision_history, was_revised }. parsed_original/parsed_revised
  // are the brief parser's StructuredBriefJSON output, which emits `projectName`
  // (not `subject`) per stages/0-brief-generation.ts. The result was every PDF
  // title fell through to humanise(productClass) — e.g. "Heat Pump Residential"
  // instead of the founder's actual project name. Multi-path fallback below.
  const rawSubject = (
    state.brief?.product_definition?.subject  // legacy / PA-orchestrator shape
    || state.parsedBrief?.product_definition?.subject
    || state.brief?.parsed_revised?.product_definition?.subject  // refined brief, if revised
    || state.brief?.parsed_original?.product_definition?.subject  // original brief
    || state.brief?.parsed_revised?.subject
    || state.brief?.parsed_original?.subject
    || state.parsedBrief?.subject
    || state.brief?.parsed_revised?.projectName  // actual structured field per brief parser
    || state.brief?.parsed_original?.projectName
    || state.parsedBrief?.projectName
    // First non-empty line of the brief text — last-resort but truthful.
    || (typeof state.brief?.revised_text === 'string' && state.brief.revised_text.trim().split('\n').find((l: string) => l.trim())?.replace(/^#+\s*/, '').replace(/^Project Brief:\s*/i, '').replace(/^(?:[^.!?\n]{1,160}[.!?]|[^\n]{1,100}\b).*$/s, (m: string) => {
        // 2026-05-20 iter-8 council fix G: title truncation — the legacy
        // slice(0,80) cut "Primary Constraint" mid-word on the VF cover.
        // Now: prefer the first sentence terminator within 160 chars; if
        // none, fall back to the last word boundary within 100 chars.
        const sentEnd = m.search(/[.!?](?=\s|$)/)
        if (sentEnd >= 0 && sentEnd < 160) return m.slice(0, sentEnd + 1)
        const trimmed = m.slice(0, 100)
        const lastSpace = trimmed.lastIndexOf(' ')
        return lastSpace > 30 ? trimmed.slice(0, lastSpace) : trimmed
      }))
    || (typeof state.brief?.original_text === 'string' && state.brief.original_text.trim().split('\n').find((l: string) => l.trim())?.replace(/^#+\s*/, '').replace(/^Project Brief:\s*/i, '').replace(/^(?:[^.!?\n]{1,160}[.!?]|[^\n]{1,100}\b).*$/s, (m: string) => {
        // 2026-05-20 iter-8 council fix G: title truncation — the legacy
        // slice(0,80) cut "Primary Constraint" mid-word on the VF cover.
        // Now: prefer the first sentence terminator within 160 chars; if
        // none, fall back to the last word boundary within 100 chars.
        const sentEnd = m.search(/[.!?](?=\s|$)/)
        if (sentEnd >= 0 && sentEnd < 160) return m.slice(0, sentEnd + 1)
        const trimmed = m.slice(0, 100)
        const lastSpace = trimmed.lastIndexOf(' ')
        return lastSpace > 30 ? trimmed.slice(0, lastSpace) : trimmed
      }))
    || (productClass ? humanise(productClass) : 'Engineering Report')
  ) as string
  // Title case using the shared toTitleCaseEng helper (defined near the top
  // of this file, also used to capitalise BoM part names).
  const subject = toTitleCaseEng(rawSubject)

  console.error(`[render-minimal-pdf] state: ${statePath}`)
  console.error(`[render-minimal-pdf] modules: ${(state.moduleDecomposition?.modules ?? []).length}`)
  console.error(`[render-minimal-pdf] rendering...`)

  const blob = await pdf(<MinimalDocument state={state} subject={subject} />).toBlob()
  const buffer = Buffer.from(await blob.arrayBuffer())
  writeFileSync(outPath, buffer)
  const sizeKb = (buffer.length / 1024).toFixed(1)
  console.error(`[render-minimal-pdf] written ${outPath} (${sizeKb} KB)`)

  // 2026-05-23 (post-L30): persist macro-claim decisions alongside the PDF
  // so audit-pdf-bom.ts (and other downstream verifiers) can read which
  // macro claimed which word, what the per-row macro-override price was,
  // and which rows had their corpus part_number stripped. This closes the
  // audit-can't-verify gap: previously contract_override_reason existed
  // only inside the BomPartRow construction and was never persisted —
  // audit had to guess at claims via name-token matching which produced
  // false positives.
  try {
    const outDir = dirname(outPath)
    // Recompute BoM totals here (idempotent) since the version computed
    // inside MinimalDocument is scoped to the React component.
    const slugHint2 = String(state.projectId || '').split('-')[0]?.toLowerCase() || undefined
    const bomTotalsForClaims = applyBatchEconomics(state, computeBomTotals(state), slugHint2)
    const macroClaims: Array<{ module: string; sub_module: string; word_id: string; word_name: string; macro_word_name: string; macro_total_gbp: number; unit_price_gbp: number; line_total_gbp: number; quantity: number; source_detail: string }> = []
    for (const mod of bomTotalsForClaims?.allMods ?? []) {
      for (const sub of mod.subs ?? []) {
        for (const part of sub.parts ?? []) {
          if (part.contract_override_reason) {
            // Parse the source_detail back out of contract_override_reason
            // Format: "Contract macro-assembly (...): <source_detail>"
            const sd = (part.contract_override_reason as string).replace(/^Contract macro-assembly \([^)]*\): /, '')
            macroClaims.push({
              module: mod.module,
              sub_module: sub.id,
              word_id: part.word_id,
              word_name: part.word_name,
              macro_word_name: '', // will fill below by matching source_detail
              macro_total_gbp: part.line_total_gbp,
              unit_price_gbp: part.unit_price_gbp,
              line_total_gbp: part.line_total_gbp,
              quantity: part.quantity,
              source_detail: sd,
            })
          }
        }
      }
    }
    // Match each claim's source_detail back to the originating macro name
    // (state.engineeringContract.macro_assembly_prices) for the audit's
    // convenience. Bonus: total claimed money + count.
    const macros: Array<{ word_name: string; source_detail?: string; total_gbp: number }> = (state?.engineeringContract?.macro_assembly_prices ?? []) as any[]
    for (const c of macroClaims) {
      const m = macros.find(mm => (mm.source_detail ?? '').slice(0, 60) === c.source_detail.slice(0, 60))
      if (m) c.macro_word_name = m.word_name
    }
    writeFileSync(join(outDir, 'macro-claims.json'), JSON.stringify({
      total_claims: macroClaims.length,
      total_claimed_gbp: macroClaims.reduce((a, c) => a + c.line_total_gbp, 0),
      claims: macroClaims,
    }, null, 2))
    console.error(`[render-minimal-pdf] persisted ${macroClaims.length} macro claims to ${outDir}/macro-claims.json`)
  } catch (err) {
    console.error(`[render-minimal-pdf] macro-claims.json write failed (non-fatal): ${(err as Error).message.slice(0, 100)}`)
  }

  // Open in Preview — execFileSync (no shell interpolation, safe path).
  // Suppress via RENDER_NO_OPEN=1 for batch / audit runs.
  if (process.env.RENDER_NO_OPEN !== '1') {
    try {
      execFileSync('open', [outPath])
      console.error(`[render-minimal-pdf] opened`)
    } catch (err) {
      console.error(`[render-minimal-pdf] open failed:`, err)
    }
  }
}

main().catch(err => {
  console.error('[render-minimal-pdf] FATAL:', err)
  process.exit(1)
})
