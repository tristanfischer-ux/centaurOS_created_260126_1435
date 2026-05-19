import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { evaluateArchitectureReadiness } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier } from './schema/types'

const examples = [
  {
    id: 'audit-verification-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  },
  {
    id: 'audit-verification-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  },
  {
    id: 'audit-verification-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, R290 refrigerant, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump, monobloc enclosure, and defrost control.',
  },
  {
    id: 'audit-verification-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering, insulation monitoring, emergency stop, and outdoor cabinet.',
  },
  {
    id: 'audit-verification-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  },
  {
    id: 'audit-verification-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  },
  {
    id: 'audit-verification-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  },
  {
    id: 'audit-verification-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  },
  {
    id: 'audit-verification-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  },
  {
    id: 'audit-verification-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  },
]

async function main(): Promise<void> {
  const summaries = []

  for (const example of examples) {
    const result = await runReportCompiler(example)
    const plan = buildEngineeringVerificationPlan(result.dossier, result.architectureReadiness, result.issues)
    const designReviews = plan.activities.filter(activity => activity.evidenceKind === 'design_review')
    const interfaceReviews = plan.activities.filter(activity => activity.evidenceKind === 'interface_review')
    const sourceEvidence = plan.activities.filter(activity => activity.evidenceKind === 'source_evidence')

    assert(designReviews.length === result.architectureReadiness.moduleCount, `${example.id} should create one design-review activity per module.`)
    assert(interfaceReviews.length === result.architectureReadiness.requiredInterfaceLinks.length, `${example.id} should create one interface-review activity per required interface.`)
    assert(interfaceReviews.every(activity => activity.status === 'ready_for_review'), `${example.id} valid required interfaces should be ready for review.`)
    assert(sourceEvidence.length > 0, `${example.id} should keep critical source-evidence work visible while BoM evidence is absent.`)
    assert(sourceEvidence.every(activity => activity.status === 'blocked'), `${example.id} source-evidence activities should block BoM claims until evidence is admitted.`)
    assert(plan.summary.activities === plan.activities.length, `${example.id} summary count should match activities.`)
    assert(plan.summary.blocked === plan.activities.filter(activity => activity.status === 'blocked').length, `${example.id} blocked count should match activities.`)

    summaries.push({
      id: example.id,
      activities: plan.summary.activities,
      readyForReview: plan.summary.readyForReview,
      open: plan.summary.open,
      blocked: plan.summary.blocked,
      designReviews: plan.summary.designReviewActivities,
      calculations: plan.summary.calculationActivities,
      interfaceReviews: plan.summary.interfaceReviewActivities,
      sourceEvidence: plan.summary.sourceEvidenceActivities,
      complianceReviews: plan.summary.complianceReviewActivities,
    })
  }

  const broken = await runReportCompiler(examples[0])
  const brokenDossier = removeInterface(broken.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenPlan = buildEngineeringVerificationPlan(brokenDossier, brokenReadiness, broken.issues)
  const brokenInterface = brokenPlan.activities.find(activity =>
    activity.evidenceKind === 'interface_review' && activity.interfaceIds.includes('dc_bus')
  )

  assert(brokenInterface?.status === 'blocked', 'Broken BESS dc_bus interface verification should be blocked.')
  assert((brokenInterface?.blockers.length ?? 0) > 0, 'Broken BESS dc_bus verification should explain the blocker.')

  console.log('Engineering verification plan audit passed')
  console.log({
    summaries,
    broken: {
      activity: brokenInterface?.activity,
      status: brokenInterface?.status,
      blockers: brokenInterface?.blockers,
    },
  })
}

function removeInterface(dossier: ProductDossier, moduleId: string, interfaceId: string): ProductDossier {
  const copy = JSON.parse(JSON.stringify(dossier)) as ProductDossier
  const module = copy.architecture.modules.find(item => item.id === moduleId)
  if (!module) return copy
  module.interfaces = module.interfaces.filter(item => item !== interfaceId)
  for (const subModule of module.subModules) {
    subModule.interfaces = subModule.interfaces.filter(item => item !== interfaceId)
  }
  return copy
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
