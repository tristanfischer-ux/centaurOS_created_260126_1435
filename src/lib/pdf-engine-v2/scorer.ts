/**
 * @file scorer.ts — Deterministic section quality scorer
 *
 * Evaluates each section of the pipeline output and assigns a score 1-10.
 * No LLM involved — pure data quality checks against the PipelineState.
 */

import type { PipelineState, SectionScore } from './types'

function score(section: string, score: number, reasons: string[], suggestions: string[]): SectionScore {
  return { section, score: Math.max(1, Math.min(10, score)), reasons, suggestions }
}

function countChars(s: string | null | undefined): number {
  return (s || '').length
}

function hasContent(s: string | null | undefined, minLen = 10): boolean {
  return countChars(s) >= minLen
}

/** Score all sections and return SectionScore array */
export function scoreAllSections(state: PipelineState): SectionScore[] {
  return [
    scoreBrief(state),
    scoreRegulatory(state),
    scoreSizing(state),
    scoreModules(state),
    scoreBom(state),
    scoreCost(state),
    scoreRisks(state),
    scoreSuppliers(state),
    scoreResearch(state),
  ]
}

function scoreBrief(state: PipelineState): SectionScore {
  const b = state.research?.designBrief
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 5 // baseline

  if (!b) return score('Brief', 1, ['No design brief available'], ['Ensure research stage produces a designBrief'])

  if (hasContent(b.useCase, 50)) { s += 1; reasons.push('Use case is detailed') } else { suggestions.push('Expand use case description') }
  if (hasContent(b.mission, 30)) { s += 0.5; reasons.push('Mission statement present') } else { suggestions.push('Add mission statement') }
  if (hasContent(b.targetCustomers, 30)) { s += 0.5; reasons.push('Target customers defined') } else { suggestions.push('Define target customers') }
  if (hasContent(b.whyNow, 30)) { s += 0.5; reasons.push('Market timing rationale present') } else { suggestions.push('Add why-now rationale') }
  if (b.constraints?.unitCostCeilingGbp) { s += 0.5; reasons.push('Cost ceiling declared') } else { suggestions.push('Declare cost ceiling') }
  if (b.constraints?.maxMassKg) { s += 0.5; reasons.push('Mass constraint declared') } else { suggestions.push('Declare mass constraint') }
  if (hasContent(b.complianceNotes, 20)) { s += 0.5; reasons.push('Compliance notes present') } else { suggestions.push('Add compliance notes') }

  return score('Brief', Math.round(s), reasons, suggestions)
}

function scoreRegulatory(state: PipelineState): SectionScore {
  const items = state.research?.designBrief?.regulatory || []
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 3 // baseline

  if (items.length === 0) return score('Regulatory', 1, ['No regulatory standards found'], ['Research must identify applicable standards'])
  if (items.length >= 3) { s += 1; reasons.push(`${items.length} standards identified`) } else { suggestions.push('Need at least 3 standards') }
  if (items.length >= 8) { s += 1; reasons.push('Comprehensive regulatory coverage') }

  const withApplicability = items.filter(r => r.applicability && r.applicability.length > 10)
  if (withApplicability.length >= items.length * 0.5) { s += 1; reasons.push('Most standards have applicability detail') } else { suggestions.push('Add applicability detail to more standards') }

  const withDesignImpact = items.filter(r => r.designImpact && r.designImpact.length > 10)
  if (withDesignImpact.length >= items.length * 0.5) { s += 1; reasons.push('Most standards have design impact analysis') } else { suggestions.push('Add design impact to more standards') }

  const withGapAction = items.filter(r => r.gapAction && r.gapAction.length > 5)
  if (withGapAction.length >= items.length * 0.3) { s += 0.5; reasons.push('Gap actions defined for some standards') } else { suggestions.push('Add gap actions to standards') }

  return score('Regulatory', Math.round(s), reasons, suggestions)
}

