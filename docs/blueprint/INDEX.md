# Blueprint Spec Index

> **This is the canonical source of truth for the Manufacturing Blueprint feature.**
> All agents MUST read this before writing. All agents MUST update this when introducing new enums/definitions.

## Document Map

| Doc | Owner Step | Status | Last Updated | Description |
|-----|------------|--------|--------------|-------------|
| 00-repo-assessment.md | Step 1 | complete | 2026-02-01 | Current state analysis of CentaurOS |
| 01-prd.md | Step 1 | complete | 2026-02-01 | Product Requirements Document |
| 02-ux-spec.md | Step 2 | complete | 2026-02-01 | UX specification and flows |
| 03-data-api.md | Step 3 | complete | 2026-02-01 | Data model and API design |
| 04-llm-design.md | Step 4 | complete | 2026-02-01 | LLM integration design |
| 05-template-library.md | Step 5 | complete | 2026-02-01 | Template content format spec |
| 06-monetization-trust.md | Step 6 | complete | 2026-02-01 | Monetization and trust rules |
| 07-red-team.md | Step 7 | complete | 2026-02-01 | Red team analysis |
| 08-backlog.md | Step 8 | complete | 2026-02-01 | Execution backlog |
| 09-stage-gates.md | Step 9 | complete | 2026-02-01 | Stage gates and readiness |
| 10-decisions-assumptions.md | Step 10 | pending | - | Decisions and assumptions model |
| 11-risk-heatmap.md | Step 11 | complete | 2026-02-01 | Risk taxonomy and heatmap |
| 12-rfq-starter-pack.md | Step 12 | complete | 2026-02-01 | RFQ starter pack generator |
| 13-ai-confidence-verification.md | Step 13 | complete | 2026-02-01 | AI provenance and verification |
| 14-comparative-paths.md | Step 14 | complete | 2026-02-01 | OptionSets and comparative paths |
| 15-template-governance.md | Step 15 | complete | 2026-02-01 | Template governance model |

---

## Canonical Table Mappings

> **CRITICAL: Use these exact table names. The prompts sometimes use incorrect names.**

| Concept | Actual Table Name | Notes |
|---------|-------------------|-------|
| Domain Coverage | `blueprint_domain_coverage` | NOT `domain_coverage` |
| Blueprint Templates | `blueprint_templates` | Correct |
| Knowledge Domains | `knowledge_domains` | Correct |
| Blueprints | `blueprints` | Correct |
| Blueprint Expertise | `blueprint_expertise` | Correct |
| Blueprint Suppliers | `blueprint_suppliers` | Already exists - reuse! |
| Blueprint Milestones | `blueprint_milestones` | Already exists - reuse! |
| Blueprint History | `blueprint_history` | Already exists - reuse! |
| Marketplace Recommendations | `marketplace_recommendations` | Correct |
| RFQs | `rfqs` | Correct |
| RFQ Responses | `rfq_responses` | Correct |
| Business Functions | `business_functions` | Org blueprint catalog |
| Foundry Function Coverage | `foundry_function_coverage` | Org blueprint coverage |

---

## Required Migrations

> **These columns do NOT exist and MUST be added for blueprint-task integration.**

### 1. tasks.metadata JSONB

```sql
ALTER TABLE tasks ADD COLUMN metadata JSONB DEFAULT '{}';
COMMENT ON COLUMN tasks.metadata IS 'Extensible metadata: blueprint_id, domain_id, artifact_type';
```

**Schema:**
```json
{
  "blueprint_id": "uuid | null",
  "domain_id": "uuid | null", 
  "artifact_type": "expert_packet | rfq_pack | decision | null"
}
```

### 2. objectives.blueprint_id

```sql
ALTER TABLE objectives ADD COLUMN blueprint_id UUID REFERENCES blueprints(id) ON DELETE SET NULL;
CREATE INDEX idx_objectives_blueprint ON objectives(blueprint_id);
```

---

## Existing Enums (DO NOT REDEFINE)

### project_stage (blueprints.project_stage)
```
'concept' | 'prototype' | 'evt' | 'dvt' | 'production' | 'launched'
```

### coverage_status (blueprint_domain_coverage.status)
```
'covered' | 'partial' | 'gap' | 'not_needed'
```

