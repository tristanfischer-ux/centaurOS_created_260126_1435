# Red Team Analysis: Manufacturing Blueprint

> **Role:** Hostile but constructive reviewer (skeptical founder + manufacturing engineer + privacy lawyer + growth marketer)  
> **Date:** 2026-02-01  
> **Scope:** Complete Manufacturing Blueprint feature specification

---

## Executive Summary

This document systematically attacks the Manufacturing Blueprint feature from four adversarial perspectives:

1. **Skeptical Founder**: "Will this actually solve the problem, or just create more overhead?"
2. **Manufacturing Engineer**: "Will this produce actionable, expert-level guidance or generic fluff?"
3. **Privacy Lawyer**: "Will this leak sensitive data, violate RLS, or create liability?"
4. **Growth Marketer**: "Will marketplace recommendations feel biased and destroy trust?"

**Overall Assessment:** The feature is ambitious and well-architected, but contains **critical failure modes** around multi-tenant isolation, AI approval workflows, and marketplace incentives. The MVP is too large—cutting 50% is not only feasible but necessary to avoid catastrophic trust failures.

**Key Findings:**
- **15 failure scenarios** identified (5 critical, 6 high, 4 medium)
- **10 non-obvious edge cases** that could cause production incidents
- **3 contradictions** across documents requiring human resolution
- **Tightened MVP** reduces scope by 55% while preserving core value

---

## 1. How This Fails: Failure Scenarios

### 1.1 RLS Policy Bypass: Cross-Foundry Blueprint Leakage

**Scenario:** A developer writes a query that joins `blueprints` with `blueprint_domain_coverage` but forgets to filter by `foundry_id`. An RLS policy exists on `blueprints` but not on `blueprint_domain_coverage`. A user from Foundry A can see domain coverage data from Foundry B.

**How it happens:**
- Missing RLS policy on `blueprint_domain_coverage` table
- Server action uses `SELECT * FROM blueprint_domain_coverage WHERE blueprint_id = $1` without checking `blueprints.foundry_id`
- JSONB queries bypass RLS (e.g., `metadata->>'blueprint_id'` in tasks table)

**Severity:** 🔴 **CRITICAL** (5/5)  
**Likelihood:** 🟡 **MEDIUM** (3/5)  
**Risk Score:** 15/25

**Evidence from docs:**
- `03-data-api.md` defines RLS policies but doesn't explicitly require `blueprint_domain_coverage` to check `foundry_id` via join
- `tasks.metadata` JSONB queries may bypass RLS if not properly scoped
- `get_my_foundry_id()` function exists but may not be used consistently

**Mitigations:**

**Technical:**
- Add RLS policy to `blueprint_domain_coverage`: `CREATE POLICY ... USING (EXISTS (SELECT 1 FROM blueprints WHERE blueprints.id = blueprint_domain_coverage.blueprint_id AND blueprints.foundry_id = get_my_foundry_id()))`
- All server actions must use `get_my_foundry_id()` explicitly, even if RLS exists
- Add database function `get_blueprint_foundry_id(blueprint_id UUID)` and use it in all queries
- Add integration tests that verify cross-foundry isolation (create two foundries, verify no leakage)

**Product:**
- Add "Security Audit" badge to blueprint detail page showing last RLS check
- Show foundry_id in debug mode for admins

**Policy:**
- Code review checklist: "Does this query filter by foundry_id?"
- Automated security scan for queries that access blueprint-related tables without foundry_id filter

---

### 1.2 Apprentice Role Bypass: Unauthorized Blueprint Modification

**Scenario:** An `Apprentice` user exploits a server action that doesn't check role permissions. They modify a blueprint's `project_stage` from `concept` to `production`, triggering stage-gated behavior (e.g., RFQ generation) that should require `Executive` approval.

**How it happens:**
- Server action `updateBlueprintStage()` checks authentication but not role
- Apprentice can call `updateBlueprintStage({ blueprint_id, stage: 'production' })`
- Stage change triggers `evaluate_stage_gate()` which may auto-create tasks or recommendations
- No audit trail distinguishes Apprentice vs Executive actions

**Severity:** 🔴 **CRITICAL** (5/5)  
**Likelihood:** 🟡 **MEDIUM** (3/5)  
**Risk Score:** 15/25

**Evidence from docs:**
- `03-data-api.md` defines RBAC but doesn't specify which actions require which roles
- `09-stage-gates.md` mentions stage progression but doesn't specify role requirements
- `10-decisions-assumptions.md` mentions "stage freeze rules" but doesn't specify who can override

**Mitigations:**

**Technical:**
- Add role check to all blueprint modification actions: `if (role !== 'Founder' && role !== 'Executive') throw new Error('Insufficient permissions')`
- Create database function `can_modify_blueprint(user_id UUID, blueprint_id UUID)` that checks role + foundry membership
- Add `audit_log` table: `(user_id, action, blueprint_id, old_value, new_value, timestamp)`
- Stage changes require explicit `Executive` role check

**UX:**
- Disable stage progression controls for Apprentice users (gray out, show tooltip: "Requires Executive role")
- Show "Last modified by [Executive Name]" in blueprint header

**Policy:**
- Define canonical permission matrix: which roles can perform which actions
- Add to code review checklist: "Does this action check role permissions?"

---

### 1.3 AI Agent Bypass: Unapproved Content in Production

**Scenario:** An AI agent generates an expert packet with `task_status = 'Amended_Pending_Approval'`, but a bug in the task workflow allows the content to be displayed in the blueprint detail view before human approval. A user sees unverified AI suggestions and makes decisions based on them.