function scoreSizing(state: PipelineState): SectionScore {
  const ds = state.dimensionSheet
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 3

  if (!ds) return score('Sizing', 2, ['No sizing data'], ['Run sizing solver'])
  if (ds.feasible) { s += 3; reasons.push('Design is feasible') } else { s += 1; reasons.push('Design is infeasible — shown as exception') }
  if (Object.keys(ds.module_dimensions).length > 0) { s += 1; reasons.push('Module dimensions computed') }
  if (ds.conflicts.length > 0) { reasons.push(`${ds.conflicts.length} conflicts identified`) }
  if (ds.recommendations.length > 0) { s += 0.5; reasons.push('Recommendations provided') }

  return score('Sizing', Math.round(s), reasons, suggestions)
}

function scoreModules(state: PipelineState): SectionScore {
  const mods = state.modules || []
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 3

  if (mods.length === 0) return score('Modules', 1, ['No modules decomposed'], ['Run decomposition stage'])
  if (mods.length >= 8) { s += 2; reasons.push(`${mods.length} modules — good granularity`) } else if (mods.length >= 5) { s += 1; reasons.push(`${mods.length} modules — acceptable`) } else { suggestions.push(`Only ${mods.length} modules — target 8-12`) }

  const withDescription = mods.filter(m => hasContent(m.description, 100))
  if (withDescription.length >= mods.length * 0.7) { s += 1; reasons.push('Most modules have detailed descriptions') } else { suggestions.push('More modules need detailed descriptions') }

  const withKeyParts = mods.filter(m => m.keyParts && m.keyParts.length >= 3)
  if (withKeyParts.length >= mods.length * 0.7) { s += 1; reasons.push('Most modules have 3+ key parts') } else { suggestions.push('Modules need 3+ key parts each') }

  const withRisks = mods.filter(m => m.riskMatrix && m.riskMatrix.length >= 2)
  if (withRisks.length >= mods.length * 0.5) { s += 1; reasons.push('Most modules have risk matrices') } else { suggestions.push('Add risk matrices to more modules') }

  const withReview = state.reviews.filter(r => r.issues && r.issues.length > 0)
  if (withReview.length >= mods.length * 0.5) { s += 1; reasons.push(`${withReview.length}/${mods.length} modules have engineering reviews`) } else { suggestions.push('More modules need engineering reviews') }

  return score('Modules', Math.round(s), reasons, suggestions)
}

function scoreBom(state: PipelineState): SectionScore {
  const parts = state.parts || []
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 3

  if (parts.length === 0) return score('BOM', 1, ['No parts generated'], ['Run BOM generation'])
  if (parts.length >= 30) { s += 2; reasons.push(`${parts.length} parts — comprehensive BOM`) } else if (parts.length >= 15) { s += 1; reasons.push(`${parts.length} parts — acceptable`) } else { suggestions.push(`Only ${parts.length} parts — need more`) }

  const withCost = parts.filter(p => p.estimatedUnitCostGbp && p.estimatedUnitCostGbp > 0)
  if (withCost.length >= parts.length * 0.8) { s += 1; reasons.push('Most parts have cost estimates') } else { suggestions.push('More parts need cost estimates') }

  const withMass = parts.filter(p => p.massKg && p.massKg > 0)
  if (withMass.length >= parts.length * 0.7) { s += 1; reasons.push('Most parts have mass estimates') } else { suggestions.push('More parts need mass estimates') }

  const withModule = parts.filter(p => p.sourceModuleId)
  if (withModule.length >= parts.length * 0.9) { s += 1; reasons.push('Parts are linked to modules') } else { suggestions.push('Link more parts to modules') }

  const totalCost = parts.reduce((sum, p) => sum + (p.estimatedUnitCostGbp || 0), 0)
  if (totalCost > 100) { s += 0.5; reasons.push(`Total BOM cost: £${totalCost.toFixed(0)}`) }

  return score('BOM', Math.round(s), reasons, suggestions)
}

function scoreCost(state: PipelineState): SectionScore {
  const c = state.costBreakdown
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 3

  if (!c) return score('Cost', 1, ['No cost breakdown'], ['Run cost calculation'])
  if (c.unitTotalGbp > 0) { s += 2; reasons.push(`Unit cost: £${c.unitTotalGbp.toFixed(0)}`) } else { suggestions.push('Unit cost is zero') }
  if (c.perModule.length > 0) { s += 1; reasons.push('Per-module breakdown available') }
  if (c.nreTotalGbp > 0) { s += 0.5; reasons.push('NRE estimated') }
  if (c.ceilingGbp) { s += 0.5; reasons.push('Cost ceiling comparison available') }

  const sumOfModules = c.perModule.reduce((sum, m) => sum + m.totalGbp, 0)
  const discrepancy = Math.abs(c.unitTotalGbp - sumOfModules)
  if (discrepancy < c.unitTotalGbp * 0.01) { s += 1; reasons.push('Arithmetic closes within 1%') } else { suggestions.push(`Cost arithmetic mismatch: ${((discrepancy / c.unitTotalGbp) * 100).toFixed(1)}%`) }

  return score('Cost', Math.round(s), reasons, suggestions)
}

