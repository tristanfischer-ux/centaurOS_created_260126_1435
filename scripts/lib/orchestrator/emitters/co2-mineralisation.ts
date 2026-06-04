/**
 * scripts/lib/orchestrator/emitters/co2-mineralisation.ts
 *
 * CO2 capture + mineral-carbonation plant deterministic emitter — 2026-06-03.
 *
 * Process (per the brief): capture CO2 from flue gas in 30 wt% aqueous MEA →
 * react the CO2-rich amine with GYPSUM (CaSO4·2H2O) in a stirred carbonation
 * reactor to precipitate CaCO3 → filter / wash / air-blow / hot-air dry the
 * CaCO3 cake → react the sulfate-bearing filtrate with solid KOH to form K2SO4
 * and regenerate free MEA → filter + recrystallise + dry the K2SO4 → distil the
 * CaCO3 wash water to recover MEA + water → recycle MEA → bag both solids in
 * 25 kg sacks.
 *
 * Stoichiometry (per mol captured CO2): 1 CaCO3 + 1 K2SO4, consuming 1
 * CaSO4·2H2O + 2 KOH. Mass yields per tonne CO2: CaCO3 100/44 ≈ 2.27 t,
 * K2SO4 174/44 ≈ 3.95 t, gypsum 172/44 ≈ 3.91 t, KOH 112/44 ≈ 2.55 t.
 *
 * Scale: skid-mounted pilot/demonstration plant, default 1 t CO2/day.
 * Industry refs: GEA / Andritz filtration + drying skids, Sulzer / Koch
 * packed columns, Alfa Laval plate exchangers, GEA Messo crystallisers,
 * Endress+Hauser process instruments, ABB drives. British spelling.
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { ContractInProgress } from '../types'

interface Mod { kind: string; value: string; unit?: string }
interface CC { character_id: string; name_human: string;
  function_radical_primary: string | null; function_radical_secondary: string | null;
  material_radical_primary: string | null; material_radical_secondary: string | null }
interface W { id: string; name_human: string; content_character: CC; modifier_characters: Mod[] }
interface SM { id: string; name_human: string; english_sentence: string; rad_syntax: string;
  role_verb: string; topology_clause: string; words: W[] }

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function fmtQty(n: number): string { return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(2)}` }
function mod(k: string, v: string, u?: string): Mod { return u !== undefined ? { kind: k, value: v, unit: u } : { kind: k, value: v } }
function cc(id: string, n: string, fp: string | null, mp: string | null, fs: string | null = null, ms: string | null = null): CC {
  return { character_id: id, name_human: n, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}
// BUG-1 guard (2026-06-03): the grammar `modifier_consistency` gate fails when a
// word carries TWO modifier_characters of the SAME normalised kind (e.g. two
// `dimension`, two `list_price_gbp`, two `form`) — the BoM cannot pick a canonical
// value. Enforce one-value-per-kind AT THE EMITTER: keep the FIRST occurrence of
// each kind (the authored, more-specific/correct value) and drop later duplicates.
// Kind normalisation mirrors universal-grammar-gates.ts::normaliseKind (lowercase
// + strip a trailing 's' on dimension/rating/regulatory_standard) so `dimension`
// and `dimensions` collapse to one slot.
const SINGULAR_MOD_KINDS = new Set(['dimension', 'rating', 'regulatory_standard'])
function normModKind(k: string): string {
  const lower = String(k ?? '').toLowerCase().trim()
  if (lower.endsWith('s') && (SINGULAR_MOD_KINDS.has(lower.slice(0, -1)) || lower === 'dimensions' || lower === 'ratings')) {
    return lower.slice(0, -1)
  }
  return lower
}
function dedupeModsByKind(m: Mod[]): Mod[] {
  const seen = new Set<string>()
  const out: Mod[] = []
  for (const mc of m) {
    const k = normModKind(mc.kind)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(mc)
  }
  return out
}
function word(id: string, n: string, c: CC, m: Mod[]): W {
  return { id, name_human: n.replace(/\s+word$/i, ''), content_character: c, modifier_characters: dedupeModsByKind(m) }
}
function rad(ws: W[]): string {
  return ws.map(w => {
    const o = [...w.modifier_characters].sort((a, b) => a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0)
    const toks = o.map(m => m.unit ? `${m.value}${m.unit}` : m.value)
    return toks.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${toks.join(', ')})`
  }).join(' ⊙ ')
}
function makeSub(id: string, n: string, role: string, top: string, ws: W[]): SM {
  return { id, name_human: n, english_sentence: '', rad_syntax: rad(ws), role_verb: role, topology_clause: top, words: ws }
}

interface Co2MinParams {
  captureTpd: number
  captureKgH: number
  caco3Tpd: number
  k2so4Tpd: number
  gypsumTpd: number
  kohTpd: number
  meaWtPct: number
  meaCircM3H: number
  absorberDiaM: number
  absorberHeightM: number
  reactorVolumeM3: number
  filterAreaM2: number
  distillColDiaM: number
  dryerHeatKw: number
  steamKgH: number
  boilerSteamKgH: number
  boilerElectricalKw: number
  electricalKw: number
  transformerKva: number
  bagKg: number
  bagsPerDay: number
}

function deriveParams(c: ContractInProgress): Co2MinParams {
  const tpd = q(c, 'target_capture_tpd', 1)
  const kgH = (tpd * 1000) / 24
  const caco3 = tpd * (100 / 44)
  const k2so4 = tpd * (174 / 44)
  const gypsum = tpd * (172 / 44)
  const koh = tpd * (112 / 44)
  const bagKg = 25
  const dryerHeatKw = q(c, 'dryer_heat_duty_kw', 75)
  const reboilerSteamKgH = q(c, 'reboiler_steam_kg_h', 180)

  // ── Steam-boiler sizing (gate-4 Physics-Critic fix, 2026-06-04) ──
  // The boiler must supply the SUM of every steam consumer, not just the
  // distillation reboiler. Sized from the tool-computed reboiler duty plus the
  // crystalliser circulation-heater duty plus the MEA stripper reboil-pot duty.
  // LP steam (~3 bar g) latent heat ≈ 2150 kJ/kg ⇒ kg/h = kW × 3600 / 2150.
  const reboilerDutyKw = q(c, 'reboiler_duty_kw', 91)              // tool:ht:ntu-heat-exchanger
  const crystalliserHeaterKw = q(c, 'crystalliser_heater_duty_kw', 90)
  const stripperPotKw = q(c, 'mea_stripper_pot_duty_kw', 30)
  const steamThermalKw = reboilerDutyKw + crystalliserHeaterKw + stripperPotKw
  const STEAM_LATENT_KJ_KG = 2150
  const totalSteamKgH = (steamThermalKw * 3600) / STEAM_LATENT_KJ_KG
  // +15 % engineering margin, rounded up to the next 50 kg/h boiler frame size.
  const boilerSteamKgH = q(c, 'boiler_steam_capacity_kg_h',
    Math.ceil((totalSteamKgH * 1.15) / 50) * 50)
  const boilerElectricalKw = Math.round(steamThermalKw / 0.98)     // electric element input

  // ── Plant electrical-load + transformer sizing (gate Physics-Critic fix) ──
  // The connected active load is dominated by the electric steam boiler
  // (~boilerElectricalKw), the two hot-air duct heaters (2 × dryerHeatKw), the
  // shrink-wrap tunnel heater (~24 kW) and ~87 kW of motors/aux. A 160 kVA
  // transformer cannot supply this — size it from the real connected load.
  const ductHeaterKw = 2 * dryerHeatKw            // 2 × Kanthal hot-air duct heaters
  const shrinkTunnelKw = 24                        // bagging shrink-wrap tunnel
  const motorAuxKw = 87                            // pumps, agitators, blowers, centrifuge, bagging, control/aux
  const connectedKw = boilerElectricalKw + ductHeaterKw + shrinkTunnelKw + motorAuxKw
  const electricalKw = q(c, 'electrical_load_kw', Math.round(connectedKw))
  // Coincident demand (×0.9 diversity) at pf 0.9 ⇒ kVA, then ×1.25 margin,
  // rounded up to the next standard IEC cast-resin rating.
  const STD_KVA = [160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600]
  const requiredKva = (electricalKw * 0.9 / 0.9) * 1.25
  const transformerKva = q(c, 'transformer_rating_kva',
    STD_KVA.find((r) => r >= requiredKva) ?? 1600)

  return {
    captureTpd: tpd,
    captureKgH: kgH,
    caco3Tpd: caco3,
    k2so4Tpd: k2so4,
    gypsumTpd: gypsum,
    kohTpd: koh,
    meaWtPct: q(c, 'mea_wt_pct', 30),
    // ~0.40 mol CO2/mol MEA working capacity on 30 wt% MEA ⇒ ~70 kg solution per kg CO2/h.
    meaCircM3H: q(c, 'mea_circulation_m3_h', Math.max(0.5, Math.round(kgH * 0.07 * 10) / 10)),
    absorberDiaM: q(c, 'absorber_diameter_m', 0.4),
    absorberHeightM: q(c, 'absorber_packed_height_m', 6),
    reactorVolumeM3: q(c, 'carbonation_reactor_volume_m3', 4),
    filterAreaM2: q(c, 'filter_area_m2', 3),
    distillColDiaM: q(c, 'distillation_column_diameter_m', 0.3),
    dryerHeatKw,
    steamKgH: reboilerSteamKgH,
    boilerSteamKgH,
    boilerElectricalKw,
    electricalKw,
    transformerKva,
    bagKg,
    bagsPerDay: Math.round(((caco3 + k2so4) * 1000) / bagKg),
  }
}

// 1. CO2 absorption (MEA capture) -------------------------------------------------
function emitAbsorptionCapture(p: Co2MinParams): DesignModule {
  const sub = makeSub('mea_absorption_train', 'MEA absorption train', 'absorbs',
    `${p.captureKgH.toFixed(0)} kg/h CO2 absorbed into ${p.meaWtPct.toFixed(0)} wt% aqueous MEA circulating at ${p.meaCircM3H.toFixed(1)} m³/h through a ${p.absorberDiaM.toFixed(1)} m × ${p.absorberHeightM.toFixed(0)} m packed column`, [
    word('packed_absorber_column_word', 'packed absorber column',
      cc('packed_absorber_column', 'packed absorber column', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'random-packed counter-current column, flanged segments for field erection'),
       mod('dimension', `${p.absorberDiaM.toFixed(1)} m dia × ${p.absorberHeightM.toFixed(0)} m`), mod('manufacturer', 'Sulzer'),
       mod('part_number', 'fabricated 316L packed column — bespoke vessel'), mod('list_price_gbp', '26000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('structured_packing_word', 'structured packing',
      cc('structured_packing', 'structured packing', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'Mellapak 250.Y'), mod('manufacturer', 'Sulzer'), mod('dimension', `${(p.absorberDiaM * p.absorberDiaM * 0.785 * p.absorberHeightM).toFixed(1)} m³ bed`),
       mod('part_number', 'MELLAPAK 250.Y'), mod('list_price_gbp', '5800')]),
    word('mea_circulation_pump_word', 'MEA circulation pump',
      cc('mea_circulation_pump', 'MEA circulation pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'centrifugal, 1 duty + 1 standby'), mod('capacity', String(p.meaCircM3H.toFixed(1)), 'm³/h'), mod('manufacturer', 'Grundfos'),
       mod('part_number', 'CRNE 5-8'), mod('list_price_gbp', '4200')]),
    word('rich_lean_mea_exchanger_word', 'rich/lean MEA exchanger',
      cc('rich_lean_mea_exchanger', 'rich/lean MEA plate exchanger', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'gasketed plate cross-exchanger'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'M10-BFG'), mod('list_price_gbp', '8800')]),
    word('lean_amine_cooler_word', 'lean-amine cooler',
      cc('lean_amine_cooler', 'lean-amine trim cooler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'gasketed plate cooler, cooling-water served'), mod('capacity', '120', 'kW'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'M6-FG'), mod('list_price_gbp', '6200')]),
    word('rich_amine_trim_cooler_word', 'rich-amine inlet cooler',
      cc('rich_amine_trim_cooler', 'rich-amine inlet trim cooler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'brazed-plate cooler'), mod('capacity', '40', 'kW'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'CB60'), mod('list_price_gbp', '3800')]),
    word('mea_exchanger_plate_pack_word', 'spare cross-exchanger plate pack',
      cc('mea_exchanger_plate_pack', 'M10 cross-exchanger plate pack + gaskets', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', '316L plate pack with NBR gaskets'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'M10-BFG plate pack'), mod('list_price_gbp', '2600')]),
    word('flue_gas_blower_word', 'flue-gas inlet blower',
      cc('flue_gas_blower', 'flue-gas inlet blower', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'centrifugal'), mod('capacity', String((p.captureKgH * 12).toFixed(0)), 'kg/h gas'), mod('manufacturer', 'Howden'),
       mod('part_number', 'centrifugal process fan — made to order'), mod('list_price_gbp', '8500')]),
    word('mea_storage_tank_word', 'MEA storage tank',
      cc('mea_storage_tank', '30 wt% MEA storage tank', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'bunded atmospheric tank'), mod('dimension', '5 m³'),
       mod('part_number', 'fabricated 316L atmospheric storage tank — bespoke vessel'), mod('list_price_gbp', '7500'), mod('regulatory', 'DSEAR')]),
  ])
  return { module: 'mass_fluid_transport_process', display_name: 'MEA Absorption & Capture',
    module_brief: `30 wt% aqueous MEA counter-current packed absorber captures ${p.captureKgH.toFixed(0)} kg/h CO2 from flue gas; rich amine pumped to the carbonation reactor, lean amine returned.`,
    overview_paragraph_en: '', derived_parameters: { capture_kg_h: p.captureKgH, mea_circulation_m3_h: p.meaCircM3H, mea_wt_pct: p.meaWtPct },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'stainless_steel', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 2. Gypsum carbonation reactor ---------------------------------------------------
function emitCarbonationReactor(p: Co2MinParams): DesignModule {
  const sub = makeSub('gypsum_carbonation_reactor', 'gypsum carbonation reactor', 'reacts',
    `CO2-rich MEA reacts with ${p.gypsumTpd.toFixed(1)} t/day gypsum in a ${p.reactorVolumeM3.toFixed(0)} m³ stirred reactor, precipitating ${p.caco3Tpd.toFixed(1)} t/day CaCO3 and releasing sulfate to the filtrate`, [
    word('stirred_carbonation_reactor_word', 'stirred carbonation reactor',
      cc('stirred_carbonation_reactor', 'stirred carbonation reactor', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'baffled stirred-tank reactor, jacketed'), mod('dimension', String(p.reactorVolumeM3.toFixed(0)), 'm³'), mod('manufacturer', 'De Dietrich'),
       mod('part_number', 'fabricated jacketed 316L stirred-tank reactor — bespoke vessel'), mod('list_price_gbp', '24000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('carbonation_maturation_vessel_word', 'carbonation maturation vessel',
      cc('carbonation_maturation_vessel', 'CaCO3 maturation/digestion vessel', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'gently-stirred residence vessel for crystal growth'), mod('dimension', String((p.reactorVolumeM3 * 0.75).toFixed(1)), 'm³'),
       mod('part_number', 'fabricated 316L maturation vessel — bespoke vessel'), mod('list_price_gbp', '14000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('co2_sparger_ring_word', 'CO2 sparger ring',
      cc('co2_sparger_ring', 'rich-amine/CO2 sparger ring', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'perforated 316L ring sparger under the impeller'), mod('dimension', `${(p.absorberDiaM * 0.8).toFixed(2)} m ring`),
       mod('part_number', 'fabricated 316L ring sparger — made to order'), mod('list_price_gbp', '2400')]),
    word('carbonation_static_mixer_word', 'carbonation static mixer',
      cc('carbonation_static_mixer', 'in-line carbonation static mixer', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'in-line static mixer pre-contacting rich amine with gypsum slurry'), mod('manufacturer', 'Sulzer'),
       mod('part_number', 'SMV'), mod('list_price_gbp', '3200')]),
    word('reactor_agitator_word', 'reactor agitator',
      cc('reactor_agitator', 'top-entry agitator', 'electromagnetic_actuator_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'pitched-blade turbine'), mod('capacity', '4', 'kW'), mod('manufacturer', 'Ekato'),
       mod('part_number', 'ISOJET'), mod('list_price_gbp', '10000')]),
    word('agitator_drive_motor_word', 'agitator drive motor',
      cc('agitator_drive_motor', 'agitator drive motor', 'electromagnetic_actuator_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'IE3 TEFC squirrel-cage, VSD-fed'), mod('capacity', '5.5', 'kW'), mod('manufacturer', 'ABB'),
       mod('part_number', 'M3BP 132S'), mod('list_price_gbp', '1600'), mod('regulatory', 'IEC 60034-30-1')]),
    word('agitator_gearbox_word', 'agitator reduction gearbox',
      cc('agitator_gearbox', 'agitator helical reduction gearbox', 'electromagnetic_actuator_function', 'cast_iron'),
      [mod('quantity', '×1'), mod('form', 'helical foot-mounted gear unit'), mod('manufacturer', 'SEW-Eurodrive'),
       mod('part_number', 'R97'), mod('list_price_gbp', '2300')]),
    word('agitator_shaft_seal_word', 'agitator shaft mechanical seal',
      cc('agitator_shaft_seal', 'agitator double mechanical seal', 'electromagnetic_actuator_function', 'silicon_carbide'),
      [mod('quantity', '×1'), mod('form', 'double cartridge mechanical seal, barrier-fluid'), mod('manufacturer', 'EagleBurgmann'),
       mod('part_number', 'Cartex-DN'), mod('list_price_gbp', '3200')]),
    word('gypsum_feed_hopper_word', 'gypsum feed hopper + screw',
      cc('gypsum_feed_hopper', 'gypsum feed hopper and metering screw', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'loss-in-weight screw feeder'), mod('capacity', String((p.gypsumTpd * 1000 / 24).toFixed(0)), 'kg/h'), mod('manufacturer', 'Schenck Process'),
       mod('part_number', 'MULTICOR'), mod('list_price_gbp', '9800')]),
    word('slurry_transfer_pump_word', 'CaCO3 slurry transfer pump',
      cc('slurry_transfer_pump', 'CaCO3 slurry transfer pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'progressive-cavity, abrasion-rated'), mod('manufacturer', 'SEEPEX'),
       mod('part_number', 'BN 35-6L'), mod('list_price_gbp', '6800')]),
    word('slurry_recirculation_pump_word', 'reactor slurry recirculation pump',
      cc('slurry_recirculation_pump', 'reactor slurry recirculation pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'rubber-lined centrifugal slurry pump'), mod('manufacturer', 'Warman'),
       mod('part_number', 'WGR 40'), mod('list_price_gbp', '5400')]),
    word('reactor_overflow_launder_word', 'reactor overflow launder',
      cc('reactor_overflow_launder', 'reactor overflow weir and launder', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'open 316L launder to filter feed tank'),
       mod('part_number', 'fabricated 316L overflow launder — made to order'), mod('list_price_gbp', '1800')]),
    word('reactor_ph_probe_word', 'reactor pH probe',
      cc('reactor_ph_probe', 'reactor in-line pH probe', 'chemical_sensing_function', 'glass'),
      [mod('quantity', '×2'), mod('form', 'Memosens glass pH electrode'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'CPS11D'), mod('list_price_gbp', '2200')]),
    word('reactor_orp_probe_word', 'reactor ORP probe',
      cc('reactor_orp_probe', 'reactor in-line ORP probe', 'chemical_sensing_function', 'glass'),
      [mod('quantity', '×1'), mod('form', 'Memosens platinum ORP electrode'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'CPS12D'), mod('list_price_gbp', '1500')]),
    word('reactor_density_meter_word', 'reactor slurry density meter',
      cc('reactor_density_meter', 'Coriolis slurry density meter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'Coriolis density + mass-flow on the recirculation loop'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'Promass Q 300'), mod('list_price_gbp', '7800')]),
    word('reactor_temp_probe_word', 'reactor temperature sensor',
      cc('reactor_temp_probe', 'reactor Pt100 temperature sensor', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'Memosens Pt100 with thermowell'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'iTHERM TM411'), mod('list_price_gbp', '1100')]),
    // Real IP66 instrument junction box (gate-21/gate-20 fix, 2026-06-04): a
    // genuine Spelsberg Abox enclosure, NOT a rotary position sensor. Emitter
    // owns this MPN so Phase 2 cannot invent a wrong part for the slot.
    word('junction_box_word', 'instrument junction box',
      cc('junction_box', 'field instrument junction box', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×4'), mod('form', 'IP66 field junction box for instrument wiring'), mod('dimension', '152 × 152 × 80 mm'), mod('manufacturer', 'Spelsberg'),
       mod('part_number', '81040001'), mod('list_price_gbp', '40'), mod('regulatory', 'BS EN 62208')]),
  ])
  return { module: 'energy_conversion_transduction', display_name: 'Gypsum Carbonation Reactor',
    module_brief: `Jacketed stirred carbonation reactor mineralises captured CO2 with gypsum to ${p.caco3Tpd.toFixed(1)} t/day CaCO3; pH/ORP-controlled, agitated, slurry pumped to filtration.`,
    overview_paragraph_en: '', derived_parameters: { reactor_volume_m3: p.reactorVolumeM3, caco3_tpd: p.caco3Tpd, gypsum_tpd: p.gypsumTpd },
    allowed_radicals: ['chemical_reaction_function', 'electromagnetic_actuator_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 3. CaCO3 filtration, wash, dry --------------------------------------------------
function emitCaco3Recovery(p: Co2MinParams): DesignModule {
  const sub = makeSub('caco3_filter_dry_line', 'CaCO3 filtration + drying line', 'separates',
    `${p.caco3Tpd.toFixed(1)} t/day CaCO3 filtered over ${p.filterAreaM2.toFixed(0)} m², water-washed to strip MEA, air-blown, then hot-air dried at ${p.dryerHeatKw.toFixed(0)} kW`, [
    word('caco3_vacuum_belt_filter_word', 'CaCO3 vacuum belt filter',
      cc('caco3_vacuum_belt_filter', 'CaCO3 vacuum belt filter', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'horizontal vacuum belt filter with cake wash + air-blow zones'), mod('dimension', String(p.filterAreaM2.toFixed(0)), 'm²'), mod('manufacturer', 'BHS-Sonthofen'),
       mod('part_number', 'BF (horizontal vacuum belt filter)'), mod('list_price_gbp', '24000')]),
    word('cake_wash_manifold_word', 'cake wash-water manifold',
      cc('cake_wash_manifold', 'cake wash-water spray manifold', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'counter-current displacement wash bars with spray nozzles'),
       mod('part_number', 'fabricated 316L wash-bar manifold — made to order'), mod('list_price_gbp', '2800')]),
    word('filter_vacuum_pump_word', 'filter vacuum pump',
      cc('filter_vacuum_pump', 'liquid-ring vacuum pump', 'mass_fluid_transport_process', 'cast_iron'),
      [mod('quantity', '×1'), mod('form', 'single-stage liquid-ring vacuum pump + separator'), mod('capacity', '250', 'm³/h'), mod('manufacturer', 'Busch'),
       mod('part_number', 'Dolphin LB 0250'), mod('list_price_gbp', '7200')]),
    word('filtrate_receiver_pump_word', 'filtrate receiver + pump',
      cc('filtrate_receiver_pump', 'filtrate receiver and transfer pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'vacuum receiver with barometric-leg transfer pump'), mod('manufacturer', 'Grundfos'),
       mod('part_number', 'CRNE 10-4'), mod('list_price_gbp', '4100')]),
    word('cake_air_blower_word', 'cake air-blow blower',
      cc('cake_air_blower', 'cake de-watering air blower', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'side-channel regenerative blower'), mod('capacity', '7.5', 'kW'), mod('manufacturer', 'Becker'),
       mod('part_number', 'SV 8.190/2'), mod('list_price_gbp', '4300')]),
    word('caco3_hot_air_dryer_word', 'CaCO3 hot-air dryer',
      cc('caco3_hot_air_dryer', 'CaCO3 fluid-bed hot-air dryer', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'fluidised-bed dryer'), mod('capacity', String(p.dryerHeatKw.toFixed(0)), 'kW'), mod('manufacturer', 'GEA'),
       mod('part_number', 'FLUIDBED VIBRO-FLUIDISER'), mod('list_price_gbp', '21000')]),
    word('dryer_air_heater_battery_word', 'dryer inlet air-heater battery',
      cc('dryer_air_heater_battery', 'dryer inlet air-heater battery', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'finned steam/electric air-heating coil'), mod('capacity', String((p.dryerHeatKw * 0.9).toFixed(0)), 'kW'), mod('manufacturer', 'Heating Energy Systems'),
       mod('part_number', 'finned process air-heater battery — made to order'), mod('list_price_gbp', '4200')]),
    word('dryer_heat_recovery_exchanger_word', 'dryer exhaust heat-recovery exchanger',
      cc('dryer_heat_recovery_exchanger', 'dryer exhaust-to-inlet heat-recovery exchanger', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'glass-tube air-to-air recuperator'), mod('capacity', '30', 'kW'), mod('manufacturer', 'GEA'),
       mod('part_number', 'air-to-air glass-tube recuperator — packaged'), mod('list_price_gbp', '6800')]),
    word('dryer_condensate_cooler_word', 'dryer condensate cooler',
      cc('dryer_condensate_cooler', 'dryer exhaust condensate cooler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'brazed-plate condensate cooler, cooling-water served'), mod('capacity', '25', 'kW'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'CB30'), mod('list_price_gbp', '2400')]),
  ])
  return { module: 'mass_fluid_transport_process', display_name: 'CaCO3 Filtration & Drying',
    module_brief: `CaCO3 slurry is vacuum-belt-filtered, the cake water-washed to displace MEA, air-blown and hot-air dried to a free-flowing filler-grade powder.`,
    overview_paragraph_en: '', derived_parameters: { filter_area_m2: p.filterAreaM2, dryer_heat_kw: p.dryerHeatKw },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 4. K2SO4 recovery (KOH reaction, filter, recrystallise, dry) --------------------
function emitK2so4Recovery(p: Co2MinParams): DesignModule {
  const sub = makeSub('k2so4_recovery_line', 'K2SO4 recovery line', 'converts',
    `sulfate filtrate reacts with ${p.kohTpd.toFixed(1)} t/day solid KOH to form ${p.k2so4Tpd.toFixed(1)} t/day K2SO4 and free MEA; K2SO4 is filtered, recrystallised MEA-free, and hot-air dried`, [
    word('koh_reaction_vessel_word', 'KOH reaction vessel',
      cc('koh_reaction_vessel', 'KOH reaction vessel', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'agitated, jacketed'), mod('dimension', '3 m³'), mod('manufacturer', 'De Dietrich'),
       mod('part_number', 'fabricated jacketed 316L agitated vessel — bespoke vessel'), mod('list_price_gbp', '19000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('koh_dissolution_tank_word', 'KOH dissolution + make-up tank',
      cc('koh_dissolution_tank', 'KOH dissolution and make-up tank', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'agitated dissolution tank, exotherm-cooled'), mod('dimension', '2 m³'),
       mod('part_number', 'fabricated 316L agitated dissolution tank — bespoke vessel'), mod('list_price_gbp', '12000'), mod('regulatory', 'COSHH')]),
    word('mea_stripper_pot_word', 'MEA stripper reboil pot',
      cc('mea_stripper_pot', 'regenerated-MEA stripping reboil pot', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'steam-heated stripping pot freeing MEA from the filtrate'), mod('dimension', '1.5 m³'),
       mod('part_number', 'fabricated jacketed 316L stripping pot — bespoke vessel'), mod('list_price_gbp', '10000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('koh_dosing_feeder_word', 'KOH solids dosing feeder',
      cc('koh_dosing_feeder', 'KOH solids dosing feeder', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'enclosed screw feeder, corrosion-rated'), mod('capacity', String((p.kohTpd * 1000 / 24).toFixed(0)), 'kg/h'), mod('manufacturer', 'Gericke'),
       mod('part_number', 'GLD 87'), mod('list_price_gbp', '11000'), mod('regulatory', 'COSHH')]),
    word('k2so4_centrifuge_word', 'K2SO4 pusher centrifuge',
      cc('k2so4_centrifuge', 'K2SO4 pusher centrifuge', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'single-stage pusher centrifuge'), mod('capacity', String((p.k2so4Tpd * 1000 / 24).toFixed(0)), 'kg/h'), mod('manufacturer', 'Andritz'),
       mod('part_number', 'P-3 pusher centrifuge'), mod('list_price_gbp', '23000')]),
    word('k2so4_slurry_feed_pump_word', 'K2SO4 slurry feed pump',
      cc('k2so4_slurry_feed_pump', 'crystalliser-to-centrifuge slurry feed pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'progressive-cavity slurry pump, 1 duty + 1 standby'), mod('manufacturer', 'SEEPEX'),
       mod('part_number', 'BN 17-6L'), mod('list_price_gbp', '5200')]),
    word('mother_liquor_recycle_pump_word', 'mother-liquor recycle pump',
      cc('mother_liquor_recycle_pump', 'crystalliser mother-liquor recycle pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'centrifugal recycle pump back to the crystalliser'), mod('manufacturer', 'Grundfos'),
       mod('part_number', 'CRNE 5-6'), mod('list_price_gbp', '3400')]),
    word('k2so4_recrystalliser_word', 'K2SO4 recrystalliser',
      cc('k2so4_recrystalliser', 'K2SO4 forced-circulation recrystalliser', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'forced-circulation crystalliser, MEA stripping'), mod('manufacturer', 'GEA Messo'),
       mod('part_number', 'forced-circulation crystalliser — bespoke package'), mod('list_price_gbp', '21000')]),
    word('k2so4_hot_air_dryer_word', 'K2SO4 hot-air dryer',
      cc('k2so4_hot_air_dryer', 'K2SO4 fluid-bed hot-air dryer', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'fluidised-bed dryer'), mod('capacity', String(p.dryerHeatKw.toFixed(0)), 'kW'), mod('manufacturer', 'GEA'),
       mod('part_number', 'FLUIDBED VIBRO-FLUIDISER'), mod('list_price_gbp', '22000')]),
    word('crystalliser_heater_word', 'crystalliser circulation heater',
      cc('crystalliser_heater', 'crystalliser forced-circulation heater', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'shell-and-tube circulation heater, steam-heated'), mod('capacity', '90', 'kW'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'CB110'), mod('list_price_gbp', '8500')]),
    word('crystalliser_cooler_word', 'crystalliser product cooler',
      cc('crystalliser_cooler', 'crystalliser product cooler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'gasketed plate cooler, cooling-water served'), mod('capacity', '40', 'kW'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'M6-FG'), mod('list_price_gbp', '5200')]),
    word('crystalliser_vacuum_condenser_word', 'crystalliser vacuum condenser',
      cc('crystalliser_vacuum_condenser', 'crystalliser vacuum/MEA-vapour condenser', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'shell-and-tube vacuum condenser with vapour ejector'), mod('capacity', '60', 'kW'), mod('manufacturer', 'GEA'),
       mod('part_number', 'shell-and-tube vacuum condenser — packaged'), mod('list_price_gbp', '9200')]),
  ])
  return { module: 'energy_conversion_transduction', display_name: 'K2SO4 Recovery & Crystallisation',
    module_brief: `KOH converts the sulfate filtrate to fertiliser-grade K2SO4 and regenerates free MEA; K2SO4 is centrifuged, recrystallised MEA-free and hot-air dried.`,
    overview_paragraph_en: '', derived_parameters: { k2so4_tpd: p.k2so4Tpd, koh_tpd: p.kohTpd },
    allowed_radicals: ['chemical_reaction_function', 'thermal_transfer_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 5. MEA recovery + recycle (wash-water distillation) -----------------------------
function emitMeaRecovery(p: Co2MinParams): DesignModule {
  const sub = makeSub('mea_recovery_loop', 'MEA recovery + recycle loop', 'recovers',
    `CaCO3 wash water is distilled in a ${p.distillColDiaM.toFixed(1)} m column (${p.steamKgH.toFixed(0)} kg/h reboiler steam) to recover MEA and reclaim wash water; recovered MEA returns to the absorber`, [
    word('mea_distillation_column_word', 'MEA distillation column',
      cc('mea_distillation_column', 'MEA wash-water distillation column', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'packed stripping column'), mod('dimension', `${p.distillColDiaM.toFixed(1)} m dia`), mod('manufacturer', 'Koch-Glitsch'),
       mod('part_number', 'fabricated 316L packed stripping column — bespoke vessel'), mod('list_price_gbp', '20000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('reboiler_word', 'distillation reboiler',
      cc('reboiler', 'thermosiphon reboiler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'shell-and-tube thermosiphon'), mod('capacity', String(p.steamKgH.toFixed(0)), 'kg/h steam'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'CB60 (brazed-plate reboiler)'), mod('list_price_gbp', '8900')]),
    word('overhead_condenser_word', 'overhead condenser',
      cc('overhead_condenser', 'overhead condenser', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'plate condenser'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'CB30 (brazed-plate condenser)'), mod('list_price_gbp', '7500')]),
    word('feed_bottoms_economiser_word', 'feed/bottoms economiser',
      cc('feed_bottoms_economiser', 'feed/reclaimed-bottoms economiser exchanger', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'gasketed plate economiser preheating column feed'), mod('capacity', '55', 'kW'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'M6-FG'), mod('list_price_gbp', '4800')]),
    word('reflux_subcooler_word', 'reflux subcooler',
      cc('reflux_subcooler', 'overhead reflux subcooler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'brazed-plate subcooler on the reflux line'), mod('capacity', '20', 'kW'), mod('manufacturer', 'Alfa Laval'),
       mod('part_number', 'CB30'), mod('list_price_gbp', '2300')]),
    word('mea_recycle_pump_word', 'MEA recycle pump',
      cc('mea_recycle_pump', 'recovered-MEA recycle pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'centrifugal, 1 duty + 1 standby'), mod('manufacturer', 'Grundfos'),
       mod('part_number', 'CRNE 3-5'), mod('list_price_gbp', '3600')]),
    word('wash_water_feed_pump_word', 'wash-water feed pump',
      cc('wash_water_feed_pump', 'distillation wash-water feed pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'centrifugal column-feed pump'), mod('manufacturer', 'Grundfos'),
       mod('part_number', 'CRNE 10-5'), mod('list_price_gbp', '4300')]),
    word('reclaim_water_tank_word', 'reclaimed wash-water tank',
      cc('reclaim_water_tank', 'reclaimed wash-water tank', 'mass_fluid_transport_process', 'stainless_steel'),
      // 316L (not MDPE): the MEA-recovery loop runs to 120 °C; polyethylene tops
      // out ~60-80 °C and would fail (Physics Critic HIGH, 2026-06-04).
      [mod('quantity', '×1'), mod('form', 'buffer tank'), mod('dimension', '3 m³'), mod('manufacturer', 'fabricated'),
       mod('part_number', 'fabricated 316L stainless insulated buffer tank, 3 m³ — made to order (hot MEA-recovery loop ≤120 °C)'), mod('list_price_gbp', '7500')]),
  ])
  return { module: 'mass_fluid_transport_process', display_name: 'MEA Recovery & Recycle',
    module_brief: `Wash-water distillation recovers MEA and reclaims wash water in a closed solvent loop, minimising MEA make-up and effluent.`,
    overview_paragraph_en: '', derived_parameters: { distillation_column_diameter_m: p.distillColDiaM, reboiler_steam_kg_h: p.steamKgH },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 6. Thermal utilities ------------------------------------------------------------
function emitThermalUtilities(p: Co2MinParams): DesignModule {
  const sub = makeSub('thermal_utilities', 'thermal utilities', 'supplies',
    `a ${p.boilerSteamKgH.toFixed(0)} kg/h packaged electric steam boiler serving the distillation reboiler, the K2SO4 crystalliser heater and the MEA stripping pot, plus hot air for two drying stages and closed-loop cooling water`, [
    word('steam_generator_word', 'electric steam generator',
      cc('steam_generator', 'electric steam generator', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', `packaged electric steam boiler, ${p.boilerElectricalKw} kW element`), mod('capacity', String(p.boilerSteamKgH.toFixed(0)), 'kg/h'), mod('manufacturer', 'Cochran'),
       mod('part_number', 'packaged electric steam boiler — bespoke package'), mod('list_price_gbp', '52000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('hot_air_heater_word', 'hot-air process heater',
      cc('hot_air_heater', 'electric hot-air process heater', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×2'), mod('form', 'finned electric duct heater'), mod('capacity', String(p.dryerHeatKw.toFixed(0)), 'kW each'), mod('manufacturer', 'Kanthal'),
       mod('part_number', 'finned electric duct air heater — made to order'), mod('list_price_gbp', '7000')]),
    word('cooling_water_skid_word', 'cooling-water skid',
      cc('cooling_water_skid', 'closed-loop cooling-water skid', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'dry-cooler + circulation pump'), mod('manufacturer', 'Pfannenberg'),
       mod('part_number', 'closed-loop cooling-water skid — packaged'), mod('list_price_gbp', '9400')]),
    word('condensate_flash_vessel_word', 'condensate + feedwater vessel',
      cc('condensate_flash_vessel', 'condensate flash and boiler feedwater vessel', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'condensate flash receiver + feedwater de-aerator pot'), mod('dimension', '0.5 m³'),
       mod('part_number', 'fabricated condensate/feedwater vessel — bespoke vessel'), mod('list_price_gbp', '4600'), mod('regulatory', 'PED 2014/68/EU')]),
  ])
  return { module: 'environmental_interface', display_name: 'Thermal Utilities',
    module_brief: `A ${p.boilerSteamKgH.toFixed(0)} kg/h packaged electric steam boiler plus hot-air and cooling-water utilities serve the distillation reboiler, the crystalliser heater, the MEA stripping pot, the two dryers and process cooling.`,
    overview_paragraph_en: '', derived_parameters: { reboiler_steam_kg_h: p.steamKgH, boiler_steam_capacity_kg_h: p.boilerSteamKgH, boiler_electrical_kw: p.boilerElectricalKw, dryer_heat_kw: p.dryerHeatKw },
    allowed_radicals: ['thermal_transfer_function', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 7. Process control --------------------------------------------------------------
function emitProcessControl(_p: Co2MinParams): DesignModule {
  const sub = makeSub('process_control_system', 'process control system', 'controls',
    `PLC/SCADA sequences the absorption, carbonation, filtration, KOH reaction, recrystallisation, distillation and bagging steps`, [
    word('plc_controller_word', 'plant PLC controller',
      cc('plc_controller', 'plant PLC controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', 'S7-1500 CPU, fail-safe'), mod('manufacturer', 'Siemens'),
       mod('part_number', '6ES7515-2UM02-0AB0'), mod('list_price_gbp', '3800')]),
    word('io_remote_rack_word', 'remote I/O racks',
      cc('io_remote_rack', 'ET 200SP remote I/O racks', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×3'), mod('form', 'ET 200SP distributed I/O station + interface module'), mod('manufacturer', 'Siemens'),
       mod('part_number', '6ES7155-6AU01-0CN0'), mod('list_price_gbp', '1500')]),
    word('digital_io_card_word', 'digital I/O cards',
      cc('digital_io_card', 'ET 200SP digital input/output cards', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×16'), mod('form', 'DI 16×24 V DC + DQ 16×24 V DC modules'), mod('manufacturer', 'Siemens'),
       mod('part_number', '6ES7131-6BH01-0BA0'), mod('list_price_gbp', '95')]),
    word('analogue_io_card_word', 'analogue I/O cards',
      cc('analogue_io_card', 'ET 200SP analogue input/output cards', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×12'), mod('form', 'AI 8×I 4–20 mA + AQ 4×U/I modules'), mod('manufacturer', 'Siemens'),
       mod('part_number', '6ES7134-6GF00-0AA1'), mod('list_price_gbp', '180')]),
    word('scada_hmi_word', 'HMI panel',
      cc('scada_hmi', 'KTP1200 HMI panel', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', '12-inch touch HMI, WinCC'), mod('manufacturer', 'Siemens'),
       mod('part_number', '6AV2123-2MA03-0AX0'), mod('list_price_gbp', '1300')]),
    word('control_network_switch_word', 'control-network switch',
      cc('control_network_switch', 'PROFINET control-network switch', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'), mod('form', 'SCALANCE industrial Ethernet switch, 8-port'), mod('manufacturer', 'Siemens'),
       mod('part_number', '6GK5008-0BA10-1AB2'), mod('list_price_gbp', '220')]),
    word('marshalling_cabinet_word', 'marshalling + control cabinet',
      cc('marshalling_cabinet', 'marshalling and control cabinet', 'silicon_semiconductor_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'floor-standing IP54 cabinet with marshalling terminals'), mod('manufacturer', 'Rittal'),
       mod('part_number', 'VX25 8284.500'), mod('list_price_gbp', '3200'), mod('regulatory', 'BS EN 61439')]),
  ])
  return { module: 'control_compute_communication', display_name: 'Process Control System',
    module_brief: `A safety PLC + SCADA sequences and interlocks the full mineralisation process and records mass balance for product certification.`,
    overview_paragraph_en: '', derived_parameters: { control_loops: 24 },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 8. Instrumentation --------------------------------------------------------------
function emitInstrumentation(_p: Co2MinParams): DesignModule {
  const sub = makeSub('process_instrumentation', 'process instrumentation', 'measures',
    `flow, level, density, pH and temperature instrumentation across the reaction, filtration and recovery stages`, [
    word('mag_flow_meter_word', 'electromagnetic flow meters',
      cc('mag_flow_meter', 'Promag electromagnetic flow meter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×4'), mod('form', 'Promag electromagnetic flow, Memosens'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'Promag W 400'), mod('list_price_gbp', '3600')]),
    word('radar_level_word', 'radar level transmitters',
      cc('radar_level', 'Micropilot radar level transmitter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×6'), mod('form', '80 GHz free-space radar'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'Micropilot FMR62'), mod('list_price_gbp', '2400')]),
    word('liquiline_ph_word', 'pH/conductivity analysers',
      cc('liquiline_ph', 'Liquiline pH/conductivity transmitter', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×4'), mod('form', 'Liquiline multiparameter transmitter + Memosens sensors'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'Liquiline CM442'), mod('list_price_gbp', '2800')]),
    word('itherm_temp_word', 'temperature transmitters',
      cc('itherm_temp', 'iTHERM Pt100 temperature transmitter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×12'), mod('form', 'Pt100 with thermowell, 4–20 mA head Tx'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'iTHERM TM411'), mod('list_price_gbp', '650')]),
    word('rosemount_pressure_word', 'pressure transmitters',
      cc('rosemount_pressure', 'Rosemount pressure transmitter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×8'), mod('form', 'coplanar gauge/differential pressure, 4–20 mA HART'), mod('manufacturer', 'Emerson'),
       mod('part_number', 'Rosemount 3051'), mod('list_price_gbp', '1200')]),
    word('co2_analyser_word', 'CO2 gas analyser',
      cc('co2_analyser', 'process CO2 gas analyser', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'NDIR CO2 analyser on flue-gas inlet + absorber vent'), mod('manufacturer', 'ABB'),
       mod('part_number', 'EL3060 Uras26'), mod('list_price_gbp', '9500')]),
    word('density_meter_word', 'slurry density meters',
      cc('density_meter', 'in-line slurry density meter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'tuning-fork density transmitter'), mod('manufacturer', 'Emerson'),
       mod('part_number', 'Micro Motion 7826'), mod('list_price_gbp', '4200')]),
  ])
  return { module: 'sensing_instrumentation', display_name: 'Process Instrumentation',
    module_brief: `Coriolis flow, guided-radar level, slurry density and RTD temperature instruments close the mass balance and feed the control system.`,
    overview_paragraph_en: '', derived_parameters: { instrument_count: 24 },
    allowed_radicals: ['chemical_sensing_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 9. Electrical -------------------------------------------------------------------
function emitElectrical(p: Co2MinParams): DesignModule {
  const sub = makeSub('electrical_distribution', 'electrical distribution', 'distributes',
    `${p.electricalKw.toFixed(0)} kW of pumps, agitators, heaters, blowers and drives fed from a motor control centre`, [
    word('motor_control_centre_word', 'motor control centre',
      cc('motor_control_centre', 'motor control centre', 'electrical_conduction_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'Form 4 MCC'), mod('capacity', String(p.electricalKw.toFixed(0)), 'kW'), mod('manufacturer', 'ABB'),
       mod('part_number', 'MNS Form-4 motor control centre — configured'), mod('list_price_gbp', '18000'), mod('regulatory', 'BS EN 61439')]),
    word('power_control_cables_word', 'power + control cabling',
      cc('power_control_cables', 'LSZH power and control cabling', 'electrical_conduction_function', 'copper'),
      [mod('quantity', '×1'), mod('form', 'SWA LSZH power + multicore control cable, installed'), mod('manufacturer', 'Prysmian'),
       mod('part_number', 'AFUMEX SWA LSZH cable bundle — made to order'), mod('list_price_gbp', '9000'), mod('regulatory', 'BS 7671')]),
    word('distribution_board_word', 'busbar + distribution board',
      cc('distribution_board', 'busbar chamber and distribution board', 'electrical_conduction_function', 'copper'),
      [mod('quantity', '×1'), mod('form', 'TP&N busbar chamber + MCB distribution board'), mod('manufacturer', 'Schneider Electric'),
       mod('part_number', 'Acti9 Isobar B'), mod('list_price_gbp', '2400'), mod('regulatory', 'BS EN 61439')]),
    word('roxtec_transits_word', 'cable transit frames',
      cc('roxtec_transits', 'multi-cable transit frames', 'electrical_conduction_function', 'steel'),
      [mod('quantity', '×4'), mod('form', 'rectangular modular cable-transit frame + modules'), mod('manufacturer', 'Roxtec'),
       mod('part_number', 'ECF0001600021'), mod('list_price_gbp', '480')]),
    word('cable_glands_word', 'cable glands',
      cc('cable_glands', 'brass armoured cable glands', 'electrical_conduction_function', 'brass'),
      [mod('quantity', '×120'), mod('form', 'CW brass SWA glands with shrouds'), mod('manufacturer', 'CMP Products'),
       mod('part_number', 'CMP CW 20S'), mod('list_price_gbp', '6'), mod('regulatory', 'BS 6121')]),
    word('vsd_drive_word', 'variable-speed drives',
      cc('vsd_drive', 'variable-speed drives', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×6'), mod('form', 'IP55 VSD, one per pump/agitator/blower'), mod('manufacturer', 'ABB'),
       mod('part_number', 'ACS580-01'), mod('list_price_gbp', '1700')]),
    word('vsd_drive_large_word', 'blower/centrifuge VSDs',
      cc('vsd_drive_large', 'large duty variable-speed drives', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'), mod('form', 'IP21 cabinet VSD for blower + centrifuge'), mod('manufacturer', 'ABB'),
       mod('part_number', 'ACS580-07'), mod('list_price_gbp', '4200')]),
    word('soft_starter_word', 'soft starters',
      cc('soft_starter', 'motor soft starters', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×3'), mod('form', 'TeSys soft starter for fixed-speed motors'), mod('manufacturer', 'Schneider Electric'),
       mod('part_number', 'ATS22D32S6'), mod('list_price_gbp', '650')]),
    word('drive_fieldbus_module_word', 'drive fieldbus modules',
      cc('drive_fieldbus_module', 'VSD PROFINET fieldbus adapter modules', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×8'), mod('form', 'plug-in PROFINET fieldbus adapter for the ACS580 drives'), mod('manufacturer', 'ABB'),
       mod('part_number', 'FPNO-21'), mod('list_price_gbp', '210')]),
    word('transformer_word', 'distribution transformer',
      cc('distribution_transformer', 'distribution transformer', 'electromagnetic_actuator_function', 'copper'),
      [mod('quantity', '×1'), mod('form', 'cast-resin'), mod('capacity', String(p.transformerKva), 'kVA'), mod('manufacturer', 'Schneider Electric'),
       mod('part_number', `Trihal ${p.transformerKva} kVA cast-resin transformer`), mod('list_price_gbp', '32000')]),
    word('contactors_word', 'motor contactors',
      cc('contactors', 'MCC motor contactors', 'electromagnetic_actuator_function', 'polymer_thermoplastic'),
      [mod('quantity', '×14'), mod('form', '3-pole AC-3 block contactor'), mod('manufacturer', 'ABB'),
       mod('part_number', 'AF38-30-00-13'), mod('list_price_gbp', '95')]),
    word('overload_relays_word', 'motor-protection relays',
      cc('overload_relays', 'electronic motor-protection overload relays', 'electromagnetic_actuator_function', 'polymer_thermoplastic'),
      [mod('quantity', '×14'), mod('form', 'electronic overload relay for AF09–AF38'), mod('manufacturer', 'ABB'),
       mod('part_number', 'EF19-18.9'), mod('list_price_gbp', '110')]),
    word('motor_protection_breaker_word', 'motor-protection circuit breakers',
      cc('motor_protection_breaker', 'manual motor-protection circuit breakers', 'electromagnetic_actuator_function', 'polymer_thermoplastic'),
      [mod('quantity', '×14'), mod('form', 'thermal-magnetic manual motor starter'), mod('manufacturer', 'ABB'),
       mod('part_number', 'MS132-25'), mod('list_price_gbp', '85'), mod('regulatory', 'BS EN 60947-4-1')]),
  ])
  return { module: 'power_distribution', display_name: 'Electrical Distribution',
    module_brief: `A Form-4 MCC with IP55 VSDs and a cast-resin transformer supplies the ${p.electricalKw.toFixed(0)} kW plant load.`,
    overview_paragraph_en: '', derived_parameters: { electrical_load_kw: p.electricalKw },
    allowed_radicals: ['electrical_conduction_function', 'silicon_semiconductor_function', 'copper'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 10. Structure / containment / skid ----------------------------------------------
function emitStructure(_p: Co2MinParams): DesignModule {
  const sub = makeSub('skid_structure', 'skid structure + containment', 'supports',
    `a transportable galvanised-steel skid (within the 2.59 m road-transport height envelope) carrying the reactors, exchangers, pumps and tanks with chemical bunding; the tall packed columns (absorber, MEA stripper, distillation) ship as flanged segments and are field-erected on a plinth beside the skid`, [
    word('process_skid_frame_word', 'process skid frame',
      cc('process_skid_frame', 'galvanised process skid frame', 'mechanical_load_bearing_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'welded galvanised frame, ISO-corner transportable, ≤2.59 m transport height'), mod('dimension', '12 m × 2.4 m × 2.59 m'),
       mod('part_number', 'welded galvanised structural-steel skid frame — fabricated'), mod('list_price_gbp', '15000')]),
    word('column_plinth_word', 'field-erection column plinth',
      cc('column_plinth', 'field-erected column support plinth', 'mechanical_load_bearing_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'reinforced plinth + bolted column support frame for the field-erected packed columns beside the skid'),
       mod('part_number', 'reinforced column support plinth and frame — fabricated'), mod('list_price_gbp', '7500')]),
    word('chemical_bund_word', 'chemical bund',
      cc('chemical_bund', 'MEA/KOH chemical bund', 'mechanical_load_bearing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', '110% bunded containment'),
       mod('part_number', 'GRP 110% bunded containment tray — fabricated'), mod('list_price_gbp', '7000'), mod('regulatory', 'DSEAR')]),
    word('vessel_supports_word', 'vessel supports + saddles',
      cc('vessel_supports', 'vessel supports and saddles', 'mechanical_load_bearing_function', 'steel'),
      [mod('quantity', '×8'), mod('form', 'bolted saddles'),
       mod('part_number', 'bolted structural-steel vessel saddle — fabricated'), mod('list_price_gbp', '650')]),
    word('access_platform_word', 'access platform + ladders',
      cc('access_platform', 'access platform and ladders', 'mechanical_load_bearing_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'GRP grating platform'),
       mod('part_number', 'GRP grating access platform and ladders — fabricated'), mod('list_price_gbp', '8500'), mod('regulatory', 'BS EN ISO 14122')]),
  ])
  return { module: 'structure_containment', display_name: 'Skid Structure & Containment',
    module_brief: `A transportable skid (within the 2.59 m road-transport height envelope) with 110% chemical bunding carries the reactors, exchangers, pumps and tanks; the tall packed columns ship as flanged segments and are field-erected on a plinth beside the skid, so the 2.59 m envelope governs the transportable modules, not the erected ~6 m column height.`,
    overview_paragraph_en: '', derived_parameters: { skid_length_m: 12, skid_transport_height_m: 2.59 },
    allowed_radicals: ['mechanical_load_bearing_function', 'steel', 'polymer_thermoplastic'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 11. Safety ----------------------------------------------------------------------
function emitSafety(_p: Co2MinParams): DesignModule {
  const sub = makeSub('safety_protection', 'safety + protection', 'protects',
    `DSEAR/ATEX zoning, pressure relief, gas detection and emergency shutdown for MEA and KOH handling`, [
    word('pressure_relief_valve_word', 'pressure relief valves',
      cc('pressure_relief_valve', 'pressure relief valves', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×6'), mod('form', 'spring-loaded PRV'), mod('manufacturer', 'LESER'),
       mod('part_number', 'Type 441'), mod('list_price_gbp', '1400'), mod('regulatory', 'PED 2014/68/EU')]),
    word('eyewash_shower_word', 'safety shower + eyewash',
      cc('eyewash_shower', 'safety shower and eyewash', 'mass_fluid_transport_process', 'polymer_thermoplastic'),
      [mod('quantity', '×2'), mod('form', 'combination shower/eyewash'), mod('manufacturer', 'Hughes Safety Showers'),
       mod('part_number', 'EXP-MH-14G/45G'), mod('list_price_gbp', '2200'), mod('regulatory', 'BS EN 15154')]),
    word('vent_flame_arrestor_word', 'vent flame arrestor',
      cc('vent_flame_arrestor', 'absorber-vent flame arrestor', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'end-of-line deflagration flame arrestor'), mod('manufacturer', 'Protego'),
       mod('part_number', 'BE/HF'), mod('list_price_gbp', '2600'), mod('regulatory', 'BS EN ISO 16852')]),
    word('n2_blanketing_skid_word', 'nitrogen blanketing skid',
      cc('n2_blanketing_skid', 'tank nitrogen blanketing valve skid', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'inert-gas blanketing regulator skid for MEA tanks'), mod('manufacturer', 'Protego'),
       mod('part_number', 'DK/ES blanketing valve'), mod('list_price_gbp', '3400'), mod('regulatory', 'DSEAR')]),
    word('co2_gas_detector_word', 'CO2 + VOC gas detector',
      cc('co2_gas_detector', 'CO2 and amine-VOC gas detector', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×4'), mod('form', 'fixed NDIR CO2 head'), mod('manufacturer', 'Dräger'),
       mod('part_number', 'Polytron 8700'), mod('list_price_gbp', '2400'), mod('regulatory', 'DSEAR')]),
    word('co2_asphyxiation_detector_word', 'CO2 asphyxiation detectors',
      cc('co2_asphyxiation_detector', 'area CO2 asphyxiation detectors', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×4'), mod('form', 'fixed NDIR CO2 area monitor, 0–5 vol%'), mod('manufacturer', 'Dräger'),
       mod('part_number', 'Polytron 8200'), mod('list_price_gbp', '1900'), mod('regulatory', 'DSEAR')]),
    word('amine_vapour_detector_word', 'amine-vapour detectors',
      cc('amine_vapour_detector', 'amine/VOC vapour detectors', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×3'), mod('form', 'fixed PID VOC head for amine vapour'), mod('manufacturer', 'Dräger'),
       mod('part_number', 'Polytron 8000 PID'), mod('list_price_gbp', '2100'), mod('regulatory', 'DSEAR')]),
    word('flame_detector_word', 'flame detector',
      cc('flame_detector', 'optical flame detector', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'), mod('form', 'IR3 optical flame detector'), mod('manufacturer', 'Dräger'),
       mod('part_number', 'Flame 2700'), mod('list_price_gbp', '3800'), mod('regulatory', 'BS EN 61511')]),
    word('emergency_stop_word', 'emergency shutdown system',
      cc('emergency_stop', 'emergency shutdown system', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', 'SIL-2 ESD chain controller'), mod('manufacturer', 'Siemens'),
       mod('part_number', '3SK1112-1BB40'), mod('list_price_gbp', '200'), mod('regulatory', 'BS EN 61511')]),
    word('safety_relay_word', 'safety relays',
      cc('safety_relay', 'modular safety relays', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×8'), mod('form', 'SIRIUS 3SK modular safety relay'), mod('manufacturer', 'Siemens'),
       mod('part_number', '3SK1121-1AB40'), mod('list_price_gbp', '180'), mod('regulatory', 'BS EN 61511')]),
    word('sil_barrier_word', 'SIL-rated isolation barriers',
      cc('sil_barrier', 'SIL-rated signal isolation barriers', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×12'), mod('form', 'SIL-2 isolated signal barrier'), mod('manufacturer', 'Pepperl+Fuchs'),
       mod('part_number', 'KFD2-STC4-Ex1'), mod('list_price_gbp', '160'), mod('regulatory', 'BS EN 61511')]),
    word('gas_detection_controller_word', 'gas-detection controller',
      cc('gas_detection_controller', 'addressable gas-detection controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', 'multi-channel gas-detection control panel for the fixed detectors'), mod('manufacturer', 'Dräger'),
       mod('part_number', 'REGARD 7000'), mod('list_price_gbp', '4800'), mod('regulatory', 'BS EN 61511')]),
  ])
  return { module: 'safety_protection', display_name: 'Safety & Protection',
    module_brief: `DSEAR/ATEX zoning, SIL-2 emergency shutdown, pressure relief and gas detection protect the MEA and corrosive-KOH handling areas.`,
    overview_paragraph_en: '', derived_parameters: { regulatory_mandatory_count: 4 },
    allowed_radicals: ['mass_fluid_transport_process', 'chemical_sensing_function', 'polymer_thermoplastic'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 12. Solids bagging --------------------------------------------------------------
function emitBagging(p: Co2MinParams): DesignModule {
  const sub = makeSub('bagging_packaging_line', 'bagging + packaging line', 'packages',
    `${p.bagsPerDay} × 25 kg bags/day of CaCO3 and K2SO4 filled, sealed and palletised`, [
    word('open_mouth_bagger_word', 'open-mouth bagging machine',
      cc('open_mouth_bagger', 'open-mouth bagging machine', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'net-weigh open-mouth bagger, 25 kg'), mod('capacity', String(p.bagsPerDay), 'bags/day'), mod('manufacturer', 'Premier Tech'),
       mod('part_number', 'OML-D'), mod('list_price_gbp', '19000')]),
    word('bag_heat_sealer_word', 'bag heat sealer',
      cc('bag_heat_sealer', 'bag heat sealer', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'continuous band sealer'), mod('manufacturer', 'Audion'),
       mod('part_number', 'Sealkon'), mod('list_price_gbp', '3500')]),
    word('sealer_heating_element_word', 'sealer jaw heating element',
      cc('sealer_heating_element', 'band-sealer jaw heating element', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×2'), mod('form', 'replaceable resistive sealing-jaw element + thermocouple'), mod('manufacturer', 'Audion'),
       mod('part_number', 'Sealkon heating element'), mod('list_price_gbp', '320')]),
    word('shrink_tunnel_heater_word', 'shrink-wrap tunnel heater',
      cc('shrink_tunnel_heater', 'pallet shrink-wrap tunnel heater', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'electric hot-air shrink tunnel for pallet hoods'), mod('capacity', '24', 'kW'), mod('manufacturer', 'Italdibipack'),
       mod('part_number', 'Tunnel 5070'), mod('list_price_gbp', '7200')]),
    word('bag_mouth_preheater_word', 'bag-mouth pre-heater',
      cc('bag_mouth_preheater', 'bag-mouth pre-heat bar', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'infrared pre-heat bar conditioning the bag seam'),
       mod('part_number', 'infrared bag-seam pre-heat bar — made to order'), mod('list_price_gbp', '1400')]),
    word('product_storage_silo_word', 'product storage silo',
      cc('product_storage_silo', 'product storage silo', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×2'), mod('form', 'one CaCO3 + one K2SO4 day-silo'), mod('dimension', '8 m³ each'),
       mod('part_number', 'welded steel day-silo with discharge cone — fabricated'), mod('list_price_gbp', '6000')]),
    word('palletiser_word', 'pallet wrapper',
      cc('palletiser', 'semi-automatic pallet wrapper', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'turntable stretch-wrapper'), mod('manufacturer', 'Robopac'),
       mod('part_number', 'Rotoplat 308'), mod('list_price_gbp', '6800')]),
    word('bag_conveyor_word', 'bag take-away conveyor',
      cc('bag_conveyor', 'filled-bag take-away conveyor', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'flat-belt conveyor from bagger to palletiser'), mod('manufacturer', 'Interroll'),
       mod('part_number', 'belt conveyor module — configured'), mod('list_price_gbp', '4800')]),
  ])
  return { module: 'maintenance_serviceability', display_name: 'Bagging & Packaging',
    module_brief: `Net-weigh bagging fills, seals and palletises ${p.bagsPerDay} × 25 kg bags/day of CaCO3 and K2SO4 from dedicated day-silos.`,
    overview_paragraph_en: '', derived_parameters: { bags_per_day: p.bagsPerDay, bag_kg: p.bagKg },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// Cross-module grammar links ------------------------------------------------------
function emitCrossModuleGrammarLinks(p: Co2MinParams) {
  return [
    { from_module: 'mass_fluid_transport_process', to_module: 'energy_conversion_transduction',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `CO2-rich MEA → gypsum carbonation reactor (${p.caco3Tpd.toFixed(1)} t/day CaCO3)` },
    { from_module: 'energy_conversion_transduction', to_module: 'mass_fluid_transport_process',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `sulfate filtrate → K2SO4 recovery; regenerated MEA → recovery loop` },
    { from_module: 'environmental_interface', to_module: 'mass_fluid_transport_process',
      mechanism: 'thermal' as const, type: 'directional' as const, detail: `${p.steamKgH.toFixed(0)} kg/h reboiler steam + hot air to dryers + distillation` },
    { from_module: 'power_distribution', to_module: 'mass_fluid_transport_process',
      mechanism: 'electrical_bus' as const, type: 'directional' as const, detail: `${p.electricalKw.toFixed(0)} kW to pumps, agitators, blowers, baggers` },
    { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction',
      mechanism: 'control' as const, type: 'directional' as const, detail: 'PLC sequences carbonation pH/ORP + KOH dosing + crystalliser' },
    { from_module: 'sensing_instrumentation', to_module: 'control_compute_communication',
      mechanism: 'data' as const, type: 'directional' as const, detail: 'Coriolis flow + density + level close the CaCO3/K2SO4 mass balance' },
    { from_module: 'safety_protection', to_module: 'control_compute_communication',
      mechanism: 'data' as const, type: 'directional' as const, detail: 'gas detection + ESD chain trip the PLC' },
    { from_module: 'structure_containment', to_module: 'energy_conversion_transduction',
      mechanism: 'mechanical' as const, type: 'directional' as const, detail: 'reactors + exchangers saddle-mounted on the bunded skid (≤2.59 m); tall packed columns field-erected on an adjacent plinth' },
  ]
}

const emitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitAbsorptionCapture(p),
    emitCarbonationReactor(p),
    emitCaco3Recovery(p),
    emitK2so4Recovery(p),
    emitMeaRecovery(p),
    emitThermalUtilities(p),
    emitProcessControl(p),
    emitInstrumentation(p),
    emitElectrical(p),
    emitStructure(p),
    emitSafety(p),
    emitBagging(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 12 CO2-mineralisation process modules apply.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Skid-mounted CO2 capture + mineral-carbonation plant capturing ${p.captureTpd.toFixed(1)} t CO2/day in ${p.meaWtPct.toFixed(0)} wt% MEA, mineralising it with gypsum to ${p.caco3Tpd.toFixed(1)} t/day CaCO3 and recovering ${p.k2so4Tpd.toFixed(1)} t/day K2SO4 fertiliser via KOH, with closed-loop MEA recovery and ${p.bagsPerDay} × 25 kg bags/day of product.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('co2_mineralisation', emitter)
registerAssembler('co2_mineralisation/plant', emitter)

export { emitter as co2MineralisationEmitter }
