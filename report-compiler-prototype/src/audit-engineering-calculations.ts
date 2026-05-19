import { buildEngineeringCalculationLedger } from './architecture/engineering-calculations'
import { runReportCompiler } from './pipeline/run-report-compiler'

const examples = [
  {
    id: 'calc-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
    expectedClass: 'energy_storage',
    minRows: 3,
  },
  {
    id: 'calc-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
    expectedClass: 'vertical_farm',
    minRows: 2,
  },
  {
    id: 'calc-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, R290 refrigerant, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump, monobloc enclosure, and defrost control.',
    expectedClass: 'heat_pump',
    minRows: 2,
  },
  {
    id: 'calc-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering, insulation monitoring, emergency stop, and outdoor cabinet.',
    expectedClass: 'ev_charger',
    minRows: 2,
  },
  {
    id: 'calc-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
    expectedClass: 'bioreactor',
    minRows: 2,
  },
  {
    id: 'calc-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
    expectedClass: 'auv',
    minRows: 2,
  },
  {
    id: 'calc-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
    expectedClass: 'edge_ai',
    minRows: 2,
  },
  {
    id: 'calc-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
    expectedClass: 'haps',
    minRows: 3,
  },
  {
    id: 'calc-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
    expectedClass: 'cgm',
    minRows: 3,
  },
  {
    id: 'calc-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
    expectedClass: 'drone',
    minRows: 2,
  },
]

async function main(): Promise<void> {
  const summaries = []
  for (const example of examples) {
    const result = await runReportCompiler({ id: example.id, briefText: example.briefText })
    const ledger = buildEngineeringCalculationLedger(result.dossier)
    assert(result.dossier.productClass === example.expectedClass, `${example.id} classified as ${result.dossier.productClass}, expected ${example.expectedClass}.`)
    assert(ledger.summary.rows >= example.minRows, `${example.id} should emit at least ${example.minRows} calculation rows.`)
    assert(ledger.rows.every(row => row.evidenceRequired.length > 20), `${example.id} calculations should name evidence required.`)
    assert(ledger.rows.every(row => row.formula.length > 0), `${example.id} calculations should expose formulas.`)
    assert(ledger.summary.blocked === 0, `${example.id} sample calculations should not be blocked by missing inputs.`)
    summaries.push({
      id: example.id,
      productClass: result.dossier.productClass,
      summary: ledger.summary,
    })
  }

  const cgm = await runReportCompiler({ id: 'calc-cgm-specific', briefText: examples.find(item => item.id === 'calc-cgm')?.briefText ?? '' })
  const cgmLedger = buildEngineeringCalculationLedger(cgm.dossier)
  const readingsPerDay = cgmLedger.rows.find(row => row.id === 'cgm_readings_per_day')
  const wearReadings = cgmLedger.rows.find(row => row.id === 'cgm_total_wear_readings')
  const mardMargin = cgmLedger.rows.find(row => row.id === 'cgm_mard_margin_to_10_percent')

  assert(readingsPerDay?.result === 288, 'CGM 5-minute readings should calculate 288 readings/day.')
  assert(wearReadings?.result === 4032, 'CGM 14-day wear at 5-minute interval should calculate 4032 readings.')
  assert(mardMargin?.result === 1, 'CGM 9% MARD should calculate a 1 percentage-point margin to 10%.')
  assert(mardMargin?.status === 'within_envelope', 'CGM 9% MARD margin should be within deterministic envelope.')

  const unrealisticBess = await runReportCompiler({
    id: 'calc-bess-unrealistic',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const unrealisticLedger = buildEngineeringCalculationLedger(unrealisticBess.dossier)
  const energyDensity = unrealisticLedger.rows.find(row => row.id === 'bess_system_energy_density_wh_per_kg')
  assert(energyDensity?.status === 'outside_envelope', 'Unrealistic BESS mass should push system energy density outside the deterministic envelope.')

  console.log('Engineering calculation ledger audit passed')
  console.log({ summaries, cgm: { readingsPerDay, wearReadings, mardMargin }, unrealisticBess: energyDensity })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
