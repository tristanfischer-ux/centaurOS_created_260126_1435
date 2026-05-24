/**
 * Slot mis-pin detector (universal — runs for every chain, every class).
 *
 * Root cause it addresses: deterministic-emitter.ts pins a real manufacturer
 * + part_number for many components, but sometimes the pinned part is the
 * WRONG TYPE for the slot. The part's spec might be reasonable (gate 13
 * parts-spec validator passes); its sizing might be correct (gate 14 sizing
 * audit passes); but it's a fundamentally wrong category of part for what
 * the slot needs.
 *
 * BESS L18 Physics Critic examples:
 *   - Eaton M22-DL-G pinned as a "door position switch" — but M22-DL-G is
 *     an illuminated PUSHBUTTON operator, not a limit switch / safety switch.
 *     Door cannot be sensed by a pushbutton.
 *   - Roxtec CF 16 pinned as an "M63 11 kV round brass gland" — but
 *     Roxtec CF 16 is a RECTANGULAR cable transit FRAME, not a round gland.
 *     Cannot mate with M63 round entry hardware.
 *   - Deflagration panels pinned as "polycarbonate" — but polycarbonate is
 *     a high-impact polymer that does NOT rupture at NFPA 68 pressures.
 *     Would resist the explosion, risking structural overpressure.
 *
 * The validator maintains a curated KNOWN_MIS_PINS table. Each rule says:
 * "if the word's content_character.character_id matches X AND the pinned
 *  part matches Y, that's a known wrong-type bug; flag HIGH + suggest
 *  alternatives". Curated from Physics Critic findings + engineering
 *  domain knowledge. Adding entries is cheap; each entry blocks one
 *  recurrence of that specific bug across all chains forever.
 *
 * Distinct from gates 13 + 14:
 *   - gate 13 (parts-spec validator) catches WRONG SPEC CLAIM (Schaltbau
 *     C310 claimed 1500 A but real is 500 A)
 *   - gate 14 (sizing audit) catches UNDERSIZED rating (AC filter inductor
 *     100 A on 1804 A continuous AC)
 *   - gate 15 (mis-pin detector) catches WRONG TYPE (M22-DL-G pushbutton
 *     pinned as a door limit switch — sizing might be fine, spec might
 *     match the part's real datasheet, but the part TYPE is wrong)
 *
 * All three gates fire on different bug families. Together they cover most
 * common "part pinning is wrong" failure modes.
 */

import { readFileSync } from 'node:fs'

// ── KNOWN MIS-PIN RULES ──────────────────────────────────────────────────────
// Each rule: when a word's character_id matches the slot pattern AND the
// pinned part matches the forbidden pattern, flag a HIGH finding with the
// reason + suggested alternatives. Curated from Physics Critic + domain
// knowledge. Add entries as new mis-pins are discovered.

export interface MisPinRule {
  /** Slot identifier (matches content_character.character_id). */
  character_id_pattern: RegExp
  /** What pinned part triggers the flag — at least one of these must match. */
  forbidden_match: {
    manufacturer?: RegExp
    part_number?: RegExp
    name_human?: RegExp
    /** Matches the `form` modifier value — often the material/finish field
     * (e.g. "polycarbonate" for a deflagration panel; "polished stainless"
     * for a coldplate substrate). NOTE: free-text — can false-positive on
     * negations ("NOT polycarbonate"). Prefer `material_radical` when
     * checking material correctness. */
    form?: RegExp
    /** Matches content_character.material_radical_primary — the canonical
     * material taxonomy field, e.g. "aluminium", "polymer_thermoplastic",
     * "polymer_thermoset", "ceramic", "copper". Safer than `form` for
     * material-mismatch detection because it's not free text. */
    material_radical?: RegExp
  }
  /** Why this pin is wrong (engineering reason, cited to a standard if
   * possible). */
  reason: string
  /** What to use instead (real industrial alternatives with part numbers
   * the operator can search for). */
  suggested_alternatives: string[]
  /** Optional class restriction (empty = applies to all). */
  applies_to_classes?: string[]
}