**How it happens:**
- UI component `DomainDetailPanel` queries `tasks` table and displays content regardless of `task_status`
- Task workflow bug: `Amended_Pending_Approval` tasks are included in "active artifacts" query
- No UI indicator distinguishes approved vs pending AI content
- User sees AI-generated questions and assumes they're verified

**Severity:** 🔴 **CRITICAL** (5/5)  
**Likelihood:** 🟠 **HIGH** (4/5)  
**Risk Score:** 20/25

**Evidence from docs:**
- `13-ai-confidence-verification.md` defines verification workflow but doesn't specify UI filtering
- `02-ux-spec.md` mentions "review queue" but doesn't specify that unapproved content should be hidden
- `04-llm-design.md` defines `Amended_Pending_Approval` status but doesn't specify UI behavior

**Mitigations:**

**Technical:**
- All queries for blueprint artifacts must filter: `WHERE task_status IN ('Approved', 'Completed') AND (metadata->>'provenance'->>'verification_status' IS NULL OR metadata->>'provenance'->>'verification_status' = 'approved')`
- Create database view `approved_blueprint_artifacts` that filters by verification status
- Add database function `get_approved_artifacts(blueprint_id UUID, domain_id UUID)` that enforces verification

**UX:**
- Show "Pending Review" badge on all unapproved AI content
- Separate "Review Queue" tab in blueprint detail view
- Disable marketplace CTAs for unapproved content (already specified in `06-monetization-trust.md`)

**Product:**
- Add analytics event: `ai_content_displayed_without_approval` (should never fire)
- Add feature flag: `require_ai_approval` (default: true)

**Policy:**
- Code review checklist: "Does this query filter by verification_status?"
- Automated test: "Unapproved AI content should never appear in blueprint detail view"

---

### 1.4 Marketplace Incentive Conflict: Biased Recommendations

**Scenario:** The marketplace recommendation algorithm prioritizes vendors who pay higher commission rates, even when they're not the best fit. Users notice that recommendations feel "salesy" and lose trust in the platform. Founders make poor vendor choices based on biased recommendations.

**How it happens:**
- `generate_gap_recommendations()` function includes `marketplace_listings.commission_rate` in priority calculation
- Algorithm: `priority = coverage_gap_score * 0.7 + commission_rate * 0.3` (hidden from users)
- High-commission vendors appear first even when coverage gap is smaller
- No transparency about how recommendations are ranked

**Severity:** 🟠 **HIGH** (4/5)  
**Likelihood:** 🟠 **HIGH** (4/5)  
**Risk Score:** 16/25

**Evidence from docs:**
- `06-monetization-trust.md` states "engineering truth first" but doesn't specify algorithm transparency
- No mention of commission_rate in recommendation logic
- `03-data-api.md` doesn't specify recommendation algorithm details

**Mitigations:**

**Technical:**
- Remove commission_rate from recommendation priority calculation
- Add `recommendation_reason` field: `"This vendor matches your coverage gap in [domain]"` (no mention of commission)
- Log recommendation algorithm inputs/outputs for audit

**UX:**
- Show "Why we recommend this" tooltip explaining coverage gap match
- Add "Not relevant" feedback button that hides recommendation
- Show "Based on your blueprint coverage gaps" disclaimer

**Product:**
- Add "Recommendation Transparency" setting: show algorithm inputs (coverage gap, criticality, stage)
- A/B test: transparent vs opaque recommendations (measure trust signals)

**Policy:**
- Explicit rule: "Commission rate must never influence recommendation priority"
- Quarterly audit: review recommendation algorithm for bias

---

### 1.5 Template Staleness: Outdated Domain Knowledge

**Scenario:** A blueprint template was created in 2024 and hasn't been updated. It includes outdated domain knowledge (e.g., "Use USB-C for charging" when USB-C is now deprecated). Users create blueprints from stale templates and make decisions based on outdated information.

**How it happens:**
- Template governance system exists (`15-template-governance.md`) but no automated staleness detection
- `blueprint_templates.last_verified_at` exists but no alert when >12 months old
- Users create blueprints from deprecated templates without warning
- No versioning: users can't see what changed between template versions

**Severity:** 🟠 **HIGH** (4/5)  
**Likelihood:** 🟠 **HIGH** (4/5)  
**Risk Score:** 16/25

**Evidence from docs:**
- `15-template-governance.md` defines lifecycle but doesn't specify staleness thresholds
- No automated alerts for stale templates
- No template versioning system

**Mitigations:**

**Technical:**
- Add database function `check_template_staleness(template_id UUID)` that flags templates >12 months old
- Add `template_version` field to `blueprint_templates`
- Create `template_changelog` table: `(template_id, version, changes, verified_at, verified_by)`
- Add cron job that alerts template owners when staleness detected

**UX:**
- Show "Last verified: 18 months ago" warning badge on stale templates
- Require explicit acknowledgment when creating blueprint from deprecated template
- Show template changelog in blueprint creation flow

**Product:**
- Add "Template Freshness" metric: % of templates verified in last 6 months
- Incentivize template updates: gamification, badges for template maintainers

**Policy:**
- Define staleness threshold: 12 months (configurable)
- Require template review before marking as `active`

---

### 1.6 RFQ Leakage: Sensitive Data Exposed to Vendors

**Scenario:** A user generates an RFQ starter pack and accidentally includes sensitive data (budget, volumes, regulatory strategy) that should be redacted. They export the RFQ and send it to vendors, leaking competitive information.

**How it happens:**
- RFQ generation includes all blueprint data by default
- Redaction controls exist (`12-rfq-starter-pack.md`) but are opt-in (user must uncheck boxes)
- User forgets to redact sensitive fields before export
- No "sensitivity scan" that flags potentially sensitive content

**Severity:** 🔴 **CRITICAL** (5/5)  
**Likelihood:** 🟡 **MEDIUM** (3/5)  
**Risk Score:** 15/25

