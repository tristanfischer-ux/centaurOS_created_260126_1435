# Risk Heatmap & Risk Register

> **Step 11 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-11

---

## Table of Contents
1. [Overview](#1-overview)
2. [Risk Taxonomy](#2-risk-taxonomy)
3. [Scoring Rubric](#3-scoring-rubric)
4. [Risk Score Inputs](#4-risk-score-inputs)
5. [Risk Calculation](#5-risk-calculation)
6. [UI: Heatmap Overlay](#6-ui-heatmap-overlay)
7. [UI: Risk Register](#7-ui-risk-register)
8. [Storage Strategy](#8-storage-strategy)
9. [Example: Robotics Battery + Actuator](#9-example-robotics-battery--actuator)
10. [Edge Cases](#10-edge-cases)
11. [Implementation Checklist](#11-implementation-checklist)

---

## 1. Overview

### 1.1 Purpose

The Risk Heatmap provides a visual representation of project risk across all knowledge domains, enabling founders and executives to:

1. **Identify hotspots** — Quickly see which domains pose the greatest risk to project success
2. **Prioritize expert engagement** — Focus resources on high-risk, high-impact areas
3. **Track risk evolution** — Monitor how risk changes as the project progresses through stages
4. **Support stage gate decisions** — Quantify readiness for stage advancement

### 1.2 Design Principles

1. **Computed on Read** — Risk scores are ephemeral; never stored in database
2. **Transparent Scoring** — All factors visible and explainable
3. **Stage-Contextual** — Risk weights change based on project stage
4. **Actionable** — Every high-risk domain links to mitigation actions
5. **Human Override** — Users can acknowledge/dismiss risks with documented rationale

### 1.3 Relationship to Other Specs

| Spec | Relationship |
|------|--------------|
| **09-stage-gates.md** | Stage multipliers affect risk scores |
| **03-data-api.md** | Risk computed from `blueprint_domain_coverage` data |
| **13-ai-confidence-verification.md** | AI confidence is a risk input |
| **10-decisions-assumptions.md** | Unvalidated assumptions increase risk |
| **14-comparative-paths.md** | Open OptionSets contribute to uncertainty risk |

---

## 2. Risk Taxonomy

### 2.1 Canonical Risk Categories

**Enum:** `risk_category` (convention in computed risk objects)

```typescript
type RiskCategory = 
  | 'technical_feasibility'  // Engineering complexity & unknowns
  | 'supply_chain'          // External dependencies & suppliers
  | 'regulatory'            // Regulatory & certification risks
  | 'safety'               // Safety & reliability concerns
  | 'schedule'             // Timeline pressure
  | 'cost'                 // Budget & cost risks
  | 'quality'              // Quality & reliability concerns
  | 'integration'          // Cross-domain integration complexity
```

### 2.2 Category Definitions

#### RISK-01: Technical Feasibility (`technical_feasibility`)

**Description:** Risk from engineering complexity, unproven technology, or design uncertainty.

| Factor | Weight | Description |
|--------|--------|-------------|
| Novel technology | 0.3 | First-time implementation of new tech |
| High integration complexity | 0.25 | Many cross-domain dependencies |
| Unvalidated design assumptions | 0.2 | Assumptions without test data |
| AI-suggested content low confidence | 0.15 | AI outputs with <70% confidence |
| Open OptionSets (undecided tradeoffs) | 0.1 | Technical decisions not finalized |

**Stage Relevance:** Concept through EVT (decreases after design freeze)

---

#### RISK-02: Supply Chain (`supply_chain`)

**Description:** Risk from external dependencies, suppliers, and component availability.

| Factor | Weight | Description |
|--------|--------|-------------|
| Single-source components | 0.3 | No alternate suppliers identified |
| Long lead-time items | 0.25 | Components with >12 week lead times |
| Unqualified suppliers | 0.2 | Suppliers without quality agreements |
| External expert dependency | 0.15 | Critical expertise from outside team |
| Pending RFQ responses | 0.1 | Awaiting quotes for critical items |

**Stage Relevance:** Prototype through Production (highest at DVT/Production)

---

#### RISK-03: Regulatory (`regulatory`)

**Description:** Risk from regulatory, certification, and legal requirements.

| Factor | Weight | Description |
|--------|--------|-------------|
| Unidentified requirements | 0.3 | Regulatory gaps not yet mapped |
| Failed pre-compliance tests | 0.25 | EMC/safety issues identified |
| Certification timeline pressure | 0.2 | Tight window for cert completion |
| International variants | 0.15 | Multiple regional certifications needed |
| Pending legal review | 0.1 | IP or liability issues unresolved |

**Stage Relevance:** Increases from EVT through Production

---

#### RISK-04: Safety (`safety`)

**Description:** Risk to product safety, user safety, and hazard management.

| Factor | Weight | Description |
|--------|--------|-------------|
| Safety analysis gaps | 0.3 | FMEA or hazard analysis missing |
| High-risk components | 0.25 | Batteries, high voltage, moving parts |
| Unvalidated safety assumptions | 0.2 | Safety claims without test data |
| Regulatory safety requirements | 0.15 | UL, CE, IEC safety standards |
| Field failure potential | 0.1 | High consequence of failure |

**Stage Relevance:** Increases from Prototype through Production

---

#### RISK-05: Schedule (`schedule`)

**Description:** Risk to project timeline and milestone achievement.

| Factor | Weight | Description |
|--------|--------|-------------|
| Milestone overdue | 0.35 | Target date passed without completion |
| Blockers with `'critical'` severity | 0.3 | Show-stopper issues identified |
| High domain count with gaps | 0.2 | Many areas needing resolution |
| Stage advancement pressure | 0.15 | Gap between target vs actual stage |

**Stage Relevance:** Increases as project progresses (highest at Production)

---

#### RISK-06: Cost (`cost`)

**Description:** Risk to project budget and unit economics.

| Factor | Weight | Description |
|--------|--------|-------------|
| BOM cost over target | 0.3 | Material costs exceed projections |
| NRE budget uncertainty | 0.25 | Tooling/certification costs unknown |
| Yield assumptions unvalidated | 0.2 | Production yield not yet proven |
| Pricing sensitivity | 0.15 | Margin risk from cost increases |
| Funding runway concern | 0.1 | Budget constraints affecting timeline |

**Stage Relevance:** All stages (different factors per stage)

---

#### RISK-07: Quality (`quality`)

**Description:** Risk to product reliability, consistency, and customer satisfaction.

| Factor | Weight | Description |
|--------|--------|-------------|
| Reliability testing incomplete | 0.3 | Life/stress testing not done |
| DFM issues identified | 0.25 | Design for manufacturing concerns |
| Test coverage inadequate | 0.2 | Missing test procedures |
| Process control gaps | 0.15 | Manufacturing process not validated |
| Customer feedback negative | 0.1 | Early user testing concerns |

**Stage Relevance:** Increases from Prototype through Production

---

#### RISK-08: Integration (`integration`)

**Description:** Risk from cross-domain dependencies and system integration complexity.

| Factor | Weight | Description |
|--------|--------|-------------|
| High dependency count | 0.3 | Many domains depend on this one |
| Interface specifications unclear | 0.25 | APIs/contracts not defined |
| Integration testing incomplete | 0.2 | Cross-domain tests not done |
| Version compatibility risks | 0.15 | Component version mismatches |
| Third-party integration | 0.1 | External systems/components |

**Stage Relevance:** Highest at Prototype/EVT, decreases after integration complete

---

## 3. Scoring Rubric

### 3.1 Risk Score Scale (0-5)

| Score | Label | Color | Description |
|-------|-------|-------|-------------|
| **0** | None | `bg-status-success-light` | No identified risks |
| **1** | Minimal | `bg-emerald-100` | Minor concerns, easily addressed |
| **2** | Low | `bg-status-info-light` | Manageable risks with standard processes |
| **3** | Moderate | `bg-status-warning-light` | Significant risks requiring attention |
| **4** | High | `bg-orange-200` | Critical risks threatening success |
| **5** | Severe | `bg-status-error-light` | Showstopper risks requiring immediate action |

### 3.2 Score Interpretation

```typescript
interface RiskScoreInterpretation {
  score: number;
  label: string;
  action_required: string;
  escalation_level: 'none' | 'team' | 'executive' | 'board';
}

const SCORE_INTERPRETATIONS: RiskScoreInterpretation[] = [
  { score: 0, label: 'None', action_required: 'Continue monitoring', escalation_level: 'none' },
  { score: 1, label: 'Minimal', action_required: 'Address in normal workflow', escalation_level: 'none' },
  { score: 2, label: 'Low', action_required: 'Plan mitigation within sprint', escalation_level: 'team' },
  { score: 3, label: 'Moderate', action_required: 'Prioritize in current sprint', escalation_level: 'team' },
  { score: 4, label: 'High', action_required: 'Immediate action plan required', escalation_level: 'executive' },
  { score: 5, label: 'Severe', action_required: 'Stop and address before proceeding', escalation_level: 'board' }
];
```

### 3.3 Aggregate Blueprint Risk Score

The overall blueprint risk is the **weighted average** of category risks, with weights varying by stage:

```typescript
const CATEGORY_WEIGHTS_BY_STAGE: Record<ProjectStage, Record<RiskCategory, number>> = {
  concept: {
    technical_feasibility: 0.25, supply_chain: 0.10, regulatory: 0.10, safety: 0.10,
    schedule: 0.05, cost: 0.15, quality: 0.05, integration: 0.20
  },
  prototype: {
    technical_feasibility: 0.25, supply_chain: 0.15, regulatory: 0.10, safety: 0.10,
    schedule: 0.10, cost: 0.10, quality: 0.10, integration: 0.10
  },
  evt: {
    technical_feasibility: 0.20, supply_chain: 0.15, regulatory: 0.15, safety: 0.15,
    schedule: 0.15, cost: 0.10, quality: 0.10, integration: 0.00
  },
  dvt: {
    technical_feasibility: 0.15, supply_chain: 0.20, regulatory: 0.20, safety: 0.15,
    schedule: 0.15, cost: 0.10, quality: 0.05, integration: 0.00
  },
  production: {
    technical_feasibility: 0.10, supply_chain: 0.20, regulatory: 0.15, safety: 0.15,
    schedule: 0.20, cost: 0.15, quality: 0.05, integration: 0.00
  },
  launched: {
    technical_feasibility: 0.05, supply_chain: 0.15, regulatory: 0.10, safety: 0.20,
    schedule: 0.10, cost: 0.20, quality: 0.20, integration: 0.00
  }
};
```

---

## 4. Risk Score Inputs

### 4.1 Input Sources

| Input | Source Table/Field | How Used |
|-------|-------------------|----------|
| **Coverage Status** | `blueprint_domain_coverage.status` | `'gap'` = +2, `'partial'` = +1 |
| **Is Critical** | `blueprint_domain_coverage.is_critical` | `true` = 1.5x multiplier |
| **Blockers** | `blueprint_domain_coverage.blockers` | Each blocker adds based on severity |
| **Project Stage** | `blueprints.project_stage` | Stage multiplier applied |
| **AI Confidence** | `tasks.metadata.provenance.ai_context.confidence` | Low confidence = +risk |
| **Expert Presence** | `blueprint_expertise` | Missing/unverified = +risk |

### 4.2 Input Normalization

All inputs are normalized to a 0-1 scale before aggregation:

```typescript
interface NormalizedInput {
  name: string;
  raw_value: unknown;
  normalized: number; // 0-1
  weight: number; // contribution to category score
}

// Example: Coverage status normalization
function normalizeCoverageStatus(status: CoverageStatus): number {
  const statusValues: Record<CoverageStatus, number> = {
    'covered': 0,
    'partial': 0.4,
    'gap': 1.0,
    'not_needed': 0
  };
  return statusValues[status] ?? 0.5;
}

// Example: Blocker severity normalization
function normalizeBlockerSeverity(severity: BlockerSeverity): number {
  const severityValues: Record<BlockerSeverity, number> = {
    'low': 0.2,
    'medium': 0.5,
    'high': 0.8,
    'critical': 1.0
  };
  return severityValues[severity] ?? 0.5;
}

// Example: AI confidence normalization (inverted - lower confidence = higher risk)
function normalizeAIConfidence(confidence: number): number {
  // confidence is 0-100, we want high confidence = low risk
  return 1 - (confidence / 100);
}
```

### 4.3 Expert Presence Input

```typescript
interface ExpertPresenceInput {
  domain_id: string;
  has_expert: boolean;
  expert_verified: boolean;
  expert_type: PersonType;
  expertise_level: ExpertiseLevel;
}

function computeExpertPresenceRisk(input: ExpertPresenceInput): number {
  if (!input.has_expert) return 1.0; // No expert = maximum coverage risk
  
  let risk = 0;
  
  // Verification status
  if (!input.expert_verified) risk += 0.3;
  
  // Expert type (external/marketplace slightly riskier than team)
  if (input.expert_type === 'external' || input.expert_type === 'marketplace') {
    risk += 0.1;
  }
  
  // Expertise level
  if (input.expertise_level === 'learning') risk += 0.3;
  else if (input.expertise_level === 'competent') risk += 0.1;
  // 'expert' adds nothing
  
  return Math.min(1, risk);
}
```

---

## 5. Risk Calculation

### 5.1 Domain Risk Score

```typescript
interface DomainRiskScore {
  domain_id: string;
  domain_name: string;
  overall_score: number; // 0-5
  category_scores: Record<RiskCategory, number>;
  factors: DomainRiskFactor[];
  mitigations: RiskMitigation[];
  trend: 'improving' | 'stable' | 'worsening' | 'unknown';
}

interface DomainRiskFactor {
  factor_id: string;
  category: RiskCategory;
  description: string;
  contribution: number; // how much this adds to score
  source: string; // where this factor comes from
}

interface RiskMitigation {
  action: string;
  reduces_score_by: number;
  task_id?: string; // linked task if exists
}
```

### 5.2 Calculation Algorithm

```typescript
function calculateDomainRisk(
  domain: KnowledgeDomain,
  coverage: BlueprintDomainCoverage,
  expertise: BlueprintExpertise[],
  blueprint: Blueprint,
  aiOutputs: TaskMetadata[]
): DomainRiskScore {
  const factors: DomainRiskFactor[] = [];
  const categoryScores: Record<RiskCategory, number> = {
    technical_feasibility: 0, supply_chain: 0, regulatory: 0, safety: 0,
    schedule: 0, cost: 0, quality: 0, integration: 0
  };
  
  const stage = blueprint.project_stage;
  const stageMultiplier = getStageMultiplier(stage);
  const isCritical = coverage.is_critical || domain.criticality === 'critical';
  const criticalMultiplier = isCritical ? 1.5 : 1.0;
  
  // Factor 1: Coverage Status
  if (coverage.status === 'gap') {
    const contribution = 2.0 * criticalMultiplier;
    categoryScores.technical_feasibility += contribution * 0.3;
    categoryScores.integration += contribution * 0.2;
    categoryScores.schedule += contribution * 0.2;
    categoryScores.supply_chain += contribution * 0.15;
    categoryScores.quality += contribution * 0.15;
    factors.push({
      factor_id: 'coverage_gap',
      category: 'technical_feasibility',
      description: `Domain is a gap${isCritical ? ' (critical domain)' : ''}`,
      contribution,
      source: 'blueprint_domain_coverage.status'
    });
  } else if (coverage.status === 'partial') {
    const contribution = 1.0 * criticalMultiplier;
    categoryScores.technical_feasibility += contribution * 0.4;
    categoryScores.integration += contribution * 0.3;
    categoryScores.schedule += contribution * 0.3;
    factors.push({
      factor_id: 'coverage_partial',
      category: 'technical_feasibility',
      description: `Partial coverage${isCritical ? ' (critical domain)' : ''}`,
      contribution,
      source: 'blueprint_domain_coverage.status'
    });
  }
  
  // Factor 2: Expert Presence
  const domainExpertise = expertise.filter(e => e.domain_id === domain.id);
  if (domainExpertise.length === 0 && coverage.status !== 'not_needed') {
    const contribution = 1.0 * criticalMultiplier;
    categoryScores.technical_feasibility += contribution * 0.5;
    categoryScores.integration += contribution * 0.3;
    categoryScores.schedule += contribution * 0.2;
    factors.push({
      factor_id: 'no_expert',
      category: 'technical_feasibility',
      description: 'No expert assigned to domain',
      contribution,
      source: 'blueprint_expertise'
    });
  } else {
    const hasVerified = domainExpertise.some(e => e.verification_status === 'verified');
    if (!hasVerified) {
      const contribution = 0.5 * criticalMultiplier;
      categoryScores.technical_feasibility += contribution;
      factors.push({
        factor_id: 'expert_unverified',
        category: 'technical_feasibility',
        description: 'Expert expertise not verified',
        contribution,
        source: 'blueprint_expertise.verification_status'
      });
    }
  }
  
  // Factor 3: Blockers
  const blockers = parseBlockers(coverage.blockers || []);
  for (const blocker of blockers) {
    const contribution = normalizeBlockerSeverity(blocker.severity) * 2 * criticalMultiplier;
    const category = mapBlockerToCategory(blocker);
    categoryScores[category] += contribution;
    factors.push({
      factor_id: `blocker_${blocker.text.slice(0, 20)}`,
      category,
      description: `Blocker: ${blocker.text}`,
      contribution,
      source: 'blueprint_domain_coverage.blockers'
    });
  }
  
  // Factor 4: AI Confidence
  const domainAIOutputs = aiOutputs.filter(t => 
    t.domain_id === domain.id && t.provenance?.ai_context
  );
  const avgConfidence = domainAIOutputs.length > 0
    ? domainAIOutputs.reduce((sum, t) => sum + (t.provenance?.ai_context?.confidence || 0), 0) / domainAIOutputs.length
    : null;
  
  if (avgConfidence !== null && avgConfidence < 70) {
    const contribution = normalizeAIConfidence(avgConfidence) * 1.5 * criticalMultiplier;
    categoryScores.technical_feasibility += contribution;
    factors.push({
      factor_id: 'ai_low_confidence',
      category: 'technical_feasibility',
      description: `AI outputs have low average confidence (${avgConfidence.toFixed(0)}%)`,
      contribution,
      source: 'tasks.metadata.provenance.ai_context.confidence'
    });
  }
  
  // Factor 5: Unvalidated Assumptions (from decisions)
  const decisions = coverage.decisions || [];
  const unvalidatedAssumptions = decisions.filter(
    (d: Decision) => d.type === 'assumption' && d.status !== 'approved'
  );
  if (unvalidatedAssumptions.length > 0) {
    const contribution = unvalidatedAssumptions.length * 0.3 * criticalMultiplier;
    categoryScores.technical_feasibility += contribution;
    factors.push({
      factor_id: 'unvalidated_assumptions',
      category: 'technical_feasibility',
      description: `${unvalidatedAssumptions.length} unvalidated assumption(s)`,
      contribution,
      source: 'blueprint_domain_coverage.decisions'
    });
  }
  
  // Apply stage multiplier to all categories
  for (const category of Object.keys(categoryScores) as RiskCategory[]) {
    categoryScores[category] = Math.min(5, categoryScores[category] * stageMultiplier);
  }
  
  // Calculate overall score (weighted average)
  const weights = CATEGORY_WEIGHTS_BY_STAGE[stage];
  let overallScore = 0;
  for (const [category, weight] of Object.entries(weights)) {
    overallScore += categoryScores[category as RiskCategory] * weight;
  }
  overallScore = Math.min(5, Math.round(overallScore * 10) / 10);
  
  // Generate mitigation suggestions
  const mitigations = generateMitigations(factors);
  
  return {
    domain_id: domain.id,
    domain_name: domain.name,
    overall_score: overallScore,
    category_scores: categoryScores,
    factors,
    mitigations,
    trend: 'unknown' // Would require historical data
  };
}

function getStageMultiplier(stage: ProjectStage): number {
  const multipliers: Record<ProjectStage, number> = {
    concept: 0.6,
    prototype: 0.8,
    evt: 1.0,
    dvt: 1.2,
    production: 1.4,
    launched: 1.0
  };
  return multipliers[stage];
}

function mapBlockerToCategory(blocker: ParsedBlocker): RiskCategory {
  const text = blocker.text.toLowerCase();
  if (text.includes('supplier') || text.includes('lead time') || text.includes('component')) {
    return 'supply_chain';
  }
  if (text.includes('certification') || text.includes('regulatory') || text.includes('compliance')) {
    return 'regulatory';
  }
  if (text.includes('safety') || text.includes('hazard') || text.includes('fmea')) {
    return 'safety';
  }
  if (text.includes('schedule') || text.includes('deadline') || text.includes('milestone')) {
    return 'schedule';
  }
  if (text.includes('cost') || text.includes('budget') || text.includes('bom')) {
    return 'cost';
  }
  if (text.includes('quality') || text.includes('reliability') || text.includes('test')) {
    return 'quality';
  }
  if (text.includes('integration') || text.includes('interface') || text.includes('api')) {
    return 'integration';
  }
  return 'technical_feasibility'; // default
}
```

### 5.3 Blueprint Aggregate Risk

```typescript
interface BlueprintRiskSummary {
  blueprint_id: string;
  overall_score: number; // 0-5
  category_scores: Record<RiskCategory, number>;
  high_risk_domains: DomainRiskScore[]; // score >= 4
  domain_scores: DomainRiskScore[];
  risk_trend: 'improving' | 'stable' | 'worsening';
  top_factors: DomainRiskFactor[];
  recommended_actions: RiskMitigation[];
}

function calculateBlueprintRisk(
  blueprint: Blueprint,
  domainScores: DomainRiskScore[]
): BlueprintRiskSummary {
  // Aggregate category scores (weighted by domain criticality)
  const categoryScores: Record<RiskCategory, number> = {
    technical_feasibility: 0, supply_chain: 0, regulatory: 0, safety: 0,
    schedule: 0, cost: 0, quality: 0, integration: 0
  };
  
  let totalWeight = 0;
  for (const domainScore of domainScores) {
    const weight = domainScore.domain_name.includes('critical') ? 1.5 : 1;
    totalWeight += weight;
    
    for (const [category, score] of Object.entries(domainScore.category_scores)) {
      categoryScores[category as RiskCategory] += score * weight;
    }
  }
  
  // Normalize to 0-5 scale
  for (const category of Object.keys(categoryScores) as RiskCategory[]) {
    categoryScores[category] = Math.min(5, categoryScores[category] / totalWeight);
  }
  
  // Calculate overall (stage-weighted)
  const weights = CATEGORY_WEIGHTS_BY_STAGE[blueprint.project_stage];
  let overallScore = 0;
  for (const [category, weight] of Object.entries(weights)) {
    overallScore += categoryScores[category as RiskCategory] * weight;
  }
  overallScore = Math.min(5, Math.round(overallScore * 10) / 10);
  
  // Identify high-risk domains
  const highRiskDomains = domainScores.filter(d => d.overall_score >= 4);
  
  // Collect top factors
  const allFactors = domainScores.flatMap(d => d.factors);
  const topFactors = allFactors
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 10);
  
  // Collect recommended actions
  const allMitigations = domainScores.flatMap(d => d.mitigations);
  const recommendedActions = allMitigations
    .sort((a, b) => b.reduces_score_by - a.reduces_score_by)
    .slice(0, 5);
  
  return {
    blueprint_id: blueprint.id,
    overall_score: overallScore,
    category_scores: categoryScores,
    high_risk_domains: highRiskDomains,
    domain_scores: domainScores,
    risk_trend: 'stable', // Would require historical comparison
    top_factors: topFactors,
    recommended_actions: recommendedActions
  };
}
```

---

## 6. UI: Heatmap Overlay

### 6.1 Visual Design

The heatmap overlay displays on the domain tree/mind-map view, coloring each domain node based on risk score:

```tsx
// Domain node with risk coloring
<DomainNode
  domain={domain}
  riskScore={domainRisk.overall_score}
  className={cn(
    "transition-colors duration-200",
    getRiskColorClass(domainRisk.overall_score)
  )}
>
  <DomainContent>
    <DomainName>{domain.name}</DomainName>
    {showRiskIndicator && (
      <RiskIndicator score={domainRisk.overall_score}>
        {domainRisk.overall_score.toFixed(1)}
      </RiskIndicator>
    )}
  </DomainContent>
</DomainNode>

function getRiskColorClass(score: number): string {
  if (score >= 4.5) return 'bg-status-error-light border-status-error';
  if (score >= 4.0) return 'bg-orange-200 border-orange-400';
  if (score >= 3.0) return 'bg-status-warning-light border-status-warning';
  if (score >= 2.0) return 'bg-status-info-light border-status-info';
  if (score >= 1.0) return 'bg-emerald-100 border-emerald-300';
  return 'bg-status-success-light border-status-success';
}
```

### 6.2 Heatmap Toggle

```tsx
// Blueprint detail page header
<div className="flex items-center gap-4">
  <Toggle
    pressed={showHeatmap}
    onPressedChange={setShowHeatmap}
    aria-label="Toggle risk heatmap"
  >
    <Flame className="h-4 w-4 mr-2" />
    Risk Heatmap
  </Toggle>
  
  {showHeatmap && (
    <Select value={riskCategory} onValueChange={setRiskCategory}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="All Categories" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Categories</SelectItem>
        <SelectItem value="technical_feasibility">Technical Feasibility</SelectItem>
        <SelectItem value="supply_chain">Supply Chain</SelectItem>
        <SelectItem value="regulatory">Regulatory</SelectItem>
        <SelectItem value="safety">Safety</SelectItem>
        <SelectItem value="schedule">Schedule</SelectItem>
        <SelectItem value="cost">Cost</SelectItem>
        <SelectItem value="quality">Quality</SelectItem>
        <SelectItem value="integration">Integration</SelectItem>
      </SelectContent>
    </Select>
  )}
</div>
```

### 6.3 Heatmap Legend

```tsx
<div className="flex items-center gap-6 text-sm border-b border-muted pb-4 mb-4">
  <span className="text-muted-foreground font-medium">Risk Level:</span>
  
  <div className="flex items-center gap-2">
    <div className="h-3 w-8 rounded bg-status-success-light border border-status-success" />
    <span>None (0-1)</span>
  </div>
  
  <div className="flex items-center gap-2">
    <div className="h-3 w-8 rounded bg-status-info-light border border-status-info" />
    <span>Low (1-2)</span>
  </div>
  
  <div className="flex items-center gap-2">
    <div className="h-3 w-8 rounded bg-status-warning-light border border-status-warning" />
    <span>Moderate (3)</span>
  </div>
  
  <div className="flex items-center gap-2">
    <div className="h-3 w-8 rounded bg-orange-200 border border-orange-400" />
    <span>High (4)</span>
  </div>
  
  <div className="flex items-center gap-2">
    <div className="h-3 w-8 rounded bg-status-error-light border border-status-error" />
    <span>Severe (5)</span>
  </div>
</div>
```

### 6.4 Domain Risk Tooltip

When hovering over a domain in heatmap mode:

```tsx
<HoverCard>
  <HoverCardTrigger asChild>
    <DomainNode domain={domain} riskScore={risk.overall_score} />
  </HoverCardTrigger>
  <HoverCardContent className="w-80">
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{domain.name}</h4>
        <Badge variant={getRiskBadgeVariant(risk.overall_score)}>
          Risk: {risk.overall_score.toFixed(1)}
        </Badge>
      </div>
      
      {/* Top Risk Factors */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">Top Risk Factors:</p>
        <ul className="text-sm space-y-1">
          {risk.factors.slice(0, 3).map(factor => (
            <li key={factor.factor_id} className="flex items-start gap-2">
              <AlertTriangle className="h-3 w-3 mt-1 text-status-warning" />
              <span>{factor.description}</span>
            </li>
          ))}
        </ul>
      </div>
      
      {/* Suggested Action */}
      {risk.mitigations.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Suggested Action:</p>
          <p className="text-sm">{risk.mitigations[0].action}</p>
        </div>
      )}
      
      <Button variant="outline" size="sm" className="w-full">
        View Details
      </Button>
    </div>
  </HoverCardContent>
</HoverCard>
```

---

## 7. UI: Risk Register

### 7.1 Risk Register View

A tabular view of all risks across the blueprint:

```tsx
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle>Risk Register</CardTitle>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportRiskRegister}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[200px]">Domain</TableHead>
          <TableHead>Risk Score</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="w-[300px]">Top Factor</TableHead>
          <TableHead>Mitigation</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedDomainRisks.map(risk => (
          <TableRow key={risk.domain_id}>
            <TableCell className="font-medium">{risk.domain_name}</TableCell>
            <TableCell>
              <Badge variant={getRiskBadgeVariant(risk.overall_score)}>
                {risk.overall_score.toFixed(1)}
              </Badge>
            </TableCell>
            <TableCell>
              {getTopCategory(risk.category_scores)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {risk.factors[0]?.description || 'None identified'}
            </TableCell>
            <TableCell>
              {risk.mitigations[0]?.action ? (
                <span className="text-sm">{risk.mitigations[0].action}</span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <RiskStatusDropdown 
                domainId={risk.domain_id} 
                currentStatus={riskStatuses[risk.domain_id]}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

### 7.2 Risk Acknowledgment

Users can acknowledge risks they've reviewed:

```tsx
interface RiskAcknowledgment {
  domain_id: string;
  acknowledged_by: string;
  acknowledged_at: string;
  notes?: string;
  accepted: boolean; // true = accept risk, false = will mitigate
  mitigation_plan?: string;
  target_resolution_date?: string;
}

// Stored in blueprint.metadata.risk_acknowledgments (JSONB)

<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline" size="sm">
      Acknowledge Risk
    </Button>
  </DialogTrigger>
  <DialogContent size="md">
    <DialogHeader>
      <DialogTitle>Acknowledge Risk: {domainName}</DialogTitle>
    </DialogHeader>
    
    <div className="space-y-4">
      <div className="p-3 bg-status-warning-light rounded-md">
        <p className="text-sm font-medium">Current Risk Score: {score.toFixed(1)}</p>
        <p className="text-sm mt-1">{factors[0]?.description}</p>
      </div>
      
      <RadioGroup value={response} onValueChange={setResponse}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="accept" id="accept" />
          <Label htmlFor="accept">Accept this risk (no mitigation planned)</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="mitigate" id="mitigate" />
          <Label htmlFor="mitigate">Plan mitigation</Label>
        </div>
      </RadioGroup>
      
      {response === 'mitigate' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="plan">Mitigation Plan</Label>
            <Textarea
              id="plan"
              value={mitigationPlan}
              onChange={(e) => setMitigationPlan(e.target.value)}
              placeholder="Describe how you will address this risk..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-date">Target Resolution Date</Label>
            <DatePicker
              id="target-date"
              value={targetDate}
              onChange={setTargetDate}
            />
          </div>
        </>
      )}
      
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional context..."
        />
      </div>
    </div>
    
    <DialogFooter>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleAcknowledge}>
        Acknowledge
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 7.3 Risk Summary Dashboard Widget

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <ShieldAlert className="h-5 w-5" />
      Risk Summary
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Overall Risk</span>
        <div className="flex items-center gap-2">
          <div 
            className={cn(
              "h-4 w-16 rounded",
              getRiskColorClass(blueprintRisk.overall_score)
            )}
          />
          <span className="font-semibold">
            {blueprintRisk.overall_score.toFixed(1)}
          </span>
        </div>
      </div>
      
      {/* Category Breakdown */}
      <div className="space-y-2">
        {Object.entries(blueprintRisk.category_scores)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4)
          .map(([category, score]) => (
            <div key={category} className="flex items-center gap-2">
              <span className="text-sm w-24 capitalize">{category.replace('_', ' ')}</span>
              <Progress 
                value={score * 20} 
                className="flex-1 h-2"
              />
              <span className="text-sm w-8">{score.toFixed(1)}</span>
            </div>
          ))}
      </div>
      
      {/* High Risk Domains */}
      {blueprintRisk.high_risk_domains.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-sm font-medium text-destructive mb-2">
            {blueprintRisk.high_risk_domains.length} High-Risk Domain(s)
          </p>
          <ul className="text-sm space-y-1">
            {blueprintRisk.high_risk_domains.slice(0, 3).map(d => (
              <li key={d.domain_id} className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                {d.domain_name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </CardContent>
</Card>
```

---

## 8. Storage Strategy

### 8.1 Compute on Read

**Risk scores are NOT stored in the database.** They are computed on-demand when:

1. User opens blueprint detail page
2. User toggles heatmap overlay
3. User views risk register
4. Stage gate evaluation is requested
5. Dashboard is rendered

**Rationale:**
- Input data changes frequently (coverage, blockers, decisions)
- Storing scores would require complex cache invalidation
- Computation is fast (< 100ms for typical blueprints)
- Avoids stale data issues

### 8.2 Risk Acknowledgments Storage

Risk acknowledgments ARE stored in `blueprints.metadata`:

```json
// blueprints.metadata JSONB extension
{
  "risk_acknowledgments": [
    {
      "domain_id": "uuid",
      "acknowledged_by": "uuid",
      "acknowledged_at": "2026-02-01T14:30:00Z",
      "notes": "Accepted risk due to tight timeline",
      "accepted": true,
      "mitigation_plan": null,
      "target_resolution_date": null
    },
    {
      "domain_id": "uuid2",
      "acknowledged_by": "uuid",
      "acknowledged_at": "2026-02-01T15:00:00Z",
      "notes": "Will address in next sprint",
      "accepted": false,
      "mitigation_plan": "Engage battery expert from marketplace",
      "target_resolution_date": "2026-02-15"
    }
  ]
}
```

### 8.3 API Endpoint

```typescript
// src/actions/blueprints/get-risk-assessment.ts
'use server';

import { createClient } from '@/lib/supabase/server';

export interface GetRiskAssessmentInput {
  blueprint_id: string;
  category_filter?: RiskCategory;
}

export interface GetRiskAssessmentResponse {
  success: boolean;
  risk?: BlueprintRiskSummary;
  error?: string;
}

export async function getBlueprintRiskAssessment(
  input: GetRiskAssessmentInput
): Promise<GetRiskAssessmentResponse> {
  const supabase = await createClient();
  
  const { blueprint_id, category_filter } = input;
  
  // Fetch all required data in parallel
  const [blueprintResult, domainsResult, coverageResult, expertiseResult, tasksResult] = await Promise.all([
    supabase.from('blueprints').select('*').eq('id', blueprint_id).single(),
    supabase.from('knowledge_domains').select('*').eq('template_id', /* from blueprint */),
    supabase.from('blueprint_domain_coverage').select('*').eq('blueprint_id', blueprint_id),
    supabase.from('blueprint_expertise').select('*').eq('blueprint_id', blueprint_id),
    supabase.from('tasks').select('metadata').contains('metadata', { blueprint_id })
  ]);
  
  if (blueprintResult.error || !blueprintResult.data) {
    return { success: false, error: 'Blueprint not found' };
  }
  
  // Compute risk scores
  const domainScores = domainsResult.data?.map(domain => {
    const coverage = coverageResult.data?.find(c => c.domain_id === domain.id);
    const expertise = expertiseResult.data?.filter(e => e.domain_id === domain.id) || [];
    const aiOutputs = tasksResult.data?.filter(t => t.metadata?.domain_id === domain.id)
      .map(t => t.metadata) || [];
    
    return calculateDomainRisk(
      domain,
      coverage || { status: 'gap', decisions: [], blockers: [] },
      expertise,
      blueprintResult.data,
      aiOutputs
    );
  }) || [];
  
  // Apply category filter if specified
  const filteredScores = category_filter
    ? domainScores.map(s => ({
        ...s,
        overall_score: s.category_scores[category_filter]
      }))
    : domainScores;
  
  const risk = calculateBlueprintRisk(blueprintResult.data, filteredScores);
  
  return { success: true, risk };
}
```

---

## 9. Example: Robotics Battery + Actuator

### 9.1 Scenario

**Blueprint:** HomeBot Robot Vacuum  
**Stage:** EVT  
**Two High-Risk Domains:** Battery Management, Actuator Control

### 9.2 Battery Management Domain Risk

```typescript
const batteryRisk: DomainRiskScore = {
  domain_id: 'domain-battery-001',
  domain_name: 'Battery Management',
  overall_score: 4.2,
  category_scores: {
    technical_feasibility: 2.5,  // Novel lithium chemistry, unvalidated charge algorithm
    supply_chain: 4.0,             // Single-source battery cells, 16-week lead time
    regulatory: 3.5,                 // UN38.3 testing not started, UL certification timeline
    safety: 3.0,                   // Battery safety analysis incomplete
    schedule: 2.0,                 // EVT deadline approaching
    cost: 2.5,                     // BOM cost 15% over target
    quality: 2.0,                   // Reliability testing planned but not started
    integration: 1.5               // Power management integration concerns
  },
  factors: [
    {
      factor_id: 'single_source_cells',
      category: 'supply_chain',
      description: 'Single-source supplier for 18650 cells (Company X); no alternate qualified',
      contribution: 2.0,
      source: 'blueprint_suppliers'
    },
    {
      factor_id: 'long_lead_time',
      category: 'supply_chain',
      description: 'Battery cells have 16-week lead time; EVT deadline in 8 weeks',
      contribution: 2.0,
      source: 'supplier_lead_times'
    },
    {
      factor_id: 'un38.3_not_started',
      category: 'regulatory',
      description: 'UN38.3 transportation certification testing not yet initiated',
      contribution: 2.0,
      source: 'blueprint_domain_coverage.blockers'
    },
    {
      factor_id: 'charge_algorithm_unvalidated',
      category: 'technical_feasibility',
      description: 'Custom charge algorithm for fast charging not validated with cell supplier',
      contribution: 1.5,
      source: 'blueprint_domain_coverage.decisions (assumption)'
    },
    {
      factor_id: 'expert_unverified',
      category: 'technical_feasibility',
      description: 'Battery expert (external contractor) expertise not verified',
      contribution: 0.5,
      source: 'blueprint_expertise.verification_status'
    }
  ],
  mitigations: [
    {
      action: 'Qualify second battery cell supplier',
      reduces_score_by: 1.5,
      task_id: null
    },
    {
      action: 'Initiate UN38.3 testing with certified lab',
      reduces_score_by: 1.2,
      task_id: 'task-rfq-battery-cert'
    },
    {
      action: 'Request cell manufacturer validation of charge algorithm',
      reduces_score_by: 0.8,
      task_id: null
    }
  ],
  trend: 'worsening' // Lead time concern increasing as EVT approaches
};
```

### 9.3 Actuator Control Domain Risk

```typescript
const actuatorRisk: DomainRiskScore = {
  domain_id: 'domain-actuator-001',
  domain_name: 'Actuator Control (Motors & Drives)',
  overall_score: 3.8,
  category_scores: {
    technical_feasibility: 4.5,   // Novel brushless motor control with custom FOC algorithm
    supply_chain: 2.5,              // Multiple motor suppliers available
    regulatory: 1.0,                 // Standard EMC requirements
    safety: 2.0,                    // Motor safety analysis in progress
    schedule: 2.0,                  // On track but tight
    cost: 3.0,                      // Custom motor driver ASIC NRE higher than budgeted
    quality: 3.5,                   // Motor life testing showing variability
    integration: 3.0                // Motor control integration with navigation system
  },
  factors: [
    {
      factor_id: 'custom_foc_algorithm',
      category: 'technical_feasibility',
      description: 'Custom FOC algorithm not validated against all operating conditions',
      contribution: 2.0,
      source: 'blueprint_domain_coverage.decisions (assumption)'
    },
    {
      factor_id: 'motor_asic_nre',
      category: 'cost',
      description: 'Custom motor driver ASIC NRE $150K over budget (3 mask revisions)',
      contribution: 1.5,
      source: 'blueprint_domain_coverage.blockers'
    },
    {
      factor_id: 'motor_life_variance',
      category: 'quality',
      description: 'Early motor life testing showing 2x variance in brush wear',
      contribution: 2.0,
      source: 'blueprint_domain_coverage.blockers'
    },
    {
      factor_id: 'ai_low_confidence',
      category: 'technical_feasibility',
      description: 'AI-generated motor specifications have 62% confidence score',
      contribution: 1.0,
      source: 'tasks.metadata.provenance.ai_context.confidence'
    },
    {
      factor_id: 'integration_navigation',
      category: 'integration',
      description: 'Motor control integration with navigation system not fully tested',
      contribution: 1.5,
      source: 'blueprint_domain_coverage.blockers'
    }
  ],
  mitigations: [
    {
      action: 'Conduct comprehensive FOC validation across temperature range',
      reduces_score_by: 1.2,
      task_id: 'task-foc-validation'
    },
    {
      action: 'Evaluate off-the-shelf motor driver IC alternatives',
      reduces_score_by: 1.0,
      task_id: null
    },
    {
      action: 'Request motor supplier root cause analysis on brush wear variance',
      reduces_score_by: 0.8,
      task_id: null
    }
  ],
  trend: 'stable'
};
```

### 9.4 Combined Blueprint Risk Display

```
┌─────────────────────────────────────────────────────────────────────┐
│ HomeBot Robot Vacuum - Risk Overview                     Stage: EVT │
├─────────────────────────────────────────────────────────────────────┤
│ Overall Risk: ████████████████░░░░ 3.6 (Moderate)                   │
├─────────────────────────────────────────────────────────────────────┤
│ Category Breakdown:                                                  │
│   Technical Feasibility  ████████████████░░░░ 3.8                  │
│   Supply Chain           ████████████████░░░░ 3.5                  │
│   Regulatory             ██████████████░░░░░░ 2.8                  │
│   Cost                   ████████████░░░░░░░░ 2.4                  │
│   Quality                ████████████░░░░░░░░ 2.4                  │
│   Safety                 ████████████░░░░░░░░ 2.3                  │
│   Schedule               ████████░░░░░░░░░░ 1.8                  │
│   Integration            ████████░░░░░░░░░░ 1.7                  │
├─────────────────────────────────────────────────────────────────────┤
│ ⚠️ High-Risk Domains:                                                │
│   • Battery Management (4.2) - Single-source cells, UN38.3 testing  │
│   • Actuator Control (3.8) - Custom FOC validation, motor life      │
├─────────────────────────────────────────────────────────────────────┤
│ 📋 Recommended Actions:                                              │
│   1. Qualify second battery cell supplier                           │
│   2. Initiate UN38.3 testing with certified lab                     │
│   3. Conduct FOC validation across temperature range                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Edge Cases

### EC-01: No Coverage Data

**Scenario:** Blueprint instantiated but no coverage audits performed yet.

**Handling:**
1. All domains default to `status: 'gap'`
2. Risk score = maximum (5.0) for all gap domains
3. Show prominent banner: "Complete coverage audit to see accurate risk assessment"
4. Don't show heatmap toggle until at least 25% domains audited

---

### EC-02: All Domains Covered

**Scenario:** Blueprint where all domains have `status: 'covered'`.

**Handling:**
1. Risk scores still computed (other factors like blockers, AI confidence)
2. Minimum score may still be > 0 due to stage multiplier or pending decisions
3. Show success state: "Excellent coverage! Monitor for emerging risks."

---

### EC-03: Stage Regression After Risk Acknowledgment

**Scenario:** User acknowledged risk at DVT stage, then regressed blueprint to EVT.

**Handling:**
1. Risk acknowledgments remain valid (stored with timestamp)
2. Show indicator: "Risk acknowledged at DVT stage (now EVT)"
3. Consider prompting re-acknowledgment if score changed significantly
4. Log stage regression in acknowledgment context

---

### EC-04: Risk Score Changes Between Page Loads

**Scenario:** User sees risk = 3.5, refreshes, now sees 4.0.

**Handling:**
1. This is expected (compute-on-read means inputs may change)
2. Show timestamp: "Risk calculated at {time}"
3. Consider showing trend indicator if significant change detected
4. Store last-seen risk in session for comparison

---

### EC-05: Circular Dependencies in Risk Factors

**Scenario:** Domain A risk depends on Domain B coverage, Domain B risk depends on Domain A decisions.

**Handling:**
1. Compute risks independently per domain
2. Do not create cross-domain risk dependencies in calculation
3. Cross-domain relationships are advisory only
4. Flag in UI: "Related risks in {Domain B}"

---

### EC-06: Template Without Risk Metadata

**Scenario:** Older template domains lack `stage_relevance` metadata.

**Handling:**
1. Use default stage relevance: `{ relevance: 'active', min_status: null }`
2. Apply criticality-based fallback (critical domains = higher weight)
3. Log warning for template maintenance
4. Risk calculation proceeds with defaults

---

### EC-07: Extremely Long Blocker List

**Scenario:** Domain has 50+ blockers entered.

**Handling:**
1. Cap blocker contribution at 5 items (top severity)
2. Remaining blockers counted but not individually weighted
3. Show warning: "50 blockers identified. Showing top 5 by severity."
4. Suggest consolidation: "Consider grouping related blockers"

---

### EC-08: AI Confidence = 0% or Missing

**Scenario:** AI output exists but confidence is 0 or not recorded.

**Handling:**
1. Treat as maximum uncertainty (confidence = 0)
2. Add factor: "AI output lacks confidence score"
3. Risk contribution capped at 1.5 (don't over-penalize)
4. Suggest: "Request AI regeneration with confidence scoring"

---

### EC-09: User Acknowledges All High Risks

**Scenario:** All high-risk domains have acknowledgments with `accepted: true`.

**Handling:**
1. Display acknowledgment status on heatmap (green checkmark overlay)
2. Risk register shows "Acknowledged" status
3. Overall score unchanged (risk still exists, just accepted)
4. Stage gate: Log acknowledgments as override documentation

---

### EC-10: Conflicting Risk Categories

**Scenario:** Technical feasibility risk is low (2.0) but supply chain risk is severe (5.0).

**Handling:**
1. Overall score is weighted average (may show moderate overall)
2. Show breakdown clearly: "Supply Chain: 5.0 (Severe)"
3. Category-specific filter highlights the severe risk
4. Stage gate criteria can be set per-category

---

### EC-11: Risk Score = 0 for Critical Domain

**Scenario:** Critical domain has `status: 'covered'`, no blockers, verified expert.

**Handling:**
1. Score can legitimately be 0 or near-0
2. Still shown in heatmap with green coloring
3. Consider adding "confidence in coverage" factor to prevent false negatives
4. Periodic review prompt: "Last updated X days ago"

---

### EC-12: External Dependencies Not in Blueprint

**Scenario:** Critical dependency (e.g., contract manufacturer) exists outside blueprint domain structure.

**Handling:**
1. Dependencies are tracked in `blueprint_suppliers` (existing table)
2. Add dependency risk factors via `blueprint_suppliers` data
3. Consider creating "External Dependencies" pseudo-domain
4. Document limitation: "Some risks not captured in domain structure"

---

## 11. Implementation Checklist

### 11.1 Backend

- [ ] Create `calculateDomainRisk()` utility function
- [ ] Create `calculateBlueprintRisk()` aggregate function
- [ ] Implement `getBlueprintRiskAssessment` server action
- [ ] Add blocker severity parsing utility
- [ ] Add AI confidence extraction from task metadata
- [ ] Implement risk acknowledgment storage in blueprint metadata
- [ ] Add `acknowledgeRisk` server action
- [ ] Add analytics event `risk_acknowledged`

### 11.2 Frontend

- [ ] Create `RiskHeatmapToggle` component
- [ ] Create `DomainRiskTooltip` component
- [ ] Create `RiskRegisterTable` component
- [ ] Create `RiskAcknowledgmentDialog` component
- [ ] Create `RiskSummaryCard` dashboard widget
- [ ] Create `RiskLegend` component
- [ ] Integrate risk colors into `DomainNode` component
- [ ] Add category filter to heatmap view

### 11.3 Testing

- [ ] Unit test risk calculation with various input combinations
- [ ] Test stage multiplier effects
- [ ] Test blocker severity parsing
- [ ] Test AI confidence normalization
- [ ] E2E test heatmap toggle and display
- [ ] E2E test risk acknowledgment flow
- [ ] Performance test risk calculation for large blueprints (100+ domains)

### 11.4 Analytics Events

| Event | Properties | Trigger |
|-------|------------|---------|
| `risk_heatmap_viewed` | `blueprint_id`, `category_filter`, `overall_score` | Toggle heatmap on |
| `risk_domain_inspected` | `blueprint_id`, `domain_id`, `risk_score` | Hover/click domain in heatmap |
| `risk_acknowledged` | `blueprint_id`, `domain_id`, `risk_score`, `accepted`, `has_plan` | Submit acknowledgment |
| `risk_register_exported` | `blueprint_id`, `domain_count`, `high_risk_count` | Export button clicked |

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/11-risk-heatmap.md` | Created — Full risk heatmap and register specification with 8 risk categories, scoring rubric, inputs, UI patterns, storage strategy, worked example, and 12 edge cases |
| `docs/blueprint/INDEX.md` | Updated — Added Risk Category enum and Risk Severity scale (0-5) |
| `docs/blueprint/ORCHESTRATION.md` | Updated — Marked Step 11 complete |
