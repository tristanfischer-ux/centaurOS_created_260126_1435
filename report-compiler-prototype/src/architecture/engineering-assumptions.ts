import type { ArchitectureReadiness, ProductDossier } from '../schema/types'

export type EngineeringAssumptionCategory =
  | 'brief_requirement'
  | 'derived_metric'
  | 'sanity_envelope'
  | 'interface_closure'
  | 'critical_component'
  | 'compliance_evidence'

export type EngineeringAssumptionStatus =
  | 'brief_supported'
  | 'model_present'
  | 'review_required'
  | 'source_required'
  | 'blocked'

export interface EngineeringAssumptionRow {
  id: string
  category: EngineeringAssumptionCategory
  status: EngineeringAssumptionStatus
  scope: string
  assumption: string
  basis: string
  evidenceRequired: string
  linkedRequirements: string[]
  linkedInterfaces: string[]
  linkedComponents: string[]
  blocksArchitecture: boolean
  blocksBom: boolean
}

export interface EngineeringAssumptionLedger {
  summary: {
    rows: number
    briefSupported: number
    modelPresent: number
    reviewRequired: number
    sourceRequired: number
    blocked: number
    architectureBlockers: number
    bomBlockers: number
  }
  rows: EngineeringAssumptionRow[]
}

export function buildEngineeringAssumptionLedger(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
): EngineeringAssumptionLedger {
  const rows: EngineeringAssumptionRow[] = [
    ...briefRequirementRows(dossier),
    ...derivedMetricRows(dossier),
    ...sanityRows(dossier),
    ...interfaceRows(readiness),
    ...criticalComponentRows(dossier),
    ...complianceRows(dossier),
  ]

  return {
    summary: {
      rows: rows.length,
      briefSupported: rows.filter(row => row.status === 'brief_supported').length,
      modelPresent: rows.filter(row => row.status === 'model_present').length,
      reviewRequired: rows.filter(row => row.status === 'review_required').length,
      sourceRequired: rows.filter(row => row.status === 'source_required').length,
      blocked: rows.filter(row => row.status === 'blocked').length,
      architectureBlockers: rows.filter(row => row.blocksArchitecture).length,
      bomBlockers: rows.filter(row => row.blocksBom).length,
    },
    rows,
  }
}

