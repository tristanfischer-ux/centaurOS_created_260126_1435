// proveCatch for T-22 / T-13 — Pump Unit skids + N+1 BACKUP/STANDBY labels.
//
// THE BUG: rule 9 minted backup_count quantities but synthWord titled them
// "Fertigation Dosing Pump Backup" without a clear BACKUP/STANDBY label or
// Pump Unit parent tag — P&ID showed scattered P-xxx, not skid assemblies.
// THE RULE: when backup is minted, name_human / display name carries BACKUP/STANDBY
// and fertigation/irrigation movers get a Pump Unit N parent tag.

import { applyUniversalContractSizing } from './universal-contract-sizing'

type Word = {
  name_human?: string
  modifier_characters?: Array<{ kind?: string; value?: string }>
  _pump_unit_tag?: string
  _synthesized?: boolean
}

function run(): void {
  // Minimal modules shell so applyUniversalContractSizing can attach synth words.
  const modules = [
    {
      module: 'mass_fluid_transport_process',
      sub_modules: [{ id: 'pumps', words: [] as Word[] }],
    },
  ]
  const contract = {
    product_class: 'water_treatment',
    quantities: {
      fertigation_dosing_pump_count: { value: 2, unit: '' },
      fertigation_dosing_pump_throughput_m3_h: { value: 90, unit: 'm³/h' },
      fertigation_dosing_pump_power_kw: { value: 7.5, unit: 'kW' },
      distribution_delivery_groups: { value: 2, unit: '' },
    },
  }

  applyUniversalContractSizing(modules as never, contract as never)

  const backupCount = (contract.quantities as Record<string, { value?: number }>)
    .fertigation_dosing_pump_backup_count?.value
  if (!(typeof backupCount === 'number' && backupCount >= 2)) {
    throw new Error(
      `pump-unit-skid proveCatch: expected fertigation_dosing_pump_backup_count ≥ 2, got ${backupCount}`,
    )
  }

  const words: Word[] = []
  for (const m of modules) {
    for (const sm of m.sub_modules) {
      words.push(...(sm.words || []))
    }
  }
  const backupWords = words.filter((w) =>
    /BACKUP|STANDBY/i.test(String(w.name_human ?? '')),
  )
  if (backupWords.length < 1) {
    throw new Error(
      `pump-unit-skid proveCatch: expected ≥1 word with BACKUP/STANDBY in name_human, got names=${JSON.stringify(words.map((w) => w.name_human))}`,
    )
  }
  const labelled = backupWords.some((w) =>
    /BACKUP\s*\/\s*STANDBY/i.test(String(w.name_human ?? '')),
  )
  if (!labelled) {
    throw new Error(
      `pump-unit-skid proveCatch: backup name_human must carry "(BACKUP / STANDBY)" — got ${JSON.stringify(backupWords.map((w) => w.name_human))}`,
    )
  }

  const unitTagged = words.some((w) =>
    Boolean(w._pump_unit_tag)
    || (w.modifier_characters || []).some((m) =>
      /Pump Unit/i.test(String(m.value ?? '')),
    ),
  )
  if (!unitTagged) {
    throw new Error(
      `pump-unit-skid proveCatch: fertigation pumps must carry Pump Unit N parent tag (installation mod or _pump_unit_tag)`,
    )
  }

  // proveNoFalsePositive: a single-instance RO pump must NOT get a backup mint
  const contract2 = {
    product_class: 'water_treatment',
    quantities: {
      reverse_osmosis_high_pressure_pump_count: { value: 1, unit: '' },
      reverse_osmosis_high_pressure_pump_throughput_m3_h: { value: 14, unit: 'm³/h' },
      reverse_osmosis_high_pressure_pump_power_kw: { value: 4, unit: 'kW' },
    } as Record<string, { value: number; unit: string }>,
  }
  const mods2 = [
    {
      module: 'water_treatment',
      sub_modules: [{ id: 'ro', words: [] as Word[] }],
    },
  ]
  applyUniversalContractSizing(mods2 as never, contract2 as never)
  if (contract2.quantities.reverse_osmosis_high_pressure_pump_backup_count != null) {
    throw new Error(
      'pump-unit-skid proveNoFalsePositive: single-instance RO pump must NOT mint backup_count',
    )
  }

  // eslint-disable-next-line no-console
  console.log(
    `pump-unit-skid --selftest OK (backup_count=${backupCount}; BACKUP/STANDBY labelled; Pump Unit tag present; single RO untouched)`,
  )
}

run()
