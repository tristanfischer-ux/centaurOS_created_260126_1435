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
  /** Optional EXCLUDE on the word_id field (separate from character_id).
   * Used when the chain creates a word whose word_id semantic disagrees
   * with its content_character.character_id — e.g. `vent_seal_word`
   * misclassified under character_id `deflagration_vent_panel`. The
   * word_id takes precedence: if it signals seal/gasket/bracket the
   * mis-pin rule is skipped regardless of character_id. */
  exclude_word_id?: RegExp
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
    // BESS L20 (2026-05-25) refinement: exclude `_seal`, `_gasket`,
    // `_frame_mount`, `_clamp`, `_bracket` suffixes so the rule only fires
    // on the burst panel/disc itself, not on accessory hardware that
    // legitimately uses polymer (vent seals are typically EPDM /
    // fluorocarbon rubber; gaskets are silicone; brackets are mild steel
    // or polymer). Only the rupture element itself must be metallic.
    character_id_pattern: /^(?!.*(_seal|_gasket|_frame_mount|_clamp|_bracket|_mount|_housing)$).*(deflagration|burst_disc|rupture_disc|explosion_vent|pressure_relief_disc).*$/i,
    // BESS L21 (2026-05-25) additional refinement: also exclude based on
    // word_id suffix. The chain can create a `vent_seal_word` whose
    // content_character.character_id is `deflagration_vent_panel` (a
    // chain-side semantic mismatch — word names a seal but classifies it
    // as the panel). When word_id signals seal/gasket/bracket, that takes
    // precedence: the word is the seal hardware regardless of what the
    // misclassified character_id says.
    exclude_word_id: /(_seal|_gasket|_frame_mount|_clamp|_bracket|_mount|_housing)_word$|^(vent_seal|vent_gasket|vent_frame_mount|vent_clamp|vent_bracket)/i,
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
  // ── BESS L21 Physics Critic finding #1: AC-rated 170M fuse on DC bus ──
  // Bussmann 170M family covers many subfamily voltage classes:
  //  - 170M10xx / 170M11xx / 170M12xx / 170M13xx / 170M14xx / 170M15xx
  //    / 170M16xx / 170M17xx / 170M50xx / 170M51xx / 170M52xx / 170M53xx
  //    / 170M54xx / 170M55xx / 170M56xx / 170M57xx / 170M65xx / 170M66xx
  //    / 170M67xx / 170M68xx / 170M69xx — primarily 690 V AC (IEC) / 700 V AC
  //    (UL) on the canonical Eaton 720014 datasheet.
  //  - 170M18xx / 170M19xx — also rated 1000 V DC per the IGBT-protection
  //    catalogue, but the standard datasheet leads with AC ratings, leaving
  //    physics-review readers uncertain.
  //
  // For a DC bus pin (slot pattern dc_*_fuse, *dc_hrc_fuse, *_dc_fuse, etc.)
  // the safest practice is to swap to a part whose CANONICAL datasheet
  // explicitly states a DC rating — Eaton Bussmann PV-NH series is the
  // industry-standard DC-PV / battery-storage line (PV-200ANH1 etc.).
  // This rule fires on EVERY 170M variant pinned to a DC fuse slot,
  // including the 170M18xx + 170M19xx subfamilies that ARE in fact
  // 1000 V DC rated — because picking those requires the reader to know
  // which subfamily exception applies and read the supplementary IGBT
  // catalogue, slowing physics review. Forcing PV-NH eliminates the
  // ambiguity. Bug class: "AC-rated fuse pinned to DC bus".
  //
  // Source for ambiguity: Eaton 720014 datasheet
  // https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/bussmann-iec-high-speed-semi-conductors-fuses/bussmann-iec-square-body-fuses/eaton-bussmann-series-40-2000a-170m-high-speed-fuses-datasheet-720014-en-gb.pdf
  // (lists 690 V AC IEC / 700 V AC UL on standard pages) + RS Components
  // listing for 170M1811 https://us.rs-online.com/product/bussmann-by-eaton/170m1811/74058756/
  // (shows 1000 V DC supplemental rating that requires opening a separate
  // application note to verify).
  {
    character_id_pattern: /^(?:.*_)?(dc_hrc_fuse|dc_string_fuse|dc_rack_fuse|dc_bus_fuse|dc_main_fuse|dc_fuse|hrc_fuse_dc|rack_dc_fuse|string_dc_fuse|battery_dc_fuse|pv_dc_fuse|pack_fuse)$/i,
    forbidden_match: { manufacturer: /^(Eaton\s+)?Bussmann$|^Eaton$/i, part_number: /^170M\d{4}[A-Z]?$/i },
    reason:
      'Bussmann 170M-series square-body high-speed fuses are PRIMARILY documented under their 690 V AC (IEC) / 700 V AC (UL) rating on the canonical Eaton 720014 datasheet. The 170M18xx + 170M19xx subfamilies ARE in fact 1000 V DC rated per the supplementary IGBT-protection catalogue, but selecting them requires the physics reviewer to know which subfamily exception applies and cross-reference a non-primary application note. For a DC bus pin, swap to the Eaton Bussmann PV-NH series (PV-200ANH1, PV-160ANH1, etc.) — the EXPLICIT DC-PV / battery-storage line, Class gPV per IEC 60269-6, 1000 V DC unambiguously stated on the primary product page. AC-rated fuses on a DC bus that cannot extinguish DC arcs would cause catastrophic fire or explosion during a fault.',
    suggested_alternatives: [
      'Eaton Bussmann PV-200ANH1 (200 A / 1000 V DC / NH1, Class gPV per IEC 60269-6, 50 kAIC) — canonical 200 A BESS rack-fuse',
      'Eaton Bussmann PV-160ANH1 (160 A / 1000 V DC / NH1, Class gPV)',
      'Eaton Bussmann PV-125ANH1 (125 A / 1000 V DC / NH1, Class gPV)',
      'Eaton Bussmann PV-100ANH1 (100 A / 1000 V DC / NH1, Class gPV) — for low-current per-rack protection',
      'Eaton Bussmann PV-400ANH2 (400 A / 1000 V DC / NH2) — for higher-current bus protection',
      'OR — if the 170M18xx/19xx subfamily is genuinely required for a non-PV application, leave a comment citing the IGBT-protection catalogue page so reviewers can verify the 1000 V DC rating directly',
    ],
  },
  // ── BESS L21 Physics Critic finding #4: heat-shrink boot pinned as
  // grounding braid. TE Connectivity / Raychem 202K142-25 is a moulded
  // heat-shrinkable transition boot (size 42, polyolefin elastomer), NOT
  // a copper grounding braid. Pinning a polymer boot as a chassis-bond
  // braid means there is ZERO current-carrying capacity in the safety
  // earth path — a PCS fault could drive >2 kA chassis current with no
  // bond to dissipate it. Generalised to all 202Kxxx + 202Pxxx +
  // RNF-100 + WCSM heat-shrink families pinned to grounding slots.
  //
  // Source: DigiKey listing https://www.digikey.com/en/products/detail/te-connectivity-aerospace-defense-and-marine/202K142-25-0/2394220
  // ("HEATSHRINK BOOT SZ42 BLACK").
  {
    character_id_pattern: /^(?:.*_)?(emc_ground_braid|chassis_bond|grounding_braid|ground_braid|earth_bond|bonding_braid|grounding_strap|earth_strap|chassis_ground|safety_earth_bond|equipotential_bond)$/i,
    forbidden_match: { manufacturer: /^TE\s*(?:Connectivity)?$|^Raychem$/i, part_number: /^(202[KP]\d{3}-\d{2}|RNF-?100|WCSM[\w-]*|WPK[\w-]*)/i },
    reason:
      'TE Connectivity / Raychem 202K/202P-series, RNF-100, WCSM, WPK families are HEAT-SHRINKABLE MOULDED TRANSITION BOOTS / TUBING (polyolefin or fluorocarbon elastomer). They have ZERO copper conductor and ZERO current-carrying capacity. A chassis-bond / EMC grounding strap must carry potential fault current (typically 200-500 A continuous capacity for utility BESS) — a polymer boot would not bond ANY current and the chassis would float to bus potential during a fault. Required: a tinned copper braid with integral palms or crimp lugs and an explicit ampacity rating.',
    suggested_alternatives: [
      'nVent ERIFLEX MBJ50-300-10 (catalog 556860): 50 mm² tinned copper braid, 250 A continuous, 300 mm c-c, M10 palms — the canonical utility-BESS chassis-bond part',
      'nVent ERIFLEX MBJ50-200-10 / MBJ50-500-10 — same family, different lengths',
      'nVent ERIFLEX MBJ95-300-10 — 95 mm² / 400 A for higher-fault applications',
      'Mersen FLEXIBAR FFB-50 — 50 mm² tinned copper flat braid (legacy alternative)',
      'OR — if a polymer transition boot is genuinely needed (e.g. for cable strain relief), rename the slot character_id to cable_transition_boot / cable_strain_relief and re-pin the heat-shrink boot there',
    ],
  },
  // ── BESS L21 Physics Critic finding #2: NTC thermistor lead bolted
  // to cell power terminal. Real BESS practice (Tesla Megapack 2 XL,
  // CATL EnerC+, Sungrow PowerStack) ALWAYS bonds insulated-bead
  // thermistors to the BUSBAR SURFACE with thermal epoxy and wires
  // them to a SEPARATE BMS thermistor input that is galvanically
  // isolated from the cell taps. Pinning an NTC thermistor lead OR
  // a ring-terminal-with-NTC-role to a cell terminal hardware slot
  // shorts the low-voltage BMS temperature input to the 800 V DC
  // pack bus — instant slave-board destruction + Class C fire +
  // shock hazard.
  //
  // This rule fires when:
  //  (a) the slot character_id is a cell_terminal_hardware / cell_stud /
  //      cell_post / pack_terminal_hardware / cell_terminal_lug /
  //      cell_terminal_fastener etc., AND
  //  (b) the part is an NTC thermistor (any TDK/EPCOS/Vishay/Murata
  //      B5xxxx / NTCxxxx / TMP series), OR the form modifier
  //      explicitly mentions "NTC" / "thermistor".
  //
  // Bug class: "NTC thermistor pinned to cell power stud".
  {
    character_id_pattern: /^(?:.*_)?(cell_terminal_hardware|cell_stud|cell_post|pack_terminal_hardware|cell_terminal_lug|cell_terminal_fastener|cell_terminal_bolt|cell_terminal_screw|cell_m8_stud|cell_busbar_lug)$/i,
    forbidden_match: { form: /\b(NTC\s+thermistor|thermistor\s+(lead|wire|cable|probe))\b/i },
    reason:
      'NTC thermistor leads MUST NOT terminate on a cell power terminal (M8 stud or similar). Bolting an analog thermistor lead directly to an 800 V DC pack stud shorts the low-voltage BMS temperature-sensing input to the high-voltage bus — the slave board is destroyed instantly and a Class C electrical fire + shock hazard is created. Real utility BESS (Tesla Megapack 2 XL, CATL EnerC+, Sungrow PowerStack, BYD HVS) bond insulated-bead thermistors to the BUSBAR SURFACE (chassis-ground reference) with thermal epoxy, and wire them to a SEPARATE BMS thermistor connector with a 2.5 kV isolation barrier on the temperature ADC. Required: split the role — voltage-sense lug stays on the cell stud (one per cell to the BMS slave at ≤1 mA quiescent), thermistor bead bonds to the busbar SURFACE (not the terminal) and routes to the BMS isolated thermistor input via a separate harness.',
    suggested_alternatives: [
      'EPCOS / TDK B57703M0103G040 NTC bead probe (10 kΩ, PTFE-insulated 45 mm leads) bonded to BUSBAR SURFACE with 3M Scotch-Cast 4444 thermal epoxy',
      'TDK NTCS Mini-K NTC bead (insulated, busbar-surface mount)',
      'Amphenol C503-NTC (insulated-bead probe with 2.5 kV barrier connector)',
      'Murata NXFT15XH103FE2B (insulated-bead, lead-wire isolated)',
      'OR — if the slot is genuinely meant to carry both functions, split it into TWO words: a `cell_terminal_hardware_word` (voltage sense ONLY, e.g. Klauke 16208 ring terminal) and a separate `thermistor_attachment_word` (bead on busbar surface, separate harness)',
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
      if (rule.exclude_word_id && rule.exclude_word_id.test(p.word_id)) continue
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
