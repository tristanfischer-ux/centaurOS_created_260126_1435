# Repo Assessment: Manufacturing Blueprint Feature

> **Step 1 Output** | Created: 2026-02-01 | Status: Complete

## Executive Summary

CentaurOS has **substantial existing infrastructure** for the Manufacturing Blueprint feature. The core database schema, TypeScript types, UI components, and RLS policies are already in place. This assessment identifies what exists, what requires modification, and the recommended integration approach.

**Key Finding:** The existing blueprint system covers ~80% of the required functionality. The primary gaps are:
1. `tasks.metadata` column (for blueprint/domain linking)
2. `objectives.blueprint_id` column (for objective-blueprint binding)
3. Mind-map/infinite canvas UI (new component needed)
4. Risk heatmap computation (new feature)
5. Expert packet → task creation workflow (integration needed)

---

## 1. Current State Summary

### 1.1 Blueprint Database Schema

**Location:** `supabase/migrations/20260131300000_blueprints.sql`

| Table | Status | Notes |
|-------|--------|-------|
| `blueprint_templates` | ✅ Exists | System templates with `product_category`, `icon`, `metadata` |
| `knowledge_domains` | ✅ Exists | Hierarchical tree with `parent_id`, `depth`, `key_questions[]`, `criticality` |
| `blueprints` | ✅ Exists | Instance per foundry with `project_stage`, `coverage_score`, `ai_generated_context` |
| `blueprint_domain_coverage` | ✅ Exists | Status per domain with `decisions` JSONB, `blockers[]`, `questions_answered` |
| `blueprint_expertise` | ✅ Exists | Expertise mapping with `person_type` (includes `ai_agent`), `verification_status` |
| `blueprint_suppliers` | ✅ Exists | Supplier tracking per blueprint |
| `blueprint_milestones` | ✅ Exists | Milestones with `required_domain_ids[]` |
| `blueprint_history` | ✅ Exists | Audit log with `action`, `details` JSONB |
| `suppliers` | ✅ Exists | Global supplier database |
| `supplier_reviews` | ✅ Exists | Community reviews |

**Confirmed Enums:**
- `project_stage`: `'concept' | 'prototype' | 'evt' | 'dvt' | 'production' | 'launched'`
- `coverage_status`: `'covered' | 'partial' | 'gap' | 'not_needed'`
- `person_type`: `'team' | 'advisor' | 'marketplace' | 'external' | 'ai_agent'`
- `expertise_level`: `'expert' | 'competent' | 'learning'`
- `verification_status`: `'verified' | 'claimed' | 'inferred'`
- `criticality`: `'critical' | 'important' | 'nice-to-have'`

### 1.2 Task Workflow System

**Location:** `supabase/migrations/20260126000000_init_schema.sql` and related

| Feature | Status | Notes |
|---------|--------|-------|
| `task_status` enum | ✅ Exists | Includes `'Amended'`, `'Amended_Pending_Approval'`, `'Pending_Peer_Review'`, `'Pending_Executive_Approval'`, `'Completed'` |
| Task comments | ✅ Exists | `task_comments` table with `is_system_log` flag |
| Task attachments | ✅ Exists | `task_files` table for file uploads |
| Task history | ✅ Exists | `task_history` for audit trail |
| Task assignment | ✅ Exists | Multi-assignee support via junction table |
| `tasks.metadata` | ❌ Missing | **REQUIRES MIGRATION** - Needed for `blueprint_id`, `domain_id`, `artifact_type` |
| `objectives.blueprint_id` | ❌ Missing | **REQUIRES MIGRATION** - Needed for blueprint-objective linking |

### 1.3 AI Agent (Ghost Worker) System

**Location:** `src/lib/ai-worker.ts`

| Feature | Status | Implementation |
|---------|--------|----------------|
| AI Agent role | ✅ Exists | `profiles.role = 'AI_Agent'` |
| Ghost worker trigger | ✅ Exists | `runAIWorker(taskId, assigneeId)` function |
| Amended workflow | ✅ Exists | Sets task to `'Amended_Pending_Approval'` with `amendment_notes` |
| System comments | ✅ Exists | Adds comment with `is_system_log: true` |
| Prompt injection protection | ✅ Exists | `escapeHtml()` sanitization, clear system/user separation |

