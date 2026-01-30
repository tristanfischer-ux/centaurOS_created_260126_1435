---
name: agent-handover
description: Create comprehensive handover documents when approaching context window limits. Use when ending a session, handing off to another agent, context is getting long, or when the user mentions handover, handoff, context limit, continue later, or pass to next agent.
---

# Agent Handover

Create a handover document when approaching context limits or ending a task session. This ensures continuity for the next agent.

## When to Create a Handover

- User explicitly requests handover
- Context window is getting long (you've made many tool calls)
- Task is partially complete and needs continuation
- Switching to a different agent or model

## Handover Document Template

Create/update `AGENT_HANDOVER.md` in the project root:

```markdown
# Agent Handover Document
**Date:** [Current date]
**Task:** [Brief description of what you were working on]
**Status:** [Complete | Partially complete | In progress | Blocked]

---

## Context

[2-3 sentences explaining what you were doing and why]

---

## COMPLETED ✅

### [Category 1]
- What was done
- Files modified: `path/to/file.ts`

### [Category 2]
- What was done
- Files modified: `path/to/file.ts`

---

## REMAINING TASKS 🔧

### Priority 1: [Task Name]
**Problem:** [What needs to be fixed/done]
**Files:** [Specific files to modify]
**Approach:** [How to do it]

### Priority 2: [Task Name]
...

---

## USEFUL COMMANDS

```bash
# Commands the next agent will need
npx tsc --noEmit
npm run lint
```

---

## QUICK START FOR NEXT AGENT

1. Read this document
2. [Specific first action]
3. [Next action]
```

## What to Include

### Always Include
- **Date** - When handover was created
- **Task summary** - What you were working on
- **Status** - Current state (complete, partial, blocked)
- **Completed work** - With specific file paths
- **Remaining work** - Prioritized with clear instructions
- **Quick start** - First steps for next agent

### Include When Relevant
- Useful commands
- File locations and project structure notes
- Links to related skills or rules
- Blockers or dependencies
- Test commands or verification steps

### Avoid
- Full code dumps (reference files instead)
- Conversation history (summarize key decisions)
- Redundant explanations (be concise)

## Creating the Handover

1. **Summarize completed work** - List what was done with file paths
2. **Prioritize remaining tasks** - Order by importance/urgency
3. **Provide clear instructions** - Next agent should know exactly what to do
4. **Include verification steps** - How to confirm work is correct

## Example: Minimal Handover

```markdown
# Agent Handover Document
**Date:** January 30, 2026
**Task:** Fix TypeScript errors in actions
**Status:** Partially complete

## Context
Removing @ts-nocheck from action files and fixing type errors.

## COMPLETED ✅
- Fixed `src/actions/tasks.ts` - 47 type errors resolved
- Fixed `src/actions/rfq.ts` - 23 type errors resolved

## REMAINING TASKS 🔧

### Priority 1: Fix payments.ts types
**Files:** `src/actions/payments.ts`
**Approach:** Remove @ts-nocheck, fix Json type casts

### Priority 2: Fix marketplace.ts types
**Files:** `src/actions/marketplace.ts`

## QUICK START
1. Run `npx tsc --noEmit` to see errors
2. Start with `src/actions/payments.ts`
```

## Receiving a Handover

When starting from a handover document:

1. **Read AGENT_HANDOVER.md** first
2. **Run verification commands** to understand current state
3. **Start with Priority 1** task unless user specifies otherwise
4. **Update the handover** as you complete tasks or if ending early
