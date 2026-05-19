import { getClassPack, type HeadlineMetricTemplate, type RequiredPartSpec } from '../class-packs'
import { buildScratchArchitecture, isScratchArchitectureSupported } from '../scratch/universal-modules'
import { admitSourcingEvidence } from '../sourcing/admission'
import { buildEngineeringSanityChecks } from '../validators/engineering-sanity'
import { buildRequirementTrace } from '../validators/requirement-trace'
import type {
  ArchitectureModel,
  BomLine,
  BomModel,
  ComponentWord,
  CostModel,
  FeasibilityModel,
  ProductClass,
  ProductDossier,
  ProvenanceRef,
  ReportInput,
  RiskModel,
  SourcingModel,
  RegulatoryModel,
  SourceLedger,
  KeyMetric,
} from '../schema/types'
import type { ParsedBrief } from './parse-brief'

const classPackRef = (productClass: ProductClass): ProvenanceRef => ({ kind: 'class_pack', ref: `${productClass}.class_pack` })
const formulaRef = (ref: string): ProvenanceRef => ({ kind: 'formula', ref })
const assumptionRef = (ref: string): ProvenanceRef => ({ kind: 'assumption', ref })

export function buildInitialDossier(input: ReportInput, productClass: ProductClass, parsed: ParsedBrief): ProductDossier {
  const pack = getClassPack(productClass)
  const provenance = classPackRef(productClass)
  const useScratchArchitecture = isScratchArchitectureSupported(productClass)
  const architecture = useScratchArchitecture
    ? buildScratchArchitecture(productClass, parsed)
    : buildArchitecture(productClass, pack.modules, pack.requiredParts)
  const baseBom = useScratchArchitecture
    ? buildBomFromArchitecture(productClass, architecture)
    : buildBom(productClass, pack.requiredParts)
  const sourcingAdmission = admitSourcingEvidence(baseBom, input.sourcingEvidence ?? [])
  const bom = sourcingAdmission.bom
  const cost = buildCost(productClass, bom)
  const keyMetrics = buildKeyMetrics(pack.headlineMetric, parsed, cost, productClass)
  const sourcing = buildSourcing(bom)
  const engineeringSanityChecks = buildEngineeringSanityChecks(productClass, parsed, architecture)
  const requirementTrace = buildRequirementTrace(productClass, parsed, architecture, keyMetrics, engineeringSanityChecks)
  const regulatory: RegulatoryModel = {
    standards: pack.standards.map(s => ({ ...s, provenance: [provenance] })),
  }
  const risks: RiskModel = { fmea: pack.risks }
  const feasibility = buildFeasibility(cost, engineeringSanityChecks, pack.benchmark)
  const sources: SourceLedger = {
    refs: [
      { kind: 'brief', ref: 'input.brief' },
      provenance,
      formulaRef('capex=sum(bom.totalCostGbp)'),
      assumptionRef('class-pack defaults may supply missing quantities; supplier prices are blocked until source-backed evidence is admitted'),
      ...sourcingAdmission.admitted.map(record => record.evidence),
      ...pack.standards.map(s => ({ kind: 'class_pack' as const, ref: `${productClass}.standards.${s.id}` })),
    ],
    sourcingEvidence: sourcingAdmission.admitted,
    verificationEvidence: input.verificationEvidence ?? [],
  }
  return {
    id: input.id,
    productClass,
    brief: parsed.brief,
    requirementTrace,
    keyMetrics,
    architecture,
    bom,
    cost,
    sourcing: { ...sourcing, admission: buildSourcingAdmission(bom, sourcingAdmission.rejected) },
    regulatory,
    risks,
    feasibility,
    sources,
    audit: [{ timestamp: new Date(0).toISOString(), stage: 'build_initial_dossier', message: `Built from scratch universal architecture grammar for ${productClass}; supplier pricing remains unverified.` }],
  }
}