**Ghost Worker Handshake Pattern:**
```typescript
// 1. Task assigned to AI_Agent profile
// 2. Ghost worker generates content via OpenAI
// 3. Task status → 'Amended_Pending_Approval'
// 4. amendment_notes populated with AI output
// 5. Human reviews → Accepts/Rejects/Amends
```

### 1.4 Existing Blueprint UI

**Location:** `src/app/(platform)/blueprints/`

| Component | Status | Notes |
|-----------|--------|-------|
| List view | ✅ Exists | `blueprints-view.tsx` with template selection |
| Detail view | ✅ Exists | `blueprint-detail-view.tsx` with tabs (Domains, Expertise, Suppliers, Milestones) |
| Domain tree view | ✅ Exists | `DomainTreeView` component with expand/collapse |
| Domain list view | ✅ Exists | `DomainListView` with filtering |
| Coverage bar | ✅ Exists | `CoverageBar` with covered/partial/gap visualization |
| Coverage score | ✅ Exists | `CoverageScore` percentage display |
| Next action card | ✅ Exists | `NextActionCard` for gap recommendations |
| Domain detail panel | ✅ Exists | `DomainDetailPanel` Sheet for editing coverage |
| Assessment flow | 🟡 Partial | `getAssessmentQuestions()` exists but UI needs expansion |
| Mind-map/canvas | ❌ Missing | New component required |
| Risk heatmap | ❌ Missing | New computation and visualization needed |

### 1.5 Marketplace & RFQ System

**Location:** `src/app/(platform)/rfq/`, `src/actions/rfq.ts`, `src/lib/rfq/`

| Feature | Status | Notes |
|---------|--------|-------|
| RFQ creation | ✅ Exists | `createNewRFQ()` with `CreateRFQParams` |
| RFQ types | ✅ Exists | `'commodity' | 'custom' | 'service'` |
| RFQ race system | ✅ Exists | Broadcasting, priority hold, tier delays |
| RFQ responses | ✅ Exists | Accept/decline/info-request workflow |
| Supplier matching | ✅ Exists | `matchSuppliers(rfqId)` function |
| Provider profiles | ✅ Exists | Marketplace listings with tier system |
| `marketplace_recommendations` | ✅ Exists | AI-generated recommendations table |
| `generate_gap_recommendations()` | ✅ Exists | Creates recommendations from coverage gaps |

**RFQ Specifications Schema:**
```typescript
interface RFQSpecifications {
  description?: string
  quantity?: number
  unit?: string
  materials?: string[]
  dimensions?: { length, width, height, unit }
  attachments?: string[]
  custom_fields?: Record<string, unknown>
}
```

### 1.6 Org Blueprint (Business Functions)

**Location:** `src/types/org-blueprint.ts`, `supabase/migrations/`

| Feature | Status | Notes |
|---------|--------|-------|
| `business_functions` table | ✅ Exists | Canonical business function catalog |
| `foundry_function_coverage` table | ✅ Exists | Coverage status per foundry |
| Coverage types | ✅ Exists | `'internal_team' | 'fractional' | 'marketplace' | 'ai_tool'` etc. |
| Default functions | ✅ Exists | 35 pre-defined business functions |
| Gap assessment | ✅ Exists | `GapAssessmentInput` / `GapAssessmentResult` types |

### 1.7 Seed Templates

**Location:** `supabase/migrations/20260131300001_seed_blueprint_templates.sql`

| Template | Domains | Status |
|----------|---------|--------|
| Consumer Electronics | 47 domains | ✅ Seeded |
| SaaS Platform | 38 domains | ✅ Seeded |

**Domain hierarchy depth:** 0 (root) → 1 (category) → 2 (subcategory)

---

## 2. Constraints & Opportunities

### 2.1 Reusable Components

| Component | Can Reuse For | Notes |
|-----------|---------------|-------|
| `blueprint_domain_coverage.decisions` JSONB | Decision/assumption tracking | Schema: `{decision, made_at, made_by}[]` |
| `clone_blueprint_from_template()` | Template instantiation | Already handles domain copying |
| `calculate_blueprint_coverage()` | Coverage metrics | Returns `coverage_score`, `critical_gaps` |
| `update_blueprint_metrics()` | Auto-update cached scores | Trigger-based |
| `generate_gap_recommendations()` | Marketplace recommendations | Links gaps → marketplace |
| Ghost worker pattern | Expert packet generation | Task → AI → Amended_Pending_Approval |
| RFQ creation flow | RFQ starter pack | `createNewRFQ()` with specifications |
| `StatusBadge` component | Coverage status display | Semantic status colors |
| `Sheet` component | Domain detail panels | Right-side slide-out |