export const KNOWN_MIS_PINS: MisPinRule[] = [
  // ── BESS L18 council finding #3: door-position switch mis-pinned ──
  // Eaton M22-DL series is an ILLUMINATED PUSHBUTTON, not a limit switch.
  // M22 is the IEC 22.5 mm panel-cutout RMQ-Titan family; -DL-G = pushbutton
  // with green LED. Source: Eaton M22 datasheet (DA08603001E).
  {
    character_id_pattern: /door_position|door_limit|door_sensor|door_open_switch|door_safety|door_switch|door_interlock/i,
    forbidden_match: { manufacturer: /^Eaton$/i, part_number: /^M22(-DL|-D|-PV|-PVT)/i },
    reason:
      'Eaton M22-DL/D/PV series is an illuminated PUSHBUTTON or selector operator (IEC 22.5 mm panel-cutout RMQ-Titan family), not a limit switch. A door cannot be sensed by an operator button — the door would need to be physically pressed every time. Required: a safety limit switch OR magnetic reed sensor that closes a circuit when the door physically blocks/unblocks the contact.',
    suggested_alternatives: [
      'Eaton LS-S11 (safety limit switch, IEC 60947-5-1, Cat 3)',
      'Siemens 3SE5132-0AB02-1AC4 (positively-driven safety switch)',
      'Pizzato FR 754-M2 (magnetic safety sensor, ISO 14119)',
      'Schmersal BNS33 / BNS260 (coded magnetic sensor)',
    ],
  },
  // ── BESS L18 council finding #4: HV cable gland mis-pinned ──
  // Roxtec CF / CFB / CM / MCT / RM / RS series is a RECTANGULAR or round
  // cable transit FRAME with wedge-and-module sealing. It is NOT a single
  // threaded gland and does NOT mate with round M-thread enclosure entry
  // hardware (M16, M40, M63, M75). Source: Roxtec CF Frames datasheet
  // (RM00010-EN).
  //
  // BESS L19 (2026-05-25) refinement: the regex is anchored with
  // `(?!_frame)` look-ahead so the rule does NOT fire on slots whose
  // character_id ends in `_frame` (e.g. cable_transit_frame,
  // cable_entry_frame) — those slots are legitimate Roxtec targets when
  // the design uses a transit frame instead of parallel round glands
  // (industry practice for ≥2 MW BESS where parallel-gland count gets
  // unwieldy). Likewise excluded: `gland_seal` (a generic seal slot
  // that can take Roxtec compression-module fillers). Strictness rule:
  // ONLY `cable_transit_frame` and `cable_entry_frame` are valid
  // Roxtec slots; everything else with "gland" / "cable_entry" in the
  // name must still use a round threaded gland (Hawke / CMP / Cortem).
  {
    // Substring match on gland-style slot keywords, with a negative
    // lookahead `(?!.*_frame$)` so character_ids ending in `_frame`
    // (e.g. cable_transit_frame, cable_entry_frame) are EXEMPT. Those
    // are the legitimate Roxtec slots per BESS L19 (2026-05-25).
    character_id_pattern: /^(?!.*_frame$).*(cable_gland|hv_gland|mv_gland|11kv_gland|cable_entry|gland_(11|33)kv).*$/i,
    forbidden_match: { manufacturer: /^Roxtec$/i, part_number: /^(CF|CFB|CM|MCT|RM|RS)/i },
    reason:
      'Roxtec CF/CFB/CM/MCT/RM/RS series is a cable transit FRAME (wedge-and-module sealing for through-wall cable runs), not a round threaded gland. Cannot mate with single M-thread entry hardware. For 11 kV cable entry through a round enclosure boss, use a compression-style HV gland with metric M-thread. If the design has so much parallel-cable count that a transit frame is needed, change the slot character_id to cable_transit_frame or cable_entry_frame so the architectural intent is explicit.',
    suggested_alternatives: [
      'Hawke 501/421/Universal (single-compression HV gland, BASEEFA + IECEx, Hubbell/Hawke International)',
      'CMP A2RC + HV cable gland (UK)',
      'Cortem ICRSTC11 (Italian, 11 kV armoured)',
      'Prysmian CCG-RA series (when ordering with cable)',
      'OR — if a transit frame is genuinely needed, rename the slot character_id to cable_transit_frame and re-pin Roxtec CF / RM / RS there',
    ],
  },
  // ── BESS L18 council finding #2: deflagration panel mis-pinned ──
  // Polycarbonate is a high-strength impact polymer. Used in safety glazing
  // (e.g. machine guards) because it RESISTS impact. Exactly wrong for a
  // burst panel which must rupture at low pressure (NFPA 68 typically
  // 5-50 mbar) to vent overpressure. Source: NFPA 68 §6.2 + Continental
  // Disc Corp BS-B technical bulletin.
  {
    character_id_pattern: /deflagration|burst_disc|rupture_disc|explosion_vent|pressure_relief_disc/i,
    // Use material_radical (canonical taxonomy) instead of form (free text)
    // — form fields can contain negations like "NOT polycarbonate" that
    // false-positive on a substring match.
    forbidden_match: { material_radical: /^polymer|^polycarbonate|^acrylic|^plastic|^glass$/i },
    reason:
      'Polycarbonate / acrylic / polymer panels are HIGH-IMPACT MATERIALS designed to RESIST impact. NFPA 68 deflagration vents must RUPTURE at low pressure (typically 5-50 mbar) to release overpressure. A polycarbonate panel would resist the explosion and the container would over-pressurise, risking structural failure. Required: a thin metallic burst disc or composite rupture disc rated to the NFPA 68 calculated vent area at the specific Pred.',
    suggested_alternatives: [
      'Continental Disc Corp BS-B (forward-acting aluminium burst disc, ASME VIII Div 1)',
      'BS&B SRD-LO (graphite scored rupture disc)',
      'Fike Atex-certified composite vent panel (CD/CV series)',
      'Rembe DDS deflagration vent (NFPA 68 + EN 14797 certified)',
    ],
  },
  // ── BESS gotcha (from MEMORY.md `wren_means_dutch_haps_company`-style
  //    discoveries): if a future chain pins a 'Wren' part for a BESS slot,
  //    it's probably Wren Aerospace (HAPS), not a BESS part. Flag here.
  //    Empty rule for now — add as new evidence accumulates.
]

