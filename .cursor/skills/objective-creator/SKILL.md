---
name: objective-creator
description: Transform raw information (ideas, goals, projects) into structured CentaurOS objectives with detailed tasks, start/due dates, and add them to the authenticated user's account. Use when the user wants to create an objective, add a goal, plan a project, turn an idea into tasks, or mentions objective, goal, project plan, or task breakdown.
---

# Objective Creator

Transform any information into a structured CentaurOS objective with actionable tasks, and add it directly to the authenticated user's account.

## When to Use

- User shares an idea, goal, or project they want to accomplish
- User asks to "add this as an objective" or "turn this into tasks"
- User provides business requirements, initiatives, or plans
- User mentions creating goals, OKRs, or project milestones

## Workflow

### Phase 1: Understand the Input

1. Identify the core **objective** (the overarching goal)
2. Break down into **discrete, actionable tasks** (3-8 tasks typically)
3. Identify **dependencies** between tasks (which must complete before others)
4. Estimate **effort/duration** for each task

### Phase 2: Structure the Objective

**Objective fields:**
- `title`: Clear, concise (max 200 chars) - what will be achieved
- `description`: Context, success criteria, background (max 10,000 chars)

**Task fields (for each task):**
- `title`: Specific action (max 500 chars) - verb-first recommended
- `description`: Details, acceptance criteria, context
- `start_date`: When work should begin (ISO 8601)
- `end_date`: Deadline (ISO 8601)
- `risk_level`: `Low`, `Medium`, or `High`
- `assignee`: Default to founder (user) unless specified

### Phase 3: Calculate Dates

Use this logic for date assignment:

```
Today = start reference point
Default task duration = 3-5 days for simple tasks, 7-14 days for complex

1. Tasks without dependencies → Start today or next business day
2. Dependent tasks → Start day after predecessor's end_date
3. Parallel tasks → Can share same start_date
4. Add 1-2 day buffer between task groups
```

**Example timeline:**
```
Task 1: Research (no deps)    → Start: Today,     End: Today + 3 days
Task 2: Design (no deps)      → Start: Today,     End: Today + 5 days  
Task 3: Build (deps: 1,2)     → Start: Day 6,     End: Day 13
Task 4: Test (deps: 3)        → Start: Day 14,    End: Day 17
Task 5: Deploy (deps: 4)      → Start: Day 18,    End: Day 19
```

### Phase 4: Present to User for Confirmation

Before creating, show the user:

```markdown
## Objective: [Title]
[Description]

### Tasks:

| # | Task | Duration | Start | Due | Risk |
|---|------|----------|-------|-----|------|
| 1 | [Task 1 title] | X days | YYYY-MM-DD | YYYY-MM-DD | Low |
| 2 | [Task 2 title] | X days | YYYY-MM-DD | YYYY-MM-DD | Medium |
...

**Total timeline:** X days (from [start] to [end])

Shall I create this objective with these tasks?
```

### Phase 5: Create in CentaurOS

Once user confirms, use the `createObjectiveFromInput` server action:

```typescript
import { createObjectiveFromInput, calculateTaskDates } from '@/actions/objective-from-input'

// Calculate dates based on today and task durations
const today = new Date()
const taskDates = calculateTaskDates(today, [
  { index: 0, durationDays: 3 },                    // Task 1: 3 days, no deps
  { index: 1, durationDays: 5 },                    // Task 2: 5 days, no deps
  { index: 2, durationDays: 7, dependsOn: [0, 1] }, // Task 3: 7 days, after 1 & 2
  { index: 3, durationDays: 4, dependsOn: [2] },    // Task 4: 4 days, after 3
])

// Create the objective with tasks
const result = await createObjectiveFromInput({
  title: "Launch New Feature",
  description: "Implement and deploy the automated invoice system",
  tasks: [
    {
      title: "Research requirements",
      description: "Document technical requirements and constraints",
      start_date: taskDates[0].startDate,
      end_date: taskDates[0].endDate,
      risk_level: "Low"
    },
    {
      title: "Design architecture",
      description: "Create system design and data model",
      start_date: taskDates[1].startDate,
      end_date: taskDates[1].endDate,
      risk_level: "Medium"
    },
    // ... more tasks
  ]
})

if (result.error) {
  console.error(result.error)
} else {
  console.log(`Created objective ${result.objectiveId} with ${result.taskCount} tasks`)
}
```

**Server action location:** `src/actions/objective-from-input.ts`

**Key functions:**
- `createObjectiveFromInput(input)` - Creates objective + tasks in one transaction
- `calculateTaskDates(startDate, taskDurations)` - Helper for date calculation with dependencies

## Risk Level Guidelines

| Risk Level | Criteria | Approval Flow |
|------------|----------|---------------|
| **Low** | Routine, reversible, internal-only | Auto-completes |
| **Medium** | Moderate impact, needs review | Peer review required |
| **High** | Client-facing, irreversible, high stakes | Executive approval required |

## Output Format

When presenting the objective plan:

```markdown
## 🎯 Objective: [Clear, action-oriented title]

**Description:**
[2-3 sentences explaining the goal, why it matters, and success criteria]

---

### 📋 Tasks

#### 1. [Task Title]
- **Description:** [What needs to be done, acceptance criteria]
- **Timeline:** [Start Date] → [End Date] ([X] days)
- **Risk:** [Low/Medium/High]
- **Dependencies:** [None / Task #X]

#### 2. [Task Title]
...

---

### 📅 Timeline Summary
- **Start:** [First task start date]
- **End:** [Last task end date]  
- **Total Duration:** [X] days
- **Total Tasks:** [N]

---

Ready to create this objective in CentaurOS?
```

## Example Transformation

**User Input:**
> "I want to launch a new feature for automated invoice generation"

