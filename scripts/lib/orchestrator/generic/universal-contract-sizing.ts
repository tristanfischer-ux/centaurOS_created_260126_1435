/**
 * scripts/lib/orchestrator/generic/universal-contract-sizing.ts
 *
 * UNIVERSAL contract-driven equipment sizing + synthesis (no per-class table — the
 * super-brief direction).
 *
 * THE WALL it removes (RAS, 2026-06-13): the engineering CONTRACT computes every
 * physics quantity an archetype needs (`rearing_tank_volume_each_m3 = 334`,
 * `rearing_tank_count = 10`, `biofilter_tank_volume_m3 = 515`,
 * `drum_filter_throughput_m3_h = 13360`, `heat_pump_electrical_kw = 427`), but the
 * generic emitter ships a FIXED 10-module × ~5-word skeleton (structure / power /
 * control / sensing / safety boilerplate) that is the SAME for every archetype, with
 * a few grounded parts and several "representative component" placeholders. So:
 *   (1) the PRINCIPAL process equipment is never emitted — the 10 rearing tanks, the
 *       biofilter vessel and the degasser are simply ABSENT from the bill of materials;
 *   (2) the few real words carry no dimension or count, so a 334 m³ tank renders as
 *       the Blender 700 mm type-default box, part-grounding picks scale-wrong parts,
 *       counts stay ×1, and the cost collapses.
 *
 * The legacy `applyFamilySizing` (sizing.ts) solved (2) ONLY for the battery family via
 * a hand-written name→quantity rule table — exactly the per-class curation we retire.
 *
 * THIS pass is the universal replacement, in two moves driven entirely by the contract:
 *   A. SIZE — the quantity KEYS are self-describing (`<equipment>_<measure>_<unit>`).
 *      Parse (equipment, measure, value, unit), group by equipment, match each BoM word
 *      by STEMMED token overlap, and stamp a real DIMENSION (cylinder from a volume,
 *      scaled box from a power/throughput, area from an area), a real QUANTITY (from a
 *      `_count`), and an engineering RATING.
 *   B. SYNTHESISE — for every PRINCIPAL equipment group (a volume / area / throughput /
 *      device-power) that no existing word matched, CREATE a sized + counted equipment
 *      word and place it in the most appropriate module. This is what puts the 10 tanks,
 *      the biofilter and the degasser into the BoM + geometry for the first time.
 *
 * Nothing is invented: a dimension/rating is only set when a contract quantity supplies
 * it; a word is only synthesised for a group the contract actually computed. Universal
 * — consumes whatever the contract computed, any archetype, no `if class`. Dimension
 * strings use the format the Blender's `parse_dimension` + the renderer both read
 * ("<d> m dia x <h> m", "<w>x<d>x<h> mm", "<a> m² area"), so geometry + BoM + cost all
 * consume the same sized words at once.
 *
 * British spelling throughout.
 */

import type { ContractInProgress } from '../types'
import { mod, type ModifierCharacter } from './emitter-primitives'
import { mergeMods, type ModuleLike, type WordLike } from './sizing'

// ── measure taxonomy ───────────────────────────────────────────────────────
type Measure =
  | 'volume' // m³ — a vessel/tank (drives a cylinder dimension)
  | 'area' // m² — a footprint/membrane/pond
  | 'count' // integer — drives the quantity modifier
  | 'power' // kW/kVA on a DEVICE (drives a scaled box + rating + synthesis)
  | 'duty' // kW of LOAD/demand (rating only — NOT a device, never synthesised)
  | 'throughput' // m³/h flow or process throughput (scaled box + rating)
  | 'rate' // kg/h, kg/day mass rate (rating only)
  | 'mass' // kg (rating only)
  | 'current' // A (rating only)

interface EquipGroup {
  phrase: string
  stems: string[]
  volume?: number
  volumeIsEach: boolean
  area?: number
  count?: number
  power?: number // device power (kW) — synthesisable
  duty?: number // load/demand (kW) — rating only
  throughput?: number
  rate?: number
  rateUnit?: string
  mass?: number
  current?: number
}

// Ordered longest-suffix-first. [regex on key tail, measure, unit, perEach?]
const SUFFIX_RULES: { re: RegExp; measure: Measure; unit: string; each?: boolean }[] = [
  { re: /_volume_each_m3$/, measure: 'volume', unit: 'm³', each: true },
  { re: /_each_m3$/, measure: 'volume', unit: 'm³', each: true },
  { re: /_media_volume_m3$/, measure: 'volume', unit: 'm³' },
  { re: /_tank_volume_m3$/, measure: 'volume', unit: 'm³' },
  { re: /_volume_m3$/, measure: 'volume', unit: 'm³' },
  { re: /_throughput_m3_h$/, measure: 'throughput', unit: 'm³/h' },
  { re: /_air_flow_m3_h$/, measure: 'throughput', unit: 'm³/h' },
  { re: /_water_flow_m3_h$/, measure: 'throughput', unit: 'm³/h' },
  { re: /_flow_m3_h$/, measure: 'throughput', unit: 'm³/h' },
  { re: /_duty_kw$/, measure: 'duty', unit: 'kW' },
  { re: /_heating_kw$/, measure: 'duty', unit: 'kW' },
  { re: /_loss_kw$/, measure: 'duty', unit: 'kW' },
  { re: /_electrical_kw$/, measure: 'power', unit: 'kW' },
  { re: /_power_kw$/, measure: 'power', unit: 'kW' },
  { re: /_rating_kva$/, measure: 'power', unit: 'kVA' },
  { re: /_supply_kg_h$/, measure: 'rate', unit: 'kg/h' },
  { re: /_kg_h$/, measure: 'rate', unit: 'kg/h' },
  { re: /_area_m2$/, measure: 'area', unit: 'm²' },
  { re: /_m2$/, measure: 'area', unit: 'm²' },
  { re: /_mass_kg$/, measure: 'mass', unit: 'kg' },
  { re: /_current_a$/, measure: 'current', unit: 'A' },
  { re: /_count$/, measure: 'count', unit: '' },
]

// Stems describing an AGGREGATE / property / driver / load — never a discrete
// equipment item; excluded from matching + synthesis.
const STOP_STEMS = new Set([
  'total', 'syste', 'desig', 'plant', 'overa', 'conne', 'suppl', 'deman',
  'annua', 'daily', 'stand', 'makeu', 'sourc', 'setpo', 'capex', 'ceili',
  'auto', 'plann', 'tool', 'ran', 'flag', 'fract', 'ratio', 'load', 'dose',
  'inter', 'build', 'proce', 'recyc', 'turno', 'harve', 'stock', 'conce',
  'solid', 'ammon', 'bioma', 'feed', 'air', 'each', 'avail', 'maxim', 'minim',
])

function stem(tok: string): string {
  let t = tok.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (t.endsWith('s') && t.length > 4) t = t.slice(0, -1)
  return t.slice(0, 5)
}

