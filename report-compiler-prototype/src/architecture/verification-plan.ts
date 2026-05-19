import { buildInterfaceContractMatrix } from './interface-contracts'
import { buildModuleReview } from './module-review'
import type { ArchitectureReadiness, ProductDossier, SectionIssue, VerificationEvidenceKind } from '../schema/types'

export type { VerificationEvidenceKind } from '../schema/types'

export type VerificationStatus = 'ready_for_review' | 'open' | 'blocked'

export interface VerificationActivity {
  id: string
  moduleId: string
  moduleName: string
  activity: string
  evidenceKind: VerificationEvidenceKind
  status: VerificationStatus
  requirementIds: string[]
  sanityCheckIds: string[]
  interfaceIds: string[]
  componentWordIds: string[]
  rationale: string
  acceptanceCriteria: string[]
  blockers: string[]
}

export interface EngineeringVerificationPlan {
  summary: {
    activities: number
    readyForReview: number
    open: number
    blocked: number
    designReviewActivities: number
    calculationActivities: number
    interfaceReviewActivities: number
    sourceEvidenceActivities: number
    complianceReviewActivities: number
  }
  activities: VerificationActivity[]
}

export function buildEngineeringVerificationPlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): EngineeringVerificationPlan {
  const moduleReview = buildModuleReview(dossier, readiness, issues)
  const interfaceContracts = buildInterfaceContractMatrix(dossier, readiness)
  const activities: VerificationActivity[] = []

  for (const module of dossier.architecture.modules) {
    const review = moduleReview.modules.find(row => row.moduleId === module.id)
    const componentWordIds = module.subModules.flatMap(subModule => subModule.words.map(word => word.id))
    activities.push({
      id: `design_review:${module.id}`,
      moduleId: module.id,
      moduleName: module.displayName,
      activity: `Review ${module.displayName} architecture allocation`,
      evidenceKind: 'design_review',
      status: review?.status === 'attention' ? 'blocked' : 'ready_for_review',
      requirementIds: review?.requirementIds ?? [],
      sanityCheckIds: review?.sanityCheckIds ?? [],
      interfaceIds: Array.from(new Set([...module.interfaces, ...module.subModules.flatMap(subModule => subModule.interfaces)])),
      componentWordIds,
      rationale: 'Confirm the module has a coherent purpose, submodule breakdown, interfaces and component allocation before any procurement work.',
      acceptanceCriteria: [
        'Every submodule has a stated purpose and at least one component candidate.',
        'Interfaces named on the module are carried by the responsible submodule where the design depends on that interface.',
        'No blocker or major architecture issue is attached to the module.',
      ],
      blockers: review?.status === 'attention' ? review.issueCodes : [],
    })

    if ((review?.requirementIds.length ?? 0) > 0 || (review?.sanityCheckIds.length ?? 0) > 0) {
      const checks = dossier.feasibility.engineeringSanityChecks.filter(check => review?.sanityCheckIds.includes(check.id))
      const failingChecks = checks.filter(check => check.status === 'fail')
      const warningChecks = checks.filter(check => check.status === 'warn')
      activities.push({
        id: `calculation:${module.id}`,
        moduleId: module.id,
        moduleName: module.displayName,
        activity: `Verify ${module.displayName} requirement calculations`,
        evidenceKind: 'calculation',
        status: failingChecks.length > 0 ? 'blocked' : warningChecks.length > 0 ? 'open' : 'ready_for_review',
        requirementIds: review?.requirementIds ?? [],
        sanityCheckIds: review?.sanityCheckIds ?? [],
        interfaceIds: [],
        componentWordIds: [],
        rationale: 'Tie parsed brief requirements to explicit engineering calculations or sanity checks before accepting the design envelope.',
        acceptanceCriteria: [
          'Each linked requirement has a calculation, sanity check or clearly stated deferred validation path.',
          'No linked sanity check is failing.',
          'Warnings have named follow-up calculations or test evidence.',
        ],
        blockers: [
          ...failingChecks.map(check => `${check.id}: ${check.interpretation}`),
          ...warningChecks.map(check => `${check.id}: ${check.interpretation}`),
        ],
      })
    }

    if ((review?.criticalUnpricedLines.length ?? 0) > 0) {
      activities.push({
        id: `source_evidence:${module.id}`,
        moduleId: module.id,
        moduleName: module.displayName,
        activity: `Collect source-backed evidence for ${module.displayName} critical components`,
        evidenceKind: 'source_evidence',
        status: 'blocked',
        requirementIds: review?.requirementIds ?? [],
        sanityCheckIds: [],
        interfaceIds: [],
        componentWordIds: review?.criticalUnpricedLines ?? [],
        rationale: 'Critical component candidates may support architecture review, but BoM cost/manufacturer/MPN claims are blocked until source-backed evidence is admitted.',
        acceptanceCriteria: [
          'Supplier name, manufacturer or equivalent, MPN where applicable, unit cost and source URL/reference are present.',
          'Evidence is explicitly retrieved and admissible under the sourcing admission protocol.',
          'Claimed quantity and component identity match the architecture candidate line.',
        ],
        blockers: review?.criticalUnpricedLines ?? [],
      })
    }
  }

  for (const contract of interfaceContracts.requiredContracts) {
    const componentWordIds = [
      ...contract.from.carrierSubModules.flatMap(subModule => subModule.componentWordIds),
      ...contract.to.carrierSubModules.flatMap(subModule => subModule.componentWordIds),
    ]
    const missingCarriers = [
      contract.from.carrierSubModules.length === 0 ? contract.from.moduleName : undefined,
      contract.to.carrierSubModules.length === 0 ? contract.to.moduleName : undefined,
    ].filter(Boolean)
    activities.push({
      id: `interface_review:${contract.from.moduleId}:${contract.to.moduleId}:${contract.interfaceId}`,
      moduleId: `${contract.from.moduleId}:${contract.to.moduleId}`,
      moduleName: `${contract.from.moduleName} -> ${contract.to.moduleName}`,
      activity: `Verify ${contract.interfaceId} interface contract`,
      evidenceKind: 'interface_review',
      status: contract.status === 'missing' ? 'blocked' : missingCarriers.length > 0 ? 'open' : 'ready_for_review',
      requirementIds: [],
      sanityCheckIds: [],
      interfaceIds: [contract.interfaceId],
      componentWordIds,
      rationale: contract.engineeringReason,
      acceptanceCriteria: [
        'Both endpoint modules declare the interface.',
        'At least one submodule carrier is named on each endpoint.',
        'Electrical, thermal, fluid, mechanical or data capacity is validated by the next detailed design pass.',
      ],
      blockers: contract.status === 'missing' ? contract.notes : missingCarriers.map(name => `No submodule carrier on ${name}.`),
    })
  }

  for (const standard of dossier.regulatory.standards) {
    activities.push({
      id: `compliance_review:${standard.id}`,
      moduleId: 'system_compliance',
      moduleName: 'System Compliance',
      activity: `Plan evidence for ${standard.id}`,
      evidenceKind: 'compliance_review',
      status: 'open',
      requirementIds: [],
      sanityCheckIds: [],
      interfaceIds: [],
      componentWordIds: [],
      rationale: standard.title,
      acceptanceCriteria: [standard.evidenceRequired],
      blockers: ['Compliance evidence not yet collected in scratch prototype.'],
    })
  }

  for (const [index, risk] of dossier.risks.fmea.entries()) {
    activities.push({
      id: `risk_review:${index + 1}`,
      moduleId: 'system_risk',
      moduleName: 'System Risk Register',
      activity: `Review risk control for ${risk.hazard}`,
      evidenceKind: 'compliance_review',
      status: 'open',
      requirementIds: [],
      sanityCheckIds: [],
      interfaceIds: [],
      componentWordIds: [],
      rationale: `Provisional RPN ${risk.severity * risk.occurrence * risk.detection}; mitigation: ${risk.mitigation}`,
      acceptanceCriteria: [
        'Severity, occurrence and detection ratings have been reviewed by a domain owner.',
        'Mitigation is accepted, corrected or converted into a design action.',
        'Any residual high-risk item has an owner before publication.',
      ],
      blockers: ['Risk evidence not yet reviewed in scratch prototype.'],
    })
  }

  return {
    summary: {
      activities: activities.length,
      readyForReview: activities.filter(activity => activity.status === 'ready_for_review').length,
      open: activities.filter(activity => activity.status === 'open').length,
      blocked: activities.filter(activity => activity.status === 'blocked').length,
      designReviewActivities: activities.filter(activity => activity.evidenceKind === 'design_review').length,
      calculationActivities: activities.filter(activity => activity.evidenceKind === 'calculation').length,
      interfaceReviewActivities: activities.filter(activity => activity.evidenceKind === 'interface_review').length,
      sourceEvidenceActivities: activities.filter(activity => activity.evidenceKind === 'source_evidence').length,
      complianceReviewActivities: activities.filter(activity => activity.evidenceKind === 'compliance_review').length,
    },
    activities,
  }
}
