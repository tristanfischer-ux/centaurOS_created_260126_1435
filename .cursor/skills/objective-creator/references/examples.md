# Objective Creator Examples

Detailed examples of transforming various inputs into structured objectives.

## Example 1: Vague Idea → Structured Objective

**User Input:**
> "We should improve our onboarding flow"

**Analysis:**
- Core goal: Improve onboarding experience
- Implied tasks: Audit current flow, identify pain points, design improvements, implement, test
- Stakeholders: New users, product team
- Success metric: Reduced drop-off, faster time-to-value

**Structured Output:**

```json
{
  "title": "Improve User Onboarding Experience",
  "description": "Redesign and optimize the onboarding flow to reduce new user drop-off and decrease time-to-value. Success criteria: 20% reduction in onboarding abandonment rate and 30% faster completion time.",
  "tasks": [
    {
      "title": "Audit current onboarding flow and collect analytics",
      "description": "Review existing onboarding steps, gather completion rates per step, identify drop-off points. Export data from analytics dashboard.",
      "durationDays": 2,
      "risk_level": "Low",
      "dependsOn": []
    },
    {
      "title": "Conduct user interviews on onboarding experience",
      "description": "Interview 5-8 recent users about their onboarding experience. Focus on confusion points, missing information, and suggestions.",
      "durationDays": 5,
      "risk_level": "Low",
      "dependsOn": []
    },
    {
      "title": "Create onboarding improvement proposal",
      "description": "Based on audit and interviews, propose specific improvements with mockups. Include quick wins and larger changes.",
      "durationDays": 3,
      "risk_level": "Medium",
      "dependsOn": [0, 1]
    },
    {
      "title": "Implement onboarding UI improvements",
      "description": "Execute approved UI changes: clearer progress indicators, simplified forms, contextual help tooltips.",
      "durationDays": 7,
      "risk_level": "Medium",
      "dependsOn": [2]
    },
    {
      "title": "A/B test new onboarding flow",
      "description": "Run A/B test comparing old vs new onboarding. Measure completion rate, time-to-complete, and user satisfaction.",
      "durationDays": 10,
      "risk_level": "High",
      "dependsOn": [3]
    },
    {
      "title": "Roll out winning variant to all users",
      "description": "Based on A/B test results, deploy winning onboarding flow to 100% of new users. Monitor for issues.",
      "durationDays": 2,
      "risk_level": "High",
      "dependsOn": [4]
    }
  ]
}
```

---

## Example 2: Technical Request → Development Objective

**User Input:**
> "Add Stripe webhook handling for subscription events"

**Analysis:**
- Core goal: Handle Stripe subscription webhooks
- Technical requirements: Endpoint, signature verification, event handlers
- Events to handle: subscription.created, subscription.updated, subscription.deleted, invoice.paid
- Side effects: Database updates, notifications

**Structured Output:**

```json
{
  "title": "Implement Stripe Subscription Webhook Handling",
  "description": "Build secure webhook endpoint to handle Stripe subscription lifecycle events. Must handle subscription creation, updates, cancellations, and invoice payments with proper signature verification and idempotency.",
  "tasks": [
    {
      "title": "Create webhook endpoint with signature verification",
      "description": "Set up /api/webhooks/stripe endpoint. Implement Stripe signature verification using webhook secret. Return 200 for valid requests, 400 for invalid.",
      "durationDays": 2,
      "risk_level": "High",
      "dependsOn": []
    },
    {
      "title": "Implement subscription.created handler",
      "description": "Handle new subscription creation: create subscription record in DB, update user's plan status, send welcome email.",
      "durationDays": 2,
      "risk_level": "Medium",
      "dependsOn": [0]
    },
    {
      "title": "Implement subscription.updated handler",
      "description": "Handle subscription updates: plan changes, quantity changes, billing cycle changes. Update local records accordingly.",
      "durationDays": 2,
      "risk_level": "Medium",
      "dependsOn": [0]
    },
    {
      "title": "Implement subscription.deleted handler",
      "description": "Handle cancellations: mark subscription as cancelled, update user access, schedule data retention policy, send cancellation confirmation.",
      "durationDays": 2,
      "risk_level": "High",
      "dependsOn": [0]
    },
    {
      "title": "Implement invoice.paid handler",
      "description": "Handle successful payments: record payment in DB, extend subscription period, generate receipt, update billing history.",
      "durationDays": 2,
      "risk_level": "Medium",
      "dependsOn": [0]
    },
    {
      "title": "Add idempotency and error handling",
      "description": "Implement idempotency keys to prevent duplicate processing. Add dead-letter queue for failed events. Set up alerts for webhook failures.",
      "durationDays": 3,
      "risk_level": "High",
      "dependsOn": [1, 2, 3, 4]
    },
    {
      "title": "Test with Stripe CLI and write integration tests",
      "description": "Use Stripe CLI to trigger test events. Write integration tests covering all event types and edge cases (duplicates, out-of-order events).",
      "durationDays": 3,
      "risk_level": "Medium",
      "dependsOn": [5]
    },
    {
      "title": "Configure production webhook in Stripe Dashboard",
      "description": "Set up production webhook endpoint in Stripe. Verify events are received. Monitor initial traffic for issues.",
      "durationDays": 1,
      "risk_level": "High",
      "dependsOn": [6]
    }
  ]
}
```