**Evidence from docs:**
- `12-rfq-starter-pack.md` defines redaction controls but doesn't specify default behavior
- No automated sensitivity detection
- No "preview before export" requirement

**Mitigations:**

**Technical:**
- Default redaction: all sensitive categories checked (opt-out, not opt-in)
- Add `sensitivity_scan()` function that flags potentially sensitive content using keyword matching
- Require explicit "I understand this may contain sensitive data" confirmation before export
- Add watermark to exported RFQ: "CONFIDENTIAL - Do not share"

**UX:**
- Show "Sensitivity Check" step in RFQ generation flow
- Highlight potentially sensitive content in preview (yellow background)
- Require checkbox: "I have reviewed and redacted sensitive information"

**Product:**
- Add "RFQ Leakage Risk" score: based on unredacted sensitive categories
- Show warning: "This RFQ contains [X] sensitive categories. Consider redacting."

**Policy:**
- Default to maximum privacy: redact everything by default
- Require legal review for RFQs containing regulatory strategy

---

### 1.7 Domain Coverage Checkbox Theater: Superficial Coverage

**Scenario:** Users mark domains as "covered" without actually addressing the key questions. They check boxes to make the blueprint look complete, but critical knowledge gaps remain. The coverage dashboard shows "100% covered" but the blueprint is actually incomplete.

**How it happens:**
- Coverage status (`covered` | `partial` | `gap`) is manually set by users
- No validation that "covered" domains have answered key questions
- Coverage dashboard shows aggregate metrics without drilling into quality
- Users game the system to show "complete" blueprints to investors

**Severity:** 🟠 **HIGH** (4/5)  
**Likelihood:** 🟠 **HIGH** (4/5)  
**Risk Score:** 16/25

**Evidence from docs:**
- `02-ux-spec.md` mentions coverage audit but doesn't specify validation rules
- `05-template-library.md` defines `key_questions` but doesn't require answers before marking "covered"
- No "coverage quality score" that measures depth vs breadth

**Mitigations:**

**Technical:**
- Add validation: domain cannot be marked "covered" until at least 50% of `key_questions` have answers
- Create `coverage_quality_score()` function: `(answered_questions / total_questions) * (expert_presence ? 1.2 : 1.0)`
- Add `coverage_depth` field: `'superficial' | 'adequate' | 'thorough'` based on question answers

**UX:**
- Show "Coverage Quality" metric alongside coverage percentage
- Require explicit justification when marking domain as "covered": "How did you address [key_question]?"
- Show "Incomplete Coverage" warning: "This domain is marked covered but [X] key questions are unanswered"

**Product:**
- Add "Coverage Depth" dashboard: shows quality score per domain
- Gamification: badges for "Thorough Coverage" (all questions answered + expert verified)

**Policy:**
- Define "covered" criteria: at least 50% of key questions answered + expert presence or AI verification
- Audit: sample blueprints to verify coverage quality

---

### 1.8 AI Confidence Inflation: Overconfident Suggestions

**Scenario:** AI agent generates expert packet with `confidence: 0.9` (high) but the content is actually generic and not product-specific. The high confidence score causes the system to auto-approve the content, bypassing human review. Users trust the high-confidence content and make poor decisions.

**How it happens:**
- AI confidence calculation (`13-ai-confidence-verification.md`) doesn't penalize generic content
- High confidence (>0.8) triggers auto-approval workflow
- No validation that high-confidence content actually meets "No Generic" bar
- Users see high confidence badge and assume content is verified

**Severity:** 🟠 **HIGH** (4/5)  
**Likelihood:** 🟡 **MEDIUM** (3/5)  
**Risk Score:** 12/25

**Evidence from docs:**
- `13-ai-confidence-verification.md` defines confidence calculation but doesn't specify "No Generic" validation
- `04-llm-design.md` defines "No Generic" bar but doesn't integrate with confidence scoring
- Auto-approval rules don't check for generic content

**Mitigations:**

**Technical:**
- Add "generic content detector" that scans AI output for generic phrases (e.g., "consider", "it is important", "best practices")
- Penalize confidence if generic content detected: `confidence = min(confidence, 0.5)`
- Require human review for all AI content, regardless of confidence (remove auto-approval)

**UX:**
- Show "Generic Content Warning" badge if generic phrases detected
- Require explicit "This content is product-specific" checkbox before approval

**Product:**
- Add "Generic Content Rate" metric: % of AI outputs flagged as generic
- A/B test: auto-approval vs manual review (measure decision quality)

**Policy:**
- Explicit rule: "High confidence does not imply quality - all AI content requires human review"
- Remove auto-approval feature from MVP

---

### 1.9 Stage Gate Bypass: Premature RFQ Generation

**Scenario:** A user manually changes `project_stage` from `concept` to `dvt` to bypass readiness gating. They generate an RFQ starter pack even though domain coverage is incomplete. The RFQ is sent to vendors with incomplete requirements, causing confusion and delays.

**How it happens:**
- Stage gate evaluation (`09-stage-gates.md`) checks readiness but doesn't prevent stage changes
- User can manually set `project_stage` to bypass gating
- RFQ generation checks readiness but doesn't validate that stage matches actual progress
- No audit trail showing who changed stage and why

**Severity:** 🟠 **HIGH** (4/5)  
**Likelihood:** 🟡 **MEDIUM** (3/5)  
**Risk Score:** 12/25

**Evidence from docs:**
- `09-stage-gates.md` defines readiness evaluation but doesn't specify stage change restrictions
- `12-rfq-starter-pack.md` mentions readiness gating but doesn't prevent stage manipulation
- No validation that stage matches actual blueprint state

**Mitigations:**