### 2.2 Schema Extensions Needed

| Extension | Table | Column/Change | Rationale |
|-----------|-------|---------------|-----------|
| Task-blueprint link | `tasks` | `metadata JSONB` | Store `blueprint_id`, `domain_id`, `artifact_type` |
| Objective-blueprint link | `objectives` | `blueprint_id UUID` | Group tasks by blueprint objective |
| Option sets | New table | `blueprint_option_sets` | OptionSet comparison feature |
| Options | New table | `blueprint_options` | Individual options with tradeoffs |

### 2.3 Function Extensions Needed

| Function | Purpose | Notes |
|----------|---------|-------|
| `create_expert_packet_task()` | Creates task from domain gap | Links to blueprint, sets AI assignee |
| `create_rfq_from_domain()` | Creates RFQ from domain gap | Pre-populates specifications |
| `compute_risk_score()` | Calculates domain risk | Inputs: coverage, criticality, blockers, stage |

---

## 3. Risks & Unknowns

### 3.1 Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| RLS complexity for task.metadata queries | Medium | Add index on `metadata->>'blueprint_id'`, test with RLS enabled |
| Mind-map performance with large trees | Medium | Use virtual scrolling, lazy-load children |
| Ghost worker rate limits | Low | Existing OpenAI integration handles this |
| Migration ordering for existing data | Low | Use `IF NOT EXISTS` patterns |

### 3.2 Unknowns to Confirm

| Unknown | Impact | How to Confirm |
|---------|--------|----------------|
| Maximum domain tree depth in production | UI performance | Query max depth from `knowledge_domains` |
| Existing blueprint coverage data | Migration safety | Check if blueprints have `blueprint_domain_coverage` rows |
| RFQ category mapping to domains | RFQ generation | Review `RFQ_CATEGORIES` vs `DomainCategory` |
| AI cost per expert packet | Budgeting | Monitor OpenAI usage in Ghost Worker |

### 3.3 Data Integrity Considerations

1. **Existing `blueprint_domain_coverage.decisions`**: Currently `JSONB DEFAULT '[]'`. Decision model must be backward-compatible.
2. **`questions_answered` / `questions_open`**: Both are JSONB arrays—ensure consistent schema.
3. **Template forking**: `fork_count` tracked but forking function not implemented.

---

## 4. Recommended Integration Approach

### 4.1 Minimal Migration Strategy

**Principle:** Extend existing tables rather than creating parallel structures.

**Required Migrations (Priority Order):**

1. **Add `tasks.metadata`** (Critical)
   ```sql
   ALTER TABLE tasks ADD COLUMN metadata JSONB DEFAULT '{}';
   CREATE INDEX idx_tasks_blueprint ON tasks ((metadata->>'blueprint_id'));
   ```

2. **Add `objectives.blueprint_id`** (Critical)
   ```sql
   ALTER TABLE objectives ADD COLUMN blueprint_id UUID REFERENCES blueprints(id) ON DELETE SET NULL;
   CREATE INDEX idx_objectives_blueprint ON objectives(blueprint_id);
   ```

3. **Formalize decision schema in `blueprint_domain_coverage.decisions`** (Important)
   - Document expected schema: `{type, decision, rationale, made_at, made_by, status, supersedes?}`
   - No schema change needed—JSONB is flexible

4. **Add OptionSet tables** (Deferred to v1)
   - `blueprint_option_sets` and `blueprint_options` tables
   - Can be added later without breaking existing functionality

### 4.2 Integration Points

| New Feature | Integrates With | How |
|-------------|-----------------|-----|
| Expert packet tasks | Ghost Worker | Create task with `AI_Agent` assignee, use existing handshake |
| RFQ starter pack | `createNewRFQ()` | Pre-populate `specifications` from domain `key_questions` |
| Coverage audit | `blueprint_domain_coverage` | Use existing `status`, add UI overlays |
| Marketplace recommendations | `generate_gap_recommendations()` | Already generates recs from gaps |
| Risk heatmap | `blueprint_domain_coverage` | Compute from `is_critical`, `blockers[]`, `status` |

### 4.3 UI Component Strategy