// ── COLLECTOR ────────────────────────────────────────────────────────────────

interface CandidatePart {
  word_id: string
  module_id: string
  sub_module_id: string
  character_id: string
  manufacturer: string | null
  part_number: string | null
  name_human: string | null
  /** Value of the `form` modifier — often material / finish (e.g.
   * "polycarbonate", "aluminium", "polished stainless"). */
  form: string | null
  /** content_character.material_radical_primary — canonical material from
   * the taxonomy ("aluminium", "polymer_thermoplastic", "ceramic", etc.).
   * Safer than `form` for material-mismatch detection. */
  material_radical: string | null
}

function collectCandidates(state: any): CandidatePart[] {
  const out: CandidatePart[] = []
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  for (const m of modules) {
    const moduleId = String(m?.module ?? m?.id ?? 'unknown')
    const subs: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const subId = String(sm?.id ?? sm?.sub_module_id ?? 'unknown')
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const charId = String(w?.content_character?.character_id ?? w?.id ?? '')
        const mods: any[] = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        const mfr = mods.find((mc) => mc.kind === 'manufacturer')?.value ?? null
        const pn = mods.find((mc) => mc.kind === 'part_number')?.value ?? null
        const formMod = mods.find((mc) => mc.kind === 'form')?.value
        const nameHuman = String(w?.name_human ?? w?.content_character?.name_human ?? '')
        const materialRadical = w?.content_character?.material_radical_primary
        out.push({
          word_id: String(w?.id ?? charId),
          module_id: moduleId,
          sub_module_id: subId,
          character_id: charId,
          manufacturer: mfr ? String(mfr) : null,
          // If part_number modifier missing, fall back to form modifier so
          // pattern matchers see the manufacturer+model string when emitted
          // inline (e.g. `mod('form', 'Schaltbau C310 ...')`).
          part_number: pn ? String(pn) : (typeof formMod === 'string' ? formMod : null),
          name_human: nameHuman || null,
          // form modifier exposed independently so mis-pin rules can check
          // material/finish fields (e.g. polycarbonate as deflagration panel).
          form: typeof formMod === 'string' ? formMod : null,
          material_radical: typeof materialRadical === 'string' ? materialRadical : null,
        })
      }
    }
  }
  return out
}

// ── MATCHING ─────────────────────────────────────────────────────────────────