---

## Example 3: Business Initiative → Strategic Objective

**User Input:**
> "We need to expand into the European market"

**Analysis:**
- This is a large initiative - consider suggesting breakdown into multiple objectives
- Key areas: Legal/compliance, localization, marketing, operations
- For single objective: Focus on initial research/feasibility phase

**Structured Output:**

```json
{
  "title": "European Market Expansion - Discovery Phase",
  "description": "Research and plan for European market entry. Deliverables: Market analysis report, GDPR compliance gap assessment, localization requirements, and go/no-go recommendation with timeline.",
  "tasks": [
    {
      "title": "Research target European markets",
      "description": "Analyze top 5 EU markets (UK, Germany, France, Netherlands, Spain) for market size, competition, and entry barriers. Create comparison matrix.",
      "durationDays": 5,
      "risk_level": "Low",
      "dependsOn": []
    },
    {
      "title": "Conduct GDPR compliance assessment",
      "description": "Audit current data practices against GDPR requirements. Document gaps in consent management, data processing, retention, and subject rights.",
      "durationDays": 4,
      "risk_level": "Medium",
      "dependsOn": []
    },
    {
      "title": "Document localization requirements",
      "description": "List all user-facing content requiring translation. Identify cultural adaptations needed. Estimate translation costs and timeline.",
      "durationDays": 3,
      "risk_level": "Low",
      "dependsOn": []
    },
    {
      "title": "Research legal entity requirements",
      "description": "Investigate requirements for EU subsidiary or local presence. Consult with legal counsel on entity structure options.",
      "durationDays": 5,
      "risk_level": "Medium",
      "dependsOn": []
    },
    {
      "title": "Estimate operational costs",
      "description": "Calculate costs for: legal setup, compliance, localization, marketing, customer support. Build 12-month cost projection.",
      "durationDays": 3,
      "risk_level": "Medium",
      "dependsOn": [0, 1, 2, 3]
    },
    {
      "title": "Create go/no-go recommendation",
      "description": "Synthesize findings into executive summary with clear recommendation. Include recommended target market, timeline, budget, and key risks.",
      "durationDays": 2,
      "risk_level": "High",
      "dependsOn": [4]
    }
  ]
}
```

---

## Example 4: Quick Task → Minimal Objective

**User Input:**
> "Update the homepage hero section copy"

**Analysis:**
- Simple, single-focus task
- May not need to be an objective - but if user wants tracking, make it minimal
- Quick turnaround expected

**Structured Output:**

```json
{
  "title": "Update Homepage Hero Copy",
  "description": "Refresh the homepage hero section with updated messaging. Coordinate with marketing for copy approval.",
  "tasks": [
    {
      "title": "Draft new hero copy options",
      "description": "Write 3 headline/subheadline variations. Focus on value proposition and call-to-action clarity.",
      "durationDays": 1,
      "risk_level": "Low",
      "dependsOn": []
    },
    {
      "title": "Get marketing approval on copy",
      "description": "Share draft options with marketing team. Incorporate feedback and get final approval.",
      "durationDays": 2,
      "risk_level": "Low",
      "dependsOn": [0]
    },
    {
      "title": "Implement and deploy hero update",
      "description": "Update hero component with approved copy. Test on staging, deploy to production.",
      "durationDays": 1,
      "risk_level": "Low",
      "dependsOn": [1]
    }
  ]
}
```

---

## Risk Level Decision Guide

| Scenario | Risk Level | Reasoning |
|----------|------------|-----------|
| Internal documentation | Low | No external impact, easily reversible |
| UI copy changes | Low | Minor user impact, quickly fixable |
| New internal tool | Low-Medium | Team productivity impact |
| Database schema change | Medium | Requires careful migration |
| API changes | Medium-High | Affects integrations |
| Payment/billing code | High | Financial impact |
| User data handling | High | Privacy/compliance risk |
| Production deployment | High | Service availability |
| Third-party integration | Medium-High | External dependencies |
| Security-related | High | Always treat as high risk |

---

## Date Calculation Patterns

### Sequential (Waterfall)
```
Task 1 → Task 2 → Task 3 → Task 4
Each depends on previous
```

### Parallel Start
```
Task 1 ─┬→ Task 3 → Task 4
Task 2 ─┘
Tasks 1 & 2 can run together, Task 3 needs both
```

### Mixed Dependencies
```
Task 1 ─────────→ Task 4
Task 2 → Task 3 ─┘
Task 1 is independent, Task 4 needs both 1 and 3
```

### Buffer Days
Add 1-2 buffer days between major phases:
- After research/analysis phase
- Before production deployment
- Around external dependencies (reviews, approvals)
