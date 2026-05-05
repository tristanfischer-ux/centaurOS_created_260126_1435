/**
 * Scoring rubric for PDF Engine V2
 * Evaluates generated reports against the BESS engineering report reference standard.
 * Scores based on what the pipeline ACTUALLY produces, not what it should produce.
 */

export interface ScoringResult {
  briefScore: number;
  regulatoryScore: number;
  modulesScore: number;
  bomScore: number;
  costScore: number;
  risksScore: number;
  sourceGradingScore: number;
  overallScore: number;
  details: Record<string, string[]>;
}

export function scoreReport(state: any): ScoringResult {
  const details: Record<string, string[]> = {};

  // 1. Brief — check research output and designBrief
  let briefScore = 0;
  const research = state?.research;
  const brief = research?.designBrief;
  const report = research?.report || '';

  // Report quality (the main research output)
  if (report.length > 2000) { briefScore += 15; details['brief_report'] = ['Report > 2000 chars — substantial content']; }
  else if (report.length > 500) { briefScore += 8; details['brief_report'] = ['Report present but brief']; }
  else { details['brief_report'] = ['Report too short or missing']; }

  // Sources
  const sources = research?.sources || [];
  if (sources.length >= 5) { briefScore += 15; details['brief_sources'] = [`${sources.length} sources — comprehensive`]; }
  else if (sources.length > 0) { briefScore += Math.floor((sources.length / 5) * 15); details['brief_sources'] = [`${sources.length} sources — partial`]; }
  else { details['brief_sources'] = ['No sources found']; }

  // Design brief structured fields
  if (brief) {
    if (brief.mission && brief.mission.length > 20) { briefScore += 10; }
    if (brief.useCase && brief.useCase.length > 10) { briefScore += 10; }
    if (brief.targetCustomers && brief.targetCustomers.length > 10) { briefScore += 10; }
    if (brief.whyNow && brief.whyNow.length > 20) { briefScore += 10; }
    
    // Constraints
    const constraints = brief.constraints;
    if (constraints) {
      if (constraints.unitCostCeilingGbp && constraints.unitCostCeilingGbp > 0) { briefScore += 10; }
      if (constraints.maxMassKg && constraints.maxMassKg > 0) { briefScore += 5; }
      if (constraints.batchSize && constraints.batchSize > 0) { briefScore += 5; }
    }
    
    // Competitors
    const competitors = brief.competitors || [];
    if (competitors.length >= 3) { briefScore += 10; details['brief_competitors'] = [`${competitors.length} competitors — comprehensive`]; }
    else if (competitors.length > 0) { briefScore += Math.floor((competitors.length / 3) * 10); }
    else { details['brief_competitors'] = ['No competitors identified']; }
  } else {
    details['brief_structured'] = ['No structured designBrief found — report text only'];
  }

  briefScore = Math.min(100, briefScore);

  // 2. Regulatory
  let regulatoryScore = 0;
  const regulatory = brief?.regulatory || research?.designBrief?.regulatory || [];
  if (regulatory.length >= 5) { regulatoryScore += 30; details['reg_count'] = [`${regulatory.length} standards — comprehensive`]; }
  else if (regulatory.length > 0) { regulatoryScore += Math.floor((regulatory.length / 5) * 30); details['reg_count'] = [`${regulatory.length} standards — partial`]; }
  else { details['reg_count'] = ['No regulatory standards found']; }
  
  const withApplicability = regulatory.filter((r: any) => r.applicability && r.applicability.length > 10);
  if (withApplicability.length >= regulatory.length * 0.5) { regulatoryScore += 25; }
  
  const withDesignImpact = regulatory.filter((r: any) => r.designImpact && r.designImpact.length > 10);
  if (withDesignImpact.length >= regulatory.length * 0.5) { regulatoryScore += 25; }
  
  const withGapAction = regulatory.filter((r: any) => r.gapAction && r.gapAction.length > 5);
  if (withGapAction.length >= regulatory.length * 0.3) { regulatoryScore += 20; }
  
  regulatoryScore = Math.min(100, regulatoryScore);

  // 3. Modules
  let modulesScore = 0;
  const modules = state?.modules || [];
  if (modules.length >= 8) { modulesScore += 25; details['mod_count'] = [`${modules.length} modules — comprehensive`]; }
  else if (modules.length > 0) { modulesScore += Math.floor((modules.length / 8) * 25); }
  else { details['mod_count'] = ['No modules found']; }
  
  const withDescription = modules.filter((m: any) => m.description && m.description.length > 100);
  if (withDescription.length >= modules.length * 0.7) { modulesScore += 25; }
  
  const withKeyParts = modules.filter((m: any) => m.keyParts && m.keyParts.length >= 3);
  if (withKeyParts.length >= modules.length * 0.7) { modulesScore += 25; }
  
  const withRisks = modules.filter((m: any) => m.riskMatrix && m.riskMatrix.length >= 2);
  if (withRisks.length >= modules.length * 0.5) { modulesScore += 25; }
  
  modulesScore = Math.min(100, modulesScore);

  // 4. BOM
  let bomScore = 0;
  const parts = state?.parts || [];
  if (parts.length >= 30) { bomScore += 30; details['bom_count'] = [`${parts.length} parts — comprehensive`]; }
  else if (parts.length > 0) { bomScore += Math.floor((parts.length / 30) * 30); }
  else { details['bom_count'] = ['No parts generated']; }
  
  const withCost = parts.filter((p: any) => p.estimatedUnitCostGbp && p.estimatedUnitCostGbp > 0);
  if (withCost.length >= parts.length * 0.8) { bomScore += 30; }
  
  const withModule = parts.filter((p: any) => p.sourceModuleId);
  if (withModule.length >= parts.length * 0.9) { bomScore += 20; }
  
  const withProcess = parts.filter((p: any) => p.process && p.process.length > 0);
  if (withProcess.length >= parts.length * 0.8) { bomScore += 20; }
  
  bomScore = Math.min(100, bomScore);

  // 5. Cost
  let costScore = 0;
  const cost = state?.costBreakdown;
  if (cost) {
    if (cost.unitTotalGbp > 0) { costScore += 30; details['cost_total'] = [`Unit cost: ${cost.unitTotalGbp}`]; }
    if (cost.perModule && cost.perModule.length > 0) { costScore += 25; }
    if (cost.nreTotalGbp > 0) { costScore += 15; }
    if (cost.ceilingGbp && cost.ceilingGbp > 0) { costScore += 15; costScore += 15; }
    
    // Check arithmetic
    const moduleSum = (cost.perModule || []).reduce((s: number, m: any) => s + (m.totalGbp || 0), 0);
    if (cost.unitTotalGbp > 0 && Math.abs(cost.unitTotalGbp - moduleSum) / cost.unitTotalGbp < 0.1) {
      costScore += 15;
    }
  } else {
    details['cost'] = ['No cost breakdown available'];
  }
  
  costScore = Math.min(100, costScore);

  // 6. Risks
  let risksScore = 0;
  const allRisks = modules.flatMap((m: any) => m.riskMatrix || []);
  if (allRisks.length >= 10) { risksScore += 30; details['risks_count'] = [`${allRisks.length} risks — comprehensive`]; }
  else if (allRisks.length > 0) { risksScore += Math.floor((allRisks.length / 10) * 30); }
  else { details['risks_count'] = ['No risks identified']; }
  
  const withMitigation = allRisks.filter((r: any) => r.mitigation && r.mitigation.length > 10);
  if (withMitigation.length >= allRisks.length * 0.5) { risksScore += 30; }
  
  const withOwner = allRisks.filter((r: any) => r.owner && r.owner.length > 3);
  if (withOwner.length >= allRisks.length * 0.5) { risksScore += 20; }
  
  const highRisks = allRisks.filter((r: any) => (r.severity || 0) * (r.likelihood || 0) >= 10);
  if (highRisks.length > 0) { risksScore += 20; }
  
  risksScore = Math.min(100, risksScore);

  // 7. Source Grading
  let sourceGradingScore = 0;
  const sourceAttrs = state?.sourceAttributions || [];
  if (sourceAttrs.length >= 5) { sourceGradingScore += 50; }
  else if (sourceAttrs.length > 0) { sourceGradingScore += Math.floor((sourceAttrs.length / 5) * 50); }
  
  const sectionsGraded = new Set(sourceAttrs.map((a: any) => a.section));
  if (sectionsGraded.size >= 5) { sourceGradingScore += 50; }
  else if (sectionsGraded.size > 0) { sourceGradingScore += Math.floor((sectionsGraded.size / 5) * 50); }
  
  sourceGradingScore = Math.min(100, sourceGradingScore);

  // Overall
  const overallScore = Math.round(
    (briefScore * 0.20 + regulatoryScore * 0.10 + modulesScore * 0.20 +
     bomScore * 0.15 + costScore * 0.15 + risksScore * 0.10 + sourceGradingScore * 0.10)
  );

  return {
    briefScore,
    regulatoryScore,
    modulesScore,
    bomScore,
    costScore,
    risksScore,
    sourceGradingScore,
    overallScore: Math.min(100, overallScore),
    details,
  };
}