function significantStems(phrase: string): string[] {
  const out: string[] = []
  for (const raw of phrase.split(/[_\s]+/)) {
    if (!raw) continue
    const s = stem(raw)
    if (s.length < 3) continue
    if (STOP_STEMS.has(s)) continue
    if (/^\d+$/.test(s)) continue
    if (!out.includes(s)) out.push(s)
  }
  return out
}

function buildGroups(quantities: Record<string, number>): EquipGroup[] {
  const byPhrase = new Map<string, EquipGroup>()
  for (const [key, value] of Object.entries(quantities)) {
    if (!Number.isFinite(value) || value <= 0) continue
    let matched: { phrase: string; measure: Measure; perEach: boolean } | null = null
    for (const rule of SUFFIX_RULES) {
      if (rule.re.test(key)) {
        matched = { phrase: key.replace(rule.re, ''), measure: rule.measure, perEach: !!rule.each }
        break
      }
    }
    if (!matched) continue
    const stems = significantStems(matched.phrase)
    if (stems.length === 0) continue
    const id = stems.join('|')
    let g = byPhrase.get(id)
    if (!g) {
      g = { phrase: matched.phrase, stems, volumeIsEach: false }
      byPhrase.set(id, g)
    }
    switch (matched.measure) {
      case 'volume':
        if (g.volume === undefined || (matched.perEach && !g.volumeIsEach)) {
          g.volume = value
          g.volumeIsEach = matched.perEach
        }
        break
      case 'area': g.area = Math.max(g.area ?? 0, value); break
      case 'count': g.count = Math.max(g.count ?? 0, value); break
      case 'power': g.power = Math.max(g.power ?? 0, value); break
      case 'duty': g.duty = Math.max(g.duty ?? 0, value); break
      case 'throughput': g.throughput = Math.max(g.throughput ?? 0, value); break
      case 'rate': if (g.rate === undefined) { g.rate = value; g.rateUnit = 'kg/h' } break
      case 'mass': g.mass = Math.max(g.mass ?? 0, value); break
      case 'current': g.current = Math.max(g.current ?? 0, value); break
    }
  }
  return [...byPhrase.values()]
}

// ── dimension synthesis (Blender- + renderer-parseable strings) ─────────────
function cylinderFromVolumeM3(v: number, phrase = ''): string {
  // Open process tanks/basins are WIDE + SHALLOW (a RAS rearing tank, a clarifier,
  // an aeration basin, a buffer sump) — NOT silos. Universal, scale-aware depth
  // BAND: target water depth grows gently with volume (≈0.4·V^⅓) but clamps to
  // [1.5, 4] m — real open-tank practice across small sumps → large basins — and
  // the diameter FOLLOWS from the volume (d = √(4V/(π·depth))). At 334 m³ that is
  // ⌀12.4 × 2.8 m (h/d 0.22), a proper shallow rearing tank, not a ⌀9.5 × 4.7 m
  // tower. Mass-transfer COLUMNS/TOWERS stay TALL (h ≈ 2.2·d); everything else is
  // neutral (h ≈ d). Keyed on the device NOUN, so it is universal across classes.
  const p = phrase.toLowerCase()
  const isOpenTank = /tank|basin|sump|pond|reservoir|clarifier|settl|lagoon|\bpit\b|\bcell\b|raceway|trough/.test(p)
  const isTower = /column|tower|stripper|scrubber|absorber|contactor|degasser/.test(p)
  if (isOpenTank) {
    // WATER depth follows the scale-aware band; the diameter holds the WORKING
    // volume v at that depth; the SHELL stands +15 % above the liquid line
    // (freeboard — a tank never fills to the brim). The emitted dimension is the
    // SHELL ⌀×height the BoM costs; the capacity modifier stays the working v. At
    // 334 m³ → ⌀12.4 × 3.2 m (water 2.8 m + freeboard), h/d 0.26 — a shallow tank.
    const waterDepth = Math.min(4.0, Math.max(1.5, 0.4 * Math.cbrt(v)))
    const d = Math.sqrt((4 * v) / (Math.PI * waterDepth))
    const shellHeight = waterDepth * 1.15
    return `${d.toFixed(1)} m dia x ${shellHeight.toFixed(1)} m`
  }
  const a = isTower ? 2.2 : 1.0
  const d = Math.cbrt((4 * v) / (a * Math.PI))
  return `${d.toFixed(1)} m dia x ${(a * d).toFixed(1)} m`
}
function boxFromRatingKw(kw: number): string {
  const side = Math.min(6, Math.max(0.6, 1.2 * Math.cbrt(kw / 100)))
  const mm = Math.round(side * 1000)
  return `${mm}x${Math.round(mm * 0.85)}x${Math.round(mm * 1.1)} mm`
}
function boxFromThroughputM3h(q: number): string {
  const side = Math.min(7, Math.max(0.7, 1.4 * Math.cbrt(q / 1000)))
  const mm = Math.round(side * 1000)
  return `${mm}x${Math.round(mm * 0.85)}x${Math.round(mm * 1.1)} mm`
}

function dimAndRatingFor(g: EquipGroup): ModifierCharacter[] {
  const add: ModifierCharacter[] = []
  if (g.volume !== undefined) {
    add.push(mod('dimension', cylinderFromVolumeM3(g.volume, g.phrase)))
    add.push(mod('capacity', `${Math.round(g.volume)}`, 'm³'))
  } else if (g.area !== undefined) {
    add.push(mod('dimension', `${Math.round(g.area)} m² area`))
  } else if (g.power !== undefined) {
    add.push(mod('dimension', boxFromRatingKw(g.power)))
  } else if (g.throughput !== undefined) {
    add.push(mod('dimension', boxFromThroughputM3h(g.throughput)))
  }
  if (g.power !== undefined) add.push(mod('rating_primary', `${Math.round(g.power)}`, 'kW'))
  else if (g.throughput !== undefined) add.push(mod('rating_primary', `${Math.round(g.throughput)}`, 'm³/h'))
  else if (g.duty !== undefined) add.push(mod('rating_primary', `${Math.round(g.duty)}`, 'kW'))
  else if (g.rate !== undefined) add.push(mod('rating_primary', `${Math.round(g.rate)}`, g.rateUnit || 'kg/h'))
  else if (g.current !== undefined) add.push(mod('rating_primary', `${Math.round(g.current)}`, 'A'))
  return add
}

// Universal device-noun morphology: a vessel/footprint (volume/area) is ALWAYS a
// discrete equipment item, but a throughput/power only denotes equipment worth
// synthesising when the phrase NAMES a device — either a known device noun or an
// "-er/-or" agent noun (degasser, stripper, blower, clarifier). This is what keeps
// `recirculation_flow` (a SYSTEM flow → "-tion" process noun) from minting a bogus box
// while `degasser_air_flow` (a device) correctly synthesises. No per-class table.
const DEVICE_NOUNS = new Set([
  'pump', 'fan', 'tank', 'vessel', 'column', 'tower', 'skid', 'unit', 'exchanger',
  'chiller', 'boiler', 'degasser', 'filter', 'blower', 'compressor', 'reactor',
  'clarifier', 'separator', 'stripper', 'mixer', 'press', 'membrane', 'sump',
  'basin', 'cone', 'scrubber', 'cyclone', 'centrifuge', 'hopper', 'silo', 'drum',
])
function phraseLooksLikeDevice(phrase: string): boolean {
  for (const raw of phrase.split(/[_\s]+/)) {
    const t = raw.toLowerCase()
    if (DEVICE_NOUNS.has(t)) return true
    if (t.length > 4 && /(er|or)$/.test(t)) return true
  }
  return false
}

