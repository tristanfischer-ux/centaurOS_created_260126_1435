# Blueprint Spec Execution Tracker

> **All agents MUST update this file after completing their step.**
> Read INDEX.md first for canonical definitions.

## Current State

- **Current Wave:** 6 (Wave 6 complete - all specification steps finished)
- **Last Updated:** 2026-02-01
- **Active Agents:** 0
- **Wave 2 Status:** COMPLETE (Steps 9, 13, 15 all finished)
- **Wave 3 Status:** COMPLETE (Steps 3, 5+4 all finished)
- **Wave 4 Status:** COMPLETE (Steps 2, 11, 10, 14 all finished)
- **Wave 5 Status:** COMPLETE (Steps 12, 6 all finished)
- **Wave 6 Status:** COMPLETE (Steps 7, 8 all finished)

---

## Execution Waves

### Wave 1: Foundation (Sequential)
| Step | Doc | Status | Agent | Started | Completed | Notes |
|------|-----|--------|-------|---------|-----------|-------|
| 1 | 00-repo-assessment.md, 01-prd.md | complete | Step-1 | 2026-02-01 | 2026-02-01 | Wave 2 unblocked |

### Wave 2: Core Design (Parallel - 3 agents)
| Step | Doc | Status | Agent | Started | Completed | Notes |
|------|-----|--------|-------|---------|-----------|-------|
| 9 | 09-stage-gates.md | complete | Step-9 | 2026-02-01 | 2026-02-01 | Stage gates with all 6 stages defined |
| 13 | 13-ai-confidence-verification.md | complete | Step-13 | 2026-02-01 | 2026-02-01 | Provenance model, verification workflow, gating rules defined |
| 15 | 15-template-governance.md | complete | Step-15 | 2026-02-01 | 2026-02-01 | Template lifecycle + governance rules defined |

### Wave 3: Implementation Specs (Parallel - 2 agents)
| Step | Doc | Status | Agent | Started | Completed | Notes |
|------|-----|--------|-------|---------|-----------|-------|
| 5+4 | 05-template-library.md, 04-llm-design.md | complete | Step-5+4 | 2026-02-01 | 2026-02-01 | Template schema, key_questions structure, Robotics template (12 domains), LLM tasks T1-T7 with contracts/rubrics |
| 3 | 03-data-api.md | complete | Step-3 | 2026-02-01 | 2026-02-01 | Schema mappings, migrations, API surface, permissions, ER diagram |

### Wave 4: UX + Features (Parallel - 3 agents)
| Step | Doc | Status | Agent | Started | Completed | Notes |
|------|-----|--------|-------|---------|-----------|-------|
| 2 | 02-ux-spec.md | complete | Step-2 | 2026-02-01 | 2026-02-01 | Primary screens, canvas interaction, coverage audit, expert packets, tasks, marketplace overlay, accessibility, user flows, state machine, 12 edge cases |
| 11 | 11-risk-heatmap.md | complete | Step-11 | 2026-02-01 | 2026-02-01 | Risk taxonomy (8 categories), scoring rubric 0-5, inputs, UI heatmap overlay and risk register, compute-on-read storage, worked example, 12 edge cases |
| 10 | 10-decisions-assumptions.md | complete | Step-10 | 2026-02-01 | 2026-02-01 | Decisions model, assumptions, constraints, JSON schema, stage freeze rules, UX, analytics, 12 edge cases |
| 14 | 14-comparative-paths.md | complete | Step-14 | 2026-02-01 | 2026-02-01 | OptionSet model, tradeoff dimensions, JSONB storage, commit flow, AI assistance rules |

### Wave 5: Integration (Parallel - 2 agents)
| Step | Doc | Status | Agent | Started | Completed | Notes |
|------|-----|--------|-------|---------|-----------|-------|
| 12 | 12-rfq-starter-pack.md | complete | Step-12 | 2026-02-01 | 2026-02-01 | RFQ packet structure, domain templates (general/PCB/battery/mechanical), readiness gating, redaction controls, UX flow, storage in tasks.metadata, export ZIP, integration with rfqs table, 10 edge cases |
| 6 | 06-monetization-trust.md | complete | Step-6 | 2026-02-01 | 2026-02-01 | Principles (engineering truth vs commercial), recommendation logic from gaps, gating rules (unverified AI, stage-aware, risk-aware), 12 abuse scenarios with mitigations, metrics framework |

