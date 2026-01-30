# Red Team Examples

Concrete examples showing the dialectical approach in practice.

## Example 1: Feature Prioritization

### Original Idea
"We should add AI cost tracking to monitor our OpenAI API spend."

### Bad Red Team (Destructive)
> "This is premature optimization. We don't have customers yet. This is a waste of engineering time that should go to sales."

**Why this fails:** Dismisses the idea entirely without exploring its merits or finding a synthesis.

### Good Red Team (Dialectical)

**Steel-Man:**
> "AI cost tracking makes sense because: (1) AI costs can grow unexpectedly at scale, (2) per-customer profitability matters for pricing decisions, (3) early visibility prevents surprise bills."

**Challenge:**
> "However, at current scale (presumably low usage), AI costs are likely $100-500/month - a rounding error vs. development costs. The engineering time to build robust tracking (2-3 days) might delay more critical work. This becomes important at 10,000+ AI tasks/month, not before."

**Synthesis:**
> "**Recommendation:** Don't build full tracking now, but add simple logging that captures tokens used per request. This takes 2 hours, not 2 days, provides raw data when needed, and doesn't delay customer-focused work. Revisit full tracking when monthly AI spend exceeds $500."

---

## Example 2: Pricing Strategy

### Original Idea
"We should standardize all marketplace fees to 10% across all transaction types."

### Bad Red Team (Destructive)
> "This could kill the marketplace. Upwork charges 5-20%, we'd be uncompetitive. Providers will leave."

**Why this fails:** Presents only the risks without acknowledging why standardization was proposed or finding middle ground.

### Good Red Team (Dialectical)

**Steel-Man:**
> "Standardization makes sense because: (1) inconsistent pricing (5%, 8%, 10%) confuses users, (2) simpler pricing reduces cognitive load and support burden, (3) it enables clearer communication and marketing."

**Challenge:**
> "However, the current tiers might be intentional: 5% for Org Blueprint incentivizes platform adoption, 8% for marketplace is competitive with Upwork, 10% for retainers reflects higher-touch service. Standardizing to 10% might kill adoption of lower-margin features."

**Synthesis:**
> "**Recommendation:** Rather than standardizing immediately, A/B test pricing changes on one transaction type. If conversion doesn't drop more than 10%, proceed. Also consider: keep tiered pricing but make the logic explicit to users (e.g., '5% for using our templates, 10% for custom projects'). Users accept complexity when they understand the reason."

---

## Example 3: Technical Architecture

### Original Idea
"We should add Anthropic as a fallback provider to reduce OpenAI dependency."

### Bad Red Team (Destructive)
> "This adds complexity for a theoretical risk. OpenAI has 99.9% uptime. You're over-engineering."

**Why this fails:** Dismisses valid concern about single-provider risk without proposing alternatives.

### Good Red Team (Dialectical)

**Steel-Man:**
> "Multi-provider reduces risk because: (1) any single provider could change pricing or terms, (2) API outages do happen, (3) different models have different strengths for different tasks."

**Challenge:**
> "However: (1) OpenAI has only decreased prices historically, (2) adding Anthropic introduces behavioral inconsistencies (outputs differ), (3) testing doubles, (4) engineering time has opportunity cost. At current scale, the risk is theoretical while the cost is concrete."

**Synthesis:**
> "**Recommendation:** Accept single-provider risk for now, but build the abstraction layer that would make switching easy. Use an internal `AIProvider` interface that wraps OpenAI. When/if you add Anthropic later, you only change the implementation, not the consumers. This takes 4 hours and buys optionality without full multi-provider complexity."

---

## Example 4: Business Strategy

### Original Idea  
"We should raise a $2-5M seed round to accelerate growth."

### Bad Red Team (Destructive)
> "You have no revenue, no customers, no traction. This will fail and you'll give away equity for nothing."

**Why this fails:** Ignores legitimate reasons for raising and doesn't explore alternative paths.

### Good Red Team (Dialectical)

**Steel-Man:**
> "Raising makes sense because: (1) the market window may be closing, (2) capital enables faster hiring and growth, (3) investor networks can accelerate customer acquisition, (4) competitors are well-funded."

**Challenge:**
> "However: (1) raising without revenue signals weakness and reduces valuation, (2) investor pressure may force premature scaling, (3) if PMF isn't found, the money burns while diluting founders, (4) bootstrapped competitors might be more capital-efficient."

**Synthesis:**
> "**Recommendation:** Target $10K MRR before raising - this proves demand and improves terms. If the 'window' is real, even 3 months of revenue data dramatically changes conversations. Alternative paths: (1) smaller raise ($500K-1M) to extend runway and prove PMF, (2) revenue-based financing if revenue exists, (3) strategic angel round for expertise, not just capital."

---

## Example 5: Product Direction

### Original Idea
"AI should be treated as a first-class team member that users assign tasks to and manage."

### Bad Red Team (Destructive)
> "Nobody wants to manage AI. People want AI that just works invisibly. This is a solution looking for a problem."

**Why this fails:** Asserts the idea is wrong without evidence, ignores potential value.

### Good Red Team (Dialectical)

**Steel-Man:**
> "AI-as-teammate makes sense because: (1) it sets expectations - AI isn't magic, it needs direction, (2) it provides natural oversight and approval workflows, (3) it differentiates from competitors who treat AI as a feature, (4) it aligns with how organizations actually want to adopt AI (gradually, with control)."

**Challenge:**
> "However: (1) 'managing' AI might feel like overhead vs. value, (2) users might prefer AI that handles things without intervention, (3) the approval workflow could slow down what should be instant, (4) the mental model might not resonate - is AI a 'colleague' or a 'tool'?"

**Synthesis:**
> "**Recommendation:** Offer both modes. AI-as-teammate for high-stakes tasks where oversight matters (financial decisions, client communications, strategic work). AI-as-assistant for routine tasks where speed matters more than approval (scheduling, formatting, simple queries). Let users choose the level of AI autonomy per task type. Track which mode users prefer - the data will reveal the right default."

---

## Pattern Recognition

### Signs of Good Red Team

| Indicator | Example |
|-----------|---------|
| Starts with steel-man | "This makes sense because..." |
| Specific conditions | "This fails if X and Y..." |
| Acknowledges uncertainty | "The original might still be right if..." |
| Actionable synthesis | "Consider doing X instead of Y..." |
| Preserves what works | "Keep A, modify B, monitor C..." |

### Signs of Bad Red Team

| Indicator | Example |
|-----------|---------|
| Starts with attack | "This is wrong because..." |
| Vague concerns | "This might not work..." |
| Absolute claims | "This will definitely fail..." |
| No alternatives | "Don't do this." (End) |
| Ignores context | "In theory, X is bad..." |

---

## Quick Synthesis Patterns

When you find a genuine concern, choose a synthesis pattern:

### Pattern 1: Scope Reduction
> "Instead of doing X fully, do X for the most critical case only."

### Pattern 2: Staged Implementation  
> "Do X now in simple form, expand to full version after validation."

### Pattern 3: Parallel Path
> "Do X but also monitor for condition Y, pivot if Y occurs."

### Pattern 4: Conditional Acceptance
> "Proceed with X if condition A is met, otherwise do Y."

### Pattern 5: Abstraction Layer
> "Build the interface for X now, defer the full implementation."
