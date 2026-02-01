# RFQ Starter Pack Generator

> **Step 12 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-12

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [RFQ Packet Contents Structure](#2-rfq-packet-contents-structure)
3. [Domain-Specific Templates](#3-domain-specific-templates)
4. [Readiness Gating](#4-readiness-gating)
5. [Redaction & Privacy Controls](#5-redaction--privacy-controls)
6. [UX Flow](#6-ux-flow)
7. [Storage Strategy](#7-storage-strategy)
8. [Export ZIP Folder Structure](#8-export-zip-folder-structure)
9. [Integration with Existing RFQ System](#9-integration-with-existing-rfq-system)
10. [Edge Cases](#10-edge-cases)
11. [Implementation Checklist](#11-implementation-checklist)

---

## 1. Executive Summary

### 1.1 Purpose

The RFQ Starter Pack Generator transforms Manufacturing Blueprint data into comprehensive, vendor-ready Request for Quote (RFQ) packets. These packets feed into CentaurOS's existing RFQ system (`rfqs` and `rfq_responses` tables), enabling buyers to solicit quotes from marketplace suppliers.

**CRITICAL:** CentaurOS already has a full RFQ system. This feature generates RFQ "starter packs" that populate the existing system—it does NOT create a parallel RFQ workflow.

### 1.2 Key Principles

1. **Blueprint-Driven**: RFQ packets are generated from `blueprint_domain_coverage` data, decisions, and domain expertise
2. **Stage-Aware**: Content is tailored to `project_stage` (concept, prototype, evt, dvt, production, launched)
3. **Domain-Specific**: Templates adapt to domain type (PCB, battery, mechanical, etc.)
4. **Privacy-First**: Sensitive data can be redacted before export
5. **Readiness-Gated**: RFQ generation requires minimum coverage thresholds
6. **Human-Reviewed**: Generated packets require approval before creating actual RFQs

### 1.3 Integration Points

| CentaurOS Feature | Integration |
|-------------------|-------------|
| **RFQ System** | Starter pack → `createNewRFQ()` action → `rfqs` table |
| **Blueprint Coverage** | Reads `blueprint_domain_coverage` for requirements |
| **Decisions** | Incorporates `blueprint_domain_coverage.decisions` into specifications |
| **Expert Packets** | Reuses domain questions from expert packet generation |
| **Tasks** | RFQ pack stored as `tasks.metadata` artifact (artifact_type: 'rfq_pack') |
| **Stage Gates** | Respects readiness thresholds from `09-stage-gates.md` |

---

## 2. RFQ Packet Contents Structure

### 2.1 Core Packet Schema

```typescript
// src/types/rfq-starter-pack.ts

export interface RFQStarterPack {
  id: string;                              // UUID
  blueprint_id: string;                    // References blueprints.id
  domain_id: string;                       // References knowledge_domains.id (optional if multi-domain)
  domain_ids?: string[];                  // Multi-domain RFQ (e.g., "PCB Assembly + Enclosure")
  
  // Packet metadata
  title: string;                           // e.g., "18650 Battery Pack Assembly RFQ"
  description: string;                    // Executive summary for vendors
  project_stage: ProjectStage;            // 'concept' | 'prototype' | 'evt' | 'dvt' | 'production' | 'launched'
  generated_at: string;                   // ISO8601
  generated_by: string;                    // profile_id (user or AI_Agent)
  
  // Packet sections
  overview: RFQOverview;
  requirements: RFQRequirements;
  volumes: RFQVolumes;
  tolerances: RFQTolerances;
  target_cost: RFQTargetCost;
  timeline: RFQTimeline;
  compliance: RFQCompliance;
  vendor_questions: RFQVendorQuestion[];
  
  // Privacy & redaction
  redaction_settings: RedactionSettings;
  redacted_content: string[];              // Array of field paths that were redacted
  
  // Readiness status
  readiness_score: number;                 // 0-100, computed from stage gates
  readiness_gaps: ReadinessGap[];
  
  // AI provenance (if AI-generated)
  provenance?: ProvenanceMetadata;         // From 13-ai-confidence-verification.md
  
  // Verification state
  verification_status: VerificationStatus; // 'draft' | 'pending_review' | 'approved' | 'rejected'
  verified_by?: string;                    // profile_id
  verified_at?: string;                   // ISO8601
  
  // Export metadata
  export_format?: 'zip' | 'pdf' | 'json';
  exported_at?: string;
  export_path?: string;                    // Storage path if exported
}

export interface RFQOverview {
  product_context: string;                // What product this RFQ supports
  component_description: string;          // What component/assembly is being quoted
  intended_use: string;                   // How component fits into product
  design_maturity: string;                // e.g., "Conceptual design, no CAD yet"
  expected_volumes: string;                // High-level volume range
  timeline_summary: string;                // e.g., "Prototype samples needed Q2 2026"
}

export interface RFQRequirements {
  functional_requirements: RequirementItem[];
  performance_requirements: RequirementItem[];
  environmental_requirements: RequirementItem[];
  mechanical_requirements: RequirementItem[];
  electrical_requirements: RequirementItem[];
  material_requirements: RequirementItem[];
  quality_requirements: RequirementItem[];
  
  // Attachments/drawings
  referenced_drawings?: string[];          // File paths or URLs
  referenced_specs?: string[];            // Specification document references
}

export interface RequirementItem {
  id: string;                              // UUID
  requirement_text: string;                // e.g., "Operating temperature: -20°C to +60°C"
  rationale: string;                       // Why this requirement matters
  source: 'blueprint_domain' | 'decision' | 'expert_packet' | 'user_entered';
  source_id?: string;                      // References domain_id, decision_id, etc.
  priority: 'must_have' | 'should_have' | 'nice_to_have';
  verification_method?: string;            // How vendor should verify compliance
}

export interface RFQVolumes {
  prototype_units?: number;                // Units for prototype stage
  evt_units?: number;                      // Units for EVT stage
  dvt_units?: number;                      // Units for DVT stage
  production_units_per_year?: number;      // Annual production volume
  production_units_per_month?: number;    // Monthly production volume
  ramp_up_schedule?: VolumeSchedule[];     // Volume ramp over time
  minimum_order_quantity?: number;         // MOQ requirement
  maximum_order_quantity?: number;         // Max order size
}

export interface VolumeSchedule {
  stage: ProjectStage;
  start_date: string;                      // ISO8601
  units: number;
  duration_months?: number;
}

export interface RFQTolerances {
  dimensional_tolerances?: ToleranceSpec[];
  electrical_tolerances?: ToleranceSpec[];
  performance_tolerances?: ToleranceSpec[];
  general_note?: string;                   // e.g., "All tolerances per ISO 2768-m"
}

export interface ToleranceSpec {
  parameter: string;                       // e.g., "Battery capacity"
  nominal_value: string;                    // e.g., "5000 mAh"
  tolerance: string;                       // e.g., "±5%"
  rationale?: string;                      // Why this tolerance matters
}

export interface RFQTargetCost {
  target_unit_cost?: number;               // Target cost per unit
  target_unit_cost_currency: string;        // e.g., "USD"
  cost_basis: 'prototype' | 'evt' | 'dvt' | 'production';
  volume_assumption?: number;              // Volume used for cost target
  cost_breakdown?: CostBreakdownItem[];    // Optional: material, labor, overhead
  notes?: string;                          // e.g., "Target assumes 10K units/year"
}

export interface CostBreakdownItem {
  category: string;                        // e.g., "Material", "Assembly Labor"
  percentage?: number;                     // % of total cost
  amount?: number;                         // Absolute amount
}

export interface RFQTimeline {
  rfq_response_deadline: string;           // ISO8601: When quotes are due
  prototype_samples_due?: string;         // ISO8601: When prototype samples needed
  evt_samples_due?: string;               // ISO8601: When EVT samples needed
  production_start_date?: string;          // ISO8601: When production should start
  milestones: TimelineMilestone[];
  critical_path_items?: string[];           // Items that cannot slip
}

export interface TimelineMilestone {
  name: string;                            // e.g., "Tooling complete"
  target_date: string;                     // ISO8601
  dependencies?: string[];                  // Other milestone names
}

export interface RFQCompliance {
  regulatory_requirements: ComplianceItem[];
  certification_requirements: ComplianceItem[];
  testing_requirements: ComplianceItem[];
  documentation_requirements: ComplianceItem[];
}

export interface ComplianceItem {
  requirement: string;                     // e.g., "CE marking required"
  standard?: string;                       // e.g., "EN 62133"
  rationale: string;                       // Why this compliance matters
  verification_required: boolean;          // Does vendor need to provide proof?
}

export interface RFQVendorQuestion {
  id: string;                              // UUID
  question_text: string;                   // Question for vendor to answer
  question_type: 'feasibility' | 'design' | 'validation' | 'compliance' | 'process' | 'cost';
  rationale: string;                       // Why this question matters
  required: boolean;                        // Must vendor answer?
  expected_response_format?: string;       // e.g., "Numeric value in mAh"
  source: 'expert_packet' | 'domain_key_question' | 'ai_generated' | 'user_entered';
  source_id?: string;                      // References question ID from expert packet
}

export interface RedactionSettings {
  redact_sensitive_data: boolean;
  redacted_categories: SensitiveDataCategory[];
  include_exclude_toggles: Record<string, boolean>; // Field-level toggles
}

export type SensitiveDataCategory =
  | 'budget'                    // Target costs, budget ranges
  | 'volumes'                   // Production volumes (competitively sensitive)
  | 'timeline'                  // Aggressive timelines
  | 'design_details'            // Proprietary design information
  | 'market_info'               // Market size, customer info
  | 'regulatory_strategy'       // Regulatory approach details
  | 'supplier_relationships'    // Existing supplier info
  | 'internal_decisions';       // Internal decision rationale

export interface ReadinessGap {
  gap_type: 'coverage' | 'decision' | 'specification' | 'compliance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  required_action: string;
  blocking: boolean;                        // Blocks RFQ creation if true
}
```

### 2.2 Packet Generation Logic

**Input Sources (in priority order):**

1. **Blueprint Domain Coverage** (`blueprint_domain_coverage`)
   - Coverage status, blockers, notes
   - Decisions from `decisions` JSONB array
   - Stage relevance from `metadata.stage_relevance`

2. **Knowledge Domain** (`knowledge_domains`)
   - Domain name, description
   - `key_questions` array (becomes vendor questions)
   - Domain `criticality` level

3. **Expert Packets** (from `tasks` with `artifact_type: 'expert_packet'`)
   - Reuse questions already generated for this domain
   - Provenance metadata for traceability

4. **Decisions** (`blueprint_domain_coverage.decisions`)
   - Selected options from OptionSets
   - Assumptions and constraints
   - Rationale flows into requirement rationale

5. **Risk Heatmap** (computed on-demand)
   - High-risk areas require more detailed requirements
   - Compliance gaps → compliance requirements

6. **User Input** (manual edits)
   - User can override any generated content
   - Manual additions marked `source: 'user_entered'`

---

## 3. Domain-Specific Templates

### 3.1 Template Selection Logic

RFQ packets adapt their structure based on the domain's `knowledge_domains.name` and `metadata.domain_type`:

```typescript
type DomainType = 
  | 'general'              // Default template
  | 'pcb_electronics'      // PCB/electronics specific
  | 'battery_pack'         // Battery pack assembly
  | 'mechanical_enclosure' // Mechanical enclosure/housing
  | 'electromechanical'    // Motors, actuators
  | 'software_firmware'    // Embedded software (rare for RFQ)
  | 'packaging'            // Product packaging
  | 'testing_validation';  // Testing services
```

**Template Selection Rules:**

1. **Exact Match**: If `knowledge_domains.metadata.domain_type` matches a template → use that template
2. **Name Pattern Match**: If domain name contains keywords (e.g., "PCB", "Battery", "Enclosure") → infer template
3. **Parent Domain**: If domain has parent, check parent's template
4. **Default**: Fall back to `'general'` template

### 3.2 General Template

**Use Case:** Default template for domains without specific requirements.

**Sections Emphasized:**
- Overview (product context)
- Functional requirements (from domain coverage)
- Vendor questions (from `key_questions`)

**Sections Minimized:**
- Tolerances (generic note only)
- Compliance (basic regulatory if applicable)

### 3.3 PCB/Electronics Template

**Use Case:** Printed circuit boards, electronic assemblies, component sourcing.

**Sections Emphasized:**
- **Electrical Requirements:**
  - Operating voltage/current ranges
  - Power consumption limits
  - Signal integrity requirements
  - EMI/EMC requirements
  - Connector specifications

- **Performance Requirements:**
  - Processing speed, memory, I/O capabilities
  - Environmental operating ranges (temperature, humidity)
  - Reliability metrics (MTBF, failure rate)

- **Tolerances:**
  - Component placement accuracy
  - Trace width/spacing
  - Via specifications
  - Solder joint quality

- **Compliance:**
  - CE marking (EU)
  - FCC certification (US)
  - RoHS compliance
  - IPC standards (IPC-A-610, IPC-J-STD-001)

- **Vendor Questions:**
  - "What is your typical lead time for prototype PCBs?"
  - "Do you support surface mount (SMT) and through-hole (THT) assembly?"
  - "What is your minimum order quantity (MOQ) for production runs?"
  - "Can you provide design for manufacturability (DFM) feedback?"
  - "What testing capabilities do you offer (ICT, functional test, burn-in)?"

**Example Generated Content:**

```markdown
## Electrical Requirements

### Power Supply
- **Requirement:** Operating voltage: 3.3V ±5% (3.135V to 3.465V)
- **Rationale:** Component compatibility requires tight voltage regulation
- **Source:** Decision ID: abc-123 (Selected 3.3V power rail)

### Signal Integrity
- **Requirement:** All high-speed signals (>100MHz) must meet impedance control: 50Ω ±10%
- **Rationale:** Prevents signal reflection and ensures reliable communication
- **Source:** Expert packet question (PCB Design domain)

## Compliance Requirements

- **CE Marking:** Required for EU market entry
- **RoHS Compliance:** All components must be RoHS compliant (lead-free)
- **IPC Standards:** Assembly must meet IPC-A-610 Class 2 (commercial electronics)
```

### 3.4 Battery Pack Template

**Use Case:** Battery pack assembly, cell selection, BMS integration.

**Sections Emphasized:**
- **Performance Requirements:**
  - Capacity (mAh or Wh)
  - Voltage range (nominal, min, max)
  - Charge/discharge rates (C-rate)
  - Cycle life
  - Energy density

- **Safety Requirements:**
  - Overcharge/overdischarge protection
  - Short circuit protection
  - Thermal management
  - Cell balancing requirements

- **Environmental Requirements:**
  - Operating temperature range
  - Storage temperature range
  - Humidity tolerance
  - Vibration/shock resistance

- **Compliance:**
  - UN 38.3 (transportation)
  - IEC 62133 (safety)
  - UL 2054 (US safety)
  - CE marking (EU)

- **Vendor Questions:**
  - "What cell chemistry do you recommend (Li-Ion, Li-Po, LiFePO4)?"
  - "What is your battery management system (BMS) approach?"
  - "Can you provide cell-level testing data?"
  - "What is your approach to thermal management?"
  - "Do you offer custom form factors or only standard sizes?"

**Example Generated Content:**

```markdown
## Performance Requirements

### Capacity
- **Requirement:** Nominal capacity: 5000 mAh ±5% (4750 mAh to 5250 mAh)
- **Rationale:** Product requires minimum 8-hour runtime at 500mA discharge
- **Source:** Decision ID: def-456 (Selected 5000 mAh target)

### Charge Rate
- **Requirement:** Maximum charge rate: 1C (5A) with temperature monitoring
- **Rationale:** Fast charging required for user experience, but safety is paramount
- **Source:** Expert packet question (Battery Management domain)

## Safety Requirements

- **Overcharge Protection:** BMS must prevent charging above 4.2V per cell
- **Overdischarge Protection:** BMS must prevent discharge below 2.5V per cell
- **Thermal Protection:** Battery pack must include temperature sensors and thermal cutoff
- **Source:** Domain coverage notes (Battery Safety domain)
```

### 3.5 Mechanical Enclosure Template

**Use Case:** Product housings, enclosures, structural components.

**Sections Emphasized:**
- **Mechanical Requirements:**
  - Dimensions (L x W x H)
  - Weight limits
  - Material specifications
  - Surface finish requirements
  - Color/paint specifications

- **Environmental Requirements:**
  - IP rating (ingress protection)
  - Operating temperature range
  - UV resistance
  - Chemical resistance

- **Tolerances:**
  - Dimensional tolerances (ISO 2768-m or custom)
  - Surface roughness
  - Fit tolerances (for mating parts)

- **Compliance:**
  - Material safety (REACH, RoHS)
  - Flammability standards (UL 94)
  - Drop test requirements

- **Vendor Questions:**
  - "What manufacturing processes do you support (injection molding, CNC, sheet metal)?"
  - "What is your tooling lead time and cost?"
  - "Can you provide material samples?"
  - "What is your approach to color matching?"
  - "Do you offer design for manufacturability (DFM) analysis?"

**Example Generated Content:**

```markdown
## Mechanical Requirements

### Dimensions
- **Requirement:** Enclosure dimensions: 150mm (L) × 100mm (W) × 50mm (H) ±0.5mm
- **Rationale:** Must fit within product form factor constraints
- **Source:** Decision ID: ghi-789 (Selected compact form factor)

### Material
- **Requirement:** Material: ABS plastic, UL 94 V-0 rated, color: Pantone 18-1664 TPX (International Orange)
- **Rationale:** Brand color requirement + flame retardancy for safety
- **Source:** User-entered requirement

## Tolerances

- **General Tolerances:** Per ISO 2768-m (medium tolerance)
- **Critical Dimensions:** ±0.2mm (for mating parts)
- **Surface Finish:** Ra ≤ 0.8μm (smooth finish required for aesthetics)
```

---

## 4. Readiness Gating

### 4.1 Readiness Score Calculation

RFQ packets cannot be exported or converted to actual RFQs until minimum readiness thresholds are met. Readiness is computed from stage gate requirements (see `09-stage-gates.md`).

```typescript
interface ReadinessScore {
  overall_score: number;                  // 0-100
  coverage_score: number;                  // 0-100: Domain coverage completeness
  decision_score: number;                  // 0-100: Critical decisions made
  specification_score: number;            // 0-100: Requirements completeness
  compliance_score: number;               // 0-100: Compliance requirements identified
  gaps: ReadinessGap[];
}

function calculateReadinessScore(
  blueprint: Blueprint,
  domainCoverage: BlueprintDomainCoverage[],
  projectStage: ProjectStage
): ReadinessScore {
  // Stage-specific thresholds from 09-stage-gates.md
  const stageThresholds = {
    concept: { coverage: 50, decision: 40, spec: 40, compliance: 30 },
    prototype: { coverage: 70, decision: 60, spec: 60, compliance: 50 },
    evt: { coverage: 85, decision: 80, spec: 80, compliance: 70 },
    dvt: { coverage: 95, decision: 90, spec: 90, compliance: 85 },
    production: { coverage: 100, decision: 100, spec: 100, compliance: 100 },
    launched: { coverage: 100, decision: 100, spec: 100, compliance: 100 },
  };
  
  const thresholds = stageThresholds[projectStage];
  
  // Calculate component scores
  const coverageScore = calculateCoverageScore(domainCoverage, thresholds.coverage);
  const decisionScore = calculateDecisionScore(domainCoverage, thresholds.decision);
  const specScore = calculateSpecificationScore(domainCoverage, thresholds.spec);
  const complianceScore = calculateComplianceScore(domainCoverage, thresholds.compliance);
  
  // Weighted average
  const overallScore = (
    coverageScore * 0.3 +
    decisionScore * 0.25 +
    specScore * 0.25 +
    complianceScore * 0.2
  );
  
  return {
    overall_score: Math.round(overallScore),
    coverage_score: coverageScore,
    decision_score: decisionScore,
    specification_score: specScore,
    compliance_score: complianceScore,
    gaps: identifyGaps(domainCoverage, thresholds),
  };
}
```

### 4.2 Stage Requirements

**Concept Stage:**
- ✅ Coverage: At least 50% of critical domains have `status != 'gap'`
- ✅ Decisions: Key make-vs-buy decisions documented
- ✅ Specifications: High-level functional requirements defined
- ✅ Compliance: Regulatory landscape identified (not necessarily detailed)

**Prototype Stage:**
- ✅ Coverage: At least 70% of critical domains covered
- ✅ Decisions: Material/component selections made
- ✅ Specifications: Performance targets defined with ranges
- ✅ Compliance: Key certifications identified

**EVT Stage:**
- ✅ Coverage: At least 85% of domains covered
- ✅ Decisions: Supplier selection decisions made (or RFQ is for supplier selection)
- ✅ Specifications: Detailed requirements with tolerances
- ✅ Compliance: Testing requirements defined

**DVT Stage:**
- ✅ Coverage: At least 95% of domains covered
- ✅ Decisions: All critical decisions finalized
- ✅ Specifications: Production-ready specifications
- ✅ Compliance: All compliance requirements detailed

**Production/Launched:**
- ✅ Coverage: 100% (all domains covered)
- ✅ Decisions: All decisions finalized
- ✅ Specifications: Complete production specifications
- ✅ Compliance: Full compliance documentation

### 4.3 AI Verification Thresholds

When AI generates RFQ packets, confidence thresholds determine auto-approval vs. review required:

| Confidence Score | Verification Status | Action |
|------------------|---------------------|--------|
| **80-100** | `approved` (auto) | Can export/create RFQ immediately |
| **60-79** | `pending_review` | Requires human review before export |
| **40-59** | `pending_review` | Requires human review + highlights low confidence |
| **0-39** | `draft` | Cannot export until manually approved |

**Confidence Factors (from `13-ai-confidence-verification.md`):**
- Template match (30%): How well domain matches known template
- Context completeness (25%): Amount of blueprint data available
- Domain specificity (20%): Whether domain has structured `key_questions`
- Stage clarity (15%): Whether `project_stage` is appropriate
- Historical success (10%): Model's track record for similar generations

### 4.4 Required Decisions

Before generating RFQ packets, certain decisions must be made (or RFQ is explicitly for making those decisions):

**Always Required:**
- [ ] Make vs. buy decision (if domain is "gap", RFQ is for buying)
- [ ] Volume assumptions (prototype, EVT, production)

**Stage-Dependent:**
- **Concept:** Material selection (if applicable)
- **Prototype:** Component specifications (if applicable)
- **EVT:** Supplier selection approach (single vs. multiple suppliers)
- **DVT:** Production volumes and ramp schedule

**Decision Source:**
- Check `blueprint_domain_coverage.decisions` JSONB array
- If decision missing → add to `readiness_gaps` with `blocking: true`

---

## 5. Redaction & Privacy Controls

### 5.1 Sensitive Data Categories

Users can redact sensitive information before exporting RFQ packets or creating actual RFQs:

```typescript
type SensitiveDataCategory =
  | 'budget'                    // Target costs, budget ranges
  | 'volumes'                   // Production volumes (competitively sensitive)
  | 'timeline'                  // Aggressive timelines
  | 'design_details'            // Proprietary design information
  | 'market_info'               // Market size, customer info
  | 'regulatory_strategy'       // Regulatory approach details
  | 'supplier_relationships'    // Existing supplier info
  | 'internal_decisions';       // Internal decision rationale
```

### 5.2 Redaction Rules

**Category: `budget`**
- Redacts: `target_cost.target_unit_cost`, `target_cost.cost_breakdown`
- Replaces with: "Budget available upon request" or removes section entirely
- Rationale: Prevents vendors from anchoring to target price

**Category: `volumes`**
- Redacts: `volumes.production_units_per_year`, `volumes.ramp_up_schedule`
- Replaces with: "Volume TBD based on market demand" or generic range ("10K-100K units/year")
- Rationale: Prevents competitive intelligence gathering

**Category: `timeline`**
- Redacts: `timeline.production_start_date`, `timeline.milestones` with specific dates
- Replaces with: "Timeline to be discussed" or removes dates
- Rationale: Prevents vendors from exploiting urgency

**Category: `design_details`**
- Redacts: Specific dimensions, materials, proprietary features
- Replaces with: "Design details available under NDA" or generic descriptions
- Rationale: Protects intellectual property

**Category: `market_info`**
- Redacts: Market size, customer segments, competitive analysis
- Replaces with: Generic product description
- Rationale: Prevents competitive intelligence

**Category: `regulatory_strategy`**
- Redacts: Specific regulatory approach, certification strategy
- Replaces with: "Compliance requirements as specified"
- Rationale: Prevents vendors from exploiting regulatory gaps

**Category: `supplier_relationships`**
- Redacts: References to existing suppliers, previous quotes
- Replaces with: Removed entirely
- Rationale: Prevents vendor collusion

**Category: `internal_decisions`**
- Redacts: `requirement.rationale` fields that reference internal decisions
- Replaces with: Generic rationale ("Required for product functionality")
- Rationale: Protects internal decision-making process

### 5.3 Include/Exclude Toggles

Users can fine-tune redaction with field-level toggles:

```typescript
interface RedactionSettings {
  redact_sensitive_data: boolean;          // Master toggle
  redacted_categories: SensitiveDataCategory[];
  include_exclude_toggles: {
    // Section-level toggles
    'overview.product_context': boolean;
    'overview.expected_volumes': boolean;
    'requirements.functional_requirements': boolean;
    'requirements.rationale': boolean;     // Redact rationale fields
    'volumes.production_units_per_year': boolean;
    'target_cost.target_unit_cost': boolean;
    'timeline.production_start_date': boolean;
    'vendor_questions': boolean;          // Hide vendor questions section
    // ... more granular toggles
  };
}
```

**Default Behavior:**
- If `redact_sensitive_data: false` → no redaction applied
- If `redact_sensitive_data: true` → apply category-based redaction + respect toggles
- Toggles override categories: if toggle says `include`, include even if category says redact

### 5.4 Redaction Implementation

```typescript
function applyRedaction(
  packet: RFQStarterPack,
  settings: RedactionSettings
): RFQStarterPack {
  if (!settings.redact_sensitive_data) {
    return packet;
  }
  
  const redactedPacket = { ...packet };
  const redactedPaths: string[] = [];
  
  // Apply category-based redaction
  for (const category of settings.redacted_categories) {
    const paths = getPathsForCategory(category);
    for (const path of paths) {
      // Check if toggle allows inclusion
      if (settings.include_exclude_toggles[path] === false) {
        redactPath(redactedPacket, path);
        redactedPaths.push(path);
      }
    }
  }
  
  // Apply toggle-based redaction (even if category not selected)
  for (const [path, include] of Object.entries(settings.include_exclude_toggles)) {
    if (include === false) {
      redactPath(redactedPacket, path);
      if (!redactedPaths.includes(path)) {
        redactedPaths.push(path);
      }
    }
  }
  
  redactedPacket.redacted_content = redactedPaths;
  return redactedPacket;
}

function redactPath(obj: any, path: string): void {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
    if (!current) return;
  }
  
  const lastKey = parts[parts.length - 1];
  if (current[lastKey] !== undefined) {
    // Replace with redaction placeholder
    if (typeof current[lastKey] === 'string') {
      current[lastKey] = '[REDACTED]';
    } else if (typeof current[lastKey] === 'number') {
      current[lastKey] = null;
    } else if (Array.isArray(current[lastKey])) {
      current[lastKey] = [];
    } else {
      current[lastKey] = null;
    }
  }
}
```

---

## 6. UX Flow

### 6.1 Generate → Preview → Checklist → Export → Create RFQ

```
┌─────────────────────────────────────────────────────────────────┐
│                    RFQ STARTER PACK GENERATION FLOW              │
└─────────────────────────────────────────────────────────────────┘

1. GENERATE
   ┌─────────────────────────────────────┐
   │ User clicks "Generate RFQ Pack"    │
   │ from blueprint domain detail view  │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ Select domains (single or multi)    │
   │ - Domain picker                    │
   │ - Multi-select for assemblies      │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ Select template (auto-detected)     │
   │ - PCB/Electronics                   │
   │ - Battery Pack                      │
   │ - Mechanical Enclosure              │
   │ - General (default)                 │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ AI Generation (Ghost Worker T6)     │
   │ - Reads blueprint coverage          │
   │ - Incorporates decisions           │
   │ - Generates requirements            │
   │ - Creates vendor questions          │
   │ - Calculates readiness score        │
   └─────────────────────────────────────┘
              │
              ▼
2. PREVIEW
   ┌─────────────────────────────────────┐
   │ RFQ Pack Preview Screen             │
   │ - Readiness score (0-100)           │
   │ - Readiness gaps list               │
   │ - Packet sections (collapsible)     │
   │ - Edit buttons per section          │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ User Reviews Content                │
   │ - Can edit any section              │
   │ - Can add/remove requirements       │
   │ - Can modify vendor questions       │
   └─────────────────────────────────────┘
              │
              ▼
3. CHECKLIST
   ┌─────────────────────────────────────┐
   │ Readiness Checklist                  │
   │ - Coverage gaps (if any)            │
   │ - Missing decisions                 │
   │ - Incomplete specifications          │
   │ - Compliance gaps                    │
   │ - Blocking items highlighted        │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ If Readiness < Threshold:           │
   │ - Show "Fix Gaps" button            │
   │ - Link to domain coverage view      │
   │ - Cannot proceed until fixed        │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ If Readiness ≥ Threshold:           │
   │ - Show "Configure Export" button    │
   └─────────────────────────────────────┘
              │
              ▼
4. EXPORT
   ┌─────────────────────────────────────┐
   │ Redaction Settings Dialog           │
   │ - Category checkboxes               │
   │ - Field-level toggles               │
   │ - Preview redacted content          │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ Export Format Selection             │
   │ - ZIP (folder structure)            │
   │ - PDF (formatted document)           │
   │ - JSON (machine-readable)           │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ Export Complete                     │
   │ - Download link                     │
   │ - Storage path (if saved)            │
   │ - "Create RFQ" button enabled       │
   └─────────────────────────────────────┘
              │
              ▼
5. CREATE RFQ
   ┌─────────────────────────────────────┐
   │ "Create RFQ" Button                 │
   │ - Opens existing RFQ creation UI   │
   │ - Pre-populates from packet          │
   │ - User confirms/finalizes            │
   └─────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ RFQ Created in rfqs table          │
   │ - Links back to blueprint_id         │
   │ - Links back to packet (task_id)     │
   │ - Ready for marketplace broadcast    │
   └─────────────────────────────────────┘
```

### 6.2 Screen Specifications

**Screen 1: Generate RFQ Pack (Dialog)**

```tsx
// src/app/(platform)/blueprints/[id]/generate-rfq-dialog.tsx

<Dialog>
  <DialogHeader>
    <DialogTitle>Generate RFQ Starter Pack</DialogTitle>
  </DialogHeader>
  <DialogContent size="lg">
    {/* Domain Selection */}
    <div className="space-y-4">
      <Label>Select Domain(s)</Label>
      <DomainMultiSelect
        blueprintId={blueprintId}
        selectedDomains={selectedDomains}
        onChange={setSelectedDomains}
      />
      <p className="text-sm text-muted-foreground">
        Select one or more domains to include in this RFQ pack.
      </p>
    </div>
    
    {/* Template Selection */}
    <div className="space-y-4">
      <Label>RFQ Template</Label>
      <Select value={template} onValueChange={setTemplate}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Auto-detect (Recommended)</SelectItem>
          <SelectItem value="general">General</SelectItem>
          <SelectItem value="pcb_electronics">PCB/Electronics</SelectItem>
          <SelectItem value="battery_pack">Battery Pack</SelectItem>
          <SelectItem value="mechanical_enclosure">Mechanical Enclosure</SelectItem>
        </SelectContent>
      </Select>
    </div>
    
    {/* Readiness Warning */}
    {readinessScore < 60 && (
      <Alert variant="warning">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Low Readiness Score</AlertTitle>
        <AlertDescription>
          Current readiness: {readinessScore}/100. Some sections may be incomplete.
          You can edit the packet after generation.
        </AlertDescription>
      </Alert>
    )}
    
    <DialogFooter>
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button onClick={onGenerate} disabled={isGenerating}>
        {isGenerating ? (
          <>
            <Loader2 className="animate-spin mr-2" />
            Generating...
          </>
        ) : (
          'Generate RFQ Pack'
        )}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Screen 2: RFQ Pack Preview**

```tsx
// src/app/(platform)/blueprints/[id]/rfq-pack-preview.tsx

<div className="space-y-8">
  {/* Header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-display">{pack.title}</h1>
      <p className="text-muted-foreground">{pack.description}</p>
    </div>
    <ReadinessBadge score={pack.readiness_score} />
  </div>
  
  {/* Readiness Gaps */}
  {pack.readiness_gaps.length > 0 && (
    <Alert variant={hasBlockingGaps ? "destructive" : "warning"}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Readiness Gaps</AlertTitle>
      <AlertDescription>
        <ul className="list-disc list-inside space-y-1 mt-2">
          {pack.readiness_gaps.map((gap, i) => (
            <li key={i}>
              <span className={gap.blocking ? "font-semibold" : ""}>
                [{gap.severity}] {gap.description}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )}
  
  {/* Packet Sections */}
  <Tabs defaultValue="overview">
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="requirements">Requirements</TabsTrigger>
      <TabsTrigger value="volumes">Volumes</TabsTrigger>
      <TabsTrigger value="tolerances">Tolerances</TabsTrigger>
      <TabsTrigger value="cost">Target Cost</TabsTrigger>
      <TabsTrigger value="timeline">Timeline</TabsTrigger>
      <TabsTrigger value="compliance">Compliance</TabsTrigger>
      <TabsTrigger value="questions">Vendor Questions</TabsTrigger>
    </TabsList>
    
    <TabsContent value="overview">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Overview</CardTitle>
            <Button variant="ghost" size="icon" onClick={onEditOverview}>
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <RFQOverviewSection data={pack.overview} />
        </CardContent>
      </Card>
    </TabsContent>
    
    {/* ... other tabs ... */}
  </Tabs>
  
  {/* Actions */}
  <div className="flex items-center justify-between border-t pt-6">
    <Button variant="secondary" onClick={onSaveDraft}>
      Save Draft
    </Button>
    <div className="flex gap-2">
      <Button variant="outline" onClick={onExport}>
        Export Pack
      </Button>
      <Button
        onClick={onCreateRFQ}
        disabled={!canCreateRFQ}
      >
        Create RFQ
      </Button>
    </div>
  </div>
</div>
```

**Screen 3: Redaction Settings**

```tsx
// src/app/(platform)/blueprints/[id]/rfq-redaction-dialog.tsx

<Dialog>
  <DialogHeader>
    <DialogTitle>Configure Redaction</DialogTitle>
  </DialogHeader>
  <DialogContent size="lg">
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label>Redact Sensitive Data</Label>
          <p className="text-sm text-muted-foreground">
            Hide competitively sensitive information before sharing with vendors.
          </p>
        </div>
        <Switch
          checked={settings.redact_sensitive_data}
          onCheckedChange={(checked) =>
            setSettings({ ...settings, redact_sensitive_data: checked })
          }
        />
      </div>
      
      {/* Category Checkboxes */}
      {settings.redact_sensitive_data && (
        <div className="space-y-4">
          <Label>Redaction Categories</Label>
          <div className="grid grid-cols-2 gap-4">
            {SENSITIVE_CATEGORIES.map((category) => (
              <div key={category} className="flex items-center space-x-2">
                <Checkbox
                  id={category}
                  checked={settings.redacted_categories.includes(category)}
                  onCheckedChange={(checked) => {
                    const categories = checked
                      ? [...settings.redacted_categories, category]
                      : settings.redacted_categories.filter((c) => c !== category);
                    setSettings({ ...settings, redacted_categories: categories });
                  }}
                />
                <Label htmlFor={category} className="font-normal">
                  {categoryLabels[category]}
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Preview */}
      <div className="border-t pt-4">
        <Label>Preview Redacted Content</Label>
        <Button variant="outline" onClick={onPreview}>
          Preview Redacted Pack
        </Button>
      </div>
    </div>
    
    <DialogFooter>
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button onClick={onApply}>Apply Redaction</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 7. Storage Strategy

### 7.1 Minimal Storage Approach

**Decision: Store RFQ packs in `tasks.metadata` (not separate `blueprint_artifacts` table)**

**Rationale:**
- `tasks` table already supports artifacts via `metadata.artifact_type`
- No new table needed (minimal schema changes)
- Integrates with existing task workflow for review/approval
- Can link RFQ pack to actual RFQ via `tasks.metadata.rfq_id`

### 7.2 Storage Schema

```typescript
// tasks.metadata schema for RFQ packs

{
  "blueprint_id": "uuid",
  "domain_id": "uuid | null",           // Single domain, or null if multi-domain
  "domain_ids": ["uuid"],                // Multi-domain RFQ
  "artifact_type": "rfq_pack",
  
  // RFQ pack data
  "rfq_pack": {
    // Full RFQStarterPack object (see section 2.1)
    "id": "uuid",
    "title": "string",
    "description": "string",
    // ... all fields from RFQStarterPack
  },
  
  // Link to actual RFQ (populated after "Create RFQ")
  "rfq_id": "uuid | null",
  
  // LLM task metadata (if AI-generated)
  "llm_task_type": "T6",                 // T6 = RFQ pack generation
  "provenance": { /* ProvenanceMetadata */ }
}
```

### 7.3 Task Creation Flow

```typescript
// When user clicks "Generate RFQ Pack"

async function generateRFQPack(
  blueprintId: string,
  domainIds: string[],
  template: DomainType
): Promise<{ taskId: string; pack: RFQStarterPack }> {
  // 1. Create task with metadata placeholder
  const task = await createTask({
    title: `RFQ Pack: ${domainNames.join(', ')}`,
    description: `RFQ starter pack for ${domainNames.join(', ')}`,
    status: 'Pending',                    // Requires review if AI-generated
    metadata: {
      blueprint_id: blueprintId,
      domain_ids: domainIds,
      artifact_type: 'rfq_pack',
      llm_task_type: 'T6',
      rfq_pack: null,                      // Will be populated by Ghost Worker
    },
  });
  
  // 2. Queue Ghost Worker T6 task
  await queueLLMTask({
    task_id: task.id,
    task_type: 'T6',
    input: {
      blueprint_id: blueprintId,
      domain_ids: domainIds,
      template,
    },
  });
  
  // 3. Ghost Worker generates pack, updates task.metadata.rfq_pack
  // 4. Task status becomes 'Pending_Peer_Review' (if confidence < 80)
  
  return { taskId: task.id, pack: null };  // Pack will be available after generation
}
```

### 7.4 Querying RFQ Packs

```sql
-- Find all RFQ packs for a blueprint
SELECT 
  t.id AS task_id,
  t.title,
  t.status,
  t.metadata->>'blueprint_id' AS blueprint_id,
  t.metadata->'rfq_pack' AS rfq_pack_data,
  t.metadata->>'rfq_id' AS linked_rfq_id
FROM tasks t
WHERE t.metadata->>'artifact_type' = 'rfq_pack'
  AND t.metadata->>'blueprint_id' = $1
ORDER BY t.created_at DESC;

-- Find RFQ pack by domain
SELECT *
FROM tasks
WHERE metadata->>'artifact_type' = 'rfq_pack'
  AND (
    metadata->>'domain_id' = $1
    OR $1 = ANY(SELECT jsonb_array_elements_text(metadata->'domain_ids'))
  );
```

### 7.5 Indexes

```sql
-- GIN index for JSONB queries
CREATE INDEX idx_tasks_metadata_artifact_type 
ON tasks USING GIN ((metadata->>'artifact_type'));

CREATE INDEX idx_tasks_metadata_blueprint_id 
ON tasks ((metadata->>'blueprint_id'))
WHERE metadata->>'artifact_type' = 'rfq_pack';

CREATE INDEX idx_tasks_metadata_rfq_id 
ON tasks ((metadata->>'rfq_id'))
WHERE metadata->>'rfq_id' IS NOT NULL;
```

---

## 8. Export ZIP Folder Structure

### 8.1 ZIP Structure

When exporting RFQ packs as ZIP files, use this folder structure:

```
RFQ-Pack-{pack-id}/
├── README.md                          # Overview and instructions
├── 00-Overview.md                     # Executive summary
├── 01-Requirements/
│   ├── Functional-Requirements.md
│   ├── Performance-Requirements.md
│   ├── Environmental-Requirements.md
│   ├── Mechanical-Requirements.md
│   ├── Electrical-Requirements.md
│   ├── Material-Requirements.md
│   └── Quality-Requirements.md
├── 02-Volumes.md                      # Volume specifications
├── 03-Tolerances.md                   # Tolerance specifications
├── 04-Target-Cost.md                  # Cost targets (if not redacted)
├── 05-Timeline.md                     # Timeline and milestones
├── 06-Compliance/
│   ├── Regulatory-Requirements.md
│   ├── Certification-Requirements.md
│   ├── Testing-Requirements.md
│   └── Documentation-Requirements.md
├── 07-Vendor-Questions.md             # Questions for vendors
├── 08-Attachments/                    # Referenced files (if any)
│   ├── drawing-001.pdf
│   └── spec-sheet.pdf
└── metadata.json                      # Machine-readable pack data
```

### 8.2 File Naming Conventions

- **Prefixes:** Use `00-`, `01-`, etc. for ordering
- **Spaces:** Use hyphens, not underscores
- **Case:** Title Case for readability
- **Extensions:** `.md` for markdown, `.json` for metadata

### 8.3 README.md Template

```markdown
# RFQ Starter Pack: {pack.title}

**Generated:** {pack.generated_at}  
**Blueprint:** {blueprint.name}  
**Project Stage:** {pack.project_stage}  
**Domain(s):** {domain_names.join(', ')}

## Overview

{pack.description}

## Packet Contents

This RFQ starter pack contains the following sections:

1. **Overview** (`00-Overview.md`) - Product context and component description
2. **Requirements** (`01-Requirements/`) - Detailed functional, performance, and technical requirements
3. **Volumes** (`02-Volumes.md`) - Production volume specifications
4. **Tolerances** (`03-Tolerances.md`) - Dimensional and performance tolerances
5. **Target Cost** (`04-Target-Cost.md`) - Cost targets and assumptions
6. **Timeline** (`05-Timeline.md`) - Project timeline and milestones
7. **Compliance** (`06-Compliance/`) - Regulatory and certification requirements
8. **Vendor Questions** (`07-Vendor-Questions.md`) - Questions for vendor responses

## How to Use This Pack

1. **Review** all sections and customize as needed
2. **Redact** sensitive information using the redaction settings
3. **Export** in your preferred format (ZIP, PDF, or JSON)
4. **Create RFQ** in CentaurOS marketplace to broadcast to suppliers

## Readiness Status

**Readiness Score:** {pack.readiness_score}/100

{pack.readiness_gaps.length > 0 ? '⚠️ **Readiness Gaps:**' : '✅ **All readiness requirements met**'}

{pack.readiness_gaps.map(gap => `- [${gap.severity}] ${gap.description}`).join('\n')}

## Metadata

Full machine-readable data available in `metadata.json`.
```

### 8.4 Metadata JSON Structure

```json
{
  "pack_id": "uuid",
  "blueprint_id": "uuid",
  "domain_ids": ["uuid"],
  "title": "string",
  "description": "string",
  "project_stage": "concept | prototype | evt | dvt | production | launched",
  "generated_at": "ISO8601",
  "generated_by": "profile_id",
  "readiness_score": 85,
  "readiness_gaps": [
    {
      "gap_type": "coverage | decision | specification | compliance",
      "severity": "low | medium | high | critical",
      "description": "string",
      "blocking": false
    }
  ],
  "redaction_settings": {
    "redact_sensitive_data": false,
    "redacted_categories": [],
    "redacted_content": []
  },
  "verification_status": "draft | pending_review | approved | rejected",
  "rfq_pack": {
    // Full RFQStarterPack object
  }
}
```

---

## 9. Integration with Existing RFQ System

### 9.1 Handoff Flow

**RFQ Starter Pack → Actual RFQ:**

```typescript
// When user clicks "Create RFQ" from pack preview

async function createRFQFromPack(
  packTaskId: string,
  pack: RFQStarterPack
): Promise<{ rfqId: string; error: string | null }> {
  // 1. Validate readiness
  if (pack.readiness_score < getStageThreshold(pack.project_stage)) {
    return {
      rfqId: null,
      error: `Readiness score ${pack.readiness_score} below threshold. Please address gaps.`,
    };
  }
  
  // 2. Transform pack to RFQ specifications
  const rfqSpecs: RFQSpecifications = {
    description: pack.description,
    quantity: pack.volumes.prototype_units || pack.volumes.production_units_per_year,
    unit: 'units',
    materials: extractMaterials(pack.requirements.material_requirements),
    dimensions: extractDimensions(pack.requirements.mechanical_requirements),
    custom_fields: {
      // Store full pack reference
      rfq_pack_id: pack.id,
      rfq_pack_task_id: packTaskId,
      blueprint_id: pack.blueprint_id,
      domain_ids: pack.domain_ids || [pack.domain_id],
      
      // Structured data for RFQ system
      requirements: pack.requirements,
      volumes: pack.volumes,
      tolerances: pack.tolerances,
      target_cost: pack.target_cost,
      timeline: pack.timeline,
      compliance: pack.compliance,
      vendor_questions: pack.vendor_questions,
    },
    attachments: pack.requirements.referenced_drawings || [],
  };
  
  // 3. Create RFQ using existing action
  const { data: rfq, error } = await createNewRFQ({
    title: pack.title,
    rfq_type: inferRFQType(pack),        // 'commodity' | 'custom' | 'service'
    specifications: rfqSpecs,
    budget_min: pack.target_cost?.target_unit_cost 
      ? pack.target_cost.target_unit_cost * 0.8  // 80% of target as min
      : null,
    budget_max: pack.target_cost?.target_unit_cost
      ? pack.target_cost.target_unit_cost * 1.2   // 120% of target as max
      : null,
    deadline: pack.timeline.rfq_response_deadline,
    category: inferCategory(pack),         // Map domain to RFQ category
    urgency: pack.timeline.critical_path_items?.length > 0 
      ? 'urgent' 
      : 'standard',
  });
  
  if (error || !rfq) {
    return { rfqId: null, error: error || 'Failed to create RFQ' };
  }
  
  // 4. Link RFQ back to pack task
  await updateTaskMetadata(packTaskId, {
    rfq_id: rfq.id,
  });
  
  // 5. Update pack with RFQ reference
  pack.rfq_id = rfq.id;
  await updateTaskMetadata(packTaskId, {
    rfq_pack: pack,
  });
  
  return { rfqId: rfq.id, error: null };
}

function inferRFQType(pack: RFQStarterPack): RFQType {
  // Logic to infer RFQ type from pack content
  if (pack.domain_ids?.some(id => isCommodityDomain(id))) {
    return 'commodity';
  }
  if (pack.requirements.functional_requirements.some(r => r.priority === 'must_have')) {
    return 'custom';
  }
  return 'service';
}
```

### 9.2 RFQ System Integration Points

| RFQ System Feature | Integration |
|-------------------|-------------|
| **RFQ Creation** | Pack → `createNewRFQ()` → `rfqs` table |
| **RFQ Specifications** | Pack data stored in `rfqs.specifications.custom_fields` |
| **RFQ Broadcast** | Existing `broadcastRFQ()` function works as-is |
| **RFQ Responses** | Vendors respond via existing `rfq_responses` table |
| **RFQ Status** | Pack links to RFQ via `tasks.metadata.rfq_id` |

### 9.3 Bidirectional Linking

- **Pack → RFQ:** `tasks.metadata.rfq_id` stores RFQ ID
- **RFQ → Pack:** `rfqs.specifications.custom_fields.rfq_pack_task_id` stores task ID

This enables:
- Viewing pack from RFQ detail page
- Viewing RFQ from pack preview
- Tracking which packs led to which RFQs

---

## 10. Edge Cases

### Edge Case 1: Multi-Domain RFQ Pack

**Scenario:** User selects 3 domains (PCB, Battery, Enclosure) for a single RFQ pack.

**Handling:**
- `RFQStarterPack.domain_ids` array contains all 3 domain IDs
- Template selection: Use most specific template (e.g., if 2/3 are PCB-related → use PCB template)
- Requirements: Merge requirements from all domains, deduplicate
- Vendor questions: Combine questions from all domains, mark source domain
- Readiness: Calculate readiness across all domains (worst-case scoring)

### Edge Case 2: Domain Has No Key Questions

**Scenario:** Domain exists in blueprint but has no `key_questions` array populated.

**Handling:**
- Generate vendor questions from expert packet (if exists)
- If no expert packet: Use AI to generate questions based on domain name/description
- Mark questions with `source: 'ai_generated'` and `confidence` score
- Lower readiness score if questions are AI-generated (not from template)

### Edge Case 3: Readiness Score Below Threshold

**Scenario:** User tries to export/create RFQ but readiness score is 45/100 (below 60 threshold for prototype stage).

**Handling:**
- Show blocking alert: "Readiness score below threshold. Please address gaps."
- List blocking gaps with links to fix them
- Disable "Create RFQ" button until gaps resolved
- Allow "Export Pack" (draft export) for internal review
- Allow "Save Draft" to save incomplete pack

### Edge Case 4: Redaction Removes All Content

**Scenario:** User redacts all categories, leaving packet mostly empty.

**Handling:**
- Warn user: "Redaction will remove {X}% of content. Continue?"
- Show preview of redacted content before export
- Allow export (user may want minimal RFQ)
- Add note in exported pack: "Content redacted for competitive reasons. Contact buyer for details."

### Edge Case 5: Pack Generated for Wrong Stage

**Scenario:** Blueprint is in `concept` stage but user generates pack with `production`-stage requirements.

**Handling:**
- Detect stage mismatch: `pack.project_stage !== blueprint.project_stage`
- Show warning: "Pack generated for {pack.project_stage} but blueprint is {blueprint.project_stage}"
- Allow user to override (change pack stage) or regenerate
- Adjust readiness thresholds based on pack stage (not blueprint stage)

### Edge Case 6: Decision Referenced But Missing

**Scenario:** Pack references `decision_id: abc-123` but decision was deleted.

**Handling:**
- On pack load, validate all `source_id` references
- If decision missing: Mark requirement as `source: 'user_entered'`, remove `source_id`
- Log warning: "Decision {id} referenced in pack but not found"
- Allow pack to load (don't fail) but show warning banner

### Edge Case 7: Export Format Unsupported

**Scenario:** User requests PDF export but system only supports ZIP/JSON.

**Handling:**
- Check available export formats based on pack size/complexity
- If PDF requested but unavailable: Fall back to ZIP, show message
- Future: Implement PDF generation using template engine

### Edge Case 8: Pack Modified After RFQ Created

**Scenario:** User edits pack after RFQ has been created and broadcast.

**Handling:**
- Detect: `tasks.metadata.rfq_id` exists
- Show warning: "This pack is linked to RFQ {id}. Changes won't update the RFQ."
- Allow edits (pack is draft, RFQ is separate entity)
- Option: "Create New RFQ from Updated Pack" button

### Edge Case 9: AI Generation Fails Mid-Process

**Scenario:** Ghost Worker T6 task fails partway through generation.

**Handling:**
- Task status remains `Pending`
- Log error in `task_comments` with `is_system_log: true`
- Show error to user: "Generation failed. Retry?"
- Retry button queues new T6 task
- Partial pack data (if any) preserved in `tasks.metadata.rfq_pack`

### Edge Case 10: Pack Exported But Never Used

**Scenario:** User exports pack as ZIP but never creates RFQ.

**Handling:**
- No action required (export is one-way)
- Pack remains in `tasks` table as draft
- Analytics event: `rfq_pack_exported` (not `rfq_pack_used`)
- Future: Cleanup job to archive unused packs after 90 days

---

## 11. Implementation Checklist

### Phase 1: Core Generation
- [ ] Create `RFQStarterPack` TypeScript types
- [ ] Implement domain template selection logic
- [ ] Create Ghost Worker T6 task contract (input/output JSON schema)
- [ ] Implement pack generation from blueprint coverage
- [ ] Store pack in `tasks.metadata.rfq_pack`
- [ ] Calculate readiness score

### Phase 2: UX Flow
- [ ] Build "Generate RFQ Pack" dialog
- [ ] Build RFQ pack preview screen
- [ ] Implement section editing
- [ ] Build readiness checklist component
- [ ] Implement redaction settings dialog
- [ ] Build export functionality (ZIP, JSON)

### Phase 3: Integration
- [ ] Implement "Create RFQ" handoff to existing RFQ system
- [ ] Link pack task to RFQ (`tasks.metadata.rfq_id`)
- [ ] Link RFQ to pack (`rfqs.specifications.custom_fields.rfq_pack_task_id`)
- [ ] Add "View Pack" link from RFQ detail page
- [ ] Add "View RFQ" link from pack preview

### Phase 4: Domain Templates
- [ ] Implement PCB/Electronics template
- [ ] Implement Battery Pack template
- [ ] Implement Mechanical Enclosure template
- [ ] Implement General template (default)
- [ ] Template-specific requirement generation

### Phase 5: Edge Cases & Polish
- [ ] Handle multi-domain packs
- [ ] Handle missing decisions/questions
- [ ] Handle readiness threshold blocking
- [ ] Handle redaction edge cases
- [ ] Handle pack modification after RFQ creation
- [ ] Error handling and retry logic

### Phase 6: Testing
- [ ] Unit tests for readiness calculation
- [ ] Unit tests for template selection
- [ ] Unit tests for redaction logic
- [ ] E2E test: Generate → Preview → Export → Create RFQ
- [ ] E2E test: Multi-domain pack generation
- [ ] E2E test: Readiness gating

---

## Changes Made

### Files Created
- `/docs/blueprint/12-rfq-starter-pack.md` - Complete RFQ starter pack specification

### Files Modified
- `/docs/blueprint/INDEX.md` - Updated document map (Step 12 status: complete)
- `/docs/blueprint/ORCHESTRATION.md` - Marked Step 12 complete, updated Wave 5 status

### Schema Changes Required
- **None** - Uses existing `tasks.metadata` JSONB column (already planned in INDEX.md)

### Type Definitions Added
- `RFQStarterPack` interface (full packet structure)
- `RFQOverview`, `RFQRequirements`, `RFQVolumes`, `RFQTolerances`, etc.
- `SensitiveDataCategory` enum
- `ReadinessGap` interface

### Integration Points Documented
- RFQ pack → `tasks.metadata` storage
- RFQ pack → `createNewRFQ()` handoff
- Bidirectional linking (pack ↔ RFQ)
- Ghost Worker T6 task type for generation