### Wave 6: Validation (Sequential)
| Step | Doc | Status | Agent | Started | Completed | Notes |
|------|-----|--------|-------|---------|-----------|-------|
| 7 | 07-red-team.md | complete | Step-7 | 2026-02-01 | 2026-02-01 | 15 failure scenarios, tightened MVP (55% cut), 10 edge cases, 3 contradictions noted |
| 8 | 08-backlog.md | complete | Step-8 | 2026-02-01 | 2026-02-01 | Milestones (M0-M7), 7 epics, 35+ stories, 100+ tasks, thin vertical slices, DoD, acceptance tests, enum consistency check (no mismatches) |

---

## Step Details

### Step 1: Ground Repo + PRD
**Output Files:** `00-repo-assessment.md`, `01-prd.md`
**Dependencies:** None
**Key Tasks:**
- Verify DB tables/enums match INDEX.md
- Confirm task workflow + AI agent triggers
- Find existing blueprint UI and marketplace RFQ implementation
- Create repo assessment with constraints and opportunities
- Create implementation-ready PRD

### Step 9: Stage Gates
**Output Files:** `09-stage-gates.md`
**Dependencies:** Step 1
**Key Tasks:**
- Define canonical stage list using existing `project_stage` enum
- Domain-level readiness model
- Stage-aware behavior for expert packets, primers, risks, RFQs
- UX behavior for stage changes
- Update INDEX.md with stage definitions

### Step 13: AI Provenance + Verification
**Output Files:** `13-ai-confidence-verification.md`
**Dependencies:** Step 1
**Key Tasks:**
- Define provenance model (template-derived, user-entered, AI-suggested)
- Verification workflow integrating with task_status states
- Rules for AI auto-creation vs approval
- UX patterns for review queue
- Update INDEX.md with provenance/verification enums

### Step 15: Template Governance
**Output Files:** `15-template-governance.md`
**Dependencies:** Step 1
**Key Tasks:**
- Template lifecycle enum
- Required metadata (owner, last_verified_at, etc.)
- Editing + review workflow
- Staleness detection
- Forking model
- Update INDEX.md with template lifecycle enums

### Step 5: Template Library
**Output Files:** `05-template-library.md`
**Dependencies:** Steps 9, 13, 15
**Key Tasks:**
- Canonical template schema for knowledge_domains
- Stage gates attachment to templates
- Example "Robotics Hardware Product" template
- Seeding/migrations strategy
- Validation rules

### Step 4: LLM Design
**Output Files:** `04-llm-design.md`
**Dependencies:** Steps 5, 9, 13
**Key Tasks:**
- T1-T7 LLM task contracts
- Input/output contracts with strict JSON
- Guardrails for "no generic questions"
- Evaluation plan with rubrics

### Step 3: Data/API
**Output Files:** `03-data-api.md`
**Dependencies:** Steps 9, 13
**Key Tasks:**
- Current-state schema mapping
- Proposed minimal schema changes
- API surface with request/response schemas
- Permissions model aligned to roles
- Mermaid ER diagram

### Step 2: UX Spec
**Output Files:** `02-ux-spec.md`
**Dependencies:** Steps 3, 9, 13
**Key Tasks:**
- IA + primary screens
- Canvas interaction model
- Coverage audit UX
- Expert Packet UX
- Marketplace overlay
- Mermaid user flow and state machine diagrams

### Step 11: Risk Heatmap
**Output Files:** `11-risk-heatmap.md`
**Dependencies:** Steps 3, 9
**Key Tasks:**
- Canonical risk taxonomy (6-10 categories)
- Scoring rubric 0-5
- Inputs from coverage, stage, confidence
- UI heatmap overlay
- Update INDEX.md with risk categories

### Step 10: Decisions & Assumptions
**Output Files:** `10-decisions-assumptions.md`
**Dependencies:** Steps 3, 9
**Key Tasks:**
- Canonical definitions (Decision vs Assumption vs Constraint)
- JSON schema for blueprint_domain_coverage.decisions
- Stage freeze rules
- UX for adding decisions
- Update INDEX.md with decision enums