// A group is SYNTHESISABLE equipment (worth creating if absent) when it has a real
// physical extent: a vessel volume or a footprint area (always), or a throughput /
// device power whose phrase actually names a device. A load/duty/rate/mass/current,
// or a system flow with a process-noun phrase, is NOT equipment.
function isSynthesisable(g: EquipGroup): boolean {
  if (g.volume !== undefined && g.volume >= 1) return true
  if (g.area !== undefined && g.area >= 2) return true
  if ((g.throughput !== undefined && g.throughput >= 10) || (g.power !== undefined && g.power >= 15)) {
    return phraseLooksLikeDevice(g.phrase)
  }
  return false
}

// ── cleanup (Round 3): physics-first BoM — drop the skeleton's leftover junk ──
// Small generic detailed-design filler that is never PRINCIPAL equipment (keeps it
// out of the GA + the headline cost). Structure/enclosure are NOT here — they're real.
const PADDING_RE = /mounting\s+(bracket|hardware)|fastener\s+set|wiring\s+harness|gasket\s+seal|access\s+panel|service\s+connector|diagnostic\s+port|labelling\s+set|lifting\s+(point|lug)|\b(primary|secondary)\s+assembly\b/i
// Generic head-nouns that must NOT trigger a duplicate-drop (every pump/tank shares
// them); dedup fires only on a SPECIFIC shared stem (filt, degas, biofi…).
const DEDUP_GENERIC_STOP = new Set(['pump', 'tank', 'unit', 'syst', 'modu', 'pane', 'devi', 'asse'])
// A skeleton placeholder (no real catalogue MPN) — only these are ever dropped; a
// real grounded part (structured MPN) is always kept.
function isPlaceholder(w: WordLike): boolean {
  const pn = String((w.modifier_characters ?? []).find((m) => m.kind === 'part_number')?.value ?? '')
  return pn === '' || /tbd|detailed design|specify|representative/i.test(pn)
}

// ── sub-assembly explosion (PHYSICS-DERIVED — Tristan 2026-06-13 "make depth physics
// derived"). A real plant BoM is 200+ parts because every principal equipment is an
// ASSEMBLY. Earlier this was a flat name template with TBD parts + ALLOCATED prices
// (rejected as "made up"). Now each sub-component is SIZED from the parent's physics
// (motor kW from pump duty, shell area from the vessel's computed dia×height, drum from
// throughput) and PRICED BOTTOM-UP from that size via universal engineering cost factors
// (£/kW, £/m², £/m³, flat-rate instruments). Universal by equipment TYPE — the physics
// of a pump is identical in any plant — so no per-class table. The component prices SUM
// to the equipment cost; the contract's installed-cost anchor becomes a cross-check, not
// the source. Nothing is allocated; every line traces to the parent's computed physics.
interface ParentPhysics { kw: number; m3: number; m3h: number; diaM: number; htM: number; qty: number }
interface SubSpec { name: string; derive: (p: ParentPhysics) => { size?: string; rating?: { v: number; u: string }; gbp: number } }

function parentQty(w: WordLike): number {
  const mt = /(\d+)/.exec(String((w.modifier_characters ?? []).find((m) => m.kind === 'quantity')?.value ?? '1'))
  return mt ? Math.max(1, parseInt(mt[1], 10)) : 1
}
function readParentPhysics(w: WordLike): ParentPhysics {
  const mods = w.modifier_characters ?? []
  const r = mods.find((m) => m.kind === 'rating_primary')
  const cap = mods.find((m) => m.kind === 'capacity')
  const dimv = String(mods.find((m) => m.kind === 'dimension' || m.kind === 'dimensions')?.value ?? '')
  let kw = 0, m3h = 0
  if (r) {
    const v = parseFloat(String(r.value)) || 0
    const u = String(r.unit ?? '').toLowerCase()
    if (u.includes('kw') || u.includes('kva')) kw = v
    else if (u.includes('m³/h') || u.includes('m3/h') || u.includes('m³/hr')) m3h = v
  }
  const m3 = cap && /m³|m3/.test(String(cap.unit ?? '')) ? parseFloat(String(cap.value)) || 0 : 0
  const dm = /([\d.]+)\s*m\s*dia/i.exec(dimv)
  const hm = /dia[^x]*x\s*([\d.]+)\s*m/i.exec(dimv)
  return { kw, m3, m3h, diaM: dm ? parseFloat(dm[1]) : 0, htM: hm ? parseFloat(hm[1]) : 0, qty: parentQty(w) }
}

const R2 = (n: number) => Math.round(n)
const motorKw = (p: ParentPhysics) => Math.max(1.5, (p.kw || (p.m3h ? p.m3h / 120 : 30)) / 0.88)
const vesselArea = (p: ParentPhysics) => { const d = p.diaM || Math.cbrt(((p.m3 || 50) * 4) / Math.PI); const h = p.htM || d; return { shell: Math.PI * d * h, head: (Math.PI * d * d) / 4, d, h } }