| Component | Strategy | Notes |
|-----------|----------|-------|
| Mind-map canvas | New component | Use `@xyflow/react` (React Flow) library |
| Risk heatmap | New component | Overlay on existing domain tree |
| Expert packet panel | Extend `DomainDetailPanel` | Add "Generate Expert Packet" action |
| OptionSet comparison | New component | Side-by-side comparison table |
| Decision log | Extend `blueprint_history` | Add decision-specific action types |

---

## 5. TypeScript Type Coverage

### 5.1 Existing Types (Reuse)

**`src/types/blueprints.ts`:**
- `Blueprint`, `BlueprintTemplate`, `KnowledgeDomain`
- `DomainCoverage`, `DomainCoverageWithDetails`
- `Expertise`, `VerificationStatus`, `PersonType`
- `CoverageStatus`, `ProjectStage`, `DomainCriticality`
- `BlueprintSupplier`, `BlueprintMilestone`, `BlueprintHistoryEntry`
- `CreateBlueprintInput`, `UpdateCoverageInput`, `AddExpertiseInput`
- `NextAction`, `AssessmentQuestion`, `AssessmentAnswer`

**`src/types/rfq.ts`:**
- `RFQ`, `RFQResponse`, `RFQSpecifications`
- `CreateRFQParams`, `RFQType`, `RFQStatus`
- `SupplierMatch`, `RaceStatus`

**`src/types/tasks.ts`:**
- `TaskWithAssignee`, `TaskWithAssignees`
- `Team`, `TeamMember`

### 5.2 New Types Needed

```typescript
// For tasks.metadata
interface TaskMetadata {
  blueprint_id?: string
  domain_id?: string
  artifact_type?: 'expert_packet' | 'rfq_pack' | 'decision' | null
}

// For OptionSets (v1)
interface BlueprintOptionSet {
  id: string
  blueprint_id: string
  domain_id: string
  name: string
  description: string | null
  status: 'open' | 'decided' | 'deferred'
  decided_option_id: string | null
  created_at: string
}

interface BlueprintOption {
  id: string
  option_set_id: string
  name: string
  description: string | null
  tradeoffs: Record<TradeoffDimension, number> // 1-5 scale
  rationale: string | null
  display_order: number
}

type TradeoffDimension = 
  | 'cost' 
  | 'lead_time' 
  | 'complexity' 
  | 'risk' 
  | 'performance'
  | 'compliance'
  | 'maintainability'

// For risk computation
interface DomainRiskScore {
  domain_id: string
  risk_score: number // 0-5
  factors: {
    coverage_gap: boolean
    is_critical: boolean
    has_blockers: boolean
    stage_relevant: boolean
  }
}
```

---

## 6. Existing Database Functions Summary

| Function | Purpose | Can Reuse |
|----------|---------|-----------|
| `calculate_blueprint_coverage(p_blueprint_id)` | Returns coverage metrics | ✅ Yes |
| `update_blueprint_metrics(p_blueprint_id)` | Updates cached scores | ✅ Yes (trigger-based) |
| `clone_blueprint_from_template(...)` | Creates blueprint from template | ✅ Yes |
| `get_my_foundry_id()` | Returns current user's foundry | ✅ Yes |
| `is_active_user()` | Checks user is active | ✅ Yes |
| `get_my_role()` | Returns user role | ✅ Yes |
| `generate_gap_recommendations(p_foundry_id)` | Creates marketplace recs | ✅ Yes |
| `get_marketplace_recommendations(p_foundry_id, p_limit)` | Retrieves active recs | ✅ Yes |

---

## 7. Summary

### Ready to Build (Existing Foundation)
- ✅ Blueprint templates and domain trees
- ✅ Coverage tracking with status/decisions/blockers
- ✅ Expertise mapping (team/advisor/marketplace/AI)
- ✅ Task workflow with AI handshake
- ✅ RFQ system with race mechanics
- ✅ Marketplace recommendations

### Needs Extension (Migrations/New Code)
- ⚠️ `tasks.metadata` column
- ⚠️ `objectives.blueprint_id` column
- ⚠️ Mind-map canvas component
- ⚠️ Risk heatmap computation
- ⚠️ Expert packet → task creation function
- ⚠️ RFQ auto-generation from domains

### Future Scope (v1/v2)
- 🔮 OptionSet comparison feature
- 🔮 Template forking workflow
- 🔮 Multi-blueprint dependencies
- 🔮 Version control for blueprints

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/00-repo-assessment.md` | Created |