### Step 14: Comparative Paths / OptionSets
**Output Files:** `14-comparative-paths.md`
**Dependencies:** Steps 10, 11, 3
**Key Tasks:**
- Option model (OptionSet, Option, tradeoffs)
- Canonical tradeoff dimensions
- UX for compare view
- AI assistance rules
- Update INDEX.md with tradeoff dimensions

### Step 12: RFQ Starter Pack
**Output Files:** `12-rfq-starter-pack.md`
**Dependencies:** Steps 9, 13, 14, 3
**Status:** COMPLETE (2026-02-01)
**Key Tasks:**
- ✅ RFQ packet contents structure (overview, requirements, volumes, tolerances, target cost, timeline, compliance, vendor questions)
- ✅ Domain-specific templates (general, PCB/electronics, battery pack, mechanical enclosure)
- ✅ Readiness gating with stage-specific thresholds and AI verification
- ✅ Redaction/privacy controls (8 sensitive data categories, include/exclude toggles)
- ✅ UX flow (generate → preview → checklist → export → create RFQ)
- ✅ Storage strategy (tasks.metadata with artifact_type: 'rfq_pack')
- ✅ Export ZIP folder structure
- ✅ Integration with existing rfqs table (bidirectional linking)
- ✅ 10 edge cases documented

### Step 6: Monetization & Trust
**Output Files:** `06-monetization-trust.md`
**Dependencies:** Steps 11, 13, 12
**Key Tasks:**
- Principles (separation of engineering truth vs commercial)
- Recommendation logic from gaps
- Gating rules
- Abuse scenarios + mitigations
**Status:** ✅ Complete (2026-02-01)

### Step 7: Red Team
**Output Files:** `07-red-team.md`
**Dependencies:** All previous steps
**Status:** ✅ Complete (2026-02-01)
**Key Tasks:**
- ✅ "How this fails" (15 scenarios with severity x likelihood scoring)
- ✅ Concrete mitigations (technical, UX, product, policy)
- ✅ Tightened MVP proposal (55% reduction)
- ✅ 10 non-obvious edge cases identified
- ✅ 3 contradictions noted (not fixed - requires human resolution)

### Step 8: Backlog
**Output Files:** `08-backlog.md`
**Dependencies:** All previous steps
**Status:** ✅ Complete (2026-02-01)
**Key Tasks:**
- ✅ Milestones with demo scripts (M0-M7)
- ✅ Epics → stories → tasks (7 epics, 35+ stories, 100+ tasks)
- ✅ Definition of Done per epic
- ✅ Thin vertical slices (6 slices for MVP)
- ✅ Final consistency sweep (no enum mismatches found)

---

## Cross-Reference Updates Needed

> Agents add items here when they reference definitions not yet finalized.

| From Doc | Needs From | What | Status |
|----------|------------|------|--------|
| - | - | - | - |

---

## Blockers Log

> Agents add blockers here when discovered.

| Date | Step | Blocker | Resolution | Status |
|------|------|---------|------------|--------|
| - | - | - | - | - |

---

## Agent Instructions Template

```markdown
## CONTEXT
You are executing Step X of the Manufacturing Blueprint spec for CentaurOS.
Working directory: /docs/blueprint/

## MANDATORY READS BEFORE WRITING
1. /docs/blueprint/INDEX.md (source of truth - READ FIRST)
2. /docs/blueprint/ORCHESTRATION.md (execution state)
3. [Dependency files listed above for your step]

## YOUR TASK
[Step prompt goes here]

## MANDATORY OUTPUTS
1. Create your doc(s) at /docs/blueprint/XX-name.md
2. Update INDEX.md with any new enums/definitions you introduced
3. Update ORCHESTRATION.md: mark your step complete, note any blockers
4. End your doc with "Changes Made" section listing all edited files
```

---

## Completion Checklist

- [x] Wave 1 complete
- [x] Wave 2 complete (Steps 9, 13, 15 — 2026-02-01)
- [x] Wave 3 complete (Steps 3, 5+4 — 2026-02-01)
- [x] Wave 4 complete (Steps 2, 11, 10, 14 — 2026-02-01)
- [x] Wave 5 complete (Steps 12, 6 — 2026-02-01)
- [x] Wave 6 complete (Steps 7, 8 — 2026-02-01)
- [ ] All INDEX.md enums finalized
- [ ] Final consistency check passed
- [ ] All cross-references resolved
