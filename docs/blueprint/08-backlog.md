# Manufacturing Blueprint: Execution Backlog

> **Status:** Execution-ready backlog derived from integrated specification  
> **Last Updated:** 2026-02-01  
> **MVP Scope:** Tightened to 7 core features (55% reduction per Red Team analysis)

---

## Table of Contents

1. [Milestones & Demo Scripts](#milestones--demo-scripts)
2. [Epic Breakdown](#epic-breakdown)
3. [Thin Vertical Slices (MVP)](#thin-vertical-slices-mvp)
4. [Dependencies](#dependencies)
5. [Definition of Done](#definition-of-done)
6. [Acceptance Tests](#acceptance-tests)
7. [Enum Consistency Check](#enum-consistency-check)
8. [Changes Made](#changes-made)

---

## Milestones & Demo Scripts

### M0: Foundation & Infrastructure

**Goal:** Database schema, types, and basic infrastructure ready for blueprint features.

**Demo Script:**
```bash
# 1. Verify database migrations applied
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='metadata';"
# Expected: metadata (JSONB)

psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='objectives' AND column_name='blueprint_id';"
# Expected: blueprint_id (UUID)

# 2. Verify RLS policies exist
psql $DATABASE_URL -c "SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('blueprints', 'blueprint_domain_coverage', 'blueprint_expertise', 'knowledge_domains', 'blueprint_templates');"
# Expected: Policies for all tables

# 3. Verify TypeScript types exist
grep -r "TaskMetadata\|BlueprintMetadata" src/types/
# Expected: Type definitions found

# 4. Verify helper functions exist
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname IN ('get_my_foundry_id', 'get_blueprint_foundry_id');"
# Expected: Functions exist
```

**Deliverables:**
- ✅ `tasks.metadata` JSONB column added
- ✅ `objectives.blueprint_id` UUID column added
- ✅ RLS policies on all blueprint-related tables
- ✅ TypeScript types for `TaskMetadata`, `BlueprintMetadata`, `ArtifactType`
- ✅ Database helper functions: `get_my_foundry_id()`, `get_blueprint_foundry_id()`
- ✅ Server action stubs with authentication checks

---

### M1: Blueprint Creation from Template

**Goal:** User can create a blueprint from a template and see the domain tree in list view.

**Demo Script:**
```bash
# 1. Create blueprint from template
curl -X POST http://localhost:3000/api/blueprints/create-from-template \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"template_id": "robotics-template-uuid", "product_name": "Autonomous Delivery Robot", "product_description": "..."}'
# Expected: 201 Created, returns blueprint_id

# 2. View blueprint list
curl http://localhost:3000/api/blueprints \
  -H "Authorization: Bearer $TOKEN"
# Expected: List includes new blueprint

# 3. View domain tree (list view)
curl http://localhost:3000/api/blueprints/{blueprint_id}/domains \
  -H "Authorization: Bearer $TOKEN"
# Expected: Hierarchical domain list (12 top-level domains for robotics template)

# 4. UI: Navigate to /blueprints/{id}
# Expected: Page loads, shows domain tree in expandable list (not canvas)
```

**Deliverables:**
- ✅ Server action: `instantiateBlueprintFromTemplate()`
- ✅ UI: Blueprint list page (`/blueprints`)
- ✅ UI: Blueprint detail page (`/blueprints/[id]`)
- ✅ UI: Domain tree list view (expandable/collapsible)
- ✅ RLS: User can only see blueprints from their foundry
- ✅ RBAC: Founder/Executive can create, Apprentice can view

---

### M2: Coverage Audit

**Goal:** User can mark domains as covered/partial/gap and see coverage metrics.

**Demo Script:**
```bash
# 1. Update domain coverage status
curl -X PATCH http://localhost:3000/api/blueprints/{blueprint_id}/coverage/{domain_id} \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "gap", "notes": "No expertise in battery pack design"}'
# Expected: 200 OK

# 2. View coverage metrics
curl http://localhost:3000/api/blueprints/{blueprint_id}/coverage/metrics \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"covered": 3, "partial": 2, "gap": 7, "not_needed": 0, "total": 12}

# 3. Add expertise entry
curl -X POST http://localhost:3000/api/blueprints/{blueprint_id}/expertise \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"domain_id": "domain-uuid", "person_type": "team", "expertise_level": "competent", "person_name": "John Doe"}'
# Expected: 201 Created

# 4. UI: Coverage status badges visible on domain list
# Expected: Color-coded badges (green=covered, yellow=partial, red=gap, gray=not_needed)

# 5. UI: Coverage metrics dashboard
# Expected: Summary card showing coverage percentages
```

**Deliverables:**
- ✅ Server action: `updateBlueprintDomainCoverage()`
- ✅ Server action: `addBlueprintExpertise()`
- ✅ UI: Coverage status selector (dropdown/badges) on domain items
- ✅ UI: Coverage metrics summary card
- ✅ UI: Expertise list per domain
- ✅ RLS: User can only update coverage for their foundry's blueprints
- ✅ RBAC: Founder/Executive can update, Apprentice can view

---

### M3: Expert Packet Generation

**Goal:** User can generate an expert interview packet via AI (T4), review it, and approve/reject.

**Demo Script:**
```bash
# 1. Generate expert packet
curl -X POST http://localhost:3000/api/blueprints/{blueprint_id}/expert-packets/generate \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"domain_id": "domain-uuid"}'
# Expected: 202 Accepted, returns task_id

# 2. Check task status (AI processing)
curl http://localhost:3000/api/tasks/{task_id} \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"status": "Pending", "metadata": {"llm_task_type": "T4", "artifact_type": "expert_packet", "provenance": {"type": "ai_suggested"}}}

# 3. Wait for AI completion (poll or webhook)
# Expected: Task status changes to "Pending_Peer_Review" or "Pending_Executive_Approval"

# 4. View expert packet content
curl http://localhost:3000/api/tasks/{task_id}/content \
  -H "Authorization: Bearer $TOKEN"
# Expected: JSON with questions, artifacts_to_request, red_flags, stage_awareness

# 5. Approve expert packet
curl -X PATCH http://localhost:3000/api/tasks/{task_id}/approve \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 OK, task status = "Accepted"

# 6. UI: "Generate Expert Packet" button on domain detail
# Expected: Button triggers generation, shows loading state

# 7. UI: Review queue page (`/blueprints/{id}/review`)
# Expected: Lists pending AI-generated content, shows preview, approve/reject buttons

# 8. UI: Expert packet preview
# Expected: Shows questions, rationale, artifacts, red flags, formatted nicely
```

**Deliverables:**
- ✅ Server action: `generateExpertPacket()`
- ✅ LLM integration: T4 task type contract (input/output JSON schema)
- ✅ Ghost Worker: Process T4 tasks, generate expert packet
- ✅ UI: "Generate Expert Packet" button on domain detail
- ✅ UI: Review queue page (`/blueprints/[id]/review`)
- ✅ UI: Expert packet preview component
- ✅ UI: Approve/reject actions
- ✅ RLS: User can only view/approve tasks for their foundry's blueprints
- ✅ RBAC: Founder/Executive can approve, Apprentice can view
- ✅ Provenance tracking: `tasks.metadata.provenance.type = 'ai_suggested'`

---

### M4: Task Creation from Gaps

**Goal:** User can create tasks/objectives from identified coverage gaps, tagged with domain.

**Demo Script:**
```bash
# 1. Create task from gap
curl -X POST http://localhost:3000/api/blueprints/{blueprint_id}/tasks/create-from-gap \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"domain_id": "domain-uuid", "title": "Hire battery pack design expert", "description": "..."}'
# Expected: 201 Created, returns task_id

# 2. Verify task metadata
curl http://localhost:3000/api/tasks/{task_id} \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"metadata": {"blueprint_id": "...", "domain_id": "...", "artifact_type": null}}

# 3. Create objective from gap
curl -X POST http://localhost:3000/api/blueprints/{blueprint_id}/objectives/create-from-gap \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"domain_id": "domain-uuid", "title": "Establish battery pack expertise", "tasks": [...]}'
# Expected: 201 Created, returns objective_id

# 4. Verify objective blueprint_id
curl http://localhost:3000/api/objectives/{objective_id} \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"blueprint_id": "..."}

# 5. UI: "Create Task" button on gap domain
# Expected: Opens dialog, pre-fills domain context

# 6. UI: Task list filtered by blueprint
# Expected: `/blueprints/{id}/tasks` shows all tasks with `metadata.blueprint_id = {id}`

# 7. UI: Domain badge on task card
# Expected: Shows domain name, links to domain detail
```

**Deliverables:**
- ✅ Server action: `createTaskFromGap()`
- ✅ Server action: `createObjectiveFromGap()`
- ✅ UI: "Create Task" button on gap domains
- ✅ UI: Task creation dialog (pre-filled with domain context)
- ✅ UI: Task list filtered by blueprint (`/blueprints/[id]/tasks`)
- ✅ UI: Domain badge on task cards
- ✅ RLS: User can only create tasks for their foundry's blueprints
- ✅ RBAC: Founder/Executive can create, Apprentice can view

---

### M5: Marketplace Recommendations

**Goal:** User can see marketplace recommendations generated from coverage gaps (max 5 per blueprint).

**Demo Script:**
```bash
# 1. Generate recommendations
curl -X POST http://localhost:3000/api/blueprints/{blueprint_id}/recommendations/generate \
  -H "Authorization: Bearer $TOKEN"
# Expected: 202 Accepted

# 2. View recommendations
curl http://localhost:3000/api/blueprints/{blueprint_id}/recommendations \
  -H "Authorization: Bearer $TOKEN"
# Expected: Array of max 5 recommendations, each with:
# - provider_id, provider_name
# - domain_id, domain_name
# - reason (why suggested: "Gap in battery_pack_design")
# - match_score

# 3. UI: Recommendations panel on blueprint detail
# Expected: Shows up to 5 recommendations, "Find Expert" CTA

# 4. UI: Click "Find Expert"
# Expected: Navigates to marketplace provider detail page

# 5. Verify gating: No recommendations if no gaps
curl http://localhost:3000/api/blueprints/{blueprint_id}/recommendations \
  -H "Authorization: Bearer $TOKEN"
# Expected: Empty array if all domains covered
```

**Deliverables:**
- ✅ Server action: `generateMarketplaceRecommendations()`
- ✅ Logic: Generate from `blueprint_domain_coverage` gaps
- ✅ Logic: Match gaps to `knowledge_domains.marketplace_categories`
- ✅ Logic: Limit to 5 recommendations per blueprint
- ✅ UI: Recommendations panel on blueprint detail page
- ✅ UI: "Find Expert" CTA linking to marketplace
- ✅ RLS: User can only see recommendations for their foundry's blueprints
- ✅ RBAC: All roles can view recommendations

---

### M6: RFQ Starter Pack (MVP)

**Goal:** User can generate a basic RFQ starter pack (general template only), preview it, and export to PDF.

**Demo Script:**
```bash
# 1. Generate RFQ starter pack
curl -X POST http://localhost:3000/api/blueprints/{blueprint_id}/rfq-packs/generate \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"domain_id": "domain-uuid", "template": "general"}'
# Expected: 202 Accepted, returns task_id

# 2. Wait for AI completion (T6 task)
# Expected: Task status = "Pending_Peer_Review"

# 3. View RFQ pack content
curl http://localhost:3000/api/tasks/{task_id}/content \
  -H "Authorization: Bearer $TOKEN"
# Expected: JSON with overview, requirements, volumes, tolerances, timeline, compliance

# 4. Approve RFQ pack
curl -X PATCH http://localhost:3000/api/tasks/{task_id}/approve \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 OK

# 5. Export to PDF
curl http://localhost:3000/api/tasks/{task_id}/export/pdf \
  -H "Authorization: Bearer $TOKEN"
# Expected: PDF file download

# 6. UI: "Generate RFQ Pack" button on domain detail
# Expected: Button triggers generation

# 7. UI: RFQ pack preview
# Expected: Shows formatted RFQ content, redaction controls (opt-out default)

# 8. UI: Export to PDF button
# Expected: Downloads PDF file
```

**Deliverables:**
- ✅ Server action: `generateRFQStarterPack()`
- ✅ LLM integration: T6 task type contract (general template only)
- ✅ Ghost Worker: Process T6 tasks, generate RFQ pack
- ✅ UI: "Generate RFQ Pack" button on domain detail
- ✅ UI: RFQ pack preview component
- ✅ UI: Redaction controls (8 categories, opt-out default)
- ✅ UI: Export to PDF functionality
- ✅ Storage: `tasks.metadata.artifact_type = 'rfq_pack'`
- ✅ RLS: User can only generate RFQ packs for their foundry's blueprints
- ✅ RBAC: Founder/Executive can generate/approve, Apprentice can view

---

### M7: MVP Complete (End-to-End)

**Goal:** All thin vertical slices working together in a complete user journey.

**Demo Script:**
```bash
# Complete user journey:
# 1. Create blueprint from template
# 2. Review domain tree (list view)
# 3. Mark domains as gaps
# 4. Generate expert packet for a gap domain
# 5. Review and approve expert packet
# 6. Create task from gap
# 7. Generate marketplace recommendations
# 8. Generate RFQ starter pack
# 9. Review and export RFQ pack

# Expected: All steps complete without errors, data persists, RLS enforced, RBAC respected
```

**Deliverables:**
- ✅ End-to-end integration tests
- ✅ Performance: Page load < 2s
- ✅ Security: All RLS policies verified
- ✅ Security: All RBAC checks verified
- ✅ Analytics: Track blueprint_created, expert_packet_generated, task_created events

---

## Epic Breakdown

### Epic 1: Foundation & Infrastructure

**Goal:** Database schema, types, RLS policies, and basic server action infrastructure.

#### Story 1.1: Database Migrations
**Tasks:**
- [ ] Add `tasks.metadata` JSONB column with default `{}`
- [ ] Add `objectives.blueprint_id` UUID column with foreign key to `blueprints(id)`
- [ ] Create index on `objectives.blueprint_id`
- [ ] Add database function `get_blueprint_foundry_id(blueprint_id UUID)`
- [ ] Add comments to columns explaining usage

**Acceptance Criteria:**
- ✅ Migration runs without errors
- ✅ Existing data preserved (metadata defaults to `{}`, blueprint_id nullable)
- ✅ Foreign key constraint enforces referential integrity
- ✅ Index improves query performance for `objectives WHERE blueprint_id = ?`

#### Story 1.2: RLS Policies
**Tasks:**
- [ ] Add RLS policy to `blueprint_domain_coverage`: Users can only access coverage for blueprints in their foundry
- [ ] Add RLS policy to `blueprint_expertise`: Users can only access expertise for blueprints in their foundry
- [ ] Add RLS policy to `knowledge_domains`: Users can view all domains (public), but can only modify domains in templates they own
- [ ] Add RLS policy to `blueprint_templates`: Users can view active templates (public), but can only modify templates they own
- [ ] Verify RLS policies on `blueprints` table (should already exist)
- [ ] Add integration test: Create two foundries, verify no cross-foundry data leakage

**Acceptance Criteria:**
- ✅ All policies use `get_my_foundry_id()` or `get_blueprint_foundry_id()`
- ✅ Policies prevent cross-foundry access
- ✅ Integration test passes (no data leakage)

#### Story 1.3: TypeScript Types
**Tasks:**
- [ ] Create `src/types/blueprint-tasks.ts` with `TaskMetadata` interface
- [ ] Add `ArtifactType` type: `'expert_packet' | 'rfq_pack' | 'decision_proposal' | 'domain_suggestion' | null`
- [ ] Add `ProvenanceType` type: `'template_derived' | 'user_entered' | 'ai_suggested'`
- [ ] Add `Provenance` interface: `{ type: ProvenanceType, confidence?: number, llm_task_type?: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' }`
- [ ] Update `Task` type to include `metadata?: TaskMetadata`
- [ ] Update `Objective` type to include `blueprint_id?: string`

**Acceptance Criteria:**
- ✅ Types match database schema
- ✅ Types exported from `src/types/index.ts`
- ✅ No TypeScript errors in codebase

#### Story 1.4: Server Action Infrastructure
**Tasks:**
- [ ] Create `src/actions/blueprints.ts` with authentication check helper
- [ ] Add `requireAuth()` helper that throws if user not authenticated
- [ ] Add `requireFoundryAccess(blueprint_id)` helper that verifies foundry access
- [ ] Add `requireRole(roles: string[])` helper that checks user role
- [ ] Create server action stubs for all blueprint actions (return empty/placeholder)

**Acceptance Criteria:**
- ✅ All server actions check authentication
- ✅ Helper functions reusable across actions
- ✅ Error messages are user-friendly

---

### Epic 2: Blueprint Creation

**Goal:** User can create a blueprint from a template and view the domain tree.

#### Story 2.1: Server Action - Create Blueprint from Template
**Tasks:**
- [ ] Implement `instantiateBlueprintFromTemplate()` server action
- [ ] Validate template exists and is active
- [ ] Clone template domains to blueprint (create `knowledge_domains` entries)
- [ ] Create `blueprint_domain_coverage` entries for all domains (default status: 'gap')
- [ ] Create `blueprint` record with `foundry_id`, `project_stage: 'concept'`
- [ ] Return blueprint_id

**Acceptance Criteria:**
- ✅ Blueprint created with correct foundry_id
- ✅ All template domains cloned
- ✅ Coverage entries created with default status
- ✅ RLS enforced (user can only create for their foundry)

#### Story 2.2: UI - Blueprint List Page
**Tasks:**
- [ ] Create `/blueprints` page (list view)
- [ ] Fetch blueprints for current foundry
- [ ] Display blueprint cards (name, stage, created date, coverage summary)
- [ ] Add "Create Blueprint" button
- [ ] Link to blueprint detail page

**Acceptance Criteria:**
- ✅ Page loads < 2s
- ✅ Only shows blueprints from user's foundry
- ✅ Responsive design (mobile/desktop)
- ✅ Empty state when no blueprints

#### Story 2.3: UI - Create Blueprint Dialog
**Tasks:**
- [ ] Create dialog component for blueprint creation
- [ ] Fetch active templates (filter by `template_lifecycle = 'active'`)
- [ ] Display template selector (name, description, product_category)
- [ ] Form fields: product_name, product_description
- [ ] Submit calls `instantiateBlueprintFromTemplate()`
- [ ] Redirect to blueprint detail page on success

**Acceptance Criteria:**
- ✅ Dialog accessible (keyboard navigation, focus management)
- ✅ Form validation (required fields)
- ✅ Loading state during creation
- ✅ Error handling (display errors to user)

#### Story 2.4: UI - Blueprint Detail Page
**Tasks:**
- [ ] Create `/blueprints/[id]` page
- [ ] Fetch blueprint data (name, stage, metadata)
- [ ] Fetch domain tree (hierarchical structure)
- [ ] Display domain list (expandable/collapsible, not canvas)
- [ ] Show domain name, description, criticality badge
- [ ] Add page header with blueprint name and stage

**Acceptance Criteria:**
- ✅ Page loads < 2s
- ✅ Domain tree displays correctly (hierarchical)
- ✅ Expand/collapse works
- ✅ RLS enforced (404 if blueprint not in user's foundry)

#### Story 2.5: UI - Domain List Component
**Tasks:**
- [ ] Create `DomainTreeList` component
- [ ] Render domains recursively (parent → children)
- [ ] Add expand/collapse icons
- [ ] Show domain metadata (name, description, criticality)
- [ ] Add click handler to navigate to domain detail
- [ ] Add coverage status badge (placeholder for now)

**Acceptance Criteria:**
- ✅ Component is reusable
- ✅ Handles deep nesting (3+ levels)
- ✅ Accessible (keyboard navigation, ARIA labels)
- ✅ Performance: Renders 100+ domains without lag

---

### Epic 3: Coverage Audit

**Goal:** User can mark domains as covered/partial/gap and track expertise.

#### Story 3.1: Server Action - Update Coverage Status
**Tasks:**
- [ ] Implement `updateBlueprintDomainCoverage()` server action
- [ ] Validate blueprint_id belongs to user's foundry
- [ ] Validate domain_id belongs to blueprint
- [ ] Update `blueprint_domain_coverage.status` (covered/partial/gap/not_needed)
- [ ] Update `blueprint_domain_coverage.notes` (optional)
- [ ] Trigger coverage metrics recalculation
- [ ] Return updated coverage entry

**Acceptance Criteria:**
- ✅ Status updated correctly
- ✅ Notes saved (can be null/empty)
- ✅ RLS enforced (user can only update their foundry's blueprints)
- ✅ RBAC enforced (Founder/Executive can update, Apprentice read-only)

#### Story 3.2: Server Action - Add Expertise
**Tasks:**
- [ ] Implement `addBlueprintExpertise()` server action
- [ ] Validate blueprint_id and domain_id
- [ ] Validate `person_type` enum (team/advisor/marketplace/external/ai_agent)
- [ ] Validate `expertise_level` enum (expert/competent/learning)
- [ ] Create `blueprint_expertise` entry
- [ ] Return expertise entry

**Acceptance Criteria:**
- ✅ Expertise entry created
- ✅ All enum values validated
- ✅ RLS enforced
- ✅ RBAC enforced

#### Story 3.3: UI - Coverage Status Selector
**Tasks:**
- [ ] Add coverage status dropdown/badges to domain list items
- [ ] Display current status (color-coded badge)
- [ ] On click, show status selector (covered/partial/gap/not_needed)
- [ ] Update status via `updateBlueprintDomainCoverage()`
- [ ] Show loading state during update
- [ ] Update UI optimistically

**Acceptance Criteria:**
- ✅ Status updates immediately (optimistic UI)
- ✅ Error handling (revert on failure)
- ✅ Accessible (keyboard navigation, screen reader support)

#### Story 3.4: UI - Coverage Metrics Dashboard
**Tasks:**
- [ ] Create coverage metrics summary card component
- [ ] Calculate metrics: covered count, partial count, gap count, not_needed count, total
- [ ] Display percentages (e.g., "60% Covered")
- [ ] Show visual progress bar
- [ ] Add to blueprint detail page header

**Acceptance Criteria:**
- ✅ Metrics calculate correctly
- ✅ Updates when coverage status changes
- ✅ Visual design matches design system

#### Story 3.5: UI - Expertise List
**Tasks:**
- [ ] Create expertise list component per domain
- [ ] Fetch expertise entries for domain
- [ ] Display person name, type, expertise level
- [ ] Add "Add Expertise" button (opens dialog)
- [ ] Add expertise entry form (person_type, expertise_level, person_name)

**Acceptance Criteria:**
- ✅ Expertise list displays correctly
- ✅ Form validation
- ✅ RLS enforced (only show expertise for user's foundry's blueprints)

---

### Epic 4: Expert Packet Generation

**Goal:** User can generate expert interview packets via AI (T4), review them, and approve/reject.

#### Story 4.1: Server Action - Generate Expert Packet
**Tasks:**
- [ ] Implement `generateExpertPacket()` server action
- [ ] Validate blueprint_id and domain_id
- [ ] Fetch blueprint metadata (product_name, product_description, project_stage)
- [ ] Fetch domain metadata (key_questions, stage_relevance)
- [ ] Create task with `metadata.llm_task_type = 'T4'`, `metadata.artifact_type = 'expert_packet'`, `metadata.provenance.type = 'ai_suggested'`
- [ ] Set task status to `'Pending'` (AI processing)
- [ ] Queue task for Ghost Worker processing
- [ ] Return task_id

**Acceptance Criteria:**
- ✅ Task created with correct metadata
- ✅ Task queued for AI processing
- ✅ RLS enforced
- ✅ RBAC enforced (Founder/Executive can generate)

#### Story 4.2: LLM Integration - T4 Task Contract
**Tasks:**
- [ ] Define T4 input JSON schema: `{ blueprint_id, domain_id, product_name, product_description, project_stage, key_questions, stage_relevance }`
- [ ] Define T4 output JSON schema: `{ questions: [{ question, why_it_matters, artifacts_to_request, red_flags, stages }], confidence: number }`
- [ ] Implement T4 handler in Ghost Worker
- [ ] Call LLM with T4 prompt template
- [ ] Parse LLM response to match output schema
- [ ] Validate output (check for "no generic output" bar)
- [ ] Update task with generated content
- [ ] Set task status to `'Pending_Peer_Review'` or `'Pending_Executive_Approval'` based on user role

**Acceptance Criteria:**
- ✅ Output matches schema
- ✅ Output passes "no generic output" bar (parameterized, rationale, artifacts, red flags, stage-aware)
- ✅ Confidence score calculated (0-1)
- ✅ Error handling (retry, fallback)

#### Story 4.3: UI - Generate Expert Packet Button
**Tasks:**
- [ ] Add "Generate Expert Packet" button to domain detail page
- [ ] Button disabled if domain already has approved expert packet
- [ ] On click, call `generateExpertPacket()`
- [ ] Show loading state ("Generating...")
- [ ] Show success message with link to review queue
- [ ] Handle errors (display error message)

**Acceptance Criteria:**
- ✅ Button accessible (keyboard navigation, ARIA label)
- ✅ Loading state clear
- ✅ Error handling user-friendly

#### Story 4.4: UI - Review Queue Page
**Tasks:**
- [ ] Create `/blueprints/[id]/review` page
- [ ] Fetch pending tasks for blueprint (`status IN ('Pending_Peer_Review', 'Pending_Executive_Approval')`, `metadata.artifact_type = 'expert_packet'`)
- [ ] Display task list (domain name, generated date, confidence score)
- [ ] Add "Preview" button to view expert packet content
- [ ] Add "Approve" and "Reject" buttons
- [ ] Filter by artifact type (expert_packet, rfq_pack)

**Acceptance Criteria:**
- ✅ Page loads < 2s
- ✅ Only shows tasks for user's foundry's blueprints
- ✅ RBAC enforced (Founder/Executive can approve, Apprentice can view)

#### Story 4.5: UI - Expert Packet Preview
**Tasks:**
- [ ] Create expert packet preview component
- [ ] Display questions list (formatted nicely)
- [ ] Display "Why it matters" for each question
- [ ] Display "Artifacts to request" list
- [ ] Display "Red flags" list
- [ ] Display stage awareness (which stages question applies to)
- [ ] Display confidence score
- [ ] Add "Approve" and "Reject" buttons

**Acceptance Criteria:**
- ✅ Preview renders correctly (markdown support for descriptions)
- ✅ All fields displayed
- ✅ Accessible (screen reader support)

#### Story 4.6: Server Action - Approve/Reject Expert Packet
**Tasks:**
- [ ] Implement `approveTask()` server action
- [ ] Validate task_id belongs to user's foundry's blueprint
- [ ] Update task status: `'Pending_Peer_Review'` → `'Accepted'`, `'Pending_Executive_Approval'` → `'Accepted'`
- [ ] Update `metadata.provenance.verification_status = 'approved'`
- [ ] Return updated task

**Tasks:**
- [ ] Implement `rejectTask()` server action
- [ ] Validate task_id
- [ ] Update task status to `'Rejected'`
- [ ] Update `metadata.provenance.verification_status = 'rejected'`
- [ ] Optionally allow user to add rejection reason
- [ ] Return updated task

**Acceptance Criteria:**
- ✅ Status updates correctly
- ✅ Provenance metadata updated
- ✅ RLS enforced
- ✅ RBAC enforced (Founder/Executive can approve/reject)

---

### Epic 5: Task Creation from Gaps

**Goal:** User can create tasks/objectives from identified coverage gaps, tagged with domain.

#### Story 5.1: Server Action - Create Task from Gap
**Tasks:**
- [ ] Implement `createTaskFromGap()` server action
- [ ] Validate blueprint_id and domain_id
- [ ] Validate domain has status 'gap'
- [ ] Create task with `metadata.blueprint_id`, `metadata.domain_id`
- [ ] Set task title, description from user input
- [ ] Set task status to `'Pending'`
- [ ] Return task_id

**Acceptance Criteria:**
- ✅ Task created with correct metadata
- ✅ Task linked to blueprint and domain
- ✅ RLS enforced
- ✅ RBAC enforced (Founder/Executive can create)

#### Story 5.2: Server Action - Create Objective from Gap
**Tasks:**
- [ ] Implement `createObjectiveFromGap()` server action
- [ ] Validate blueprint_id and domain_id
- [ ] Create objective with `blueprint_id` set
- [ ] Create child tasks (if provided) with `metadata.blueprint_id` and `metadata.domain_id`
- [ ] Return objective_id

**Acceptance Criteria:**
- ✅ Objective created with blueprint_id
- ✅ Child tasks linked to blueprint and domain
- ✅ RLS enforced
- ✅ RBAC enforced

#### Story 5.3: UI - Create Task Button on Gap Domain
**Tasks:**
- [ ] Add "Create Task" button to domain detail page (only shown if status = 'gap')
- [ ] On click, open task creation dialog
- [ ] Pre-fill dialog with domain context (domain name, blueprint name)
- [ ] Form fields: title, description
- [ ] Submit calls `createTaskFromGap()`
- [ ] Redirect to task detail page on success

**Acceptance Criteria:**
- ✅ Button only shown for gap domains
- ✅ Dialog pre-filled with context
- ✅ Form validation
- ✅ Error handling

#### Story 5.4: UI - Task List Filtered by Blueprint
**Tasks:**
- [ ] Create `/blueprints/[id]/tasks` page
- [ ] Fetch tasks with `metadata.blueprint_id = blueprint_id`
- [ ] Display task list (title, status, domain badge)
- [ ] Add domain badge component (shows domain name, links to domain detail)
- [ ] Filter by domain (optional)
- [ ] Link to task detail page

**Acceptance Criteria:**
- ✅ Page loads < 2s
- ✅ Only shows tasks for blueprint
- ✅ Domain badge displays correctly
- ✅ RLS enforced

#### Story 5.5: UI - Domain Badge on Task Cards
**Tasks:**
- [ ] Create `DomainBadge` component
- [ ] Display domain name
- [ ] Link to `/blueprints/[blueprint_id]/domains/[domain_id]`
- [ ] Add to task card component
- [ ] Add to objective card component (if objective has blueprint_id)

**Acceptance Criteria:**
- ✅ Badge displays correctly
- ✅ Link works
- ✅ Accessible (keyboard navigation)

---

### Epic 6: Marketplace Recommendations

**Goal:** User can see marketplace recommendations generated from coverage gaps (max 5 per blueprint).

#### Story 6.1: Server Action - Generate Recommendations
**Tasks:**
- [ ] Implement `generateMarketplaceRecommendations()` server action
- [ ] Fetch gaps from `blueprint_domain_coverage` (status = 'gap')
- [ ] For each gap, fetch `knowledge_domains.marketplace_categories`
- [ ] Match categories to marketplace providers (existing `marketplace_recommendations` table or search)
- [ ] Limit to 5 recommendations total
- [ ] Create `marketplace_recommendations` entries (if table exists) or return recommendations array
- [ ] Return recommendations with: provider_id, provider_name, domain_id, domain_name, reason, match_score

**Acceptance Criteria:**
- ✅ Only generates from gaps
- ✅ Limited to 5 recommendations
- ✅ Recommendations include reason ("Gap in battery_pack_design")
- ✅ RLS enforced
- ✅ RBAC enforced (all roles can view)

#### Story 6.2: Logic - Recommendation Matching
**Tasks:**
- [ ] Implement matching algorithm: `knowledge_domains.marketplace_categories` → marketplace provider categories
- [ ] Calculate match_score (simple: 1.0 if exact match, 0.5 if partial match)
- [ ] Sort by match_score (descending)
- [ ] Filter out providers already in `blueprint_suppliers` (optional, can be post-MVP)
- [ ] Return top 5

**Acceptance Criteria:**
- ✅ Matching algorithm works correctly
- ✅ Match scores calculated
- ✅ Sorted correctly

#### Story 6.3: UI - Recommendations Panel
**Tasks:**
- [ ] Create recommendations panel component
- [ ] Add to blueprint detail page
- [ ] Fetch recommendations via `generateMarketplaceRecommendations()`
- [ ] Display recommendation cards (provider name, domain name, reason, match score)
- [ ] Add "Find Expert" CTA button (links to `/marketplace/[provider_id]`)
- [ ] Show empty state if no gaps or no recommendations

**Acceptance Criteria:**
- ✅ Panel displays correctly
- ✅ Recommendations formatted nicely
- ✅ CTA links work
- ✅ Empty state shown when appropriate

#### Story 6.4: Gating Logic
**Tasks:**
- [ ] Implement gating: No recommendations if all domains covered
- [ ] Implement gating: No recommendations if blueprint has no gaps
- [ ] Show message: "All domains covered! No recommendations needed."

**Acceptance Criteria:**
- ✅ Gating works correctly
- ✅ User-friendly messages

---

### Epic 7: RFQ Starter Pack (MVP)

**Goal:** User can generate a basic RFQ starter pack (general template only), preview it, and export to PDF.

#### Story 7.1: Server Action - Generate RFQ Starter Pack
**Tasks:**
- [ ] Implement `generateRFQStarterPack()` server action
- [ ] Validate blueprint_id and domain_id
- [ ] Fetch blueprint metadata (product_name, product_description, project_stage)
- [ ] Fetch domain metadata (key_questions, requirements)
- [ ] Create task with `metadata.llm_task_type = 'T6'`, `metadata.artifact_type = 'rfq_pack'`, `metadata.provenance.type = 'ai_suggested'`
- [ ] Set task status to `'Pending'`
- [ ] Queue task for Ghost Worker processing
- [ ] Return task_id

**Acceptance Criteria:**
- ✅ Task created with correct metadata
- ✅ Task queued for AI processing
- ✅ RLS enforced
- ✅ RBAC enforced

#### Story 7.2: LLM Integration - T6 Task Contract
**Tasks:**
- [ ] Define T6 input JSON schema: `{ blueprint_id, domain_id, product_name, product_description, project_stage, template: 'general' }`
- [ ] Define T6 output JSON schema: `{ overview: {...}, requirements: [...], volumes: {...}, tolerances: {...}, target_cost: {...}, timeline: {...}, compliance: [...], vendor_questions: [...] }`
- [ ] Implement T6 handler in Ghost Worker
- [ ] Call LLM with T6 prompt template (general template only)
- [ ] Parse LLM response to match output schema
- [ ] Validate output (check for "no generic output" bar)
- [ ] Update task with generated content
- [ ] Set task status to `'Pending_Peer_Review'` or `'Pending_Executive_Approval'`

**Acceptance Criteria:**
- ✅ Output matches schema
- ✅ Output passes "no generic output" bar
- ✅ Error handling

#### Story 7.3: UI - Generate RFQ Pack Button
**Tasks:**
- [ ] Add "Generate RFQ Pack" button to domain detail page
- [ ] On click, call `generateRFQStarterPack()`
- [ ] Show loading state
- [ ] Show success message with link to review queue
- [ ] Handle errors

**Acceptance Criteria:**
- ✅ Button accessible
- ✅ Loading state clear
- ✅ Error handling user-friendly

#### Story 7.4: UI - RFQ Pack Preview
**Tasks:**
- [ ] Create RFQ pack preview component
- [ ] Display RFQ content sections (overview, requirements, volumes, tolerances, target cost, timeline, compliance, vendor questions)
- [ ] Format nicely (sections, lists, tables)
- [ ] Add redaction controls (8 categories: budget, volumes, timeline, design_details, market_info, regulatory_strategy, supplier_relationships, internal_decisions)
- [ ] Default: All categories redacted (opt-out)
- [ ] Toggle to include/exclude categories
- [ ] Preview updates when toggles change

**Acceptance Criteria:**
- ✅ Preview renders correctly
- ✅ Redaction controls work
- ✅ Default is opt-out (all redacted)

#### Story 7.5: Server Action - Export to PDF
**Tasks:**
- [ ] Implement `exportRFQPackToPDF()` server action
- [ ] Fetch task content
- [ ] Apply redaction settings (remove redacted categories)
- [ ] Generate PDF using library (e.g., `pdfkit` or `puppeteer`)
- [ ] Return PDF file stream
- [ ] Set Content-Type header to `application/pdf`

**Acceptance Criteria:**
- ✅ PDF generated correctly
- ✅ Redacted content removed
- ✅ PDF formatted nicely (sections, tables)

#### Story 7.6: UI - Export to PDF Button
**Tasks:**
- [ ] Add "Export to PDF" button to RFQ pack preview
- [ ] On click, call `exportRFQPackToPDF()`
- [ ] Download PDF file (filename: `RFQ-{domain_name}-{date}.pdf`)
- [ ] Show loading state during generation

**Acceptance Criteria:**
- ✅ PDF downloads correctly
- ✅ Filename includes domain name and date
- ✅ Loading state clear

---

## Thin Vertical Slices (MVP)

The MVP must deliver **end-to-end functionality** for these thin vertical slices:

### Slice 1: Create Blueprint from Template → View Domain Tree

**User Journey:**
1. User navigates to `/blueprints`
2. User clicks "Create Blueprint"
3. User selects "Robotics Hardware Product" template
4. User enters product name and description
5. User clicks "Create"
6. System creates blueprint with 12 top-level domains
7. User sees blueprint detail page with domain tree (list view)
8. User can expand/collapse domains

**Acceptance:**
- ✅ Blueprint created successfully
- ✅ Domain tree displays (12 domains)
- ✅ Expand/collapse works
- ✅ Page loads < 2s

---

### Slice 2: Coverage Audit → Mark Gaps

**User Journey:**
1. User views blueprint detail page
2. User sees domain list with coverage status badges
3. User clicks on a domain's status badge
4. User selects "Gap" from dropdown
5. System updates coverage status
6. User sees coverage metrics update (e.g., "3 Gaps")
7. User adds expertise entry: "John Doe, Team, Competent"
8. System saves expertise entry

**Acceptance:**
- ✅ Coverage status updates
- ✅ Coverage metrics recalculate
- ✅ Expertise entry saved
- ✅ UI updates optimistically

---

### Slice 3: Generate Expert Packet → Approve

**User Journey:**
1. User views domain detail page (status = 'gap')
2. User clicks "Generate Expert Packet"
3. System creates task (status = 'Pending')
4. Ghost Worker processes T4 task
5. System updates task with expert packet content (status = 'Pending_Peer_Review')
6. User navigates to review queue (`/blueprints/{id}/review`)
7. User sees pending expert packet
8. User clicks "Preview"
9. User sees questions, rationale, artifacts, red flags
10. User clicks "Approve"
11. System updates task status to 'Accepted'
12. Expert packet is now approved

**Acceptance:**
- ✅ Expert packet generated (T4 task)
- ✅ Content passes "no generic output" bar
- ✅ Review queue displays pending content
- ✅ Approval workflow works
- ✅ Provenance tracked (`ai_suggested`)

---

### Slice 4: Create Task from Gap

**User Journey:**
1. User views domain detail page (status = 'gap')
2. User clicks "Create Task"
3. Dialog opens with domain context pre-filled
4. User enters task title: "Hire battery pack design expert"
5. User enters description
6. User clicks "Create"
7. System creates task with `metadata.blueprint_id` and `metadata.domain_id`
8. User navigates to `/blueprints/{id}/tasks`
9. User sees task in list with domain badge
10. User clicks domain badge
11. User navigates to domain detail page

**Acceptance:**
- ✅ Task created with correct metadata
- ✅ Task linked to blueprint and domain
- ✅ Domain badge displays and links correctly
- ✅ Task list filtered by blueprint

---

### Slice 5: Generate Marketplace Recommendations

**User Journey:**
1. User views blueprint detail page
2. User sees recommendations panel
3. System generates recommendations from gaps (max 5)
4. User sees recommendation cards: "Expert in Battery Pack Design - Gap in battery_pack_design"
5. User clicks "Find Expert"
6. User navigates to marketplace provider detail page

**Acceptance:**
- ✅ Recommendations generated from gaps
- ✅ Limited to 5 recommendations
- ✅ Recommendations include reason
- ✅ CTA links to marketplace

---

### Slice 6: Generate RFQ Starter Pack → Export PDF

**User Journey:**
1. User views domain detail page
2. User clicks "Generate RFQ Pack"
3. System creates task (status = 'Pending')
4. Ghost Worker processes T6 task
5. System updates task with RFQ pack content (status = 'Pending_Peer_Review')
6. User navigates to review queue
7. User sees pending RFQ pack
8. User clicks "Preview"
9. User sees RFQ content (overview, requirements, volumes, etc.)
10. User sees redaction controls (all categories redacted by default)
11. User toggles "Include Budget" (un-redacts budget)
12. User clicks "Export to PDF"
13. System generates PDF (budget included, other categories redacted)
14. User downloads PDF file

**Acceptance:**
- ✅ RFQ pack generated (T6 task)
- ✅ Content passes "no generic output" bar
- ✅ Redaction controls work (opt-out default)
- ✅ PDF export works
- ✅ Redacted content removed from PDF

---

## Dependencies

### Epic Dependencies

```
Epic 1 (Foundation) → All other epics
Epic 2 (Blueprint Creation) → Epic 3, 4, 5, 6, 7
Epic 3 (Coverage Audit) → Epic 4, 5, 6
Epic 4 (Expert Packet) → Epic 7 (shares review queue UI)
Epic 5 (Task Creation) → None (can be parallel with Epic 4)
Epic 6 (Marketplace Recommendations) → Epic 3
Epic 7 (RFQ Starter Pack) → Epic 4 (shares review queue UI)
```

### Story Dependencies

**Epic 1:**
- Story 1.1 (Migrations) → Story 1.2 (RLS), Story 1.3 (Types)
- Story 1.2 (RLS) → Story 1.4 (Server Actions)
- Story 1.3 (Types) → Story 1.4 (Server Actions)

**Epic 2:**
- Story 2.1 (Server Action) → Story 2.2 (UI List), Story 2.3 (UI Dialog), Story 2.4 (UI Detail)
- Story 2.4 (UI Detail) → Story 2.5 (Domain List Component)

**Epic 3:**
- Story 3.1 (Update Coverage) → Story 3.3 (UI Status Selector), Story 3.4 (UI Metrics)
- Story 3.2 (Add Expertise) → Story 3.5 (UI Expertise List)

**Epic 4:**
- Story 4.1 (Server Action) → Story 4.3 (UI Button)
- Story 4.2 (LLM Integration) → Story 4.4 (UI Review Queue), Story 4.5 (UI Preview)
- Story 4.5 (UI Preview) → Story 4.6 (Server Action Approve/Reject)

**Epic 5:**
- Story 5.1 (Server Action) → Story 5.3 (UI Button)
- Story 5.2 (Server Action Objective) → Story 5.3 (UI Button)
- Story 5.1, 5.2 → Story 5.4 (UI Task List), Story 5.5 (UI Domain Badge)

**Epic 6:**
- Story 6.1 (Server Action) → Story 6.3 (UI Panel)
- Story 6.2 (Matching Logic) → Story 6.1 (Server Action)

**Epic 7:**
- Story 7.1 (Server Action) → Story 7.3 (UI Button)
- Story 7.2 (LLM Integration) → Story 7.4 (UI Preview)
- Story 7.4 (UI Preview) → Story 7.5 (Server Action Export), Story 7.6 (UI Export Button)

---

## Definition of Done

### Epic-Level DoD

For each epic to be considered "Done", all of the following must be true:

1. **All Stories Complete:** All stories in the epic are implemented and tested
2. **Acceptance Tests Pass:** All acceptance tests for the epic pass (see [Acceptance Tests](#acceptance-tests))
3. **RLS Verified:** All database queries enforce Row-Level Security (no cross-foundry leakage)
4. **RBAC Verified:** All server actions enforce Role-Based Access Control (Founder/Executive/Apprentice)
5. **Type Safety:** No TypeScript errors, all types match database schema
6. **Performance:** Page loads < 2s, database queries optimized (indexes added where needed)
7. **Accessibility:** Keyboard navigation, screen reader support, ARIA labels, focus management
8. **Error Handling:** User-friendly error messages, loading states, optimistic UI updates
9. **Code Review:** Code reviewed by at least one other developer
10. **Documentation:** Server actions documented (JSDoc), UI components documented (usage examples)

### Story-Level DoD

For each story to be considered "Done", all of the following must be true:

1. **Tasks Complete:** All tasks in the story are implemented
2. **Acceptance Criteria Met:** All acceptance criteria for the story pass
3. **Unit Tests:** Unit tests written and passing (if applicable)
4. **Integration Tests:** Integration tests written and passing (if applicable)
5. **No Regressions:** Existing functionality still works
6. **Code Quality:** Code follows project conventions (linting, formatting)

---

## Acceptance Tests

### Epic 1: Foundation & Infrastructure

#### Test 1.1: Database Migrations
```sql
-- Test: tasks.metadata column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name = 'metadata';
-- Expected: metadata | jsonb | '{}'::jsonb

-- Test: objectives.blueprint_id column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'objectives' AND column_name = 'blueprint_id';
-- Expected: blueprint_id | uuid

-- Test: Foreign key constraint exists
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'objectives' AND constraint_type = 'FOREIGN KEY';
-- Expected: Constraint referencing blueprints(id)

-- Test: Index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'objectives' AND indexname LIKE '%blueprint%';
-- Expected: Index on blueprint_id
```

#### Test 1.2: RLS Policies
```sql
-- Test: RLS enabled on blueprint_domain_coverage
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'blueprint_domain_coverage';
-- Expected: rowsecurity = true

-- Test: Policy exists for blueprint_domain_coverage
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'blueprint_domain_coverage';
-- Expected: Policy using get_my_foundry_id() or get_blueprint_foundry_id()

-- Test: Cross-foundry isolation (integration test)
-- Create foundry A, blueprint A, blueprint_domain_coverage A
-- Create foundry B, blueprint B, blueprint_domain_coverage B
-- As user from foundry A, query blueprint_domain_coverage
-- Expected: Only returns coverage for blueprint A, not blueprint B
```

#### Test 1.3: TypeScript Types
```typescript
// Test: TaskMetadata type exists
import { TaskMetadata } from '@/types/blueprint-tasks';
const metadata: TaskMetadata = {
  blueprint_id: 'uuid',
  domain_id: 'uuid',
  artifact_type: 'expert_packet',
  provenance: { type: 'ai_suggested' }
};
// Expected: No TypeScript errors

// Test: ArtifactType type
type ArtifactType = 'expert_packet' | 'rfq_pack' | 'decision_proposal' | 'domain_suggestion' | null;
// Expected: Type matches usage
```

#### Test 1.4: Server Action Infrastructure
```typescript
// Test: requireAuth() throws if not authenticated
// Mock: No user session
// Call: requireAuth()
// Expected: Throws error "Not authenticated"

// Test: requireFoundryAccess() throws if blueprint not in foundry
// Mock: User from foundry A, blueprint from foundry B
// Call: requireFoundryAccess(blueprint_id_B)
// Expected: Throws error "Blueprint not found or access denied"

// Test: requireRole() throws if insufficient role
// Mock: User role = 'Apprentice', required = ['Founder', 'Executive']
// Call: requireRole(['Founder', 'Executive'])
// Expected: Throws error "Insufficient permissions"
```

---

### Epic 2: Blueprint Creation

#### Test 2.1: Create Blueprint from Template
```typescript
// Test: Server action creates blueprint
const result = await instantiateBlueprintFromTemplate({
  template_id: 'robotics-template-uuid',
  product_name: 'Test Robot',
  product_description: 'Test description'
});
// Expected: Returns { blueprint_id: 'uuid' }

// Test: Blueprint has correct foundry_id
const blueprint = await getBlueprint(result.blueprint_id);
// Expected: blueprint.foundry_id === current_user.foundry_id

// Test: Domains cloned from template
const domains = await getBlueprintDomains(result.blueprint_id);
// Expected: domains.length === 12 (robotics template has 12 domains)

// Test: Coverage entries created
const coverage = await getBlueprintCoverage(result.blueprint_id);
// Expected: coverage.length === 12, all status = 'gap'
```

#### Test 2.2: UI - Blueprint List Page
```typescript
// Test: Page loads blueprints for foundry
// Mock: User from foundry A, 3 blueprints in foundry A, 2 in foundry B
// Render: <BlueprintListPage />
// Expected: Shows 3 blueprints, not 5

// Test: Empty state shown when no blueprints
// Mock: No blueprints
// Render: <BlueprintListPage />
// Expected: Shows empty state message
```

#### Test 2.3: UI - Create Blueprint Dialog
```typescript
// Test: Dialog shows active templates only
// Mock: 2 active templates, 1 deprecated template
// Render: <CreateBlueprintDialog />
// Expected: Shows 2 templates, not 3

// Test: Form validation
// Submit: Empty form
// Expected: Shows validation errors

// Test: Submit creates blueprint
// Submit: Valid form
// Expected: Calls instantiateBlueprintFromTemplate(), redirects to detail page
```

#### Test 2.4: UI - Blueprint Detail Page
```typescript
// Test: Page loads blueprint data
// Mock: Blueprint exists
// Render: <BlueprintDetailPage blueprintId="uuid" />
// Expected: Shows blueprint name, stage

// Test: RLS enforced (404 if not in foundry)
// Mock: Blueprint from foundry B, user from foundry A
// Render: <BlueprintDetailPage blueprintId="foundry-b-blueprint" />
// Expected: 404 error or redirect
```

#### Test 2.5: UI - Domain List Component
```typescript
// Test: Component renders hierarchical domains
// Mock: 3-level domain tree
// Render: <DomainTreeList domains={domains} />
// Expected: Shows parent → child → grandchild structure

// Test: Expand/collapse works
// Click: Expand icon on parent domain
// Expected: Children visible
// Click: Collapse icon
// Expected: Children hidden
```

---

### Epic 3: Coverage Audit

#### Test 3.1: Update Coverage Status
```typescript
// Test: Status updates correctly
const result = await updateBlueprintDomainCoverage({
  blueprint_id: 'uuid',
  domain_id: 'uuid',
  status: 'covered',
  notes: 'Test notes'
});
// Expected: Returns updated coverage entry with status = 'covered'

// Test: RLS enforced
// Mock: Blueprint from foundry B, user from foundry A
// Call: updateBlueprintDomainCoverage({ blueprint_id: 'foundry-b-blueprint', ... })
// Expected: Throws error "Blueprint not found or access denied"

// Test: RBAC enforced
// Mock: User role = 'Apprentice'
// Call: updateBlueprintDomainCoverage(...)
// Expected: Throws error "Insufficient permissions"
```

#### Test 3.2: Add Expertise
```typescript
// Test: Expertise entry created
const result = await addBlueprintExpertise({
  blueprint_id: 'uuid',
  domain_id: 'uuid',
  person_type: 'team',
  expertise_level: 'competent',
  person_name: 'John Doe'
});
// Expected: Returns expertise entry

// Test: Enum validation
// Call: addBlueprintExpertise({ person_type: 'invalid', ... })
// Expected: Throws validation error
```

#### Test 3.3: UI - Coverage Status Selector
```typescript
// Test: Status updates optimistically
// Mock: Domain status = 'gap'
// Click: Status badge → Select 'covered'
// Expected: UI updates immediately (status badge shows 'covered')
// Expected: API call made in background
// Expected: On success, status persists
// Expected: On error, status reverts to 'gap'
```

#### Test 3.4: UI - Coverage Metrics Dashboard
```typescript
// Test: Metrics calculate correctly
// Mock: 3 covered, 2 partial, 7 gaps, 0 not_needed
// Render: <CoverageMetricsDashboard blueprintId="uuid" />
// Expected: Shows "3 Covered (25%)", "2 Partial (17%)", "7 Gaps (58%)"

// Test: Metrics update when status changes
// Mock: Domain status changes from 'gap' to 'covered'
// Expected: Metrics recalculate (gaps: 7 → 6, covered: 3 → 4)
```

---

### Epic 4: Expert Packet Generation

#### Test 4.1: Generate Expert Packet
```typescript
// Test: Task created with correct metadata
const result = await generateExpertPacket({
  blueprint_id: 'uuid',
  domain_id: 'uuid'
});
// Expected: Returns { task_id: 'uuid' }

// Test: Task metadata correct
const task = await getTask(result.task_id);
// Expected: task.metadata.llm_task_type === 'T4'
// Expected: task.metadata.artifact_type === 'expert_packet'
// Expected: task.metadata.provenance.type === 'ai_suggested'
// Expected: task.status === 'Pending'
```

#### Test 4.2: LLM Integration - T4 Task Contract
```typescript
// Test: T4 handler processes task
// Mock: Task with llm_task_type = 'T4'
// Process: Ghost Worker processes task
// Expected: Task updated with expert packet content
// Expected: Task status = 'Pending_Peer_Review' or 'Pending_Executive_Approval'

// Test: Output matches schema
const content = task.metadata.content;
// Expected: content.questions is array
// Expected: Each question has: question, why_it_matters, artifacts_to_request, red_flags, stages

// Test: "No generic output" bar
// Expected: Questions are parameterized (mention product name, stage)
// Expected: Rationale provided for each question
// Expected: Artifacts are specific (not "documentation" but "battery pack datasheet")
// Expected: Red flags are specific (not "issues" but "voltage sag under load")
```

#### Test 4.3: UI - Generate Expert Packet Button
```typescript
// Test: Button disabled if domain already has approved packet
// Mock: Domain has approved expert packet
// Render: <DomainDetailPage domainId="uuid" />
// Expected: "Generate Expert Packet" button disabled

// Test: Button triggers generation
// Click: "Generate Expert Packet"
// Expected: Shows loading state
// Expected: Calls generateExpertPacket()
// Expected: Shows success message with link to review queue
```

#### Test 4.4: UI - Review Queue Page
```typescript
// Test: Page shows pending tasks
// Mock: 2 pending expert packets, 1 pending RFQ pack
// Render: <ReviewQueuePage blueprintId="uuid" />
// Expected: Shows 2 expert packets, 1 RFQ pack

// Test: Filter by artifact type
// Click: Filter "Expert Packets"
// Expected: Shows only expert packets

// Test: RLS enforced
// Mock: Task from foundry B, user from foundry A
// Expected: Task not shown
```

#### Test 4.5: UI - Expert Packet Preview
```typescript
// Test: Preview renders correctly
// Mock: Expert packet content
// Render: <ExpertPacketPreview taskId="uuid" />
// Expected: Shows questions list
// Expected: Shows "Why it matters" for each question
// Expected: Shows artifacts list
// Expected: Shows red flags list
// Expected: Shows confidence score
```

#### Test 4.6: Approve/Reject Expert Packet
```typescript
// Test: Approve updates status
const result = await approveTask({ task_id: 'uuid' });
// Expected: Returns task with status = 'Accepted'
// Expected: task.metadata.provenance.verification_status = 'approved'

// Test: Reject updates status
const result = await rejectTask({ task_id: 'uuid', reason: 'Not relevant' });
// Expected: Returns task with status = 'Rejected'
// Expected: task.metadata.provenance.verification_status = 'rejected'

// Test: RBAC enforced
// Mock: User role = 'Apprentice'
// Call: approveTask(...)
// Expected: Throws error "Insufficient permissions"
```

---

### Epic 5: Task Creation from Gaps

#### Test 5.1: Create Task from Gap
```typescript
// Test: Task created with metadata
const result = await createTaskFromGap({
  blueprint_id: 'uuid',
  domain_id: 'uuid',
  title: 'Test Task',
  description: 'Test description'
});
// Expected: Returns { task_id: 'uuid' }

// Test: Task metadata correct
const task = await getTask(result.task_id);
// Expected: task.metadata.blueprint_id === 'uuid'
// Expected: task.metadata.domain_id === 'uuid'

// Test: Domain must be gap
// Mock: Domain status = 'covered'
// Call: createTaskFromGap({ domain_id: 'covered-domain', ... })
// Expected: Throws validation error "Domain is not a gap"
```

#### Test 5.2: Create Objective from Gap
```typescript
// Test: Objective created with blueprint_id
const result = await createObjectiveFromGap({
  blueprint_id: 'uuid',
  domain_id: 'uuid',
  title: 'Test Objective',
  tasks: [...]
});
// Expected: Returns { objective_id: 'uuid' }

// Test: Objective blueprint_id correct
const objective = await getObjective(result.objective_id);
// Expected: objective.blueprint_id === 'uuid'
```

#### Test 5.3: UI - Create Task Button
```typescript
// Test: Button only shown for gap domains
// Mock: Domain status = 'gap'
// Render: <DomainDetailPage domainId="uuid" />
// Expected: "Create Task" button visible

// Mock: Domain status = 'covered'
// Expected: "Create Task" button not visible
```

#### Test 5.4: UI - Task List Filtered by Blueprint
```typescript
// Test: Page shows tasks for blueprint
// Mock: 5 tasks with blueprint_id = 'uuid', 3 tasks with blueprint_id = 'other'
// Render: <BlueprintTasksPage blueprintId="uuid" />
// Expected: Shows 5 tasks, not 8

// Test: Domain badge displays
// Expected: Each task card shows domain badge with domain name
```

---

### Epic 6: Marketplace Recommendations

#### Test 6.1: Generate Recommendations
```typescript
// Test: Recommendations generated from gaps
const result = await generateMarketplaceRecommendations({
  blueprint_id: 'uuid'
});
// Expected: Returns array of recommendations
// Expected: Each recommendation has: provider_id, provider_name, domain_id, domain_name, reason, match_score

// Test: Limited to 5 recommendations
// Mock: 10 gaps match providers
// Expected: Returns max 5 recommendations

// Test: No recommendations if all covered
// Mock: All domains covered
// Expected: Returns empty array
```

#### Test 6.2: Recommendation Matching
```typescript
// Test: Matching algorithm works
// Mock: Domain has marketplace_categories = ['battery_pack_design']
// Mock: Provider has categories = ['battery_pack_design', 'pcb_design']
// Expected: Match score = 1.0 (exact match)

// Test: Partial match
// Mock: Domain has categories = ['battery_pack']
// Mock: Provider has categories = ['battery_pack_design']
// Expected: Match score = 0.5 (partial match)
```

#### Test 6.3: UI - Recommendations Panel
```typescript
// Test: Panel shows recommendations
// Mock: 3 recommendations
// Render: <RecommendationsPanel blueprintId="uuid" />
// Expected: Shows 3 recommendation cards

// Test: Empty state
// Mock: No recommendations
// Expected: Shows "All domains covered! No recommendations needed."
```

---

### Epic 7: RFQ Starter Pack

#### Test 7.1: Generate RFQ Starter Pack
```typescript
// Test: Task created with correct metadata
const result = await generateRFQStarterPack({
  blueprint_id: 'uuid',
  domain_id: 'uuid'
});
// Expected: Returns { task_id: 'uuid' }

// Test: Task metadata correct
const task = await getTask(result.task_id);
// Expected: task.metadata.llm_task_type === 'T6'
// Expected: task.metadata.artifact_type === 'rfq_pack'
```

#### Test 7.2: LLM Integration - T6 Task Contract
```typescript
// Test: T6 handler processes task
// Mock: Task with llm_task_type = 'T6'
// Process: Ghost Worker processes task
// Expected: Task updated with RFQ pack content
// Expected: Content matches schema: { overview, requirements, volumes, tolerances, target_cost, timeline, compliance, vendor_questions }
```

#### Test 7.3: UI - Generate RFQ Pack Button
```typescript
// Test: Button triggers generation
// Click: "Generate RFQ Pack"
// Expected: Shows loading state
// Expected: Calls generateRFQStarterPack()
```

#### Test 7.4: UI - RFQ Pack Preview
```typescript
// Test: Preview renders correctly
// Mock: RFQ pack content
// Render: <RFQPackPreview taskId="uuid" />
// Expected: Shows all sections (overview, requirements, volumes, etc.)

// Test: Redaction controls default to opt-out
// Expected: All 8 categories redacted by default

// Test: Toggle redaction
// Click: Toggle "Include Budget"
// Expected: Budget section visible in preview
```

#### Test 7.5: Export to PDF
```typescript
// Test: PDF generated
const pdf = await exportRFQPackToPDF({
  task_id: 'uuid',
  redaction_settings: { budget: false, volumes: true, ... }
});
// Expected: Returns PDF file stream

// Test: Redacted content removed
// Expected: PDF does not contain redacted sections
```

---

## Enum Consistency Check

### Verification Against INDEX.md

All enums referenced in the specification documents have been verified against `INDEX.md`:

#### ✅ Existing Enums (No Changes Needed)

1. **project_stage** (`blueprints.project_stage`)
   - Values: `'concept' | 'prototype' | 'evt' | 'dvt' | 'production' | 'launched'`
   - Status: ✅ Consistent across all docs

2. **coverage_status** (`blueprint_domain_coverage.status`)
   - Values: `'covered' | 'partial' | 'gap' | 'not_needed'`
   - Status: ✅ Consistent across all docs

3. **person_type** (`blueprint_expertise.person_type`)
   - Values: `'team' | 'advisor' | 'marketplace' | 'external' | 'ai_agent'`
   - Status: ✅ Consistent across all docs

4. **expertise_level** (`blueprint_expertise.expertise_level`)
   - Values: `'expert' | 'competent' | 'learning'`
   - Status: ✅ Consistent across all docs

5. **verification_status** (`blueprint_expertise.verification_status`)
   - Values: `'verified' | 'claimed' | 'inferred'`
   - Status: ✅ Consistent across all docs

6. **criticality** (`knowledge_domains.criticality`)
   - Values: `'critical' | 'important' | 'nice-to-have'`
   - Status: ✅ Consistent across all docs

7. **task_status** (`tasks.status`)
   - Values: `'Pending' | 'Accepted' | 'Rejected' | 'Amended' | 'Amended_Pending_Approval' | 'Pending_Peer_Review' | 'Pending_Executive_Approval' | 'Completed'`
   - Status: ✅ Consistent across all docs

8. **member_role** (`profiles.role`)
   - Values: `'Founder' | 'Executive' | 'Apprentice' | 'AI_Agent'`
   - Status: ✅ Consistent across all docs

#### ✅ TBD Enums (Now Defined)

All TBD enums listed in `INDEX.md` have been defined in their respective specification documents:

1. **AI Provenance Type** (`13-ai-confidence-verification.md`)
   - Values: `'template_derived' | 'user_entered' | 'ai_suggested'`
   - Status: ✅ Defined, consistent

2. **AI Verification Status** (`13-ai-confidence-verification.md`)
   - Values: `'draft' | 'pending_review' | 'approved' | 'rejected'`
   - Status: ✅ Defined, consistent

3. **Artifact Type** (`13-ai-confidence-verification.md`)
   - Values: `'expert_packet' | 'rfq_pack' | 'decision_proposal' | 'domain_suggestion'`
   - Status: ✅ Defined, consistent

4. **Template Lifecycle** (`15-template-governance.md`)
   - Values: `'draft' | 'active' | 'deprecated' | 'archived'`
   - Status: ✅ Defined, consistent

5. **Risk Category** (`11-risk-heatmap.md`)
   - Values: `'technical_feasibility' | 'supply_chain' | 'regulatory' | 'safety' | 'schedule' | 'cost' | 'quality' | 'integration'`
   - Status: ✅ Defined, consistent

6. **Risk Severity** (`11-risk-heatmap.md`)
   - Values: `0 | 1 | 2 | 3 | 4 | 5` (0=None, 1=Minimal, 2=Low, 3=Moderate, 4=High, 5=Severe)
   - Status: ✅ Defined, consistent

7. **Tradeoff Dimension** (`14-comparative-paths.md`)
   - Values: `'cost' | 'lead_time' | 'complexity' | 'risk' | 'performance' | 'compliance' | 'maintainability'`
   - Status: ✅ Defined, consistent

8. **OptionSet Status** (`14-comparative-paths.md`)
   - Values: `'open' | 'decided' | 'deferred' | 'invalidated'`
   - Status: ✅ Defined, consistent

9. **Confidence Level** (`14-comparative-paths.md`)
   - Values: `'high' | 'medium' | 'low' | 'unknown'`
   - Status: ✅ Defined, consistent

10. **Decision Type** (`10-decisions-assumptions.md`)
    - Values: `'decision' | 'assumption' | 'constraint'`
    - Status: ✅ Defined, consistent

11. **Decision Status** (`10-decisions-assumptions.md`)
    - Values: `'proposed' | 'approved' | 'superseded'`
    - Status: ✅ Defined, consistent

12. **Domain Type (RFQ Templates)** (`12-rfq-starter-pack.md`)
    - Values: `'general' | 'pcb_electronics' | 'battery_pack' | 'mechanical_enclosure' | 'electromechanical' | 'software_firmware' | 'packaging' | 'testing_validation'`
    - Status: ✅ Defined, consistent

13. **Sensitive Data Category** (`12-rfq-starter-pack.md`)
    - Values: `'budget' | 'volumes' | 'timeline' | 'design_details' | 'market_info' | 'regulatory_strategy' | 'supplier_relationships' | 'internal_decisions'`
    - Status: ✅ Defined, consistent

#### ✅ Conventions (Not Database Enums)

1. **stage_relevance** (`knowledge_domains.metadata.stage_relevance[stage].relevance`)
   - Values: `'informational' | 'active' | 'critical' | 'sustaining' | 'not_applicable'`
   - Status: ✅ Consistent (JSONB convention, not database enum)

2. **blocker_severity** (`blueprint_domain_coverage.blockers`)
   - Values: `'low' | 'medium' | 'high' | 'critical'`
   - Status: ✅ Consistent (text convention, not database enum)

3. **LLM Task Types** (`tasks.metadata.llm_task_type`)
   - Values: `'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7'`
   - Status: ✅ Consistent (convention, not database enum)

4. **Question Type** (`knowledge_domains.key_questions[].question_type`)
   - Values: `'feasibility' | 'design' | 'validation' | 'compliance' | 'process' | 'cost'`
   - Status: ✅ Consistent (convention, not database enum)

5. **Product Category** (`blueprint_templates.product_category`)
   - Values: `'consumer_electronics' | 'industrial_equipment' | 'robotics_automation' | 'medical_devices' | 'automotive' | 'aerospace_defense' | 'wearables' | 'iot_sensors' | 'energy_cleantech' | 'telecommunications' | 'saas_platform' | 'custom'`
   - Status: ✅ Consistent (convention, not database enum)

### ✅ No Mismatches Found

All enums referenced across the specification documents are consistent with `INDEX.md`. No mismatches or contradictions were identified.

---

## Changes Made

### Created Files

1. **`/docs/blueprint/08-backlog.md`**
   - Created comprehensive execution backlog
   - Includes 7 milestones with demo scripts
   - Includes 7 epics broken down into 35+ stories and 100+ tasks
   - Includes thin vertical slices for MVP
   - Includes dependencies graph
   - Includes Definition of Done for epics and stories
   - Includes acceptance tests for all epics
   - Includes enum consistency check (no mismatches found)

### Updated Files

2. **`/docs/blueprint/INDEX.md`**
   - Updated status: `08-backlog.md` from `pending` → `complete`
   - Updated last updated date: `2026-02-01`
   - Confirmed all enums are consistent (no changes needed)

3. **`/docs/blueprint/ORCHESTRATION.md`**
   - Updated Step 8 status: `pending` → `complete`
   - Updated completion date: `2026-02-01`
   - Updated Wave 6 status: Step 7 complete, Step 8 complete
   - Updated completion checklist: Wave 6 complete

---

## Next Steps

1. **Begin Implementation:** Start with Epic 1 (Foundation & Infrastructure)
2. **Set Up CI/CD:** Add integration tests for RLS policies
3. **Create Project Board:** Add epics, stories, and tasks to project management tool
4. **Assign Owners:** Assign epics to development teams
5. **Track Progress:** Update backlog as stories are completed

---

**Backlog Status:** ✅ Complete and ready for execution