function buildKeyMetrics(template: HeadlineMetricTemplate, parsed: ParsedBrief, cost: CostModel, productClass: ProductClass): KeyMetric[] {
  let value = template.defaultValue
  let formula = 'class_pack_default'
  let inputs: Record<string, number> | undefined
  if (productClass === 'energy_storage' && parsed.numericFacts.capacity_mwh) {
    const efficiency = 1
    const cycles_per_year = 365
    value = parsed.numericFacts.capacity_mwh * cycles_per_year * efficiency
    formula = 'capacity_mwh * cycles_per_year * efficiency'
    inputs = { capacity_mwh: parsed.numericFacts.capacity_mwh, cycles_per_year, efficiency }
  }
  if (productClass === 'drone' && parsed.numericFacts.duration_minutes) {
    value = parsed.numericFacts.duration_minutes
    formula = 'duration_minutes'
    inputs = { duration_minutes: parsed.numericFacts.duration_minutes }
  }
  if (productClass === 'heat_pump' && parsed.numericFacts.thermal_output_kw) {
    const annualFullLoadHours = 2000
    value = Math.round(parsed.numericFacts.thermal_output_kw * annualFullLoadHours)
    formula = 'thermal_output_kw * annual_full_load_hours'
    inputs = { thermal_output_kw: parsed.numericFacts.thermal_output_kw, annual_full_load_hours: annualFullLoadHours }
  }
  if (productClass === 'ev_charger' && parsed.numericFacts.dc_power_kw) {
    const equivalentFullPowerHoursPerDay = 4
    const daysPerYear = 365
    value = Math.round(parsed.numericFacts.dc_power_kw * equivalentFullPowerHoursPerDay * daysPerYear)
    formula = 'dc_power_kw * equivalent_full_power_hours_per_day * days_per_year'
    inputs = {
      dc_power_kw: parsed.numericFacts.dc_power_kw,
      equivalent_full_power_hours_per_day: equivalentFullPowerHoursPerDay,
      days_per_year: daysPerYear,
    }
  }
  if (productClass === 'bioreactor' && parsed.numericFacts.working_volume_l) {
    const batchesPerYear = 40
    value = Math.round(parsed.numericFacts.working_volume_l * batchesPerYear)
    formula = 'working_volume_l * batches_per_year'
    inputs = { working_volume_l: parsed.numericFacts.working_volume_l, batches_per_year: batchesPerYear }
  }
  if (productClass === 'auv' && parsed.numericFacts.endurance_hours) {
    value = parsed.numericFacts.endurance_hours
    formula = 'endurance_hours'
    inputs = { endurance_hours: parsed.numericFacts.endurance_hours }
  }
  if (productClass === 'edge_ai' && parsed.numericFacts.compute_tops) {
    value = parsed.numericFacts.compute_tops
    formula = 'compute_tops'
    inputs = { compute_tops: parsed.numericFacts.compute_tops }
  }
  if (productClass === 'haps' && parsed.numericFacts.endurance_days) {
    value = parsed.numericFacts.endurance_days
    formula = 'endurance_days'
    inputs = { endurance_days: parsed.numericFacts.endurance_days }
  }
  if (productClass === 'cgm' && parsed.numericFacts.wear_days) {
    value = parsed.numericFacts.wear_days
    formula = 'wear_days'
    inputs = { wear_days: parsed.numericFacts.wear_days }
  }
  return [
    {
      id: 'headline_output',
      label: template.label,
      value,
      unit: template.unit,
      formula,
      inputs,
      notes: template.notes,
      provenance: [classPackRef(productClass), formulaRef(formula)],
      confidence: inputs ? 'medium' : 'low',
    },
    {
      id: 'capex_gbp',
      label: 'Estimated CAPEX',
      value: cost.capexGbp,
      unit: 'GBP',
      notes: cost.capexGbp === 0
        ? 'No CAPEX claim admitted yet; supplier-backed BoM evidence is required before costs appear.'
        : 'Summed only from admitted source-backed BoM lines.',
      provenance: [formulaRef('capex=sum(bom.totalCostGbp)'), classPackRef(productClass)],
      confidence: 'low',
    },
    {
      id: 'opex_annual_gbp',
      label: 'Estimated annual OPEX',
      value: cost.opexAnnualGbp,
      unit: 'GBP/year',
      notes: cost.capexGbp === 0
        ? 'No OPEX claim admitted yet because CAPEX has no sourced BoM basis.'
        : 'Early estimate set at 4% of sourced CAPEX until supplier/service data is available.',
      provenance: [formulaRef('opex=capex*0.04')],
      confidence: 'low',
    },
  ]
}

