# Product Requirements Document: Manufacturing Blueprint

> **Step 1 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-1

---

## Table of Contents
1. [Problem Statement](#1-problem-statement)
2. [Personas](#2-personas)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Scope: MVP vs v1/v2](#4-scope-mvp-vs-v1v2)
5. [User Journeys](#5-user-journeys)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Trust Requirements](#8-trust-requirements)
9. [Analytics Requirements](#9-analytics-requirements)
10. [Monetization Design & Guardrails](#10-monetization-design--guardrails)
11. [Risks & Mitigations](#11-risks--mitigations)
12. [Open Questions](#12-open-questions)

---

## 1. Problem Statement

Hardware founders face a **knowledge coordination crisis** when building physical products. The complexity of manufacturing—spanning electronics, mechanical engineering, regulatory compliance, supply chain, and business operations—exceeds what any single person can hold in their head. This leads to:

### 1.1 Three Concrete Wasted-Time Examples

**Example 1: The FCC Surprise (Regulatory Blindspot)**
> A robotics startup spent 8 months building their first prototype without consulting a regulatory expert. At DVT, they discovered their wireless module required FCC Part 15B certification with a 6-month lead time. They had to delay launch by 4 months and spent $40K on redesign to meet emissions requirements that could have been designed-in from day one.
>
> **Time Wasted:** 4 months + $40K
> **Root Cause:** No visibility into regulatory domain gaps during concept/prototype stages

**Example 2: The Battery Expert Search (Expertise Discovery)**
> A consumer electronics founder needed a battery management system expert for their wearable. They posted on LinkedIn, asked 15 advisors, emailed 8 consultants, and spent 3 weeks getting conflicting recommendations. When they finally engaged an expert, they asked generic questions ("What battery should I use?") and received generic answers.
>
> **Time Wasted:** 3 weeks of founder time
> **Root Cause:** No structured way to identify domain gaps, generate expert-ready questions, or find verified marketplace experts

**Example 3: The CM Rework Loop (Supplier Communication)**
> A hardware team sent their PCB design to a contract manufacturer without a structured RFQ. The CM came back with 47 clarifying questions spread across 12 email threads. After 6 weeks of back-and-forth, they discovered the design wasn't manufacturable at their target cost. Starting over with a new CM meant repeating the entire process.
>
> **Time Wasted:** 6 weeks + CM relationship burned
> **Root Cause:** No domain-specific RFQ templates, no capture of design decisions, no supplier-ready documentation

### 1.2 The Core Problem

**Founders don't know what they don't know.** They can't:
- See all the domains required to ship a hardware product
- Identify which domains they have coverage for and which are gaps
- Generate the right questions to ask experts
- Create supplier-ready documentation from their decisions
- Track decisions/assumptions that affect multiple domains

Manufacturing Blueprints solve this by providing a **visual knowledge map** that audits expertise coverage, generates expert-ready questions, and creates actionable tasks—with AI assistance under human supervision.

---

## 2. Personas

### 2.1 Primary: Founder / CEO

| Attribute | Description |
|-----------|-------------|
| **Role** | Technical or non-technical founder building a hardware product |
| **Pain Points** | Overwhelmed by unknown unknowns; unsure what experts to hire; can't articulate what they need |
| **Goals** | Ship product on time; avoid regulatory/manufacturing surprises; build right team |
| **Blueprint Usage** | Creates blueprint from template; runs coverage audit; reviews AI-generated tasks |
| **Key Decision** | "Do I handle this domain myself, hire someone, or engage marketplace?" |

### 2.2 Secondary: Engineering Lead / CTO

| Attribute | Description |
|-----------|-------------|
| **Role** | Technical leader responsible for product development |
| **Pain Points** | Context-switching across too many domains; can't delegate without documentation |
| **Goals** | Reduce technical debt; ensure design decisions are captured; unblock team |
| **Blueprint Usage** | Updates domain coverage; marks expertise; reviews expert packets before sending |
| **Key Decision** | "Is this domain covered well enough to proceed to next stage?" |

### 2.3 Tertiary: Ops / PM

| Attribute | Description |
|-----------|-------------|
| **Role** | Operations or product manager coordinating execution |
| **Pain Points** | No visibility into which domains are blocking milestones; can't prioritize gaps |
| **Goals** | Hit milestones; unblock team; maintain supplier relationships |
| **Blueprint Usage** | Views risk heatmap; monitors gap resolution; creates RFQs from domains |
| **Key Decision** | "Which gap should we address first to unblock the milestone?" |

### 2.4 AI_Agent Participation

The `AI_Agent` role (existing in CentaurOS) participates in blueprints by:

| Interaction | Mechanism | Human Gate |
|-------------|-----------|------------|
| **Generate Expert Packets** | Ghost Worker creates draft questions from domain `key_questions` + context | Task → `Amended_Pending_Approval` → Human reviews |
| **Propose Domain Coverage** | AI analyzes product description to suggest domain tree | Draft → Human approval required |
| **Create RFQ Specifications** | AI pre-populates RFQ specs from domain decisions | RFQ draft → Human review before broadcast |
| **Risk Assessment** | AI surfaces high-risk domains based on stage/coverage | Informational overlay—no auto-action |

**Critical Rule:** AI outputs are **always suggestions**. No AI output directly modifies coverage status, creates external communications, or commits decisions without human approval.

---

## 3. Goals & Non-Goals

### 3.1 Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G1 | **Reduce unknown unknowns** | 90% of domains for product type visible in blueprint |
| G2 | **Accelerate expert engagement** | Time from "gap identified" to "expert packet sent" < 10 minutes |
| G3 | **Capture institutional knowledge** | 100% of design decisions recorded with rationale |
| G4 | **Enable stage-appropriate action** | Expert questions tailored to `project_stage` |
| G5 | **Integrate with marketplace** | Coverage gaps surface relevant marketplace experts |
| G6 | **Support AI-assisted workflows** | AI generates drafts; humans approve |

### 3.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Replace human expertise | AI assists but doesn't substitute domain experts |
| NG2 | Fully automated RFQ broadcasting | RFQs require human review before supplier contact |
| NG3 | Real-time collaboration (Google Docs-style) | MVP uses optimistic locking, not CRDTs |
| NG4 | Multi-foundry blueprint sharing | Blueprints are foundry-scoped; templates are shared |
| NG5 | CAD/PLM integration | Out of scope for MVP; future consideration |
| NG6 | Financial/budget tracking | Use existing objectives/tasks for budget |

---

## 4. Scope: MVP vs v1/v2

### 4.1 MVP (Must Ship)

| Feature | Description | Acceptance Criteria |
|---------|-------------|---------------------|
| **Template-based creation** | User selects template, blueprint instantiated with domains | `clone_blueprint_from_template()` works end-to-end |
| **Coverage audit** | Visual representation of `blueprint_domain_coverage.status` | Tree/list views with status badges |
| **Expert packet generation** | AI creates task with questions for domain gap | Task created with `metadata.artifact_type = 'expert_packet'` |
| **Decision recording** | Capture decisions in `blueprint_domain_coverage.decisions` | JSONB schema documented; UI for adding decisions |
| **Tasks end-to-end** | Expert packets become tasks with AI handshake | Task → AI_Agent → `Amended_Pending_Approval` → Human review |
| **Marketplace recommendations** | Gaps surface in marketplace via `marketplace_recommendations` | `generate_gap_recommendations()` called on audit |

### 4.2 v1 (Next Release)

| Feature | Description |
|---------|-------------|
| **Mind-map/infinite canvas** | Interactive visualization of `knowledge_domains` tree |
| **Risk heatmap** | Computed risk overlay (coverage × criticality × blockers × stage) |
| **RFQ starter pack** | Auto-generate RFQ specs from domain decisions |
| **OptionSets** | Side-by-side comparison of alternatives with tradeoff scoring |
| **Novel product AI** | User describes product → AI proposes domain tree → Human review |

### 4.3 v2 (Future)

| Feature | Description |
|---------|-------------|
| **Template forking** | Create custom template from existing blueprint |
| **Blueprint versioning** | Git-like history with diff view |
| **Cross-foundry benchmarking** | Anonymized coverage stats by product category |
| **CAD/PLM integration** | Import BOM to auto-map domains |
| **Multi-blueprint dependencies** | Link blueprints for product families |

---

## 5. User Journeys

### 5.1 Journey A: Template-Based Blueprint Creation

**Persona:** Founder building a robotics product  
**Entry Point:** Blueprints page → "Create Blueprint"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Select Template                                                      │
│ User sees template cards: "Consumer Electronics", "SaaS Platform", etc.      │
│ User clicks "Consumer Electronics" (47 domains, 156 questions)               │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 2: Name & Configure                                                     │
│ User enters: Name="RoboArm v1", Stage="Prototype"                           │
│ User clicks "Create Blueprint"                                               │
│ System calls clone_blueprint_from_template()                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 3: Coverage Audit                                                       │
│ User sees domain tree with all 47 domains as "gap" (red)                    │
│ System prompts: "Let's audit your coverage. Who handles Power Systems?"      │
│ User clicks domain → Side panel opens                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 4: Mark Coverage                                                        │
│ User marks "Battery Management" as "covered" by team member "Jane"          │
│ User marks "FCC Certification" as "gap"                                      │
│ Coverage score updates in real-time                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 5: Address Gap (Expert Packet)                                          │
│ User clicks "FCC Certification" gap → "Generate Expert Packet"              │
│ System creates task: "FCC Certification Expert Packet"                       │
│   - assignee_id = AI_Agent                                                   │
│   - metadata = {blueprint_id, domain_id, artifact_type: 'expert_packet'}    │
│ Ghost Worker generates questions tailored to "Prototype" stage               │
│ Task status → 'Amended_Pending_Approval'                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 6: Human Review                                                         │
│ User reviews AI-generated questions in task detail                           │
│ User edits one question, adds context                                        │
│ User clicks "Approve" → Task status → 'Accepted'                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 7: Marketplace Recommendation                                           │
│ System calls generate_gap_recommendations() for remaining gaps               │
│ User navigates to Marketplace → sees "Recommended for You" section          │
│ Recommendations show: "FCC Certification - You have a gap in Regulatory"    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Exit Criteria:**
- Blueprint created with domain tree
- Coverage audit completed for at least 5 domains
- One expert packet task created and reviewed
- Marketplace recommendations visible

### 5.2 Journey B: Novel Product Description → AI-Proposed Blueprint

**Persona:** Founder with novel product idea (no matching template)  
**Entry Point:** Blueprints page → "Create Blueprint" → "Describe Your Product"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Product Description                                                  │
│ User enters: "Solar-powered autonomous lawn mower with LiDAR navigation,     │
│ GPS tracking, and mobile app control"                                        │
│ User clicks "Analyze"                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 2: AI Analysis (Draft)                                                  │
│ System shows loading: "Analyzing your product..."                           │
│ AI returns proposed domain tree:                                             │
│   - Electronics: Power Systems, Motor Control, LiDAR Integration            │
│   - Mechanical: Chassis, Blade System, Weatherproofing                      │
│   - Software: Navigation, Mobile App, Cloud Backend                         │
│   - Regulatory: FCC (GPS/WiFi), UL (outdoor power equipment)                │
│                                                                              │
│ Banner: "This is an AI-generated draft. Review before proceeding."          │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 3: Human Review & Edit                                                  │
│ User reviews proposed domains                                                │
│ User adds: "Battery Thermal Management" (outdoor = high temps)              │
│ User removes: "Regulatory > GDPR" (not applicable)                          │
│ User marks domains as "critical" / "important"                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 4: Confirm & Instantiate                                                │
│ User clicks "Create Blueprint from This Analysis"                           │
│ System creates blueprint with user-approved domain tree                      │
│ ai_generated_context stores original description + modifications             │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 5: Proceed to Coverage Audit                                            │
│ (Same as Journey A, Step 3 onwards)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Exit Criteria:**
- AI-generated domain tree presented to user
- User able to add/remove/edit domains before confirmation
- Final blueprint reflects user modifications
- Provenance tracked in `ai_generated_context`

---

## 6. Functional Requirements

### 6.1 Blueprint Creation & Templates

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-001 | User can create blueprint from template | Blueprint instantiated with all template domains; coverage records created; `clone_blueprint_from_template()` returns valid UUID | Template with 100+ domains; template with no domains |
| FR-002 | User can create blank blueprint | Blueprint created with empty domain set; user can add domains manually | N/A |
| FR-003 | User can set blueprint project_stage | Stage stored as `project_stage` enum; default is `'concept'` | Changing stage should prompt re-assessment |
| FR-004 | User can view available templates | Templates listed with `name`, `description`, `estimated_domains`, `icon` | No templates available (show empty state) |
| FR-005 | System templates are read-only | Users cannot edit templates where `is_system_template = true` | User tries to modify system template |

### 6.2 Mind-Map / Infinite Canvas UI

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-010 | User can view domains as interactive tree | `knowledge_domains` rendered in hierarchical tree; expand/collapse nodes | Tree with depth > 5; 200+ nodes |
| FR-011 | Nodes show coverage status | Node color/badge reflects `blueprint_domain_coverage.status` | Domain without coverage record |
| FR-012 | User can pan/zoom canvas | Standard canvas controls; fit-to-view button | Very large trees (100+ nodes) |
| FR-013 | User can click node to open detail panel | Click opens `DomainDetailPanel` Sheet on right | Multiple rapid clicks |
| FR-014 | User can filter by status | Filter dropdown: All, Gaps, Partial, Covered, Not Needed | Filter returns empty results |
| FR-015 | Canvas supports keyboard navigation | Tab between nodes; Enter to select; Escape to close panel | Accessibility compliance |

### 6.3 Coverage Audit UX

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-020 | User can set domain status | Status updates `blueprint_domain_coverage.status` to `'covered' | 'partial' | 'gap' | 'not_needed'` | Changing status triggers metric recalculation |
| FR-021 | User can assign expertise | Expertise record created in `blueprint_expertise` with `person_type`, `profile_id` or `external_contact` | Assigning same person twice |
| FR-022 | User can mark domain as critical | Updates `blueprint_domain_coverage.is_critical` | Critical gap increases `critical_gaps` count |
| FR-023 | Coverage score updates in real-time | `calculate_blueprint_coverage()` called; UI reflects new score | Score calculation with `not_needed` domains |
| FR-024 | User can add blockers | `blueprint_domain_coverage.blockers[]` updated | Removing all blockers |
| FR-025 | User can add notes | `blueprint_domain_coverage.notes` updated | Notes with 10K+ characters |

### 6.4 Expert Packet Generation

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-030 | User can generate expert packet from gap | Task created with `metadata.artifact_type = 'expert_packet'` | Domain with no `key_questions` |
| FR-031 | Expert packet assigned to AI_Agent | `assignee_id` set to foundry's AI_Agent profile | No AI_Agent in foundry |
| FR-032 | Ghost Worker generates questions | `runAIWorker()` creates draft questions from domain context + stage | OpenAI rate limit; API error |
| FR-033 | Task includes domain context | Task description includes domain path, `key_questions`, `project_stage` | Domain without description |
| FR-034 | Task status becomes `Amended_Pending_Approval` | Ghost Worker updates task status after generation | Worker fails mid-execution |
| FR-035 | User can review/edit generated questions | User views `amendment_notes` in task detail; can edit and resubmit | Long amendment_notes (10K+ chars) |
| FR-036 | Questions are stage-appropriate | Questions reference current `project_stage`; different questions for concept vs DVT | Stage changed after packet generated |

### 6.5 Decision & Assumption Recording

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-040 | User can add decision to domain | Decision added to `blueprint_domain_coverage.decisions` JSONB | Duplicate decision text |
| FR-041 | Decision schema is enforced | Schema: `{type: 'decision'|'assumption'|'constraint', decision: string, rationale?: string, made_at: ISO8601, made_by: UUID, status: 'proposed'|'approved'|'superseded'}` | Missing required fields |
| FR-042 | User can supersede decision | New decision added with `supersedes: previous_decision_id` | Superseding already-superseded decision |
| FR-043 | Decisions appear in domain detail | Decision list shown in `DomainDetailPanel` | Domain with 50+ decisions |
| FR-044 | Decisions have audit trail | Changes to decisions logged in `blueprint_history` | N/A |

### 6.6 Risk Heatmap

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-050 | System computes risk score per domain | Risk = f(coverage_status, is_critical, blockers.length, stage_relevance) | Domain with no data |
| FR-051 | Risk score is 0-5 scale | 0 = no risk, 5 = critical risk | All domains same score |
| FR-052 | Heatmap overlay on domain tree | Visual indicator (color gradient) on each node | Colorblind accessibility |
| FR-053 | User can filter by risk level | Filter: Low (0-1), Medium (2-3), High (4-5) | No high-risk domains |
| FR-054 | Risk factors are visible | Tooltip shows: coverage, criticality, blockers, stage | Multiple factors contributing |

### 6.7 OptionSets & Comparative Paths

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-060 | User can create OptionSet for domain | `blueprint_option_sets` record created | OptionSet for non-gap domain |
| FR-061 | User can add options to set | `blueprint_options` records with `tradeoffs` JSONB | Single option (must have 2+) |
| FR-062 | Tradeoff dimensions are canonical | Dimensions: cost, lead_time, complexity, risk, performance, compliance, maintainability | Custom dimensions (not allowed in MVP) |
| FR-063 | User can compare options side-by-side | Comparison table with radar chart visualization | 10+ options |
| FR-064 | User can commit to option | `option_set.decided_option_id` set; `option_set.status = 'decided'` | Changing decision after commit |
| FR-065 | Committed option creates decisions | Auto-creates decision records from option rationale | Option without rationale |

### 6.8 RFQ Starter Pack

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-070 | User can generate RFQ from domain | RFQ created via `createNewRFQ()` with pre-populated specs | Domain without supplier categories |
| FR-071 | RFQ specs include domain questions | `specifications.custom_fields` includes relevant `key_questions` | Domain with 50+ questions |
| FR-072 | RFQ specs include decisions | Relevant decisions from `blueprint_domain_coverage.decisions` included | Decisions marked 'superseded' (exclude) |
| FR-073 | RFQ is draft until user confirms | RFQ `status = 'Open'` only after user review | User abandons draft |
| FR-074 | RFQ links back to blueprint | `metadata.blueprint_id` and `metadata.domain_id` stored | N/A |
| FR-075 | User can edit specs before broadcast | Full edit capability on RFQ detail page | Broadcast already sent |

### 6.9 Marketplace Overlay

| ID | Requirement | Acceptance Criteria | Edge Cases |
|----|-------------|---------------------|------------|
| FR-080 | Gaps generate marketplace recommendations | `generate_gap_recommendations()` called after coverage audit | No marketplace providers for category |
| FR-081 | Recommendations gated by verification | Only show providers with `tier = 'verified_partner' | 'approved'` | All providers unverified |
| FR-082 | Recommendations show confidence score | Match score from `matchSuppliers()` displayed | Identical scores |
| FR-083 | User can dismiss recommendation | `marketplace_recommendations.is_dismissed = true` | Re-enabling dismissed recommendation |
| FR-084 | Recommendations expire | `expires_at` defaults to 30 days | Expired recommendations hidden |
| FR-085 | Recommendations link to domain | `source_id` references `blueprint_domain_coverage.id` | Source deleted |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-001 | Blueprint detail page load | < 2s | Time to interactive |
| NFR-002 | Coverage update response | < 500ms | Server response time |
| NFR-003 | Mind-map render (100 nodes) | < 1s | Time to first paint |
| NFR-004 | Expert packet generation | < 30s | Ghost Worker completion |
| NFR-005 | Risk heatmap computation | < 1s | Full blueprint scan |

### 7.2 Collaboration

| ID | Requirement | Implementation |
|----|-------------|----------------|
| NFR-010 | Multi-user editing | Optimistic locking; last-write-wins with conflict toast |
| NFR-011 | Activity log visibility | All team members see `blueprint_history` |
| NFR-012 | Expertise attribution | Expertise records show `profile_id` with avatar |

### 7.3 Versioning

| ID | Requirement | Implementation |
|----|-------------|----------------|
| NFR-020 | Change history | `blueprint_history` records all actions |
| NFR-021 | Audit trail | `user_id` + timestamp on all history entries |
| NFR-022 | No hard deletes (MVP) | Archive instead of delete |

### 7.4 Exports

| ID | Requirement | Implementation |
|----|-------------|----------------|
| NFR-030 | Export blueprint as JSON | Full blueprint with coverage + decisions |
| NFR-031 | Export expert packet as PDF | Formatted questions with context |
| NFR-032 | Export RFQ as document | Standard RFQ format with specs |

### 7.5 Observability

| ID | Requirement | Implementation |
|----|-------------|----------------|
| NFR-040 | Blueprint creation events | Analytics event `blueprint_created` |
| NFR-041 | Coverage audit completion | Analytics event `coverage_audit_completed` |
| NFR-042 | Expert packet generation | Analytics event + Ghost Worker logs |
| NFR-043 | Error tracking | Sentry integration for client/server errors |

---

## 8. Trust Requirements

### 8.1 Provenance

| ID | Requirement | Implementation |
|----|-------------|----------------|
| TR-001 | Track AI-generated content | `ai_generated_context` JSONB on blueprints; `is_ai_generated` flag on content |
| TR-002 | Distinguish template-derived vs user-entered | `source_type` field: `'template_derived' | 'user_entered' | 'ai_suggested'` |
| TR-003 | Show provenance badges | UI indicator on AI-generated domains/questions |

### 8.2 Gating

| ID | Requirement | Implementation |
|----|-------------|----------------|
| TR-010 | AI outputs require human approval | All AI tasks go to `Amended_Pending_Approval`; no direct status changes |
| TR-011 | RFQs require human review | RFQ drafts must be explicitly confirmed before broadcast |
| TR-012 | Decision commits require confirmation | "Commit to Option" shows confirmation dialog |

### 8.3 Safety-Critical Behavior

| ID | Requirement | Implementation |
|----|-------------|----------------|
| TR-020 | Critical domain warnings | Visual warning on domains where `is_critical = true AND status = 'gap'` |
| TR-021 | Stage-gate warnings | Alert when advancing stage with unresolved critical gaps |
| TR-022 | Regulatory domain prominence | Regulatory category domains always visible (not collapsed by default) |

### 8.4 "No Generic" Bar

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| TR-030 | Expert packets must be parameterized | Questions include: product context, stage, budget, timeline, volumes |
| TR-031 | Expert packets include "why it matters" | Each question has rationale from domain description |
| TR-032 | Expert packets list artifacts to request | Concrete deliverables, not vague asks |
| TR-033 | Expert packets include red flags | Warning signs to watch for in expert responses |
| TR-034 | Expert packets are stage-aware | Different questions for concept vs EVT vs DVT |

---

## 9. Analytics Requirements

### 9.1 Key Events

| ID | Event | Properties | Purpose |
|----|-------|------------|---------|
| AR-001 | `blueprint_created` | `blueprint_id`, `template_id`, `project_type`, `project_stage` | Track blueprint adoption |
| AR-002 | `coverage_audit_completed` | `blueprint_id`, `domains_audited`, `gaps_found`, `critical_gaps` | Measure audit engagement |
| AR-003 | `domain_status_changed` | `blueprint_id`, `domain_id`, `old_status`, `new_status`, `changed_by` | Track coverage progress |
| AR-004 | `expert_packet_generated` | `blueprint_id`, `domain_id`, `task_id`, `question_count` | Measure AI assistance usage |
| AR-005 | `expert_packet_approved` | `task_id`, `edits_made`, `approval_time_seconds` | Measure review quality |
| AR-006 | `decision_recorded` | `blueprint_id`, `domain_id`, `decision_type` | Track decision capture |
| AR-007 | `rfq_generated_from_blueprint` | `blueprint_id`, `domain_id`, `rfq_id` | Measure RFQ integration |
| AR-008 | `marketplace_recommendation_clicked` | `recommendation_id`, `category`, `source_type` | Measure marketplace discovery |
| AR-009 | `stage_advanced` | `blueprint_id`, `old_stage`, `new_stage`, `gaps_at_advance` | Track milestone progression |
| AR-010 | `option_committed` | `option_set_id`, `option_id`, `alternatives_count` | Track decision-making |

### 9.2 Funnels to Track

| Funnel | Steps |
|--------|-------|
| Blueprint Activation | Template selected → Blueprint created → First audit → First expert packet |
| Expert Engagement | Gap identified → Packet generated → Packet approved → Expert contacted |
| Marketplace Conversion | Gap identified → Recommendation shown → Recommendation clicked → Provider engaged |

---

## 10. Monetization Design & Guardrails

### 10.1 Principles

1. **Separation of Engineering Truth vs Commercial**: Blueprint coverage status is **never** influenced by marketplace revenue. A domain is "covered" or "gap" based on expertise, not provider availability.

2. **Recommendations are Suggestions**: Marketplace recommendations from `marketplace_recommendations` table are clearly labeled as suggestions, not requirements.

3. **No Pay-to-Rank**: Provider ranking in recommendations based on `match_score` and `tier`, not payment.

4. **User Control**: Users can dismiss recommendations; dismissed recommendations stay dismissed.

### 10.2 Monetization Points

| Touchpoint | Monetization | Guardrail |
|------------|--------------|-----------|
| Gap → Marketplace recommendation | Transaction fee on engagement | Recommendations gated by `tier` verification |
| Expert packet → Provider contact | Transaction fee if hired | Provider must be legitimately matched |
| RFQ → Provider response | Transaction fee on awarded RFQs | Standard RFQ race mechanics apply |

### 10.3 Guardrails

| ID | Guardrail | Implementation |
|----|-----------|----------------|
| MG-001 | No coverage status manipulation | Coverage changes logged; no API for bulk "gap" creation |
| MG-002 | Recommendation source visible | UI shows "Recommended based on your [domain] gap" |
| MG-003 | Organic results always available | Users can search marketplace without recommendations |
| MG-004 | Verified providers prioritized | `tier = 'verified_partner'` shown first |
| MG-005 | Conflict of interest disclosure | If CentaurOS operates marketplace, disclosed in ToS |

---

## 11. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | **RLS policy mistakes leak blueprint data across foundries** | Medium | Critical | Test all queries with RLS enabled; add `foundry_id` checks in actions; security review before launch |
| R2 | **AI hallucinations in expert packets** | High | Medium | Human review gate (`Amended_Pending_Approval`); "AI-generated" badge; user editing before approval |
| R3 | **Generic/unhelpful AI output** | Medium | High | Enforce "No Generic" bar (TR-030-034); include product context in prompts; stage-aware questions |
| R4 | **Template domains become stale** | Medium | Medium | Template versioning (v1); `last_verified_at` timestamp; staleness warnings |
| R5 | **Incentive conflict: gaps → marketplace revenue** | Low | Critical | Separation principle (10.1); audit trail; no auto-gap creation |
| R6 | **User overwhelm from 100+ domain tree** | Medium | Medium | Progressive disclosure; stage-appropriate filtering; "critical only" view |
| R7 | **Expert packet sent without review** | Low | High | No direct send; `Amended_Pending_Approval` required; confirmation dialog |
| R8 | **Decision data loss during edit conflict** | Medium | Medium | Optimistic locking; conflict toast; history recovery |
| R9 | **Mind-map performance with large trees** | Medium | Medium | Virtual scrolling; lazy-load children; canvas optimization |
| R10 | **Migration breaks existing blueprint data** | Low | High | Backward-compatible migrations; test with production data snapshot |
| R11 | **OpenAI rate limits during heavy usage** | Medium | Low | Queue Ghost Worker tasks; retry with backoff; fallback messaging |
| R12 | **Users game coverage for vanity metrics** | Low | Low | Coverage score is informational; no external sharing of scores |
| R13 | **RFQ specs leak sensitive product info** | Medium | Medium | User review required; redaction tools; privacy warning |
| R14 | **Regulatory domain inaccuracy causes compliance issues** | Medium | Critical | Disclaimer: "Not legal advice"; encourage professional consultation; clear `verification_status` |
| R15 | **Orphaned tasks when blueprint deleted** | Low | Low | Soft delete (archive); `ON DELETE SET NULL` for `objectives.blueprint_id` |

---

## 12. Open Questions

> **Blockers Only** — Questions that must be answered before implementation can proceed.

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|---------------------|
| OQ-1 | **What is the maximum domain tree depth we support?** We have templates with depth 2. Can users create depth 3+? | Step 2 (UX Spec) | Mind-map layout algorithm; performance bounds |
| OQ-2 | **Should OptionSet tradeoff dimensions be fixed or extensible?** INDEX.md lists 7 dimensions. Can foundries add custom? | Step 14 (Comparative Paths) | Schema design; UI complexity |
| OQ-3 | **How do we handle domain additions after blueprint creation?** If template is updated, do existing blueprints get new domains? | Step 15 (Template Governance) | Migration strategy; user notification |

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/01-prd.md` | Created |
