/**
 * PCB identity writeback — stamp resolved on-board part identities onto design words.
 *
 * INTENT: Gate 38 / PCB pipeline already picks real MPNs (fillBlankResolved, BOM CSV).
 * Design words often still say "TBD (detailed design)" for the SAME role, so
 * design-closure / Quality sheet treats them as fillable-TBD and floors Exec Summary.
 * Writeback is universal: match by character_id / name tokens → manufacturer + part_number.
 *
 * FLOW: PCB stage (or Excel rebuild) → collectPcbResolvedIdentities → stamp onto words
 * → computeDesignClosure / BoM see real identities.
 *
 * @file pcb-identity-writeback.ts
 */

export interface PcbResolvedIdentity {
  character_id: string
  manufacturer: string
  part_number: string
  description?: string
  source: 'fill_blank' | 'bom_csv' | 'placed'
}

export interface PcbIdentityWritebackResult {
  stamped: number
  skipped_already_real: number
  unmatched: number
  details: Array<{ character_id: string; part_number: string; word_id?: string }>
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isTbdPart(value: string | null | undefined): boolean {
  if (!value) return true
  const s = String(value).trim().toLowerCase()
  if (!s) return true
  return (
    s === 'tbd' ||
    s.startsWith('tbd ') ||
    s.includes('tbd (') ||
    s.includes('detailed design') ||
    s.includes('to be determined') ||
    s === 'n/a' ||
    s === 'na' ||
    s === '—' ||
    s === '-'
  )
}

/**
 * @description Collect manufacturer+MPN pairs already resolved by the PCB pipeline.
 */
export function collectPcbResolvedIdentities(pcbState: unknown): PcbResolvedIdentity[] {
  const pcb = asRecord(pcbState)
  if (!pcb) return []
  const out: PcbResolvedIdentity[] = []
  const seen = new Set<string>()

  const push = (raw: PcbResolvedIdentity): void => {
    const cid = String(raw.character_id || '').trim()
    const mfr = String(raw.manufacturer || '').trim()
    const mpn = String(raw.part_number || '').trim()
    if (!cid || !mpn || isTbdPart(mpn)) return
    const key = `${cid}::${mpn}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ character_id: cid, manufacturer: mfr || 'Generic', part_number: mpn, description: raw.description, source: raw.source })
  }

  const fillBlank = asRecord(pcb.fillBlankResolved)
  const parts = Array.isArray(fillBlank?.parts) ? (fillBlank!.parts as unknown[]) : []
  for (const p of parts) {
    const r = asRecord(p)
    if (!r) continue
    push({
      character_id: String(r.character_id || r.ref || ''),
      manufacturer: String(r.manufacturer || ''),
      part_number: String(r.mpn || r.part_number || ''),
      description: String(r.description || r.name || ''),
      source: 'fill_blank',
    })
  }

  const pipeline = asRecord(pcb.pipeline)
  // INTENT (cold-v17): live PCB stage stores resolved identities on
  // pipeline.generator.components (characterId + partNumber), not fillBlankResolved.
  const generator = asRecord(pipeline?.generator)
  const genComps = Array.isArray(generator?.components) ? (generator!.components as unknown[]) : []
  for (const p of genComps) {
    const r = asRecord(p)
    if (!r) continue
    push({
      character_id: String(r.characterId || r.character_id || r.ref || ''),
      manufacturer: String(r.manufacturer || r.mfr || ''),
      part_number: String(r.partNumber || r.mpn || r.part_number || ''),
      description: String(r.nameHuman || r.description || r.name || ''),
      source: 'placed',
    })
  }

  const bomParts = Array.isArray(pipeline?.bomParts) ? (pipeline!.bomParts as unknown[]) : []
  for (const p of bomParts) {
    const r = asRecord(p)
    if (!r) continue
    push({
      character_id: String(r.character_id || r.ref || r.value || ''),
      manufacturer: String(r.manufacturer || r.mfr || ''),
      part_number: String(r.mpn || r.part_number || r.lcsc || ''),
      description: String(r.description || r.value || ''),
      source: 'bom_csv',
    })
  }

  const placed = Array.isArray(pcb.placedParts) ? (pcb.placedParts as unknown[]) : []
  for (const p of placed) {
    const r = asRecord(p)
    if (!r) continue
    push({
      character_id: String(r.character_id || r.ref || ''),
      manufacturer: String(r.manufacturer || ''),
      part_number: String(r.mpn || r.part_number || ''),
      description: String(r.description || r.name || ''),
      source: 'placed',
    })
  }

  return out
}

function wordPartNumber(word: Record<string, unknown>): string | null {
  const mods = Array.isArray(word.modifier_characters) ? word.modifier_characters : []
  for (const m of mods) {
    const r = asRecord(m)
    if (!r) continue
    const kind = String(r.kind || r.type || '').toLowerCase()
    if (kind === 'part_number' || kind === 'mpn') {
      const v = r.value ?? r.part_number ?? r.mpn
      if (v != null && String(v).trim()) return String(v).trim()
    }
  }
  return null
}

function setOrReplaceMod(
  word: Record<string, unknown>,
  kind: string,
  value: string,
): void {
  const mods = Array.isArray(word.modifier_characters)
    ? ([...word.modifier_characters] as Record<string, unknown>[])
    : []
  const idx = mods.findIndex((m) => {
    const r = asRecord(m)
    return r && String(r.kind || r.type || '').toLowerCase() === kind
  })
  const next = { kind, value, provenance: 'pcb_identity_writeback' }
  if (idx >= 0) mods[idx] = { ...mods[idx], ...next }
  else mods.push(next)
  word.modifier_characters = mods
}

function normalizeRoleKey(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/_word$/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * DECISION: exact character_id match only (after normalize).
 * TRIED: token-overlap / substring matching on cold-v17 — smeared IRLB onto
 * source_sink_stage and TL072 onto pass_bank. Never again.
 */
function identityMatchesWord(identity: PcbResolvedIdentity, word: Record<string, unknown>): boolean {
  const wordCid = normalizeRoleKey(
    String(
      (asRecord(word.content_character)?.character_id as string) ||
        word.character_id ||
        '',
    ),
  )
  const wordId = normalizeRoleKey(String(word.word_id || word.id || ''))
  const idCid = normalizeRoleKey(identity.character_id)
  if (!idCid) return false
  if (wordCid && wordCid === idCid) return true
  if (wordId && wordId === idCid) return true
  return false
}

/**
 * @description Stamp PCB-resolved manufacturer+MPN onto matching design words that are still TBD.
 * Mutates designModules in place. Universal — any class with PCB + design words.
 */
export function stampPcbResolvedIdentitiesOntoDesign(
  designModules: unknown,
  pcbState: unknown,
): PcbIdentityWritebackResult {
  const identities = collectPcbResolvedIdentities(pcbState)
  const result: PcbIdentityWritebackResult = {
    stamped: 0,
    skipped_already_real: 0,
    unmatched: 0,
    details: [],
  }
  if (identities.length === 0) return result

  const modules = Array.isArray(designModules)
    ? designModules
    : asRecord(designModules)?.modules
  if (!Array.isArray(modules)) return result

  const used = new Set<string>()

  for (const mod of modules) {
    const m = asRecord(mod)
    if (!m) continue
    const subs = Array.isArray(m.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const s = asRecord(sm)
      if (!s) continue
      const words = Array.isArray(s.words) ? s.words : []
      for (const w of words) {
        const word = asRecord(w)
        if (!word) continue
        const existing = wordPartNumber(word)
        if (existing && !isTbdPart(existing)) {
          result.skipped_already_real += 1
          continue
        }
        const match = identities.find(
          (id) => !used.has(`${id.character_id}::${id.part_number}`) && identityMatchesWord(id, word),
        )
        if (!match) continue
        used.add(`${match.character_id}::${match.part_number}`)
        setOrReplaceMod(word, 'manufacturer', match.manufacturer)
        setOrReplaceMod(word, 'part_number', match.part_number)
        if (isTbdPart(String(word.name_human || '')) && match.description) {
          word.name_human = match.description
        }
        result.stamped += 1
        result.details.push({
          character_id: match.character_id,
          part_number: match.part_number,
          word_id: String(word.word_id || word.id || ''),
        })
      }
    }
  }

  result.unmatched = identities.length - used.size
  return result
}

export function proveCatchPcbIdentityWriteback(): void {
  const design = {
    modules: [
      {
        sub_modules: [
          {
            words: [
              {
                word_id: 'per_channel_reverse_polarity_detector_word',
                content_character: { character_id: 'per_channel_reverse_polarity_detector' },
                name_human: 'Per Channel Reverse Polarity Detector',
                modifier_characters: [{ kind: 'part_number', value: 'TBD (detailed design)' }],
              },
              {
                // Adversarial: must NOT smear onto a sibling channel role
                word_id: 'per_channel_linear_source_sink_stage_word',
                content_character: { character_id: 'per_channel_linear_source_sink_stage' },
                name_human: 'Per Channel Linear Source Sink Stage',
                modifier_characters: [{ kind: 'part_number', value: 'TBD (detailed design)' }],
              },
              {
                word_id: 'already',
                content_character: { character_id: 'sense_resistor' },
                modifier_characters: [{ kind: 'part_number', value: 'WSL2512R0100FEA' }],
              },
            ],
          },
        ],
      },
    ],
  }
  const pcb = {
    pipeline: {
      generator: {
        components: [
          {
            characterId: 'per_channel_reverse_polarity_detector',
            manufacturer: 'Diodes Incorporated',
            partNumber: 'BSS84-7-F',
            nameHuman: 'Per Channel Reverse Polarity Detector',
          },
          {
            characterId: 'per_channel_discharge_load_mosfet',
            manufacturer: 'Infineon Technologies',
            partNumber: 'IRLB3813PBF',
            nameHuman: 'Per Channel Discharge Load Mosfet',
          },
        ],
      },
    },
  }
  const r = stampPcbResolvedIdentitiesOntoDesign(design, pcb)
  if (r.stamped !== 1) throw new Error(`expected 1 stamp (exact CID only), got ${r.stamped}`)
  const words = (design.modules[0] as { sub_modules: { words: Record<string, unknown>[] }[] })
    .sub_modules[0].words
  const pn = wordPartNumber(words[0])
  if (pn !== 'BSS84-7-F') throw new Error(`expected BSS84-7-F, got ${pn}`)
  const smear = wordPartNumber(words[1])
  if (smear && !isTbdPart(smear)) {
    throw new Error(`source_sink must stay TBD (no smear), got ${smear}`)
  }
  if (collectPcbResolvedIdentities(pcb).length < 2) throw new Error('collect empty')
}

if (typeof require !== 'undefined' && require.main === module) {
  proveCatchPcbIdentityWriteback()
  console.log('pcb-identity-writeback proveCatch OK')
}
