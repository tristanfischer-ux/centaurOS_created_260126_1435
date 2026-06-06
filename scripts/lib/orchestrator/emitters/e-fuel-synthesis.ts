/**
 * scripts/lib/orchestrator/emitters/e-fuel-synthesis.ts
 *
 * Power-to-Liquid Fischer-Tropsch Sustainable Aviation Fuel (SAF) plant
 * deterministic emitter — 2026-06-05. First-commercial OXCCU PtL train.
 *
 * Process (per the brief + the e_fuel_synthesis engineering contract):
 * receive biogenic CO2 + renewable H2 at the battery limit -> dry + guard-bed
 * (sulphur/oxygen removal) + compress each stream -> blend with recycled tail
 * gas + preheat -> single-step Fischer-Tropsch synthesis over a shaped iron
 * catalyst (CO2 + 3 H2 -> -CH2- + 2 H2O; iron does the in-situ water-gas-shift,
 * no separate reverse-WGS reactor) recovering the exotherm as raised steam ->
 * staged hot/cold 3-phase separation into tail gas + process water + syncrude ->
 * recompress + recycle the tail gas to near-extinction with a small purge to a
 * thermal oxidiser -> hydrocrack/isomerise + fractionate the syncrude into an
 * on-spec SAF cut + naphtha co-product -> additise + store + tanker-load.
 *
 * Scale: ~1,000 t/yr SAF (~125 kg/h; ~3,425-3,750 L/day at 0.80 kg/L over
 * 8,000 h/yr) + naphtha. Feeds CO2 ~1,000 kg/h, renewable H2 ~140 kg/h; inlet
 * H2:CO2 molar 3.0. Reactor 200-350 C / 20-30 bar (design 300 C, 25 bar). FT
 * exotherm ~600 kW REMOVED as raised steam (net steam exporter). FOAK capex
 * <= £45 M. ASTM D7566 Annex A1 (FT-SPK). COMAH + DSEAR/ATEX + PED + IEC 61511.
 *
 * Industry refs (REAL kit where honest, generic descriptors for bespoke
 * fabricated vessels — gate-20 flags STRUCTURED fake MPNs, so the fabricated
 * reactor/column/tank shells carry honest "bespoke fabricated" descriptors,
 * matching the co2_mineralisation emitter idiom): Burckhardt / Howden / Atlas
 * Copco compressors, Sulzer / Koch-Glitsch column internals, Alfa Laval / Kelvion
 * exchangers, Endress+Hauser / Emerson instruments, Siemens DCS/SIS, ABB drives,
 * Dräger gas detection, Zeeco / John Zink thermal oxidisers. British spelling.
 *
 * Mirrors the `co2_mineralisation` emitter structure exactly (helpers, gate-23
 * coverage, dedupeModsByKind, empty macro_assembly_prices). NO marine/depth
 * context anywhere (gate 34).
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
function mod(k: string, v: string, u?: string): Mod { return u !== undefined ? { kind: k, value: v, unit: u } : { kind: k, value: v } }
function cc(id: string, n: string, fp: string | null, mp: string | null, fs: string | null = null, ms: string | null = null): CC {
  return { character_id: id, name_human: n, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}
// BUG-1 guard (mirrors co2-mineralisation.ts): the grammar `modifier_consistency`
// gate fails when a word carries TWO modifier_characters of the SAME normalised
// kind. Enforce one-value-per-kind AT THE EMITTER: keep the FIRST occurrence of
// each kind and drop later duplicates. Kind normalisation mirrors
// universal-grammar-gates.ts::normaliseKind.
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
  }).join(' + ')
}
function makeSub(id: string, n: string, role: string, top: string, ws: W[]): SM {
  return { id, name_human: n, english_sentence: '', rad_syntax: rad(ws), role_verb: role, topology_clause: top, words: ws }
}

// API 650 atmospheric-tank DRY-mass helper (mirrors storage_tank_liquid_fuel.py).
// PHYSICAL rule: a welded steel atmospheric tank's dry mass = cylindrical shell
// wall + flat bottom plate + cone roof, x1.12 for nozzles/stairs/handrails/clips/
// wind girder; shell thickness floored at the API 650 Table 5.6a 6 mm minimum
// plate (a squat low-SG fuel tank is fabrication/weld/wind governed, not membrane-
// stress governed). Used for the naphtha tank so the emitter emits a SELF-CONSISTENT
// dims+mass (Phase 2 cannot invent a thin-wall mass). 2026-06-05 physics-critic fix.
function api650DryMassKg(diaM: number, heightM: number, sg = 0.75): number {
  const S = 160, E = 0.85, corr = 3.0, rho = 7850, tMin = 6.0
  const tMembrane = (4.9 * diaM * Math.max(0, heightM - 0.3) * sg) / (S * E) + corr
  const t = Math.max(tMembrane, tMin) / 1000  // m
  const floorArea = (Math.PI / 4) * diaM * diaM
  const shellLateral = Math.PI * diaM * heightM * t * rho
  const floor = floorArea * t * rho
  const roof = 1.05 * floorArea * t * rho
  return (shellLateral + floor + roof) * 1.12
}
// Size an atmospheric tank DxH from a working volume on the tool's H/D=0.8 squat
// aspect (V = (π/4) D² H, H = 0.8 D -> D = (4V/(π·0.8))^(1/3)).
function sizeTankDH(workingVolumeM3: number): { diaM: number; heightM: number } {
  const hOverD = 0.8
  const diaM = Math.cbrt((4 * workingVolumeM3) / (Math.PI * hOverD))
  return { diaM, heightM: hOverD * diaM }
}

interface EFuelParams {
  safOutputTonnesYr: number
  safOutputKgH: number
  naphthaTonnesYr: number
  totalLiquidsTonnesYr: number
  co2FeedKgH: number
  h2FeedKgH: number
  reactorTempC: number
  reactorPressureBar: number
  ftExothermKw: number
  purgeFlowKgH: number
  operatingHoursYr: number
  electricalLoadKw: number
  // tool-derived (seeded by the class-plan contract_update at runtime; fall
  // back to engineering anchors so the emitter is robust pre-orchestration).
  co2CompressorStages: number
  co2CompressorPowerKw: number
  h2CompressorStages: number
  h2CompressorPowerKw: number
  recycleCompressorPowerKw: number
  feedPreheaterDutyKw: number
  ftReactorVolumeM3: number
  ftReactorDiameterM: number
  ftReactorHeightM: number
  ftReactorShellMassKg: number
  steamRaisedKgH: number
  steamGeneratorAreaM2: number
  separatorDiameterM: number
  separatorLengthM: number
  productCoolerDutyKw: number
  fractionationColumnDiameterM: number
  fractionationColumnShellMassKg: number
  safTankCount: number
  safTankDiameterM: number
  safTankHeightM: number
  productTankShellMassKg: number
  naphthaTankDiameterM: number
  naphthaTankHeightM: number
  naphthaTankShellMassKg: number
  thermalOxidiserHeatReleaseKw: number
  thermalOxidiserChamberVolumeM3: number
  thermalOxidiserStackDiameterM: number
}

function deriveParams(c: ContractInProgress): EFuelParams {
  const safOutputTonnesYr = q(c, 'saf_output_tonnes_yr', 1000)
  const operatingHoursYr = q(c, 'operating_hours_yr', 8000)
  const safOutputKgH = q(c, 'saf_output_kg_h', (safOutputTonnesYr * 1000) / operatingHoursYr)
  return {
    safOutputTonnesYr,
    safOutputKgH,
    naphthaTonnesYr: q(c, 'naphtha_tonnes_yr', 667),
    totalLiquidsTonnesYr: q(c, 'total_liquids_tonnes_yr', 1667),
    co2FeedKgH: q(c, 'co2_feed_kg_h', 1000),
    h2FeedKgH: q(c, 'h2_feed_kg_h', 140),
    reactorTempC: q(c, 'reactor_temp_c', 300),
    reactorPressureBar: q(c, 'reactor_pressure_bar', 25),
    ftExothermKw: q(c, 'ft_exotherm_kw', 600),
    purgeFlowKgH: q(c, 'purge_flow_kg_h', 150),
    operatingHoursYr,
    electricalLoadKw: q(c, 'connected_electrical_load_kw', 3000),
    // tool-derived (class-plan contract_update fills these with tool provenance;
    // the same fallbacks the class-plan declares so the BoM is sane pre-run).
    co2CompressorStages: Math.round(q(c, 'co2_feed_compressor_stages', 3)),
    co2CompressorPowerKw: q(c, 'co2_feed_compressor_power_kw', 90),
    h2CompressorStages: Math.round(q(c, 'h2_feed_compressor_stages', 2)),
    h2CompressorPowerKw: q(c, 'h2_feed_compressor_power_kw', 75),
    recycleCompressorPowerKw: q(c, 'recycle_gas_compressor_power_kw', 40),
    feedPreheaterDutyKw: q(c, 'feed_preheater_duty_kw', 130),
    ftReactorVolumeM3: q(c, 'ft_reactor_volume_m3', 2.5),
    ftReactorDiameterM: q(c, 'ft_reactor_diameter_m', 0.95),
    ftReactorHeightM: q(c, 'ft_reactor_height_m', 3.8),
    ftReactorShellMassKg: q(c, 'ft_reactor_shell_mass_kg', 1800),
    steamRaisedKgH: q(c, 'steam_raised_kg_h', 940),
    steamGeneratorAreaM2: q(c, 'steam_generator_area_m2', 13),
    separatorDiameterM: q(c, 'separator_diameter_m', 0.9),
    separatorLengthM: q(c, 'separator_length_m', 3.6),
    productCoolerDutyKw: q(c, 'product_cooler_duty_kw', 320),
    fractionationColumnDiameterM: q(c, 'fractionation_column_diameter_m', 0.8),
    fractionationColumnShellMassKg: q(c, 'fractionation_column_shell_mass_kg', 3200),
    safTankCount: Math.max(1, Math.round(q(c, 'product_tank_count', 2))),
    safTankDiameterM: q(c, 'product_tank_diameter_m', 3.5),
    // SAF tank HEIGHT from the same storage-tank tool output as its diameter +
    // mass (fall back to the tool's H/D=0.8 aspect) so dims+mass are self-
    // consistent (2026-06-05 physics-critic mass-vs-geometry fix).
    safTankHeightM: q(c, 'product_tank_height_m', q(c, 'product_tank_diameter_m', 3.5) * 0.8),
    productTankShellMassKg: q(c, 'product_tank_shell_mass_kg', 4500),
    // Naphtha tank: sized deterministically from the naphtha rate (14-day buffer,
    // 0.9 fill, ~750 kg/m³) on the tool's H/D=0.8 aspect, with a SELF-CONSISTENT
    // API 650 dry mass (shell + floor + roof + fittings, 6 mm min plate). Emitting
    // BOTH dims AND mass here stops Phase 2 inventing a thin-wall geometry.
    ...(() => {
      const naphthaDensity = 750
      const naphthaDailyKg = (q(c, 'naphtha_tonnes_yr', 667) * 1000) / (q(c, 'operating_hours_yr', 8000) / 24)
      const naphthaWorkingM3 = Math.max(5, (naphthaDailyKg / naphthaDensity) * 14 / 0.9)
      const { diaM, heightM } = sizeTankDH(naphthaWorkingM3)
      return {
        naphthaTankDiameterM: diaM,
        naphthaTankHeightM: heightM,
        naphthaTankShellMassKg: api650DryMassKg(diaM, heightM, naphthaDensity / 1000),
      }
    })(),
    thermalOxidiserHeatReleaseKw: q(c, 'thermal_oxidiser_heat_release_kw', 830),
    thermalOxidiserChamberVolumeM3: q(c, 'thermal_oxidiser_chamber_volume_m3', 2.5),
    thermalOxidiserStackDiameterM: q(c, 'thermal_oxidiser_stack_diameter_m', 0.5),
  }
}

// M1. Feedstock receipt & conditioning -------------------------------------------
// CO2 dry + sulphur/oxygen guard beds, H2 receipt/buffer, feed compressors.
function emitFeedstockConditioning(p: EFuelParams): DesignModule {
  const sub = makeSub('feedstock_receipt_conditioning', 'feedstock receipt & conditioning', 'conditions',
    `~${p.co2FeedKgH.toFixed(0)} kg/h biogenic CO2 is dried and passed over sulphur/oxygen guard beds, ~${p.h2FeedKgH.toFixed(0)} kg/h renewable H2 is received into buffer storage, and each stream is compressed to the ${p.reactorPressureBar.toFixed(0)} bar synthesis pressure`, [
    word('co2_feed_compressor_word', 'CO2 feed compressor',
      cc('co2_feed_compressor', 'multistage CO2 feed compressor', 'mass_fluid_transport_process', 'stainless_steel'),
      // Real Burckhardt/Howden process-compressor line; series-level descriptor (no
      // fabricated structured MPN — gate-20 safe). Power + stages tool-derived.
      // BESPOKE engineered package — priced at a FOAK bespoke process-plant estimate.
      [mod('quantity', 'x1'), mod('form', `multistage process gas compressor, ${p.co2CompressorStages}-stage, intercooled, VSD-driven`), mod('capacity', String((p.co2FeedKgH).toFixed(0)), 'kg/h'), mod('rating', String(p.co2CompressorPowerKw.toFixed(0)), 'kW'), mod('manufacturer', 'Burckhardt Compression'),
       mod('part_number', 'API 618 multistage reciprocating process compressor — engineered package'), mod('list_price_gbp', '650000'), mod('regulatory', 'API 618')]),
    word('h2_feed_compressor_word', 'H2 feed compressor',
      cc('h2_feed_compressor', 'multistage hydrogen feed compressor', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', `multistage hydrogen-service diaphragm/reciprocating compressor, ${p.h2CompressorStages}-stage, leak-tight for >=99.9% H2`), mod('capacity', String((p.h2FeedKgH).toFixed(0)), 'kg/h'), mod('rating', String(p.h2CompressorPowerKw.toFixed(0)), 'kW'), mod('manufacturer', 'Howden'),
       // BESPOKE H2-service engineered package — FOAK bespoke process-plant estimate.
       mod('part_number', 'API 618 hydrogen-service multistage compressor — engineered package'), mod('list_price_gbp', '550000'), mod('regulatory', 'API 618')]),
    word('co2_dryer_word', 'CO2 feed dryer',
      cc('co2_dryer', 'twin-tower regenerative CO2 dryer', 'mass_fluid_transport_process', 'carbon_steel'),
      [mod('quantity', 'x1'), mod('form', 'twin-tower regenerative molecular-sieve gas dryer, duty/standby'), mod('capacity', String((p.co2FeedKgH).toFixed(0)), 'kg/h'), mod('manufacturer', 'Parker Hiross'),
       // BESPOKE packaged skid — part of the feedstock-conditioning train; FOAK estimate.
       mod('part_number', 'twin-tower regenerative molecular-sieve gas dryer — packaged skid'), mod('list_price_gbp', '120000')]),
    word('sulphur_guard_bed_word', 'sulphur/oxygen guard bed',
      cc('sulphur_guard_bed', 'sulphur + oxygen polishing guard bed', 'chemical_reaction_function', 'stainless_steel'),
      // Lead/lag guard-bed vessels — bespoke fabricated, honest descriptor (gate-20 safe).
      [mod('quantity', 'x2'), mod('form', 'lead/lag guard-bed vessels, ZnO + deoxo catalyst removing sulphur + oxygen traces that poison the FT catalyst'), mod('dimension', '0.8 m dia x 2.5 m'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE fabricated guard-bed vessels (per vessel, x2) — FOAK estimate.
       mod('part_number', 'fabricated 316L lead/lag guard-bed vessel pair — bespoke vessel'), mod('list_price_gbp', '95000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('guard_bed_adsorbent_word', 'guard-bed adsorbent + deoxo charge',
      cc('guard_bed_adsorbent', 'guard-bed ZnO/deoxo catalyst charge', 'chemical_reaction_function', 'ceramic'),
      [mod('quantity', 'x1'), mod('form', 'ZnO sulphur-polishing + precious-metal deoxo catalyst charge (replaceable line item)'), mod('manufacturer', 'Johnson Matthey'),
       // Bespoke precious-metal deoxo + ZnO charge sized for the FOAK guard beds.
       mod('part_number', 'PURASPEC sulphur + oxygen polishing catalyst charge'), mod('list_price_gbp', '85000')]),
    word('h2_buffer_vessel_word', 'H2 buffer storage vessel',
      cc('h2_buffer_vessel', 'renewable-H2 buffer storage vessel', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'horizontal H2 buffer receiver smoothing the battery-limit supply'), mod('dimension', '1.4 m dia x 6 m'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE fabricated H2-service receiver — FOAK estimate.
       mod('part_number', 'fabricated hydrogen-service buffer receiver vessel — bespoke vessel'), mod('list_price_gbp', '110000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('feed_blending_mixer_word', 'feed-gas blending static mixer',
      cc('feed_blending_mixer', 'make-up + recycle feed-gas static mixer', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'in-line static mixer blending make-up CO2 + H2 with recycled tail gas to the reactor feed ratio'), mod('manufacturer', 'Sulzer'),
       mod('part_number', 'SMV'), mod('list_price_gbp', '4200')]),
    word('feed_filter_coalescer_word', 'feed-gas filter/coalescer',
      cc('feed_filter_coalescer', 'feed-gas filter coalescer', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x2'), mod('form', 'high-efficiency gas filter/coalescer on each compressed feed'), mod('manufacturer', 'Pall'),
       mod('part_number', 'gas filter coalescer assembly — configured'), mod('list_price_gbp', '6800')]),
  ])
  return { module: 'mass_fluid_transport_process', display_name: 'M1 Feedstock Receipt & Conditioning',
    module_brief: `Biogenic CO2 is dried and guard-bed polished (sulphur + oxygen removal), renewable H2 is buffered, and each stream is compressed to the ${p.reactorPressureBar.toFixed(0)} bar synthesis pressure before blending with recycled tail gas.`,
    overview_paragraph_en: '', derived_parameters: { co2_feed_kg_h: p.co2FeedKgH, h2_feed_kg_h: p.h2FeedKgH, co2_feed_compressor_power_kw: p.co2CompressorPowerKw, h2_feed_compressor_power_kw: p.h2CompressorPowerKw },
    allowed_radicals: ['mass_fluid_transport_process', 'chemical_reaction_function', 'stainless_steel', 'carbon_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// M2. Synthesis ------------------------------------------------------------------
// Feed preheater, FT reactor (Fe catalyst), steam drum (exotherm recovery).
function emitSynthesis(p: EFuelParams): DesignModule {
  const sub = makeSub('ft_synthesis_train', 'Fischer-Tropsch synthesis train', 'synthesises',
    `the combined feed is preheated (~${p.feedPreheaterDutyKw.toFixed(0)} kW) and reacted over a shaped iron catalyst in a ${p.ftReactorDiameterM.toFixed(2)} m x ${p.ftReactorHeightM.toFixed(1)} m FT reactor at ${p.reactorTempC.toFixed(0)} °C / ${p.reactorPressureBar.toFixed(0)} bar (CO2 + 3 H2 -> -CH2- + 2 H2O); the ~${p.ftExothermKw.toFixed(0)} kW exotherm is removed as ~${p.steamRaisedKgH.toFixed(0)} kg/h raised steam`, [
    word('ft_synthesis_reactor_word', 'Fischer-Tropsch synthesis reactor',
      cc('ft_synthesis_reactor', 'single-step CO2-hydrogenation FT reactor', 'chemical_reaction_function', 'stainless_steel'),
      // Bespoke fabricated multitubular FT reactor — honest descriptor, NO MPN (gate-20 safe).
      // Mass = bare-shell (reactor:cstr-pfr-sizing) x 2.8 multitubular factor: a multitubular
      // reactor's tubesheets + tube bundle + baffles dominate mass (~2.5-3.5x the bare shell),
      // so the vessel must weigh well ABOVE its catalyst charge (physics-critic 2026-06-05 L1 fix).
      [mod('quantity', 'x1'), mod('form', 'cooled multitubular fixed-bed Fischer-Tropsch reactor, shaped iron catalyst, boiling-water-cooled tubes'), mod('dimension', `${p.ftReactorDiameterM.toFixed(2)} m dia x ${p.ftReactorHeightM.toFixed(1)} m`), mod('mass', String(Math.round(p.ftReactorShellMassKg * 2.8)), 'kg'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE one-off multitubular FT reactor (tubesheets + tube bundle + BWR cooling
       // jacket) — the single highest-value engineered vessel; FOAK bespoke process-plant estimate.
       mod('part_number', 'fabricated boiling-water-cooled multitubular Fischer-Tropsch reactor — bespoke vessel'), mod('list_price_gbp', '1500000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('ft_iron_catalyst_word', 'shaped iron FT catalyst charge',
      cc('ft_iron_catalyst', 'shaped iron Fischer-Tropsch catalyst charge', 'chemical_reaction_function', 'ceramic'),
      // Catalyst is a class-anchor consumable — generic descriptor, no fabricated MPN.
      // Charge = tube volume x bulk density: in a MULTITUBULAR reactor the catalyst sits INSIDE
      // the tubes (~0.5 tube-packing fraction of gross shell volume), NOT the whole shell — so
      // charge = reactor_vol x 0.5 x 1100 kg/m³ (physics-critic L1 fix: catalyst must physically
      // fit inside the tubes AND weigh less than the vessel).
      [mod('quantity', 'x1'), mod('form', `shaped/structured iron-based FT catalyst charge engineered for jet-range selectivity, low pressure-drop, long mechanical life (replaceable line item; pyrophoric when reduced)`), mod('capacity', String((p.ftReactorVolumeM3 * 0.5 * 1100).toFixed(0)), 'kg'), mod('manufacturer', 'proprietary catalyst supplier'),
       // Proprietary shaped-iron FT catalyst charge (bespoke first-fill) — FOAK estimate.
       mod('part_number', 'shaped iron Fischer-Tropsch catalyst charge — proprietary'), mod('list_price_gbp', '300000')]),
    word('feed_preheater_word', 'combined-feed preheater',
      cc('feed_preheater', 'combined-feed electric/gas preheater', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'feed/effluent + electric trim preheater raising the blended feed to reactor inlet temperature'), mod('capacity', String(p.feedPreheaterDutyKw.toFixed(0)), 'kW'), mod('manufacturer', 'Kelvion'),
       // Engineered-to-order feed/effluent + electric trim preheater — FOAK estimate
       // (preheater + catalyst-activation heater ~ £150k combined).
       mod('part_number', 'feed/effluent shell-and-tube preheater — engineered'), mod('list_price_gbp', '90000')]),
    word('catalyst_activation_heater_word', 'catalyst reduction/activation heater',
      cc('catalyst_activation_heater', 'iron-catalyst reduction/activation electric heater', 'thermal_transfer_function', 'steel'),
      [mod('quantity', 'x1'), mod('form', 'electric startup heater reducing/activating the iron catalyst in H2 before synthesis'), mod('capacity', '120', 'kW'), mod('manufacturer', 'Watlow'),
       // Made-to-order circulation process heater (catalyst reduction/activation) — FOAK estimate.
       mod('part_number', 'circulation process heater — made to order'), mod('list_price_gbp', '60000')]),
    word('steam_drum_word', 'reactor steam drum',
      cc('steam_drum', 'FT reactor steam drum', 'thermal_transfer_function', 'carbon_steel'),
      // Boiling-water steam drum on the cooled reactor — bespoke fabricated, honest descriptor.
      [mod('quantity', 'x1'), mod('form', 'boiling-water steam drum disengaging the reactor cooling-circuit steam'), mod('dimension', '1.2 m dia x 4 m'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE fabricated steam drum (with the M5 waste-heat steam generator ~ £400k
       // combined reactor heat-recovery package) — FOAK estimate.
       mod('part_number', 'fabricated steam drum with internals — bespoke vessel'), mod('list_price_gbp', '120000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('reactor_temp_profile_word', 'reactor thermowell + temperature profile',
      cc('reactor_temp_profile', 'multipoint reactor temperature-profile assembly', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', 'x4'), mod('form', 'multipoint Pt100 axial temperature-profile thermowell assembly tracking the exotherm hot-spot'), mod('manufacturer', 'Endress+Hauser'),
       mod('part_number', 'iTHERM TM411'), mod('list_price_gbp', '2400')]),
    word('reactor_relief_valve_word', 'reactor pressure-relief valve',
      cc('reactor_relief_valve', 'FT reactor pressure-relief valve', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x2'), mod('form', 'spring-loaded PRV sized to PED on the synthesis loop'), mod('manufacturer', 'LESER'),
       mod('part_number', 'Type 441'), mod('list_price_gbp', '2200'), mod('regulatory', 'PED 2014/68/EU')]),
  ])
  return { module: 'energy_conversion_transduction', display_name: 'M2 Fischer-Tropsch Synthesis',
    module_brief: `A boiling-water-cooled multitubular Fischer-Tropsch reactor hydrogenates CO2 directly to jet-range paraffins over a shaped iron catalyst at ${p.reactorTempC.toFixed(0)} °C / ${p.reactorPressureBar.toFixed(0)} bar; the ~${p.ftExothermKw.toFixed(0)} kW exotherm is recovered as ~${p.steamRaisedKgH.toFixed(0)} kg/h raised steam (net steam exporter).`,
    overview_paragraph_en: '', derived_parameters: { reactor_temp_c: p.reactorTempC, reactor_pressure_bar: p.reactorPressureBar, ft_reactor_volume_m3: p.ftReactorVolumeM3, ft_exotherm_kw: p.ftExothermKw, steam_raised_kg_h: p.steamRaisedKgH },
    allowed_radicals: ['chemical_reaction_function', 'thermal_transfer_function', 'stainless_steel', 'carbon_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// M3. Separation & recycle -------------------------------------------------------
// Hot/cold 3-phase separators, tail-gas recycle compressor, purge.
function emitSeparationRecycle(p: EFuelParams): DesignModule {
  const sub = makeSub('separation_recycle_train', 'separation & recycle train', 'separates',
    `the reactor effluent is staged through ${p.separatorDiameterM.toFixed(1)} m x ${p.separatorLengthM.toFixed(1)} m hot/cold 3-phase separators into tail gas, process water and syncrude; unconverted tail gas is recompressed (~${p.recycleCompressorPowerKw.toFixed(0)} kW) and recycled to near-extinction with a ~${p.purgeFlowKgH.toFixed(0)} kg/h purge to the thermal oxidiser`, [
    word('hot_separator_word', 'hot 3-phase separator',
      cc('hot_separator', 'hot 3-phase HP separator', 'mass_fluid_transport_process', 'stainless_steel'),
      // Bespoke fabricated 3-phase separator vessel — honest descriptor (gate-20 safe).
      [mod('quantity', 'x1'), mod('form', 'horizontal hot high-pressure 3-phase separator (tail gas / process water / wax), boot + weir internals, NO mesh (wax fouling)'), mod('dimension', `${p.separatorDiameterM.toFixed(1)} m dia x ${p.separatorLengthM.toFixed(1)} m`), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE fabricated HP 3-phase separator (~£150k each) — FOAK estimate.
       mod('part_number', 'fabricated horizontal 3-phase HP separator vessel — bespoke vessel'), mod('list_price_gbp', '150000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('cold_separator_word', 'cold 3-phase separator',
      cc('cold_separator', 'cold 3-phase HP separator', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'horizontal cold high-pressure 3-phase separator downstream of the product cooler (tail gas / process water / syncrude)'), mod('dimension', `${p.separatorDiameterM.toFixed(1)} m dia x ${p.separatorLengthM.toFixed(1)} m`), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE fabricated HP 3-phase separator (~£150k each) — FOAK estimate.
       mod('part_number', 'fabricated horizontal 3-phase HP separator vessel — bespoke vessel'), mod('list_price_gbp', '150000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('recycle_gas_compressor_word', 'tail-gas recycle compressor',
      cc('recycle_gas_compressor', 'tail-gas recycle compressor', 'mass_fluid_transport_process', 'stainless_steel'),
      // Real centrifugal recycle compressor frame — series descriptor, power tool-derived.
      // BESPOKE engineered package (recycle/tail-gas service) — FOAK estimate.
      [mod('quantity', 'x1'), mod('form', 'single-stage centrifugal recycle compressor returning unconverted tail gas to the reactor feed, VSD-driven'), mod('rating', String(p.recycleCompressorPowerKw.toFixed(0)), 'kW'), mod('manufacturer', 'Atlas Copco Gas and Process'),
       mod('part_number', 'centrifugal process gas compressor — engineered package'), mod('list_price_gbp', '350000'), mod('regulatory', 'API 617')]),
    word('product_cooler_word', 'effluent product cooler',
      cc('product_cooler', 'reactor-effluent product cooler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'shell-and-tube effluent cooler condensing syncrude + process water ahead of the cold separator, cooling-water served'), mod('capacity', String(p.productCoolerDutyKw.toFixed(0)), 'kW'), mod('manufacturer', 'Alfa Laval'),
       // Engineered-to-order effluent cooler — main item of the process heat-exchanger
       // group (~£300k total across coolers/condensers); FOAK estimate.
       mod('part_number', 'shell-and-tube process cooler — engineered'), mod('list_price_gbp', '180000')]),
    word('recycle_ko_drum_word', 'recycle knock-out drum',
      cc('recycle_ko_drum', 'recycle-gas suction knock-out drum', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'compressor-suction knock-out drum protecting the recycle compressor'), mod('dimension', '0.8 m dia x 2.4 m'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE fabricated KO drum — FOAK estimate.
       mod('part_number', 'fabricated compressor-suction knock-out drum — bespoke vessel'), mod('list_price_gbp', '45000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('purge_control_valve_word', 'purge control valve',
      cc('purge_control_valve', 'tail-gas purge control valve', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'control valve taking a small purge to the thermal oxidiser to prevent inert build-up'), mod('capacity', String(p.purgeFlowKgH.toFixed(0)), 'kg/h'), mod('manufacturer', 'Emerson Fisher'),
       mod('part_number', 'easy-e GX control valve + DVC positioner'), mod('list_price_gbp', '6400')]),
    word('process_water_pump_word', 'process-water transfer pump',
      cc('process_water_pump', 'FT process-water transfer pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x2'), mod('form', 'centrifugal process-water transfer pump, 1 duty + 1 standby, to water treatment/reuse'), mod('manufacturer', 'Grundfos'),
       mod('part_number', 'CRNE 10-4'), mod('list_price_gbp', '4200')]),
  ])
  return { module: 'mass_fluid_transport_process', display_name: 'M3 Separation & Recycle',
    module_brief: `Staged hot/cold 3-phase separators split the reactor effluent into tail gas, process water and syncrude; a centrifugal recycle compressor returns unconverted gas to near-extinction with a small purge to the thermal oxidiser.`,
    overview_paragraph_en: '', derived_parameters: { separator_diameter_m: p.separatorDiameterM, separator_length_m: p.separatorLengthM, recycle_gas_compressor_power_kw: p.recycleCompressorPowerKw, purge_flow_kg_h: p.purgeFlowKgH },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// M4. Upgrading & fractionation --------------------------------------------------
// Hydrocracker/hydrotreater, isomerisation, fractionation column.
function emitUpgradingFractionation(p: EFuelParams): DesignModule {
  const sub = makeSub('upgrading_fractionation_train', 'upgrading & fractionation train', 'upgrades',
    `the syncrude/wax is hydrocracked and isomerised/dewaxed (consuming an HP H2 slip-stream) then fractionated in a ${p.fractionationColumnDiameterM.toFixed(1)} m column into an on-spec SAF (jet) cut, a naphtha co-product (~${p.naphthaTonnesYr.toFixed(0)} t/yr) and a small recycle residue`, [
    word('hydrocracker_reactor_word', 'hydrocracker/hydrotreater reactor',
      cc('hydrocracker_reactor', 'syncrude hydrocracker/hydrotreater reactor', 'chemical_reaction_function', 'stainless_steel'),
      // Bespoke fabricated trickle-bed hydroprocessing reactor — honest descriptor.
      [mod('quantity', 'x1'), mod('form', 'trickle-bed hydrocracking/hydrotreating reactor breaking heavy chains + saturating olefins/oxygenates'), mod('dimension', '0.9 m dia x 5 m'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE HP trickle-bed hydroprocessing reactor (heavy-wall, H2-service) —
       // with the isomeriser + catalyst ~ £1.5M combined HP hydroprocessing package; FOAK estimate.
       mod('part_number', 'fabricated trickle-bed hydroprocessing reactor — bespoke vessel'), mod('list_price_gbp', '900000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('isomerisation_reactor_word', 'isomerisation/dewaxing reactor',
      cc('isomerisation_reactor', 'isomerisation/dewaxing reactor', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'catalytic isomerisation/dewaxing reactor meeting jet cold-flow (freeze-point) properties'), mod('dimension', '0.8 m dia x 4 m'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE HP isomerisation/dewaxing reactor — FOAK estimate.
       mod('part_number', 'fabricated isomerisation/dewaxing reactor — bespoke vessel'), mod('list_price_gbp', '500000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('hydroprocessing_catalyst_word', 'hydroprocessing catalyst charge',
      cc('hydroprocessing_catalyst', 'hydrocracking + isomerisation catalyst charge', 'chemical_reaction_function', 'ceramic'),
      [mod('quantity', 'x1'), mod('form', 'hydrocracking + Pt/zeolite isomerisation catalyst charge (replaceable line item)'), mod('manufacturer', 'Honeywell UOP'),
       // Licensed precious-metal hydrocracking + isomerisation first-fill charge — FOAK estimate.
       mod('part_number', 'hydrocracking + isomerisation catalyst charge — licensed'), mod('list_price_gbp', '100000')]),
    word('fractionation_column_word', 'product fractionation column',
      cc('fractionation_column', 'SAF/naphtha fractionation column', 'mass_fluid_transport_process', 'stainless_steel'),
      // Bespoke fabricated fractionation column shell — honest descriptor. Carries
      // fractionation_column_shell_mass_kg as its mass modifier.
      [mod('quantity', 'x1'), mod('form', 'packed/trayed fractionation column splitting the upgraded liquid into SAF (jet), naphtha + residue, field-erected on a plinth'), mod('dimension', `${p.fractionationColumnDiameterM.toFixed(1)} m dia x 18 m`), mod('mass', String(Math.round(p.fractionationColumnShellMassKg)), 'kg'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE one-off 18 m fabricated 316L column shell (with reboiler + overhead
       // condenser ~ £900k combined fractionation package) — FOAK estimate.
       mod('part_number', 'fabricated 316L fractionation column shell — bespoke vessel'), mod('list_price_gbp', '700000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('column_internals_word', 'fractionation column internals',
      cc('column_internals', 'fractionation trays/packing + distributors', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'structured packing + liquid distributors / valve trays for the jet/naphtha split'), mod('manufacturer', 'Koch-Glitsch'),
       // Engineered-to-order structured packing + distributors + trays for an 18 m column — FOAK estimate.
       mod('part_number', 'INTALOX structured packing + trays — engineered'), mod('list_price_gbp', '120000')]),
    word('column_reboiler_word', 'fractionation reboiler',
      cc('column_reboiler', 'fractionation column reboiler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'thermosiphon reboiler on the column, fed by the FT raised steam'), mod('capacity', '380', 'kW'), mod('manufacturer', 'Kelvion'),
       // Engineered-to-order column reboiler (part of the ~£900k fractionation package) — FOAK estimate.
       mod('part_number', 'shell-and-tube thermosiphon reboiler — engineered'), mod('list_price_gbp', '110000')]),
    word('column_overhead_condenser_word', 'fractionation overhead condenser',
      cc('column_overhead_condenser', 'column overhead condenser', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'shell-and-tube overhead condenser + reflux drum on the column, cooling-water served'), mod('capacity', '300', 'kW'), mod('manufacturer', 'Alfa Laval'),
       // Engineered-to-order overhead condenser + reflux drum (part of the ~£900k fractionation package) — FOAK estimate.
       mod('part_number', 'shell-and-tube overhead condenser — engineered'), mod('list_price_gbp', '90000')]),
    word('hp_h2_makeup_compressor_word', 'HP H2 make-up compressor',
      cc('hp_h2_makeup_compressor', 'hydroprocessing HP H2 make-up compressor', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'dedicated HP hydrogen make-up compressor feeding the hydrocracker/isomeriser slip-stream'), mod('rating', '55', 'kW'), mod('manufacturer', 'Howden'),
       // BESPOKE HP H2-service make-up compressor (engineered package) — FOAK estimate.
       mod('part_number', 'hydrogen-service make-up compressor — engineered package'), mod('list_price_gbp', '200000'), mod('regulatory', 'API 618')]),
    word('product_pump_word', 'liquid product pump',
      cc('product_pump', 'fractionation product/reflux pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x3'), mod('form', 'centrifugal product/reflux/residue pumps on the column draws'), mod('manufacturer', 'Grundfos'),
       mod('part_number', 'CRNE 5-8'), mod('list_price_gbp', '4400')]),
  ])
  return { module: 'energy_conversion_transduction', display_name: 'M4 Upgrading & Fractionation',
    module_brief: `The syncrude is hydrocracked + isomerised/dewaxed to meet jet cold-flow properties, then fractionated into an on-spec SAF cut, a naphtha co-product and a small recycle residue; the column is reboiled by the FT raised steam.`,
    overview_paragraph_en: '', derived_parameters: { fractionation_column_diameter_m: p.fractionationColumnDiameterM, fractionation_column_shell_mass_kg: p.fractionationColumnShellMassKg, naphtha_tonnes_yr: p.naphthaTonnesYr },
    allowed_radicals: ['chemical_reaction_function', 'mass_fluid_transport_process', 'thermal_transfer_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// M5. Utilities & offsites -------------------------------------------------------
// Steam system, cooling water, N2 inerting, instrument air, MV electrical,
// flare/thermal oxidiser.
function emitUtilitiesOffsites(p: EFuelParams): DesignModule {
  const sub = makeSub('utilities_offsites', 'utilities & offsites', 'supplies',
    `the FT exotherm raises ~${p.steamRaisedKgH.toFixed(0)} kg/h steam (net export) over ~${p.steamGeneratorAreaM2.toFixed(0)} m² of boiling-HX area; cooling water, N2 inerting, instrument air and an ${(p.electricalLoadKw / 1000).toFixed(1)} MW MV electrical supply serve the plant; a ${p.thermalOxidiserHeatReleaseKw.toFixed(0)} kW enclosed thermal oxidiser destroys the purge`, [
    word('waste_heat_steam_generator_word', 'waste-heat steam generator',
      cc('waste_heat_steam_generator', 'FT exotherm waste-heat steam generator', 'thermal_transfer_function', 'carbon_steel'),
      // Boiling-water HX recovering the reactor exotherm — bespoke fabricated, honest descriptor.
      [mod('quantity', 'x1'), mod('form', 'boiling-water waste-heat steam generator recovering the FT exotherm as raised steam (net exporter)'), mod('capacity', String(p.steamRaisedKgH.toFixed(0)), 'kg/h'), mod('dimension', String(p.steamGeneratorAreaM2.toFixed(0)), 'm² area'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE boiling-water waste-heat steam generator (with the M2 steam drum ~ £400k
       // combined reactor heat-recovery package) — FOAK estimate.
       mod('part_number', 'fabricated boiling-water waste-heat steam generator — bespoke package'), mod('list_price_gbp', '280000'), mod('regulatory', 'PED 2014/68/EU')]),
    word('thermal_oxidiser_word', 'enclosed thermal oxidiser',
      cc('thermal_oxidiser', 'enclosed purge thermal oxidiser', 'chemical_reaction_function', 'steel'),
      // Real Zeeco/John Zink enclosed combustor — series descriptor; duty tool-derived.
      // BESPOKE engineered enclosed oxidiser/flare package — FOAK estimate.
      [mod('quantity', 'x1'), mod('form', 'enclosed thermal oxidiser/flare for the tail-gas purge, ~1000 °C / ~1.0 s residence for CO + VOC destruction'), mod('capacity', String(p.thermalOxidiserHeatReleaseKw.toFixed(0)), 'kW'), mod('dimension', `${p.thermalOxidiserStackDiameterM.toFixed(1)} m stack dia`), mod('manufacturer', 'Zeeco'),
       mod('part_number', 'enclosed ground thermal oxidiser — engineered package'), mod('list_price_gbp', '300000'), mod('regulatory', 'API 537')]),
    word('cooling_water_skid_word', 'cooling-water skid',
      cc('cooling_water_skid', 'closed-loop cooling-water skid', 'thermal_transfer_function', 'steel'),
      [mod('quantity', 'x1'), mod('form', 'dry-cooler/cooling-tower + circulation-pump skid serving the product cooler + condensers'), mod('capacity', '1200', 'kW'), mod('manufacturer', 'Kelvion'),
       // BESPOKE packaged cooling-water skid (utilities group ~ £300k with N2 + instrument air) — FOAK estimate.
       mod('part_number', 'closed-loop cooling-water skid — packaged'), mod('list_price_gbp', '130000')]),
    word('n2_inerting_skid_word', 'nitrogen inerting skid',
      cc('n2_inerting_skid', 'N2 generation + inerting/blanketing skid', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', 'x1'), mod('form', 'PSA/membrane N2 generation + blanketing skid for vessels, purging and start-up/shutdown inerting'), mod('manufacturer', 'Atlas Copco'),
       // BESPOKE packaged N2 generation + inerting skid (utilities group) — FOAK estimate.
       mod('part_number', 'membrane nitrogen generation + inerting skid — packaged'), mod('list_price_gbp', '90000'), mod('regulatory', 'DSEAR')]),
    word('instrument_air_skid_word', 'instrument-air package',
      cc('instrument_air_skid', 'instrument + plant air package', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', 'x1'), mod('form', 'oil-free instrument-air compressor + dryer + receiver package'), mod('capacity', '37', 'kW'), mod('manufacturer', 'Atlas Copco'),
       // Configured instrument-air package (utilities group) — FOAK estimate.
       mod('part_number', 'oil-free instrument-air package — configured'), mod('list_price_gbp', '80000')]),
    word('mv_transformer_word', 'MV/LV distribution transformer',
      cc('mv_transformer', '11 kV / 415 V distribution transformer', 'electromagnetic_actuator_function', 'copper'),
      [mod('quantity', 'x1'), mod('form', '11 kV / 415 V cast-resin distribution transformer feeding the plant LV board'), mod('capacity', String(Math.ceil((p.electricalLoadKw * 1.25) / 100) * 100), 'kVA'), mod('manufacturer', 'Schneider Electric'),
       // Engineered-to-order MV distribution transformer (electrical group ~ £700k with
       // the MV switchgear + LV board) — FOAK estimate.
       mod('part_number', 'Trihal cast-resin distribution transformer'), mod('list_price_gbp', '350000'), mod('regulatory', 'IEC 60076')]),
    word('mv_switchgear_word', 'MV switchgear + LV board',
      cc('mv_switchgear', 'MV switchgear + LV main board', 'electrical_conduction_function', 'steel'),
      [mod('quantity', 'x1'), mod('form', '11 kV ring-main unit + Form-4 LV main distribution board'), mod('manufacturer', 'ABB'),
       // Engineered-to-order MV ring-main unit + Form-4 LV board (electrical group ~ £700k) — FOAK estimate.
       mod('part_number', 'MV ring-main unit + Form-4 LV board — configured'), mod('list_price_gbp', '350000'), mod('regulatory', 'BS EN 61439')]),
  ])
  return { module: 'environmental_interface', display_name: 'M5 Utilities & Offsites',
    module_brief: `The FT exotherm raises ~${p.steamRaisedKgH.toFixed(0)} kg/h process steam (net export); cooling water, N2 inerting, instrument air, an ${(p.electricalLoadKw / 1000).toFixed(1)} MW MV electrical supply and an enclosed thermal oxidiser for the purge complete the offsites.`,
    overview_paragraph_en: '', derived_parameters: { steam_raised_kg_h: p.steamRaisedKgH, connected_electrical_load_kw: p.electricalLoadKw, thermal_oxidiser_heat_release_kw: p.thermalOxidiserHeatReleaseKw },
    allowed_radicals: ['thermal_transfer_function', 'chemical_reaction_function', 'mass_fluid_transport_process', 'electromagnetic_actuator_function', 'electrical_conduction_function', 'steel', 'copper'], applicability_confidence: 'high', sub_modules: [sub] }
}

// M6. Product storage & loading --------------------------------------------------
// SAF tank, naphtha tank, additisation, tanker loading gantry.
function emitProductStorageLoading(p: EFuelParams): DesignModule {
  const sub = makeSub('product_storage_loading', 'product storage & loading', 'stores',
    `finished SAF (~${p.safOutputKgH.toFixed(0)} kg/h) is additised, certified and stored in ${p.safTankCount} x ${p.safTankDiameterM.toFixed(1)} m dia x ${p.safTankHeightM.toFixed(1)} m API 650 tank(s) alongside a naphtha tank, then loaded to road tanker at a metered loading gantry`, [
    word('saf_storage_tank_word', 'SAF storage tank',
      cc('saf_storage_tank', 'finished-SAF storage tank', 'mass_fluid_transport_process', 'carbon_steel'),
      // API 650 atmospheric welded steel tank — bespoke fabricated, honest descriptor.
      // Dimension shows the FULL DxH the storage-tank tool sized (NOT diameter-only)
      // and the mass is that SAME tool's DRY mass (shell + floor + roof + fittings,
      // 6 mm min plate): geometry + mass are now self-consistent so the physics
      // critic cannot infer an impossible sub-mm wall (2026-06-05 mass-vs-geometry fix).
      [mod('quantity', `x${p.safTankCount}`), mod('form', 'API 650 atmospheric welded steel storage tank, >=14-day finished-SAF storage, bunded'), mod('dimension', `${p.safTankDiameterM.toFixed(1)} m dia x ${p.safTankHeightM.toFixed(1)} m`), mod('mass', String(Math.round(p.productTankShellMassKg)), 'kg'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE field-erected API 650 SAF tank (per tank; with the naphtha tank ~ £350k
       // total storage) — FOAK estimate.
       mod('part_number', 'API 650 welded steel atmospheric storage tank — bespoke'), mod('list_price_gbp', '110000'), mod('regulatory', 'API 650')]),
    word('naphtha_storage_tank_word', 'naphtha storage tank',
      cc('naphtha_storage_tank', 'naphtha co-product storage tank', 'mass_fluid_transport_process', 'carbon_steel'),
      // Naphtha tank sized deterministically from the naphtha rate; dimension AND
      // mass both emitted from the same API 650 dry-mass rule (shell + floor + roof
      // + fittings, 6 mm min plate) so they are self-consistent (2026-06-05 fix —
      // previously diameter-only + no mass, so Phase 2 invented a thin-wall mass).
      [mod('quantity', 'x1'), mod('form', 'API 650 atmospheric welded steel naphtha tank, N2-blanketed, bunded'), mod('dimension', `${p.naphthaTankDiameterM.toFixed(1)} m dia x ${p.naphthaTankHeightM.toFixed(1)} m`), mod('mass', String(Math.round(p.naphthaTankShellMassKg)), 'kg'), mod('manufacturer', 'made-to-order fabrication'),
       // BESPOKE field-erected API 650 naphtha tank (with the SAF tanks ~ £350k total storage) — FOAK estimate.
       mod('part_number', 'API 650 welded steel atmospheric storage tank — bespoke'), mod('list_price_gbp', '110000'), mod('regulatory', 'API 650')]),
    word('additisation_skid_word', 'SAF additisation skid',
      cc('additisation_skid', 'jet-fuel additive injection skid', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'metered additive-injection skid (static dissipator, antioxidant, lubricity) to DEF STAN 91-091'), mod('manufacturer', 'Lewa'),
       // BESPOKE packaged additive-injection dosing skid — FOAK estimate.
       mod('part_number', 'metered additive-injection dosing skid — packaged'), mod('list_price_gbp', '70000'), mod('regulatory', 'DEF STAN 91-091')]),
    word('tanker_loading_gantry_word', 'road-tanker loading gantry',
      cc('tanker_loading_gantry', 'metered road-tanker loading gantry', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', 'x1'), mod('form', 'bottom-loading metered tanker loading arm + ground-verification + overfill protection'), mod('manufacturer', 'Emerson'),
       // BESPOKE configured loading gantry (loading arm + controller + safety interlocks) — FOAK estimate.
       mod('part_number', 'metered loading gantry with batch preset controller — configured'), mod('list_price_gbp', '100000'), mod('regulatory', 'EI 1530')]),
    word('loading_metering_skid_word', 'custody-transfer metering skid',
      cc('loading_metering_skid', 'custody-transfer flow-metering skid', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', 'x1'), mod('form', 'Coriolis custody-transfer metering skid on the loading line'), mod('manufacturer', 'Emerson'),
       // Engineered custody-transfer skid (Coriolis meter + flow computer + prover connections) — FOAK estimate.
       mod('part_number', 'Micro Motion custody-transfer Coriolis metering skid'), mod('list_price_gbp', '55000'), mod('regulatory', 'EI 1530')]),
    word('product_loading_pump_word', 'product loading pump',
      cc('product_loading_pump', 'tank-to-tanker loading pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x2'), mod('form', 'centrifugal loading pump, 1 duty + 1 standby, tank to loading gantry'), mod('manufacturer', 'Grundfos'),
       mod('part_number', 'NK 65-200'), mod('list_price_gbp', '5200')]),
    word('storage_n2_blanketing_word', 'storage N2 blanketing valves',
      cc('storage_n2_blanketing', 'storage-tank N2 blanketing valve set', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x2'), mod('form', 'inert-gas blanketing regulator + breather valve set on the SAF + naphtha tanks'), mod('manufacturer', 'Protego'),
       mod('part_number', 'DK/ES blanketing valve'), mod('list_price_gbp', '3600'), mod('regulatory', 'DSEAR')]),
  ])
  return { module: 'maintenance_serviceability', display_name: 'M6 Product Storage & Loading',
    module_brief: `Finished SAF is additised to DEF STAN 91-091, certified and stored in API 650 tanks alongside the naphtha co-product, then loaded to road tanker via a metered, overfill-protected loading gantry (EI 1530).`,
    overview_paragraph_en: '', derived_parameters: { saf_tank_count: p.safTankCount, saf_tank_diameter_m: p.safTankDiameterM, saf_tank_height_m: p.safTankHeightM, product_tank_shell_mass_kg: p.productTankShellMassKg, naphtha_tank_diameter_m: p.naphthaTankDiameterM, naphtha_tank_height_m: p.naphthaTankHeightM, naphtha_tank_shell_mass_kg: p.naphthaTankShellMassKg },
    allowed_radicals: ['mass_fluid_transport_process', 'chemical_sensing_function', 'carbon_steel', 'steel', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// M7. Control & safety -----------------------------------------------------------
// DCS, SIS, H2/CO/hydrocarbon gas detection, fire & gas.
function emitControlSafety(_p: EFuelParams): DesignModule {
  const sub = makeSub('control_safety_system', 'control & safety system', 'controls',
    `a DCS sequences the synthesis, separation, recycle, upgrading, fractionation and loading; an independent SIL-rated SIS + fire-&-gas system with H2/CO/hydrocarbon detection trips the plant to a safe state`, [
    word('dcs_controller_word', 'distributed control system',
      cc('dcs_controller', 'plant distributed control system (DCS)', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      // Engineered DCS controller — generic descriptor, NOT a structured catalogue MPN.
      // gate-20 flagged 6ES7515-2UM02-0AB0 HIGH (absent from local parts DB); for a
      // new class with no ingested Siemens catalogue, the controller carries an honest
      // descriptor (gate-20 skips/relegates unstructured descriptors to LOW).
      [mod('quantity', 'x1'), mod('form', 'redundant DCS controller pair sequencing the continuous PtL process'), mod('manufacturer', 'Siemens'),
       // Engineered redundant DCS controller subsystem (not a single catalogue SKU — see
       // the gate-20 note above); FOAK bespoke process-plant estimate.
       mod('part_number', 'Siemens SIMATIC S7-1500 distributed control system controller — engineered'), mod('list_price_gbp', '65000')]),
    word('safety_instrumented_system_word', 'safety instrumented system',
      cc('safety_instrumented_system', 'SIL-rated safety instrumented system (SIS/ESD)', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      // Engineered fail-safe SIS controller — generic descriptor, NOT a structured
      // catalogue MPN (gate-20 flagged 6ES7615-1BB30-0AB0 absent from local parts DB).
      [mod('quantity', 'x1'), mod('form', 'independent SIL-2/3 safety controller driving the emergency shutdown chain'), mod('manufacturer', 'Siemens'),
       // Engineered SIL-2/3 SIS safety controller subsystem (not a single catalogue SKU);
       // FOAK bespoke process-plant estimate.
       mod('part_number', 'Siemens SIMATIC S7-1500F fail-safe safety-instrumented-system controller — engineered'), mod('list_price_gbp', '85000'), mod('regulatory', 'IEC 61511')]),
    word('dcs_io_card_word', 'DCS/SIS I/O cards',
      cc('dcs_io_card', 'DCS/SIS distributed I/O cards', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      // Engineered distributed-I/O module set — generic descriptor, NOT a structured
      // catalogue MPN (same Siemens 6ES7* family gate-20 flagged absent from the local DB).
      [mod('quantity', 'x24'), mod('form', 'ET 200SP HA / fail-safe DI/DO + AI/AO modules for the process + safety loops'), mod('manufacturer', 'Siemens'),
       // Per-module HA fail-safe distributed I/O (catalogue-plausible per card, x24) — FOAK estimate.
       mod('part_number', 'Siemens SIMATIC ET 200SP HA fail-safe distributed I/O module — engineered'), mod('list_price_gbp', '500')]),
    word('h2_co_gas_detector_word', 'H2/CO/hydrocarbon gas detectors',
      cc('h2_co_gas_detector', 'H2 + CO + hydrocarbon gas detectors', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', 'x16'), mod('form', 'fixed catalytic/electrochemical H2 + CO + flammable-hydrocarbon detectors across the synthesis + separation areas'), mod('manufacturer', 'Dräger'),
       mod('part_number', 'Polytron 8700'), mod('list_price_gbp', '2400'), mod('regulatory', 'DSEAR')]),
    word('flame_detector_word', 'optical flame detectors',
      cc('flame_detector', 'IR3 optical flame detectors', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', 'x6'), mod('form', 'IR3 optical flame detectors at the reactor, oxidiser and loading areas'), mod('manufacturer', 'Dräger'),
       mod('part_number', 'Flame 2700'), mod('list_price_gbp', '3800'), mod('regulatory', 'BS EN 61511')]),
    word('fire_gas_controller_word', 'fire & gas controller',
      cc('fire_gas_controller', 'addressable fire & gas controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', 'x1'), mod('form', 'multi-loop fire-&-gas control panel aggregating the gas + flame detectors and driving alarms/ESD'), mod('manufacturer', 'Dräger'),
       mod('part_number', 'REGARD 7000'), mod('list_price_gbp', '6800'), mod('regulatory', 'IEC 61511')]),
    word('esd_valve_word', 'emergency shutdown valves',
      cc('esd_valve', 'fail-safe emergency shutdown valves', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', 'x8'), mod('form', 'fail-safe actuated ESD valves isolating the feed, reactor, recycle and loading'), mod('manufacturer', 'Emerson'),
       mod('part_number', 'Bettis actuated ESD ball valve — configured'), mod('list_price_gbp', '5200'), mod('regulatory', 'IEC 61511')]),
    word('sil_barrier_word', 'SIL-rated isolation barriers',
      cc('sil_barrier', 'SIL-rated signal isolation barriers', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', 'x16'), mod('form', 'SIL-2 isolated signal barriers on the safety I/O'), mod('manufacturer', 'Pepperl+Fuchs'),
       mod('part_number', 'KFD2-STC4-Ex1'), mod('list_price_gbp', '160'), mod('regulatory', 'IEC 61511')]),
    word('control_cabinet_word', 'control + marshalling cabinet',
      cc('control_cabinet', 'DCS/SIS control + marshalling cabinet', 'silicon_semiconductor_function', 'steel'),
      [mod('quantity', 'x2'), mod('form', 'floor-standing IP54 control + marshalling cabinets for the DCS + SIS'), mod('manufacturer', 'Rittal'),
       mod('part_number', 'VX25 8284.500'), mod('list_price_gbp', '3400'), mod('regulatory', 'BS EN 61439')]),
  ])
  return { module: 'control_compute_communication', display_name: 'M7 Control & Safety',
    module_brief: `A redundant DCS sequences the continuous process while an independent SIL-rated SIS and a fire-&-gas system with H2/CO/hydrocarbon detection trip the plant to a safe state, governed by COMAH + DSEAR/ATEX + IEC 61511.`,
    overview_paragraph_en: '', derived_parameters: { control_loops: 48, regulatory_mandatory_count: 4 },
    allowed_radicals: ['silicon_semiconductor_function', 'chemical_sensing_function', 'mass_fluid_transport_process', 'polymer_thermoplastic', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// Cross-module grammar links ------------------------------------------------------
function emitCrossModuleGrammarLinks(p: EFuelParams) {
  return [
    { from_module: 'mass_fluid_transport_process', to_module: 'energy_conversion_transduction',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `conditioned + compressed CO2 + H2 (+ recycle) -> FT reactor at ${p.reactorPressureBar.toFixed(0)} bar` },
    { from_module: 'energy_conversion_transduction', to_module: 'mass_fluid_transport_process',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `reactor effluent -> hot/cold 3-phase separation (tail gas / process water / syncrude)` },
    { from_module: 'mass_fluid_transport_process', to_module: 'energy_conversion_transduction',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `unconverted tail gas recompressed + recycled to near-extinction; syncrude -> upgrading + fractionation` },
    { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface',
      mechanism: 'thermal' as const, type: 'directional' as const, detail: `FT exotherm ~${p.ftExothermKw.toFixed(0)} kW -> ~${p.steamRaisedKgH.toFixed(0)} kg/h raised steam (net export) + fractionation reboil` },
    { from_module: 'mass_fluid_transport_process', to_module: 'environmental_interface',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `~${p.purgeFlowKgH.toFixed(0)} kg/h tail-gas purge -> enclosed thermal oxidiser (CO + VOC destruction)` },
    { from_module: 'energy_conversion_transduction', to_module: 'maintenance_serviceability',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `on-spec SAF + naphtha cuts -> additisation + API 650 storage + tanker loading` },
    { from_module: 'environmental_interface', to_module: 'energy_conversion_transduction',
      mechanism: 'electrical_bus' as const, type: 'directional' as const, detail: `${(p.electricalLoadKw / 1000).toFixed(1)} MW MV/LV supply -> compressors, pumps, heaters, drives` },
    { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction',
      mechanism: 'control' as const, type: 'directional' as const, detail: 'DCS sequences synthesis + upgrading; SIS/ESD + fire-&-gas trip the plant to a safe state' },
    { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process',
      mechanism: 'data' as const, type: 'directional' as const, detail: 'H2/CO/hydrocarbon gas detection + custody metering close the safety + product mass balance' },
  ]
}

const emitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitFeedstockConditioning(p),   // M1
    emitSynthesis(p),               // M2
    emitSeparationRecycle(p),       // M3
    emitUpgradingFractionation(p),  // M4
    emitUtilitiesOffsites(p),       // M5
    emitProductStorageLoading(p),   // M6
    emitControlSafety(p),           // M7
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 7 Power-to-Liquid Fischer-Tropsch SAF-plant modules (M1-M7) apply: receipt & conditioning, synthesis, separation & recycle, upgrading & fractionation, utilities & offsites, product storage & loading, control & safety.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `First-commercial Power-to-Liquid Fischer-Tropsch plant producing ~${p.safOutputTonnesYr.toFixed(0)} t/yr Sustainable Aviation Fuel (~${p.safOutputKgH.toFixed(0)} kg/h) plus ~${p.naphthaTonnesYr.toFixed(0)} t/yr naphtha from ~${p.co2FeedKgH.toFixed(0)} kg/h biogenic CO2 and ~${p.h2FeedKgH.toFixed(0)} kg/h renewable H2 via single-step CO2 hydrogenation (CO2 + 3 H2 -> -CH2- + 2 H2O) over a shaped iron catalyst at ${p.reactorTempC.toFixed(0)} °C / ${p.reactorPressureBar.toFixed(0)} bar, recovering the ~${p.ftExothermKw.toFixed(0)} kW exotherm as ~${p.steamRaisedKgH.toFixed(0)} kg/h raised steam (net steam exporter), to ASTM D7566 Annex A1 (FT-SPK).`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('e_fuel_synthesis', emitter)
registerAssembler('e_fuel_synthesis/plant', emitter)

export { emitter as eFuelSynthesisEmitter }
