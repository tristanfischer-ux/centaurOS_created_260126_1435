# ForgeOS — Unit Economics

**Last Updated**: 10 March 2026
**Status**: Framework — needs real data to validate

---

## 1. Per-Customer Economics

### Customer Lifetime Value (LTV)

**Formula**: LTV = ARPU / Monthly Churn Rate

| Tier | ARPU | Assumed Churn | LTV |
|------|------|--------------|-----|
| Startup Team | £49/mo | 5% | £980 |
| Professional | £149/mo | 3% | £4,967 |
| Enterprise | £499/mo | 2% | £24,950 |
| **Blended** | **£116/mo** | **4%** | **£2,900** |

### Customer Acquisition Cost (CAC)

*To be measured once marketing is active.*

| Channel | Estimated CAC | Notes |
|---------|-------------|-------|
| Organic/content | £10-30 | Blog, SEO, community |
| Referral | £15-40 | Incentivised referrals |
| Partnerships | £20-50 | Accelerator cohorts |
| Paid (LinkedIn) | £80-200 | Targeted ads |
| **Blended target** | **<£80** | |

### LTV:CAC Ratio

| Scenario | LTV | CAC | Ratio | Verdict |
|----------|-----|-----|-------|---------|
| Optimistic | £2,900 | £40 | 72:1 | Theoretical maximum |
| Base case | £2,900 | £80 | 36:1 | Theoretical — requires validation |
| Conservative | £1,500 | £150 | 10:1 | Good |
| Minimum viable | £980 | £200 | 5:1 | Acceptable (>3:1 rule) |

Target: LTV:CAC > 3:1 (industry standard for healthy SaaS).

*Caveat: These are mathematical outputs based on early assumptions. Real-world LTV:CAC will differ substantially until validated with actual cohort data. Industry-leading SaaS companies typically achieve 3:1 to 5:1.*

### CAC Payback Period

**Formula**: Payback = CAC / (ARPU x Gross Margin)

| Scenario | CAC | ARPU | Gross Margin | Payback |
|----------|-----|------|-------------|---------|
| Base case | £80 | £116 | 75% | 0.9 months |
| Conservative | £150 | £116 | 70% | 1.8 months |

Target: <12 months payback. Both scenarios well under.

---

## 2. Cost to Serve (Per User Per Month)

### Direct Costs

| Cost Item | Light User | Medium User | Heavy User |
|-----------|-----------|-------------|-----------|
| AI conversations (Claude) | £2 | £8 | £25 |
| AI conversations (other models) | £1 | £3 | £10 |
| CAD generation (Modal.com) | £0 | £2 | £8 |
| Image generation (DALL-E) | £0 | £1 | £3 |
| Supabase (storage, bandwidth) | £0.10 | £0.30 | £1 |
| Stripe fees (marketplace) | £0 | £1 | £5 |
| **Total cost to serve** | **£3.10** | **£15.30** | **£52** |

### Gross Margin by Tier

| Tier | ARPU | Cost to Serve (median) | Gross Margin | Margin % |
|------|------|----------------------|-------------|----------|
| Startup Team | £49 | £8 | £41 | 84% |
| Professional | £149 | £20 | £129 | 87% |
| Enterprise | £499 | £35 | £464 | 93% |
| Free | £0 | £3 | -£3 | N/A |

**Key insight**: Free users cost ~£3/month to serve. At 7% conversion, every 100 free users produce 7 paid users generating ~£812/mo vs. £300/mo cost for all 100. Net positive.

Note: This excludes the ~£15-20/mo serving cost for the 7 paid users, bringing true net contribution to ~£372-407/mo — still strongly positive.

---

## 3. Marketplace Unit Economics

### Per-Transaction Economics

| Metric | Value |
|--------|-------|
| Average transaction size (target) | £500 |
| Platform fee | 10% (£50) |
| Stripe processing | ~2% + 20p (£10.20) |
| **Net revenue per transaction** | **£39.80** |
| **Net margin on marketplace fee** | **79.6%** |

### Marketplace Revenue Potential

| Active buyers | Transactions/mo/buyer | Avg. transaction | Monthly GMV | Monthly fees |
|--------------|----------------------|-----------------|-------------|-------------|
| 10 | 1 | £500 | £5,000 | £500 |
| 50 | 1.5 | £500 | £37,500 | £3,750 |
| 100 | 2 | £600 | £120,000 | £12,000 |

---

## 4. Key Ratios to Monitor

| Metric | Target | Red Flag |
|--------|--------|----------|
| Gross margin (subscriptions) | >75% | <60% |
| AI cost as % of ARPU | <30% | >45% |
| LTV:CAC | >3:1 | <2:1 |
| CAC payback | <6 months | >12 months |
| Free → paid conversion | >5% | <2% |
| Monthly churn (paid) | <5% | >8% |
| Net Revenue Retention | >100% | <85% |
| Marketplace take rate effective | >8% | <5% (after Stripe) |

---

## 5. Sensitivity Analysis

### What If AI Costs Double?

| Tier | Current margin | Margin with 2x AI cost |
|------|---------------|----------------------|
| Startup Team | 84% | 67% |
| Professional | 87% | 74% |
| Enterprise | 93% | 86% |

Still viable, but Startup Team margin gets tight. Mitigation: model optimisation, caching, usage caps.

### What If Churn is 2x Expected?

| Churn | Blended LTV | LTV:CAC (£80 CAC) |
|-------|------------|-------------------|
| 4% (base) | £2,900 | 36:1 |
| 8% (2x) | £1,450 | 18:1 |
| 12% (3x) | £967 | 12:1 |

Even at 3x expected churn, LTV:CAC remains healthy. The model is robust.

---

## Action Items

1. [ ] Implement per-user AI cost tracking in production
2. [ ] Measure actual conversation cost by model and specialist
3. [ ] Track free → paid conversion with cohort analysis
4. [ ] Set up churn tracking by tier and tenure
5. [ ] Measure activation metrics (what predicts conversion?)
6. [ ] Calculate actual CAC once marketing spend begins