function ruleMatchesPart(rule: MisPinRule, p: CandidatePart): boolean {
  // ALL set fields in forbidden_match must match for the rule to fire.
  // Single field matches are allowed (e.g. just `material_radical` for the
  // polycarbonate-deflagration-panel case).
  const f = rule.forbidden_match
  if (f.manufacturer && (!p.manufacturer || !f.manufacturer.test(p.manufacturer))) return false
  if (f.part_number && (!p.part_number || !f.part_number.test(p.part_number))) return false
  if (f.name_human && (!p.name_human || !f.name_human.test(p.name_human))) return false
  if (f.form && (!p.form || !f.form.test(p.form))) return false
  if (f.material_radical && (!p.material_radical || !f.material_radical.test(p.material_radical))) return false
  // At least one field had to be set + matched — otherwise empty rule matches everything.
  return Boolean(f.manufacturer || f.part_number || f.name_human || f.form || f.material_radical)
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export interface MisPinFinding {
  word_id: string
  module_id: string
  sub_module_id: string
  character_id: string
  pinned_manufacturer: string | null
  pinned_part_number: string | null
  pinned_name_human: string | null
  reason: string
  suggested_alternatives: string[]
}

export interface MisPinResult {
  findings: MisPinFinding[]
  candidates_scanned: number
  rules_evaluated: number
  product_class: string
}

export function detectMisPins(state: any): MisPinResult {
  const product_class = String(
    state?.moduleDecomposition?.product_class ??
      state?.parsedBrief?.product_class ??
      state?.classify?.product_class ??
      'unknown',
  )
  const candidates = collectCandidates(state)
  const findings: MisPinFinding[] = []
  for (const p of candidates) {
    for (const rule of KNOWN_MIS_PINS) {
      // Class restriction
      if (rule.applies_to_classes && rule.applies_to_classes.length > 0) {
        const matches = rule.applies_to_classes.some((cls) =>
          product_class.toLowerCase().includes(cls.toLowerCase()),
        )
        if (!matches) continue
      }
      // Slot match
      if (!rule.character_id_pattern.test(p.character_id)) continue
      // Pin match
      if (!ruleMatchesPart(rule, p)) continue
      findings.push({
        word_id: p.word_id,
        module_id: p.module_id,
        sub_module_id: p.sub_module_id,
        character_id: p.character_id,
        pinned_manufacturer: p.manufacturer,
        pinned_part_number: p.part_number,
        pinned_name_human: p.name_human,
        reason: rule.reason,
        suggested_alternatives: rule.suggested_alternatives,
      })
    }
  }
  return {
    findings,
    candidates_scanned: candidates.length,
    rules_evaluated: KNOWN_MIS_PINS.length,
    product_class,
  }
}

// ── CLI ENTRYPOINT ───────────────────────────────────────────────────────────

function renderMarkdown(result: MisPinResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Slot Mis-Pin Detector — ${statePath}`)
  lines.push('')
  lines.push(
    `**${result.candidates_scanned} word candidates scanned** against ${result.rules_evaluated} curated mis-pin rules. Product class: \`${result.product_class}\`.`,
  )
  lines.push('')
  if (result.findings.length === 0) {
    lines.push('✅ **PASS** — no known mis-pinned slots detected.')
    return lines.join('\n')
  }
  lines.push(`❌ **FAIL** — ${result.findings.length} mis-pin(s) detected:`)
  lines.push('')
  for (const f of result.findings) {
    lines.push(`## [HIGH] ${f.character_id} — wrong part type`)
    lines.push(`- **Module:** ${f.module_id} → ${f.sub_module_id}`)
    lines.push(`- **Word ID:** ${f.word_id}`)
    lines.push(`- **Pinned:** ${f.pinned_manufacturer ?? '<no-manufacturer>'} ${f.pinned_part_number ?? ''} (${f.pinned_name_human ?? 'no name'})`)
    lines.push(`- **Reason:** ${f.reason}`)
    lines.push(`- **Suggested alternatives:**`)
    for (const alt of f.suggested_alternatives) lines.push(`  - ${alt}`)
    lines.push('')
  }
  return lines.join('\n')
}

const argv1 = process.argv[1] ?? ''
const isMain = /slot-mispin-detector\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: slot-mispin-detector <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(`[mispin-detector] failed to read ${statePath}: ${(err as Error).message}`)
    process.exit(1)
  }
  const result = detectMisPins(state)
  const md = renderMarkdown(result, statePath)
  if (outMdPath) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[mispin-detector] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  // Exit 15 on any finding (gate 15 — all findings are HIGH by construction:
  // KNOWN_MIS_PINS is a curated list of confirmed bugs).
  if (result.findings.length > 0) {
    console.error(`[mispin-detector] FAIL: ${result.findings.length} mis-pin(s)`)
    process.exit(15)
  }
  console.log(`[mispin-detector] PASS: ${result.candidates_scanned} candidates scanned, 0 mis-pins`)
}
