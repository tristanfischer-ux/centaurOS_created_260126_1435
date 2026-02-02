---
name: strategic-assessment
description: Create comprehensive strategic business assessments with product grades, risk analysis, and action plans. Use when the user asks to assess, evaluate strategy, create executive summary, review business model, analyze product, or mentions strategic review, business analysis, or investment readiness.
---

# Strategic Assessment

Framework for creating comprehensive business and product assessments.

## Assessment Workflow

### Step 1: Gather Evidence

Before assessing, collect data from:

```bash
# Codebase metrics
find src -name "*.tsx" -o -name "*.ts" | wc -l  # File count
rg "export (function|const|class)" src/ --count-matches  # Export count

# Database complexity
ls -la supabase/migrations/*.sql | wc -l  # Migration count
rg "CREATE TABLE" supabase/migrations/ --count-matches  # Table count

# Feature inventory
ls -la src/app/api/  # API endpoints
ls -la src/app/\(platform\)/  # Platform pages

# AI integration points
rg "openai|anthropic|ai" src/ -i --count-matches
```

### Step 2: Apply Assessment Framework

Score each dimension:

| Dimension | Grade | Criteria |
|-----------|-------|----------|
| **Product** | A-F | Feature completeness, technical quality, UX |
| **Business Model** | A-F | Revenue model clarity, pricing, unit economics |
| **Operations** | A-F | Monitoring, security, scalability readiness |
| **Market Position** | A-F | Differentiation, timing, competitive landscape |

### Step 3: Generate Assessment Report

## Report Template

```markdown
# [Project Name] Executive Summary

**Strategic Business Review | [Date]**

---

## The Opportunity

[1-2 paragraph summary of what this product does and why it matters]

### Why Now?

| Macro Trend | Position |
|-------------|----------|
| [Trend 1] | [How product addresses it] |
| [Trend 2] | [How product addresses it] |

---

## What We Found

### Product Assessment: [Grade]

\`\`\`
Feature Completeness: [Progress bar] [%]
Technical Quality:    [Progress bar] [%]
AI Integration:       [Progress bar] [%]
\`\`\`

**Key Strengths:**
- [Strength 1]
- [Strength 2]
- [Strength 3]

**Key Gaps:**
- [Gap 1]
- [Gap 2]

### Business Model Assessment: [Grade]

[Analysis of revenue model, pricing, unit economics]

| Revenue Stream | Current | Recommended |
|----------------|---------|-------------|
| [Stream 1] | [Current approach] | [Recommendation] |

### Operational Maturity Assessment: [Grade]

[Analysis of monitoring, security, scalability]

**Major Gaps:**
- [Gap with impact]

---

## Risk Summary

| Risk | Severity | Action Required |
|------|----------|-----------------|
| [Risk 1] | HIGH/MEDIUM/LOW | [Action + timeline] |
| [Risk 2] | HIGH/MEDIUM/LOW | [Action + timeline] |

---

## Strategic Options

### Option 1: [Name]
[Description with pros/cons]

### Option 2: [Name]
[Description with pros/cons]

### Recommended: [Option Name]

[Rationale for recommendation]

---

## [N]-Day Action Plan

### Month 1: [Theme]

| Week | Action | Owner |
|------|--------|-------|
| 1-2 | [Action] | [Role] |
| 3-4 | [Action] | [Role] |

### Month 2: [Theme]
[...]

### Month 3: [Theme]
[...]

---

## Key Metrics to Track

### North Star
**[Single most important metric]**

### Supporting Dashboard

| Metric | Current | Target ([N] days) |
|--------|---------|-------------------|
| [Metric 1] | [Value/?] | [Target] |
| [Metric 2] | [Value/?] | [Target] |

---

## Investment Recommendation

### [Ready/Not Ready] for [Stage]

| Factor | Assessment |
|--------|------------|
| Product | [Status] |
| Market | [Status] |
| Risk | [Status] |

**Recommended Raise:** $[Range]

**Use of Funds:**
- [%] [Category]
- [%] [Category]

---

## Verdict

### [Recommendation]

[Summary paragraph]

**Confidence Level:** [N]/10

**Key Dependency:** [Critical item that must happen]

---

## Next Steps

1. **Immediate (This Week)**
   - [Action 1]
   - [Action 2]

2. **Short-term ([N] Days)**
   - [Action 1]
   - [Action 2]

3. **Medium-term ([N] Days)**
   - [Action 1]
   - [Action 2]

---

*Analysis based on [data sources]. Validate with [additional data needed].*
```

## Grading Rubric

### Product Grade

| Grade | Criteria |
|-------|----------|
| **A** | Feature-complete, production-ready, differentiated, excellent UX |
| **B** | Most features built, some polish needed, good foundation |
| **C** | Core features work, significant gaps, needs iteration |
| **D** | MVP only, many missing features, technical debt |
| **F** | Incomplete, broken, or fundamentally flawed |

### Business Model Grade

| Grade | Criteria |
|-------|----------|
| **A** | Clear revenue model, proven unit economics, pricing validated |
| **B** | Revenue model defined, some validation, minor inconsistencies |
| **C** | Revenue model exists, not validated, pricing unclear |
| **D** | Revenue model vague, no validation, significant issues |
| **F** | No revenue model or fundamentally broken economics |

### Operations Grade

| Grade | Criteria |
|-------|----------|
| **A** | Full observability, security compliant, scalable infrastructure |
| **B** | Basic monitoring, security reviewed, can handle growth |
| **C** | Some monitoring, security gaps, scaling concerns |
| **D** | Minimal monitoring, security issues, won't scale |
| **F** | No monitoring, major security flaws, broken infrastructure |

## Risk Severity Framework

| Severity | Definition | Response Time |
|----------|------------|---------------|
| **HIGH** | Could kill the business or cause major damage | Address within 2 weeks |
| **MEDIUM** | Significant impact on growth or operations | Address within 30 days |
| **LOW** | Minor impact, manageable | Address within 90 days |

## Common Risk Categories

### Technical Risks
- Single provider dependency (AI, hosting, payments)
- No cost tracking for variable costs
- Security vulnerabilities
- Scalability bottlenecks
- Technical debt accumulation

### Business Risks
- Unclear unit economics
- Pricing inconsistency
- No customer validation
- Competitive pressure
- Market timing

### Operational Risks
- No monitoring/alerting
- Missing documentation
- Bus factor (key person dependency)
- No disaster recovery
- Compliance gaps

## Assessment vs Red Team

| Assessment | Red Team |
|------------|----------|
| "Here's what we found" | "Here's why that might be wrong" |
| Grades and metrics | Challenges and alternatives |
| Action plan | Risk scenarios |
| Investment recommendation | Stress-test the recommendation |

**Best practice:** Run assessment first, then red team the findings.

## Checklist

Before completing assessment:

- [ ] Gathered quantitative data (not just impressions)
- [ ] Scored all four dimensions with evidence
- [ ] Identified both strengths AND gaps
- [ ] Risks have severity and timeline
- [ ] Action plan has owners (roles, not names)
- [ ] Metrics have current values (or marked as unknown)
- [ ] Confidence level stated honestly
- [ ] Key dependencies identified
- [ ] Caveats about data limitations included
