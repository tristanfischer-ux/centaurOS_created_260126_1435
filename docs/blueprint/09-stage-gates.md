# Stage Gates & Readiness Model

> **Step 9 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-9

---

## Table of Contents
1. [Overview](#1-overview)
2. [Canonical Stage Definitions](#2-canonical-stage-definitions)
3. [Domain-Level Readiness Model](#3-domain-level-readiness-model)
4. [Stage-Aware Behavior](#4-stage-aware-behavior)
5. [UX Behavior](#5-ux-behavior)
6. [Data Implications](#6-data-implications)
7. [Edge Cases](#7-edge-cases)
8. [Implementation Checklist](#8-implementation-checklist)

---

## 1. Overview

### 1.1 Purpose

Stage gates provide a structured framework for hardware product development, ensuring that appropriate expertise coverage, decisions, and artifacts exist before progressing to the next phase. The Manufacturing Blueprint uses stages to:

1. **Filter content** — Show stage-appropriate questions, risks, and domains
2. **Gate progression** — Warn when critical gaps remain at stage transitions
3. **Focus attention** — Prioritize domains relevant to the current stage
4. **Generate appropriate output** — Tailor expert packets, RFQs, and risks to stage context

### 1.2 Canonical Enum

**Source:** `blueprints.project_stage` (existing database enum)

```sql
-- DO NOT MODIFY: Existing enum in production
CREATE TYPE project_stage AS ENUM (
  'concept',
  'prototype', 
  'evt',
  'dvt',
  'production',
  'launched'
);
```

**CRITICAL:** All implementations MUST use these exact values. Do not introduce new stages or aliases.

---

## 2. Canonical Stage Definitions

### 2.1 Stage: `concept`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Validate product-market fit and technical feasibility before committing resources |
| **Typical Duration** | 1-3 months |
| **Investment Level** | Low (< $50K) |

#### Entry Criteria
- [ ] Product idea documented
- [ ] Target customer identified
- [ ] Initial market validation (interviews, surveys, or equivalent)

#### Exit Criteria (to `prototype`)
- [ ] Technical feasibility assessed for critical domains
- [ ] Bill of materials (BOM) estimated (±50% accuracy)
- [ ] Key regulatory requirements identified
- [ ] Make vs. buy decisions for critical subsystems
- [ ] No "gap" status on domains marked `criticality: 'critical'` (can be `'partial'`)

#### Typical Artifacts (Hardware-Oriented)
| Artifact | Domain Category | Required |
|----------|-----------------|----------|
| Product specification document | Product Definition | Yes |
| Block diagram (system architecture) | Systems Engineering | Yes |
| Competitive analysis | Market Research | Yes |
| Initial BOM estimate | Supply Chain | Yes |
| Regulatory landscape memo | Regulatory & Compliance | Yes |
| Technical feasibility notes | All technical domains | No |
| Market size analysis | Business Operations | No |

---

### 2.2 Stage: `prototype`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Prove core technical concepts with functional prototype(s) |
| **Typical Duration** | 2-6 months |
| **Investment Level** | Medium ($50K-$250K) |

#### Entry Criteria
- [ ] Concept stage exit criteria met
- [ ] Funding/budget secured for prototype builds
- [ ] Core team or contractors identified for key domains

#### Exit Criteria (to `evt`)
- [ ] At least one functional prototype built
- [ ] Core functionality demonstrated
- [ ] Critical technical risks resolved or mitigated
- [ ] Preliminary design specifications documented
- [ ] Supply chain strategy for critical components
- [ ] All `criticality: 'critical'` domains have `status: 'covered'` or `'partial'` with documented plan

#### Typical Artifacts (Hardware-Oriented)
| Artifact | Domain Category | Required |
|----------|-----------------|----------|
| Prototype hardware (breadboard/dev kit) | Electronics | Yes |
| Firmware proof-of-concept | Software & Firmware | Yes |
| Mechanical concept models (3D prints) | Mechanical Engineering | Yes |
| User testing results | Product Definition | Yes |
| Component selection rationale | Electronics | Yes |
| Power budget analysis | Electronics | No |
| Initial thermal analysis | Mechanical Engineering | No |
| Test plan outline | Quality & Testing | No |

---

### 2.3 Stage: `evt` (Engineering Validation Test)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Validate engineering design meets functional requirements |
| **Typical Duration** | 2-4 months |
| **Investment Level** | Medium-High ($100K-$500K) |

#### Entry Criteria
- [ ] Prototype stage exit criteria met
- [ ] Detailed design specifications complete
- [ ] Contract manufacturers (CM) identified for quoting
- [ ] Tooling strategy defined

#### Exit Criteria (to `dvt`)
- [ ] EVT units manufactured (typically 10-50 units)
- [ ] All critical functional tests passed
- [ ] Design issues documented with fixes planned
- [ ] Initial reliability testing started
- [ ] Regulatory pre-compliance testing complete (if applicable)
- [ ] All `criticality: 'critical'` domains have `status: 'covered'`
- [ ] No blockers with `severity: 'critical'` on any domain

#### Typical Artifacts (Hardware-Oriented)
| Artifact | Domain Category | Required |
|----------|-----------------|----------|
| EVT build units | Manufacturing | Yes |
| Engineering drawings (released) | Mechanical Engineering | Yes |
| PCB layout (released) | Electronics | Yes |
| Firmware (feature-complete) | Software & Firmware | Yes |
| Functional test report | Quality & Testing | Yes |
| EVT issue tracker | Quality & Testing | Yes |
| Thermal test results | Mechanical Engineering | Yes |
| EMC pre-scan results | Regulatory & Compliance | Yes (if wireless) |
| CM quotes | Supply Chain | Yes |
| Assembly instructions draft | Manufacturing | No |

---

### 2.4 Stage: `dvt` (Design Validation Test)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Validate production-intent design meets all requirements at scale |
| **Typical Duration** | 2-4 months |
| **Investment Level** | High ($250K-$1M+) |

#### Entry Criteria
- [ ] EVT stage exit criteria met
- [ ] All EVT issues resolved
- [ ] Production tooling ordered/received
- [ ] CM selected and contracted
- [ ] Regulatory certification strategy finalized

#### Exit Criteria (to `production`)
- [ ] DVT units manufactured (typically 50-500 units)
- [ ] All reliability tests passed
- [ ] Regulatory certifications submitted or approved
- [ ] Production processes validated
- [ ] Packaging design finalized
- [ ] All domains have `status: 'covered'` or `'not_needed'`
- [ ] No open blockers with `severity: 'high'` or `'critical'`

#### Typical Artifacts (Hardware-Oriented)
| Artifact | Domain Category | Required |
|----------|-----------------|----------|
| DVT build units | Manufacturing | Yes |
| Reliability test reports | Quality & Testing | Yes |
| Certification test reports | Regulatory & Compliance | Yes |
| Production test procedures | Manufacturing | Yes |
| Final assembly instructions | Manufacturing | Yes |
| Packaging specifications | Manufacturing | Yes |
| User documentation (draft) | Product Definition | Yes |
| Service/repair procedures | Customer Support | No |
| Supplier quality agreements | Supply Chain | Yes |

---

### 2.5 Stage: `production`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Scale manufacturing and prepare for market launch |
| **Typical Duration** | 1-3 months |
| **Investment Level** | High ($500K-$5M+) |

#### Entry Criteria
- [ ] DVT stage exit criteria met
- [ ] All regulatory certifications received
- [ ] Production line validated (pilot run successful)
- [ ] Inventory/supply chain ready

#### Exit Criteria (to `launched`)
- [ ] PVT (Production Validation Test) complete
- [ ] First article inspection passed
- [ ] Yield rates meet target (typically >95%)
- [ ] Customer support processes in place
- [ ] Sales channels ready
- [ ] All domains have `status: 'covered'`

#### Typical Artifacts (Hardware-Oriented)
| Artifact | Domain Category | Required |
|----------|-----------------|----------|
| PVT build units | Manufacturing | Yes |
| First article inspection report | Quality & Testing | Yes |
| Production yield data | Manufacturing | Yes |
| Certification marks applied | Regulatory & Compliance | Yes |
| Final packaging | Manufacturing | Yes |
| User documentation (final) | Product Definition | Yes |
| Warranty policy | Customer Support | Yes |
| RMA procedures | Customer Support | Yes |
| Marketing materials | Business Operations | Yes |

---

### 2.6 Stage: `launched`

| Attribute | Value |
|-----------|-------|
| **Purpose** | Product in market; focus on sustaining engineering and iteration |
| **Typical Duration** | Ongoing |
| **Investment Level** | Varies (sustaining) |

#### Entry Criteria
- [ ] Production stage exit criteria met
- [ ] Product available for purchase
- [ ] Customer support operational

#### No Exit Criteria (terminal stage)

#### Typical Artifacts (Hardware-Oriented)
| Artifact | Domain Category | Frequency |
|----------|-----------------|-----------|
| Field failure reports | Quality & Testing | Ongoing |
| Customer feedback analysis | Product Definition | Monthly |
| Engineering change orders (ECOs) | All technical | As needed |
| Firmware updates | Software & Firmware | As needed |
| Cost reduction initiatives | Supply Chain | Quarterly |
| Regulatory compliance monitoring | Regulatory & Compliance | Ongoing |

---

## 3. Domain-Level Readiness Model

### 3.1 Coverage Status Meaning by Stage

The meaning of `blueprint_domain_coverage.status` values changes contextually based on the current `project_stage`:

| Status | `concept` | `prototype` | `evt` | `dvt` | `production` | `launched` |
|--------|-----------|-------------|-------|-------|--------------|------------|
| **`covered`** | Expert identified; can answer questions | Expert engaged; design decisions captured | Formal documentation complete; tests passing | Production-ready; validated | In production; sustaining | Maintained |
| **`partial`** | Some knowledge; gaps in key areas | Work in progress; key questions open | Some tests failing; issues tracked | Minor open items; workarounds documented | Process improvements identified | Known limitations |
| **`gap`** | No expertise; unknown unknowns | Critical blocker; needs expert engagement | Blocking issue; design incomplete | Certification blocker | Production cannot proceed | Support gap |
| **`not_needed`** | Explicitly scoped out | N/A to this product | N/A | N/A | N/A | N/A |

### 3.2 Readiness Blockers

**Table:** `blueprint_domain_coverage.blockers` (existing `TEXT[]` column)

Blockers are free-text strings that describe what's preventing a domain from reaching `'covered'` status. The stage context determines blocker severity:

```typescript
// Blocker structure (recommended convention)
interface Blocker {
  text: string;           // Description of the blocker
  severity?: 'low' | 'medium' | 'high' | 'critical';
  stage_relevant?: ProjectStage[];  // Stages where this blocker is critical
}

// Since blockers is TEXT[], encode as: "severity:stage1,stage2:description"
// Example: "high:evt,dvt:Thermal testing not completed"
// Simple format: Just the description text (legacy, severity assumed 'medium')
```

**Stage-Relevant Blocker Rules:**

| Blocker Severity | Effect at Current Stage | Effect at Future Stage |
|------------------|-------------------------|------------------------|
| `critical` | Blocks stage advancement | Warning badge |
| `high` | Warning; requires acknowledgment | Informational |
| `medium` | Informational | Hidden |
| `low` | Hidden unless filtered | Hidden |

### 3.3 Minimum Artifacts per Domain per Stage

Use the existing `blueprint_milestones` table to define stage-specific artifact requirements:

**Table:** `blueprint_milestones` (existing)

```sql
-- Existing schema
CREATE TABLE blueprint_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  required_domain_ids UUID[],  -- Domains that must be 'covered'
  foundry_id UUID NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Stage-Milestone Mapping Strategy:**

Templates should seed milestones that correspond to stage transitions:

```sql
-- Example: Template milestone for EVT stage gate
INSERT INTO blueprint_milestones (blueprint_id, name, description, required_domain_ids) VALUES (
  $blueprint_id,
  'EVT Readiness Gate',
  'Required coverage to enter EVT stage',
  ARRAY['domain-uuid-thermal', 'domain-uuid-emc', 'domain-uuid-pcb']::UUID[]
);
```

### 3.4 Domain Stage Relevance

**Enhancement to `knowledge_domains.metadata`:**

Templates can specify which stages a domain becomes "active" (relevant):

```json
// knowledge_domains.metadata JSONB extension
{
  "stage_relevance": {
    "concept": { "relevance": "informational", "min_status": null },
    "prototype": { "relevance": "active", "min_status": "partial" },
    "evt": { "relevance": "critical", "min_status": "covered" },
    "dvt": { "relevance": "critical", "min_status": "covered" },
    "production": { "relevance": "critical", "min_status": "covered" },
    "launched": { "relevance": "sustaining", "min_status": "covered" }
  },
  "required_artifacts": {
    "concept": ["feasibility_notes"],
    "prototype": ["design_spec"],
    "evt": ["test_report", "design_release"],
    "dvt": ["validation_report"],
    "production": ["production_process"],
    "launched": []
  }
}
```

**Relevance Levels:**
- `informational` — Shown but not required for stage completion
- `active` — Should be addressed; appears in "focus" list
- `critical` — Must be `covered` to advance stage
- `sustaining` — Ongoing maintenance; monitor for issues
- `not_applicable` — Hidden for this stage

---

## 4. Stage-Aware Behavior

### 4.1 Expert Packets

Expert packet generation varies by stage to produce relevant, actionable questions:

| Stage | Expert Packet Focus | Question Style | Expected Deliverables |
|-------|---------------------|----------------|----------------------|
| `concept` | Feasibility & discovery | "Is it possible to...?" "What are the options for...?" | Feasibility memo, technology options, rough estimates |
| `prototype` | Design guidance | "How should we implement...?" "What are the tradeoffs between...?" | Design recommendations, component selection, block diagrams |
| `evt` | Validation & testing | "Does our design meet...?" "What tests are required for...?" | Test plans, issue analysis, design feedback |
| `dvt` | Qualification & certification | "Will this pass...?" "What documentation is needed for...?" | Certification guidance, audit findings, final validations |
| `production` | Manufacturing & yield | "How do we scale...?" "What are the process controls for...?" | Process specs, yield improvement, SPC plans |
| `launched` | Sustaining & improvement | "How do we address...?" "What's causing...?" | Root cause analysis, ECO recommendations, cost reductions |

**Expert Packet Template Structure:**

```markdown
## Expert Packet: {domain_name}
**Project:** {blueprint_name}
**Stage:** {project_stage}
**Generated:** {timestamp}

### Context
{ai_generated_context from blueprint}
{product description}

### Stage-Specific Focus
{stage_focus_description}

### Questions
{questions filtered by stage from key_questions}

### Artifacts to Request
{required_artifacts for current stage}

### Red Flags to Watch For
{stage-appropriate warnings}

### Budget/Timeline Context
{from blueprint metadata if available}
```

### 4.2 Primers (Domain Overview Documents)

Primers provide foundational knowledge for a domain. Content varies by stage:

| Stage | Primer Depth | Audience Assumption |
|-------|--------------|---------------------|
| `concept` | High-level overview | Founder with limited domain knowledge |
| `prototype` | Technical introduction | Engineer exploring the domain |
| `evt` | Detailed specifications | Engineer implementing the design |
| `dvt` | Validation checklists | Test engineer or compliance expert |
| `production` | Process requirements | Manufacturing engineer |
| `launched` | Troubleshooting guides | Support or sustaining engineer |

### 4.3 Risk Assessment

Risk scores (`DomainRiskScore`) are computed with stage weighting:

```typescript
interface DomainRiskScore {
  domain_id: string;
  risk_score: number; // 0-5
  factors: {
    coverage_gap: boolean;
    is_critical: boolean;
    has_blockers: boolean;
    stage_relevant: boolean;
    approaching_deadline: boolean; // milestone target_date
  };
  stage_multiplier: number; // Increases as stage advances
}

// Risk calculation
function computeDomainRisk(
  domain: DomainCoverage,
  stage: ProjectStage,
  milestone?: BlueprintMilestone
): DomainRiskScore {
  const stageMultipliers: Record<ProjectStage, number> = {
    concept: 0.5,
    prototype: 0.75,
    evt: 1.0,
    dvt: 1.25,
    production: 1.5,
    launched: 1.0 // Sustaining mode
  };

  let baseScore = 0;
  
  // Coverage factor (0-2 points)
  if (domain.status === 'gap') baseScore += 2;
  else if (domain.status === 'partial') baseScore += 1;
  
  // Criticality factor (0-2 points)
  if (domain.is_critical) baseScore += 2;
  
  // Blocker factor (0-1 point)
  if (domain.blockers?.length > 0) baseScore += 1;
  
  // Apply stage multiplier
  const adjustedScore = Math.min(5, baseScore * stageMultipliers[stage]);
  
  return {
    domain_id: domain.domain_id,
    risk_score: Math.round(adjustedScore * 10) / 10,
    factors: {
      coverage_gap: domain.status === 'gap',
      is_critical: domain.is_critical,
      has_blockers: (domain.blockers?.length ?? 0) > 0,
      stage_relevant: isStageRelevant(domain, stage),
      approaching_deadline: milestone ? isApproachingDeadline(milestone) : false
    },
    stage_multiplier: stageMultipliers[stage]
  };
}
```

### 4.4 RFQ Generation

RFQ starter packs are tailored to stage context:

| Stage | RFQ Type | Typical Content |
|-------|----------|-----------------|
| `concept` | Budgetary quote | Rough specifications, quantity ranges, timeline flexibility |
| `prototype` | Development quote | Detailed specs, NRE breakdown, samples required |
| `evt` | Production quote | Final specs, tooling costs, lead times, MOQ |
| `dvt` | Production confirmation | Volume pricing, capacity confirmation, quality requirements |
| `production` | Volume order | Firm PO, delivery schedules, quality agreements |
| `launched` | Sustaining / cost reduction | ECO implementation, alternate sources, cost targets |

**RFQ Stage Gating:**

```typescript
// Minimum requirements to generate RFQ by stage
const RFQ_STAGE_REQUIREMENTS: Record<ProjectStage, RFQGateRequirements> = {
  concept: {
    minDomainStatus: null, // Can request budgetary quotes with gaps
    requiredDecisions: [],
    warning: 'Early-stage RFQ - specifications may change significantly'
  },
  prototype: {
    minDomainStatus: 'partial',
    requiredDecisions: ['component_selection'],
    warning: 'Design not finalized - quote for development only'
  },
  evt: {
    minDomainStatus: 'partial',
    requiredDecisions: ['component_selection', 'design_spec'],
    warning: null
  },
  dvt: {
    minDomainStatus: 'covered',
    requiredDecisions: ['component_selection', 'design_spec', 'test_criteria'],
    warning: null
  },
  production: {
    minDomainStatus: 'covered',
    requiredDecisions: ['component_selection', 'design_spec', 'test_criteria', 'supplier_qualification'],
    warning: null
  },
  launched: {
    minDomainStatus: 'covered',
    requiredDecisions: ['component_selection'],
    warning: 'Production active - coordinate with existing suppliers'
  }
};
```

---

## 5. UX Behavior

### 5.1 Stage Selection / Change

**Location:** Blueprint detail page header

```tsx
// Blueprint stage selector component
<StageSelector
  currentStage={blueprint.project_stage}
  onStageChange={handleStageChange}
  canAdvance={stageGateStatus.canAdvance}
  blockers={stageGateStatus.blockers}
/>
```

**Stage Change Flow:**

1. User clicks stage selector (dropdown showing all stages)
2. System checks if current stage exit criteria are met
3. **If advancing (forward):**
   - If criteria met: Show confirmation dialog with summary
   - If criteria NOT met: Show warning dialog with blockers list
   - User can "Advance Anyway" with acknowledgment (logged to `blueprint_history`)
4. **If regressing (backward):**
   - Show warning: "Regressing will re-open resolved domains"
   - Require confirmation with reason (logged)
5. On confirm: Update `blueprints.project_stage`, fire `stage_advanced` analytics event
6. UI refreshes to show stage-appropriate content

**Stage Selector Visual:**

```
┌────────────────────────────────────────────────────────────────────┐
│  ○ Concept  ──  ● Prototype  ──  ○ EVT  ──  ○ DVT  ──  ○ Prod     │
│                     ↑                                               │
│                 [Current]                                           │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 Stage Impact on Map View

The mind-map/domain tree view changes based on stage:

| UI Element | Stage Influence |
|------------|-----------------|
| **Domain visibility** | Domains with `stage_relevance: 'not_applicable'` are collapsed/hidden |
| **Domain highlight** | Domains with `stage_relevance: 'critical'` are highlighted |
| **Status color intensity** | Gaps in critical domains show stronger warning color |
| **Filter presets** | Default filter shows "Stage-Relevant Domains" |
| **Risk overlay** | Risk scores weighted by stage multiplier |

**Filter Dropdown Options:**

```tsx
const STAGE_FILTERS = [
  { value: 'all', label: 'All Domains' },
  { value: 'stage_relevant', label: 'Stage-Relevant Domains' },
  { value: 'critical_for_stage', label: 'Critical for {current_stage}' },
  { value: 'gaps_only', label: 'Gaps Only' },
  { value: 'blockers_only', label: 'With Blockers' },
];
```

### 5.3 Domain Panel Stage Context

When opening a domain detail panel, stage context is prominent:

```tsx
// DomainDetailPanel header section
<div className="domain-panel-header">
  <h2>{domain.name}</h2>
  <div className="stage-context">
    <Badge variant={getStageRelevanceBadge(domain, currentStage)}>
      {domain.metadata.stage_relevance[currentStage].relevance}
    </Badge>
    {domain.metadata.stage_relevance[currentStage].min_status && (
      <span className="text-muted-foreground">
        Required: {domain.metadata.stage_relevance[currentStage].min_status}
      </span>
    )}
  </div>
</div>

// Required artifacts for current stage
<div className="required-artifacts">
  <h3>Required for {currentStage}</h3>
  <ul>
    {domain.metadata.required_artifacts[currentStage].map(artifact => (
      <li key={artifact}>
        <Checkbox checked={hasArtifact(artifact)} />
        {artifact}
      </li>
    ))}
  </ul>
</div>
```

### 5.4 Stage Gate Dashboard

A dashboard widget showing stage gate status:

```tsx
<StageGateDashboard blueprint={blueprint}>
  <StageGateProgress 
    currentStage={blueprint.project_stage}
    exitCriteria={getExitCriteria(blueprint.project_stage)}
    criteriaStatus={evaluateExitCriteria(blueprint)}
  />
  <StageBlockersList 
    blockers={getStageBlockers(blueprint)}
    severity="high"
  />
  <StageReadinessScore 
    score={calculateStageReadiness(blueprint)}
    threshold={0.8}
  />
</StageGateDashboard>
```

### 5.5 Stage Advancement Warning Dialog

```tsx
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>
        Advance to {nextStage}?
      </AlertDialogTitle>
      <AlertDialogDescription>
        {canAdvance ? (
          "All exit criteria for the current stage have been met."
        ) : (
          "The following exit criteria are NOT met:"
        )}
      </AlertDialogDescription>
    </AlertDialogHeader>
    
    {!canAdvance && (
      <div className="blockers-list">
        {unmetetCriteria.map(criteria => (
          <div key={criteria.id} className="blocker-item">
            <XCircle className="text-destructive" />
            <span>{criteria.description}</span>
          </div>
        ))}
      </div>
    )}
    
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        variant={canAdvance ? "default" : "destructive"}
        onClick={handleAdvance}
      >
        {canAdvance ? "Advance Stage" : "Advance Anyway"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 6. Data Implications

### 6.1 Schema Changes Required

**None required.** The existing schema supports all stage gate functionality:

| Table | Column | Status | Notes |
|-------|--------|--------|-------|
| `blueprints` | `project_stage` | ✅ Exists | Enum already defined |
| `blueprint_domain_coverage` | `blockers` | ✅ Exists | TEXT[] for blocker text |
| `blueprint_milestones` | `required_domain_ids` | ✅ Exists | For stage gate requirements |
| `knowledge_domains` | `metadata` | ✅ Exists | JSONB for stage_relevance |
| `blueprint_history` | `action`, `details` | ✅ Exists | For stage change logging |

### 6.2 Recommended Metadata Extensions

These are non-breaking additions to existing JSONB columns:

**`knowledge_domains.metadata` extension:**

```json
{
  "stage_relevance": {
    "concept": { "relevance": "informational", "min_status": null },
    "prototype": { "relevance": "active", "min_status": "partial" },
    "evt": { "relevance": "critical", "min_status": "covered" },
    "dvt": { "relevance": "critical", "min_status": "covered" },
    "production": { "relevance": "critical", "min_status": "covered" },
    "launched": { "relevance": "sustaining", "min_status": "covered" }
  },
  "required_artifacts": {
    "concept": [],
    "prototype": ["design_spec"],
    "evt": ["test_report"],
    "dvt": ["validation_report"],
    "production": ["process_spec"],
    "launched": []
  },
  "key_questions_by_stage": {
    "concept": [0, 1, 2],
    "prototype": [3, 4, 5],
    "evt": [6, 7, 8],
    "dvt": [9, 10],
    "production": [11],
    "launched": [12]
  }
}
```

**`blueprints.metadata` extension:**

```json
{
  "stage_history": [
    {
      "stage": "concept",
      "entered_at": "2026-01-15T10:00:00Z",
      "exited_at": "2026-02-01T14:30:00Z",
      "exit_criteria_met": true,
      "user_id": "uuid"
    }
  ],
  "stage_overrides": {
    "evt": {
      "skipped_criteria": ["thermal_test"],
      "override_reason": "Not applicable for software-only product",
      "overridden_by": "uuid",
      "overridden_at": "2026-02-01T15:00:00Z"
    }
  }
}
```

### 6.3 RLS Considerations

All stage gate operations inherit existing RLS policies:

```sql
-- Existing policy covers stage changes
CREATE POLICY "Users can update their foundry's blueprints"
ON blueprints FOR UPDATE
USING (foundry_id = get_my_foundry_id())
WITH CHECK (foundry_id = get_my_foundry_id());

-- blueprint_history logging is already foundry-scoped
CREATE POLICY "Users can view their foundry's blueprint history"
ON blueprint_history FOR SELECT
USING (foundry_id = get_my_foundry_id());
```

**Security Note:** Stage changes MUST be logged to `blueprint_history` with the user who made the change. This is already supported by the existing audit infrastructure.

### 6.4 Database Functions

**New function (optional optimization):**

```sql
-- Function to evaluate stage gate criteria
CREATE OR REPLACE FUNCTION evaluate_stage_gate(
  p_blueprint_id UUID,
  p_target_stage project_stage
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_current_stage project_stage;
  v_critical_gaps INTEGER;
  v_high_blockers INTEGER;
BEGIN
  -- Get current stage
  SELECT project_stage INTO v_current_stage
  FROM blueprints
  WHERE id = p_blueprint_id AND foundry_id = get_my_foundry_id();
  
  -- Count critical domain gaps
  SELECT COUNT(*) INTO v_critical_gaps
  FROM blueprint_domain_coverage bdc
  JOIN knowledge_domains kd ON bdc.domain_id = kd.id
  WHERE bdc.blueprint_id = p_blueprint_id
    AND bdc.status = 'gap'
    AND kd.criticality = 'critical';
  
  -- Count high/critical blockers
  SELECT COUNT(*) INTO v_high_blockers
  FROM blueprint_domain_coverage
  WHERE blueprint_id = p_blueprint_id
    AND array_length(blockers, 1) > 0;
  
  v_result := jsonb_build_object(
    'current_stage', v_current_stage,
    'target_stage', p_target_stage,
    'can_advance', (v_critical_gaps = 0),
    'critical_gaps', v_critical_gaps,
    'domains_with_blockers', v_high_blockers,
    'criteria', jsonb_build_array(
      jsonb_build_object('name', 'No critical gaps', 'met', v_critical_gaps = 0),
      jsonb_build_object('name', 'No blocking issues', 'met', v_high_blockers = 0)
    )
  );
  
  RETURN v_result;
END;
$$;
```

---

## 7. Edge Cases

### EC-01: Stage Regression

**Scenario:** User advances from `prototype` to `evt`, then realizes they need to go back to `prototype`.

**Handling:**
1. Show warning dialog: "Regressing stages may re-open resolved items"
2. Require reason for regression (free text)
3. Log regression to `blueprint_history` with reason
4. **Do NOT** automatically change domain statuses
5. Add informational banner: "Stage regressed from EVT on {date}. Some validations may no longer apply."

### EC-02: Partial Domain Readiness

**Scenario:** Domain has `status: 'partial'` but stage requires `'covered'`.

**Handling:**
1. Count as unmet exit criterion
2. Show in blockers list: "{Domain} requires 'covered' status for {stage}"
3. Allow advancement with acknowledgment
4. If advanced anyway, log the override

### EC-03: Stage Disagreement (Multi-User)

**Scenario:** User A believes product is ready for DVT; User B disagrees.

**Handling:**
1. Stage changes require specific role permissions (Founder, Executive)
2. Disagreements resolved through task/discussion workflows
3. Stage change logged with `user_id` for accountability
4. Consider adding "Proposed Stage Change" task type for formal review

### EC-04: Template Without Stage Metadata

**Scenario:** Older template domains don't have `stage_relevance` in metadata.

**Handling:**
1. Default behavior: All domains relevant at all stages
2. Use `criticality` as fallback: `'critical'` → always relevant
3. Log warning in dev console for template maintenance

```typescript
function getStageRelevance(domain: KnowledgeDomain, stage: ProjectStage): StageRelevance {
  if (domain.metadata?.stage_relevance?.[stage]) {
    return domain.metadata.stage_relevance[stage];
  }
  // Fallback: critical domains are always relevant
  return {
    relevance: domain.criticality === 'critical' ? 'critical' : 'active',
    min_status: domain.criticality === 'critical' ? 'partial' : null
  };
}
```

### EC-05: Skipping Stages

**Scenario:** Hardware startup wants to go directly from `concept` to `evt` (skipping `prototype`).

**Handling:**
1. Allow stage jumps with additional warning
2. Show all unmet criteria for skipped stages
3. Require reason: "Why are you skipping {stages}?"
4. Log skip to `blueprint_history`
5. Consider adding `stage_overrides` to blueprint metadata

### EC-06: Multiple Products at Different Stages

**Scenario:** Foundry has 3 blueprints at different stages (product variants).

**Handling:**
1. Each blueprint has independent `project_stage`
2. Dashboard shows summary: "1 in EVT, 2 in Prototype"
3. Cross-blueprint dependencies (if implemented) would need stage alignment warnings

### EC-07: Stage-Specific Questions Empty

**Scenario:** Domain has `key_questions` but none mapped to current stage.

**Handling:**
1. Show all questions as fallback
2. Display notice: "Questions shown for all stages (stage-specific not configured)"
3. Expert packet generation includes all questions with stage context

### EC-08: Blocker Persists Across Stages

**Scenario:** Blocker added at `concept` stage is still present at `dvt`.

**Handling:**
1. Blockers persist until explicitly resolved
2. Show staleness indicator: "Blocker added {X days ago} at {stage}"
3. Prompt review: "This blocker was added during concept stage. Is it still relevant?"

### EC-09: Certification Domain Before DVT

**Scenario:** User tries to generate RFQ for certification body during `prototype` stage.

**Handling:**
1. Show warning: "Certification RFQs are typically sent during DVT or later"
2. Allow generation with acknowledgment
3. Add context to RFQ: "Early-stage inquiry - design not finalized"

### EC-10: Launched Product Needs Redesign

**Scenario:** Field issue requires major redesign; need to "restart" at earlier stage.

**Handling:**
1. Option A: Regress existing blueprint to earlier stage (with full audit trail)
2. Option B: Create new blueprint version (recommended for major redesigns)
3. Link blueprints: Original → Redesign with relationship type
4. Preserve launched blueprint for historical reference

### EC-11: Stage Change During Active AI Task

**Scenario:** Expert packet task in progress (`Amended_Pending_Approval`); user changes stage.

**Handling:**
1. Task continues with original stage context
2. Add system comment: "Note: Blueprint stage changed to {new_stage} after this packet was generated"
3. User can regenerate packet with new stage context if needed

### EC-12: Conflicting Exit Criteria Across Domains

**Scenario:** Domain A ready for EVT, Domain B still needs prototype work.

**Handling:**
1. Stage gate evaluates ALL critical domains
2. Lowest common readiness determines actual gate status
3. Show breakdown: "3/5 critical domains ready"
4. Allow partial advancement with explicit acknowledgment of gaps

### EC-13: Milestone Date Passed Without Stage Advancement

**Scenario:** `blueprint_milestones.target_date` for "EVT Start" has passed, but blueprint still in `prototype`.

**Handling:**
1. Show overdue indicator on milestone
2. Surface in dashboard: "Milestone 'EVT Start' overdue by {X days}"
3. Consider adding notification/email trigger
4. Allow milestone date adjustment with reason

---

## 8. Implementation Checklist

### 8.1 Backend

- [ ] Add `evaluate_stage_gate()` database function
- [ ] Extend `clone_blueprint_from_template()` to copy stage metadata
- [ ] Add stage change logging to `blueprint_history`
- [ ] Implement stage-filtered queries for domain retrieval
- [ ] Add stage context to expert packet generation prompts

### 8.2 Frontend

- [ ] Create `StageSelector` component
- [ ] Create `StageGateDashboard` widget
- [ ] Implement stage advancement warning dialog
- [ ] Add stage context to `DomainDetailPanel`
- [ ] Implement stage-based filtering in domain tree/map view
- [ ] Add stage progression indicator (timeline visualization)

### 8.3 Templates

- [ ] Add `stage_relevance` metadata to existing template domains
- [ ] Define `required_artifacts` per stage per domain category
- [ ] Create stage gate milestones in template seeding
- [ ] Validate `key_questions_by_stage` mappings

### 8.4 Testing

- [ ] Unit test `evaluate_stage_gate()` function
- [ ] E2E test stage advancement happy path
- [ ] E2E test stage advancement with blockers
- [ ] E2E test stage regression
- [ ] Test RLS enforcement on stage changes
- [ ] Test analytics events for stage changes

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/09-stage-gates.md` | Created - Full stage gates specification |
| `docs/blueprint/INDEX.md` | Updated - Marked Step 9 complete; added `stage_relevance` and `blocker_severity` conventions |
| `docs/blueprint/ORCHESTRATION.md` | Updated - Marked Step 9 complete with timestamp |
