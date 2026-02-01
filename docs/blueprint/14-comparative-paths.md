# Comparative Paths & OptionSets

> **Step 14 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-14

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Option Model](#2-option-model)
3. [Tradeoff Dimensions](#3-tradeoff-dimensions)
4. [Storage Strategy](#4-storage-strategy)
5. [UX Specification](#5-ux-specification)
6. [AI Assistance Rules](#6-ai-assistance-rules)
7. [Data & API Updates](#7-data--api-updates)
8. [Worked Example](#8-worked-example)
9. [Edge Cases](#9-edge-cases)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Executive Summary

### 1.1 Purpose

OptionSets provide a structured way to compare alternative approaches for solving a domain challenge before committing to a decision. This prevents premature lock-in and captures the rationale behind engineering choices.

### 1.2 Key Principles

1. **Domain-Scoped**: OptionSets attach to a specific `blueprint_domain_coverage` record
2. **Tradeoff-Driven**: All options are evaluated against canonical dimensions
3. **Commit-Once**: Selecting an option is a one-way door that creates a Decision
4. **Human-Final**: AI may propose options but humans always commit
5. **Stage-Aware**: Options may become invalid as project stage advances

### 1.3 Integration with CentaurOS

| CentaurOS Feature | Integration Point |
|-------------------|-------------------|
| **Decisions** | Committing to an option creates `Decision` entry in `blueprint_domain_coverage.decisions` |
| **Tasks** | Committing can generate domain-tagged tasks for implementation |
| **Risk Scoring** | Open OptionSets (undecided) increase domain risk score |
| **AI Assistance** | Ghost Worker can propose OptionSets (T8 task type) |
| **RFQ Generation** | Selected option context flows into RFQ specifications |

---

## 2. Option Model

### 2.1 Canonical Data Model

```typescript
// src/types/option-sets.ts

/**
 * OptionSet: A collection of mutually exclusive options for a domain decision
 */
export interface OptionSet {
  id: string;                          // UUID
  name: string;                        // e.g., "Battery Strategy"
  description?: string;                // Context for why this decision matters
  status: OptionSetStatus;             // 'open' | 'decided' | 'deferred' | 'invalidated'
  
  // Ownership
  created_by: string;                  // profile_id
  created_at: string;                  // ISO8601
  
  // Decision outcome (populated when status = 'decided')
  decided_option_id?: string;          // References Option.id
  decided_by?: string;                 // profile_id who committed
  decided_at?: string;                 // ISO8601
  decision_rationale?: string;         // Why this option was chosen
  
  // Stage context
  relevant_stages: ProjectStage[];     // When this decision matters
  deadline_stage?: ProjectStage;       // Must decide before this stage
  
  // AI provenance (if AI-suggested)
  provenance?: OptionSetProvenance;
  
  // Options array
  options: Option[];
}

export type OptionSetStatus = 
  | 'open'         // Active comparison, no decision yet
  | 'decided'      // Option selected, decision recorded
  | 'deferred'     // Explicitly postponed (must provide reason)
  | 'invalidated'; // Made obsolete by other decision or stage change

/**
 * Option: A single candidate approach within an OptionSet
 */
export interface Option {
  id: string;                          // UUID
  name: string;                        // e.g., "18650 Li-Ion Pack"
  description: string;                 // Detailed description
  
  // Tradeoff scores (0-5 scale, higher = better)
  tradeoffs: TradeoffScores;
  
  // Supporting evidence
  rationale: string;                   // Why this option exists
  assumptions: string[];               // What must be true for this to work
  risks: string[];                     // Known risks of this approach
  
  // Dependencies
  requires_domains?: string[];         // domain_ids that must be covered first
  blocks_domains?: string[];           // domain_ids this would make not_needed
  
  // AI provenance
  provenance?: OptionProvenance;
  
  // Metadata
  created_by: string;                  // profile_id
  created_at: string;                  // ISO8601
  updated_at?: string;                 // ISO8601
}

/**
 * TradeoffScores: Evaluation across canonical dimensions
 */
export interface TradeoffScores {
  cost: TradeoffScore;                 // Unit/tooling cost (higher = cheaper)
  lead_time: TradeoffScore;            // Time to implement (higher = faster)
  complexity: TradeoffScore;           // Implementation complexity (higher = simpler)
  risk: TradeoffScore;                 // Technical/schedule risk (higher = safer)
  performance: TradeoffScore;          // How well it meets requirements (higher = better)
  compliance: TradeoffScore;           // Regulatory/safety compliance (higher = easier)
  maintainability: TradeoffScore;      // Long-term maintenance burden (higher = easier)
}

export interface TradeoffScore {
  score: number;                       // 0-5 (integers only)
  confidence: ConfidenceLevel;         // How certain we are about this score
  notes?: string;                      // Context for the score
}

export type ConfidenceLevel = 
  | 'high'      // Based on data/experience
  | 'medium'    // Reasonable estimate
  | 'low'       // Educated guess
  | 'unknown';  // Cannot evaluate yet

/**
 * Provenance for AI-suggested OptionSets/Options
 */
export interface OptionSetProvenance {
  provenance_type: 'user_entered' | 'ai_suggested';
  source_context?: {
    blueprint_id: string;
    domain_id: string;
    project_stage: string;
    constraint_context?: string;       // User's constraints that prompted AI
  };
  ai_context?: {
    model_id: string;
    confidence: number;                // 0.0-1.0
    generation_timestamp: string;
    prompt_version: string;
  };
  verification?: {
    status: 'draft' | 'pending_review' | 'approved' | 'rejected';
    reviewed_by?: string;
    reviewed_at?: string;
  };
}

export interface OptionProvenance extends OptionSetProvenance {
  source_references?: string[];        // URLs, documents, or domain_ids referenced
}
```

### 2.2 Decision Model Integration

When an OptionSet is committed, it creates a Decision entry in `blueprint_domain_coverage.decisions`:

```typescript
/**
 * Decision created from committed OptionSet
 * (Extends existing Decision schema from PRD FR-041)
 */
export interface OptionDerivedDecision {
  id: string;                          // UUID
  type: 'decision';                    // Always 'decision' for option commits
  decision: string;                    // Summary of chosen option
  rationale?: string;                  // Why this option was selected
  made_at: string;                     // ISO8601
  made_by: string;                     // profile_id
  status: 'proposed' | 'approved' | 'superseded';
  
  // OptionSet linkage (new fields for option-derived decisions)
  source_option_set_id: string;        // References OptionSet.id
  source_option_id: string;            // References Option.id
  
  // Tradeoff context (snapshot at decision time)
  tradeoff_snapshot: TradeoffScores;
  rejected_options?: Array<{
    option_id: string;
    option_name: string;
    rejection_reason: string;
  }>;
  
  // Provenance
  provenance: {
    provenance_type: 'user_entered';   // Commits are always user actions
    created_at: string;
    created_by: string;
    verification: {
      status: 'approved';              // Commits are auto-approved
      verified_by: string;
      verified_at: string;
    };
  };
}
```

### 2.3 State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                       OptionSet Lifecycle                           │
└─────────────────────────────────────────────────────────────────────┘

                              ┌──────────┐
                              │   open   │ ◄─── Created (min 2 options)
                              └────┬─────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
       ┌──────────┐         ┌──────────┐        ┌─────────────┐
       │ decided  │         │ deferred │        │ invalidated │
       └────┬─────┘         └────┬─────┘        └─────────────┘
            │                    │                     ▲
            │                    │                     │
            ▼                    │         Stage change / external
   ┌────────────────┐            │         decision made / domain
   │ Decision entry │            │         marked not_needed
   │    created     │            │
   └────────────────┘            │
            │                    │
            │                    ▼
            │            ┌──────────┐
            │            │   open   │ ◄─── Can reopen deferred
            │            └──────────┘
            │
            ▼
   ┌────────────────┐
   │   Generates    │
   │   Tasks (opt)  │
   └────────────────┘

State Transitions:
- open → decided:      User commits to option (irreversible)
- open → deferred:     User explicitly postpones (requires reason)
- open → invalidated:  Stage advance / external decision / domain status change
- deferred → open:     User reopens for consideration
- decided → ∅:         Terminal state (decisions can only be superseded, not reverted)
```

---

## 3. Tradeoff Dimensions

### 3.1 Canonical Dimension Definitions

| Dimension | Definition | Score 0 | Score 5 | Units |
|-----------|------------|---------|---------|-------|
| **cost** | Total cost including unit cost, tooling, NRE | $$$$$$ (very expensive) | $ (minimal cost) | Relative to budget |
| **lead_time** | Time from decision to deliverable | 12+ months | < 1 month | Calendar time |
| **complexity** | Implementation difficulty, skill requirements | Requires rare expertise | Team can do tomorrow | Capability gap |
| **risk** | Technical, schedule, and supply chain risk | High probability of failure | Very low risk | Probability × Impact |
| **performance** | How well it meets functional requirements | Barely acceptable | Exceeds all requirements | % of spec |
| **compliance** | Regulatory, safety, certification burden | Major certification effort | Pre-certified/exempt | Effort to certify |
| **maintainability** | Long-term support, repair, update burden | Nightmare to maintain | Self-maintaining | Ongoing effort |

### 3.2 Scoring Rubric

**Universal Scale (0-5):**

| Score | Label | Meaning |
|-------|-------|---------|
| 0 | Unacceptable | Fails to meet minimum requirements |
| 1 | Poor | Significant concerns, barely viable |
| 2 | Below Average | Notable drawbacks, workable with effort |
| 3 | Average | Meets expectations, no significant concerns |
| 4 | Good | Exceeds expectations, clear advantages |
| 5 | Excellent | Best possible outcome for this dimension |

### 3.3 Confidence Levels

| Level | Definition | When to Use |
|-------|------------|-------------|
| **high** | Based on quotes, datasheets, prior experience | Have concrete data |
| **medium** | Reasonable estimate from analogous situations | Good approximation |
| **low** | Educated guess, limited information | Early stage or novel |
| **unknown** | Cannot meaningfully evaluate | Missing critical info |

### 3.4 Dimension Weighting

Weights are **not stored**—they are applied at display time based on:

1. **Project stage**: Early stages weight `risk` and `lead_time` higher
2. **Domain criticality**: Critical domains weight `compliance` higher
3. **User preference**: User can adjust weights in compare view (ephemeral)

Default weights by stage:

| Dimension | Concept | Prototype | EVT | DVT | Production |
|-----------|---------|-----------|-----|-----|------------|
| cost | 0.5 | 0.8 | 1.0 | 1.2 | 1.5 |
| lead_time | 1.5 | 1.2 | 1.0 | 1.0 | 0.8 |
| complexity | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| risk | 1.5 | 1.2 | 1.0 | 0.8 | 0.5 |
| performance | 0.8 | 1.0 | 1.2 | 1.2 | 1.0 |
| compliance | 0.5 | 0.8 | 1.0 | 1.5 | 1.5 |
| maintainability | 0.5 | 0.5 | 0.8 | 1.0 | 1.2 |

---

## 4. Storage Strategy

### 4.1 Decision: JSONB on blueprint_domain_coverage

**Rationale:** Minimize schema changes while maintaining full functionality.

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| New tables (`blueprint_option_sets`, `blueprint_options`) | Strict schema, easy querying | More migrations, complexity | ❌ Deferred |
| JSONB on `blueprint_domain_coverage.option_sets` | Minimal change, colocated with domain | No FK constraints, manual validation | ✅ **Selected** |

### 4.2 Schema Extension

```sql
-- No new columns needed! Use existing JSONB flexibility.
-- Option sets stored in: blueprint_domain_coverage.metadata

-- Validation via CHECK constraint (optional, for data integrity)
ALTER TABLE blueprint_domain_coverage
DROP CONSTRAINT IF EXISTS valid_option_sets;

ALTER TABLE blueprint_domain_coverage
ADD CONSTRAINT valid_option_sets CHECK (
  metadata IS NULL 
  OR NOT metadata ? 'option_sets'
  OR (
    jsonb_typeof(metadata->'option_sets') = 'array'
  )
);

-- Index for querying open option sets
CREATE INDEX IF NOT EXISTS idx_coverage_open_option_sets 
ON blueprint_domain_coverage USING GIN ((metadata->'option_sets'))
WHERE metadata->'option_sets' IS NOT NULL;
```

### 4.3 Data Location

```
blueprint_domain_coverage.metadata = {
  "option_sets": [
    {
      "id": "uuid",
      "name": "Battery Strategy",
      "status": "open",
      "options": [...],
      ...
    }
  ],
  // Other metadata fields...
}
```

### 4.4 TypeScript Schema

```typescript
// src/types/domain-coverage.ts (extend existing)

export interface DomainCoverageMetadata {
  // Existing fields...
  
  // OptionSets extension
  option_sets?: OptionSet[];
}

// Validation helper
export function validateOptionSet(optionSet: unknown): optionSet is OptionSet {
  if (!optionSet || typeof optionSet !== 'object') return false;
  const os = optionSet as Partial<OptionSet>;
  
  return (
    typeof os.id === 'string' &&
    typeof os.name === 'string' &&
    ['open', 'decided', 'deferred', 'invalidated'].includes(os.status!) &&
    Array.isArray(os.options) &&
    os.options.length >= 2 &&
    os.options.every(validateOption)
  );
}

export function validateOption(option: unknown): option is Option {
  if (!option || typeof option !== 'object') return false;
  const o = option as Partial<Option>;
  
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.description === 'string' &&
    typeof o.tradeoffs === 'object' &&
    validateTradeoffs(o.tradeoffs)
  );
}

export function validateTradeoffs(tradeoffs: unknown): tradeoffs is TradeoffScores {
  if (!tradeoffs || typeof tradeoffs !== 'object') return false;
  const t = tradeoffs as Record<string, unknown>;
  
  const dimensions = ['cost', 'lead_time', 'complexity', 'risk', 'performance', 'compliance', 'maintainability'];
  return dimensions.every(dim => (
    typeof t[dim] === 'object' &&
    typeof (t[dim] as TradeoffScore)?.score === 'number' &&
    (t[dim] as TradeoffScore).score >= 0 &&
    (t[dim] as TradeoffScore).score <= 5
  ));
}
```

---

## 5. UX Specification

### 5.1 Entry Points

| Entry Point | Trigger | Action |
|-------------|---------|--------|
| Domain Detail Panel | Click "Compare Options" button | Opens OptionSet creation/view |
| Gap Audit | "Create options for this gap" | Pre-populates domain context |
| AI Suggestion | Ghost Worker proposes options | Shows in review queue |
| Existing OptionSet | Click on domain with open options | Opens compare view |

### 5.2 Compare View / Matrix

**Layout:**

```
┌────────────────────────────────────────────────────────────────────┐
│ Battery Strategy                                    [Open ▼] [···] │
│ Domain: Power Management • Stage: Prototype                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐    │
│  │              │  18650 Pack  │   LiPo Pouch │  LiFePO4     │    │
│  │              │              │              │  Prismatic   │    │
│  ├──────────────┼──────────────┼──────────────┼──────────────┤    │
│  │ Cost         │ ████░ 4      │ ███░░ 3      │ ██░░░ 2      │    │
│  │ Lead Time    │ ████░ 4      │ █████ 5      │ ███░░ 3      │    │
│  │ Complexity   │ █████ 5      │ ███░░ 3      │ ██░░░ 2      │    │
│  │ Risk         │ ████░ 4      │ ██░░░ 2      │ ████░ 4      │    │
│  │ Performance  │ ███░░ 3      │ ████░ 4      │ ███░░ 3      │    │
│  │ Compliance   │ ███░░ 3      │ ██░░░ 2      │ █████ 5      │    │
│  │ Maintain.    │ ████░ 4      │ ███░░ 3      │ ████░ 4      │    │
│  ├──────────────┼──────────────┼──────────────┼──────────────┤    │
│  │ Weighted     │    3.86      │    3.14      │    3.29      │    │
│  │ Score        │   ★★★★       │   ★★★        │   ★★★        │    │
│  └──────────────┴──────────────┴──────────────┴──────────────┘    │
│                                                                    │
│  [◉ Radar Chart] [◎ Bar Chart] [◎ Table Only]                     │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                    Radar Visualization                      │   │
│  │                           cost                              │   │
│  │                            ╱╲                               │   │
│  │                           ╱  ╲                              │   │
│  │               maintain.  ╱    ╲  lead_time                  │   │
│  │                         ╱ ▲▲▲ ╲                             │   │
│  │                        ╱  ▲▲▲  ╲                            │   │
│  │               compliance ──┼── complexity                   │   │
│  │                          ╲▼▼▼╱                              │   │
│  │                           ╲▼▼╱                              │   │
│  │                 performance ╲╱ risk                         │   │
│  │                                                             │   │
│  │   ─── 18650 Pack   ─·─ LiPo Pouch   ··· LiFePO4           │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  Assumptions & Risks                                               │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ 18650 Pack:                                                 │   │
│  │ • Assumes: Standard 18650 cells available from 2+ suppliers│   │
│  │ • Risk: Cell availability during chip shortage             │   │
│  │                                                             │   │
│  │ LiPo Pouch:                                                 │   │
│  │ • Assumes: Custom form factor acceptable                    │   │
│  │ • Risk: Swelling in high-temp environments                  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  [+ Add Option]              [Defer Decision]  [Commit to Option ▼]│
└────────────────────────────────────────────────────────────────────┘
```

### 5.3 Commit Flow

**Commit Dialog:**

```
┌────────────────────────────────────────────────────────────────────┐
│ Commit to Option                                              [✕]  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  You are about to commit to:                                       │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  🔋 18650 Li-Ion Pack                                        │ │
│  │                                                               │ │
│  │  Weighted Score: 3.86 ★★★★                                   │ │
│  │  Strengths: Cost (4), Complexity (5), Lead Time (4)          │ │
│  │  Weaknesses: Performance (3)                                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ⚠️ This action cannot be undone.                                 │
│                                                                    │
│  Decision Rationale (required):                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Selected 18650 pack for its proven supply chain and          │ │
│  │ straightforward integration. Performance gap acceptable      │ │
│  │ given our 4-hour runtime requirement.                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Rejected Options (auto-populated):                                │
│  • LiPo Pouch: Higher risk profile for outdoor use case           │
│  • LiFePO4: Lead time incompatible with Q3 prototype deadline     │
│                                                                    │
│  ☑ Generate implementation tasks                                   │
│    □ Source battery suppliers (RFQ)                                │
│    □ Design battery mounting                                       │
│    □ Validate thermal performance                                  │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Commit and Create Decision]│
└────────────────────────────────────────────────────────────────────┘
```

### 5.4 Commit Flow Actions

When user clicks "Commit and Create Decision":

1. **Update OptionSet status** → `decided`
2. **Create Decision entry** in `blueprint_domain_coverage.decisions`:
   ```json
   {
     "id": "new-uuid",
     "type": "decision",
     "decision": "Selected 18650 Li-Ion Pack for battery strategy",
     "rationale": "Selected 18650 pack for its proven supply chain...",
     "made_at": "2026-02-01T10:30:00Z",
     "made_by": "user-uuid",
     "status": "approved",
     "source_option_set_id": "option-set-uuid",
     "source_option_id": "option-uuid",
     "tradeoff_snapshot": { /* full scores */ },
     "rejected_options": [
       { "option_id": "...", "option_name": "LiPo Pouch", "rejection_reason": "Higher risk..." }
     ]
   }
   ```
3. **Create Tasks** (if checkbox selected):
   - Tasks created with `metadata.blueprint_id`, `metadata.domain_id`
   - Task titles from checkbox labels
   - Priority based on domain criticality
4. **Update Risk Score** (ephemeral recalculation)
5. **Log to blueprint_history**:
   ```json
   {
     "action": "option_set_committed",
     "details": {
       "option_set_id": "...",
       "option_set_name": "Battery Strategy",
       "selected_option_id": "...",
       "selected_option_name": "18650 Li-Ion Pack",
       "decision_id": "...",
       "tasks_created": 3
     }
   }
   ```

### 5.5 Visual Indicators

| State | Domain Tree Indicator | Panel Badge |
|-------|----------------------|-------------|
| Open OptionSet | ⚖️ Yellow balance icon | "Options: 3 comparing" |
| Decided | ✓ Green checkmark | "Decision: 18650 Pack" |
| Deferred | ⏸️ Gray pause icon | "Deferred until EVT" |
| Invalidated | ~~Strikethrough~~ | "Invalidated by..." |

---

## 6. AI Assistance Rules

### 6.1 When AI May Propose Options

AI (Ghost Worker) may **propose OptionSets** when ALL conditions are met:

| Condition | Rationale |
|-----------|-----------|
| Domain status is `gap` or `partial` | Only for unresolved domains |
| User explicitly requests AI help | No unsolicited suggestions |
| Sufficient context exists | Blueprint has `ai_generated_context`, domain has `key_questions` |
| Stage-appropriate | Domain is `active` or `critical` for current stage |
| No existing open OptionSet | Avoid duplicates |

**Explicit triggers:**
- User clicks "Suggest Options" button in domain panel
- User types prompt like "What are my options for [domain]?"
- Bulk action: "Generate options for critical gaps"

### 6.2 AI Constraints

AI-generated OptionSets MUST:

1. **Include minimum 2 options** (maximum 5)
2. **Include at least one "conservative" option** (low risk, proven)
3. **Include at least one "aggressive" option** (higher performance, higher risk)
4. **Score all dimensions** with confidence levels
5. **Cite assumptions explicitly** for each option
6. **Flag unknown scores** rather than guess (confidence = 'unknown')
7. **Reference constraints** from blueprint context (budget, timeline, volumes)

### 6.3 AI Output Contract (T8 Task Type)

```typescript
// LLM Task T8: Generate OptionSet
interface T8Input {
  blueprint_id: string;
  domain_id: string;
  domain_context: {
    name: string;
    description: string;
    key_questions: KeyQuestion[];
    parent_domain?: string;
    related_decisions: Decision[];
  };
  blueprint_context: {
    product_description: string;
    project_stage: ProjectStage;
    target_volumes?: string;
    budget_constraints?: string;
    timeline_constraints?: string;
    environment_constraints?: string;
  };
  user_prompt?: string;  // Additional user context
}

interface T8Output {
  option_set: {
    name: string;
    description: string;
    relevant_stages: ProjectStage[];
    options: Array<{
      name: string;
      description: string;
      tradeoffs: TradeoffScores;
      rationale: string;
      assumptions: string[];
      risks: string[];
      requires_domains?: string[];
      recommended_for?: string;  // "budget_constrained" | "performance_critical" | etc.
    }>;
  };
  confidence: number;           // 0.0-1.0
  confidence_factors: string[];
  assumptions_made: string[];
  information_gaps: string[];   // What would improve this analysis
}
```

### 6.4 Showing Uncertainty and Assumptions

**Visual Treatment:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🤖 AI-Suggested Option                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LiFePO4 Prismatic                                                  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ ⚠️ AI Confidence: 72%                                         │ │
│  │                                                                │ │
│  │ This suggestion is based on:                                  │ │
│  │ • Your stated budget constraint of <$50/unit                  │ │
│  │ • Operating temperature range -20°C to +50°C                  │ │
│  │ • Target production volume of 10,000 units/year              │ │
│  │                                                                │ │
│  │ Assumptions made:                                             │ │
│  │ • Standard BMS will be used (not custom)                      │ │
│  │ • No certification required for target markets                │ │
│  │                                                                │ │
│  │ Information gaps:                                             │ │
│  │ • Exact energy density requirements not specified             │ │
│  │ • Weight constraints unknown                                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Tradeoffs:                                                         │
│  Cost:        ██░░░ 2  (confidence: medium)                        │
│  Lead Time:   ███░░ 3  (confidence: high)                          │
│  Complexity:  ██░░░ 2  (confidence: low) ⚠️                        │
│  ...                                                                │
│                                                                     │
│  [✓ Accept as Draft]  [Edit Before Accepting]  [Reject]            │
└─────────────────────────────────────────────────────────────────────┘
```

**Confidence Display Rules:**

| Confidence | Visual | Action Required |
|------------|--------|-----------------|
| ≥ 80% | Green badge | Review recommended |
| 60-79% | Yellow badge | Review required |
| < 60% | Orange badge + warning | Cannot accept without edits |
| < 40% | Red badge | AI suggests requesting more info |

### 6.5 Human Override Requirements

AI-suggested options:
- **Cannot be committed directly** by AI
- **Require human review** before adding to OptionSet
- **Must have scores verified** by human for `confidence: 'unknown'`
- **Can be edited** by human before acceptance

---

## 7. Data & API Updates

### 7.1 Server Actions

```typescript
// src/actions/blueprints/option-sets.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validateOptionSet, validateOption } from '@/types/option-sets';

// ============================================================================
// CREATE OPTION SET
// ============================================================================

const CreateOptionSetSchema = z.object({
  blueprint_id: z.string().uuid(),
  domain_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  relevant_stages: z.array(z.enum(['concept', 'prototype', 'evt', 'dvt', 'production', 'launched'])),
  deadline_stage: z.enum(['concept', 'prototype', 'evt', 'dvt', 'production', 'launched']).optional(),
  initial_options: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    tradeoffs: z.object({
      cost: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      lead_time: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      complexity: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      risk: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      performance: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      compliance: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      maintainability: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
    }),
    rationale: z.string(),
    assumptions: z.array(z.string()),
    risks: z.array(z.string()),
  })).min(2).max(10)
});

export type CreateOptionSetInput = z.infer<typeof CreateOptionSetSchema>;

export interface CreateOptionSetResponse {
  success: boolean;
  option_set_id?: string;
  error?: string;
}

export async function createOptionSet(
  input: CreateOptionSetInput
): Promise<CreateOptionSetResponse> {
  const supabase = await createClient();
  
  const parsed = CreateOptionSetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  
  const { blueprint_id, domain_id, name, description, relevant_stages, deadline_stage, initial_options } = parsed.data;
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }
  
  // Get existing coverage
  const { data: coverage, error: coverageError } = await supabase
    .from('blueprint_domain_coverage')
    .select('id, metadata')
    .eq('blueprint_id', blueprint_id)
    .eq('domain_id', domain_id)
    .single();
  
  if (coverageError || !coverage) {
    return { success: false, error: 'Domain coverage not found' };
  }
  
  // Check for existing open option sets
  const existingMetadata = coverage.metadata || {};
  const existingOptionSets = existingMetadata.option_sets || [];
  const hasOpenSet = existingOptionSets.some((os: any) => os.status === 'open');
  
  if (hasOpenSet) {
    return { success: false, error: 'Domain already has an open OptionSet. Close or commit it first.' };
  }
  
  // Build new OptionSet
  const optionSetId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const newOptionSet = {
    id: optionSetId,
    name,
    description,
    status: 'open',
    created_by: user.id,
    created_at: now,
    relevant_stages,
    deadline_stage,
    options: initial_options.map(opt => ({
      id: crypto.randomUUID(),
      ...opt,
      created_by: user.id,
      created_at: now,
      provenance: {
        provenance_type: 'user_entered',
        created_at: now,
        created_by: user.id
      }
    })),
    provenance: {
      provenance_type: 'user_entered',
      created_at: now,
      created_by: user.id
    }
  };
  
  // Update metadata
  const updatedMetadata = {
    ...existingMetadata,
    option_sets: [...existingOptionSets, newOptionSet]
  };
  
  // Save
  const { error: updateError } = await supabase
    .from('blueprint_domain_coverage')
    .update({
      metadata: updatedMetadata,
      updated_at: now
    })
    .eq('id', coverage.id);
  
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  
  // Log to history
  await supabase.from('blueprint_history').insert({
    blueprint_id,
    user_id: user.id,
    action: 'option_set_created',
    details: {
      option_set_id: optionSetId,
      option_set_name: name,
      domain_id,
      options_count: initial_options.length
    }
  });
  
  revalidatePath(`/blueprints/${blueprint_id}`);
  
  return { success: true, option_set_id: optionSetId };
}

// ============================================================================
// COMMIT TO OPTION
// ============================================================================

const CommitOptionSchema = z.object({
  blueprint_id: z.string().uuid(),
  domain_id: z.string().uuid(),
  option_set_id: z.string().uuid(),
  selected_option_id: z.string().uuid(),
  decision_rationale: z.string().min(10).max(2000),
  rejected_options: z.array(z.object({
    option_id: z.string().uuid(),
    rejection_reason: z.string().min(1)
  })),
  generate_tasks: z.array(z.object({
    title: z.string(),
    description: z.string().optional()
  })).optional()
});

export type CommitOptionInput = z.infer<typeof CommitOptionSchema>;

export interface CommitOptionResponse {
  success: boolean;
  decision_id?: string;
  task_ids?: string[];
  error?: string;
}

export async function commitToOption(
  input: CommitOptionInput
): Promise<CommitOptionResponse> {
  const supabase = await createClient();
  
  const parsed = CommitOptionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  
  const { 
    blueprint_id, domain_id, option_set_id, selected_option_id, 
    decision_rationale, rejected_options, generate_tasks 
  } = parsed.data;
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }
  
  // Verify role (only Founder/Executive can commit)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single();
  
  if (!['Founder', 'Executive'].includes(profile?.role || '')) {
    return { success: false, error: 'Only Founders and Executives can commit to options' };
  }
  
  // Get coverage with option sets
  const { data: coverage, error: coverageError } = await supabase
    .from('blueprint_domain_coverage')
    .select('id, metadata, decisions')
    .eq('blueprint_id', blueprint_id)
    .eq('domain_id', domain_id)
    .single();
  
  if (coverageError || !coverage) {
    return { success: false, error: 'Domain coverage not found' };
  }
  
  const metadata = coverage.metadata || {};
  const optionSets = metadata.option_sets || [];
  const optionSetIndex = optionSets.findIndex((os: any) => os.id === option_set_id);
  
  if (optionSetIndex === -1) {
    return { success: false, error: 'OptionSet not found' };
  }
  
  const optionSet = optionSets[optionSetIndex];
  
  if (optionSet.status !== 'open') {
    return { success: false, error: `Cannot commit: OptionSet is ${optionSet.status}` };
  }
  
  const selectedOption = optionSet.options.find((o: any) => o.id === selected_option_id);
  if (!selectedOption) {
    return { success: false, error: 'Selected option not found in OptionSet' };
  }
  
  const now = new Date().toISOString();
  
  // Update OptionSet status
  optionSets[optionSetIndex] = {
    ...optionSet,
    status: 'decided',
    decided_option_id: selected_option_id,
    decided_by: user.id,
    decided_at: now,
    decision_rationale
  };
  
  // Create Decision entry
  const decisionId = crypto.randomUUID();
  const decision = {
    id: decisionId,
    type: 'decision',
    decision: `Selected "${selectedOption.name}" for ${optionSet.name}`,
    rationale: decision_rationale,
    made_at: now,
    made_by: user.id,
    status: 'approved',
    source_option_set_id: option_set_id,
    source_option_id: selected_option_id,
    tradeoff_snapshot: selectedOption.tradeoffs,
    rejected_options: rejected_options.map((ro: any) => {
      const opt = optionSet.options.find((o: any) => o.id === ro.option_id);
      return {
        option_id: ro.option_id,
        option_name: opt?.name || 'Unknown',
        rejection_reason: ro.rejection_reason
      };
    }),
    provenance: {
      provenance_type: 'user_entered',
      created_at: now,
      created_by: user.id,
      verification: {
        status: 'approved',
        verified_by: user.id,
        verified_at: now
      }
    }
  };
  
  const updatedDecisions = [...(coverage.decisions || []), decision];
  
  // Update coverage
  const { error: updateError } = await supabase
    .from('blueprint_domain_coverage')
    .update({
      metadata: { ...metadata, option_sets: optionSets },
      decisions: updatedDecisions,
      updated_at: now
    })
    .eq('id', coverage.id);
  
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  
  // Create tasks if requested
  const taskIds: string[] = [];
  if (generate_tasks && generate_tasks.length > 0) {
    // Get or create objective
    let { data: objective } = await supabase
      .from('objectives')
      .select('id')
      .eq('blueprint_id', blueprint_id)
      .single();
    
    if (!objective) {
      const { data: blueprint } = await supabase
        .from('blueprints')
        .select('name, foundry_id')
        .eq('id', blueprint_id)
        .single();
      
      const { data: newObj } = await supabase
        .from('objectives')
        .insert({
          name: `${blueprint?.name || 'Blueprint'} Implementation`,
          blueprint_id,
          foundry_id: profile!.foundry_id
        })
        .select('id')
        .single();
      objective = newObj;
    }
    
    for (const taskDef of generate_tasks) {
      const { data: task } = await supabase
        .from('tasks')
        .insert({
          title: taskDef.title,
          description: taskDef.description || `Implementation task from ${optionSet.name} decision`,
          objective_id: objective?.id,
          foundry_id: profile!.foundry_id,
          status: 'Pending',
          priority: 'medium',
          metadata: {
            blueprint_id,
            domain_id,
            source_decision_id: decisionId,
            source_option_set_id: option_set_id
          }
        })
        .select('id')
        .single();
      
      if (task) {
        taskIds.push(task.id);
      }
    }
  }
  
  // Log to history
  await supabase.from('blueprint_history').insert({
    blueprint_id,
    user_id: user.id,
    action: 'option_set_committed',
    details: {
      option_set_id,
      option_set_name: optionSet.name,
      selected_option_id,
      selected_option_name: selectedOption.name,
      decision_id: decisionId,
      tasks_created: taskIds.length,
      rejected_options: rejected_options.length
    }
  });
  
  revalidatePath(`/blueprints/${blueprint_id}`);
  revalidatePath('/tasks');
  
  return {
    success: true,
    decision_id: decisionId,
    task_ids: taskIds.length > 0 ? taskIds : undefined
  };
}

// ============================================================================
// DEFER OPTION SET
// ============================================================================

const DeferOptionSetSchema = z.object({
  blueprint_id: z.string().uuid(),
  domain_id: z.string().uuid(),
  option_set_id: z.string().uuid(),
  defer_reason: z.string().min(10).max(500),
  defer_until_stage: z.enum(['prototype', 'evt', 'dvt', 'production']).optional()
});

export type DeferOptionSetInput = z.infer<typeof DeferOptionSetSchema>;

export async function deferOptionSet(
  input: DeferOptionSetInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const parsed = DeferOptionSetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  
  const { blueprint_id, domain_id, option_set_id, defer_reason, defer_until_stage } = parsed.data;
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }
  
  const { data: coverage } = await supabase
    .from('blueprint_domain_coverage')
    .select('id, metadata')
    .eq('blueprint_id', blueprint_id)
    .eq('domain_id', domain_id)
    .single();
  
  if (!coverage) {
    return { success: false, error: 'Domain coverage not found' };
  }
  
  const metadata = coverage.metadata || {};
  const optionSets = metadata.option_sets || [];
  const optionSetIndex = optionSets.findIndex((os: any) => os.id === option_set_id);
  
  if (optionSetIndex === -1) {
    return { success: false, error: 'OptionSet not found' };
  }
  
  if (optionSets[optionSetIndex].status !== 'open') {
    return { success: false, error: 'Can only defer open OptionSets' };
  }
  
  const now = new Date().toISOString();
  
  optionSets[optionSetIndex] = {
    ...optionSets[optionSetIndex],
    status: 'deferred',
    deferred_at: now,
    deferred_by: user.id,
    defer_reason,
    defer_until_stage
  };
  
  await supabase
    .from('blueprint_domain_coverage')
    .update({
      metadata: { ...metadata, option_sets: optionSets },
      updated_at: now
    })
    .eq('id', coverage.id);
  
  await supabase.from('blueprint_history').insert({
    blueprint_id,
    user_id: user.id,
    action: 'option_set_deferred',
    details: {
      option_set_id,
      defer_reason,
      defer_until_stage
    }
  });
  
  revalidatePath(`/blueprints/${blueprint_id}`);
  
  return { success: true };
}

// ============================================================================
// ADD OPTION TO SET
// ============================================================================

const AddOptionSchema = z.object({
  blueprint_id: z.string().uuid(),
  domain_id: z.string().uuid(),
  option_set_id: z.string().uuid(),
  option: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    tradeoffs: z.object({
      cost: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      lead_time: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      complexity: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      risk: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      performance: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      compliance: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
      maintainability: z.object({ score: z.number().int().min(0).max(5), confidence: z.enum(['high', 'medium', 'low', 'unknown']), notes: z.string().optional() }),
    }),
    rationale: z.string(),
    assumptions: z.array(z.string()),
    risks: z.array(z.string()),
  })
});

export type AddOptionInput = z.infer<typeof AddOptionSchema>;

export async function addOptionToSet(
  input: AddOptionInput
): Promise<{ success: boolean; option_id?: string; error?: string }> {
  const supabase = await createClient();
  
  const parsed = AddOptionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  
  const { blueprint_id, domain_id, option_set_id, option } = parsed.data;
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }
  
  const { data: coverage } = await supabase
    .from('blueprint_domain_coverage')
    .select('id, metadata')
    .eq('blueprint_id', blueprint_id)
    .eq('domain_id', domain_id)
    .single();
  
  if (!coverage) {
    return { success: false, error: 'Domain coverage not found' };
  }
  
  const metadata = coverage.metadata || {};
  const optionSets = metadata.option_sets || [];
  const optionSetIndex = optionSets.findIndex((os: any) => os.id === option_set_id);
  
  if (optionSetIndex === -1) {
    return { success: false, error: 'OptionSet not found' };
  }
  
  if (optionSets[optionSetIndex].status !== 'open') {
    return { success: false, error: 'Can only add options to open OptionSets' };
  }
  
  if (optionSets[optionSetIndex].options.length >= 10) {
    return { success: false, error: 'Maximum 10 options per OptionSet' };
  }
  
  const now = new Date().toISOString();
  const optionId = crypto.randomUUID();
  
  const newOption = {
    id: optionId,
    ...option,
    created_by: user.id,
    created_at: now,
    provenance: {
      provenance_type: 'user_entered',
      created_at: now,
      created_by: user.id
    }
  };
  
  optionSets[optionSetIndex].options.push(newOption);
  
  await supabase
    .from('blueprint_domain_coverage')
    .update({
      metadata: { ...metadata, option_sets: optionSets },
      updated_at: now
    })
    .eq('id', coverage.id);
  
  await supabase.from('blueprint_history').insert({
    blueprint_id,
    user_id: user.id,
    action: 'option_added',
    details: {
      option_set_id,
      option_id: optionId,
      option_name: option.name
    }
  });
  
  revalidatePath(`/blueprints/${blueprint_id}`);
  
  return { success: true, option_id: optionId };
}
```

### 7.2 Risk Score Integration

Open OptionSets contribute to domain risk score:

```typescript
// src/lib/blueprints/risk-calculator.ts

export function calculateDomainRisk(coverage: DomainCoverage, domain: KnowledgeDomain, stage: ProjectStage): number {
  let riskScore = 0;
  
  // Existing factors
  if (coverage.status === 'gap') riskScore += 3;
  if (coverage.status === 'partial') riskScore += 1;
  if (domain.criticality === 'critical') riskScore += 1;
  if (coverage.blockers && coverage.blockers.length > 0) riskScore += 1;
  
  // OptionSet factor (NEW)
  const optionSets = coverage.metadata?.option_sets || [];
  const openSets = optionSets.filter((os: OptionSet) => os.status === 'open');
  
  for (const openSet of openSets) {
    // Add risk for undecided options
    riskScore += 0.5;
    
    // Add extra risk if deadline_stage is approaching
    if (openSet.deadline_stage) {
      const stageOrder = ['concept', 'prototype', 'evt', 'dvt', 'production', 'launched'];
      const currentIdx = stageOrder.indexOf(stage);
      const deadlineIdx = stageOrder.indexOf(openSet.deadline_stage);
      
      if (currentIdx >= deadlineIdx - 1) {
        riskScore += 1; // Urgent: deadline approaching
      }
    }
  }
  
  return Math.min(5, Math.round(riskScore));
}
```

### 7.3 Query Helpers

```typescript
// src/lib/blueprints/option-set-queries.ts

import { createClient } from '@/lib/supabase/server';

export async function getOpenOptionSets(blueprintId: string) {
  const supabase = await createClient();
  
  const { data: coverages } = await supabase
    .from('blueprint_domain_coverage')
    .select(`
      id,
      domain_id,
      metadata,
      domain:knowledge_domains(id, name, criticality)
    `)
    .eq('blueprint_id', blueprintId)
    .not('metadata->option_sets', 'is', null);
  
  const results: Array<{
    domain_id: string;
    domain_name: string;
    option_set: OptionSet;
  }> = [];
  
  for (const coverage of coverages || []) {
    const optionSets = coverage.metadata?.option_sets || [];
    for (const os of optionSets) {
      if (os.status === 'open') {
        results.push({
          domain_id: coverage.domain_id,
          domain_name: coverage.domain?.name || 'Unknown',
          option_set: os
        });
      }
    }
  }
  
  return results;
}

export async function getOptionSetById(
  blueprintId: string,
  domainId: string,
  optionSetId: string
): Promise<OptionSet | null> {
  const supabase = await createClient();
  
  const { data: coverage } = await supabase
    .from('blueprint_domain_coverage')
    .select('metadata')
    .eq('blueprint_id', blueprintId)
    .eq('domain_id', domainId)
    .single();
  
  if (!coverage) return null;
  
  const optionSets = coverage.metadata?.option_sets || [];
  return optionSets.find((os: OptionSet) => os.id === optionSetId) || null;
}

export async function getDecidedOptionsForBlueprint(blueprintId: string) {
  const supabase = await createClient();
  
  const { data: coverages } = await supabase
    .from('blueprint_domain_coverage')
    .select(`
      id,
      domain_id,
      decisions,
      domain:knowledge_domains(id, name)
    `)
    .eq('blueprint_id', blueprintId);
  
  const results: Array<{
    domain_id: string;
    domain_name: string;
    decision: OptionDerivedDecision;
  }> = [];
  
  for (const coverage of coverages || []) {
    for (const decision of coverage.decisions || []) {
      if (decision.source_option_set_id) {
        results.push({
          domain_id: coverage.domain_id,
          domain_name: coverage.domain?.name || 'Unknown',
          decision: decision as OptionDerivedDecision
        });
      }
    }
  }
  
  return results;
}
```

---

## 8. Worked Example

### 8.1 Scenario: Battery Strategy for Small Mobile Robot

**Context:**
- Product: Indoor logistics robot (warehouse)
- Stage: Prototype
- Domain: Power Management > Battery System
- Constraints: $75/unit budget, 8-hour runtime, -5°C to +40°C operating range

### 8.2 OptionSet Definition

```json
{
  "id": "os-001",
  "name": "Battery Chemistry Selection",
  "description": "Select primary battery chemistry for warehouse robot power system. Decision impacts BMS design, thermal management, and supplier strategy.",
  "status": "open",
  "created_by": "user-alice",
  "created_at": "2026-02-01T09:00:00Z",
  "relevant_stages": ["prototype", "evt", "dvt"],
  "deadline_stage": "evt",
  "options": [
    {
      "id": "opt-001",
      "name": "18650 Li-Ion Pack",
      "description": "Standard cylindrical cells in custom pack configuration. Well-established supply chain, proven performance, commodity pricing.",
      "tradeoffs": {
        "cost": { "score": 4, "confidence": "high", "notes": "$45-55/pack at 1k units from CATL/LG" },
        "lead_time": { "score": 4, "confidence": "high", "notes": "4-6 weeks, multiple suppliers" },
        "complexity": { "score": 5, "confidence": "high", "notes": "Off-shelf BMS available, standard pack design" },
        "risk": { "score": 4, "confidence": "medium", "notes": "Proven chemistry, minor supply chain risk" },
        "performance": { "score": 3, "confidence": "medium", "notes": "200Wh/kg, adequate for 8hr runtime with 10kg pack" },
        "compliance": { "score": 3, "confidence": "high", "notes": "UN38.3 certified cells available, standard shipping" },
        "maintainability": { "score": 4, "confidence": "medium", "notes": "Easy cell replacement, standard tooling" }
      },
      "rationale": "Industry standard for mobile robots. Extensive supply chain, predictable costs, proven safety record.",
      "assumptions": [
        "Can source UN38.3 certified cells",
        "Standard BMS meets our safety requirements",
        "Pack weight of 10kg is acceptable"
      ],
      "risks": [
        "Cell availability during chip shortage cycles",
        "Energy density may be insufficient if runtime requirements increase"
      ],
      "created_by": "user-alice",
      "created_at": "2026-02-01T09:15:00Z"
    },
    {
      "id": "opt-002",
      "name": "LiPo Pouch Cells",
      "description": "Custom lithium polymer pouch cells for optimized form factor. Higher energy density but more complex integration.",
      "tradeoffs": {
        "cost": { "score": 3, "confidence": "medium", "notes": "$55-70/pack, custom form factor premium" },
        "lead_time": { "score": 5, "confidence": "medium", "notes": "2-4 weeks for stock pouches, 8-12 weeks for custom" },
        "complexity": { "score": 3, "confidence": "high", "notes": "Custom BMS required, swelling management needed" },
        "risk": { "score": 2, "confidence": "medium", "notes": "Swelling risk in high-temp operation, fire risk if damaged" },
        "performance": { "score": 4, "confidence": "high", "notes": "250Wh/kg, better runtime or smaller pack" },
        "compliance": { "score": 2, "confidence": "medium", "notes": "Additional testing for custom pack, shipping restrictions" },
        "maintainability": { "score": 3, "confidence": "medium", "notes": "Entire pack replacement, no cell-level service" }
      },
      "rationale": "Best energy density option. Allows smaller/lighter pack or extended runtime.",
      "assumptions": [
        "Can manage thermal expansion in enclosure",
        "Fire suppression not required for warehouse use",
        "Custom BMS development is within capability"
      ],
      "risks": [
        "Swelling in sustained high-temp operation",
        "Single-source supplier for custom form factor",
        "Longer certification timeline"
      ],
      "created_by": "user-alice",
      "created_at": "2026-02-01T09:30:00Z"
    },
    {
      "id": "opt-003",
      "name": "LiFePO4 Prismatic",
      "description": "Lithium iron phosphate prismatic cells. Safest chemistry, longest cycle life, but lower energy density.",
      "tradeoffs": {
        "cost": { "score": 2, "confidence": "high", "notes": "$70-90/pack, heavier pack needed for same capacity" },
        "lead_time": { "score": 3, "confidence": "medium", "notes": "6-8 weeks, fewer suppliers" },
        "complexity": { "score": 2, "confidence": "high", "notes": "Larger/heavier pack impacts chassis design" },
        "risk": { "score": 5, "confidence": "high", "notes": "Inherently safe chemistry, no thermal runaway" },
        "performance": { "score": 3, "confidence": "high", "notes": "140Wh/kg, requires 15kg pack for 8hr runtime" },
        "compliance": { "score": 5, "confidence": "high", "notes": "Easiest certification path, exempt from some shipping restrictions" },
        "maintainability": { "score": 5, "confidence": "high", "notes": "3000+ cycle life, 10-year service life" }
      },
      "rationale": "Safest option with longest lifespan. Weight penalty may be acceptable for indoor use.",
      "assumptions": [
        "Robot chassis can accommodate 15kg battery pack",
        "Indoor-only operation (no weight sensitivity)",
        "Long service life valued over initial cost"
      ],
      "risks": [
        "Weight impacts acceleration and braking performance",
        "Higher upfront cost may impact unit economics",
        "Fewer supplier options for prismatic cells"
      ],
      "created_by": "user-bob",
      "created_at": "2026-02-01T10:00:00Z"
    }
  ]
}
```

### 8.3 Compare View Output

**Weighted Scores (Prototype Stage):**

| Option | Cost (0.8×) | Lead (1.2×) | Complex (1.0×) | Risk (1.2×) | Perf (1.0×) | Comply (0.8×) | Maint (0.5×) | **Total** |
|--------|-------------|-------------|----------------|-------------|-------------|---------------|--------------|-----------|
| 18650 Li-Ion | 3.2 | 4.8 | 5.0 | 4.8 | 3.0 | 2.4 | 2.0 | **25.2** |
| LiPo Pouch | 2.4 | 6.0 | 3.0 | 2.4 | 4.0 | 1.6 | 1.5 | **20.9** |
| LiFePO4 | 1.6 | 3.6 | 2.0 | 6.0 | 3.0 | 4.0 | 2.5 | **22.7** |

**Recommendation:** 18650 Li-Ion Pack scores highest for prototype stage.

### 8.4 Decision Commit

User Alice commits to "18650 Li-Ion Pack" with rationale:

> "Selecting 18650 Li-Ion Pack for prototype phase. The proven supply chain and off-shelf BMS significantly reduce integration risk at this stage. We can revisit LiPo for DVT if energy density becomes critical. LiFePO4 weight penalty (15kg vs 10kg) is unacceptable for our acceleration specs."

**Rejected Options:**
- LiPo Pouch: "Higher technical risk (swelling, custom BMS) inappropriate for prototype timeline. Reconsidering for DVT if weight reduction needed."
- LiFePO4: "Weight penalty incompatible with acceleration requirements (2m/s² target)."

**Generated Tasks:**
1. "Source 18650 cell suppliers (RFQ)" - Priority: High
2. "Evaluate BMS options (off-shelf)" - Priority: Medium
3. "Design pack mounting bracket" - Priority: Medium

### 8.5 Resulting Decision Record

```json
{
  "id": "dec-001",
  "type": "decision",
  "decision": "Selected \"18650 Li-Ion Pack\" for Battery Chemistry Selection",
  "rationale": "Selecting 18650 Li-Ion Pack for prototype phase. The proven supply chain and off-shelf BMS significantly reduce integration risk at this stage. We can revisit LiPo for DVT if energy density becomes critical. LiFePO4 weight penalty (15kg vs 10kg) is unacceptable for our acceleration specs.",
  "made_at": "2026-02-01T14:30:00Z",
  "made_by": "user-alice",
  "status": "approved",
  "source_option_set_id": "os-001",
  "source_option_id": "opt-001",
  "tradeoff_snapshot": {
    "cost": { "score": 4, "confidence": "high" },
    "lead_time": { "score": 4, "confidence": "high" },
    "complexity": { "score": 5, "confidence": "high" },
    "risk": { "score": 4, "confidence": "medium" },
    "performance": { "score": 3, "confidence": "medium" },
    "compliance": { "score": 3, "confidence": "high" },
    "maintainability": { "score": 4, "confidence": "medium" }
  },
  "rejected_options": [
    {
      "option_id": "opt-002",
      "option_name": "LiPo Pouch Cells",
      "rejection_reason": "Higher technical risk (swelling, custom BMS) inappropriate for prototype timeline."
    },
    {
      "option_id": "opt-003",
      "option_name": "LiFePO4 Prismatic",
      "rejection_reason": "Weight penalty incompatible with acceleration requirements (2m/s² target)."
    }
  ]
}
```

---

## 9. Edge Cases

### 9.1 OptionSet Lifecycle Edge Cases

| # | Edge Case | Expected Behavior | Validation Rule |
|---|-----------|-------------------|-----------------|
| EC-01 | User attempts to create OptionSet with < 2 options | Reject with error "Minimum 2 options required" | `options.length >= 2` |
| EC-02 | User attempts to create OptionSet with > 10 options | Reject with error "Maximum 10 options per OptionSet" | `options.length <= 10` |
| EC-03 | User attempts to commit to option in non-open OptionSet | Reject with error "Cannot commit: OptionSet is [status]" | `optionSet.status === 'open'` |
| EC-04 | User attempts to add option to decided OptionSet | Reject with error "Can only add options to open OptionSets" | `optionSet.status === 'open'` |
| EC-05 | Apprentice attempts to commit to option | Reject with error "Only Founders and Executives can commit to options" | Role check in server action |
| EC-06 | Domain already has open OptionSet | Reject with error "Domain already has an open OptionSet" | Unique constraint check |

### 9.2 Stage Transition Edge Cases

| # | Edge Case | Expected Behavior | Resolution |
|---|-----------|-------------------|------------|
| EC-07 | Stage advances past OptionSet's `deadline_stage` | OptionSet status → `invalidated` | Auto-invalidate with reason "Stage [X] reached without decision" |
| EC-08 | OptionSet relevant_stages don't include current stage | Hide from active compare view, show in "archived" section | Filter by relevant_stages |
| EC-09 | User reopens deferred OptionSet after deadline_stage passed | Reject reopen, require creating new OptionSet | Validate deadline_stage on reopen |
| EC-10 | Decision supersedes option-derived decision | Original decision status → `superseded`, OptionSet status unchanged | Standard decision supersession |

### 9.3 AI Assistance Edge Cases

| # | Edge Case | Expected Behavior | Resolution |
|---|-----------|-------------------|------------|
| EC-11 | AI suggests OptionSet for domain with existing open set | Reject AI suggestion with reason | Pre-check before AI generation |
| EC-12 | AI confidence < 40% | Show warning, require user edits before acceptance | Block direct acceptance |
| EC-13 | AI generates option with `confidence: 'unknown'` on all dimensions | Flag as incomplete, cannot be added without human scores | Validation in acceptance flow |
| EC-14 | AI-suggested OptionSet has only 1 option | Auto-reject, AI must suggest 2-5 options | T8 output validation |

### 9.4 Data Integrity Edge Cases

| # | Edge Case | Expected Behavior | Resolution |
|---|-----------|-------------------|------------|
| EC-15 | Domain deleted while OptionSet is open | OptionSet orphaned in metadata | Cascade delete via domain_id check |
| EC-16 | User deletes option that has been committed | Reject deletion of committed options | Status check before delete |
| EC-17 | Concurrent edits to same OptionSet | Last-write-wins with conflict toast | Optimistic locking pattern |
| EC-18 | JSONB corruption in option_sets | Return empty array, log error | Try-catch with fallback |

### 9.5 UX Edge Cases

| # | Edge Case | Expected Behavior | Resolution |
|---|-----------|-------------------|------------|
| EC-19 | Compare view with 10 options | Horizontal scroll, sticky first column | Responsive table design |
| EC-20 | All options have identical weighted scores | Show all tied, no recommendation highlighted | Tie-breaking UI |
| EC-21 | User commits without rejection reasons | Require rejection reason for each non-selected option | Form validation |
| EC-22 | User enters tradeoff score > 5 or < 0 | Reject input, show validation error | Zod schema validation |
| EC-23 | Radar chart with all scores = 0 | Show empty radar (point at center) | Handle edge case in chart lib |
| EC-24 | OptionSet name exceeds 255 characters | Truncate with ellipsis in UI, reject on save | `max(255)` validation |

---

## 10. Implementation Checklist

### 10.1 Schema & Migrations

- [ ] Add `valid_option_sets` CHECK constraint to `blueprint_domain_coverage`
- [ ] Create GIN index on `metadata->'option_sets'`
- [ ] Test migration with existing data

### 10.2 Types

- [ ] Create `src/types/option-sets.ts` with all interfaces
- [ ] Add `DomainCoverageMetadata.option_sets` extension
- [ ] Add validation helpers

### 10.3 Server Actions

- [ ] Implement `createOptionSet()`
- [ ] Implement `commitToOption()`
- [ ] Implement `deferOptionSet()`
- [ ] Implement `addOptionToSet()`
- [ ] Implement `reopenOptionSet()`
- [ ] Implement `invalidateOptionSet()`
- [ ] Add role-based permission checks

### 10.4 LLM Integration

- [ ] Define T8 task contract in `04-llm-design.md` (or extension doc)
- [ ] Implement T8 prompt template
- [ ] Add T8 to Ghost Worker task routing
- [ ] Create AI suggestion review UI

### 10.5 UI Components

- [ ] `OptionSetCompareView` component (matrix + radar)
- [ ] `OptionCard` component
- [ ] `CommitOptionDialog` component
- [ ] `DeferOptionDialog` component
- [ ] `AIOptionSuggestion` component (with confidence display)
- [ ] Domain tree indicators for open/decided/deferred

### 10.6 Risk Integration

- [ ] Update `calculateDomainRisk()` to include open OptionSets
- [ ] Add deadline_stage approaching warning
- [ ] Test risk recalculation on commit

### 10.7 Analytics

- [ ] `option_set_created` event
- [ ] `option_set_committed` event
- [ ] `option_set_deferred` event
- [ ] `ai_option_suggestion_accepted` event
- [ ] `ai_option_suggestion_rejected` event

### 10.8 Testing

- [ ] Unit tests for all server actions
- [ ] Unit tests for validation helpers
- [ ] E2E test: create → compare → commit flow
- [ ] E2E test: AI suggestion → review → accept
- [ ] E2E test: stage advance invalidation
- [ ] Load test JSONB queries with large option sets

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/14-comparative-paths.md` | Created — OptionSets specification with model, UX, AI rules, API, worked example, and 24 edge cases |
| `docs/blueprint/INDEX.md` | Updated — Marked Step 14 complete, added Tradeoff Dimension enum definition |
| `docs/blueprint/ORCHESTRATION.md` | Updated — Marked Step 14 complete in Wave 4 |
