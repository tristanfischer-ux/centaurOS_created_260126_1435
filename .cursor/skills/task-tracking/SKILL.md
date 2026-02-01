---
name: task-tracking
description: Track complex tasks with todo.md for visibility and progress tracking. Use when starting multi-step work, complex features, or when the user asks to track progress, create a plan, or wants visibility into what's being done.
---

# Task Tracking

This skill provides a structured approach to tracking complex tasks using `tasks/todo.md`.

## When to Use This Skill

**Use for:**
- Multi-step implementations (3+ steps)
- Features that span multiple files
- Work that may be interrupted
- When the user wants visibility into progress

**Skip for:**
- Simple, single-file changes
- Quick fixes
- Questions/exploration

## The Task Tracking Process

```
Task Tracking Workflow:
- [ ] 1. Write plan to tasks/todo.md
- [ ] 2. Check in before starting
- [ ] 3. Mark items complete as you go
- [ ] 4. Explain changes at each step
- [ ] 5. Add review section when done
```

## Step 1: Write the Plan

Create or update `tasks/todo.md` with:

```markdown
# Current Task: [Task Name]

**Started:** [Date]
**Goal:** [One sentence description]

## Checklist

- [ ] Step 1: [Specific action]
- [ ] Step 2: [Specific action]
- [ ] Step 3: [Specific action]

## Notes

[Any context, constraints, or decisions]
```

**Guidelines for good checklist items:**
- Each item should be completable in one focused effort
- Items should be specific, not vague
- Order should reflect dependencies
- Include verification steps

**Good items:**
- [ ] Add `status` column to `tasks` table
- [ ] Create migration for new column
- [ ] Update TaskCard component to show status
- [ ] Test status changes in UI

**Bad items:**
- [ ] Do the database stuff
- [ ] Fix everything
- [ ] Make it work

## Step 2: Check In Before Starting

Before beginning implementation:

1. Read through the plan
2. Verify it makes sense
3. Identify any blockers
4. Confirm approach with user if complex

This catches misunderstandings early.

## Step 3: Mark Progress

As you complete each item:

```markdown
- [x] Step 1: Add status column ✓
- [x] Step 2: Create migration ✓
- [ ] Step 3: Update TaskCard  ← IN PROGRESS
- [ ] Step 4: Test in UI
```

**Why this matters:**
- Creates visible progress
- Allows interruption and resumption
- Helps user follow along
- Provides natural checkpoints

## Step 4: Explain Changes

At each significant step, briefly explain:
- What was changed
- Why it was done that way
- Any decisions made

Keep explanations high-level - the code speaks for itself.

## Step 5: Add Review Section

When complete, add a review section:

```markdown
## Review

**Completed:** [Date]
**Summary:** [What was accomplished]

**Files changed:**
- `src/components/TaskCard.tsx` - Added status display
- `supabase/migrations/xxx.sql` - Added status column

**Testing done:**
- [x] Verified migration runs
- [x] Tested status display in UI
- [x] Checked edge cases

**Follow-up items:**
- Consider adding status filtering
- May need status history tracking
```

## Template: todo.md

```markdown
# Current Task: [Name]

**Started:** YYYY-MM-DD
**Goal:** [One sentence]

## Checklist

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

## Notes

[Context and decisions]

---

## Review

**Completed:** YYYY-MM-DD
**Summary:** 

**Files changed:**
- 

**Testing done:**
- [ ] 

**Follow-up items:**
- 

---

# Previous Tasks

## [Previous Task Name] - [Date]
[Brief summary of what was done]
```

## Handling Interruptions

If work is interrupted:

1. Update todo.md with current state
2. Add note about where you stopped
3. List any context needed to resume

```markdown
## Status: PAUSED

**Paused at:** Step 3 - Updating TaskCard
**Context:** Need to decide between inline status or badge component
**To resume:** Check with user on preferred approach
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| Starting complex task | Create todo.md with checklist |
| Completing a step | Mark [x] and briefly note what was done |
| Making a decision | Add to Notes section |
| Getting interrupted | Add PAUSED status with context |
| Finishing task | Add Review section |
| Starting new session | Check todo.md for in-progress work |

## Integration with Other Skills

- **After completing task:** Consider updating `tasks/lessons.md` with insights
- **If task reveals bugs:** Use [bug-fix-workflow](../bug-fix-workflow/SKILL.md)
- **For deployment tasks:** Use [vercel-deploy](../vercel-deploy/SKILL.md)
- **For database changes:** Use [supabase-migration](../supabase-migration/SKILL.md)

## Related Skills

- [self-improvement-loop](../self-improvement-loop/SKILL.md) - Capture lessons learned
- [agent-handover](../agent-handover/SKILL.md) - For longer handovers between sessions
- [feature-implementation-guide](../feature-implementation-guide/SKILL.md) - Patterns for feature work