// Each entry: parts SIZED + PRICED from the parent's physics. Cost factors are
// engineering order-of-magnitude (UK, installed-equipment basis), universal by type.
const SUB_ASSEMBLY: { re: RegExp; parts: SubSpec[] }[] = [
  { re: /\btank\b|vessel|reservoir|basin|\bsump\b|reactor|\bcolumn\b|tower|degass|biofilter|clarifier|digester|scrubber/i,
    parts: [
      { name: 'Shell Course', derive: (p) => { const a = vesselArea(p); return { size: `${a.d.toFixed(1)} m dia × ${a.h.toFixed(1)} m`, gbp: a.shell * 430 } } },
      { name: 'Top Head / Roof', derive: (p) => ({ gbp: vesselArea(p).head * 380 }) },
      { name: 'Base / Floor Plate', derive: (p) => ({ gbp: vesselArea(p).head * 340 }) },
      { name: 'Support Skirt / Legs', derive: (p) => ({ gbp: 1500 + (p.m3 || 50) * 12 }) },
      { name: 'Manway & Cover', derive: () => ({ gbp: 1400 }) },
      { name: 'Inlet Nozzle Set', derive: () => ({ gbp: 650 }) },
      { name: 'Outlet Nozzle Set', derive: () => ({ gbp: 650 }) },
      { name: 'Drain Nozzle', derive: () => ({ gbp: 450 }) },
      { name: 'Overflow / Weir', derive: () => ({ gbp: 700 }) },
      { name: 'Internal Distribution', derive: (p) => ({ gbp: 800 + (p.m3 || 50) * 6 }) },
      { name: 'Level Transmitter', derive: () => ({ gbp: 1200 }) },
      { name: 'Pressure Gauge', derive: () => ({ gbp: 160 }) },
      { name: 'Temperature Element', derive: () => ({ gbp: 380 }) },
      { name: 'Pressure / Vacuum Relief', derive: () => ({ gbp: 900 }) },
      { name: 'Access Ladder & Platform', derive: (p) => ({ gbp: 1800 + (p.htM || 4) * 320 }) },
      { name: 'Internal Lining / Coating', derive: (p) => { const a = vesselArea(p); return { gbp: (a.shell + a.head) * 55 } } },
      { name: 'Earthing Boss', derive: () => ({ gbp: 120 }) },
      { name: 'Nameplate', derive: () => ({ gbp: 60 }) },
    ] },
  { re: /(?<!heat[\s-])\bpump\b|blower|(?<!scroll\s)compressor|\bfan\b/i,  // NOT 'heat pump' (its own rule below)
    parts: [
      { name: 'Casing', derive: (p) => ({ gbp: 1500 + (p.kw || 30) * 14 }) },
      { name: 'Impeller / Rotor', derive: (p) => ({ gbp: 600 + (p.kw || 30) * 5 }) },
      { name: 'Drive Motor', derive: (p) => ({ rating: { v: motorKw(p), u: 'kW' }, gbp: 1200 + motorKw(p) * 48 }) },
      { name: 'Variable-Speed Drive', derive: (p) => ({ rating: { v: motorKw(p), u: 'kW' }, gbp: 800 + motorKw(p) * 72 }) },
      { name: 'Flexible Coupling', derive: (p) => ({ gbp: 300 + (p.kw || 30) * 2 }) },
      { name: 'Coupling Guard', derive: () => ({ gbp: 180 }) },
      { name: 'Baseplate', derive: (p) => ({ gbp: 600 + (p.kw || 30) * 4 }) },
      { name: 'Mechanical Seal', derive: (p) => ({ gbp: 900 + (p.kw || 30) * 9 }) },
      { name: 'Suction Isolation Valve', derive: (p) => ({ gbp: 400 + (p.kw || 30) * 6 }) },
      { name: 'Discharge Isolation Valve', derive: (p) => ({ gbp: 400 + (p.kw || 30) * 6 }) },
      { name: 'Non-Return Valve', derive: (p) => ({ gbp: 350 + (p.kw || 30) * 4 }) },
      { name: 'Discharge Pressure Gauge', derive: () => ({ gbp: 160 }) },
      { name: 'Anti-Vibration Mounts', derive: () => ({ gbp: 220 }) },
    ] },
  { re: /filter|\bscreen\b|strainer|membrane|skimmer/i,
    parts: [
      { name: 'Drum / Element', derive: (p) => ({ rating: { v: p.m3h || 500, u: 'm³/h' }, gbp: 4000 + (p.m3h || 500) * 1.1 }) },
      { name: 'Media / Mesh Panels', derive: (p) => ({ gbp: 1500 + (p.m3h || 500) * 0.4 }) },
      { name: 'Drive Gearmotor', derive: (p) => ({ rating: { v: Math.max(0.55, (p.m3h || 500) / 3500), u: 'kW' }, gbp: 1400 }) },
      { name: 'Backwash Spray Bar', derive: () => ({ gbp: 900 }) },
      { name: 'Backwash Pump', derive: () => ({ gbp: 2200 }) },
      { name: 'Reject Trough', derive: () => ({ gbp: 1100 }) },
      { name: 'Differential-Pressure Switch', derive: () => ({ gbp: 420 }) },
      { name: 'Support Frame', derive: () => ({ gbp: 1600 }) },
      { name: 'Local Control Panel', derive: () => ({ gbp: 3800 }) },
    ] },
  { re: /heat[\s-]?exchang|\bhx\b|condenser|evaporator|\bcooler\b/i,
    parts: [
      { name: 'Shell', derive: (p) => ({ rating: { v: p.kw || 200, u: 'kW' }, gbp: 2500 + (p.kw || 200) * 9 }) },
      { name: 'Tube Bundle', derive: (p) => ({ gbp: 3000 + (p.kw || 200) * 18 }) },
      { name: 'Tube Sheet', derive: () => ({ gbp: 1400 }) },
      { name: 'Channel Cover', derive: () => ({ gbp: 1100 }) },
      { name: 'Inlet Nozzle', derive: () => ({ gbp: 600 }) },
      { name: 'Outlet Nozzle', derive: () => ({ gbp: 600 }) },
      { name: 'Gasket Set', derive: () => ({ gbp: 450 }) },
      { name: 'Support Saddles', derive: () => ({ gbp: 900 }) },
      { name: 'Vent & Drain Valves', derive: () => ({ gbp: 520 }) },
    ] },
  { re: /heat[\s-]?pump|chiller|refrigerat/i,
    parts: [
      { name: 'Scroll Compressor', derive: (p) => ({ rating: { v: p.kw || 200, u: 'kW' }, gbp: 4000 + (p.kw || 200) * 95 }) },
      { name: 'Evaporator Coil', derive: (p) => ({ gbp: 1800 + (p.kw || 200) * 22 }) },
      { name: 'Condenser Coil', derive: (p) => ({ gbp: 1800 + (p.kw || 200) * 22 }) },
      { name: 'Expansion Valve', derive: () => ({ gbp: 650 }) },
      { name: 'Refrigerant Charge', derive: (p) => ({ gbp: 600 + (p.kw || 200) * 6 }) },
      { name: 'Suction Accumulator', derive: () => ({ gbp: 900 }) },
      { name: 'Refrigerant Pressure Switches', derive: () => ({ gbp: 520 }) },
      { name: 'Control Panel', derive: () => ({ gbp: 4200 }) },
      { name: 'Frame & Panels', derive: (p) => ({ gbp: 1500 + (p.kw || 200) * 4 }) },
      { name: 'Anti-Vibration Mounts', derive: () => ({ gbp: 280 }) },
    ] },
  { re: /oxygen|aerat|\buv\b|ozone|steriliz|disinfe|skimming/i,
    parts: [
      { name: 'Process Unit', derive: (p) => ({ gbp: 3000 + (p.m3h || p.kw || 100) * 3 }) },
      { name: 'Inlet / Outlet Manifolds', derive: () => ({ gbp: 1200 }) },
      { name: 'Flow Control Valve', derive: () => ({ gbp: 800 }) },
      { name: 'Dosing / Lamp Module', derive: () => ({ gbp: 2400 }) },
      { name: 'Local Sensor', derive: () => ({ gbp: 900 }) },
      { name: 'Control & Power Module', derive: () => ({ gbp: 2600 }) },
      { name: 'Mounting Frame', derive: () => ({ gbp: 1100 }) },
    ] },
]

function sanitizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'part'
}
function subWord(spec: SubSpec, parentId: string, qty: number, physics: ParentPhysics): WordLike & { _subcomponent?: boolean } {
  const d = spec.derive(physics)
  const mods: ModifierCharacter[] = [mod('quantity', `×${qty}`)]
  if (d.size) mods.push(mod('dimension', d.size))
  if (d.rating) mods.push(mod('rating_primary', String(R2(d.rating.v)), d.rating.u))
  mods.push(mod('price_estimate_gbp', String(Math.max(1, R2(d.gbp)))))   // BOTTOM-UP physics price
  mods.push(mod('form', `${spec.name} (assembly component)`))
  mods.push(mod('part_number', 'TBD (detailed design)'))
  mods.push(mod('lifecycle', 'Concept design — sized from parent physics; exact MPN at detailed design'))
  return {
    id: `${parentId}__${sanitizeId(spec.name)}`,
    name_human: spec.name,
    content_character: { character_id: `${parentId}__${sanitizeId(spec.name)}`, name_human: spec.name },
    modifier_characters: mods,
    _subcomponent: true,
  }
}

/** Append each principal equipment's PHYSICS-SIZED sub-components (qty inherited), each
 *  priced bottom-up from the parent's computed physics. Mutates modules in place; returns
 *  the number of sub-component lines added. Universal by equipment type. */
export function explodeEquipmentSubAssemblies(modules: ModuleLike[], maxDepth = 3): number {
  // IDEMPOTENT + RECURSIVE: explode ONE level of the un-exploded frontier per call. A
  // part already carrying children is skipped (so re-running never duplicates — the
  // bug that gave a pump 39 children); a sub-component that itself matches a rule (a
  // heat-pump's Scroll Compressor → pump parts, an Evaporator Coil → exchanger parts,
  // a filter's Backwash Pump) explodes on the NEXT call, so the iteration LOOP deepens
  // the BoM a level at a time and settles when nothing un-exploded matches (capped at
  // maxDepth '__' levels). Returns the number of sub-component lines added THIS call.
  const hasChildren = new Set<string>()
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      for (const w of sm.words) {
        const id = String(w.id ?? '')
        const cut = id.lastIndexOf('__')
        if (cut > 0) hasChildren.add(id.slice(0, cut))
      }
    }
  }
  let added = 0
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      const out: WordLike[] = []
      for (const w of sm.words) {
        out.push(w)
        const id = String(w.id ?? '')
        const depth = (id.match(/__/g) ?? []).length
        if (depth >= maxDepth) continue          // too deep — stop the recursion
        if (hasChildren.has(id)) continue         // already exploded — idempotent
        const nm = w.name_human ?? ''
        const rule = SUB_ASSEMBLY.find((r) => r.re.test(nm))
        if (!rule) continue
        const physics = readParentPhysics(w)
        for (const spec of rule.parts) {
          out.push(subWord(spec, id || sanitizeId(nm), physics.qty, physics))
          added += 1
        }
      }
      sm.words = out
    }
  }
  return added
}

// ── matching ────────────────────────────────────────────────────────────────
function wordStems(w: WordLike): string[] {
  return significantStems(
    `${w.name_human ?? ''} ${w.content_character?.character_id ?? ''} ${w.content_character?.name_human ?? ''}`,
  )
}
function scoreMatch(wStems: string[], g: EquipGroup): number {
  let s = 0
  for (const gs of g.stems) if (wStems.includes(gs)) s += 1
  return s
}
function completeness(g: EquipGroup): number {
  return (g.volume !== undefined ? 1 : 0) + (g.count !== undefined ? 1 : 0) + (g.power !== undefined ? 1 : 0)
}

// ── module placement for synthesised equipment (universal module taxonomy) ──
// Ordered: treatment terms before tank (a "biofilter tank" is treatment, not bare
// containment); each maps an equipment keyword family → the universal module id.
const PLACEMENT: { re: RegExp; module: RegExp }[] = [
  { re: /filter|biofil|degas|skim|clarif|\buv\b|ozone|treat|media|membran|aerat|settl|disinfe|steril/i, module: /water_treatment|treatment|process/i },
  { re: /pump|blower|compress|\bfan\b|manifold|\bpipe|flow|valve|duct/i, module: /mass_fluid|fluid|transport|process/i },
  { re: /heat|chill|boiler|thermal|hvac|cool|refrig|exchang/i, module: /environment|thermal|interface/i },
  { re: /tank|vessel|reservoir|sump|basin|silo|hopper|column|tower|cone|enclos|frame|contain/i, module: /structure|contain|process/i },
]

function pickModule(modules: ModuleLike[], phrase: string): ModuleLike | undefined {
  const idOf = (m: ModuleLike): string => String((m as { module?: string }).module ?? '')
  for (const rule of PLACEMENT) {
    if (rule.re.test(phrase)) {
      const hit = modules.find((m) => rule.module.test(idOf(m)) && (m.sub_modules?.length ?? 0) > 0)
      if (hit) return hit
    }
  }
  // fallback: structure/containment, else the first module that has a sub-module
  return (
    modules.find((m) => /structure|contain/i.test(idOf(m)) && (m.sub_modules?.length ?? 0) > 0) ||
    modules.find((m) => (m.sub_modules?.length ?? 0) > 0)
  )
}

