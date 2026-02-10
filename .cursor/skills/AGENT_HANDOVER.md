# Agent Handover: Skill Elevation Project

**Date:** February 1, 2026
**Task:** Elevate all 17 "good" skills to "excellent" status
**Status:** In Progress

---

## Context

We audited all 22 CentaurOS skills and identified that 5 are "excellent" while 17 are "good". The goal is to elevate all 17 to excellent by adding standardized sections.

---

## COMPLETED ✅

### Audit Phase
- Reviewed all 22 skills
- Identified 8 excellence criteria
- Created elevation plan with 4 parallel agent batches

---

## WHAT MAKES A SKILL "EXCELLENT"

Each skill must have these sections after updates:

1. **Related Skills** - 2+ cross-references to other skills
2. **Quick Reference** - Table with 5+ rows for fast lookup
3. **Troubleshooting** - 3+ common issues with fixes (except agent-handover, strategic-assessment)
4. **When to Use** - Clear trigger conditions
5. **When NOT to Use** - When to use a different skill instead
6. **No hardcoded content** - No user-specific data

---

## SKILLS TO ELEVATE (17 total)

### Batch 1: Security Skills (4)
- `.cursor/skills/secure-api-routes/SKILL.md`
- `.cursor/skills/secure-database/SKILL.md`
- `.cursor/skills/secure-frontend/SKILL.md`
- `.cursor/skills/secure-server-actions/SKILL.md`

**Cross-reference to:** `security-review` (umbrella), each other

### Batch 2: Development Workflow Skills (5)
- `.cursor/skills/bug-fix-workflow/SKILL.md`
- `.cursor/skills/code-quality/SKILL.md`
- `.cursor/skills/supabase-migration/SKILL.md`
- `.cursor/skills/e2e-testing/SKILL.md`
- `.cursor/skills/comprehensive-code-review/SKILL.md`

**Cross-reference to:** `feature-implementation-guide`, each other

### Batch 3: UI + Pattern Skills (5)
- `.cursor/skills/ui-component-standards/SKILL.md`
- `.cursor/skills/design-audit/SKILL.md`
- `.cursor/skills/accessibility-remediation/SKILL.md`
- `.cursor/skills/multi-step-form/SKILL.md`
- `.cursor/skills/status-workflow/SKILL.md`

**Cross-reference to:** cursor rules in `.cursor/rules/`, each other

### Batch 4: Integration + Utility Skills (4) - SPECIAL CASES
- `.cursor/skills/telegram-integration/SKILL.md` - MAJOR expansion needed
- `.cursor/skills/agent-handover/SKILL.md`
- `.cursor/skills/objective-creator/SKILL.md` - CRITICAL: Remove hardcoded "Tristan Fischer"
- `.cursor/skills/strategic-assessment/SKILL.md`

---

## TEMPLATE FOR NEW SECTIONS

Add these at the END of each skill file:

```markdown
---

## When to Use This Skill

- [Trigger condition 1]
- [Trigger condition 2]
- [Trigger condition 3]

## When NOT to Use

- Use [other-skill] instead when [condition]
- Skip this skill if [condition]

## Quick Reference

| Situation | Action | Example |
|-----------|--------|---------|
| ... | ... | ... |
| ... | ... | ... |
| ... | ... | ... |
| ... | ... | ... |
| ... | ... | ... |

## Troubleshooting

### "[Error or problem]"
**Cause:** [Why this happens]
**Fix:** [How to resolve]

### "[Error or problem 2]"
**Cause:** [Why this happens]
**Fix:** [How to resolve]

### "[Error or problem 3]"
**Cause:** [Why this happens]
**Fix:** [How to resolve]

## Related Skills

- [skill-name](../skill-name/SKILL.md) - [Brief description]
- [skill-name](../skill-name/SKILL.md) - [Brief description]
```

---

## SPECIAL FIXES REQUIRED

### objective-creator (CRITICAL)
Lines 246-262 contain hardcoded user context:
```markdown
## User Context

**This skill is configured for Tristan Fischer's account.**

| Field | Value |
|-------|-------|
| **Name** | Tristan Fischer |
| **Email** | Tristan.fischer@fractionalforge.app |
```

**Replace with:**
```markdown
## User Context

This skill uses the authenticated user's context from the current session.

| Field | Source |
|-------|--------|
| **User** | Authenticated session user |
| **Email** | `user.email` from auth |
| **Role** | `user.user_metadata.role` |
| **Organization** | `user.user_metadata.foundry_id` lookup |

All objectives and tasks are:
- Owned by the authenticated user (creator_id = current user's profile ID)
- Assigned to the user by default (unless another team member is specified)
- Under the user's foundry (foundry_id from authenticated session)
```

### telegram-integration (MAJOR EXPANSION)
Needs significant additions:
1. Testing section (like stripe-integration has)
2. Error handling patterns table
3. Common patterns quick reference
4. Troubleshooting section with webhook debugging

---

## VERIFICATION COMMANDS

After all agents complete, run:

```bash
# Count Related Skills sections (should be 17+)
rg "## Related Skills" .cursor/skills/*/SKILL.md | wc -l

# Count Quick Reference sections (should be 17+)
rg "## Quick Reference" .cursor/skills/*/SKILL.md | wc -l

# Verify objective-creator fix (should be 0)
rg "Tristan Fischer" .cursor/skills/objective-creator/SKILL.md

# Count When to Use sections (should be 17+)
rg "## When to Use" .cursor/skills/*/SKILL.md | wc -l
```

---

## REFERENCE: EXCELLENT SKILLS TO COPY STYLE FROM

- `.cursor/skills/security-review/SKILL.md` - Good umbrella checklist style
- `.cursor/skills/feature-implementation-guide/SKILL.md` - Good cross-references
- `.cursor/skills/stripe-integration/SKILL.md` - Good patterns and testing
- `.cursor/skills/vercel-deploy/SKILL.md` - Good troubleshooting
- `.cursor/skills/red-team/SKILL.md` - Good methodology structure
