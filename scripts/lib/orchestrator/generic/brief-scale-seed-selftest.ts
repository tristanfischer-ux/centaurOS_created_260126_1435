// proveCatch for seedBriefScaleCountMetrics + seedBriefHardScalarMetrics
// (Block 1 + P3/P4 closure plan, 2026-07-27).
//
// THE BUG: buildContractForChain('consumer_electronics') shipped quantities:{} so
// brief channel_count=8 never became a typed ledger obligation — contractCountFor
// had nothing to bind and per-channel hardware rendered ×1. Counts-only seeding
// then left hard scalars UNVERIFIED and let 25 W/channel satisfy a 200 W aggregate.
//
// Wired into verify-engine-guards.sh.

import {
  buildContractForChain,
  seedBriefHardScalarMetrics,
  seedBriefScaleCountMetrics,
} from '../../engineering-contract'

function run(): void {
  const brief = {
    product_description: 'Eight independent test channels source and sink current.',
    constraints: {
      target_performance: {
        key_metric: 'channel_count',
        value: 8,
        unit: 'channels',
        metrics: [
          { key_metric: 'channel_count', value: 8, unit: 'channels', category: 'scale' },
          { key_metric: 'max_simultaneous_dissipation_w', value: 200, unit: 'W', category: 'scale' },
          { key_metric: 'voltage_range_v', value: 5, unit: 'V' },
          { key_metric: 'current_range_a', value: 5, unit: 'A' },
          { key_metric: 'voltage_measurement_accuracy_pct_fs', value: 0.05, unit: '%_FS' },
          { key_metric: 'cell_bay_temp_min_c', value: 15, unit: '°C' },
          { key_metric: 'cell_bay_temp_max_c', value: 45, unit: '°C' },
          { key_metric: 'cell_bay_temp_stability_c', value: 0.5, unit: '°C' },
          { key_metric: 'design_life_years', value: 10, unit: 'years' },
        ],
      },
    },
  }

  // CASE 1 (proveCatch): unregistered class must seed channel_count from the brief.
  const c = buildContractForChain('consumer_electronics', brief) as {
    quantities?: Record<string, { value?: unknown; source?: string; condition?: string }>
  }
  if (Number(c.quantities?.channel_count?.value) !== 8) {
    throw new Error(
      `brief-scale-seed: consumer_electronics fallback must seed channel_count=8 from brief ` +
      `(got ${JSON.stringify(c.quantities?.channel_count)})`,
    )
  }
  if (String(c.quantities?.channel_count?.source) !== 'brief') {
    throw new Error('brief-scale-seed: seeded count must carry source=brief')
  }

  // P3: hard scalars must land on the ledger (counts-only left them UNVERIFIED).
  if (Number(c.quantities?.max_simultaneous_dissipation_w?.value) !== 200) {
    throw new Error('brief-scale-seed: must seed max_simultaneous_dissipation_w=200')
  }
  if (Number(c.quantities?.aggregate_dissipation_w?.value) !== 200) {
    throw new Error('brief-scale-seed: must alias aggregate_dissipation_w=200 from stated max')
  }
  if (Number(c.quantities?.voltage_range_v?.value) !== 5) {
    throw new Error('brief-scale-seed: must seed voltage_range_v=5')
  }
  if (Number(c.quantities?.current_range_a?.value) !== 5) {
    throw new Error('brief-scale-seed: must seed current_range_a=5')
  }
  if (!/per_channel/i.test(String(c.quantities?.voltage_range_v?.condition ?? ''))) {
    throw new Error('brief-scale-seed: voltage_range_v must be marked per_channel (not aggregate)')
  }
  // Cell-bay envelope (cold-v15 Exec Summary / Verification floor): min/max/stability
  // must land as typed ledger targets, not stay UNVERIFIED brief prose.
  if (Number(c.quantities?.cell_bay_temp_min_c?.value) !== 15) {
    throw new Error('brief-scale-seed: must seed cell_bay_temp_min_c=15')
  }
  if (Number(c.quantities?.cell_bay_temp_max_c?.value) !== 45) {
    throw new Error('brief-scale-seed: must seed cell_bay_temp_max_c=45')
  }
  if (Number(c.quantities?.cell_bay_temp_stability_c?.value) !== 0.5) {
    throw new Error('brief-scale-seed: must seed cell_bay_temp_stability_c=0.5')
  }

  // CASE 2: never overwrite an authored quantity.
  const authored = seedBriefScaleCountMetrics(
    {
      product_class: 'syringe_pump',
      brief_summary: 'test',
      quantities: {
        channel_count: {
          value: 4,
          unit: '',
          family: 'dimensionless',
          basis: 'rated',
          scope: 'system',
          uncertainty_pct: 0,
          temporal_resolution_s: null,
          condition: 'rated',
          provenance: { source: 'brief', source_detail: 'archetype' },
        } as never,
      },
      topology: [],
      macro_assembly_prices: [],
      closures: [],
    },
    brief,
  )
  if (Number(authored.quantities.channel_count.value) !== 4) {
    throw new Error('brief-scale-seed: must NOT overwrite an existing channel_count')
  }

  // CASE 3: empty / no metrics → no-op (no invented counts).
  const empty = buildContractForChain('consumer_electronics', { constraints: {} })
  if (Object.keys(empty.quantities ?? {}).length !== 0) {
    throw new Error('brief-scale-seed: brief with no count metrics must leave quantities empty')
  }

  // P4: per-channel × count derives aggregate when only per-channel is present.
  const derived = seedBriefHardScalarMetrics(
    {
      product_class: 'consumer_electronics',
      brief_summary: 'test',
      quantities: {
        channel_count: {
          value: 8, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system',
          source: 'brief',
        } as never,
        channel_max_dissipation_w: {
          value: 25, unit: 'W', family: 'power', basis: 'rated', scope: 'system',
          source: 'calculator',
        } as never,
      },
      topology: [],
      macro_assembly_prices: [],
      closures: [],
    },
    { constraints: {} },
  )
  if (Number(derived.quantities.aggregate_dissipation_w?.value) !== 200) {
    throw new Error(
      `brief-scale-seed: must derive aggregate_dissipation_w=200 from 25×8 ` +
      `(got ${JSON.stringify(derived.quantities.aggregate_dissipation_w)})`,
    )
  }

  // eslint-disable-next-line no-console
  console.log('brief-scale-seed --selftest OK (counts + hard scalars + aggregate alias/derive; no overwrite)')
}

run()
