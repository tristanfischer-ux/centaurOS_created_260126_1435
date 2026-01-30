---
name: red-team
description: Constructive red team analysis that challenges ideas while respecting their merit. Synthesizes the best of original thinking with new insights. Use when the user asks to red team, challenge, stress-test, critique, or find weaknesses in ideas, plans, strategies, features, or decisions.
---

# Red Team Analysis

Constructive critical analysis that improves ideas through synthesis, not destruction.

## Core Philosophy

Red teaming is **dialectical thinking**:

| Stage | Purpose | Output |
|-------|---------|--------|
| **Thesis** | Understand the original idea fully | Clear articulation of the idea and its merits |
| **Antithesis** | Challenge assumptions and find weaknesses | Specific concerns with reasoning |
| **Synthesis** | Combine best of both into improved version | Actionable recommendations |

**Critical principle:** Original ideas are often good. The goal is to make them better, not replace them.

## Red Team Workflow

### Step 1: Steel-Man the Original

Before critiquing, demonstrate you understand the idea at its strongest:

```markdown
## Understanding the Original Idea

**What is being proposed:**
[Clear description]

**Why this makes sense:**
- [Strength 1]
- [Strength 2]
- [Strength 3]

**What problem it solves:**
[The real value]
```

> Never critique what you haven't first steel-manned.

### Step 2: Challenge with Specificity

For each challenge, provide:
1. **What assumption is being made**
2. **Why it might be wrong** (with reasoning)
3. **What would need to be true** for the concern to materialize
4. **Severity assessment** (Critical / High / Medium / Low)

```markdown
## Challenges

### Challenge 1: [Assumption being questioned]

**Original assumption:** [What the idea assumes]

**Counter-argument:** [Specific reasoning why this might not hold]

**Conditions for concern:** This becomes a problem if:
- [Condition 1]
- [Condition 2]

**Severity:** [Level] - [Brief justification]

**But consider:** [Why the original might still be right]
```

### Step 3: Synthesize

For each challenge, provide a synthesis that combines insights:

```markdown
## Synthesis

### On [Topic]:

| Original View | Red Team View | Synthesized Recommendation |
|---------------|---------------|---------------------------|
| [Thesis] | [Antithesis] | [Synthesis] |

**Recommendation:** [Specific actionable guidance that incorporates both perspectives]
```

## Output Template

Use this structure for red team analysis:

```markdown
# Red Team Analysis: [Subject]

## Executive Summary

| Original Position | Challenge | Synthesis |
|-------------------|-----------|-----------|
| [Brief] | [Brief] | [Brief] |

---

## Part 1: Steel-Manning the Original

[Demonstrate understanding of the idea at its strongest]

### Strengths Worth Preserving
- [Strength 1]
- [Strength 2]

### Core Value Proposition
[What makes this idea valuable]

---

## Part 2: Challenges

### Challenge 1: [Title]
[Full challenge with specificity]

### Challenge 2: [Title]
[Full challenge with specificity]

---

## Part 3: Synthesis & Recommendations

### What to Keep
[Original elements that should remain unchanged]

### What to Modify
[Specific changes incorporating red team insights]

### What to Monitor
[Risks to watch for, with early warning signs]

---

## Confidence Assessment

| Aspect | Original Confidence | Revised Confidence | Change Reason |
|--------|--------------------|--------------------|---------------|
| [Aspect 1] | [High/Med/Low] | [High/Med/Low] | [Brief reason] |

---

## Final Recommendation

[Synthesized view that incorporates the best of both original and critique]
```

## Severity Levels

| Level | Definition | Response |
|-------|------------|----------|
| **Critical** | Could invalidate the entire approach | Must address before proceeding |
| **High** | Significant risk to success | Should address in current iteration |
| **Medium** | Worth considering but manageable | Plan to address, monitor for now |
| **Low** | Minor concern | Note for future consideration |

## Anti-Patterns to Avoid

### 1. Destruction Without Construction
❌ "This idea is wrong because X."
✅ "This idea might fail under condition X. A stronger version would account for this by Y."

### 2. Assuming Original is Wrong
❌ Starting from "let me find what's wrong here"
✅ Starting from "let me understand why this was proposed, then test it"

### 3. Vague Concerns
❌ "This might not work."
✅ "This assumes [specific thing]. If [specific condition], then [specific consequence]."

### 4. Ignoring Context
❌ Applying theoretical objections without considering the specific situation
✅ "In general X is risky, but in this context [reason why it might be fine]"

### 5. All Critique, No Synthesis
❌ Ending with a list of problems
✅ Ending with a synthesized recommendation that incorporates both perspectives

## Types of Red Team Analysis

### Strategic Red Team
For business strategies, plans, roadmaps:
- Challenge market assumptions
- Question timing assumptions
- Test competitive positioning
- Validate resource requirements

### Technical Red Team
For architecture, design decisions, implementations:
- Challenge scalability assumptions
- Question technology choices
- Test edge cases
- Validate security model

### Feature Red Team
For product features, UX decisions:
- Challenge user need assumptions
- Question prioritization
- Test for edge cases
- Validate value proposition

### Process Red Team
For workflows, procedures, methodologies:
- Challenge efficiency assumptions
- Question necessity of steps
- Test for failure modes
- Validate outcomes

## Quick Reference

When red teaming, always:

1. ✅ Start by articulating the original idea's strengths
2. ✅ Be specific about what assumption you're challenging
3. ✅ Explain the conditions under which your concern applies
4. ✅ Acknowledge when the original might still be right
5. ✅ End with synthesis, not just criticism
6. ✅ Provide actionable recommendations

Remember: **The goal is the best version of the idea, not the death of the idea.**