function titleCase(phrase: string): string {
  return phrase
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function synthWord(g: EquipGroup): WordLike & { _synthesized?: boolean } {
  const title = titleCase(g.phrase)
  const mods: ModifierCharacter[] = []
  if (g.count !== undefined && g.count >= 2) mods.push(mod('quantity', `×${Math.round(g.count)}`))
  else mods.push(mod('quantity', '×1'))
  mods.push(...dimAndRatingFor(g))
  mods.push(mod('form', `${title} — principal equipment sized from the engineering contract`))
  mods.push(mod('part_number', 'TBD (detailed design)'))
  mods.push(mod('lifecycle', 'Concept design — catalogue part + exact MPN confirmed at detailed design'))
  mods.push(mod('installation', 'Internal / external placement confirmed at layout / detailed design'))
  return {
    id: `${g.phrase}_synth_word`,
    name_human: title,
    content_character: { character_id: `${g.phrase}_synth`, name_human: title },
    modifier_characters: mods,
    _synthesized: true,
  }
}

export interface UniversalSizingResult {
  sized: number
  synthesized: number
  dropped: number
  exploded: number
  groups: number
  matchedPhrases: string[]
  synthesizedPhrases: string[]
}

// ──────────────────────────────────────────────────────────────────────────────
// PRINCIPAL-EQUIPMENT RECONCILE (Stage F core — Tristan 2026-06-14).
//
// THE WALL it removes (verified on out/ras-converged2): the emitter SYNTHESISES the
// principal equipment deterministically from the contract (4-generator.json: a
// "Rearing Tank" word, id=rearing_tank_synth_word, qty=×10, 9.5 m dia × 4.7 m), but
// the THREE post-emission LLM stages that follow (R1 reviewer, R4 reviewer, Phase-2
// repair) can rewrite a synthesised word's identity wholesale — in the converged run
// the rearing tank's id AND content_character were both overwritten to a SIBLING's
// (biofilter_synth_word) and its count collapsed ×10 → ×1. The emitter-identity-lock
// (which keys on word-id + char-id) cannot heal that: when BOTH keys are rewritten to
// collide with another real word, the snapshot entry is simply "missing" and the
// corrupted word silently matches the wrong entry. Result: the drawings + Blender +
// bill of materials (all read from the final moduleDecomposition) render 1 tank where
// the contract says 10, and the count VARIES run-to-run because it is whatever the LLM
// left, not what the contract computed.
//
// This pass makes the PRINCIPAL-EQUIPMENT SET authoritative from the DETERMINISTIC
// contract again, AFTER the LLM stages, just before state is saved (so geometry, BoM
// and cost all consume it). For every synthesisable contract group it guarantees
// EXACTLY ONE canonical equipment word with the contract-derived identity (id, char-id,
// name) + count + dimension + rating, repairing a corrupted/renamed survivor in place
// and dropping LLM duplicate/collided copies (and their orphaned sub-components). The
// LLM may still DECORATE (prose, narrative) but it can no longer DEFINE or mutate the
// principal-equipment set or its counts. Universal — consumes whatever the contract
// computed, any archetype, no `if class`. Only `_synthesized` words are touched, so a
// registered hand-emitter (which never sets `_synthesized`) is byte-untouched.
// ──────────────────────────────────────────────────────────────────────────────

interface CanonEquip {
  group: EquipGroup
  id: string
  charId: string
  name: string
}

function canonFor(g: EquipGroup): CanonEquip {
  return {
    group: g,
    id: `${g.phrase}_synth_word`,
    charId: `${g.phrase}_synth`,
    name: titleCase(g.phrase),
  }
}

// Deterministic modifier set for a canonical equipment word, identical to synthWord's
// (count + dimension + rating), but used to OVERWRITE a survivor's locked spec mods so
// the count/size the contract computed always wins over an LLM edit.
function canonMods(g: EquipGroup): ModifierCharacter[] {
  const out: ModifierCharacter[] = []
  if (g.count !== undefined && g.count >= 2) out.push(mod('quantity', `×${Math.round(g.count)}`))
  else out.push(mod('quantity', '×1'))
  out.push(...dimAndRatingFor(g))
  return out
}

function isSynth(w: WordLike): boolean {
  return (w as { _synthesized?: boolean })._synthesized === true
}
function isSubcomponent(w: WordLike): boolean {
  return (w as { _subcomponent?: boolean })._subcomponent === true
}

/** Overwrite a word's identity + deterministic spec mods with the canonical truth,
 *  preserving any NON-spec modifiers (form/part_number/lifecycle/installation prose)
 *  and preserving the order of the spec kinds it already had. Returns true if anything
 *  changed. */
function forceCanonIdentity(w: WordLike, canon: CanonEquip): boolean {
  let changed = false
  const oldId = w.id
  if (w.id !== canon.id) { w.id = canon.id; changed = true }
  if ((w.name_human ?? '') !== canon.name) { w.name_human = canon.name; changed = true }
  if (!w.content_character || typeof w.content_character !== 'object') w.content_character = {}
  if (w.content_character.character_id !== canon.charId) { w.content_character.character_id = canon.charId; changed = true }
  if (w.content_character.name_human !== canon.name) { w.content_character.name_human = canon.name; changed = true }

  // Replace the deterministic spec kinds (quantity / dimension / capacity / rating_primary)
  // with the contract truth at their existing positions; keep everything else verbatim.
  const SPEC = new Set(['quantity', 'dimension', 'capacity', 'rating_primary'])
  const truth = canonMods(canon.group)
  const existing = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
  const rebuilt: ModifierCharacter[] = []
  const placed = new Set<string>()
  for (const mc of existing) {
    const k = String(mc.kind ?? '')
    if (SPEC.has(k)) {
      if (!placed.has(k)) {
        for (const t of truth) if (String(t.kind) === k) rebuilt.push({ ...t })
        placed.add(k)
      }
      // drop duplicate / LLM-added same-kind entries
    } else {
      rebuilt.push(mc)
    }
  }
  for (const t of truth) {
    const k = String(t.kind)
    if (!placed.has(k)) { rebuilt.push({ ...t }); placed.add(k) }
  }
  // Detect a real change in the spec mods (cheap signature compare).
  const sig = (ms: ModifierCharacter[]) => ms.filter((m) => SPEC.has(String(m.kind)))
    .map((m) => `${m.kind}=${String(m.value ?? '')}${m.unit ?? ''}`).sort().join('|')
  if (sig(existing) !== sig(rebuilt)) changed = true
  w.modifier_characters = rebuilt
  ;(w as { _synthesized?: boolean })._synthesized = true
  return changed || oldId !== canon.id
}

/** Re-key a survivor's exploded sub-components onto the canonical parent id (their ids
 *  are `<parentId>__<suffix>`). Keeps Blender/BoM parent↔child grouping coherent after
 *  an identity repair. */
function rekeyChildren(words: WordLike[], oldParentId: string | undefined, canonId: string): void {
  if (!oldParentId || oldParentId === canonId) return
  const prefix = `${oldParentId}__`
  for (const w of words) {
    if (!isSubcomponent(w)) continue
    const id = w.id ?? ''
    if (id.startsWith(prefix)) {
      const suffix = id.slice(prefix.length)
      w.id = `${canonId}__${suffix}`
      if (w.content_character && typeof w.content_character === 'object') {
        w.content_character.character_id = `${canonId}__${suffix}`
      }
    }
  }
}

export interface PrincipalReconcileResult {
  groups: number
  repaired: number // survivors whose identity/spec was corrected to contract truth
  removedDuplicates: number // extra synth copies of a contract group (LLM collisions/renames) dropped
  removedInvented: number // _synthesized principals backed by NO contract group (LLM inventions) dropped
  removedOrphanChildren: number // sub-components of removed duplicates/inventions dropped
  synthesizedMissing: number // principal groups with NO surviving synth word, re-created
  details: string[]
}

/**
 * Make the principal-equipment SET deterministic from the contract, AFTER the LLM
 * stages. For each synthesisable contract group, guarantee exactly one canonical
 * `_synthesized` equipment word with the contract identity + count + size, repair a
 * corrupted survivor in place, drop LLM duplicate/collided copies, and re-create a
 * principal item the LLM deleted entirely. Mutates `modules` in place. Idempotent.
 *
 * Scope: touches ONLY `_synthesized` words (registered hand-emitters never set the
 * flag → byte-untouched). Universal: keyed entirely on the contract's self-describing
 * quantities, no class branch.
 */
export function reconcilePrincipalEquipment(
  modules: ModuleLike[],
  contract: ContractInProgress,
): PrincipalReconcileResult {
  const res: PrincipalReconcileResult = {
    groups: 0, repaired: 0, removedDuplicates: 0, removedInvented: 0, removedOrphanChildren: 0, synthesizedMissing: 0, details: [],
  }

  const quantities: Record<string, number> = {}
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(q)) {
    const val = v?.value
    if (typeof val === 'number' && Number.isFinite(val)) quantities[k] = val
  }
  const principalGroups = buildGroups(quantities).filter(isSynthesisable)
  res.groups = principalGroups.length
  if (principalGroups.length === 0) return res

  // Map each synthesisable group to its canonical identity.
  const canons = principalGroups.map(canonFor)
  const freshlySynthesised: WordLike[] = [] // re-created principals → explode their sub-assemblies

  // Assign every surviving top-level _synthesized word to its owning canon. The
  // principal-equipment SET is the contract's — exactly one word per synthesisable
  // group — so the LLM may DECORATE the prose but may NOT add, rename, or duplicate a
  // principal. A synth word claims a canon when it (a) EXACT-matches the canon id/char
  // (a verbatim survivor, or an LLM rename that COLLIDED onto a sibling's id), OR (b)
  // its name fully COVERS the canon's group stems (canon stems ⊆ word stems) — which
  // catches an LLM that re-titled the synth equipment ("Calculated Heat Pump",
  // "Working Biofilter") while keeping its synthesised identity. Each canon keeps ONE
  // survivor (repaired to contract truth); the rest are LLM duplicates → dropped. A
  // synth word that claims NO canon is an LLM-INVENTED principal not backed by any
  // contract quantity → also dropped (it must not enter the deterministic set). Sub-
  // components (`_subcomponent`) are NOT principals and are left to follow their parent.
  type Owned = { word: WordLike; sm: { words?: WordLike[] } }
  const byCanon = new Map<string, Owned[]>() // canon.id → survivors claiming it
  for (const c of canons) byCanon.set(c.id, [])
  const unclaimed: Owned[] = [] // _synthesized principals backed by no contract group

  const canonClaimedBy = (w: WordLike): CanonEquip | undefined => {
    const exact = canons.find((c) => w.id === c.id || w.content_character?.character_id === c.charId)
    if (exact) return exact
    const wStems = wordStems(w)
    if (wStems.length === 0) return undefined
    // Full-subset: the canon's group stems must ALL be present in the word — so the word
    // genuinely names that equipment. Prefer the canon with the most stems (the most
    // specific) to avoid a 1-stem group stealing a more-specific word.
    let best: CanonEquip | undefined
    let bestStems = 0
    for (const c of canons) {
      const gs = c.group.stems
      if (gs.length > 0 && gs.every((s) => wStems.includes(s)) && gs.length > bestStems) {
        best = c
        bestStems = gs.length
      }
    }
    return best
  }

  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        if (!isSynth(w) || isSubcomponent(w)) continue
        const pick = canonClaimedBy(w)
        if (pick) byCanon.get(pick.id)!.push({ word: w, sm })
        else unclaimed.push({ word: w, sm })
      }
    }
  }

  // Reconcile each group: ONE survivor → repair to canonical; the rest → remove.
  for (const c of canons) {
    const owned = byCanon.get(c.id)!
    if (owned.length === 0) {
      // The LLM deleted/renamed this principal item's top word but may have LEFT its
      // exploded children behind (keyed `<canonId>__…`) — sweep those orphans first so
      // re-synthesising doesn't duplicate them. Then re-create the principal + explode.
      const childPrefix = `${c.id}__`
      for (const m of modules ?? []) {
        for (const sm of m.sub_modules ?? []) {
          if (!Array.isArray(sm.words)) continue
          sm.words = sm.words.filter((w) => {
            if (isSubcomponent(w) && (w.id ?? '').startsWith(childPrefix)) { res.removedOrphanChildren += 1; return false }
            return true
          })
        }
      }
      const target = pickModule(modules, c.group.phrase)
      const sm = target?.sub_modules?.[0]
      if (sm) {
        const wNew = synthWord(c.group)
        ;(sm.words ??= []).push(wNew)
        freshlySynthesised.push(wNew)
        res.synthesizedMissing += 1
        res.details.push(`re-synthesised missing principal '${c.name}' (${c.id})`)
      }
      continue
    }
    // Survivor preference: one already carrying the canonical id, else the first.
    owned.sort((a, b) => (a.word.id === c.id ? -1 : 0) - (b.word.id === c.id ? -1 : 0))
    const survivor = owned[0]
    const oldId = survivor.word.id
    if (forceCanonIdentity(survivor.word, c)) {
      res.repaired += 1
      res.details.push(`repaired '${c.name}' identity → ${c.id} (was ${oldId ?? '∅'})`)
    }
    rekeyChildren(survivor.sm.words ?? [], oldId, c.id)
    // Drop the rest (LLM duplicates/collisions) + their exploded children.
    for (let i = 1; i < owned.length; i++) {
      const dup = owned[i]
      const dupId = dup.word.id
      const words = dup.sm.words ?? []
      const before = words.length
      dup.sm.words = words.filter((w) => {
        if (w === dup.word) return false
        if (isSubcomponent(w) && dupId && (w.id ?? '').startsWith(`${dupId}__`)) { res.removedOrphanChildren += 1; return false }
        return true
      })
      res.removedDuplicates += 1
      res.details.push(`dropped duplicate '${dup.word.name_human ?? dupId}' colliding onto ${c.id} (${(dup.sm.words?.length ?? 0) - (before - 1 - 0)} child cleanup)`)
    }
  }

  // Drop LLM-INVENTED principals (a _synthesized top word backed by no contract group)
  // + their exploded children. The principal-equipment set is the contract's; an item
  // the contract never computed must not enter it (run-to-run stability + no-invention).
  for (const inv of unclaimed) {
    const invId = inv.word.id
    const words = inv.sm.words ?? []
    inv.sm.words = words.filter((w) => {
      if (w === inv.word) return false
      if (isSubcomponent(w) && invId && (w.id ?? '').startsWith(`${invId}__`)) { res.removedOrphanChildren += 1; return false }
      return true
    })
    res.removedInvented += 1
    res.details.push(`dropped LLM-invented principal '${inv.word.name_human ?? invId}' (no contract group backs it)`)
  }

  // Explode the sub-assemblies of any PRINCIPAL we just re-created (a repaired survivor
  // already carries its children; a freshly-synthesised one does not). Insert each
  // parent's physics-sized children immediately after it, matching the synthesis path.
  if (freshlySynthesised.length > 0) {
    const fresh = new Set(freshlySynthesised)
    for (const m of modules ?? []) {
      for (const sm of m.sub_modules ?? []) {
        if (!Array.isArray(sm.words)) continue
        const out: WordLike[] = []
        for (const w of sm.words) {
          out.push(w)
          if (!fresh.has(w)) continue
          const nm = w.name_human ?? ''
          const rule = SUB_ASSEMBLY.find((r) => r.re.test(nm))
          if (!rule) continue
          const physics = readParentPhysics(w)
          for (const spec of rule.parts) out.push(subWord(spec, w.id ?? sanitizeId(nm), physics.qty, physics))
        }
        sm.words = out
      }
    }
  }

  return res
}

