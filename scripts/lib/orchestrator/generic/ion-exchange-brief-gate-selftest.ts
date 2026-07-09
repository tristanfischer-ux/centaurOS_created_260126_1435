// proveCatch for dropUnstatedIonExchangeStages (universal-contract-sizing.ts, T-19).
//
// THE BUG: a RO-only makeup brief (city water → particle → GAC → RO, no softener named)
// still shipped Softener Vessel / ion-exchange resin beds invented by the generator from
// library candidates. Those words are grounded (not `_synthesized`) so the invented-
// principal drop never saw them; softener_* contract quantities also re-minted them.
// THE RULE: when brief prose never names softener/ion-exchange/resin/deioni/demineral,
// drop principal words claiming that family AND strip softener_* quantities so reconcile
// cannot re-mint. A brief that DOES name "duplex softener" (Codema) keeps softener.
// Plain GAC / activated-carbon filters are NOT softeners and must survive.

import {
  dropUnstatedIonExchangeStages,
  reconcilePrincipalEquipment,
  stripUnstatedSoftenerQuantities,
} from './universal-contract-sizing'
import { buildContract } from '../../engineering-contract'

function names(modules: any): string[] {
  const out: string[] = []
  for (const m of modules) for (const sm of m.sub_modules) for (const w of sm.words ?? []) {
    if ((w as { _subcomponent?: boolean })._subcomponent) continue
    out.push(w.name_human || '')
  }
  return out
}

