---
name: self-improvement-loop
description: Capture and learn from corrections to prevent repeated mistakes. Use when the user corrects you, points out an error, or says something like "that's wrong", "no", "not like that", "you missed", or "actually".
---

# Self-Improvement Loop

This skill ensures continuous improvement by capturing lessons learned from corrections and mistakes.

## When to Use This Skill

**Trigger:** After ANY correction from the user, including:
- Direct corrections ("no, that's wrong")
- Implicit corrections (user fixes your code)
- Pattern corrections ("you keep doing X, do Y instead")
- Requirement clarifications that reveal a misunderstanding

## The Improvement Process

```
Self-Improvement Loop:
- [ ] 1. Acknowledge the correction
- [ ] 2. Identify the pattern/mistake
- [ ] 3. Update tasks/lessons.md (project-specific)
- [ ] 4. Log preference signal to daily log (feeds master preferences)
- [ ] 5. Consider if a rule should be created
- [ ] 6. Apply the lesson immediately
```

## Step 1: Acknowledge the Correction

Don't be defensive. Simply acknowledge:
- What you did wrong
- Why it was wrong
- What the correct approach is

## Step 2: Identify the Pattern

Ask yourself:
- Is this a one-off mistake or a recurring pattern?
- What conditions led to this mistake?
- How can I detect this situation in the future?

**Pattern Categories:**

| Category | Example | Prevention |
|----------|---------|------------|
| **Assumption** | Assumed file structure without checking | Always verify first |
| **Shortcut** | Skipped validation step | Follow the full process |
| **Context miss** | Didn't notice existing pattern in codebase | Search for existing patterns |
| **Over-engineering** | Added complexity not requested | Start simple, add only if needed |
| **Under-engineering** | Took shortcut that caused issues | Follow quality standards |

## Step 3: Update lessons.md

Add an entry to `tasks/lessons.md` using this format:

```markdown
## [Date] - [Brief Title]

**What happened:** [Describe the mistake]

**Why it happened:** [Root cause analysis]

**Lesson:** [The key insight]

**Prevention:** [How to avoid this in future]

**Related files:** [If applicable]
```

**Example Entry:**

```markdown
## 2026-02-01 - Don't assume dialog sizes

**What happened:** Used custom width class on DialogContent instead of size prop

**Why it happened:** Didn't check the component API before using it

**Lesson:** Dialog component has a size prop (sm/md/lg) - use it instead of custom widths

**Prevention:** Always check component props before adding custom classes

**Related files:** src/components/ui/dialog.tsx
```

## Step 4: Log Preference Signal to Daily Log

In addition to project-specific lessons.md, log the correction as a **preference signal** in today's daily log (`~/.memory/daily/YYYY-MM-DD.md`). This feeds into the preference distillation pipeline that updates `~/.memory/master-preferences.md`.

Add to the current log entry's **Preference Signals** section:

```markdown
**Preference Signals:**
- User corrected: [what was wrong] → [what was right]
- Pattern: [category from Step 2]
```

**Why both files?**
- `tasks/lessons.md` = project-specific, detailed, with prevention steps (quick reference for this codebase)
- Daily log preference signals = cross-session, feeds the master preferences document (shapes all future sessions)

The daily log signals are analyzed during distillation (see `~/.cursor/skills/preference-distill/SKILL.md`) and used to update the master preferences document that the AI reads at the start of every session.

## Step 5: Consider Creating a Rule

If the mistake:
- Is likely to recur
- Applies broadly to the codebase
- Has a clear, simple prevention

Then create or update a rule in `.cursor/rules/`.

**Rule creation criteria:**
- Pattern appears in 3+ files
- Mistake has significant impact
- Prevention is simple to follow

**Don't create a rule for:**
- One-off mistakes
- Context-specific issues
- Complex judgment calls

## Step 6: Apply Immediately

Don't just document - fix any instances of the mistake in the current work:

1. If you made the mistake in code: fix it now
2. If there are similar issues elsewhere: note them for follow-up
3. If it affects the current task: adjust your approach

## Lessons Review Protocol

At the start of each session:

1. Read `tasks/lessons.md`
2. Identify lessons relevant to today's work
3. Keep them in mind during implementation

## Template: lessons.md

Create `tasks/lessons.md` if it doesn't exist:

```markdown
# Lessons Learned

This file captures patterns and mistakes to avoid in future work.

## How to Use

1. Review at session start for relevant patterns
2. Add new entries when corrected
3. Reference when making similar decisions

---

## [Date] - [Title]

**What happened:** 

**Why it happened:** 

**Lesson:** 

**Prevention:** 

---
```

## Quick Reference

| Correction Type | Action |
|-----------------|--------|
| "That's wrong" | Acknowledge, identify root cause, document |
| "You keep doing X" | This is a pattern - definitely document and consider a rule |
| "Not what I asked" | Requirement misunderstanding - document for clarity |
| "Check the existing code" | Context miss - note to always search first |
| User silently fixes your code | Review their fix, understand the delta, document |

## Anti-Patterns

| Don't Do This | Do This Instead |
|---------------|-----------------|
| Ignore correction and move on | Pause, reflect, document |
| Make excuses | Acknowledge and learn |
| Document without understanding | Identify root cause first |
| Create rule for every mistake | Only rules for recurring patterns |
| Forget lessons between sessions | Review at session start |

## Related Skills

- [preference-distill](../preference-distill/SKILL.md) - Distills preference signals into master preferences document
- [project-memory](../project-memory/SKILL.md) - Daily logging where preference signals are recorded
- [bug-fix-workflow](../bug-fix-workflow/SKILL.md) - When corrections reveal bugs
- [code-quality](../code-quality/SKILL.md) - Quality standards to follow
- [comprehensive-code-review](../comprehensive-code-review/SKILL.md) - Self-review before presenting work