/**
 * Collapse DUPLICATE principal words BEFORE the sub-assembly explosion. Two duplication
 * modes seen on RAS: (a) the SAME id emitted into >1 module (`circulation_pump_word` in
 * both mass_fluid + environmental) and (b) a synthesised duplicate of a real word with
 * the SAME human name (`heat_pump_synth_word` vs `heat_pump_word`). If a duplicate is
 * left in, the explosion runs on EACH copy and — because the children inherit
 * `<parentId>__<suffix>` — N copies sharing an id collide into N× the same sub-components
 * (a pump showed 39 children = 3×13). This MUST run before explode(). Identity = id
 * first (a shared id is unambiguously one word), then normalised name. Keeps the RICHER
 * modifier set (non-synthesised as the tiebreak) and removes the rest from their
 * sub_modules. Skips sub-components (`__` ids). Universal + deterministic. Returns the
 * count removed.
 */
export function dedupePrincipalWords(modules: ModuleLike[]): number {
  const collapse = (keyOf: (w: WordLike) => string): number => {
    const groups = new Map<string, Array<{ w: WordLike; sm: { words?: WordLike[] } }>>()
    for (const m of modules ?? []) {
      for (const sm of m.sub_modules ?? []) {
        if (!Array.isArray(sm.words)) continue
        for (const w of sm.words) {
          if (String(w.id ?? '').includes('__')) continue
          const k = keyOf(w)
          if (!k) continue
          if (!groups.has(k)) groups.set(k, [])
          groups.get(k)!.push({ w, sm })
        }
      }
    }
    const score = (w: WordLike) =>
      (w.modifier_characters?.length ?? 0) * 2 + ((w as { _synthesized?: boolean })._synthesized ? 0 : 1)
    let removed = 0
    for (const items of groups.values()) {
      if (items.length < 2) continue
      items.sort((a, b) => score(b.w) - score(a.w))
      const keep = items[0].w
      for (const { w, sm } of items.slice(1)) {
        if (w === keep || !Array.isArray(sm.words)) continue
        sm.words = sm.words.filter((x) => x !== w)
        removed += 1
      }
    }
    return removed
  }
  const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  let total = collapse((w) => String(w.id ?? ''))                 // (a) shared id
  total += collapse((w) => norm(w.name_human ?? w.id ?? ''))      // (b) same human name
  return total
}

