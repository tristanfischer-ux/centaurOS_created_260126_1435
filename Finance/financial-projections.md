# ForgeOS — 12-Month Financial Projections

**Last Updated**: 3 March 2026
**Status**: Framework — requires actual cost data to populate

---

## 1. Revenue Model

### Assumptions

| Assumption | Value | Basis |
|------------|-------|-------|
| Free → paid conversion rate | 7% | Industry average for freemium SaaS (5-10%) |
| Monthly churn (paid) | 4% | Early-stage SaaS typical (3-7%) |
| Startup Team : Professional : Enterprise ratio | 60% : 30% : 10% | Estimate |
| Average Startup Team ARPU | £49/mo | List price |
| Average Professional ARPU | £149/mo | List price |
| Average Enterprise ARPU | £499/mo | List price |
| Annual billing discount | 20% | Per pricing page |
| Annual billing uptake | 30% | Estimate |
| Marketplace GMV per active customer | £200/mo | Estimate — subject to cold-start risk in early months |
| Marketplace take rate | 10% | Per pricing page |

### Blended ARPU Calculation

Blended ARPU = (60% x £49) + (30% x £149) + (10% x £499) = £29.40 + £44.70 + £49.90 = **£124/mo** (before annual discount)

With 30% on annual (20% discount): Effective blended ARPU ~ **£116/mo**

---

## 2. 12-Month Revenue Projection

| Month | New Signups | Total Free | New Paid | Total Paid | Churn | Sub Revenue | Mktplace GMV | Mktplace Fee | Total Revenue |
|-------|-------------|-----------|----------|-----------|-------|-------------|-------------|-------------|---------------|
| 1 | 50 | 50 | 4 | 4 | 0 | £464 | £200 | £20 | £484 |
| 2 | 60 | 106 | 4 | 8 | 0 | £928 | £600 | £60 | £988 |
| 3 | 80 | 178 | 6 | 13 | 1 | £1,508 | £1,200 | £120 | £1,628 |
| 4 | 100 | 265 | 7 | 19 | 1 | £2,204 | £2,000 | £200 | £2,404 |
| 5 | 120 | 365 | 8 | 26 | 1 | £3,016 | £3,200 | £320 | £3,336 |
| 6 | 150 | 489 | 11 | 36 | 1 | £4,176 | £5,000 | £500 | £4,676 |
| 7 | 180 | 633 | 13 | 47 | 2 | £5,452 | £7,000 | £700 | £6,152 |
| 8 | 200 | 786 | 14 | 59 | 2 | £6,844 | £9,500 | £950 | £7,794 |
| 9 | 220 | 947 | 15 | 72 | 2 | £8,352 | £12,000 | £1,200 | £9,552 |
| 10 | 250 | 1,125 | 18 | 87 | 3 | £10,092 | £15,000 | £1,500 | £11,592 |
| 11 | 280 | 1,318 | 20 | 104 | 3 | £12,064 | £18,000 | £1,800 | £13,864 |
| 12 | 300 | 1,514 | 21 | 122 | 4 | £14,152 | £22,000 | £2,200 | £16,352 |

**Year 1 Totals**:
- Total registered users: ~1,500
- Total paid subscribers: ~122
- Annual Subscription Revenue: ~£69,252
- Annual Marketplace Fees: ~£9,570
- **Total Year 1 Revenue: ~£78,822**
- **Month 12 MRR: ~£16,352**
- **Annualised run rate (Month 12): ~£196K**

*Note: These are estimates. Actual numbers depend heavily on marketing execution and product-market fit.*

*Note: UK VAT registration threshold is £90,000. As revenue approaches this level (projected around Month 10-11), VAT registration and 20% VAT on UK SaaS sales will need to be factored in.*

*Note: UK Corporation Tax applies at 19% on profits under £50K, 25% on profits over £250K, with marginal relief between.*

---

## 3. Cost Structure

### Fixed Monthly Costs

| Category | Monthly Cost | Annual Cost | Notes |
|----------|-------------|-------------|-------|
| Vercel hosting | £20 | £240 | Pro plan |
| Supabase | £25 | £300 | Pro plan |
| Domain & DNS | £2 | £24 | |
| Sentry monitoring | £26 | £312 | Team plan |
| Email (Resend) | £20 | £240 | Startup Team |
| Stripe fees | ~2% + 20p (blended UK/EU rate; UK cards 1.5% + 20p) | Variable | Per transaction |
| **Fixed total** | **~£93** | **~£1,116** | |

### Variable Costs (Scale with Usage)