### person_type (blueprint_expertise.person_type)
```
'team' | 'advisor' | 'marketplace' | 'external' | 'ai_agent'
```

### expertise_level (blueprint_expertise.expertise_level)
```
'expert' | 'competent' | 'learning'
```

### verification_status (blueprint_expertise.verification_status)
```
'verified' | 'claimed' | 'inferred'
```

### criticality (knowledge_domains.criticality)
```
'critical' | 'important' | 'nice-to-have'
```

### stage_relevance (knowledge_domains.metadata.stage_relevance[stage].relevance)
```
'informational' | 'active' | 'critical' | 'sustaining' | 'not_applicable'
```
**Note:** This is a convention in JSONB metadata, not a database enum.

### blocker_severity (convention in blueprint_domain_coverage.blockers)
```
'low' | 'medium' | 'high' | 'critical'
```
**Format:** `"severity:stage1,stage2:description"` or plain text (defaults to 'medium')
**Note:** This is a text convention, not a database enum.

### task_status (tasks.status)
```
'Pending' | 'Accepted' | 'Rejected' | 'Amended' | 'Amended_Pending_Approval' | 
'Pending_Peer_Review' | 'Pending_Executive_Approval' | 'Completed'
```

### member_role (profiles.role)
```
'Founder' | 'Executive' | 'Apprentice' | 'AI_Agent'
```

---

## AI Approval Rules (Canonical)

> **This section establishes the definitive rules for when AI-generated content requires human approval vs. can be auto-created.**

### Auto-Create (No Human Approval Required)

The following AI-generated content can be created automatically without human approval:

- **Draft artifacts with confidence < 60**: Low-confidence suggestions that are clearly marked as drafts
- **Template-derived content (from knowledge_domains)**: Content pulled directly from verified templates
- **Coverage metrics and calculations**: Automated calculations of domain coverage, gaps, and readiness scores
- **Marketplace category suggestions (informational only)**: Category recommendations that don't trigger actions

### Human Approval Required (Amended_Pending_Approval)

The following AI-generated content MUST be set to `Amended_Pending_Approval` status and require human review:

- **AI-proposed domain trees (T1)**: Domain structure suggestions that modify blueprint organization
- **Expert packets (T4)**: Generated expert packets with questions and requirements
- **RFQ starter packs (T6)**: Complete RFQ packets ready for external sharing
- **Decisions/assumptions with confidence >= 60**: High-confidence decision proposals that impact project direction
- **Any content that will be user-facing or exported**: Content that appears in UI or is exported/shared externally

### Gating Thresholds

Specific thresholds for different content types:

- **Marketplace CTAs**: `confidence >= 60 AND verified provider`
  - Only show marketplace recommendations when AI confidence is high AND provider is verified
  
- **RFQ generation**: `confidence >= 80 AND stage >= prototype`
  - RFQ starter packs require very high confidence AND project must be at prototype stage or later
  
- **Auto-publish**: `NEVER`
  - External content (marketplace listings, RFQ exports, public-facing artifacts) ALWAYS requires human approval before publication

---

## Enums To Be Defined (TBD)