/**
 * Stamp the contract's self-describing quantities onto BoM words AND synthesise the
 * principal equipment the emitter omitted — universally. Mutates `modules` in place.
 *
 * @param opts.onlyUnsized  (default true) leave a word that already carries a
 *   dimension/dimensions modifier untouched for SIZING (curated/grounded wins); the
 *   QUANTITY count is still applied when the word is ×1 (under-counting is worse).
 * @param opts.synthesizeMissing (default true) create equipment words for principal
 *   groups no existing word matched.
 */
export function applyUniversalContractSizing(
  modules: ModuleLike[],
  contract: ContractInProgress,
  opts: { onlyUnsized?: boolean; synthesizeMissing?: boolean; dedupeAndStrip?: boolean; explode?: boolean; minScore?: number } = {},
): UniversalSizingResult {
  const onlyUnsized = opts.onlyUnsized ?? true
  const synthesizeMissing = opts.synthesizeMissing ?? true
  const dedupeAndStrip = opts.dedupeAndStrip ?? true
  const minScore = opts.minScore ?? 1

  const quantities: Record<string, number> = {}
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(q)) {
    const val = v?.value
    if (typeof val === 'number' && Number.isFinite(val)) quantities[k] = val
  }

  const groups = buildGroups(quantities)
  const matched = new Set<string>() // group phrase → matched an existing word
  let sized = 0

  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        const wStems = wordStems(w)
        if (wStems.length === 0) continue
        let best: EquipGroup | null = null
        let bestScore = 0
        for (const g of groups) {
          const sc = scoreMatch(wStems, g)
          if (sc < minScore) continue
          if (sc > bestScore || (sc === bestScore && best && completeness(g) > completeness(best))) {
            best = g
            bestScore = sc
          }
        }
        if (!best) continue
        matched.add(best.phrase)

        const existing = w.modifier_characters ?? []
        const hasDim = existing.some((mc) => mc.kind === 'dimension' || mc.kind === 'dimensions')
        const isCountOne = !existing.some(
          (mc) => mc.kind === 'quantity' && !/×\s*1\b/.test(String(mc.value ?? '')),
        )
        const add: ModifierCharacter[] = []
        if (!(onlyUnsized && hasDim)) add.push(...dimAndRatingFor(best))
        if (best.count !== undefined && best.count >= 2 && isCountOne) add.push(mod('quantity', `×${Math.round(best.count)}`))
        if (add.length) {
          mergeMods(w, add)
          sized += 1
        }
      }
    }
  }

  // ── B. synthesise principal equipment no word matched ─────────────────────
  const synthesizedPhrases: string[] = []
  if (synthesizeMissing) {
    for (const g of groups) {
      if (matched.has(g.phrase)) continue
      if (!isSynthesisable(g)) continue
      const target = pickModule(modules, g.phrase)
      const sm = target?.sub_modules?.[0]
      if (!sm) continue
      ;(sm.words ??= []).push(synthWord(g))
      synthesizedPhrases.push(g.phrase)
    }
  }

  // ── C. cleanup: make the BoM the physics equipment, not skeleton junk ─────
  // Drop (a) generic detailed-design PADDING and (b) placeholder function-words a
  // synthesised equipment item already COVERS (Mechanical Filtration ← Drum Filter;
  // Biological Filtration ← Biofilter). Only placeholders (no real MPN) are dropped;
  // synthesised physics equipment + real grounded parts are always kept.
  let dropped = 0
  if (dedupeAndStrip) {
    const synthStems4 = new Set<string>()
    for (const g of groups) {
      if (!synthesizedPhrases.includes(g.phrase)) continue
      for (const s of g.stems) {
        const s4 = s.slice(0, 4)
        if (!DEDUP_GENERIC_STOP.has(s4)) synthStems4.add(s4)
      }
    }
    for (const m of modules ?? []) {
      for (const sm of m.sub_modules ?? []) {
        if (!Array.isArray(sm.words)) continue
        sm.words = sm.words.filter((w) => {
          if ((w as { _synthesized?: boolean })._synthesized) return true // physics equipment
          if (!isPlaceholder(w)) return true // real grounded part
          if (PADDING_RE.test((w.name_human ?? '').toLowerCase())) { dropped += 1; return false }
          const w4 = wordStems(w).map((s) => s.slice(0, 4)).filter((s) => !DEDUP_GENERIC_STOP.has(s))
          if (w4.some((s) => synthStems4.has(s))) { dropped += 1; return false }
          return true
        })
      }
    }
  }

  // ── C2. collapse duplicate principals BEFORE the explosion (else a duplicate
  // multiplies into N× the same sub-components — see dedupePrincipalWords). ──
  const dedupedPrincipals = dedupeAndStrip ? dedupePrincipalWords(modules) : 0

  // ── D. sub-assembly explosion: BoM DEPTH (each equipment → its real components) ──
  const exploded = (opts.explode ?? true) ? explodeEquipmentSubAssemblies(modules) : 0

  return {
    sized,
    synthesized: synthesizedPhrases.length,
    dropped,
    exploded,
    groups: groups.length,
    matchedPhrases: [...matched],
    synthesizedPhrases,
  }
}
