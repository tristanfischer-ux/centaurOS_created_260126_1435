import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildSourcingEvidencePack, renderSourcingEvidencePackCsv } from './sourcing/evidence-pack'

const examples = [
  {
    id: 'audit-pack-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  },
  {
    id: 'audit-pack-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  },
  {
    id: 'audit-pack-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, R290 refrigerant, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump, monobloc enclosure, and defrost control.',
  },
  {
    id: 'audit-pack-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering, insulation monitoring, emergency stop, and outdoor cabinet.',
  },
  {
    id: 'audit-pack-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  },
  {
    id: 'audit-pack-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  },
  {
    id: 'audit-pack-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  },
  {
    id: 'audit-pack-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  },
  {
    id: 'audit-pack-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  },
  {
    id: 'audit-pack-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  },
]

async function main(): Promise<void> {
  const summaries = []
  for (const example of examples) {
    const result = await runReportCompiler(example)
    const pack = buildSourcingEvidencePack(result.dossier)
    const csv = renderSourcingEvidencePackCsv(pack)
    const criticalUnpriced = result.dossier.bom.lines.filter(line => line.critical && line.unitCostGbp === null)

    assert(pack.criticalPackets.length === criticalUnpriced.length, `${example.id} should have one critical packet per unpriced critical line.`)
    assert(pack.criticalPackets.every(packet => packet.requiredEvidenceFields.includes('supplierName')), `${example.id} packets must request supplierName.`)
    assert(pack.criticalPackets.every(packet => packet.requiredEvidenceFields.includes('unitCostGbp')), `${example.id} packets must request unitCostGbp.`)
    assert(pack.criticalPackets.every(packet => packet.requiredEvidenceFields.includes('evidence.ref')), `${example.id} packets must request evidence.ref.`)
    assert(pack.criticalPackets.every(packet => packet.acceptedSourceGrades.includes('catalogue')), `${example.id} packets must accept catalogue-grade evidence.`)
    assert(pack.criticalPackets.every(packet => packet.searchTerms.length >= 4), `${example.id} packets should include search starting points.`)
    assert(pack.criticalPackets.every(packet => !hasAdmittedClaimKeys(packet)), `${example.id} packets must not contain admitted supplier/cost claim keys.`)
    assert(csv.split('\n').filter(Boolean).length === pack.criticalPackets.length + pack.candidatePackets.length + 1, `${example.id} CSV should include header plus all packets.`)

    summaries.push({
      id: example.id,
      criticalPackets: pack.criticalPackets.length,
      candidatePackets: pack.candidatePackets.length,
      csvRows: csv.split('\n').filter(Boolean).length,
      firstCritical: pack.criticalPackets[0]?.componentWordId,
    })
  }

  console.log('Sourcing evidence pack audit passed')
  console.log(summaries)
}

function hasAdmittedClaimKeys(packet: object): boolean {
  const keys = Object.keys(packet)
  return keys.includes('supplierName') || keys.includes('manufacturer') || keys.includes('mpn') || keys.includes('unitCostGbp')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