**Structured Output:**

## 🎯 Objective: Launch Automated Invoice Generation Feature

**Description:**
Implement and deploy an automated invoice generation system that creates and sends invoices based on completed tasks and retainer agreements. Success criteria: invoices auto-generate within 24h of task completion with 99% accuracy.

---

### 📋 Tasks

#### 1. Define Invoice Requirements & Data Model
- **Description:** Document required invoice fields, calculate formulas, and design database schema for invoice storage
- **Timeline:** 2026-02-01 → 2026-02-03 (3 days)
- **Risk:** Low
- **Dependencies:** None

#### 2. Build Invoice Generation Logic
- **Description:** Create server action to generate invoice from task/retainer data, including line items and totals
- **Timeline:** 2026-02-04 → 2026-02-08 (5 days)
- **Risk:** Medium
- **Dependencies:** Task 1

#### 3. Design Invoice PDF Template
- **Description:** Create professional PDF template using React-PDF with company branding and required fields
- **Timeline:** 2026-02-04 → 2026-02-06 (3 days)
- **Risk:** Low
- **Dependencies:** Task 1

#### 4. Implement Email Delivery
- **Description:** Set up automated email sending with invoice PDF attachment using existing email infrastructure
- **Timeline:** 2026-02-09 → 2026-02-11 (3 days)
- **Risk:** Medium
- **Dependencies:** Tasks 2, 3

#### 5. Add Invoice Dashboard UI
- **Description:** Create UI for viewing, filtering, and manually triggering invoices in the platform
- **Timeline:** 2026-02-09 → 2026-02-13 (5 days)
- **Risk:** Low
- **Dependencies:** Task 2

#### 6. Testing & QA
- **Description:** End-to-end testing of invoice generation, PDF accuracy, and email delivery
- **Timeline:** 2026-02-14 → 2026-02-17 (4 days)
- **Risk:** High
- **Dependencies:** Tasks 4, 5

#### 7. Deploy to Production
- **Description:** Deploy feature with feature flag, monitor for errors, enable for all users
- **Timeline:** 2026-02-18 → 2026-02-19 (2 days)
- **Risk:** High
- **Dependencies:** Task 6

---

### 📅 Timeline Summary
- **Start:** 2026-02-01
- **End:** 2026-02-19
- **Total Duration:** 19 days
- **Total Tasks:** 7

## User Context

This skill uses the authenticated user's context from the current session.

| Field | Source |
|-------|--------|
| **User** | Authenticated session user |
| **Email** | `user.email` from Supabase auth |
| **Role** | `user.user_metadata.role` from profile |
| **Organization** | Foundry lookup via `user.user_metadata.foundry_id` |

All objectives and tasks created through this skill are:
- Owned by the authenticated user (creator_id = current user's profile ID)
- Assigned to the user by default (unless another team member is specified)
- Under the user's foundry (foundry_id from authenticated session)

When the user says "add this as an objective" or "turn this into tasks", create it directly under their account using the authenticated session context.

## Quick Reference: CentaurOS Schema

**Objectives table:**
- `id`, `title`, `description`, `status`, `progress`, `creator_id`, `foundry_id`, `created_at`, `updated_at`

**Tasks table:**
- `id`, `task_number`, `title`, `description`, `status`, `creator_id`, `assignee_id`, `objective_id`, `foundry_id`
- `start_date`, `end_date`, `risk_level`, `progress`, `created_at`, `updated_at`

**Task statuses:** `Pending`, `Accepted`, `Rejected`, `Amended`, `Amended_Pending_Approval`, `Pending_Peer_Review`, `Pending_Executive_Approval`, `Completed`

## Additional Resources

- For detailed examples of different input types, see [references/examples.md](references/examples.md)

---

## When to Use This Skill

- User shares an idea, goal, or project they want to track in CentaurOS
- User asks to "add this as an objective" or "turn this into tasks"
- User provides business requirements, initiatives, or plans needing structure
- User mentions creating goals, OKRs, milestones, or project plans
- Converting meeting notes or brainstorms into actionable task lists

---

## When NOT to Use

| Instead Use | When |
|-------------|------|
| `status-workflow` | Managing status transitions on existing tasks |
| `feature-implementation-guide` | Building the feature itself (not planning) |
| Direct task creation | Single small task, not a full objective |
| Todo list | Personal quick notes, not formal objectives |
| `strategic-assessment` | Evaluating strategy before creating objectives |

---

## Quick Reference

| Item | Value/Pattern |
|------|---------------|
| **Objective Title Limit** | 200 characters max |
| **Description Limit** | 10,000 characters max |
| **Task Title Limit** | 500 characters max |
| **Typical Task Count** | 3-8 tasks per objective |
| **Default Task Duration** | 3-5 days (simple), 7-14 days (complex) |
| **Risk Levels** | `Low`, `Medium`, `High` |
| **Date Format** | ISO 8601 (YYYY-MM-DD) |
| **Server Action** | `createObjectiveFromInput` in `src/actions/objective-from-input.ts` |
| **Helper Function** | `calculateTaskDates` for dependency-aware scheduling |

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Objective not created | Missing auth session | Ensure user is logged in, check `getUser()` |
| Tasks have wrong dates | Dependency miscalculation | Review `dependsOn` array indices |
| "Unauthorized" error | RLS policy blocking | Verify foundry_id matches user's foundry |
| Server action fails | Invalid field values | Check title/description length limits |
| Assignee not found | Invalid profile ID | Validate assignee exists in same foundry |
| Dates in past | Start date before today | Use `new Date()` as minimum start |

---

## Related Skills

- **`feature-implementation-guide`** - After creating objective, use this to implement features
- **`status-workflow`** - Understand task status transitions for proper objective planning
