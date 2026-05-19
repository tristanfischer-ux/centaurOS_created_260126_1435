import type { PipelineStageTrace, ProductDossier } from '../schema/types'
import { isScratchArchitectureSupported } from '../scratch/universal-modules'

export type BriefIntakeVerdict =
  | 'brief_ready_for_architecture'
  | 'brief_intake_review_required'
  | 'brief_intake_blocked'
  | 'no_brief'

export type BriefIntakeArea =
  | 'brief_text'
  | 'requirement_quantification'
  | 'product_class_selection'
  | 'scratch_design_support'
  | 'requirement_trace_seed'
  | 'assumption_boundary'

export type BriefIntakeAreaVerdict = 'pass' | 'review' | 'blocked'

export interface BriefIntakeGateRow {
  area: BriefIntakeArea
  verdict: BriefIntakeAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface BriefIntakeGate {
  verdict: BriefIntakeVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    briefCharacters: number
    productClass: string
    classificationConfidence: string
    scratchArchitectureSupported: boolean
    extractedRequirements: number
    numericFacts: number
    coveredRequirements: number
    partialRequirements: number
    uncoveredRequirements: number
    assumptions: number
  }
  rows: BriefIntakeGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildBriefIntakeGate(
  dossier: ProductDossier,
  stageTrace: PipelineStageTrace[],
): BriefIntakeGate {
  const briefCharacters = dossier.brief.originalText.trim().length
  const classificationStage = stageTrace.find(stage => stage.id === 'product_class_selection')
  const parsingStage = stageTrace.find(stage => stage.id === 'brief_parsing')
  const classificationConfidence = String(classificationStage?.metrics.confidence ?? 'unknown')
  const numericFacts = Number(parsingStage?.metrics.numeric_fact_count ?? dossier.brief.requirements.length)
  const scratchArchitectureSupported = isScratchArchitectureSupported(dossier.productClass)
  const coveredRequirements = dossier.requirementTrace.filter(trace => trace.status === 'covered').length
  const partialRequirements = dossier.requirementTrace.filter(trace => trace.status === 'partial').length
  const uncoveredRequirements = dossier.requirementTrace.filter(trace => trace.status === 'uncovered').length
  const hasNoQuantifiedRequirements = dossier.brief.requirements.length === 0
  const unknownClass = dossier.productClass === 'unknown'

  const rows: BriefIntakeGateRow[] = [
    {
      area: 'brief_text',
      verdict: briefCharacters === 0 ? 'blocked' : briefCharacters < 24 ? 'review' : 'pass',
      signal: `${briefCharacters} non-whitespace character(s) in the source brief.`,
      passRatio: briefCharacters === 0 ? 0 : briefCharacters < 24 ? 0.5 : 1,
      blockers: briefCharacters === 0 ? ['Brief text is empty.'] : [],
      requiredAction: briefCharacters === 0
        ? 'Provide a project brief before classification or architecture generation.'
        : briefCharacters < 24
          ? 'Add product type, operating envelope, target metric and at least one quantified constraint.'
          : 'Brief text is present.',
    },
    {
      area: 'requirement_quantification',
      verdict: dossier.brief.requirements.length >= 2
        ? 'pass'
        : hasNoQuantifiedRequirements && unknownClass ? 'blocked' : 'review',
      signal: `${dossier.brief.requirements.length} quantified requirement(s), ${numericFacts} numeric fact(s).`,
      passRatio: Math.min(1, dossier.brief.requirements.length / 2),
      blockers: hasNoQuantifiedRequirements && unknownClass
        ? ['No quantified requirements were extracted and product class is unknown.']
        : [],
      requiredAction: dossier.brief.requirements.length >= 2
        ? 'Quantified requirements are sufficient for a first architecture pass.'
        : hasNoQuantifiedRequirements && unknownClass
          ? 'Request at least one quantified design constraint before generating architecture.'
          : 'Proceed only as assumption-heavy review; ask for more quantified requirements before treating outputs as stable.',
    },
    {
      area: 'product_class_selection',
      verdict: unknownClass
        ? 'blocked'
        : classificationConfidence === 'high' ? 'pass' : 'review',
      signal: `Selected ${dossier.productClass} with ${classificationConfidence} confidence.`,
      passRatio: unknownClass ? 0 : classificationConfidence === 'high' ? 1 : 0.5,
      blockers: unknownClass ? ['Classifier could not identify a supported product class.'] : [],
      requiredAction: unknownClass
        ? 'Ask for a more specific brief or add classifier/class-pack support before generating design content.'
        : classificationConfidence === 'high'
          ? 'Product class selection is strong enough for scratch architecture.'
          : 'Confirm product class before trusting generated architecture.',
    },
    {
      area: 'scratch_design_support',
      verdict: unknownClass
        ? 'blocked'
        : scratchArchitectureSupported ? 'pass' : 'review',
      signal: scratchArchitectureSupported
        ? `${dossier.productClass} has a deep scratch architecture grammar.`
        : `${dossier.productClass} does not yet have a deep scratch architecture grammar.`,
      passRatio: scratchArchitectureSupported ? 1 : 0,
      blockers: unknownClass ? ['Unknown product class has no scratch architecture grammar.'] : [],
      requiredAction: scratchArchitectureSupported
        ? 'Use scratch universal architecture flow for this brief.'
        : unknownClass
          ? 'Classify the project before architecture generation.'
          : 'Build or select a deep scratch grammar before claiming universal design coverage.',
    },
    {
      area: 'requirement_trace_seed',
      verdict: dossier.brief.requirements.length === 0
        ? 'review'
        : uncoveredRequirements > 0 ? 'blocked'
          : partialRequirements > 0 ? 'review' : 'pass',
      signal: `${coveredRequirements} covered, ${partialRequirements} partial, ${uncoveredRequirements} uncovered requirement trace row(s).`,
      passRatio: ratio(coveredRequirements + partialRequirements, Math.max(1, dossier.brief.requirements.length)),
      blockers: dossier.requirementTrace
        .filter(trace => trace.status === 'uncovered')
        .map(trace => `${trace.requirementId}: requirement has no architecture trace.`),
      requiredAction: dossier.brief.requirements.length === 0
        ? 'No requirement trace exists because no quantified requirement was extracted.'
        : uncoveredRequirements > 0
          ? 'Link every extracted requirement to modules, submodules, components or calculations before design review.'
          : partialRequirements > 0
            ? 'Improve partial requirement traces before treating the architecture as stable.'
            : 'Extracted requirements have trace seeds into the architecture.',
    },
    {
      area: 'assumption_boundary',
      verdict: hasNoQuantifiedRequirements ? 'review' : 'pass',
      signal: `${dossier.brief.assumptions.length} brief assumption note(s); no-quantified-default path: ${hasNoQuantifiedRequirements ? 'yes' : 'no'}.`,
      passRatio: hasNoQuantifiedRequirements ? 0.5 : 1,
      blockers: [],
      requiredAction: hasNoQuantifiedRequirements
        ? 'Keep all generated architecture as assumption-heavy until the brief is quantified.'
        : 'Assumption boundary is explicit enough for first-pass architecture.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: BriefIntakeVerdict = briefCharacters === 0
    ? 'no_brief'
    : blockedRows.length > 0
      ? 'brief_intake_blocked'
      : reviewRows.length > 0 ? 'brief_intake_review_required' : 'brief_ready_for_architecture'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      briefCharacters,
      productClass: dossier.productClass,
      classificationConfidence,
      scratchArchitectureSupported,
      extractedRequirements: dossier.brief.requirements.length,
      numericFacts,
      coveredRequirements,
      partialRequirements,
      uncoveredRequirements,
      assumptions: dossier.brief.assumptions.length,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderBriefIntakeGateCsv(gate: BriefIntakeGate): string {
  const header = [
    'area',
    'verdict',
    'signal',
    'passRatio',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.area,
    row.verdict,
    row.signal,
    String(row.passRatio),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
