# LLM Integration Design

> **Step 4 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-5+4

---

## Table of Contents
1. [Overview](#1-overview)
2. [Task T1: Product Description → Domain Tree](#2-task-t1-product-description--domain-tree)
3. [Task T2: Generate Key Questions (Stage-Aware)](#3-task-t2-generate-key-questions-stage-aware)
4. [Task T3: Generate Risk/Failure-Mode Checklist](#4-task-t3-generate-riskfailure-mode-checklist)
5. [Task T4: Generate Expert Interview Packet](#5-task-t4-generate-expert-interview-packet)
6. [Task T5: Propose OptionSets with Tradeoffs](#6-task-t5-propose-optionsets-with-tradeoffs)
7. [Task T6: Draft RFQ Packet](#7-task-t6-draft-rfq-packet)
8. [Task T7: Suggest Marketplace Search Terms](#8-task-t7-suggest-marketplace-search-terms)
9. [Common Infrastructure](#9-common-infrastructure)
10. [Model Selection & Configuration](#10-model-selection--configuration)
11. [Prompt Engineering Guidelines](#11-prompt-engineering-guidelines)
12. [Implementation Checklist](#12-implementation-checklist)

---

## 1. Overview

### 1.1 Purpose

The LLM layer provides AI-assisted capabilities across the Manufacturing Blueprint workflow. All AI outputs:
1. Include **provenance metadata** (see 13-ai-confidence-verification.md)
2. Require **human approval** before affecting data
3. Are **parameterized** with product context (meeting "No Generic" bar)
4. Are **stage-aware** using project_stage context

### 1.2 LLM Task Summary

| Task | Purpose | Trigger | Output |
|------|---------|---------|--------|
| **T1** | Product description → domain tree | User describes novel product | Proposed knowledge_domains |
| **T2** | Generate key questions | Domain gap identified | Stage-aware questions |
| **T3** | Generate risk checklist | User requests risk assessment | Domain risk/failure modes |
| **T4** | Generate Expert Interview Packet | Gap + "Generate Packet" click | Task with expert questions |
| **T5** | Propose OptionSets | User needs decision support | Options with tradeoff scores |
| **T6** | Draft RFQ packet | Supplier engagement needed | RFQ specifications |
| **T7** | Suggest marketplace search terms | Gap identified | Search keywords |

### 1.3 Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CentaurOS Frontend                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                              Server Actions                                   │
│  generateDomainTree()  generateExpertPacket()  generateRFQDraft()  ...      │
├─────────────────────────────────────────────────────────────────────────────┤
│                              LLM Service Layer                               │
│  - Prompt construction with context                                          │
│  - Model invocation via OpenAI API                                          │
│  - Response validation & parsing                                             │
│  - Provenance metadata generation                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                              Ghost Worker (existing)                         │
│  - Task queue processing                                                     │
│  - Status transitions (Amended_Pending_Approval)                            │
│  - System comment logging                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Provenance Integration

All LLM outputs include provenance metadata per 13-ai-confidence-verification.md:

```typescript
interface LLMOutputProvenance {
  provenance_type: 'ai_suggested'
  created_at: string
  created_by: string  // AI_Agent profile_id
  ai_context: {
    confidence: number  // 0-100
    confidence_factors: string[]
    rationale: string
    assumptions: string[]
    model_metadata: {
      model_id: string
      temperature: number
      prompt_version: string
      tokens_used: number
      generation_timestamp: string
    }
    source_context: {
      blueprint_id?: string
      domain_id?: string
      project_stage?: string
      product_description?: string
    }
  }
  verification: {
    status: 'pending_review'
    verified_by: null
    verified_at: null
  }
}
```

---

## 2. Task T1: Product Description → Domain Tree

### 2.1 Purpose

Transform a natural language product description into a structured domain tree when no existing template matches well.

### 2.2 Input Contract

```typescript
interface T1Input {
  // Required
  product_description: string  // Min 50 chars, max 5000 chars
  
  // Context
  target_market?: string       // e.g., "US consumer", "EU industrial"
  project_stage: ProjectStage  // Current stage
  team_context?: {
    team_size: 'solo' | 'small' | 'medium' | 'large'
    technical_expertise: string[]  // Areas team already covers
  }
  
  // Template hints
  similar_templates?: {
    template_id: string
    match_score: number  // 0-100
  }[]
  
  // Constraints
  max_domains?: number         // Default: 80
  depth_limit?: number         // Default: 3
}
```

### 2.3 Output JSON Schema

```typescript
interface T1Output {
  // Proposed domain tree
  proposed_domains: ProposedDomain[]
  
  // Analysis
  analysis: {
    product_category: string           // Inferred category
    complexity_estimate: 'low' | 'medium' | 'high' | 'very_high'
    estimated_timeline_months: { min: number; max: number }
    key_technical_challenges: string[]
    regulatory_landscape: string[]     // Likely certifications needed
    template_recommendations: {
      template_id: string
      template_name: string
      match_score: number
      gaps: string[]  // What template doesn't cover
    }[]
  }
  
  // Provenance (from 13-ai-confidence-verification.md)
  provenance: LLMOutputProvenance
}

interface ProposedDomain {
  temp_id: string               // Temporary ID for reference
  name: string
  description: string
  category: string              // Top-level category
  parent_temp_id: string | null // Parent's temp_id or null for top-level
  depth: number
  criticality: 'critical' | 'important' | 'nice-to-have'
  confidence: number            // 0-100 for this specific domain
  rationale: string             // Why this domain is needed
  
  // Stage relevance
  stage_relevance: {
    [stage in ProjectStage]: {
      relevance: 'informational' | 'active' | 'critical' | 'sustaining' | 'not_applicable'
      min_status: 'covered' | 'partial' | null
    }
  }
  
  // Starter questions (fewer than full template - seed questions)
  starter_questions: {
    question: string
    why_it_matters: string
    primary_stage: ProjectStage
  }[]
}
```

### 2.4 Confidence Calculation

```typescript
function calculateT1Confidence(input: T1Input, output: T1Output): number {
  let score = 0
  
  // Factor 1: Description quality (30%)
  const descLength = input.product_description.length
  if (descLength > 500) score += 30
  else if (descLength > 200) score += 20
  else score += 10
  
  // Factor 2: Template similarity (25%)
  const topMatch = input.similar_templates?.[0]?.match_score || 0
  score += (topMatch / 100) * 25
  
  // Factor 3: Recognizable product type (20%)
  const knownCategories = ['consumer_electronics', 'robotics', 'medical', 'industrial']
  if (knownCategories.includes(output.analysis.product_category)) {
    score += 20
  } else {
    score += 10  // Novel category = lower confidence
  }
  
  // Factor 4: Team context provided (15%)
  if (input.team_context) score += 15
  else score += 5
  
  // Factor 5: Market specificity (10%)
  if (input.target_market) score += 10
  else score += 3
  
  return Math.min(100, Math.round(score))
}
```

### 2.5 Guardrails

| Guardrail | Implementation | Failure Behavior |
|-----------|----------------|------------------|
| **Min description length** | Reject if < 50 chars | Return error: "Description too short" |
| **Max domains** | Truncate to limit | Warn: "Output truncated to {n} domains" |
| **Depth limit** | Flatten deeper nodes | Flatten to max depth |
| **Hallucination prevention** | Include known templates as context | Bias toward template-derived structure |
| **Regulatory accuracy** | Flag all regulatory domains as low-confidence | Add warning: "Verify regulatory requirements with expert" |
| **No fabricated standards** | Block invented certifications | Validate against known standards list |

### 2.6 Prompt Template

```markdown
## System Prompt

You are an expert hardware product development consultant. Your task is to analyze a product description and propose a comprehensive domain tree covering all knowledge areas needed to bring this product to market.

## Critical Requirements

1. ONLY propose domains for knowledge areas that are genuinely required for this specific product
2. DO NOT include generic business domains unless specifically relevant
3. BE SPECIFIC about why each domain is needed for THIS product
4. ASSIGN criticality based on impact to product success/safety
5. INCLUDE stage relevance - when does each domain become critical?
6. NEVER fabricate certifications or standards - only include well-known ones

## Output Format

Respond with valid JSON matching this schema exactly:
{schema}

## Context

Similar templates in our database:
{similar_templates_context}

Known product categories:
{categories_list}

## Input

Product Description:
{product_description}

Target Market: {target_market}
Project Stage: {project_stage}
Team Context: {team_context}
```

### 2.7 Evaluation Rubric

#### Test Case 1: Well-Defined Consumer Electronics

```yaml
Input:
  product_description: "Smart home thermostat with WiFi connectivity, 7-day programmable schedule, 
    occupancy detection via PIR sensor, touch screen display, and integration with Alexa/Google Home.
    Target retail price $79. Volume: 50,000 units year 1. Manufacturing in China."
  target_market: "US consumer"
  project_stage: "concept"

Expected Output Characteristics:
  - Domain count: 35-50
  - Must include: Electronics (Power, MCU, WiFi module), Mechanical (Enclosure, Thermal), 
    Regulatory (FCC Part 15B, UL), Software (Firmware, Cloud, Mobile App), Supply Chain
  - Must NOT include: Medical device domains, Automotive domains, Heavy industrial domains
  - Confidence: >= 75 (well-defined product)
  
Evaluation Criteria:
  ✓ All critical regulatory domains present (FCC, UL)
  ✓ WiFi module domain with Part 15B reference
  ✓ Touch screen domain under Electronics
  ✓ Cloud/voice assistant integration domain
  ✓ Supply chain domain for China manufacturing
  ✗ FAIL if includes irrelevant domains (e.g., battery certifications for AC-powered device)
```

#### Test Case 2: Novel Product Type

```yaml
Input:
  product_description: "Personal air quality monitoring drone that follows you outdoors, 
    measuring PM2.5, ozone, and VOCs. Uses GPS tracking and computer vision to maintain
    distance. 30-minute flight time. Consumer price point under $300."
  target_market: "Global consumer"
  project_stage: "concept"

Expected Output Characteristics:
  - Domain count: 45-65 (complex product)
  - Must include: UAV-specific (FAA Part 107 awareness, flight control, propulsion),
    Sensing (air quality sensors, calibration), Safety (geofencing, failsafe)
  - Confidence: 50-70 (novel product type, no exact template match)
  
Evaluation Criteria:
  ✓ Drone/UAV category identified
  ✓ Air quality sensing domain with calibration mention
  ✓ GPS/computer vision navigation domains
  ✓ Battery/power domain for flight time
  ✓ Consumer drone regulations mentioned
  ✗ FAIL if confidence > 75 (should recognize novelty)
  ✗ FAIL if missing propulsion/flight control domains
```

#### Test Case 3: Medical Device Boundary

```yaml
Input:
  product_description: "Fitness tracker wristband with heart rate monitoring, sleep tracking,
    and step counting. Pairs with smartphone app. Not intended for medical diagnosis."
  target_market: "US consumer"
  project_stage: "prototype"

Expected Output Characteristics:
  - Domain count: 30-45
  - Must include: Wearables (battery, display, sensors), Regulatory (FCC), Firmware, App
  - Must NOT include: FDA 510(k), Medical device risk management
  - Should flag: Potential regulatory ambiguity around health claims
  
Evaluation Criteria:
  ✓ Correctly identifies as consumer electronics, NOT medical device
  ✓ Includes warning about health claims marketing
  ✓ Does NOT include FDA clearance domains
  ✓ Includes FCC certification (Bluetooth)
  ✗ FAIL if includes medical device regulatory path
```

#### Test Case 4: Minimal Input

```yaml
Input:
  product_description: "Smart coffee maker"
  project_stage: "concept"

Expected Output Characteristics:
  - Should return error or very low confidence
  - If domains generated, confidence <= 40
  
Evaluation Criteria:
  ✓ Either rejects with "description too short" or
  ✓ Returns with confidence <= 40 and assumptions clearly stated
  ✓ Includes caveat: "Insufficient detail - domains are speculative"
```

#### Test Case 5: Industrial Equipment

```yaml
Input:
  product_description: "Industrial pick-and-place robot arm for electronics assembly. 
    6-axis, 5kg payload, 800mm reach. Collaborative robot features for operation near
    humans without caging. Integrates with conveyor systems via EtherCAT."
  target_market: "Global industrial"
  project_stage: "evt"

Expected Output Characteristics:
  - Domain count: 50-70
  - Must include: Robot safety (ISO 10218, ISO 13849, ISO 15066), Motion control,
    Industrial protocols (EtherCAT), CE machinery directive
  - Confidence: >= 70 (clear industrial robot)
  
Evaluation Criteria:
  ✓ All collaborative robot safety standards mentioned
  ✓ Force limiting domain present
  ✓ Industrial communication protocols domain
  ✓ Stage relevance shows safety domains as critical at EVT
  ✗ FAIL if missing ISO 15066 (collaborative robot standard)
```

#### Test Case 6: Edge Case - Pure Software

```yaml
Input:
  product_description: "Cloud-based inventory management SaaS platform with mobile app
    for warehouse workers. Integrates with barcode scanners."
  project_stage: "concept"

Expected Output Characteristics:
  - Should recommend SaaS template, not hardware template
  - If domains generated, limited hardware scope (scanner integration only)
  - Flag: "This appears to be primarily software"
  
Evaluation Criteria:
  ✓ Identifies as SaaS/software, not hardware product
  ✓ Does NOT include manufacturing/mechanical domains
  ✓ Includes recommendation to use software-focused template
  ✓ May include minimal hardware integration domains
```

---

## 3. Task T2: Generate Key Questions (Stage-Aware)

### 3.1 Purpose

Generate additional key questions for a domain when existing template questions are insufficient or when user requests deeper exploration.

### 3.2 Input Contract

```typescript
interface T2Input {
  // Domain context
  domain_id: string
  domain_name: string
  domain_description: string
  existing_questions: KeyQuestion[]  // From template
  
  // Blueprint context
  blueprint_id: string
  product_description: string
  project_stage: ProjectStage
  
  // Decisions context
  existing_decisions: Decision[]     // Already made for this domain
  
  // Generation parameters
  question_count: number             // 3-10, default 5
  target_stage?: ProjectStage        // Focus on specific stage
  question_types?: QuestionType[]    // Filter by type
  difficulty?: 'basic' | 'intermediate' | 'advanced'
}
```

### 3.3 Output JSON Schema

```typescript
interface T2Output {
  generated_questions: GeneratedQuestion[]
  
  // Analysis
  analysis: {
    coverage_assessment: string       // What existing questions cover
    identified_gaps: string[]         // What's missing
    stage_focus: string               // Why these questions matter now
  }
  
  provenance: LLMOutputProvenance
}

interface GeneratedQuestion {
  question: string
  why_it_matters: string
  stages: ProjectStage[]
  primary_stage: ProjectStage
  context_required: {
    product_description: boolean
    budget_range: boolean
    timeline: boolean
    volume_targets: boolean
    target_market: boolean
    existing_decisions: boolean
  }
  artifacts_to_request: string[]
  red_flags: string[]
  question_type: QuestionType
  difficulty: 'basic' | 'intermediate' | 'advanced'
  confidence: number                  // 0-100
  rationale: string                   // Why this question was generated
  related_existing_question_ids?: string[]  // Links to template questions
}

type QuestionType = 'feasibility' | 'design' | 'validation' | 'compliance' | 'process' | 'cost'
```

### 3.4 Guardrails

| Guardrail | Implementation | Failure Behavior |
|-----------|----------------|------------------|
| **No duplicate questions** | Compare similarity to existing | Skip if > 80% similar |
| **Stage appropriateness** | Validate question fits current stage | Adjust or flag |
| **Technical accuracy** | Cross-reference known standards | Lower confidence if novel claims |
| **Actionability** | Require artifacts_to_request | Regenerate if empty |
| **Specificity** | Min 50 chars for question | Regenerate if too short |

### 3.5 Evaluation Rubric

#### Test Case 1: Battery Management Questions at Prototype Stage

```yaml
Input:
  domain_name: "Battery Management"
  project_stage: "prototype"
  existing_questions: [basic questions about chemistry, capacity]
  product_description: "Outdoor autonomous robot"

Expected Output Characteristics:
  - Questions focused on prototype concerns (selection, initial testing)
  - Include thermal considerations for outdoor use
  - Reference operating temperature challenges
  
Evaluation Criteria:
  ✓ At least one question about temperature range
  ✓ Questions different from existing (not duplicates)
  ✓ Artifacts include cell datasheets, thermal analysis
  ✓ Red flags include "no temperature testing" type warnings
```

#### Test Case 2: DVT Stage Regulatory Questions

```yaml
Input:
  domain_name: "FCC Certification"
  project_stage: "dvt"
  existing_questions: [basic FCC Part 15 questions]
  product_description: "WiFi-enabled consumer device"

Expected Output Characteristics:
  - Questions about testing specifics, not feasibility
  - Lab selection, test sample requirements
  - Timeline and pre-certification testing
  
Evaluation Criteria:
  ✓ Questions appropriate for DVT (not concept-level)
  ✓ Mentions specific test procedures or standards
  ✓ Includes pre-scan vs final testing
```

#### Test Case 3: Novel Domain (No Existing Questions)

```yaml
Input:
  domain_name: "Underwater Communication"
  project_stage: "concept"
  existing_questions: []  # No template questions
  product_description: "Submersible drone"

Expected Output Characteristics:
  - Generate foundational questions
  - Lower confidence (novel domain)
  - Wide coverage of concerns
  
Evaluation Criteria:
  ✓ Confidence < 70 (acknowledges novelty)
  ✓ Questions cover basics: range, protocols, frequency
  ✓ Includes caveat about domain expertise needed
```

#### Test Case 4: Cost-Focused Questions

```yaml
Input:
  domain_name: "PCB Manufacturing"
  project_stage: "evt"
  question_types: ["cost"]
  product_description: "High-volume consumer device"

Expected Output Characteristics:
  - All questions focus on cost aspects
  - NRE, per-unit costs, volume breaks
  
Evaluation Criteria:
  ✓ Every question relates to cost
  ✓ Mentions specific cost drivers (layer count, surface finish)
  ✓ Artifacts include quotes, cost breakdown
```

#### Test Case 5: Expert-Level Difficulty

```yaml
Input:
  domain_name: "EMC Compliance"
  difficulty: "advanced"
  project_stage: "evt"
  product_description: "High-speed digital device with switching power supply"

Expected Output Characteristics:
  - Technical depth (specific frequencies, coupling mechanisms)
  - Assumes reader has EMC background
  - References specific standards clauses
  
Evaluation Criteria:
  ✓ Questions reference specific technical concepts
  ✓ Not "do you need EMC testing" level
  ✓ Includes conducted/radiated distinctions
```

#### Test Case 6: Prevent Duplicate Generation

```yaml
Input:
  domain_name: "Motor Control"
  existing_questions: [
    { question: "What motor type will you use?", id: "mc-q1" }
  ]
  project_stage: "prototype"

Expected Output Characteristics:
  - Generated questions DIFFERENT from existing
  - Should NOT regenerate motor type question
  
Evaluation Criteria:
  ✓ No generated question > 80% similar to existing
  ✓ Questions explore different aspects
  ✓ May reference existing question as prerequisite
```

---

## 4. Task T3: Generate Risk/Failure-Mode Checklist

### 4.1 Purpose

Generate a domain-specific risk assessment and failure mode checklist based on product context and current coverage status.

### 4.2 Input Contract

```typescript
interface T3Input {
  // Domain context
  domain_id: string
  domain_name: string
  domain_description: string
  criticality: 'critical' | 'important' | 'nice-to-have'
  
  // Coverage context
  coverage_status: 'covered' | 'partial' | 'gap' | 'not_needed'
  blockers: string[]
  decisions: Decision[]
  
  // Blueprint context
  blueprint_id: string
  product_description: string
  project_stage: ProjectStage
  
  // Related domains
  related_domain_coverage: {
    domain_name: string
    status: string
    criticality: string
  }[]
}
```

### 4.3 Output JSON Schema

```typescript
interface T3Output {
  risk_assessment: {
    overall_risk_score: number  // 0-5
    risk_level: 'low' | 'medium' | 'high' | 'critical'
    risk_factors: RiskFactor[]
    
    failure_modes: FailureMode[]
    
    recommendations: {
      immediate_actions: string[]
      before_next_stage: string[]
      monitoring_needed: string[]
    }
  }
  
  provenance: LLMOutputProvenance
}

interface RiskFactor {
  factor: string
  weight: number          // 0-1, contribution to overall score
  current_state: string   // Assessment of current state
  mitigation: string      // How to address
}

interface FailureMode {
  failure: string
  cause: string
  effect: string
  severity: 1 | 2 | 3 | 4 | 5  // 1=negligible, 5=catastrophic
  likelihood: 1 | 2 | 3 | 4 | 5  // 1=rare, 5=frequent
  detectability: 1 | 2 | 3 | 4 | 5  // 1=easy to detect, 5=undetectable
  rpn: number             // Risk Priority Number = S × L × D
  mitigation: string
  stage_relevance: ProjectStage[]  // When this failure mode is most relevant
}
```

### 4.4 Guardrails

| Guardrail | Implementation | Failure Behavior |
|-----------|----------------|------------------|
| **Factual basis** | Derive from domain/product context | Lower confidence for speculative risks |
| **No fear-mongering** | Balance risks with context | Include likelihood, not just severity |
| **Actionable mitigations** | Every risk has mitigation | Regenerate if mitigation empty |
| **Stage-appropriate** | Filter by current stage relevance | Deprioritize future-stage risks |
| **Consistent scoring** | Use standard FMEA methodology | Validate RPN calculation |

### 4.5 Evaluation Rubric

#### Test Case 1: Critical Gap in Battery Domain

```yaml
Input:
  domain_name: "Battery Management"
  coverage_status: "gap"
  criticality: "critical"
  project_stage: "prototype"
  product_description: "Consumer wearable device"

Expected Output Characteristics:
  - Overall risk score: 4-5 (critical gap in critical domain)
  - Failure modes include thermal runaway, capacity degradation
  - Immediate actions include "engage battery expert"
  
Evaluation Criteria:
  ✓ Risk score >= 4
  ✓ Thermal runaway failure mode present
  ✓ Recommendations actionable and stage-appropriate
  ✓ RPN calculation correct (S × L × D)
```

#### Test Case 2: Covered Domain - Low Risk

```yaml
Input:
  domain_name: "User Documentation"
  coverage_status: "covered"
  criticality: "nice-to-have"
  project_stage: "dvt"

Expected Output Characteristics:
  - Overall risk score: 0-1
  - Minimal failure modes
  - Monitoring recommendations only
  
Evaluation Criteria:
  ✓ Risk score <= 1
  ✓ Acknowledges domain is well-covered
  ✓ May suggest maintenance/updates
```

#### Test Case 3: Regulatory Domain at Wrong Stage

```yaml
Input:
  domain_name: "FCC Certification"
  coverage_status: "gap"
  criticality: "critical"
  project_stage: "concept"  # Too early to be critical gap

Expected Output Characteristics:
  - Risk score moderate (2-3), not critical
  - Acknowledge stage context
  - Recommend planning, not immediate action
  
Evaluation Criteria:
  ✓ Risk score reflects stage appropriateness
  ✓ Says "plan for" not "urgent action needed"
  ✓ Timeline recommendations for later stages
```

#### Test Case 4: Interdependent Domain Risks

```yaml
Input:
  domain_name: "Thermal Management"
  coverage_status: "partial"
  related_domain_coverage: [
    { domain_name: "Battery Management", status: "gap", criticality: "critical" },
    { domain_name: "Power Electronics", status: "covered", criticality: "important" }
  ]
  product_description: "High-power outdoor robot"

Expected Output Characteristics:
  - Risk assessment considers related gaps
  - Battery gap increases thermal risk
  - Failure modes include battery-thermal coupling
  
Evaluation Criteria:
  ✓ Mentions battery gap as risk factor
  ✓ Includes thermal-battery interaction failure mode
  ✓ Recommendations address interdependency
```

#### Test Case 5: Safety-Critical Domain

```yaml
Input:
  domain_name: "Emergency Stop Systems"
  coverage_status: "partial"
  criticality: "critical"
  project_stage: "evt"
  product_description: "Collaborative robot arm"

Expected Output Characteristics:
  - High severity for safety failures
  - Reference safety standards (ISO 13849, ISO 15066)
  - Risk score elevated due to safety implications
  
Evaluation Criteria:
  ✓ Failure modes include loss of E-stop function
  ✓ Severity scores high for safety failures
  ✓ Mentions regulatory/certification implications
  ✓ Does NOT understate safety risks
```

#### Test Case 6: Production Stage Risks

```yaml
Input:
  domain_name: "Quality Control"
  coverage_status: "partial"
  project_stage: "production"
  product_description: "Volume consumer electronics"

Expected Output Characteristics:
  - Focus on production-relevant failure modes
  - Yield, defect rates, inspection gaps
  - Downstream effects (customer returns)
  
Evaluation Criteria:
  ✓ Failure modes relevant to production
  ✓ Includes customer impact
  ✓ Recommendations include SPC, inspection
```

---

## 5. Task T4: Generate Expert Interview Packet

### 5.1 Purpose

Generate a comprehensive, non-generic Expert Interview Packet for a domain gap. This is the core "No Generic" bar implementation.

### 5.2 Input Contract

```typescript
interface T4Input {
  // Domain context
  domain_id: string
  domain_name: string
  domain_description: string
  criticality: 'critical' | 'important' | 'nice-to-have'
  key_questions: KeyQuestion[]  // From template (see 05-template-library.md)
  
  // Blueprint context
  blueprint_id: string
  product_description: string
  project_stage: ProjectStage
  
  // Product parameters (for parameterization)
  product_parameters: {
    budget_range_usd?: { min: number; max: number }
    timeline_months?: { target_launch: number }
    volume_targets?: { year_1: number; year_2: number }
    target_markets?: string[]
    manufacturing_region?: string
  }
  
  // Existing context
  existing_decisions: Decision[]
  related_domain_coverage: {
    domain_name: string
    status: string
    notes?: string
  }[]
  
  // Expert hints (from domain metadata)
  expert_hints?: {
    expertise_keywords: string[]
    typical_engagement_type: string
  }
}
```

### 5.3 Output JSON Schema

```typescript
interface T4Output {
  expert_packet: {
    // Header
    title: string
    domain: string
    generated_at: string
    project_stage: string
    
    // Context section (for expert to understand product)
    context: {
      product_summary: string       // Parameterized summary
      current_stage: string         // What stage means
      key_constraints: string[]     // Budget, timeline, volume
      relevant_decisions: string[]  // Already-made decisions
    }
    
    // Stage-specific focus
    stage_focus: {
      focus_description: string
      what_to_prioritize: string[]
      what_to_defer: string[]
    }
    
    // Questions (parameterized from template + generated)
    questions: ExpertPacketQuestion[]
    
    // Artifacts section
    artifacts_requested: {
      artifact: string
      purpose: string
      format_preference?: string
    }[]
    
    // Red flags section
    red_flags: {
      warning: string
      why_concerning: string
      suggested_probe: string
    }[]
    
    // Engagement guidance
    engagement_guidance: {
      expertise_sought: string[]
      engagement_type: string
      estimated_duration: string
      budget_guidance?: string
    }
  }
  
  // For task creation
  task_metadata: {
    artifact_type: 'expert_packet'
    blueprint_id: string
    domain_id: string
  }
  
  provenance: LLMOutputProvenance
}

interface ExpertPacketQuestion {
  question: string                  // Parameterized question
  why_it_matters: string
  context: string                   // Product-specific context
  expected_depth: 'overview' | 'detailed' | 'deep_dive'
  follow_ups: string[]
  source: 'template' | 'generated'  // Where question came from
  template_question_id?: string     // If from template
}
```

### 5.4 "No Generic" Bar Requirements

Per TR-030-034 from 01-prd.md, every Expert Packet MUST include:

| Requirement | Implementation | Validation |
|-------------|----------------|------------|
| **TR-030: Parameterization** | Include product constraints in questions | Check for {budget}, {timeline}, {volume} references |
| **TR-031: "Why it matters"** | Every question has rationale | Fail if any question missing why_it_matters |
| **TR-032: Artifacts to request** | Concrete deliverables list | Min 3 artifacts |
| **TR-033: Red flags** | Warning signs section | Min 3 red flags |
| **TR-034: Stage awareness** | Stage-specific focus section | Questions match current stage |

### 5.5 Guardrails

| Guardrail | Implementation | Failure Behavior |
|-----------|----------------|------------------|
| **Min question count** | >= 5 questions | Regenerate |
| **Parameterization check** | Validate product context used | Fail if generic |
| **Stage appropriateness** | Filter questions by stage | Remove off-stage questions |
| **Artifacts completeness** | Each question ties to artifact | Add missing artifacts |
| **Red flag quality** | Specific, not vague | Regenerate vague flags |
| **No hallucinated standards** | Cross-reference known standards | Flag unknown standards |

### 5.6 Prompt Template

```markdown
## System Prompt

You are an expert technical consultant creating an Expert Interview Packet. Your goal is to create a comprehensive, NON-GENERIC packet that a domain expert can use to provide specific, actionable guidance.

## CRITICAL: "No Generic" Requirements

Your output MUST:
1. PARAMETERIZE all questions with the specific product context (budget, timeline, volume, market)
2. EXPLAIN why each question matters FOR THIS SPECIFIC PRODUCT
3. REQUEST specific, concrete artifacts (not "documentation" but "BOM with component costs")
4. IDENTIFY specific red flags that indicate problems FOR THIS PRODUCT TYPE
5. BE STAGE-APPROPRIATE - questions should match {project_stage} concerns

## DO NOT:
- Ask generic questions like "What do you recommend?"
- Request vague artifacts like "relevant documentation"
- Include red flags that apply to any product
- Ask questions inappropriate for the current stage

## Context

Product: {product_description}
Stage: {project_stage} - {stage_description}
Budget: {budget_range}
Timeline: {timeline}
Volume: {volume_targets}
Markets: {target_markets}
Manufacturing: {manufacturing_region}

Domain: {domain_name}
Description: {domain_description}
Criticality: {criticality}

Existing Decisions:
{existing_decisions}

Related Domain Coverage:
{related_coverage}

Template Questions to Incorporate (parameterize these):
{key_questions}

## Output Format

Respond with valid JSON matching this schema exactly:
{schema}
```

### 5.7 Evaluation Rubric

#### Test Case 1: Battery Expert Packet - Prototype Stage

```yaml
Input:
  domain_name: "Battery Management"
  project_stage: "prototype"
  product_parameters:
    budget_range_usd: { min: 100000, max: 500000 }
    volume_targets: { year_1: 10000 }
  product_description: "Outdoor autonomous lawn mower"
  key_questions: [template questions about chemistry, BMS, thermal]

Expected Output Characteristics:
  - Questions reference outdoor temperature range
  - Questions mention 10,000 unit volume
  - Budget constraints mentioned where relevant
  - Artifacts include cell datasheets, thermal simulations
  - Red flags include "no outdoor temperature testing"
  
Evaluation Criteria:
  ✓ At least one question mentions "outdoor" or temperature
  ✓ At least one question references volume (10,000 units)
  ✓ Stage focus mentions prototype concerns (selection, not production)
  ✓ Artifacts are specific (not "battery documentation")
  ✓ Red flags specific to outdoor/lawn mower context
  ✗ FAIL if questions could apply to any battery product
```

#### Test Case 2: FCC Certification - DVT Stage

```yaml
Input:
  domain_name: "FCC Certification"
  project_stage: "dvt"
  product_parameters:
    timeline_months: { target_launch: 6 }
    target_markets: ["US", "Canada"]
  product_description: "WiFi-enabled smart thermostat"

Expected Output Characteristics:
  - Questions about certification timeline
  - Specific to Part 15B/15C classification
  - Mentions pre-certification testing
  - Red flags about timeline risks
  
Evaluation Criteria:
  ✓ References 6-month timeline
  ✓ Asks about test lab selection/availability
  ✓ Part 15 subpart classification question
  ✓ Red flags include timeline risks
  ✓ Stage focus on DVT validation activities
```

#### Test Case 3: Safety-Critical Domain

```yaml
Input:
  domain_name: "Functional Safety"
  project_stage: "evt"
  product_description: "Collaborative robot for warehouse"
  key_questions: [ISO 13849, risk assessment questions]

Expected Output Characteristics:
  - High-priority safety questions
  - Specific ISO 13849/ISO 15066 references
  - Risk assessment artifacts requested
  - Red flags about safety shortcuts
  
Evaluation Criteria:
  ✓ ISO 15066 (collaborative robot) mentioned
  ✓ Questions about Performance Level determination
  ✓ Artifacts include risk assessment, safety validation plan
  ✓ Red flags about inadequate safety analysis
  ✓ Engagement guidance mentions safety certification expertise
```

#### Test Case 4: Low-Budget Constraint

```yaml
Input:
  domain_name: "PCB Design"
  project_stage: "prototype"
  product_parameters:
    budget_range_usd: { min: 20000, max: 50000 }
    volume_targets: { year_1: 1000 }  # Low volume
  product_description: "Custom IoT sensor"

Expected Output Characteristics:
  - Questions acknowledge budget constraints
  - Trade-off questions (cost vs capability)
  - Low-volume manufacturing considerations
  - Artifacts focus on cost optimization
  
Evaluation Criteria:
  ✓ Questions mention budget constraints
  ✓ Includes trade-off discussions
  ✓ Low-volume PCB manufacturing mentioned
  ✓ Cost-reduction strategies discussed
```

#### Test Case 5: Manufacturing Region Context

```yaml
Input:
  domain_name: "Supply Chain"
  project_stage: "evt"
  product_parameters:
    manufacturing_region: "Mexico"
    volume_targets: { year_1: 50000 }
  product_description: "Industrial sensor"

Expected Output Characteristics:
  - Questions specific to Mexico manufacturing
  - USMCA/nearshoring considerations
  - Regional supplier questions
  - Logistics considerations
  
Evaluation Criteria:
  ✓ Mexico-specific sourcing questions
  ✓ Nearshoring benefits/challenges mentioned
  ✓ Regional supplier qualification
  ✓ US-Mexico logistics considerations
```

#### Test Case 6: Verify No Generic Output

```yaml
Input:
  domain_name: "Mechanical Design"
  project_stage: "concept"
  product_parameters: {}  # Minimal context
  product_description: "Consumer electronics device"

Expected Output Characteristics:
  - Should either request more context OR
  - Generate with low confidence and caveats
  - Questions should still be domain-specific
  
Evaluation Criteria:
  ✓ Confidence < 60 (insufficient context)
  ✓ Includes caveat about limited parameterization
  ✓ Questions still not fully generic
  ✗ FAIL if generates confident, fully-parameterized output
  ✗ FAIL if questions are "What material should we use?" level generic
```

---

## 6. Task T5: Propose OptionSets with Tradeoffs

### 6.1 Purpose

Generate structured decision options with quantified tradeoffs for domains requiring choice between alternatives.

### 6.2 Input Contract

```typescript
interface T5Input {
  // Domain context
  domain_id: string
  domain_name: string
  
  // Decision context
  decision_question: string     // What decision needs to be made
  
  // Blueprint context
  blueprint_id: string
  product_description: string
  project_stage: ProjectStage
  
  // Constraints
  constraints: {
    budget_constraint?: { max_usd: number }
    timeline_constraint?: { max_weeks: number }
    volume_constraint?: { min_units: number; max_units: number }
    technical_constraints?: string[]
    must_have_features?: string[]
    nice_to_have_features?: string[]
  }
  
  // Existing context
  existing_decisions: Decision[]
  related_options?: {          // If user has identified some options
    name: string
    description?: string
  }[]
}
```

### 6.3 Output JSON Schema

```typescript
interface T5Output {
  option_set: {
    title: string
    decision_question: string
    context_summary: string
    
    options: Option[]
    
    comparison_matrix: {
      dimensions: TradeoffDimension[]
      summary: string
    }
    
    recommendation: {
      recommended_option: string  // Option name
      rationale: string
      confidence: number          // 0-100
      caveats: string[]
    }
  }
  
  provenance: LLMOutputProvenance
}

interface Option {
  name: string
  description: string
  
  tradeoffs: {
    dimension: TradeoffDimension
    score: number           // 1-5 (5 = best)
    explanation: string
    quantified_value?: string  // e.g., "$500", "6 weeks"
  }[]
  
  pros: string[]
  cons: string[]
  
  when_to_choose: string    // Conditions where this is best choice
  risks: string[]
  
  // Confidence in this option assessment
  assessment_confidence: number  // 0-100
}

type TradeoffDimension = 
  | 'cost'
  | 'lead_time'
  | 'complexity'
  | 'risk'
  | 'performance'
  | 'compliance'
  | 'maintainability'
```

### 6.4 Guardrails

| Guardrail | Implementation | Failure Behavior |
|-----------|----------------|------------------|
| **Min options** | >= 2 options | Regenerate |
| **Max options** | <= 6 options | Truncate to most relevant |
| **Balanced assessment** | Each option has pros AND cons | Regenerate if one-sided |
| **Quantified where possible** | Include specific values | Flag as estimate if uncertain |
| **No invented products** | Reference real technologies | Validate against known options |
| **Constraint alignment** | Options respect constraints | Filter non-compliant options |

### 6.5 Evaluation Rubric

#### Test Case 1: Battery Chemistry Selection

```yaml
Input:
  domain_name: "Battery Management"
  decision_question: "What battery cell chemistry should we use?"
  constraints:
    budget_constraint: { max_usd: 15 }  # Per unit
    technical_constraints: ["outdoor temperature range -20°C to +50°C"]
  product_description: "Outdoor autonomous robot"

Expected Output Characteristics:
  - Options include LiFePO4, NMC, NCA at minimum
  - Temperature performance compared
  - Cost per Wh compared
  - Safety characteristics compared
  
Evaluation Criteria:
  ✓ At least 3 chemistry options
  ✓ Temperature performance dimension included
  ✓ LiFePO4 highlighted for safety/temperature
  ✓ NMC highlighted for energy density
  ✓ Recommendation considers outdoor constraint
```

#### Test Case 2: Manufacturing Partner Selection

```yaml
Input:
  domain_name: "Manufacturing"
  decision_question: "Should we use domestic or offshore contract manufacturing?"
  constraints:
    budget_constraint: { max_usd: 25 }  # Per unit target
    volume_constraint: { min_units: 5000, max_units: 20000 }
    timeline_constraint: { max_weeks: 16 }
  product_description: "Consumer electronics device"

Expected Output Characteristics:
  - Options: China CM, Mexico nearshore, US domestic
  - Cost comparison with volumes
  - Lead time comparison
  - IP protection considerations
  
Evaluation Criteria:
  ✓ Includes offshore, nearshore, domestic options
  ✓ Cost quantified per option
  ✓ Timeline implications compared
  ✓ Mentions tariff/logistics considerations
```

#### Test Case 3: Motor Type Selection

```yaml
Input:
  domain_name: "Motion & Actuation"
  decision_question: "What type of motor for wheel drive?"
  constraints:
    technical_constraints: ["precise position control", "backdrivable for safety"]
  product_description: "Collaborative mobile robot"

Expected Output Characteristics:
  - Options: BLDC, stepper, servo
  - Torque/speed characteristics
  - Backdrivability comparison
  - Control complexity comparison
  
Evaluation Criteria:
  ✓ Backdrivability addressed for each option
  ✓ Control complexity dimension included
  ✓ BLDC recommended for combination of requirements
```

#### Test Case 4: Too Few Viable Options

```yaml
Input:
  domain_name: "Regulatory"
  decision_question: "Which certification body for FCC testing?"
  constraints:
    timeline_constraint: { max_weeks: 4 }  # Very tight
  product_description: "Simple WiFi device"

Expected Output Characteristics:
  - May have limited options due to constraints
  - Should acknowledge constraint impact
  - May recommend relaxing constraints
  
Evaluation Criteria:
  ✓ Acknowledges timeline constraint limits options
  ✓ Provides available options with caveats
  ✓ May recommend timeline adjustment
```

#### Test Case 5: User-Provided Options

```yaml
Input:
  decision_question: "Which enclosure material?"
  related_options: [
    { name: "ABS plastic", description: "Injection molded" },
    { name: "Aluminum", description: "Die cast" }
  ]
  constraints:
    technical_constraints: ["IP67 rating required"]

Expected Output Characteristics:
  - Build on user-provided options
  - May add additional relevant options
  - Compare specifically ABS vs aluminum
  
Evaluation Criteria:
  ✓ User options are primary focus
  ✓ IP67 sealing compared between options
  ✓ May add third option if highly relevant
```

#### Test Case 6: Cost-Driven Decision

```yaml
Input:
  decision_question: "What display technology for user interface?"
  constraints:
    budget_constraint: { max_usd: 8 }  # Very tight
    must_have_features: ["outdoor readable"]
  product_description: "Outdoor equipment control panel"

Expected Output Characteristics:
  - Cost-appropriate options only
  - Outdoor readability compared
  - Budget-exceeding options flagged
  
Evaluation Criteria:
  ✓ Options within budget constraint
  ✓ Expensive options marked as over-budget
  ✓ Trade-off between cost and outdoor visibility clear
```

---

## 7. Task T6: Draft RFQ Packet

### 7.1 Purpose

Generate a supplier-ready RFQ (Request for Quote) packet with domain-specific specifications derived from blueprint decisions.

### 7.2 Input Contract

```typescript
interface T6Input {
  // Domain context
  domain_id: string
  domain_name: string
  
  // RFQ type hints (from domain metadata)
  rfq_hints: {
    supplier_category: string   // e.g., "pcb_manufacturer"
    typical_moq_range?: { min: number; max: number }
    specification_fields: string[]
  }
  
  // Blueprint context
  blueprint_id: string
  product_description: string
  project_stage: ProjectStage
  
  // Decisions & specifications
  decisions: Decision[]         // Domain decisions
  specifications: {             // User-entered specs
    key: string
    value: string
    unit?: string
  }[]
  
  // RFQ parameters
  rfq_parameters: {
    quantity_tiers: number[]    // e.g., [100, 1000, 10000]
    target_price?: number
    lead_time_requirement?: string
    quality_requirements?: string[]
    nda_required: boolean
  }
}
```

### 7.3 Output JSON Schema

```typescript
interface T6Output {
  rfq_draft: {
    // Header
    rfq_type: 'commodity' | 'custom' | 'service'
    supplier_category: string
    title: string
    
    // Introduction
    company_overview: string     // To be filled by user
    project_overview: string     // Generated from product_description
    
    // Technical specifications
    specifications: {
      section: string
      items: {
        requirement: string
        value: string
        tolerance?: string
        priority: 'must_have' | 'should_have' | 'nice_to_have'
        notes?: string
      }[]
    }[]
    
    // Commercial requirements
    commercial: {
      quantity_tiers: {
        quantity: number
        expected_response: 'unit_price' | 'total_price'
      }[]
      target_price_guidance?: string
      payment_terms?: string
      lead_time_requirements: string
      shipping_terms?: string
    }
    
    // Quality requirements
    quality: {
      certifications_required: string[]
      inspection_requirements: string[]
      documentation_required: string[]
    }
    
    // Deliverables requested
    deliverables: {
      item: string
      format?: string
      due_with_quote: boolean
    }[]
    
    // Questions for supplier
    supplier_questions: string[]
    
    // Evaluation criteria
    evaluation_criteria: {
      criterion: string
      weight: number  // 0-100, must sum to 100
    }[]
    
    // Stage-specific notes
    stage_notes: string
  }
  
  // Gating info
  gating: {
    readiness_score: number     // 0-100
    missing_information: string[]
    warnings: string[]
  }
  
  provenance: LLMOutputProvenance
}
```

### 7.4 Gating Rules (from 13-ai-confidence-verification.md)

```typescript
interface RFQGatingRules {
  // Minimum requirements by stage
  stage_requirements: {
    concept: {
      allowed: true
      rfq_type: 'service'        // Consulting-style only
      warning: 'Early-stage inquiry - specifications may change'
    }
    prototype: {
      allowed: true
      rfq_type: 'custom'
      min_specifications: 5
    }
    evt: {
      allowed: true
      rfq_type: 'custom' | 'commodity'
      min_specifications: 10
      min_decisions: 3
    }
    dvt: {
      allowed: true
      rfq_type: 'commodity'
      min_specifications: 15
      min_decisions: 5
      checklist_required: true
    }
    production: {
      allowed: true
      rfq_type: 'commodity'
      min_specifications: 20
      checklist_required: true
    }
    launched: {
      allowed: true
      rfq_type: 'commodity'
      warning: 'Coordinate with existing suppliers'
    }
  }
}
```

### 7.5 Guardrails

| Guardrail | Implementation | Failure Behavior |
|-----------|----------------|------------------|
| **Min specifications** | Check spec count per stage | Block with "insufficient specs" |
| **Decision incorporation** | Use decisions in specs | Flag missing decision context |
| **No confidential leak** | Scan for sensitive data | Warn before generation |
| **Supplier category match** | Validate category is real | Use generic category |
| **Realistic quantities** | Validate quantity tiers | Adjust to reasonable ranges |
| **Stage appropriateness** | Apply stage gating rules | Block or warn per rules |

### 7.6 Evaluation Rubric

#### Test Case 1: PCB Manufacturing RFQ - EVT Stage

```yaml
Input:
  domain_name: "PCB Design"
  supplier_category: "pcb_manufacturer"
  project_stage: "evt"
  decisions: [
    { decision: "4-layer board with controlled impedance" },
    { decision: "ENIG surface finish" },
    { decision: "1oz copper on outer layers" }
  ]
  specifications: [layer_count, dimensions, material, etc.]
  rfq_parameters:
    quantity_tiers: [50, 200, 1000]

Expected Output Characteristics:
  - Technical specs include layer stack, impedance requirements
  - ENIG finish specified
  - Quantity tiers appropriate for EVT (not production volumes)
  - Documentation includes Gerbers, drill files, stack-up
  
Evaluation Criteria:
  ✓ Decisions incorporated into specifications
  ✓ Impedance control requirements specific
  ✓ Deliverables include standard PCB documentation
  ✓ Evaluation criteria include quality and lead time
  ✓ Stage notes mention EVT context
```

#### Test Case 2: Contract Manufacturer RFQ - DVT Stage

```yaml
Input:
  domain_name: "Manufacturing"
  supplier_category: "contract_manufacturer"
  project_stage: "dvt"
  decisions: [assembly decisions, test requirements]
  rfq_parameters:
    quantity_tiers: [500, 2000, 10000]
    quality_requirements: ["ISO 9001", "IPC-A-610 Class 2"]

Expected Output Characteristics:
  - Full assembly specifications
  - Quality certifications required
  - Test requirements included
  - NPI process questions
  
Evaluation Criteria:
  ✓ Assembly complexity assessed
  ✓ Quality certifications specified
  ✓ Test coverage requirements
  ✓ Includes NPI/DFM review request
  ✓ Checklist triggered (DVT stage)
```

#### Test Case 3: Concept Stage - Service RFQ

```yaml
Input:
  domain_name: "Regulatory Compliance"
  project_stage: "concept"
  decisions: []  # None yet
  specifications: [product category, target markets]

Expected Output Characteristics:
  - Consulting/advisory service request, not product RFQ
  - Focus on assessment, not testing
  - Warning about early stage
  
Evaluation Criteria:
  ✓ RFQ type is 'service'
  ✓ Requests assessment/consulting
  ✓ Includes early-stage caveat
  ✓ Does NOT request certification quotes
```

#### Test Case 4: Insufficient Specifications

```yaml
Input:
  domain_name: "Mechanical Manufacturing"
  project_stage: "dvt"
  specifications: [only 3 items]  # Below minimum

Expected Output Characteristics:
  - Should block or warn
  - Identify missing specifications
  - Suggest what needs to be added
  
Evaluation Criteria:
  ✓ Gating score low (< 60)
  ✓ Missing information list populated
  ✓ Suggests specific missing specs
  ✗ Should NOT generate full RFQ with incomplete data
```

#### Test Case 5: Battery Supplier RFQ

```yaml
Input:
  domain_name: "Battery Management"
  supplier_category: "battery_pack_manufacturer"
  project_stage: "evt"
  decisions: [
    { decision: "LiFePO4 chemistry" },
    { decision: "48V nominal, 20Ah capacity" },
    { decision: "IP67 enclosure required" }
  ]

Expected Output Characteristics:
  - Battery-specific specifications
  - Safety certifications (UL 2271, UN38.3)
  - BMS requirements
  - Cell chemistry specified
  
Evaluation Criteria:
  ✓ Chemistry explicitly stated
  ✓ Capacity and voltage specified
  ✓ Safety certifications requested
  ✓ BMS integration requirements
  ✓ Temperature range specifications
```

#### Test Case 6: Confidential Information Warning

```yaml
Input:
  specifications: [
    { key: "Algorithm", value: "Proprietary SLAM implementation" },
    { key: "Trade secret", value: "Custom sensor fusion approach" }
  ]

Expected Output Characteristics:
  - Should warn about confidential content
  - Suggest NDA requirement
  - May redact or flag sensitive items
  
Evaluation Criteria:
  ✓ Warning about confidential content
  ✓ NDA requirement suggested
  ✓ Sensitive items flagged for review
```

---

## 8. Task T7: Suggest Marketplace Search Terms

### 8.1 Purpose

Generate optimized search terms for the CentaurOS marketplace to find relevant experts/providers for domain gaps.

### 8.2 Input Contract

```typescript
interface T7Input {
  // Domain context
  domain_id: string
  domain_name: string
  domain_description: string
  
  // Expert hints (from domain metadata)
  expert_hints?: {
    expertise_keywords: string[]
    typical_engagement_type: string
  }
  
  // Blueprint context
  blueprint_id: string
  product_description: string
  project_stage: ProjectStage
  
  // Search context
  search_context: {
    urgency: 'low' | 'medium' | 'high'
    engagement_preference?: 'consulting' | 'fractional' | 'retainer' | 'project'
    budget_range?: { min: number; max: number }
    location_preference?: string[]
  }
}
```

### 8.3 Output JSON Schema

```typescript
interface T7Output {
  search_suggestions: {
    // Primary search terms
    primary_terms: {
      term: string
      relevance: number  // 0-100
      rationale: string
    }[]
    
    // Alternative phrasings
    alternative_terms: {
      term: string
      context: string    // When to use this alternative
    }[]
    
    // Category filters
    suggested_categories: string[]
    
    // Expertise level
    suggested_expertise_level: 'any' | 'expert' | 'senior_expert'
    
    // Engagement type
    suggested_engagement_types: string[]
    
    // Search strategy
    search_strategy: {
      approach: string
      prioritization: string[]
      fallback_terms: string[]
    }
  }
  
  provenance: LLMOutputProvenance
}
```

### 8.4 Guardrails

| Guardrail | Implementation | Failure Behavior |
|-----------|----------------|------------------|
| **Real expertise areas** | Validate against known categories | Use generic terms |
| **Relevant to domain** | Cross-check with domain description | Regenerate |
| **Not too broad** | Avoid single-word generic terms | Add specificity |
| **Not too narrow** | Avoid overly technical niche terms | Broaden |
| **Stage appropriate** | Match expertise to stage needs | Adjust terms |

### 8.5 Evaluation Rubric

#### Test Case 1: Battery Domain at Prototype Stage

```yaml
Input:
  domain_name: "Battery Management"
  project_stage: "prototype"
  product_description: "Outdoor autonomous robot"
  search_context:
    urgency: "high"
    engagement_preference: "consulting"

Expected Output Characteristics:
  - Terms include "battery engineer", "BMS design"
  - Alternative includes "power systems", "energy storage"
  - Categories include "electrical engineering", "battery systems"
  
Evaluation Criteria:
  ✓ Primary terms relevant to battery/BMS
  ✓ Stage-appropriate (design help, not production)
  ✓ Urgency reflected in strategy
  ✓ Alternatives provide breadth
```

#### Test Case 2: Regulatory Domain - Specific Certification

```yaml
Input:
  domain_name: "FCC Certification"
  project_stage: "dvt"
  product_description: "WiFi-enabled thermostat"
  expert_hints:
    expertise_keywords: ["FCC", "EMC", "RF compliance"]

Expected Output Characteristics:
  - Terms include "FCC consultant", "EMC testing"
  - Should include "Part 15" reference
  - Lab-related terms for DVT stage
  
Evaluation Criteria:
  ✓ FCC-specific terms
  ✓ DVT stage = testing focus
  ✓ May include test lab searches
  ✓ Compliance consultant terms
```

#### Test Case 3: Novel Domain - Limited Hints

```yaml
Input:
  domain_name: "Underwater Acoustics"
  project_stage: "concept"
  product_description: "Submersible communication device"
  expert_hints: null  # No template hints

Expected Output Characteristics:
  - Generate reasonable terms despite no hints
  - Lower confidence
  - Broader terms as fallback
  
Evaluation Criteria:
  ✓ Generates relevant acoustic/underwater terms
  ✓ Confidence < 70
  ✓ Includes broader fallback terms
  ✓ Strategy acknowledges specialized domain
```

#### Test Case 4: Budget-Constrained Search

```yaml
Input:
  domain_name: "Mechanical Design"
  search_context:
    budget_range: { min: 1000, max: 5000 }
    engagement_preference: "project"

Expected Output Characteristics:
  - Terms suggest freelance/independent consultants
  - Strategy acknowledges budget constraint
  - May suggest fractional engagement
  
Evaluation Criteria:
  ✓ Strategy mentions budget-appropriate options
  ✓ May suggest alternative engagement types
  ✓ Terms include freelance/contractor options
```

#### Test Case 5: Location-Specific Search

```yaml
Input:
  domain_name: "Manufacturing"
  search_context:
    location_preference: ["Mexico", "US Southwest"]
  product_description: "Industrial sensor for US market"

Expected Output Characteristics:
  - Terms include regional manufacturing
  - Nearshoring expertise
  - Location-aware strategy
  
Evaluation Criteria:
  ✓ Mexico/nearshoring terms included
  ✓ Regional expertise prioritized
  ✓ Strategy addresses location preference
```

#### Test Case 6: Multiple Domain Types

```yaml
Input:
  domain_name: "System Integration"
  product_description: "Robot with multiple subsystems"
  expert_hints:
    expertise_keywords: ["systems engineering", "integration"]

Expected Output Characteristics:
  - Broad systems integration terms
  - May suggest multiple expert types
  - Strategy acknowledges complexity
  
Evaluation Criteria:
  ✓ Systems engineering terms
  ✓ Integration expertise highlighted
  ✓ May suggest team/multiple experts approach
```

---

## 9. Common Infrastructure

### 9.1 LLM Service Interface

```typescript
// src/lib/llm/service.ts

interface LLMServiceConfig {
  model: string
  temperature: number
  maxTokens: number
  promptVersion: string
}

interface LLMRequest {
  task: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7'
  input: unknown  // Task-specific input
  config?: Partial<LLMServiceConfig>
}

interface LLMResponse<T> {
  output: T
  provenance: LLMOutputProvenance
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export class LLMService {
  private defaultConfig: LLMServiceConfig = {
    model: 'gpt-4-turbo',
    temperature: 0.3,
    maxTokens: 4000,
    promptVersion: '1.0.0'
  }
  
  async execute<TInput, TOutput>(
    request: LLMRequest
  ): Promise<LLMResponse<TOutput>> {
    const config = { ...this.defaultConfig, ...request.config }
    
    // Build prompt
    const prompt = this.buildPrompt(request.task, request.input)
    
    // Call OpenAI
    const response = await this.callOpenAI(prompt, config)
    
    // Parse and validate
    const output = this.parseResponse<TOutput>(response, request.task)
    
    // Generate provenance
    const provenance = this.generateProvenance(
      request,
      response,
      config
    )
    
    return {
      output,
      provenance,
      usage: response.usage
    }
  }
  
  private buildPrompt(task: string, input: unknown): ChatMessage[] {
    const template = this.getPromptTemplate(task)
    return template.build(input)
  }
  
  private generateProvenance(
    request: LLMRequest,
    response: OpenAIResponse,
    config: LLMServiceConfig
  ): LLMOutputProvenance {
    return {
      provenance_type: 'ai_suggested',
      created_at: new Date().toISOString(),
      created_by: AI_AGENT_PROFILE_ID,
      ai_context: {
        confidence: this.calculateConfidence(request, response),
        confidence_factors: this.extractConfidenceFactors(request),
        rationale: this.extractRationale(response),
        assumptions: this.extractAssumptions(response),
        model_metadata: {
          model_id: config.model,
          temperature: config.temperature,
          prompt_version: config.promptVersion,
          tokens_used: response.usage.totalTokens,
          generation_timestamp: new Date().toISOString()
        },
        source_context: this.extractSourceContext(request.input)
      },
      verification: {
        status: 'pending_review',
        verified_by: null,
        verified_at: null
      }
    }
  }
}
```

### 9.2 Prompt Registry

```typescript
// src/lib/llm/prompts/registry.ts

interface PromptTemplate {
  version: string
  systemPrompt: string
  userPromptTemplate: string
  outputSchema: JSONSchema
  validationRules: ValidationRule[]
}

const PROMPT_REGISTRY: Record<string, PromptTemplate> = {
  'T1_DOMAIN_TREE': {
    version: '1.0.0',
    systemPrompt: `You are an expert hardware product development consultant...`,
    userPromptTemplate: `Product Description: {product_description}...`,
    outputSchema: T1OutputSchema,
    validationRules: [
      { type: 'min_domains', value: 5 },
      { type: 'max_depth', value: 4 },
      // ...
    ]
  },
  'T4_EXPERT_PACKET': {
    version: '2.1.0',
    systemPrompt: `You are an expert technical consultant creating an Expert Interview Packet...`,
    // ...
  },
  // ... other tasks
}
```

### 9.3 Response Validation

```typescript
// src/lib/llm/validation.ts

interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

async function validateLLMOutput<T>(
  output: T,
  task: string,
  input: unknown
): Promise<ValidationResult> {
  const schema = PROMPT_REGISTRY[task].outputSchema
  const rules = PROMPT_REGISTRY[task].validationRules
  
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  }
  
  // Schema validation
  const schemaValidation = validateAgainstSchema(output, schema)
  if (!schemaValidation.valid) {
    result.valid = false
    result.errors.push(...schemaValidation.errors)
  }
  
  // Rule validation
  for (const rule of rules) {
    const ruleResult = applyValidationRule(output, rule, input)
    if (ruleResult.severity === 'error') {
      result.valid = false
      result.errors.push(ruleResult)
    } else if (ruleResult.severity === 'warning') {
      result.warnings.push(ruleResult)
    }
  }
  
  return result
}
```

### 9.4 Task Queue Integration

```typescript
// Integration with Ghost Worker (existing)

async function queueLLMTask(
  taskType: string,
  input: unknown,
  blueprintId: string,
  domainId?: string
): Promise<string> {
  // Create task record
  const task = await createTask({
    title: `${taskType} Generation`,
    description: `AI-generated ${taskType}`,
    status: 'Pending',
    assignee_id: AI_AGENT_PROFILE_ID,
    metadata: {
      llm_task_type: taskType,
      llm_input: input,
      blueprint_id: blueprintId,
      domain_id: domainId,
      artifact_type: getArtifactType(taskType)
    }
  })
  
  // Queue for Ghost Worker
  await queueGhostWorkerTask(task.id)
  
  return task.id
}
```

---

## 10. Model Selection & Configuration

### 10.1 Recommended Models

| Task | Primary Model | Fallback | Temperature | Notes |
|------|---------------|----------|-------------|-------|
| T1 (Domain Tree) | gpt-4-turbo | gpt-4 | 0.4 | Needs creativity for novel products |
| T2 (Questions) | gpt-4-turbo | gpt-4 | 0.3 | Balanced creativity/precision |
| T3 (Risk) | gpt-4-turbo | gpt-4 | 0.2 | Lower temp for factual assessment |
| T4 (Expert Packet) | gpt-4-turbo | gpt-4 | 0.3 | Core task; needs quality |
| T5 (OptionSets) | gpt-4-turbo | gpt-4 | 0.3 | Needs balanced analysis |
| T6 (RFQ) | gpt-4-turbo | gpt-4 | 0.2 | Technical precision needed |
| T7 (Search Terms) | gpt-3.5-turbo | gpt-4 | 0.4 | Simpler task; faster |

### 10.2 Token Budget Guidelines

| Task | Max Input Tokens | Max Output Tokens | Typical Total |
|------|------------------|-------------------|---------------|
| T1 | 3000 | 4000 | 5000-6000 |
| T2 | 2000 | 2000 | 2500-3500 |
| T3 | 2500 | 2000 | 3000-4000 |
| T4 | 4000 | 4000 | 5000-7000 |
| T5 | 2500 | 3000 | 3500-5000 |
| T6 | 3000 | 4000 | 4500-6000 |
| T7 | 1500 | 1000 | 1500-2000 |

### 10.3 Rate Limiting Strategy

```typescript
const RATE_LIMITS = {
  // Per foundry limits
  foundry: {
    requestsPerMinute: 20,
    tokensPerMinute: 100000,
    requestsPerDay: 500
  },
  // Global limits
  global: {
    requestsPerMinute: 100,
    tokensPerMinute: 500000
  }
}

// Queue management
const QUEUE_CONFIG = {
  maxConcurrent: 5,
  retryAttempts: 3,
  retryDelayMs: 1000,
  timeoutMs: 60000
}
```

---

## 11. Prompt Engineering Guidelines

### 11.1 System Prompt Structure

```markdown
1. Role Definition (who the AI is)
2. Task Definition (what to do)
3. Critical Requirements (must-do rules)
4. Do NOT List (explicit prohibitions)
5. Output Format Specification
```

### 11.2 Context Injection Order

```markdown
1. Most stable context first (system prompt)
2. Task-specific instructions
3. Schema definition
4. Template/reference data
5. User-provided context (most variable)
```

### 11.3 Output Format Enforcement

```typescript
// Always include in prompt:
`## Output Format
Respond with ONLY valid JSON matching this exact schema. Do not include any text before or after the JSON.
{schema}`

// Post-processing:
function extractJSON(response: string): unknown {
  // Try direct parse
  try {
    return JSON.parse(response)
  } catch {
    // Extract JSON from markdown code blocks
    const jsonMatch = response.match(/```json?\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }
    throw new Error('No valid JSON found in response')
  }
}
```

### 11.4 Confidence Signal Extraction

```typescript
// Instruct model to include confidence signals
`Include confidence assessments:
- For each generated item, provide a confidence score (0-100)
- List specific factors that increase or decrease confidence
- Flag areas of uncertainty explicitly`

// Extract from response
function extractConfidenceFactors(response: T1Output): string[] {
  const factors: string[] = []
  
  // From explicit factors
  if (response.analysis?.confidence_factors) {
    factors.push(...response.analysis.confidence_factors)
  }
  
  // Infer from domain confidences
  const lowConfidenceDomains = response.proposed_domains
    .filter(d => d.confidence < 60)
  if (lowConfidenceDomains.length > 0) {
    factors.push(`${lowConfidenceDomains.length} domains have low confidence`)
  }
  
  return factors
}
```

---

## 12. Implementation Checklist

### 12.1 Core Infrastructure

- [ ] Create `src/lib/llm/service.ts` with LLMService class
- [ ] Create prompt registry with versioned templates
- [ ] Implement response validation framework
- [ ] Add rate limiting and queue management
- [ ] Integrate with Ghost Worker

### 12.2 Task Implementations

- [ ] T1: Domain tree generation from description
- [ ] T2: Stage-aware question generation
- [ ] T3: Risk/failure mode assessment
- [ ] T4: Expert Packet generation (priority)
- [ ] T5: OptionSet proposal
- [ ] T6: RFQ draft generation
- [ ] T7: Marketplace search term suggestion

### 12.3 Server Actions

- [ ] `generateDomainTree(blueprintId, input)` → T1
- [ ] `generateQuestions(domainId, input)` → T2
- [ ] `generateRiskAssessment(domainId, input)` → T3
- [ ] `generateExpertPacket(domainId, input)` → T4
- [ ] `generateOptionSet(domainId, input)` → T5
- [ ] `generateRFQDraft(domainId, input)` → T6
- [ ] `suggestSearchTerms(domainId, input)` → T7

### 12.4 Testing

- [ ] Unit tests for each task's validation logic
- [ ] Integration tests with mock LLM responses
- [ ] Evaluation rubric test suites (>= 6 cases per task)
- [ ] Regression tests for prompt versions
- [ ] Load testing for rate limiting

### 12.5 Monitoring

- [ ] Token usage tracking per foundry
- [ ] Latency metrics per task
- [ ] Validation failure tracking
- [ ] Human approval rates
- [ ] Regeneration request tracking

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/04-llm-design.md` | Created |
| `docs/blueprint/INDEX.md` | Pending update (Step 4 complete) |
| `docs/blueprint/ORCHESTRATION.md` | Pending update (Step 4 complete) |