export function renderEngineeringAssumptionLedgerCsv(ledger: EngineeringAssumptionLedger): string {
  const header = [
    'id',
    'category',
    'status',
    'scope',
    'assumption',
    'basis',
    'evidenceRequired',
    'linkedRequirements',
    'linkedInterfaces',
    'linkedComponents',
    'blocksArchitecture',
    'blocksBom',
  ]
  const rows = ledger.rows.map(row => [
    row.id,
    row.category,
    row.status,
    row.scope,
    row.assumption,
    row.basis,
    row.evidenceRequired,
    row.linkedRequirements.join('; '),
    row.linkedInterfaces.join('; '),
    row.linkedComponents.join('; '),
    String(row.blocksArchitecture),
    String(row.blocksBom),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function briefRequirementRows(dossier: ProductDossier): EngineeringAssumptionRow[] {
  return dossier.brief.requirements.map(requirement => row({
    id: `brief:${requirement.id}`,
    category: 'brief_requirement',
    status: 'brief_supported',
    scope: requirement.label,
    assumption: `${requirement.label} = ${requirement.value}${requirement.unit ? ` ${requirement.unit}` : ''} is treated as a design input, not as independently verified truth.`,
    basis: requirement.source.ref,
    evidenceRequired: 'Confirm the requirement value, tolerance, duty cycle, environment and acceptance test with the project owner.',
    linkedRequirements: [requirement.id],
  }))
}

function derivedMetricRows(dossier: ProductDossier): EngineeringAssumptionRow[] {
  return dossier.keyMetrics.map(metric => {
    const isCostMetric = metric.id.includes('capex') || metric.id.includes('opex')
    const hasSourcedCost = dossier.cost.capexGbp > 0
    return row({
      id: `metric:${metric.id}`,
      category: 'derived_metric',
      status: isCostMetric && !hasSourcedCost ? 'source_required' : 'review_required',
      scope: metric.label,
      assumption: `${metric.label} uses ${metric.formula ?? 'an implicit model'} with ${metric.confidence} confidence.`,
      basis: metric.provenance.map(ref => `${ref.kind}:${ref.ref}`).join('; '),
      evidenceRequired: isCostMetric
        ? 'Admit source-backed BoM pricing before treating this cost metric as a claim.'
        : 'Review the formula, input values and operating envelope before treating this metric as a performance claim.',
      blocksBom: isCostMetric && !hasSourcedCost,
    })
  })
}

function sanityRows(dossier: ProductDossier): EngineeringAssumptionRow[] {
  return dossier.feasibility.engineeringSanityChecks.map(check => row({
    id: `sanity:${check.id}`,
    category: 'sanity_envelope',
    status: check.status === 'fail' ? 'blocked' : 'review_required',
    scope: check.label,
    assumption: `${check.label} currently evaluates as ${check.status} against ${check.expectedRange}.`,
    basis: check.provenance.map(ref => `${ref.kind}:${ref.ref}`).join('; '),
    evidenceRequired: check.status === 'fail'
      ? 'Revise the brief or architecture, then rerun engineering sanity checks.'
      : 'Supply an engineering calculation, reviewer note, test plan or datasheet-backed rationale for this envelope.',
    linkedRequirements: dossier.requirementTrace
      .filter(trace => trace.engineeringSanityCheckIds.includes(check.id))
      .map(trace => trace.requirementId),
    blocksArchitecture: check.status === 'fail',
  }))
}

function interfaceRows(readiness: ArchitectureReadiness): EngineeringAssumptionRow[] {
  return readiness.requiredInterfaceLinks.map(link => row({
    id: `interface:${link.fromModuleId}:${link.toModuleId}:${link.via}`,
    category: 'interface_closure',
    status: link.present ? 'model_present' : 'blocked',
    scope: `${link.fromModuleId} -> ${link.toModuleId}`,
    assumption: link.present
      ? `${link.via} is named on both endpoint modules in the generated architecture.`
      : `${link.via} is missing from one or both endpoint modules.`,
    basis: link.reason,
    evidenceRequired: 'Review the interface carrier, direction, capacity, safety margin and failure mode before detailed design or sourcing.',
    linkedInterfaces: [link.via],
    blocksArchitecture: !link.present,
  }))
}

function criticalComponentRows(dossier: ProductDossier): EngineeringAssumptionRow[] {
  return dossier.bom.lines
    .filter(line => line.critical)
    .map(line => row({
      id: `component:${line.id}`,
      category: 'critical_component',
      status: line.unitCostGbp === null ? 'source_required' : 'model_present',
      scope: line.description,
      assumption: `${line.description} is a critical architecture-derived component candidate with quantity ${line.quantity.value} ${line.quantity.unit}.`,
      basis: line.provenance.map(ref => `${ref.kind}:${ref.ref}`).join('; '),
      evidenceRequired: line.unitCostGbp === null
        ? 'Admit supplier, manufacturer, MPN where applicable, unit cost, lead time and evidence reference through sourcing intake.'
        : 'Review admitted source evidence and component identity before procurement.',
      linkedComponents: [line.componentWordId],
      blocksBom: line.unitCostGbp === null,
    }))
}

function complianceRows(dossier: ProductDossier): EngineeringAssumptionRow[] {
  return dossier.regulatory.standards.map(standard => row({
    id: `compliance:${standard.id}`,
    category: 'compliance_evidence',
    status: 'review_required',
    scope: standard.id,
    assumption: `${standard.title} is relevant to this product class in ${standard.jurisdiction}.`,
    basis: standard.provenance.map(ref => `${ref.kind}:${ref.ref}`).join('; '),
    evidenceRequired: standard.evidenceRequired,
  }))
}

function row(input: Omit<EngineeringAssumptionRow, 'linkedRequirements' | 'linkedInterfaces' | 'linkedComponents' | 'blocksArchitecture' | 'blocksBom'> & Partial<Pick<EngineeringAssumptionRow, 'linkedRequirements' | 'linkedInterfaces' | 'linkedComponents' | 'blocksArchitecture' | 'blocksBom'>>): EngineeringAssumptionRow {
  return {
    linkedRequirements: [],
    linkedInterfaces: [],
    linkedComponents: [],
    blocksArchitecture: false,
    blocksBom: false,
    ...input,
  }
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
