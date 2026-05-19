import type { PipelineStageTrace, ProductDossier, Severity } from '../schema/types'
import { buildBriefIntakeGate, type BriefIntakeArea } from './brief-intake-gate'

export type BriefClarificationVerdict =
  | 'no_clarification_needed'
  | 'clarification_recommended'
  | 'clarification_required'

export type BriefClarificationKind =
  | 'product_class'
  | 'target_metrics'
  | 'operating_envelope'
  | 'physical_constraints'
  | 'environment_and_duty'
  | 'interfaces_and_integration'
  | 'compliance_and_risk'
  | 'assumption_boundary'

export interface BriefClarificationQuestion {
  id: string
  sequence: number
  kind: BriefClarificationKind
  priority: Severity
  status: 'required' | 'recommended' | 'optional'
  gateArea: BriefIntakeArea
  question: string
  why: string
  expectedAnswerFormat: string
  exampleAnswer: string
  blocksArchitecture: boolean
  resolves: string[]
}

export interface BriefClarificationPlan {
  verdict: BriefClarificationVerdict
  summary: {
    rows: number
    requiredRows: number
    recommendedRows: number
    optionalRows: number
    architectureBlockingRows: number
    productClass: string
    intakeVerdict: string
    nextQuestionId: string | null
  }
  questions: BriefClarificationQuestion[]
}