function buildArchitecture(productClass: ProductClass, templates: ReturnType<typeof getClassPack>['modules'], parts: RequiredPartSpec[]): ArchitectureModel {
  const byLabel = new Map(parts.map(part => [part.label, part]))
  return {
    modules: templates.map(module => ({
      id: module.id,
      displayName: module.displayName,
      purpose: module.purpose,
      interfaces: module.interfaces,
      subModules: module.subModules.map(sub => ({
        id: sub.id,
        name: sub.name,
        purpose: sub.purpose,
        interfaces: sub.interfaces,
        words: sub.partLabels.flatMap(label => {
          const part = byLabel.get(label)
          return part ? [componentWordFromPart(productClass, part)] : []
        }),
      })),
    })),
    crossModuleInterfaces: Array.from(new Set(templates.flatMap(module => module.interfaces))),
  }
}

function componentWordFromPart(productClass: ProductClass, part: RequiredPartSpec): ComponentWord {
  return {
    id: normaliseId(part.label),
    name: part.label,
    quantity: { value: part.qty, unit: part.unit, provenance: [classPackRef(productClass)] },
    role: part.role,
    sourceGrade: 'estimate',
    provenance: [classPackRef(productClass)],
  }
}

function buildBom(productClass: ProductClass, parts: RequiredPartSpec[]): BomModel {
  const lines: BomLine[] = parts.map(part => ({
    id: normaliseId(part.label),
    componentWordId: normaliseId(part.label),
    description: part.label,
    quantity: { value: part.qty, unit: part.unit, provenance: [classPackRef(productClass)] },
    unitCostGbp: null,
    totalCostGbp: null,
    sourceGrade: 'assumption',
    provenance: [classPackRef(productClass)],
    critical: part.critical,
  }))
  return {
    lines,
    totalCostGbp: 0,
    coverage: {
      requiredPartsPresent: parts.length,
      requiredPartsTotal: parts.length,
      pricedLines: 0,
      totalLines: lines.length,
    },
  }
}

function buildBomFromArchitecture(productClass: ProductClass, architecture: ArchitectureModel): BomModel {
  const provenance = scratchArchitectureRef(productClass)
  const criticalIds = new Set(getClassPack(productClass).requiredParts.filter(part => part.critical).map(part => normaliseId(part.label)))
  const lines: BomLine[] = architecture.modules.flatMap(module =>
    module.subModules.flatMap(subModule =>
      subModule.words.map(word => ({
        id: `${module.id}_${subModule.id}_${word.id}`,
        componentWordId: word.id,
        description: word.name,
        quantity: { ...word.quantity, provenance: [provenance] },
        unitCostGbp: null,
        totalCostGbp: null,
        sourceGrade: 'assumption' as const,
        provenance: [provenance],
        critical: criticalIds.has(word.id),
      })),
    ),
  )
  return {
    lines,
    totalCostGbp: 0,
    coverage: {
      requiredPartsPresent: lines.length,
      requiredPartsTotal: lines.length,
      pricedLines: 0,
      totalLines: lines.length,
    },
  }
}