function run(): void {
  // proveCatch: RO-only brief WITHOUT softener words → softener vessel DROPPED;
  // RO survives; GAC filter (plain "Gac Filter") SURVIVES.
  const m1: any = [{
    module: 'purification',
    sub_modules: [{
      sub_module: 'makeup',
      words: [
        {
          id: 'reverse_osmosis_skid_synth_word', name_human: 'Reverse Osmosis Skid', _synthesized: true,
          content_character: { character_id: 'reverse_osmosis_skid_synth', name_human: 'Reverse Osmosis Skid' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
        {
          id: 'gac_filter_word', name_human: 'Gac Filter',
          content_character: { character_id: 'gac_filter', name_human: 'Gac Filter' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
        {
          id: 'softener_vessel_word', name_human: 'Softener Vessel',
          content_character: { character_id: 'softener_vessel', name_human: 'Softener Vessel' },
          modifier_characters: [{ kind: 'quantity', value: '×2' }, { kind: 'capacity', value: '1.0', unit: 'm³' }],
        },
        {
          id: 'ion_exchange_resin_bed_word', name_human: 'Ion Exchange Resin Bed',
          content_character: { character_id: 'ion_exchange_resin_bed', name_human: 'Ion Exchange Resin Bed' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
        {
          id: 'gac_softener_word', name_human: 'Gac Softener',
          content_character: { character_id: 'gac_softener', name_human: 'Gac Softener' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
      ],
    }],
  }]
  // GOTCHA: must not contain soften/ion-exchange/resin/deioni/demineral tokens — even
  // "no softener" would match briefRe and falsely KEEP the invented softener words.
  const roOnlyBrief =
    'City water to particle filter to granular activated carbon to reverse osmosis permeate only.'
  const nDrop = dropUnstatedIonExchangeStages(m1, roOnlyBrief)
  if (nDrop < 2) throw new Error(`ion-exchange-brief-gate proveCatch: expected ≥2 softener words dropped, got ${nDrop}`)
  const n1 = names(m1)
  if (n1.some((x) => /\bsoften|\bion[\s-]?exchange|\bresin\b/i.test(x))) {
    throw new Error(`ion-exchange-brief-gate proveCatch: softener/IX words survived on RO-only brief (got ${JSON.stringify(n1)})`)
  }
  if (!n1.some((x) => /reverse osmosis/i.test(x))) {
    throw new Error(`ion-exchange-brief-gate proveCatch: RO skid must survive (got ${JSON.stringify(n1)})`)
  }
  if (!n1.some((x) => /gac filter/i.test(x))) {
    throw new Error(`ion-exchange-brief-gate proveCatch: plain Gac Filter must survive (got ${JSON.stringify(n1)})`)
  }

  // Quantity strip: softener_* keys removed when brief silent; kept when brief names softener.
  const qSilent: Record<string, number> = {
    softener_vessel_count: 2,
    softener_vessel_volume_each_m3: 1.0,
    gac_softener_throughput_m3_h: 14.5,
    reverse_osmosis_skid_count: 1,
  }
  const nStrip = stripUnstatedSoftenerQuantities(qSilent, roOnlyBrief)
  if (nStrip < 3) throw new Error(`ion-exchange-brief-gate quantity strip: expected ≥3 keys removed, got ${nStrip}`)
  if ('softener_vessel_count' in qSilent || 'gac_softener_throughput_m3_h' in qSilent) {
    throw new Error('ion-exchange-brief-gate quantity strip: softener_* keys must be gone')
  }
  if (qSilent.reverse_osmosis_skid_count !== 1) {
    throw new Error('ion-exchange-brief-gate quantity strip: non-softener keys must survive')
  }

  // proveNoFalsePositive: brief that names "duplex softener" (Codema phrasing) keeps softener.
  const m2: any = [{
    module: 'purification',
    sub_modules: [{
      sub_module: 'makeup',
      words: [
        {
          id: 'softener_vessel_word', name_human: 'Softener Vessel',
          content_character: { character_id: 'softener_vessel', name_human: 'Softener Vessel' },
          modifier_characters: [{ kind: 'quantity', value: '×2' }],
        },
        {
          id: 'gac_filter_word', name_human: 'Gac Filter',
          content_character: { character_id: 'gac_filter', name_human: 'Gac Filter' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
      ],
    }],
  }]
  // Codema brief phrasing (briefs-loop/fischer_farms_codema.md):
  const codemaBrief =
    'Particle filter and granular-activated-carbon filter in the inlet line; water softener duplex ' +
    '(two glass-fibre-reinforced-plastic tanks, food-quality strong-acid cation resin, automatic brine regeneration) ' +
    'for the make-up stream.'
  const nKeep = dropUnstatedIonExchangeStages(m2, codemaBrief)
  if (nKeep !== 0) throw new Error(`ion-exchange-brief-gate proveNoFalsePositive: Codema softener brief must keep softener, dropped ${nKeep}`)
  if (!names(m2).some((x) => /softener vessel/i.test(x))) {
    throw new Error('ion-exchange-brief-gate proveNoFalsePositive: Softener Vessel must remain')
  }
  const qCodema: Record<string, number> = { softener_vessel_count: 2, gac_softener_throughput_m3_h: 14.5 }
  if (stripUnstatedSoftenerQuantities(qCodema, codemaBrief) !== 0) {
    throw new Error('ion-exchange-brief-gate proveNoFalsePositive: Codema brief must keep softener_* quantities')
  }
  if (qCodema.softener_vessel_count !== 2) {
    throw new Error('ion-exchange-brief-gate proveNoFalsePositive: softener_vessel_count must remain')
  }

  // Empty brief → strict no-op (never invent a drop without brief evidence).
  const m3: any = JSON.parse(JSON.stringify(m2))
  if (dropUnstatedIonExchangeStages(m3, '') !== 0) {
    throw new Error('ion-exchange-brief-gate: empty briefText must be a no-op')
  }
  const qEmpty: Record<string, number> = { softener_vessel_count: 2 }
  if (stripUnstatedSoftenerQuantities(qEmpty, '') !== 0) {
    throw new Error('ion-exchange-brief-gate: empty brief must not strip softener quantities')
  }

  // Wired through reconcilePrincipalEquipment when briefText is passed — softener word
  // dropped AND softener_* quantities cannot re-mint Softener Vessel.
  const m4: any = [{
    module: 'purification',
    sub_modules: [{
      sub_module: 'makeup',
      words: [
        {
          id: 'reverse_osmosis_skid_synth_word', name_human: 'Reverse Osmosis Skid', _synthesized: true,
          content_character: { character_id: 'reverse_osmosis_skid_synth', name_human: 'Reverse Osmosis Skid' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'capacity', value: '10', unit: 'm³' }],
        },
        {
          id: 'gac_filter_word', name_human: 'Gac Filter',
          content_character: { character_id: 'gac_filter', name_human: 'Gac Filter' },
          modifier_characters: [{ kind: 'quantity', value: '×1' }],
        },
        {
          id: 'softener_vessel_word', name_human: 'Softener Vessel',
          content_character: { character_id: 'softener_vessel', name_human: 'Softener Vessel' },
          modifier_characters: [{ kind: 'quantity', value: '×2' }, { kind: 'capacity', value: '1.0', unit: 'm³' }],
        },
      ],
    }],
  }]
  reconcilePrincipalEquipment(
    m4 as never[],
    {
      quantities: {
        reverse_osmosis_skid_volume_m3: { value: 10 },
        reverse_osmosis_skid_count: { value: 1 },
        softener_vessel_count: { value: 2 },
        softener_vessel_volume_each_m3: { value: 1.0 },
      },
    } as never,
    { briefText: roOnlyBrief },
  )
  if (names(m4).some((x) => /\bsoften|\bresin\b|\bion[\s-]?exchange/i.test(x))) {
    throw new Error(`ion-exchange-brief-gate reconcile path: softener must be dropped (got ${JSON.stringify(names(m4))})`)
  }
  if (!names(m4).some((x) => /gac filter/i.test(x))) {
    throw new Error(`ion-exchange-brief-gate reconcile path: Gac Filter must survive (got ${JSON.stringify(names(m4))})`)
  }

  // Codema-phrasing brief through reconcile keeps softener.
  const m5: any = [{
    module: 'purification',
    sub_modules: [{
      sub_module: 'makeup',
      words: [
        {
          id: 'softener_vessel_word', name_human: 'Softener Vessel', _synthesized: true,
          content_character: { character_id: 'softener_vessel', name_human: 'Softener Vessel' },
          modifier_characters: [{ kind: 'quantity', value: '×2' }, { kind: 'capacity', value: '1.0', unit: 'm³' }],
        },
      ],
    }],
  }]
  reconcilePrincipalEquipment(
    m5 as never[],
    {
      quantities: {
        softener_vessel_count: { value: 2 },
        softener_vessel_volume_each_m3: { value: 1.0 },
      },
    } as never,
    { briefText: codemaBrief },
  )
  if (!names(m5).some((x) => /softener/i.test(x))) {
    throw new Error(`ion-exchange-brief-gate Codema reconcile: softener must be kept (got ${JSON.stringify(names(m5))})`)
  }

  // T-19 proveCatch — water_treatment contract builder omits softener_vessel_* when
  // brief is silent; Codema softener brief still emits them.
  const roOnlyContract = buildContract('water_treatment', {
    original_text: roOnlyBrief,
    product_description: 'RO makeup plant',
  })
  if (!roOnlyContract) throw new Error('T-19: buildContract(water_treatment) must return a contract')
  const roQ = roOnlyContract.quantities as Record<string, unknown>
  if ('softener_vessel_count' in roQ || 'softener_vessel_volume_each_m3' in roQ) {
    throw new Error(
      `T-19 proveCatch: RO-only brief must OMIT softener_vessel_* keys entirely, got keys=${Object.keys(roQ).filter((k) => /softener/i.test(k)).join(',')}`,
    )
  }
  if (!('gac_filter_vessel_volume_m3' in roQ) || !('reverse_osmosis_skid_count' in roQ)) {
    throw new Error('T-19 proveCatch: GAC + RO quantities must still be emitted on RO-only brief')
  }
  const codemaContract = buildContract('water_treatment', {
    original_text: codemaBrief,
    product_description: 'Codema fertigation water plant',
  })
  if (!codemaContract) throw new Error('T-19: Codema buildContract must return a contract')
  const cQ = codemaContract.quantities as Record<string, { value?: number }>
  if (cQ.softener_vessel_count?.value !== 2) {
    throw new Error(
      `T-19 proveNoFalsePositive: Codema softener brief must emit softener_vessel_count=2, got ${JSON.stringify(cQ.softener_vessel_count)}`,
    )
  }
  if (cQ.softener_vessel_volume_each_m3?.value == null) {
    throw new Error('T-19 proveNoFalsePositive: Codema brief must emit softener_vessel_volume_each_m3')
  }

  // eslint-disable-next-line no-console
  console.log(
    'ion-exchange-brief-gate --selftest OK ' +
      '(RO-only drops softener + strips qty; GAC survives; Codema duplex softener kept; empty brief no-op; reconcile wired; T-19 builder omits softener_vessel_* when silent)',
  )
}

run()