export function buildBriefClarificationPlan(
  dossier: ProductDossier,
  stageTrace: PipelineStageTrace[],
): BriefClarificationPlan {
  const intake = buildBriefIntakeGate(dossier, stageTrace)
  const questions: BriefClarificationQuestion[] = []
  const unknownClass = dossier.productClass === 'unknown'
  const noQuantifiedRequirements = dossier.brief.requirements.length === 0

  if (intake.verdict !== 'brief_ready_for_architecture') {
    if (unknownClass) {
      questions.push(question({
        kind: 'product_class',
        priority: 'blocker',
        status: 'required',
        gateArea: 'product_class_selection',
        question: 'What product class or closest supported hardware family should this project use?',
        why: 'The classifier could not choose a supported product class, so any generated architecture would be generic filler.',
        expectedAnswerFormat: 'One product family plus one sentence of intended use.',
        exampleAnswer: 'A 150 kW DC fast EV charger for depot charging.',
        blocksArchitecture: true,
        resolves: ['product_class_selection', 'scratch_design_support'],
      }))
    } else if (intake.summary.classificationConfidence !== 'high') {
      questions.push(question({
        kind: 'product_class',
        priority: 'major',
        status: 'recommended',
        gateArea: 'product_class_selection',
        question: `Can you confirm this should be treated as ${dossier.productClass}?`,
        why: 'The classifier found a class, but confidence is low or medium.',
        expectedAnswerFormat: 'Yes, or name the intended product class.',
        exampleAnswer: `Yes, treat it as ${dossier.productClass}.`,
        blocksArchitecture: false,
        resolves: ['product_class_selection'],
      }))
    }

    if (noQuantifiedRequirements || intake.summary.extractedRequirements < 2) {
      questions.push(question({
        kind: 'target_metrics',
        priority: unknownClass ? 'blocker' : 'major',
        status: unknownClass ? 'required' : 'recommended',
        gateArea: 'requirement_quantification',
        question: 'What are the top two or three quantified performance targets?',
        why: 'The scratch architecture needs numeric anchors to avoid becoming assumption-heavy.',
        expectedAnswerFormat: 'Metric name, value and unit for each target.',
        exampleAnswer: exampleTargetsFor(dossier.productClass),
        blocksArchitecture: unknownClass,
        resolves: ['requirement_quantification', 'requirement_trace_seed'],
      }))
      questions.push(question({
        kind: 'operating_envelope',
        priority: unknownClass ? 'blocker' : 'major',
        status: unknownClass ? 'required' : 'recommended',
        gateArea: 'requirement_quantification',
        question: 'What operating envelope should the design satisfy?',
        why: 'Envelope requirements drive module sizing, interfaces, safety protection and later BoM scope.',
        expectedAnswerFormat: 'A short list of dimensions, duty cycle, environment, runtime, capacity or output constraints.',
        exampleAnswer: exampleEnvelopeFor(dossier.productClass),
        blocksArchitecture: unknownClass,
        resolves: ['requirement_quantification', 'assumption_boundary'],
      }))
    }

    if (intake.summary.briefCharacters < 24) {
      questions.push(question({
        kind: 'assumption_boundary',
        priority: 'major',
        status: 'recommended',
        gateArea: 'brief_text',
        question: 'Can you expand the brief with the intended user, use case and design boundary?',
        why: 'A very short brief leaves the compiler guessing what is inside or outside scope.',
        expectedAnswerFormat: 'One paragraph naming the user, deployment context, and explicit exclusions.',
        exampleAnswer: 'Design only the outdoor charger cabinet and power electronics; exclude civil works and grid transformer.',
        blocksArchitecture: false,
        resolves: ['brief_text', 'assumption_boundary'],
      }))
    }

    if (!unknownClass) {
      questions.push(question({
        kind: 'interfaces_and_integration',
        priority: 'major',
        status: 'recommended',
        gateArea: 'requirement_trace_seed',
        question: 'What external systems, users or infrastructure must this design interface with?',
        why: 'External interfaces shape module boundaries and prevent missing integration modules.',
        expectedAnswerFormat: 'List each external interface and any protocol, voltage, fluid, data or mechanical constraint.',
        exampleAnswer: exampleInterfacesFor(dossier.productClass),
        blocksArchitecture: false,
        resolves: ['requirement_trace_seed', 'scratch_design_support'],
      }))
      questions.push(question({
        kind: 'compliance_and_risk',
        priority: 'minor',
        status: 'optional',
        gateArea: 'assumption_boundary',
        question: 'Are there named standards, hazards or certification targets that must be treated as in-scope?',
        why: 'Regulatory and hazard assumptions should be explicit before reviewer evidence or sourcing work starts.',
        expectedAnswerFormat: 'Named standard, jurisdiction, hazard or certification target.',
        exampleAnswer: exampleComplianceFor(dossier.productClass),
        blocksArchitecture: false,
        resolves: ['assumption_boundary'],
      }))
    }
  }

  const uniqueQuestions = deduplicate(questions).map((row, index) => ({ ...row, sequence: index + 1, id: `${row.kind}:${index + 1}` }))
  const requiredRows = uniqueQuestions.filter(row => row.status === 'required').length
  const recommendedRows = uniqueQuestions.filter(row => row.status === 'recommended').length
  const optionalRows = uniqueQuestions.filter(row => row.status === 'optional').length
  const architectureBlockingRows = uniqueQuestions.filter(row => row.blocksArchitecture).length
  const verdict: BriefClarificationVerdict = requiredRows > 0 || architectureBlockingRows > 0
    ? 'clarification_required'
    : uniqueQuestions.length > 0 ? 'clarification_recommended' : 'no_clarification_needed'

  return {
    verdict,
    summary: {
      rows: uniqueQuestions.length,
      requiredRows,
      recommendedRows,
      optionalRows,
      architectureBlockingRows,
      productClass: dossier.productClass,
      intakeVerdict: intake.verdict,
      nextQuestionId: uniqueQuestions.find(row => row.status === 'required')?.id ?? uniqueQuestions[0]?.id ?? null,
    },
    questions: uniqueQuestions,
  }
}

