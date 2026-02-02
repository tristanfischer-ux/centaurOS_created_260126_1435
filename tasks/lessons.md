# Lessons Learned

This file captures patterns and mistakes to avoid in future work.

## How to Use

1. **Review at session start** for patterns relevant to today's work
2. **Add new entries** when corrected by the user
3. **Reference** when making similar decisions

## Entry Format

```markdown
## [Date] - [Brief Title]

**What happened:** [Describe the mistake]

**Why it happened:** [Root cause analysis]

**Lesson:** [The key insight]

**Prevention:** [How to avoid this in future]

**Related files:** [If applicable]
```

---

<!-- Add lessons below this line -->

## 2026-02-02 - Dialog Size Prop Pattern (Recurring)

**What happened:** Fixed custom width in QuickComposeDialog.tsx (`sm:max-w-[500px]`) but failed to search for and fix ALL instances of this pattern across the codebase after the first fix in OnboardingModal.tsx.

**Why it happened:** 
- Did not proactively search for similar violations after the first fix
- Treated the correction as a one-off fix instead of a codebase-wide pattern
- Failed to use grep/search to find all instances before marking work complete

**Lesson:** When fixing a design system violation:
1. Fix the reported instance
2. **IMMEDIATELY** search for ALL similar violations using grep
3. Fix all instances in a single commit
4. Verify with design token checker script

**Prevention:** 
- After ANY design rule fix, search for the pattern across the entire codebase
- Use: `rg "className.*max-w-\[" --glob "*.tsx"` to find custom dialog widths
- Use: `./scripts/check-design-tokens.sh` to catch violations
- Never mark a design fix complete without searching for similar issues

**Related files:** 
- src/components/OnboardingModal.tsx (first fix)
- src/components/messaging/QuickComposeDialog.tsx (second fix)
- .cursor/rules/component-patterns.mdc (the rule being violated)