function scoreRisks(state: PipelineState): SectionScore {
  const mods = state.modules || []
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 3

  const allRisks = mods.flatMap(m => m.riskMatrix || [])
  if (allRisks.length === 0) return score('Risks', 1, ['No risks identified'], ['Add risk matrices to modules'])
  if (allRisks.length >= 10) { s += 2; reasons.push(`${allRisks.length} risks identified — comprehensive`) } else if (allRisks.length >= 5) { s += 1; reasons.push(`${allRisks.length} risks identified`) } else { suggestions.push('Need more risk entries') }

  const withMitigation = allRisks.filter(r => r.mitigation && r.mitigation.length > 10)
  if (withMitigation.length >= allRisks.length * 0.5) { s += 1; reasons.push('Most risks have mitigations') } else { suggestions.push('More risks need mitigation actions') }

  const withOwner = allRisks.filter(r => r.owner && r.owner.length > 3)
  if (withOwner.length >= allRisks.length * 0.5) { s += 1; reasons.push('Most risks have owners assigned') } else { suggestions.push('Assign owners to more risks') }

  const highRisks = allRisks.filter(r => (r.severity || 0) * (r.likelihood || 0) >= 10)
  if (highRisks.length > 0) { s += 0.5; reasons.push(`${highRisks.length} high-priority risks (score >= 10)`) }

  return score('Risks', Math.round(s), reasons, suggestions)
}

function scoreSuppliers(state: PipelineState): SectionScore {
  const matches = state.suppliers || []
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 3

  if (matches.length === 0) return score('Suppliers', 2, ['No supplier matches'], ['Set BRAVE_API_KEY and re-run supplier stage'])

  const totalSuppliers = matches.reduce((sum, m) => sum + (m.suppliers?.length || 0), 0)
  if (totalSuppliers >= 20) { s += 2; reasons.push(`${totalSuppliers} supplier candidates found`) } else if (totalSuppliers >= 5) { s += 1; reasons.push(`${totalSuppliers} supplier candidates found`) } else { suggestions.push('Need more supplier matches') }

  const withScore = matches.flatMap(m => m.suppliers || []).filter(s => s.score > 0)
  if (withScore.length >= totalSuppliers * 0.5) { s += 1; reasons.push('Most suppliers have match scores') }

  const partsWithSuppliers = matches.filter(m => m.suppliers && m.suppliers.length > 0)
  if (partsWithSuppliers.length >= matches.length * 0.5) { s += 1; reasons.push(`${partsWithSuppliers.length}/${matches.length} parts have supplier matches`) } else { suggestions.push('More parts need supplier matches') }

  return score('Suppliers', Math.round(s), reasons, suggestions)
}

function scoreResearch(state: PipelineState): SectionScore {
  const r = state.research
  const reasons: string[] = []
  const suggestions: string[] = []
  let s = 3

  if (!r) return score('Research', 1, ['No research data'], ['Run research stage'])
  if (hasContent(r.report, 500)) { s += 2; reasons.push(`Research report: ${countChars(r.report)} chars`) } else if (hasContent(r.report, 200)) { s += 1; reasons.push('Research report present but brief') } else { suggestions.push('Research report too short') }
  if (r.sources && r.sources.length >= 5) { s += 1; reasons.push(`${r.sources.length} sources cited`) } else { suggestions.push('Need 5+ sources') }
  if (r.standardCodes && r.standardCodes.length >= 3) { s += 0.5; reasons.push(`${r.standardCodes.length} standard codes identified`) }
  if (r.industryDomain) { s += 0.5; reasons.push(`Domain detected: ${r.industryDomain}`) }

  return score('Research', Math.round(s), reasons, suggestions)
}