| Enum | Owner Doc | Status | Values |
|------|-----------|--------|--------|
| AI Provenance Type | 13-ai-confidence-verification.md | **COMPLETE** | `'template_derived' | 'user_entered' | 'ai_suggested'` |
| AI Verification Status | 13-ai-confidence-verification.md | **COMPLETE** | `'draft' | 'pending_review' | 'approved' | 'rejected'` |
| Artifact Type | 13-ai-confidence-verification.md | **COMPLETE** | `'expert_packet' | 'rfq_pack' | 'decision_proposal' | 'domain_suggestion'` |
| Template Lifecycle | 15-template-governance.md | defined | draft, active, deprecated, archived |
| Risk Category | 11-risk-heatmap.md | **COMPLETE** | `'technical_feasibility' | 'supply_chain' | 'regulatory' | 'safety' | 'schedule' | 'cost' | 'quality' | 'integration'` |
| Risk Severity | 11-risk-heatmap.md | **COMPLETE** | `0 | 1 | 2 | 3 | 4 | 5` (0=None, 1=Minimal, 2=Low, 3=Moderate, 4=High, 5=Severe) |
| Tradeoff Dimension | 14-comparative-paths.md | **COMPLETE** | `'cost' | 'lead_time' | 'complexity' | 'risk' | 'performance' | 'compliance' | 'maintainability'` |
| OptionSet Status | 14-comparative-paths.md | **COMPLETE** | `'open' | 'decided' | 'deferred' | 'invalidated'` |
| Confidence Level | 14-comparative-paths.md | **COMPLETE** | `'high' | 'medium' | 'low' | 'unknown'` |
| Decision Type | 10-decisions-assumptions.md | **COMPLETE** | `'decision' | 'assumption' | 'constraint'` |
| Decision Status | 10-decisions-assumptions.md | **COMPLETE** | `'proposed' | 'approved' | 'superseded'` |
| Domain Type (RFQ Templates) | 12-rfq-starter-pack.md | **COMPLETE** | `'general' | 'pcb_electronics' | 'battery_pack' | 'mechanical_enclosure' | 'electromechanical' | 'software_firmware' | 'packaging' | 'testing_validation'` |
| Sensitive Data Category | 12-rfq-starter-pack.md | **COMPLETE** | `'budget' | 'volumes' | 'timeline' | 'design_details' | 'market_info' | 'regulatory_strategy' | 'supplier_relationships' | 'internal_decisions'` |

---

## Existing Database Functions (REUSE)

| Function | Purpose | Location |
|----------|---------|----------|
| `calculate_blueprint_coverage(p_blueprint_id)` | Calculates coverage metrics | 20260131300000_blueprints.sql |
| `update_blueprint_metrics(p_blueprint_id)` | Updates cached coverage metrics | 20260131300000_blueprints.sql |
| `clone_blueprint_from_template(...)` | Instantiates blueprint from template | 20260131300000_blueprints.sql |
| `get_my_foundry_id()` | Returns current user's foundry | 20260127000000_harden_security.sql |
| `is_active_user()` | Checks if user is active | 20260130200002_access_revocation_rls.sql |
| `get_my_role()` | Returns current user's role | 20260127220000_add_rbac_policies.sql |
| `generate_gap_recommendations(p_foundry_id)` | Creates marketplace recs from gaps | 20260128200000_add_marketplace_recommendations.sql |

---

## Existing TypeScript Types (REUSE)

| File | Key Types |
|------|-----------|
| `src/types/blueprints.ts` | Blueprint, DomainCoverage, Expertise, KnowledgeDomain, BlueprintTemplate, BlueprintSupplier, BlueprintMilestone |
| `src/types/rfq.ts` | RFQ, RFQResponse, RFQSpecifications, CreateRFQParams |
| `src/types/rfq-starter-pack.ts` | RFQStarterPack, RFQOverview, RFQRequirements, RFQVolumes, RFQTolerances, RFQTargetCost, RFQTimeline, RFQCompliance, RFQVendorQuestion, RedactionSettings, ReadinessGap |
| `src/types/tasks.ts` | Task types |
| `src/types/org-blueprint.ts` | BusinessFunction, FunctionCoverage |

---

## Requirement Numbering Conventions

| Prefix | Category | Example |
|--------|----------|---------|
| FR-# | Functional Requirement | FR-001: User can create blueprint from template |
| NFR-# | Non-Functional Requirement | NFR-001: Page load < 2s |
| TR-# | Trust/Safety Requirement | TR-001: AI outputs require human approval |
| AR-# | Analytics Requirement | AR-001: Track blueprint_created event |

---

## "No Generic Output" Bar

All Expert Packets and RFQ generations MUST include:
1. **Parameterization**: Specific to product constraints (budget, timeline, volumes, environment)
2. **"Why it matters"**: Rationale for each question/requirement
3. **Artifacts to request**: Specific deliverables, not vague asks
4. **Red flags**: Warning signs to watch for
5. **Stage awareness**: Questions appropriate to current project_stage

---

## Cross-Reference Log

> Agents add items here when they reference definitions from other docs that aren't finalized yet.

| From Doc | References | What's Needed | Status |
|----------|------------|---------------|--------|
| - | - | - | - |

---

### LLM Task Types (convention in 04-llm-design.md)
```
'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7'
```
**Note:** Used in `tasks.metadata.llm_task_type` for Ghost Worker processing.