**Technical:**
- Add `validate_stage_transition(old_stage, new_stage, blueprint_id)` function that checks readiness
- Prevent stage changes that skip gates: `concept -> dvt` requires passing `prototype` and `evt` gates
- Add `stage_change_justification` field: require reason when changing stage
- Log all stage changes to audit table

**UX:**
- Show "Stage Gate Status" before allowing stage change
- Require explicit acknowledgment: "This blueprint doesn't meet [stage] readiness requirements. Proceed anyway?"
- Disable stage progression controls if gates not met (gray out with tooltip)

**Product:**
- Add "Stage Gate Compliance" metric: % of blueprints that pass gates before stage change
- Show warning: "This blueprint is at [stage] but readiness suggests [actual_stage]"

**Policy:**
- Define stage progression rules: cannot skip stages, must pass gates
- Require Executive approval for stage changes that bypass gates

---

### 1.10 Decision Freeze Bypass: Changing Decisions After Stage Freeze

**Scenario:** A user makes a decision in `concept` stage (e.g., "Use Li-ion battery"). The blueprint progresses to `production` stage, which freezes the decision. The user finds a bug that allows them to edit the decision anyway, causing downstream inconsistencies (RFQs reference old decision, but blueprint shows new decision).

**How it happens:**
- Stage freeze rules (`10-decisions-assumptions.md`) exist but are enforced in UI only, not database
- Server action `updateDecision()` doesn't check stage freeze status
- User can directly modify `blueprint_domain_coverage.decisions` JSONB field
- No validation that decision changes are allowed at current stage

**Severity:** 🟠 **HIGH** (4/5)  
**Likelihood:** 🟡 **MEDIUM** (3/5)  
**Risk Score:** 12/25

**Evidence from docs:**
- `10-decisions-assumptions.md` defines stage freeze rules but doesn't specify database enforcement
- No database constraint preventing decision modification after freeze
- Server actions don't validate stage freeze status

**Mitigations:**

**Technical:**
- Add database function `can_modify_decision(decision_id UUID, blueprint_id UUID)` that checks stage freeze
- Add `decision_frozen_at_stage` field: record stage when decision was frozen
- Require `override_reason` field when modifying frozen decisions
- Add database constraint: frozen decisions require Executive role + override reason

**UX:**
- Show "Frozen Decision" badge on decisions that cannot be modified
- Require "Override Reason" dialog when attempting to modify frozen decision
- Show warning: "This decision was frozen at [stage]. Changing it may cause inconsistencies."

**Product:**
- Add "Decision Stability" metric: % of decisions that remain unchanged after freeze
- Show audit trail: "Decision changed from [old] to [new] at [stage] by [user] (override: [reason])"

**Policy:**
- Define override process: Executive role + justification required
- Require impact analysis: "How will this change affect downstream RFQs/tasks?"

---

### 1.11 Risk Heatmap Manipulation: Gaming Risk Scores