| Category | Cost Per Unit | Month 1 Est. | Month 12 Est. | Notes |
|----------|-------------|-------------|--------------|-------|
| Anthropic Claude | ~£0.50-2/conversation | £100 | £2,000 | Primary AI spend |
| OpenAI GPT-4o | ~£0.20-0.50/conversation | £40 | £500 | Fallback + speculative |
| OpenAI DALL-E | ~£0.10-0.30/call | £20 | £200 | Image generation |
| Qwen / MiniMax | ~£0.05-0.20/conversation | £30 | £400 | High-volume tiers |
| Modal.com (CAD) | ~£0.10-0.50/execution | £20 | £300 | CadQuery runs |
| **Variable total** | | **~£210** | **~£3,400** | |

### AI Cost Per User (Critical Metric)

Target: AI cost < 30% of ARPU

| Scenario | AI cost/user/mo | ARPU | AI as % of ARPU |
|----------|----------------|------|-----------------|
| Light user (Startup Team) | £5-10 | £49 | 10-20% |
| Medium user (Pro) | £15-30 | £149 | 10-20% |
| Heavy user (Pro) | £40-60 | £149 | 27-40% |

**Risk**: Heavy users on the Professional tier could push AI costs above 30% of ARPU. Mitigation: per-user AI usage caps (already implemented in code), multi-model optimisation.

### People Costs (Planned)

| Role | When | Monthly Cost | Notes |
|------|------|-------------|-------|
| Founder salary | Month 1+ | £0-3,000 | Deferred initially |
| Full-stack developer | Month 4-6 | £4,000-6,000 | Contract or part-time |
| Growth marketer | Month 6+ | £2,000-4,000 | Part-time or contract |
| **Total people** | | **£0-13,000** | |

---

## 4. Breakeven Analysis

### Subscription-Only Breakeven

At blended ARPU of £116/mo and estimated costs:

| Cost Level | Monthly Fixed | Monthly Variable | Break-even Subscribers |
|-----------|--------------|-----------------|----------------------|
| Founder only, no salary | £93 | ~£15/user | ~1 paid user |
| Founder + minimal salary | £3,093 | ~£15/user | ~31 paid users |
| Founder + 1 hire | £7,093 | ~£15/user | ~70 paid users |
| Full team (3 people) | £13,093 | ~£15/user | ~130 paid users |

*Note: The £15/user variable cost is a blended average across all months. Month 12 per-user cost is higher (~£28/user) as AI usage scales with engagement — early months are lower, pulling the average down.*

### Path to Profitability

With 122 paid subscribers by Month 12 and total monthly revenue of £16,352:
- Infrastructure: ~£3,500/mo
- AI costs: ~£3,400/mo
- People (founder + 1): ~£7,000/mo
- **Total costs: ~£13,900/mo**
- **Gross profit: ~£2,450/mo (Month 12)**

Profitable on a monthly basis by Month 10-12 (with lean team).

---

## 5. Key Financial Metrics to Track

| Metric | Target | How to Measure |
|--------|--------|---------------|
| MRR | Growth month-over-month | Stripe dashboard |
| CAC | <£100 | Marketing spend / new paid customers |
| LTV | >3x CAC | ARPU / monthly churn rate |
| Gross margin | >70% | (Revenue - COGS) / Revenue |
| AI cost per user | <30% ARPU | Total AI spend / active users |
| Burn rate | Decreasing | Monthly cash outflow |
| Runway | >6 months | Cash / monthly burn |
| Net Revenue Retention | >100% | Expansion - churn |

---

## 6. Funding Scenarios

### Scenario A: Bootstrap to Profitability
- Continue self-funded
- Lean team (founder + 1 hire by Month 6)
- Break even by Month 10-12
- Slower growth but full equity retention

### Scenario B: SEIS Angel Round (£150K)
- SEIS investors get 50% tax relief (attractive)
- Hire 2 people immediately (developer + marketer)
- Accelerate to 200+ paid users by Month 12
- Use for 12-18 months runway

### Scenario C: Revenue-Based Financing
- When MRR reaches £10K+
- Borrow 3-6x MRR
- No equity dilution
- Higher cost of capital but maintains ownership

---

## Action Items

1. [ ] Set up Stripe reporting dashboard for MRR tracking
2. [ ] Implement AI cost tracking per user (logging exists, need reporting)
3. [ ] Calculate actual AI cost per conversation by model
4. [ ] Set up monthly P&L tracking (see Finance/README.md)
5. [ ] Get SEIS advance assurance from HMRC
6. [ ] Model 3 scenarios (bootstrap, angel, aggressive growth) in detail
