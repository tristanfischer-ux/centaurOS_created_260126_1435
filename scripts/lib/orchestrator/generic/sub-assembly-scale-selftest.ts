// proveCatch for the SUB_ASSEMBLY cost-capacity scale + envelope-capped vessel default
// (2026-07-09, Powerwall exit-32 round 2). A 0.11 kW mini-chiller was decomposed with
// 40 kW-class template bases (£4,010 scroll compressor, £4,200 control panel → £16k
// chiller) and a size-less "Coolant Expansion Tank" defaulted to the 50 m³ template
// (4.0 m GRP tank + walkway + gelcoat, £13.6k) inside a 0.13 m³ wall cabinet.
/* eslint-disable no-console */
import { explodeEquipmentSubAssemblies } from './universal-contract-sizing'

function mkWord(id: string, name: string, mods: Array<{ kind: string; value: string; unit?: string }>): any {
  return { id, name_human: name, content_character: { character_id: id, name_human: name },
    modifier_characters: mods.map((m) => ({ kind: m.kind, value: m.value, unit: m.unit })) }
}
function childPrices(mods: any[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const w of mods) {
    if (!w._subcomponent) continue
    const p = (w.modifier_characters ?? []).find((m: any) => m.kind === 'price_estimate_gbp')
    out[String(w.name_human)] = Number(p?.value ?? 0)
  }
  return out
}
function expect(cond: boolean, msg: string): void { if (!cond) throw new Error(`sub-assembly-scale: ${msg}`) }

// ── 1. CATCH: a 0.11 kW chiller's template prices scale by (0.11/40)^0.6 ≈ 0.034 ──
const tiny: any = { sub_modules: [{ words: [
  mkWord('liquid_coolant_chiller_word', 'Liquid Coolant Chiller',
    [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: '0.11', unit: 'kW' }]),
] }] }
explodeEquipmentSubAssemblies([tiny], {})
const tinyPrices = childPrices(tiny.sub_modules[0].words)
expect((tinyPrices['Scroll Compressor'] ?? 1e9) < 400,
  `0.11 kW chiller compressor must price at mini-compressor money (got £${tinyPrices['Scroll Compressor']})`)
expect((tinyPrices['Control Panel'] ?? 1e9) < 400,
  `0.11 kW chiller control panel must scale with the duty (got £${tinyPrices['Control Panel']})`)

// ── 2. NO FALSE POSITIVE: a 40 kW (reference-duty) chiller is byte-identical ──
const ref: any = { sub_modules: [{ words: [
  mkWord('hvac_chiller_word', 'HVAC Chiller',
    [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: '40', unit: 'kW' }]),
] }] }
explodeEquipmentSubAssemblies([ref], {})
const refPrices = childPrices(ref.sub_modules[0].words)
expect(Math.abs((refPrices['Scroll Compressor'] ?? 0) - (4000 + 40 * 95)) < 1,
  `40 kW chiller compressor must stay at the unscaled template price (got £${refPrices['Scroll Compressor']})`)

// ── 3. CATCH: a size-less tank inside a compact enclosure caps to envelope/4 ──
const walled: any = { sub_modules: [{ words: [
  mkWord('coolant_expansion_tank_word', 'Coolant Expansion Tank', [{ kind: 'quantity', value: '×1' }]),
] }] }
explodeEquipmentSubAssemblies([walled], { enclosure_volume_m3: 0.13 })
const walledPrices = childPrices(walled.sub_modules[0].words)
const walledTotal = Object.values(walledPrices).reduce((s, v) => s + v, 0)
expect(walledTotal < 9000,
  `size-less tank in a 0.13 m³ enclosure must not price as a 50 m³ GRP tank (got £${Math.round(walledTotal)})`)

// ── 4. NO FALSE POSITIVE: a plant-scale (no compact enclosure) size-less tank unchanged ──
const plant: any = { sub_modules: [{ words: [
  mkWord('buffer_tank_word', 'Buffer Tank', [{ kind: 'quantity', value: '×1' }]),
] }] }
explodeEquipmentSubAssemblies([plant], {})  // no enclosure_volume_m3 → 50 m³ default holds
const plantPrices = childPrices(plant.sub_modules[0].words)
const plantTotal = Object.values(plantPrices).reduce((s, v) => s + v, 0)
expect(plantTotal > 9000,
  `plant-scale size-less tank keeps the 50 m³ default calibration (got £${Math.round(plantTotal)})`)

console.log('sub-assembly-scale --selftest OK (0.11 kW chiller scales to mini-compressor money; '
  + '40 kW reference chiller byte-identical; size-less tank capped by a compact enclosure; '
  + 'plant-scale default calibration preserved)')