function buildCost(productClass: ProductClass, bom: BomModel): CostModel {
  const pack = getClassPack(productClass)
  const capex = bom.totalCostGbp
  return {
    capexGbp: capex,
    opexAnnualGbp: Math.round(capex * 0.04),
    nreGbp: Math.round(Math.max(25000, capex * 0.2)),
    benchmarkGbp: pack.benchmark ? { low: pack.benchmark.lowGbp, high: pack.benchmark.highGbp, source: classPackRef(productClass) } : undefined,
    sensitivity: bom.lines
      .slice()
      .sort((a, b) => (b.totalCostGbp ?? 0) - (a.totalCostGbp ?? 0))
      .slice(0, 3)
      .map(line => ({ driver: line.description, deltaPct: 10, impactGbp: Math.round((line.totalCostGbp ?? 0) * 0.1) })),
  }
}

function buildSourcing(bom: BomModel): SourcingModel {
  const spend = new Map<string, number>()
  for (const line of bom.lines) {
    if (!line.supplier || line.totalCostGbp === null) continue
    spend.set(line.supplier, (spend.get(line.supplier) ?? 0) + line.totalCostGbp)
  }
  return {
    primarySuppliers: Array.from(spend.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, supplierSpend]) => ({ name, spendGbp: supplierSpend, risk: 'medium' })),
    singleSourceRisks: bom.lines.filter(line => line.critical && line.supplier).map(line => `${line.description} currently has one suggested supplier path.`),
    fallbackSuppliers: ['RS Components', 'Farnell', 'Digi-Key', 'Authorised reseller search'],
    admission: buildSourcingAdmission(bom, []),
  }
}

function buildSourcingAdmission(bom: BomModel, rejectedRecords: Array<{ componentWordId: string; reason: string }>): SourcingModel['admission'] {
  const admittedLines = bom.lines.filter(line => line.unitCostGbp !== null).length
  const unpricedLines = bom.lines.length - admittedLines
  const unpricedCriticalLines = bom.lines.filter(line => line.critical && line.unitCostGbp === null).length
  const status = admittedLines === 0 ? 'not_started' : unpricedLines === 0 ? 'complete' : 'partial'
  return {
    status,
    candidateLines: bom.lines.length,
    admittedLines,
    unpricedLines,
    unpricedCriticalLines,
    rejectedRecords,
  }
}

function buildFeasibility(
  cost: CostModel,
  engineeringSanityChecks: FeasibilityModel['engineeringSanityChecks'],
  benchmark?: { lowGbp: number; highGbp: number; basis: string },
): FeasibilityModel {
  const warnings: string[] = []
  if (benchmark && cost.capexGbp < benchmark.lowGbp) warnings.push(`CAPEX is below class benchmark (${benchmark.basis}); validate missing scope before claiming affordability.`)
  if (benchmark && cost.capexGbp > benchmark.highGbp) warnings.push(`CAPEX exceeds class benchmark (${benchmark.basis}); cost-down plan required.`)
  for (const sanity of engineeringSanityChecks) {
    if (sanity.status === 'warn') warnings.push(`${sanity.label}: ${sanity.interpretation}`)
  }
  const blockers = engineeringSanityChecks
    .filter(sanity => sanity.status === 'fail')
    .map(sanity => `${sanity.label}: ${sanity.interpretation}`)
  return {
    verdict: blockers.length > 0 ? 'not_feasible' : warnings.length ? 'conditional' : 'feasible',
    blockers,
    warnings,
    mitigationPlan: [
      ...blockers.map(() => 'Revise architecture or brief assumptions, then rerun engineering sanity checks.'),
      ...warnings.map(() => 'Run class-specific engineering review and supplier evidence collection before procurement decisions.'),
    ],
    engineeringSanityChecks,
  }
}

function normaliseId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function scratchArchitectureRef(productClass: ProductClass): ProvenanceRef {
  return { kind: 'model', ref: `scratch_universal_architecture.${productClass}` }
}