export function renderBriefClarificationPlanCsv(plan: BriefClarificationPlan): string {
  const header = [
    'id',
    'sequence',
    'kind',
    'priority',
    'status',
    'gateArea',
    'question',
    'why',
    'expectedAnswerFormat',
    'exampleAnswer',
    'blocksArchitecture',
    'resolves',
  ]
  const rows = plan.questions.map(row => [
    row.id,
    String(row.sequence),
    row.kind,
    row.priority,
    row.status,
    row.gateArea,
    row.question,
    row.why,
    row.expectedAnswerFormat,
    row.exampleAnswer,
    row.blocksArchitecture ? 'yes' : 'no',
    row.resolves.join('; '),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function question(args: Omit<BriefClarificationQuestion, 'id' | 'sequence'>): BriefClarificationQuestion {
  return { ...args, id: '', sequence: 0 }
}

function deduplicate(questions: BriefClarificationQuestion[]): BriefClarificationQuestion[] {
  const seen = new Set<string>()
  const rows: BriefClarificationQuestion[] = []
  for (const row of questions) {
    const key = `${row.kind}:${row.question}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }
  return rows
}

function exampleTargetsFor(productClass: string): string {
  if (productClass === 'energy_storage') return '3.5 MWh usable capacity, 1 MW discharge power, 28 tonne gross mass limit.'
  if (productClass === 'ev_charger') return '150 kW DC output, CCS2 connector, 95% charger efficiency.'
  if (productClass === 'drone') return '40 minute flight endurance, 4K payload, 2 kg maximum take-off mass.'
  if (productClass === 'heat_pump') return '8 kW thermal output, COP 3.5 at A7/W35, R290 refrigerant.'
  if (productClass === 'cgm') return '14 day wear, 5 minute readings, MARD 9%.'
  return 'Target output, capacity or throughput; runtime or duty cycle; size, mass or cost constraint.'
}

function exampleEnvelopeFor(productClass: string): string {
  if (productClass === 'energy_storage') return 'Outdoor container, -20 to 45 C ambient, grid-connected, 1C max discharge.'
  if (productClass === 'ev_charger') return 'Outdoor cabinet, 400 VAC input, depot environment, continuous 150 kW service.'
  if (productClass === 'drone') return 'Outdoor wind tolerance, 40 minute mission, removable battery, transportable case.'
  if (productClass === 'heat_pump') return 'Outdoor monobloc, 35 C flow temperature, UK domestic hydronic loop.'
  if (productClass === 'cgm') return 'Skin-worn disposable patch, shower resistant, 14 day wear, BLE phone link.'
  return 'Dimensions, deployment environment, runtime/duty cycle, electrical/fluid/data boundaries.'
}

function exampleInterfacesFor(productClass: string): string {
  if (productClass === 'energy_storage') return 'Grid AC terminals, EMS/SCADA, fire alarm, HVAC exhaust and service access.'
  if (productClass === 'ev_charger') return 'Grid input, vehicle CCS2, OCPP backend, MID meter and emergency stop loop.'
  if (productClass === 'drone') return 'Remote controller, GPS, camera gimbal, battery charger and payload mount.'
  if (productClass === 'heat_pump') return 'Hydronic flow/return, mains supply, thermostat, condensate drain and service port.'
  if (productClass === 'cgm') return 'Skin interface, BLE app, sterile applicator, charging/programming fixture if reusable.'
  return 'Power, data, mechanical, thermal, fluid, user and service interfaces.'
}

function exampleComplianceFor(productClass: string): string {
  if (productClass === 'energy_storage') return 'IEC 62933, UL 9540A-style fire propagation evidence, local grid code.'
  if (productClass === 'ev_charger') return 'IEC 61851, ISO 15118, MID metering, outdoor IP rating.'
  if (productClass === 'drone') return 'Open category mass limits, radio approvals, battery transport requirements.'
  if (productClass === 'heat_pump') return 'Pressure equipment, refrigerant charge limits, electrical safety and acoustic limits.'
  if (productClass === 'cgm') return 'ISO 10993 biocompatibility, sterile barrier validation, medical device quality system.'
  return 'Relevant standards, jurisdiction, safety hazards and certification target.'
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