### Question Type (knowledge_domains.key_questions[].question_type)
```
'feasibility' | 'design' | 'validation' | 'compliance' | 'process' | 'cost'
```
**Note:** Categorizes key questions by purpose.

### Product Category (blueprint_templates.product_category)
```
'consumer_electronics' | 'industrial_equipment' | 'robotics_automation' | 
'medical_devices' | 'automotive' | 'aerospace_defense' | 'wearables' | 
'iot_sensors' | 'energy_cleantech' | 'telecommunications' | 'saas_platform' | 'custom'
```
**Note:** Canonical product categories for template classification.

---

## Changes Log

| Date | Agent | Changes |
|------|-------|---------|
| 2026-02-01 | Bootstrap | Initial INDEX.md created with table mappings and existing enums |
| 2026-02-01 | Step-1 | Completed 00-repo-assessment.md and 01-prd.md; marked Step 1 complete |
| 2026-02-01 | Step-13 | Completed 13-ai-confidence-verification.md; defined AI Provenance Type, AI Verification Status, and Artifact Type enums |
| 2026-02-01 | Step-9 | Completed 09-stage-gates.md; added stage_relevance and blocker_severity conventions |
| 2026-02-01 | Step-15 | Completed 15-template-governance.md; defined Template Lifecycle enum; governance metadata schema; forking model |
| 2026-02-01 | Step-3 | Completed 03-data-api.md; schema mappings, migrations, API surface, permissions model, ER diagram |
| 2026-02-01 | Step-5+4 | Completed 05-template-library.md and 04-llm-design.md; defined LLM tasks T1-T7, question types, product categories; added Robotics template example with 12 top-level domains |
| 2026-02-01 | Step-14 | Completed 14-comparative-paths.md; defined OptionSet model, Tradeoff Dimension enum, storage in JSONB, commit flow creating Decisions |
| 2026-02-01 | Step-10 | Completed 10-decisions-assumptions.md; defined Decision Type and Decision Status enums, JSON schema for decisions JSONB field, stage freeze rules, UX patterns, analytics events, 12 edge cases |
| 2026-02-01 | Step-11 | Completed 11-risk-heatmap.md; defined Risk Category enum (8 categories), Risk Severity scale (0-5), scoring rubric, inputs, UI patterns, storage strategy, worked example, 12 edge cases |
| 2026-02-01 | Step-2 | Completed 02-ux-spec.md; primary screens (list, canvas, detail panel, gap dashboard), canvas interaction (pan/zoom, expand/collapse, search, breadcrumbs), coverage audit UX, expert packet generation, task creation from gaps, marketplace overlay, accessibility (keyboard nav, focus, screen readers), user flow diagrams, domain state machine, 12 edge cases |
| 2026-02-01 | Step-6 | Completed 06-monetization-trust.md; principles (engineering truth vs commercial overlays, transparency, user controls), recommendation logic from blueprint_domain_coverage gaps using knowledge_domains.marketplace_categories, gating rules (unverified AI content, stage-aware, risk-aware), 12 abuse/failure scenarios with mitigations, metrics (conversion, retention, trust signals) |
| 2026-02-01 | Step-12 | Completed 12-rfq-starter-pack.md; RFQ packet contents structure (overview, requirements, volumes, tolerances, target cost, timeline, compliance, vendor questions), domain-specific templates (general, PCB/electronics, battery pack, mechanical enclosure), readiness gating with stage thresholds, redaction/privacy controls (8 sensitive data categories, include/exclude toggles), UX flow (generate → preview → checklist → export → create RFQ), storage in tasks.metadata (artifact_type: 'rfq_pack'), export ZIP folder structure, integration with existing rfqs table, 10 edge cases |
|| 2026-02-01 | Step-7 | Completed 07-red-team.md; 15 failure scenarios with severity x likelihood scoring (5 critical, 5 high, 5 medium), concrete mitigations (technical/UX/product/policy), tightened MVP proposal (55% reduction from 12 features to 7), 10 non-obvious edge cases (deletion cascade, concurrent modification, AI timeout, etc.), 3 contradictions noted (AI auto-approval, stage gate enforcement, template fork sync) |
