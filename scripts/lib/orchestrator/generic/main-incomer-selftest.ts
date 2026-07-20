/**
 * proveCatch for F1d — device-scale electrical model (organoid-bioreactor 2150).
 *
 * The main-incomer sizer defaulted vLine=400 and modelled EVERY product's supply as
 * a 3-phase 400 V incomer (√3·400) — including a 35 W / 20 mL benchtop instrument,
 * which in reality plugs into a single-phase 230 V wall socket. The fix models a
 * watt-scale instrument (same signal as the sizing guard) with no derived transformer
 * secondary as single-phase 230 V.
 *
 * This calls the REAL sizeMainIncomer (no logic duplication) and asserts the stamped
 * incomer word + contract basis are SINGLE-PHASE 230 V for a device, and stay 3-phase
 * 400 V for a plant. Run: npx tsx scripts/lib/orchestrator/generic/main-incomer-selftest.ts
 */
import { sizeMainIncomer } from './universal-contract-sizing'

type AnyRec = Record<string, unknown>

function incomerWord(): AnyRec {
  return { id: 'main_incomer_word', name_human: 'Main Incomer', modifier_characters: [] }
}
function mkModules(): AnyRec[] {
  return [{ module: 'power_distribution', sub_modules: [{ id: 'sm', words: [incomerWord()] }] }]
}

function run(quantities: Record<string, number>): { basis: string; dim: string } {
  const modules = mkModules()
  const contract: AnyRec = { quantities: {} }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sizeMainIncomer(modules as any, quantities, contract as any)
  const cq = (contract.quantities as AnyRec)['main_incomer_breaker_a'] as AnyRec
  const basis = String((cq?.source_detail as string) ?? '')
  // the stamped dimension modifier on the incomer word
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = (modules[0] as any).sub_modules[0].words[0]
  const dimMod = (w.modifier_characters as AnyRec[]).find((m) => m.kind === 'dimension')
  const dim = String((dimMod?.value as string) ?? '')
  return { basis, dim }
}

function main(): number {
  const fails: string[] = []
  const ok = (c: boolean, m: string) => { if (!c) fails.push(m) }

  // DEVICE: the frozen 2150 organoid bioreactor — 0.004 m³ envelope, 35 W, 20 mL,
  // 0.035 kW connected load. Must model single-phase 230 V, NOT √3·400.
  const dev = run({ connected_electrical_load_kw: 0.035, enclosure_volume_m3: 0.00403,
    peak_electrical_power_w: 35, working_volume_ml: 20 })
  ok(/230/.test(dev.basis) && !/√3|SQRT\(3\)/.test(dev.basis),
    `device incomer basis must be single-phase 230 V, got: ${dev.basis}`)
  ok(/single-phase/.test(dev.dim) && /230 V/.test(dev.dim),
    `device incomer dimension must read 230 V single-phase, got: ${dev.dim}`)

  // PLANT: a utility-scale load with no device-scale signal keeps 3-phase 400 V.
  const plant = run({ connected_electrical_load_kw: 850, enclosure_volume_m3: 38 })
  ok(/√3·400|400/.test(plant.basis) && /√3/.test(plant.basis),
    `plant incomer basis must stay 3-phase 400 V (√3·400), got: ${plant.basis}`)
  ok(/3-phase/.test(plant.dim),
    `plant incomer dimension must read 3-phase, got: ${plant.dim}`)

  // A small load with an explicit ~400 V transformer secondary is NOT overridden to
  // 230 V — a derived 3-phase voltage wins over the device-scale default (5 kVA @
  // 7.2 A → √3 → ~401 V). Guards against blindly forcing every small load single-phase.
  const devWithTx = run({ connected_electrical_load_kw: 0.05, enclosure_volume_m3: 0.5,
    peak_electrical_power_w: 40, transformer_kva: 5, transformer_secondary_current_a: 7.2 })
  ok(/3-phase/.test(devWithTx.dim) && !/230 V/.test(devWithTx.dim),
    `derived transformer secondary must keep 3-phase (not forced to 230 V), got: ${devWithTx.dim}`)

  if (fails.length) {
    console.error('[main-incomer][selftest] FAIL:')
    for (const f of fails) console.error('  ✗ ' + f)
    return 1
  }
  console.error('[main-incomer] _selftest passed — F1d device-scale single-phase model proveCatch (device 230 V, plant 3-ph 400 V)')
  return 0
}

process.exit(main())