**Scenario:** A user wants to show investors a "low-risk" blueprint. They manipulate risk inputs (e.g., mark blockers as "low" severity when they're actually "critical") to lower the risk score. The heatmap shows green/low risk, but the blueprint actually has critical issues.

**How it happens:**
- Risk scores are computed on-read (`11-risk-heatmap.md`) from user-provided inputs
- No validation that blocker severity matches actual impact
- Users can set `blocker_severity = 'low'` for critical issues
- Risk heatmap displays computed scores without showing inputs

**Severity:** 🟡 **MEDIUM** (3/5)  
**Likelihood:** 🟠 **HIGH** (4/5)  
**Risk Score:** 12/25

**Evidence from docs:**
- `11-risk-heatmap.md` defines risk calculation but doesn't specify input validation
- `blocker_severity` is user-provided text, not validated
- No audit trail showing risk score changes

**Mitigations:**

**Technical:**
- Add validation: blocker severity must match impact (e.g., "schedule delay > 1 month" → must be "high" or "critical")
- Add `risk_score_audit` table: `(blueprint_id, domain_id, old_score, new_score, changed_by, timestamp)`
- Require justification when setting blocker severity: "Why is this [severity]?"

**UX:**
- Show "Risk Inputs" tooltip: "Risk score calculated from: [blockers], [coverage], [stage]"
- Require explicit acknowledgment when setting low severity for critical-sounding blockers
- Show "Risk Score History" chart: how risk changed over time

**Product:**
- Add "Risk Score Integrity" metric: % of blockers with severity matching impact
- Show warning: "This blocker sounds critical but is marked 'low'. Is this correct?"

**Policy:**
- Define severity criteria: "critical" = >1 month delay or >$100k cost impact
- Require Executive approval for risk score changes >2 points

---

### 1.12 OptionSet Commitment Without Analysis: Rushed Decisions

**Scenario:** A user sees an OptionSet with 3 alternatives. They quickly commit to Option A without reviewing tradeoffs. Later, they realize Option B would have been better (lower cost, same performance). The decision is frozen at current stage, and they're stuck with a suboptimal choice.

**How it happens:**
- OptionSet commitment flow (`14-comparative-paths.md`) doesn't require tradeoff review
- User can commit immediately without viewing comparison matrix
- No "cooling off" period or undo window
- Decision is frozen immediately upon commitment

**Severity:** 🟡 **MEDIUM** (3/5)  
**Likelihood:** 🟠 **HIGH** (4/5)  
**Risk Score:** 12/25

**Evidence from docs:**
- `14-comparative-paths.md` defines commitment flow but doesn't specify review requirements
- No undo mechanism for committed options
- No validation that user has reviewed tradeoffs

**Mitigations:**

**UX:**
- Require "Review Tradeoffs" step before commitment: show comparison matrix, require scroll-to-bottom
- Add "Undo Window": 24-hour grace period to reverse commitment
- Show "Commitment Impact" preview: "This will create a Decision entry and freeze at [stage]"

**Product:**
- Add "Decision Regret" metric: % of committed options that are later superseded
- Show "Are you sure?" confirmation: "You're about to commit to [Option A]. This cannot be easily undone."

**Policy:**
- Define commitment process: review tradeoffs → acknowledge impact → commit
- Require Executive approval for commitments that affect >$50k cost

---

### 1.13 Template Forking Chaos: Unmaintained Forks

**Scenario:** A user forks a template to customize it for their specific product category. They make changes but never maintain the fork. Other users create blueprints from the stale fork, propagating outdated knowledge. The original template is updated, but forks are not.

**How it happens:**
- Template forking (`15-template-governance.md`) creates independent copies
- No mechanism to sync fork updates from parent template
- Fork owners don't receive notifications when parent template is updated
- Users create blueprints from forks without knowing they're outdated

**Severity:** 🟡 **MEDIUM** (3/5)  
**Likelihood:** 🟠 **HIGH** (4/5)  
**Risk Score:** 12/25

**Evidence from docs:**
- `15-template-governance.md` defines forking but doesn't specify sync mechanism
- No notification system for template updates
- No "fork freshness" indicator

**Mitigations:**

**Technical:**
- Add `fork_sync_status` field: `'synced' | 'outdated' | 'diverged'`
- Create `sync_fork_from_parent(fork_id UUID)` function that merges parent updates
- Add cron job that flags outdated forks (>6 months behind parent)

**UX:**
- Show "Fork Status" badge: "Synced with parent" or "Outdated (parent updated 3 months ago)"
- Require acknowledgment when creating blueprint from outdated fork
- Show "Sync Fork" button that merges parent updates

**Product:**
- Add "Fork Maintenance" metric: % of forks synced with parent in last 6 months
- Incentivize fork maintenance: badges, template quality score

**Policy:**
- Define fork lifecycle: forks should sync with parent quarterly
- Require fork owner to acknowledge updates before marking as `active`

---

### 1.14 Marketplace Recommendation Spam: Too Many CTAs

**Scenario:** A blueprint has 20 coverage gaps. The marketplace recommendation system generates 20 recommendations, one per gap. The blueprint detail view is cluttered with recommendation CTAs. Users experience "recommendation fatigue" and ignore all recommendations, including relevant ones.

**How it happens:**
- Recommendation algorithm generates one recommendation per gap (`06-monetization-trust.md`)
- No limit on number of recommendations displayed
- No prioritization beyond coverage gap score
- Users see 20+ "Find Expert" buttons and become overwhelmed

**Severity:** 🟡 **MEDIUM** (3/5)  
**Likelihood:** 🟠 **HIGH** (4/5)  
**Risk Score:** 12/25

**Evidence from docs:**
- `06-monetization-trust.md` defines recommendation logic but doesn't specify display limits
- No "recommendation fatigue" mitigation
- No prioritization beyond coverage gap

**Mitigations:**

**Product:**
- Limit recommendations: show top 5 per blueprint, rest in "View All" dropdown
- Prioritize by: coverage gap score + criticality + stage relevance
- Add "Dismiss" button: hide recommendation for 30 days
- Show "Recommendation Summary": "5 experts available for [X] domains"

**UX:**
- Group recommendations by domain: "3 experts for Electronics domain"
- Show "Relevance Score": "95% match" vs "60% match"
- Add "Not Now" feedback: "I'll review this later"

**Policy:**
- Define recommendation limits: max 5 displayed, max 10 per blueprint
- Measure "Recommendation Engagement": click-through rate, dismissal rate

---

### 1.15 AI Task Queue Starvation: Low-Priority Tasks Never Processed

**Scenario:** An AI agent has a queue of 100 tasks. High-priority tasks (T1: Product Description → Domain Tree) are processed quickly, but low-priority tasks (T7: Suggest Marketplace Search Terms) are never processed. Users wait weeks for T7 tasks to complete, losing trust in the system.

**How it happens:**
- Ghost Worker processes tasks in order received, not by priority
- No task prioritization system
- T7 tasks are low-value but still important for UX
- Queue grows indefinitely, low-priority tasks age out

**Severity:** 🟡 **MEDIUM** (3/5)  
**Likelihood:** 🟡 **MEDIUM** (3/5)  
**Risk Score:** 9/25

**Evidence from docs:**
- `04-llm-design.md` defines T1-T7 tasks but doesn't specify prioritization
- No task queue management system
- No SLA for task completion

**Mitigations:**

**Technical:**
- Add `task_priority` field: `'critical' | 'high' | 'medium' | 'low'` based on task type and blueprint stage
- Implement priority queue: process critical tasks first, then high, then medium, then low
- Add task timeout: cancel tasks older than 7 days
- Add "Task Queue Health" dashboard: show queue length, oldest task age

**Product:**
- Define task SLAs: T1 < 5 min, T2-T4 < 1 hour, T5-T7 < 24 hours
- Show "Estimated Wait Time" for queued tasks
- Add "Priority Boost" feature: users can pay to prioritize tasks

**Policy:**
- Define task prioritization rules: T1 always critical, T2-T4 high if blueprint stage > concept
- Monitor task queue health: alert if queue length > 50 or oldest task > 24 hours

---

## 2. Severity x Likelihood Matrix

| Scenario | Severity | Likelihood | Risk Score | Priority |
|----------|----------|------------|------------|----------|
| 1.1 RLS Policy Bypass | 5 | 3 | 15 | 🔴 Critical |
| 1.2 Apprentice Role Bypass | 5 | 3 | 15 | 🔴 Critical |
| 1.3 AI Agent Bypass | 5 | 4 | 20 | 🔴 Critical |
| 1.4 Marketplace Incentive Conflict | 4 | 4 | 16 | 🟠 High |
| 1.5 Template Staleness | 4 | 4 | 16 | 🟠 High |
| 1.6 RFQ Leakage | 5 | 3 | 15 | 🔴 Critical |
| 1.7 Domain Coverage Checkbox Theater | 4 | 4 | 16 | 🟠 High |
| 1.8 AI Confidence Inflation | 4 | 3 | 12 | 🟠 High |
| 1.9 Stage Gate Bypass | 4 | 3 | 12 | 🟠 High |
| 1.10 Decision Freeze Bypass | 4 | 3 | 12 | 🟠 High |
| 1.11 Risk Heatmap Manipulation | 3 | 4 | 12 | 🟡 Medium |
| 1.12 OptionSet Commitment Without Analysis | 3 | 4 | 12 | 🟡 Medium |
| 1.13 Template Forking Chaos | 3 | 4 | 12 | 🟡 Medium |
| 1.14 Marketplace Recommendation Spam | 3 | 4 | 12 | 🟡 Medium |
| 1.15 AI Task Queue Starvation | 3 | 3 | 9 | 🟡 Medium |

**Critical (15+):** 5 scenarios  
**High (12-14):** 5 scenarios  
**Medium (9-11):** 5 scenarios

---

## 3. Concrete Mitigations Summary

### 3.1 Technical Mitigations (Must-Have for MVP)

1. **RLS Enforcement:**
   - Add RLS policies to all blueprint-related tables
   - Use `get_my_foundry_id()` in all server actions
   - Add integration tests for cross-foundry isolation

2. **Role-Based Access Control:**
   - Add role checks to all blueprint modification actions
   - Create `can_modify_blueprint()` database function
   - Add audit_log table for all sensitive actions

3. **AI Approval Workflow:**
   - Filter all artifact queries by `verification_status = 'approved'`
   - Create `approved_blueprint_artifacts` database view
   - Remove auto-approval feature (require manual review)

4. **RFQ Privacy:**
   - Default redaction: opt-out, not opt-in
   - Add `sensitivity_scan()` function
   - Require confirmation before export

5. **Coverage Validation:**
   - Require 50% of key_questions answered before marking "covered"
   - Add `coverage_quality_score()` function
   - Show "Coverage Depth" metric

### 3.2 UX Mitigations (Must-Have for MVP)

1. **Visual Indicators:**
   - "Pending Review" badge on unapproved AI content
   - "Frozen Decision" badge on locked decisions
   - "Last verified: X months ago" on stale templates

2. **Guardrails:**
   - Disable stage progression if gates not met
   - Require justification for frozen decision overrides
   - Show "Sensitivity Check" step in RFQ flow

3. **Transparency:**
   - Show "Why we recommend this" for marketplace suggestions
   - Display risk score inputs (not just final score)
   - Show "Recommendation Summary" (grouped by domain)

### 3.3 Product Mitigations (Should-Have for MVP)

1. **Metrics & Monitoring:**
   - "Security Audit" badge (last RLS check)
   - "Coverage Quality" metric
   - "Recommendation Engagement" tracking

2. **Gamification:**
   - Badges for "Thorough Coverage"
   - Template maintainer recognition
   - Fork sync incentives

### 3.4 Policy Mitigations (Must-Have for MVP)

1. **Code Review Checklist:**
   - "Does this query filter by foundry_id?"
   - "Does this action check role permissions?"
   - "Does this query filter by verification_status?"

2. **Explicit Rules:**
   - "Commission rate must never influence recommendation priority"
   - "High confidence does not imply quality - all AI content requires human review"
   - "Cannot skip stages, must pass gates"

3. **Audit Requirements:**
   - Quarterly recommendation algorithm audit
   - Sample blueprint coverage quality checks
   - Risk score integrity monitoring

---

## 4. Tightened MVP: Cutting 50%

**Current MVP Scope (from `01-prd.md`):**
- Blueprint creation from templates
- Domain tree visualization (canvas view)
- Coverage audit and gap identification
- Expert packet generation (T4)
- Marketplace recommendations
- RFQ starter pack generation
- Risk heatmap
- Decisions & assumptions tracking
- OptionSets / comparative paths
- Stage gates
- AI confidence & verification
- Template governance

**Proposed Cut: 55% Reduction**

### 4.1 What Stays (Core Value)

**Must-Have (45% of original scope):**

1. **Blueprint Creation & Domain Tree** (10%)
   - Create blueprint from template
   - Domain tree visualization (list view only, no canvas)
   - Basic coverage status (covered/partial/gap)

2. **Expert Packet Generation** (15%)
   - T4: Generate expert interview packet
   - Human approval workflow (no auto-approval)
   - Basic provenance tracking (template_derived vs ai_suggested)

3. **Marketplace Recommendations** (10%)
   - Basic recommendation logic (coverage gap → marketplace match)
   - Limit to 5 recommendations per blueprint
   - Simple "Find Expert" CTA

4. **RFQ Starter Pack** (10%)
   - Basic RFQ generation (general template only)
   - Default redaction (opt-out)
   - Export to PDF (no ZIP)

**Rationale:** These features deliver core value (knowledge coordination) with minimal complexity. They address the primary problem: "Founders don't know what they don't know."

### 4.2 What Gets Cut (55% reduction)

**Cut from MVP:**

1. **Canvas View** (-5%)
   - **Why cut:** Complex React Flow implementation, not essential for MVP
   - **Alternative:** List view with expand/collapse

2. **Risk Heatmap** (-10%)
   - **Why cut:** Complex scoring algorithm, can be added post-MVP
   - **Alternative:** Simple "Risk Level" badge (high/medium/low) based on coverage gaps

3. **Decisions & Assumptions Tracking** (-10%)
   - **Why cut:** Complex stage freeze logic, JSONB schema, edge cases
   - **Alternative:** Simple text notes in domain coverage

4. **OptionSets / Comparative Paths** (-10%)
   - **Why cut:** Complex tradeoff matrix, commitment workflow, edge cases
   - **Alternative:** Simple pros/cons list in domain notes

5. **Stage Gates** (-10%)
   - **Why cut:** Complex readiness evaluation, gate definitions, stage progression rules
   - **Alternative:** Simple `project_stage` enum (no gating logic)

6. **AI Confidence & Verification** (-5%)
   - **Why cut:** Complex confidence calculation, provenance model, verification workflow
   - **Alternative:** Simple binary: "AI-generated" vs "user-entered" (no confidence scores)

7. **Template Governance** (-5%)
   - **Why cut:** Complex lifecycle, forking, staleness detection
   - **Alternative:** Simple templates (no governance, no forking)

**Rationale:** These features add complexity without delivering core value in MVP. They can be added incrementally post-MVP based on user feedback.

### 4.3 Revised MVP Scope

**Core Features (45% of original):**
1. Blueprint creation from template
2. Domain tree (list view)
3. Coverage status (covered/partial/gap)
4. Expert packet generation (T4 only)
5. Human approval workflow
6. Marketplace recommendations (5 max)
7. RFQ starter pack (general template, PDF export)

**Security & Trust (Must-Have):**
1. RLS policies on all tables
2. Role-based access control
3. AI content approval (no auto-approval)
4. RFQ redaction (opt-out default)

**Total Reduction:** 55% (from 12 major features to 7)

---

## 5. Non-Obvious Edge Cases We Missed

### 5.1 Blueprint Deletion Cascade

**Edge Case:** User deletes a blueprint that has 50 tasks, 20 RFQs, and 10 marketplace recommendations. What happens to:
- Tasks with `metadata->>'blueprint_id'`? (Should they be orphaned or deleted?)
- RFQs linked to blueprint? (Should they be orphaned or deleted?)
- Marketplace recommendations? (Should they be deleted or marked inactive?)

**Current State:** `03-data-api.md` doesn't specify deletion behavior.

**Risk:** Data inconsistency, orphaned records, broken foreign keys.

**Mitigation:** Define cascade rules: tasks orphaned (set `metadata->>'blueprint_id' = null`), RFQs orphaned, recommendations deleted.

---

### 5.2 Template Domain Removal

**Edge Case:** Template owner removes a domain from template (e.g., "Battery Management" domain deleted). Existing blueprints created from this template still reference the deleted domain. What happens when user views blueprint?

**Current State:** `15-template-governance.md` doesn't specify behavior for deleted domains.

**Risk:** Broken references, 404 errors, data inconsistency.

**Mitigation:** Mark domain as "deprecated" instead of deleting. Show "Domain no longer in template" warning in blueprints.

---

### 5.3 Concurrent Blueprint Modification

**Edge Case:** Two users simultaneously modify the same blueprint:
- User A marks Domain X as "covered"
- User B marks Domain X as "gap"
- Both changes are saved. Which one wins?

**Current State:** No optimistic locking or conflict resolution.

**Risk:** Lost updates, data inconsistency, user confusion.

**Mitigation:** Add `updated_at` timestamp, use optimistic locking: reject updates if `updated_at` changed since read.

---

### 5.4 AI Task Timeout

**Edge Case:** AI agent starts processing T4 task but times out after 5 minutes. Task status is `Amended_Pending_Approval` but content is incomplete. User sees partial expert packet and assumes it's complete.

**Current State:** `04-llm-design.md` doesn't specify timeout handling.

**Risk:** Incomplete content displayed as complete, poor user experience.

**Mitigation:** Add timeout handling: mark task as `Rejected` if timeout, show "Generation failed" error, allow retry.

---

### 5.5 Marketplace Recommendation Race Condition

**Edge Case:** User marks Domain X as "covered" while marketplace recommendation system is generating recommendations. Recommendation is created for Domain X even though it's now covered. User sees irrelevant recommendation.

**Current State:** `06-monetization-trust.md` doesn't specify race condition handling.

**Risk:** Irrelevant recommendations, user confusion, trust erosion.

**Mitigation:** Add recommendation validation: check coverage status before displaying, invalidate recommendations when coverage changes.

---

### 5.6 RFQ Export During Blueprint Modification

**Edge Case:** User generates RFQ starter pack, then modifies blueprint (e.g., changes volumes). User exports RFQ with outdated data. Vendor receives incorrect RFQ.

**Current State:** `12-rfq-starter-pack.md` doesn't specify data freshness.

**Risk:** Incorrect RFQ sent to vendors, legal liability, project delays.

**Mitigation:** Add "RFQ Snapshot" mechanism: freeze blueprint data when RFQ generated, show "Based on blueprint state from [timestamp]" in export.

---

### 5.7 Template Version Mismatch

**Edge Case:** User creates Blueprint A from Template v1. Template is updated to v2 (new domains added). User wants to add new domains to Blueprint A. Should they:
- Add domains manually?
- "Upgrade" blueprint to Template v2?
- Fork template?

**Current State:** `15-template-governance.md` doesn't specify upgrade path.

**Risk:** User confusion, inconsistent blueprints, maintenance burden.

**Mitigation:** Add "Template Upgrade" feature: show diff between v1 and v2, allow selective domain addition.

---

### 5.8 Expert Packet Regeneration

**Edge Case:** User generates expert packet for Domain X. Later, they add more context to blueprint (e.g., update product description). User wants to regenerate expert packet. Should old packet be:
- Deleted?
- Archived?
- Superseded?

**Current State:** `04-llm-design.md` doesn't specify regeneration behavior.

**Risk:** Multiple expert packets for same domain, user confusion, storage bloat.

**Mitigation:** Add "Supersede" mechanism: mark old packet as `superseded`, show "Updated version available" badge.

---

### 5.9 Marketplace Recommendation Expiration

**Edge Case:** Marketplace recommendation is created for Domain X. User doesn't act on it for 6 months. Blueprint progresses to `production` stage. Recommendation is still displayed but may no longer be relevant (e.g., expert specializes in `concept` stage only).

**Current State:** `06-monetization-trust.md` doesn't specify recommendation expiration.

**Risk:** Stale recommendations, irrelevant CTAs, user frustration.

**Mitigation:** Add recommendation expiration: invalidate recommendations older than 30 days, or when blueprint stage changes significantly.

---

### 5.10 Blueprint Forking

**Edge Case:** User wants to create a variant of existing blueprint (e.g., "Product A - US Market" vs "Product A - EU Market"). Should they:
- Fork blueprint?
- Create new blueprint from same template?
- Duplicate blueprint?

**Current State:** No blueprint forking mechanism defined.

**Risk:** User confusion, data duplication, maintenance burden.

**Mitigation:** Add "Fork Blueprint" feature: create new blueprint with same domain coverage, allow independent modification.

---

## 6. Contradictions Across Documents

### 6.1 AI Confidence Auto-Approval

**Contradiction:**
- `13-ai-confidence-verification.md` mentions "auto-approval for high confidence (>0.8)" but doesn't specify when this applies.
- `04-llm-design.md` defines `Amended_Pending_Approval` status but doesn't mention auto-approval.
- `06-monetization-trust.md` says "unverified AI content" should be gated, implying no auto-approval.

**Resolution Needed:** Clarify whether auto-approval exists. **Recommendation:** Remove auto-approval from MVP (require manual review for all AI content).

---

### 6.2 Stage Gate Enforcement

**Contradiction:**
- `09-stage-gates.md` defines readiness evaluation but doesn't specify whether stage changes are prevented or just warned.
- `10-decisions-assumptions.md` mentions "stage freeze rules" but doesn't specify enforcement mechanism.
- `12-rfq-starter-pack.md` mentions "readiness gating" but doesn't specify whether RFQ generation is blocked or just warned.

**Resolution Needed:** Clarify whether stage gates are enforced (blocked) or advisory (warned). **Recommendation:** Make gates advisory in MVP (warn but allow override with Executive approval).

---

### 6.3 Template Forking Sync

**Contradiction:**
- `15-template-governance.md` defines template forking but doesn't specify whether forks sync with parent template.
- `05-template-library.md` mentions template updates but doesn't specify fork sync behavior.

**Resolution Needed:** Clarify whether forks are independent or can sync with parent. **Recommendation:** Make forks independent in MVP (no sync mechanism).

---

## 7. Recommendations

### 7.1 Immediate Actions (Pre-MVP)

1. **Fix Critical Security Issues:**
   - Add RLS policies to all blueprint-related tables
   - Implement role-based access control
   - Add integration tests for cross-foundry isolation

2. **Clarify Contradictions:**
   - Resolve AI auto-approval question
   - Resolve stage gate enforcement question
   - Resolve template fork sync question

3. **Implement Core Mitigations:**
   - Remove auto-approval feature
   - Add RFQ redaction defaults
   - Add coverage validation

### 7.2 MVP Scope Reduction

1. **Cut 55% of features** (as specified in Section 4)
2. **Focus on core value:** Knowledge coordination, not advanced features
3. **Add incrementally:** Risk heatmap, decisions, OptionSets post-MVP

### 7.3 Post-MVP Priorities

1. **Address High-Risk Scenarios:**
   - Template staleness detection
   - Marketplace recommendation spam
   - Domain coverage checkbox theater

2. **Add Missing Edge Case Handling:**
   - Blueprint deletion cascade
   - Concurrent modification conflicts
   - AI task timeout handling

3. **Implement Advanced Features:**
   - Canvas view
   - Risk heatmap
   - Decisions & assumptions tracking

---

## Changes Made

1. **Created `/docs/blueprint/07-red-team.md`**
   - 15 failure scenarios with severity x likelihood scoring
   - Concrete mitigations (technical, UX, product, policy)
   - Tightened MVP proposal (55% reduction)
   - 10 non-obvious edge cases
   - 3 contradictions noted (not fixed)

2. **Updated `/docs/blueprint/INDEX.md`**
   - Marked `07-red-team.md` as `complete`
   - Updated status: `pending` → `complete`
   - Updated last updated date: `2026-02-01`

3. **Updated `/docs/blueprint/ORCHESTRATION.md`**
   - Marked Step 7 (`07-red-team.md`) as `complete`
   - Updated Wave 6 status: Step 7 complete, Step 8 pending
   - Added completion date: `2026-02-01`

---

## Appendix: Risk Score Calculation

**Severity Scale:**
- 5 = Critical (data leak, security breach, legal liability)
- 4 = High (significant user impact, trust erosion)
- 3 = Medium (moderate user impact, UX issues)
- 2 = Low (minor user impact, edge cases)
- 1 = Minimal (cosmetic issues)

**Likelihood Scale:**
- 5 = Very High (will happen frequently)
- 4 = High (will happen occasionally)
- 3 = Medium (may happen)
- 2 = Low (unlikely)
- 1 = Very Low (rare)

**Risk Score = Severity × Likelihood** (max 25)

**Priority Thresholds:**
- 🔴 Critical: 15+
- 🟠 High: 12-14
- 🟡 Medium: 9-11
- 🟢 Low: <9
