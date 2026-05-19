import { runReportCompiler } from './pipeline/run-report-compiler'

async function main() {
  const examples = [
    {
      id: 'sample-bess',
      briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
    },
    {
      id: 'sample-farm',
      briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
    },
    {
      id: 'sample-auv',
      briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
    },
    {
      id: 'sample-edge-ai',
      briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
    },
    {
      id: 'sample-haps',
      briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
    },
    {
      id: 'sample-cgm',
      briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
    },
    {
      id: 'sample-drone',
      briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
    },
  ]

  for (const example of examples) {
    const result = await runReportCompiler(example)
    console.log('='.repeat(80))
    console.log(result.outline)
    console.log('')
    console.log('Score estimate:', JSON.stringify(result.score, null, 2))
    console.log('Issues:', JSON.stringify(result.issues, null, 2))
  }
}

void main()
